// Game days and resets per server. The daily reset is 04:00 server time; the weekly reset is Monday at the same
// time. Global's server time is UTC-7 (verified on a real account: events end at 10:59:59 UTC); JP and KR are
// UTC+9, CN UTC+8.
import type { Server } from "../types";

export const SERVER_UTC_OFFSET: Record<Server, number> = { en: -7, jp: 9, kr: 9, cn: 8 };
const RESET_HOUR = 4;
const HOUR = 3600_000;
const DAY = 24 * HOUR;

/** The moment the current game day started, and its weekday (1 = Monday ... 7 = Sunday) on the server. */
export function gameDay(server: Server, now = Date.now()): { start: number; weekday: number } {
  const shifted = now + (SERVER_UTC_OFFSET[server] - RESET_HOUR) * HOUR; // as if resets happened at midnight UTC
  const dayStart = Math.floor(shifted / DAY) * DAY;
  const weekday = ((new Date(dayStart).getUTCDay() + 6) % 7) + 1;
  return { start: dayStart - (SERVER_UTC_OFFSET[server] - RESET_HOUR) * HOUR, weekday };
}

export function nextDailyReset(server: Server, now = Date.now()): number {
  return gameDay(server, now).start + DAY;
}

export function nextWeeklyReset(server: Server, now = Date.now()): number {
  const { start, weekday } = gameDay(server, now);
  return start + (8 - weekday) * DAY;
}

export const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
