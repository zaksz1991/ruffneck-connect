import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Member = {
  profile_id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  locale: string | null;
};

type PageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

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
          )}&sz=w300`
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

export default async function MembersPage({ searchParams }: PageProps) {
  const params = await searchParams;
  const search = (params.q ?? "").trim().slice(0, 100);

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/members");
  }

  const { data, error } = await supabase.rpc(
    "get_public_member_directory",
    {
      p_search: search || null,
    }
  );

  if (error) {
    console.error("Member directory failed:", error.message);
  }

  const members = (data ?? []) as Member[];

  return (
    <>
      <main className="rn-members-page">
        <div className="rn-members-container">
          <section className="rn-members-hero">
            <div className="rn-members-hero-copy">
              <div className="rn-members-kicker">
                <span className="rn-members-live" />
                THE RUFFNECK CONNECT NETWORK
              </div>

              <h1>
                Good people.
                <br />
                <span>Meaningful connections.</span>
              </h1>

              <p>
                Discover people with different skills, experiences,
                and ambitions. Start conversations that can lead to
                practical opportunities and lasting collaboration.
              </p>

              <div className="rn-members-hero-actions">
                <a
                  href="#member-search"
                  className="rn-members-button rn-members-button-primary"
                >
                  Discover members <span aria-hidden="true">↓</span>
                </a>

                <Link
                  href="/communities"
                  className="rn-members-button rn-members-button-outline"
                >
                  Explore communities <span aria-hidden="true">↗</span>
                </Link>
              </div>

              <div className="rn-members-principles">
                <span>Shared interests</span>
                <span>Knowledge exchange</span>
                <span>Real opportunities</span>
              </div>
            </div>

            <div className="rn-members-hero-visual" aria-hidden="true">
              <div className="rn-members-ring rn-members-ring-one" />
              <div className="rn-members-ring rn-members-ring-two" />

              <div className="rn-members-hero-center">
                <span className="rn-members-hero-symbol">RN</span>
                <strong>Connect</strong>
                <small>People create possibilities.</small>
              </div>

              <div className="rn-members-float rn-members-float-top">
                <span className="rn-members-float-icon rn-float-cyan">
                  +
                </span>
                <span>
                  <strong>Meet someone new</strong>
                  <small>Expand your network</small>
                </span>
              </div>

              <div className="rn-members-float rn-members-float-bottom">
                <span className="rn-members-float-icon rn-float-gold">
                  ↗
                </span>
                <span>
                  <strong>Make it meaningful</strong>
                  <small>Turn contact into action</small>
                </span>
              </div>
            </div>
          </section>

          <section className="rn-members-summary">
            <article className="rn-members-summary-card">
              <span className="rn-summary-icon rn-summary-cyan">01</span>
              <div>
                <strong>Discover</strong>
                <p>Find people across the network.</p>
              </div>
            </article>

            <article className="rn-members-summary-card">
              <span className="rn-summary-icon rn-summary-purple">02</span>
              <div>
                <strong>Learn</strong>
                <p>Explore profiles and experiences.</p>
              </div>
            </article>

            <article className="rn-members-summary-card">
              <span className="rn-summary-icon rn-summary-gold">03</span>
              <div>
                <strong>Connect</strong>
                <p>Start a conversation directly.</p>
              </div>
            </article>
          </section>

          <section className="rn-members-directory">
            <div className="rn-members-section-heading">
              <div>
                <p className="rn-members-section-kicker">
                  YOUR COMMUNITY
                </p>
                <h2>Meet the members</h2>
                <p>
                  Explore profiles and find people worth connecting with.
                </p>
              </div>

              <div className="rn-members-total">
                <span className="rn-members-total-dot" />
                <span>
                  {error
                    ? "Directory unavailable"
                    : `${members.length}${
                        members.length === 100 ? "+" : ""
                      } ${
                        members.length === 1 ? "member" : "members"
                      } shown`}
                </span>
              </div>
            </div>

            <section className="rn-members-search-panel">
              <div className="rn-search-heading">
                <span className="rn-search-icon" aria-hidden="true">
                  ⌕
                </span>
                <div>
                  <h3>Find your people</h3>
                  <p>Search by name or profile introduction.</p>
                </div>
              </div>

              <form
                action="/members"
                method="get"
                role="search"
                className="rn-members-search-form"
              >
                <div className="rn-members-search-input-wrap">
                  <label htmlFor="member-search">Search members</label>
                  <input
                    id="member-search"
                    type="search"
                    name="q"
                    defaultValue={search}
                    maxLength={100}
                    placeholder="Try a name or an area of interest..."
                  />
                </div>

                <div className="rn-members-search-actions">
                  <button
                    type="submit"
                    className="rn-members-button rn-search-submit"
                  >
                    Search members <span aria-hidden="true">→</span>
                  </button>

                  {search && (
                    <Link
                      href="/members"
                      className="rn-members-clear"
                    >
                      Clear search
                    </Link>
                  )}
                </div>
              </form>

              {search && (
                <p className="rn-members-search-status">
                  Showing results for <strong>“{search}”</strong>
                </p>
              )}
            </section>

            {error ? (
              <section className="rn-members-empty">
                <span className="rn-members-empty-icon">!</span>
                <p className="rn-members-section-kicker">
                  TEMPORARY INTERRUPTION
                </p>
                <h3>The member directory is unavailable.</h3>
                <p>
                  We could not retrieve member profiles. Please try again
                  later.
                </p>
                <Link
                  href="/members"
                  className="rn-members-button rn-search-submit"
                >
                  Try again <span aria-hidden="true">↻</span>
                </Link>
              </section>
            ) : members.length === 0 ? (
              <section className="rn-members-empty">
                <span className="rn-members-empty-icon">
                  {search ? "⌕" : "RN"}
                </span>

                <p className="rn-members-section-kicker">
                  {search ? "NO MATCHES FOUND" : "YOUR NETWORK STARTS HERE"}
                </p>

                <h3>
                  {search
                    ? "No members match your search."
                    : "No public profiles to display yet."}
                </h3>

                <p>
                  {search
                    ? "Try another name or a different search term."
                    : "Members with visible profiles will appear here."}
                </p>

                {search && (
                  <Link
                    href="/members"
                    className="rn-members-button rn-search-submit"
                  >
                    View all members <span aria-hidden="true">→</span>
                  </Link>
                )}
              </section>
            ) : (
              <>
                <div className="rn-members-results-heading">
                  <div>
                    <span className="rn-results-indicator" />
                    <span>
                      {search ? "SEARCH RESULTS" : "MEMBER DIRECTORY"}
                    </span>
                  </div>

                  <span className="rn-results-note">
                    Select a profile to learn more
                  </span>
                </div>

                <section
                  className="rn-members-grid"
                  aria-label="Member profiles"
                >
                  {members.map((member, index) => {
                    const name =
                      member.full_name?.trim() || "RuffNeck member";

                    const avatarUrl = getAvatarUrl(member.avatar_url);
                    const language = getLanguageName(member.locale);

                    return (
                      <article
                        key={member.profile_id}
                        className="rn-member-card"
                      >
                        <div className="rn-member-card-top">
                          <span className="rn-member-number">
                            {String(index + 1).padStart(2, "0")}
                          </span>

                          <span className="rn-member-card-label">
                            COMMUNITY MEMBER
                          </span>
                        </div>

                        <div className="rn-member-identity">
                          <Link
                            href={`/members/${member.profile_id}`}
                            aria-label={`View ${name}'s profile`}
                            className="rn-member-avatar-link"
                          >
                            {avatarUrl ? (
                              <Image
                                src={avatarUrl}
                                alt={`${name}'s profile photo`}
                                width={80}
                                height={80}
                                unoptimized
                                className="rn-member-avatar"
                              />
                            ) : (
                              <span
                                className="rn-member-avatar rn-member-avatar-fallback"
                                aria-hidden="true"
                              >
                                {getInitials(name)}
                              </span>
                            )}
                          </Link>

                          <div className="rn-member-identity-copy">
                            <h3>
                              <Link href={`/members/${member.profile_id}`}>
                                {name}
                              </Link>
                            </h3>

                            {language ? (
                              <span className="rn-member-language">
                                <span aria-hidden="true">◎</span>
                                {language}
                              </span>
                            ) : (
                              <span className="rn-member-language rn-language-muted">
                                RuffNeck Connect
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="rn-member-bio-wrap">
                          <p className="rn-member-bio">
                            {member.bio?.trim() ||
                              "This member has not added an introduction yet."}
                          </p>
                        </div>

                        <div className="rn-member-card-footer">
                          <Link
                            href={`/members/${member.profile_id}`}
                            className="rn-member-profile-button"
                          >
                            View profile <span aria-hidden="true">↗</span>
                          </Link>

                          <Link
                            href={`/messages?to=${encodeURIComponent(
                              member.profile_id
                            )}`}
                            className="rn-member-connect-button"
                          >
                            Connect
                          </Link>
                        </div>
                      </article>
                    );
                  })}
                </section>

                {members.length === 100 && (
                  <div className="rn-members-limit-note">
                    <span aria-hidden="true">i</span>
                    <p>
                      Showing up to 100 members. Search by name or
                      introduction to narrow the results.
                    </p>
                  </div>
                )}
              </>
            )}
          </section>

          <section className="rn-members-network-banner">
            <div className="rn-members-banner-copy">
              <p className="rn-members-banner-kicker">
                BEYOND THE DIRECTORY
              </p>
              <h2>Your next opportunity could start with a conversation.</h2>
              <p>
                Explore communities, discover shared goals, and find
                practical ways to contribute.
              </p>
            </div>

            <div className="rn-members-banner-actions">
              <Link
                href="/communities"
                className="rn-members-button rn-banner-primary"
              >
                Explore communities <span aria-hidden="true">↗</span>
              </Link>

              <Link
                href="/intents"
                className="rn-members-banner-link"
              >
                Discover opportunities <span aria-hidden="true">→</span>
              </Link>
            </div>
          </section>

          <section className="rn-members-shortcuts">
            <div className="rn-members-shortcuts-heading">
              <p className="rn-members-section-kicker">KEEP EXPLORING</p>
              <h2>Build your network</h2>
            </div>

            <div className="rn-members-shortcut-grid">
              <Link
                href="/communities"
                className="rn-members-shortcut"
              >
                <span className="rn-shortcut-icon rn-shortcut-cyan">
                  C
                </span>
                <span className="rn-shortcut-copy">
                  <strong>Communities</strong>
                  <small>Join groups around shared interests.</small>
                </span>
                <span className="rn-shortcut-arrow">↗</span>
              </Link>

              <Link href="/intents" className="rn-members-shortcut">
                <span className="rn-shortcut-icon rn-shortcut-gold">
                  O
                </span>
                <span className="rn-shortcut-copy">
                  <strong>Opportunities</strong>
                  <small>Explore needs, offers, and projects.</small>
                </span>
                <span className="rn-shortcut-arrow">↗</span>
              </Link>

              <Link href="/messages" className="rn-members-shortcut">
                <span className="rn-shortcut-icon rn-shortcut-purple">
                  M
                </span>
                <span className="rn-shortcut-copy">
                  <strong>Messages</strong>
                  <small>Continue your conversations.</small>
                </span>
                <span className="rn-shortcut-arrow">↗</span>
              </Link>
            </div>
          </section>
        </div>
      </main>

      <style jsx global>{`
        .rn-members-page {
          --rn-navy: #0b1e3a;
          --rn-cyan: #00b4d8;
          --rn-gold: #fbbf24;
          --rn-text: #172b46;
          --rn-muted: #6b7b8e;
          --rn-border: #e4ebf2;
          padding: 30px 0 60px;
          color: var(--rn-text);
          overflow: hidden;
        }

        .rn-members-page *,
        .rn-members-page *::before,
        .rn-members-page *::after {
          box-sizing: border-box;
        }

        .rn-members-container {
          width: min(1180px, calc(100% - 40px));
          margin: 0 auto;
        }

        .rn-members-hero {
          position: relative;
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          align-items: center;
          gap: 20px;
          min-height: 380px;
          padding: clamp(28px, 5vw, 56px);
          overflow: hidden;
          border-radius: 27px;
          background:
            radial-gradient(
              circle at 82% 15%,
              rgba(0, 180, 216, 0.2),
              transparent 34%
            ),
            linear-gradient(125deg, #0b1e3a, #123657);
          box-shadow: 0 20px 55px rgba(11, 30, 58, 0.12);
          color: #fff;
        }

        .rn-members-hero-copy {
          position: relative;
          z-index: 2;
        }

        .rn-members-kicker {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #a9eaf6;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.6px;
        }

        .rn-members-live {
          width: 7px;
          height: 7px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--rn-cyan);
          box-shadow: 0 0 0 4px rgba(0, 180, 216, 0.13);
        }

        .rn-members-hero h1 {
          margin: 24px 0 17px;
          color: #fff;
          font-size: clamp(35px, 4.5vw, 54px);
          font-weight: 850;
          letter-spacing: -2.2px;
          line-height: 1.08;
        }

        .rn-members-hero h1 span {
          color: var(--rn-cyan);
        }

        .rn-members-hero-copy > p {
          max-width: 510px;
          margin: 0;
          color: #d0ddec;
          font-size: 14px;
          line-height: 1.9;
        }

        .rn-members-hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 11px;
          margin-top: 27px;
        }

        .rn-members-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 11px;
          min-height: 45px;
          padding: 0 17px;
          border: 1px solid transparent;
          border-radius: 10px;
          font-size: 11px;
          font-weight: 800;
          text-decoration: none !important;
          transition:
            transform 180ms ease,
            background 180ms ease,
            box-shadow 180ms ease;
        }

        .rn-members-button:hover {
          transform: translateY(-2px);
        }

        .rn-members-button-primary {
          background: var(--rn-cyan);
          color: #06243a !important;
          box-shadow: 0 7px 20px rgba(0, 180, 216, 0.17);
        }

        .rn-members-button-primary:hover {
          background: #42cde7;
        }

        .rn-members-button-outline {
          border-color: rgba(255, 255, 255, 0.22);
          background: rgba(255, 255, 255, 0.05);
          color: #fff !important;
        }

        .rn-members-button-outline:hover {
          background: rgba(255, 255, 255, 0.12);
        }

        .rn-members-principles {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 26px;
        }

        .rn-members-principles span {
          padding: 7px 10px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 30px;
          color: #d7e5f3;
          font-size: 9px;
          font-weight: 650;
        }

        .rn-members-hero-visual {
          position: relative;
          display: grid;
          place-items: center;
          min-height: 285px;
          isolation: isolate;
        }

        .rn-members-ring {
          position: absolute;
          width: min(270px, 90%);
          aspect-ratio: 1;
          border: 1px solid rgba(0, 180, 216, 0.24);
          border-radius: 50%;
        }

        .rn-members-ring-one {
          transform: rotate(-20deg) scaleY(0.75);
        }

        .rn-members-ring-two {
          transform: rotate(48deg) scaleY(0.75);
          border-color: rgba(251, 191, 36, 0.25);
        }

        .rn-members-hero-center {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 170px;
          height: 170px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 50%;
          background: linear-gradient(
            145deg,
            rgba(0, 180, 216, 0.17),
            rgba(255, 255, 255, 0.035)
          );
          box-shadow: 0 0 55px rgba(0, 180, 216, 0.1);
          backdrop-filter: blur(10px);
        }

        .rn-members-hero-symbol {
          display: grid;
          place-items: center;
          width: 49px;
          height: 49px;
          margin-bottom: 10px;
          border-radius: 15px;
          background: var(--rn-cyan);
          color: var(--rn-navy);
          font-size: 19px;
          font-weight: 950;
        }

        .rn-members-hero-center strong {
          color: #fff;
          font-size: 19px;
        }

        .rn-members-hero-center small {
          margin-top: 6px;
          color: #c8d9e9;
          font-size: 9px;
        }

        .rn-members-float {
          position: absolute;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.14);
          border-radius: 13px;
          background: rgba(14, 40, 68, 0.93);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.15);
          backdrop-filter: blur(10px);
        }

        .rn-members-float-top {
          top: 7px;
          right: 0;
        }

        .rn-members-float-bottom {
          bottom: 8px;
          left: 0;
        }

        .rn-members-float-icon {
          display: grid;
          place-items: center;
          width: 34px;
          height: 34px;
          border-radius: 10px;
          font-size: 17px;
          font-weight: 900;
        }

        .rn-float-cyan {
          background: rgba(0, 180, 216, 0.17);
          color: #53def3;
        }

        .rn-float-gold {
          background: rgba(251, 191, 36, 0.15);
          color: var(--rn-gold);
        }

        .rn-members-float strong,
        .rn-members-float small {
          display: block;
        }

        .rn-members-float strong {
          color: #fff;
          font-size: 10px;
        }

        .rn-members-float small {
          margin-top: 4px;
          color: #c0d1e2;
          font-size: 9px;
        }

        .rn-members-summary {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-top: 20px;
        }

        .rn-members-summary-card {
          display: flex;
          align-items: center;
          gap: 14px;
          min-width: 0;
          padding: 20px;
          border: 1px solid var(--rn-border);
          border-radius: 15px;
          background: #fff;
          box-shadow: 0 5px 20px rgba(18, 43, 72, 0.025);
        }

        .rn-summary-icon {
          display: grid;
          place-items: center;
          width: 43px;
          height: 43px;
          flex-shrink: 0;
          border-radius: 12px;
          font-size: 11px;
          font-weight: 900;
        }

        .rn-summary-cyan {
          background: #e3f9fd;
          color: #008aa5;
        }

        .rn-summary-purple {
          background: #f0eaff;
          color: #7652be;
        }

        .rn-summary-gold {
          background: #fff4d9;
          color: #966d0c;
        }

        .rn-members-summary-card strong {
          color: var(--rn-navy);
          font-size: 13px;
          font-weight: 850;
        }

        .rn-members-summary-card p {
          margin: 5px 0 0;
          color: var(--rn-muted);
          font-size: 11px;
          line-height: 1.6;
        }

        .rn-members-directory {
          margin-top: 52px;
        }

        .rn-members-section-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 22px;
        }

        .rn-members-section-kicker {
          margin: 0 0 9px;
          color: #008eaa;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1.5px;
        }

        .rn-members-section-heading h2,
        .rn-members-shortcuts-heading h2 {
          margin: 0;
          color: var(--rn-navy);
          font-size: clamp(25px, 3vw, 32px);
          font-weight: 850;
          letter-spacing: -0.8px;
          line-height: 1.2;
        }

        .rn-members-section-heading > div:first-child > p:last-child {
          margin: 10px 0 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-members-total {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          flex-shrink: 0;
          padding: 10px 13px;
          border: 1px solid var(--rn-border);
          border-radius: 30px;
          background: #fff;
          color: #596d83;
          font-size: 10px;
          font-weight: 750;
        }

        .rn-members-total-dot,
        .rn-results-indicator {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #1cba7a;
          box-shadow: 0 0 0 4px rgba(28, 186, 122, 0.1);
        }

        .rn-members-search-panel {
          padding: 23px;
          border: 1px solid var(--rn-border);
          border-radius: 18px;
          background:
            radial-gradient(
              circle at 100% 0,
              rgba(0, 180, 216, 0.055),
              transparent 32%
            ),
            #fff;
          box-shadow: 0 7px 25px rgba(18, 43, 72, 0.035);
        }

        .rn-search-heading {
          display: flex;
          align-items: center;
          gap: 13px;
          margin-bottom: 20px;
        }

        .rn-search-icon {
          display: grid;
          place-items: center;
          width: 43px;
          height: 43px;
          border-radius: 12px;
          background: #e4f9fd;
          color: #008aa5;
          font-size: 27px;
          font-weight: 500;
        }

        .rn-search-heading h3 {
          margin: 0;
          color: var(--rn-navy);
          font-size: 15px;
          font-weight: 850;
        }

        .rn-search-heading p {
          margin: 5px 0 0;
          color: var(--rn-muted);
          font-size: 11px;
          line-height: 1.6;
        }

        .rn-members-search-form {
          display: flex;
          align-items: flex-end;
          gap: 13px;
        }

        .rn-members-search-input-wrap {
          flex: 1;
          min-width: 0;
        }

        .rn-members-search-input-wrap label {
          display: block;
          margin-bottom: 8px;
          color: #3a4d64;
          font-size: 11px;
          font-weight: 750;
        }

        .rn-members-search-input-wrap input {
          display: block;
          width: 100%;
          min-height: 47px;
          padding: 0 14px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          outline: none;
          background: #fff;
          color: var(--rn-navy);
          font: inherit;
          font-size: 12px;
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease;
        }

        .rn-members-search-input-wrap input::placeholder {
          color: #9aa7b6;
        }

        .rn-members-search-input-wrap input:focus {
          border-color: var(--rn-cyan);
          box-shadow: 0 0 0 3px rgba(0, 180, 216, 0.12);
        }

        .rn-members-search-actions {
          display: flex;
          align-items: center;
          gap: 12px;
          flex-shrink: 0;
        }

        .rn-search-submit {
          background: var(--rn-navy);
          color: #fff !important;
          cursor: pointer;
        }

        .rn-search-submit:hover {
          background: #143b60;
        }

        .rn-members-clear {
          color: #63768c !important;
          font-size: 11px;
          font-weight: 750;
          text-decoration: none !important;
        }

        .rn-members-clear:hover {
          color: #008da9 !important;
        }

        .rn-members-search-status {
          margin: 15px 0 0;
          color: var(--rn-muted);
          font-size: 11px;
        }

        .rn-members-search-status strong {
          color: var(--rn-navy);
        }

        .rn-members-results-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 15px;
          margin: 30px 0 16px;
        }

        .rn-members-results-heading > div {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #536980;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1.3px;
        }

        .rn-results-note {
          color: #8a98a9;
          font-size: 10px;
        }

        .rn-members-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
        }

        .rn-member-card {
          display: flex;
          flex-direction: column;
          min-width: 0;
          padding: 20px;
          border: 1px solid var(--rn-border);
          border-radius: 17px;
          background: #fff;
          box-shadow: 0 5px 22px rgba(18, 43, 72, 0.025);
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease;
        }

        .rn-member-card:hover {
          transform: translateY(-4px);
          border-color: #bce7ef;
          box-shadow: 0 15px 35px rgba(18, 43, 72, 0.075);
        }

        .rn-member-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .rn-member-number {
          display: grid;
          place-items: center;
          width: 32px;
          height: 32px;
          border-radius: 10px;
          background: #edf9fc;
          color: #008aa5;
          font-size: 10px;
          font-weight: 900;
        }

        .rn-member-card-label {
          color: #98a4b2;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 0.8px;
        }

        .rn-member-identity {
          display: flex;
          align-items: center;
          gap: 13px;
          min-width: 0;
          margin-top: 23px;
        }

        .rn-member-avatar-link {
          display: block;
          flex-shrink: 0;
          border-radius: 50%;
          outline-offset: 4px;
        }

        .rn-member-avatar {
          display: grid;
          place-items: center;
          width: 72px;
          height: 72px;
          border: 3px solid #e7f8fb;
          border-radius: 50%;
          object-fit: cover;
        }

        .rn-member-avatar-fallback {
          background: linear-gradient(145deg, #dff8fc, #e9edff);
          color: #123653;
          font-size: 21px;
          font-weight: 900;
        }

        .rn-member-identity-copy {
          min-width: 0;
        }

        .rn-member-identity-copy h3 {
          margin: 0;
          overflow-wrap: anywhere;
          font-size: 15px;
          font-weight: 850;
          line-height: 1.45;
        }

        .rn-member-identity-copy h3 a {
          color: var(--rn-navy) !important;
          text-decoration: none !important;
        }

        .rn-member-identity-copy h3 a:hover {
          color: #008da9 !important;
        }

        .rn-member-language {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          margin-top: 8px;
          padding: 5px 8px;
          border-radius: 30px;
          background: #f0f9fb;
          color: #39768a;
          font-size: 9px;
          font-weight: 750;
        }

        .rn-language-muted {
          background: #f2f5f8;
          color: #7b8999;
        }

        .rn-member-bio-wrap {
          flex: 1;
          margin-top: 21px;
        }

        .rn-member-bio {
          display: -webkit-box;
          overflow: hidden;
          min-height: 63px;
          margin: 0;
          color: #69798c;
          font-size: 12px;
          line-height: 1.8;
          overflow-wrap: anywhere;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
        }

        .rn-member-card-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 20px;
          padding-top: 16px;
          border-top: 1px solid #edf1f5;
        }

        .rn-member-profile-button,
        .rn-member-connect-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          min-height: 37px;
          padding: 0 11px;
          border-radius: 9px;
          font-size: 10px;
          font-weight: 800;
          text-decoration: none !important;
          transition:
            background 180ms ease,
            color 180ms ease,
            border-color 180ms ease;
        }

        .rn-member-profile-button {
          border: 1px solid #dfe7ef;
          background: #fff;
          color: var(--rn-navy) !important;
        }

        .rn-member-profile-button:hover {
          border-color: #b9e5ed;
          background: #f1fcfe;
        }

        .rn-member-connect-button {
          background: var(--rn-cyan);
          color: #06243a !important;
        }

        .rn-member-connect-button:hover {
          background: #46cde5;
        }

        .rn-members-limit-note {
          display: flex;
          align-items: flex-start;
          gap: 11px;
          margin-top: 18px;
          padding: 15px;
          border: 1px solid #dbeaf1;
          border-radius: 12px;
          background: #f5fbfd;
        }

        .rn-members-limit-note > span {
          display: grid;
          place-items: center;
          width: 21px;
          height: 21px;
          flex-shrink: 0;
          border-radius: 50%;
          background: #dff6fb;
          color: #007f99;
          font-size: 11px;
          font-weight: 900;
        }

        .rn-members-limit-note p {
          margin: 2px 0 0;
          color: #5e7286;
          font-size: 11px;
          line-height: 1.7;
        }

        .rn-members-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 45px 24px;
          border: 1px dashed #cfdae5;
          border-radius: 18px;
          background:
            radial-gradient(
              circle at 50% 0,
              rgba(0, 180, 216, 0.055),
              transparent 60%
            ),
            #fbfdff;
          text-align: center;
        }

        .rn-members-empty-icon {
          display: grid;
          place-items: center;
          width: 49px;
          height: 49px;
          margin-bottom: 19px;
          border-radius: 15px;
          background: #e4f9fd;
          color: #008aa5;
          font-size: 19px;
          font-weight: 900;
        }

        .rn-members-empty h3 {
          margin: 0;
          color: var(--rn-navy);
          font-size: 19px;
          font-weight: 850;
        }

        .rn-members-empty > p:not(.rn-members-section-kicker) {
          max-width: 450px;
          margin: 10px 0 20px;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-members-empty .rn-members-section-kicker {
          margin-bottom: 10px;
        }

        .rn-members-network-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 25px;
          margin-top: 52px;
          padding: clamp(25px, 4vw, 38px);
          border-radius: 20px;
          background:
            radial-gradient(
              circle at 90% 20%,
              rgba(0, 180, 216, 0.16),
              transparent 36%
            ),
            var(--rn-navy);
          color: #fff;
        }

        .rn-members-banner-kicker {
          margin: 0 0 12px;
          color: #5cdaef;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1.4px;
        }

        .rn-members-banner-copy h2 {
          max-width: 580px;
          margin: 0;
          color: #fff;
          font-size: clamp(23px, 3vw, 31px);
          font-weight: 850;
          letter-spacing: -0.7px;
          line-height: 1.3;
        }

        .rn-members-banner-copy > p:last-child {
          max-width: 550px;
          margin: 10px 0 0;
          color: #c6d7e8;
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-members-banner-actions {
          display: flex;
          flex-shrink: 0;
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
        }

        .rn-banner-primary {
          background: var(--rn-cyan);
          color: #06243a !important;
        }

        .rn-banner-primary:hover {
          background: #46cde5;
        }

        .rn-members-banner-link {
          padding: 10px;
          color: #d4e4f3 !important;
          font-size: 10px;
          font-weight: 750;
          text-align: center;
          text-decoration: none !important;
        }

        .rn-members-shortcuts {
          margin-top: 48px;
        }

        .rn-members-shortcuts-heading {
          margin-bottom: 20px;
        }

        .rn-members-shortcut-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 15px;
        }

        .rn-members-shortcut {
          display: flex;
          align-items: center;
          gap: 12px;
          min-width: 0;
          padding: 17px;
          border: 1px solid var(--rn-border);
          border-radius: 14px;
          background: #fff;
          text-decoration: none !important;
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease;
        }

        .rn-members-shortcut:hover {
          transform: translateY(-3px);
          border-color: #bfe8ef;
          box-shadow: 0 10px 25px rgba(18, 43, 72, 0.05);
        }

        .rn-shortcut-icon {
          display: grid;
          place-items: center;
          width: 39px;
          height: 39px;
          flex-shrink: 0;
          border-radius: 11px;
          font-size: 13px;
          font-weight: 900;
        }

        .rn-shortcut-cyan {
          background: #e3f9fd;
          color: #008aa5;
        }

        .rn-shortcut-gold {
          background: #fff4d9;
          color: #946a0b;
        }

        .rn-shortcut-purple {
          background: #f0eaff;
          color: #7652be;
        }

        .rn-shortcut-copy {
          display: flex;
          flex: 1;
          flex-direction: column;
          gap: 5px;
          min-width: 0;
        }

        .rn-shortcut-copy strong {
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 850;
        }

        .rn-shortcut-copy small {
          color: var(--rn-muted);
          font-size: 10px;
          line-height: 1.6;
        }

        .rn-shortcut-arrow {
          flex-shrink: 0;
          color: #008da9;
          font-size: 17px;
          font-weight: 800;
        }

        @media (max-width: 1000px) {
          .rn-members-hero {
            grid-template-columns: 1fr 0.8fr;
            padding: 32px;
          }

          .rn-members-hero h1 {
            font-size: 43px;
          }

          .rn-members-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .rn-members-summary-card {
            padding: 16px;
          }

          .rn-members-summary-card p {
            font-size: 10px;
          }
        }

        @media (max-width: 760px) {
          .rn-members-hero {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .rn-members-hero-visual {
            width: 100%;
            max-width: 460px;
            min-height: 240px;
            margin: 0 auto;
          }

          .rn-members-ring {
            width: 220px;
          }

          .rn-members-hero-center {
            width: 145px;
            height: 145px;
          }

          .rn-members-summary {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .rn-members-summary-card {
            padding: 17px;
          }

          .rn-members-network-banner {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-members-banner-actions {
            width: 100%;
            max-width: 300px;
          }

          .rn-members-shortcut-grid {
            grid-template-columns: 1fr;
          }
        }

        @media (max-width: 520px) {
          .rn-members-page {
            padding: 17px 0 38px;
          }

          .rn-members-container {
            width: calc(100% - 28px);
          }

          .rn-members-hero {
            padding: 25px 20px 16px;
            border-radius: 20px;
          }

          .rn-members-kicker {
            font-size: 9px;
            letter-spacing: 1.1px;
          }

          .rn-members-hero h1 {
            margin-top: 20px;
            font-size: clamp(32px, 9vw, 43px);
            letter-spacing: -1.7px;
          }

          .rn-members-hero-copy > p {
            font-size: 12px;
          }

          .rn-members-hero-actions {
            flex-direction: column;
          }

          .rn-members-hero-actions .rn-members-button {
            width: 100%;
          }

          .rn-members-principles {
            gap: 6px;
          }

          .rn-members-principles span {
            font-size: 8px;
          }

          .rn-members-hero-visual {
            min-height: 210px;
          }

          .rn-members-ring {
            width: 190px;
          }

          .rn-members-hero-center {
            width: 130px;
            height: 130px;
          }

          .rn-members-hero-symbol {
            width: 39px;
            height: 39px;
            font-size: 16px;
          }

          .rn-members-hero-center strong {
            font-size: 16px;
          }

          .rn-members-float {
            gap: 7px;
            padding: 9px;
          }

          .rn-members-float-icon {
            width: 29px;
            height: 29px;
          }

          .rn-members-float strong {
            font-size: 9px;
          }

          .rn-members-float small {
            font-size: 8px;
          }

          .rn-members-directory {
            margin-top: 38px;
          }

          .rn-members-section-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 13px;
          }

          .rn-members-section-heading h2,
          .rn-members-shortcuts-heading h2 {
            font-size: 26px;
          }

          .rn-members-search-panel {
            padding: 18px;
          }

          .rn-members-search-form {
            align-items: stretch;
            flex-direction: column;
          }

          .rn-members-search-actions {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .rn-members-search-actions .rn-search-submit {
            flex: 1;
          }

          .rn-members-results-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 9px;
          }

          .rn-members-grid {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .rn-member-card {
            padding: 19px;
          }

          .rn-member-identity {
            margin-top: 20px;
          }

          .rn-member-avatar {
            width: 67px;
            height: 67px;
          }

          .rn-member-card-footer {
            gap: 8px;
          }

          .rn-member-profile-button,
          .rn-member-connect-button {
            padding: 0 10px;
          }

          .rn-members-network-banner {
            gap: 20px;
            margin-top: 38px;
            padding: 25px 20px;
            border-radius: 17px;
          }

          .rn-members-banner-copy h2 {
            font-size: 25px;
          }

          .rn-members-shortcuts {
            margin-top: 38px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-members-page *,
          .rn-members-page *::before,
          .rn-members-page *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </>
  );
}