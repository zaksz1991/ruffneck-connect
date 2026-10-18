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
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();

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
    <>
      <main className="rn-public-profile">
        <div className="rn-public-profile-container">
          <nav
            aria-label="Breadcrumb"
            className="rn-public-profile-breadcrumb"
          >
            <Link href="/members">
              <span aria-hidden="true">←</span> Member directory
            </Link>
            <span className="rn-breadcrumb-divider" aria-hidden="true">
              /
            </span>
            <span className="rn-breadcrumb-current">{name}</span>
          </nav>

          <section className="rn-public-profile-hero">
            <div className="rn-public-profile-hero-glow" aria-hidden="true" />

            <div className="rn-public-profile-identity">
              <div className="rn-public-profile-avatar-frame">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={`${name}'s profile photo`}
                    width={132}
                    height={132}
                    unoptimized
                    className="rn-public-profile-avatar"
                    priority
                  />
                ) : (
                  <div
                    className="rn-public-profile-avatar rn-public-profile-avatar-fallback"
                    aria-label={`${name}'s initials`}
                  >
                    {getInitials(name)}
                  </div>
                )}

                <span
                  className="rn-public-profile-avatar-mark"
                  aria-hidden="true"
                >
                  RN
                </span>
              </div>

              <div className="rn-public-profile-heading">
                <div className="rn-public-profile-kicker">
                  <span className="rn-public-profile-status-dot" />
                  RUFFNECK CONNECT NETWORK
                </div>

                <h1>{name}</h1>

                <p className="rn-public-profile-subtitle">
                  A member of the RuffNeck Connect community
                </p>

                {language && (
                  <span className="rn-public-profile-language">
                    <span aria-hidden="true">◎</span>
                    Speaks {language}
                  </span>
                )}
              </div>
            </div>

            <div className="rn-public-profile-hero-actions">
              <Link
                href={`/messages?to=${encodeURIComponent(profile.profile_id)}`}
                className="rn-public-profile-primary-button"
              >
                <span aria-hidden="true">✉</span>
                Message member
                <span aria-hidden="true">↗</span>
              </Link>

              <Link
                href="/members"
                className="rn-public-profile-outline-button"
              >
                Back to directory
              </Link>
            </div>

            <div className="rn-public-profile-hero-footer">
              <span>PEOPLE</span>
              <span className="rn-public-profile-footer-divider" />
              <span>IDEAS</span>
              <span className="rn-public-profile-footer-divider" />
              <span>OPPORTUNITIES</span>
            </div>
          </section>

          <section className="rn-public-profile-content">
            <div className="rn-public-profile-main">
              <section className="rn-public-profile-about">
                <div className="rn-public-profile-section-top">
                  <span className="rn-public-profile-section-icon">
                    01
                  </span>
                  <span className="rn-public-profile-section-label">
                    GET TO KNOW THEM
                  </span>
                </div>

                <h2>About {name.split(/\s+/)[0]}</h2>

                <p className="rn-public-profile-about-intro">
                  Every meaningful connection begins with understanding
                  the person behind the profile.
                </p>

                <div className="rn-public-profile-bio">
                  {profile.bio?.trim() ? (
                    <p>{profile.bio.trim()}</p>
                  ) : (
                    <div className="rn-public-profile-no-bio">
                      <span aria-hidden="true">✦</span>
                      <div>
                        <strong>Introduction coming soon</strong>
                        <p>
                          This member has not added a personal
                          introduction yet. Start a conversation to
                          get acquainted.
                        </p>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              <section className="rn-public-profile-values">
                <div>
                  <span className="rn-public-profile-value-number">
                    01
                  </span>
                  <h3>Start a conversation</h3>
                  <p>
                    Introduce yourself and find out what you have in
                    common.
                  </p>
                </div>

                <div>
                  <span className="rn-public-profile-value-number">
                    02
                  </span>
                  <h3>Exchange ideas</h3>
                  <p>
                    Share knowledge, experiences, and useful perspectives.
                  </p>
                </div>

                <div>
                  <span className="rn-public-profile-value-number">
                    03
                  </span>
                  <h3>Explore possibilities</h3>
                  <p>
                    Discover ways to collaborate and support each
                    other’s goals.
                  </p>
                </div>
              </section>
            </div>

            <aside className="rn-public-profile-sidebar">
              <div className="rn-public-profile-connect-card">
                <div className="rn-public-profile-connect-icon">
                  <span aria-hidden="true">↗</span>
                </div>

                <p className="rn-public-profile-sidebar-kicker">
                  MAKE THE FIRST MOVE
                </p>

                <h2>Good things start with a hello.</h2>

                <p className="rn-public-profile-sidebar-description">
                  Send a message to explore shared interests,
                  opportunities, or potential collaborations.
                </p>

                <Link
                  href={`/messages?to=${encodeURIComponent(profile.profile_id)}`}
                  className="rn-public-profile-send-button"
                >
                  Start a conversation
                  <span aria-hidden="true">→</span>
                </Link>

                <div className="rn-public-profile-privacy-note">
                  <span aria-hidden="true">◈</span>
                  <span>Respectful, purposeful connections.</span>
                </div>
              </div>

              <div className="rn-public-profile-discover-card">
                <p className="rn-public-profile-sidebar-kicker">
                  KEEP EXPLORING
                </p>

                <h3>More ways to connect</h3>

                <Link
                  href="/communities"
                  className="rn-public-profile-discover-link"
                >
                  <span className="rn-discover-icon rn-discover-cyan">
                    C
                  </span>
                  <span>
                    <strong>Communities</strong>
                    <small>Find your people</small>
                  </span>
                  <span className="rn-discover-arrow">↗</span>
                </Link>

                <Link
                  href="/intents"
                  className="rn-public-profile-discover-link"
                >
                  <span className="rn-discover-icon rn-discover-gold">
                    O
                  </span>
                  <span>
                    <strong>Opportunities</strong>
                    <small>Find ways to collaborate</small>
                  </span>
                  <span className="rn-discover-arrow">↗</span>
                </Link>

                <Link
                  href="/members"
                  className="rn-public-profile-discover-link"
                >
                  <span className="rn-discover-icon rn-discover-purple">
                    M
                  </span>
                  <span>
                    <strong>Other members</strong>
                    <small>Grow your network</small>
                  </span>
                  <span className="rn-discover-arrow">↗</span>
                </Link>
              </div>
            </aside>
          </section>

          <section className="rn-public-profile-bottom-banner">
            <div>
              <p>RUFFNECK CONNECT</p>
              <h2>Connections become valuable when we take action.</h2>
              <span>
                Discover people. Share knowledge. Build something useful.
              </span>
            </div>

            <Link href="/intents" className="rn-public-profile-banner-button">
              Explore opportunities <span aria-hidden="true">↗</span>
            </Link>
          </section>
        </div>
      </main>

      <style jsx global>{`
        .rn-public-profile {
          --rn-profile-navy: #0b1e3a;
          --rn-profile-cyan: #00b4d8;
          --rn-profile-gold: #fbbf24;
          --rn-profile-text: #20344d;
          --rn-profile-muted: #6e7e91;
          --rn-profile-border: #e3eaf1;
          padding: 26px 0 60px;
          color: var(--rn-profile-text);
        }

        .rn-public-profile *,
        .rn-public-profile *::before,
        .rn-public-profile *::after {
          box-sizing: border-box;
        }

        .rn-public-profile-container {
          width: min(1120px, calc(100% - 40px));
          margin: 0 auto;
        }

        .rn-public-profile-breadcrumb {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 11px;
          margin-bottom: 22px;
          color: #8996a5;
          font-size: 11px;
        }

        .rn-public-profile-breadcrumb a {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #526981 !important;
          font-weight: 750;
          text-decoration: none !important;
        }

        .rn-public-profile-breadcrumb a:hover {
          color: #008ba6 !important;
        }

        .rn-breadcrumb-divider {
          color: #c4cdd7;
        }

        .rn-breadcrumb-current {
          max-width: 260px;
          overflow: hidden;
          color: var(--rn-profile-navy);
          font-weight: 700;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rn-public-profile-hero {
          position: relative;
          padding: clamp(25px, 4vw, 43px);
          overflow: hidden;
          border-radius: 23px;
          background:
            radial-gradient(
              circle at 85% 8%,
              rgba(0, 180, 216, 0.19),
              transparent 34%
            ),
            linear-gradient(120deg, #0b1e3a, #123858);
          color: #fff;
          box-shadow: 0 18px 45px rgba(11, 30, 58, 0.12);
        }

        .rn-public-profile-hero-glow {
          position: absolute;
          top: -120px;
          right: -70px;
          width: 320px;
          height: 320px;
          border: 1px solid rgba(0, 180, 216, 0.15);
          border-radius: 50%;
          pointer-events: none;
        }

        .rn-public-profile-hero-glow::after {
          position: absolute;
          inset: 32px;
          border: 1px solid rgba(255, 255, 255, 0.06);
          border-radius: 50%;
          content: "";
        }

        .rn-public-profile-identity {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 27px;
        }

        .rn-public-profile-avatar-frame {
          position: relative;
          flex-shrink: 0;
        }

        .rn-public-profile-avatar {
          display: block;
          width: 132px;
          height: 132px;
          border: 4px solid rgba(255, 255, 255, 0.87);
          border-radius: 25px;
          object-fit: cover;
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
        }

        .rn-public-profile-avatar-fallback {
          display: grid;
          place-items: center;
          background: linear-gradient(145deg, #dff8fc, #e8edff);
          color: var(--rn-profile-navy);
          font-size: 36px;
          font-weight: 950;
        }

        .rn-public-profile-avatar-mark {
          position: absolute;
          right: -8px;
          bottom: -8px;
          display: grid;
          place-items: center;
          width: 37px;
          height: 37px;
          border: 3px solid #102c49;
          border-radius: 12px;
          background: var(--rn-profile-cyan);
          color: #06243a;
          font-size: 10px;
          font-weight: 950;
        }

        .rn-public-profile-heading {
          min-width: 0;
        }

        .rn-public-profile-kicker {
          display: flex;
          align-items: center;
          gap: 9px;
          color: #a8eaf5;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1.5px;
        }

        .rn-public-profile-status-dot {
          width: 7px;
          height: 7px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--rn-profile-cyan);
          box-shadow: 0 0 0 4px rgba(0, 180, 216, 0.12);
        }

        .rn-public-profile-heading h1 {
          margin: 14px 0 8px;
          color: #fff;
          font-size: clamp(29px, 4vw, 43px);
          font-weight: 900;
          letter-spacing: -1.3px;
          line-height: 1.15;
          overflow-wrap: anywhere;
        }

        .rn-public-profile-subtitle {
          margin: 0;
          color: #cbd9e8;
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-public-profile-language {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          margin-top: 13px;
          padding: 7px 10px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 30px;
          background: rgba(255, 255, 255, 0.055);
          color: #dcebf7;
          font-size: 10px;
          font-weight: 750;
        }

        .rn-public-profile-hero-actions {
          position: relative;
          z-index: 1;
          display: flex;
          flex-wrap: wrap;
          gap: 11px;
          margin-top: 32px;
        }

        .rn-public-profile-primary-button,
        .rn-public-profile-outline-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          min-height: 44px;
          padding: 0 16px;
          border: 1px solid transparent;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 850;
          text-decoration: none !important;
          transition:
            transform 180ms ease,
            background 180ms ease;
        }

        .rn-public-profile-primary-button {
          background: var(--rn-profile-cyan);
          color: #06243a !important;
        }

        .rn-public-profile-primary-button:hover {
          transform: translateY(-2px);
          background: #4bd1e8;
        }

        .rn-public-profile-outline-button {
          border-color: rgba(255, 255, 255, 0.23);
          background: rgba(255, 255, 255, 0.04);
          color: #fff !important;
        }

        .rn-public-profile-outline-button:hover {
          background: rgba(255, 255, 255, 0.11);
        }

        .rn-public-profile-hero-footer {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 29px;
          padding-top: 19px;
          border-top: 1px solid rgba(255, 255, 255, 0.12);
          color: #b6c9dc;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 1.4px;
        }

        .rn-public-profile-footer-divider {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--rn-profile-cyan);
        }

        .rn-public-profile-content {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 320px;
          align-items: start;
          gap: 22px;
          margin-top: 25px;
        }

        .rn-public-profile-main {
          min-width: 0;
        }

        .rn-public-profile-about {
          padding: clamp(22px, 3vw, 31px);
          border: 1px solid var(--rn-profile-border);
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 6px 25px rgba(18, 43, 72, 0.025);
        }

        .rn-public-profile-section-top {
          display: flex;
          align-items: center;
          gap: 11px;
        }

        .rn-public-profile-section-icon {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: 11px;
          background: #e5f9fc;
          color: #008ba5;
          font-size: 10px;
          font-weight: 900;
        }

        .rn-public-profile-section-label {
          color: #78889a;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1.2px;
        }

        .rn-public-profile-about h2 {
          margin: 24px 0 9px;
          color: var(--rn-profile-navy);
          font-size: 25px;
          font-weight: 900;
          letter-spacing: -0.6px;
          line-height: 1.3;
          overflow-wrap: anywhere;
        }

        .rn-public-profile-about-intro {
          margin: 0;
          color: #7a8999;
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-public-profile-bio {
          margin-top: 23px;
          padding-top: 22px;
          border-top: 1px solid #edf1f5;
        }

        .rn-public-profile-bio > p {
          margin: 0;
          color: #465a70;
          font-size: 13px;
          line-height: 2;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }

        .rn-public-profile-no-bio {
          display: flex;
          align-items: flex-start;
          gap: 13px;
          padding: 17px;
          border: 1px solid #e5edf3;
          border-radius: 12px;
          background: #f8fbfd;
        }

        .rn-public-profile-no-bio > span {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          flex-shrink: 0;
          border-radius: 10px;
          background: #e5f9fc;
          color: #008ba5;
          font-size: 15px;
        }

        .rn-public-profile-no-bio strong {
          color: var(--rn-profile-navy);
          font-size: 12px;
        }

        .rn-public-profile-no-bio p {
          margin: 6px 0 0;
          color: var(--rn-profile-muted);
          font-size: 11px;
          line-height: 1.8;
        }

        .rn-public-profile-values {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          margin-top: 16px;
        }

        .rn-public-profile-values > div {
          min-width: 0;
          padding: 17px 14px;
          border: 1px solid var(--rn-profile-border);
          border-radius: 14px;
          background: #fff;
        }

        .rn-public-profile-value-number {
          display: grid;
          place-items: center;
          width: 29px;
          height: 29px;
          border-radius: 9px;
          background: #f0f6fa;
          color: #41617e;
          font-size: 9px;
          font-weight: 900;
        }

        .rn-public-profile-values h3 {
          margin: 14px 0 7px;
          color: var(--rn-profile-navy);
          font-size: 11px;
          font-weight: 850;
          line-height: 1.5;
        }

        .rn-public-profile-values p {
          margin: 0;
          color: var(--rn-profile-muted);
          font-size: 10px;
          line-height: 1.8;
        }

        .rn-public-profile-sidebar {
          display: flex;
          flex-direction: column;
          gap: 16px;
          min-width: 0;
        }

        .rn-public-profile-connect-card {
          padding: 23px;
          border: 1px solid rgba(0, 180, 216, 0.17);
          border-radius: 17px;
          background:
            radial-gradient(
              circle at 100% 0,
              rgba(0, 180, 216, 0.12),
              transparent 38%
            ),
            #f8fcfe;
        }

        .rn-public-profile-connect-icon {
          display: grid;
          place-items: center;
          width: 44px;
          height: 44px;
          margin-bottom: 20px;
          border-radius: 13px;
          background: var(--rn-profile-navy);
          color: var(--rn-profile-cyan);
          font-size: 22px;
          font-weight: 800;
        }

        .rn-public-profile-sidebar-kicker {
          margin: 0 0 10px;
          color: #008ba5;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.3px;
        }

        .rn-public-profile-connect-card h2 {
          margin: 0;
          color: var(--rn-profile-navy);
          font-size: 23px;
          font-weight: 900;
          letter-spacing: -0.6px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .rn-public-profile-sidebar-description {
          margin: 12px 0 19px;
          color: #687b90;
          font-size: 11px;
          line-height: 1.9;
        }

        .rn-public-profile-send-button {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: 100%;
          min-height: 44px;
          padding: 0 13px;
          border-radius: 10px;
          background: var(--rn-profile-navy);
          color: #fff !important;
          font-size: 10px;
          font-weight: 850;
          text-decoration: none !important;
          transition: background 180ms ease;
        }

        .rn-public-profile-send-button:hover {
          background: #16456b;
        }

        .rn-public-profile-privacy-note {
          display: flex;
          align-items: flex-start;
          gap: 8px;
          margin-top: 15px;
          color: #73869a;
          font-size: 9px;
          line-height: 1.7;
        }

        .rn-public-profile-privacy-note > span:first-child {
          color: #008ba5;
          font-size: 13px;
        }

        .rn-public-profile-discover-card {
          padding: 21px;
          border: 1px solid var(--rn-profile-border);
          border-radius: 17px;
          background: #fff;
        }

        .rn-public-profile-discover-card > h3 {
          margin: 0 0 17px;
          color: var(--rn-profile-navy);
          font-size: 17px;
          font-weight: 900;
        }

        .rn-public-profile-discover-link {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
          padding: 13px 0;
          border-top: 1px solid #edf1f5;
          text-decoration: none !important;
        }

        .rn-discover-icon {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          flex-shrink: 0;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 900;
        }

        .rn-discover-cyan {
          background: #e3f9fd;
          color: #008aa5;
        }

        .rn-discover-gold {
          background: #fff4d9;
          color: #946a0b;
        }

        .rn-discover-purple {
          background: #f0eaff;
          color: #7652be;
        }

        .rn-public-profile-discover-link > span:nth-child(2) {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }

        .rn-public-profile-discover-link strong {
          color: var(--rn-profile-navy);
          font-size: 11px;
          font-weight: 850;
        }

        .rn-public-profile-discover-link small {
          color: #8190a0;
          font-size: 9px;
          line-height: 1.5;
        }

        .rn-discover-arrow {
          flex-shrink: 0;
          color: #008ba5;
          font-size: 15px;
          font-weight: 850;
          transition: transform 180ms ease;
        }

        .rn-public-profile-discover-link:hover .rn-discover-arrow {
          transform: translate(2px, -2px);
        }

        .rn-public-profile-bottom-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 22px;
          margin-top: 28px;
          padding: 27px 30px;
          border-radius: 17px;
          background:
            radial-gradient(
              circle at 100% 0,
              rgba(0, 180, 216, 0.17),
              transparent 40%
            ),
            var(--rn-profile-navy);
        }

        .rn-public-profile-bottom-banner > div > p {
          margin: 0 0 9px;
          color: #59d7eb;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1.4px;
        }

        .rn-public-profile-bottom-banner h2 {
          max-width: 630px;
          margin: 0;
          color: #fff;
          font-size: clamp(19px, 2.5vw, 26px);
          font-weight: 900;
          letter-spacing: -0.5px;
          line-height: 1.4;
        }

        .rn-public-profile-bottom-banner > div > span {
          display: block;
          margin-top: 8px;
          color: #c6d7e8;
          font-size: 10px;
          line-height: 1.7;
        }

        .rn-public-profile-banner-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 11px;
          min-height: 43px;
          padding: 0 15px;
          flex-shrink: 0;
          border-radius: 10px;
          background: var(--rn-profile-cyan);
          color: #06243a !important;
          font-size: 10px;
          font-weight: 850;
          text-decoration: none !important;
          transition: background 180ms ease;
        }

        .rn-public-profile-banner-button:hover {
          background: #4bd1e8;
        }

        @media (max-width: 900px) {
          .rn-public-profile-content {
            grid-template-columns: minmax(0, 1fr) 275px;
            gap: 15px;
          }

          .rn-public-profile-values {
            grid-template-columns: 1fr;
          }

          .rn-public-profile-values > div {
            display: grid;
            grid-template-columns: 32px minmax(0, 1fr);
            column-gap: 11px;
            align-items: center;
          }

          .rn-public-profile-values h3 {
            margin: 0;
          }

          .rn-public-profile-values p {
            grid-column: 2;
            margin-top: 4px;
          }

          .rn-public-profile-bottom-banner {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 680px) {
          .rn-public-profile {
            padding: 18px 0 40px;
          }

          .rn-public-profile-container {
            width: calc(100% - 28px);
          }

          .rn-public-profile-hero {
            padding: 25px 21px;
            border-radius: 19px;
          }

          .rn-public-profile-identity {
            align-items: flex-start;
            flex-direction: column;
            gap: 23px;
          }

          .rn-public-profile-avatar {
            width: 105px;
            height: 105px;
            border-radius: 21px;
          }

          .rn-public-profile-avatar-fallback {
            font-size: 29px;
          }

          .rn-public-profile-heading h1 {
            font-size: clamp(29px, 8vw, 38px);
          }

          .rn-public-profile-hero-actions {
            flex-direction: column;
            margin-top: 26px;
          }

          .rn-public-profile-primary-button,
          .rn-public-profile-outline-button {
            width: 100%;
          }

          .rn-public-profile-hero-footer {
            gap: 9px;
            font-size: 7px;
            letter-spacing: 1px;
          }

          .rn-public-profile-content {
            grid-template-columns: 1fr;
            gap: 15px;
            margin-top: 16px;
          }

          .rn-public-profile-about {
            padding: 22px 19px;
          }

          .rn-public-profile-about h2 {
            font-size: 23px;
          }

          .rn-public-profile-values {
            grid-template-columns: 1fr;
          }

          .rn-public-profile-values > div {
            padding: 16px;
          }

          .rn-public-profile-sidebar {
            gap: 13px;
          }

          .rn-public-profile-connect-card,
          .rn-public-profile-discover-card {
            padding: 21px;
          }

          .rn-public-profile-bottom-banner {
            margin-top: 18px;
            padding: 23px 20px;
          }

          .rn-public-profile-banner-button {
            width: 100%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-public-profile *,
          .rn-public-profile *::before,
          .rn-public-profile *::after {
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </>
  );
}