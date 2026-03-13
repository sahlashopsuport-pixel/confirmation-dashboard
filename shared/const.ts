export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = 'Please login (10001)';
export const NOT_ADMIN_ERR_MSG = 'You do not have required permission (10002)';

/** Algeria is UTC+1 (CET, no DST) */
export const ALGERIA_UTC_OFFSET_HOURS = 1;

/** Get current date string in Algeria timezone (YYYY-MM-DD) */
export function getAlgeriaDateStr(date?: Date): string {
  const d = date || new Date();
  const algeriaTime = new Date(d.getTime() + ALGERIA_UTC_OFFSET_HOURS * 60 * 60 * 1000);
  return algeriaTime.toISOString().slice(0, 10);
}
