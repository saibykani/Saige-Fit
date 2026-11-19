/** All dates are the user's LOCAL calendar day, formatted YYYY-MM-DD (matches the API contract). */
export function toISODate(d: Date): string {
  const m = `${d.getMonth() + 1}`.padStart(2, '0');
  const day = `${d.getDate()}`.padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

export function fromISODate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, (m ?? 1) - 1, d ?? 1);
}

export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export const todayISO = () => toISODate(new Date());

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const dowShort = (d: Date) => DOW[d.getDay()];

export function prettyDay(iso: string): string {
  const t = todayISO();
  if (iso === t) return 'Today';
  if (iso === toISODate(addDays(new Date(), -1))) return 'Yesterday';
  const d = fromISODate(iso);
  return d.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  return h < 5 ? 'Late night' : h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}
