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
    <main className="profile-page">
      <div className="container profile-container">
        <header className="profile-page-heading">
          <p className="eyebrow">RUFFNECK CONNECT</p>
          <h1>Member directory</h1>
          <p>
            Discover people, explore shared interests, and build
            meaningful connections across the community.
          </p>
        </header>

        <section className="card" style={{ marginBottom: 28 }}>
          <form
            action="/members"
            method="get"
            role="search"
            className="profile-form"
          >
            <div className="form-field">
              <label htmlFor="member-search">
                Search members
              </label>

              <input
                id="member-search"
                type="search"
                name="q"
                defaultValue={search}
                maxLength={100}
                placeholder="Search by name or introduction"
              />
            </div>

            <div
              className="profile-form-actions"
              style={{ marginTop: 0 }}
            >
              <button type="submit" className="button">
                Search
              </button>

              {search && (
                <Link
                  href="/members"
                  className="button button-secondary"
                >
                  Clear search
                </Link>
              )}
            </div>
          </form>

          <p className="form-help" style={{ marginTop: 16 }}>
            {search
              ? `Search results for "${search}"`
              : "Search for members by name or biography."}
          </p>
        </section>

        {error ? (
          <section className="card">
            <h2>Directory temporarily unavailable</h2>
            <p>
              We could not load the member directory. Please try again
              later.
            </p>
          </section>
        ) : members.length === 0 ? (
          <section className="card" style={{ textAlign: "center" }}>
            <p className="eyebrow">NO MATCHES FOUND</p>

            <h2>
              {search
                ? "No members match your search"
                : "No members to display yet"}
            </h2>

            <p>
              {search
                ? "Try another name or search term."
                : "Members who make their profiles visible will appear here."}
            </p>

            {search && (
              <Link
                href="/members"
                className="button"
                style={{ marginTop: 16 }}
              >
                View all members
              </Link>
            )}
          </section>
        ) : (
          <>
            <div className="profile-editor-heading">
              <p className="eyebrow">COMMUNITY MEMBERS</p>
              <h2>
                {members.length}
                {members.length === 100 ? "+" : ""}{" "}
                {members.length === 1 ? "member" : "members"}
              </h2>
              <p>Select a profile to learn more about a member.</p>
            </div>

            <section
              className="member-directory-grid"
              aria-label="Member profiles"
            >
              {members.map((member) => {
                const name =
                  member.full_name?.trim() || "RuffNeck member";

                const avatarUrl = getAvatarUrl(member.avatar_url);
                const language = getLanguageName(member.locale);

                return (
                  <article
                    key={member.profile_id}
                    className="card member-directory-card"
                  >
                    <div className="member-directory-identity">
                      <Link
                        href={`/members/${member.profile_id}`}
                        aria-label={`View ${name}'s profile`}
                        className="member-directory-avatar-link"
                      >
                        {avatarUrl ? (
                          <Image
                            src={avatarUrl}
                            alt={`${name}'s profile photo`}
                            width={76}
                            height={76}
                            unoptimized
                            className="profile-avatar"
                          />
                        ) : (
                          <span
                            className="profile-avatar profile-avatar-fallback"
                            aria-hidden="true"
                          >
                            {getInitials(name)}
                          </span>
                        )}
                      </Link>

                      <div className="profile-identity-copy">
                        <h3>
                          <Link href={`/members/${member.profile_id}`}>
                            {name}
                          </Link>
                        </h3>

                        {language && (
                          <p className="muted">{language}</p>
                        )}
                      </div>
                    </div>

                    <p className="member-directory-bio">
                      {member.bio?.trim() ||
                        "This member has not added an introduction yet."}
                    </p>

                    <div className="member-directory-actions">
                      <Link
                        href={`/members/${member.profile_id}`}
                        className="button button-secondary"
                      >
                        View profile
                      </Link>

                      <Link
                        href={`/messages?to=${encodeURIComponent(
                          member.profile_id
                        )}`}
                        className="text-link"
                      >
                        Connect →
                      </Link>
                    </div>
                  </article>
                );
              })}
            </section>

            {members.length === 100 && (
              <p className="form-help" style={{ marginTop: 20 }}>
                Showing up to 100 members. Use search to narrow the
                results.
              </p>
            )}
          </>
        )}

        <section className="profile-shortcuts" style={{ marginTop: 36 }}>
          <h2>Build your network</h2>

          <div className="profile-shortcut-grid">
            <Link href="/communities" className="profile-shortcut">
              <span>
                <strong>Communities</strong>
                <small>Join groups around shared interests.</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>

            <Link href="/intents" className="profile-shortcut">
              <span>
                <strong>Discover</strong>
                <small>Explore needs, offers, and projects.</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>

            <Link href="/messages" className="profile-shortcut">
              <span>
                <strong>Messages</strong>
                <small>Continue your conversations.</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}