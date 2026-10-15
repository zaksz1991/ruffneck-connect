import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
};

type Community = {
  id: string;
  owner_id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  location_label: string | null;
  visibility: "public" | "private";
  join_approval_required: boolean;
  status: "active" | "suspended" | "archived";
  created_at: string;
};

type Intent = {
  id: string;
  intent_type: "need" | "offer" | "build";
  title: string;
  description: string;
  category: string | null;
  status: string;
  created_at: string;
};

export default async function CommunityDetailsPage({ params }: PageProps) {
  const { slug } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/communities/${slug}`)}`
    );
  }

  const { data: communityData, error } = await supabase
    .from("communities")
    .select(
      "id, owner_id, name, slug, description, category, location_label, visibility, join_approval_required, status, created_at"
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error || !communityData) {
    notFound();
  }

  const community = communityData as Community;

  if (community.status !== "active" && community.owner_id !== user.id) {
    notFound();
  }

  const { data: membershipData } = await supabase
    .from("community_members")
    .select("role, status, joined_at")
    .eq("community_id", community.id)
    .eq("user_id", user.id)
    .maybeSingle();

  const membership = membershipData;

  const isOwner = community.owner_id === user.id;
  const isMember = membership?.status === "active";
  const isPending = membership?.status === "pending";

  const { count: memberCount } = await supabase
    .from("community_members")
    .select("*", { count: "exact", head: true })
    .eq("community_id", community.id)
    .eq("status", "active");

  let intents: Intent[] = [];

  if (isMember || isOwner) {
    const { data } = await supabase
      .from("intents")
      .select(
        "id, intent_type, title, description, category, status, created_at"
      )
      .eq("community_id", community.id)
      .in("status", ["open", "in_progress"])
      .order("created_at", { ascending: false })
      .limit(20);

    intents = (data ?? []) as Intent[];
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", community.owner_id)
    .maybeSingle();

  const ownerName = profile?.full_name || "Community owner";

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-NG", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(value));

  return (
    <main className="page-shell">
      <section className="hero">
        <div className="hero-content">
          <span className="eyebrow">
            {community.category || "COMMUNITY"}
          </span>

          <h1>{community.name}</h1>

          <p>
            {community.description ||
              "A community for people to connect, share opportunities, and take action."}
          </p>

          <div className="intent-meta">
            {community.location_label && (
              <span>{community.location_label}</span>
            )}
            <span>{memberCount ?? 0} members</span>
            <span>
              {community.visibility === "public" ? "Public" : "Private"}
            </span>
          </div>

          <div className="hero-actions">
            {isMember && (
              <Link
                className="button button-primary"
                href={`/intents/new?type=need`}
              >
                Publish an intention
              </Link>
            )}

            {!isMember && !isPending && !isOwner && (
              <form
                action={`/api/communities/${community.id}/join`}
                method="post"
              >
                <button className="button button-primary" type="submit">
                  {community.join_approval_required
                    ? "Request to join"
                    : "Join community"}
                </button>
              </form>
            )}

            {isPending && (
              <span className="status-badge status-pending">
                Membership pending approval
              </span>
            )}

            {isMember && (
              <span className="status-badge status-active">
                You are a member
              </span>
            )}

            {isOwner && (
              <span className="status-badge status-active">
                You own this community
              </span>
            )}

            <Link className="button button-secondary" href="/communities">
              All communities
            </Link>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-heading">
          <div>
            <span className="eyebrow">ABOUT</span>
            <h2>Community information</h2>
          </div>
        </div>

        <div className="grid-2">
          <article className="feature-card">
            <h3>Community details</h3>
            <p>
              <strong>Created by:</strong> {ownerName}
            </p>
            <p>
              <strong>Created:</strong> {formatDate(community.created_at)}
            </p>
            <p>
              <strong>Category:</strong>{" "}
              {community.category || "General"}
            </p>
            <p>
              <strong>Location:</strong>{" "}
              {community.location_label || "Not specified"}
            </p>
            <p>
              <strong>Membership:</strong>{" "}
              {community.join_approval_required
                ? "Approval required"
                : "Open to join"}
            </p>
          </article>

          <article className="feature-card">
            <h3>Community purpose</h3>
            <p>
              Use this space to share needs, contribute skills and resources,
              and find people interested in building useful projects together.
            </p>
            {!isMember && !isOwner && (
              <p className="muted">
                Join the community to participate in its intentions.
              </p>
            )}
          </article>
        </div>
      </section>

      {(isMember || isOwner) && (
        <section className="section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">NEED · OFFER · BUILD</span>
              <h2>Open intentions</h2>
              <p className="muted">
                Recent opportunities shared in this community.
              </p>
            </div>

            <Link
              className="button button-primary"
              href="/intents/new?type=need"
            >
              Create intention
            </Link>
          </div>

          {intents.length === 0 ? (
            <div className="empty-state">
              <h3>No open intentions yet</h3>
              <p>Be the first to share an opportunity with this community.</p>
            </div>
          ) : (
            <div className="grid-3">
              {intents.map((intent) => (
                <article className="feature-card" key={intent.id}>
                  <span
                    className={`intent-badge intent-${intent.intent_type}`}
                  >
                    {intent.intent_type.toUpperCase()}
                  </span>

                  <h3>{intent.title}</h3>

                  <p className="intent-description">
                    {intent.description.length > 180
                      ? `${intent.description.slice(0, 180).trim()}…`
                      : intent.description}
                  </p>

                  {intent.category && (
                    <p className="muted">{intent.category}</p>
                  )}

                  <Link
                    className="button button-secondary"
                    href={`/intents/${intent.id}`}
                  >
                    View intention
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      )}
    </main>
  );
}