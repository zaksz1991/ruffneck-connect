"use client";

import { useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ConversationRow = {
  id: string;
  conversation_type: "direct" | "intent";
  title: string | null;
  last_message_at: string | null;
};

type ParticipantProfile = {
  user_id: string;
  full_name: string | null;
};

type Destination = {
  id: string;
  label: string;
  lastMessageAt: string | null;
};

type Props = {
  sourceConversationId: string;
  messageId: string;
  currentUserId: string;
  disabled?: boolean;
};

export default function MessageForwardButton({
  sourceConversationId,
  messageId,
  currentUserId,
  disabled = false,
}: Props) {
  const supabase = useMemo(() => createClient(), []);
  const [open, setOpen] = useState(false);
  const [loadingDestinations, setLoadingDestinations] = useState(false);
  const [destinations, setDestinations] = useState<Destination[]>([]);
  const [selectedConversationId, setSelectedConversationId] = useState("");
  const [forwarding, setForwarding] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function openChooser() {
    setOpen(true);
    setNotice("");
    setError("");
    if (destinations.length > 0) return;

    setLoadingDestinations(true);
    try {
      const { data: participantRows, error: participantError } = await supabase
        .from("conversation_participants")
        .select("conversation_id")
        .eq("user_id", currentUserId)
        .eq("status", "active");

      if (participantError) throw new Error(participantError.message);
      const conversationIds = [...new Set(
        (participantRows ?? [])
          .map((row) => row.conversation_id as string)
          .filter((id) => id !== sourceConversationId)
      )];

      if (conversationIds.length === 0) {
        setDestinations([]);
        return;
      }

      const { data: conversationRows, error: conversationError } = await supabase
        .from("conversations")
        .select("id, conversation_type, title, last_message_at")
        .in("id", conversationIds)
        .order("last_message_at", { ascending: false, nullsFirst: false });

      if (conversationError) throw new Error(conversationError.message);

      const rows = (conversationRows ?? []) as ConversationRow[];
      const resolved = await Promise.all(rows.map(async (conversation) => {
        const title = conversation.title?.trim();
        if (title) {
          return {
            id: conversation.id,
            label: title,
            lastMessageAt: conversation.last_message_at,
          };
        }

        const { data: profiles, error: profileError } = await supabase.rpc(
          "get_conversation_participants",
          { p_conversation_id: conversation.id }
        );
        const participants = profileError
          ? []
          : ((profiles ?? []) as ParticipantProfile[]);
        const otherNames = participants
          .filter((participant) => participant.user_id !== currentUserId)
          .map((participant) => participant.full_name?.trim() || "RuffNeck member");

        return {
          id: conversation.id,
          label: otherNames.length > 0
            ? otherNames.join(", ")
            : conversation.conversation_type === "intent"
              ? "Intent conversation"
              : "Direct conversation",
          lastMessageAt: conversation.last_message_at,
        };
      }));

      setDestinations(resolved);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? `Unable to load conversations: ${loadError.message}`
          : "Unable to load conversations. Please try again."
      );
    } finally {
      setLoadingDestinations(false);
    }
  }

  async function forwardMessage() {
    if (!selectedConversationId || forwarding) return;
    setForwarding(true);
    setError("");
    setNotice("");

    try {
      const response = await fetch(`/api/messages/${sourceConversationId}/forward`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messageId,
          targetConversationId: selectedConversationId,
        }),
      });
      const result = (await response.json()) as { error?: string };

      if (!response.ok) {
        throw new Error(result.error || "Unable to forward this message.");
      }

      const destination = destinations.find((item) => item.id === selectedConversationId);
      setNotice(`Message forwarded to ${destination?.label ?? "the selected conversation"}.`);
      setOpen(false);
      setSelectedConversationId("");
    } catch (forwardError) {
      setError(
        forwardError instanceof Error
          ? forwardError.message
          : "Unable to forward this message. Please try again."
      );
    } finally {
      setForwarding(false);
    }
  }

  return (
    <>
      <button
        type="button"
        className="button-secondary"
        onClick={() => void openChooser()}
        disabled={disabled || forwarding}
        style={{ padding: "5px 10px", fontSize: 12 }}
      >
        Forward
      </button>
      {notice && (
        <span role="status" className="muted" style={{ alignSelf: "center", fontSize: 12 }}>
          {notice}
        </span>
      )}
      {open && (
        <div
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget && !forwarding) setOpen(false);
          }}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 1000,
            display: "grid",
            placeItems: "center",
            padding: 16,
            background: "rgba(0,0,0,0.48)",
          }}
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={`forward-title-${messageId}`}
            style={{
              width: "min(100%, 440px)",
              maxHeight: "min(80vh, 640px)",
              overflowY: "auto",
              boxSizing: "border-box",
              padding: 20,
              borderRadius: 14,
              background: "var(--surface, #fff)",
              color: "inherit",
              border: "1px solid var(--border, #d1d5db)",
              boxShadow: "0 18px 50px rgba(0,0,0,0.2)",
            }}
          >
            <h2 id={`forward-title-${messageId}`} style={{ marginTop: 0, marginBottom: 6 }}>
              Forward message
            </h2>
            <p className="muted" style={{ marginTop: 0, fontSize: 13 }}>
              Choose one of your other conversations. The message will be copied into it and labelled as forwarded.
            </p>

            {loadingDestinations ? (
              <p className="muted" role="status">Loading conversations…</p>
            ) : destinations.length === 0 ? (
              <p className="muted">No other active conversations are available.</p>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {destinations.map((destination) => (
                  <label
                    key={destination.id}
                    style={{
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                      padding: 10,
                      border: `1px solid ${selectedConversationId === destination.id ? "var(--cyan, #00b4d8)" : "var(--border, #d1d5db)"}`,
                      borderRadius: 9,
                      cursor: "pointer",
                    }}
                  >
                    <input
                      type="radio"
                      name={`forward-destination-${messageId}`}
                      value={destination.id}
                      checked={selectedConversationId === destination.id}
                      onChange={() => setSelectedConversationId(destination.id)}
                    />
                    <span style={{ overflowWrap: "anywhere" }}>{destination.label}</span>
                  </label>
                ))}
              </div>
            )}

            {error && (
              <p role="alert" style={{ color: "var(--danger, #b91c1c)", fontSize: 13 }}>
                {error}
              </p>
            )}

            <div style={{ display: "flex", justifyContent: "flex-end", gap: 8, marginTop: 18 }}>
              <button
                type="button"
                className="button-secondary"
                disabled={forwarding}
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="button-primary"
                disabled={forwarding || loadingDestinations || !selectedConversationId}
                onClick={() => void forwardMessage()}
              >
                {forwarding ? "Forwarding…" : "Forward message"}
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
