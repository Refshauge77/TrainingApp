import { useState } from 'react';
import { api } from '../api.js';

/** Tilmeld / Frameld buttons. `compact` shows a single toggle for list views. */
export default function RsvpButtons({ event, compact = false, comment, onChanged }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const isPast = new Date(event.end_at) < new Date();
  if (event.cancelled || isPast) return null;

  const full = event.capacity && event.yes_count >= event.capacity && event.my_status !== 'yes';

  async function respond(status) {
    setBusy(true);
    setError('');
    try {
      const updated = await api.put(`/events/${event.id}/response`, { status, comment: comment ?? '' });
      onChanged?.(updated);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }

  if (compact) {
    return (
      <div className="rsvp-compact">
        {event.my_status === 'yes' ? (
          <button className="chip yes" disabled={busy} onClick={() => respond('no')} title="Tryk for at framelde">✓ Tilmeldt</button>
        ) : (
          <button className={`chip${event.my_status === 'no' ? ' no' : ''}`} disabled={busy || full} onClick={() => respond('yes')}>
            {full ? 'Fuldt' : event.my_status === 'no' ? 'Frameldt' : 'Tilmeld'}
          </button>
        )}
        {error && <span className="error small">{error}</span>}
      </div>
    );
  }

  return (
    <div className="rsvp">
      <div className="rsvp-buttons">
        <button className={`btn ${event.my_status === 'yes' ? 'yes' : 'outline'}`} disabled={busy || full} onClick={() => respond('yes')}>
          {event.my_status === 'yes' ? '✓ Tilmeldt' : full ? 'Ingen ledige pladser' : 'Tilmeld'}
        </button>
        <button className={`btn ${event.my_status === 'no' ? 'no' : 'outline'}`} disabled={busy} onClick={() => respond('no')}>
          {event.my_status === 'no' ? '✗ Frameldt' : 'Frameld'}
        </button>
      </div>
      {error && <p className="error">{error}</p>}
    </div>
  );
}
