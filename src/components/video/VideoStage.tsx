import { useEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'

import { IconPlay } from '@/components/common'
import type { VideoInfo } from '@/domain'
import { useClockPlaying } from '@/hooks/useVideoClock'
import type { VideoClock } from '@/lib/videoClock'

import s from './video.module.css'

interface VideoStageProps {
  video: VideoInfo
  clock: VideoClock
  /** Overlay canvas (rendered above the video, below the click layer). */
  children?: ReactNode
  note?: ReactNode
  badges?: ReactNode
  muted: boolean
  onToggleMute: () => void
  onToggleFullscreen: () => void
}

const SEEK_SMALL_S = 5
const SEEK_LARGE_S = 10

/**
 * The video element plus overlay slot. Owns the element <-> clock binding,
 * click-to-toggle and keyboard shortcuts. Fullscreen is delegated to the
 * parent so the controls stay visible in fullscreen mode.
 */
export function VideoStage({ video, clock, children, note, badges, muted, onToggleMute, onToggleFullscreen }: VideoStageProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const playing = useClockPlaying(clock)

  useEffect(() => {
    const el = videoRef.current
    if (!el) return
    return clock.attach(el)
  }, [clock])

  useEffect(() => {
    clock.setTiming({ fps: video.fps, frameCount: video.frameCount, startTimeS: video.startTimeS })
  }, [clock, video.fps, video.frameCount, video.startTimeS])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName)) return
    const t = clock.getSnapshot().timeS
    switch (e.key) {
      case ' ':
      case 'k':
      case 'K':
        clock.toggle()
        break
      case 'ArrowLeft':
        clock.seek(t - SEEK_SMALL_S)
        break
      case 'ArrowRight':
        clock.seek(t + SEEK_SMALL_S)
        break
      case 'j':
      case 'J':
        clock.seek(t - SEEK_LARGE_S)
        break
      case 'l':
      case 'L':
        clock.seek(t + SEEK_LARGE_S)
        break
      case ',':
        clock.stepFrames(-1)
        break
      case '.':
        clock.stepFrames(1)
        break
      case 'f':
      case 'F':
        onToggleFullscreen()
        break
      case 'm':
      case 'M':
        onToggleMute()
        break
      default:
        return
    }
    e.preventDefault()
  }

  return (
    <div className={s.stage} tabIndex={0} onKeyDown={onKeyDown} aria-label="Match video" role="region">
      <video ref={videoRef} className={s.video} src={video.url} preload="auto" playsInline muted={muted} />
      {children}
      <div className={s.clickLayer} onClick={() => clock.toggle()} onDoubleClick={onToggleFullscreen} aria-hidden="true" />
      {!playing && (
        <div className={s.bigPlay}>
          <span className={s.bigPlayIcon}>
            <IconPlay size={28} />
          </span>
        </div>
      )}
      {badges && <div className={s.stageBadge}>{badges}</div>}
      {note && <div className={s.stageNote}>{note}</div>}
    </div>
  )
}
