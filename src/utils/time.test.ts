import { describe, expect, it } from 'vitest'

import { formatClock, formatClockTenths, formatDate, formatDuration, parseClock } from './time'

describe('time formatting', () => {
  it('formats mm:ss and h:mm:ss', () => {
    expect(formatClock(0)).toBe('00:00')
    expect(formatClock(67.4)).toBe('01:07')
    expect(formatClock(3725)).toBe('1:02:05')
    expect(formatClock(-1)).toBe('--:--')
  })
  it('formats tenths', () => {
    expect(formatClockTenths(67.44)).toBe('01:07.4')
  })
  it('formats durations and dates', () => {
    expect(formatDuration(5400)).toBe('90:00')
    expect(formatDuration(null)).toBe('—')
    expect(formatDate('2019-10-01')).toBe('1 Oct 2019')
    expect(formatDate(null)).toBe('—')
  })
})

describe('parseClock', () => {
  it('reads seconds, mm:ss, mm:ss.t and h:mm:ss', () => {
    expect(parseClock('75')).toBe(75)
    expect(parseClock('75.5s')).toBe(75.5)
    expect(parseClock('1:15')).toBe(75)
    expect(parseClock('01:15.4')).toBeCloseTo(75.4)
    expect(parseClock('1:02:05')).toBe(3725)
  })

  it('rejects junk', () => {
    expect(parseClock('')).toBeNull()
    expect(parseClock('abc')).toBeNull()
    expect(parseClock('1::2')).toBeNull()
    expect(parseClock('1:2:3:4')).toBeNull()
    expect(parseClock('-5')).toBeNull()
  })
})
