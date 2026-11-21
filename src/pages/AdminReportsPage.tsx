import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import type { Registration } from '../types';

export function AdminReportsPage() {
  const { user, authReady, isAdmin, signInWithGoogle, authFetch } =
    useFirebase();
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!authReady || !isAdmin) return;

    authFetch('/api/admin/overview')
      .then(async (res) => {
        if (!res.ok) throw new Error('Unable to load reports.');
        return res.json() as Promise<{ registrations: Registration[] }>;
      })
      .then((data) => setRegistrations(data.registrations))
      .catch((err) => {
        setErrorMsg(
          err instanceof Error ? err.message : 'Unable to load reports.'
        );
      });
  }, [authReady, isAdmin, authFetch]);

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

  const exportCsv = () => {
    const headers = ['Participant', 'Email', 'Workshop', 'Status', 'Registered'];
    const lines = [
      headers.join(','),
      ...registrations.map((r) =>
        [
          r.participantName || '',
          r.email || '',
          r.workshopName,
          r.status,
          new Date(r.registeredAt).toISOString()
        ]
          .map((v) => `"${String(v).replace(/"/g, '""')}"`)
          .join(',')
      )
    ];

    const blob = new Blob([lines.join('\n')], {
      type: 'text/csv;charset=utf-8;'
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'skillconnect-report.csv';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <h1>Reports</h1>
          <div className="hero-actions no-print" style={{ marginTop: 0 }}>
            <Link className="btn tertiary" to="/admin">
              Dashboard
            </Link>
            <button
              type="button"
              className="btn tertiary"
              onClick={() => window.print()}
            >
              Print / PDF
            </button>
            <button type="button" className="btn primary" onClick={exportCsv}>
              Export CSV
            </button>
          </div>
        </div>

        {errorMsg && <div className="alert error">{errorMsg}</div>}

        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                <th>Participant</th>
                <th>Email</th>
                <th>Workshop</th>
                <th>Registered</th>
              </tr>
            </thead>
            <tbody>
              {registrations.map((r) => (
                <tr key={r.id}>
                  <td>{r.participantName}</td>
                  <td>{r.email || '—'}</td>
                  <td>{r.workshopName}</td>
                  <td>{new Date(r.registeredAt).toLocaleString()}</td>
                </tr>
              ))}
              {registrations.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    No registrations found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
