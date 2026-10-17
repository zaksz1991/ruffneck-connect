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

const LABELS: Record<string, string> = {
member_added: "Added a member",
member_removed: "Removed a member",
membership_approved: "Approved a membership request",
membership_rejected: "Rejected a membership request",
};

export default function CommunityActivityLog({
communityId,
}: Props) {
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
      .select(
        "id, actor_id, target_user_id, activity_type, details, created_at"
      )
      .eq("community_id", communityId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (activityError) throw activityError;

    const rows = (data ?? []) as Activity[];
    const ids = Array.from(
      new Set(
        rows.flatMap((row) =>
          [row.actor_id, row.target_user_id].filter(
            (id): id is string => Boolean(id)
          )
        )
      )
    );

    let profileNames: Record<string, string> = {};

    if (ids.length > 0) {
      const { data: profiles, error: profileError } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);

      if (profileError) {
        // Keep the activity log usable if profile access is restricted.
        profileNames = {};
      } else {
        profileNames = Object.fromEntries(
          ((profiles ?? []) as Profile[]).map((profile) => [
            profile.id,
            profile.full_name?.trim() || "Community member",
          ])
        );
      }
    }

    if (!cancelled) {
      setActivities(rows);
      setNames(profileNames);
    }
  } catch {
    if (!cancelled) {
      setError("Activity history could not be loaded.");
    }
  } finally {
    if (!cancelled) setLoading(false);
  }
}

void loadActivities();

return () => {
  cancelled = true;
};
```

}, [communityId]);

return ( <section className="community-activity"> <div className="community-activity__header"> <div> <span className="community-activity__eyebrow">
COMMUNITY MANAGEMENT </span> <h2>Activity history</h2> <p>Recent membership changes and decisions.</p> </div>

```
    <span className="community-activity__count">
      {activities.length} {activities.length === 1 ? "event" : "events"}
    </span>
  </div>

  {loading ? (
    <p className="community-activity__message">
      Loading activity history…
    </p>
  ) : error ? (
    <p className="community-activity__message" role="alert">
      {error}
    </p>
  ) : activities.length === 0 ? (
    <div className="community-activity__empty">
      <h3>No activity recorded yet</h3>
      <p>
        New membership changes will appear here once they have been
        recorded.
      </p>
    </div>
  ) : (
    <div className="community-activity__list">
      {activities.map((activity) => {
        const removed = activity.activity_type === "member_removed";
        const actor = activity.actor_id
          ? names[activity.actor_id] || "Community manager"
          : "Former account";
        const target = activity.target_user_id
          ? names[activity.target_user_id] || "Community member"
          : "Unknown member";

        return (
          <article
            className="community-activity__item"
            key={activity.id}
          >
            <span
              className="community-activity__marker"
              aria-hidden="true"
            >
              {removed ? "−" : "+"}
            </span>

            <div className="community-activity__content">
              <strong>
                {LABELS[activity.activity_type] || "Community activity"}
              </strong>

              <p>
                <b>{actor}</b>
                {removed ? " removed " : " added or updated "}
                <b>{target}</b>
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
