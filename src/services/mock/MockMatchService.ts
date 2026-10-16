import {
  parseTeamsJson,
  parseTelemetryJson,
  parseTracksJsonl,
  toMatchAnalysis,
  toTeamAssignments,
  toTrackingFrames,
  AdapterError,
} from '@/adapters/python'
import type { CreateMatchInput, Match, MatchAnalysis, MatchPart, TrackingFrame } from '@/domain'
import { deriveMatchStatus, matchDurationS, PART_KIND_DISPLAY } from '@/domain'

import { ServiceError, type MatchService, type TrackingRange } from '../MatchService'
import { manifestToMatch, type MockIndex, type MockMatchManifest, type MockPartManifest } from './manifest'

export interface MockMatchServiceOptions {
  /** Where `mock/matches/index.json` is served from. Defaults to Vite's BASE_URL. */
  baseUrl?: string
  /** Simulated network latency in ms (applied once per request). */
  latencyMs?: number
  /** Storage for matches created through the Upload page. Pass null to keep them in memory only. */
  storage?: Storage | null
}

const STORAGE_KEY = 'football-intelligence.mock.created-matches.v1'
const PROCESSING_AFTER_MS = 2500

interface StoredCreatedMatch {
  match: Match
}

/**
 * Mock implementation of MatchService.
 *
 * Reads fixtures that `scripts/build-fixtures.mjs` copied from REAL pipeline
 * runs (`teams.json`, `telemetry.json`, `tracks.jsonl` in their exact Python
 * shapes) and converts them with the same adapters the future API service will
 * use. Only the match registry (names, teams, dates, statuses) is mock data,
 * because the pipeline does not have it.
 *
 * Matches created through the Upload page are kept in localStorage and move
 * from `pending` to `processing`; they never complete, since no backend runs
 * the analysis.
 */
export class MockMatchService implements MatchService {
  private readonly baseUrl: string
  private readonly latencyMs: number
  private readonly storage: Storage | null
  private indexPromise: Promise<MockIndex> | null = null
  private readonly analysisCache = new Map<string, Promise<MatchAnalysis>>()
  private readonly trackingCache = new Map<string, Promise<TrackingFrame[]>>()
  private created: Match[]

  constructor(options: MockMatchServiceOptions = {}) {
    this.baseUrl = options.baseUrl ?? import.meta.env.BASE_URL
    this.latencyMs = options.latencyMs ?? 250
    this.storage = options.storage === undefined ? safeLocalStorage() : options.storage
    this.created = this.loadCreated()
  }

  async listMatches(): Promise<Match[]> {
    await this.delay()
    const index = await this.loadIndex()
    const fixtures = index.matches.map((m) => manifestToMatch(this.baseUrl, m))
    this.advanceCreated()
    return [...this.created, ...fixtures].sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  }

  async getMatch(matchId: string): Promise<Match> {
    await this.delay()
    this.advanceCreated()
    const created = this.created.find((m) => m.id === matchId)
    if (created) return created
    const manifest = await this.findManifest(matchId)
    return manifestToMatch(this.baseUrl, manifest)
  }

  async createMatch(input: CreateMatchInput, onProgress?: (fraction: number) => void): Promise<Match> {
    if (input.parts.length === 0) throw new ServiceError('invalid-data', 'At least one video is required.')
    // Simulated upload: progress ticks proportional to the total file size.
    const totalBytes = input.parts.reduce((acc, p) => acc + p.file.size, 0)
    const steps = 20
    for (let i = 1; i <= steps; i += 1) {
      await sleep(40 + Math.min(200, totalBytes / 2_000_000_000))
      onProgress?.(i / steps)
    }
    const now = new Date().toISOString()
    const id = `upload-${Date.now().toString(36)}`
    const parts: MatchPart[] = input.parts.map((p, i) => ({
      id: `${p.kind}-${i}`,
      kind: p.kind,
      label: PART_KIND_DISPLAY[p.kind],
      mode: 'full-match',
      status: 'pending',
      stage: null,
      video: null,
    }))
    const match: Match = {
      id,
      name: input.name.trim() || `${input.homeTeam ?? 'Home'} vs ${input.awayTeam ?? 'Away'}`,
      homeTeam: input.homeTeam,
      awayTeam: input.awayTeam,
      score: null,
      date: input.date,
      status: deriveMatchStatus(parts),
      errorMessage: null,
      isDemo: false,
      note: 'Created with the mock service: the upload is simulated and the analysis never runs without the backend.',
      createdAt: now,
      parts,
      durationS: matchDurationS(parts),
    }
    this.created = [match, ...this.created]
    this.saveCreated()
    return match
  }

  /** Mock: moves the created match to `processing`; fixtures never change state. */
  async startAnalysis(matchId: string): Promise<Match> {
    await this.delay()
    const created = this.created.find((m) => m.id === matchId)
    if (!created) return this.getMatch(matchId)
    const parts = created.parts.map((p) => (p.status === 'completed' ? p : { ...p, status: 'processing' as const }))
    const updated: Match = { ...created, parts, status: deriveMatchStatus(parts), errorMessage: null }
    this.created = this.created.map((m) => (m.id === matchId ? updated : m))
    this.saveCreated()
    return updated
  }

  async getPartAnalysis(matchId: string, partId: string): Promise<MatchAnalysis> {
    const key = `${matchId}/${partId}`
    let promise = this.analysisCache.get(key)
    if (!promise) {
      promise = this.loadAnalysis(matchId, partId)
      this.analysisCache.set(key, promise)
      promise.catch(() => this.analysisCache.delete(key))
    }
    return promise
  }

