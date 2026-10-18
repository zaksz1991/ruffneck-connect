import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConversationMessages from "@/components/ConversationMessages";
import ConversationReadStatus from "@/components/ConversationReadStatus";

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

  const avatarInitial = conversationTitle
    .trim()
    .charAt(0)
    .toUpperCase() || "R";

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
          <div className="rn-chat-footer-symbol" aria-hidden="true">
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

      <style jsx global>{`
        .rn-chat-page {
          --rn-chat-navy: #0b1e3a;
          --rn-chat-blue: #087fba;
          --rn-chat-cyan: #00b4d8;
          --rn-chat-gold: #fbbf24;
          --rn-chat-muted: #68788d;
          --rn-chat-border: #e4ebf3;
          max-width: 1120px;
          padding-top: 1.5rem;
          padding-bottom: 3.5rem;
        }

        .rn-chat-page,
        .rn-chat-page * {
          box-sizing: border-box;
        }

        .rn-chat-shell {
          overflow: hidden;
          border: 1px solid var(--rn-chat-border);
          border-radius: 26px;
          background: #fff;
          box-shadow: 0 20px 60px rgba(11, 30, 58, 0.08);
        }

        .rn-chat-header {
          padding: clamp(1.2rem, 3.5vw, 2rem);
          border-bottom: 1px solid var(--rn-chat-border);
          background:
            radial-gradient(
              circle at 100% 0%,
              rgba(0, 180, 216, 0.12),
              transparent 34%
            ),
            linear-gradient(145deg, #ffffff, #f8fbff);
        }

        .rn-chat-header-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          flex-wrap: wrap;
          gap: 1rem;
          margin-bottom: 1.7rem;
        }

        .rn-chat-back-link {
          display: inline-flex;
          align-items: center;
          gap: 0.55rem;
          color: #42617e;
          font-size: 0.86rem;
          font-weight: 750;
          text-decoration: none;
          transition: color 150ms ease;
        }

        .rn-chat-back-link span:first-child {
          display: grid;
          width: 32px;
          height: 32px;
          place-items: center;
          border: 1px solid #dce7f1;
          border-radius: 10px;
          background: #fff;
          font-size: 1.1rem;
        }

        .rn-chat-back-link:hover {
          color: var(--rn-chat-blue);
        }

        .rn-chat-type-badge {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          padding: 0.5rem 0.75rem;
          border: 1px solid #dce7f1;
          border-radius: 999px;
          background: #fff;
          color: #38536f;
          font-size: 0.7rem;
          font-weight: 800;
        }

        .rn-chat-type-direct {
          border-color: #c8eee2;
          background: #effcf6;
          color: #087453;
        }

        .rn-chat-type-intent {
          border-color: #f5e1a7;
          background: #fff9e8;
          color: #946200;
        }

        .rn-chat-identity {
          display: flex;
          align-items: center;
          gap: 1.15rem;
          min-width: 0;
        }

        .rn-chat-avatar {
          position: relative;
          display: grid;
          width: 68px;
          height: 68px;
          flex: 0 0 68px;
          overflow: visible;
          place-items: center;
          border: 3px solid #fff;
          border-radius: 22px;
          background: linear-gradient(
            135deg,
            var(--rn-chat-navy),
            var(--rn-chat-blue)
          );
          color: #fff;
          font-size: 1.7rem;
          font-weight: 850;
          box-shadow: 0 6px 20px rgba(8, 127, 186, 0.2);
        }

        .rn-chat-avatar img {
          display: block;
          width: 100%;
          height: 100%;
          border-radius: 18px;
          object-fit: cover;
        }

        .rn-chat-avatar-indicator {
          position: absolute;
          right: -4px;
          bottom: -3px;
          width: 15px;
          height: 15px;
          border: 3px solid #fff;
          border-radius: 50%;
          background: #28b98a;
        }

        .rn-chat-identity-copy {
          min-width: 0;
          flex: 1;
        }

        .rn-chat-eyebrow {
          margin: 0 0 0.35rem;
          color: var(--rn-chat-blue);
          font-size: 0.66rem;
          font-weight: 850;
          letter-spacing: 0.15em;
        }

        .rn-chat-identity-copy h1 {
          margin: 0;
          overflow-wrap: anywhere;
          color: var(--rn-chat-navy);
          font-size: clamp(1.6rem, 4vw, 2.35rem);
          font-weight: 850;
          line-height: 1.15;
          letter-spacing: -0.045em;
        }

        .rn-chat-subtitle {
          margin: 0.5rem 0 0;
          color: var(--rn-chat-muted);
          font-size: 0.88rem;
          line-height: 1.7;
        }

        .rn-chat-participant-meta {
          display: flex;
          align-items: center;
          flex-wrap: wrap;
          gap: 0.45rem;
          margin-top: 0.75rem;
          color: #52677d;
          font-size: 0.75rem;
          font-weight: 650;
        }

        .rn-chat-secure-dot {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #22ad80;
          box-shadow: 0 0 0 4px rgba(34, 173, 128, 0.1);
        }

        .rn-chat-meta-separator {
          color: #a0afbf;
        }

        .rn-chat-profile-action {
          margin-left: auto;
        }

        .rn-chat-profile-link {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          min-height: 42px;
          padding: 0.65rem 0.85rem;
          border: 1px solid #dce7f1;
          border-radius: 11px;
          background: #fff;
          color: #254b6c;
          font-size: 0.79rem;
          font-weight: 800;
          text-decoration: none;
          white-space: nowrap;
          transition:
            border-color 150ms ease,
            background 150ms ease,
            transform 150ms ease;
        }

        .rn-chat-profile-link:hover {
          transform: translateY(-1px);
          border-color: #9bdced;
          background: #f2fbff;
        }

        .rn-chat-security-note {
          display: flex;
          align-items: center;
          gap: 0.7rem;
          margin-top: 1.6rem;
          padding: 0.75rem 0.9rem;
          border: 1px solid #dceef5;
          border-radius: 12px;
          background: rgba(241, 250, 255, 0.85);
        }

        .rn-chat-security-icon {
          display: grid;
          width: 30px;
          height: 30px;
          flex: 0 0 30px;
          place-items: center;
          border-radius: 9px;
          background: #e0f6fc;
          color: #087fba;
          font-size: 1.15rem;
        }

        .rn-chat-security-note p {
          margin: 0;
          color: #536a80;
          font-size: 0.78rem;
          line-height: 1.6;
        }

        .rn-chat-conversation-area {
          min-width: 0;
          padding: clamp(1rem, 3vw, 1.7rem);
          background:
            radial-gradient(
              circle at 0% 0%,
              rgba(0, 180, 216, 0.035),
              transparent 30%
            ),
            #fbfdff;
        }

        .rn-chat-conversation-label {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          margin-bottom: 1rem;
          color: #53718d;
          font-size: 0.64rem;
          font-weight: 850;
          letter-spacing: 0.12em;
        }

        .rn-chat-conversation-line {
          height: 1px;
          flex: 1;
          background: #e4ebf3;
        }

        .rn-chat-conversation-caption {
          color: #8998a9;
          font-size: 0.7rem;
          font-weight: 600;
          letter-spacing: 0;
        }

        .rn-chat-footer {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 1rem clamp(1rem, 3vw, 1.7rem);
          border-top: 1px solid var(--rn-chat-border);
          background: #fff;
        }

        .rn-chat-footer-symbol {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          place-items: center;
          border-radius: 11px;
          background: #fff7df;
          color: #a87500;
          font-size: 1.1rem;
        }

        .rn-chat-footer p {
          flex: 1;
          margin: 0;
          color: #64758a;
          font-size: 0.78rem;
          line-height: 1.6;
        }

        .rn-chat-footer p span {
          color: #334b64;
          font-weight: 700;
        }

        .rn-chat-footer-link {
          color: var(--rn-chat-blue);
          font-size: 0.77rem;
          font-weight: 800;
          text-decoration: none;
          white-space: nowrap;
        }

        .rn-chat-footer-link:hover {
          text-decoration: underline;
        }

        .rn-chat-page a:focus-visible,
        .rn-chat-page button:focus-visible,
        .rn-chat-page input:focus-visible,
        .rn-chat-page textarea:focus-visible {
          outline: 3px solid rgba(0, 180, 216, 0.5);
          outline-offset: 3px;
        }

        @media (max-width: 720px) {
          .rn-chat-page {
            padding-top: 0.75rem;
            padding-bottom: 2rem;
          }

          .rn-chat-shell {
            border-radius: 20px;
          }

          .rn-chat-header {
            padding: 1.15rem;
          }

          .rn-chat-header-top {
            align-items: flex-start;
            flex-direction: column;
            gap: 0.8rem;
            margin-bottom: 1.25rem;
          }

          .rn-chat-identity {
            align-items: flex-start;
            flex-wrap: wrap;
            gap: 0.85rem;
          }

          .rn-chat-avatar {
            width: 54px;
            height: 54px;
            flex-basis: 54px;
            border-radius: 17px;
            font-size: 1.35rem;
          }

          .rn-chat-avatar img {
            border-radius: 13px;
          }

          .rn-chat-identity-copy {
            width: calc(100% - 70px);
            flex: 1 1 calc(100% - 70px);
          }

          .rn-chat-identity-copy h1 {
            font-size: 1.55rem;
          }

          .rn-chat-profile-action {
            width: 100%;
            margin-left: 0;
          }

          .rn-chat-profile-link {
            width: 100%;
          }

          .rn-chat-security-note {
            align-items: flex-start;
            margin-top: 1.2rem;
          }

          .rn-chat-conversation-area {
            padding: 0.85rem;
          }

          .rn-chat-footer {
            align-items: flex-start;
            flex-wrap: wrap;
          }

          .rn-chat-footer p {
            min-width: calc(100% - 55px);
          }

          .rn-chat-footer-link {
            margin-left: 42px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-chat-page *,
          .rn-chat-page *::before,
          .rn-chat-page *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}