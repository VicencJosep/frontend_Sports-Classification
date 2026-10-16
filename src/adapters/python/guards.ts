import type { RawTeamsJson, RawTelemetry, RawTracksRecord } from './raw'

/**
 * Minimal structural validation of the Python JSON files. Deliberately shallow:
 * it checks the keys the adapters rely on and reports WHERE the contract broke,
 * so a pipeline change shows up as a clear error instead of NaN overlays.
 */
export class AdapterError extends Error {
  readonly path: string

  constructor(path: string, message: string) {
    super(`${path}: ${message}`)
    this.name = 'AdapterError'
    this.path = path
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function isNumberTuple(value: unknown, length: number): boolean {
  return Array.isArray(value) && value.length === length && value.every(isNumber)
}

function expect(condition: boolean, path: string, message: string): asserts condition {
  if (!condition) throw new AdapterError(path, message)
}

export function assertTracksRecord(value: unknown, path = 'tracks record'): asserts value is RawTracksRecord {
  expect(isRecord(value), path, 'expected an object')
  expect(isNumber(value.frame_idx), `${path}.frame_idx`, 'expected a number')
  expect(isNumber(value.timestamp_s), `${path}.timestamp_s`, 'expected a number')
  expect(Array.isArray(value.tracks), `${path}.tracks`, 'expected an array')
  const first: unknown = value.tracks[0]
  if (first !== undefined) {
    expect(isRecord(first), `${path}.tracks[0]`, 'expected an object')
    expect(isNumber(first.tracker_id), `${path}.tracks[0].tracker_id`, 'expected a number')
    expect(isNumberTuple(first.xyxy, 4), `${path}.tracks[0].xyxy`, 'expected [x1, y1, x2, y2]')
    expect(isNumberTuple(first.anchor_xy, 2), `${path}.tracks[0].anchor_xy`, 'expected [x, y]')
    expect(typeof first.role === 'string', `${path}.tracks[0].role`, 'expected a string')
  }
  if (value.ball !== null && value.ball !== undefined) {
    expect(isRecord(value.ball), `${path}.ball`, 'expected an object or null')
    expect(isNumberTuple(value.ball.xyxy, 4), `${path}.ball.xyxy`, 'expected [x1, y1, x2, y2]')
    expect(isNumberTuple(value.ball.center_xy, 2), `${path}.ball.center_xy`, 'expected [x, y]')
  }
}

export function assertTeamsJson(value: unknown, path = 'teams.json'): asserts value is RawTeamsJson {
  expect(isRecord(value), path, 'expected an object')
  expect(Array.isArray(value.teams), `${path}.teams`, 'expected an array')
  expect(Array.isArray(value.excluded), `${path}.excluded`, 'expected an array')
  const first: unknown = value.teams[0]
  if (first !== undefined) {
    expect(isRecord(first), `${path}.teams[0]`, 'expected an object')
    expect(isNumber(first.tracker_id), `${path}.teams[0].tracker_id`, 'expected a number')
    expect(isNumber(first.team_cluster), `${path}.teams[0].team_cluster`, 'expected a number')
  }
}

export function assertTelemetry(value: unknown, path = 'telemetry.json'): asserts value is RawTelemetry {
  expect(isRecord(value), path, 'expected an object')
  expect(Array.isArray(value.ball_actions), `${path}.ball_actions`, 'expected an array')
  const hasEvents = Array.isArray(value.events)
  const hasEvent = 'event' in value
  expect(hasEvents || hasEvent, path, 'expected either `events` (full match) or `event` (clip)')
  if (hasEvents) {
    const first: unknown = (value.events as unknown[])[0]
    if (first !== undefined) {
      expect(isRecord(first), `${path}.events[0]`, 'expected an object')
      expect(typeof first.label === 'string', `${path}.events[0].label`, 'expected a string')
      expect(isNumber(first.start_s), `${path}.events[0].start_s`, 'expected a number')
      expect(isNumber(first.end_s), `${path}.events[0].end_s`, 'expected a number')
    }
  } else if (value.event !== null && value.event !== undefined) {
    expect(isRecord(value.event), `${path}.event`, 'expected an object or null')
    expect(typeof value.event.label === 'string', `${path}.event.label`, 'expected a string')
    expect(isNumber(value.event.confidence), `${path}.event.confidence`, 'expected a number')
  }
  const action: unknown = (value.ball_actions as unknown[])[0]
  if (action !== undefined) {
    expect(isRecord(action), `${path}.ball_actions[0]`, 'expected an object')
    expect(isNumber(action.frame_idx), `${path}.ball_actions[0].frame_idx`, 'expected a number')
    expect(isNumber(action.tracker_id), `${path}.ball_actions[0].tracker_id`, 'expected a number')
    expect(typeof action.label === 'string', `${path}.ball_actions[0].label`, 'expected a string')
  }
}
