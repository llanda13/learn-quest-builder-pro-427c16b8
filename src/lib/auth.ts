import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { User, Session } from '@supabase/supabase-js';

export interface Profile {
  id: string;
  full_name: string;
  role: 'admin' | 'teacher';
  created_at: string;
}

export interface AuthContextType {
  user: User | null;
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  signUp: (email: string, password: string, fullName: string, college?: string) => Promise<{ error: any }>;
  signIn: (email: string, password: string) => Promise<{ error: any }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export const useAuthState = () => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    // Set up auth state listener FIRST so we never miss an event.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, nextSession) => {
        if (!mounted) return;

        // Hard boundary on sign-out: purge all in-memory state AND force a
        // full reload so no previous user's data can leak into the next
        // render (React Query cache, component state, refs, etc.).
        if (event === 'SIGNED_OUT') {
          setSession(null);
          setUser(null);
          setProfile(null);
          setLoading(false);
          if (typeof window !== 'undefined' && window.location.pathname !== '/auth') {
            window.location.replace('/auth');
          }
          return;
        }

        setSession(nextSession);
        setUser(nextSession?.user ?? null);

        if (nextSession?.user) {
          // Defer the profile fetch out of the auth callback (Supabase best practice).
          const uid = nextSession.user.id;
          setTimeout(() => {
            supabase
              .from('profiles')
              .select('id, full_name')
              .eq('id', uid)
              .single()
              .then(({ data }) => {
                if (!mounted) return;
                // Guard: only apply if this is still the active user.
                if (data && data.id === uid) {
                  setProfile({
                    ...data,
                    role: 'teacher', // Actual role fetched by useUserRole hook
                    created_at: new Date().toISOString()
                  });
                }
              });
          }, 0);
        } else {
          setProfile(null);
        }
        setLoading(false);
      }
    );

    // THEN check for an existing session (re-validate with the auth server
    // via getUser so a stale/forged token in localStorage can't impersonate).
    (async () => {
      const { data: { session: existing } } = await supabase.auth.getSession();
      if (!mounted) return;
      if (!existing) {
        setLoading(false);
        return;
      }
      const { data: userData, error: userErr } = await supabase.auth.getUser();
      if (!mounted) return;
      if (userErr || !userData?.user) {
        // Token invalid/expired — clear it so no ghost session lingers.
        await supabase.auth.signOut({ scope: 'local' });
        setSession(null);
        setUser(null);
        setProfile(null);
        setLoading(false);
        return;
      }
      setSession(existing);
      setUser(userData.user);
      setLoading(false);
    })();

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);


  const signUp = async (email: string, password: string, fullName: string, college?: string) => {
    const redirectUrl = `${window.location.origin}/`;
    
    const { error, data } = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: fullName,
          college: college || ''
        }
      }
    });

    // Update college in profile if provided
    if (!error && data?.user && college) {
      await supabase
        .from('profiles')
        .update({ college })
        .eq('id', data.user.id);
    }

    return { error };
  };

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password
    });
    return { error };
  };

  const signOut = async () => {
    // 'local' scope: only this browser/device is signed out — never touches
    // other users' sessions on other devices. Then hard-clear in-memory
    // state and any per-user cached drafts so no data can leak into the
    // next login on this browser.
    try {
      await supabase.auth.signOut({ scope: 'local' });
    } catch (e) {
      console.warn('signOut error (continuing to purge local state):', e);
    }
    setUser(null);
    setSession(null);
    setProfile(null);
    try {
      // Best-effort purge of Supabase auth token(s) in case the SDK left any.
      Object.keys(window.localStorage)
        .filter((k) => k.startsWith('sb-') && k.endsWith('-auth-token'))
        .forEach((k) => window.localStorage.removeItem(k));
    } catch { /* noop */ }
    if (typeof window !== 'undefined') {
      window.location.replace('/auth');
    }
  };

  const refreshProfile = async () => {
    const currentUser = user || (await supabase.auth.getUser()).data.user;
    if (!currentUser) return;
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('id', currentUser.id)
      .single();
    if (data) {
      setProfile({
        ...data,
        role: profile?.role || 'teacher',
        created_at: profile?.created_at || new Date().toISOString()
      });
    }
  };

  return {
    user,
    session,
    profile,
    loading,
    signUp,
    signIn,
    signOut,
    refreshProfile
  };
};