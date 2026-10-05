import { useEffect, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { api } from '../api.js';
import { addDays, dayKey, toLocalInput } from '../dates.js';
import { canPlan, useSession } from '../session.jsx';
import Header from '../components/Header.jsx';
import Icon from '../components/Icon.jsx';
import { EVENT_TYPES } from '../components/eventTypes.js';

const PROGRAM_TEMPLATE = [
  { title: 'Opvarmning', details: '', minutes: 15 },
  { title: 'Hovedsæt', details: '', minutes: 40 },
  { title: 'Nedvarmning / udstrækning', details: '', minutes: 10 },
];

function defaultForm(user) {
  const start = addDays(new Date(), 1);
  start.setHours(17, 30, 0, 0);
  return {
    type: canPlan(user) ? 'training' : 'social',
    title: '',
    location: '',
    description: '',
    capacity: '',
    date: dayKey(start),
    startTime: '17:30',
    endTime: '19:00',
    program: [],
    repeat: false,
    repeatWeeks: 10,
    scope: 'one',
  };
}

function fromEvent(event, keepDate) {
  const [date, startTime] = toLocalInput(event.start_at).split('T');
  const endTime = toLocalInput(event.end_at).split('T')[1];
  return {
    type: event.type,
    title: event.title,
    location: event.location,
    description: event.description,
    capacity: event.capacity ?? '',
    date: keepDate ? date : dayKey(addDays(new Date(), 1)),
    startTime,
    endTime,
    program: event.program.map((p) => ({ ...p, minutes: p.minutes ?? '' })),
    repeat: false,
    repeatWeeks: 10,
    scope: 'one',
  };
}

export default function EventForm() {
  const { id } = useParams();
  const [search] = useSearchParams();
  const copyId = search.get('kopi');
  const { user } = useSession();
  const navigate = useNavigate();
  const [form, setForm] = useState(() => defaultForm(user));
  const [original, setOriginal] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const sourceId = id ?? copyId;
    if (!sourceId) return;
    api.get(`/events/${sourceId}`).then((event) => {
      if (id) setOriginal(event);
      setForm(fromEvent(event, Boolean(id)));
    }, (err) => setError(err.message));
  }, [id, copyId]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const setProgram = (program) => setForm((f) => ({ ...f, program }));
  const updateItem = (i, key, value) => setProgram(form.program.map((p, j) => (j === i ? { ...p, [key]: value } : p)));
  const moveItem = (i, dir) => {
    const next = [...form.program];
    [next[i], next[i + dir]] = [next[i + dir], next[i]];
    setProgram(next);
  };

  function times(date) {
    const start = new Date(`${date}T${form.startTime}`);
    let end = new Date(`${date}T${form.endTime}`);
    if (end <= start) end = addDays(end, 1); // ends after midnight
    return { start_at: start.toISOString(), end_at: end.toISOString() };
  }

  async function submit(e) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const body = {
      type: form.type,
      title: form.title,
      location: form.location,
      description: form.description,
      capacity: form.capacity === '' ? null : Number(form.capacity),
      program: form.program.map((p) => ({ ...p, minutes: p.minutes === '' ? null : Number(p.minutes) })),
    };
    try {
      if (id) {
        const saved = await api.patch(`/events/${id}`, { ...body, ...times(form.date), scope: form.scope });
        navigate(`/aftaler/${saved.id}`, { replace: true });
      } else {
        const weeks = form.repeat ? Math.max(1, Math.min(60, Number(form.repeatWeeks) || 1)) : 1;
        const first = new Date(`${form.date}T00:00`);
        // Weekly repeats are computed in local time so 17:30 stays 17:30 across daylight saving changes.
        const occurrences = Array.from({ length: weeks }, (_, w) => times(dayKey(addDays(first, w * 7))));
        const { ids } = await api.post('/events', { ...body, occurrences });
        navigate(`/aftaler/${ids[0]}`, { replace: true });
      }
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  const allowedTypes = Object.entries(EVENT_TYPES).filter(([key]) => canPlan(user) || !['training', 'competition'].includes(key) || key === original?.type);

  return (
    <>
      <Header title={id ? 'Rediger aftale' : 'Ny aftale'} back="/kalender" />
      <form className="form pad" onSubmit={submit}>
        <div className="segmented">
          {allowedTypes.map(([key, t]) => (
            <button type="button" key={key} className={form.type === key ? 'active' : ''} style={{ '--type-color': t.color }}
              onClick={() => setForm((f) => ({ ...f, type: key }))}>{t.label}</button>
          ))}
        </div>
        {!canPlan(user) && <p className="muted small">Træninger og løb oprettes af trænerne. Du kan oprette sociale og øvrige aftaler.</p>}

        <label>Titel<input value={form.title} onChange={set('title')} required maxLength={120}
          placeholder={form.type === 'training' ? 'Fx Intervaltræning – K1' : 'Fx Fælles tur til Mossø'} /></label>

        <div className="row">
          <label className="grow">Dato<input type="date" value={form.date} onChange={set('date')} required /></label>
          <label>Fra<input type="time" value={form.startTime} onChange={set('startTime')} required /></label>
          <label>Til<input type="time" value={form.endTime} onChange={set('endTime')} required /></label>
        </div>

        {!id && (
          <div className="repeat">
            <label className="check"><input type="checkbox" checked={form.repeat} onChange={set('repeat')} /> Gentag hver uge</label>
            {form.repeat && (
              <label className="inline">i <input type="number" min="2" max="60" value={form.repeatWeeks} onChange={set('repeatWeeks')} /> uger</label>
            )}
          </div>
        )}

        <div className="row">
          <label className="grow">Sted<input value={form.location} onChange={set('location')} maxLength={200} placeholder="Fx Klubhuset" /></label>
          <label>Max. deltagere<input type="number" min="1" value={form.capacity} onChange={set('capacity')} placeholder="Ingen" /></label>
        </div>

        <label>Beskrivelse<textarea rows={3} value={form.description} onChange={set('description')} maxLength={5000}
          placeholder="Praktisk info, udstyr, mødested…" /></label>

        <fieldset className="program-editor">
          <legend>Program for træningspasset</legend>
          {form.program.map((item, i) => (
            <div className="program-item" key={i}>
              <div className="row">
                <input className="grow" placeholder={`Punkt ${i + 1}, fx Opvarmning`} value={item.title}
                  onChange={(e) => updateItem(i, 'title', e.target.value)} maxLength={120} />
                <input className="minutes" type="number" min="0" placeholder="min" value={item.minutes}
                  onChange={(e) => updateItem(i, 'minutes', e.target.value)} aria-label="Minutter" />
              </div>
              <textarea rows={2} placeholder="Detaljer, fx 6 x 500 m, pause 1 min, puls 160+" value={item.details}
                onChange={(e) => updateItem(i, 'details', e.target.value)} maxLength={2000} />
              <div className="program-tools">
                <button type="button" className="link" disabled={i === 0} onClick={() => moveItem(i, -1)}>↑ Op</button>
                <button type="button" className="link" disabled={i === form.program.length - 1} onClick={() => moveItem(i, 1)}>↓ Ned</button>
                <button type="button" className="link danger" onClick={() => setProgram(form.program.filter((_, j) => j !== i))}>Fjern</button>
              </div>
            </div>
          ))}
          <div className="row">
            <button type="button" className="btn outline" onClick={() => setProgram([...form.program, { title: '', details: '', minutes: '' }])}>
              <Icon name="plus" size={16} /> Tilføj punkt
            </button>
            {form.program.length === 0 && form.type === 'training' && (
              <button type="button" className="btn outline" onClick={() => setProgram(PROGRAM_TEMPLATE.map((p) => ({ ...p })))}>
                Brug skabelon
              </button>
            )}
          </div>
        </fieldset>

        {id && original?.series_id && (
          <fieldset>
            <legend>Gentagelser</legend>
            <label className="check"><input type="radio" name="scope" value="one" checked={form.scope === 'one'} onChange={set('scope')} /> Ret kun denne aftale</label>
            <label className="check"><input type="radio" name="scope" value="series" checked={form.scope === 'series'} onChange={set('scope')} /> Ret også alle senere gentagelser (titel, sted, beskrivelse og program – ikke tidspunkt)</label>
          </fieldset>
        )}

        {error && <p className="error">{error}</p>}
        <button className="btn primary" disabled={busy}>{id ? 'Gem ændringer' : form.repeat ? `Opret ${form.repeatWeeks} aftaler` : 'Opret aftale'}</button>
      </form>
    </>
  );
}
