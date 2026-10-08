import { HttpError } from './auth.js';

export function str(value, label, { max = 1000, required = true, trim = true } = {}) {
  let s = value == null ? '' : String(value);
  if (trim) s = s.trim();
  if (required && !s) throw new HttpError(400, `${label} skal udfyldes`);
  if (s.length > max) throw new HttpError(400, `${label} må højst være ${max} tegn`);
  return s;
}

export function isoDate(value, label) {
  const d = new Date(value);
  if (typeof value !== 'string' || Number.isNaN(d.getTime())) {
    throw new HttpError(400, `${label} er ikke en gyldig dato`);
  }
  return d.toISOString();
}

export function id(value) {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0) throw new HttpError(404, 'Ikke fundet');
  return n;
}
