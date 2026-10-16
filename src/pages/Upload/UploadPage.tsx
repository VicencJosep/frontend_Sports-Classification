import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router'

import { useMatchService } from '@/app/providers/useServices'
import { Page } from '@/app/shell/Page'
import { Badge, Button, Card, Field, Panel, TextInput } from '@/components/common'
import type { CreateMatchPartInput } from '@/domain'
import { errorMessage } from '@/hooks/useAsync'
import { resolveDataSource } from '@/services'
import { cx } from '@/utils/cx'

import { VideoDropzone } from './VideoDropzone'
import s from './Upload.module.css'

type UploadMode = 'single' | 'halves'

export function UploadPage() {
  const service = useMatchService()
  const navigate = useNavigate()
  const [mode, setMode] = useState<UploadMode>('single')
  const [fullFile, setFullFile] = useState<File | null>(null)
  const [firstHalf, setFirstHalf] = useState<File | null>(null)
  const [secondHalf, setSecondHalf] = useState<File | null>(null)
  const [name, setName] = useState('')
  const [homeTeam, setHomeTeam] = useState('')
  const [awayTeam, setAwayTeam] = useState('')
  const [date, setDate] = useState('')
  const [progress, setProgress] = useState<number | null>(null)
  const [error, setError] = useState<string | null>(null)

  const suggestedName = homeTeam && awayTeam ? `${homeTeam} vs ${awayTeam}` : ''
  const parts: CreateMatchPartInput[] = []
  if (mode === 'single') {
    if (fullFile) parts.push({ kind: 'full', file: fullFile })
  } else {
    if (firstHalf) parts.push({ kind: 'first-half', file: firstHalf })
    if (secondHalf) parts.push({ kind: 'second-half', file: secondHalf })
  }
  const filesReady = mode === 'single' ? parts.length === 1 : parts.length === 2
  const submitting = progress !== null
  const canSubmit = filesReady && !submitting && (name.trim() !== '' || suggestedName !== '')

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!canSubmit) return
    setError(null)
    setProgress(0)
    try {
      const match = await service.createMatch(
        {
          name: name.trim() || suggestedName,
          homeTeam: homeTeam.trim() || null,
          awayTeam: awayTeam.trim() || null,
          date: date || null,
          parts,
        },
        setProgress,
      )
      void navigate(`/matches/${match.id}`)
    } catch (err) {
      setError(errorMessage(err))
      setProgress(null)
    }
  }

  return (
    <Page title="Upload Match" subtitle="Create a new match and queue its analysis">
      <div className={s.layout}>
        <Card>
          <form className={s.form} onSubmit={onSubmit}>
            <div>
              <div className={s.modeSwitch} role="radiogroup" aria-label="Video layout">
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'single'}
                  className={cx(s.modeOption, mode === 'single' && s.active)}
                  onClick={() => setMode('single')}
                  disabled={submitting}
                >
                  Full match · one video
                </button>
                <button
                  type="button"
                  role="radio"
                  aria-checked={mode === 'halves'}
                  className={cx(s.modeOption, mode === 'halves' && s.active)}
                  onClick={() => setMode('halves')}
                  disabled={submitting}
                >
                  Two halves · two videos
                </button>
              </div>
            </div>

            <div className={cx(s.dropzones, mode === 'halves' && s.two)}>
              {mode === 'single' ? (
                <VideoDropzone label="Match video" file={fullFile} onFile={setFullFile} disabled={submitting} />
              ) : (
                <>
                  <VideoDropzone label="First half" file={firstHalf} onFile={setFirstHalf} disabled={submitting} />
                  <VideoDropzone label="Second half" file={secondHalf} onFile={setSecondHalf} disabled={submitting} />
                </>
              )}
            </div>

            <div className={s.fields}>
              <Field label="Home team" htmlFor="home">
                <TextInput id="home" value={homeTeam} onChange={(e) => setHomeTeam(e.target.value)} placeholder="e.g. Middlesbrough" disabled={submitting} />
              </Field>
              <Field label="Away team" htmlFor="away">
                <TextInput id="away" value={awayTeam} onChange={(e) => setAwayTeam(e.target.value)} placeholder="e.g. Preston North End" disabled={submitting} />
              </Field>
              <Field label="Match name" htmlFor="name" hint="Defaults to “Home vs Away”." className={s.full}>
                <TextInput id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder={suggestedName || 'Match name'} disabled={submitting} />
              </Field>
              <Field label="Date" htmlFor="date" hint="Optional.">
                <TextInput id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={submitting} />
              </Field>
            </div>

            {progress !== null && (
              <div aria-live="polite">
                <div className={s.progress}>
                  <div className={s.progressBar} style={{ width: `${Math.round(progress * 100)}%` }} />
                </div>
                <p className="muted" style={{ marginTop: 8, fontSize: 'var(--fs-sm)' }}>
                  Uploading… {Math.round(progress * 100)}%
                </p>
              </div>
            )}
            {error && (
              <p className={s.error} role="alert">
                {error}
              </p>
            )}

            <div className={s.actions}>
              <span className="muted" style={{ fontSize: 'var(--fs-sm)' }}>
                {filesReady ? `${parts.length} video${parts.length > 1 ? 's' : ''} ready` : mode === 'single' ? 'Add the match video' : 'Add both halves'}
              </span>
              <Button type="submit" variant="primary" disabled={!canSubmit}>
                Start Analysis
              </Button>
            </div>
          </form>
        </Card>

        <aside className={s.side}>
          <Panel title="What happens next">
            <ol className={s.steps}>
              <li>
                <span>
                  <strong>Upload.</strong> The video is sent to the backend and the match appears as <em>Pending</em>.
                </span>
              </li>
              <li>
                <span>
                  <strong>Tracking.</strong> Players, goalkeepers, referees and the ball are detected and tracked frame by frame.
                </span>
              </li>
              <li>
                <span>
                  <strong>Teams.</strong> Player tracklets are clustered into two teams by appearance.
                </span>
              </li>
              <li>
                <span>
                  <strong>Events and ball actions.</strong> Shots, goals, fouls, cards, corners and per-player passes, drives and headers are detected with their timestamps.
                </span>
              </li>
              <li>
                <span>
                  <strong>Review.</strong> Open the match to watch the video with the analysis layers.
                </span>
              </li>
            </ol>
          </Panel>
          {resolveDataSource() === 'mock' && (
            <Panel
              title={
                <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                  Mock mode <Badge tone="warning">no backend</Badge>
                </span>
              }
            >
              <p className="muted" style={{ fontSize: 'var(--fs-sm)', lineHeight: 1.5 }}>
                The upload is simulated and nothing is analysed: the new match is stored in this browser and moves to <em>Processing</em>, where it stays
                until the FastAPI backend exists.
              </p>
            </Panel>
          )}
        </aside>
      </div>
    </Page>
  )
}
