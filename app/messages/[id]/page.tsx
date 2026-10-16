import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

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
  edited_at: string | null;
  deleted_at: string | null;
};

type Conversation = {
  id: string;
  conversation_type: "direct" | "intent";
  intent_id: string | null;
  title: string | null;
  created_at: string;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationPage({
  params,
}: PageProps) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    notFound();
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      `/login?next=${encodeURIComponent(`/messages/${id}`)}`
    );
  }

  const {
    data: conversation,
    error: conversationError,
  } = await supabase
    .from("conversations")
    .select(
      "id, conversation_type, intent_id, title, created_at"
    )
    .eq("id", id)
    .maybeSingle();

  if (conversationError) {
    console.error(
      "Failed to load conversation:",
      conversationError.message
    );
  }

  if (!conversation) {
    notFound();
  }

  const currentConversation = conversation as Conversation;
  const {
    data: ownParticipant,
    error: participantError,
  } = await supabase
    .from("conversation_participants")
    .select("user_id, status")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (participantError || !ownParticipant) {
    notFound();
  }

  // Only this membership-checked RPC may reveal other participants' names
  // and avatars; direct table reads are intentionally limited by RLS.
  const {
    data: participantRows,
    error: participantProfilesError,
  } = await supabase.rpc(
    "get_conversation_participants",
    { p_conversation_id: id }
  );

  if (participantProfilesError) {
    console.error(
      "Failed to load conversation participant profiles:",
      participantProfilesError.message
    );
  }

  const participants =
    (participantRows ?? []) as ConversationParticipantProfile[];
  const otherParticipants = participants.filter(
    (participant) => participant.user_id !== user.id
  );
  const otherNames = otherParticipants.map(
    (participant) =>
      participant.full_name?.trim() || "RuffNeck member"
  );

  const conversationTitle =
    currentConversation.conversation_type === "intent"
      ? currentConversation.title || "Intent conversation"
      : otherNames.join(", ") || "Direct conversation";

  const {
    data: messageRows,
    error: messagesError,
  } = await supabase
    .from("messages")
    .select(
      "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at"
    )
    .eq("conversation_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: true })
    .limit(200);

  if (messagesError) {
    console.error(
      "Failed to load messages:",
      messagesError.message
    );
  }

  const messages = (messageRows ?? []) as Message[];

  return (
    <main className="page-shell">
      <section className="section">
        <Link href="/messages" className="back-link">
          ← All messages
        </Link>

        <div className="conversation-page-header">
          <div>
            <p className="eyebrow">
              {currentConversation.conversation_type === "intent"
                ? "INTENT CONVERSATION"
                : "PRIVATE CONVERSATION"}
            </p>

            <h1>{conversationTitle}</h1>
            <p className="muted">
              Messages are visible to active participants in this
              conversation.
            </p>
          </div>
        </div>

        <div className="message-panel">
          <div className="message-list" aria-live="polite">
            {messages.length === 0 ? (
              <div className="empty-state">
                <h2>Start the conversation</h2>
                <p className="muted">
                  Send a message to begin discussing your shared
                  interests or intention.
                </p>
              </div>
            ) : (
              messages.map((message) => {
                const isOwnMessage =
                  message.sender_id === user.id;
                const senderName = isOwnMessage
                  ? "You"
                  : participants.find(
                      (participant) =>
                        participant.user_id === message.sender_id
                    )?.full_name?.trim() || "RuffNeck member";

                return (
                  <article
                    key={message.id}
                    className={`message-bubble ${
                      isOwnMessage
                        ? "message-own"
                        : "message-other"
                    }`}
                  >
                    <span className="message-sender">
                      {senderName}
                    </span>

                    <p>{message.body}</p>
                    <time dateTime={message.created_at}>
                      {new Date(
                        message.created_at
                      ).toLocaleString("en-NG", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                    </time>
                  </article>
                );
              })
            )}
          </div>

          <form
            action={`/api/messages/${id}/send`}
            method="post"
            className="message-compose"
          >
            <label htmlFor="message-body">
              Your message
            </label>

            <textarea
              id="message-body"
              name="body"
              minLength={1}
              maxLength={5000}
              rows={3}
              placeholder="Write a message..."
              required
            />
            <div className="message-compose-footer">
              <span className="muted">
                Maximum 5,000 characters
              </span>

              <button
                type="submit"
                className="button-primary"
              >
                Send message
              </button>
            </div>
          </form>
        </div>
      </section>
    </main>
  );
}
