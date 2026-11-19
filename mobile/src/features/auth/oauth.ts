import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

export const AUTH_REDIRECT = () => Linking.createURL('auth-callback');

export type OAuthResult = 'signed-in' | 'cancelled' | 'unavailable';

/** Google / Apple sign-in through Supabase's hosted OAuth flow. Providers must be enabled in the Supabase dashboard. */
export async function signInWithProvider(provider: 'google' | 'apple'): Promise<OAuthResult> {
  const redirectTo = AUTH_REDIRECT();
  const { data, error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) return 'unavailable';
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return 'cancelled';

  const url = new URL(res.url);
  const code = url.searchParams.get('code');
  if (code) {
    const { error: e } = await supabase.auth.exchangeCodeForSession(code);
    return e ? 'unavailable' : 'signed-in';
  }
  const frag = new URLSearchParams(url.hash.replace(/^#/, ''));
  const access_token = frag.get('access_token');
  const refresh_token = frag.get('refresh_token');
  if (access_token && refresh_token) {
    const { error: e } = await supabase.auth.setSession({ access_token, refresh_token });
    return e ? 'unavailable' : 'signed-in';
  }
  return 'unavailable';
}
