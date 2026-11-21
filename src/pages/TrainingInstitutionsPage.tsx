import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Code2,
  Coffee,
  Cpu,
  ExternalLink,
  FileSpreadsheet,
  Globe,
  HardDrive,
  LocateFixed,
  MapPin,
  Megaphone,
  Monitor,
  Navigation,
  Phone,
  RotateCcw,
  Search,
  Terminal
} from 'lucide-react';
import {
  InstitutionMap,
  buildDirectionsUrl,
  buildViewOnMapsUrl
} from '../components/InstitutionMap';
import { useFirebase } from '../context/FirebaseContext';
import type { CourseCategory, TrainingInstitution } from '../types';

function renderCourseIcon(iconKey: string) {
  switch (iconKey) {
    case 'python':
      return <Code2 size={18} />;
    case 'java':
      return <Coffee size={18} />;
    case 'c':
      return <Terminal size={18} />;
    case 'cpp':
      return <Cpu size={18} />;
    case 'web':
      return <Globe size={18} />;
    case 'basics':
      return <Monitor size={18} />;
    case 'office':
      return <FileSpreadsheet size={18} />;
    case 'analytics':
      return <BarChart3 size={18} />;
    case 'marketing':
      return <Megaphone size={18} />;
    case 'hardware':
      return <HardDrive size={18} />;
    default:
      return <Monitor size={18} />;
  }
}

