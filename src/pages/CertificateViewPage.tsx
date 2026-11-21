import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import type { CertificateRecord } from '../types';

export function CertificateViewPage() {
  const { code = '' } = useParams();
  const [cert, setCert] = useState<CertificateRecord | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const cleanCode = code.trim().toUpperCase();
    if (!cleanCode) {
      setLoading(false);
      return;
    }

    fetch(`/api/certificates/${encodeURIComponent(cleanCode)}`)
      .then(async (res) => {
        if (!res.ok) return null;
        const data = (await res.json()) as { certificate: CertificateRecord };
        return data.certificate;
      })
      .then((item) => setCert(item))
      .catch(() => setCert(null))
      .finally(() => setLoading(false));
  }, [code]);

  return (
    <section className="section">
      <div className="container narrow">
        {loading ? (
          <div className="empty">Loading certificate...</div>
        ) : cert ? (
          <>
            <div className="certificate">
              <span className="eyebrow">SkillConnect Community</span>
              <h1>Certificate of Completion</h1>
              <p>This is to certify that</p>
              <h2>{cert.participantName}</h2>
              <p>has successfully completed</p>
              <h3>{cert.workshopName}</h3>
              <p>
                Issued {new Date(cert.issuedAt).toLocaleDateString()} ·{' '}
                {cert.certificateCode}
              </p>
            </div>
            <button
              type="button"
              className="btn primary full"
              onClick={() => window.print()}
            >
              Download / Print PDF
            </button>
          </>
        ) : (
          <div className="form-card">
            <h1>Certificate not found</h1>
            <p className="muted">
              No certificate matching that verification code was found.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}
