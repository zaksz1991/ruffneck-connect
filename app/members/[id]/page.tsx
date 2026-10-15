import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PublicMember = {
  profile_id: string;
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  locale: string | null;
};

type MemberPageProps = {
  params: Promise<{
    id: string;
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
      )}&sz=w600`;
    }

    if (url.protocol !== "https:" && url.protocol !== "http:") {
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

export default async function MemberProfilePage({
  params,
}: MemberPageProps) {
  const { id } = await params;

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      id
    );

  if (!isUuid) notFound();

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/members/${id}`)}`);
  }

  const { data, error } = await supabase.rpc(
    "get_public_member_profile",
    {
      p_profile_id: id,
    }
  );

  if (error) {
    console.error("Public member profile lookup failed:", error.message);

    return (
      <main className="container page-section">
        <Link href="/members" className="text-link">
          ← Back to members
        </Link>

        <section className="card" style={{ marginTop: 24 }}>
          <h1>Profile unavailable</h1>
          <p>
            This profile could not be loaded. Please try again later.
          </p>
        </section>
      </main>
    );
  }

  const member = (Array.isArray(data) ? data[0] : data) as
    | PublicMember
    | null;

  if (!member) notFound();

  const name = member.full_name?.trim() || "RuffNeck member";
  const avatarUrl = getAvatarDisplayUrl(member.avatar_url);

  return (
    <main className="container page-section">
      <Link href="/members" className="text-link">
        ← Back to members
      </Link>

      <section
        className="card"
        style={{
          marginTop: 24,
          padding: "clamp(24px, 5vw, 48px)",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            flexWrap: "wrap",
            marginBottom: 32,
          }}
        >
          {avatarUrl ? (
            <Image
              src={avatarUrl}
              alt={`${name}'s profile photo`}
              width={120}
              height={120}
              unoptimized
              style={{
                width: 120,
                height: 120,
                borderRadius: "50%",
                objectFit: "cover",
                background: "var(--surface, #f3f6fa)",
              }}
            />
          ) : (
            <div
              aria-label={`${name}'s initials`}
              style={{
                width: 120,
                height: 120,
                flexShrink: 0,
                display: "grid",
                placeItems: "center",
                borderRadius: "50%",
                background: "var(--navy, #0b1e3a)",
                color: "#fff",
                fontSize: 36,
                fontWeight: 700,
              }}
            >
              {getInitials(name) || "R"}
            </div>
          )}

          <div style={{ flex: "1 1 240px" }}>
            <p className="eyebrow">RUFFNECK CONNECT · MEMBER PROFILE</p>
            <h1 style={{ marginBottom: 10 }}>{name}</h1>

            {member.locale && (
              <p className="muted">{member.locale}</p>
            )}
          </div>
        </div>

        <div
          style={{
            borderTop: "1px solid var(--border, #d9e1ec)",
            paddingTop: 24,
          }}
        >
          <h2>About</h2>

          <p
            style={{
              lineHeight: 1.8,
              whiteSpace: "pre-wrap",
              overflowWrap: "anywhere",
            }}
          >
            {member.bio?.trim() ||
              "This member has not added a biography yet."}
          </p>
        </div>

        <div
          style={{
            display: "flex",
            gap: 12,
            flexWrap: "wrap",
            marginTop: 28,
          }}
        >
          <Link href="/communities" className="button">
            Explore communities
          </Link>

          <Link href="/messages" className="button button-secondary">
            Open messages
          </Link>
        </div>
      </section>
    </main>
  );
}