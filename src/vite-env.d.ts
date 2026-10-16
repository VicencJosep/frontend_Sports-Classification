/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Which MatchService implementation to use. Defaults to "mock" until the FastAPI backend exists. */
  readonly VITE_DATA_SOURCE?: 'mock' | 'api'
  /** Base URL of the future FastAPI backend (unused by the mock service). */
  readonly VITE_API_BASE_URL?: string
}
