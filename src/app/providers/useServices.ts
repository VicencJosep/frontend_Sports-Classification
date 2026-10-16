import { useContext } from 'react'

import type { MatchService } from '@/services'

import { ServicesContext } from './servicesContext'

export function useMatchService(): MatchService {
  const service = useContext(ServicesContext)
  if (!service) throw new Error('useMatchService must be used inside <ServicesProvider>')
  return service
}
