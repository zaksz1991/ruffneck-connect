import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublicProfile = {
  profile_id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  locale: string | null;
};

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value
  );
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "RN";

  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

function getAvatarUrl(value: string | null): string {
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

function getLanguageName(locale: string | null): string {
  if (!locale) return "";

  const languages: Record<string, string> = {
    en: "English",
    ha: "Hausa",
    yo: "Yoruba",
    ig: "Igbo",
  };

  return languages[locale] ?? locale;
}

export default async function MemberProfilePage({ params }: PageProps) {
  const { id } = await params;

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/members/${id}`)}`);
  }

  if (!isUuid(id)) {
    notFound();
  }

  // Members should access their own profile through the profile editor.
  if (id === user.id) {
    redirect("/profile");
  }

  const { data, error } = await supabase.rpc(
    "get_public_member_profile",
    {
      p_profile_id: id,
    }
  );

  if (error) {
    console.error("Member profile lookup failed:", error.message);
    notFound();
  }

  const profile = (
    Array.isArray(data) ? data[0] : data
  ) as PublicProfile | null;

  if (!profile || profile.profile_id !== id) {
    notFound();
  }

  const name = profile.full_name?.trim() || "RuffNeck member";
  const avatarUrl = getAvatarUrl(profile.avatar_url);
  const language = getLanguageName(profile.locale);

  return (
    <main className="profile-page">
      <div className="container profile-container">
        <nav aria-label="Breadcrumb" className="member-profile-breadcrumb">
          <Link href="/members">Member directory</Link>
          <span aria-hidden="true">/</span>
          <span>{name}</span>
        </nav>

        <section className="member-profile-hero">
          <div className="member-profile-identity">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={`${name}'s profile photo`}
                width={132}
                height={132}
                unoptimized
                className="member-profile-avatar"
                priority
              />
            ) : (
              <div
                className="member-profile-avatar member-profile-avatar-fallback"
                aria-label={`${name}'s initials`}
              >
                {getInitials(name)}
              </div>
            )}

            <div className="member-profile-heading">
              <p className="eyebrow">RUFFNECK CONNECT MEMBER</p>
              <h1>{name}</h1>

              {language && (
                <p className="member-profile-language">
                  <span aria-hidden="true">◎</span> {language}
                </p>
              )}
            </div>
          </div>

          <div className="member-profile-actions">
            <Link
              href={`/messages?to=${encodeURIComponent(profile.profile_id)}`}
              className="button"
            >
              Message member
            </Link>

            <Link
              href="/members"
              className="button button-secondary"
            >
              Back to directory
            </Link>
          </div>
        </section>

        <div className="member-profile-content">
          <section className="card member-profile-about">
            <p className="eyebrow">ABOUT</p>
            <h2>Introduction</h2>

            {profile.bio?.trim() ? (
              <p className="member-profile-bio">{profile.bio.trim()}</p>
            ) : (
              <p className="muted">
                This member has not added an introduction yet.
              </p>
            )}
          </section>

          <aside className="card member-profile-sidebar">
            <p className="eyebrow">CONNECT</p>
            <h2>Build a connection</h2>

            <p>
              Start a conversation to explore shared interests,
              opportunities, or potential collaborations.
            </p>

            <Link
              href={`/messages?to=${encodeURIComponent(profile.profile_id)}`}
              className="button"
              style={{ width: "100%" }}
            >
              Send a message
            </Link>

            <Link
              href="/communities"
              className="member-profile-secondary-link"
            >
              Explore communities →
            </Link>

            <Link
              href="/intents"
              className="member-profile-secondary-link"
            >
              Discover opportunities →
            </Link>
          </aside>
        </div>
      </div>
    </main>
  );
}