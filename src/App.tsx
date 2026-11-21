import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { ErrorBoundary } from './components/ErrorBoundary';
import { Layout } from './components/Layout';
import { FirebaseProvider } from './context/FirebaseContext';
import { AdminAccessPage } from './pages/AdminAccessPage';
import { AdminAttendancePage } from './pages/AdminAttendancePage';
import { AdminCertificatesPage } from './pages/AdminCertificatesPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { AdminReportsPage } from './pages/AdminReportsPage';
import { AdminWorkshopsPage } from './pages/AdminWorkshopsPage';
import { CertificateViewPage } from './pages/CertificateViewPage';
import { FeedbackPage } from './pages/FeedbackPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { QrAttendancePage } from './pages/QrAttendancePage';
import { RegisterPage } from './pages/RegisterPage';
import { WorkshopsPage } from './pages/WorkshopsPage';

export default function App() {
  return (
    <ErrorBoundary>
      <FirebaseProvider>
        <BrowserRouter>
          <Layout>
            <Routes>
              <Route path="/" element={<HomePage />} />
              <Route path="/workshops" element={<WorkshopsPage />} />
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
