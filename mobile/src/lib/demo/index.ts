import { DemoError, type Route } from './types';
import { store } from './store';
import { nutritionRoutes } from './nutrition';
import { trainingRoutes } from './training';
import { miscRoutes } from './misc';
import { analyticsRoutes } from './analytics';

/** Demo mode: the app runs fully on-device with sample data, no login and no backend. */
export const DEMO = process.env.EXPO_PUBLIC_DEMO === '1' || process.env.EXPO_PUBLIC_PREVIEW === '1';

const routes: Route[] = [...miscRoutes, ...nutritionRoutes, ...trainingRoutes, ...analyticsRoutes];

function match(pattern: string, segs: string[]): Record<string, string> | null {
  const p = pattern.split('/').filter(Boolean);
  if (p.length !== segs.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < p.length; i++) {
    if (p[i].startsWith(':')) params[p[i].slice(1)] = decodeURIComponent(segs[i]);
    else if (p[i] !== segs[i]) return null;
  }
  return params;
}

export async function demoRequest<T>(method: string, rawPath: string, body?: unknown): Promise<T> {
  const [path, qs = ''] = rawPath.split('?');
  const query: Record<string, string> = {};
  new URLSearchParams(qs).forEach((v, k) => { query[k] = v; });
  const segs = path.split('/').filter(Boolean);
  for (const r of routes) {
    if (r.method !== method.toUpperCase()) continue;
    const params = match(r.path, segs);
    if (!params) continue;
    try {
      await new Promise((res) => setTimeout(res, 120)); // feels like a network call, shows loading states
      const out = await r.handler({ params, query, body: body ?? {}, store });
      return (out === undefined ? undefined : JSON.parse(JSON.stringify(out))) as T;
    } catch (e) {
      if (e instanceof DemoError) throw e;
      throw new DemoError(500, 'Demo data error: ' + (e as Error).message);
    }
  }
  throw new DemoError(404, `Not available in demo mode: ${method} ${path}`);
}
