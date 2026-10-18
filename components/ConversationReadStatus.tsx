"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ReadReceipt = {
  participant_user_id: string;
  participant_name: string;
  last_read_at: string | null;
};

type MessageEvent = {
  sender_id?: string;
  created_at?: string;
};

type Props = {
  conversationId: string;
  currentUserId: string;
  initialLatestOwnMessageAt: string | null;
};

function formatReadTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "recently";

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ConversationReadStatus({
  conversationId,
  currentUserId,
  initialLatestOwnMessageAt,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [receipts, setReceipts] = useState<ReadReceipt[]>([]);
  const [latestOwnMessageAt, setLatestOwnMessageAt] = useState<string | null>(
    initialLatestOwnMessageAt
  );
  const [connectionState, setConnectionState] = useState<
    "Connecting" | "Live" | "Refreshing"
  >("Connecting");
  const [loadError, setLoadError] = useState("");

  useEffect(() => {
    let disposed = false;

    async function refreshReceipts() {
      const { data, error } = await supabase.rpc(
        "get_conversation_read_receipts",
        { p_conversation_id: conversationId }
      );

      if (disposed) return;

      if (error) {
        console.error("Unable to load conversation read receipts:", error.message);
        setLoadError("Read status is temporarily unavailable.");
        return;
      }

      setLoadError("");
      setReceipts((data ?? []) as ReadReceipt[]);
    }

    const channel = supabase
      .channel(`conversation-read-status:${conversationId}:${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const message = payload.new as unknown as MessageEvent;
          if (message.sender_id === currentUserId && message.created_at) {
            setLatestOwnMessageAt((previous) => {
              if (!previous) return message.created_at ?? null;
              return new Date(message.created_at as string).getTime() >
                new Date(previous).getTime()
                ? (message.created_at as string)
                : previous;
            });
          }
          void refreshReceipts();
        }
      )
      .subscribe((status) => {
        if (disposed) return;

        if (status === "SUBSCRIBED") {
          setConnectionState("Live");
          void refreshReceipts();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setConnectionState("Refreshing");
        } else {
          setConnectionState("Connecting");
        }
      });

    const interval = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshReceipts();
      }
    }, 12000);

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refreshReceipts();
      }
    };
    document.addEventListener("visibilitychange", onVisibilityChange);

    void refreshReceipts();

    return () => {
      disposed = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, supabase]);

  const readReceiptState = useMemo(() => {
    if (!latestOwnMessageAt) return null;
    const messageTime = new Date(latestOwnMessageAt).getTime();

    return receipts.map((receipt) => ({
      ...receipt,
      hasSeenLatestMessage:
        Boolean(receipt.last_read_at) &&
        new Date(receipt.last_read_at as string).getTime() >= messageTime,
    }));
  }, [latestOwnMessageAt, receipts]);

  let message = "Send a message to see read confirmations.";
  if (loadError) {
    message = loadError;
  } else if (latestOwnMessageAt && readReceiptState?.length === 0) {
    message = "No other active participants are available for read status.";
  } else if (latestOwnMessageAt && readReceiptState) {
    const seenReceipts = readReceiptState.filter(
      (receipt) => receipt.hasSeenLatestMessage
    );

    if (readReceiptState.length === 1) {
      const receipt = readReceiptState[0];
      message = receipt.hasSeenLatestMessage && receipt.last_read_at
        ? `Seen by ${receipt.participant_name} · ${formatReadTime(receipt.last_read_at)}`
        : `${receipt.participant_name} has not seen your latest message yet.`;
    } else {
      message = seenReceipts.length > 0
        ? `Seen by ${seenReceipts.length} of ${readReceiptState.length} other participants.`
        : `Not seen yet by the ${readReceiptState.length} other participants.`;
    }
  }

  return (
    <div
      className="muted"
      role="status"
      aria-live="polite"
      style={{
        padding: "8px 24px 12px",
        fontSize: 12,
        borderTop: "1px solid var(--border, #e5e7eb)",
      }}
    >
      <span>{message}</span>
      <span style={{ marginLeft: 8, opacity: 0.75 }}>
        {connectionState === "Live" ? "Live read status" : "Read status refreshing"}
      </span>
    </div>
  );
}
