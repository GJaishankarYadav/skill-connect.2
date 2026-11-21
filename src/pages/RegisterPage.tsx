import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';
import {
  BLUEPRINT_LIMITS,
  type GenderOption,
  type Workshop
} from '../types';

export function RegisterPage() {
  const {
    user,
    authReady,
    profile,
    myRegistrations,
    myCertificates,
    signInWithGoogle,
    refreshProfile,
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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [confirmedWorkshop, setConfirmedWorkshop] = useState<string | null>(
    null
  );

  const loadWorkshops = async () => {
    try {
      const res = await fetch('/api/workshops');
      if (!res.ok) throw new Error('Unable to load workshops.');
      const data = (await res.json()) as { workshops: Workshop[] };
      const openList = data.workshops.filter((w) => w.status === 'open');
      setWorkshops(openList);
      if (!workshopId && openList.length > 0) {
        setWorkshopId(initialWorkshopId || String(openList[0].id));
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

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setErrorMsg(null);
    setConfirmedWorkshop(null);
    setSubmitting(true);

    try {
      const res = await authFetch('/api/registrations', {
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
      };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not complete registration.');
        return;
      }

      await Promise.all([refreshProfile(), loadWorkshops()]);
      setConfirmedWorkshop(data.workshopName || 'Workshop');
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to submit registration.'
      );
    } finally {
      setSubmitting(false);
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

  return (
    <section className="section">
      <div className="container narrow">
        {confirmedWorkshop ? (
          <div className="form-card">
            <span className="eyebrow">Confirmed</span>
            <h1>Welcome to SkillConnect</h1>
            <p>
              Your registration for <strong>{confirmedWorkshop}</strong> was
              saved successfully.
            </p>
            <div className="hero-actions">
              <Link className="btn primary" to="/workshops">
                Back to workshops
              </Link>
              <button
                type="button"
                className="btn tertiary"
                onClick={() => setConfirmedWorkshop(null)}
              >
                Register for another workshop
              </button>
            </div>
          </div>
        ) : !user ? (
          <div className="form-card">
            <span className="eyebrow">Secure your place</span>
            <h1>Workshop registration</h1>
            <p className="muted">
              Sign in with your Google account so your participant details and
              registrations are saved to your account.
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
            <span className="eyebrow">Secure your place</span>
            <h1>Workshop registration</h1>
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
                        <option
                          key={w.id}
                          value={String(w.id)}
                          disabled={left === 0}
                        >
                          {w.name} — {left} seats
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
                className="btn primary full"
                disabled={submitting || workshops.length === 0}
              >
                {submitting ? 'Saving...' : 'Confirm registration'}
              </button>
            </form>
          </div>
        )}

        {user && (myRegistrations.length > 0 || myCertificates.length > 0) && (
          <div className="panel" style={{ marginTop: 24 }}>
            <h2>My registrations &amp; certificates</h2>
            {myRegistrations.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Workshop</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {myRegistrations.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.workshopName}</strong>
                        </td>
                        <td>{r.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {myCertificates.length > 0 && (
              <div style={{ marginTop: 16 }}>
                <strong>Issued Certificates</strong>
                {myCertificates.map((c) => (
                  <div key={c.id} className="feedback">
                    <strong>{c.workshopName}</strong>
                    <p>
                      <Link
                        className="text-link"
                        to={`/certificate/${c.certificateCode}`}
                      >
                        {c.certificateCode}
                      </Link>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
