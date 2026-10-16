import { useState, type ReactNode } from 'react'

import { createMatchService, type MatchService } from '@/services'

import { ServicesContext } from './servicesContext'

/** Creates the MatchService once and exposes it; configuration errors become a readable screen. */
export function ServicesProvider({ children }: { children: ReactNode }) {
  const [service] = useState<MatchService | Error>(() => {
    try {
      return createMatchService()
    } catch (error) {
      return error instanceof Error ? error : new Error(String(error))
    }
  })

  if (service instanceof Error) {
    return (
      <div style={{ padding: 32, maxWidth: 640, margin: '0 auto', fontFamily: 'var(--font-sans)' }}>
        <h1 style={{ fontSize: 20, marginBottom: 12 }}>Data source not available</h1>
        <p className="muted">{service.message}</p>
      </div>
    )
  }

  return <ServicesContext value={service}>{children}</ServicesContext>
}