  async getPartTracking(matchId: string, partId: string, range?: TrackingRange): Promise<TrackingFrame[]> {
    const key = `${matchId}/${partId}`
    let promise = this.trackingCache.get(key)
    if (!promise) {
      promise = this.loadTracking(matchId, partId)
      this.trackingCache.set(key, promise)
      promise.catch(() => this.trackingCache.delete(key))
    }
    const frames = await promise
    if (!range) return frames
    return frames.filter((f) => f.timestampS >= range.fromS && f.timestampS <= range.toS)
  }

  // --- fixtures ----------------------------------------------------------------

  private async loadIndex(): Promise<MockIndex> {
    if (!this.indexPromise) {
      this.indexPromise = fetchJson<MockIndex>(`${this.baseUrl}mock/matches/index.json`).catch((error: unknown) => {
        this.indexPromise = null
        throw new ServiceError(
          'unavailable',
          'Mock fixtures are missing. Run `npm run fixtures` to build them from the Sports-Classification outputs.',
          { cause: error },
        )
      })
    }
    return this.indexPromise
  }

  private async findManifest(matchId: string): Promise<MockMatchManifest> {
    const index = await this.loadIndex()
    const manifest = index.matches.find((m) => m.id === matchId)
    if (!manifest) throw new ServiceError('not-found', `Match "${matchId}" does not exist.`)
    return manifest
  }

  private async findPart(matchId: string, partId: string): Promise<{ manifest: MockMatchManifest; part: MockPartManifest }> {
    const manifest = await this.findManifest(matchId)
    const part = manifest.parts.find((p) => p.id === partId)
    if (!part) throw new ServiceError('not-found', `Part "${partId}" of match "${matchId}" does not exist.`)
    return { manifest, part }
  }

  private async loadAnalysis(matchId: string, partId: string): Promise<MatchAnalysis> {
    await this.delay()
    const { part } = await this.findPart(matchId, partId)
    if (!part.files || !part.video) {
      throw new ServiceError('unavailable', `No analysis is available for "${part.label}" yet (status: ${part.status}).`)
    }
    const base = `${this.baseUrl}mock/matches/${matchId}/`
    try {
      const [teamsText, telemetryText] = await Promise.all([fetchText(base + part.files.teams), fetchText(base + part.files.telemetry)])
      const teams = toTeamAssignments(parseTeamsJson(teamsText, part.files.teams))
      const telemetry = parseTelemetryJson(telemetryText, part.files.telemetry)
      return toMatchAnalysis(telemetry, { matchId, partId, fps: part.video.fps, durationS: part.video.durationS, teams })
    } catch (error) {
      throw wrapError(error, 'Could not load the analysis files.')
    }
  }

  private async loadTracking(matchId: string, partId: string): Promise<TrackingFrame[]> {
    await this.delay()
    const { part } = await this.findPart(matchId, partId)
    if (!part.files) throw new ServiceError('unavailable', `No tracking is available for "${part.label}" yet.`)
    try {
      const text = await fetchText(`${this.baseUrl}mock/matches/${matchId}/${part.files.tracks}`)
      return toTrackingFrames(parseTracksJsonl(text, part.files.tracks))
    } catch (error) {
      throw wrapError(error, 'Could not load the tracking file.')
    }
  }

  // --- created matches (Upload page) ---------------------------------------------

  private advanceCreated(): void {
    const now = Date.now()
    let changed = false
    this.created = this.created.map((m) => {
      if (m.status !== 'pending') return m
      if (now - Date.parse(m.createdAt) < PROCESSING_AFTER_MS) return m
      changed = true
      const parts = m.parts.map((p) => ({ ...p, status: 'processing' as const }))
      return { ...m, parts, status: deriveMatchStatus(parts) }
    })
    if (changed) this.saveCreated()
  }

  private loadCreated(): Match[] {
    try {
      const raw = this.storage?.getItem(STORAGE_KEY)
      if (!raw) return []
      const parsed: unknown = JSON.parse(raw)
      if (!Array.isArray(parsed)) return []
      return parsed
        .filter((x): x is StoredCreatedMatch => typeof x === 'object' && x !== null && 'match' in x)
        .map((x) => x.match)
    } catch {
      return []
    }
  }

  private saveCreated(): void {
    try {
      this.storage?.setItem(STORAGE_KEY, JSON.stringify(this.created.map((match) => ({ match }))))
    } catch {
      // Storage may be unavailable (private mode, quota): the in-memory list still works.
    }
  }

  private delay(): Promise<void> {
    return this.latencyMs > 0 ? sleep(this.latencyMs) : Promise.resolve()
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}

async function fetchText(url: string): Promise<string> {
  const response = await fetch(url)
  if (!response.ok) throw new ServiceError('unavailable', `${url}: HTTP ${response.status}`)
  return response.text()
}

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) throw new ServiceError('unavailable', `${url}: HTTP ${response.status}`)
  return (await response.json()) as T
}

function wrapError(error: unknown, fallback: string): ServiceError {
  if (error instanceof ServiceError) return error
  if (error instanceof AdapterError) return new ServiceError('invalid-data', error.message, { cause: error })
  if (error instanceof SyntaxError) return new ServiceError('invalid-data', `Malformed JSON: ${error.message}`, { cause: error })
  return new ServiceError('unavailable', fallback, { cause: error })
}
