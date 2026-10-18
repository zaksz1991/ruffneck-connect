import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

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

const intentStyles: Record<Intent["intent_type"], string> = {
  need: "rn-intent-need",
  offer: "rn-intent-offer",
  build: "rn-intent-build",
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

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
      .select(
        "id, name, slug, description, category, location_label"
      )
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

  const firstName = String(displayName).trim().split(/\s+/)[0];

  return (
    <>
      <main className="rn-home">
        <div className="rn-home-inner">
          <section className="rn-welcome">
            <div className="rn-welcome-content">
              <div className="rn-kicker">
                <span className="rn-live-dot" />
                YOUR CONNECT SPACE
              </div>

              <h1>
                Welcome back,
                <br />
                <span>{firstName}.</span>
              </h1>

              <p className="rn-welcome-description">
                Good connections should lead to real outcomes.
                Discover people, exchange value, and turn useful
                relationships into practical action.
              </p>

              <div className="rn-welcome-actions">
                <Link
                  href="/intents/new?type=need"
                  className="rn-button rn-button-primary"
                >
                  Post an intention <span aria-hidden="true">↗</span>
                </Link>

                <Link
                  href="/members"
                  className="rn-button rn-button-light"
                >
                  Discover members
                </Link>
              </div>

              <div className="rn-principles">
                <span>Purpose-driven</span>
                <span>Community-powered</span>
                <span>Action-focused</span>
              </div>
            </div>

            <div className="rn-welcome-visual" aria-hidden="true">
              <div className="rn-orbit rn-orbit-one" />
              <div className="rn-orbit rn-orbit-two" />

              <div className="rn-visual-center">
                <span className="rn-visual-symbol">R</span>
                <strong>Connect</strong>
                <small>People · Ideas · Action</small>
              </div>

              <div className="rn-floating-card rn-floating-top">
                <span className="rn-floating-icon rn-icon-cyan">N</span>
                <span>
                  <strong>Share a need</strong>
                  <small>Find useful support</small>
                </span>
              </div>

              <div className="rn-floating-card rn-floating-bottom">
                <span className="rn-floating-icon rn-icon-gold">B</span>
                <span>
                  <strong>Build together</strong>
                  <small>Make ideas happen</small>
                </span>
              </div>
            </div>
          </section>

          <section className="rn-stats" aria-label="Your activity">
            <article className="rn-stat-card">
              <div className="rn-stat-top">
                <span className="rn-stat-icon rn-stat-cyan">C</span>
                <span className="rn-stat-label">YOUR NETWORK</span>
              </div>
              <strong className="rn-stat-number">
                {activeMemberships.length}
              </strong>
              <span className="rn-stat-description">
                Active communities
              </span>
              <Link href="/communities" className="rn-stat-link">
                Explore communities <span>→</span>
              </Link>
            </article>

            <article className="rn-stat-card">
              <div className="rn-stat-top">
                <span className="rn-stat-icon rn-stat-purple">O</span>
                <span className="rn-stat-label">OPPORTUNITIES</span>
              </div>
              <strong className="rn-stat-number">
                {intents.length}
              </strong>
              <span className="rn-stat-description">
                Recently posted open intentions
              </span>
              <Link href="/intents" className="rn-stat-link">
                Browse intentions <span>→</span>
              </Link>
            </article>

            <article className="rn-stat-card">
              <div className="rn-stat-top">
                <span className="rn-stat-icon rn-stat-gold">NOB</span>
                <span className="rn-stat-label">GET INVOLVED</span>
              </div>
              <strong className="rn-stat-number">3</strong>
              <span className="rn-stat-description">
                Ways to participate
              </span>
              <span className="rn-stat-detail">
                Need · Offer · Build
              </span>
            </article>
          </section>

          <section className="rn-section">
            <div className="rn-section-heading">
              <div>
                <p className="rn-section-kicker">START WITH AN INTENTION</p>
                <h2>What would you like to do?</h2>
                <p className="rn-section-description">
                  Choose your next step. Every useful connection
                  starts with a clear purpose.
                </p>
              </div>
            </div>

            <div className="rn-action-grid">
              <article className="rn-action-card rn-action-need">
                <div className="rn-action-top">
                  <span className="rn-action-letter">N</span>
                  <span className="rn-action-tag">01 / NEED</span>
                </div>
                <h3>Find the support you need.</h3>
                <p>
                  Describe a challenge, resource gap, or problem
                  you want help solving.
                </p>
                <Link
                  href="/intents/new?type=need"
                  className="rn-action-link"
                >
                  Post a need <span>↗</span>
                </Link>
              </article>

              <article className="rn-action-card rn-action-offer">
                <div className="rn-action-top">
                  <span className="rn-action-letter">O</span>
                  <span className="rn-action-tag">02 / OFFER</span>
                </div>
                <h3>Put your strengths to work.</h3>
                <p>
                  Share your skills, experience, resources, or
                  time with people who can benefit.
                </p>
                <Link
                  href="/intents/new?type=offer"
                  className="rn-action-link"
                >
                  Share an offer <span>↗</span>
                </Link>
              </article>

              <article className="rn-action-card rn-action-build">
                <div className="rn-action-top">
                  <span className="rn-action-letter">B</span>
                  <span className="rn-action-tag">03 / BUILD</span>
                </div>
                <h3>Turn an idea into action.</h3>
                <p>
                  Find collaborators around a project, idea,
                  or shared opportunity.
                </p>
                <Link
                  href="/intents/new?type=build"
                  className="rn-action-link"
                >
                  Start building <span>↗</span>
                </Link>
              </article>
            </div>
          </section>

          <section className="rn-section">
            <div className="rn-section-heading rn-heading-row">
              <div>
                <p className="rn-section-kicker">YOUR NETWORK</p>
                <h2>My communities</h2>
                <p className="rn-section-description">
                  The groups where shared interests become
                  meaningful collaboration.
                </p>
              </div>

              <Link
                href="/communities"
                className="rn-outline-link"
              >
                Explore all <span>→</span>
              </Link>
            </div>

            {myCommunities.length === 0 ? (
              <div className="rn-empty">
                <div className="rn-empty-icon">C</div>
                <h3>Your next community starts here.</h3>
                <p>
                  Discover people who share your interests,
                  professional goals, or local challenges.
                </p>
                <Link
                  href="/communities"
                  className="rn-button rn-button-primary"
                >
                  Discover communities <span>↗</span>
                </Link>
              </div>
            ) : (
              <div className="rn-community-grid">
                {myCommunities.map((community, index) => (
                  <article
                    className="rn-community-card"
                    key={community.id}
                  >
                    <div className="rn-community-top">
                      <span className="rn-community-number">
                        {String(index + 1).padStart(2, "0")}
                      </span>
                      <span className="rn-community-status">
                        <span className="rn-live-dot" />
                        ACTIVE
                      </span>
                    </div>

                    <p className="rn-community-category">
                      {community.category || "Community"}
                    </p>

                    <h3>{community.name}</h3>

                    <p className="rn-community-description">
                      {community.description ||
                        "A place to connect, share knowledge, and collaborate."}
                    </p>

                    {community.location_label && (
                      <p className="rn-community-location">
                        <span aria-hidden="true">⌖</span>{" "}
                        {community.location_label}
                      </p>
                    )}

                    <Link
                      href={`/communities/${community.slug}`}
                      className="rn-community-link"
                    >
                      Open community <span>↗</span>
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rn-section rn-opportunities">
            <div className="rn-section-heading rn-heading-row">
              <div>
                <p className="rn-section-kicker">
                  DISCOVER WHAT IS HAPPENING
                </p>
                <h2>Open opportunities</h2>
                <p className="rn-section-description">
                  Explore what people need, what they can offer,
                  and what they want to build.
                </p>
              </div>

              <Link href="/intents" className="rn-outline-link">
                View all <span>→</span>
              </Link>
            </div>

            {intents.length === 0 ? (
              <div className="rn-empty">
                <div className="rn-empty-icon">↗</div>
                <h3>Be the first to create an opportunity.</h3>
                <p>
                  Share a need, contribute something useful,
                  or invite people to build with you.
                </p>
                <Link
                  href="/intents/new"
                  className="rn-button rn-button-primary"
                >
                  Create an intention <span>↗</span>
                </Link>
              </div>
            ) : (
              <div className="rn-intent-grid">
                {intents.map((intent) => (
                  <article className="rn-intent-card" key={intent.id}>
                    <div className="rn-intent-card-top">
                      <span
                        className={`rn-intent-badge ${intentStyles[intent.intent_type]}`}
                      >
                        <span className="rn-badge-dot" />
                        {intentLabels[intent.intent_type]}
                      </span>

                      {intent.category && (
                        <span className="rn-intent-category">
                          {intent.category}
                        </span>
                      )}
                    </div>

                    <h3>{intent.title}</h3>

                    <p className="rn-intent-description">
                      {intent.description.length > 170
                        ? `${intent.description.slice(0, 170).trim()}…`
                        : intent.description}
                    </p>

                    <div className="rn-intent-meta">
                      {intent.location_label && (
                        <span>
                          <span aria-hidden="true">⌖</span>{" "}
                          {intent.location_label}
                        </span>
                      )}

                      <span>{formatDate(intent.created_at)}</span>
                    </div>

                    <Link
                      href={`/intents/${intent.id}`}
                      className="rn-intent-link"
                    >
                      View opportunity <span>↗</span>
                    </Link>
                  </article>
                ))}
              </div>
            )}
          </section>

          <section className="rn-bottom-banner">
            <div>
              <p className="rn-banner-kicker">
                YOUR NEXT STEP STARTS HERE
              </p>
              <h2>Make your connections count.</h2>
              <p>
                A clear intention can lead to the right person,
                a useful collaboration, or a practical result.
              </p>
            </div>

            <div className="rn-banner-actions">
              <Link
                href="/members"
                className="rn-button rn-button-banner"
              >
                Meet members <span>↗</span>
              </Link>
              <Link
                href="/communities"
                className="rn-banner-secondary"
              >
                Find a community
              </Link>
            </div>
          </section>
        </div>
      </main>

      <style jsx global>{`
        .rn-home {
          --rn-navy: #0b1e3a;
          --rn-cyan: #00b4d8;
          --rn-gold: #fbbf24;
          --rn-text: #172b46;
          --rn-muted: #68788d;
          --rn-border: #e5ebf2;
          color: var(--rn-text);
          padding: 30px 0 60px;
          overflow: hidden;
        }

        .rn-home *,
        .rn-home *::before,
        .rn-home *::after {
          box-sizing: border-box;
        }

        .rn-home-inner {
          width: min(1180px, calc(100% - 40px));
          margin: 0 auto;
        }

        .rn-welcome {
          position: relative;
          display: grid;
          grid-template-columns: 1.1fr 0.9fr;
          align-items: center;
          gap: 30px;
          min-height: 380px;
          padding: clamp(28px, 5vw, 58px);
          overflow: hidden;
          border-radius: 28px;
          background:
            radial-gradient(
              circle at 80% 10%,
              rgba(0, 180, 216, 0.2),
              transparent 34%
            ),
            linear-gradient(125deg, #0b1e3a 0%, #102e50 100%);
          color: #fff;
          box-shadow: 0 20px 55px rgba(11, 30, 58, 0.13);
        }

        .rn-welcome-content {
          position: relative;
          z-index: 2;
        }

        .rn-kicker,
        .rn-section-kicker,
        .rn-stat-label,
        .rn-action-tag,
        .rn-banner-kicker {
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.7px;
        }

        .rn-kicker {
          display: flex;
          align-items: center;
          gap: 10px;
          color: #a5eafa;
        }

        .rn-live-dot {
          display: inline-block;
          flex: 0 0 auto;
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: var(--rn-cyan);
          box-shadow: 0 0 0 4px rgba(0, 180, 216, 0.13);
        }

        .rn-welcome h1 {
          margin: 24px 0 16px;
          color: #fff;
          font-size: clamp(36px, 5vw, 59px);
          font-weight: 850;
          letter-spacing: -2.5px;
          line-height: 1.05;
        }

        .rn-welcome h1 span {
          color: var(--rn-cyan);
        }

        .rn-welcome-description {
          max-width: 510px;
          margin: 0;
          color: #d0dbea;
          font-size: 15px;
          line-height: 1.9;
        }

        .rn-welcome-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 27px;
        }

        .rn-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          min-height: 46px;
          padding: 0 18px;
          border: 1px solid transparent;
          border-radius: 10px;
          font-size: 12px;
          font-weight: 750;
          text-decoration: none !important;
          transition:
            transform 180ms ease,
            background 180ms ease,
            box-shadow 180ms ease;
        }

        .rn-button:hover {
          transform: translateY(-2px);
        }

        .rn-button-primary {
          background: var(--rn-cyan);
          color: #06243a !important;
          box-shadow: 0 7px 20px rgba(0, 180, 216, 0.18);
        }

        .rn-button-primary:hover {
          background: #43cde7;
          box-shadow: 0 10px 25px rgba(0, 180, 216, 0.24);
        }

        .rn-button-light {
          border-color: rgba(255, 255, 255, 0.23);
          background: rgba(255, 255, 255, 0.06);
          color: #fff !important;
        }

        .rn-button-light:hover {
          background: rgba(255, 255, 255, 0.13);
        }

        .rn-principles {
          display: flex;
          flex-wrap: wrap;
          gap: 8px;
          margin-top: 27px;
        }

        .rn-principles span {
          padding: 7px 10px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 30px;
          color: #d8e7f4;
          font-size: 10px;
          font-weight: 600;
        }

        .rn-welcome-visual {
          position: relative;
          display: grid;
          place-items: center;
          min-height: 290px;
          isolation: isolate;
        }

        .rn-orbit {
          position: absolute;
          width: min(270px, 90%);
          aspect-ratio: 1;
          border: 1px solid rgba(0, 180, 216, 0.23);
          border-radius: 50%;
        }

        .rn-orbit-one {
          transform: rotate(-20deg) scaleY(0.76);
        }

        .rn-orbit-two {
          transform: rotate(45deg) scaleY(0.76);
          border-color: rgba(251, 191, 36, 0.24);
        }

        .rn-visual-center {
          position: relative;
          z-index: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          width: 174px;
          height: 174px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 50%;
          background: linear-gradient(
            145deg,
            rgba(0, 180, 216, 0.17),
            rgba(255, 255, 255, 0.04)
          );
          box-shadow: 0 0 60px rgba(0, 180, 216, 0.12);
          backdrop-filter: blur(10px);
        }

        .rn-visual-symbol {
          display: grid;
          place-items: center;
          width: 49px;
          height: 49px;
          margin-bottom: 10px;
          border-radius: 15px;
          background: var(--rn-cyan);
          color: var(--rn-navy);
          font-size: 28px;
          font-weight: 900;
        }

        .rn-visual-center strong {
          color: #fff;
          font-size: 18px;
        }

        .rn-visual-center small {
          margin-top: 5px;
          color: #c6d7e9;
          font-size: 9px;
        }

        .rn-floating-card {
          position: absolute;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 12px;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 13px;
          background: rgba(15, 40, 68, 0.92);
          box-shadow: 0 12px 30px rgba(0, 0, 0, 0.16);
          backdrop-filter: blur(12px);
        }

        .rn-floating-top {
          top: 12px;
          right: 0;
        }

        .rn-floating-bottom {
          bottom: 15px;
          left: 0;
        }

        .rn-floating-icon {
          display: grid;
          place-items: center;
          width: 35px;
          height: 35px;
          border-radius: 10px;
          font-size: 15px;
          font-weight: 900;
        }

        .rn-icon-cyan {
          background: rgba(0, 180, 216, 0.18);
          color: #57dff3;
        }

        .rn-icon-gold {
          background: rgba(251, 191, 36, 0.16);
          color: var(--rn-gold);
        }

        .rn-floating-card strong,
        .rn-floating-card small {
          display: block;
        }

        .rn-floating-card strong {
          color: #fff;
          font-size: 11px;
        }

        .rn-floating-card small {
          margin-top: 4px;
          color: #bdcddd;
          font-size: 9px;
        }

        .rn-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
          margin-top: 22px;
        }

        .rn-stat-card {
          min-width: 0;
          padding: 23px;
          border: 1px solid var(--rn-border);
          border-radius: 17px;
          background: #fff;
          box-shadow: 0 5px 22px rgba(18, 43, 72, 0.035);
          transition:
            transform 180ms ease,
            box-shadow 180ms ease;
        }

        .rn-stat-card:hover {
          transform: translateY(-3px);
          box-shadow: 0 12px 30px rgba(18, 43, 72, 0.08);
        }

        .rn-stat-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }

        .rn-stat-icon {
          display: grid;
          place-items: center;
          width: 38px;
          height: 38px;
          border-radius: 11px;
          font-size: 12px;
          font-weight: 900;
        }

        .rn-stat-cyan {
          background: #e3faff;
          color: #008aa8;
        }

        .rn-stat-purple {
          background: #f0eaff;
          color: #7450bc;
        }

        .rn-stat-gold {
          background: #fff4d7;
          color: #9a6b00;
          font-size: 10px;
        }

        .rn-stat-label {
          color: #8997a8;
          font-size: 9px;
          letter-spacing: 1.1px;
          text-align: right;
        }

        .rn-stat-number {
          display: block;
          margin-top: 22px;
          color: var(--rn-navy);
          font-size: 37px;
          font-weight: 850;
          letter-spacing: -1.5px;
          line-height: 1;
        }

        .rn-stat-description {
          display: block;
          min-height: 35px;
          margin-top: 9px;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.6;
        }

        .rn-stat-link,
        .rn-stat-detail {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin-top: 17px;
          color: #008da9 !important;
          font-size: 11px;
          font-weight: 750;
          text-decoration: none !important;
        }

        .rn-stat-detail {
          color: #8a6b14 !important;
        }

        .rn-section {
          margin-top: 54px;
        }

        .rn-section-heading {
          margin-bottom: 23px;
        }

        .rn-heading-row {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 18px;
        }

        .rn-section-kicker {
          margin: 0 0 9px;
          color: #0096b3;
          font-size: 9px;
        }

        .rn-section-heading h2 {
          margin: 0;
          color: var(--rn-navy);
          font-size: clamp(23px, 3vw, 31px);
          font-weight: 850;
          letter-spacing: -0.8px;
          line-height: 1.2;
        }

        .rn-section-description {
          max-width: 600px;
          margin: 10px 0 0;
          color: var(--rn-muted);
          font-size: 13px;
          line-height: 1.8;
        }

        .rn-action-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
        }

        .rn-action-card {
          position: relative;
          display: flex;
          flex-direction: column;
          min-height: 260px;
          padding: 24px;
          overflow: hidden;
          border: 1px solid var(--rn-border);
          border-radius: 18px;
          background: #fff;
          transition:
            transform 180ms ease,
            box-shadow 180ms ease;
        }

        .rn-action-card::after {
          position: absolute;
          right: -42px;
          bottom: -66px;
          width: 145px;
          height: 145px;
          border: 22px solid currentColor;
          border-radius: 50%;
          opacity: 0.035;
          content: "";
          pointer-events: none;
        }

        .rn-action-card:hover {
          transform: translateY(-4px);
          box-shadow: 0 16px 35px rgba(18, 43, 72, 0.075);
        }

        .rn-action-need {
          border-top: 3px solid #00b4d8;
          color: #0089a5;
        }

        .rn-action-offer {
          border-top: 3px solid #8b70d5;
          color: #7252bd;
        }

        .rn-action-build {
          border-top: 3px solid #f2b92f;
          color: #9a7010;
        }

        .rn-action-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .rn-action-letter {
          display: grid;
          place-items: center;
          width: 45px;
          height: 45px;
          border-radius: 13px;
          background: currentColor;
          font-size: 19px;
          font-weight: 900;
        }

        .rn-action-need .rn-action-letter {
          background: #e0f9fe;
        }

        .rn-action-offer .rn-action-letter {
          background: #f0eaff;
        }

        .rn-action-build .rn-action-letter {
          background: #fff4d8;
        }

        .rn-action-tag {
          color: #8b9aab;
          font-size: 9px;
          letter-spacing: 1px;
        }

        .rn-action-card h3 {
          margin: 25px 0 10px;
          color: var(--rn-navy);
          font-size: 18px;
          font-weight: 800;
          letter-spacing: -0.35px;
          line-height: 1.4;
        }

        .rn-action-card p {
          margin: 0 0 21px;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.85;
        }

        .rn-action-link {
          display: inline-flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          width: fit-content;
          margin-top: auto;
          color: var(--rn-navy) !important;
          font-size: 12px;
          font-weight: 800;
          text-decoration: none !important;
        }

        .rn-action-link span {
          color: currentColor;
          font-size: 16px;
          transition: transform 180ms ease;
        }

        .rn-action-link:hover span {
          transform: translate(3px, -3px);
        }

        .rn-outline-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 10px;
          flex-shrink: 0;
          min-height: 40px;
          padding: 0 14px;
          border: 1px solid var(--rn-border);
          border-radius: 10px;
          background: #fff;
          color: var(--rn-navy) !important;
          font-size: 11px;
          font-weight: 750;
          text-decoration: none !important;
          transition:
            border-color 180ms ease,
            background 180ms ease;
        }

        .rn-outline-link:hover {
          border-color: var(--rn-cyan);
          background: #f0fcff;
        }

        .rn-community-grid,
        .rn-intent-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 17px;
        }

        .rn-community-card,
        .rn-intent-card {
          display: flex;
          flex-direction: column;
          min-width: 0;
          padding: 23px;
          border: 1px solid var(--rn-border);
          border-radius: 17px;
          background: #fff;
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease;
        }

        .rn-community-card:hover,
        .rn-intent-card:hover {
          transform: translateY(-3px);
          border-color: #c8eaf1;
          box-shadow: 0 13px 30px rgba(18, 43, 72, 0.06);
        }

        .rn-community-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
        }

        .rn-community-number {
          display: grid;
          place-items: center;
          width: 36px;
          height: 36px;
          border-radius: 11px;
          background: #e9f9fc;
          color: #008da9;
          font-size: 12px;
          font-weight: 850;
        }

        .rn-community-status {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          color: #628071;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1px;
        }

        .rn-community-status .rn-live-dot {
          width: 6px;
          height: 6px;
          background: #36a777;
          box-shadow: 0 0 0 4px #e9f8f0;
        }

        .rn-community-category {
          margin: 20px 0 7px;
          color: #008da9;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.7px;
          text-transform: uppercase;
        }

        .rn-community-card h3,
        .rn-intent-card h3 {
          margin: 0;
          color: var(--rn-navy);
          font-size: 18px;
          font-weight: 800;
          line-height: 1.45;
          overflow-wrap: anywhere;
        }

        .rn-community-description {
          margin: 11px 0 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.85;
        }

        .rn-community-location {
          margin: 13px 0 0;
          color: #718198;
          font-size: 11px;
        }

        .rn-community-link,
        .rn-intent-link {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 23px;
          padding-top: 16px;
          border-top: 1px solid #edf1f5;
          color: #008da9 !important;
          font-size: 11px;
          font-weight: 800;
          text-decoration: none !important;
        }

        .rn-intent-card-top {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 20px;
        }

        .rn-intent-badge {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          padding: 7px 10px;
          border-radius: 30px;
          font-size: 10px;
          font-weight: 800;
        }

        .rn-badge-dot {
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .rn-intent-need {
          background: #e8f8fc;
          color: #007f9b;
        }

        .rn-intent-offer {
          background: #e8f8ef;
          color: #16804b;
        }

        .rn-intent-build {
          background: #fff4d8;
          color: #936800;
        }

        .rn-intent-category {
          color: #8190a2;
          font-size: 10px;
          font-weight: 650;
        }

        .rn-intent-description {
          display: -webkit-box;
          overflow: hidden;
          margin: 11px 0 16px;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.85;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 4;
        }

        .rn-intent-meta {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: auto;
          color: #8290a1;
          font-size: 10px;
        }

        .rn-empty {
          display: flex;
          flex-direction: column;
          align-items: center;
          padding: 42px 24px;
          border: 1px dashed #ccd9e6;
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

        .rn-empty-icon {
          display: grid;
          place-items: center;
          width: 49px;
          height: 49px;
          border-radius: 15px;
          background: #e5f9fd;
          color: #008da9;
          font-size: 19px;
          font-weight: 900;
        }

        .rn-empty h3 {
          margin: 17px 0 7px;
          color: var(--rn-navy);
          font-size: 17px;
          font-weight: 800;
        }

        .rn-empty p {
          max-width: 450px;
          margin: 0 0 19px;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-bottom-banner {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 25px;
          margin-top: 55px;
          padding: clamp(25px, 4vw, 38px);
          border-radius: 20px;
          background:
            radial-gradient(
              circle at 90% 20%,
              rgba(0, 180, 216, 0.15),
              transparent 35%
            ),
            var(--rn-navy);
          color: #fff;
        }

        .rn-banner-kicker {
          margin: 0 0 12px;
          color: #5cdaef;
          font-size: 9px;
        }

        .rn-bottom-banner h2 {
          margin: 0;
          color: #fff;
          font-size: clamp(23px, 3vw, 31px);
          font-weight: 850;
          letter-spacing: -0.8px;
        }

        .rn-bottom-banner > div:first-child > p:last-child {
          max-width: 530px;
          margin: 10px 0 0;
          color: #c4d4e6;
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-banner-actions {
          display: flex;
          flex-shrink: 0;
          flex-direction: column;
          align-items: stretch;
          gap: 10px;
        }

        .rn-button-banner {
          background: var(--rn-cyan);
          color: #06243a !important;
        }

        .rn-banner-secondary {
          padding: 10px;
          color: #d2e4f5 !important;
          font-size: 11px;
          font-weight: 700;
          text-align: center;
          text-decoration: none !important;
        }

        @media (min-width: 1100px) {
          .rn-welcome-visual {
            transform: translateX(-5px);
          }
        }

        @media (max-width: 850px) {
          .rn-welcome {
            grid-template-columns: 1fr;
            gap: 12px;
          }

          .rn-welcome-visual {
            min-height: 235px;
            max-width: 480px;
            width: 100%;
            margin: 0 auto;
          }

          .rn-orbit {
            width: 220px;
          }

          .rn-visual-center {
            width: 145px;
            height: 145px;
          }

          .rn-floating-top {
            top: 3px;
          }

          .rn-floating-bottom {
            bottom: 3px;
          }

          .rn-action-grid {
            grid-template-columns: 1fr;
          }

          .rn-action-card {
            min-height: 225px;
          }

          .rn-bottom-banner {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-banner-actions {
            width: 100%;
            max-width: 300px;
          }
        }

        @media (max-width: 600px) {
          .rn-home {
            padding: 18px 0 38px;
          }

          .rn-home-inner {
            width: calc(100% - 28px);
          }

          .rn-welcome {
            min-height: auto;
            padding: 26px 21px 18px;
            border-radius: 20px;
          }

          .rn-welcome h1 {
            margin-top: 20px;
            font-size: clamp(36px, 10vw, 48px);
            letter-spacing: -1.8px;
          }

          .rn-welcome-description {
            font-size: 13px;
          }

          .rn-welcome-actions {
            flex-direction: column;
          }

          .rn-welcome-actions .rn-button {
            width: 100%;
          }

          .rn-principles {
            gap: 6px;
          }

          .rn-principles span {
            font-size: 9px;
          }

          .rn-welcome-visual {
            min-height: 210px;
          }

          .rn-orbit {
            width: 190px;
          }

          .rn-visual-center {
            width: 130px;
            height: 130px;
          }

          .rn-visual-symbol {
            width: 38px;
            height: 38px;
            font-size: 23px;
          }

          .rn-visual-center strong {
            font-size: 16px;
          }

          .rn-floating-card {
            gap: 7px;
            padding: 9px;
          }

          .rn-floating-icon {
            width: 29px;
            height: 29px;
          }

          .rn-floating-card strong {
            font-size: 10px;
          }

          .rn-floating-card small {
            font-size: 8px;
          }

          .rn-stats {
            grid-template-columns: 1fr;
            gap: 11px;
            margin-top: 14px;
          }

          .rn-stat-card {
            padding: 18px;
          }

          .rn-stat-number {
            margin-top: 16px;
            font-size: 32px;
          }

          .rn-stat-description {
            min-height: 0;
          }

          .rn-stat-link,
          .rn-stat-detail {
            margin-top: 12px;
          }

          .rn-section {
            margin-top: 39px;
          }

          .rn-heading-row {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-section-heading h2 {
            font-size: 25px;
          }

          .rn-community-grid,
          .rn-intent-grid {
            grid-template-columns: 1fr;
          }

          .rn-community-card,
          .rn-intent-card {
            padding: 19px;
          }

          .rn-action-card {
            min-height: 220px;
            padding: 21px;
          }

          .rn-bottom-banner {
            gap: 21px;
            margin-top: 39px;
            padding: 25px 21px;
            border-radius: 17px;
          }

          .rn-bottom-banner h2 {
            font-size: 25px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-home *,
          .rn-home *::before,
          .rn-home *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>

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