import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import CommunityMembershipRequests from "./CommunityMembershipRequests";
import CommunityActivityLog from "./CommunityActivityLog";
import CommunityShareButton from "./CommunityShareButton";
import CommunityInvitationCard from "./CommunityInvitationCard";
import CommunityEvents from "./CommunityEvents";
import CommunityManagementControls from "./CommunityManagementControls";

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
  email: string | null;
  avatar_url: string | null;
  show_in_directory: boolean;
};

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
}

function formatProfileOption(profile: MemberProfile) {
  const name = profile.full_name?.trim() || "RuffNeck member";
  const email = profile.email?.trim();

  return email ? `${name} — ${email}` : name;
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "RN"
  );
}

function getAvatarDisplayUrl(value: string | null): string {
  if (!value) return "";

  try {
    const url = new URL(value);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return "";
    }

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
      )}&sz=w400`;
    }

    return url.toString();
  } catch {
    return "";
  }
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
  add_failed:
    "The member could not be added. Check your permissions and try again.",
  invalid_target: "The selected member cannot be removed.",
  remove_failed:
    "The member could not be removed. Check your permissions and try again.",
  invalid_role_change: "The requested role change is invalid.",
  role_change_failed:
    "The role could not be changed. Only the community owner can change member roles.",
  join_failed:
    "We couldn't submit your membership request. Please refresh and try again.",
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

  const { data: ownerProfile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", community.owner_id)
    .maybeSingle();

  const ownerName = ownerProfile?.full_name || "Community owner";

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
        .select("id, full_name, email, avatar_url, show_in_directory")
        .in("id", memberIds);

      memberProfiles = (profiles ?? []) as MemberProfile[];
    }
  }

  let availableProfiles: MemberProfile[] = [];

  if (canManageMembers) {
    const existingIds = new Set([
      community.owner_id,
      ...members.map((member) => member.user_id),
    ]);

    const { data: directoryProfiles } = await supabase
      .from("profiles")
      .select("id, full_name, email, avatar_url, show_in_directory")
      .eq("show_in_directory", true)
      .order("full_name", { ascending: true })
      .limit(200);

    const seenIds = new Set<string>();

    availableProfiles = (
      (directoryProfiles ?? []) as MemberProfile[]
    ).filter((candidate) => {
      if (existingIds.has(candidate.id) || seenIds.has(candidate.id)) {
        return false;
      }

      seenIds.add(candidate.id);
      return true;
    });
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

    const { data: currentCommunity } = await serverSupabase
      .from("communities")
      .select("id, owner_id")
      .eq("id", community.id)
      .maybeSingle();

    if (!currentCommunity || currentCommunity.owner_id !== actor.id) {
      redirect(`${communityPath}?member_error=role_change_failed`);
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
    <main className="rn-community-page">
      <div className="rn-community-container">
        <nav className="rn-breadcrumb" aria-label="Breadcrumb">
          <Link href="/communities">Communities</Link>
          <span aria-hidden="true">/</span>
          <span>{community.name}</span>
        </nav>

        <section className="rn-community-hero">
          <div className="rn-hero-decoration rn-hero-decoration-one" />
          <div className="rn-hero-decoration rn-hero-decoration-two" />

          <div className="rn-community-hero-content">
            <div className="rn-hero-topline">
              <span className="rn-category-label">
                <span className="rn-category-dot" />
                {community.category || "Community"}
              </span>

              <span
                className={`rn-visibility-badge ${
                  community.visibility === "private"
                    ? "rn-visibility-private"
                    : "rn-visibility-public"
                }`}
              >
                {community.visibility === "public"
                  ? "Public community"
                  : "Private community"}
              </span>
            </div>

            <h1>{community.name}</h1>

            <p className="rn-community-description">
              {community.description ||
                "A community for people to connect, share opportunities, and take action."}
            </p>

            <div className="rn-community-meta">
              {community.location_label && (
                <span>
                  <span className="rn-meta-icon" aria-hidden="true">
                    ◉
                  </span>
                  {community.location_label}
                </span>
              )}

              <span>
                <span className="rn-meta-icon" aria-hidden="true">
                  ◎
                </span>
                {memberCount ?? 0} active members
              </span>

              <span>
                <span className="rn-meta-icon" aria-hidden="true">
                  ◷
                </span>
                Created {formatDate(community.created_at)}
              </span>
            </div>

            <div className="rn-hero-actions">
              {isMember && (
                <Link
                  className="rn-button rn-button-gold"
                  href="/intents/new?type=need"
                >
                  Publish an intention
                  <span aria-hidden="true">↗</span>
                </Link>
              )}

              {!isMember && !isPending && !isOwner && (
                <form
                  action={`/api/communities/${community.id}/join`}
                  method="post"
                >
                  <button
                    className="rn-button rn-button-gold"
                    type="submit"
                  >
                    {community.join_approval_required
                      ? "Request to join"
                      : "Join community"}
                    <span aria-hidden="true">↗</span>
                  </button>
                </form>
              )}

              {isPending && (
                <span className="rn-status-pill rn-status-pending">
                  <span className="rn-status-dot" />
                  Membership awaiting approval
                </span>
              )}

              {isMember && (
                <span className="rn-status-pill rn-status-active">
                  <span className="rn-status-dot" />
                  You are a member
                </span>
              )}

              {isOwner && (
                <span className="rn-status-pill rn-status-owner">
                  <span className="rn-status-dot" />
                  Community owner
                </span>
              )}

              <Link
                className="rn-button rn-button-outline"
                href="/communities"
              >
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

          <div className="rn-hero-side" aria-hidden="true">
            <div className="rn-orbit rn-orbit-outer" />
            <div className="rn-orbit rn-orbit-inner" />
            <div className="rn-orbit-core">
              <span>RN</span>
            </div>
            <span className="rn-orbit-node rn-orbit-node-one">+</span>
            <span className="rn-orbit-node rn-orbit-node-two">↗</span>
            <span className="rn-orbit-node rn-orbit-node-three">◎</span>
          </div>
        </section>

        <section className="rn-community-stats" aria-label="Community overview">
          <article className="rn-stat-card">
            <span className="rn-stat-icon rn-stat-icon-cyan">◎</span>
            <div>
              <span className="rn-stat-label">Community members</span>
              <strong>{memberCount ?? 0}</strong>
              <span className="rn-stat-caption">Active participants</span>
            </div>
          </article>

          <article className="rn-stat-card">
            <span className="rn-stat-icon rn-stat-icon-gold">↗</span>
            <div>
              <span className="rn-stat-label">Open intentions</span>
              <strong>{isMember || isOwner ? intents.length : "—"}</strong>
              <span className="rn-stat-caption">
                {isMember || isOwner
                  ? "Needs, offers and projects"
                  : "Join to discover opportunities"}
              </span>
            </div>
          </article>

          <article className="rn-stat-card">
            <span className="rn-stat-icon rn-stat-icon-navy">◇</span>
            <div>
              <span className="rn-stat-label">Membership</span>
              <strong className="rn-stat-text">
                {isOwner
                  ? "Owner"
                  : isMember
                    ? "Active"
                    : isPending
                      ? "Pending"
                      : "Visitor"}
              </strong>
              <span className="rn-stat-caption">
                {isOwner
                  ? "You manage this community"
                  : isMember
                    ? "You can participate"
                    : isPending
                      ? "Awaiting a decision"
                      : community.join_approval_required
                        ? "Approval required to join"
                        : "Open membership"}
              </span>
            </div>
          </article>
        </section>

        {(memberSuccessMessage || memberErrorMessage) && (
          <section className="rn-feedback-section" aria-live="polite">
            {memberSuccessMessage && (
              <div className="rn-feedback rn-feedback-success" role="status">
                <span aria-hidden="true">✓</span>
                <p>{memberSuccessMessage}</p>
              </div>
            )}

            {memberErrorMessage && (
              <div className="rn-feedback rn-feedback-error" role="alert">
                <span aria-hidden="true">!</span>
                <p>{memberErrorMessage}</p>
              </div>
            )}
          </section>
        )}

        {isOwner && (
          <section className="rn-management-section">
            <div className="rn-section-intro">
              <span className="rn-section-kicker">COMMUNITY SETTINGS</span>
              <h2>Manage your community</h2>
              <p>
                Keep your community information, membership rules and settings
                up to date.
              </p>
            </div>

            <CommunityManagementControls
              community={{
                id: community.id,
                slug: community.slug,
                name: community.name,
                description: community.description,
                category: community.category,
                location_label: community.location_label,
                visibility: community.visibility,
                join_approval_required: community.join_approval_required,
              }}
            />
          </section>
        )}

        {canManageMembers && (
          <section className="rn-management-section">
            <div className="rn-section-intro">
              <span className="rn-section-kicker">MODERATION</span>
              <h2>Community administration</h2>
              <p>
                Review membership activity and keep track of important
                community changes.
              </p>
            </div>

            <div className="rn-management-grid">
              <div className="rn-management-panel">
                <CommunityMembershipRequests communityId={community.id} />
              </div>

              <div className="rn-management-panel">
                <CommunityActivityLog communityId={community.id} />
              </div>
            </div>
          </section>
        )}

        {community.visibility === "public" && (isMember || isOwner) && (
          <section className="rn-community-feature-section">
            <div className="rn-section-intro">
              <span className="rn-section-kicker">GROW YOUR NETWORK</span>
              <h2>Bring people together</h2>
              <p>
                Introduce others to this community and invite them to
                participate.
              </p>
            </div>

            <CommunityInvitationCard
              slug={community.slug}
              name={community.name}
              description={community.description}
              category={community.category}
              locationLabel={community.location_label}
            />
          </section>
        )}

        {(isMember || isOwner) && (
          <section className="rn-community-feature-section">
            <div className="rn-section-heading">
              <div className="rn-section-intro">
                <span className="rn-section-kicker">MEET AND COLLABORATE</span>
                <h2>Community events</h2>
                <p>
                  Discover gatherings, activities and opportunities to
                  participate with other members.
                </p>
              </div>
              <span className="rn-section-symbol" aria-hidden="true">
                ◷
              </span>
            </div>

            <div className="rn-content-panel">
              <CommunityEvents
                communityId={community.id}
                canManage={canManageMembers}
                canRsvp={isMember || isOwner}
              />
            </div>
          </section>
        )}

        {(isMember || isOwner) && (
          <section className="rn-community-feature-section">
            <div className="rn-section-heading">
              <div className="rn-section-intro">
                <span className="rn-section-kicker">YOUR NETWORK</span>
                <h2>Community members</h2>
                <p>
                  Meet the people in {community.name} and explore their
                  profiles.
                </p>
              </div>

              <span className="rn-count-badge">
                {memberCount ?? 0} active members
              </span>
            </div>

            <div className="rn-member-management-grid">
              <div className="rn-member-list">
                {members.length === 0 ? (
                  <div className="rn-empty-card">
                    <span className="rn-empty-icon" aria-hidden="true">
                      ◎
                    </span>
                    <h3>No active members yet</h3>
                    <p>
                      Community members will appear here when they join.
                    </p>
                  </div>
                ) : (
                  members.map((member) => {
                    const memberProfile = profileById.get(member.user_id);
                    const isTargetOwner =
                      member.user_id === community.owner_id;

                    const displayName =
                      memberProfile?.full_name?.trim() ||
                      (isTargetOwner ? ownerName : "RuffNeck member");

                    const avatarUrl = getAvatarDisplayUrl(
                      memberProfile?.avatar_url ?? null
                    );

                    return (
                      <article
                        className="rn-member-card"
                        key={member.user_id}
                      >
                        <div className="rn-member-main">
                          {avatarUrl ? (
                            <Image
                              className="rn-member-avatar"
                              src={avatarUrl}
                              alt={`${displayName}'s profile photo`}
                              width={64}
                              height={64}
                              unoptimized
                            />
                          ) : (
                            <div
                              className="rn-member-avatar rn-member-avatar-fallback"
                              aria-label={`${displayName}'s initials`}
                            >
                              {getInitials(displayName)}
                            </div>
                          )}

                          <div className="rn-member-details">
                            <div className="rn-member-name-row">
                              <h3>{displayName}</h3>

                              {isTargetOwner && (
                                <span className="rn-role-badge rn-role-owner">
                                  Owner
                                </span>
                              )}
                            </div>

                            <p className="rn-member-joined">
                              Joined {formatDate(member.joined_at)}
                            </p>

                            {!isTargetOwner && (
                              <span
                                className={`rn-role-badge ${
                                  member.role === "moderator"
                                    ? "rn-role-moderator"
                                    : "rn-role-member"
                                }`}
                              >
                                {member.role === "moderator"
                                  ? "Moderator"
                                  : "Member"}
                              </span>
                            )}

                            {memberProfile?.show_in_directory !== false && (
                              <Link
                                href={`/members/${member.user_id}`}
                                className="rn-member-profile-link"
                              >
                                View member profile <span>↗</span>
                              </Link>
                            )}
                          </div>
                        </div>

                        <div className="rn-member-actions">
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
                                  className="rn-button rn-button-danger"
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
                                  className="rn-button rn-button-small"
                                  type="submit"
                                >
                                  {member.role === "moderator"
                                    ? "Demote to member"
                                    : "Promote to moderator"}
                                </button>
                              </form>
                            )}
                        </div>
                      </article>
                    );
                  })
                )}
              </div>

              {canManageMembers && (
                <aside className="rn-add-member-card">
                  <div className="rn-add-member-icon" aria-hidden="true">
                    +
                  </div>

                  <span className="rn-section-kicker">ADMINISTRATION</span>
                  <h3>Add a member</h3>

                  <p>
                    Invite an existing RuffNeck Connect user who has chosen to
                    appear in the public member directory.
                  </p>

                  {availableProfiles.length === 0 ? (
                    <div className="rn-no-profiles">
                      No eligible directory users are available to add right
                      now.
                    </div>
                  ) : (
                    <form action={addMember} className="rn-add-member-form">
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
                            {formatProfileOption(candidate)}
                          </option>
                        ))}
                      </select>

                      <button
                        className="rn-button rn-button-primary rn-button-full"
                        type="submit"
                      >
                        Add to community <span>↗</span>
                      </button>
                    </form>
                  )}

                  <div className="rn-permission-note">
                    <strong>Permissions</strong>
                    <p>
                      Owners and active moderators can add members. Only
                      owners can change member roles.
                    </p>
                  </div>
                </aside>
              )}
            </div>
          </section>
        )}

        <section className="rn-community-feature-section">
          <div className="rn-section-intro">
            <span className="rn-section-kicker">GET TO KNOW US</span>
            <h2>Community information</h2>
            <p>
              Learn more about the people, purpose and membership rules behind
              this community.
            </p>
          </div>

          <div className="rn-information-grid">
            <article className="rn-information-card">
              <div className="rn-information-heading">
                <span className="rn-information-icon" aria-hidden="true">
                  ◈
                </span>
                <h3>Community details</h3>
              </div>

              <dl className="rn-details-list">
                <div>
                  <dt>Created by</dt>
                  <dd>{ownerName}</dd>
                </div>

                <div>
                  <dt>Created</dt>
                  <dd>{formatDate(community.created_at)}</dd>
                </div>

                <div>
                  <dt>Category</dt>
                  <dd>{community.category || "General"}</dd>
                </div>

                <div>
                  <dt>Location</dt>
                  <dd>{community.location_label || "Not specified"}</dd>
                </div>

                <div>
                  <dt>Visibility</dt>
                  <dd>
                    {community.visibility === "public" ? "Public" : "Private"}
                  </dd>
                </div>

                <div>
                  <dt>Membership</dt>
                  <dd>
                    {community.join_approval_required
                      ? "Approval required"
                      : "Open to join"}
                  </dd>
                </div>
              </dl>
            </article>

            <article className="rn-information-card rn-purpose-card">
              <span className="rn-purpose-decoration" aria-hidden="true">
                RN
              </span>

              <div className="rn-information-heading">
                <span className="rn-information-icon" aria-hidden="true">
                  ✳
                </span>
                <h3>Community purpose</h3>
              </div>

              <p>
                RuffNeck Connect communities bring people together to exchange
                ideas, identify needs, contribute skills and resources, and
                develop useful projects.
              </p>

              <div className="rn-purpose-points">
                <div>
                  <span>01</span>
                  <p>Share needs and opportunities.</p>
                </div>
                <div>
                  <span>02</span>
                  <p>Connect with people who can contribute.</p>
                </div>
                <div>
                  <span>03</span>
                  <p>Turn shared intentions into action.</p>
                </div>
              </div>

              {!isMember && !isOwner && (
                <p className="rn-join-hint">
                  Join this community to participate in its intentions and
                  member activities.
                </p>
              )}
            </article>
          </div>
        </section>

        {(isMember || isOwner) && (
          <section className="rn-community-feature-section rn-intentions-section">
            <div className="rn-section-heading">
              <div className="rn-section-intro">
                <span className="rn-section-kicker">
                  NEED · OFFER · BUILD
                </span>
                <h2>Open intentions</h2>
                <p>
                  Recent needs, offers and projects shared by this community.
                </p>
              </div>

              <Link
                className="rn-button rn-button-primary"
                href="/intents/new?type=need"
              >
                Create intention <span>↗</span>
              </Link>
            </div>

            {intents.length === 0 ? (
              <div className="rn-empty-card rn-intentions-empty">
                <span className="rn-empty-icon" aria-hidden="true">
                  ↗
                </span>
                <h3>No open intentions yet</h3>
                <p>
                  Be the first to share a need, offer your skills or propose a
                  project for this community.
                </p>
                <Link
                  className="rn-button rn-button-primary"
                  href="/intents/new?type=need"
                >
                  Share the first intention
                </Link>
              </div>
            ) : (
              <div className="rn-intentions-grid">
                {intents.map((intent) => (
                  <article className="rn-intention-card" key={intent.id}>
                    <div className="rn-intention-topline">
                      <span
                        className={`rn-intent-type rn-intent-${intent.intent_type}`}
                      >
                        {intent.intent_type === "need"
                          ? "NEED"
                          : intent.intent_type === "offer"
                            ? "OFFER"
                            : "BUILD"}
                      </span>

                      <span className="rn-intention-date">
                        {formatDate(intent.created_at)}
                      </span>
                    </div>

                    <h3>{intent.title}</h3>

                    <p className="rn-intention-description">
                      {intent.description.length > 180
                        ? `${intent.description.slice(0, 180).trim()}…`
                        : intent.description}
                    </p>

                    {intent.category && (
                      <span className="rn-intention-category">
                        {intent.category}
                      </span>
                    )}

                    <div className="rn-intention-footer">
                      <span className="rn-intention-status">
                        {intent.status.replace(/_/g, " ")}
                      </span>

                      <Link
                        className="rn-intention-link"
                        href={`/intents/${intent.id}`}
                      >
                        View intention <span>↗</span>
                      </Link>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </section>
        )}

        <section className="rn-bottom-cta">
          <div className="rn-bottom-cta-content">
            <span className="rn-section-kicker">RUFFNECK CONNECT</span>
            <h2>Meaningful connections. Practical action.</h2>
            <p>
              Discover more communities, meet new people and find opportunities
              to collaborate.
            </p>
          </div>

          <div className="rn-bottom-cta-actions">
            <Link
              className="rn-button rn-button-gold"
              href="/communities"
            >
              Explore communities <span>↗</span>
            </Link>

            <Link
              className="rn-button rn-button-outline"
              href="/members"
            >
              Discover members
            </Link>
          </div>
        </section>

        <footer className="rn-community-footer">
          <Link href="/communities">← Back to all communities</Link>
          <span>Connect with purpose. Build with people.</span>
        </footer>
      </div>

      <style>{`
        .rn-community-page {
          --rn-navy: #0b1e3a;
          --rn-navy-soft: #132d50;
          --rn-cyan: #00b4d8;
          --rn-gold: #fbbf24;
          --rn-ink: #182b43;
          --rn-muted: #68788c;
          --rn-border: #e3eaf1;
          --rn-surface: #ffffff;
          --rn-background: #f4f7fb;
          min-height: 100vh;
          padding: 30px 24px 50px;
          color: var(--rn-ink);
          background:
            radial-gradient(
              circle at 8% 10%,
              rgba(0, 180, 216, 0.055),
              transparent 24%
            ),
            var(--rn-background);
        }

        .rn-community-page *,
        .rn-community-page *::before,
        .rn-community-page *::after {
          box-sizing: border-box;
        }

        .rn-community-container {
          width: 100%;
          max-width: 1240px;
          margin: 0 auto;
        }

        .rn-breadcrumb {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-bottom: 22px;
          color: var(--rn-muted);
          font-size: 13px;
        }

        .rn-breadcrumb a {
          color: #087e9d;
          font-weight: 700;
          text-decoration: none;
        }

        .rn-breadcrumb a:hover {
          text-decoration: underline;
        }

        .rn-breadcrumb > span:last-child {
          overflow-wrap: anywhere;
        }

        .rn-community-hero {
          position: relative;
          display: flex;
          min-height: 340px;
          align-items: center;
          justify-content: space-between;
          overflow: hidden;
          padding: 44px 48px;
          border: 1px solid rgba(255, 255, 255, 0.08);
          border-radius: 26px;
          color: #ffffff;
          background:
            radial-gradient(
              circle at 88% 20%,
              rgba(0, 180, 216, 0.22),
              transparent 30%
            ),
            linear-gradient(120deg, #091a33 0%, #102a4c 62%, #0b2342 100%);
          box-shadow: 0 20px 55px rgba(11, 30, 58, 0.12);
        }

        .rn-community-hero-content {
          position: relative;
          z-index: 2;
          width: min(100%, 780px);
        }

        .rn-hero-decoration {
          position: absolute;
          pointer-events: none;
          border: 1px solid rgba(0, 180, 216, 0.12);
          border-radius: 50%;
        }

        .rn-hero-decoration-one {
          top: -150px;
          right: -70px;
          width: 430px;
          height: 430px;
        }

        .rn-hero-decoration-two {
          top: -100px;
          right: -20px;
          width: 330px;
          height: 330px;
        }

        .rn-hero-topline {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px;
          margin-bottom: 20px;
        }

        .rn-category-label {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          color: #a9f0fc;
          font-size: 11px;
          font-weight: 800;
          letter-spacing: 1.6px;
          text-transform: uppercase;
        }

        .rn-category-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--rn-cyan);
          box-shadow: 0 0 0 5px rgba(0, 180, 216, 0.12);
        }

        .rn-visibility-badge {
          display: inline-flex;
          align-items: center;
          padding: 6px 10px;
          border: 1px solid rgba(255, 255, 255, 0.16);
          border-radius: 999px;
          font-size: 11px;
          font-weight: 700;
        }

        .rn-visibility-public {
          color: #b7f6df;
          background: rgba(34, 197, 94, 0.09);
        }

        .rn-visibility-private {
          color: #ffe3a0;
          background: rgba(251, 191, 36, 0.09);
        }

        .rn-community-hero h1 {
          max-width: 760px;
          margin: 0;
          color: #ffffff;
          font-size: clamp(34px, 4.3vw, 56px);
          font-weight: 850;
          line-height: 1.08;
          letter-spacing: -1.8px;
          overflow-wrap: anywhere;
        }

        .rn-community-description {
          max-width: 690px;
          margin: 20px 0 0;
          color: #d1dfed;
          font-size: 15px;
          line-height: 1.85;
          overflow-wrap: anywhere;
        }

        .rn-community-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 12px 22px;
          margin-top: 23px;
        }

        .rn-community-meta > span {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #d4e4f3;
          font-size: 12px;
        }

        .rn-meta-icon {
          color: var(--rn-cyan);
          font-size: 17px;
          font-weight: 800;
        }

        .rn-hero-actions {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 10px;
          margin-top: 28px;
        }

        .rn-hero-actions form {
          margin: 0;
        }

        .rn-community-page .rn-button {
          display: inline-flex;
          min-height: 43px;
          align-items: center;
          justify-content: center;
          gap: 9px;
          padding: 11px 16px;
          border: 1px solid transparent;
          border-radius: 11px;
          font-family: inherit;
          font-size: 12px;
          font-weight: 800;
          line-height: 1.35;
          text-align: center;
          text-decoration: none;
          cursor: pointer;
          transition:
            transform 160ms ease,
            background 160ms ease,
            border-color 160ms ease,
            box-shadow 160ms ease;
        }

        .rn-community-page .rn-button:hover {
          transform: translateY(-2px);
        }

        .rn-community-page .rn-button:focus-visible {
          outline: 3px solid rgba(0, 180, 216, 0.5);
          outline-offset: 3px;
        }

        .rn-button-gold {
          color: #18243a;
          background: var(--rn-gold);
          box-shadow: 0 6px 18px rgba(251, 191, 36, 0.15);
        }

        .rn-button-gold:hover {
          background: #ffd45e;
        }

        .rn-button-outline {
          color: #ffffff;
          border-color: rgba(255, 255, 255, 0.27) !important;
          background: rgba(255, 255, 255, 0.045);
        }

        .rn-button-outline:hover {
          border-color: var(--rn-cyan) !important;
          background: rgba(255, 255, 255, 0.09);
        }

        .rn-button-primary {
          color: #ffffff;
          background: var(--rn-navy);
          box-shadow: 0 6px 18px rgba(11, 30, 58, 0.12);
        }

        .rn-button-primary:hover {
          background: #17375e;
        }

        .rn-button-secondary {
          color: var(--rn-navy);
          border-color: var(--rn-border) !important;
          background: #ffffff;
        }

        .rn-button-danger {
          min-height: 36px !important;
          padding: 8px 11px !important;
          color: #b42318;
          border-color: #f2d2cf !important;
          background: #fff8f7;
        }

        .rn-button-danger:hover {
          background: #fff0ee;
        }

        .rn-button-small {
          min-height: 36px !important;
          padding: 8px 11px !important;
          color: var(--rn-navy);
          border-color: #dce6ef !important;
          background: #f6f9fc;
        }

        .rn-button-full {
          width: 100%;
        }

        .rn-status-pill {
          display: inline-flex;
          min-height: 35px;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 999px;
          font-size: 11px;
          font-weight: 750;
        }

        .rn-status-active {
          color: #b7f6df;
          background: rgba(34, 197, 94, 0.1);
        }

        .rn-status-owner {
          color: #ffe5a3;
          background: rgba(251, 191, 36, 0.1);
        }

        .rn-status-pending {
          color: #ffe4a7;
          background: rgba(251, 191, 36, 0.1);
        }

        .rn-status-dot {
          width: 7px;
          height: 7px;
          flex-shrink: 0;
          border-radius: 50%;
          background: currentColor;
        }

        .rn-hero-side {
          position: absolute;
          top: 50%;
          right: 35px;
          width: 250px;
          height: 250px;
          transform: translateY(-50%);
          opacity: 0.92;
          pointer-events: none;
        }

        .rn-orbit {
          position: absolute;
          top: 50%;
          left: 50%;
          border: 1px solid rgba(0, 180, 216, 0.35);
          border-radius: 50%;
          transform: translate(-50%, -50%);
        }

        .rn-orbit-outer {
          width: 230px;
          height: 230px;
        }

        .rn-orbit-inner {
          width: 165px;
          height: 165px;
          border-color: rgba(251, 191, 36, 0.42);
        }

        .rn-orbit-core {
          position: absolute;
          top: 50%;
          left: 50%;
          display: grid;
          width: 90px;
          height: 90px;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.25);
          border-radius: 27px;
          color: #ffffff;
          background: linear-gradient(145deg, #00b4d8, #087da5);
          box-shadow: 0 12px 40px rgba(0, 180, 216, 0.22);
          font-size: 27px;
          font-weight: 900;
          letter-spacing: -2px;
          transform: translate(-50%, -50%) rotate(-8deg);
        }

        .rn-orbit-node {
          position: absolute;
          display: grid;
          width: 37px;
          height: 37px;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 13px;
          color: var(--rn-navy);
          background: var(--rn-gold);
          font-size: 19px;
          font-weight: 900;
        }

        .rn-orbit-node-one {
          top: 15px;
          left: 42px;
        }

        .rn-orbit-node-two {
          top: 112px;
          right: 0;
          color: #ffffff;
          background: #087da5;
        }

        .rn-orbit-node-three {
          bottom: 6px;
          left: 78px;
          color: #ffffff;
          background: #193b63;
        }

        .rn-community-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-top: 22px;
        }

        .rn-stat-card {
          display: flex;
          min-width: 0;
          align-items: flex-start;
          gap: 15px;
          padding: 22px;
          border: 1px solid var(--rn-border);
          border-radius: 17px;
          background: var(--rn-surface);
          box-shadow: 0 5px 20px rgba(11, 30, 58, 0.025);
        }

        .rn-stat-icon {
          display: grid;
          width: 43px;
          height: 43px;
          flex-shrink: 0;
          place-items: center;
          border-radius: 13px;
          font-size: 22px;
          font-weight: 800;
        }

        .rn-stat-icon-cyan {
          color: #087e9d;
          background: #e5f9fd;
        }

        .rn-stat-icon-gold {
          color: #8a6100;
          background: #fff5d5;
        }

        .rn-stat-icon-navy {
          color: var(--rn-navy);
          background: #eaf0f8;
        }

        .rn-stat-card > div {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 4px;
        }

        .rn-stat-label {
          color: var(--rn-muted);
          font-size: 11px;
          font-weight: 750;
        }

        .rn-stat-card strong {
          color: var(--rn-navy);
          font-size: 27px;
          font-weight: 850;
          line-height: 1.2;
        }

        .rn-stat-card .rn-stat-text {
          font-size: 23px;
        }

        .rn-stat-caption {
          color: #8290a0;
          font-size: 11px;
          line-height: 1.5;
        }

        .rn-feedback-section {
          display: grid;
          gap: 10px;
          margin-top: 22px;
        }

        .rn-feedback {
          display: flex;
          align-items: flex-start;
          gap: 12px;
          padding: 16px 18px;
          border: 1px solid;
          border-radius: 13px;
        }

        .rn-feedback > span {
          display: grid;
          width: 25px;
          height: 25px;
          flex-shrink: 0;
          place-items: center;
          border-radius: 50%;
          font-weight: 900;
        }

        .rn-feedback p {
          margin: 3px 0 0;
          font-size: 13px;
          line-height: 1.7;
        }

        .rn-feedback-success {
          color: #166534;
          border-color: #ccebd8;
          background: #f0fbf4;
        }

        .rn-feedback-success > span {
          color: #ffffff;
          background: #16a34a;
        }

        .rn-feedback-error {
          color: #9b2424;
          border-color: #f1d0cc;
          background: #fff5f4;
        }

        .rn-feedback-error > span {
          color: #ffffff;
          background: #c6372c;
        }

        .rn-management-section,
        .rn-community-feature-section {
          margin-top: 42px;
        }

        .rn-section-intro {
          margin-bottom: 19px;
        }

        .rn-section-kicker {
          display: inline-block;
          color: #0785a4;
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1.8px;
          line-height: 1.6;
          text-transform: uppercase;
        }

        .rn-section-intro h2 {
          margin: 7px 0 0;
          color: var(--rn-navy);
          font-size: clamp(23px, 2.6vw, 30px);
          font-weight: 850;
          line-height: 1.25;
          letter-spacing: -0.7px;
        }

        .rn-section-intro > p {
          max-width: 700px;
          margin: 9px 0 0;
          color: var(--rn-muted);
          font-size: 13px;
          line-height: 1.8;
        }

        .rn-management-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
          align-items: start;
        }

        .rn-management-panel {
          min-width: 0;
          overflow: hidden;
          padding: 18px;
          border: 1px solid var(--rn-border);
          border-radius: 17px;
          background: #ffffff;
          box-shadow: 0 5px 20px rgba(11, 30, 58, 0.025);
        }

        .rn-community-feature-section > :not(.rn-section-intro):not(.rn-section-heading) {
          min-width: 0;
        }

        .rn-section-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 20px;
        }

        .rn-section-heading .rn-section-intro {
          margin-bottom: 0;
        }

        .rn-section-symbol {
          display: grid;
          width: 49px;
          height: 49px;
          flex-shrink: 0;
          place-items: center;
          border: 1px solid #cdeff5;
          border-radius: 15px;
          color: #087e9d;
          background: #eafaff;
          font-size: 25px;
        }

        .rn-count-badge {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          padding: 9px 13px;
          border: 1px solid #d5edf4;
          border-radius: 999px;
          color: #087e9d;
          background: #f0fbfe;
          font-size: 11px;
          font-weight: 800;
        }

        .rn-content-panel {
          min-width: 0;
          padding: 20px;
          border: 1px solid var(--rn-border);
          border-radius: 18px;
          background: #ffffff;
        }

        .rn-member-management-grid {
          display: grid;
          grid-template-columns: minmax(0, 1.7fr) minmax(260px, 0.8fr);
          gap: 20px;
          align-items: start;
        }

        .rn-member-list {
          display: grid;
          min-width: 0;
          gap: 12px;
        }

        .rn-member-card {
          display: flex;
          min-width: 0;
          align-items: center;
          justify-content: space-between;
          gap: 17px;
          padding: 18px;
          border: 1px solid var(--rn-border);
          border-radius: 16px;
          background: #ffffff;
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }

        .rn-member-card:hover {
          border-color: #c7e8ef;
          box-shadow: 0 9px 24px rgba(11, 30, 58, 0.045);
          transform: translateY(-1px);
        }

        .rn-member-main {
          display: flex;
          min-width: 0;
          align-items: flex-start;
          gap: 14px;
        }

        .rn-member-avatar {
          display: block;
          width: 58px;
          height: 58px;
          flex-shrink: 0;
          border: 2px solid #e7f6fa;
          border-radius: 17px;
          object-fit: cover;
        }

        .rn-member-avatar-fallback {
          display: grid;
          place-items: center;
          color: var(--rn-navy);
          background: linear-gradient(145deg, #dff7fc, #fff1c8);
          font-size: 17px;
          font-weight: 900;
        }

        .rn-member-details {
          min-width: 0;
        }

        .rn-member-name-row {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 7px;
        }

        .rn-member-name-row h3 {
          margin: 2px 0 0;
          color: var(--rn-navy);
          font-size: 15px;
          font-weight: 800;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .rn-member-joined {
          margin: 4px 0 9px;
          color: var(--rn-muted);
          font-size: 11px;
          line-height: 1.6;
        }

        .rn-role-badge {
          display: inline-flex;
          align-items: center;
          padding: 5px 8px;
          border-radius: 7px;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 0.4px;
          text-transform: uppercase;
        }

        .rn-role-owner {
          color: #875d00;
          background: #fff3c5;
        }

        .rn-role-moderator {
          color: #087e9d;
          background: #e4f8fc;
        }

        .rn-role-member {
          color: #4f6177;
          background: #edf2f7;
        }

        .rn-member-profile-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          margin-top: 11px;
          color: #087e9d;
          font-size: 11px;
          font-weight: 800;
          text-decoration: none;
        }

        .rn-member-profile-link:hover {
          color: var(--rn-navy);
          text-decoration: underline;
        }

        .rn-member-actions {
          display: flex;
          flex-shrink: 0;
          flex-direction: column;
          align-items: flex-end;
          gap: 8px;
        }

        .rn-member-actions form {
          margin: 0;
        }

        .rn-add-member-card {
          position: relative;
          min-width: 0;
          overflow: hidden;
          padding: 25px;
          border: 1px solid #dbe8f2;
          border-radius: 19px;
          background:
            radial-gradient(
              circle at 100% 0%,
              rgba(0, 180, 216, 0.11),
              transparent 34%
            ),
            #ffffff;
          box-shadow: 0 9px 30px rgba(11, 30, 58, 0.04);
        }

        .rn-add-member-icon {
          display: grid;
          width: 47px;
          height: 47px;
          margin-bottom: 20px;
          place-items: center;
          border-radius: 15px;
          color: #ffffff;
          background: var(--rn-navy);
          box-shadow: 0 6px 18px rgba(11, 30, 58, 0.13);
          font-size: 27px;
          font-weight: 400;
        }

        .rn-add-member-card h3 {
          margin: 8px 0 0;
          color: var(--rn-navy);
          font-size: 21px;
          font-weight: 850;
          letter-spacing: -0.5px;
        }

        .rn-add-member-card > p {
          margin: 10px 0 20px;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-add-member-form {
          display: grid;
          gap: 10px;
        }

        .rn-add-member-form label {
          color: var(--rn-ink);
          font-size: 11px;
          font-weight: 800;
        }

        .rn-add-member-form select {
          width: 100%;
          min-height: 45px;
          padding: 10px 12px;
          border: 1px solid #dce5ee;
          border-radius: 10px;
          outline: none;
          color: var(--rn-ink);
          background: #ffffff;
          font-family: inherit;
          font-size: 12px;
        }

        .rn-add-member-form select:focus {
          border-color: var(--rn-cyan);
          box-shadow: 0 0 0 3px rgba(0, 180, 216, 0.12);
        }

        .rn-no-profiles {
          padding: 13px;
          border: 1px dashed #d4e0eb;
          border-radius: 10px;
          color: var(--rn-muted);
          background: #f7f9fc;
          font-size: 12px;
          line-height: 1.7;
        }

        .rn-permission-note {
          margin-top: 22px;
          padding-top: 17px;
          border-top: 1px solid var(--rn-border);
        }

        .rn-permission-note strong {
          color: var(--rn-navy);
          font-size: 11px;
        }

        .rn-permission-note p {
          margin: 6px 0 0;
          color: var(--rn-muted);
          font-size: 11px;
          line-height: 1.8;
        }

        .rn-empty-card {
          display: flex;
          min-height: 185px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 30px 20px;
          border: 1px dashed #d5e2ed;
          border-radius: 17px;
          text-align: center;
          background: rgba(255, 255, 255, 0.8);
        }

        .rn-empty-icon {
          display: grid;
          width: 45px;
          height: 45px;
          margin-bottom: 13px;
          place-items: center;
          border-radius: 14px;
          color: #087e9d;
          background: #e5f9fd;
          font-size: 23px;
        }

        .rn-empty-card h3 {
          margin: 0;
          color: var(--rn-navy);
          font-size: 16px;
          font-weight: 800;
        }

        .rn-empty-card p {
          max-width: 440px;
          margin: 8px 0 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-information-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 18px;
        }

        .rn-information-card {
          position: relative;
          min-width: 0;
          overflow: hidden;
          padding: 27px;
          border: 1px solid var(--rn-border);
          border-radius: 18px;
          background: #ffffff;
          box-shadow: 0 5px 20px rgba(11, 30, 58, 0.025);
        }

        .rn-information-heading {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-bottom: 21px;
        }

        .rn-information-icon {
          display: grid;
          width: 42px;
          height: 42px;
          flex-shrink: 0;
          place-items: center;
          border-radius: 13px;
          color: #087e9d;
          background: #e5f9fd;
          font-size: 22px;
        }

        .rn-information-heading h3 {
          margin: 0;
          color: var(--rn-navy);
          font-size: 17px;
          font-weight: 850;
        }

        .rn-details-list {
          display: grid;
          gap: 0;
          margin: 0;
        }

        .rn-details-list > div {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          padding: 13px 0;
          border-bottom: 1px solid #edf1f5;
        }

        .rn-details-list > div:first-child {
          padding-top: 0;
        }

        .rn-details-list > div:last-child {
          padding-bottom: 0;
          border-bottom: 0;
        }

        .rn-details-list dt {
          flex-shrink: 0;
          color: var(--rn-muted);
          font-size: 12px;
        }

        .rn-details-list dd {
          margin: 0;
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 750;
          text-align: right;
          overflow-wrap: anywhere;
        }

        .rn-purpose-card > p {
          position: relative;
          z-index: 1;
          margin: 0;
          color: var(--rn-muted);
          font-size: 13px;
          line-height: 1.9;
        }

        .rn-purpose-decoration {
          position: absolute;
          top: 5px;
          right: 14px;
          color: rgba(0, 180, 216, 0.08);
          font-size: 76px;
          font-weight: 900;
          letter-spacing: -7px;
          pointer-events: none;
        }

        .rn-purpose-points {
          display: grid;
          gap: 13px;
          margin-top: 24px;
        }

        .rn-purpose-points > div {
          display: flex;
          align-items: flex-start;
          gap: 12px;
        }

        .rn-purpose-points > div > span {
          display: grid;
          width: 29px;
          height: 29px;
          flex-shrink: 0;
          place-items: center;
          border: 1px solid #d4edf3;
          border-radius: 9px;
          color: #087e9d;
          background: #f0fbfe;
          font-size: 10px;
          font-weight: 900;
        }

        .rn-purpose-points > div > p {
          margin: 5px 0 0;
          color: var(--rn-ink);
          font-size: 12px;
          line-height: 1.7;
        }

        .rn-purpose-card .rn-join-hint {
          margin-top: 21px;
          padding: 13px;
          border-left: 3px solid var(--rn-gold);
          border-radius: 0 9px 9px 0;
          color: #6f5718;
          background: #fff9e7;
          font-size: 11px;
        }

        .rn-intentions-section {
          padding-bottom: 4px;
        }

        .rn-intentions-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
        }

        .rn-intention-card {
          display: flex;
          min-width: 0;
          flex-direction: column;
          padding: 22px;
          border: 1px solid var(--rn-border);
          border-radius: 17px;
          background: #ffffff;
          box-shadow: 0 5px 20px rgba(11, 30, 58, 0.025);
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }

        .rn-intention-card:hover {
          border-color: #c8e9f0;
          box-shadow: 0 12px 28px rgba(11, 30, 58, 0.055);
          transform: translateY(-3px);
        }

        .rn-intention-topline {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 9px;
        }

        .rn-intent-type {
          display: inline-flex;
          align-items: center;
          padding: 6px 9px;
          border-radius: 7px;
          font-size: 9px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .rn-intent-need {
          color: #9b3b24;
          background: #fff0e9;
        }

        .rn-intent-offer {
          color: #147442;
          background: #e8f8ee;
        }

        .rn-intent-build {
          color: #086d91;
          background: #e5f7fd;
        }

        .rn-intention-date {
          color: #8491a0;
          font-size: 10px;
        }

        .rn-intention-card h3 {
          margin: 17px 0 0;
          color: var(--rn-navy);
          font-size: 17px;
          font-weight: 850;
          line-height: 1.5;
          overflow-wrap: anywhere;
        }

        .rn-intention-description {
          margin: 10px 0 14px;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.85;
          overflow-wrap: anywhere;
        }

        .rn-intention-category {
          align-self: flex-start;
          margin-top: auto;
          padding: 6px 9px;
          border: 1px solid #e3eaf1;
          border-radius: 7px;
          color: #50647b;
          background: #f7f9fc;
          font-size: 10px;
          font-weight: 700;
        }

        .rn-intention-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 19px;
          padding-top: 15px;
          border-top: 1px solid #edf1f5;
        }

        .rn-intention-status {
          color: #6e7c8d;
          font-size: 10px;
          font-weight: 750;
          text-transform: capitalize;
        }

        .rn-intention-link {
          display: inline-flex;
          align-items: center;
          gap: 5px;
          color: #087e9d;
          font-size: 11px;
          font-weight: 850;
          text-decoration: none;
        }

        .rn-intention-link:hover {
          color: var(--rn-navy);
        }

        .rn-intentions-empty {
          min-height: 230px;
        }

        .rn-intentions-empty .rn-button {
          margin-top: 19px;
        }

        .rn-bottom-cta {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 25px;
          overflow: hidden;
          margin-top: 46px;
          padding: 35px 38px;
          border-radius: 21px;
          color: #ffffff;
          background:
            radial-gradient(
              circle at 95% 0%,
              rgba(0, 180, 216, 0.18),
              transparent 35%
            ),
            linear-gradient(120deg, #0b1e3a, #15375e);
        }

        .rn-bottom-cta-content {
          position: relative;
          z-index: 1;
          max-width: 640px;
        }

        .rn-bottom-cta .rn-section-kicker {
          color: #85e9f7;
        }

        .rn-bottom-cta h2 {
          margin: 8px 0 0;
          color: #ffffff;
          font-size: clamp(22px, 2.6vw, 30px);
          font-weight: 850;
          line-height: 1.25;
          letter-spacing: -0.7px;
        }

        .rn-bottom-cta p {
          margin: 10px 0 0;
          color: #cbd9e8;
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-bottom-cta-actions {
          position: relative;
          z-index: 1;
          display: flex;
          flex-shrink: 0;
          flex-wrap: wrap;
          gap: 10px;
        }

        .rn-community-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 25px;
          padding: 18px 2px 0;
          border-top: 1px solid #e1e8f0;
        }

        .rn-community-footer a {
          color: #087e9d;
          font-size: 12px;
          font-weight: 800;
          text-decoration: none;
        }

        .rn-community-footer a:hover {
          text-decoration: underline;
        }

        .rn-community-footer > span {
          color: #8290a0;
          font-size: 11px;
        }

        @media (max-width: 1050px) {
          .rn-community-hero {
            padding: 38px;
          }

          .rn-community-hero-content {
            width: 78%;
          }

          .rn-hero-side {
            right: -25px;
            opacity: 0.45;
          }

          .rn-member-management-grid {
            grid-template-columns: minmax(0, 1.4fr) minmax(240px, 0.8fr);
          }

          .rn-intentions-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .rn-bottom-cta {
            align-items: flex-start;
            flex-direction: column;
          }
        }

        @media (max-width: 760px) {
          .rn-community-page {
            padding: 22px 15px 35px;
          }

          .rn-community-hero {
            min-height: 0;
            padding: 29px 23px;
            border-radius: 20px;
          }

          .rn-community-hero-content {
            width: 100%;
          }

          .rn-community-hero h1 {
            max-width: 100%;
            font-size: clamp(30px, 7vw, 42px);
            letter-spacing: -1.2px;
          }

          .rn-community-description {
            font-size: 13px;
          }

          .rn-hero-side {
            top: auto;
            right: -105px;
            bottom: -100px;
            transform: none;
            opacity: 0.18;
          }

          .rn-community-meta {
            gap: 10px 15px;
          }

          .rn-community-meta > span {
            font-size: 11px;
          }

          .rn-hero-actions {
            position: relative;
            z-index: 2;
          }

          .rn-community-stats {
            grid-template-columns: 1fr;
            gap: 10px;
          }

          .rn-stat-card {
            padding: 16px;
          }

          .rn-stat-card strong {
            font-size: 23px;
          }

          .rn-management-grid,
          .rn-information-grid,
          .rn-member-management-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .rn-management-section,
          .rn-community-feature-section {
            margin-top: 34px;
          }

          .rn-section-heading {
            align-items: flex-start;
          }

          .rn-section-heading > .rn-count-badge {
            max-width: 45%;
            white-space: normal;
            text-align: center;
          }

          .rn-member-card {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-member-actions {
            width: 100%;
            align-items: flex-start;
            padding-left: 72px;
          }

          .rn-member-actions form {
            max-width: 100%;
          }

          .rn-member-actions .rn-button {
            white-space: normal;
          }

          .rn-add-member-card {
            padding: 22px;
          }

          .rn-information-card {
            padding: 22px;
          }

          .rn-intentions-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .rn-content-panel {
            padding: 14px;
          }

          .rn-bottom-cta {
            margin-top: 35px;
            padding: 28px 22px;
          }

          .rn-bottom-cta-actions {
            width: 100%;
          }

          .rn-bottom-cta-actions .rn-button {
            flex: 1 1 180px;
          }
        }

        @media (max-width: 440px) {
          .rn-community-page {
            padding-right: 11px;
            padding-left: 11px;
          }

          .rn-community-hero {
            padding: 25px 18px;
          }

          .rn-community-hero h1 {
            font-size: 31px;
          }

          .rn-hero-topline {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-hero-actions {
            align-items: stretch;
            flex-direction: column;
          }

          .rn-hero-actions > *,
          .rn-hero-actions form,
          .rn-hero-actions form button {
            width: 100%;
          }

          .rn-hero-actions .rn-button,
          .rn-hero-actions > a {
            width: 100%;
          }

          .rn-section-heading {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-section-heading > .rn-count-badge {
            max-width: 100%;
          }

          .rn-member-main {
            gap: 11px;
          }

          .rn-member-avatar {
            width: 49px;
            height: 49px;
            border-radius: 14px;
          }

          .rn-member-actions {
            padding-left: 0;
          }

          .rn-details-list > div {
            gap: 10px;
          }

          .rn-details-list dt,
          .rn-details-list dd {
            font-size: 11px;
          }

          .rn-intention-card {
            padding: 18px;
          }

          .rn-intention-footer {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-community-footer {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-community-footer > span {
            line-height: 1.7;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-community-page *,
          .rn-community-page *::before,
          .rn-community-page *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}