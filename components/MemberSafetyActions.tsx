"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type BlockStatus = {
  blocked_by_me: boolean;
  blocked_me: boolean;
};

type Props = {
  otherUserId: string;
  otherUserName: string;
};

export default function MemberSafetyActions({
  otherUserId,
  otherUserName,
}: Props) {
  const router = useRouter();
  const [status, setStatus] = useState<BlockStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStatus = useCallback(async () => {
    const supabase = createClient();
    const { data, error: loadError } = await supabase.rpc(
      "get_member_block_status",
      { p_other_user_id: otherUserId }
    );

    if (loadError) {
      setError("Privacy controls could not load. Run the member-blocking SQL setup, then refresh.");
      setStatus(null);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    setStatus(
      row
        ? {
            blocked_by_me: row.blocked_by_me === true,
            blocked_me: row.blocked_me === true,
          }
        : { blocked_by_me: false, blocked_me: false }
    );
    setError("");
  }, [otherUserId]);

  useEffect(() => {
    let active = true;

    async function load() {
      setLoading(true);
      const supabase = createClient();
      const { data, error: loadError } = await supabase.rpc(
        "get_member_block_status",
        { p_other_user_id: otherUserId }
      );
      if (!active) return;

      if (loadError) {
        setError("Privacy controls could not load. Run the member-blocking SQL setup, then refresh.");
        setStatus(null);
      } else {
        const row = Array.isArray(data) ? data[0] : data;
        setStatus(
          row
            ? {
                blocked_by_me: row.blocked_by_me === true,
                blocked_me: row.blocked_me === true,
              }
            : { blocked_by_me: false, blocked_me: false }
        );
        setError("");
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [otherUserId]);

  async function blockMember() {
    const confirmed = window.confirm(
      `Block ${otherUserName}? New direct messages between you will be prevented. You can unblock this member later.`
    );
    if (!confirmed) return;

    setWorking(true);
    setError("");
    setNotice("");
    const supabase = createClient();
    const { error: blockError } = await supabase.rpc("block_member", {
      p_target_user_id: otherUserId,
    });

    if (blockError) {
      setError("This member could not be blocked. Please try again.");
    } else {
      await loadStatus();
      setNotice(`You blocked ${otherUserName}. New direct messages are disabled between you.`);
      router.refresh();
    }
    setWorking(false);
  }

  async function unblockMember() {
    const confirmed = window.confirm(`Unblock ${otherUserName}? They may be able to message you again if your connection is accepted.`);
    if (!confirmed) return;

    setWorking(true);
    setError("");
    setNotice("");
    const supabase = createClient();
    const { error: unblockError } = await supabase.rpc("unblock_member", {
      p_target_user_id: otherUserId,
    });

    if (unblockError) {
      setError("This member could not be unblocked. Please try again.");
    } else {
      await loadStatus();
      setNotice(`${otherUserName} has been unblocked.`);
      router.refresh();
    }
    setWorking(false);
  }

  return (
    <section
      className="feature-card"
      aria-label="Member privacy controls"
      style={{ marginTop: 16, marginBottom: 18, padding: 16 }}
    >
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, flexWrap: "wrap" }}>
        <div style={{ minWidth: 220, flex: 1 }}>
          <p className="eyebrow" style={{ marginBottom: 4 }}>PRIVACY & SAFETY</p>
          <h2 style={{ fontSize: "1rem", margin: 0 }}>Control contact with {otherUserName}</h2>
          {status?.blocked_by_me && (
            <p className="muted" style={{ margin: "6px 0 0" }}>
              You have blocked this member. New direct messages between you are disabled.
            </p>
          )}
          {!status?.blocked_by_me && status?.blocked_me && (
            <p className="muted" style={{ margin: "6px 0 0" }}>
              This member has blocked you. New direct messages between you are disabled.
            </p>
          )}
        </div>

        {loading ? (
          <button className="button button-secondary" type="button" disabled>
            Checking…
          </button>
        ) : status?.blocked_by_me ? (
          <button className="button button-secondary" type="button" onClick={unblockMember} disabled={working}>
            {working ? "Saving…" : "Unblock member"}
          </button>
        ) : (
          <button className="button button-secondary" type="button" onClick={blockMember} disabled={working || !status}>
            {working ? "Blocking…" : "Block member"}
          </button>
        )}
      </div>

      {notice && <p role="status" className="muted" style={{ margin: "10px 0 0" }}>{notice}</p>}
      {error && <p role="alert" className="muted" style={{ margin: "10px 0 0" }}>{error}</p>}
    </section>
  );
}
