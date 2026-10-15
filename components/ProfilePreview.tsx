"use client";

import Image from "next/image";
import { useEffect, useState } from "react";

type ProfilePreviewProps = {
  initialName: string;
  initialBio: string;
  initialAvatarUrl: string;
  initialLocale: string;
  showInDirectory: boolean;
};

function getInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) return "RN";
  if (words.length === 1) return words[0].slice(0, 2).toUpperCase();

  return `${words[0][0]}${words[words.length - 1][0]}`.toUpperCase();
}

function getAvatarDisplayUrl(value: string): string {
  const url = value.trim();

  if (!url) return "";

  try {
    const parsed = new URL(url);

    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return "";
    }

    if (
      parsed.hostname === "drive.google.com" ||
      parsed.hostname === "www.drive.google.com"
    ) {
      const fileId =
        parsed.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
        parsed.searchParams.get("id");

      if (fileId) {
        return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
          fileId
        )}&sz=w300`;
      }
    }

    return url;
  } catch {
    return "";
  }
}

function getLanguageName(locale: string): string {
  const languages: Record<string, string> = {
    en: "English",
    ha: "Hausa",
    yo: "Yoruba",
    ig: "Igbo",
  };

  return languages[locale] ?? locale;
}

export default function ProfilePreview({
  initialName,
  initialBio,
  initialAvatarUrl,
  initialLocale,
  showInDirectory,
}: ProfilePreviewProps) {
  const [name, setName] = useState(initialName);
  const [bio, setBio] = useState(initialBio);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatarUrl);
  const [locale, setLocale] = useState(initialLocale);
  const [isVisible, setIsVisible] = useState(showInDirectory);

  useEffect(() => {
    const nameInput = document.getElementById(
      "full_name"
    ) as HTMLInputElement | null;

    const bioInput = document.getElementById(
      "bio"
    ) as HTMLTextAreaElement | null;

    const avatarInput = document.getElementById(
      "avatar_url"
    ) as HTMLInputElement | null;

    const localeInput = document.getElementById(
      "locale"
    ) as HTMLSelectElement | HTMLInputElement | null;

    const visibilityInput = document.getElementById(
      "show_in_directory"
    ) as HTMLSelectElement | HTMLInputElement | null;

    const updateName = () => setName(nameInput?.value ?? "");
    const updateBio = () => setBio(bioInput?.value ?? "");
    const updateAvatar = () => setAvatarUrl(avatarInput?.value ?? "");
    const updateLocale = () => setLocale(localeInput?.value ?? "");

    const updateVisibility = () => {
      setIsVisible(visibilityInput?.value !== "false");
    };

    nameInput?.addEventListener("input", updateName);
    bioInput?.addEventListener("input", updateBio);
    avatarInput?.addEventListener("input", updateAvatar);
    localeInput?.addEventListener("change", updateLocale);
    visibilityInput?.addEventListener("change", updateVisibility);

    // Synchronize initial values with the existing form.
    updateName();
    updateBio();
    updateAvatar();
    updateLocale();
    updateVisibility();

    return () => {
      nameInput?.removeEventListener("input", updateName);
      bioInput?.removeEventListener("input", updateBio);
      avatarInput?.removeEventListener("input", updateAvatar);
      localeInput?.removeEventListener("change", updateLocale);
      visibilityInput?.removeEventListener("change", updateVisibility);
    };
  }, []);

  const displayName = name.trim() || "RuffNeck member";
  const imageUrl = getAvatarDisplayUrl(avatarUrl);

  return (
    <section className="card" style={{ marginTop: 28 }}>
      <div className="profile-editor-heading">
        <p className="eyebrow">LIVE MEMBER VIEW</p>
        <h2>Profile preview</h2>
        <p>
          This preview updates as you edit your profile. Changes are not saved
          until you submit the profile form.
        </p>
      </div>

      {!isVisible ? (
        <div className="alert" role="status">
          <strong>Your profile is hidden from the member directory.</strong>
          <p>
            Enable directory visibility in the profile form to preview how
            other members can see your profile.
          </p>
        </div>
      ) : (
        <article
          className="profile-identity"
          style={{
            alignItems: "flex-start",
            padding: 20,
            border: "1px solid var(--border, #d9e1ec)",
            borderRadius: 12,
          }}
        >
          {imageUrl ? (
            <Image
              src={imageUrl}
              alt={`${displayName} profile photo`}
              width={88}
              height={88}
              unoptimized
              className="profile-avatar"
            />
          ) : (
            <div className="profile-avatar profile-avatar-fallback">
              {getInitials(displayName)}
            </div>
          )}

          <div className="profile-identity-copy">
            <h3>{displayName}</h3>

            {locale && <p className="muted">{getLanguageName(locale)}</p>}

            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
              {bio.trim() || "You have not added a biography yet."}
            </p>
          </div>
        </article>
      )}

      <p className="form-help" style={{ marginTop: 14 }}>
        Preview only. Submit the profile form to save your changes.
      </p>
    </section>
  );
}