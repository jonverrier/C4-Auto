/**
 * @module DateUtils
 * Shared date utilities used by ModuleHeaderVisitor and C4DiagramVisitor.
 * Centralises the YYYYMMDD formatting/parsing logic and time-window constants
 * so that changes need only be made in one place.
 */
// Copyright (c) 2025, 2026 Jon Verrier

import { ETimeWindow } from './DocGenTypes';

/** Number of milliseconds in one day. */
export const MS_PER_DAY = 86400000;

/** Time-window durations in days, keyed by ETimeWindow. */
export const TIME_WINDOW_DAYS: Record<ETimeWindow, number> = {
   [ETimeWindow.kOneWeek]:  7,
   [ETimeWindow.kTwoWeeks]: 14,
   [ETimeWindow.kOneMonth]: 30
};

/**
 * Formats a Date as a compact YYYYMMDD string.
 */
export function formatDateYYYYMMDD(date: Date): string {
   const y = date.getFullYear();
   const m = String(date.getMonth() + 1).padStart(2, '0');
   const d = String(date.getDate()).padStart(2, '0');
   return `${y}${m}${d}`;
}

/**
 * Parses a YYYYMMDD string into a Date, returning null if malformed.
 */
export function parseDateYYYYMMDD(s: string): Date | null {
   if (!/^\d{8}$/.test(s)) return null;
   const year  = parseInt(s.substring(0, 4), 10);
   const month = parseInt(s.substring(4, 6), 10) - 1;
   const day   = parseInt(s.substring(6, 8), 10);
   const d = new Date(year, month, day);
   if (d.getFullYear() !== year || d.getMonth() !== month || d.getDate() !== day) {
      return null;
   }
   return d;
}
