import jsQR from 'jsqr';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type FormEvent
} from 'react';
import { Link } from 'react-router-dom';
import { QrCodeImage } from '../components/QrCodeImage';
import { useFirebase } from '../context/FirebaseContext';
import type {
  AttendanceRecord,
  AttendanceStatus,
  CertificateRecord,
  Registration,
  SessionRecord
} from '../types';

interface ScanOutcome {
  ok: boolean;
  duplicate?: boolean;
  message: string;
  participantName?: string;
  workshopName?: string;
  certificateCode?: string;
  markedAt?: string;
}

export function AdminAttendancePage() {
  const { user, authReady, isAdmin, signInWithGoogle, authFetch } =
    useFirebase();

  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<number>(0);
  const [registrations, setRegistrations] = useState<Registration[]>([]);
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([]);
  const [draftStatus, setDraftStatus] = useState<
    Record<number, AttendanceStatus>
  >({});
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // QR scanner states
  const [manualToken, setManualToken] = useState('');
  const [restrictToSession, setRestrictToSession] = useState(true);
  const [scanningApi, setScanningApi] = useState(false);
  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [scanOutcome, setScanOutcome] = useState<ScanOutcome | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const scanBusyRef = useRef(false);
  const lastScannedRef = useRef<{ token: string; at: number }>({
    token: '',
    at: 0
  });

  const loadData = useCallback(async () => {
    try {
      const res = await authFetch('/api/admin/overview');
      if (!res.ok) throw new Error('Unable to load attendance tracker.');
      const data = (await res.json()) as {
        sessions: SessionRecord[];
        registrations: Registration[];
        attendance: AttendanceRecord[];
      };
      setSessions(data.sessions);
      setRegistrations(data.registrations);
      setAttendance(data.attendance);
      setSelectedSessionId((prev) =>
        prev || (data.sessions.length > 0 ? data.sessions[0].id : 0)
      );
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Unable to load attendance.'
      );
    }
  }, [authFetch]);

  useEffect(() => {
    if (!authReady || !isAdmin) return;
    void loadData();
  }, [authReady, isAdmin, loadData]);

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId]
  );

  const sessionRegistrations = useMemo(() => {
    if (!activeSession) return [];
    return registrations
      .filter(
        (r) =>
          r.workshopId === activeSession.workshopId && r.status === 'confirmed'
      )
      .sort((a, b) =>
        (a.participantName || '').localeCompare(b.participantName || '')
      );
  }, [activeSession, registrations]);

  useEffect(() => {
    if (!activeSession) return;
    const nextDraft: Record<number, AttendanceStatus> = {};
    for (const reg of sessionRegistrations) {
      const existing = attendance.find(
        (a) => a.sessionId === activeSession.id && a.registrationId === reg.id
      );
      if (existing) {
        nextDraft[reg.id] = existing.status;
      }
    }
    setDraftStatus(nextDraft);
  }, [activeSession, sessionRegistrations, attendance]);

  const submitScannedPayload = useCallback(
    async (rawPayload: string) => {
      if (scanBusyRef.current) return;
      const trimmed = rawPayload.trim();
      if (!trimmed) return;

      scanBusyRef.current = true;
      setScanningApi(true);
      setCameraError(null);
      try {
        const res = await authFetch('/api/admin/attendance/scan', {
          method: 'POST',
          body: JSON.stringify({
            payload: trimmed,
            sessionId:
              restrictToSession && activeSession ? activeSession.id : undefined
          })
        });

        const data = (await res.json()) as {
          error?: string;
          duplicate?: boolean;
          participantName?: string;
          workshopName?: string;
          markedAt?: string;
          certificate?: CertificateRecord;
          newlyIssued?: boolean;
        };

        if (res.status === 409 && data.duplicate) {
          setScanOutcome({
            ok: false,
            duplicate: true,
            participantName: data.participantName,
            workshopName: data.workshopName,
            markedAt: data.markedAt,
            certificateCode: data.certificate?.certificateCode,
            message:
              data.error ||
              'Duplicate attendance prevented: participant was already marked present.'
          });
          return;
        }

        if (!res.ok) {
          setScanOutcome({
            ok: false,
            message: data.error || 'Could not verify QR code.'
          });
          return;
        }

        setScanOutcome({
          ok: true,
          participantName: data.participantName,
          workshopName: data.workshopName,
          markedAt: data.markedAt,
          certificateCode: data.certificate?.certificateCode,
          message: `${data.participantName} marked present for ${data.workshopName}.${
            data.newlyIssued
              ? ` Completion certificate ${data.certificate?.certificateCode} auto-issued.`
              : data.certificate
                ? ` Certificate ${data.certificate.certificateCode} ready.`
                : ''
          }`
        });
        setManualToken('');
        await loadData();
      } catch (err) {
        setScanOutcome({
          ok: false,
          message:
            err instanceof Error ? err.message : 'Failed to process QR scan.'
        });
      } finally {
        scanBusyRef.current = false;
        setScanningApi(false);
      }
    },
    [authFetch, restrictToSession, activeSession, loadData]
  );

  const startCamera = async () => {
    setCameraError(null);
    if (!navigator.mediaDevices?.getUserMedia) {
      setCameraError(
        'Camera access is unavailable in this browser. Use QR image upload or enter the pass token below.'
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' } },
        audio: false
      });
      streamRef.current = stream;
      setCameraActive(true);

      requestAnimationFrame(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          void videoRef.current.play();
        }
      });

      const tick = () => {
        const video = videoRef.current;
        const canvas = canvasRef.current;
        if (
          video &&
          canvas &&
          video.readyState === video.HAVE_ENOUGH_DATA &&
          video.videoWidth > 0
        ) {
          canvas.width = video.videoWidth;
          canvas.height = video.videoHeight;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const imageData = ctx.getImageData(
              0,
              0,
              canvas.width,
              canvas.height
            );
            const decoded = jsQR(
              imageData.data,
              imageData.width,
              imageData.height
            );
            if (decoded?.data) {
              const now = Date.now();
              const isSameRecent =
                lastScannedRef.current.token === decoded.data &&
                now - lastScannedRef.current.at < 3500;
              if (!isSameRecent && !scanBusyRef.current) {
                lastScannedRef.current = { token: decoded.data, at: now };
                void submitScannedPayload(decoded.data);
              }
            }
          }
        }
        if (streamRef.current) {
          rafRef.current = requestAnimationFrame(tick);
        }
      };

      rafRef.current = requestAnimationFrame(tick);
    } catch {
      stopCamera();
      setCameraError(
        'Camera permission was denied or no camera device was found. You can still upload a QR image or enter the SC-REG token manually.'
      );
    }
  };

  const handleQrImageUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setCameraError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const canvas = canvasRef.current || document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.drawImage(img, 0, 0);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const decoded = jsQR(imageData.data, imageData.width, imageData.height);
        if (!decoded?.data) {
          setScanOutcome({
            ok: false,
            message:
              'Could not detect a valid QR code in that image. Try entering the SC-REG token directly.'
          });
          return;
        }
        void submitScannedPayload(decoded.data);
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  };

  const handleManualScanSubmit = (e: FormEvent) => {
    e.preventDefault();
    void submitScannedPayload(manualToken);
  };

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

  const handleSave = async (e: FormEvent) => {
    e.preventDefault();
    if (!activeSession) return;

    setSavedMsg(null);
    setErrorMsg(null);
    setSaving(true);
    try {
      const entries = Object.entries(draftStatus).map(
        ([registrationId, status]) => ({
          registrationId: Number(registrationId),
          status
        })
      );
      const res = await authFetch('/api/admin/attendance', {
        method: 'POST',
        body: JSON.stringify({
          sessionId: activeSession.id,
          entries
        })
      });
      const data = (await res.json()) as {
        error?: string;
        saved?: number;
        newlyCertified?: number;
      };
      if (!res.ok) {
        setErrorMsg(data.error || 'Could not save attendance.');
        return;
      }
      const certNote =
        data.newlyCertified && data.newlyCertified > 0
          ? ` ${data.newlyCertified} completion certificate(s) automatically issued.`
          : '';
      setSavedMsg(`Attendance saved.${certNote}`);
      await loadData();
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Failed to save attendance.'
      );
    } finally {
      setSaving(false);
    }
  };

  const qrUrl = activeSession
    ? `${window.location.origin}/qr/${activeSession.qrToken}`
    : '';

  return (
    <section className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <span className="eyebrow">QR Check-in &amp; Roster</span>
            <h1>Attendance tracker</h1>
          </div>
          <Link className="btn tertiary" to="/admin">
            Dashboard
          </Link>
        </div>

        <div className="filters">
          <select
            value={selectedSessionId}
            onChange={(e) => {
              setSavedMsg(null);
              setSelectedSessionId(Number(e.target.value));
            }}
          >
            {sessions.map((s) => (
              <option key={s.id} value={s.id}>
                {s.workshopName} — {s.sessionDate}
              </option>
            ))}
          </select>
        </div>

        {/* Admin QR Scanner Panel */}
        <div className="panel" style={{ marginBottom: 24 }}>
          <div className="section-heading" style={{ marginBottom: 14 }}>
            <div>
              <span className="eyebrow">Participant Pass Scanner</span>
              <h2 style={{ margin: 0, fontSize: 22 }}>
                Scan Participant QR Code
              </h2>
            </div>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              {!cameraActive ? (
                <button
                  type="button"
                  className="btn primary"
                  onClick={() => void startCamera()}
                >
                  Start Camera Scanner
                </button>
              ) : (
                <button
                  type="button"
                  className="btn danger"
                  style={{ height: 44, padding: '0 18px', fontSize: 14 }}
                  onClick={stopCamera}
                >
                  Stop Camera
                </button>
              )}
              <label
                className="btn tertiary"
                style={{ marginBottom: 0, cursor: 'pointer' }}
              >
                Upload QR Image
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleQrImageUpload}
                  style={{ display: 'none' }}
                />
              </label>
            </div>
          </div>

          <p className="muted" style={{ marginTop: 0 }}>
            Scan a participant&apos;s personal QR pass to automatically mark them
            present, prevent duplicate check-ins, and issue their completion
            certificate.
          </p>

          <label className="checkbox-inline">
            <input
              type="checkbox"
              checked={restrictToSession}
              onChange={(e) => setRestrictToSession(e.target.checked)}
            />
            <span>
              Restrict scan to selected session (
              {activeSession?.workshopName || 'Current'})
            </span>
          </label>

          {cameraError && <div className="alert error">{cameraError}</div>}

          {cameraActive && (
            <div className="scanner-viewport">
              <video
                ref={videoRef}
                playsInline
                muted
                className="scanner-video"
              />
            </div>
          )}
          <canvas ref={canvasRef} style={{ display: 'none' }} />

          <form
            className="scanner-manual-form"
            onSubmit={(e) => void handleManualScanSubmit(e)}
          >
            <input
              type="text"
              placeholder="Or enter / paste participant QR token (e.g. SC-REG-...)"
              value={manualToken}
              onChange={(e) => setManualToken(e.target.value)}
            />
            <button
              type="submit"
              className="btn secondary"
              disabled={scanningApi || !manualToken.trim()}
            >
              {scanningApi ? 'Verifying...' : 'Mark Present'}
            </button>
          </form>

          {scanOutcome && (
            <div
              className={`alert ${scanOutcome.ok ? 'success' : 'error'}`}
              style={{ marginBottom: 0 }}
            >
              <strong>
                {scanOutcome.ok
                  ? 'Attendance Confirmed'
                  : scanOutcome.duplicate
                    ? 'Duplicate Attendance Prevented'
                    : 'Scan Failed'}
                :
              </strong>{' '}
              {scanOutcome.message}
              {scanOutcome.markedAt && (
                <span style={{ display: 'block', fontSize: 12, marginTop: 4 }}>
                  Recorded at {new Date(scanOutcome.markedAt).toLocaleString()}
                </span>
              )}
              {scanOutcome.certificateCode && (
                <span style={{ display: 'block', marginTop: 6 }}>
                  <Link
                    className="text-link"
                    to={`/certificate/${scanOutcome.certificateCode}`}
                  >
                    View / Download Certificate {scanOutcome.certificateCode} →
                  </Link>
                </span>
              )}
            </div>
          )}
        </div>

        {activeSession ? (
          <div className="admin-grid">
            <form className="panel" onSubmit={(e) => void handleSave(e)}>
              <h2>{activeSession.workshopName} Roster</h2>
              {savedMsg && <div className="alert success">{savedMsg}</div>}
              {errorMsg && <div className="alert error">{errorMsg}</div>}
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th className="radio-cell">Present</th>
                      <th className="radio-cell">Absent</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sessionRegistrations.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <strong>{r.participantName}</strong>
                          <small>{r.email || r.userUid}</small>
                          {r.checkinToken && (
                            <small className="tabular-nums">
                              Pass: {r.checkinToken}
                            </small>
                          )}
                        </td>
                        <td className="radio-cell">
                          <input
                            type="radio"
                            name={`status_${r.id}`}
                            checked={draftStatus[r.id] === 'present'}
                            onChange={() =>
                              setDraftStatus((prev) => ({
                                ...prev,
                                [r.id]: 'present'
                              }))
                            }
                          />
                        </td>
                        <td className="radio-cell">
                          <input
                            type="radio"
                            name={`status_${r.id}`}
                            checked={draftStatus[r.id] === 'absent'}
                            onChange={() =>
                              setDraftStatus((prev) => ({
                                ...prev,
                                [r.id]: 'absent'
                              }))
                            }
                          />
                        </td>
                      </tr>
                    ))}
                    {sessionRegistrations.length === 0 && (
                      <tr>
                        <td colSpan={3} className="muted">
                          No confirmed participants for this workshop yet.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              <button
                type="submit"
                className="btn primary full"
                disabled={saving || sessionRegistrations.length === 0}
              >
                {saving ? 'Saving...' : 'Save attendance'}
              </button>
            </form>

            <div className="panel qr-panel">
              <h2>Session Check-in QR</h2>
              <QrCodeImage
                value={qrUrl}
                size={210}
                alt="Session QR code"
              />
              <p className="muted">
                Participants can also scan this session QR code with their
                phone to self-check-in after Google sign-in.
              </p>
              <Link className="text-link" to={`/qr/${activeSession.qrToken}`}>
                Open QR Check-in Link →
              </Link>
            </div>
          </div>
        ) : (
          <div className="empty">No workshop sessions.</div>
        )}
      </div>
    </section>
  );
}
