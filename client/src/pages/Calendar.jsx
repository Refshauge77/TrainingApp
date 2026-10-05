import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { addDays, dayKey, fmtDay, fmtMonth, monthGrid, sameDay, startOfDay } from '../dates.js';
import { useLive } from '../session.jsx';
import EventCard from '../components/EventCard.jsx';
import Header from '../components/Header.jsx';
import PushBanner from '../components/PushBanner.jsx';
import Icon from '../components/Icon.jsx';
import { EVENT_TYPES } from '../components/eventTypes.js';

const WEEKDAYS = ['man', 'tir', 'ons', 'tor', 'fre', 'lør', 'søn'];

function loadPref(key, fallback) {
  try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; }
}
function savePref(key, value) {
  try { localStorage.setItem(key, value); } catch { /* private mode */ }
}

export default function Calendar() {
  const [view, setView] = useState(() => loadPref('calendar-view', 'list'));
  const [filter, setFilter] = useState('all');
  const [month, setMonth] = useState(() => startOfDay(new Date()));
  const [selectedDay, setSelectedDay] = useState(() => startOfDay(new Date()));
  const [listWeeks, setListWeeks] = useState(6);
  const [events, setEvents] = useState(null);
  const [error, setError] = useState('');

  const range = useMemo(() => {
    if (view === 'month') {
      const grid = monthGrid(month);
      return [grid[0], addDays(grid[41], 1)];
    }
    const today = startOfDay(new Date());
    return [today, addDays(today, listWeeks * 7)];
  }, [view, month, listWeeks]);

  const load = useCallback(() => {
    api.get(`/events?from=${range[0].toISOString()}&to=${range[1].toISOString()}`)
      .then((data) => { setEvents(data); setError(''); })
      .catch((err) => setError(err.message));
  }, [range]);

  useEffect(load, [load]);
  useLive((msg) => { if (msg.type === 'events-changed') load(); });

  const visible = (events ?? []).filter((e) => filter === 'all' || (filter === 'mine' ? e.my_status === 'yes' : e.type === filter));
  const byDay = useMemo(() => {
    const map = new Map();
    for (const e of visible) {
      const key = dayKey(e.start_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(e);
    }
    return map;
  }, [visible]);

  const replaceEvent = (updated) => setEvents((list) => list.map((e) => (e.id === updated.id ? { ...e, ...updated } : e)));

  function changeView(v) {
    setView(v);
    savePref('calendar-view', v);
  }

  return (
    <>
      <Header
        title="Kalender"
        actions={(
          <>
            <button className="icon-btn" aria-label={view === 'list' ? 'Vis måned' : 'Vis liste'}
              onClick={() => changeView(view === 'list' ? 'month' : 'list')}>
              <Icon name={view === 'list' ? 'grid' : 'list'} />
            </button>
            <Link to="/aftaler/ny" className="icon-btn primary" aria-label="Ny aftale"><Icon name="plus" /></Link>
          </>
        )}
      />

      <PushBanner />

      <div className="filters">
        {[['all', 'Alle'], ['mine', 'Mine tilmeldinger'], ...Object.entries(EVENT_TYPES).map(([k, t]) => [k, t.label])].map(([key, label]) => (
          <button key={key} className={`chip${filter === key ? ' active' : ''}`} onClick={() => setFilter(key)}>{label}</button>
        ))}
      </div>

      {error && <p className="error pad">{error}</p>}

      {view === 'month' ? (
        <>
          <div className="month-nav">
            <button className="icon-btn" aria-label="Forrige måned"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><Icon name="chevronLeft" /></button>
            <h2>{fmtMonth(month)}</h2>
            <button className="icon-btn" aria-label="Næste måned"
              onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><Icon name="chevronRight" /></button>
          </div>
          <div className="month-grid">
            {WEEKDAYS.map((d) => <div key={d} className="weekday">{d}</div>)}
            {monthGrid(month).map((day) => {
              const dayEvents = byDay.get(dayKey(day)) ?? [];
              const classes = ['day',
                day.getMonth() !== month.getMonth() && 'other-month',
                sameDay(day, new Date()) && 'today',
                sameDay(day, selectedDay) && 'selected'].filter(Boolean).join(' ');
              return (
                <button key={day.toISOString()} className={classes} onClick={() => setSelectedDay(day)}>
                  <span>{day.getDate()}</span>
                  <div className="dots">
                    {dayEvents.slice(0, 4).map((e) => (
                      <i key={e.id} style={{ background: EVENT_TYPES[e.type].color }} className={e.my_status === 'yes' ? 'mine' : ''} />
                    ))}
                  </div>
                </button>
              );
            })}
          </div>
          <section className="day-section">
            <h2 className="day-heading">{fmtDay(selectedDay)}</h2>
            {(byDay.get(dayKey(selectedDay)) ?? []).map((e) => <EventCard key={e.id} event={e} onChanged={replaceEvent} />)}
            {!(byDay.get(dayKey(selectedDay)) ?? []).length && <p className="muted pad">Ingen aftaler denne dag.</p>}
          </section>
        </>
      ) : (
        <>
          {events === null && <p className="muted pad">Indlæser…</p>}
          {events && !visible.length && (
            <div className="empty">
              <p>Der er ingen kommende aftaler{filter !== 'all' && ' med dette filter'}.</p>
              <Link to="/aftaler/ny" className="btn primary">Opret en aftale</Link>
            </div>
          )}
          {[...byDay.entries()].map(([key, dayEvents]) => (
            <section key={key} className="day-section">
              <h2 className="day-heading">{sameDay(dayEvents[0].start_at, new Date()) ? 'I dag' : fmtDay(dayEvents[0].start_at)}</h2>
              {dayEvents.map((e) => <EventCard key={e.id} event={e} onChanged={replaceEvent} />)}
            </section>
          ))}
          {events && (
            <button className="btn outline more" onClick={() => setListWeeks(listWeeks + 6)}>Vis flere uger</button>
          )}
        </>
      )}
    </>
  );
}
