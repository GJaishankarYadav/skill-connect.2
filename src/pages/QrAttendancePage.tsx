import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';

interface QrSessionInfo {
  sessionId: number;
  workshopId: number;
  workshopName: string;
  sessionDate: string;
  startTime: string;
}

export function QrAttendancePage() {
  const { token = '' } = useParams();
  const { user, authReady, signInWithGoogle, refreshProfile, authFetch } =
    useFirebase();

  const [sessionInfo, setSessionInfo] = useState<QrSessionInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [certificateCode, setCertificateCode] = useState<string | null>(null);
  const [wasDuplicate, setWasDuplicate] = useState(false);
  const [status, setStatus] = useState<
    'idle' | 'submitting' | 'marked' | 'not-registered' | 'invalid'
  >('idle');

  useEffect(() => {
    if (!authReady) return;
    if (!user) {
      setLoading(false);
      return;
    }

    const loadToken = async () => {
      try {
        const res = await authFetch(`/api/qr/${encodeURIComponent(token)}`);
        if (!res.ok) {
          setStatus('invalid');
          return;
        }
        const data = (await res.json()) as { session: QrSessionInfo };
        setSessionInfo(data.session);
      } catch {
        setStatus('invalid');
      } finally {
        setLoading(false);
      }
    };

    void loadToken();
  }, [authReady, user, token, authFetch]);

  const handleVerifyAttendance = async () => {
    if (!user || !sessionInfo) return;
    setStatus('submitting');

    try {
      const res = await authFetch(`/api/qr/${encodeURIComponent(token)}`, {
        method: 'POST'
      });
      const data = (await res.json()) as {
        code?: string;
        certificateCode?: string;
        duplicate?: boolean;
      };
      if (res.status === 403 && data.code === 'not-registered') {
        setStatus('not-registered');
        return;
      }
      if (!res.ok) {
        setStatus('invalid');
        return;
      }
      setCertificateCode(data.certificateCode || null);
      setWasDuplicate(Boolean(data.duplicate));
      setStatus('marked');
      await refreshProfile();
    } catch {
      setStatus('invalid');
    }
  };

  return (
    <section className="section">
      <div className="container narrow">
        <div className="form-card">
          {!authReady || loading ? (
            <p className="muted">Verifying QR session...</p>
          ) : !user ? (
            <>
              <span className="eyebrow">QR Attendance</span>
              <h1>Sign in to mark attendance</h1>
              <p className="muted">
                Please sign in with the Google account you used to register for
                this workshop.
              </p>
              <button
                type="button"
                className="btn primary"
                onClick={() => void signInWithGoogle()}
              >
                Sign in with Google
              </button>
            </>
          ) : status === 'invalid' || !sessionInfo ? (
            <>
              <h1>Invalid QR code</h1>
              <p className="muted">
                This QR attendance link could not be matched to an active
                workshop session.
              </p>
              <Link className="btn primary" to="/workshops">
                Browse Workshops
              </Link>
            </>
          ) : status === 'not-registered' ? (
            <>
              <h1>Not registered</h1>
              <p className="muted">
                No matching workshop registration was found for your account in{' '}
                <strong>{sessionInfo.workshopName}</strong>.
              </p>
              <Link
                className="btn primary"
                to={`/register?workshop=${sessionInfo.workshopId}`}
              >
                Register for Workshop
              </Link>
            </>
          ) : status === 'marked' ? (
            <>
              <span className="eyebrow">
                {wasDuplicate ? 'Already Recorded' : 'Verified'}
              </span>
              <h1>
                {wasDuplicate
                  ? 'Attendance already recorded'
                  : 'Attendance marked'}
              </h1>
              <p>
                {wasDuplicate
                  ? 'Your attendance for '
                  : 'Thank you! Your presence for '}
                <strong>{sessionInfo.workshopName}</strong>{' '}
                {wasDuplicate
                  ? 'was already confirmed earlier (duplicate entry prevented).'
                  : 'was recorded securely.'}
              </p>
              <div className="hero-actions">
                {certificateCode && (
                  <Link
                    className="btn primary"
                    to={`/certificate/${certificateCode}`}
                  >
                    Download Certificate ({certificateCode})
                  </Link>
                )}
                <Link className="btn tertiary" to="/workshops">
                  Back to workshops
                </Link>
              </div>
            </>
          ) : (
            <>
              <span className="eyebrow">QR Attendance</span>
              <h1>Mark your attendance</h1>
              <p>
                <strong>{sessionInfo.workshopName}</strong>
                <br />
                {sessionInfo.sessionDate} · {sessionInfo.startTime}
              </p>
              <button
                type="button"
                className="btn primary full"
                disabled={status === 'submitting'}
                onClick={() => void handleVerifyAttendance()}
              >
                {status === 'submitting'
                  ? 'Verifying...'
                  : 'Verify attendance'}
              </button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
