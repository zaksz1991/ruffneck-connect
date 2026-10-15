import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationBell from "@/components/NotificationBell";

export const dynamic = "force-dynamic";

type IntentType = "need" | "offer" | "build";

type Intent = {
  id: string;
  community_id: string;
  author_id: string;
  intent_type: IntentType;
  title: string;
  description: string;
  category: string | null;
  location_label: string | null;
  status: string;
  created_at: string;
};

type Community = {
  id: string;
  name: string;
  slug: string;
};

const intentLabels: Record<IntentType, string> = {
  need: "Need",
  offer: "Offer",
  build: "Build",
};

export default async function IntentsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/intents");
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    return (
      <>
        <header className="site-header">
          <div className="container site-header-inner">
            <Link href="/home" className="brand">
              <span className="brand-mark">RN</span>
              <span>RuffNeck Connect</span>
            </Link>
            <nav className="site-nav" aria-label="Main navigation">
              <Link href="/home">Home</Link>
              <Link href="/communities">Communities</Link>
              <Link href="/intents">Discover</Link>
              <Link href="/messages">Messages</Link>
              <NotificationBell />
            </nav>
          </div>
        </header>

        <main className="page-shell">
          <section className="section">
            <h1>Discover opportunities</h1>
            <p className="muted">
              Your community memberships could not be loaded. Please try again.
            </p>
          </section>
        </main>
      </>
    );
  }

  const communityIds = [
    ...new Set((memberships ?? []).map((item) => item.community_id)),
  ];

  let intents: Intent[] = [];
  let communities: Community[] = [];

  if (communityIds.length > 0) {
    const [intentResult, communityResult] = await Promise.all([
      supabase
        .from("intents")
        .select(
          "id, community_id, author_id, intent_type, title, description, category, location_label, status, created_at"
        )
        .in("community_id", communityIds)
        .in("status", ["open", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(100),

      supabase
        .from("communities")
        .select("id, name, slug")
        .in("id", communityIds),
    ]);

    if (intentResult.error || communityResult.error) {
      return (
        <>
          <header className="site-header">
            <div className="container site-header-inner">
              <Link href="/home" className="brand">
                <span className="brand-mark">RN</span>
                <span>RuffNeck Connect</span>
              </Link>
              <nav className="site-nav" aria-label="Main navigation">
                <Link href="/home">Home</Link>
                <Link href="/communities">Communities</Link>
                <Link href="/intents">Discover</Link>
                <Link href="/messages">Messages</Link>
                <NotificationBell />
              </nav>
            </div>
          </header>

          <main className="page-shell">
            <section className="section">
              <h1>Discover opportunities</h1>
              <p className="muted">
                Opportunities could not be loaded. Please try again.
              </p>
              <Link className="button button-primary" href="/home">
                Return home
              </Link>
            </section>
          </main>
        </>
      );
    }

    intents = (intentResult.data ?? []) as Intent[];
    communities = (communityResult.data ?? []) as Community[];
  }

  const communityMap = new Map(
    communities.map((community) => [community.id, community])
  );

  const formatDate = (value: string) =>
    new Intl.DateTimeFormat("en-NG", {
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(value));

  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <Link href="/home" className="brand">
            <span className="brand-mark">RN</span>
            <span>RuffNeck Connect</span>
          </Link>

          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/home">Home</Link>
            <Link href="/communities">Communities</Link>
            <Link href="/intents">Discover</Link>
            <Link href="/messages">Messages</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <main className="page-shell">
        <section className="hero">
          <div className="hero-content">
            <span className="eyebrow">RUFFNECK CONNECT</span>
            <h1>Turn intentions into action.</h1>
            <p>
              Discover what people need, what they can offer, and what you can
              build together.
            </p>

            <div className="hero-actions">
              <Link
                className="button button-primary"
                href="/intents/new?type=need"
              >
                Post a need
              </Link>
              <Link
                className="button button-secondary"
                href="/intents/new?type=offer"
              >
                Share an offer
              </Link>
              <Link
                className="button button-secondary"
                href="/intents/new?type=build"
              >
                Start building
              </Link>
            </div>
          </div>
        </section>

        <section className="section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">COMMUNITY DISCOVERY</span>
              <h2>Open intentions</h2>
              <p className="muted">
                Opportunities shared in your active communities.
              </p>
            </div>

            <Link className="button button-secondary" href="/communities">
              Explore communities
            </Link>
          </div>

          {intents.length === 0 ? (
            <div className="empty-state">
              <h3>Nothing to discover yet</h3>
              <p>
                Join a community or publish an intention to start creating
                opportunities.
              </p>
              <Link className="button button-primary" href="/communities">
                Find a community
              </Link>
            </div>
          ) : (
            <div className="grid-3">
              {intents.map((intent) => {
                const community = communityMap.get(intent.community_id);

                return (
                  <article className="feature-card" key={intent.id}>
                    <div className="card-topline">
                      <span
                        className={`intent-badge intent-${intent.intent_type}`}
                      >
                        {intentLabels[intent.intent_type]}
                      </span>

                      <span className="muted">
                        {formatDate(intent.created_at)}
                      </span>
                    </div>

                    <h3>{intent.title}</h3>

                    <p className="intent-description">
                      {intent.description.length > 220
                        ? `${intent.description.slice(0, 220).trim()}…`
                        : intent.description}
                    </p>

                    <div className="intent-meta">
                      {intent.category && <span>{intent.category}</span>}
                      {intent.location_label && (
                        <span>{intent.location_label}</span>
                      )}
                    </div>

                    {community && (
                      <p className="muted">
                        Community:{" "}
                        <Link href={`/communities/${community.slug}`}>
                          {community.name}
                        </Link>
                      </p>
                    )}

                    <Link
                      className="button button-secondary intent-card-action"
                      href={`/intents/${intent.id}`}
                    >
                      View intention
                    </Link>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}