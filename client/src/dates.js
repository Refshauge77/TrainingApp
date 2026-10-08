const LOCALE = 'da-DK';

export const fmtTime = (iso) =>
  new Date(iso).toLocaleTimeString(LOCALE, { hour: '2-digit', minute: '2-digit' });

export const fmtDay = (d) =>
  new Date(d).toLocaleDateString(LOCALE, { weekday: 'long', day: 'numeric', month: 'long' });

export const fmtShortDay = (d) =>
  new Date(d).toLocaleDateString(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' });

export const fmtMonth = (d) =>
  new Date(d).toLocaleDateString(LOCALE, { month: 'long', year: 'numeric' });

export function fmtRange(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  return sameDay(start, end)
    ? `${fmtDay(start)} kl. ${fmtTime(start)}–${fmtTime(end)}`
    : `${fmtShortDay(start)} kl. ${fmtTime(start)} – ${fmtShortDay(end)} kl. ${fmtTime(end)}`;
}

/** WhatsApp-style timestamp: time today, weekday this week, otherwise date. */
export function fmtChatStamp(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (sameDay(d, now)) return fmtTime(d);
  if (now - d < 6 * 864e5) return d.toLocaleDateString(LOCALE, { weekday: 'short' });
  return d.toLocaleDateString(LOCALE, { day: 'numeric', month: 'short' });
}

export function sameDay(a, b) {
  a = new Date(a);
  b = new Date(b);
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

/** Monday-first 6-week grid covering the month of `d`. */
export function monthGrid(d) {
  const first = new Date(d.getFullYear(), d.getMonth(), 1);
  const offset = (first.getDay() + 6) % 7;
  const start = addDays(first, -offset);
  return Array.from({ length: 42 }, (_, i) => addDays(start, i));
}

export const dayKey = (d) => {
  d = new Date(d);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Value for <input type="datetime-local"> in local time. */
export function toLocalInput(d) {
  d = new Date(d);
  return `${dayKey(d)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
