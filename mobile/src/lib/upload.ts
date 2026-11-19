import * as FileSystem from 'expo-file-system';
import * as ImageManipulatorFallback from 'expo-image-picker';
import { decode } from 'base64-arraybuffer';
import { supabase } from './supabase';

export type Bucket = 'food-photos' | 'progress-photos' | 'avatars';

function uuid() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/** Uploads a local image (file:// uri) to `<user_id>/<uuid>.jpg` in the private bucket. Returns the storage path. */
export async function uploadImage(bucket: Bucket, uri: string): Promise<string> {
  const { data: s } = await supabase.auth.getSession();
  const uid = s.session?.user.id;
  if (!uid) throw new Error('Not signed in');
  const b64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
  const path = `${uid}/${uuid()}.jpg`;
  const { error } = await supabase.storage.from(bucket).upload(path, decode(b64), { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('Image upload failed. Please try again.');
  return path;
}

/** Short-lived URL for displaying a private image. */
export async function signedUrl(bucket: Bucket, path: string, seconds = 3600): Promise<string | null> {
  const { data } = await supabase.storage.from(bucket).createSignedUrl(path, seconds);
  return data?.signedUrl ?? null;
}

// Re-exported so screens can request permissions and pick images from one place.
export const Picker = ImageManipulatorFallback;
