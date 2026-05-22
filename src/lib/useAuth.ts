import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '../lib/supabase';
import type { Database } from './database.types';
import type { User } from '@supabase/supabase-js';

type Profile = Database['public']['Tables']['profiles']['Row'];

/** Inactivity timeout in milliseconds (15 minutes) */
const INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
/** Warning before timeout in milliseconds (2 minutes before) */
const WARNING_BEFORE_MS = 2 * 60 * 1000;

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionWarning, setSessionWarning] = useState(false);

  // Inactivity timer refs
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const warningRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Ref to avoid stale closure in timer callbacks — always reflects latest user
  const userRef = useRef(user);
  userRef.current = user;

  /** Sign out due to inactivity */
  const inactivitySignOut = useCallback(async () => {
    setSessionWarning(false);
    setUser(null);
    setProfile(null);
    await supabase.auth.signOut();
  }, []);

  /** Reset the inactivity timer on user interaction */
  const resetInactivityTimer = useCallback(() => {
    // Clear existing timers
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    if (warningRef.current) clearTimeout(warningRef.current);

    // Don't set timers if no user is logged in (read from ref to avoid stale closure)
    if (!userRef.current) return;

    // Dismiss any active warning
    setSessionWarning(false);

    // Set warning timer (fires 2 minutes before logout)
    warningRef.current = setTimeout(() => {
      setSessionWarning(true);
    }, INACTIVITY_TIMEOUT_MS - WARNING_BEFORE_MS);

    // Set logout timer
    timeoutRef.current = setTimeout(() => {
      inactivitySignOut();
    }, INACTIVITY_TIMEOUT_MS);
  }, [inactivitySignOut]);

  // Set up inactivity listeners
  useEffect(() => {
    if (!user) {
      setSessionWarning(false);
      return;
    }

    const events = ['mousedown', 'keydown', 'scroll', 'touchstart'] as const;
    const handler = () => resetInactivityTimer();

    events.forEach(e => window.addEventListener(e, handler, { passive: true }));
    resetInactivityTimer(); // Start the timer

    return () => {
      events.forEach(e => window.removeEventListener(e, handler));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (warningRef.current) clearTimeout(warningRef.current);
    };
  }, [user, resetInactivityTimer]);

  useEffect(() => {
    // Check active sessions and sets the user
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        fetchProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    // Listen for changes on auth state (logged in, signed out, etc.)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // Handle expired/invalid refresh tokens gracefully
        if (event === 'TOKEN_REFRESHED' && !session) {
          // Token refresh failed — clear stale state
          setUser(null);
          setProfile(null);
          setLoading(false);
          supabase.auth.signOut();
          return;
        }

        setUser(session?.user ?? null);
         if (session?.user) {
          fetchProfile(session.user.id);
          // Signal React Query caches to refetch on token refresh (profile/role may have changed)
          if (event === 'TOKEN_REFRESHED') {
            window.dispatchEvent(new CustomEvent('noc:profile-updated'));
          }
        } else {
          setProfile(null);
          setLoading(false);
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, role, email, department_id, semester_id, roll_number, section, tenant_id, theme, is_platform_admin, avatar_url, batch, created_at, created_by, status')
        .eq('id', userId)
        .single();

      if (error) {
        // Handle expired JWTs explicitly by wiping state and forcing sign out
        if (error.code === 'PGRST303' || error.code === 'PGRST116' || error.message?.toLowerCase().includes('jwt') || error.message?.toLowerCase().includes('unauthorized')) {
          console.warn('Auth token expired or invalid. Forcing logout to clear state.');
          setUser(null);
          setProfile(null);
          await supabase.auth.signOut();
          return;
        }
        throw error;
      }
      setProfile(data);
    } catch (error) {
      console.error('Error fetching profile:', error);
    } finally {
      setLoading(false);
    }
  };

  /** Dismiss the session warning and reset the timer */
  const dismissSessionWarning = useCallback(() => {
    setSessionWarning(false);
    resetInactivityTimer();
  }, [resetInactivityTimer]);

  return { user, profile, loading, sessionWarning, dismissSessionWarning };
}
