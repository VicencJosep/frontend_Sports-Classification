import { Toggle } from '@/components/common'
import type { TeamAssignments } from '@/domain'
import { TEAM_NEUTRAL_COLOR } from '@/domain'

import { LAYERS, type LayerAvailability, type LayerId, type LayerState } from './layers'
import s from './layers.module.css'

interface LayerPanelProps {
  layers: LayerState
  availability: Record<LayerId, LayerAvailability>
  onToggle: (id: LayerId, on: boolean) => void
  teams: TeamAssignments
}

export function LayerPanel({ layers, availability, onToggle, teams }: LayerPanelProps) {
  return (
    <div className={s.panel}>
      {LAYERS.map((layer) => {
        const state = availability[layer.id]
        const disabled = state !== 'available'
        const hint = state === 'future' ? layer.hint : state === 'no-data' ? 'No data for this part.' : layer.hint
        return (
          <div key={layer.id}>
            <Toggle
              checked={!disabled && layers[layer.id]}
              disabled={disabled}
              onChange={(on) => onToggle(layer.id, on)}
              label={
                <span className={s.label}>
                  {layer.label}
                  {state === 'future' && <span className={s.tag}>future</span>}
                </span>
              }
              hint={hint}
            />
            {layer.id === 'teams' && !disabled && layers.teams && (
              <ul className={s.legend}>
                {teams.clusters.map((c) => (
                  <li key={c.cluster}>
                    <span className={s.swatch} style={{ background: c.color }} />
                    {c.displayName}
                    <span className={s.legendCount}>{[...teams.byTrackerId.values()].filter((v) => v === c.cluster).length} tracks</span>
                  </li>
                ))}
                <li>
                  <span className={s.swatch} style={{ background: TEAM_NEUTRAL_COLOR }} />
                  Referees / unassigned
                </li>
              </ul>
            )}
          </div>
        )
      })}
    </div>
  )
}
