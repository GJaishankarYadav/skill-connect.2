import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import {
  BLUEPRINT_LIMITS,
  type Workshop,
  type WorkshopStatus
} from '../types';

export function AdminWorkshopsPage() {
  const { user, authReady, isAdmin, signInWithGoogle, authFetch } =
    useFirebase();

  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [duration, setDuration] = useState('');
  const [workshopDate, setWorkshopDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [capacity, setCapacity] = useState('20');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadWorkshops = async () => {
    try {
      const res = await authFetch('/api/admin/overview');
      if (!res.ok) throw new Error('Unable to load workshops.');
      const data = (await res.json()) as { workshops: Workshop[] };
      setWorkshops(data.workshops);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to load workshops.'
      );
    }
  };

  useEffect(() => {
    if (!authReady || !isAdmin) return;
    void loadWorkshops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, isAdmin]);

  if (!authReady) {
    return (
      <section className="section">
        <div className="container">
          <div className="empty">Loading...</div>
        </div>
      </section>
    );
  }

  if (!user || !isAdmin) {
    return (
      <section className="auth-wrap">
        <div className="auth-card">
          <h1>Administrator access required</h1>
          <button
            type="button"
            className="btn primary full"
            onClick={() => void signInWithGoogle()}
          >
            Sign in with Google
          </button>
        </div>
      </section>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setErrorMsg(null);
    setSaving(true);

    try {
      const res = await authFetch('/api/admin/workshops', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          category: category.trim(),
          duration: duration.trim(),
          workshopDate,
          startTime,
          capacity: Number.parseInt(capacity, 10),
          location: location.trim(),
          description: description.trim()
        })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not save workshop.');
        return;
      }

      setName('');
      setCategory('');
      setDuration('');
      setWorkshopDate('');
      setLocation('');
      setDescription('');
      setMessage('Workshop and session QR token created.');
      await loadWorkshops();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to create workshop.'
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleStatus = async (w: Workshop, nextStatus: WorkshopStatus) => {
    setErrorMsg(null);
    try {
      const res = await authFetch(`/api/admin/workshops/${w.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ status: nextStatus })
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorMsg(data.error || 'Failed to update status.');
        return;
      }
      await loadWorkshops();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to update status.'
      );
    }
  };

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Administration</span>
            <h1>Manage workshops</h1>
          </div>
          <Link className="btn tertiary" to="/admin">
            Dashboard
          </Link>
        </div>

        <div className="admin-grid">
          <div className="panel">
            <h2>Add workshop</h2>
            {message && <div className="alert success">{message}</div>}
            {errorMsg && <div className="alert error">{errorMsg}</div>}
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="form-grid">
                <label>
                  Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    minLength={BLUEPRINT_LIMITS.workshopNameMin}
                    maxLength={BLUEPRINT_LIMITS.workshopNameMax}
                    required
                  />
                </label>
                <label>
                  Category
                  <input
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    minLength={BLUEPRINT_LIMITS.categoryMin}
                    maxLength={BLUEPRINT_LIMITS.categoryMax}
                    required
                  />
                </label>
                <label>
                  Duration
                  <input
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    minLength={BLUEPRINT_LIMITS.durationMin}
                    maxLength={BLUEPRINT_LIMITS.durationMax}
                    placeholder="e.g. 4 Weeks"
                    required
                  />
                </label>
                <label>
                  Date
                  <input
                    type="date"
                    value={workshopDate}
                    onChange={(e) => setWorkshopDate(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Time
                  <input
                    type="time"
                    value={startTime}
                    onChange={(e) => setStartTime(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Capacity
                  <input
                    type="number"
                    min={1}
                    max={5000}
                    value={capacity}
                    onChange={(e) => setCapacity(e.target.value)}
                    required
                  />
                </label>
              </div>
              <label>
                Location
                <input
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                  minLength={BLUEPRINT_LIMITS.locationMin}
                  maxLength={BLUEPRINT_LIMITS.locationMax}
                  required
                />
              </label>
              <label>
                Description
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  minLength={BLUEPRINT_LIMITS.descriptionMin}
                  maxLength={BLUEPRINT_LIMITS.descriptionMax}
                  required
                />
              </label>
              <button
                type="submit"
                className="btn primary full"
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save workshop'}
              </button>
            </form>
          </div>

          <div className="panel">
            <h2>Workshop list</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Workshop</th>
                    <th>Registered</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workshops.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <strong>{w.name}</strong>
                        <small>{w.workshopDate}</small>
                      </td>
                      <td>
                        {w.registeredCount}/{w.capacity}
                      </td>
                      <td>
                        <select
                          aria-label={`Status for ${w.name}`}
                          value={w.status}
                          onChange={(e) =>
                            void toggleStatus(
                              w,
                              e.target.value as WorkshopStatus
                            )
                          }
                        >
                          <option value="open">open</option>
                          <option value="closed">closed</option>
                          <option value="cancelled">cancelled</option>
                        </select>
                      </td>
                    </tr>
                  ))}
                  {workshops.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        No workshops yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
