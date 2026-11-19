export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());

export interface Strength { score: 0 | 1 | 2 | 3 | 4; label: string }

/** Lightweight password strength hint (length + character variety). The server/Supabase enforce the real policy. */
export function passwordStrength(pw: string): Strength {
  if (!pw) return { score: 0, label: '' };
  let s = 0;
  if (pw.length >= 8) s++;
  if (pw.length >= 12) s++;
  if (/[a-z]/.test(pw) && /[A-Z]/.test(pw)) s++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s++;
  const score = Math.min(4, s) as 0 | 1 | 2 | 3 | 4;
  return { score, label: ['Too weak', 'Weak', 'Okay', 'Good', 'Strong'][score] };
}

/** Map Supabase auth errors to friendly copy. */
export function authMessage(e: unknown): string {
  const m = (e instanceof Error ? e.message : String(e ?? '')).toLowerCase();
  if (m.includes('invalid login')) return 'Incorrect email or password.';
  if (m.includes('not confirmed')) return 'Please verify your email first. Check your inbox.';
  if (m.includes('already registered') || m.includes('already been registered')) return 'An account with this email already exists. Try signing in.';
  if (m.includes('rate limit') || m.includes('too many')) return 'Too many attempts. Please wait a minute and try again.';
  if (m.includes('network') || m.includes('fetch')) return 'Network error. Check your connection and try again.';
  if (m.includes('password')) return 'Password must be at least 8 characters.';
  return 'Something went wrong. Please try again.';
}
