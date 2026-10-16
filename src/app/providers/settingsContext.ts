import { createContext } from 'react'

import type { ViewerSettings } from './settings'

export interface SettingsContextValue {
  settings: ViewerSettings
  update: (patch: Partial<ViewerSettings>) => void
  reset: () => void
}

export const SettingsContext = createContext<SettingsContextValue | null>(null)
