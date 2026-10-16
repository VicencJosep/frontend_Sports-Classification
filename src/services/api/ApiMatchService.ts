import {
  toMatch,
  toMatchAnalysis,
  toTrackingFrames,
  type ApiErrorBody,
  type ApiMatch,
  type ApiMatchCreate,
  type ApiPartAnalysis,
  type ApiTrackingWindow,
  type ApiVideo,
} from '@/adapters/api'
import type { CreateMatchInput, Match, MatchAnalysis, TrackingFrame } from '@/domain'

import { ServiceError, type MatchService, type ServiceErrorCode, type TrackingRange } from '../MatchService'

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
    return this.startAnalysis(created.id)
  }

  async startAnalysis(matchId: string): Promise<Match> {
    await this.request(`/api/matches/${encodeURIComponent(matchId)}/analysis`, { method: 'POST', body: JSON.stringify({ mode: 'full-match' }) })
    return this.getMatch(matchId)
  }

  async getPartAnalysis(matchId: string, partId: string): Promise<MatchAnalysis> {
    const analysis = await this.getJson<ApiPartAnalysis>(`/api/matches/${encodeURIComponent(matchId)}/parts/${encodeURIComponent(partId)}/analysis`)
    return toMatchAnalysis(analysis)
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
