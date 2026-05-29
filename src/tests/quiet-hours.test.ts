import { describe, expect, it } from 'vitest';
import { isMinuteInsideQuietHours } from '../domain/quiet-hours';

describe('isMinuteInsideQuietHours', () => {
  it('handles same-day interval', () => {
    expect(isMinuteInsideQuietHours(9 * 60 + 30, { startMinute: 9 * 60, endMinute: 10 * 60 })).toBe(true);
  });

  it('handles cross-midnight interval', () => {
    expect(isMinuteInsideQuietHours(23 * 60, { startMinute: 22 * 60, endMinute: 8 * 60 })).toBe(true);
    expect(isMinuteInsideQuietHours(7 * 60, { startMinute: 22 * 60, endMinute: 8 * 60 })).toBe(true);
  });

  it('returns false outside interval', () => {
    expect(isMinuteInsideQuietHours(12 * 60, { startMinute: 22 * 60, endMinute: 8 * 60 })).toBe(false);
  });

  it('returns false when startMinute equals endMinute', () => {
    expect(isMinuteInsideQuietHours(500, { startMinute: 500, endMinute: 500 })).toBe(false);
  });
});
