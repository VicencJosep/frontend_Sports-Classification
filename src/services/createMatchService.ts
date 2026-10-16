import { ApiMatchService } from './api/ApiMatchService'
import type { MatchService } from './MatchService'
import { MockMatchService } from './mock/MockMatchService'

export type DataSource = 'mock' | 'api'

/** Empty = same origin: Vite (dev and preview) proxies `/api` to the backend, see vite.config.ts. */
export const DEFAULT_API_BASE_URL = ''

/** `VITE_DATA_SOURCE=mock` keeps the bundled fixtures; anything else talks to the FastAPI backend. */
export function resolveDataSource(): DataSource {
  return import.meta.env.VITE_DATA_SOURCE === 'mock' ? 'mock' : 'api'
}

/** `VITE_API_BASE_URL` points the browser straight at the backend (e.g. `http://localhost:8100`); unset, requests stay same-origin. */
export function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_BASE_URL
  return typeof configured === 'string' && configured.trim() !== '' ? configured.trim().replace(/\/$/, '') : DEFAULT_API_BASE_URL
}

/**
 * Picks the MatchService implementation. The UI only ever sees the interface.
 */
export function createMatchService(source: DataSource = resolveDataSource()): MatchService {
  if (source === 'api') return new ApiMatchService({ baseUrl: resolveApiBaseUrl() })
  return new MockMatchService()
}
