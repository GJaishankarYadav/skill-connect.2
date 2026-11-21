import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { WorkshopCard } from '../components/WorkshopCard';
import type { Workshop } from '../types';

export function HomePage() {
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch('/api/workshops')
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load workshops right now.');
        return res.json() as Promise<{ workshops: Workshop[] }>;
      })
      .then((data) => {
        if (active) {
          setWorkshops(data.workshops);
          setError(null);
        }
      })
      .catch((err) => {
        if (active) {
          setError(
            err instanceof Error ? err.message : 'Unable to load workshops.'
          );
        }
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const openWorkshops = workshops.filter((w) => w.status === 'open').slice(0, 4);
  const totalRegistrations = workshops.reduce(
    (sum, w) => sum + (w.registeredCount || 0),
    0
  );
  const totalCapacity = workshops.reduce((sum, w) => sum + (w.capacity || 0), 0);

  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div className="hero-copy">
            <span className="eyebrow">Community-powered learning</span>
            <h1>
              Learn New Skills. <em>Build a Better Future.</em>
            </h1>
            <p>
              Join practical workshops that help you grow confidence, find
              opportunity and support your community.
            </p>
            <div className="hero-actions">
              <Link className="btn primary" to="/register">
                Register Now
              </Link>
              <Link className="btn tertiary" to="/workshops">
                Explore Workshops
              </Link>
            </div>
          </div>
          <div className="hero-panel">
            <span>Next community cohort</span>
            <h2>Skills for every stage of life</h2>
            <div className="hero-stats">
              <div>
                <strong>{workshops.length}</strong>
                <small>Workshops</small>
              </div>
              <div>
                <strong>{totalCapacity}</strong>
                <small>Total Seats</small>
              </div>
              <div>
                <strong>{totalRegistrations}</strong>
                <small>Registrations</small>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="container">
          <div className="section-heading">
            <div>
              <span className="eyebrow">Learn with us</span>
              <h2>Featured workshops</h2>
            </div>
            <Link to="/workshops">View all workshops →</Link>
          </div>

          {error && <div className="alert error">{error}</div>}

          {loading ? (
            <div className="empty">Loading workshops...</div>
          ) : openWorkshops.length > 0 ? (
            <div className="workshop-grid">
              {openWorkshops.map((w) => (
                <WorkshopCard key={w.id} workshop={w} />
              ))}
            </div>
          ) : (
            <div className="empty">No workshops available yet.</div>
          )}
        </div>
      </section>
    </>
  );
}
