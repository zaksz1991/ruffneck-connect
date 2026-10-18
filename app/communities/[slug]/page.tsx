import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import CommunityMembershipRequests from "./CommunityMembershipRequests";
import CommunityActivityLog from "./CommunityActivityLog";
import CommunityShareButton from "./CommunityShareButton";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams?: Promise<{
    member_success?: string;
    member_error?: string;
  }>;
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

type CommunityMember = {
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
};

type MemberProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
  show_in_directory: boolean;
};

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(value));
}

const MEMBER_SUCCESS_MESSAGES: Record<string, string> = {
  added: "The member was added to the community.",
  removed: "The member was removed from the community.",
  role_updated: "The member's role was updated successfully.",
};

const MEMBER_ERROR_MESSAGES: Record<string, string> = {
  select_user: "Select a user before adding a member.",
  already_member: "You cannot add yourself as a member.",
  user_unavailable: "That user is unavailable in the public directory.",
  add_failed: "The member could not be added. Check your permissions and try again.",
  invalid_target: "The selected member cannot be removed.",
  remove_failed: "The member could not be removed. Check your permissions and try again.",
  invalid_role_change: "The requested role change is invalid.",
  role_change_failed: "The role could not be changed. Only the community owner can change member roles.",
};

export default async function CommunityDetailsPage({
  params,
  searchParams,
}: PageProps) {
  const { slug } = await params;
  const query = searchParams ? await searchParams : {};
  const memberSuccessMessage = query.member_success
    ? MEMBER_SUCCESS_MESSAGES[query.member_success]
    : undefined;
  const memberErrorMessage = query.member_error
    ? MEMBER_ERROR_MESSAGES[query.member_error]
    : undefined;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?next=${encodeURIComponent(`/communities/${slug}`)}`);
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

  const isModerator = isMember && membership?.role === "moderator";

  const canManageMembers = isOwner || isModerator;

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

  // Retrieve active members and their visible profile information.
  let members: CommunityMember[] = [];
  let memberProfiles: MemberProfile[] = [];

  if (isMember || isOwner) {
    const { data: memberData } = await supabase
      .from("community_members")
      .select("user_id, role, status, joined_at")
      .eq("community_id", community.id)
      .eq("status", "active")
      .order("joined_at", { ascending: true });

    members = (memberData ?? []) as CommunityMember[];

    const memberIds = [
      ...new Set([
        community.owner_id,
        ...members.map((member) => member.user_id),
      ]),
    ];

    if (memberIds.length > 0) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url, show_in_directory")
        .in("id", memberIds);

      memberProfiles = (profiles ?? []) as MemberProfile[];
    }
  }

  // Only owners and active moderators can load candidates for the add form.
  let availableProfiles: MemberProfile[] = [];

  if (canManageMembers) {
    const existingIds = new Set([
      community.owner_id,
      ...members.map((member) => member.user_id),
    ]);

    const { data: directoryProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url, show_in_directory")
      .eq("show_in_directory", true)
      .order("full_name", { ascending: true })
      .limit(200);

    availableProfiles = ((directoryProfiles ?? []) as MemberProfile[]).filter(
      (candidate) => !existingIds.has(candidate.id)
    );
  }

  const profileById = new Map(
    memberProfiles.map((memberProfile) => [
      memberProfile.id,
      memberProfile,
    ])
  );

  const communityPath = `/communities/${community.slug}`;

  async function addMember(formData: FormData) {
    "use server";

    const serverSupabase = await createClient();

    const {
      data: { user: actor },
    } = await serverSupabase.auth.getUser();

    if (!actor) {
      redirect(`/login?next=${encodeURIComponent(communityPath)}`);
    }

    const { data: currentCommunity } = await serverSupabase
      .from("communities")
      .select("id, owner_id, slug")
      .eq("id", community.id)
      .maybeSingle();

    if (!currentCommunity) {
      redirect("/communities");
    }

    if (currentCommunity.owner_id !== actor.id) {
      const { data: actorMembership } = await serverSupabase
        .from("community_members")
        .select("role, status")
        .eq("community_id", community.id)
        .eq("user_id", actor.id)
        .maybeSingle();

      if (
        actorMembership?.role !== "moderator" ||
        actorMembership.status !== "active"
      ) {
        throw new Error("You are not authorized to manage this community.");
      }
    }

    const targetUserId = String(formData.get("user_id") ?? "").trim();

    if (!targetUserId) {
      redirect(`${communityPath}?member_error=select_user`);
    }

    if (targetUserId === actor.id) {
      redirect(`${communityPath}?member_error=already_member`);
    }

    const { data: candidate } = await serverSupabase
      .from("profiles")
      .select("id, show_in_directory")
      .eq("id", targetUserId)
      .eq("show_in_directory", true)
      .maybeSingle();

    if (!candidate) {
      redirect(`${communityPath}?member_error=user_unavailable`);
    }

    const { error: addError } = await serverSupabase.rpc(
      "admin_add_community_member",
      {
        p_community_id: community.id,
        p_user_id: targetUserId,
      }
    );

    if (addError) {
      console.error("Add community member failed:", addError.message);
      redirect(`${communityPath}?member_error=add_failed`);
    }

    revalidatePath(communityPath);
    redirect(`${communityPath}?member_success=added`);
  }

  async function removeMember(formData: FormData) {
    "use server";

    const serverSupabase = await createClient();

    const {
      data: { user: actor },
    } = await serverSupabase.auth.getUser();

    if (!actor) {
      redirect(`/login?next=${encodeURIComponent(communityPath)}`);
    }

    const { data: currentCommunity } = await serverSupabase
      .from("communities")
      .select("id, owner_id")
      .eq("id", community.id)
      .maybeSingle();

    if (!currentCommunity) {
      redirect("/communities");
    }

    if (currentCommunity.owner_id !== actor.id) {
      const { data: actorMembership } = await serverSupabase
        .from("community_members")
        .select("role, status")
        .eq("community_id", community.id)
        .eq("user_id", actor.id)
        .maybeSingle();

      if (
        actorMembership?.role !== "moderator" ||
        actorMembership.status !== "active"
      ) {
        throw new Error("You are not authorized to manage this community.");
      }
    }

    const targetUserId = String(formData.get("user_id") ?? "").trim();

    if (!targetUserId || targetUserId === currentCommunity.owner_id) {
      redirect(`${communityPath}?member_error=invalid_target`);
    }

    const { error: removeError } = await serverSupabase.rpc(
      "admin_remove_community_member",
      {
        p_community_id: community.id,
        p_user_id: targetUserId,
      }
    );

    if (removeError) {
      console.error("Remove community member failed:", removeError.message);
      redirect(`${communityPath}?member_error=remove_failed`);
    }

    revalidatePath(communityPath);
    redirect(`${communityPath}?member_success=removed`);
  }

  async function setMemberRole(formData: FormData) {
    "use server";

    const serverSupabase = await createClient();

    const {
      data: { user: actor },
    } = await serverSupabase.auth.getUser();

    if (!actor) {
      redirect(`/login?next=${encodeURIComponent(communityPath)}`);
    }

    const targetUserId = String(formData.get("user_id") ?? "").trim();
    const newRole = String(formData.get("new_role") ?? "").trim();

    if (
      !targetUserId ||
      targetUserId === actor.id ||
      !["member", "moderator"].includes(newRole)
    ) {
      redirect(`${communityPath}?member_error=invalid_role_change`);
    }

    const { error: roleError } = await serverSupabase.rpc(
      "admin_set_community_member_role",
      {
        p_community_id: community.id,
        p_user_id: targetUserId,
        p_new_role: newRole,
      }
    );

    if (roleError) {
      console.error("Change community member role failed:", roleError.message);
      redirect(`${communityPath}?member_error=role_change_failed`);
    }

    revalidatePath(communityPath);
    redirect(`${communityPath}?member_success=role_updated`);
  }

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
                href="/intents/new?type=need"
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

            {community.visibility === "public" && (
              <CommunityShareButton
                slug={community.slug}
                name={community.name}
              />
            )}
          </div>
        </div>
      </section>

      {(memberSuccessMessage || memberErrorMessage) && (
        <section className="section" aria-live="polite">
          {memberSuccessMessage && (
            <article className="feature-card" role="status">
              <p className="status-badge status-active">{memberSuccessMessage}</p>
            </article>
          )}
          {memberErrorMessage && (
            <article className="feature-card" role="alert">
              <p>{memberErrorMessage}</p>
            </article>
          )}
        </section>
      )}

      {canManageMembers && (
        <>
          <CommunityMembershipRequests communityId={community.id} />
          <CommunityActivityLog communityId={community.id} />
        </>
      )}

      {(isMember || isOwner) && (
        <section className="section">
          <div className="section-heading">
            <div>
              <span className="eyebrow">YOUR NETWORK</span>
              <h2>Community members</h2>
              <p className="muted">
                Meet the people in {community.name}.
              </p>
            </div>

            <span className="status-badge status-active">
              {memberCount ?? 0} active members
            </span>
          </div>

          <div className="member-management-grid">
            <div className="member-list">
              {members.length === 0 ? (
                <article className="feature-card">
                  <h3>No active members yet</h3>
                  <p>Community members will appear here.</p>
                </article>
              ) : (
                members.map((member) => {
                  const memberProfile = profileById.get(member.user_id);
                  const isTargetOwner = member.user_id === community.owner_id;
                  const displayName =
                    memberProfile?.full_name ||
                    (isTargetOwner ? ownerName : "RuffNeck member");

                  return (
                    <article
                      className="feature-card member-card"
                      key={member.user_id}
                    >
                      <div className="member-card-profile">
                        {memberProfile?.avatar_url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            className="member-avatar"
                            src={memberProfile.avatar_url}
                            alt=""
                          />
                        ) : (
                          <div className="member-avatar member-avatar-fallback">
                            {displayName.charAt(0).toUpperCase()}
                          </div>
                        )}

                        <div className="member-details">
                          <h3>{displayName}</h3>
                          <p className="muted">
                            Joined {formatDate(member.joined_at)}
                          </p>

                          <span className={`member-role role-${member.role}`}>
                            {member.role}
                          </span>
                        </div>
                      </div>

                      {canManageMembers &&
                        !isTargetOwner &&
                        (isOwner || member.role === "member") && (
                          <form action={removeMember}>
                            <input
                              type="hidden"
                              name="user_id"
                              value={member.user_id}
                            />

                            <button
                              className="button button-secondary"
                              type="submit"
                            >
                              Remove member
                            </button>
                          </form>
                        )}

                      {isOwner &&
                        !isTargetOwner &&
                        (member.role === "member" ||
                          member.role === "moderator") && (
                          <form action={setMemberRole}>
                            <input
                              type="hidden"
                              name="user_id"
                              value={member.user_id}
                            />
                            <input
                              type="hidden"
                              name="new_role"
                              value={
                                member.role === "moderator"
                                  ? "member"
                                  : "moderator"
                              }
                            />
                            <button
                              className="button button-secondary"
                              type="submit"
                            >
                              {member.role === "moderator"
                                ? "Demote to member"
                                : "Promote to moderator"}
                            </button>
                          </form>
                        )}
                    </article>
                  );
                })
              )}
            </div>

            {canManageMembers && (
              <aside className="feature-card add-member-panel">
                <span className="eyebrow">ADMINISTRATION</span>
                <h3>Add a member</h3>

                <p className="muted">
                  Select an existing user who has chosen to appear in the
                  public member directory.
                </p>

                {availableProfiles.length === 0 ? (
                  <p className="muted">
                    No eligible directory users are available to add right now.
                  </p>
                ) : (
                  <form action={addMember} className="add-member-form">
                    <label htmlFor="community-user-id">
                      Select a member
                    </label>

                    <select
                      id="community-user-id"
                      name="user_id"
                      required
                      defaultValue=""
                    >
                      <option value="" disabled>
                        Choose a user
                      </option>

                      {availableProfiles.map((candidate) => (
                        <option key={candidate.id} value={candidate.id}>
                          {candidate.full_name || "RuffNeck member"}
                        </option>
                      ))}
                    </select>

                    <button
                      className="button button-primary"
                      type="submit"
                    >
                      Add to community
                    </button>
                  </form>
                )}

                <p className="muted member-permission-note">
                  Owners and active moderators can add members. Only owners
                  can remove moderators.
                </p>
              </aside>
            )}
          </div>
        </section>
      )}

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
              <strong>Category:</strong> {community.category || "General"}
            </p>

            <p>
              <strong>Location:</strong> {" "}
              {community.location_label || "Not specified"}
            </p>

            <p>
              <strong>Membership:</strong> {" "}
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
              <p>
                Be the first to share an opportunity with this community.
              </p>
            </div>
          ) : (
            <div className="grid-3">
              {intents.map((intent) => (
                <article className="feature-card" key={intent.id}>
                  <span className={`intent-badge intent-${intent.intent_type}`}>
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
