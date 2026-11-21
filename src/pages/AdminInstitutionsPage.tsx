import { useCallback, useEffect, useState, type ChangeEvent, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  MapPin,
  Pencil,
  Plus,
  Search,
  Trash2,
  Upload
} from 'lucide-react';
import { useFirebase } from '../context/FirebaseContext';
import type {
  CourseCategory,
  TrainingInstitution,
  TrainingMode,
  VerifiedPlaceCandidate
} from '../types';

async function resizeImageFile(
  file: File,
  maxDimension: number
): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(
          1,
          maxDimension / Math.max(img.width || 1, img.height || 1)
        );
        const w = Math.max(1, Math.round(img.width * scale));
        const h = Math.max(1, Math.round(img.height * scale));
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Could not process image file.'));
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL('image/webp', 0.85));
      };
      img.onerror = () => reject(new Error('Invalid image file.'));
      img.src = String(reader.result || '');
    };
    reader.onerror = () => reject(new Error('Failed to read image file.'));
    reader.readAsDataURL(file);
  });
}

interface CourseSelectionState {
  selected: boolean;
  duration: string;
}

export function AdminInstitutionsPage() {
  const {
    user,
    authReady,
    signingIn,
    isAdmin,
    authError,
    signInWithGoogle,
    authFetch
  } = useFirebase();

  const [courses, setCourses] = useState<CourseCategory[]>([]);
  const [institutions, setInstitutions] = useState<TrainingInstitution[]>([]);
  const [loading, setLoading] = useState(true);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [trainingMode, setTrainingMode] = useState<TrainingMode>('Offline');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState('');
  const [description, setDescription] = useState('');
  const [logoUrl, setLogoUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [area, setArea] = useState('');
  const [latitude, setLatitude] = useState('');
  const [longitude, setLongitude] = useState('');
  const [googleMapsUrl, setGoogleMapsUrl] = useState('');
  const [placeId, setPlaceId] = useState<string | null>(null);
  const [isVerified, setIsVerified] = useState(false);

  const [courseMap, setCourseMap] = useState<Record<number, CourseSelectionState>>(
    {}
  );

  // Google Places Search helper state
  const [placeQuery, setPlaceQuery] = useState('');
  const [placeResults, setPlaceResults] = useState<VerifiedPlaceCandidate[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [geocoding, setGeocoding] = useState(false);

  const [saving, setSaving] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const resetForm = useCallback(
    (courseList: CourseCategory[]) => {
      setEditingId(null);
      setName('');
      setTrainingMode('Offline');
      setPhone('');
      setWebsite('');
      setDescription('');
      setLogoUrl('');
      setImageUrl('');
      setAddress('');
      setCity('');
      setArea('');
      setLatitude('');
      setLongitude('');
      setGoogleMapsUrl('');
      setPlaceId(null);
      setIsVerified(false);
      setPlaceResults([]);

      const initial: Record<number, CourseSelectionState> = {};
      for (const c of courseList) {
        initial[c.id] = { selected: false, duration: '' };
      }
      setCourseMap(initial);
    },
    []
  );

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authFetch('/api/admin/institutions');
      if (!res.ok) throw new Error('Failed to load training institutions.');
      const data = (await res.json()) as {
        courses: CourseCategory[];
        institutions: TrainingInstitution[];
      };
      setCourses(data.courses);
      setInstitutions(data.institutions);
      setCourseMap((prev) => {
        if (Object.keys(prev).length > 0) return prev;
        const init: Record<number, CourseSelectionState> = {};
        for (const c of data.courses) {
          init[c.id] = { selected: false, duration: '' };
        }
        return init;
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text:
          err instanceof Error
            ? err.message
            : 'Unable to load institutions data.'
      });
    } finally {
      setLoading(false);
    }
  }, [authFetch]);

  useEffect(() => {
    if (authReady && isAdmin) {
      void loadData();
    }
  }, [authReady, isAdmin, loadData]);

  const handleSearchPlaces = async (e: FormEvent) => {
    e.preventDefault();
    if (!placeQuery.trim()) return;
    setSearchingPlaces(true);
    setStatusMsg(null);
    try {
      const res = await authFetch('/api/admin/places/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: placeQuery.trim() })
      });
      const data = (await res.json()) as {
        places?: VerifiedPlaceCandidate[];
        error?: string;
        quotaExceeded?: boolean;
      };
      if (res.status === 429 || data.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      if (!res.ok) {
        throw new Error(data.error || 'Place search failed.');
      }
      const list = data.places ?? [];
      setPlaceResults(list);
      if (list.length === 0) {
        setStatusMsg({
          type: 'error',
          text: 'No matching verified places found on Google Maps. Try including city name.'
        });
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to search places.'
      });
    } finally {
      setSearchingPlaces(false);
    }
  };

  const handleApplyCandidate = (candidate: VerifiedPlaceCandidate) => {
    setName(candidate.name);
    setAddress(candidate.formattedAddress);
    if (candidate.city) setCity(candidate.city);
    if (candidate.area) setArea(candidate.area);
    if (candidate.phone) setPhone(candidate.phone);
    if (candidate.website) setWebsite(candidate.website);
    if (candidate.latitude !== null) setLatitude(String(candidate.latitude));
    if (candidate.longitude !== null) setLongitude(String(candidate.longitude));
    if (candidate.googleMapsUrl) setGoogleMapsUrl(candidate.googleMapsUrl);
    setPlaceId(candidate.placeId || null);
    setIsVerified(true);
    setPlaceResults([]);
    setStatusMsg({
      type: 'success',
      text: `Loaded verified Google Maps details for "${candidate.name}". Select the courses offered and save.`
    });
  };

  const handleGeocodeAddress = async () => {
    const queryAddr = [address, area, city].filter(Boolean).join(', ');
    if (queryAddr.trim().length < 3) {
      setStatusMsg({
        type: 'error',
        text: 'Enter an address and city first before geocoding.'
      });
      return;
    }

    setGeocoding(true);
    setStatusMsg(null);
    try {
      const res = await authFetch('/api/admin/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: queryAddr })
      });
      const data = (await res.json()) as {
        latitude?: number | null;
        longitude?: number | null;
        formattedAddress?: string;
        placeId?: string | null;
        city?: string;
        area?: string;
        error?: string;
        quotaExceeded?: boolean;
      };
      if (res.status === 429 || data.quotaExceeded) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      if (!res.ok) {
        throw new Error(data.error || 'Geocoding failed.');
      }

      if (typeof data.latitude === 'number') setLatitude(String(data.latitude));
      if (typeof data.longitude === 'number') setLongitude(String(data.longitude));
      if (data.formattedAddress) setAddress(data.formattedAddress);
      if (data.city && !city.trim()) setCity(data.city);
      if (data.area && !area.trim()) setArea(data.area);
      if (data.placeId) {
        setPlaceId(data.placeId);
        setIsVerified(true);
      }

      setStatusMsg({
        type: 'success',
        text: 'Address geocoded and coordinates populated.'
      });
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to geocode address.'
      });
    } finally {
      setGeocoding(false);
    }
  };

  const handleFileUpload = async (
    e: ChangeEvent<HTMLInputElement>,
    target: 'logo' | 'image'
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const dataUrl = await resizeImageFile(
        file,
        target === 'logo' ? 256 : 640
      );
      if (target === 'logo') {
        setLogoUrl(dataUrl);
      } else {
        setImageUrl(dataUrl);
      }
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Could not process image.'
      });
    }
  };

  const handleEditInstitution = (inst: TrainingInstitution) => {
    const primary = inst.locations[0];
    setEditingId(inst.id);
    setName(inst.name);
    setTrainingMode(inst.trainingMode);
    setPhone(inst.phone);
    setWebsite(inst.website);
    setDescription(inst.description);
    setLogoUrl(inst.logoUrl);
    setImageUrl(inst.imageUrl);
    setAddress(primary?.address || '');
    setCity(primary?.city || '');
    setArea(primary?.area || '');
    setLatitude(
      primary?.latitude !== null && primary?.latitude !== undefined
        ? String(primary.latitude)
        : ''
    );
    setLongitude(
      primary?.longitude !== null && primary?.longitude !== undefined
        ? String(primary.longitude)
        : ''
    );
    setGoogleMapsUrl(primary?.googleMapsUrl || '');
    setPlaceId(inst.placeId);
    setIsVerified(inst.isVerified);

    const nextMap: Record<number, CourseSelectionState> = {};
    for (const c of courses) {
      const matched = inst.courses.find((off) => off.courseId === c.id);
      nextMap[c.id] = {
        selected: Boolean(matched),
        duration: matched?.duration || ''
      };
    }
    setCourseMap(nextMap);
    setStatusMsg(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setStatusMsg(null);

    const selectedCourses = courses
      .filter((c) => courseMap[c.id]?.selected)
      .map((c) => ({
        courseId: c.id,
        duration: courseMap[c.id]?.duration.trim() || ''
      }));

    if (selectedCourses.length === 0) {
      setStatusMsg({
        type: 'error',
        text: 'Select at least one course category offered by this institution.'
      });
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name,
        logoUrl,
        imageUrl,
        phone,
        website,
        trainingMode,
        description,
        isVerified,
        placeId,
        address,
        city,
        area,
        latitude: latitude.trim() === '' ? null : Number(latitude),
        longitude: longitude.trim() === '' ? null : Number(longitude),
        googleMapsUrl,
        courses: selectedCourses
      };

      const endpoint = editingId
        ? `/api/admin/institutions/${editingId}`
        : '/api/admin/institutions';
      const method = editingId ? 'PATCH' : 'POST';

      const res = await authFetch(endpoint, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to save institution.');
      }

      setStatusMsg({
        type: 'success',
        text: editingId
          ? `Updated "${name}" in Cloud SQL.`
          : `Added "${name}" to the training institutions directory.`
      });
      resetForm(courses);
      await loadData();
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to save institution.'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteInstitution = async (id: number) => {
    setStatusMsg(null);
    try {
      const res = await authFetch(`/api/admin/institutions/${id}`, {
        method: 'DELETE'
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete institution.');
      }
      if (editingId === id) {
        resetForm(courses);
      }
      setConfirmDeleteId(null);
      setStatusMsg({
        type: 'success',
        text: 'Institution removed from database.'
      });
      await loadData();
    } catch (err) {
      setStatusMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to delete institution.'
      });
    }
  };

  if (!authReady) {
    return (
      <section className="section">
        <div className="container">
          <div className="empty">Loading administrator workspace...</div>
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
            Sign in with an authorized SkillConnect administrator account to
            manage training institutions.
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

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">Admin Operations · Digital Skills</span>
            <h1>Manage Training Institutions</h1>
          </div>
          <div className="hero-actions" style={{ marginTop: 0 }}>
            <Link className="btn tertiary" to="/institutions">
              View Public Directory
            </Link>
            <Link className="btn tertiary" to="/admin">
              Back to Dashboard
            </Link>
          </div>
        </div>

        {statusMsg && (
          <div className={`alert ${statusMsg.type}`}>{statusMsg.text}</div>
        )}

        {/* Google Places Verified Lookup Tool */}
        <div className="panel" style={{ marginBottom: 20 }}>
          <h2 style={{ marginTop: 0 }}>
            Search Verified Place via Google Maps (Optional)
          </h2>
          <p className="muted" style={{ marginTop: 0, fontSize: 14 }}>
            Look up a real institution to auto-fill verified address, phone,
            website, and coordinates directly from Google Maps—or enter verified
            details manually below.
          </p>
          <form className="scanner-manual-form" onSubmit={handleSearchPlaces}>
            <input
              type="text"
              value={placeQuery}
              onChange={(e) => setPlaceQuery(e.target.value)}
              placeholder="e.g., NIIT Computer Education Bengaluru or Aptech Pune"
            />
            <button
              type="submit"
              className="btn secondary"
              disabled={searchingPlaces}
            >
              <Search size={15} />
              {searchingPlaces ? 'Searching...' : 'Search Google Maps'}
            </button>
          </form>

          {placeResults.length > 0 && (
            <div className="place-candidates-grid">
              {placeResults.map((p) => (
                <div key={p.placeId || p.name} className="place-candidate-card">
                  <div>
                    <strong>{p.name}</strong>
                    <p className="muted" style={{ margin: '4px 0', fontSize: 13 }}>
                      {p.formattedAddress}
                    </p>
                    <small className="muted">
                      {[p.phone, p.website].filter(Boolean).join(' · ')}
                    </small>
                  </div>
                  <button
                    type="button"
                    className="btn primary btn-sm"
                    onClick={() => handleApplyCandidate(p)}
                  >
                    Use This Place
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add / Edit Institution Form */}
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="course-selector-header">
            <h2 style={{ margin: 0 }}>
              {editingId ? 'Edit Training Institution' : 'Add New Institution'}
            </h2>
            {editingId && (
              <button
                type="button"
                className="btn tertiary btn-sm"
                onClick={() => resetForm(courses)}
              >
                Cancel Edit
              </button>
            )}
          </div>

          <form onSubmit={handleSubmit}>
            <div className="form-grid">
              <label>
                Institution Name *
                <input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter verified institution name"
                />
              </label>

              <label>
                Training Mode *
                <select
                  value={trainingMode}
                  onChange={(e) =>
                    setTrainingMode(e.target.value as TrainingMode)
                  }
                >
                  <option value="Offline">Offline</option>
                  <option value="Online">Online</option>
                  <option value="Hybrid">Hybrid (Online &amp; Offline)</option>
                </select>
              </label>

              <label>
                Contact Number
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="e.g., +91 80 1234 5678"
                />
              </label>

              <label>
                Official Website
                <input
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://example.org"
                />
              </label>
            </div>

            <label>
              Institution Description *
              <textarea
                required
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Describe training programs, lab facilities, certifications, or schedules..."
              />
            </label>

            <div className="form-grid">
              <div className="upload-field-group">
                <label style={{ marginBottom: 6 }}>
                  Institution Logo (URL or Upload)
                  <input
                    value={logoUrl}
                    onChange={(e) => setLogoUrl(e.target.value)}
                    placeholder="https://... or upload image below"
                  />
                </label>
                <div className="upload-controls-row">
                  <label className="btn tertiary btn-sm upload-btn-label">
                    <Upload size={14} /> Upload Logo
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => void handleFileUpload(e, 'logo')}
                    />
                  </label>
                  {logoUrl && (
                    <img
                      src={logoUrl}
                      alt="Logo preview"
                      className="admin-img-preview"
                    />
                  )}
                </div>
              </div>

              <div className="upload-field-group">
                <label style={{ marginBottom: 6 }}>
                  Institution Campus Image (URL or Upload)
                  <input
                    value={imageUrl}
                    onChange={(e) => setImageUrl(e.target.value)}
                    placeholder="https://... or upload image below"
                  />
                </label>
                <div className="upload-controls-row">
                  <label className="btn tertiary btn-sm upload-btn-label">
                    <Upload size={14} /> Upload Image
                    <input
                      type="file"
                      accept="image/*"
                      hidden
                      onChange={(e) => void handleFileUpload(e, 'image')}
                    />
                  </label>
                  {imageUrl && (
                    <img
                      src={imageUrl}
                      alt="Campus preview"
                      className="admin-img-preview"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="address-geocode-row">
              <label style={{ flex: 1, marginBottom: 0 }}>
                Complete Address *
                <input
                  required
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, building, landmark, postal code"
                />
              </label>
              <button
                type="button"
                className="btn tertiary"
                disabled={geocoding}
                onClick={() => void handleGeocodeAddress()}
              >
                <MapPin size={15} />
                {geocoding ? 'Geocoding...' : 'Geocode Address'}
              </button>
            </div>

            <div className="form-grid" style={{ marginTop: 14 }}>
              <label>
                City *
                <input
                  required
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  placeholder="e.g., Bengaluru"
                />
              </label>

              <label>
                Area / Neighborhood
                <input
                  value={area}
                  onChange={(e) => setArea(e.target.value)}
                  placeholder="e.g., Indiranagar"
                />
              </label>

              <label>
                Latitude
                <input
                  type="number"
                  step="any"
                  value={latitude}
                  onChange={(e) => setLatitude(e.target.value)}
                  placeholder="e.g., 12.9716"
                />
              </label>

              <label>
                Longitude
                <input
                  type="number"
                  step="any"
                  value={longitude}
                  onChange={(e) => setLongitude(e.target.value)}
                  placeholder="e.g., 77.5946"
                />
              </label>
            </div>

            <label>
              Google Maps Link (Optional)
              <input
                value={googleMapsUrl}
                onChange={(e) => setGoogleMapsUrl(e.target.value)}
                placeholder="https://maps.google.com/?cid=..."
              />
            </label>

            <label className="checkbox-inline">
              <input
                type="checkbox"
                checked={isVerified}
                onChange={(e) => setIsVerified(e.target.checked)}
              />
              Mark as verified institution details
            </label>

            {/* Course Selection Checklist */}
            <div className="admin-course-checklist-box">
              <h3>Courses Offered &amp; Duration *</h3>
              <p className="muted" style={{ margin: '0 0 12px', fontSize: 13 }}>
                Select all courses provided by this institution and specify the
                duration for each selected course.
              </p>
              <div className="admin-course-checklist-grid">
                {courses.map((course) => {
                  const state = courseMap[course.id] || {
                    selected: false,
                    duration: ''
                  };
                  return (
                    <div
                      key={course.id}
                      className={`admin-course-check-item ${state.selected ? 'checked' : ''}`}
                    >
                      <label className="checkbox-inline" style={{ marginBottom: 0 }}>
                        <input
                          type="checkbox"
                          checked={state.selected}
                          onChange={(e) =>
                            setCourseMap((prev) => ({
                              ...prev,
                              [course.id]: {
                                selected: e.target.checked,
                                duration: prev[course.id]?.duration || ''
                              }
                            }))
                          }
                        />
                        <span>{course.name}</span>
                      </label>
                      {state.selected && (
                        <input
                          type="text"
                          value={state.duration}
                          onChange={(e) =>
                            setCourseMap((prev) => ({
                              ...prev,
                              [course.id]: {
                                selected: true,
                                duration: e.target.value
                              }
                            }))
                          }
                          placeholder="Duration (e.g., 8 Weeks)"
                          aria-label={`${course.name} duration`}
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="hero-actions">
              <button
                type="submit"
                className="btn primary"
                disabled={saving}
              >
                <Plus size={16} />
                {saving
                  ? 'Saving...'
                  : editingId
                    ? 'Save Institution Changes'
                    : 'Add Training Institution'}
              </button>
            </div>
          </form>
        </div>

        {/* Institutions List Table */}
        <div className="panel">
          <h2 style={{ marginTop: 0 }}>
            Saved Training Institutions ({institutions.length})
          </h2>
          {loading ? (
            <p className="muted">Loading saved institutions...</p>
          ) : institutions.length === 0 ? (
            <p className="muted">
              No training institutions added yet. Use the form above to add a
              verified institution or import one via Google Maps search.
            </p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Institution</th>
                    <th>City / Area</th>
                    <th>Mode</th>
                    <th>Courses Offered</th>
                    <th>Map Pin</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {institutions.map((inst) => {
                    const primary = inst.locations[0];
                    const hasCoords =
                      primary &&
                      typeof primary.latitude === 'number' &&
                      typeof primary.longitude === 'number';

                    return (
                      <tr key={inst.id}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {inst.logoUrl || inst.imageUrl ? (
                              <img
                                src={inst.logoUrl || inst.imageUrl}
                                alt={inst.name}
                                className="admin-table-thumb"
                              />
                            ) : (
                              <span className="admin-table-thumb-fallback">
                                <Building2 size={16} />
                              </span>
                            )}
                            <div>
                              <strong>{inst.name}</strong>
                              {inst.isVerified && (
                                <small style={{ color: '#059669', display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <CheckCircle2 size={11} /> Verified
                                </small>
                              )}
                            </div>
                          </div>
                        </td>
                        <td>
                          <strong>{primary?.city || '—'}</strong>
                          <small>{primary?.area || primary?.address || ''}</small>
                        </td>
                        <td>{inst.trainingMode}</td>
                        <td>
                          {inst.courses
                            .map((c) =>
                              c.duration
                                ? `${c.courseName} (${c.duration})`
                                : c.courseName
                            )
                            .join(', ')}
                        </td>
                        <td>
                          {hasCoords ? (
                            <span style={{ color: '#059669', fontWeight: 600 }}>
                              Pinned
                            </span>
                          ) : (
                            <span className="muted">No coords</span>
                          )}
                          {primary?.googleMapsUrl && (
                            <small>
                              <a
                                href={primary.googleMapsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-link"
                              >
                                Map Link <ExternalLink size={10} />
                              </a>
                            </small>
                          )}
                        </td>
                        <td>
                          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                            <button
                              type="button"
                              className="btn tertiary btn-sm"
                              onClick={() => handleEditInstitution(inst)}
                            >
                              <Pencil size={13} /> Edit
                            </button>
                            {confirmDeleteId === inst.id ? (
                              <>
                                <button
                                  type="button"
                                  className="btn danger"
                                  onClick={() =>
                                    void handleDeleteInstitution(inst.id)
                                  }
                                >
                                  Confirm
                                </button>
                                <button
                                  type="button"
                                  className="btn tertiary btn-sm"
                                  onClick={() => setConfirmDeleteId(null)}
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                className="btn danger"
                                onClick={() => setConfirmDeleteId(inst.id)}
                              >
                                <Trash2 size={13} /> Delete
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
