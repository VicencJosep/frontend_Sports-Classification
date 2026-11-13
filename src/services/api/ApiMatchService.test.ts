import { describe, expect, it } from 'vitest'

import type { ApiPartAnalysis, ApiReviewItemResult } from '@/adapters/api'

import { ApiMatchService } from './ApiMatchService'

interface Call {
  url: string
  method: string
  body: unknown
}

/** A fetch double: answers by "<METHOD> <path>" and records every call. */
function fakeFetch(routes: Record<string, { status?: number; body: unknown }>) {
  const calls: Call[] = []
  const fetchFn: typeof fetch = async (input, init) => {
    const url = String(input)
    const method = init?.method ?? 'GET'
    calls.push({ url, method, body: typeof init?.body === 'string' ? JSON.parse(init.body) : null })
    const route = routes[`${method} ${url}`]
    if (!route) return new Response(JSON.stringify({ detail: 'Not Found' }), { status: 404 })
    return new Response(JSON.stringify(route.body), { status: route.status ?? 200 })
  }
  return { fetchFn, calls }
}

const analysis: ApiPartAnalysis = {
  match_id: 'm',
  part_id: 'full',
  mode: 'full-match',
  frame_count: 1500,
  source_video_path: null,
  events: [],
  ball_actions: [{ id: 'act-50', frame_idx: 50, timestamp_s: 2, tracker_id: 7, team_cluster: 1, label: 'pass', confidence: 0.9, probabilities: {}, is_background: false, spot_score: null }],
  teams: { clusters: [0, 1], assignments: { '7': 1 }, excluded: {} },
}
const reviewInfo = { exists: true, created_at: null, updated_at: null, n_edited: 1, n_added: 0, n_deleted: 0, tracker_sides: { '7': 'home' } }
const PART = '/api/matches/m/parts/full'

describe('ApiMatchService review', () => {
  it('loads the reviewed copy', async () => {
    const { fetchFn, calls } = fakeFetch({ [`GET ${PART}/review`]: { body: { ...analysis, review: reviewInfo } } })
    const loaded = await new ApiMatchService({ baseUrl: '', fetchFn }).getPartAnalysis('m', 'full')
    expect(loaded.review).toMatchObject({ exists: true, nEdited: 1 })
    expect(loaded.review?.trackerSides.get(7)).toBe('home')
    expect(calls.map((c) => c.url)).toEqual([`${PART}/review`])
  })

  it('falls back to the plain analysis on a backend without reviewed copies', async () => {
    const { fetchFn, calls } = fakeFetch({ [`GET ${PART}/analysis`]: { body: analysis } })
    const loaded = await new ApiMatchService({ baseUrl: '', fetchFn }).getPartAnalysis('m', 'full')
    expect(loaded.review).toBeNull()
    expect(loaded.ballActions).toHaveLength(1)
    expect(calls.map((c) => c.url)).toEqual([`${PART}/review`, `${PART}/analysis`])
  })

  it('does not hide other failures behind the fallback', async () => {
    const { fetchFn } = fakeFetch({ [`GET ${PART}/review`]: { status: 409, body: { error: { code: 'not_ready', message: 'not analysed yet' } } } })
    await expect(new ApiMatchService({ baseUrl: '', fetchFn }).getPartAnalysis('m', 'full')).rejects.toThrow('not analysed yet')
  })

  it('sends corrections to the reviewed copy', async () => {
    const result: ApiReviewItemResult = { kind: 'action', id: 'act-50', deleted: false, action: { ...analysis.ball_actions[0]!, label: 'drive', review: 'edited' }, event: null, review: reviewInfo }
    const { fetchFn, calls } = fakeFetch({
      [`PATCH ${PART}/review/items/act-50`]: { body: result },
      [`DELETE ${PART}/review/items/act-50`]: { body: { ...result, deleted: true } },
      [`POST ${PART}/review/items/act-50/restore`]: { body: result },
      [`POST ${PART}/review/items`]: { status: 201, body: result },
      [`POST ${PART}/review/export`]: { body: { from_s: 600, to_s: 3600, n_rows: 2, filename: 'ground_truth_10m00-60m00.csv', path: 'backend/storage/x.csv', csv: 'tiempo,etiqueta,dorsal,equipo\n' } },
    })
    const review = new ApiMatchService({ baseUrl: '', fetchFn }).review

    const updated = await review.updateItem('m', 'full', 'act-50', { label: 'drive', trackerId: null })
    expect(updated.action).toMatchObject({ label: 'drive', review: 'edited' })
    expect(calls[0]).toEqual({ url: `${PART}/review/items/act-50`, method: 'PATCH', body: { label: 'drive', tracker_id: null } })

    expect((await review.deleteItem('m', 'full', 'act-50')).deleted).toBe(true)
    await review.restoreItem('m', 'full', 'act-50')
    await review.addItem('m', 'full', { kind: 'event', label: 'corner', timeS: 61.2, trackerId: 7, side: 'away' })
    expect(calls[3]).toEqual({ url: `${PART}/review/items`, method: 'POST', body: { kind: 'event', label: 'corner', time_s: 61.2, tracker_id: 7, side: 'away' } })

    const sheet = await review.exportSheet('m', 'full', 600, 3600)
    expect(sheet).toMatchObject({ fromS: 600, toS: 3600, nRows: 2, filename: 'ground_truth_10m00-60m00.csv' })
    expect(calls[4]?.body).toEqual({ from_s: 600, to_s: 3600 })
  })
})
