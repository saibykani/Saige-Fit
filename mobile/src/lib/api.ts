import Constants from 'expo-constants';
import { supabase } from './supabase';
import { DEMO, demoRequest } from './demo';
import { DemoError } from './demo/types';

async function demo<T>(method: string, path: string, body?: unknown): Promise<T> {
  try { return await demoRequest<T>(method, path, body); }
  catch (e) { if (e instanceof DemoError) throw new ApiError(e.status, e.message); throw e; }
}

const BASE = (Constants.expoConfig?.extra?.apiUrl as string | undefined) ?? process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:8000';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

async function authHeader(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, init);
  } catch {
    throw new ApiError(0, 'Network error. Check your connection and try again.');
  }
  if (!res.ok) {
    const detail = await res.json().then((j) => j.detail).catch(() => undefined);
    const fallback = res.status === 429 ? 'Too many requests. Please wait a moment.' : `Request failed (${res.status})`;
    throw new ApiError(res.status, typeof detail === 'string' ? detail : fallback);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export async function api<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  if (DEMO) return demo<T>(init.method ?? (init.body !== undefined ? 'POST' : 'GET'), path, init.body);
  return send<T>(path, {
    method: init.method ?? (init.body !== undefined ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(await authHeader()) },
    body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
}

/** Multipart upload of a single local file (React Native FormData file part). */
export async function apiUploadFile<T>(path: string, field: string, file: { uri: string; name: string; type: string }): Promise<T> {
  if (DEMO) return demo<T>('POST', path, { demoUpload: true, name: file.name });
  const form = new FormData();
  // React Native's FormData accepts {uri,name,type} file descriptors, which the DOM typings don't model.
  form.append(field, file as unknown as Blob);
  return send<T>(path, { method: 'POST', headers: await authHeader(), body: form });
}

export function errorMessage(e: unknown, fallback = 'Something went wrong. Please try again.'): string {
  return e instanceof ApiError || e instanceof Error ? e.message || fallback : fallback;
}
