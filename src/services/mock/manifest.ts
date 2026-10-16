import type { Match, MatchPart, VideoInfo } from '@/domain'
import { deriveMatchStatus, isAnalysisStatus, isPartKind, matchDurationS } from '@/domain'

/**
 * Shape of `public/mock/matches/index.json`, written by `scripts/build-fixtures.mjs`.
 * This is the frontend's own mock contract, NOT a Python output: the Python
 * project has no match registry. Part files keep the exact Python shapes.
 */
export interface MockVideoManifest {
  file: string
  width: number
  height: number
  fps: number
  frameCount: number
  durationS: number
  startTimeS: number
}

export interface MockPartManifest {
  id: string
  kind: string
  label: string
  mode: 'clip' | 'full-match'
  status: string
  video: MockVideoManifest | null
  files: { tracks: string; teams: string; telemetry: string } | null
  sourceVideoPath: string | null
  sourceWindow: { startS: number; endS: number } | null
  stats: {
    frames: number
    events: number
    ballActions: number
    tracklets: number
    hasFieldCoordinates: boolean
    hasPossession: boolean
  } | null
}

export interface MockMatchManifest {
  id: string
  name: string
  homeTeam: string | null
  awayTeam: string | null
  date: string | null
  score: { home: number; away: number } | null
  status: string
  errorMessage: string | null
  isDemo: boolean
  note: string | null
  createdAt: string
  parts: MockPartManifest[]
}

export interface MockIndex {
  schemaVersion: number
  generatedAt: string
  matches: MockMatchManifest[]
}

export function partVideoUrl(baseUrl: string, matchId: string, file: string): string {
  return `${baseUrl}mock/matches/${matchId}/${file}`
}

export function manifestToVideoInfo(baseUrl: string, matchId: string, video: MockVideoManifest): VideoInfo {
  return {
    url: partVideoUrl(baseUrl, matchId, video.file),
    width: video.width,
    height: video.height,
    fps: video.fps,
    frameCount: video.frameCount,
    durationS: video.durationS,
    startTimeS: video.startTimeS,
  }
}

export function manifestToPart(baseUrl: string, matchId: string, part: MockPartManifest): MatchPart {
  return {
    id: part.id,
    kind: isPartKind(part.kind) ? part.kind : 'full',
    label: part.label,
    mode: part.mode,
    status: isAnalysisStatus(part.status) ? part.status : 'pending',
    stage: null,
    video: part.video ? manifestToVideoInfo(baseUrl, matchId, part.video) : null,
  }
}

export function manifestToMatch(baseUrl: string, manifest: MockMatchManifest): Match {
  const parts = manifest.parts.map((p) => manifestToPart(baseUrl, manifest.id, p))
  return {
    id: manifest.id,
    name: manifest.name,
    homeTeam: manifest.homeTeam,
    awayTeam: manifest.awayTeam,
    score: manifest.score,
    date: manifest.date,
    status: isAnalysisStatus(manifest.status) ? manifest.status : deriveMatchStatus(parts),
    errorMessage: manifest.errorMessage,
    isDemo: manifest.isDemo,
    note: manifest.note,
    createdAt: manifest.createdAt,
    parts,
    durationS: matchDurationS(parts),
  }
}
