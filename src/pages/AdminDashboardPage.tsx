import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import type {
  AdminAnalyticsSummary,
  AttendanceRecord,
  Registration,
  Workshop
} from '../types';

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
  const [analytics, setAnalytics] = useState<AdminAnalyticsSummary | null>(
    null
  );
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
          analytics?: AdminAnalyticsSummary;
        }>;
      })
      .then((data) => {
        setWorkshops(data.workshops);
        setRegistrations(data.registrations);
        setAttendance(data.attendance);
        if (data.analytics) setAnalytics(data.analytics);
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

  const confirmedRegs = registrations.filter((r) => r.status === 'confirmed');
  const uniqueParticipants =
    analytics?.totalParticipants ??
    new Set(confirmedRegs.map((r) => r.userUid)).size;
  const totalWorkshops = analytics?.totalWorkshops ?? workshops.length;
  const totalRegistrations =
    analytics?.totalRegistrations ?? confirmedRegs.length;
  const present =
    analytics?.presentCount ??
    attendance.filter((a) => a.status === 'present').length;
  const absent =
    analytics?.absentCount ??
    attendance.filter((a) => a.status === 'absent').length;
  const totalMarked = present + absent;
  const attendancePct =
    analytics?.attendanceRate ??
    (totalMarked ? Math.round((present / totalMarked) * 100) : 0);
  const totalCertificates = analytics?.totalCertificates ?? 0;
  const totalWaitlisted = analytics?.totalWaitlisted ?? 0;

  const popularWorkshops = analytics?.popularWorkshops ?? [];
  const categoryStats = analytics?.categoryStats ?? [];
  const recent = confirmedRegs.slice(0, 8);

  const maxDemand = Math.max(
    1,
    ...popularWorkshops.map((w) =>
      Math.max(w.capacity, w.registeredCount + w.waitlistCount)
    )
  );
  const maxCategoryRegs = Math.max(
    1,
    ...categoryStats.map((c) => c.registrations)
  );

  return (
    <section className="section dashboard">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">
              Analytics &amp; Operations {isOwner ? '· Platform Owner' : ''}
            </span>
            <h1>Welcome, {user.displayName || 'Administrator'}</h1>
          </div>
          <div className="hero-actions" style={{ marginTop: 0 }}>
            {isOwner && (
              <Link className="btn tertiary" to="/admin/admins">
                Admin Access Control
              </Link>
            )}
            <Link className="btn tertiary" to="/attendance">
              QR Scanner
            </Link>
            <Link className="btn tertiary" to="/admin/institutions">
              Training Institutions
            </Link>
            <Link className="btn primary" to="/admin/workshops">
              Manage workshops
            </Link>
          </div>
        </div>

        {errorMsg && <div className="alert error">{errorMsg}</div>}

        <div className="metric-grid metric-grid-6">
          <div className="metric">
            <span>Participants</span>
            <strong className="tabular-nums">{uniqueParticipants}</strong>
          </div>
          <div className="metric">
            <span>Workshops</span>
            <strong className="tabular-nums">{totalWorkshops}</strong>
          </div>
          <div className="metric">
            <span>Registrations</span>
            <strong className="tabular-nums">{totalRegistrations}</strong>
          </div>
          <div className="metric">
            <span>Waitlisted</span>
            <strong className="tabular-nums">{totalWaitlisted}</strong>
          </div>
          <div className="metric">
            <span>Certificates</span>
            <strong className="tabular-nums">{totalCertificates}</strong>
          </div>
          <div className="metric accent">
            <span>Attendance Rate</span>
            <strong className="tabular-nums">{attendancePct}%</strong>
          </div>
        </div>

        {/* Visual Analytics Charts */}
        <div className="analytics-grid">
          <div className="panel">
            <div className="chart-header">
              <div>
                <h2 style={{ margin: 0 }}>Popular Workshops &amp; Capacity</h2>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  Confirmed registrations, waitlist demand, and total seat capacity
                </p>
              </div>
              <div className="chart-legend">
                <span>
                  <i className="swatch swatch-primary" /> Registered
                </span>
                <span>
                  <i className="swatch swatch-secondary" /> Waitlist
                </span>
              </div>
            </div>

            {popularWorkshops.length > 0 ? (
              <svg
                viewBox={`0 0 560 ${Math.max(160, popularWorkshops.slice(0, 6).length * 48 + 16)}`}
                className="analytics-svg"
                role="img"
                aria-label="Popular workshops bar chart"
              >
                {popularWorkshops.slice(0, 6).map((w, idx) => {
                  const y = idx * 48 + 12;
                  const trackW = 310;
                  const capWidth = (w.capacity / maxDemand) * trackW;
                  const regWidth = (w.registeredCount / maxDemand) * trackW;
                  const waitWidth = (w.waitlistCount / maxDemand) * trackW;
                  const shortName =
                    w.name.length > 22 ? `${w.name.slice(0, 21)}…` : w.name;
                  return (
                    <g key={w.id} transform={`translate(0, ${y})`}>
                      <text
                        x="0"
                        y="16"
                        fontSize="12"
                        fontWeight="600"
                        fill="#0f172a"
                      >
                        {shortName}
                      </text>
                      <text
                        x="0"
                        y="31"
                        fontSize="10"
                        fill="#64748b"
                      >
                        {w.category}
                      </text>
                      <rect
                        x="175"
                        y="6"
                        width={Math.max(4, capWidth)}
                        height="20"
                        rx="5"
                        fill="#e2e8f0"
                      />
                      <rect
                        x="175"
                        y="6"
                        width={Math.max(0, regWidth)}
                        height="20"
                        rx="5"
                        fill="#0f382a"
                      />
                      {waitWidth > 0 && (
                        <rect
                          x={175 + regWidth}
                          y="6"
                          width={waitWidth}
                          height="20"
                          rx="4"
                          fill="#10b981"
                        />
                      )}
                      <text
                        x="495"
                        y="20"
                        fontSize="11"
                        fontWeight="700"
                        fill="#0f172a"
                      >
                        {w.registeredCount}/{w.capacity}
                        {w.waitlistCount > 0 ? ` (+${w.waitlistCount})` : ''}
                      </text>
                    </g>
                  );
                })}
              </svg>
            ) : (
              <p className="muted">No workshop data available yet.</p>
            )}
          </div>

          <div className="panel">
            <div className="chart-header">
              <div>
                <h2 style={{ margin: 0 }}>Completion &amp; Category Breakdown</h2>
                <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                  Attendance verification ({present} present · {absent} absent) &amp;
                  category enrollments
                </p>
              </div>
            </div>

            {popularWorkshops.length > 0 ? (
              <div className="completion-chart-list">
                {popularWorkshops.slice(0, 5).map((w) => (
                  <div key={w.id} className="completion-row">
                    <div className="completion-row-head">
                      <strong>{w.name}</strong>
                      <span className="tabular-nums">
                        {w.certifiedCount}/{w.registeredCount} certified ({w.completionRate}%)
                      </span>
                    </div>
                    <div className="progress-track">
                      <div
                        className="progress-fill"
                        style={{ width: `${w.completionRate}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="muted">No completion data available yet.</p>
            )}

            {categoryStats.length > 0 && (
              <div className="category-breakdown">
                <h3>Enrollments by Category</h3>
                <div className="category-bars">
                  {categoryStats.map((c) => {
                    const pct = Math.round(
                      (c.registrations / maxCategoryRegs) * 100
                    );
                    return (
                      <div key={c.category} className="category-bar-item">
                        <div className="completion-row-head">
                          <span>{c.category}</span>
                          <span className="tabular-nums">
                            {c.registrations} reg · {c.certified} cert
                          </span>
                        </div>
                        <div className="progress-track">
                          <div
                            className="progress-fill emerald"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Workshop Performance & Completion Statistics Table */}
        <div className="panel" style={{ marginBottom: 20 }}>
          <h2>Workshop Performance &amp; Completion Statistics</h2>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Workshop</th>
                  <th>Registered / Cap</th>
                  <th>Waitlist</th>
                  <th>Present / Absent</th>
                  <th>Certificates</th>
                  <th>Completion</th>
                </tr>
              </thead>
              <tbody>
                {popularWorkshops.length > 0 ? (
                  popularWorkshops.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <strong>{w.name}</strong>
                        <small>
                          {w.category} · {w.workshopDate}
                        </small>
                      </td>
                      <td className="tabular-nums">
                        {w.registeredCount}/{w.capacity} ({w.fillRate}%)
                      </td>
                      <td className="tabular-nums">{w.waitlistCount}</td>
                      <td className="tabular-nums">
                        {w.presentCount} / {w.absentCount}
                      </td>
                      <td className="tabular-nums">{w.certifiedCount}</td>
                      <td className="tabular-nums">
                        <strong>{w.completionRate}%</strong>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={6} className="muted">
                      No workshop statistics available yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
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
                        <td className="tabular-nums">
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
              <Link to="/admin/workshops">＋ Manage workshops &amp; waitlist</Link>
              <Link to="/admin/institutions">⌖ Manage training institutions</Link>
              <Link to="/attendance">✓ QR scanner &amp; attendance</Link>
              <Link to="/admin/reports">⇩ Download reports</Link>
              <Link to="/feedback">☆ View feedback</Link>
              <Link to="/admin/certificates">▣ Certificates</Link>
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
