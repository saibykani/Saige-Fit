import { create } from 'zustand';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import { DEMO } from '@/lib/demo';

interface AuthState {
  session: Session | null;
  ready: boolean;
  init: () => () => void;
  signOut: () => Promise<void>;
}

export const useAuth = create<AuthState>((set) => ({
  session: null,
  ready: false,
  init: () => {
    if (DEMO) { set({ session: null, ready: true }); return () => {}; }
    supabase.auth.getSession().then(({ data }) => set({ session: data.session, ready: true }));
    const { data } = supabase.auth.onAuthStateChange((_e, session) => set({ session, ready: true }));
    return () => data.subscription.unsubscribe();
  },
  signOut: async () => {
    if (DEMO) return;
    await supabase.auth.signOut();
    set({ session: null });
  },
}));
