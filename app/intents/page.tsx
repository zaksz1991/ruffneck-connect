import "./intents-page.css";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

const intentDescriptions: Record<IntentType, string> = {
  need: "Find people, resources, or support to move forward.",
  offer: "Share your skills, resources, and opportunities with others.",
  build: "Find collaborators and turn an idea into something real.",
};

const intentSymbols: Record<IntentType, string> = {
  need: "↓",
  offer: "↑",
  build: "↗",
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

function ErrorState({
  title,
  message,
}: {
  title: string;
  message: string;
}) {
  return (
    <main className="page-shell rn-intents-page">
      <section className="rn-intents-error">
        <span className="rn-intents-eyebrow">RUFFNECK CONNECT</span>
        <h1>{title}</h1>
        <p>{message}</p>
        <Link className="rn-intents-button rn-intents-button-primary" href="/home">
          Return home
        </Link>
      </section>

      <style>{`
        .rn-intents-page {
          --rn-navy: #0b1e3a;
          --rn-cyan: #00b4d8;
          --rn-gold: #fbbf24;
          color: #172b45;
        }

        .rn-intents-error {
          max-width: 720px;
          margin: 64px auto;
          padding: 36px;
          border: 1px solid #e0e8f0;
          border-radius: 22px;
          background: #fff;
          box-shadow: 0 14px 40px rgba(11, 30, 58, 0.06);
        }

        .rn-intents-eyebrow {
          color: #008eaa;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .rn-intents-error h1 {
          margin: 14px 0 10px;
          color: var(--rn-navy);
          font-size: clamp(26px, 4vw, 38px);
          letter-spacing: -1.2px;
        }

        .rn-intents-error p {
          margin: 0 0 24px;
          color: #617187;
          line-height: 1.7;
        }

        .rn-intents-button {
          display: inline-flex;
          min-height: 43px;
          align-items: center;
          justify-content: center;
          padding: 0 18px;
          border-radius: 10px;
          font-size: 13px;
          font-weight: 750;
          text-decoration: none;
          transition: transform 160ms ease, background 160ms ease;
        }

        .rn-intents-button:hover {
          transform: translateY(-1px);
        }

        .rn-intents-button-primary {
          background: var(--rn-navy);
          color: #fff;
        }
      `}</style>
    </main>
  );
}

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
    console.error(
      "Failed to load community memberships:",
      membershipError.message
    );

    return (
      <ErrorState
        title="Your communities could not be loaded"
        message="We couldn't retrieve your active community memberships. Please try again later."
      />
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
      console.error(
        "Failed to load opportunities:",
        intentResult.error?.message,
        communityResult.error?.message
      );

      return (
        <ErrorState
          title="Opportunities could not be loaded"
          message="There was a problem retrieving intentions from your communities. Please try again later."
        />
      );
    }

    intents = (intentResult.data ?? []) as Intent[];
    communities = (communityResult.data ?? []) as Community[];
  }

  const communityMap = new Map(
    communities.map((community) => [community.id, community])
  );

  const needsCount = intents.filter(
    (intent) => intent.intent_type === "need"
  ).length;

  const offersCount = intents.filter(
    (intent) => intent.intent_type === "offer"
  ).length;

  const buildsCount = intents.filter(
    (intent) => intent.intent_type === "build"
  ).length;

  const communityCount = communityIds.length;

  return (
    <main className="page-shell rn-intents-page">
      <section className="rn-intents-hero">
        <div className="rn-intents-hero-content">
          <div className="rn-intents-eyebrow">
            <span className="rn-intents-eyebrow-dot" />
            RUFFNECK CONNECT / OPPORTUNITIES
          </div>

          <h1>
            Turn intentions
            <br />
            into <span>action.</span>
          </h1>

          <p className="rn-intents-hero-description">
            Good connections begin with a clear intention. Discover what
            people need, what they can offer, and what you can build together.
          </p>

          <div className="rn-intents-hero-actions">
            <Link
              className="rn-intents-button rn-intents-button-gold"
              href="/intents/new?type=need"
            >
              <span aria-hidden="true">＋</span>
              Post a need
            </Link>

            <Link
              className="rn-intents-button rn-intents-button-outline"
              href="/intents/new?type=offer"
            >
              Share an offer
              <span aria-hidden="true">↗</span>
            </Link>

            <Link
              className="rn-intents-button rn-intents-button-outline"
              href="/intents/new?type=build"
            >
              Start building
              <span aria-hidden="true">↗</span>
            </Link>
          </div>

          <div className="rn-intents-hero-note">
            <span className="rn-intents-note-line" />
            From shared needs to meaningful outcomes.
          </div>
        </div>

        <div className="rn-intents-hero-visual" aria-hidden="true">
          <div className="rn-intents-orbit rn-intents-orbit-one" />
          <div className="rn-intents-orbit rn-intents-orbit-two" />

          <div className="rn-intents-visual-core">
            <span className="rn-intents-core-symbol">RN</span>
            <span className="rn-intents-core-caption">CONNECT</span>
          </div>

          <div className="rn-intents-visual-node rn-intents-node-need">
            <span className="rn-intents-node-symbol">↓</span>
            <span>NEED</span>
          </div>

          <div className="rn-intents-visual-node rn-intents-node-offer">
            <span className="rn-intents-node-symbol">↑</span>
            <span>OFFER</span>
          </div>

          <div className="rn-intents-visual-node rn-intents-node-build">
            <span className="rn-intents-node-symbol">↗</span>
            <span>BUILD</span>
          </div>

          <span className="rn-intents-visual-dot rn-intents-dot-one" />
          <span className="rn-intents-visual-dot rn-intents-dot-two" />
          <span className="rn-intents-visual-dot rn-intents-dot-three" />
        </div>

        <div className="rn-intents-hero-index">
          <span>01</span>
          <span className="rn-intents-index-divider" />
          <span>DISCOVER · CONNECT · CREATE</span>
        </div>
      </section>

      <section className="rn-intents-stats" aria-label="Opportunity summary">
        <article className="rn-intents-stat">
          <span className="rn-intents-stat-icon rn-stat-icon-cyan">↓</span>
          <div>
            <span className="rn-intents-stat-label">OPEN NEEDS</span>
            <strong>{needsCount}</strong>
            <span className="rn-intents-stat-description">
              People looking for support
            </span>
          </div>
        </article>

        <article className="rn-intents-stat">
          <span className="rn-intents-stat-icon rn-stat-icon-gold">↑</span>
          <div>
            <span className="rn-intents-stat-label">OFFERS</span>
            <strong>{offersCount}</strong>
            <span className="rn-intents-stat-description">
              Skills and resources shared
            </span>
          </div>
        </article>

        <article className="rn-intents-stat">
          <span className="rn-intents-stat-icon rn-stat-icon-purple">↗</span>
          <div>
            <span className="rn-intents-stat-label">BUILD PROJECTS</span>
            <strong>{buildsCount}</strong>
            <span className="rn-intents-stat-description">
              Ideas seeking collaborators
            </span>
          </div>
        </article>

        <article className="rn-intents-stat">
          <span className="rn-intents-stat-icon rn-stat-icon-navy">◎</span>
          <div>
            <span className="rn-intents-stat-label">YOUR COMMUNITIES</span>
            <strong>{communityCount}</strong>
            <span className="rn-intents-stat-description">
              Communities you belong to
            </span>
          </div>
        </article>
      </section>

      <section className="rn-intents-create-section">
        <div className="rn-intents-section-heading">
          <div>
            <span className="rn-intents-section-kicker">MAKE THE FIRST MOVE</span>
            <h2>What brings you here?</h2>
            <p>
              Choose an intention and give the right people a reason to
              connect with you.
            </p>
          </div>
        </div>

        <div className="rn-intents-type-grid">
          {(
            [
              {
                type: "need",
                number: "01",
                title: "I need something",
                description:
                  "Find expertise, resources, introductions, or support for a challenge.",
                action: "Post a need",
              },
              {
                type: "offer",
                number: "02",
                title: "I have something to offer",
                description:
                  "Make your skills, experience, resources, or opportunities available.",
                action: "Share an offer",
              },
              {
                type: "build",
                number: "03",
                title: "I want to build",
                description:
                  "Bring an idea to life by finding collaborators and shared interests.",
                action: "Find collaborators",
              },
            ] as const
          ).map((item) => (
            <Link
              className={`rn-intents-type-card rn-type-card-${item.type}`}
              href={`/intents/new?type=${item.type}`}
              key={item.type}
            >
              <div className="rn-intents-type-top">
                <span className="rn-intents-type-number">{item.number}</span>
                <span className="rn-intents-type-symbol" aria-hidden="true">
                  {intentSymbols[item.type]}
                </span>
              </div>

              <h3>{item.title}</h3>
              <p>{intentDescriptions[item.type]}</p>

              <span className="rn-intents-type-action">
                {item.action}
                <span aria-hidden="true">→</span>
              </span>
            </Link>
          ))}
        </div>
      </section>

      <section className="rn-intents-discovery-section">
        <div className="rn-intents-discovery-heading">
          <div>
            <span className="rn-intents-section-kicker">
              COMMUNITY DISCOVERY
            </span>
            <h2>Open intentions</h2>
            <p>
              See what is happening across your active communities and find
              where you can make a difference.
            </p>
          </div>

          <Link
            className="rn-intents-button rn-intents-button-light"
            href="/communities"
          >
            Explore communities
            <span aria-hidden="true">↗</span>
          </Link>
        </div>

        {intents.length === 0 ? (
          <div className="rn-intents-empty-state">
            <div className="rn-intents-empty-icon" aria-hidden="true">
              ◎
            </div>

            <span className="rn-intents-section-kicker">
              YOUR NEXT CONNECTION STARTS HERE
            </span>

            <h3>Nothing to discover yet</h3>

            <p>
              There are no open intentions in your active communities right
              now. Explore communities to meet people, or publish an intention
              to create a new opportunity.
            </p>

            <div className="rn-intents-empty-actions">
              <Link
                className="rn-intents-button rn-intents-button-primary"
                href="/communities"
              >
                Find a community
              </Link>

              <Link
                className="rn-intents-text-link"
                href="/intents/new?type=need"
              >
                Publish an intention <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        ) : (
          <>
            <div className="rn-intents-results-bar">
              <div>
                <span className="rn-intents-results-count">
                  {intents.length}
                </span>
                <span>
                  {intents.length === 1
                    ? " open intention"
                    : " open intentions"}
                </span>
              </div>

              <span className="rn-intents-results-note">
                Newest first · Active communities
              </span>
            </div>

            <div className="rn-intents-results-grid">
              {intents.map((intent) => {
                const community = communityMap.get(intent.community_id);
                const intentType: IntentType =
                  intent.intent_type in intentLabels
                    ? intent.intent_type
                    : "need";

                return (
                  <article
                    className="rn-intents-opportunity-card"
                    key={intent.id}
                  >
                    <div className="rn-intents-card-top">
                      <span
                        className={`rn-intents-badge rn-badge-${intentType}`}
                      >
                        <span aria-hidden="true">
                          {intentSymbols[intentType]}
                        </span>
                        {intentLabels[intentType]}
                      </span>

                      <time
                        className="rn-intents-date"
                        dateTime={intent.created_at}
                      >
                        {formatDate(intent.created_at)}
                      </time>
                    </div>

                    <h3>
                      <Link href={`/intents/${intent.id}`}>
                        {intent.title}
                      </Link>
                    </h3>

                    <p className="rn-intents-card-description">
                      {intent.description.length > 220
                        ? `${intent.description.slice(0, 220).trim()}…`
                        : intent.description}
                    </p>

                    <div className="rn-intents-card-meta">
                      {intent.category && (
                        <span className="rn-intents-meta-chip">
                          <span aria-hidden="true">◇</span>
                          {intent.category}
                        </span>
                      )}

                      {intent.location_label && (
                        <span className="rn-intents-meta-chip">
                          <span aria-hidden="true">⌖</span>
                          {intent.location_label}
                        </span>
                      )}
                    </div>

                    <div className="rn-intents-card-community">
                      {community ? (
                        <>
                          <span className="rn-intents-community-avatar">
                            {community.name.charAt(0).toUpperCase()}
                          </span>

                          <div>
                            <span className="rn-intents-community-caption">
                              SHARED IN
                            </span>
                            <Link href={`/communities/${community.slug}`}>
                              {community.name}
                            </Link>
                          </div>
                        </>
                      ) : (
                        <span className="rn-intents-community-caption">
                          COMMUNITY OPPORTUNITY
                        </span>
                      )}
                    </div>

                    <Link
                      className="rn-intents-view-link"
                      href={`/intents/${intent.id}`}
                    >
                      View intention
                      <span aria-hidden="true">→</span>
                    </Link>
                  </article>
                );
              })}
            </div>

            {intents.length === 100 && (
              <p className="rn-intents-limit-note">
                Showing the latest 100 intentions from your active communities.
              </p>
            )}
          </>
        )}
      </section>

      <section className="rn-intents-bottom-cta">
        <div className="rn-intents-bottom-cta-mark" aria-hidden="true">
          RN<span>.</span>
        </div>

        <div className="rn-intents-bottom-cta-copy">
          <span className="rn-intents-section-kicker">
            CONNECTION CREATES POSSIBILITY
          </span>
          <h2>Your next opportunity could start with you.</h2>
          <p>
            Share what you need, contribute what you know, or invite others to
            build something meaningful.
          </p>
        </div>

        <Link
          className="rn-intents-button rn-intents-button-gold"
          href="/intents/new?type=build"
        >
          Create an intention
          <span aria-hidden="true">↗</span>
        </Link>
      </section>

      <nav className="rn-intents-shortcuts" aria-label="Connect navigation">
        <Link href="/members">
          <span className="rn-intents-shortcut-icon">◎</span>
          <span>
            <strong>Members</strong>
            <small>Meet people</small>
          </span>
          <span className="rn-intents-shortcut-arrow">→</span>
        </Link>

        <Link href="/communities">
          <span className="rn-intents-shortcut-icon">⌘</span>
          <span>
            <strong>Communities</strong>
            <small>Find your people</small>
          </span>
          <span className="rn-intents-shortcut-arrow">→</span>
        </Link>

        <Link href="/messages">
          <span className="rn-intents-shortcut-icon">↗</span>
          <span>
            <strong>Messages</strong>
            <small>Start a conversation</small>
          </span>
          <span className="rn-intents-shortcut-arrow">→</span>
        </Link>
      </nav>

      <style>{`
        .rn-intents-page {
          --rn-navy: #0b1e3a;
          --rn-cyan: #00b4d8;
          --rn-gold: #fbbf24;
          --rn-text: #172b45;
          --rn-muted: #68788d;
          --rn-border: #e3eaf1;
          --rn-surface: #ffffff;
          width: 100%;
          max-width: 1320px;
          margin-inline: auto;
          padding: 26px 24px 54px;
          color: var(--rn-text);
        }

        .rn-intents-page * {
          box-sizing: border-box;
        }

        .rn-intents-page a {
          -webkit-tap-highlight-color: transparent;
        }

        .rn-intents-hero {
          position: relative;
          display: grid;
          grid-template-columns: minmax(0, 1.1fr) minmax(300px, 0.9fr);
          min-height: 400px;
          overflow: hidden;
          border-radius: 26px;
          background:
            radial-gradient(ellipse at 85% 15%, rgba(0, 180, 216, 0.16), transparent 37%),
            linear-gradient(125deg, #0b1e3a 0%, #102b4d 58%, #123b57 100%);
          color: #fff;
          isolation: isolate;
        }

        .rn-intents-hero-content {
          position: relative;
          z-index: 2;
          align-self: center;
          padding: 54px 0 64px 54px;
        }

        .rn-intents-eyebrow {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #9ae9f7;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 2px;
        }

        .rn-intents-eyebrow-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--rn-gold);
          box-shadow: 0 0 0 5px rgba(251, 191, 36, 0.12);
        }

        .rn-intents-hero h1 {
          margin: 22px 0 16px;
          color: #fff;
          font-size: clamp(42px, 5.1vw, 68px);
          font-weight: 850;
          letter-spacing: -3.4px;
          line-height: 1.04;
        }

        .rn-intents-hero h1 span {
          color: var(--rn-gold);
        }

        .rn-intents-hero-description {
          max-width: 520px;
          margin: 0;
          color: #d1dfed;
          font-size: 15px;
          line-height: 1.85;
        }

        .rn-intents-hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 27px;
        }

        .rn-intents-button {
          display: inline-flex;
          min-height: 44px;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 0 17px;
          border: 1px solid transparent;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.4;
          text-align: center;
          text-decoration: none;
          transition:
            transform 160ms ease,
            background 160ms ease,
            border-color 160ms ease,
            box-shadow 160ms ease;
        }

        .rn-intents-button:hover {
          transform: translateY(-2px);
        }

        .rn-intents-button-gold {
          background: var(--rn-gold);
          color: #172b45;
          box-shadow: 0 6px 18px rgba(251, 191, 36, 0.12);
        }

        .rn-intents-button-gold:hover {
          background: #ffd45d;
          box-shadow: 0 8px 22px rgba(251, 191, 36, 0.2);
        }

        .rn-intents-button-outline {
          border-color: rgba(255, 255, 255, 0.23);
          background: rgba(255, 255, 255, 0.045);
          color: #fff;
        }

        .rn-intents-button-outline:hover {
          border-color: rgba(0, 180, 216, 0.75);
          background: rgba(0, 180, 216, 0.1);
        }

        .rn-intents-hero-note {
          display: flex;
          align-items: center;
          gap: 11px;
          margin-top: 30px;
          color: #9aacc1;
          font-size: 11px;
          letter-spacing: 0.25px;
        }

        .rn-intents-note-line {
          width: 27px;
          height: 2px;
          background: var(--rn-cyan);
        }

        .rn-intents-hero-visual {
          position: relative;
          display: grid;
          min-height: 380px;
          place-items: center;
          overflow: hidden;
        }

        .rn-intents-orbit {
          position: absolute;
          top: 50%;
          left: 50%;
          border: 1px solid rgba(140, 212, 234, 0.2);
          border-radius: 50%;
          transform: translate(-50%, -50%);
        }

        .rn-intents-orbit-one {
          width: 310px;
          height: 310px;
        }

        .rn-intents-orbit-two {
          width: 220px;
          height: 220px;
          border-style: dashed;
          border-color: rgba(140, 212, 234, 0.24);
        }

        .rn-intents-visual-core {
          position: relative;
          z-index: 2;
          display: flex;
          width: 116px;
          height: 116px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(0, 180, 216, 0.45);
          border-radius: 32px;
          background: linear-gradient(145deg, #163d60, #0b1e3a);
          box-shadow:
            0 0 0 12px rgba(0, 180, 216, 0.045),
            0 20px 55px rgba(0, 0, 0, 0.2);
          transform: rotate(-5deg);
        }

        .rn-intents-core-symbol {
          color: #fff;
          font-size: 35px;
          font-weight: 900;
          letter-spacing: -3px;
        }

        .rn-intents-core-caption {
          margin-top: 3px;
          color: #85dff0;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 3px;
        }

        .rn-intents-visual-node {
          position: absolute;
          z-index: 3;
          display: flex;
          min-width: 105px;
          align-items: center;
          gap: 8px;
          padding: 11px 13px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 12px;
          background: rgba(20, 48, 75, 0.94);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.14);
          color: #e7f1f8;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1.1px;
        }

        .rn-intents-node-symbol {
          display: grid;
          width: 28px;
          height: 28px;
          place-items: center;
          border-radius: 8px;
          background: rgba(0, 180, 216, 0.14);
          color: #79e5f6;
          font-size: 19px;
        }

        .rn-intents-node-need {
          top: 18%;
          left: 12%;
        }

        .rn-intents-node-offer {
          top: 32%;
          right: 5%;
        }

        .rn-intents-node-build {
          right: 16%;
          bottom: 15%;
        }

        .rn-intents-node-offer .rn-intents-node-symbol {
          background: rgba(251, 191, 36, 0.13);
          color: var(--rn-gold);
        }

        .rn-intents-node-build .rn-intents-node-symbol {
          background: rgba(172, 145, 255, 0.14);
          color: #c4b2ff;
        }

        .rn-intents-visual-dot {
          position: absolute;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: var(--rn-cyan);
          box-shadow: 0 0 15px rgba(0, 180, 216, 0.8);
        }

        .rn-intents-dot-one {
          top: 21%;
          right: 23%;
        }

        .rn-intents-dot-two {
          bottom: 24%;
          left: 16%;
          background: var(--rn-gold);
        }

        .rn-intents-dot-three {
          top: 54%;
          left: 13%;
        }

        .rn-intents-hero-index {
          position: absolute;
          right: 30px;
          bottom: 22px;
          display: flex;
          align-items: center;
          gap: 10px;
          color: #8fa5bc;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 1.5px;
        }

        .rn-intents-hero-index > span:first-child {
          color: var(--rn-gold);
        }

        .rn-intents-index-divider {
          width: 24px;
          height: 1px;
          background: #456079;
        }

        .rn-intents-stats {
          display: grid;
          grid-template-columns: repeat(4, minmax(0, 1fr));
          gap: 14px;
          margin: 22px 0 64px;
        }

        .rn-intents-stat {
          display: flex;
          min-width: 0;
          align-items: flex-start;
          gap: 13px;
          padding: 20px 16px;
          border: 1px solid var(--rn-border);
          border-radius: 15px;
          background: #fff;
          box-shadow: 0 4px 16px rgba(11, 30, 58, 0.025);
        }

        .rn-intents-stat-icon {
          display: grid;
          width: 43px;
          height: 43px;
          flex: 0 0 43px;
          place-items: center;
          border-radius: 12px;
          font-size: 22px;
          font-weight: 800;
        }

        .rn-stat-icon-cyan {
          background: #e6f9fc;
          color: #008aa7;
        }

        .rn-stat-icon-gold {
          background: #fff7df;
          color: #996b00;
        }

        .rn-stat-icon-purple {
          background: #f0ecff;
          color: #7653ca;
        }

        .rn-stat-icon-navy {
          background: #eaf0f7;
          color: var(--rn-navy);
        }

        .rn-intents-stat > div {
          display: flex;
          min-width: 0;
          flex-direction: column;
          align-items: flex-start;
        }

        .rn-intents-stat-label {
          color: #718096;
          font-size: 8px;
          font-weight: 850;
          letter-spacing: 1.15px;
        }

        .rn-intents-stat strong {
          margin-top: 5px;
          color: var(--rn-navy);
          font-size: 28px;
          font-weight: 850;
          letter-spacing: -1px;
          line-height: 1.1;
        }

        .rn-intents-stat-description {
          margin-top: 5px;
          color: #7a889a;
          font-size: 10px;
          line-height: 1.5;
        }

        .rn-intents-create-section,
        .rn-intents-discovery-section {
          margin-top: 0;
        }

        .rn-intents-section-heading,
        .rn-intents-discovery-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
        }

        .rn-intents-section-kicker {
          display: inline-block;
          color: #008da9;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1.8px;
        }

        .rn-intents-section-heading h2,
        .rn-intents-discovery-heading h2 {
          margin: 9px 0 8px;
          color: var(--rn-navy);
          font-size: clamp(27px, 3vw, 36px);
          font-weight: 850;
          letter-spacing: -1.35px;
          line-height: 1.18;
        }

        .rn-intents-section-heading p,
        .rn-intents-discovery-heading p {
          max-width: 590px;
          margin: 0;
          color: var(--rn-muted);
          font-size: 13px;
          line-height: 1.75;
        }

        .rn-intents-type-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
          margin-top: 23px;
        }

        .rn-intents-type-card {
          position: relative;
          display: flex;
          min-height: 225px;
          flex-direction: column;
          align-items: flex-start;
          padding: 24px;
          overflow: hidden;
          border: 1px solid var(--rn-border);
          border-radius: 17px;
          background: #fff;
          color: var(--rn-text);
          text-decoration: none;
          transition:
            transform 180ms ease,
            box-shadow 180ms ease,
            border-color 180ms ease;
        }

        .rn-intents-type-card:hover {
          transform: translateY(-4px);
          border-color: #b9dfe8;
          box-shadow: 0 16px 32px rgba(11, 30, 58, 0.07);
        }

        .rn-intents-type-top {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: space-between;
        }

        .rn-intents-type-number {
          color: #91a0b2;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.5px;
        }

        .rn-intents-type-symbol {
          display: grid;
          width: 42px;
          height: 42px;
          place-items: center;
          border-radius: 12px;
          background: #e6f9fc;
          color: #008da9;
          font-size: 25px;
          font-weight: 800;
        }

        .rn-type-card-offer .rn-intents-type-symbol {
          background: #fff5d8;
          color: #946600;
        }

        .rn-type-card-build .rn-intents-type-symbol {
          background: #f0ecff;
          color: #7653ca;
        }

        .rn-intents-type-card h3 {
          margin: 21px 0 8px;
          color: var(--rn-navy);
          font-size: 18px;
          font-weight: 850;
          letter-spacing: -0.45px;
        }

        .rn-intents-type-card > p {
          margin: 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-intents-type-action {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: auto;
          padding-top: 20px;
          color: #007f99;
          font-size: 11px;
          font-weight: 850;
        }

        .rn-intents-type-action > span {
          font-size: 17px;
          transition: transform 160ms ease;
        }

        .rn-intents-type-card:hover .rn-intents-type-action > span {
          transform: translateX(4px);
        }

        .rn-intents-discovery-section {
          margin-top: 76px;
          padding-top: 37px;
          border-top: 1px solid var(--rn-border);
        }

        .rn-intents-discovery-heading {
          align-items: flex-end;
        }

        .rn-intents-button-light {
          flex-shrink: 0;
          border-color: var(--rn-border);
          background: #fff;
          color: var(--rn-navy);
        }

        .rn-intents-button-light:hover {
          border-color: var(--rn-cyan);
          background: #f0fbfd;
        }

        .rn-intents-empty-state {
          display: flex;
          min-height: 320px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          margin-top: 26px;
          padding: 35px 22px;
          border: 1px dashed #cbd8e5;
          border-radius: 19px;
          background:
            radial-gradient(ellipse at top, rgba(0, 180, 216, 0.05), transparent 60%),
            #fbfdff;
          text-align: center;
        }

        .rn-intents-empty-icon {
          display: grid;
          width: 61px;
          height: 61px;
          margin-bottom: 19px;
          place-items: center;
          border: 1px solid #d8edf2;
          border-radius: 19px;
          background: #eafafd;
          color: #008da9;
          font-size: 30px;
        }

        .rn-intents-empty-state h3 {
          margin: 12px 0 8px;
          color: var(--rn-navy);
          font-size: 24px;
          font-weight: 850;
          letter-spacing: -0.7px;
        }

        .rn-intents-empty-state > p {
          max-width: 520px;
          margin: 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.85;
        }

        .rn-intents-empty-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: center;
          gap: 19px;
          margin-top: 23px;
        }

        .rn-intents-button-primary {
          background: var(--rn-navy);
          color: #fff;
        }

        .rn-intents-button-primary:hover {
          background: #16365e;
        }

        .rn-intents-text-link {
          color: #007f99;
          font-size: 12px;
          font-weight: 800;
          text-decoration: none;
        }

        .rn-intents-text-link:hover {
          text-decoration: underline;
        }

        .rn-intents-results-bar {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 16px;
          margin: 28px 0 15px;
          padding-bottom: 14px;
          border-bottom: 1px solid var(--rn-border);
          color: var(--rn-muted);
          font-size: 11px;
        }

        .rn-intents-results-count {
          margin-right: 5px;
          color: var(--rn-navy);
          font-size: 15px;
          font-weight: 900;
        }

        .rn-intents-results-note {
          color: #8390a0;
          font-size: 10px;
        }

        .rn-intents-results-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
        }

        .rn-intents-opportunity-card {
          display: flex;
          min-width: 0;
          min-height: 320px;
          flex-direction: column;
          padding: 22px;
          border: 1px solid var(--rn-border);
          border-radius: 16px;
          background: #fff;
          box-shadow: 0 4px 16px rgba(11, 30, 58, 0.025);
          transition:
            transform 180ms ease,
            border-color 180ms ease,
            box-shadow 180ms ease;
        }

        .rn-intents-opportunity-card:hover {
          transform: translateY(-3px);
          border-color: #c7dce8;
          box-shadow: 0 14px 32px rgba(11, 30, 58, 0.065);
        }

        .rn-intents-card-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .rn-intents-badge {
          display: inline-flex;
          min-height: 27px;
          align-items: center;
          gap: 5px;
          padding: 0 9px;
          border-radius: 7px;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 0.3px;
        }

        .rn-badge-need {
          background: #e6f9fc;
          color: #007c96;
        }

        .rn-badge-offer {
          background: #fff5d9;
          color: #8a6200;
        }

        .rn-badge-build {
          background: #f0ecff;
          color: #6c4eb5;
        }

        .rn-intents-date {
          color: #8995a5;
          font-size: 9px;
          white-space: nowrap;
        }

        .rn-intents-opportunity-card h3 {
          margin: 21px 0 10px;
          color: var(--rn-navy);
          font-size: 18px;
          font-weight: 850;
          letter-spacing: -0.45px;
          line-height: 1.4;
          overflow-wrap: anywhere;
        }

        .rn-intents-opportunity-card h3 a {
          color: inherit;
          text-decoration: none;
        }

        .rn-intents-opportunity-card h3 a:hover {
          color: #008aa7;
        }

        .rn-intents-card-description {
          display: -webkit-box;
          overflow: hidden;
          margin: 0;
          color: #68788d;
          font-size: 12px;
          line-height: 1.85;
          overflow-wrap: anywhere;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 5;
        }

        .rn-intents-card-meta {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin-top: 16px;
        }

        .rn-intents-meta-chip {
          display: inline-flex;
          max-width: 100%;
          align-items: center;
          gap: 5px;
          padding: 6px 8px;
          border: 1px solid #e7edf3;
          border-radius: 7px;
          background: #f8fafc;
          color: #617187;
          font-size: 9px;
          overflow-wrap: anywhere;
        }

        .rn-intents-meta-chip > span {
          color: #008da9;
          font-size: 12px;
        }

        .rn-intents-card-community {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 9px;
          margin-top: auto;
          padding-top: 20px;
        }

        .rn-intents-community-avatar {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          place-items: center;
          border: 1px solid #d7e9f1;
          border-radius: 10px;
          background: #eaf8fc;
          color: #007f99;
          font-size: 13px;
          font-weight: 900;
        }

        .rn-intents-card-community > div {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 4px;
        }

        .rn-intents-community-caption {
          color: #8492a3;
          font-size: 8px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .rn-intents-card-community a {
          overflow: hidden;
          color: var(--rn-navy);
          font-size: 11px;
          font-weight: 800;
          text-decoration: none;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .rn-intents-card-community a:hover {
          color: #008aa7;
        }

        .rn-intents-view-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 17px;
          padding-top: 13px;
          border-top: 1px solid #edf1f5;
          color: #007f99;
          font-size: 11px;
          font-weight: 850;
          text-decoration: none;
        }

        .rn-intents-view-link > span {
          font-size: 17px;
          transition: transform 160ms ease;
        }

        .rn-intents-view-link:hover > span {
          transform: translateX(4px);
        }

        .rn-intents-limit-note {
          margin: 20px 0 0;
          color: #78879a;
          font-size: 11px;
          text-align: center;
        }

        .rn-intents-bottom-cta {
          display: flex;
          align-items: center;
          gap: 23px;
          margin-top: 70px;
          padding: 32px;
          border: 1px solid #1a3a5b;
          border-radius: 19px;
          background:
            radial-gradient(ellipse at 90% 20%, rgba(0, 180, 216, 0.12), transparent 45%),
            var(--rn-navy);
          color: #fff;
        }

        .rn-intents-bottom-cta-mark {
          display: grid;
          width: 70px;
          height: 70px;
          flex: 0 0 70px;
          place-items: center;
          border: 1px solid rgba(0, 180, 216, 0.4);
          border-radius: 19px;
          background: rgba(0, 180, 216, 0.08);
          color: #fff;
          font-size: 24px;
          font-weight: 900;
          letter-spacing: -2px;
        }

        .rn-intents-bottom-cta-mark span {
          color: var(--rn-gold);
        }

        .rn-intents-bottom-cta-copy {
          flex: 1;
        }

        .rn-intents-bottom-cta-copy .rn-intents-section-kicker {
          color: #7ddfee;
        }

        .rn-intents-bottom-cta-copy h2 {
          margin: 8px 0;
          color: #fff;
          font-size: clamp(21px, 2.4vw, 29px);
          font-weight: 850;
          letter-spacing: -0.9px;
          line-height: 1.3;
        }

        .rn-intents-bottom-cta-copy p {
          max-width: 600px;
          margin: 0;
          color: #b7c9da;
          font-size: 11px;
          line-height: 1.8;
        }

        .rn-intents-bottom-cta > .rn-intents-button {
          flex-shrink: 0;
        }

        .rn-intents-shortcuts {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 14px;
          margin-top: 24px;
        }

        .rn-intents-shortcuts > a {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 12px;
          padding: 16px;
          border: 1px solid var(--rn-border);
          border-radius: 13px;
          background: #fff;
          color: var(--rn-text);
          text-decoration: none;
          transition:
            border-color 160ms ease,
            background 160ms ease;
        }

        .rn-intents-shortcuts > a:hover {
          border-color: #b5dce7;
          background: #f8fdff;
        }

        .rn-intents-shortcut-icon {
          display: grid;
          width: 39px;
          height: 39px;
          flex: 0 0 39px;
          place-items: center;
          border-radius: 11px;
          background: #eaf8fc;
          color: #008aa7;
          font-size: 20px;
        }

        .rn-intents-shortcuts > a > span:nth-child(2) {
          display: flex;
          min-width: 0;
          flex: 1;
          flex-direction: column;
          gap: 4px;
        }

        .rn-intents-shortcuts strong {
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 850;
        }

        .rn-intents-shortcuts small {
          color: #78879a;
          font-size: 10px;
        }

        .rn-intents-shortcut-arrow {
          color: #7e8fa2;
          font-size: 17px;
        }

        .rn-intents-shortcuts > a:hover .rn-intents-shortcut-arrow {
          color: #008aa7;
        }

        @media (min-width: 1500px) {
          .rn-intents-page {
            max-width: 1400px;
          }

          .rn-intents-hero {
            min-height: 430px;
          }
        }

        @media (max-width: 1050px) {
          .rn-intents-hero-content {
            padding-left: 35px;
          }

          .rn-intents-hero-visual {
            transform: scale(0.9);
          }

          .rn-intents-stats {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            margin-bottom: 54px;
          }

          .rn-intents-results-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .rn-intents-bottom-cta {
            flex-wrap: wrap;
          }

          .rn-intents-bottom-cta-copy {
            min-width: 55%;
          }

          .rn-intents-bottom-cta > .rn-intents-button {
            margin-left: 92px;
          }
        }

        @media (max-width: 700px) {
          .rn-intents-page {
            padding: 16px 14px 35px;
          }

          .rn-intents-hero {
            grid-template-columns: minmax(0, 1fr);
            min-height: auto;
            border-radius: 20px;
          }

          .rn-intents-hero-content {
            padding: 32px 23px 8px;
          }

          .rn-intents-eyebrow {
            font-size: 9px;
            letter-spacing: 1.5px;
          }

          .rn-intents-hero h1 {
            margin-top: 19px;
            font-size: clamp(39px, 10vw, 55px);
            letter-spacing: -2.5px;
          }

          .rn-intents-hero-description {
            font-size: 13px;
          }

          .rn-intents-hero-actions {
            gap: 9px;
            margin-top: 23px;
          }

          .rn-intents-hero-actions .rn-intents-button {
            min-height: 42px;
            padding-inline: 12px;
            font-size: 10px;
          }

          .rn-intents-hero-visual {
            min-height: 245px;
            margin-top: -2px;
            transform: scale(0.82);
          }

          .rn-intents-orbit-one {
            width: 260px;
            height: 260px;
          }

          .rn-intents-orbit-two {
            width: 185px;
            height: 185px;
          }

          .rn-intents-node-need {
            top: 9%;
            left: 10%;
          }

          .rn-intents-node-offer {
            top: 24%;
            right: 5%;
          }

          .rn-intents-node-build {
            right: 10%;
            bottom: 5%;
          }

          .rn-intents-hero-index {
            right: 15px;
            bottom: 13px;
            font-size: 7px;
          }

          .rn-intents-stats {
            gap: 10px;
            margin: 14px 0 47px;
          }

          .rn-intents-stat {
            gap: 10px;
            padding: 15px 12px;
            border-radius: 12px;
          }

          .rn-intents-stat-icon {
            width: 35px;
            height: 35px;
            flex-basis: 35px;
            border-radius: 10px;
            font-size: 19px;
          }

          .rn-intents-stat-label {
            font-size: 7px;
            letter-spacing: 0.8px;
          }

          .rn-intents-stat strong {
            font-size: 24px;
          }

          .rn-intents-stat-description {
            font-size: 9px;
          }

          .rn-intents-section-heading h2,
          .rn-intents-discovery-heading h2 {
            font-size: 29px;
          }

          .rn-intents-section-heading p,
          .rn-intents-discovery-heading p {
            font-size: 12px;
          }

          .rn-intents-type-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 12px;
            margin-top: 19px;
          }

          .rn-intents-type-card {
            min-height: 190px;
            padding: 20px;
          }

          .rn-intents-type-card h3 {
            margin-top: 15px;
          }

          .rn-intents-type-action {
            padding-top: 15px;
          }

          .rn-intents-discovery-section {
            margin-top: 53px;
            padding-top: 30px;
          }

          .rn-intents-discovery-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 17px;
          }

          .rn-intents-discovery-heading > .rn-intents-button {
            width: 100%;
          }

          .rn-intents-results-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 12px;
          }

          .rn-intents-opportunity-card {
            min-height: 280px;
            padding: 19px;
          }

          .rn-intents-opportunity-card h3 {
            font-size: 17px;
          }

          .rn-intents-results-bar {
            align-items: flex-start;
            flex-direction: column;
            gap: 7px;
          }

          .rn-intents-empty-state {
            min-height: 300px;
            padding: 28px 17px;
          }

          .rn-intents-empty-state h3 {
            font-size: 22px;
          }

          .rn-intents-bottom-cta {
            align-items: flex-start;
            flex-direction: column;
            gap: 18px;
            margin-top: 48px;
            padding: 23px;
          }

          .rn-intents-bottom-cta-mark {
            width: 53px;
            height: 53px;
            flex-basis: 53px;
            border-radius: 15px;
            font-size: 20px;
          }

          .rn-intents-bottom-cta-copy h2 {
            font-size: 24px;
          }

          .rn-intents-bottom-cta > .rn-intents-button {
            width: 100%;
            margin-left: 0;
          }

          .rn-intents-shortcuts {
            grid-template-columns: minmax(0, 1fr);
            gap: 10px;
            margin-top: 16px;
          }

          .rn-intents-shortcuts > a {
            padding: 13px;
          }
        }

        @media (max-width: 360px) {
          .rn-intents-page {
            padding-inline: 10px;
          }

          .rn-intents-hero-content {
            padding-inline: 17px;
          }

          .rn-intents-hero h1 {
            font-size: 36px;
          }

          .rn-intents-hero-actions .rn-intents-button {
            padding-inline: 9px;
            font-size: 9px;
          }

          .rn-intents-stat {
            gap: 7px;
            padding: 12px 8px;
          }

          .rn-intents-stat-icon {
            width: 29px;
            height: 29px;
            flex-basis: 29px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-intents-page *,
          .rn-intents-page *::before,
          .rn-intents-page *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}