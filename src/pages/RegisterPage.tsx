import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { QrCodeImage } from '../components/QrCodeImage';
import { useFirebase } from '../context/FirebaseContext';
import {
  BLUEPRINT_LIMITS,
  type GenderOption,
  type Registration,
  type Workshop
} from '../types';
import { downloadCertificatePdf } from '../utils/certificatePdf';

export function RegisterPage() {
  const {
    user,
    authReady,
    profile,
    myRegistrations,
    myCertificates,
    myWaitlist,
    myNotifications,
    signInWithGoogle,
    refreshProfile,
    markNotificationRead,
    authFetch
  } = useFirebase();
  const [searchParams] = useSearchParams();
  const initialWorkshopId = searchParams.get('workshop') || '';

  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [fullName, setFullName] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState<GenderOption>('Female');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [workshopId, setWorkshopId] = useState(initialWorkshopId);
  const [address, setAddress] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [confirmedResult, setConfirmedResult] = useState<{
    mode: 'registered' | 'waitlist';
    workshopName: string;
    checkinToken?: string | null;
    position?: number;
  } | null>(null);

  const loadWorkshops = async () => {
    try {
      const res = await fetch('/api/workshops');
      if (!res.ok) throw new Error('Unable to load workshops.');
      const data = (await res.json()) as { workshops: Workshop[] };
      const openList = data.workshops.filter((w) => w.status === 'open');
      setWorkshops(openList);
      if (initialWorkshopId) {
        setWorkshopId(initialWorkshopId);
      } else if (!workshopId && openList.length > 0) {
        setWorkshopId(String(openList[0].id));
      }
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to load workshops.'
      );
    }
  };

  useEffect(() => {
    void loadWorkshops();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialWorkshopId]);

  useEffect(() => {
    if (profile) {
      if (profile.fullName) setFullName(profile.fullName);
      if (profile.age) setAge(String(profile.age));
      if (profile.gender) setGender(profile.gender as GenderOption);
      if (profile.phone) setPhone(profile.phone);
      if (profile.email) setEmail(profile.email);
      if (profile.address) setAddress(profile.address);
    } else if (user) {
      setFullName((prev) => prev || user.displayName || '');
      setEmail((prev) => prev || user.email || '');
    }
  }, [user, profile]);

  const selectedWorkshop = useMemo(
    () => workshops.find((w) => String(w.id) === String(workshopId)) || null,
    [workshops, workshopId]
  );

  const seatsLeft = selectedWorkshop
    ? Math.max(0, selectedWorkshop.capacity - selectedWorkshop.registeredCount)
    : 0;
  const isWaitlistMode = Boolean(selectedWorkshop && seatsLeft === 0);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    setActionMsg(null);
    setConfirmedResult(null);
    setSubmitting(true);

    try {
      const endpoint = isWaitlistMode ? '/api/waitlist' : '/api/registrations';
      const res = await authFetch(endpoint, {
        method: 'POST',
        body: JSON.stringify({
          fullName: fullName.trim(),
          age: Number.parseInt(age, 10),
          gender,
          phone: phone.trim(),
          email: email.trim(),
          address: address.trim(),
          workshopId: Number.parseInt(workshopId, 10)
        })
      });

      const data = (await res.json()) as {
        error?: string;
        workshopName?: string;
        position?: number;
        registration?: Registration;
      };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not complete request.');
        return;
      }

      await Promise.all([refreshProfile(), loadWorkshops()]);
      setConfirmedResult(
        isWaitlistMode
          ? {
              mode: 'waitlist',
              workshopName: data.workshopName || 'Workshop',
              position: data.position
            }
          : {
              mode: 'registered',
              workshopName: data.workshopName || 'Workshop',
              checkinToken: data.registration?.checkinToken
            }
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to submit request.'
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmWaitlist = async (waitlistId: number, wsName: string) => {
    setBusyId(`confirm-${waitlistId}`);
    setErrorMsg(null);
    setActionMsg(null);
    try {
      const res = await authFetch(`/api/waitlist/${waitlistId}/confirm`, {
        method: 'POST'
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to confirm waitlist seat.');
        return;
      }
      await Promise.all([refreshProfile(), loadWorkshops()]);
      setActionMsg(`Seat confirmed for ${wsName}. Your attendance QR pass is ready below.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to confirm waitlist seat.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleDeclineWaitlist = async (waitlistId: number) => {
    setBusyId(`decline-${waitlistId}`);
    setErrorMsg(null);
    setActionMsg(null);
    try {
      const res = await authFetch(`/api/waitlist/${waitlistId}/decline`, {
        method: 'POST'
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to leave waiting list.');
        return;
      }
      await Promise.all([refreshProfile(), loadWorkshops()]);
      setActionMsg('Removed from waiting list.');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to leave waiting list.'
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleCancelRegistration = async (regId: number, wsName: string) => {
    setBusyId(`cancel-${regId}`);
    setErrorMsg(null);
    setActionMsg(null);
    try {
      const res = await authFetch(`/api/registrations/${regId}/cancel`, {
        method: 'POST'
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        setErrorMsg(data.error || 'Unable to cancel registration.');
        return;
      }
      await Promise.all([refreshProfile(), loadWorkshops()]);
      setActionMsg(`Cancelled registration for ${wsName}. Any waitlisted participant has been notified.`);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to cancel registration.'
      );
    } finally {
      setBusyId(null);
    }
  };

  if (!authReady) {
    return (
      <section className="section">
        <div className="container narrow">
          <div className="empty">Checking authentication...</div>
        </div>
      </section>
    );
  }

  const notifiedWaitlist = myWaitlist.filter((w) => w.status === 'notified');
  const activeRegistrations = myRegistrations.filter(
    (r) => r.status === 'confirmed'
  );
  const unreadNotifications = myNotifications.filter((n) => !n.isRead);

  return (
    <section className="section">
      <div className="container narrow">
        {user && (notifiedWaitlist.length > 0 || unreadNotifications.length > 0) && (
          <div id="notifications" className="panel" style={{ marginBottom: 24 }}>
            <div className="section-heading" style={{ marginBottom: 12 }}>
              <div>
                <span className="eyebrow">Participant Alerts</span>
                <h2 style={{ fontSize: 22, margin: 0 }}>Seat Offers &amp; Updates</h2>
              </div>
              {unreadNotifications.length > 0 && (
                <button
                  type="button"
                  className="btn tertiary"
                  onClick={() => void markNotificationRead()}
                >
                  Mark all read
                </button>
              )}
            </div>

            {notifiedWaitlist.map((offer) => (
              <div key={offer.id} className="alert success notification-offer">
                <div>
                  <strong>Seat available: {offer.workshopName}</strong>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    A spot opened up from the waiting list. Confirm now to lock in your registration.
                  </p>
                </div>
                <div className="hero-actions" style={{ marginTop: 10 }}>
                  <button
                    type="button"
                    className="btn primary"
                    disabled={busyId === `confirm-${offer.id}`}
                    onClick={() =>
                      void handleConfirmWaitlist(offer.id, offer.workshopName)
                    }
                  >
                    {busyId === `confirm-${offer.id}` ? 'Confirming...' : 'Confirm Seat'}
                  </button>
                  <button
                    type="button"
                    className="btn tertiary"
                    disabled={busyId === `decline-${offer.id}`}
                    onClick={() => void handleDeclineWaitlist(offer.id)}
                  >
                    Decline
                  </button>
                </div>
              </div>
            ))}

            {unreadNotifications.map((note) => (
              <div key={note.id} className="feedback notification-row">
                <div>
                  <strong>{note.title}</strong>
                  <p className="muted" style={{ margin: '4px 0 0', fontSize: 13 }}>
                    {note.message}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn tertiary"
                  style={{ height: 34, padding: '0 12px', fontSize: 12 }}
                  onClick={() => void markNotificationRead(note.id)}
                >
                  Dismiss
                </button>
              </div>
            ))}
          </div>
        )}

        {actionMsg && <div className="alert success">{actionMsg}</div>}

        {confirmedResult ? (
          <div className="form-card">
            <span className="eyebrow">
              {confirmedResult.mode === 'waitlist' ? 'Waiting List' : 'Confirmed'}
            </span>
            <h1>
              {confirmedResult.mode === 'waitlist'
                ? 'Added to Waiting List'
                : 'Welcome to SkillConnect'}
            </h1>
            {confirmedResult.mode === 'waitlist' ? (
              <p>
                You are queued at position{' '}
                <strong>#{confirmedResult.position ?? 1}</strong> for{' '}
                <strong>{confirmedResult.workshopName}</strong>. We will notify
                you as soon as a seat becomes available.
              </p>
            ) : (
              <>
                <p>
                  Your registration for{' '}
                  <strong>{confirmedResult.workshopName}</strong> was saved
                  successfully. Present your QR attendance pass below at check-in.
                </p>
                {confirmedResult.checkinToken && (
                  <div className="qr-pass-box">
                    <QrCodeImage
                      value={confirmedResult.checkinToken}
                      size={168}
                      alt={`Attendance QR pass for ${confirmedResult.workshopName}`}
                    />
                    <div className="qr-token-label">
                      Pass ID: <strong>{confirmedResult.checkinToken}</strong>
                    </div>
                  </div>
                )}
              </>
            )}
            <div className="hero-actions">
              <Link className="btn primary" to="/workshops">
                Back to workshops
              </Link>
              <button
                type="button"
                className="btn tertiary"
                onClick={() => setConfirmedResult(null)}
              >
                Register or join another
              </button>
            </div>
          </div>
        ) : !user ? (
          <div className="form-card">
            <span className="eyebrow">Secure your place</span>
            <h1>Workshop registration</h1>
            <p className="muted">
              Sign in with your Google account so your participant details,
              attendance QR pass, waiting list status, and certificates are saved
              to your account.
            </p>
            <button
              type="button"
              className="btn primary"
              onClick={() => void signInWithGoogle()}
            >
              Sign in with Google to Register
            </button>
          </div>
        ) : (
          <div className="form-card">
            <span className="eyebrow">
              {isWaitlistMode ? 'Workshop Full · Waiting List' : 'Secure your place'}
            </span>
            <h1>
              {isWaitlistMode ? 'Join workshop waiting list' : 'Workshop registration'}
            </h1>
            {isWaitlistMode && selectedWorkshop && (
              <div className="alert success">
                <strong>{selectedWorkshop.name}</strong> is currently full (
                {selectedWorkshop.waitlistCount ?? 0} queued). Submit below to join
                the waiting list and get notified immediately when a seat opens.
              </div>
            )}
            {errorMsg && <div className="alert error">{errorMsg}</div>}
            <form onSubmit={(e) => void handleSubmit(e)}>
              <div className="form-grid">
                <label>
                  Full name
                  <input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    minLength={BLUEPRINT_LIMITS.fullNameMin}
                    maxLength={BLUEPRINT_LIMITS.fullNameMax}
                    required
                  />
                </label>
                <label>
                  Age
                  <input
                    type="number"
                    min={BLUEPRINT_LIMITS.ageMin}
                    max={BLUEPRINT_LIMITS.ageMax}
                    value={age}
                    onChange={(e) => setAge(e.target.value)}
                    required
                  />
                </label>
                <label>
                  Gender
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as GenderOption)}
                    required
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </label>
                <label>
                  Phone number
                  <input
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    minLength={BLUEPRINT_LIMITS.phoneMin}
                    maxLength={BLUEPRINT_LIMITS.phoneMax}
                    required
                  />
                </label>
                <label>
                  Email address
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={BLUEPRINT_LIMITS.emailMax}
                    required
                  />
                </label>
                <label>
                  Workshop
                  <select
                    value={workshopId}
                    onChange={(e) => setWorkshopId(e.target.value)}
                    required
                  >
                    {workshops.map((w) => {
                      const left = Math.max(0, w.capacity - w.registeredCount);
                      return (
                        <option key={w.id} value={String(w.id)}>
                          {w.name} —{' '}
                          {left > 0
                            ? `${left} seats left`
                            : 'Full (Join waiting list)'}
                        </option>
                      );
                    })}
                  </select>
                </label>
              </div>
              <label>
                Address
                <textarea
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  minLength={BLUEPRINT_LIMITS.addressMin}
                  maxLength={BLUEPRINT_LIMITS.addressMax}
                  required
                />
              </label>
              <button
                type="submit"
                className={`btn ${isWaitlistMode ? 'secondary' : 'primary'} full`}
                disabled={submitting || workshops.length === 0}
              >
                {submitting
                  ? 'Saving...'
                  : isWaitlistMode
                    ? 'Join waiting list'
                    : 'Confirm registration'}
              </button>
            </form>
          </div>
        )}

        {user && activeRegistrations.length > 0 && (
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>My Attendance QR Passes</h2>
            <p className="muted" style={{ marginTop: 0 }}>
              Show your personal QR code to the workshop administrator to mark attendance and automatically receive your certificate.
            </p>
            <div className="qr-pass-grid">
              {activeRegistrations.map((r) => (
                <div key={r.id} className="qr-pass-card">
                  {r.checkinToken && (
                    <QrCodeImage
                      value={r.checkinToken}
                      size={136}
                      alt={`QR pass for ${r.workshopName}`}
                    />
                  )}
                  <div className="qr-pass-meta">
                    <strong>{r.workshopName}</strong>
                    <small className="muted">
                      Registered {new Date(r.registeredAt).toLocaleDateString()}
                    </small>
                    {r.checkinToken && (
                      <code className="qr-code-pill">{r.checkinToken}</code>
                    )}
                    <button
                      type="button"
                      className="btn danger"
                      style={{ marginTop: 10 }}
                      disabled={busyId === `cancel-${r.id}`}
                      onClick={() =>
                        void handleCancelRegistration(r.id, r.workshopName)
                      }
                    >
                      {busyId === `cancel-${r.id}`
                        ? 'Cancelling...'
                        : 'Cancel Registration'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {user && myWaitlist.length > 0 && (
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>My Waiting List</h2>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Workshop</th>
                    <th>Status</th>
                    <th>Queue</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {myWaitlist.map((w) => (
                    <tr key={w.id}>
                      <td>
                        <strong>{w.workshopName}</strong>
                        <small>{new Date(w.createdAt).toLocaleDateString()}</small>
                      </td>
                      <td>{w.status}</td>
                      <td className="tabular-nums">
                        {w.position ? `#${w.position}` : '—'}
                      </td>
                      <td>
                        {w.status === 'notified' ? (
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn primary"
                              style={{ height: 34, padding: '0 12px', fontSize: 12 }}
                              disabled={busyId === `confirm-${w.id}`}
                              onClick={() =>
                                void handleConfirmWaitlist(w.id, w.workshopName)
                              }
                            >
                              Confirm Seat
                            </button>
                            <button
                              type="button"
                              className="btn danger"
                              disabled={busyId === `decline-${w.id}`}
                              onClick={() => void handleDeclineWaitlist(w.id)}
                            >
                              Decline
                            </button>
                          </div>
                        ) : w.status === 'waiting' ? (
                          <button
                            type="button"
                            className="btn danger"
                            disabled={busyId === `decline-${w.id}`}
                            onClick={() => void handleDeclineWaitlist(w.id)}
                          >
                            Leave Waitlist
                          </button>
                        ) : (
                          <span className="muted">—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {user && myCertificates.length > 0 && (
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>Issued Certificates</h2>
            {myCertificates.map((c) => (
              <div key={c.id} className="feedback notification-row">
                <div>
                  <strong>{c.workshopName}</strong>
                  <p style={{ margin: '4px 0 0', fontSize: 13 }}>
                    <Link
                      className="text-link"
                      to={`/certificate/${c.certificateCode}`}
                    >
                      {c.certificateCode}
                    </Link>{' '}
                    · Issued {new Date(c.issuedAt).toLocaleDateString()}
                  </p>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn primary"
                    style={{ height: 36, padding: '0 14px', fontSize: 13 }}
                    onClick={() =>
                      downloadCertificatePdf({
                        participantName:
                          profile?.fullName ||
                          user.displayName ||
                          user.email ||
                          'Participant',
                        workshopName: c.workshopName,
                        certificateCode: c.certificateCode,
                        issuedAt: c.issuedAt
                      })
                    }
                  >
                    Download PDF
                  </button>
                  <Link
                    className="btn tertiary"
                    style={{ height: 36, padding: '0 14px', fontSize: 13 }}
                    to={`/certificate/${c.certificateCode}`}
                  >
                    View
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
