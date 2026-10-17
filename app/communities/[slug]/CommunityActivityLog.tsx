"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type Activity = {
  id: string;
  actor_id: string | null;
  target_user_id: string | null;
  activity_type: string;
  details: Record<string, unknown>;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
};

type Props = {
  communityId: string;
};

const ACTIVITY_LABELS: Record<string, string> = {
  member_added: "Added a member",
  member_removed: "Removed a member",
  membership_approved: "Approved a membership request",
  membership_rejected: "Rejected a membership request",
  member_role_changed: "Changed a member's role",
};

export default function CommunityActivityLog({ communityId }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [names, setNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadActivities() {
      setLoading(true);
      setError("");

      try {
        const supabase = createClient();
        const { data, error: activityError } = await supabase
          .from("community_activity_logs")
          .select("id, actor_id, target_user_id, activity_type, details, created_at")
          .eq("community_id", communityId)
          .order("created_at", { ascending: false })
          .limit(50);

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
        if (!cancelled) setError("Activity history could not be loaded.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadActivities();
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  return (
    <section className="community-activity">
      <div className="community-activity__header">
        <div>
          <span className="community-activity__eyebrow">
            COMMUNITY MANAGEMENT
          </span>
          <h2>Activity history</h2>
          <p>Recent membership changes and decisions.</p>
        </div>
        <span className="community-activity__count">
          {activities.length} {activities.length === 1 ? "event" : "events"}
        </span>
      </div>

      {loading ? (
        <p className="community-activity__message">Loading activity history...</p>
      ) : error ? (
        <p className="community-activity__message" role="alert">{error}</p>
      ) : activities.length === 0 ? (
        <div className="community-activity__empty">
          <h3>No activity recorded yet</h3>
          <p>Membership changes will appear here after they are recorded.</p>
        </div>
      ) : (
        <div className="community-activity__list">
          {activities.map((activity) => {
            const isRemoval = activity.activity_type === "member_removed";
            const isRoleChange = activity.activity_type === "member_role_changed";
            const actorName = activity.actor_id
              ? names[activity.actor_id] || "Community manager"
              : "Former account";
            const targetName = activity.target_user_id
              ? names[activity.target_user_id] || "Community member"
              : "Unknown member";

            return (
              <article className="community-activity__item" key={activity.id}>
                <span className="community-activity__marker" aria-hidden="true">
                  {isRemoval ? "−" : isRoleChange ? "↔" : "+"}
                </span>
                <div className="community-activity__content">
                  <strong>
                    {ACTIVITY_LABELS[activity.activity_type] || "Community activity"}
                  </strong>
                  <p>
                    <b>{actorName}</b>
                    {isRemoval
                      ? " removed "
                      : isRoleChange
                        ? " changed the role of "
                        : activity.activity_type === "membership_approved"
                          ? " approved the request from "
                          : activity.activity_type === "membership_rejected"
                            ? " rejected the request from "
                            : " added or updated "}
                    <b>{targetName}</b>
                    {isRoleChange && typeof activity.details?.new_role === "string"
                      ? ` to ${activity.details.new_role}`
                      : ""}
                  </p>
                  <time dateTime={activity.created_at}>
                    {new Date(activity.created_at).toLocaleString()}
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
