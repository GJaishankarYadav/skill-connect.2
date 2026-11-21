import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User
} from 'firebase/auth';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode
} from 'react';
import { ADMIN_EMAIL, auth, googleProvider } from '../firebase';
import type { CertificateRecord, Registration, UserProfile } from '../types';

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  signingIn: boolean;
  isAdmin: boolean;
  isOwner: boolean;
  profile: UserProfile | null;
  myRegistrations: Registration[];
  myCertificates: CertificateRecord[];
  authError: string | null;
  signInWithGoogle: () => Promise<void>;
  signOutUser: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  authFetch: (input: string, init?: RequestInit) => Promise<Response>;
}

const FirebaseContext = createContext<FirebaseContextValue | undefined>(
  undefined
);

function formatFirebaseAuthError(error: unknown): string {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code)
      : '';

  switch (code) {
    case 'auth/popup-closed-by-user':
      return 'Sign-in pop-up was closed before completing login. Please try again.';
    case 'auth/cancelled-popup-request':
      return 'Sign-in request was cancelled because another pop-up is already open.';
    case 'auth/popup-blocked':
      return 'Pop-up was blocked by your browser. Please allow pop-ups for this site and try again.';
    case 'auth/unauthorized-domain':
      return 'This domain is not authorized for Google Sign-In in Firebase Authentication settings.';
    case 'auth/network-request-failed':
      return 'Network error while connecting to Google Sign-In. Please check your connection and retry.';
    default:
      return error instanceof Error ? error.message : 'Google Sign-In failed.';
  }
}

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [signingIn, setSigningIn] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [myRegistrations, setMyRegistrations] = useState<Registration[]>([]);
  const [myCertificates, setMyCertificates] = useState<CertificateRecord[]>([]);
  const [authError, setAuthError] = useState<string | null>(null);
  const idTokenRef = useRef<string | null>(null);
  const signingInRef = useRef(false);

  const authFetch = useCallback(
    async (input: string, init: RequestInit = {}): Promise<Response> => {
      const currentUser = auth.currentUser;
      let token = idTokenRef.current;
      if (currentUser) {
        token = await currentUser.getIdToken();
        idTokenRef.current = token;
      }

      const headers = new Headers(init.headers);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      if (init.body && !headers.has('Content-Type')) {
        headers.set('Content-Type', 'application/json');
      }

      return fetch(input, { ...init, headers });
    },
    []
  );

  const loadMe = useCallback(async (activeUser: User) => {
    const token = await activeUser.getIdToken();
    idTokenRef.current = token;
    const res = await fetch('/api/me', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) {
      throw new Error('Failed to load profile.');
    }
    const data = (await res.json()) as {
      profile: UserProfile | null;
      registrations: Registration[];
      certificates: CertificateRecord[];
      isAdmin: boolean;
      isOwner: boolean;
    };
    setProfile(data.profile);
    setMyRegistrations(data.registrations);
    setMyCertificates(data.certificates);

    const ownerMatch =
      Boolean(activeUser.emailVerified) &&
      activeUser.email?.toLowerCase() === ADMIN_EMAIL;
    setIsOwner(Boolean(data.isOwner) || ownerMatch);
    setIsAdmin(Boolean(data.isAdmin) || ownerMatch);
  }, []);

  const refreshProfile = useCallback(async () => {
    if (auth.currentUser) {
      await loadMe(auth.currentUser);
    }
  }, [loadMe]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      setUser(nextUser);
      setAuthError(null);

      if (!nextUser) {
        idTokenRef.current = null;
        setIsAdmin(false);
        setIsOwner(false);
        setProfile(null);
        setMyRegistrations([]);
        setMyCertificates([]);
        setAuthReady(true);
        return;
      }

      try {
        await loadMe(nextUser);
      } catch (err) {
        console.error('Failed to synchronize account:', err);
        const ownerMatch =
          Boolean(nextUser.emailVerified) &&
          nextUser.email?.toLowerCase() === ADMIN_EMAIL;
        setIsOwner(ownerMatch);
        setIsAdmin(ownerMatch);
      } finally {
        setAuthReady(true);
      }
    });

    return () => unsubscribe();
  }, [loadMe]);

  const signInWithGoogle = useCallback(async () => {
    if (signingInRef.current) return;
    signingInRef.current = true;
    setSigningIn(true);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (error) {
      setAuthError(formatFirebaseAuthError(error));
    } finally {
      signingInRef.current = false;
      setSigningIn(false);
    }
  }, []);

  const signOutUser = useCallback(async () => {
    setAuthError(null);
    idTokenRef.current = null;
    await signOut(auth);
  }, []);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        signingIn,
        isAdmin,
        isOwner,
        profile,
        myRegistrations,
        myCertificates,
        authError,
        signInWithGoogle,
        signOutUser,
        refreshProfile,
        authFetch
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
}

export function useFirebase(): FirebaseContextValue {
  const ctx = useContext(FirebaseContext);
  if (!ctx) {
    throw new Error('useFirebase must be used inside a FirebaseProvider');
  }
  return ctx;
}
