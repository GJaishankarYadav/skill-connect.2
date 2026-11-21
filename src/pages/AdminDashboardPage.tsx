import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import type { AttendanceRecord, Registration, Workshop } from '../types';

export function AdminDashboardPage() {
  const {
    user,
    authReady,
    signingIn,
    isAdmin,
    isOwner,
    authError,
    signInWithGoogle,
    authFetch
  } = useFirebase();

  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !isAdmin) return;

    authFetch('/api/admin/overview')
      .then(async (res) => {
        if (!res.ok) throw new Error('Failed to load dashboard.');
        return res.json() as Promise<{
          workshops: Workshop[];
          registrations: Registration[];
          attendance: AttendanceRecord[];
        }>;
      })
      .then((data) => {
        setWorkshops(data.workshops);
        setRegistrations(data.registrations);
        setAttendance(data.attendance);
      })
      .catch((err) => {
        setErrorMsg(
          err instanceof Error ? err.message : 'Unable to load dashboard.'
        );
      });
  }, [authReady, isAdmin, authFetch]);

  if (!authReady) {
    return (
      <section className="section">
        <div className="container">
          <div className="empty">Loading dashboard...</div>
        </div>
      </section>
    );
  }

  if (!user || !isAdmin) {
    return (
      <section className="auth-wrap">
        <div className="auth-card">
          <h1>Administrator access required</h1>
          <p className="muted">
            Sign in with an authorized SkillConnect administrator Google account.
          </p>
          {authError && <div className="alert error">{authError}</div>}
          <button
            type="button"
            className="btn primary full"
            disabled={signingIn}
            onClick={() => void signInWithGoogle()}
          >
            {signingIn ? 'Signing in...' : 'Sign in with Google'}
          </button>
        </div>
      </section>
    );
  }

  const uniqueParticipants = new Set(registrations.map((r) => r.userUid)).size;
  const present = attendance.filter((a) => a.status === 'present').length;
  const absent = attendance.filter((a) => a.status === 'absent').length;
  const totalMarked = present + absent;
  const recent = registrations.slice(0, 8);

  return (
    <section className="section dashboard">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              Administration {isOwner ? '· Platform Owner' : ''}
            </span>
            <h1>Welcome, {user.displayName || 'Administrator'}</h1>
          </div>
          <div className="hero-actions" style={{ marginTop: 0 }}>
            {isOwner && (
              <Link className="btn tertiary" to="/admin/admins">
                Admin Access Control
              </Link>
            )}
            <Link className="btn primary" to="/admin/workshops">
              Manage workshops
            </Link>
          </div>
        </div>

        {errorMsg && <div className="alert error">{errorMsg}</div>}

        <div className="metric-grid">
          <div className="metric">
            <span>Participants</span>
            <strong>{uniqueParticipants}</strong>
          </div>
          <div className="metric">
            <span>Workshops</span>
            <strong>{workshops.length}</strong>
          </div>
          <div className="metric">
            <span>Registrations</span>
            <strong>{registrations.length}</strong>
          </div>
          <div className="metric">
            <span>Present</span>
            <strong>{present}</strong>
          </div>
          <div className="metric">
            <span>Absent</span>
            <strong>{absent}</strong>
          </div>
          <div className="metric accent">
            <span>Attendance</span>
            <strong>
              {totalMarked ? Math.round((present / totalMarked) * 100) : 0}%
            </strong>
          </div>
        </div>

        <div className="admin-grid">
          <div className="panel">
            <h2>Recent registrations</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Participant</th>
                    <th>Workshop</th>
                    <th>Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.length > 0 ? (
                    recent.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.participantName}</strong>
                          <small>{r.email || r.userUid}</small>
                        </td>
                        <td>{r.workshopName}</td>
                        <td>
                          {new Date(r.registeredAt).toLocaleDateString()}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={3} className="muted">
                        No registrations yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="panel">
            <h2>Quick actions</h2>
            <div className="quick-actions">
              <Link to="/admin/workshops">＋ Add workshop</Link>
              <Link to="/attendance">✓ Mark attendance</Link>
              <Link to="/admin/reports">⇩ Download reports</Link>
              <Link to="/feedback">☆ View feedback</Link>
              <Link to="/admin/certificates">▣ Issue certificates</Link>
              {isOwner && (
                <Link to="/admin/admins">⛨ Manage admin access</Link>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
