import { useQuery } from '@tanstack/react-query';
import { api } from './api';
import { useAuth } from '@/store/auth';

export interface Me {
  user: { id: string; email: string; full_name: string | null; avatar_path: string | null; privacy_consent_at: string | null; ai_consent_at: string | null };
  onboarded: boolean;
  profile: Record<string, any> | null;
  goal: string | null;
  diet: Record<string, any> | null;
  tier: 'free' | 'pro' | 'premium';
  entitlements: string[];
}

export const ME_KEY = ['me'];

export function useMe() {
  const session = useAuth((s) => s.session);
  return useQuery({ queryKey: [...ME_KEY, session?.user.id], queryFn: () => api<Me>('/v1/me'), enabled: !!session, staleTime: 60_000 });
}

/** True when the user's plan includes `feature` (UI hint only; the server enforces it). */
export function useHasFeature(feature: string) {
  const { data } = useMe();
  return !!data?.entitlements.includes(feature);
}
