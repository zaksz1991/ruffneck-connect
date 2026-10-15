import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublicMember = {
  profile_id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  locale: string | null;
};

type MembersPageProps = {
  searchParams: Promise<{
    q?: string;
  }>;
};

function getAvatarDisplayUrl(value: string | null): string {
  if (!value) return "";

  try {
    const url = new URL(value);

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
      )}&sz=w300`;
    }

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default async function MembersPage({
  searchParams,
}: MembersPageProps) {
  const { q = "" } = await searchParams;
  const search = q.trim().slice(0, 100);

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

  const members = (data ?? []) as PublicMember[];

  return (
    <main className="container page-section">
      <section className="page-heading">
        <p className="eyebrow">RUFFNECK CONNECT · COMMUNITY</p>

        <h1>Find your people.</h1>

        <p>
          Discover members, learn about their interests, and find
          people to connect and collaborate with.
        </p>
      </section>

      <section
        className="card"
        style={{ marginBottom: 28 }}
        aria-label="Search members"
      >
        <form
          method="get"
          action="/members"
          className="row"
          style={{
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label
            htmlFor="member-search"
            style={{
              fontWeight: 600,
              width: "100%",
            }}
          >
            Search members
          </label>

          <input
            id="member-search"
            type="search"
            name="q"
            defaultValue={search}
            placeholder="Search names or biographies"
            maxLength={100}
            style={{
              flex: "1 1 260px",
              minWidth: 0,
              padding: "12px 14px",
              border: "1px solid var(--border, #d9e1ec)",
              borderRadius: 10,
              background: "var(--surface, #fff)",
              color: "inherit",
              font: "inherit",
            }}
          />

          <button type="submit" className="button">
            Search
          </button>

          {search && (
            <Link href="/members" className="text-link">
              Clear search
            </Link>
          )}
        </form>
      </section>

      <section>
        <div
          className="row"
          style={{
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: 18,
          }}
        >
          <div>
            <p className="eyebrow">THE NETWORK</p>
            <h2 style={{ marginBottom: 0 }}>
              {search ? "Search results" : "Community members"}
            </h2>
          </div>

          <span className="muted">
            {members.length}{" "}
            {members.length === 1 ? "member" : "members"}
          </span>
        </div>

        {error ? (
          <div className="empty-state">
            <h3>Members could not be loaded.</h3>
            <p>
              The directory request failed. Check that the
              get_public_member_directory RPC exists in Supabase
              and that authenticated users can execute it.
            </p>
          </div>
        ) : members.length === 0 ? (
          <div className="empty-state">
            <h3>
              {search
                ? "No members matched your search."
                : "The directory is waiting for its first results."}
            </h3>

            <p>
              {search
                ? "Try another name or a different search term."
                : "Members with directory profiles will appear here."}
            </p>

            {search && (
              <Link href="/members" className="button">
                View all members
              </Link>
            )}
          </div>
        ) : (
          <div className="grid grid-3">
            {members.map((member) => {
              const name =
                member.full_name?.trim() || "RuffNeck member";

              const avatarUrl = getAvatarDisplayUrl(
                member.avatar_url
              );

              return (
                <article
                  className="card"
                  key={member.profile_id}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "flex-start",
                    gap: 14,
                  }}
                >
                  {avatarUrl ? (
                    <Image
                      src={avatarUrl}
                      alt={`${name}'s profile photo`}
                      width={76}
                      height={76}
                      unoptimized
                      style={{
                        width: 76,
                        height: 76,
                        borderRadius: "50%",
                        objectFit: "cover",
                        background: "var(--surface, #f3f6fa)",
                      }}
                    />
                  ) : (
                    <div
                      aria-label={`${name}'s initials`}
                      style={{
                        width: 76,
                        height: 76,
                        flexShrink: 0,
                        display: "grid",
                        placeItems: "center",
                        borderRadius: "50%",
                        background: "var(--navy, #0b1e3a)",
                        color: "#fff",
                        fontSize: 23,
                        fontWeight: 700,
                      }}
                    >
                      {getInitials(name) || "R"}
                    </div>
                  )}

                  <div>
                    <h3 style={{ marginBottom: 6 }}>{name}</h3>

                    {member.locale && (
                      <p
                        className="muted"
                        style={{ fontSize: 13, marginBottom: 8 }}
                      >
                        {member.locale}
                      </p>
                    )}

                    <p className="muted">
                      {member.bio?.trim()
                        ? member.bio.length > 180
                          ? `${member.bio.slice(0, 180)}…`
                          : member.bio
                        : "This member has not added a biography yet."}
                    </p>
                  </div>

                  <Link
                    href={`/members/${member.profile_id}`}
                    className="text-link"
                    style={{ marginTop: "auto" }}
                  >
                    View profile →
                  </Link>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}