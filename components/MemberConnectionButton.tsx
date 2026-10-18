"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type ConnectionStatus = "pending" | "accepted" | "declined" | "cancelled";
type ConnectionDirection = "incoming" | "outgoing" | "connected";

type ConnectionRecord = {
  connection_id: string;
  status: ConnectionStatus;
  direction: ConnectionDirection;
  created_at: string;
};

type Props = {
  otherUserId: string;
  initialConnection?: ConnectionRecord | null;
  initialLoaded?: boolean;
};

export default function MemberConnectionButton({
  otherUserId,
  initialConnection = null,
  initialLoaded = false,
}: Props) {
  const router = useRouter();
  const [connection, setConnection] = useState<ConnectionRecord | null>(initialConnection);
  const [loading, setLoading] = useState(!initialLoaded);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadStatus = useCallback(async () => {
    const supabase = createClient();
    const { data, error: statusError } = await supabase.rpc(
      "get_member_connection_status",
      { p_other_user_id: otherUserId }
    );

    if (statusError) {
      setError("Connection status could not be loaded. Refresh and try again.");
      return;
    }

    const rows = (data ?? []) as ConnectionRecord[];
    setConnection(rows[0] ?? null);
    setError("");
  }, [otherUserId]);

  useEffect(() => {
    let active = true;

    async function load() {
      if (initialLoaded) {
        setConnection(initialConnection ?? null);
        setLoading(false);
        return;
      }

      setLoading(true);
      const supabase = createClient();
      const { data, error: statusError } = await supabase.rpc(
        "get_member_connection_status",
        { p_other_user_id: otherUserId }
      );

      if (!active) return;
      if (statusError) {
        setError("Connection status could not be loaded. Refresh and try again.");
      } else {
        const rows = (data ?? []) as ConnectionRecord[];
        setConnection(rows[0] ?? null);
        setError("");
      }
      setLoading(false);
    }

    void load();
    return () => {
      active = false;
    };
  }, [otherUserId, initialConnection, initialLoaded]);

  async function requestConnection() {
    setWorking(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    const { data, error: requestError } = await supabase.rpc(
      "request_member_connection",
      { p_recipient_id: otherUserId }
    );

    if (requestError) {
      setError("The connection request could not be sent. Please try again.");
    } else {
      const rows = (data ?? []) as ConnectionRecord[];
      setConnection(rows[0] ?? null);
      setMessage(rows[0]?.direction === "incoming"
        ? "This member has already sent you a request. You can accept it below."
        : rows[0]?.status === "accepted"
          ? "You are already connected."
          : "Connection request sent.");
      await loadStatus();
    }
    setWorking(false);
  }

  async function respondToRequest(accept: boolean) {
    if (!connection) return;
    setWorking(true);
    setError("");
    setMessage("");
    const supabase = createClient();
    const { error: responseError } = await supabase.rpc(
      "respond_to_member_connection",
      {
        p_connection_id: connection.connection_id,
        p_accept: accept,
      }
    );

    if (responseError) {
      setError(accept
        ? "The connection request could not be accepted."
        : "The connection request could not be declined.");
    } else {
      await loadStatus();
      setMessage(accept ? "Connection accepted. You can now message this member." : "Connection request declined.");
      router.refresh();
    }
    setWorking(false);
  }

  async function openConversation() {
    setWorking(true);
    setError("");
    const supabase = createClient();
    const { data, error: conversationError } = await supabase.rpc(
      "get_or_create_direct_conversation",
      { p_other_user_id: otherUserId }
    );

    if (conversationError || typeof data !== "string") {
      setError("A private conversation could not be opened. Confirm that the connection is accepted, then try again.");
      setWorking(false);
      return;
    }

    router.push(`/messages/${data}`);
    router.refresh();
  }

  const accepted = connection?.status === "accepted";
  const incomingPending = connection?.status === "pending" && connection.direction === "incoming";
  const outgoingPending = connection?.status === "pending" && connection.direction === "outgoing";

  return (
    <div className="member-connection-actions">
      {loading ? (
        <button className="button button-secondary" type="button" disabled>
          Checking connection…
        </button>
      ) : accepted ? (
        <>
          <span className="status-badge status-active">Connected</span>
          <button className="button button-primary" type="button" onClick={openConversation} disabled={working}>
            {working ? "Opening chat…" : "Message"}
          </button>
        </>
      ) : incomingPending ? (
        <>
          <span className="status-badge status-pending">Connection request received</span>
          <button className="button button-primary" type="button" onClick={() => respondToRequest(true)} disabled={working}>
            {working ? "Saving…" : "Accept"}
          </button>
          <button className="button button-secondary" type="button" onClick={() => respondToRequest(false)} disabled={working}>
            Decline
          </button>
        </>
      ) : outgoingPending ? (
        <span className="status-badge status-pending">Request sent · awaiting response</span>
      ) : (
        <button className="button button-primary" type="button" onClick={requestConnection} disabled={working}>
          {working ? "Sending…" : connection?.status === "declined" || connection?.status === "cancelled" ? "Connect again" : "Connect"}
        </button>
      )}

      {message && <p className="muted" role="status">{message}</p>}
      {error && <p role="alert" className="muted">{error}</p>}
    </div>
  );
}
