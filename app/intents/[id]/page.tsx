import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApproveInterestButton from "./ApproveInterestButton";
import DeclineInterestButton from "./DeclineInterestButton";
import WithdrawInterestButton from "./WithdrawInterestButton";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type Intent = {
  id: string;
  community_id: string;
  author_id: string;
  intent_type: "need" | "offer" | "build";
  title: string;
  description: string;
  category: string | null;
  location_label: string | null;
  status: "open" | "in_progress" | "fulfilled" | "closed";
  created_at: string;
};

type Community = {
  id: string;
  name: string;
  slug: string;
};

type Interest = {
  id: string;
  user_id: string;
  message: string | null;
  status: "pending" | "approved" | "declined" | "withdrawn";
  created_at: string;
};

type MemberProfile = {
  id: string;
  full_name: string | null;
};

const typeLabels: Record<Intent["intent_type"], string> = {
  need: "Need",
  offer: "Offer",
  build: "Build",
};

const typeDescriptions: Record<Intent["intent_type"], string> = {
  need: "A request for support, resources, or expertise.",
  offer: "An opportunity to share resources, expertise, or services.",
  build: "An opportunity to collaborate on something new.",
};

const formatDate = (value: string) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

const formatStatus = (value: string) =>
  value.replace(/_/g, " ");

