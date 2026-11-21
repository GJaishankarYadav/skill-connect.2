import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import type {
  AttendanceRecord,
  AttendanceStatus,
  Registration,
  SessionRecord
} from '../types';

export function AdminAttendancePage() {
  const { user, authReady, isAdmin, signInWithGoogle, authFetch } =
    useFirebase();

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number>(0);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [draftStatus, setDraftStatus] = useState<
    Record<number, AttendanceStatus>
  >({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await authFetch('/api/admin/overview');
      if (!res.ok) throw new Error('Unable to load attendance tracker.');
      const data = (await res.json()) as {
        sessions: SessionRecord[];
        registrations: Registration[];
        attendance: AttendanceRecord[];
      };
      setSessions(data.sessions);
      setRegistrations(data.registrations);
      setAttendance(data.attendance);
      if (!selectedSessionId && data.sessions.length > 0) {
        setSelectedSessionId(data.sessions[0].id);
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to load attendance.'
      );
    }
  };

  useEffect(() => {
    if (!authReady || !isAdmin) return;
    void loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, isAdmin]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const sessionRegistrations = useMemo(() => {
    if (!activeSession) return [];
    return registrations
      .filter((r) => r.workshopId === activeSession.workshopId)
      .sort((a, b) =>
        (a.participantName || '').localeCompare(b.participantName || '')
      );
  }, [activeSession, registrations]);

  useEffect(() => {
    if (!activeSession) return;
    const nextDraft: Record<number, AttendanceStatus> = {};
    for (const reg of sessionRegistrations) {
      const existing = attendance.find(
        (a) => a.sessionId === activeSession.id && a.registrationId === reg.id
      );
      if (existing) {
        nextDraft[reg.id] = existing.status;
      }
    }
    setDraftStatus(nextDraft);
  }, [activeSession, sessionRegistrations, attendance]);

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

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;

    setSavedMsg(null);
    setErrorMsg(null);
    setSaving(true);
    try {
      const entries = Object.entries(draftStatus).map(
        ([registrationId, status]) => ({
          registrationId: Number(registrationId),
          status
        })
      );
      const res = await authFetch('/api/admin/attendance', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: activeSession.id,
          entries
        })
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setErrorMsg(data.error || 'Could not save attendance.');
        return;
      }
      setSavedMsg('Attendance saved.');
      await loadData();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save attendance.'
      );
    } finally {
      setSaving(false);
    }
  };

  const qrUrl = activeSession
    ? `${window.location.origin}/qr/${activeSession.qrToken}`
    : '';

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <h1>Attendance tracker</h1>
          <Link className="btn tertiary" to="/admin">
            Dashboard
          </Link>
        </div>

        <div className="filters">
          <select
            value={selectedSessionId}
            onChange={(e) => {
              setSavedMsg(null);
              setSelectedSessionId(Number(e.target.value));
            }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.workshopName} — {s.sessionDate}
              </option>
            ))}
          </select>
        </div>

        {activeSession ? (
          <div className="admin-grid">
            <form className="panel" onSubmit={(e) => void handleSave(e)}>
              <h2>{activeSession.workshopName}</h2>
              {savedMsg && <div className="alert success">{savedMsg}</div>}
              {errorMsg && <div className="alert error">{errorMsg}</div>}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th className="radio-cell">Present</th>
                      <th className="radio-cell">Absent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionRegistrations.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.participantName}</strong>
                          <small>{r.email || r.userUid}</small>
                        </td>
                        <td className="radio-cell">
                          <input
                            type="radio"
                            name={`status_${r.id}`}
                            checked={draftStatus[r.id] === 'present'}
                            onChange={() =>
                              setDraftStatus((prev) => ({
                                ...prev,
                                [r.id]: 'present'
                              }))
                            }
                          />
                        </td>
                        <td className="radio-cell">
                          <input
                            type="radio"
                            name={`status_${r.id}`}
                            checked={draftStatus[r.id] === 'absent'}
                            onChange={() =>
                              setDraftStatus((prev) => ({
                                ...prev,
                                [r.id]: 'absent'
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {sessionRegistrations.length === 0 && (
                      <tr>
                        <td colSpan={3} className="muted">
                          No registered participants for this workshop yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button
                type="submit"
                className="btn primary full"
                disabled={saving || sessionRegistrations.length === 0}
              >
                {saving ? 'Saving...' : 'Save attendance'}
              </button>
            </form>

            <div className="panel qr-panel">
              <h2>Session QR</h2>
              <img
                alt="Session QR code"
                src={`https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(
                  qrUrl
                )}`}
              />
              <p className="muted">
                Participants scan this code and verify with their Google
                account.
              </p>
              <Link className="text-link" to={`/qr/${activeSession.qrToken}`}>
                Open QR Check-in Link →
              </Link>
            </div>
          </div>
        ) : (
          <div className="empty">No workshop sessions.</div>
        )}
      </div>
    </section>
  );
}
