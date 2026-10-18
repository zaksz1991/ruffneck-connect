import type { SupabaseClient } from "@supabase/supabase-js";

export const PROFILE_PHOTO_BUCKET = "profile-avatars";
export const PROFILE_PHOTO_MAX_BYTES = 5 * 1024 * 1024;
export const PROFILE_PHOTO_ACCEPT = "image/jpeg,image/png,image/webp";

const EXTENSIONS: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

export function validateProfilePhoto(file: File | null | undefined): string | null {
  if (!file) return "Choose a profile photo from your device.";
  if (!EXTENSIONS[file.type]) return "Use a JPG, PNG, or WebP image.";
  if (file.size <= 0 || file.size > PROFILE_PHOTO_MAX_BYTES) {
    return "The profile photo must be 5 MB or smaller.";
  }
  return null;
}

export async function uploadProfilePhoto(
  supabase: SupabaseClient,
  userId: string,
  file: File
): Promise<string> {
  const validationError = validateProfilePhoto(file);
  if (validationError) throw new Error(validationError);
  if (!userId) throw new Error("Sign in before uploading a profile photo.");

  const extension = EXTENSIONS[file.type];
  const storagePath = `${userId}/${crypto.randomUUID()}.${extension}`;
  const { error } = await supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(storagePath, file, {
      cacheControl: "3600",
      contentType: file.type,
      upsert: false,
    });

  if (error) throw new Error(`Profile photo upload failed: ${error.message}`);

  const { data } = supabase.storage
    .from(PROFILE_PHOTO_BUCKET)
    .getPublicUrl(storagePath);
  if (!data.publicUrl) throw new Error("A public photo URL could not be created.");
  return data.publicUrl;
}

const PENDING_DB = "ruffneck-connect-pending-profile-photo";
const PENDING_STORE = "pending";

type PendingPhoto = { email: string; file: File; savedAt: number };

function openPendingPhotoDb(): Promise<IDBDatabase> {
  if (typeof window === "undefined" || !window.indexedDB) {
    return Promise.reject(new Error("This browser cannot keep a pending profile photo. Please try a supported browser."));
  }
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(PENDING_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(PENDING_STORE)) {
        db.createObjectStore(PENDING_STORE, { keyPath: "email" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open local photo storage."));
  });
}

export async function savePendingProfilePhoto(email: string, file: File): Promise<void> {
  const db = await openPendingPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readwrite");
    tx.objectStore(PENDING_STORE).put({
      email: email.trim().toLowerCase(), file, savedAt: Date.now(),
    } satisfies PendingPhoto);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error ?? new Error("Could not save the pending photo.")); };
    tx.onabort = () => { const error = tx.error; db.close(); reject(error ?? new Error("Could not save the pending photo.")); };
  });
}

export async function readPendingProfilePhoto(email: string): Promise<File | null> {
  if (typeof window === "undefined" || !window.indexedDB) return null;
  const db = await openPendingPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readonly");
    const request = tx.objectStore(PENDING_STORE).get(email.trim().toLowerCase());
    request.onsuccess = () => {
      const record = request.result as PendingPhoto | undefined;
      db.close();
      resolve(record?.file ?? null);
    };
    request.onerror = () => { const error = request.error; db.close(); reject(error ?? new Error("Could not read the pending photo.")); };
  });
}

export async function clearPendingProfilePhoto(email: string): Promise<void> {
  const db = await openPendingPhotoDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PENDING_STORE, "readwrite");
    tx.objectStore(PENDING_STORE).delete(email.trim().toLowerCase());
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { const error = tx.error; db.close(); reject(error ?? new Error("Could not remove the pending photo.")); };
    tx.onabort = () => { const error = tx.error; db.close(); reject(error ?? new Error("Could not remove the pending photo.")); };
  });
}
