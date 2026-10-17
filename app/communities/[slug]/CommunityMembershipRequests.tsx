"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type MembershipRequest = {
  user_id: string;
  joined_at: string | null;
};

type MemberProfile = {
  id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Props = {
  communityId: string;
};

function formatRequestDate(value: string | null) {
  if (!value) return "Request date unavailable";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Request date unavailable";

  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

export default function CommunityMembershipRequests({
  communityId,
}: Props) {
  const router = useRouter();
  const [requests, setRequests] = useState<MembershipRequest[]>([]);
  const [profiles, setProfiles] = useState<Record<string, MemberProfile>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const loadRequests = useCallback(async (cancelled?: () => boolean) => {
    setLoading(true);
    setLoadError("");

    try {
      const supabase = createClient();
      const { data, error } = await supabase
        .from("community_members")
        .select("user_id, joined_at")
        .eq("community_id", communityId)
        .eq("status", "pending")
        .order("joined_at", { ascending: true });

      if (error) throw error;

      const rows = (data ?? []) as MembershipRequest[];
      const ids = [...new Set(rows.map((row) => row.user_id).filter(Boolean))];
      const profileMap: Record<string, MemberProfile> = {};

      if (ids.length > 0) {
        const { data: profileRows, error: profileError } = await supabase
          .from("profiles")
          .select("id, full_name, avatar_url")
          .in("id", ids);

        if (!profileError && profileRows) {
          for (const profile of profileRows as MemberProfile[]) {
            profileMap[profile.id] = profile;
          }
        }
      }

      if (!cancelled?.()) {
        setRequests(rows);
        setProfiles(profileMap);
      }
    } catch (error) {
      if (!cancelled?.()) {
        setLoadError(
          error instanceof Error
            ? error.message
            : "Pending requests could not be loaded. Check membership table permissions."
        );
      }
    } finally {
      if (!cancelled?.()) setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    let cancelled = false;
    void loadRequests(() => cancelled);
    return () => {
      cancelled = true;
    };
  }, [loadRequests]);

  async function decide(userId: string, approved: boolean) {
    setBusyUserId(userId);
    setActionError("");
    setMessage("");

    try {
      const supabase = createClient();
      const { error } = await supabase.rpc(
        "admin_decide_community_membership",
        {
          p_community_id: communityId,
          p_user_id: userId,
          p_approved: approved,
        }
      );

      if (error) throw error;

      const name = profiles[userId]?.full_name?.trim() || "The applicant";
      setRequests((current) => current.filter((request) => request.user_id !== userId));
      setMessage(
        approved
          ? `${name} was approved and added to the community.`
          : `${name}'s membership request was rejected.`
      );
      router.refresh();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "The membership decision could not be saved."
      );
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <section className="section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">ADMINISTRATION</span>
          <h2>Membership requests</h2>
          <p className="muted">
            Review people who have asked to join this community.
          </p>
        </div>
        <span className="status-badge status-pending">
          {requests.length} pending
        </span>
      </div>

      {message && (
        <p className="status-badge status-active" role="status">
          {message}
        </p>
      )}

      {actionError && (
        <p className="muted" role="alert">
          Decision failed: {actionError}
        </p>
      )}

      {loadError ? (
        <article className="feature-card">
          <h3>Requests could not be loaded</h3>
          <p className="muted">{loadError}</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void loadRequests()}
          >
            Try again
          </button>
        </article>
      ) : loading ? (
        <article className="feature-card">
          <p className="muted">Loading membership requests…</p>
        </article>
      ) : requests.length === 0 ? (
        <article className="feature-card">
          <h3>No pending requests</h3>
          <p className="muted">
            New membership requests will appear here when someone asks to join.
          </p>
        </article>
      ) : (
        <div className="member-list">
          {requests.map((request) => {
            const profile = profiles[request.user_id];
            const name = profile?.full_name?.trim() || "RuffNeck member";
            const busy = busyUserId === request.user_id;

            return (
              <article className="feature-card member-card" key={request.user_id}>
                <div className="member-card-profile">
                  {profile?.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className="member-avatar" src={profile.avatar_url} alt="" />
                  ) : (
                    <div className="member-avatar member-avatar-fallback" aria-hidden="true">
                      {name.charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="member-details">
                    <h3>{name}</h3>
                    <p className="muted">Requested {formatRequestDate(request.joined_at)}</p>
                    <span className="status-badge status-pending">Awaiting review</span>
                  </div>
                </div>

                <div className="hero-actions">
                  <button
                    className="button button-primary"
                    type="button"
                    disabled={busy || busyUserId !== null}
                    onClick={() => void decide(request.user_id, true)}
                  >
                    {busy ? "Saving…" : "Approve"}
                  </button>
                  <button
                    className="button button-secondary"
                    type="button"
                    disabled={busy || busyUserId !== null}
                    onClick={() => void decide(request.user_id, false)}
                  >
                    Reject
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
