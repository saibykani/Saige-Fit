import * as ImageManipulator from 'expo-image-manipulator';
import { api, apiUploadFile } from '@/lib/api';
import type { FoodSummary } from '@/features/common/types';
import type { ScanResponse } from './store';

const MAX_SIDE = 1600;

/** Downscale to <=1600px on the long edge and re-encode as JPEG q0.8 (keeps uploads small and fast). */
export async function prepareImage(uri: string, width?: number, height?: number): Promise<string> {
  const long = Math.max(width ?? 0, height ?? 0);
  const actions: ImageManipulator.Action[] = [];
  if (long > MAX_SIDE) actions.push({ resize: width && height && width >= height ? { width: MAX_SIDE } : { height: MAX_SIDE } });
  const out = await ImageManipulator.manipulateAsync(uri, actions, { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
  return out.uri;
}

export function scanFood(uri: string): Promise<ScanResponse> {
  return apiUploadFile<ScanResponse>('/v1/scan', 'image', { uri, name: 'meal.jpg', type: 'image/jpeg' });
}

export async function lookupBarcode(code: string): Promise<FoodSummary> {
  const res = await api<{ food?: FoodSummary } & FoodSummary>(`/v1/foods/barcode/${encodeURIComponent(code)}`);
  return res.food ?? res;
}

export const grantAiConsent = () => api('/v1/consent', { body: { ai: true } });
