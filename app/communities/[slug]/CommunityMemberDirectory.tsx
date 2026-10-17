"use client";

import { useMemo, useState, type FormEvent } from "react";

type DirectoryMember = {
  user_id: string;
  role: string;
  status: string;
  joined_at: string;
  full_name: string | null;
  avatar_url: string | null;
};

type MemberAction = (formData: FormData) => void | Promise<void>;

type Props = {
  members: DirectoryMember[];
  ownerId: string;
  isOwner: boolean;
  canManageMembers: boolean;
  removeMember: MemberAction;
  setMemberRole: MemberAction;
};

type RoleFilter = "all" | "owner" | "moderator" | "member";
type SortMode = "newest" | "oldest" | "name";

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}

export default function CommunityMemberDirectory({
  members,
  ownerId,
  isOwner,
  canManageMembers,
  removeMember,
  setMemberRole,
}: Props) {
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("all");
  const [sortMode, setSortMode] = useState<SortMode>("newest");

  const visibleMembers = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();

    return members
      .filter((member) => {
        const name = member.full_name?.trim() || "RuffNeck member";
        const matchesSearch =
          !query ||
          name.toLocaleLowerCase().includes(query) ||
          member.role.toLocaleLowerCase().includes(query);
        const matchesRole = roleFilter === "all" || member.role === roleFilter;
        return matchesSearch && matchesRole;
      })
      .sort((a, b) => {
        if (sortMode === "name") {
          return (a.full_name || "RuffNeck member").localeCompare(
            b.full_name || "RuffNeck member",
            "en",
            { sensitivity: "base" }
          );
        }

        const aTime = new Date(a.joined_at).getTime();
        const bTime = new Date(b.joined_at).getTime();
        const safeATime = Number.isNaN(aTime) ? 0 : aTime;
        const safeBTime = Number.isNaN(bTime) ? 0 : bTime;
        return sortMode === "newest"
          ? safeBTime - safeATime
          : safeATime - safeBTime;
      });
  }, [members, search, roleFilter, sortMode]);

  function confirmAction(event: FormEvent<HTMLFormElement>, message: string) {
    if (!window.confirm(message)) event.preventDefault();
  }

  return (
    <div className="community-member-directory">
      <div className="feature-card community-member-directory__controls">
        <div className="section-heading">
          <div>
            <span className="eyebrow">MEMBER DIRECTORY</span>
            <h3>Find a community member</h3>
            <p className="muted">
              Search by name or role, filter the list, or change its order.
            </p>
          </div>
          <span className="status-badge status-active">
            {visibleMembers.length} of {members.length}
          </span>
        </div>

        <div className="community-member-directory__filters">
          <div>
            <label htmlFor="community-member-search">Search members</label>
            <input
              id="community-member-search"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Enter a name or role"
              autoComplete="off"
            />
          </div>

          <div>
            <label htmlFor="community-member-role-filter">Role</label>
            <select
              id="community-member-role-filter"
              value={roleFilter}
              onChange={(event) => setRoleFilter(event.target.value as RoleFilter)}
            >
              <option value="all">All roles</option>
              <option value="owner">Owner</option>
              <option value="moderator">Moderators</option>
              <option value="member">Members</option>
            </select>
          </div>

          <div>
            <label htmlFor="community-member-sort">Sort by</label>
            <select
              id="community-member-sort"
              value={sortMode}
              onChange={(event) => setSortMode(event.target.value as SortMode)}
            >
              <option value="newest">Recently joined</option>
              <option value="oldest">Joined earliest</option>
              <option value="name">Name A–Z</option>
            </select>
          </div>
        </div>
      </div>

      {visibleMembers.length === 0 ? (
        <div className="empty-state" role="status">
          <h3>{members.length === 0 ? "No active members yet" : "No matching members"}</h3>
          <p>
            {members.length === 0
              ? "Community members will appear here when they join."
              : "Try a different search term or clear the role filter."}
          </p>
          {(search || roleFilter !== "all") && (
            <button
              className="button button-secondary"
              type="button"
              onClick={() => {
                setSearch("");
                setRoleFilter("all");
              }}
            >
              Clear filters
            </button>
          )}
        </div>
      ) : (
        <div className="member-list">
          {visibleMembers.map((member) => {
            const isTargetOwner = member.user_id === ownerId;
            const displayName = member.full_name?.trim() || "RuffNeck member";

            return (
              <article className="feature-card member-card" key={member.user_id}>
                <div className="member-card-profile">
                  {member.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="member-avatar" src={member.avatar_url} alt="" />
                  ) : (
                    <div className="member-avatar member-avatar-fallback" aria-hidden="true">
                      {displayName.charAt(0).toUpperCase()}
                    </div>
                  )}

                  <div className="member-details">
                    <h3>{displayName}</h3>
                    <p className="muted">Joined {formatDate(member.joined_at)}</p>
                    <span className={`member-role role-${member.role}`}>
                      {member.role}
                    </span>
                  </div>
                </div>

                {canManageMembers &&
                  !isTargetOwner &&
                  (isOwner || member.role === "member") && (
                    <form
                      action={removeMember}
                      onSubmit={(event) =>
                        confirmAction(
                          event,
                          `Remove ${displayName} from this community?`
                        )
                      }
                    >
                      <input type="hidden" name="user_id" value={member.user_id} />
                      <button className="button button-secondary" type="submit">
                        Remove member
                      </button>
                    </form>
                  )}

                {isOwner &&
                  !isTargetOwner &&
                  (member.role === "member" || member.role === "moderator") && (
                    <form
                      action={setMemberRole}
                      onSubmit={(event) =>
                        confirmAction(
                          event,
                          member.role === "moderator"
                            ? `Demote ${displayName} to member?`
                            : `Promote ${displayName} to moderator?`
                        )
                      }
                    >
                      <input type="hidden" name="user_id" value={member.user_id} />
                      <input
                        type="hidden"
                        name="new_role"
                        value={member.role === "moderator" ? "member" : "moderator"}
                      />
                      <button className="button button-secondary" type="submit">
                        {member.role === "moderator"
                          ? "Demote to member"
                          : "Promote to moderator"}
                      </button>
                    </form>
                  )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
