import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import {
  BLUEPRINT_LIMITS,
  type WaitlistEntry,
  type Workshop,
  type WorkshopStatus
} from '../types';

export function AdminWorkshopsPage() {
  const { user, authReady, isAdmin, signInWithGoogle, authFetch } =
    useFirebase();

  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [capacityDraft, setCapacityDraft] = useState<Record<number, string>>(
    {}
  );
  const [waitlistFilter, setWaitlistFilter] = useState('all');

  const [name, setName] = useState('');
  const [category, setCategory] = useState('');
  const [duration, setDuration] = useState('');
  const [workshopDate, setWorkshopDate] = useState('');
  const [startTime, setStartTime] = useState('09:00');
  const [capacity, setCapacity] = useState('20');
  const [location, setLocation] = useState('');
  const [description, setDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyAction, setBusyAction] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadWorkshops = async () => {
    try {
      const res = await authFetch('/api/admin/overview');
      if (!res.ok) throw new Error('Unable to load workshops.');
      const data = (await res.json()) as {
        workshops: Workshop[];
        waitlist?: WaitlistEntry[];
      };
      setWorkshops(data.workshops);
      setWaitlist(data.waitlist || []);
      const drafts: Record<number, string> = {};
      for (const w of data.workshops) {
        drafts[w.id] = String(w.capacity);
      }
      setCapacityDraft(drafts);
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

  const updateWorkshop = async (
    w: Workshop,
    payload: { status?: WorkshopStatus; capacity?: number }
  ) => {
    setErrorMsg(null);
    setMessage(null);
    setBusyAction(`ws-${w.id}`);
    try {
      const res = await authFetch(`/api/admin/workshops/${w.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload)
      });
      const data = (await res.json()) as {
        error?: string;
        promotedCount?: number;
      };
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to update workshop.');
        return;
      }
      const promoMsg =
        data.promotedCount && data.promotedCount > 0
          ? ` Notified ${data.promotedCount} waitlisted participant(s) of open seat(s).`
          : '';
      setMessage(`Updated ${w.name}.${promoMsg}`);
      await loadWorkshops();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to update workshop.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleNotifyNext = async (w: Workshop) => {
    setErrorMsg(null);
    setMessage(null);
    setBusyAction(`notify-${w.id}`);
    try {
      const res = await authFetch(`/api/admin/workshops/${w.id}/notify-waitlist`, {
        method: 'POST'
      });
      const data = (await res.json()) as {
        error?: string;
        promotedCount?: number;
      };
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to notify waitlist.');
        return;
      }
      if (!data.promotedCount) {
        setErrorMsg('No open seats or waiting participants to notify right now.');
      } else {
        setMessage(
          `Notified ${data.promotedCount} waitlisted participant(s) for ${w.name}.`
        );
      }
      await loadWorkshops();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to notify waitlist.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const handleRemoveWaitlist = async (entryId: number) => {
    setErrorMsg(null);
    setMessage(null);
    setBusyAction(`remove-${entryId}`);
    try {
      const res = await authFetch(`/api/admin/waitlist/${entryId}/remove`, {
        method: 'POST'
      });
      const data = (await res.json()) as {
        error?: string;
        promotedCount?: number;
      };
      if (!res.ok) {
        setErrorMsg(data.error || 'Failed to remove waitlist entry.');
        return;
      }
      setMessage(
        data.promotedCount
          ? 'Removed waitlist entry and notified next person in queue.'
          : 'Removed waitlist entry.'
      );
      await loadWorkshops();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to remove waitlist entry.'
      );
    } finally {
      setBusyAction(null);
    }
  };

  const filteredWaitlist = waitlist.filter(
    (entry) =>
      waitlistFilter === 'all' || String(entry.workshopId) === waitlistFilter
  );

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Administration</span>
            <h1>Manage workshops &amp; waiting lists</h1>
          </div>
          <Link className="btn tertiary" to="/admin">
            Dashboard
          </Link>
        </div>

        {message && <div className="alert success">{message}</div>}
        {errorMsg && <div className="alert error">{errorMsg}</div>}

        <div className="admin-grid">
          <div className="panel">
            <h2>Add workshop</h2>
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
            <h2>Workshop list &amp; seats</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Workshop</th>
                    <th>Seats</th>
                    <th>Waitlist</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {workshops.map((w) => {
                    const draftCap = Number.parseInt(
                      capacityDraft[w.id] ?? String(w.capacity),
                      10
                    );
                    const capChanged =
                      !Number.isNaN(draftCap) && draftCap !== w.capacity;
                    const waitCount = w.waitlistCount ?? 0;
                    const hasOpenSeat =
                      w.status === 'open' && w.registeredCount < w.capacity;
                    return (
                      <tr key={w.id}>
                        <td>
                          <strong>{w.name}</strong>
                          <small>{w.workshopDate}</small>
                        </td>
                        <td className="tabular-nums">
                          <div className="inline-capacity">
                            <span>{w.registeredCount}/</span>
                            <input
                              type="number"
                              min={1}
                              max={5000}
                              aria-label={`Capacity for ${w.name}`}
                              value={capacityDraft[w.id] ?? String(w.capacity)}
                              onChange={(e) =>
                                setCapacityDraft((prev) => ({
                                  ...prev,
                                  [w.id]: e.target.value
                                }))
                              }
                            />
                            {capChanged && (
                              <button
                                type="button"
                                className="btn primary"
                                style={{
                                  height: 30,
                                  padding: '0 8px',
                                  fontSize: 11
                                }}
                                disabled={busyAction === `ws-${w.id}`}
                                onClick={() =>
                                  void updateWorkshop(w, { capacity: draftCap })
                                }
                              >
                                Save
                              </button>
                            )}
                          </div>
                        </td>
                        <td className="tabular-nums">
                          <strong>{waitCount}</strong>
                          {waitCount > 0 && hasOpenSeat && (
                            <button
                              type="button"
                              className="btn secondary"
                              style={{
                                height: 28,
                                padding: '0 8px',
                                fontSize: 11,
                                marginTop: 4
                              }}
                              disabled={busyAction === `notify-${w.id}`}
                              onClick={() => void handleNotifyNext(w)}
                            >
                              Notify Next
                            </button>
                          )}
                        </td>
                        <td>
                          <select
                            aria-label={`Status for ${w.name}`}
                            value={w.status}
                            onChange={(e) =>
                              void updateWorkshop(w, {
                                status: e.target.value as WorkshopStatus
                              })
                            }
                          >
                            <option value="open">open</option>
                            <option value="closed">closed</option>
                            <option value="cancelled">cancelled</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                  {workshops.length === 0 && (
                    <tr>
                      <td colSpan={4} className="muted">
                        No workshops yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Waiting List Queue Panel */}
        <div className="panel" style={{ marginTop: 24 }}>
          <div className="section-heading" style={{ marginBottom: 14 }}>
            <div>
              <span className="eyebrow">Queue Management</span>
              <h2 style={{ margin: 0, fontSize: 22 }}>
                Waiting List Participants
              </h2>
            </div>
            <select
              aria-label="Filter waiting list by workshop"
              style={{ width: 'auto', minWidth: 220 }}
              value={waitlistFilter}
              onChange={(e) => setWaitlistFilter(e.target.value)}
            >
              <option value="all">All workshops ({waitlist.length})</option>
              {workshops.map((w) => (
                <option key={w.id} value={String(w.id)}>
                  {w.name}
                </option>
              ))}
            </select>
          </div>

          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Workshop</th>
                  <th>Status</th>
                  <th>Joined</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {filteredWaitlist.length > 0 ? (
                  filteredWaitlist.map((entry) => (
                    <tr key={entry.id}>
                      <td>
                        <strong>{entry.fullName}</strong>
                        <small>
                          {entry.email}
                          {entry.phone ? ` · ${entry.phone}` : ''}
                        </small>
                      </td>
                      <td>{entry.workshopName}</td>
                      <td>
                        <strong>{entry.status}</strong>
                        {entry.notifiedAt && (
                          <small>
                            Notified{' '}
                            {new Date(entry.notifiedAt).toLocaleDateString()}
                          </small>
                        )}
                      </td>
                      <td className="tabular-nums">
                        {new Date(entry.createdAt).toLocaleDateString()}
                      </td>
                      <td>
                        {['waiting', 'notified'].includes(entry.status) ? (
                          <button
                            type="button"
                            className="btn danger"
                            disabled={busyAction === `remove-${entry.id}`}
                            onClick={() => void handleRemoveWaitlist(entry.id)}
                          >
                            Remove
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="muted">
                      No waiting list entries found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}
