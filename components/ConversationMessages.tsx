"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";
import { createClient } from "@/lib/supabase/client";

type ConversationParticipantProfile = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at?: string | null;
  deleted_at?: string | null;
};

type SendResponse = {
  message?: Message;
  error?: string;
};

type Props = {
  conversationId: string;
  currentUserId: string;
  initialMessages: Message[];
  participants: ConversationParticipantProfile[];
};

function sortAndLimit(messages: Message[]) {
  const byId = new Map<string, Message>();

  for (const message of messages) {
    if (!message.deleted_at) {
      byId.set(message.id, message);
    }
  }

  return [...byId.values()]
    .sort(
      (left, right) =>
        new Date(left.created_at).getTime() -
        new Date(right.created_at).getTime()
    )
    .slice(-200);
}

function mergeMessages(current: Message[], incoming: Message[]) {
  const byId = new Map(current.map((message) => [message.id, message]));

  for (const message of incoming) {
    if (message.deleted_at) {
      byId.delete(message.id);
    } else {
      byId.set(message.id, {
        ...byId.get(message.id),
        ...message,
      });
    }
  }

  return sortAndLimit([...byId.values()]);
}

function formatDate(value: string) {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Recently";
  }

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default function ConversationMessages({
  conversationId,
  currentUserId,
  initialMessages,
  participants,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [messages, setMessages] = useState<Message[]>(() =>
    sortAndLimit(initialMessages)
  );
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState<
    "Connecting" | "Connected" | "Reconnecting"
  >("Connecting");
  const bottomRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let disposed = false;

    // Records received after subscribing take precedence over the first
    // snapshot, covering changes that happen while that snapshot is loading.
    const liveOverrides = new Map<string, Message | null>();

    async function refreshMessages() {
      const { data, error: loadError } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at"
        )
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .limit(200);

      if (disposed) return;

      if (loadError) {
        console.error("Unable to refresh conversation messages:", loadError.message);
        return;
      }

      const byId = new Map<string, Message>(
        ((data ?? []) as Message[]).map((message) => [message.id, message])
      );

      for (const [messageId, message] of liveOverrides.entries()) {
        if (message) {
          byId.set(messageId, message);
        } else {
          byId.delete(messageId);
        }
      }

      setMessages(sortAndLimit([...byId.values()]));
    }

    async function markConversationRead() {
      if (disposed || document.visibilityState !== "visible") return;

      const { error: markReadError } = await supabase
        .from("conversation_participants")
        .update({ last_read_at: new Date().toISOString() })
        .eq("conversation_id", conversationId)
        .eq("user_id", currentUserId)
        .eq("status", "active");

      if (markReadError) {
        console.error(
          "Unable to update conversation read timestamp:",
          markReadError.message
        );
      }
    }

    // Opening a conversation marks currently visible messages as read.
    void markConversationRead();

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void markConversationRead();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    const channel = supabase
      .channel(`conversation-messages-${conversationId}-${currentUserId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const incoming = payload.new as unknown as Message;
          if (!incoming.id || incoming.deleted_at) return;

          liveOverrides.set(incoming.id, incoming);
          setMessages((current) => mergeMessages(current, [incoming]));
          if (incoming.sender_id !== currentUserId) {
            void markConversationRead();
          }
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const updated = payload.new as unknown as Message;
          if (!updated.id) return;

          if (updated.deleted_at) {
            liveOverrides.set(updated.id, null);
            setMessages((current) =>
              current.filter((message) => message.id !== updated.id)
            );
            return;
          }

          liveOverrides.set(updated.id, updated);
          setMessages((current) => mergeMessages(current, [updated]));
        }
      )
      .subscribe((status) => {
        if (disposed) return;

        if (status === "SUBSCRIBED") {
          setRealtimeStatus("Connected");
          void refreshMessages();
          void markConversationRead();
        } else if (
          status === "CHANNEL_ERROR" ||
          status === "TIMED_OUT" ||
          status === "CLOSED"
        ) {
          setRealtimeStatus("Reconnecting");
        } else {
          setRealtimeStatus("Connecting");
        }
      });

    return () => {
      disposed = true;
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      void supabase.removeChannel(channel);
    };
  }, [conversationId, currentUserId, supabase]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = draft.trim();

    if (!body || sending) return;

    if (body.length > 5000) {
      setError("Messages cannot exceed 5,000 characters.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const response = await fetch(`/api/messages/${conversationId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body }),
      });

      const result = (await response.json()) as SendResponse;

      if (!response.ok || !result.message) {
        throw new Error(result.error || "Unable to send your message.");
      }

      // Realtime and the HTTP response can race; merge by message ID to avoid
      // displaying the same message twice.
      setMessages((current) => mergeMessages(current, [result.message as Message]));
      setDraft("");
    } catch (sendError) {
      setError(
        sendError instanceof Error
          ? sendError.message
          : "Unable to send your message. Please try again."
      );
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="message-panel">
      <p
        className="muted"
        aria-live="polite"
        style={{ padding: "12px 24px 0", marginBottom: 0, fontSize: 12 }}
      >
        Live updates: {realtimeStatus}
      </p>

      <div className="message-list" aria-live="polite" aria-relevant="additions text">
        {messages.length === 0 ? (
          <div className="empty-state">
            <h2>Start the conversation</h2>
            <p className="muted">
              Send a message to begin discussing your shared interests or intention.
            </p>
          </div>
        ) : (
          messages.map((message) => {
            const isOwnMessage = message.sender_id === currentUserId;
            const senderName = isOwnMessage
              ? "You"
              : participants.find(
                  (participant) => participant.user_id === message.sender_id
                )?.full_name?.trim() || "RuffNeck member";

            return (
              <article
                key={message.id}
                className={`message-bubble ${
                  isOwnMessage ? "message-own" : "message-other"
                }`}
              >
                <span className="message-sender">{senderName}</span>
                <p>{message.body}</p>
                <time dateTime={message.created_at}>
                  {formatDate(message.created_at)}
                  {message.edited_at ? " · edited" : ""}
                </time>
              </article>
            );
          })
        )}
        <div ref={bottomRef} aria-hidden="true" />
      </div>

      {error && (
        <div
          className="alert alert-error"
          role="alert"
          style={{ margin: 16 }}
        >
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="message-compose">
        <label htmlFor="message-body">Your message</label>
        <textarea
          id="message-body"
          name="body"
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          minLength={1}
          maxLength={5000}
          rows={3}
          placeholder="Write a message..."
          required
          disabled={sending}
        />
        <div className="message-compose-footer">
          <span className="muted">
            {draft.trim().length}/5,000 characters
          </span>
          <button type="submit" className="button-primary" disabled={sending || !draft.trim()}>
            {sending ? "Sending…" : "Send message"}
          </button>
        </div>
      </form>
    </div>
  );
}
