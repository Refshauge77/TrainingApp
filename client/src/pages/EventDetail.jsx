import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { fmtRange } from '../dates.js';
import { canPlan, useLive, useSession } from '../session.jsx';
import Header from '../components/Header.jsx';
import Icon from '../components/Icon.jsx';
import RsvpButtons from '../components/RsvpButtons.jsx';
import { EVENT_TYPES } from '../components/eventTypes.js';

export default function EventDetail() {
  const { id } = useParams();
  const { user } = useSession();
  const navigate = useNavigate();
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');
  const [comment, setComment] = useState('');

  const load = useCallback(() => {
    api.get(`/events/${id}`).then((e) => {
      setEvent(e);
      setComment(e.responses.find((r) => r.user_id === user.id)?.comment ?? '');
    }, (err) => setError(err.message));
  }, [id, user.id]);

  useEffect(load, [load]);
  useLive((msg) => { if (msg.type === 'events-changed' && (!msg.eventId || msg.eventId === Number(id))) load(); });

  if (error) return <><Header title="Aftale" back="/kalender" /><p className="error pad">{error}</p></>;
  if (!event) return <><Header title="Aftale" back="/kalender" /><p className="muted pad">Indlæser…</p></>;

  const type = EVENT_TYPES[event.type];
  const mayEdit = canPlan(user) || event.creator?.id === user.id;
  const yes = event.responses.filter((r) => r.status === 'yes');
  const no = event.responses.filter((r) => r.status === 'no');
  const totalMinutes = event.program.reduce((sum, p) => sum + (p.minutes ?? 0), 0);

  async function openChat() {
    const { id: threadId } = await api.post(`/events/${event.id}/thread`);
    navigate(`/chat/${threadId}`);
  }

  async function saveComment() {
    if (!event.my_status) return;
    setEvent(await api.put(`/events/${event.id}/response`, { status: event.my_status, comment }));
  }

  async function toggleCancelled() {
    const msg = event.cancelled ? 'Genåbn aftalen?' : 'Aflys aftalen? Alle kan stadig se den, men ingen kan tilmelde sig.';
    if (confirm(msg)) setEvent(await api.patch(`/events/${event.id}`, { cancelled: !event.cancelled }));
  }

  async function remove() {
    let scope = 'one';
    if (event.series_id) {
      if (!confirm('Slet aftalen?')) return;
      scope = confirm('Skal også alle senere gentagelser i serien slettes?\n\nOK = slet også senere gentagelser\nAnnuller = slet kun denne') ? 'series' : 'one';
    } else if (!confirm('Slet aftalen? Det kan ikke fortrydes.')) {
      return;
    }
    await api.delete(`/events/${event.id}?scope=${scope}`);
    navigate('/kalender', { replace: true });
  }

  return (
    <>
      <Header title={type.label} back="/kalender"
        actions={mayEdit && <Link className="icon-btn" to={`/aftaler/${event.id}/rediger`} aria-label="Rediger"><Icon name="edit" /></Link>} />

      <div className="detail" style={{ '--type-color': type.color }}>
        <div className="detail-hero">
          {event.cancelled && <span className="cancelled-tag">AFLYST</span>}
          <h2>{event.title}</h2>
          <p><Icon name="clock" size={16} /> {fmtRange(event.start_at, event.end_at)}</p>
          {event.location && <p><Icon name="pin" size={16} /> {event.location}</p>}
          {event.series_id && <p className="muted small">Del af en serie med {event.series_count} gentagelser</p>}
          {event.creator && <p className="muted small">Oprettet af {event.creator.name}</p>}
        </div>

        <section className="card">
          <RsvpButtons event={event} comment={comment} onChanged={setEvent} />
          {event.my_status && !event.cancelled && new Date(event.end_at) > new Date() && (
            <div className="comment-row">
              <input placeholder="Kommentar, fx “kommer 10 min senere”" value={comment} maxLength={300}
                onChange={(e) => setComment(e.target.value)} onBlur={saveComment}
                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
            </div>
          )}
          <button className="btn outline full" onClick={openChat}><Icon name="chat" size={18} /> Skriv i aftalens chat-tråd</button>
        </section>

        {event.description && (
          <section className="card">
            <h3>Beskrivelse</h3>
            <p className="prewrap">{event.description}</p>
          </section>
        )}

        {event.program.length > 0 && (
          <section className="card">
            <h3>Program{totalMinutes > 0 && <span className="muted small"> · {totalMinutes} min i alt</span>}</h3>
            <ol className="program">
              {event.program.map((item, i) => (
                <li key={i}>
                  <div className="program-head">
                    <strong>{item.title || `Punkt ${i + 1}`}</strong>
                    {item.minutes != null && <span className="pill">{item.minutes} min</span>}
                  </div>
                  {item.details && <p className="prewrap">{item.details}</p>}
                </li>
              ))}
            </ol>
          </section>
        )}

        <section className="card">
          <h3>Tilmeldt ({yes.length}{event.capacity ? ` af ${event.capacity}` : ''})</h3>
          <PeopleList people={yes} empty="Ingen er tilmeldt endnu." />
          {no.length > 0 && <><h3>Frameldt ({no.length})</h3><PeopleList people={no} /></>}
          {event.no_response.length > 0 && (
            <details>
              <summary className="muted">Har ikke svaret ({event.no_response.length})</summary>
              <PeopleList people={event.no_response} />
            </details>
          )}
        </section>

        {mayEdit && (
          <div className="danger-zone">
            <Link className="btn outline" to={`/aftaler/ny?kopi=${event.id}`}>Kopiér</Link>
            <button className="btn outline" onClick={toggleCancelled}>{event.cancelled ? 'Genåbn' : 'Aflys'}</button>
            <button className="btn danger" onClick={remove}>Slet</button>
          </div>
        )}
      </div>
    </>
  );
}

function PeopleList({ people, empty }) {
  if (!people.length) return empty ? <p className="muted">{empty}</p> : null;
  return (
    <ul className="people">
      {people.map((p) => (
        <li key={p.user_id}>
          <span className="avatar">{initials(p.name)}</span>
          <span>{p.name}{p.comment && <span className="muted small"> – {p.comment}</span>}</span>
        </li>
      ))}
    </ul>
  );
}

export function initials(name = '') {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
}
