"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Activity = {
  id: string;
  actor_id: string | null;
  target_user_id: string | null;
  activity_type: string;
  details: Record<string, unknown> | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
};

type Filter = "all" | "membership" | "roles";

type Props = {
  communityId: string;
};

const ACTIVITY_LABELS: Record<string, string> = {
  member_added: "Member added",
  member_removed: "Member removed",
  membership_approved: "Membership request approved",
  membership_rejected: "Membership request rejected",
  member_role_changed: "Member role changed",
};

function isRoleActivity(activity: Activity) {
  return activity.activity_type === "member_role_changed";
}

function matchesFilter(activity: Activity, filter: Filter) {
  if (filter === "all") return true;
  if (filter === "roles") return isRoleActivity(activity);
  return !isRoleActivity(activity);
}

function formatTimestamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function CommunityActivityLog({ communityId }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadActivities(manualRefresh = false) {
      if (manualRefresh) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }
      setError("");

      try {
        const supabase = createClient();
        const { data, error: activityError } = await supabase
          .from("community_activity_logs")
          .select("id, actor_id, target_user_id, activity_type, details, created_at")
          .eq("community_id", communityId)
          .order("created_at", { ascending: false })
          .limit(100);

        if (activityError) throw activityError;

        const rows = (data ?? []) as Activity[];
        const ids = Array.from(
          new Set(
            rows.flatMap((activity) =>
              [activity.actor_id, activity.target_user_id].filter(
                (id): id is string => Boolean(id)
              )
            )
          )
        );

        const profileNames: Record<string, string> = {};
        if (ids.length > 0) {
          const { data: profiles, error: profileError } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", ids);

          if (!profileError && profiles) {
            for (const profile of profiles as Profile[]) {
              profileNames[profile.id] =
                profile.full_name?.trim() || "Community member";
            }
          }
        }

        if (!cancelled) {
          setActivities(rows);
          setNames(profileNames);
        }
      } catch {
        if (!cancelled) {
          setError("Activity history could not be loaded. Refresh and try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    }

    const handleRefresh = () => {
      void loadActivities(true);
    };

    void loadActivities();
    window.addEventListener("community-activity-refresh", handleRefresh);

    return () => {
      cancelled = true;
      window.removeEventListener("community-activity-refresh", handleRefresh);
    };
  }, [communityId]);

  function refresh() {
    window.dispatchEvent(new Event("community-activity-refresh"));
  }

  const visibleActivities = activities.filter((activity) =>
    matchesFilter(activity, filter)
  );

  return (
    <section className="section community-activity">
      <div className="section-heading community-activity__header">
        <div>
          <span className="eyebrow">COMMUNITY MANAGEMENT</span>
          <h2>Activity history</h2>
          <p className="muted">Recent membership changes, decisions, and role updates.</p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={refresh}
          disabled={loading || refreshing}
        >
          {refreshing ? "Refreshing..." : "Refresh history"}
        </button>
      </div>

      <div className="hero-actions" role="group" aria-label="Filter activity history">
        <button
          className={filter === "all" ? "button button-primary" : "button button-secondary"}
          type="button"
          aria-pressed={filter === "all"}
          onClick={() => setFilter("all")}
        >
          All ({activities.length})
        </button>
        <button
          className={filter === "membership" ? "button button-primary" : "button button-secondary"}
          type="button"
          aria-pressed={filter === "membership"}
          onClick={() => setFilter("membership")}
        >
          Membership ({activities.filter((activity) => !isRoleActivity(activity)).length})
        </button>
        <button
          className={filter === "roles" ? "button button-primary" : "button button-secondary"}
          type="button"
          aria-pressed={filter === "roles"}
          onClick={() => setFilter("roles")}
        >
          Role changes ({activities.filter(isRoleActivity).length})
        </button>
      </div>

      {loading ? (
        <p className="muted" aria-live="polite">Loading activity history...</p>
      ) : error ? (
        <article className="feature-card" role="alert">
          <p>{error}</p>
          <button className="button button-secondary" type="button" onClick={refresh}>
            Try again
          </button>
        </article>
      ) : visibleActivities.length === 0 ? (
        <div className="empty-state">
          <h3>{activities.length === 0 ? "No activity recorded yet" : "No events in this filter"}</h3>
          <p>
            {activities.length === 0
              ? "Membership changes and decisions will appear here when recorded."
              : "Choose another filter to see more activity."}
          </p>
        </div>
      ) : (
        <div className="community-activity__list">
          {visibleActivities.map((activity) => {
            const type = activity.activity_type;
            const isRemoval = type === "member_removed" || type === "membership_rejected";
            const isRoleChange = isRoleActivity(activity);
            const actorName = activity.actor_id
              ? names[activity.actor_id] || "Community manager"
              : "Former account";
            const targetName = activity.target_user_id
              ? names[activity.target_user_id] || "Community member"
              : "Unknown member";
            const previousRole = activity.details?.previous_role;
            const newRole = activity.details?.new_role;

            return (
              <article className="community-activity__item" key={activity.id}>
                <span className="community-activity__marker" aria-hidden="true">
                  {isRoleChange ? "↔" : isRemoval ? "−" : "+"}
                </span>
                <div className="community-activity__content">
                  <strong>{ACTIVITY_LABELS[type] || "Community activity"}</strong>
                  <p>
                    <b>{actorName}</b>
                    {type === "member_added" && <> added <b>{targetName}</b> to the community.</>}
                    {type === "member_removed" && <> removed <b>{targetName}</b> from the community.</>}
                    {type === "membership_approved" && <> approved the membership request from <b>{targetName}</b>.</>}
                    {type === "membership_rejected" && <> rejected the membership request from <b>{targetName}</b>.</>}
                    {isRoleChange && (
                      <> changed <b>{targetName}</b>&apos;s role
                        {typeof previousRole === "string" && typeof newRole === "string"
                          ? <> from <b>{previousRole}</b> to <b>{newRole}</b>.</>
                          : "."}
                      </>
                    )}
                  </p>
                  <time dateTime={activity.created_at}>
                    {formatTimestamp(activity.created_at)}
                  </time>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
