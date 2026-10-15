"use client";

import Image from "next/image";
import { useState } from "react";

type ProfilePreviewProps = {
  initialName: string;
  initialBio: string;
  initialAvatarUrl: string;
  initialLocale: string;
  showInDirectory: boolean;
};

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "RN"
  );
}

function getAvatarDisplayUrl(value: string): string {
  if (!value) return "";

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }

    if (
      url.hostname === "drive.google.com" ||
      url.hostname === "www.drive.google.com"
    ) {
      const fileId =
        url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
        url.searchParams.get("id");

      return fileId
        ? `https://drive.google.com/thumbnail?id=${encodeURIComponent(
            fileId
          )}&sz=w800`
        : "";
    }

    return url.toString();
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

  return languages[locale] || locale;
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

  const displayName = name.trim() || "RuffNeck member";
  const imageUrl = getAvatarDisplayUrl(avatarUrl);

  return (
    <section className="card" style={{ marginTop: 28 }}>
      <div className="profile-editor-heading">
        <p className="eyebrow">LIVE MEMBER VIEW</p>
        <h2>Profile preview</h2>
        <p>
          Changes to the fields below update this preview immediately.
          Your profile is not saved until you submit the main profile form.
        </p>
      </div>

      <div
        className="profile-form"
        style={{ marginBottom: 24 }}
      >
        <div className="form-field">
          <label htmlFor="preview_name">Preview name</label>
          <input
            id="preview_name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={100}
          />
        </div>

        <div className="form-field">
          <label htmlFor="preview_bio">Preview biography</label>
          <textarea
            id="preview_bio"
            value={bio}
            onChange={(event) => setBio(event.target.value)}
            maxLength={600}
            rows={3}
          />
        </div>

        <div className="form-field">
          <label htmlFor="preview_avatar">Preview photo URL</label>
          <input
            id="preview_avatar"
            value={avatarUrl}
            onChange={(event) => setAvatarUrl(event.target.value)}
            maxLength={1000}
          />
        </div>

        <div className="form-field">
          <label htmlFor="preview_locale">Preview language</label>
          <select
            id="preview_locale"
            value={locale}
            onChange={(event) => setLocale(event.target.value)}
          >
            <option value="">Not specified</option>
            <option value="en">English</option>
            <option value="ha">Hausa</option>
            <option value="yo">Yoruba</option>
            <option value="ig">Igbo</option>
          </select>
        </div>
      </div>

      {!showInDirectory ? (
        <div className="alert" role="status">
          <strong>Your profile is hidden from the directory.</strong>
          <p>
            Other members should not be able to find your profile through
            the member directory while this setting is disabled.
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

            {locale && (
              <p className="muted">{getLanguageName(locale)}</p>
            )}

            <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.7 }}>
              {bio.trim() || "You have not added a biography yet."}
            </p>
          </div>
        </article>
      )}

      <p className="form-help" style={{ marginTop: 14 }}>
        This is a local preview. It does not save changes or verify whether
        an image URL is accessible.
      </p>
    </section>
  );
}