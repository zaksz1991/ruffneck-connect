import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ApproveInterestButton from "./ApproveInterestButton";
import DeclineInterestButton from "./DeclineInterestButton";

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
      const { data: profiles, error: profilesError } = await supabase
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

  return (
    <main className="page-shell">
      <section className="section">
        <Link href="/intents" className="muted">
          ← Back to intentions
        </Link>

        <div className="section-heading">
          <div>
            <span className="eyebrow">
              RUFFNECK CONNECT ·{" "}
              {typeLabels[intent.intent_type].toUpperCase()}
            </span>

            <h1>Intention details</h1>

            <p className="muted">
              Explore the opportunity and connect with people who can
              help turn it into action.
            </p>
          </div>
        </div>

        <article className="feature-card intent-detail-card">
          <div className="card-topline">
            <span
              className={`intent-badge intent-${intent.intent_type}`}
            >
              {typeLabels[intent.intent_type]}
            </span>

            <span className={`status-badge status-${intent.status}`}>
              {formatStatus(intent.status)}
            </span>
          </div>

          <h1>{intent.title}</h1>

          <p className="muted">
            Posted by {authorName} · {formatDate(intent.created_at)}
          </p>

          <div className="intent-meta">
            {intent.category && <span>{intent.category}</span>}

            {intent.location_label && (
              <span>{intent.location_label}</span>
            )}
          </div>

          <div className="intent-full-description">
            {intent.description}
          </div>

          {community && (
            <div className="section">
              <p className="muted">
                Published in{" "}
                <Link href={`/communities/${community.slug}`}>
                  {community.name}
                </Link>
              </p>
            </div>
          )}

          {!isAuthor && !isActiveMember && (
            <div className="empty-state">
              <h3>Community membership required</h3>

              <p>
                You must be an active member of this community to
                respond to this intention.
              </p>

              {community && (
                <Link
                  className="button button-primary"
                  href={`/communities/${community.slug}`}
                >
                  View community
                </Link>
              )}
            </div>
          )}

          {isAuthor && (
            <section className="section">
              <div className="section-heading">
                <div>
                  <span className="eyebrow">YOUR OPPORTUNITY</span>

                  <h2>Responses to your intention</h2>

                  <p className="muted">
                    Review contributions and decide who to collaborate with.
                  </p>
                </div>
              </div>

              <div className="grid-3">
                <div className="feature-card">
                  <p className="muted">Total responses</p>
                  <h2>{interests.length}</h2>
                </div>

                <div className="feature-card">
                  <p className="muted">Awaiting review</p>
                  <h2>{pendingCount}</h2>
                </div>

                <div className="feature-card">
                  <p className="muted">Approved</p>
                  <h2>{approvedCount}</h2>
                </div>
              </div>

              {interests.length === 0 ? (
                <div className="empty-state">
                  <h3>No responses yet</h3>

                  <p>
                    Community members who want to contribute will appear
                    here when they express interest.
                  </p>
                </div>
              ) : (
                <div className="grid-2">
                  {interests.map((interest) => (
                    <article
                      className="feature-card"
                      key={interest.id}
                    >
                      <div className="card-topline">
                        <h3>
                          {memberNames.get(interest.user_id) ??
                            "Community member"}
                        </h3>

                        <span
                          className={`status-badge status-${interest.status}`}
                        >
                          {formatStatus(interest.status)}
                        </span>
                      </div>

                      {interest.message ? (
                        <p>{interest.message}</p>
                      ) : (
                        <p className="muted">
                          No additional message provided.
                        </p>
                      )}

                      <p className="muted">
                        Received {formatDate(interest.created_at)}
                      </p>

                      {interest.status === "pending" &&
                        intent.status === "open" && (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 10,
                              alignItems: "center",
                              marginTop: 16,
                            }}
                          >
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
                        <p className="muted">
                          This interest has been approved. An
                          intention-linked conversation can be accessed
                          from Messages.
                        </p>
                      )}

                      {interest.status === "declined" && (
                        <p className="muted">
                          This interest request was declined.
                        </p>
                      )}

                      {interest.status === "withdrawn" && (
                        <p className="muted">
                          This interest request was withdrawn.
                        </p>
                      )}
                    </article>
                  ))}
                </div>
              )}
            </section>
          )}

          {!isAuthor &&
            isActiveMember &&
            intent.status === "open" && (
              <section className="section">
                {existingInterest &&
                existingInterest.status !== "withdrawn" ? (
                  <div className="empty-state">
                    <h3>Interest already submitted</h3>

                    <p>
                      Your response status is{" "}
                      <strong>
                        {formatStatus(existingInterest.status)}
                      </strong>
                      .
                    </p>

                    {existingInterest.message && (
                      <p>{existingInterest.message}</p>
                    )}

                    {existingInterest.status === "approved" && (
                      <Link
                        className="button button-primary"
                        href="/messages"
                      >
                        Open messages
                      </Link>
                    )}
                  </div>
                ) : (
                  <form
                    action={`/api/intents/${intent.id}/interest`}
                    method="post"
                    className="intent-form"
                  >
                    <span className="eyebrow">TAKE ACTION</span>

                    <h2>Express your interest</h2>

                    <p className="muted">
                      Explain how you can help, what you can contribute,
                      or how you would like to collaborate.
                    </p>

                    <div className="form-group">
                      <label htmlFor="message">
                        Your message (optional)
                      </label>

                      <textarea
                        id="message"
                        name="message"
                        rows={5}
                        maxLength={1500}
                        placeholder="Explain what you can contribute or how you would like to collaborate."
                      />

                      <small>
                        Maximum 1,500 characters.
                      </small>
                    </div>

                    <button
                      className="button button-primary"
                      type="submit"
                    >
                      Submit interest
                    </button>
                  </form>
                )}
              </section>
            )}

          {!isAuthor &&
            isActiveMember &&
            intent.status !== "open" && (
              <div className="empty-state">
                <h3>Responses are closed</h3>

                <p>
                  This intention is currently{" "}
                  {formatStatus(intent.status)} and is no longer
                  accepting new responses.
                </p>
              </div>
            )}

          {isAuthor && (
            <div className="hero-actions">
              <Link
                className="button button-secondary"
                href="/intents"
              >
                Back to discovery
              </Link>

              <Link
                className="button button-secondary"
                href="/messages"
              >
                Open messages
              </Link>
            </div>
          )}
        </article>
      </section>
    </main>
  );
}