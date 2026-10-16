import { describe, expect, it } from 'vitest'

import { formatClock, formatClockTenths, formatDate, formatDuration } from './time'

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
