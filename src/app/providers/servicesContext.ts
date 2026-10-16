import { createContext } from 'react'

import type { MatchService } from '@/services'

export const ServicesContext = createContext<MatchService | null>(null)
