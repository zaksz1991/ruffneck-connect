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

function connectionErrorMessage(rawMessage: string, action: "request" | "respond" | "chat") {
  const message = rawMessage.toLowerCase();

  if (message.includes("member_blocked") || message.includes("blocked")) {
    return "A private connection is unavailable because one of these accounts has blocked the other.";
  }

  if (message.includes("accept the connection request") || message.includes("connection must be accepted")) {
    return "Your connection is not accepted yet. The other member must accept the request before you can start a private chat.";
  }

  if (message.includes("member is unavailable") || message.includes("show_in_directory")) {
    return "This member is unavailable for connections or private messages.";
  }

  if (message.includes("authentication required") || message.includes("jwt")) {
    return "Your session has expired. Sign in again, then retry.";
  }

  if (message.includes("function") && (message.includes("does not exist") || message.includes("schema cache"))) {
    return "The connection database setup is incomplete. Check that the required Supabase function exists and is executable by authenticated users.";
  }

  if (action === "request") {
    return "The connection request could not be sent. Refresh the page and try again.";
  }
  if (action === "respond") {
    return "The connection request could not be updated. It may have already been processed; refresh the page and check its status.";
  }
  return "The private conversation could not be opened. Refresh the page and retry. If this continues, check the Supabase function and Vercel logs.";
}

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
      setError(connectionErrorMessage(statusError.message, "request"));
      return false;
    }

    const rows = (data ?? []) as ConnectionRecord[];
    setConnection(rows[0] ?? null);
    setError("");
    return true;
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
        setError(connectionErrorMessage(statusError.message, "request"));
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
      setError(connectionErrorMessage(requestError.message, "request"));
    } else {
      const rows = (data ?? []) as ConnectionRecord[];
      const nextConnection = rows[0] ?? null;
      if (nextConnection) setConnection(nextConnection);

      setMessage(
        nextConnection?.direction === "incoming"
          ? "This member has already sent you a request. Accept it below."
          : nextConnection?.status === "accepted"
            ? "You are already connected. You can now open a private chat."
            : "Connection request sent. You can chat privately after the other member accepts."
      );
      await loadStatus();
      router.refresh();
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
      setError(connectionErrorMessage(responseError.message, "respond"));
    } else {
      await loadStatus();
      setMessage(
        accept
          ? "Connection accepted. You can now open a private chat."
          : "Connection request declined."
      );
      router.refresh();
    }

    setWorking(false);
  }

  async function openConversation() {
    setWorking(true);
    setError("");
    setMessage("");

    const supabase = createClient();
    const { data, error: conversationError } = await supabase.rpc(
      "get_or_create_direct_conversation",
      { p_other_user_id: otherUserId }
    );

    if (conversationError) {
      console.error("Open direct conversation failed:", conversationError.message);
      setError(connectionErrorMessage(conversationError.message, "chat"));
      setWorking(false);
      return;
    }

    if (typeof data !== "string" || !data.trim()) {
      setError("The chat function returned no conversation ID. Check get_or_create_direct_conversation in Supabase.");
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
    <div className="member-connection-actions" aria-live="polite">
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
      {error && <p className="connection-action-error" role="alert">{error}</p>}
    </div>
  );
}
