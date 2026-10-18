import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MemberConnectionButton from "@/components/MemberConnectionButton";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{
    id: string;
  }>;
};

type PublicMember = {
  profile_id: string;
  full_name: string;
  bio: string | null;
  avatar_url: string | null;
  locale: string | null;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getAvatarDisplayUrl(value: string | null): string {
  if (!value) return "";

  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";

    if (url.hostname === "drive.google.com" || url.hostname === "www.drive.google.com") {
      const fileId =
        url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
        url.searchParams.get("id");
      if (!fileId) return "";
      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(fileId)}&sz=w800`;
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

const languageNames: Record<string, string> = {
  en: "English",
  ha: "Hausa",
  yo: "Yoruba",
  ig: "Igbo",
};

export default async function PublicMemberPage({ params }: PageProps) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/members/${id}`)}`);
  }

  if (user.id === id) {
    redirect("/profile");
  }

  const { data, error } = await supabase.rpc("get_public_member_profile", {
    p_profile_id: id,
  });

  if (error) {
    console.error("Failed to load public member profile:", error.message);
    return (
      <main className="page-shell">
        <section className="section">
          <h1>Profile unavailable</h1>
          <p className="muted">This profile could not be loaded. Please try again.</p>
          <Link href="/members" className="button button-secondary">Back to members</Link>
        </section>
      </main>
    );
  }

  const rows = (data ?? []) as PublicMember[];
  const member = rows[0];
  if (!member) notFound();

  const avatarUrl = getAvatarDisplayUrl(member.avatar_url);

  return (
    <main className="page-shell">
      <section className="section">
        <div className="section-heading">
          <div>
            <Link href="/members" className="muted">← Back to members</Link>
            <p className="eyebrow" style={{ marginTop: 16 }}>RUFFNECK CONNECT MEMBER</p>
            <h1>{member.full_name}</h1>
            {member.locale && (
              <p className="muted">
                {languageNames[member.locale.toLowerCase()] ?? member.locale}
              </p>
            )}
          </div>
          <Link href="/connections" className="button button-secondary">
            My connections & requests
          </Link>
        </div>

        <article className="feature-card" style={{ maxWidth: 820, margin: "24px auto", padding: "clamp(24px, 5vw, 48px)" }}>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", textAlign: "center", gap: 18 }}>
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={`${member.full_name}'s profile photo`}
                width={128}
                height={128}
                unoptimized
                style={{ width: 128, height: 128, borderRadius: "50%", objectFit: "cover" }}
              />
            ) : (
              <div aria-hidden="true" style={{ display: "grid", width: 128, height: 128, placeItems: "center", borderRadius: "50%", background: "#0b1e3a", color: "#ffffff", fontSize: 38, fontWeight: 800 }}>
                {getInitials(member.full_name)}
              </div>
            )}
            <div>
              <h2>{member.full_name}</h2>
              {member.locale && <p className="muted">{languageNames[member.locale.toLowerCase()] ?? member.locale}</p>}
            </div>
          </div>

          <div style={{ marginTop: 32, paddingTop: 24, borderTop: "1px solid var(--border)" }}>
            <h2>About</h2>
            <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
              {member.bio?.trim() || "This member has not added an introduction yet."}
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12, marginTop: 28 }}>
            <MemberConnectionButton otherUserId={member.profile_id} />
            <Link href="/communities" className="button button-secondary">Explore communities</Link>
            <Link href="/intents" className="button button-secondary">Discover opportunities</Link>
          </div>
        </article>
      </section>
    </main>
  );
}
