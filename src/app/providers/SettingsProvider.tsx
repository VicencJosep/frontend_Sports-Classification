import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { DEFAULT_SETTINGS, loadSettings, safeStorage, saveSettings, type ViewerSettings } from './settings'
import { SettingsContext } from './settingsContext'

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<ViewerSettings>(() => loadSettings(safeStorage()))

  useEffect(() => {
    saveSettings(safeStorage(), settings)
  }, [settings])

  const update = useCallback((patch: Partial<ViewerSettings>) => setSettings((prev) => ({ ...prev, ...patch })), [])
  const reset = useCallback(() => setSettings(DEFAULT_SETTINGS), [])
  const value = useMemo(() => ({ settings, update, reset }), [settings, update, reset])

  return <SettingsContext value={value}>{children}</SettingsContext>
}
