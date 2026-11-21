import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import type { CertificateRecord, Registration } from '../types';

export function AdminCertificatesPage() {
  const { user, authReady, isAdmin, signInWithGoogle, authFetch } =
    useFirebase();

  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [issued, setIssued] = useState<CertificateRecord[]>([]);
  const [selectedRegId, setSelectedRegId] = useState('');
  const [issuing, setIssuing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const loadData = async () => {
    try {
      const res = await authFetch('/api/admin/overview');
      if (!res.ok) throw new Error('Unable to load certificate data.');
      const data = (await res.json()) as {
        registrations: Registration[];
        certificates: CertificateRecord[];
      };
      setRegistrations(data.registrations);
      setIssued(data.certificates);
      if (!selectedRegId && data.registrations.length > 0) {
        setSelectedRegId(String(data.registrations[0].id));
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to load certificates.'
      );
    }
  };

  useEffect(() => {
    if (!authReady || !isAdmin) return;
    void loadData();
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

  const handleIssue = async (e: FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);
    setIssuing(true);

    try {
      const res = await authFetch('/api/admin/certificates', {
        method: 'POST',
        body: JSON.stringify({
          registrationId: Number.parseInt(selectedRegId, 10)
        })
      });
      const data = (await res.json()) as {
        error?: string;
        certificate?: CertificateRecord;
      };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not issue certificate.');
        return;
      }

      setSuccessMsg(
        `Issued certificate ${data.certificate?.certificateCode || ''}.`
      );
      await loadData();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to issue certificate.'
      );
    } finally {
      setIssuing(false);
    }
  };

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Administration</span>
            <h1>Certificates</h1>
          </div>
          <Link className="btn tertiary" to="/admin">
            Dashboard
          </Link>
        </div>

        <div className="split">
          <div className="form-card">
            <h2>Issue certificate</h2>
            {errorMsg && <div className="alert error">{errorMsg}</div>}
            {successMsg && <div className="alert success">{successMsg}</div>}
            <form onSubmit={(e) => void handleIssue(e)}>
              <label>
                Participant &amp; Workshop Registration
                <select
                  value={selectedRegId}
                  onChange={(e) => setSelectedRegId(e.target.value)}
                  required
                >
                  {registrations.map((r) => (
                    <option key={r.id} value={String(r.id)}>
                      {r.participantName} — {r.workshopName}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="submit"
                className="btn primary full"
                disabled={issuing || registrations.length === 0}
              >
                {issuing ? 'Issuing...' : 'Issue certificate'}
              </button>
            </form>
          </div>

          <div className="panel">
            <h2>Issued certificates</h2>
            {issued.length > 0 ? (
              issued.map((c) => (
                <div key={c.id} className="feedback">
                  <strong>{c.participantName}</strong>
                  <p>
                    {c.workshopName}
                    <br />
                    <Link
                      className="text-link"
                      to={`/certificate/${c.certificateCode}`}
                    >
                      {c.certificateCode}
                    </Link>
                  </p>
                </div>
              ))
            ) : (
              <p className="muted">No certificates issued.</p>
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
