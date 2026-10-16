import { DEFAULT_SETTINGS, type LabelMode, type PlayerMarker } from '@/app/providers/settings'
import { useSettings } from '@/app/providers/useSettings'
import { Page } from '@/app/shell/Page'
import { Badge, Button, Kbd, Panel, Select, Toggle } from '@/components/common'
import { resolveDataSource } from '@/services'

import s from './Settings.module.css'

export function SettingsPage() {
  const { settings, update, reset } = useSettings()
  const source = resolveDataSource()

  return (
    <Page title="Settings" subtitle="Viewer preferences and data source">
      <div className={s.grid}>
        <Panel
          title="Overlay defaults"
          actions={
            <Button size="sm" variant="ghost" onClick={reset} disabled={JSON.stringify(settings) === JSON.stringify(DEFAULT_SETTINGS)}>
              Reset
            </Button>
          }
        >
          <div className={s.rows}>
            <div className={s.row}>
              <div className={s.rowText}>
                <span>Player marker</span>
                <span className={s.rowHint}>Ellipse at the feet (broadcast style) or the full bounding box.</span>
              </div>
              <div className={s.control}>
                <Select value={settings.playerMarker} onChange={(e) => update({ playerMarker: e.target.value as PlayerMarker })} aria-label="Player marker">
                  <option value="ellipse">Ellipse</option>
                  <option value="box">Bounding box</option>
                </Select>
              </div>
            </div>

            <div className={s.row}>
              <div className={s.rowText}>
                <span>Player label</span>
                <span className={s.rowHint}>Jersey numbers are read by the detector only for some detections; the tracker id is always available.</span>
              </div>
              <div className={s.control}>
                <Select value={settings.labelMode} onChange={(e) => update({ labelMode: e.target.value as LabelMode })} aria-label="Player label">
                  <option value="auto">Jersey, else tracker id</option>
                  <option value="jersey">Jersey only</option>
                  <option value="tracker">Tracker id only</option>
                </Select>
              </div>
            </div>

            <div className={s.row}>
              <div className={s.rowText}>
                <span>Trail length</span>
                <span className={s.rowHint}>Frames of movement history drawn by the Tracking layer.</span>
              </div>
              <div className={s.control}>
                <input
                  type="range"
                  className={s.range}
                  min={0}
                  max={75}
                  step={5}
                  value={settings.trailLength}
                  onChange={(e) => update({ trailLength: Number(e.target.value) })}
                  aria-label="Trail length"
                />
                <span className={s.value}>{settings.trailLength} f</span>
              </div>
            </div>

            <div className={s.row}>
              <div className={s.rowText}>
                <span>Ball hold</span>
                <span className={s.rowHint}>The ball is detected in roughly a third of frames; keep the last position for this many frames.</span>
              </div>
              <div className={s.control}>
                <input
                  type="range"
                  className={s.range}
                  min={0}
                  max={25}
                  step={1}
                  value={settings.ballHoldFrames}
                  onChange={(e) => update({ ballHoldFrames: Number(e.target.value) })}
                  aria-label="Ball hold frames"
                />
                <span className={s.value}>{settings.ballHoldFrames} f</span>
              </div>
            </div>

            <div className={s.row}>
              <div className={s.rowText}>
                <span>Ball-action badge</span>
                <span className={s.rowHint}>How long a pass / drive / header badge stays on the player.</span>
              </div>
              <div className={s.control}>
                <input
                  type="range"
                  className={s.range}
                  min={0.5}
                  max={5}
                  step={0.1}
                  value={settings.actionBadgeSeconds}
                  onChange={(e) => update({ actionBadgeSeconds: Number(e.target.value) })}
                  aria-label="Ball action badge duration"
                />
                <span className={s.value}>{settings.actionBadgeSeconds.toFixed(1)} s</span>
              </div>
            </div>

            <Toggle
              checked={settings.showConfidence}
              onChange={(showConfidence) => update({ showConfidence })}
              label="Show confidence values"
              hint="Model confidence next to events and ball actions."
            />
          </div>
        </Panel>

        <div className={s.rows}>
          <Panel
            title={
              <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
                Data source <Badge tone={source === 'mock' ? 'warning' : 'accent'}>{source}</Badge>
              </span>
            }
          >
            <dl className={s.kv}>
              <dt>Active</dt>
              <dd>{source === 'mock' ? 'Mock fixtures (public/mock)' : 'FastAPI'}</dd>
              <dt>Switch</dt>
              <dd>VITE_DATA_SOURCE=api (default) | mock · VITE_API_BASE_URL</dd>
              <dt>API base URL</dt>
              <dd>{import.meta.env.VITE_API_BASE_URL ?? '— (VITE_API_BASE_URL unset)'}</dd>
              <dt>Fixtures</dt>
              <dd>npm run fixtures</dd>
            </dl>
            <p className="muted" style={{ marginTop: 12, fontSize: 'var(--fs-xs)', lineHeight: 1.5 }}>
              Fixtures are excerpts of real Sports-Classification runs: the analysis files keep their original shapes and only the match metadata is
              demo data.
            </p>
          </Panel>

          <Panel title="Viewer shortcuts">
            <div className={s.shortcuts}>
              <span>
                <Kbd>Space</Kbd> / <Kbd>K</Kbd>
              </span>
              <span>Play / pause</span>
              <span>
                <Kbd>←</Kbd> <Kbd>→</Kbd>
              </span>
              <span>Seek 5 s</span>
              <span>
                <Kbd>J</Kbd> <Kbd>L</Kbd>
              </span>
              <span>Seek 10 s</span>
              <span>
                <Kbd>,</Kbd> <Kbd>.</Kbd>
              </span>
              <span>Previous / next frame</span>
              <span>
                <Kbd>F</Kbd>
              </span>
              <span>Fullscreen</span>
              <span>
                <Kbd>M</Kbd>
              </span>
              <span>Mute</span>
            </div>
          </Panel>
        </div>
      </div>
    </Page>
  )
}
