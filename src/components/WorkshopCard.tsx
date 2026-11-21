import { Link } from 'react-router-dom';
import type { Workshop } from '../types';

export function WorkshopCard({ workshop }: { workshop: Workshop }) {
  const left = Math.max(0, workshop.capacity - workshop.registeredCount);
  const isAvailable = workshop.status === 'open' && left > 0;
  const canJoinWaitlist = workshop.status === 'open' && left === 0;
  const waitlistCount = workshop.waitlistCount ?? 0;

  const isDigitalSkills =
    workshop.name.toLowerCase().includes('computer basics') ||
    workshop.category.toLowerCase() === 'digital literacy';

  return (
    <article className="workshop-card">
      <div className="card-band">
        <span>{workshop.category}</span>
        <span className={`seat ${left < 5 ? 'limited' : ''}`}>
          {workshop.status !== 'open'
            ? 'Closed'
            : left > 0
              ? `${left} seats left`
              : 'Full · Waitlist open'}
        </span>
      </div>
      <div className="card-body">
        <h2>{workshop.name}</h2>
        <p>{workshop.description}</p>
        <div className="meta">
          <span>◷ {workshop.duration}</span>
          <span>▣ {workshop.workshopDate}</span>
          <span>⌖ {workshop.location}</span>
          {waitlistCount > 0 && <span>⧗ {waitlistCount} waitlisted</span>}
        </div>
        <div className="card-actions-row">
          {isAvailable ? (
            <Link className="btn primary" to={`/register?workshop=${workshop.id}`}>
              Register Now
            </Link>
          ) : canJoinWaitlist ? (
            <Link
              className="btn secondary"
              to={`/register?workshop=${workshop.id}&mode=waitlist`}
            >
              Join Waiting List
            </Link>
          ) : (
            <span className="btn tertiary">Closed</span>
          )}
          {isDigitalSkills && (
            <Link className="btn tertiary" to="/institutions">
              Find Training Institutions
            </Link>
          )}
        </div>
      </div>
    </article>
  );
}
