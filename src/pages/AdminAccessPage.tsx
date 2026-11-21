import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import { ADMIN_EMAIL } from '../firebase';

interface OwnerInfo {
  email: string;
  fullName: string;
  hasSignedIn: boolean;
  isOwner: boolean;
}

interface DelegatedAdmin {
  id: number;
  email: string;
  invitedByEmail: string;
  createdAt: string;
  hasSignedIn: boolean;
  fullName: string | null;
}

interface AdminRequestItem {
  id: number;
  email: string;
  fullName: string | null;
  reason: string;
  status: 'pending' | 'approved' | 'rejected' | string;
  reviewedByEmail: string | null;
  createdAt: string;
  updatedAt: string;
}

export function AdminAccessPage() {
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

  const [ownerInfo, setOwnerInfo] = useState<OwnerInfo | null>(null);
  const [admins, setAdmins] = useState<DelegatedAdmin[]>([]);
  const [requests, setRequests] = useState<AdminRequestItem[]>([]);
  const [newEmail, setNewEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [busyEmail, setBusyEmail] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const loadAdmins = async () => {
    try {
      const res = await authFetch('/api/owner/admins');
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error || 'Unable to load administrators.');
      }
      const data = (await res.json()) as {
        owner: OwnerInfo;
        admins: DelegatedAdmin[];
        requests: AdminRequestItem[];
      };
      setOwnerInfo(data.owner);
      setAdmins(data.admins);
      setRequests(data.requests || []);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to load administrators.'
      );
    }
  };

  useEffect(() => {
    if (!authReady || !isOwner) return;
    void loadAdmins();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authReady, isOwner]);

  if (!authReady) {
    return (
      <section className="section">
        <div className="container">
          <div className="empty">Loading...</div>
        </div>
      </section>
    );
  }

  if (!user) {
    return (
      <section className="auth-wrap">
        <div className="auth-card">
          <h1>Owner Authentication Required</h1>
          <p className="muted">
            Sign in with the owner account ({ADMIN_EMAIL}) to review admin
            requests and manage administrator permissions.
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

  if (!isOwner) {
    return (
      <section className="section">
        <div className="container narrow">
          <div className="form-card">
            <span className="eyebrow">Restricted Authority</span>
            <h1>Owner Permission Required</h1>
            <p className="muted">
              Only the platform owner ({ADMIN_EMAIL}) can approve, grant, or
              revoke administrator login access. Without owner permission, no
              one can join as an administrator.
            </p>
            <Link
              className="btn primary"
              to={isAdmin ? '/admin' : '/workshops'}
            >
              {isAdmin ? 'Return to Dashboard' : 'Browse Workshops'}
            </Link>
          </div>
        </div>
      </section>
    );
  }

  const handleGrant = async (e: FormEvent) => {
    e.preventDefault();
    setMessage(null);
    setErrorMsg(null);
    setSubmitting(true);

    try {
      const res = await authFetch('/api/owner/admins', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail.trim().toLowerCase() })
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not authorize administrator.');
        return;
      }

      setMessage(
        `Granted administrator access to ${newEmail.trim().toLowerCase()}.`
      );
      setNewEmail('');
      await loadAdmins();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to grant admin access.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleApproveRequest = async (email: string) => {
    setMessage(null);
    setErrorMsg(null);
    setBusyEmail(email);

    try {
      const res = await authFetch(
        `/api/owner/admin-requests/${encodeURIComponent(email)}/approve`,
        { method: 'POST' }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not approve request.');
        return;
      }
      setMessage(`Approved administrator access for ${email}.`);
      await loadAdmins();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to approve request.'
      );
    } finally {
      setBusyEmail(null);
    }
  };

  const handleRejectRequest = async (email: string) => {
    setMessage(null);
    setErrorMsg(null);
    setBusyEmail(email);

    try {
      const res = await authFetch(
        `/api/owner/admin-requests/${encodeURIComponent(email)}/reject`,
        { method: 'POST' }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not decline request.');
        return;
      }
      setMessage(`Declined administrator request from ${email}.`);
      await loadAdmins();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to decline request.'
      );
    } finally {
      setBusyEmail(null);
    }
  };

  const handleRevoke = async (email: string) => {
    setMessage(null);
    setErrorMsg(null);
    setBusyEmail(email);

    try {
      const res = await authFetch(
        `/api/owner/admins/${encodeURIComponent(email)}`,
        { method: 'DELETE' }
      );
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not revoke administrator.');
        return;
      }
      setMessage(`Revoked administrator access for ${email}.`);
      await loadAdmins();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to revoke admin access.'
      );
    } finally {
      setBusyEmail(null);
    }
  };

  const pendingRequests = requests.filter((r) => r.status === 'pending');

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Owner Controls · {ADMIN_EMAIL}</span>
            <h1>Administrator Access Control</h1>
          </div>
          <Link className="btn tertiary" to="/admin">
            Dashboard
          </Link>
        </div>

        {message && <div className="alert success">{message}</div>}
        {errorMsg && <div className="alert error">{errorMsg}</div>}

        <div className="panel" style={{ marginBottom: 20 }}>
          <h2>
            Admin Join Requests ({pendingRequests.length} Pending)
          </h2>
          <p className="muted">
            Emails requesting to join as administrator appear here. Without your
            approval, no one can access Administrator Login.
          </p>
          <div className="table-wrap" style={{ marginTop: 12 }}>
            <table>
              <thead>
                <tr>
                  <th>Applicant</th>
                  <th>Note</th>
                  <th>Status</th>
                  <th>Decision</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((reqItem) => (
                  <tr key={reqItem.id}>
                    <td>
                      <strong>{reqItem.email}</strong>
                      <small>{reqItem.fullName || 'Google Account'}</small>
                    </td>
                    <td>{reqItem.reason || '—'}</td>
                    <td>
                      <span className="role-badge">
                        {reqItem.status === 'pending'
                          ? 'Pending'
                          : reqItem.status === 'approved'
                            ? 'Approved'
                            : 'Declined'}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                        {reqItem.status !== 'approved' && (
                          <button
                            type="button"
                            className="btn primary"
                            disabled={busyEmail === reqItem.email}
                            onClick={() =>
                              void handleApproveRequest(reqItem.email)
                            }
                          >
                            Approve
                          </button>
                        )}
                        {reqItem.status !== 'rejected' && (
                          <button
                            type="button"
                            className="btn danger"
                            disabled={busyEmail === reqItem.email}
                            onClick={() =>
                              void handleRejectRequest(reqItem.email)
                            }
                          >
                            {reqItem.status === 'approved'
                              ? 'Revoke'
                              : 'Decline'}
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
                {requests.length === 0 && (
                  <tr>
                    <td colSpan={4} className="muted">
                      No admin access requests yet. Any user who attempts Admin
                      Login can submit a request here for your approval.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="admin-grid">
          <div className="panel">
            <h2>Grant Admin Permission Directly</h2>
            <p className="muted">
              Pre-authorize any Google email address so they can sign in through
              Admin Login immediately.
            </p>
            <form onSubmit={(e) => void handleGrant(e)}>
              <label>
                Google Email Address
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="colleague@gmail.com"
                  required
                />
              </label>
              <button
                type="submit"
                className="btn primary full"
                disabled={submitting}
              >
                {submitting ? 'Authorizing...' : 'Authorize as Admin'}
              </button>
            </form>
          </div>

          <div className="panel">
            <h2>Authorized Accounts</h2>
            {ownerInfo && (
              <div className="feedback">
                <strong>{ownerInfo.fullName}</strong>
                <span className="role-badge owner">Owner</span>
                <p>
                  {ownerInfo.email}
                  <br />
                  <small>Primary authority — cannot be revoked</small>
                </p>
              </div>
            )}

            <div className="table-wrap" style={{ marginTop: 12 }}>
              <table>
                <thead>
                  <tr>
                    <th>Administrator</th>
                    <th>Status</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {admins.map((a) => (
                    <tr key={a.id}>
                      <td>
                        <strong>{a.email}</strong>
                        <small>{a.fullName || 'Approved by owner'}</small>
                      </td>
                      <td>
                        <span className="role-badge">
                          {a.hasSignedIn ? 'Active' : 'Pending Sign-In'}
                        </span>
                      </td>
                      <td>
                        <button
                          type="button"
                          className="btn danger"
                          disabled={busyEmail === a.email}
                          onClick={() => void handleRevoke(a.email)}
                        >
                          Revoke
                        </button>
                      </td>
                    </tr>
                  ))}
                  {admins.length === 0 && (
                    <tr>
                      <td colSpan={3} className="muted">
                        No delegated administrators yet. Only {ADMIN_EMAIL} has
                        admin access.
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
