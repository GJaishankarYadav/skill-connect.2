import { useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import { ADMIN_EMAIL } from '../firebase';

type LoginLayer = 'user' | 'admin';

interface MyAdminRequest {
  id: number;
  email: string;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  updatedAt: string;
}

export function LoginPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialRole: LoginLayer =
    searchParams.get('role') === 'admin' ? 'admin' : 'user';
  const [layer, setLayer] = useState<LoginLayer>(initialRole);

  const {
    user,
    authReady,
    signingIn,
    isAdmin,
    isOwner,
    authError,
    signInWithGoogle,
    signOutUser,
    authFetch
  } = useFirebase();
  const navigate = useNavigate();

  const [myRequest, setMyRequest] = useState<MyAdminRequest | null>(null);
  const [reason, setReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);
  const [requestNotice, setRequestNotice] = useState<string | null>(null);
  const [requestError, setRequestError] = useState<string | null>(null);

  useEffect(() => {
    setLayer(searchParams.get('role') === 'admin' ? 'admin' : 'user');
  }, [searchParams]);

  useEffect(() => {
    if (!authReady || !user) return;
    if (layer === 'admin' && isAdmin) {
      navigate('/admin');
    }
  }, [authReady, user, layer, isAdmin, navigate]);

  useEffect(() => {
    if (!authReady || !user || isAdmin || layer !== 'admin') {
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await authFetch('/api/admin-request/me');
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { request: MyAdminRequest | null };
        if (!cancelled) {
          setMyRequest(data.request);
        }
      } catch {
        // Ignore silent fetch error on login page
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [authReady, user, isAdmin, layer, authFetch]);

  const switchLayer = (next: LoginLayer) => {
    setLayer(next);
    setSearchParams({ role: next });
  };

  const handleRequestAdmin = async (e: FormEvent) => {
    e.preventDefault();
    setRequestNotice(null);
    setRequestError(null);
    setSubmittingRequest(true);

    try {
      const res = await authFetch('/api/admin-request', {
        method: 'POST',
        body: JSON.stringify({ reason: reason.trim() })
      });
      const data = (await res.json()) as {
        request?: MyAdminRequest;
        error?: string;
      };
      if (!res.ok) {
        setRequestError(data.error || 'Could not submit admin access request.');
        return;
      }
      if (data.request) {
        setMyRequest(data.request);
      }
      setReason('');
      setRequestNotice(
        `Request sent to ${ADMIN_EMAIL}. You cannot access Admin Login until approved.`
      );
    } catch (err) {
      setRequestError(
        err instanceof Error ? err.message : 'Failed to submit request.'
      );
    } finally {
      setSubmittingRequest(false);
    }
  };

  return (
    <section className="auth-wrap">
      <div className="auth-card">
        <div className="brand">
          <span className="brand-mark">SC</span>
          <span>SkillConnect</span>
        </div>
        <h1>
          {layer === 'admin' ? 'Administrator Login' : 'User Login'}
        </h1>
        <p>
          {layer === 'admin'
            ? `Restricted to the platform owner (${ADMIN_EMAIL}) and administrators explicitly approved by the owner.`
            : 'Sign in as a participant to register for workshops, mark QR attendance, and view certificates.'}
        </p>

        <div className="login-tabs" role="tablist" aria-label="Login layer">
          <button
            type="button"
            role="tab"
            aria-selected={layer === 'user'}
            className={`login-tab ${layer === 'user' ? 'active' : ''}`}
            onClick={() => switchLayer('user')}
          >
            User Login
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={layer === 'admin'}
            className={`login-tab ${layer === 'admin' ? 'active' : ''}`}
            onClick={() => switchLayer('admin')}
          >
            Admin Login
          </button>
        </div>

        {authError && <div className="alert error">{authError}</div>}

        {!user ? (
          <button
            type="button"
            className="btn primary full"
            disabled={signingIn}
            onClick={() => void signInWithGoogle()}
          >
            {signingIn
              ? 'Signing in...'
              : layer === 'admin'
                ? 'Sign in with Google (Admin)'
                : 'Sign in with Google (User)'}
          </button>
        ) : layer === 'admin' ? (
          isAdmin ? (
            <div className="alert success">
              Signed in as <strong>{user.email}</strong> (
              {isOwner ? 'Platform Owner' : 'Authorized Admin'}).
              <div className="hero-actions" style={{ marginTop: 12 }}>
                <Link className="btn primary" to="/admin">
                  Open Dashboard
                </Link>
                {isOwner && (
                  <Link className="btn tertiary" to="/admin/admins">
                    Manage Admin Access
                  </Link>
                )}
              </div>
            </div>
          ) : (
            <div>
              <div className="alert error">
                <strong>Access Denied:</strong> Your account ({user.email}) is
                not authorized for Administrator Login. Without permission from{' '}
                <strong>{ADMIN_EMAIL}</strong>, no one can join as an
                administrator.
              </div>

              {requestNotice && (
                <div className="alert success">{requestNotice}</div>
              )}
              {requestError && (
                <div className="alert error">{requestError}</div>
              )}

              {myRequest?.status === 'pending' ? (
                <div className="feedback" style={{ marginTop: 12 }}>
                  <strong>Request Pending Approval</strong>
                  <span className="role-badge">Pending</span>
                  <p>
                    Your admin access request for <strong>{user.email}</strong>{' '}
                    is waiting for approval from {ADMIN_EMAIL}.
                    {myRequest.reason ? (
                      <>
                        <br />
                        <small>Note: {myRequest.reason}</small>
                      </>
                    ) : null}
                  </p>
                </div>
              ) : (
                <form
                  onSubmit={(e) => void handleRequestAdmin(e)}
                  style={{ marginTop: 12 }}
                >
                  {myRequest?.status === 'rejected' && (
                    <div className="alert error">
                      Your previous admin request was declined by {ADMIN_EMAIL}.
                    </div>
                  )}
                  <label>
                    Request Admin Access from {ADMIN_EMAIL}
                    <input
                      type="text"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Optional note (e.g. Workshop coordinator)"
                      maxLength={300}
                    />
                  </label>
                  <button
                    type="submit"
                    className="btn primary full"
                    disabled={submittingRequest}
                  >
                    {submittingRequest
                      ? 'Sending Request...'
                      : 'Request Admin Permission'}
                  </button>
                </form>
              )}

              <div className="hero-actions" style={{ marginTop: 12 }}>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => switchLayer('user')}
                >
                  Use User Portal
                </button>
                <button
                  type="button"
                  className="btn tertiary"
                  onClick={() => void signOutUser()}
                >
                  Switch Account
                </button>
              </div>
            </div>
          )
        ) : (
          <div className="alert success">
            Signed in as <strong>{user.email}</strong> (Participant).
            <div className="hero-actions" style={{ marginTop: 12 }}>
              <Link className="btn primary" to="/register">
                Workshop Registration
              </Link>
              <Link className="btn tertiary" to="/workshops">
                Browse Workshops
              </Link>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
