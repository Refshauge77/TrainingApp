import { createContext, useContext, useEffect, useRef } from 'react';

export const SessionContext = createContext(null);

/** { user, setUser, live } – live is a tiny pub/sub fed by the server's event stream. */
export const useSession = () => useContext(SessionContext);

export function createLiveBus() {
  const listeners = new Set();
  return {
    emit: (msg) => listeners.forEach((fn) => fn(msg)),
    subscribe: (fn) => {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

/** Calls handler for every live update from the server. */
export function useLive(handler) {
  const { live } = useSession();
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => live.subscribe((msg) => ref.current(msg)), [live]);
}

export const canPlan = (user) => user.role === 'admin' || user.role === 'coach';

export const ROLE_LABELS = { admin: 'Administrator', coach: 'Træner', member: 'Medlem' };
