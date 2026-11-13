import { describe, expect, it } from 'vitest'

import type { PersonDetection } from '@/domain'

import { fitContain, personAt, toCanvas, toSource, trackerColor } from './geometry'

describe('fitContain', () => {
  it('letterboxes a 16:9 source into a 4:3 box', () => {
    const t = fitContain(1280, 720, 640, 480)
    expect(t.scale).toBe(0.5)
    expect(t.offsetX).toBe(0)
    expect(t.offsetY).toBe(60)
    expect(toCanvas(t, [1280, 720])).toEqual([640, 420])
    expect(toCanvas(t, [0, 0])).toEqual([0, 60])
  })
  it('pillarboxes into a wider box', () => {
    const t = fitContain(1280, 720, 1000, 300)
    expect(t.scale).toBeCloseTo(300 / 720)
    expect(t.offsetY).toBe(0)
    expect(t.offsetX).toBeCloseTo((1000 - 1280 * (300 / 720)) / 2)
  })
  it('is safe with empty boxes', () => {
    expect(fitContain(1280, 720, 0, 0)).toEqual({ scale: 1, offsetX: 0, offsetY: 0 })
  })
  it('gives different colours to neighbouring ids', () => {
    expect(trackerColor(1)).not.toBe(trackerColor(2))
  })
})

describe('picking a player', () => {
  const person = (trackerId: number, box: [number, number, number, number]): PersonDetection => ({
    trackerId,
    box,
    anchor: [(box[0] + box[2]) / 2, box[3]],
    confidence: 0.9,
    role: 'player',
    jersey: null,
    fieldXy: null,
  })
  const persons = [person(1, [100, 100, 140, 200]), person(2, [130, 110, 170, 210]), person(3, [600, 300, 620, 350])]

  it('maps canvas pixels back to the source frame', () => {
    const t = fitContain(1280, 720, 640, 480)
    expect(toSource(t, 640, 420)).toEqual([1280, 720])
    expect(toSource(t, 0, 60)).toEqual([0, 0])
  })

  it('returns the person under the point, the nearest centre when boxes overlap', () => {
    expect(personAt(persons, 110, 150)?.trackerId).toBe(1)
    expect(personAt(persons, 135, 150)?.trackerId).toBe(1)
    expect(personAt(persons, 138, 170)?.trackerId).toBe(2)
    expect(personAt(persons, 400, 150)).toBeNull()
  })

  it('accepts a margin around small far players', () => {
    expect(personAt(persons, 595, 320)).toBeNull()
    expect(personAt(persons, 595, 320, 8)?.trackerId).toBe(3)
  })
})
