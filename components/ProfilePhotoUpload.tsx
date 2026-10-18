"use client";

import { useState, type ChangeEvent } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  PROFILE_PHOTO_ACCEPT,
  uploadProfilePhoto,
  validateProfilePhoto,
} from "@/lib/profile-photo";
import styles from "./ProfilePhotoUpload.module.css";

type Props = { userId: string; initialUrl: string };

export default function ProfilePhotoUpload({ userId, initialUrl }: Props) {
  const [avatarUrl, setAvatarUrl] = useState(initialUrl);
  const [previewUrl, setPreviewUrl] = useState(initialUrl);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function handleFileChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0] ?? null;
    event.currentTarget.value = "";
    setError("");
    setMessage("");
    if (!file) return;

    const validation = validateProfilePhoto(file);
    if (validation) { setError(validation); return; }

    const temporaryPreview = URL.createObjectURL(file);
    setPreviewUrl(temporaryPreview);
    setUploading(true);
    try {
      const supabase = createClient();
      const uploadedUrl = await uploadProfilePhoto(supabase, userId, file);
      setAvatarUrl(uploadedUrl);
      setPreviewUrl(uploadedUrl);
      setMessage("Photo uploaded. Select Save profile to save your changes.");
      URL.revokeObjectURL(temporaryPreview);
    } catch (uploadError) {
      setPreviewUrl(avatarUrl);
      setError(uploadError instanceof Error ? uploadError.message : "Photo upload failed. Please try again.");
      URL.revokeObjectURL(temporaryPreview);
    } finally {
      setUploading(false);
    }
  }

  const initials = "RN";

  return (
    <div className={styles.wrap}>
      <input type="hidden" name="avatar_url" value={avatarUrl} />
      <div className={styles.row}>
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={previewUrl} alt="Profile photo preview" className={styles.preview} />
        ) : (
          <div className={`${styles.preview} ${styles.fallback}`} aria-label="No profile photo selected">{initials}</div>
        )}
        <div className={styles.wrap} style={{ flex: 1, minWidth: 0 }}>
          <input
            className={styles.input}
            type="file"
            accept={PROFILE_PHOTO_ACCEPT}
            onChange={handleFileChange}
            disabled={uploading}
            aria-label="Choose a profile photo from your device"
          />
          <p className={styles.help}>Choose a JPG, PNG, or WebP image from your device. Maximum 5 MB. The image uploads securely to your account's profile-photo folder.</p>
        </div>
      </div>
      {uploading && <p className={styles.help} role="status">Uploading profile photo…</p>}
      {message && <p className={styles.status} role="status">{message}</p>}
      {error && <p className={`${styles.status} ${styles.error}`} role="alert">{error}</p>}
    </div>
  );
}
