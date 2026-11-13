import {
  toApiReviewCreate,
  toApiReviewPatch,
  toMatch,
  toMatchAnalysis,
  toPartHighlights,
  toReviewResult,
  toReviewSheet,
  toTrackingFrames,
  type ApiErrorBody,
  type ApiHighlightsResponse,
  type ApiMatch,
  type ApiMatchCreate,
  type ApiPartAnalysis,
  type ApiReviewExport,
  type ApiReviewItemResult,
  type ApiTrackingWindow,
  type ApiVideo,
} from '@/adapters/api'
import type { CreateMatchInput, Match, MatchAnalysis, PartHighlights, TrackingFrame } from '@/domain'

import { ServiceError, isServiceError, type MatchService, type ReviewService, type ServiceErrorCode, type StartAnalysisOptions, type TrackingRange } from '../MatchService'

export interface ApiMatchServiceOptions {
  /** Origin of the FastAPI backend, e.g. `http://localhost:8100`. */
  baseUrl: string
  fetchFn?: typeof fetch
}

/** Largest window the backend serves in one request (`BACKEND_TRACKING_MAX_WINDOW_S`). */
export const API_TRACKING_MAX_WINDOW_S = 120

/**
 * MatchService over the FastAPI backend. The backend already normalises the
 * pipeline outputs, so this class only maps snake_case wire JSON to the domain.
 */
export class ApiMatchService implements MatchService {
  readonly baseUrl: string
  private readonly fetchFn: typeof fetch

  constructor(options: ApiMatchServiceOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '')
    this.fetchFn = options.fetchFn ?? ((input, init) => fetch(input, init))
  }

  /** Corrections go to the reviewed copy the backend keeps next to the analysis (`review/analysis.json`). */
  readonly review: ReviewService = {
    updateItem: async (matchId, partId, itemId, patch) => {
      const path = partPath(matchId, partId, `review/items/${encodeURIComponent(itemId)}`)
      return toReviewResult(await this.request<ApiReviewItemResult>(path, { method: 'PATCH', body: JSON.stringify(toApiReviewPatch(patch)) }))
    },
    addItem: async (matchId, partId, input) => {
      const path = partPath(matchId, partId, 'review/items')
      return toReviewResult(await this.request<ApiReviewItemResult>(path, { method: 'POST', body: JSON.stringify(toApiReviewCreate(input)) }))
    },
    deleteItem: async (matchId, partId, itemId) => {
      const path = partPath(matchId, partId, `review/items/${encodeURIComponent(itemId)}`)
      return toReviewResult(await this.request<ApiReviewItemResult>(path, { method: 'DELETE' }))
    },
    restoreItem: async (matchId, partId, itemId) => {
      const path = partPath(matchId, partId, `review/items/${encodeURIComponent(itemId)}/restore`)
      return toReviewResult(await this.request<ApiReviewItemResult>(path, { method: 'POST' }))
    },
    exportSheet: async (matchId, partId, fromS, toS) => {
      const path = partPath(matchId, partId, 'review/export')
      return toReviewSheet(await this.request<ApiReviewExport>(path, { method: 'POST', body: JSON.stringify({ from_s: fromS, to_s: toS }) }))
    },
  }

  async listMatches(): Promise<Match[]> {
    const matches = await this.getJson<ApiMatch[]>('/api/matches')
    return matches.map((m) => toMatch(m, this.baseUrl))
  }

  async getMatch(matchId: string): Promise<Match> {
    return toMatch(await this.getJson<ApiMatch>(`/api/matches/${encodeURIComponent(matchId)}`), this.baseUrl)
  }

  /** Uploads every video (with progress), registers the match and starts its analysis. */
  async createMatch(input: CreateMatchInput, onProgress?: (fraction: number) => void): Promise<Match> {
    if (input.parts.length === 0) throw new ServiceError('invalid-data', 'At least one video is required.')
    const totalBytes = input.parts.reduce((acc, p) => acc + p.file.size, 0) || 1
    let doneBytes = 0
    const parts: ApiMatchCreate['parts'] = []
    for (const part of input.parts) {
      const video = await uploadVideo(`${this.baseUrl}/api/videos/upload`, part.file, (loaded) => {
        onProgress?.(Math.min(1, (doneBytes + loaded) / totalBytes))
      })
      doneBytes += part.file.size
      parts.push({ kind: part.kind, video_id: video.id })
    }
    onProgress?.(1)
    const body: ApiMatchCreate = {
      name: input.name,
      home_team: input.homeTeam,
      away_team: input.awayTeam,
      date: input.date,
      parts,
    }
    const created = await this.request<ApiMatch>('/api/matches', { method: 'POST', body: JSON.stringify(body) })
    return this.startAnalysis(created.id, { highlights: input.autoHighlights })
  }

  async startAnalysis(matchId: string, options?: StartAnalysisOptions): Promise<Match> {
    await this.request(`/api/matches/${encodeURIComponent(matchId)}/analysis`, {
      method: 'POST',
      body: JSON.stringify({ mode: 'full-match', highlights: options?.highlights ?? false }),
    })
    return this.getMatch(matchId)
  }

  async getPartHighlights(matchId: string, partId: string): Promise<PartHighlights> {
    const response = await this.getJson<ApiHighlightsResponse>(partPath(matchId, partId, 'highlights'))
    return toPartHighlights(response, this.baseUrl)
  }

  async generateHighlights(matchId: string, partId: string, force = false): Promise<PartHighlights> {
    const response = await this.request<ApiHighlightsResponse>(partPath(matchId, partId, 'highlights'), {
      method: 'POST',
      body: JSON.stringify({ force }),
    })
    return toPartHighlights(response, this.baseUrl)
  }

  /**
   * The reviewed copy when there is one, otherwise the pipeline output (`/review` serves both). A backend
   * without that route answers 404: the plain analysis is used and corrections stay off (`review` null).
   */
  async getPartAnalysis(matchId: string, partId: string): Promise<MatchAnalysis> {
    try {
      return toMatchAnalysis(await this.getJson<ApiPartAnalysis>(partPath(matchId, partId, 'review')))
    } catch (error) {
      if (!isServiceError(error) || error.code !== 'not-found') throw error
    }
    return toMatchAnalysis(await this.getJson<ApiPartAnalysis>(partPath(matchId, partId, 'analysis')))
  }

  /** Without a range the first `API_TRACKING_MAX_WINDOW_S` seconds are returned; the viewer always passes one. */
  async getPartTracking(matchId: string, partId: string, range?: TrackingRange): Promise<TrackingFrame[]> {
    const fromS = range?.fromS ?? 0
    const toS = range?.toS ?? API_TRACKING_MAX_WINDOW_S
    const params = new URLSearchParams({ from_s: String(fromS), to_s: String(toS) })
    const window = await this.getJson<ApiTrackingWindow>(
      `/api/matches/${encodeURIComponent(matchId)}/parts/${encodeURIComponent(partId)}/tracking?${params.toString()}`,
    )
    return toTrackingFrames(window.frames)
  }

  // --- HTTP ---------------------------------------------------------------------

  private getJson<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' })
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    let response: Response
    try {
      response = await this.fetchFn(`${this.baseUrl}${path}`, {
        ...init,
        headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) },
      })
    } catch (error) {
      throw new ServiceError('unavailable', `Cannot reach the backend at ${this.baseUrl}. Is it running?`, { cause: error })
    }
    if (!response.ok) throw await errorFromResponse(response)
    return (await response.json()) as T
  }
}

