import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationBell from "@/components/NotificationBell";

export const dynamic = "force-dynamic";

type Membership = {
  community_id: string;
  status: string;
  role: string;
};

type Intent = {
  id: string;
  title: string;
  description: string;
  intent_type: "need" | "offer" | "build";
  category: string | null;
  location_label: string | null;
  created_at: string;
};

type Community = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  location_label: string | null;
};

const intentLabels: Record<Intent["intent_type"], string> = {
  need: "Need",
  offer: "Offer",
  build: "Build",
};

export default async function HomePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/home");
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const { data: memberships } = await supabase
    .from("community_members")
    .select("community_id, status, role")
    .eq("user_id", user.id)
    .eq("status", "active");

  const activeMemberships = (memberships ?? []) as Membership[];

  const communityIds = activeMemberships.map(
    (membership) => membership.community_id
  );

  let myCommunities: Community[] = [];

  if (communityIds.length > 0) {
    const { data } = await supabase
      .from("communities")
      .select("id, name, slug, description, category, location_label")
      .in("id", communityIds)
      .eq("status", "active")
      .order("created_at", { ascending: false })
      .limit(4);

    myCommunities = (data ?? []) as Community[];
  }

  const { data: recentIntents } = await supabase
    .from("intents")
    .select(
      "id, title, description, intent_type, category, location_label, created_at"
    )
    .eq("status", "open")
    .order("created_at", { ascending: false })
    .limit(6);

  const intents = (recentIntents ?? []) as Intent[];

  const displayName =
    profile?.full_name?.trim() ||
    user.user_metadata?.full_name ||
    user.email?.split("@")[0] ||
    "there";

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

            <form action="/auth/signout" method="post">
              <button type="submit" className="button-secondary">
                Sign out
              </button>
            </form>
          </nav>
        </div>
      </header>

      <main className="container page-section">
        <section className="page-heading">
          <p className="eyebrow">YOUR CONNECT SPACE</p>
          <h1>Welcome, {displayName}.</h1>
          <p>
            Discover people, share what you need, contribute what you can, and
            turn useful connections into action.
          </p>
        </section>

        <section className="grid grid-3" style={{ marginBottom: 36 }}>
          <article className="stat-card">
            <strong>{activeMemberships.length}</strong>
            <span>Active communities</span>
          </article>

          <article className="stat-card">
            <strong>{intents.length}</strong>
            <span>Recent open opportunities</span>
          </article>

          <article className="stat-card">
            <strong>3</strong>
            <span>Ways to participate: Need, Offer, Build</span>
          </article>
        </section>

        <section style={{ marginBottom: 44 }}>
          <div className="page-heading">
            <p className="eyebrow">TAKE THE NEXT STEP</p>
            <h2>What brings you here today?</h2>
          </div>

          <div className="grid grid-3">
            <article className="feature-card">
              <div className="feature-icon">N</div>
              <h3>I need something</h3>
              <p>
                Explain a challenge, resource gap, or problem you want help
                solving.
              </p>
              <Link href="/intents/new?type=need" className="text-link">
                Post a need →
              </Link>
            </article>

            <article className="feature-card">
              <div className="feature-icon">O</div>
              <h3>I can offer something</h3>
              <p>
                Share your skills, experience, resources, or time with people
                who can use them.
              </p>
              <Link href="/intents/new?type=offer" className="text-link">
                Share an offer →
              </Link>
            </article>

            <article className="feature-card">
              <div className="feature-icon">B</div>
              <h3>I want to build something</h3>
              <p>
                Find collaborators around a project, idea, or shared
                opportunity.
              </p>
              <Link href="/intents/new?type=build" className="text-link">
                Start building →
              </Link>
            </article>
          </div>
        </section>

        <section style={{ marginBottom: 44 }}>
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 18 }}
          >
            <div>
              <p className="eyebrow">YOUR NETWORK</p>
              <h2 style={{ marginBottom: 0 }}>My communities</h2>
            </div>

            <Link href="/communities" className="text-link">
              Explore communities →
            </Link>
          </div>

          {myCommunities.length === 0 ? (
            <div className="empty-state">
              <h3>Your community journey starts here.</h3>
              <p>
                Join a community to connect with people who share your
                interests or goals.
              </p>
              <Link href="/communities" className="button">
                Discover communities
              </Link>
            </div>
          ) : (
            <div className="grid grid-2">
              {myCommunities.map((community) => (
                <article className="card" key={community.id}>
                  <p className="eyebrow">
                    {community.category || "Community"}
                  </p>

                  <h3>{community.name}</h3>

                  <p className="muted">
                    {community.description ||
                      "A place to connect and collaborate."}
                  </p>

                  {community.location_label && (
                    <p className="muted">{community.location_label}</p>
                  )}

                  <Link
                    href={`/communities/${community.slug}`}
                    className="text-link"
                  >
                    View community →
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>

        <section>
          <div
            className="row"
            style={{ justifyContent: "space-between", marginBottom: 18 }}
          >
            <div>
              <p className="eyebrow">DISCOVER WHAT IS HAPPENING</p>
              <h2 style={{ marginBottom: 0 }}>Recent open intentions</h2>
            </div>

            <Link href="/intents" className="text-link">
              Explore all →
            </Link>
          </div>

          {intents.length === 0 ? (
            <div className="empty-state">
              <h3>No open intentions to display yet.</h3>
              <p>
                Create the first useful opportunity in one of your communities.
              </p>
              <Link href="/intents/new" className="button">
                Create an intention
              </Link>
            </div>
          ) : (
            <div className="grid grid-2">
              {intents.map((intent) => (
                <article className="card" key={intent.id}>
                  <div
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      marginBottom: 14,
                    }}
                  >
                    <span
                      className={`badge ${
                        intent.intent_type === "offer"
                          ? "badge-success"
                          : intent.intent_type === "build"
                            ? "badge-gold"
                            : ""
                      }`}
                    >
                      {intentLabels[intent.intent_type]}
                    </span>

                    {intent.category && (
                      <span className="muted" style={{ fontSize: 12 }}>
                        {intent.category}
                      </span>
                    )}
                  </div>

                  <h3>{intent.title}</h3>

                  <p className="muted">
                    {intent.description.length > 180
                      ? `${intent.description.slice(0, 180)}…`
                      : intent.description}
                  </p>

                  {intent.location_label && (
                    <p className="muted" style={{ fontSize: 13 }}>
                      {intent.location_label}
                    </p>
                  )}

                  <Link href={`/intents/${intent.id}`} className="text-link">
                    View details →
                  </Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>

      <footer className="site-footer">
        <div
          className="container row"
          style={{ justifyContent: "space-between" }}
        >
          <span>© {new Date().getFullYear()} RuffNeck Connect</span>

          <Link href="/" className="text-link">
            About RuffNeck Connect
          </Link>
        </div>
      </footer>
    </>
  );
}