export function TrainingInstitutionsPage() {
  const { isAdmin } = useFirebase();
  const [searchParams, setSearchParams] = useSearchParams();

  const [courses, setCourses] = useState<CourseCategory[]>([]);
  const [allInstitutions, setAllInstitutions] = useState<TrainingInstitution[]>([]);
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedCourse, setSelectedCourse] = useState<string>(
    searchParams.get('course') || ''
  );
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCity, setSelectedCity] = useState('');
  const [selectedArea, setSelectedArea] = useState('');
  const [selectedMode, setSelectedMode] = useState('');

  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);
  const [locating, setLocating] = useState(false);
  const [locationMsg, setLocationMsg] = useState<string | null>(null);
  const [selectedInstitutionId, setSelectedInstitutionId] = useState<number | null>(
    null
  );
  const [brokenImages, setBrokenImages] = useState<Record<number, boolean>>({});

  useEffect(() => {
    const paramCourse = searchParams.get('course') || '';
    if (paramCourse !== selectedCourse) {
      setSelectedCourse(paramCourse);
    }
  }, [searchParams, selectedCourse]);

  const loadDirectory = useCallback(
    async (coords?: { lat: number; lng: number } | null) => {
      setLoading(true);
      try {
        const instParams = new URLSearchParams();
        if (coords) {
          instParams.set('lat', String(coords.lat));
          instParams.set('lng', String(coords.lng));
        }

        const [coursesRes, instRes, configRes] = await Promise.all([
          fetch('/api/courses'),
          fetch(
            `/api/institutions${instParams.toString() ? `?${instParams.toString()}` : ''}`
          ),
          fetch('/api/config/maps')
        ]);

        if (!coursesRes.ok || !instRes.ok) {
          throw new Error('Unable to load training institutions right now.');
        }

        const coursesData = (await coursesRes.json()) as {
          courses: CourseCategory[];
        };
        const instData = (await instRes.json()) as {
          institutions: TrainingInstitution[];
        };

        setCourses(coursesData.courses);
        setAllInstitutions(instData.institutions);

        if (configRes.ok) {
          const cfg = (await configRes.json()) as { apiKey?: string };
          if (cfg.apiKey) {
            setMapsApiKey(cfg.apiKey);
          }
        }
        setError(null);
      } catch (err) {
        setError(
          err instanceof Error
            ? err.message
            : 'Unable to load training institutions.'
        );
      } finally {
        setLoading(false);
      }
    },
    []
  );

  useEffect(() => {
    void loadDirectory(userLocation);
  }, [loadDirectory, userLocation]);

  const handleSelectCourse = (slug: string) => {
    setSelectedCourse(slug);
    setSelectedInstitutionId(null);
    if (slug) {
      setSearchParams({ course: slug });
    } else {
      setSearchParams({});
    }
  };

  const handleRequestLocation = () => {
    if (!navigator.geolocation) {
      setLocationMsg('Location services are not supported in this browser.');
      return;
    }
    setLocating(true);
    setLocationMsg(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude
        };
        setUserLocation(coords);
        setLocating(false);
        setLocationMsg('Sorted by distance from your current location.');
      },
      (err) => {
        setLocating(false);
        if (err.code === err.PERMISSION_DENIED) {
          setLocationMsg(
            'Location permission declined. Showing institutions in default order.'
          );
        } else {
          setLocationMsg('Could not determine your location right now.');
        }
      },
      { enableHighAccuracy: false, timeout: 8000 }
    );
  };

  const availableCities = useMemo(() => {
    const citySet = new Set<string>();
    for (const inst of allInstitutions) {
      for (const loc of inst.locations) {
        if (loc.city.trim()) citySet.add(loc.city.trim());
      }
    }
    return Array.from(citySet).sort((a, b) => a.localeCompare(b));
  }, [allInstitutions]);

  const availableAreas = useMemo(() => {
    const areaSet = new Set<string>();
    for (const inst of allInstitutions) {
      for (const loc of inst.locations) {
        if (
          selectedCity &&
          loc.city.trim().toLowerCase() !== selectedCity.toLowerCase()
        ) {
          continue;
        }
        if (loc.area.trim()) areaSet.add(loc.area.trim());
      }
    }
    return Array.from(areaSet).sort((a, b) => a.localeCompare(b));
  }, [allInstitutions, selectedCity]);

  const filteredInstitutions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    const cFilter = selectedCourse.trim().toLowerCase();
    const cityF = selectedCity.trim().toLowerCase();
    const areaF = selectedArea.trim().toLowerCase();
    const modeF = selectedMode.trim().toLowerCase();

    return allInstitutions.filter((inst) => {
      if (cFilter) {
        const offersCourse = inst.courses.some(
          (c) =>
            c.courseSlug.toLowerCase() === cFilter ||
            String(c.courseId) === cFilter
        );
        if (!offersCourse) return false;
      }

      if (cityF) {
        const matchesCity = inst.locations.some(
          (l) => l.city.trim().toLowerCase() === cityF
        );
        if (!matchesCity) return false;
      }

      if (areaF) {
        const matchesArea = inst.locations.some(
          (l) => l.area.trim().toLowerCase() === areaF
        );
        if (!matchesArea) return false;
      }

      if (modeF) {
        const instMode = inst.trainingMode.toLowerCase();
        if (modeF === 'hybrid') {
          if (instMode !== 'hybrid') return false;
        } else if (instMode !== modeF && instMode !== 'hybrid') {
          return false;
        }
      }

      if (q) {
        const text = [
          inst.name,
          inst.description,
          ...inst.locations.flatMap((l) => [l.address, l.city, l.area]),
          ...inst.courses.map((c) => c.courseName)
        ]
          .join(' ')
          .toLowerCase();
        if (!text.includes(q)) return false;
      }

      return true;
    });
  }, [
    allInstitutions,
    searchTerm,
    selectedCourse,
    selectedCity,
    selectedArea,
    selectedMode
  ]);

  const activeCourseObj = useMemo(
    () => courses.find((c) => c.slug === selectedCourse) || null,
    [courses, selectedCourse]
  );

  const resetAllFilters = () => {
    setSearchTerm('');
    setSelectedCity('');
    setSelectedArea('');
    setSelectedMode('');
    handleSelectCourse('');
  };

  const externalMapsCourseSearchUrl = useMemo(() => {
    const courseLabel = activeCourseObj
      ? activeCourseObj.name
      : 'Computer Basics and Digital Skills';
    const cityPart = selectedCity ? ` in ${selectedCity}` : '';
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${courseLabel} training institute${cityPart}`)}`;
  }, [activeCourseObj, selectedCity]);

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <Link className="breadcrumb-link" to="/workshops">
              <ArrowLeft size={15} /> Back to Computer Basics &amp; Digital Skills
            </Link>
            <span className="eyebrow" style={{ display: 'block', marginTop: 10 }}>
              Computer Basics &amp; Digital Skills · Directory
            </span>
            <h1>Find Training Institutions</h1>
            <p className="muted" style={{ margin: '4px 0 0', maxWidth: 680 }}>
              Explore verified local and online training institutes by digital skill
              course, compare modes and durations, and locate campuses on Google Maps.
            </p>
          </div>
          <div className="hero-actions" style={{ marginTop: 0 }}>
            {isAdmin && (
              <Link className="btn primary" to="/admin/institutions">
                Manage Training Institutions
              </Link>
            )}
          </div>
        </div>

        {/* 10 Course Categories Grid */}
        <div className="course-selector-panel">
          <div className="course-selector-header">
            <h2>Browse by Course Category</h2>
            {selectedCourse && (
              <button
                type="button"
                className="btn tertiary btn-sm"
                onClick={() => handleSelectCourse('')}
              >
                Show all courses
              </button>
            )}
          </div>
          <div className="course-chip-grid">
            {courses.map((course) => {
              const active = selectedCourse === course.slug;
              return (
                <button
                  key={course.id}
                  type="button"
                  className={`course-chip-card ${active ? 'active' : ''}`}
                  onClick={() =>
                    handleSelectCourse(active ? '' : course.slug)
                  }
                >
                  <span className="course-chip-icon">
                    {renderCourseIcon(course.iconKey)}
                  </span>
                  <span className="course-chip-text">
                    <strong>{course.name}</strong>
                    <small className="tabular-nums">
                      {course.institutionCount}{' '}
                      {course.institutionCount === 1
                        ? 'institution'
                        : 'institutions'}
                    </small>
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Search & Multi-Faceted Filters */}
        <div className="panel inst-filter-bar">
          <div className="inst-filter-grid">
            <div className="inst-search-input-wrap">
              <Search size={16} className="inst-search-icon" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Search institution by name, area, or keyword..."
                aria-label="Search institution by name"
              />
            </div>

            <select
              aria-label="Filter by course"
              value={selectedCourse}
              onChange={(e) => handleSelectCourse(e.target.value)}
            >
              <option value="">All 10 Courses</option>
              {courses.map((c) => (
                <option key={c.id} value={c.slug}>
                  {c.name}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by city"
              value={selectedCity}
              onChange={(e) => {
                setSelectedCity(e.target.value);
                setSelectedArea('');
              }}
            >
              <option value="">All Cities</option>
              {availableCities.map((city) => (
                <option key={city} value={city}>
                  {city}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by area"
              value={selectedArea}
              onChange={(e) => setSelectedArea(e.target.value)}
            >
              <option value="">All Areas</option>
              {availableAreas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>

            <select
              aria-label="Filter by training mode"
              value={selectedMode}
              onChange={(e) => setSelectedMode(e.target.value)}
            >
              <option value="">All Modes</option>
              <option value="Online">Online</option>
              <option value="Offline">Offline</option>
              <option value="Hybrid">Hybrid</option>
            </select>
          </div>

          <div className="inst-filter-actions">
            <div className="inst-results-summary">
              <strong className="tabular-nums">
                {filteredInstitutions.length}
              </strong>{' '}
              {filteredInstitutions.length === 1 ? 'institution' : 'institutions'}
              {activeCourseObj ? ` offering ${activeCourseObj.name}` : ''}
            </div>
            <div className="inst-filter-buttons">
              <button
                type="button"
                className={`btn ${userLocation ? 'secondary' : 'tertiary'} btn-sm`}
                disabled={locating}
                onClick={handleRequestLocation}
              >
                <LocateFixed size={15} />
                {locating
                  ? 'Locating...'
                  : userLocation
                    ? 'Sorted by Distance'
                    : 'Sort by Distance'}
              </button>
              {(searchTerm ||
                selectedCourse ||
                selectedCity ||
                selectedArea ||
                selectedMode) && (
                <button
                  type="button"
                  className="btn tertiary btn-sm"
                  onClick={resetAllFilters}
                >
                  <RotateCcw size={14} /> Reset Filters
                </button>
              )}
            </div>
          </div>

          {locationMsg && (
            <p className="muted" style={{ margin: '10px 0 0', fontSize: 13 }}>
              {locationMsg}
            </p>
          )}
        </div>

        {error && <div className="alert error">{error}</div>}

        {loading ? (
          <div className="empty">Loading training institutions...</div>
        ) : (
          <div className="inst-directory-layout">
            {/* Institution Cards Column */}
            <div className="inst-cards-column">
              {filteredInstitutions.length > 0 ? (
                filteredInstitutions.map((inst) => {
                  const primary = inst.locations[0];
                  const isSelected = selectedInstitutionId === inst.id;
                  const hasCoords =
                    primary &&
                    typeof primary.latitude === 'number' &&
                    typeof primary.longitude === 'number';
                  const visualSrc = inst.imageUrl || inst.logoUrl;
                  const showFallback = !visualSrc || brokenImages[inst.id];

                  return (
                    <article
                      key={inst.id}
                      className={`inst-card ${isSelected ? 'selected' : ''}`}
                    >
                      <div className="inst-card-top">
                        <div className="inst-visual-box">
                          {!showFallback ? (
                            <img
                              src={visualSrc}
                              alt={`${inst.name} logo`}
                              onError={() =>
                                setBrokenImages((prev) => ({
                                  ...prev,
                                  [inst.id]: true
                                }))
                              }
                            />
                          ) : (
                            <div className="inst-visual-fallback">
                              <Building2 size={26} />
                            </div>
                          )}
                        </div>

                        <div className="inst-card-heading">
                          <div className="inst-badges-row">
                            <span className="inst-mode-tag">
                              {inst.trainingMode}
                            </span>
                            {inst.isVerified && (
                              <span className="inst-verified-tag">
                                <CheckCircle2 size={12} /> Verified Listing
                              </span>
                            )}
                            {typeof inst.distanceKm === 'number' && (
                              <span className="inst-distance-tag tabular-nums">
                                {inst.distanceKm} km away
                              </span>
                            )}
                          </div>
                          <h2>{inst.name}</h2>
                          {primary && (
                            <p className="inst-location-line">
                              <MapPin size={14} />
                              <span>
                                {primary.address}
                                {primary.area ? ` · ${primary.area}` : ''}
                                {primary.city ? `, ${primary.city}` : ''}
                              </span>
                            </p>
                          )}
                        </div>
                      </div>

                      <p className="inst-description">{inst.description}</p>

                      {/* Courses & Durations */}
                      <div className="inst-courses-section">
                        <span className="inst-section-label">
                          Courses Available &amp; Duration
                        </span>
                        <div className="inst-courses-list">
                          {inst.courses.map((offering) => {
                            const highlighted =
                              selectedCourse &&
                              offering.courseSlug.toLowerCase() ===
                                selectedCourse.toLowerCase();
                            return (
                              <div
                                key={offering.id}
                                className={`inst-course-item ${highlighted ? 'highlighted' : ''}`}
                              >
                                <span className="inst-course-name">
                                  {offering.courseName}
                                </span>
                                {offering.duration && (
                                  <span className="inst-course-duration">
                                    <Clock size={12} /> {offering.duration}
                                  </span>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Contact & Website */}
                      <div className="inst-contact-row">
                        {inst.phone && (
                          <a href={`tel:${inst.phone}`} className="inst-meta-link">
                            <Phone size={14} /> {inst.phone}
                          </a>
                        )}
                        {inst.website && (
                          <a
                            href={inst.website}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inst-meta-link"
                          >
                            <Globe size={14} /> Official Website
                          </a>
                        )}
                      </div>

                      {/* Actions & Google Maps Buttons */}
                      <div className="inst-card-actions">
                        {hasCoords && (
                          <button
                            type="button"
                            className="btn tertiary btn-sm"
                            onClick={() =>
                              setSelectedInstitutionId(isSelected ? null : inst.id)
                            }
                          >
                            <MapPin size={14} />
                            {isSelected ? 'Selected on Map' : 'Show on Map'}
                          </button>
                        )}
                        <a
                          href={buildViewOnMapsUrl(inst)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn tertiary btn-sm"
                        >
                          <ExternalLink size={14} />
                          View on Google Maps
                        </a>
                        <a
                          href={buildDirectionsUrl(inst, userLocation)}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn primary btn-sm"
                        >
                          <Navigation size={14} />
                          Get Directions
                        </a>
                      </div>
                    </article>
                  );
                })
              ) : (
                <div className="empty inst-empty-state">
                  <Building2 size={32} color="#0f382a" />
                  <h3>No verified institutions listed for this selection yet</h3>
                  <p className="muted" style={{ maxWidth: 480, margin: '8px auto 18px' }}>
                    SkillConnect only displays verified institution details added
                    by administrators or imported from Google Maps—never synthetic
                    data.
                  </p>
                  <div className="hero-actions" style={{ justifyContent: 'center', marginTop: 0 }}>
                    <a
                      href={externalMapsCourseSearchUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn primary"
                    >
                      <ExternalLink size={15} /> Search Nearby on Google Maps
                    </a>
                    {isAdmin && (
                      <Link className="btn tertiary" to="/admin/institutions">
                        Add Verified Institution
                      </Link>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Interactive Google Map Column */}
            <div className="inst-map-column">
              <div className="inst-map-sticky">
                <div className="inst-map-header">
                  <div>
                    <span className="eyebrow" style={{ marginBottom: 2 }}>
                      Interactive Map
                    </span>
                    <h2 style={{ margin: 0, fontSize: 18 }}>
                      Institution Locations
                    </h2>
                  </div>
                </div>
                <InstitutionMap
                  apiKey={mapsApiKey}
                  institutions={filteredInstitutions}
                  selectedId={selectedInstitutionId}
                  onSelectInstitution={setSelectedInstitutionId}
                  userLocation={userLocation}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
