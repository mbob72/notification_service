import { DateTime } from 'luxon';
import type { QuietHoursWindow } from './types';

export function isMinuteInsideQuietHours(minute: number, window: QuietHoursWindow): boolean {
  const { startMinute, endMinute } = window;

  if (startMinute === endMinute) {
    return false;
  }

  if (startMinute < endMinute) {
    return minute >= startMinute && minute < endMinute;
  }

  return minute >= startMinute || minute < endMinute;
}

export function toLocalMinuteOfDay(isoDatetime: string, timezone: string): number {
  const dt = DateTime.fromISO(isoDatetime, { zone: timezone });

  if (!dt.isValid) {
    throw new Error(`Invalid datetime or timezone: datetime=${isoDatetime}, timezone=${timezone}`);
  }

  return dt.hour * 60 + dt.minute;
}