function partPath(matchId: string, partId: string, resource: string): string {
  return `/api/matches/${encodeURIComponent(matchId)}/parts/${encodeURIComponent(partId)}/${resource}`
}

function codeForStatus(status: number): ServiceErrorCode {
  if (status === 404) return 'not-found'
  if (status === 422 || status === 415 || status === 413) return 'invalid-data'
  return 'unavailable'
}

async function errorFromResponse(response: Response): Promise<ServiceError> {
  let message = `HTTP ${response.status}`
  try {
    const body = (await response.json()) as ApiErrorBody
    if (body.error?.message) message = body.error.message
  } catch {
    // keep the status text
  }
  return new ServiceError(codeForStatus(response.status), message)
}

function errorFromXhr(xhr: XMLHttpRequest): ServiceError {
  let message = `HTTP ${xhr.status}`
  try {
    const body = JSON.parse(xhr.responseText) as ApiErrorBody
    if (body.error?.message) message = body.error.message
  } catch {
    // keep the status text
  }
  return new ServiceError(codeForStatus(xhr.status), message)
}

/** `fetch` cannot report upload progress, so the multipart upload uses XMLHttpRequest. */
function uploadVideo(url: string, file: File, onLoaded: (bytes: number) => void): Promise<ApiVideo> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', url)
    xhr.setRequestHeader('Accept', 'application/json')
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onLoaded(e.loaded)
    }
    xhr.onload = () => {
      if (xhr.status === 201) {
        try {
          resolve(JSON.parse(xhr.responseText) as ApiVideo)
        } catch (error) {
          reject(new ServiceError('invalid-data', 'Malformed upload response.', { cause: error }))
        }
      } else {
        reject(errorFromXhr(xhr))
      }
    }
    xhr.onerror = () => reject(new ServiceError('unavailable', `Upload to ${url} failed. Is the backend running?`))
    xhr.onabort = () => reject(new ServiceError('unavailable', 'Upload aborted.'))
    const form = new FormData()
    form.append('file', file, file.name)
    xhr.send(form)
  })
}
