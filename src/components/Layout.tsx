import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useFirebase } from '../context/FirebaseContext';

export function Layout({ children }: { children: ReactNode }) {
  const { user, isAdmin, isOwner, signOutUser } = useFirebase();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="container nav">
          <Link className="brand" to="/" onClick={() => setMenuOpen(false)}>
            <span className="brand-mark">SC</span>
            <span>SkillConnect</span>
          </Link>
          <button
            type="button"
            className="menu-toggle"
            aria-label="Toggle navigation"
            onClick={() => setMenuOpen((prev) => !prev)}
          >
            ☰
          </button>
          <nav className={`navlinks ${menuOpen ? 'open' : ''}`}>
            <Link to="/" onClick={() => setMenuOpen(false)}>
              Home
            </Link>
            <Link to="/workshops" onClick={() => setMenuOpen(false)}>
              Workshops
            </Link>
            <Link to="/register" onClick={() => setMenuOpen(false)}>
              Register
            </Link>
            <Link to="/feedback" onClick={() => setMenuOpen(false)}>
              Feedback
            </Link>
            {isAdmin && (
              <Link to="/admin" onClick={() => setMenuOpen(false)}>
                Dashboard
              </Link>
            )}
            {isOwner && (
              <Link to="/admin/admins" onClick={() => setMenuOpen(false)}>
                Admin Access
              </Link>
            )}
            {user ? (
              <button
                type="button"
                className="nav-login"
                onClick={() => {
                  setMenuOpen(false);
                  void signOutUser();
                }}
              >
                Logout
              </button>
            ) : (
              <>
                <Link to="/login?role=user" onClick={() => setMenuOpen(false)}>
                  User Login
                </Link>
                <Link
                  className="nav-login"
                  to="/login?role=admin"
                  onClick={() => setMenuOpen(false)}
                >
                  Admin Login
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      <main>{children}</main>

      <footer className="footer">
        <div className="container footer-grid">
          <div>
            <div className="brand footer-brand">
              <span className="brand-mark">SC</span>
              <span>SkillConnect</span>
            </div>
            <p>Community learning that creates practical futures.</p>
          </div>
          <div>
            <strong>Contact</strong>
            <p>
              hello@skillconnect.org
              <br />
              +1 (555) 839-2041
            </p>
          </div>
        </div>
        <div className="container copyright">
          © {new Date().getFullYear()} SkillConnect Community
        </div>
      </footer>
    </div>
  );
}
