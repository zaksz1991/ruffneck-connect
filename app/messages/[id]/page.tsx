import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConversationMessages from "@/components/ConversationMessages";
import ConversationReadStatus from "@/components/ConversationReadStatus";
import "./conversation.css";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
};

type ConversationParticipantProfile = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type ReplyPreview = {
  id: string;
  sender_id: string;
  body: string;
  deleted_at: string | null;
};

type Message = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_message_id: string | null;
  reply_to: ReplyPreview | null;
};

type MessageRow = Omit<Message, "reply_to">;

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

  const {
    data: participantRows,
    error: participantProfilesError,
  } = await supabase.rpc(
    "get_conversation_participants",
    {
      p_conversation_id: id,
    }
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
      "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to_message_id"
    )
    .eq("conversation_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);

  if (messagesError) {
    console.error(
      "Failed to load messages:",
      messagesError.message
    );
  }

  const baseMessages = (messageRows ?? []) as MessageRow[];

  const replyTargetIds = Array.from(
    new Set(
      baseMessages
        .map((message) => message.reply_to_message_id)
        .filter(
          (messageId): messageId is string =>
            Boolean(messageId)
        )
    )
  );

  const replyPreviewById = new Map<string, ReplyPreview>();

  if (replyTargetIds.length > 0) {
    const {
      data: replyRows,
      error: replyRowsError,
    } = await supabase
      .from("messages")
      .select("id, sender_id, body, deleted_at")
      .eq("conversation_id", id)
      .in("id", replyTargetIds);

    if (replyRowsError) {
      console.error(
        "Failed to load reply previews:",
        replyRowsError.message
      );
    } else {
      for (const row of (replyRows ?? []) as ReplyPreview[]) {
        replyPreviewById.set(row.id, row);
      }
    }
  }

  const messages: Message[] = baseMessages
    .map((message) => ({
      ...message,
      reply_to: message.reply_to_message_id
        ? replyPreviewById.get(
            message.reply_to_message_id
          ) ?? null
        : null,
    }))
    .reverse();

  const latestOwnMessageAt =
    [...messages]
      .reverse()
      .find((message) => message.sender_id === user.id)
      ?.created_at ?? null;

  const isIntentConversation =
    currentConversation.conversation_type === "intent";

  const participantCount = participants.length;
  const otherParticipant = otherParticipants[0];

  const avatarInitial =
    conversationTitle.trim().charAt(0).toUpperCase() || "R";

  return (
    <main className="page-shell rn-chat-page">
      <section className="rn-chat-shell">
        <header className="rn-chat-header">
          <div className="rn-chat-header-top">
            <Link
              href="/messages"
              className="rn-chat-back-link"
            >
              <span aria-hidden="true">←</span>
              <span>All messages</span>
            </Link>

            <span
              className={`rn-chat-type-badge ${
                isIntentConversation
                  ? "rn-chat-type-intent"
                  : "rn-chat-type-direct"
              }`}
            >
              <span aria-hidden="true">
                {isIntentConversation ? "✦" : "●"}
              </span>
              {isIntentConversation
                ? "Shared intention"
                : "Private conversation"}
            </span>
          </div>

          <div className="rn-chat-identity">
            <div className="rn-chat-avatar">
              {otherParticipant?.avatar_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={otherParticipant.avatar_url}
                  alt={`${conversationTitle} profile`}
                  width={68}
                  height={68}
                />
              ) : (
                <span>{avatarInitial}</span>
              )}

              <i
                className="rn-chat-avatar-indicator"
                aria-hidden="true"
              />
            </div>

            <div className="rn-chat-identity-copy">
              <p className="rn-chat-eyebrow">
                RUFFNECK CONNECT
              </p>

              <h1>{conversationTitle}</h1>

              <p className="rn-chat-subtitle">
                {isIntentConversation
                  ? "A conversation built around a shared need, offer, or opportunity."
                  : "A private space to connect, exchange ideas, and collaborate."}
              </p>

              <div className="rn-chat-participant-meta">
                <span className="rn-chat-secure-dot" />
                <span>
                  {participantCount}{" "}
                  {participantCount === 1
                    ? "participant"
                    : "participants"}
                </span>
                <span className="rn-chat-meta-separator">
                  ·
                </span>
                <span>
                  {messages.length}{" "}
                  {messages.length === 1
                    ? "message"
                    : "messages"}{" "}
                  loaded
                </span>
              </div>
            </div>

            {otherParticipant && (
              <div className="rn-chat-profile-action">
                <Link
                  href={`/members/${otherParticipant.user_id}`}
                  className="rn-chat-profile-link"
                >
                  View profile
                  <span aria-hidden="true">↗</span>
                </Link>
              </div>
            )}
          </div>

          <div className="rn-chat-security-note">
            <span
              className="rn-chat-security-icon"
              aria-hidden="true"
            >
              ◈
            </span>

            <p>
              Messages are visible to active participants in
              this conversation.
            </p>
          </div>
        </header>

        <div className="rn-chat-conversation-area">
          <div className="rn-chat-conversation-label">
            <span>CONVERSATION</span>
            <span className="rn-chat-conversation-line" />
            <span className="rn-chat-conversation-caption">
              Your shared space
            </span>
          </div>

          <ConversationMessages
            conversationId={id}
            currentUserId={user.id}
            initialMessages={messages}
            participants={participants}
          />
        </div>

        <footer className="rn-chat-footer">
          <div
            className="rn-chat-footer-symbol"
            aria-hidden="true"
          >
            ✦
          </div>

          <p>
            Good conversations create opportunities.
            <span> Keep the connection meaningful.</span>
          </p>

          <Link
            href="/messages"
            className="rn-chat-footer-link"
          >
            All messages →
          </Link>
        </footer>

        <ConversationReadStatus
          conversationId={id}
          currentUserId={user.id}
          initialLatestOwnMessageAt={latestOwnMessageAt}
        />
      </section>
    </main>
  );
}