import { Link } from 'react-router-dom';
import type { Workshop } from '../types';

export function WorkshopCard({ workshop }: { workshop: Workshop }) {
  const left = Math.max(0, workshop.capacity - workshop.registeredCount);
  const isAvailable = workshop.status === 'open' && left > 0;

  return (
    <article className="workshop-card">
      <div className="card-band">
        <span>{workshop.category}</span>
        <span className={`seat ${left < 5 ? 'limited' : ''}`}>
          {left} seats left
        </span>
      </div>
      <div className="card-body">
        <h2>{workshop.name}</h2>
        <p>{workshop.description}</p>
        <div className="meta">
          <span>◷ {workshop.duration}</span>
          <span>▣ {workshop.workshopDate}</span>
          <span>⌖ {workshop.location}</span>
        </div>
        {isAvailable ? (
          <Link className="btn primary" to={`/register?workshop=${workshop.id}`}>
            Register Now
          </Link>
        ) : (
          <span className="btn tertiary">
            {workshop.status === 'closed' ? 'Closed' : 'Workshop Full'}
          </span>
        )}
      </div>
    </article>
  );
}
