import { useState } from 'react';
import { enablePush, permission, pushSupport } from '../push.js';
import Icon from './Icon.jsx';

const DISMISSED_KEY = 'push-banner-dismissed';

function wasDismissed() {
  try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch { return false; }
}

/** Gentle nudge to turn on notifications – shown until the user decides. */
export default function PushBanner() {
  const [hidden, setHidden] = useState(() => wasDismissed() || pushSupport() !== 'ok' || permission() !== 'default');
  const [error, setError] = useState('');
  if (hidden) return null;

  function dismiss() {
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch { /* private mode */ }
    setHidden(true);
  }

  async function enable() {
    try {
      await enablePush();
      setHidden(true);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="push-banner">
      <div className="grow">
        <strong>Få besked på telefonen</strong>
        <p className="muted small">Ved nye beskeder, nye træninger og aflysninger.</p>
        {error && <p className="error small">{error}</p>}
      </div>
      <button className="btn primary small-btn" onClick={enable}>Slå til</button>
      <button className="icon-btn" aria-label="Ikke nu" onClick={dismiss}><Icon name="close" size={18} /></button>
    </div>
  );
}