export default async function IntentDetailsPage({
  params,
}: PageProps) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/intents/${id}`)}`);
  }

  const { data: intentData, error: intentError } = await supabase
    .from("intents")
    .select(
      "id, community_id, author_id, intent_type, title, description, category, location_label, status, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (intentError || !intentData) {
    notFound();
  }

  const intent = intentData as Intent;
  const isAuthor = intent.author_id === user.id;

  const [
    membershipResult,
    communityResult,
    authorProfileResult,
  ] = await Promise.all([
    supabase
      .from("community_members")
      .select("role, status")
      .eq("community_id", intent.community_id)
      .eq("user_id", user.id)
      .maybeSingle(),

    supabase
      .from("communities")
      .select("id, name, slug")
      .eq("id", intent.community_id)
      .maybeSingle(),

    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", intent.author_id)
      .maybeSingle(),
  ]);

  const isActiveMember =
    membershipResult.data?.status === "active";

  const community =
    (communityResult.data as Community | null) ?? null;

  const authorName =
    authorProfileResult.data?.full_name?.trim() ||
    "Community member";

  let existingInterest: Interest | null = null;
  let interests: Interest[] = [];
  let memberProfiles: MemberProfile[] = [];

  if (!isAuthor && isActiveMember) {
    const { data, error } = await supabase
      .from("intent_interests")
      .select("id, user_id, message, status, created_at")
      .eq("intent_id", intent.id)
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      console.error(
        "Failed to load existing interest:",
        error.message
      );
    } else {
      existingInterest = (data as Interest | null) ?? null;
    }
  }

  if (isAuthor) {
    const { data, error } = await supabase
      .from("intent_interests")
      .select("id, user_id, message, status, created_at")
      .eq("intent_id", intent.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        "Failed to load interests:",
        error.message
      );
    } else {
      interests = (data ?? []) as Interest[];
    }

    const memberIds = [
      ...new Set(interests.map((interest) => interest.user_id)),
    ];

    if (memberIds.length > 0) {
      const { data: profiles, error: profilesError } =
        await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", memberIds);

      if (profilesError) {
        console.error(
          "Failed to load interested member profiles:",
          profilesError.message
        );
      } else {
        memberProfiles = (profiles ?? []) as MemberProfile[];
      }
    }
  }

  const memberNames = new Map(
    memberProfiles.map((profile) => [
      profile.id,
      profile.full_name?.trim() || "Community member",
    ])
  );

  const pendingCount = interests.filter(
    (interest) => interest.status === "pending"
  ).length;

  const approvedCount = interests.filter(
    (interest) => interest.status === "approved"
  ).length;

  const declinedCount = interests.filter(
    (interest) => interest.status === "declined"
  ).length;

  const withdrawnCount = interests.filter(
    (interest) => interest.status === "withdrawn"
  ).length;

  return (
    <main className="rn-intent-page">
      <div className="rn-intent-container">
        <nav className="rn-intent-breadcrumb" aria-label="Breadcrumb">
          <Link href="/intents">Intentions</Link>
          <span aria-hidden="true">/</span>
          <span>Details</span>
        </nav>

        <header className="rn-intent-page-header">
          <div className="rn-intent-brand-label">
            <span className="rn-intent-brand-dot" />
            RUFFNECK CONNECT
            <span className="rn-intent-label-divider">/</span>
            COMMUNITY OPPORTUNITIES
          </div>

          <h1>Intention details</h1>

          <p>
            Discover the opportunity, understand the goal, and connect
            with people ready to contribute.
          </p>
        </header>

        <div className="rn-intent-layout">
          <div className="rn-intent-main-column">
            <article className="rn-intent-card rn-intent-primary-card">
              <div className="rn-intent-card-top">
                <span
                  className={`rn-intent-type rn-intent-type-${intent.intent_type}`}
                >
                  <span className="rn-intent-type-indicator" />
                  {typeLabels[intent.intent_type]}
                </span>

                <span
                  className={`rn-intent-status rn-intent-status-${intent.status}`}
                >
                  {formatStatus(intent.status)}
                </span>
              </div>

              <h2 className="rn-intent-title">{intent.title}</h2>

              <div className="rn-intent-author">
                <div
                  className="rn-intent-avatar"
                  aria-hidden="true"
                >
                  {authorName.charAt(0).toUpperCase()}
                </div>

                <div className="rn-intent-author-info">
                  <span className="rn-intent-author-name">
                    {authorName}
                    {isAuthor && (
                      <span className="rn-intent-you-badge">
                        You
                      </span>
                    )}
                  </span>

                  <span className="rn-intent-muted">
                    Published {formatDate(intent.created_at)}
                  </span>
                </div>
              </div>

              <div className="rn-intent-separator" />

              <div className="rn-intent-description-heading">
                <span className="rn-intent-section-marker" />
                <h3>About this intention</h3>
              </div>

              <p className="rn-intent-description">
                {intent.description}
              </p>

              <div className="rn-intent-metadata">
                {intent.category && (
                  <div className="rn-intent-meta-item">
                    <span className="rn-intent-meta-icon">
                      #
                    </span>
                    <div>
                      <span className="rn-intent-meta-label">
                        Category
                      </span>
                      <span className="rn-intent-meta-value">
                        {intent.category}
                      </span>
                    </div>
                  </div>
                )}

                {intent.location_label && (
                  <div className="rn-intent-meta-item">
                    <span className="rn-intent-meta-icon">
                      ◎
                    </span>
                    <div>
                      <span className="rn-intent-meta-label">
                        Location
                      </span>
                      <span className="rn-intent-meta-value">
                        {intent.location_label}
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {community && (
                <div className="rn-intent-community">
                  <div className="rn-intent-community-icon">
                    C
                  </div>

                  <div className="rn-intent-community-copy">
                    <span className="rn-intent-meta-label">
                      Community
                    </span>

                    <Link
                      href={`/communities/${community.slug}`}
                      className="rn-intent-community-link"
                    >
                      {community.name}
                      <span aria-hidden="true"> ↗</span>
                    </Link>
                  </div>

                  <Link
                    href={`/communities/${community.slug}`}
                    className="rn-intent-community-button"
                  >
                    View
                  </Link>
                </div>
              )}

              <div className="rn-intent-card-footer">
                <div className="rn-intent-footer-copy">
                  <span className="rn-intent-footer-dot" />
                  <span>
                    {intent.status === "open"
                      ? "This intention is accepting responses."
                      : `This intention is ${formatStatus(intent.status)}.`}
                  </span>
                </div>

                <Link
                  href="/intents"
                  className="rn-intent-back-link"
                >
                  All intentions <span aria-hidden="true">→</span>
                </Link>
              </div>
            </article>

            {!isAuthor && !isActiveMember && (
              <section className="rn-intent-notice rn-intent-notice-warning">
                <div className="rn-intent-notice-icon">!</div>

                <div className="rn-intent-notice-content">
                  <h3>Community membership required</h3>

                  <p>
                    You must be an active member of this community
                    before you can respond to this intention.
                  </p>

                  {community && (
                    <Link
                      href={`/communities/${community.slug}`}
                      className="rn-intent-button rn-intent-button-primary"
                    >
                      View community <span aria-hidden="true">→</span>
                    </Link>
                  )}
                </div>
              </section>
            )}

            {!isAuthor &&
              isActiveMember &&
              intent.status === "open" && (
                <section className="rn-intent-card rn-intent-response-card">
                  {existingInterest &&
                  existingInterest.status !== "withdrawn" ? (
                    <div className="rn-intent-existing-response">
                      <div className="rn-intent-response-heading">
                        <span className="rn-intent-section-marker" />
                        <span className="rn-intent-overline">
                          YOUR RESPONSE
                        </span>
                      </div>

                      <div className="rn-intent-response-status-row">
                        <div>
                          <h3>Interest already submitted</h3>
                          <p>
                            Your response has been recorded.
                          </p>
                        </div>

                        <span
                          className={`rn-intent-status rn-intent-status-${existingInterest.status}`}
                        >
                          {formatStatus(existingInterest.status)}
                        </span>
                      </div>

                      {existingInterest.message && (
                        <div className="rn-intent-message-preview">
                          <span className="rn-intent-meta-label">
                            Your message
                          </span>
                          <p>{existingInterest.message}</p>
                        </div>
                      )}

                      {existingInterest.status === "approved" && (
                        <Link
                          className="rn-intent-button rn-intent-button-primary"
                          href="/messages"
                        >
                          Open messages{" "}
                          <span aria-hidden="true">→</span>
                        </Link>
                      )}

                      {existingInterest.status === "declined" && (
                        <p className="rn-intent-muted rn-intent-extra-note">
                          Your previous response was declined.
                        </p>
                      )}

                      {existingInterest.status === "pending" && (
                        <div className="rn-intent-withdraw-action">
                          <p className="rn-intent-muted">
                            Changed your mind? You can withdraw your pending interest request.
                          </p>

                          <WithdrawInterestButton
                            intentId={intent.id}
                            interestId={existingInterest.id}
                          />
                        </div>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="rn-intent-response-heading">
                        <span className="rn-intent-section-marker" />
                        <span className="rn-intent-overline">
                          TAKE ACTION
                        </span>
                      </div>

                      <h2 className="rn-intent-response-title">
                        Make your contribution
                      </h2>

                      <p className="rn-intent-response-description">
                        Explain how you can help, what you can
                        contribute, or how you would like to
                        collaborate. A clear message helps the
                        intention owner understand your proposal.
                      </p>

                      <form
                        action={`/api/intents/${intent.id}/interest`}
                        method="post"
                        className="rn-intent-form"
                      >
                        <div className="rn-intent-form-group">
                          <label htmlFor="message">
                            Your message{" "}
                            <span className="rn-intent-optional">
                              (optional)
                            </span>
                          </label>

                          <textarea
                            id="message"
                            name="message"
                            rows={6}
                            maxLength={1500}
                            placeholder="Describe what you can contribute, your relevant experience, or how you would like to collaborate..."
                          />

                          <div className="rn-intent-input-hint">
                            <span>
                              Be specific about the value you can
                              contribute.
                            </span>
                            <span>Maximum 1,500 characters</span>
                          </div>
                        </div>

                        <button
                          className="rn-intent-button rn-intent-button-primary rn-intent-submit"
                          type="submit"
                        >
                          Submit interest
                          <span aria-hidden="true">→</span>
                        </button>
                      </form>
                    </>
                  )}
                </section>
              )}

            {!isAuthor &&
              isActiveMember &&
              intent.status !== "open" && (
                <section className="rn-intent-notice rn-intent-notice-neutral">
                  <div className="rn-intent-notice-icon">i</div>

                  <div className="rn-intent-notice-content">
                    <h3>Responses are closed</h3>

                    <p>
                      This intention is currently{" "}
                      {formatStatus(intent.status)} and is no longer
                      accepting new responses.
                    </p>

                    <Link
                      href="/intents"
                      className="rn-intent-text-link"
                    >
                      Explore other intentions{" "}
                      <span aria-hidden="true">→</span>
                    </Link>
                  </div>
                </section>
              )}

            {isAuthor && (
              <section className="rn-intent-card rn-intent-management-card">
                <div className="rn-intent-management-header">
                  <div>
                    <span className="rn-intent-overline">
                      YOUR OPPORTUNITY
                    </span>

                    <h2>Responses and collaboration</h2>

                    <p>
                      Review contributions, evaluate proposals, and
                      decide who to collaborate with.
                    </p>
                  </div>

                  <div className="rn-intent-management-icon">
                    ↗
                  </div>
                </div>

                <div className="rn-intent-stat-grid">
                  <div className="rn-intent-stat">
                    <span className="rn-intent-stat-label">
                      Total responses
                    </span>
                    <strong>{interests.length}</strong>
                    <span className="rn-intent-stat-caption">
                      All submissions
                    </span>
                  </div>

                  <div className="rn-intent-stat rn-intent-stat-pending">
                    <span className="rn-intent-stat-label">
                      Awaiting review
                    </span>
                    <strong>{pendingCount}</strong>
                    <span className="rn-intent-stat-caption">
                      Need your attention
                    </span>
                  </div>

                  <div className="rn-intent-stat rn-intent-stat-approved">
                    <span className="rn-intent-stat-label">
                      Approved
                    </span>
                    <strong>{approvedCount}</strong>
                    <span className="rn-intent-stat-caption">
                      Accepted contributions
                    </span>
                  </div>
                </div>

                {interests.length === 0 ? (
                  <div className="rn-intent-empty">
                    <div className="rn-intent-empty-icon">
                      +
                    </div>

                    <h3>No responses yet</h3>

                    <p>
                      Community members who express interest will
                      appear here. Share your intention with the
                      community to encourage participation.
                    </p>

                    {community && (
                      <Link
                        href={`/communities/${community.slug}`}
                        className="rn-intent-button rn-intent-button-secondary"
                      >
                        Visit community
                      </Link>
                    )}
                  </div>
                ) : (
                  <div className="rn-intent-interest-section">
                    <div className="rn-intent-interest-heading">
                      <h3>People who responded</h3>
                      <span>
                        {interests.length}{" "}
                        {interests.length === 1
                          ? "response"
                          : "responses"}
                      </span>
                    </div>

                    <div className="rn-intent-interest-list">
                      {interests.map((interest) => {
                        const memberName =
                          memberNames.get(interest.user_id) ??
                          "Community member";

                        return (
                          <article
                            className="rn-intent-interest"
                            key={interest.id}
                          >
                            <div className="rn-intent-interest-top">
                              <div className="rn-intent-interest-person">
                                <div
                                  className="rn-intent-avatar rn-intent-interest-avatar"
                                  aria-hidden="true"
                                >
                                  {memberName.charAt(0).toUpperCase()}
                                </div>

                                <div>
                                  <h4>{memberName}</h4>

                                  <p className="rn-intent-muted">
                                    Received{" "}
                                    {formatDate(interest.created_at)}
                                  </p>
                                </div>
                              </div>

                              <span
                                className={`rn-intent-status rn-intent-status-${interest.status}`}
                              >
                                {formatStatus(interest.status)}
                              </span>
                            </div>

                            <div className="rn-intent-interest-message">
                              {interest.message ? (
                                <p>{interest.message}</p>
                              ) : (
                                <p className="rn-intent-muted">
                                  No additional message provided.
                                </p>
                              )}
                            </div>

                            {interest.status === "pending" &&
                              intent.status === "open" && (
                                <div className="rn-intent-interest-actions">
                                  <ApproveInterestButton
                                    intentId={intent.id}
                                    interestId={interest.id}
                                  />

                                  <DeclineInterestButton
                                    intentId={intent.id}
                                    interestId={interest.id}
                                  />
                                </div>
                              )}

                            {interest.status === "approved" && (
                              <div className="rn-intent-interest-note rn-intent-approved-note">
                                <span aria-hidden="true">✓</span>
                                <p>
                                  This response has been approved.
                                  An intention-linked conversation can
                                  be accessed from Messages.
                                </p>
                                <Link href="/messages">
                                  Messages →
                                </Link>
                              </div>
                            )}

                            {interest.status === "declined" && (
                              <div className="rn-intent-interest-note">
                                <p>
                                  This interest request was declined.
                                </p>
                              </div>
                            )}

                            {interest.status === "withdrawn" && (
                              <div className="rn-intent-interest-note">
                                <p>
                                  This interest request was withdrawn.
                                </p>
                              </div>
                            )}
                          </article>
                        );
                      })}
                    </div>

                    <div className="rn-intent-interest-summary">
                      <span>
                        {declinedCount} declined
                      </span>
                      <span className="rn-intent-summary-divider" />
                      <span>
                        {withdrawnCount} withdrawn
                      </span>
                    </div>
                  </div>
                )}

                <div className="rn-intent-management-footer">
                  <Link
                    href="/intents"
                    className="rn-intent-button rn-intent-button-secondary"
                  >
                    Browse intentions
                  </Link>

                  <Link
                    href="/messages"
                    className="rn-intent-button rn-intent-button-primary"
                  >
                    Open messages <span aria-hidden="true">→</span>
                  </Link>
                </div>
              </section>
            )}
          </div>

          <aside className="rn-intent-sidebar">
            <section className="rn-intent-card rn-intent-sidebar-card">
              <span className="rn-intent-overline">
                OPPORTUNITY OVERVIEW
              </span>

              <h3>At a glance</h3>

              <p className="rn-intent-sidebar-description">
                {typeDescriptions[intent.intent_type]}
              </p>

              <div className="rn-intent-sidebar-divider" />

              <div className="rn-intent-sidebar-row">
                <span>Type</span>
                <strong>{typeLabels[intent.intent_type]}</strong>
              </div>

              <div className="rn-intent-sidebar-row">
                <span>Status</span>
                <strong className="rn-intent-sidebar-status">
                  <span
                    className={`rn-intent-sidebar-status-dot rn-intent-sidebar-status-${intent.status}`}
                  />
                  {formatStatus(intent.status)}
                </strong>
              </div>

              <div className="rn-intent-sidebar-row">
                <span>Published</span>
                <strong>{formatDate(intent.created_at)}</strong>
              </div>

              {intent.category && (
                <div className="rn-intent-sidebar-row">
                  <span>Category</span>
                  <strong>{intent.category}</strong>
                </div>
              )}

              {intent.location_label && (
                <div className="rn-intent-sidebar-row">
                  <span>Location</span>
                  <strong>{intent.location_label}</strong>
                </div>
              )}

              {community && (
                <div className="rn-intent-sidebar-community">
                  <span className="rn-intent-sidebar-community-label">
                    COMMUNITY
                  </span>

                  <Link href={`/communities/${community.slug}`}>
                    {community.name}
                    <span aria-hidden="true"> ↗</span>
                  </Link>
                </div>
              )}

              {!isAuthor &&
                isActiveMember &&
                intent.status === "open" && (
                  <a
                    className="rn-intent-button rn-intent-button-primary rn-intent-sidebar-cta"
                    href="#message"
                  >
                    Express interest <span aria-hidden="true">→</span>
                  </a>
                )}
            </section>

            <section className="rn-intent-sidebar-promo">
              <div className="rn-intent-promo-mark">RN</div>

              <span className="rn-intent-overline">
                RUFFNECK CONNECT
              </span>

              <h3>Good connections create opportunities.</h3>

              <p>
                Discover what people need, share what you can offer,
                and find people to build with.
              </p>

              <Link
                href="/intents"
                className="rn-intent-promo-link"
              >
                Explore intentions <span aria-hidden="true">→</span>
              </Link>
            </section>

            <Link
              href="/messages"
              className="rn-intent-sidebar-messages"
            >
              <span className="rn-intent-messages-icon">↗</span>

              <span>
                <strong>Messages</strong>
                <small>Continue your conversations</small>
              </span>

              <span className="rn-intent-messages-arrow">
                →
              </span>
            </Link>
          </aside>
        </div>
      </div>

      <style>{`
        .rn-intent-page {
          --rn-navy: #0b1e3a;
          --rn-cyan: #00b4d8;
          --rn-gold: #fbbf24;
          --rn-text: #172b45;
          --rn-muted: #718096;
          --rn-border: #e4eaf1;
          --rn-surface: #ffffff;
          --rn-background: #f5f8fc;
          min-height: 100vh;
          padding: 34px 22px 76px;
          background: var(--rn-background);
          color: var(--rn-text);
        }

        .rn-intent-page *,
        .rn-intent-page *::before,
        .rn-intent-page *::after {
          box-sizing: border-box;
        }

        .rn-intent-container {
          width: 100%;
          max-width: 1220px;
          margin: 0 auto;
        }

        .rn-intent-breadcrumb {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          margin-bottom: 28px;
          color: var(--rn-muted);
          font-size: 13px;
        }

        .rn-intent-breadcrumb a {
          color: var(--rn-navy);
          font-weight: 650;
          text-decoration: none;
        }

        .rn-intent-breadcrumb a:hover {
          color: #008eac;
        }

        .rn-intent-page-header {
          max-width: 760px;
          margin-bottom: 30px;
        }

        .rn-intent-brand-label,
        .rn-intent-overline {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 9px;
          color: #087e9b;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 1.6px;
          line-height: 1.7;
        }

        .rn-intent-brand-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--rn-cyan);
          box-shadow: 0 0 0 4px rgba(0, 180, 216, 0.12);
        }

        .rn-intent-label-divider {
          color: #b1bdcc;
        }

        .rn-intent-page-header h1 {
          margin: 13px 0 10px;
          color: var(--rn-navy);
          font-size: clamp(30px, 4vw, 43px);
          font-weight: 850;
          letter-spacing: -1.6px;
          line-height: 1.13;
        }

        .rn-intent-page-header > p {
          max-width: 650px;
          margin: 0;
          color: var(--rn-muted);
          font-size: 15px;
          line-height: 1.8;
        }

        .rn-intent-layout {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 310px;
          align-items: start;
          gap: 24px;
        }

        .rn-intent-main-column {
          display: grid;
          min-width: 0;
          gap: 22px;
        }

        .rn-intent-card {
          min-width: 0;
          overflow: hidden;
          border: 1px solid var(--rn-border);
          border-radius: 19px;
          background: var(--rn-surface);
          box-shadow: 0 7px 26px rgba(11, 30, 58, 0.035);
        }

        .rn-intent-primary-card {
          padding: clamp(22px, 3.5vw, 36px);
        }

        .rn-intent-card-top {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .rn-intent-type,
        .rn-intent-status {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 7px;
          width: fit-content;
          max-width: 100%;
          padding: 7px 11px;
          border-radius: 999px;
          font-size: 11px;
          font-weight: 800;
          line-height: 1.3;
          text-transform: capitalize;
        }

        .rn-intent-type-need {
          color: #a14b0c;
          background: #fff2e4;
        }

        .rn-intent-type-offer {
          color: #087653;
          background: #e7f8ef;
        }

        .rn-intent-type-build {
          color: #2859a5;
          background: #eaf2ff;
        }

        .rn-intent-type-indicator {
          width: 6px;
          height: 6px;
          flex: 0 0 6px;
          border-radius: 50%;
          background: currentColor;
        }

        .rn-intent-status-open {
          color: #087653;
          background: #e7f8ef;
        }

        .rn-intent-status-in_progress {
          color: #8b5b00;
          background: #fff5d9;
        }

        .rn-intent-status-fulfilled {
          color: #2458a6;
          background: #eaf2ff;
        }

        .rn-intent-status-closed {
          color: #667085;
          background: #edf0f4;
        }

        .rn-intent-status-pending {
          color: #8b5b00;
          background: #fff5d9;
        }

        .rn-intent-status-approved {
          color: #087653;
          background: #e7f8ef;
        }

        .rn-intent-status-declined {
          color: #a33636;
          background: #fff0f0;
        }

        .rn-intent-status-withdrawn {
          color: #667085;
          background: #edf0f4;
        }

        .rn-intent-title {
          margin: 23px 0 21px;
          color: var(--rn-navy);
          font-size: clamp(25px, 3.5vw, 35px);
          font-weight: 850;
          letter-spacing: -1px;
          line-height: 1.25;
          overflow-wrap: anywhere;
        }

        .rn-intent-author {
          display: flex;
          align-items: center;
          gap: 12px;
        }

        .rn-intent-avatar {
          display: flex;
          width: 43px;
          height: 43px;
          flex: 0 0 43px;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(0, 180, 216, 0.22);
          border-radius: 13px;
          background: linear-gradient(145deg, #e5f9fd, #dce9fa);
          color: var(--rn-navy);
          font-size: 16px;
          font-weight: 850;
        }

        .rn-intent-author-info {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .rn-intent-author-name {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          color: var(--rn-navy);
          font-size: 13px;
          font-weight: 800;
        }

        .rn-intent-you-badge {
          padding: 3px 7px;
          border-radius: 6px;
          background: #e7f7fb;
          color: #087e9b;
          font-size: 10px;
          font-weight: 800;
        }

        .rn-intent-muted {
          margin: 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.7;
        }

        .rn-intent-separator {
          height: 1px;
          margin: 25px 0;
          background: var(--rn-border);
        }

        .rn-intent-description-heading {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 14px;
        }

        .rn-intent-section-marker {
          width: 4px;
          height: 21px;
          flex: 0 0 4px;
          border-radius: 5px;
          background: var(--rn-cyan);
        }

        .rn-intent-description-heading h3 {
          margin: 0;
          color: var(--rn-navy);
          font-size: 16px;
          font-weight: 850;
        }

        .rn-intent-description {
          margin: 0;
          color: #4b5d73;
          font-size: 14px;
          line-height: 1.95;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }

        .rn-intent-metadata {
          display: flex;
          flex-wrap: wrap;
          gap: 13px 24px;
          margin-top: 26px;
          padding: 19px 0;
          border-top: 1px solid var(--rn-border);
          border-bottom: 1px solid var(--rn-border);
        }

        .rn-intent-meta-item {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
        }

        .rn-intent-meta-icon {
          display: flex;
          width: 35px;
          height: 35px;
          flex: 0 0 35px;
          align-items: center;
          justify-content: center;
          border-radius: 10px;
          background: #eff8fc;
          color: #087e9b;
          font-size: 16px;
          font-weight: 850;
        }

        .rn-intent-meta-item > div {
          display: grid;
          gap: 4px;
          min-width: 0;
        }

        .rn-intent-meta-label {
          display: block;
          color: #8290a2;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 0.7px;
          text-transform: uppercase;
        }

        .rn-intent-meta-value {
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 750;
          overflow-wrap: anywhere;
        }

        .rn-intent-community {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 20px;
          padding: 15px;
          border: 1px solid #e7edf5;
          border-radius: 13px;
          background: #f9fbfe;
        }

        .rn-intent-community-icon {
          display: flex;
          width: 39px;
          height: 39px;
          flex: 0 0 39px;
          align-items: center;
          justify-content: center;
          border-radius: 12px;
          background: var(--rn-navy);
          color: white;
          font-size: 15px;
          font-weight: 850;
        }

        .rn-intent-community-copy {
          display: grid;
          flex: 1;
          gap: 5px;
          min-width: 0;
        }

        .rn-intent-community-link {
          color: var(--rn-navy);
          font-size: 13px;
          font-weight: 800;
          text-decoration: none;
          overflow-wrap: anywhere;
        }

        .rn-intent-community-link:hover {
          color: #008eac;
        }

        .rn-intent-community-button {
          padding: 8px 12px;
          border: 1px solid #dce6ef;
          border-radius: 8px;
          background: white;
          color: var(--rn-navy);
          font-size: 11px;
          font-weight: 800;
          text-decoration: none;
        }

        .rn-intent-card-footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
          margin-top: 23px;
        }

        .rn-intent-footer-copy {
          display: flex;
          align-items: center;
          gap: 8px;
          color: var(--rn-muted);
          font-size: 11px;
          line-height: 1.6;
        }

        .rn-intent-footer-dot {
          width: 7px;
          height: 7px;
          flex: 0 0 7px;
          border-radius: 50%;
          background: ${"var(--rn-cyan)"};
        }

        .rn-intent-back-link {
          color: #087e9b;
          font-size: 12px;
          font-weight: 800;
          text-decoration: none;
        }

        .rn-intent-back-link:hover,
        .rn-intent-text-link:hover {
          text-decoration: underline;
        }

        .rn-intent-sidebar {
          display: grid;
          gap: 18px;
        }

        .rn-intent-sidebar-card {
          padding: 23px;
        }

        .rn-intent-sidebar-card h3 {
          margin: 12px 0 8px;
          color: var(--rn-navy);
          font-size: 21px;
          font-weight: 850;
          letter-spacing: -0.5px;
        }

        .rn-intent-sidebar-description {
          margin: 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-intent-sidebar-divider {
          height: 1px;
          margin: 19px 0;
          background: var(--rn-border);
        }

        .rn-intent-sidebar-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-top: 16px;
          font-size: 11px;
        }

        .rn-intent-sidebar-row > span {
          flex: 0 0 auto;
          color: var(--rn-muted);
        }

        .rn-intent-sidebar-row > strong {
          color: var(--rn-navy);
          font-size: 11px;
          font-weight: 800;
          text-align: right;
          text-transform: capitalize;
          overflow-wrap: anywhere;
        }

        .rn-intent-sidebar-status {
          display: inline-flex;
          align-items: center;
          justify-content: flex-end;
          gap: 6px;
        }

        .rn-intent-sidebar-status-dot {
          width: 7px;
          height: 7px;
          flex: 0 0 7px;
          border-radius: 50%;
          background: #9aa7b6;
        }

        .rn-intent-sidebar-status-open {
          background: #16a36a;
        }

        .rn-intent-sidebar-status-in_progress {
          background: #e6a008;
        }

        .rn-intent-sidebar-status-fulfilled {
          background: #3478db;
        }

        .rn-intent-sidebar-status-closed {
          background: #9aa7b6;
        }

        .rn-intent-sidebar-community {
          display: grid;
          gap: 8px;
          margin-top: 20px;
          padding-top: 18px;
          border-top: 1px solid var(--rn-border);
        }

        .rn-intent-sidebar-community-label {
          color: #8290a2;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 1px;
        }

        .rn-intent-sidebar-community a {
          color: #087e9b;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.6;
          text-decoration: none;
          overflow-wrap: anywhere;
        }

        .rn-intent-sidebar-cta {
          width: 100%;
          margin-top: 20px;
        }

        .rn-intent-button {
          display: inline-flex;
          min-height: 43px;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 11px 16px;
          border: 1px solid transparent;
          border-radius: 10px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.4;
          text-align: center;
          text-decoration: none;
          cursor: pointer;
          transition:
            transform 150ms ease,
            background 150ms ease,
            border-color 150ms ease;
        }

        .rn-intent-button:hover {
          transform: translateY(-1px);
        }

        .rn-intent-button-primary {
          border-color: var(--rn-navy);
          background: var(--rn-navy);
          color: white;
        }

        .rn-intent-button-primary:hover {
          border-color: #123b65;
          background: #123b65;
          color: white;
        }

        .rn-intent-button-secondary {
          border-color: #dce5ef;
          background: white;
          color: var(--rn-navy);
        }

        .rn-intent-button-secondary:hover {
          border-color: var(--rn-cyan);
          background: #f2fbfd;
        }

        .rn-intent-sidebar-promo {
          position: relative;
          overflow: hidden;
          padding: 24px;
          border: 1px solid #173a5c;
          border-radius: 18px;
          background:
            radial-gradient(
              circle at 100% 0,
              rgba(0, 180, 216, 0.19),
              transparent 45%
            ),
            linear-gradient(145deg, #102b4b, #0b1e3a);
          color: white;
        }

        .rn-intent-promo-mark {
          display: flex;
          width: 41px;
          height: 41px;
          align-items: center;
          justify-content: center;
          margin-bottom: 22px;
          border: 1px solid rgba(0, 180, 216, 0.5);
          border-radius: 12px;
          background: rgba(0, 180, 216, 0.13);
          color: #74e7f7;
          font-size: 13px;
          font-weight: 900;
          letter-spacing: -0.5px;
        }

        .rn-intent-sidebar-promo .rn-intent-overline {
          color: #75d9eb;
          font-size: 9px;
        }

        .rn-intent-sidebar-promo h3 {
          margin: 13px 0 10px;
          color: white;
          font-size: 22px;
          font-weight: 850;
          letter-spacing: -0.7px;
          line-height: 1.35;
        }

        .rn-intent-sidebar-promo > p {
          margin: 0;
          color: #c1d0df;
          font-size: 12px;
          line-height: 1.85;
        }

        .rn-intent-promo-link {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          margin-top: 20px;
          color: #75e4f4;
          font-size: 12px;
          font-weight: 850;
          text-decoration: none;
        }

        .rn-intent-promo-link:hover {
          color: var(--rn-gold);
        }

        .rn-intent-sidebar-messages {
          display: flex;
          align-items: center;
          gap: 11px;
          padding: 16px;
          border: 1px solid var(--rn-border);
          border-radius: 14px;
          background: white;
          text-decoration: none;
        }

        .rn-intent-messages-icon {
          display: flex;
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          background: #eaf8fc;
          color: #087e9b;
          font-size: 18px;
          font-weight: 850;
        }

        .rn-intent-sidebar-messages > span:nth-child(2) {
          display: grid;
          flex: 1;
          gap: 5px;
          min-width: 0;
        }

        .rn-intent-sidebar-messages strong {
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 850;
        }

        .rn-intent-sidebar-messages small {
          color: var(--rn-muted);
          font-size: 10px;
          line-height: 1.6;
        }

        .rn-intent-messages-arrow {
          color: #087e9b;
          font-size: 16px;
        }

        .rn-intent-notice {
          display: flex;
          align-items: flex-start;
          gap: 15px;
          padding: 22px;
          border: 1px solid var(--rn-border);
          border-radius: 16px;
          background: white;
        }

        .rn-intent-notice-warning {
          border-color: #f0dfb3;
          background: #fffdf6;
        }

        .rn-intent-notice-neutral {
          background: #f9fbfe;
        }

        .rn-intent-notice-icon {
          display: flex;
          width: 35px;
          height: 35px;
          flex: 0 0 35px;
          align-items: center;
          justify-content: center;
          border-radius: 11px;
          background: #fff0c5;
          color: #8b5b00;
          font-size: 16px;
          font-weight: 900;
        }

        .rn-intent-notice-neutral .rn-intent-notice-icon {
          background: #e9f2fa;
          color: #315b83;
        }

        .rn-intent-notice-content {
          min-width: 0;
        }

        .rn-intent-notice-content h3 {
          margin: 1px 0 8px;
          color: var(--rn-navy);
          font-size: 16px;
          font-weight: 850;
        }

        .rn-intent-notice-content > p {
          margin: 0 0 16px;
          color: var(--rn-muted);
          font-size: 13px;
          line-height: 1.8;
        }

        .rn-intent-text-link {
          color: #087e9b;
          font-size: 12px;
          font-weight: 850;
          text-decoration: none;
        }

        .rn-intent-response-card {
          padding: clamp(22px, 3.5vw, 32px);
        }

        .rn-intent-response-heading {
          display: flex;
          align-items: center;
          gap: 10px;
        }

        .rn-intent-response-title {
          margin: 18px 0 9px;
          color: var(--rn-navy);
          font-size: 25px;
          font-weight: 850;
          letter-spacing: -0.7px;
          line-height: 1.3;
        }

        .rn-intent-response-description {
          margin: 0;
          color: var(--rn-muted);
          font-size: 13px;
          line-height: 1.85;
        }

        .rn-intent-form {
          margin-top: 24px;
        }

        .rn-intent-form-group {
          display: grid;
          gap: 10px;
        }

        .rn-intent-form-group label {
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 850;
        }

        .rn-intent-optional {
          color: var(--rn-muted);
          font-size: 11px;
          font-weight: 500;
        }

        .rn-intent-form-group textarea {
          display: block;
          width: 100%;
          min-height: 145px;
          padding: 15px;
          resize: vertical;
          border: 1px solid #dce5ef;
          border-radius: 11px;
          outline: none;
          background: #fbfcfe;
          color: var(--rn-text);
          font-family: inherit;
          font-size: 13px;
          line-height: 1.8;
          transition:
            border-color 150ms ease,
            box-shadow 150ms ease,
            background 150ms ease;
        }

        .rn-intent-form-group textarea::placeholder {
          color: #9aa7b6;
        }

        .rn-intent-form-group textarea:focus {
          border-color: var(--rn-cyan);
          background: white;
          box-shadow: 0 0 0 3px rgba(0, 180, 216, 0.12);
        }

        .rn-intent-input-hint {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 6px 12px;
          color: #8794a5;
          font-size: 10px;
          line-height: 1.6;
        }

        .rn-intent-submit {
          margin-top: 20px;
        }

        .rn-intent-existing-response h3 {
          margin: 0;
          color: var(--rn-navy);
          font-size: 18px;
          font-weight: 850;
        }

        .rn-intent-response-status-row {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 14px;
          margin-top: 19px;
        }

        .rn-intent-response-status-row > div > p {
          margin: 6px 0 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.7;
        }

        .rn-intent-message-preview {
          margin-top: 20px;
          padding: 15px;
          border: 1px solid var(--rn-border);
          border-radius: 11px;
          background: #f9fbfe;
        }

        .rn-intent-message-preview p {
          margin: 8px 0 0;
          color: #4b5d73;
          font-size: 13px;
          line-height: 1.8;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }

        .rn-intent-extra-note {
          margin-top: 15px;
        }

        .rn-intent-management-card {
          padding: clamp(22px, 3.5vw, 32px);
        }

        .rn-intent-management-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
        }

        .rn-intent-management-header h2 {
          margin: 12px 0 8px;
          color: var(--rn-navy);
          font-size: clamp(21px, 3vw, 27px);
          font-weight: 850;
          letter-spacing: -0.8px;
          line-height: 1.3;
        }

        .rn-intent-management-header p {
          max-width: 520px;
          margin: 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-intent-management-icon {
          display: flex;
          width: 40px;
          height: 40px;
          flex: 0 0 40px;
          align-items: center;
          justify-content: center;
          border: 1px solid #d8eff5;
          border-radius: 12px;
          background: #effafd;
          color: #087e9b;
          font-size: 20px;
          font-weight: 850;
        }

        .rn-intent-stat-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 11px;
          margin: 24px 0 30px;
        }

        .rn-intent-stat {
          display: grid;
          align-content: start;
          gap: 9px;
          min-width: 0;
          padding: 15px 13px;
          border: 1px solid #e4eaf1;
          border-radius: 13px;
          background: #f9fbfe;
        }

        .rn-intent-stat-pending {
          border-color: #f0e3bd;
          background: #fffcf3;
        }

        .rn-intent-stat-approved {
          border-color: #d6efe1;
          background: #f5fcf8;
        }

        .rn-intent-stat-label {
          color: #65768b;
          font-size: 10px;
          font-weight: 750;
          line-height: 1.6;
        }

        .rn-intent-stat strong {
          color: var(--rn-navy);
          font-size: 28px;
          font-weight: 900;
          line-height: 1;
        }

        .rn-intent-stat-caption {
          color: #8794a5;
          font-size: 9px;
          line-height: 1.6;
        }

        .rn-intent-interest-section {
          padding-top: 23px;
          border-top: 1px solid var(--rn-border);
        }

        .rn-intent-interest-heading {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-bottom: 17px;
        }

        .rn-intent-interest-heading h3 {
          margin: 0;
          color: var(--rn-navy);
          font-size: 16px;
          font-weight: 850;
        }

        .rn-intent-interest-heading > span {
          padding: 6px 9px;
          border-radius: 8px;
          background: #edf8fb;
          color: #087e9b;
          font-size: 10px;
          font-weight: 800;
        }

        .rn-intent-interest-list {
          display: grid;
          gap: 13px;
        }

        .rn-intent-interest {
          min-width: 0;
          padding: 17px;
          border: 1px solid var(--rn-border);
          border-radius: 13px;
          background: #fff;
        }

        .rn-intent-interest-top {
          display: flex;
          flex-wrap: wrap;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
        }

        .rn-intent-interest-person {
          display: flex;
          align-items: center;
          gap: 11px;
          min-width: 0;
        }

        .rn-intent-interest-avatar {
          width: 39px;
          height: 39px;
          flex-basis: 39px;
          border-radius: 11px;
        }

        .rn-intent-interest-person > div:last-child {
          min-width: 0;
        }

        .rn-intent-interest-person h4 {
          margin: 0 0 5px;
          color: var(--rn-navy);
          font-size: 13px;
          font-weight: 850;
          overflow-wrap: anywhere;
        }

        .rn-intent-interest-person .rn-intent-muted {
          font-size: 10px;
        }

        .rn-intent-interest-message {
          margin-top: 17px;
          padding: 13px;
          border-radius: 9px;
          background: #f7f9fc;
        }

        .rn-intent-interest-message p {
          margin: 0;
          color: #4b5d73;
          font-size: 12px;
          line-height: 1.8;
          overflow-wrap: anywhere;
          white-space: pre-wrap;
        }

        .rn-intent-interest-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          margin-top: 16px;
        }

        .rn-intent-interest-actions form {
          margin: 0;
        }

        .rn-intent-interest-note {
          margin-top: 15px;
          padding-top: 13px;
          border-top: 1px solid var(--rn-border);
          color: var(--rn-muted);
          font-size: 11px;
          line-height: 1.7;
        }

        .rn-intent-interest-note p {
          margin: 0;
        }

        .rn-intent-approved-note {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          color: #087653;
        }

        .rn-intent-approved-note p {
          flex: 1;
          min-width: 150px;
        }

        .rn-intent-approved-note > span {
          display: flex;
          width: 20px;
          height: 20px;
          flex: 0 0 20px;
          align-items: center;
          justify-content: center;
          border-radius: 50%;
          background: #e7f8ef;
          font-weight: 900;
        }

        .rn-intent-approved-note a {
          color: #087e9b;
          font-weight: 850;
          text-decoration: none;
        }

        .rn-intent-interest-summary {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          margin-top: 18px;
          color: #8794a5;
          font-size: 10px;
          font-weight: 700;
        }

        .rn-intent-summary-divider {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: #b6c1cf;
        }

        .rn-intent-management-footer {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 25px;
          padding-top: 21px;
          border-top: 1px solid var(--rn-border);
        }

        .rn-intent-empty {
          display: grid;
          justify-items: center;
          padding: 34px 16px;
          border: 1px dashed #d6e1ed;
          border-radius: 14px;
          background: #fbfcfe;
          text-align: center;
        }

        .rn-intent-empty-icon {
          display: flex;
          width: 47px;
          height: 47px;
          align-items: center;
          justify-content: center;
          border-radius: 15px;
          background: #e9f8fc;
          color: #087e9b;
          font-size: 25px;
          font-weight: 400;
        }

        .rn-intent-empty h3 {
          margin: 15px 0 7px;
          color: var(--rn-navy);
          font-size: 17px;
          font-weight: 850;
        }

        .rn-intent-empty p {
          max-width: 390px;
          margin: 0 0 18px;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.85;
        }

        @media (min-width: 1100px) {
          .rn-intent-sidebar {
            position: sticky;
            top: 24px;
          }
        }

        @media (max-width: 1000px) {
          .rn-intent-layout {
            grid-template-columns: minmax(0, 1fr) 275px;
            gap: 17px;
          }

          .rn-intent-sidebar-card,
          .rn-intent-sidebar-promo {
            padding: 19px;
          }

          .rn-intent-stat-grid {
            gap: 8px;
          }

          .rn-intent-stat {
            padding: 13px 10px;
          }
        }

        @media (max-width: 800px) {
          .rn-intent-page {
            padding: 26px 17px 55px;
          }

          .rn-intent-layout {
            grid-template-columns: minmax(0, 1fr);
          }

          .rn-intent-sidebar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            align-items: start;
          }

          .rn-intent-sidebar-card {
            grid-row: span 2;
          }

          .rn-intent-sidebar-promo {
            grid-column: 2;
          }

          .rn-intent-sidebar-messages {
            grid-column: 2;
          }
        }

        @media (max-width: 560px) {
          .rn-intent-page {
            padding: 20px 13px 42px;
          }

          .rn-intent-breadcrumb {
            margin-bottom: 22px;
          }

          .rn-intent-page-header {
            margin-bottom: 23px;
          }

          .rn-intent-page-header h1 {
            font-size: 31px;
            letter-spacing: -1px;
          }

          .rn-intent-page-header > p {
            font-size: 13px;
          }

          .rn-intent-main-column {
            gap: 16px;
          }

          .rn-intent-card {
            border-radius: 15px;
          }

          .rn-intent-primary-card,
          .rn-intent-response-card,
          .rn-intent-management-card {
            padding: 20px 16px;
          }

          .rn-intent-title {
            margin-top: 20px;
            font-size: 27px;
          }

          .rn-intent-description {
            font-size: 13px;
          }

          .rn-intent-metadata {
            display: grid;
            gap: 14px;
          }

          .rn-intent-card-footer {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-intent-sidebar {
            grid-template-columns: minmax(0, 1fr);
            gap: 14px;
          }

          .rn-intent-sidebar-card,
          .rn-intent-sidebar-promo,
          .rn-intent-sidebar-messages {
            grid-column: auto;
            grid-row: auto;
          }

          .rn-intent-stat-grid {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 7px;
          }

          .rn-intent-stat {
            padding: 12px 9px;
          }

          .rn-intent-stat-label {
            font-size: 9px;
          }

          .rn-intent-stat strong {
            font-size: 24px;
          }

          .rn-intent-stat-caption {
            font-size: 8px;
          }

          .rn-intent-management-header {
            gap: 10px;
          }

          .rn-intent-management-icon {
            width: 34px;
            height: 34px;
            flex-basis: 34px;
          }

          .rn-intent-management-header h2 {
            font-size: 22px;
          }

          .rn-intent-interest {
            padding: 13px;
          }

          .rn-intent-interest-top {
            align-items: flex-start;
          }

          .rn-intent-response-status-row {
            flex-direction: column;
          }

          .rn-intent-input-hint {
            flex-direction: column;
          }

          .rn-intent-management-footer {
            flex-direction: column;
          }

          .rn-intent-management-footer .rn-intent-button {
            width: 100%;
          }

          .rn-intent-community {
            padding: 12px;
          }

          .rn-intent-notice {
            padding: 17px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-intent-page *,
          .rn-intent-page *::before,
          .rn-intent-page *::after {
            scroll-behavior: auto !important;
            transition: none !important;
          }
        }
      `}</style>
    </main>
  );
}