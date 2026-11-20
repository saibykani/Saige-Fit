import 'react-native-url-polyfill/auto';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { createClient } from '@supabase/supabase-js';

// Only the public anon key lives in the app. All secrets stay on the backend.
const nativeStorage = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  removeItem: (k: string) => SecureStore.deleteItemAsync(k),
};
// Browsers have no secure keystore; fall back to localStorage (guarded for server-side export).
const ls = () => (typeof window !== 'undefined' ? window.localStorage : null);
const webStorage = {
  getItem: async (k: string) => ls()?.getItem(k) ?? null,
  setItem: async (k: string, v: string) => { ls()?.setItem(k, v); },
  removeItem: async (k: string) => { ls()?.removeItem(k); },
};
const secureStorage = Platform.OS === 'web' ? webStorage : nativeStorage;

export const supabase = createClient(
  process.env.EXPO_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key',
  { auth: { storage: secureStorage, autoRefreshToken: true, persistSession: true, detectSessionInUrl: Platform.OS === 'web' } },
);
