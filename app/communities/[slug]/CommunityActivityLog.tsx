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

type Props = {
communityId: string;
};

const ACTIVITY_LABELS: Record<string, string> = {
member_added: "Added a member",
member_removed: "Removed a member",
membership_approved: "Approved a membership request",
membership_rejected: "Rejected a membership request",
};

export default function CommunityActivityLog({
communityId,
}: Props) {
const [activities, setActivities] = useState<Activity[]>([]);
const [loading, setLoading] = useState(true);
const [error, setError] = useState("");

useEffect(() => {
let cancelled = false;

async function loadActivities() {
  setLoading(true);
  setError("");

  try {
    const supabase = createClient();

    const { data, error: queryError } = await supabase
      .from("community_activity_logs")
      .select(
        "id, actor_id, target_user_id, activity_type, details, created_at"
      )
      .eq("community_id", communityId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (queryError) throw queryError;

    if (!cancelled) {
      setActivities((data ?? []) as Activity[]);
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
COMMUNITY MANAGEMENT </span> <h2>Activity history</h2> <p>Recent membership changes in this community.</p> </div>

```
    <span className="community-activity__count">
      {activities.length} events
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
        Membership changes recorded after audit logging was enabled
        will appear here.
      </p>
    </div>
  ) : (
    <div className="community-activity__list">
      {activities.map((activity) => (
        <article
          className="community-activity__item"
          key={activity.id}
        >
          <span
            className="community-activity__marker"
            aria-hidden="true"
          >
            {activity.activity_type === "member_removed"
              ? "−"
              : "＋"}
          </span>

          <div className="community-activity__content">
            <strong>
              {ACTIVITY_LABELS[activity.activity_type] ??
                "Community activity"}
            </strong>

            <p>
              {activity.target_user_id
                ? `Member ID: ${activity.target_user_id}`
                : "No member specified"}
            </p>

            <span>
              {new Date(activity.created_at).toLocaleString()}
            </span>
          </div>
        </article>
      ))}
    </div>
  )}
</section>

);
}
