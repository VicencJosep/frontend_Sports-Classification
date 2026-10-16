import { QUICK_LAYERS, type LayerAvailability, type LayerId, type LayerState } from './layers'
import s from './layers.module.css'

interface LayerBarProps {
  layers: LayerState
  availability: Record<LayerId, LayerAvailability>
  onToggle: (id: LayerId, on: boolean) => void
}

/** One-click layer switches under the video: hide the trails, the tracking, the cards... without leaving the player. */
export function LayerBar({ layers, availability, onToggle }: LayerBarProps) {
  return (
    <div className={s.bar} role="group" aria-label="Overlay layers">
      {QUICK_LAYERS.map(({ id, label }) => {
        const available = availability[id] === 'available'
        const on = available && layers[id]
        return (
          <button
            key={id}
            type="button"
            className={s.chip}
            aria-pressed={on}
            disabled={!available}
            title={available ? `${on ? 'Hide' : 'Show'} ${label.toLowerCase()}` : 'No data for this layer'}
            onClick={() => onToggle(id, !layers[id])}
          >
            <span className={s.chipDot} aria-hidden="true" />
            {label}
          </button>
        )
      })}
    </div>
  )
}
