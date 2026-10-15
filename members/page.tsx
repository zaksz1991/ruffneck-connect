import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublicMember = {
  profile_id: string;
  full_name: string;
  bio: string | null;
  avatar_url: string | null;
  locale: string | null;
};

type PageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

function getAvatarDisplayUrl(value: string | null): string {
  if (!value) return "";

  try {
    const url = new URL(value);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return "";
    }

    if (
      url.hostname === "drive.google.com" ||
      url.hostname === "www.drive.google.com"
    ) {
      const fileId =
        url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
        url.searchParams.get("id");

      if (!fileId) return "";

      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
        fileId
      )}&sz=w400`;
    }

    return url.toString();
  } catch {
    return "";
  }
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0].toUpperCase())
      .join("") || "RN"
  );
}

export default async function MembersPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const query = (params.q ?? "").trim().slice(0, 80);

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
      p_search: query || null,
    }
  );

  const members = (data ?? []) as PublicMember[];

  return (
    <main className="page-shell">
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">THE PEOPLE BEHIND THE NETWORK</p>

            <h1>Discover Members</h1>

            <p className="muted">
              Find people with shared interests, useful experience,
              and ideas worth exploring.
            </p>
          </div>
        </div>

        <form
          action="/members"
          method="get"
          role="search"
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            marginBottom: 28,
          }}
        >
          <input
            type="search"
            name="q"
            defaultValue={query}
            maxLength={80}
            placeholder="Search by name or introduction..."
            aria-label="Search members"
            style={{
              flex: "1 1 260px",
              minWidth: 0,
            }}
          />

          <button type="submit">
            Search members
          </button>

          {query && (
            <Link
              href="/members"
              className="button button-secondary"
            >
              Clear
            </Link>
          )}
        </form>

        {error ? (
          <div className="empty-state" role="alert">
            <h2>Members could not be loaded</h2>

            <p>
              Check that the public member database functions
              have been created successfully in Supabase.
            </p>
          </div>
        ) : members.length === 0 ? (
          <div className="empty-state">
            <h2>
              {query
                ? "No matching members"
                : "No other members to display yet"}
            </h2>

            <p>
              {query
                ? "Try another name or search term."
                : "More member profiles will appear here as people complete their introductions."}
            </p>

            {query && (
              <Link
                href="/members"
                className="button button-secondary"
              >
                View all members
              </Link>
            )}
          </div>
        ) : (
          <>
            <p
              className="muted"
              style={{ marginBottom: 20 }}
            >
              {members.length === 100
                ? "Showing up to 100 members."
                : `${members.length} member${members.length === 1 ? "" : "s"} found.`}
            </p>

            <div className="grid-3">
              {members.map((member) => {
                const avatarUrl = getAvatarDisplayUrl(
                  member.avatar_url
                );

                return (
                  <article
                    className="feature-card"
                    key={member.profile_id}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                        marginBottom: 18,
                      }}
                    >
                      {avatarUrl ? (
                        <Image
                          src={avatarUrl}
                          alt=""
                          width={68}
                          height={68}
                          unoptimized
                          style={{
                            width: 68,
                            height: 68,
                            flexShrink: 0,
                            borderRadius: "50%",
                            objectFit: "cover",
                          }}
                        />
                      ) : (
                        <div
                          aria-hidden="true"
                          style={{
                            display: "grid",
                            width: 68,
                            height: 68,
                            flexShrink: 0,
                            placeItems: "center",
                            borderRadius: "50%",
                            background: "#0b1e3a",
                            color: "#ffffff",
                            fontSize: 21,
                            fontWeight: 800,
                          }}
                        >
                          {getInitials(member.full_name)}
                        </div>
                      )}

                      <div style={{ minWidth: 0 }}>
                        <h2
                          style={{
                            marginBottom: 4,
                            overflowWrap: "anywhere",
                          }}
                        >
                          {member.full_name}
                        </h2>

                        {member.locale && (
                          <p className="muted">
                            {member.locale.toUpperCase()}
                          </p>
                        )}
                      </div>
                    </div>

                    <p>
                      {member.bio?.trim()
                        ? member.bio.length > 150
                          ? `${member.bio.slice(0, 150).trim()}…`
                          : member.bio
                        : "This member has not added an introduction yet."}
                    </p>

                    <Link
                      href={`/members/${member.profile_id}`}
                      className="button button-secondary"
                      style={{ marginTop: 12 }}
                    >
                      View profile →
                    </Link>
                  </article>
                );
              })}
            </div>
          </>
        )}
      </section>
    </main>
  );
}