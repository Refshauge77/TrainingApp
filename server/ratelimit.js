import { HttpError } from './auth.js';

/**
 * Counts failures per key in a sliding window and refuses further attempts once the
 * limit is reached – slows down guessing of passwords and the club invite code.
 */
export function failureLimiter({ max, windowMs }) {
  const failures = new Map();

  function recent(key) {
    const since = Date.now() - windowMs;
    const list = (failures.get(key) ?? []).filter((t) => t > since);
    if (list.length) failures.set(key, list);
    else failures.delete(key);
    return list;
  }

  return {
    check(key) {
      if (recent(key).length >= max) {
        throw new HttpError(429, 'For mange forkerte forsøg – vent et kvarter og prøv igen');
      }
    },
    fail(key) {
      failures.set(key, [...recent(key), Date.now()]);
    },
    reset(key) {
      failures.delete(key);
    },
  };
}
