export type PlayerMarker = 'ellipse' | 'box'
export type LabelMode = 'auto' | 'jersey' | 'tracker'

/** Viewer preferences. Purely presentational: nothing here changes the data. */
export interface ViewerSettings {
  playerMarker: PlayerMarker
  labelMode: LabelMode
  /** Frames of trail per player for the Tracking layer (0 disables the trail). */
  trailLength: number
  /** Keep showing the last ball position for this many frames when the detector lost it. */
  ballHoldFrames: number
  /** How long a ball-action badge stays on the player. */
  actionBadgeSeconds: number
  showConfidence: boolean
}

export const DEFAULT_SETTINGS: ViewerSettings = {
  playerMarker: 'ellipse',
  labelMode: 'auto',
  trailLength: 30,
  ballHoldFrames: 12,
  actionBadgeSeconds: 2.4,
  showConfidence: true,
}

export const SETTINGS_STORAGE_KEY = 'football-intelligence.settings.v1'

export function loadSettings(storage: Storage | null): ViewerSettings {
  try {
    const raw = storage?.getItem(SETTINGS_STORAGE_KEY)
    if (!raw) return DEFAULT_SETTINGS
    const parsed: unknown = JSON.parse(raw)
    if (typeof parsed !== 'object' || parsed === null) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...(parsed as Partial<ViewerSettings>) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(storage: Storage | null, settings: ViewerSettings): void {
  try {
    storage?.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings))
  } catch {
    // Storage unavailable: settings live for the session only.
  }
}

export function safeStorage(): Storage | null {
  try {
    return typeof window !== 'undefined' ? window.localStorage : null
  } catch {
    return null
  }
}
