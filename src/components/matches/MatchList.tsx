import type { Match } from '@/domain'

import { MatchCard } from './MatchCard'
import s from './matches.module.css'

export function MatchList({ matches }: { matches: Match[] }) {
  return (
    <div className={s.grid}>
      {matches.map((m) => (
        <MatchCard key={m.id} match={m} />
      ))}
    </div>
  )
}
