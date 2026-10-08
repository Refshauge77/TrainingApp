import { Link } from 'react-router-dom';
import { fmtTime } from '../dates.js';
import { EVENT_TYPES } from './eventTypes.js';
import Icon from './Icon.jsx';
import RsvpButtons from './RsvpButtons.jsx';

export default function EventCard({ event, onChanged }) {
  const type = EVENT_TYPES[event.type];
  return (
    <div className={`event-card${event.cancelled ? ' cancelled' : ''}`} style={{ '--type-color': type.color }}>
      <Link to={`/aftaler/${event.id}`} className="event-card-main">
        <div className="event-time">
          <strong>{fmtTime(event.start_at)}</strong>
          <span>{fmtTime(event.end_at)}</span>
        </div>
        <div className="event-body">
          <span className="type-label">{type.label}{event.cancelled && ' · AFLYST'}</span>
          <h3>{event.title}</h3>
          <p className="muted small">
            {event.location && <><Icon name="pin" size={14} /> {event.location} · </>}
            {event.yes_count}{event.capacity ? `/${event.capacity}` : ''} tilmeldt
            {event.program?.length > 0 && ` · program: ${event.program.length} punkter`}
          </p>
        </div>
      </Link>
      <RsvpButtons event={event} compact onChanged={onChanged} />
    </div>
  );
}
