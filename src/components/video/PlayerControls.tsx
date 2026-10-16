import type { ReactNode } from 'react'

import { Button, IconFullscreen, IconPause, IconPlay, IconStepBack, IconStepForward, Select } from '@/components/common'
import type { MatchEvent } from '@/domain'
import { useClockSnapshot } from '@/hooks/useVideoClock'
import type { VideoClock } from '@/lib/videoClock'
import { formatClock, formatClockTenths } from '@/utils/time'

import { Timeline } from './Timeline'
import s from './video.module.css'

interface PlayerControlsProps {
  clock: VideoClock
  durationS: number
  events: readonly MatchEvent[]
  muted: boolean
  onToggleMute: () => void
  onFullscreen: () => void
  onSelectEvent?: (event: MatchEvent) => void
  /** Quick layer toggles rendered in the controls row. */
  layerBar?: ReactNode
}

const RATES = [0.25, 0.5, 1, 1.5, 2]

export function PlayerControls({ clock, durationS, events, muted, onToggleMute, onFullscreen, onSelectEvent, layerBar }: PlayerControlsProps) {
  const snap = useClockSnapshot(clock)
  return (
    <div className={s.controls}>
      <Timeline clock={clock} durationS={durationS} events={events} onSelectEvent={onSelectEvent} />
      <div className={s.controlsRow}>
        <Button iconOnly size="sm" variant="ghost" onClick={() => clock.stepFrames(-1)} aria-label="Previous frame" title="Previous frame (,)">
          <IconStepBack size={16} />
        </Button>
        <Button iconOnly variant="primary" onClick={() => clock.toggle()} aria-label={snap.playing ? 'Pause' : 'Play'} title="Play / pause (space)">
          {snap.playing ? <IconPause size={16} /> : <IconPlay size={16} />}
        </Button>
        <Button iconOnly size="sm" variant="ghost" onClick={() => clock.stepFrames(1)} aria-label="Next frame" title="Next frame (.)">
          <IconStepForward size={16} />
        </Button>
        <span className={s.time}>
          <span>{formatClockTenths(snap.timeS)}</span>
          <span className={s.timeTotal}>/ {formatClock(durationS)}</span>
        </span>
        <span className={s.frame} title="Pipeline frame index">
          frame {snap.frameIdx}
        </span>
        <span className={s.spacer} />
        {layerBar}
        <span className={s.spacer} />
        <Button size="sm" variant="ghost" onClick={onToggleMute} aria-pressed={muted} title="Mute (M)">
          {muted ? 'Unmute' : 'Mute'}
        </Button>
        <Select className={s.rate} value={String(snap.playbackRate)} onChange={(e) => clock.setPlaybackRate(Number(e.target.value))} aria-label="Playback speed">
          {RATES.map((r) => (
            <option key={r} value={String(r)}>
              {r}×
            </option>
          ))}
        </Select>
        <Button iconOnly size="sm" variant="ghost" onClick={onFullscreen} aria-label="Fullscreen" title="Fullscreen (F)">
          <IconFullscreen size={16} />
        </Button>
      </div>
    </div>
  )
}
