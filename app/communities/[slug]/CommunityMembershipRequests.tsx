"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import styles from "./CommunityMembershipRequests.module.css";

type MembershipRequest = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
  joined_at: string | null;
};

type Props = { communityId: string };

function formatRequestDate(value: string | null) {
  if (!value) return "Date unavailable";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-NG", {
    day: "numeric", month: "short", year: "numeric",
    hour: "numeric", minute: "2-digit",
  }).format(date);
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}

export default function CommunityMembershipRequests({ communityId }: Props) {
  const router = useRouter();
  const [requests, setRequests] = useState<MembershipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [message, setMessage] = useState("");
  const [busyUserId, setBusyUserId] = useState<string | null>(null);

  const loadRequests = useCallback(async (isCancelled?: () => boolean) => {
    setLoading(true);
    setLoadError("");
    try {
      const supabase = createClient();
      const { data, error } = await supabase.rpc(
        "get_community_membership_requests",
        { p_community_id: communityId }
      );
      if (error) throw error;
      if (!isCancelled?.()) setRequests((data ?? []) as MembershipRequest[]);
    } catch (error) {
      if (!isCancelled?.()) {
        setLoadError(getErrorMessage(error, "Pending requests could not be loaded."));
      }
    } finally {
      if (!isCancelled?.()) setLoading(false);
    }
  }, [communityId]);

  useEffect(() => {
    let cancelled = false;
    void loadRequests(() => cancelled);
    return () => { cancelled = true; };
  }, [loadRequests]);

  async function decide(userId: string, approved: boolean) {
    setBusyUserId(userId);
    setActionError("");
    setMessage("");
    try {
      const supabase = createClient();
      const { error } = await supabase.rpc("admin_decide_community_membership", {
        p_community_id: communityId,
        p_user_id: userId,
        p_approved: approved,
      });
      if (error) throw error;

      const name = requests.find((item) => item.user_id === userId)?.full_name?.trim() || "The applicant";
      setRequests((current) => current.filter((item) => item.user_id !== userId));
      window.dispatchEvent(new Event("community-activity-refresh"));
      setMessage(approved ? `${name} was approved and added to the community.` : `${name}'s request was rejected.`);
      router.refresh();
    } catch (error) {
      setActionError(getErrorMessage(error, "The membership decision could not be saved."));
    } finally {
      setBusyUserId(null);
    }
  }

  return (
    <section className={styles.section} aria-labelledby="membership-requests-title">
      <div className={styles.header}>
        <div className={styles.headingCopy}>
          <span className={styles.eyebrow}>COMMUNITY ADMINISTRATION</span>
          <h2 id="membership-requests-title" className={styles.title}>Membership requests</h2>
          <p className={styles.description}>Review and decide who can join this community.</p>
        </div>
        <span className={styles.count} aria-live="polite">{requests.length} pending</span>
      </div>

      {message && <p className={styles.feedback} role="status">{message}</p>}
      {actionError && <p className={`${styles.feedback} ${styles.feedbackError}`} role="alert">Decision failed: {actionError}</p>}

      {loadError ? (
        <div className={styles.empty}>
          <h3 className={styles.emptyTitle}>Requests could not be loaded</h3>
          <p className={styles.emptyText}>{loadError}</p>
          <button className={`${styles.button} ${styles.reject} ${styles.retry}`} type="button" onClick={() => void loadRequests()}>
            Try again
          </button>
        </div>
      ) : loading ? (
        <div className={styles.empty} aria-live="polite">
          <p className={styles.emptyText}>Loading membership requests…</p>
        </div>
      ) : requests.length === 0 ? (
        <div className={styles.empty}>
          <h3 className={styles.emptyTitle}>No pending requests</h3>
          <p className={styles.emptyText}>New join requests will appear here for review.</p>
        </div>
      ) : (
        <div className={styles.list}>
          {requests.map((request) => {
            const name = request.full_name?.trim() || "RuffNeck member";
            const busy = busyUserId === request.user_id;
            return (
              <article className={styles.card} key={request.user_id}>
                <div className={styles.identity}>
                  {request.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.avatar} src={request.avatar_url} alt={`${name} profile`} />
                  ) : (
                    <div className={`${styles.avatar} ${styles.avatarFallback}`} aria-hidden="true">{name.charAt(0).toUpperCase()}</div>
                  )}
                  <div className={styles.details}>
                    <h3 className={styles.name}>{name}</h3>
                    <p className={styles.meta}>Requested {formatRequestDate(request.joined_at)}</p>
                    <span className={styles.pendingTag}>Awaiting review</span>
                  </div>
                </div>
                <div className={styles.actions}>
                  <button className={`${styles.button} ${styles.approve}`} type="button" disabled={busyUserId !== null} onClick={() => void decide(request.user_id, true)}>
                    {busy ? "Saving…" : "Approve"}
                  </button>
                  <button className={`${styles.button} ${styles.reject}`} type="button" disabled={busyUserId !== null} onClick={() => void decide(request.user_id, false)}>
                    {busy ? "Saving…" : "Reject"}
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
