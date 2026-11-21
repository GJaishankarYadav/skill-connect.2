import { useEffect, useState } from 'react';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { FirebaseProvider } from './context/FirebaseContext';
import { AdminAccessPage } from './pages/AdminAccessPage';
import { AdminAttendancePage } from './pages/AdminAttendancePage';
import { AdminCertificatesPage } from './pages/AdminCertificatesPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminInstitutionsPage } from './pages/AdminInstitutionsPage';
import { AdminReportsPage } from './pages/AdminReportsPage';
import { AdminWorkshopsPage } from './pages/AdminWorkshopsPage';
import { CertificateViewPage } from './pages/CertificateViewPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { QrAttendancePage } from './pages/QrAttendancePage';
import { RegisterPage } from './pages/RegisterPage';
import { TrainingInstitutionsPage } from './pages/TrainingInstitutionsPage';
import { WorkshopsPage } from './pages/WorkshopsPage';

export default function App() {
  const [gmpQuotaExceeded, setGmpQuotaExceeded] = useState(false);

  useEffect(() => {
    const handler = () => setGmpQuotaExceeded(true);
    window.addEventListener('gmp-quota-exceeded', handler);
    return () => window.removeEventListener('gmp-quota-exceeded', handler);
  }, []);

  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <BrowserRouter>
          {gmpQuotaExceeded && (
            <div className="gmp-quota-banner" role="alert">
              <span>
                Google Maps Platform quota reached. If you are the app owner,
                visit{' '}
                <a
                  href="https://developers.google.com/maps/ai/ai-studio?utm_campaign=gmp_mcp_codeassist_v1_aistudio#quota_exceeded_errors"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  maps developer site
                </a>{' '}
                for instructions to update your account.
              </span>
            </div>
          )}
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/workshops" element={<WorkshopsPage />} />
              <Route
                path="/institutions"
                element={<TrainingInstitutionsPage />}
              />
              <Route path="/register" element={<RegisterPage />} />
              <Route path="/feedback" element={<FeedbackPage />} />
              <Route path="/login" element={<LoginPage />} />
              <Route path="/qr/:token" element={<QrAttendancePage />} />
              <Route
                path="/certificate/:code"
                element={<CertificateViewPage />}
              />
              <Route path="/admin" element={<AdminDashboardPage />} />
              <Route path="/admin/admins" element={<AdminAccessPage />} />
              <Route
                path="/admin/workshops"
                element={<AdminWorkshopsPage />}
              />
              <Route
                path="/admin/institutions"
                element={<AdminInstitutionsPage />}
              />
              <Route path="/attendance" element={<AdminAttendancePage />} />
              <Route path="/admin/reports" element={<AdminReportsPage />} />
              <Route
                path="/admin/certificates"
                element={<AdminCertificatesPage />}
              />
              <Route path="*" element={<HomePage />} />
            </Routes>
          </Layout>
        </BrowserRouter>
      </FirebaseProvider>
    </ErrorBoundary>
  );
}
