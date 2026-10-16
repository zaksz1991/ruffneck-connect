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

type EditResponse = {
  message?: Message;
  error?: string;
};

type DeleteResponse = {
  deleted?: boolean;
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

  return [...byId.values()].sort((left, right) => {
    const timeDifference =
      new Date(left.created_at).getTime() -
      new Date(right.created_at).getTime();

    return timeDifference || left.id.localeCompare(right.id);
  });
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
  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [deletingMessageId, setDeletingMessageId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [realtimeStatus, setRealtimeStatus] = useState<
    "Connecting" | "Connected" | "Reconnecting"
  >("Connecting");
  const [hasMoreMessages, setHasMoreMessages] = useState(
    initialMessages.length >= 200
  );
  const [loadingOlderMessages, setLoadingOlderMessages] = useState(false);
  const listRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const pendingOlderScroll = useRef<{
    scrollHeight: number;
    scrollTop: number;
  } | null>(null);
  const shouldAutoScroll = useRef(true);

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
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(200);

      if (disposed) return;

      if (loadError) {
        console.error("Unable to refresh conversation messages:", loadError.message);
        return;
      }

      const latestRows = ((data ?? []) as Message[]).reverse();

      if (latestRows.length < 200) {
        setHasMoreMessages(false);
      }

      // Keep any earlier pages the user has already loaded. A refresh should
      // update the latest snapshot, not replace the entire visible history.
      setMessages((current) => {
        const byId = new Map<string, Message>(
          current.map((message) => [message.id, message])
        );

        for (const message of latestRows) {
          byId.set(message.id, message);
        }

        for (const [messageId, message] of liveOverrides.entries()) {
          if (message) {
            byId.set(messageId, message);
          } else {
            byId.delete(messageId);
          }
        }

        return sortAndLimit([...byId.values()]);
      });
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

          const list = listRef.current;
          const distanceFromBottom = list
            ? list.scrollHeight - list.scrollTop - list.clientHeight
            : 0;
          shouldAutoScroll.current =
            incoming.sender_id === currentUserId || distanceFromBottom < 160;

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
    const list = listRef.current;
    const previousScroll = pendingOlderScroll.current;

    if (list && previousScroll) {
      pendingOlderScroll.current = null;
      list.scrollTop =
        previousScroll.scrollTop +
        (list.scrollHeight - previousScroll.scrollHeight);
      return;
    }

    if (shouldAutoScroll.current) {
      bottomRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
      shouldAutoScroll.current = false;
    }
  }, [messages]);

  async function loadOlderMessages() {
    if (loadingOlderMessages || !hasMoreMessages || messages.length === 0) {
      return;
    }

    const oldestMessage = messages[0];
    const list = listRef.current;
    if (!oldestMessage || !list) return;

    setLoadingOlderMessages(true);
    setError("");

    try {
      const { data, error: historyError } = await supabase
        .from("messages")
        .select(
          "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at"
        )
        .eq("conversation_id", conversationId)
        .is("deleted_at", null)
        .or(
          `created_at.lt.${oldestMessage.created_at},and(created_at.eq.${oldestMessage.created_at},id.lt.${oldestMessage.id})`
        )
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(50);

      if (historyError) {
        throw new Error(historyError.message);
      }

      const olderMessages = ((data ?? []) as Message[]).reverse();

      if (olderMessages.length === 0) {
        setHasMoreMessages(false);
        return;
      }

      pendingOlderScroll.current = {
        scrollHeight: list.scrollHeight,
        scrollTop: list.scrollTop,
      };
      shouldAutoScroll.current = false;
      setMessages((current) => mergeMessages(olderMessages, current));

      if (olderMessages.length < 50) {
        setHasMoreMessages(false);
      }
    } catch (historyError) {
      setError(
        historyError instanceof Error
          ? `Unable to load earlier messages: ${historyError.message}`
          : "Unable to load earlier messages. Please try again."
      );
    } finally {
      setLoadingOlderMessages(false);
    }
  }

  function beginEdit(message: Message) {
    setError("");
    setEditingMessageId(message.id);
    setEditDraft(message.body);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditDraft("");
  }

  async function saveEdit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const messageId = editingMessageId;
    const body = editDraft.trim();

    if (!messageId || savingEdit) return;
    if (!body || body.length > 5000) {
      setError("Edited messages must contain between 1 and 5,000 characters.");
      return;
    }

    setSavingEdit(true);
    setError("");

    try {
      const response = await fetch(`/api/messages/${conversationId}/edit`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, body }),
      });
      const result = (await response.json()) as EditResponse;

      if (!response.ok || !result.message) {
        throw new Error(result.error || "Unable to edit this message.");
      }

      liveOverrides.set(result.message.id, result.message);
      setMessages((current) => mergeMessages(current, [result.message as Message]));
      setEditingMessageId(null);
      setEditDraft("");
    } catch (editError) {
      setError(
        editError instanceof Error
          ? editError.message
          : "Unable to edit this message. Please try again."
      );
    } finally {
      setSavingEdit(false);
    }
  }

  async function deleteMessage(messageId: string) {
    if (deletingMessageId) return;

    const confirmed = window.confirm(
      "Delete this message? It will be hidden from the conversation."
    );
    if (!confirmed) return;

    setDeletingMessageId(messageId);
    setError("");

    try {
      const response = await fetch(`/api/messages/${conversationId}/delete`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId }),
      });
      const result = (await response.json()) as DeleteResponse;

      if (!response.ok || !result.deleted) {
        throw new Error(result.error || "Unable to delete this message.");
      }

      liveOverrides.set(messageId, null);
      setMessages((current) =>
        current.filter((message) => message.id !== messageId)
      );

      if (editingMessageId === messageId) cancelEdit();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Unable to delete this message. Please try again."
      );
    } finally {
      setDeletingMessageId(null);
    }
  }

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
      shouldAutoScroll.current = true;
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

      <div
        ref={listRef}
        className="message-list"
        aria-live="polite"
        aria-relevant="additions text"
      >
        {hasMoreMessages && messages.length > 0 && (
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
            <button
              type="button"
              className="button-secondary"
              onClick={() => void loadOlderMessages()}
              disabled={loadingOlderMessages}
            >
              {loadingOlderMessages ? "Loading earlier messages…" : "Load earlier messages"}
            </button>
          </div>
        )}
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
                {editingMessageId === message.id ? (
                  <form onSubmit={saveEdit} style={{ marginTop: 8 }}>
                    <label
                      htmlFor={`edit-message-${message.id}`}
                      className="muted"
                      style={{ display: "block", marginBottom: 6, fontSize: 12 }}
                    >
                      Edit message
                    </label>
                    <textarea
                      id={`edit-message-${message.id}`}
                      value={editDraft}
                      onChange={(event) => setEditDraft(event.target.value)}
                      maxLength={5000}
                      rows={3}
                      required
                      disabled={savingEdit}
                      style={{ width: "100%", boxSizing: "border-box" }}
                    />
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: 8,
                        marginTop: 8,
                      }}
                    >
                      <button
                        type="button"
                        className="button-secondary"
                        onClick={cancelEdit}
                        disabled={savingEdit}
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="button-primary"
                        disabled={savingEdit || !editDraft.trim()}
                      >
                        {savingEdit ? "Saving…" : "Save edit"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
                    {message.body}
                  </p>
                )}
                <time dateTime={message.created_at}>
                  {formatDate(message.created_at)}
                  {message.edited_at ? " · edited" : ""}
                </time>
                {isOwnMessage && editingMessageId !== message.id && (
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "flex-end",
                      gap: 8,
                      marginTop: 8,
                    }}
                  >
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => beginEdit(message)}
                      disabled={Boolean(deletingMessageId) || savingEdit}
                      style={{ padding: "5px 10px", fontSize: 12 }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="button-secondary"
                      onClick={() => void deleteMessage(message.id)}
                      disabled={Boolean(deletingMessageId) || savingEdit}
                      style={{ padding: "5px 10px", fontSize: 12 }}
                    >
                      {deletingMessageId === message.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                )}
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
