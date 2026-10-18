import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConversationListFilters from "@/components/ConversationListFilters";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    to?: string;
    start_error?: string;
  }>;
};

type Conversation = {
  id: string;
  conversation_type: "direct" | "intent";
  intent_id: string | null;
  title: string | null;
  last_message_at: string | null;
  created_at: string;
};

type Profile = {
  id: string;
  full_name: string | null;
  avatar_url?: string | null;
};

type ConversationParticipantProfile = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

type Message = {
  conversation_id: string;
  body: string;
  sender_id: string;
  created_at: string;
};

type OwnParticipantRecord = {
  conversation_id: string;
  last_read_at: string | null;
  is_pinned: boolean;
  is_archived: boolean;
};

type ConversationListItem = {
  id: string;
  href: string;
  name: string;
  preview: string;
  dateLabel: string;
  conversationType: "direct" | "intent";
  unreadCount: number;
  isPinned: boolean;
  isArchived: boolean;
  avatarUrl: string | null;
  isSelected: boolean;
};

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

function isValidUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

export default async function MessagesPage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const requestedRecipientId = params.to?.trim() ?? "";

  const startError =
    params.start_error === "unavailable"
      ? "The private conversation could not be opened. Please try again."
      : params.start_error === "invalid_recipient"
        ? "This member cannot be contacted."
        : "";

  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect(
      requestedRecipientId && isValidUuid(requestedRecipientId)
        ? `/login?next=${encodeURIComponent(
            `/messages?to=${requestedRecipientId}`
          )}`
        : "/login?next=/messages"
    );
  }

  if (
    requestedRecipientId &&
    isValidUuid(requestedRecipientId) &&
    requestedRecipientId === user.id
  ) {
    redirect("/messages");
  }

  let recipientName = "";
  let recipientError = "";
  let recipientAvatar: string | null = null;

  if (requestedRecipientId && isValidUuid(requestedRecipientId)) {
    const { data: recipient, error } = await supabase
      .from("profiles")
      .select("id, full_name, avatar_url")
      .eq("id", requestedRecipientId)
      .maybeSingle();

    if (error) {
      console.error(
        "Failed to load message recipient:",
        error.message
      );

      recipientError =
        "The selected member could not be loaded. Please try again.";
    } else if (!recipient) {
      recipientError =
        "This member is unavailable or cannot be contacted.";
    } else {
      const profile = recipient as Profile;

      recipientName =
        profile.full_name?.trim() || "RuffNeck member";
      recipientAvatar = profile.avatar_url ?? null;
    }
  } else if (requestedRecipientId) {
    recipientError = "The selected member link is invalid.";
  }

  const {
    data: participantRows,
    error: participantError,
  } = await supabase
    .from("conversation_participants")
    .select(
      "conversation_id, last_read_at, is_pinned, is_archived"
    )
    .eq("user_id", user.id)
    .eq("status", "active");

  if (participantError) {
    console.error(
      "Failed to load conversation participants:",
      participantError.message
    );
  }

  const ownParticipantRecords =
    (participantRows ?? []) as OwnParticipantRecord[];

  const lastReadAtByConversation = new Map(
    ownParticipantRecords.map((row) => [
      row.conversation_id,
      row.last_read_at,
    ])
  );

  const pinnedByConversation = new Map(
    ownParticipantRecords.map((row) => [
      row.conversation_id,
      row.is_pinned === true,
    ])
  );

  const archivedByConversation = new Map(
    ownParticipantRecords.map((row) => [
      row.conversation_id,
      row.is_archived === true,
    ])
  );

  const conversationIds = [
    ...new Set(
      ownParticipantRecords.map(
        (row) => row.conversation_id
      )
    ),
  ];

  let conversations: Conversation[] = [];

  if (conversationIds.length > 0) {
    const { data, error } = await supabase
      .from("conversations")
      .select(
        "id, conversation_type, intent_id, title, last_message_at, created_at"
      )
      .in("id", conversationIds)
      .order("last_message_at", {
        ascending: false,
        nullsFirst: false,
      })
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        "Failed to load conversations:",
        error.message
      );
    } else {
      conversations = (data ?? []) as Conversation[];
    }
  }

  const unreadCountByConversation = new Map<string, number>();

  await Promise.all(
    conversations.map(async (conversation) => {
      const lastReadAt =
        lastReadAtByConversation.get(conversation.id) ??
        "1970-01-01T00:00:00.000Z";

      const { count, error } = await supabase
        .from("messages")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("conversation_id", conversation.id)
        .neq("sender_id", user.id)
        .is("deleted_at", null)
        .gt("created_at", lastReadAt);

      if (error) {
        console.error(
          `Failed to count unread messages for conversation ${conversation.id}:`,
          error.message
        );

        unreadCountByConversation.set(
          conversation.id,
          0
        );

        return;
      }

      unreadCountByConversation.set(
        conversation.id,
        count ?? 0
      );
    })
  );

  const participantProfilesByConversation = new Map<
    string,
    ConversationParticipantProfile[]
  >();

  await Promise.all(
    conversations.map(async (conversation) => {
      const { data, error } = await supabase.rpc(
        "get_conversation_participants",
        {
          p_conversation_id: conversation.id,
        }
      );

      if (error) {
        console.error(
          `Failed to load participants for conversation ${conversation.id}:`,
          error.message
        );

        participantProfilesByConversation.set(
          conversation.id,
          []
        );

        return;
      }

      participantProfilesByConversation.set(
        conversation.id,
        (data ?? []) as ConversationParticipantProfile[]
      );
    })
  );

  const otherParticipantIds = new Map<string, string[]>();
  const profileNames = new Map<string, string>();

  for (const conversation of conversations) {
    const participants =
      participantProfilesByConversation.get(
        conversation.id
      ) ?? [];

    const others = participants.filter(
      (participant) => participant.user_id !== user.id
    );

    otherParticipantIds.set(
      conversation.id,
      others.map((participant) => participant.user_id)
    );

    for (const participant of others) {
      profileNames.set(
        participant.user_id,
        participant.full_name?.trim() ||
          "RuffNeck member"
      );
    }
  }

  const existingDirectConversation =
    requestedRecipientId &&
    isValidUuid(requestedRecipientId)
      ? conversations.find((conversation) => {
          if (
            conversation.conversation_type !== "direct"
          ) {
            return false;
          }

          const otherIds =
            otherParticipantIds.get(conversation.id) ?? [];

          return (
            otherIds.length === 1 &&
            otherIds[0] === requestedRecipientId
          );
        })
      : undefined;

  let latestMessages: Message[] = [];

  if (conversations.length > 0) {
    const { data, error } = await supabase
      .from("messages")
      .select(
        "conversation_id, body, sender_id, created_at"
      )
      .in(
        "conversation_id",
        conversations.map(
          (conversation) => conversation.id
        )
      )
      .is("deleted_at", null)
      .order("created_at", {
        ascending: false,
      });

    if (error) {
      console.error(
        "Failed to load recent messages:",
        error.message
      );
    } else {
      const seen = new Set<string>();

      latestMessages = (
        (data ?? []) as Message[]
      ).filter((message) => {
        if (seen.has(message.conversation_id)) {
          return false;
        }

        seen.add(message.conversation_id);
        return true;
      });
    }
  }

  const latestMessageByConversation = new Map(
    latestMessages.map((message) => [
      message.conversation_id,
      message,
    ])
  );

  const conversationListItems: ConversationListItem[] =
    conversations.map((conversation) => {
      const otherIds =
        otherParticipantIds.get(conversation.id) ?? [];

      const name =
        conversation.conversation_type === "intent"
          ? conversation.title || "Intent conversation"
          : otherIds
              .map(
                (id) =>
                  profileNames.get(id) ??
                  "RuffNeck member"
              )
              .join(", ") || "Direct conversation";

      const latestMessage =
        latestMessageByConversation.get(conversation.id);

      const unreadCount =
        unreadCountByConversation.get(conversation.id) ??
        0;

      const otherProfiles =
        participantProfilesByConversation
          .get(conversation.id)
          ?.filter(
            (participant) =>
              participant.user_id !== user.id
          ) ?? [];

      const avatarUrl =
        conversation.conversation_type === "direct"
          ? otherProfiles[0]?.avatar_url ?? null
          : null;

      const preview = latestMessage
        ? `${
            latestMessage.sender_id === user.id
              ? "You: "
              : ""
          }${latestMessage.body}`
        : "No messages yet. Start the conversation.";

      return {
        id: conversation.id,
        href: `/messages/${conversation.id}`,
        name,
        preview,
        dateLabel: latestMessage
          ? formatDate(latestMessage.created_at)
          : `Created ${formatDate(
              conversation.created_at
            )}`,
        conversationType:
          conversation.conversation_type,
        unreadCount,
        isPinned:
          pinnedByConversation.get(conversation.id) ??
          false,
        isArchived:
          archivedByConversation.get(conversation.id) ??
          false,
        avatarUrl,
        isSelected:
          conversation.id ===
          existingDirectConversation?.id,
      };
    });

  const unreadTotal = conversationListItems.reduce(
    (total, item) => total + item.unreadCount,
    0
  );

  const pinnedTotal = conversationListItems.filter(
    (item) => item.isPinned
  ).length;

  return (
    <main className="page-shell rn-messages-page">
      <section className="rn-messages-hero">
        <div className="rn-messages-hero-content">
          <div className="rn-messages-eyebrow">
            <span className="rn-messages-live-dot" />
            RUFFNECK CONNECT · PRIVATE COMMUNICATION
          </div>

          <h1>Your conversations, all in one place.</h1>

          <p>
            Build meaningful connections, continue
            conversations, and turn shared interests into
            real opportunities.
          </p>

          <div className="rn-messages-hero-actions">
            <Link
              href="/members"
              className="rn-messages-primary-button"
            >
              Find people <span aria-hidden="true">↗</span>
            </Link>

            <Link
              href="/communities"
              className="rn-messages-secondary-button"
            >
              Explore communities
            </Link>
          </div>
        </div>

        <div
          className="rn-messages-hero-decoration"
          aria-hidden="true"
        >
          <div className="rn-message-orbit rn-message-orbit-one" />
          <div className="rn-message-orbit rn-message-orbit-two" />
          <div className="rn-message-hero-symbol">✉</div>
          <span className="rn-message-float rn-message-float-one">
            Connect
          </span>
          <span className="rn-message-float rn-message-float-two">
            Collaborate
          </span>
        </div>
      </section>

      <section
        className="rn-message-stats"
        aria-label="Messaging overview"
      >
        <article className="rn-message-stat">
          <span className="rn-message-stat-icon">▤</span>
          <div>
            <span className="rn-message-stat-label">
              Conversations
            </span>
            <strong>{conversations.length}</strong>
          </div>
        </article>

        <article className="rn-message-stat">
          <span className="rn-message-stat-icon rn-message-stat-cyan">
            ●
          </span>
          <div>
            <span className="rn-message-stat-label">
              Unread messages
            </span>
            <strong>{unreadTotal}</strong>
          </div>
        </article>

        <article className="rn-message-stat">
          <span className="rn-message-stat-icon rn-message-stat-gold">
            ★
          </span>
          <div>
            <span className="rn-message-stat-label">
              Pinned chats
            </span>
            <strong>{pinnedTotal}</strong>
          </div>
        </article>
      </section>

      <section className="rn-message-workspace">
        <div className="rn-message-workspace-heading">
          <div>
            <p className="rn-messages-section-eyebrow">
              YOUR NETWORK
            </p>
            <h2>Messages</h2>
            <p>
              Pick up where you left off or start a new
              conversation with any member.
            </p>
          </div>

          <span className="rn-message-count">
            {conversations.length}{" "}
            {conversations.length === 1
              ? "conversation"
              : "conversations"}
          </span>
        </div>

        {requestedRecipientId && recipientError && (
          <div
            className="rn-message-notice rn-message-notice-error"
            role="alert"
          >
            <span className="rn-message-notice-icon">!</span>
            <div>
              <h3>Member unavailable</h3>
              <p>{recipientError}</p>
              <Link
                href="/members"
                className="rn-message-inline-link"
              >
                Return to members →
              </Link>
            </div>
          </div>
        )}

        {requestedRecipientId &&
          !recipientError &&
          recipientName && (
            <div className="rn-message-recipient-card">
              <div className="rn-message-recipient-avatar">
                {recipientAvatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={recipientAvatar}
                    alt=""
                    className="rn-message-recipient-avatar-image"
                  />
                ) : (
                  recipientName.charAt(0).toUpperCase()
                )}
              </div>

              <div className="rn-message-recipient-details">
                <span className="rn-message-recipient-label">
                  SELECTED MEMBER
                </span>
                <h3>{recipientName}</h3>
                <p>
                  {existingDirectConversation
                    ? "Your direct conversation with this member already exists."
                    : "Start a private conversation with this member. An accepted connection is not required."}
                </p>
              </div>

              <div className="rn-message-recipient-actions">
                {existingDirectConversation ? (
                  <Link
                    href={`/messages/${existingDirectConversation.id}`}
                    className="rn-messages-primary-button"
                  >
                    Open conversation →
                  </Link>
                ) : (
                  <form action="/messages/start" method="post">
                    <input
                      type="hidden"
                      name="recipient_id"
                      value={requestedRecipientId}
                    />
                    <button
                      type="submit"
                      className="rn-messages-primary-button"
                    >
                      Start private chat →
                    </button>
                  </form>
                )}

                <Link
                  href={`/members/${requestedRecipientId}`}
                  className="rn-messages-secondary-button"
                >
                  View profile
                </Link>
              </div>

              {startError && (
                <p
                  className="rn-message-start-error"
                  role="alert"
                >
                  {startError}
                </p>
              )}
            </div>
          )}

        {conversations.length === 0 ? (
          <div className="rn-message-empty-state">
            <div
              className="rn-message-empty-illustration"
              aria-hidden="true"
            >
              <span>✉</span>
              <i />
              <b />
            </div>

            <span className="rn-message-empty-eyebrow">
              YOUR NEXT CONVERSATION STARTS HERE
            </span>

            <h2>No conversations yet</h2>

            <p>
              Find any member and start a private chat
              directly. You do not need to connect first.
              You can also respond to an open intention and
              start a conversation around a shared purpose.
            </p>

            <div className="rn-message-empty-actions">
              <Link
                href="/members"
                className="rn-messages-primary-button"
              >
                Find members →
              </Link>

              <Link
                href="/communities"
                className="rn-messages-secondary-button"
              >
                Explore communities
              </Link>

              <Link
                href="/intents"
                className="rn-messages-secondary-button"
              >
                Discover intentions
              </Link>
            </div>
          </div>
        ) : (
          <div className="rn-message-list-container">
            <div className="rn-message-list-intro">
              <span className="rn-message-list-intro-icon">
                ↔
              </span>
              <div>
                <strong>Your conversations</strong>
                <p>
                  Your latest messages and connection activity.
                </p>
              </div>
            </div>

            <ConversationListFilters
              items={conversationListItems}
            />
          </div>
        )}
      </section>

      <style>{`
        .rn-messages-page {
          --rn-msg-navy: #10233f;
          --rn-msg-blue: #087fba;
          --rn-msg-cyan: #00b4d8;
          --rn-msg-gold: #fbbf24;
          --rn-msg-muted: #68788d;
          --rn-msg-border: #e5ebf3;
          max-width: 1280px;
          padding-top: 1.75rem;
          padding-bottom: 4rem;
        }

        .rn-messages-page,
        .rn-messages-page * {
          box-sizing: border-box;
        }

        .rn-messages-hero {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: space-between;
          min-height: 310px;
          overflow: hidden;
          padding: clamp(1.75rem, 5vw, 4rem);
          border: 1px solid rgba(255, 255, 255, 0.12);
          border-radius: 28px;
          background:
            radial-gradient(circle at 82% 20%, rgba(0, 180, 216, 0.24), transparent 30%),
            linear-gradient(125deg, #0b1e3a 0%, #123b61 62%, #075879 100%);
          box-shadow: 0 24px 60px rgba(11, 30, 58, 0.18);
          color: #fff;
        }

        .rn-messages-hero-content {
          position: relative;
          z-index: 2;
          max-width: 680px;
        }

        .rn-messages-eyebrow {
          display: flex;
          align-items: center;
          gap: 0.65rem;
          margin-bottom: 1.3rem;
          color: #a9eaf5;
          font-size: 0.7rem;
          font-weight: 800;
          letter-spacing: 0.15em;
          line-height: 1.6;
        }

        .rn-messages-live-dot {
          width: 8px;
          height: 8px;
          flex: 0 0 8px;
          border-radius: 50%;
          background: #4ce2b2;
          box-shadow: 0 0 0 5px rgba(76, 226, 178, 0.13);
        }

        .rn-messages-hero h1 {
          max-width: 650px;
          margin: 0;
          color: #fff;
          font-size: clamp(2.15rem, 5vw, 3.7rem);
          font-weight: 850;
          line-height: 1.06;
          letter-spacing: -0.055em;
        }

        .rn-messages-hero-content > p {
          max-width: 550px;
          margin: 1.15rem 0 0;
          color: #d3e2f1;
          font-size: 1rem;
          line-height: 1.8;
        }

        .rn-messages-hero-actions,
        .rn-message-empty-actions,
        .rn-message-recipient-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 0.75rem;
        }

        .rn-messages-hero-actions {
          margin-top: 1.7rem;
        }

        .rn-messages-primary-button,
        .rn-messages-secondary-button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 0.55rem;
          min-height: 44px;
          padding: 0.75rem 1.1rem;
          border: 1px solid transparent;
          border-radius: 12px;
          font: inherit;
          font-size: 0.88rem;
          font-weight: 750;
          line-height: 1.35;
          text-align: center;
          text-decoration: none;
          cursor: pointer;
          transition: transform 160ms ease, box-shadow 160ms ease, background 160ms ease, border-color 160ms ease;
        }

        .rn-messages-primary-button {
          background: #fff;
          color: #10233f;
          box-shadow: 0 6px 20px rgba(0, 0, 0, 0.12);
        }

        .rn-messages-primary-button:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 26px rgba(0, 0, 0, 0.18);
        }

        .rn-messages-secondary-button {
          border-color: #d9e4ef;
          background: #fff;
          color: #173552;
        }

        .rn-messages-hero .rn-messages-secondary-button {
          border-color: rgba(255, 255, 255, 0.3);
          background: rgba(255, 255, 255, 0.07);
          color: #fff;
        }

        .rn-messages-secondary-button:hover {
          transform: translateY(-1px);
          border-color: #00b4d8;
          background: #f0fbff;
        }

        .rn-messages-hero .rn-messages-secondary-button:hover {
          background: rgba(255, 255, 255, 0.15);
        }

        .rn-messages-hero-decoration {
          position: absolute;
          top: 0;
          right: 0;
          width: 39%;
          height: 100%;
          pointer-events: none;
        }

        .rn-message-orbit {
          position: absolute;
          top: 50%;
          left: 52%;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 50%;
          transform: translate(-50%, -50%);
        }

        .rn-message-orbit-one {
          width: 230px;
          height: 230px;
        }

        .rn-message-orbit-two {
          width: 340px;
          height: 340px;
        }

        .rn-message-hero-symbol {
          position: absolute;
          top: 50%;
          left: 52%;
          display: grid;
          width: 104px;
          height: 104px;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.35);
          border-radius: 30px;
          background: linear-gradient(145deg, rgba(255, 255, 255, 0.2), rgba(255, 255, 255, 0.06));
          color: #fff;
          font-size: 3rem;
          box-shadow: 0 18px 55px rgba(0, 0, 0, 0.15);
          backdrop-filter: blur(12px);
          transform: translate(-50%, -50%) rotate(-8deg);
        }

        .rn-message-float {
          position: absolute;
          padding: 0.55rem 0.8rem;
          border: 1px solid rgba(255, 255, 255, 0.2);
          border-radius: 10px;
          background: rgba(255, 255, 255, 0.12);
          color: #fff;
          font-size: 0.75rem;
          font-weight: 750;
          backdrop-filter: blur(10px);
        }

        .rn-message-float-one {
          top: 25%;
          left: 4%;
        }

        .rn-message-float-two {
          right: 0;
          bottom: 23%;
        }

        .rn-message-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 1rem;
          margin: 1.25rem 0 2rem;
        }

        .rn-message-stat {
          display: flex;
          align-items: center;
          gap: 1rem;
          min-width: 0;
          padding: 1.2rem 1.35rem;
          border: 1px solid var(--rn-msg-border);
          border-radius: 18px;
          background: #fff;
          box-shadow: 0 8px 25px rgba(16, 35, 63, 0.045);
        }

        .rn-message-stat-icon {
          display: grid;
          width: 48px;
          height: 48px;
          flex: 0 0 48px;
          place-items: center;
          border-radius: 15px;
          background: #eaf2ff;
          color: #215bb0;
          font-size: 1.35rem;
          font-weight: 800;
        }

        .rn-message-stat-cyan {
          background: #e5faff;
          color: #087fba;
        }

        .rn-message-stat-gold {
          background: #fff6d9;
          color: #996600;
        }

        .rn-message-stat-label {
          display: block;
          margin-bottom: 0.3rem;
          color: var(--rn-msg-muted);
          font-size: 0.77rem;
          font-weight: 650;
        }

        .rn-message-stat strong {
          display: block;
          color: var(--rn-msg-navy);
          font-size: 1.65rem;
          font-weight: 850;
          line-height: 1.1;
          letter-spacing: -0.04em;
        }

        .rn-message-workspace {
          padding: clamp(1.15rem, 3vw, 2rem);
          border: 1px solid var(--rn-msg-border);
          border-radius: 24px;
          background: rgba(255, 255, 255, 0.97);
          box-shadow: 0 18px 55px rgba(16, 35, 63, 0.065);
        }

        .rn-message-workspace-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 1rem;
          margin-bottom: 1.5rem;
        }

        .rn-messages-section-eyebrow {
          margin: 0 0 0.45rem;
          color: #087fba;
          font-size: 0.7rem;
          font-weight: 850;
          letter-spacing: 0.15em;
        }

        .rn-message-workspace-heading h2 {
          margin: 0;
          color: var(--rn-msg-navy);
          font-size: clamp(1.6rem, 3vw, 2.2rem);
          font-weight: 850;
          letter-spacing: -0.045em;
        }

        .rn-message-workspace-heading > div > p:last-child {
          margin: 0.55rem 0 0;
          color: var(--rn-msg-muted);
          font-size: 0.92rem;
          line-height: 1.7;
        }

        .rn-message-count {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
          padding: 0.55rem 0.8rem;
          border: 1px solid #dbeaf4;
          border-radius: 999px;
          background: #f1f9fd;
          color: #145a80;
          font-size: 0.76rem;
          font-weight: 800;
        }

        .rn-message-recipient-card {
          display: grid;
          grid-template-columns: auto minmax(0, 1fr);
          gap: 1rem;
          margin-bottom: 1.5rem;
          padding: 1.25rem;
          border: 1px solid #ccecf5;
          border-radius: 18px;
          background: radial-gradient(circle at 100% 0%, rgba(0, 180, 216, 0.1), transparent 40%), #f5fcff;
        }

        .rn-message-recipient-avatar {
          display: grid;
          width: 58px;
          height: 58px;
          overflow: hidden;
          place-items: center;
          border: 3px solid #fff;
          border-radius: 18px;
          background: linear-gradient(135deg, #0b1e3a, #087fba);
          color: #fff;
          font-size: 1.45rem;
          font-weight: 850;
          box-shadow: 0 5px 16px rgba(8, 127, 186, 0.17);
        }

        .rn-message-recipient-avatar-image {
          width: 100%;
          height: 100%;
          object-fit: cover;
        }

        .rn-message-recipient-details {
          min-width: 0;
        }

        .rn-message-recipient-label {
          color: #087fba;
          font-size: 0.66rem;
          font-weight: 850;
          letter-spacing: 0.13em;
        }

        .rn-message-recipient-details h3 {
          margin: 0.3rem 0;
          color: var(--rn-msg-navy);
          font-size: 1.2rem;
          font-weight: 800;
        }

        .rn-message-recipient-details p {
          margin: 0;
          color: var(--rn-msg-muted);
          font-size: 0.87rem;
          line-height: 1.65;
        }

        .rn-message-recipient-actions {
          grid-column: 2;
          margin-top: 0.15rem;
        }

        .rn-message-recipient-actions form {
          margin: 0;
        }

        .rn-message-recipient-actions .button,
        .rn-message-recipient-actions button,
        .rn-message-recipient-actions a {
          min-height: 42px;
          border-radius: 11px;
        }

        .rn-message-start-error {
          grid-column: 1 / -1;
          margin: 0;
          padding: 0.85rem 1rem;
          border: 1px solid #fecaca;
          border-radius: 12px;
          background: #fff1f2;
          color: #9f1239;
          font-size: 0.85rem;
          line-height: 1.65;
        }

        .rn-message-notice {
          display: flex;
          align-items: flex-start;
          gap: 0.85rem;
          margin-bottom: 1.5rem;
          padding: 1.1rem;
          border: 1px solid var(--rn-msg-border);
          border-radius: 16px;
          background: #fff;
        }

        .rn-message-notice-error {
          border-color: #fecaca;
          background: #fff7f7;
        }

        .rn-message-notice-icon {
          display: grid;
          width: 34px;
          height: 34px;
          flex: 0 0 34px;
          place-items: center;
          border-radius: 11px;
          background: #fee2e2;
          color: #b91c1c;
          font-weight: 850;
        }

        .rn-message-notice h3 {
          margin: 0 0 0.35rem;
          color: var(--rn-msg-navy);
          font-size: 1rem;
        }

        .rn-message-notice p {
          margin: 0 0 0.6rem;
          color: #64748b;
          font-size: 0.88rem;
          line-height: 1.7;
        }

        .rn-message-inline-link {
          color: #087fba;
          font-size: 0.86rem;
          font-weight: 800;
          text-decoration: none;
        }

        .rn-message-inline-link:hover {
          text-decoration: underline;
        }

        .rn-message-list-container {
          overflow: hidden;
          border: 1px solid var(--rn-msg-border);
          border-radius: 18px;
          background: #fff;
        }

        .rn-message-list-intro {
          display: flex;
          align-items: center;
          gap: 0.85rem;
          padding: 1.1rem 1.25rem;
          border-bottom: 1px solid var(--rn-msg-border);
          background: #f8fbfe;
        }

        .rn-message-list-intro-icon {
          display: grid;
          width: 40px;
          height: 40px;
          flex: 0 0 40px;
          place-items: center;
          border-radius: 12px;
          background: #e8f8fd;
          color: #087fba;
          font-size: 1.35rem;
          font-weight: 800;
        }

        .rn-message-list-intro strong {
          color: var(--rn-msg-navy);
          font-size: 0.93rem;
          font-weight: 800;
        }

        .rn-message-list-intro p {
          margin: 0.25rem 0 0;
          color: var(--rn-msg-muted);
          font-size: 0.79rem;
          line-height: 1.5;
        }

        .rn-message-empty-state {
          padding: clamp(2rem, 6vw, 4rem) 1.25rem;
          border: 1px dashed #c8dce9;
          border-radius: 20px;
          background: radial-gradient(circle at 50% 0%, rgba(0, 180, 216, 0.09), transparent 42%), linear-gradient(180deg, #f8fcff, #fff);
          text-align: center;
        }

        .rn-message-empty-illustration {
          position: relative;
          display: grid;
          width: 90px;
          height: 90px;
          margin: 0 auto 1.4rem;
          place-items: center;
          border: 1px solid #d6edf5;
          border-radius: 28px;
          background: linear-gradient(145deg, #e8f9ff, #fff);
          color: #087fba;
          font-size: 2.5rem;
          box-shadow: 0 12px 28px rgba(8, 127, 186, 0.08);
          transform: rotate(-5deg);
        }

        .rn-message-empty-illustration i,
        .rn-message-empty-illustration b {
          position: absolute;
          width: 11px;
          height: 11px;
          border-radius: 50%;
        }

        .rn-message-empty-illustration i {
          top: -3px;
          right: 4px;
          background: #fbbf24;
        }

        .rn-message-empty-illustration b {
          bottom: 3px;
          left: -5px;
          background: #00b4d8;
        }

        .rn-message-empty-eyebrow {
          color: #087fba;
          font-size: 0.67rem;
          font-weight: 850;
          letter-spacing: 0.14em;
        }

        .rn-message-empty-state h2 {
          margin: 0.6rem 0;
          color: var(--rn-msg-navy);
          font-size: clamp(1.5rem, 3vw, 2rem);
          font-weight: 850;
          letter-spacing: -0.04em;
        }

        .rn-message-empty-state > p {
          max-width: 590px;
          margin: 0 auto;
          color: var(--rn-msg-muted);
          font-size: 0.92rem;
          line-height: 1.85;
        }

        .rn-message-empty-actions {
          justify-content: center;
          margin-top: 1.5rem;
        }

        .rn-messages-page a:focus-visible,
        .rn-messages-page button:focus-visible,
        .rn-messages-page input:focus-visible,
        .rn-messages-page select:focus-visible {
          outline: 3px solid rgba(0, 180, 216, 0.5);
          outline-offset: 3px;
        }

        @media (max-width: 800px) {
          .rn-messages-hero {
            min-height: 290px;
          }

          .rn-messages-hero-decoration {
            right: -10%;
            width: 38%;
            opacity: 0.45;
          }

          .rn-message-stats {
            gap: 0.7rem;
          }

          .rn-message-stat {
            gap: 0.7rem;
            padding: 1rem;
          }

          .rn-message-stat-icon {
            width: 40px;
            height: 40px;
            flex-basis: 40px;
            border-radius: 12px;
          }
        }

        @media (max-width: 600px) {
          .rn-messages-page {
            padding-top: 1rem;
            padding-bottom: 2rem;
          }

          .rn-messages-hero {
            min-height: auto;
            padding: 1.5rem;
            border-radius: 22px;
          }

          .rn-messages-hero h1 {
            font-size: clamp(2rem, 9vw, 2.7rem);
          }

          .rn-messages-hero-content > p {
            font-size: 0.91rem;
          }

          .rn-messages-hero-decoration {
            top: auto;
            right: -10%;
            bottom: -22%;
            width: 42%;
            height: 60%;
            opacity: 0.25;
          }

          .rn-message-orbit-one {
            width: 130px;
            height: 130px;
          }

          .rn-message-orbit-two {
            width: 210px;
            height: 210px;
          }

          .rn-message-hero-symbol {
            width: 65px;
            height: 65px;
            border-radius: 20px;
            font-size: 2rem;
          }

          .rn-message-float {
            display: none;
          }

          .rn-messages-hero-actions {
            align-items: stretch;
            flex-direction: column;
          }

          .rn-messages-hero-actions a,
          .rn-message-empty-actions a {
            width: 100%;
          }

          .rn-message-stats {
            grid-template-columns: 1fr;
            margin-bottom: 1.25rem;
          }

          .rn-message-stat {
            padding: 0.9rem 1rem;
          }

          .rn-message-stat strong {
            font-size: 1.4rem;
          }

          .rn-message-workspace {
            padding: 1rem;
            border-radius: 19px;
          }

          .rn-message-workspace-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 0.8rem;
          }

          .rn-message-recipient-card {
            grid-template-columns: auto minmax(0, 1fr);
            gap: 0.75rem;
            padding: 1rem;
          }

          .rn-message-recipient-avatar {
            width: 44px;
            height: 44px;
            border-radius: 14px;
            font-size: 1.1rem;
          }

          .rn-message-recipient-details h3 {
            font-size: 1.05rem;
          }

          .rn-message-recipient-actions {
            grid-column: 1 / -1;
            align-items: stretch;
            flex-direction: column;
          }

          .rn-message-recipient-actions > *,
          .rn-message-recipient-actions form,
          .rn-message-recipient-actions form button {
            width: 100%;
          }

          .rn-message-empty-state {
            padding: 2rem 1rem;
          }

          .rn-message-empty-actions {
            align-items: stretch;
            flex-direction: column;
          }

          .rn-message-count {
            font-size: 0.72rem;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-messages-page *,
          .rn-messages-page *::before,
          .rn-messages-page *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            transition-duration: 0.01ms !important;
          }
        }
      `}</style>
    </main>
  );
}