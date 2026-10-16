import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConversationListFilters from "@/components/ConversationListFilters";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    to?: string;
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
};

type ConversationListItem = {
  id: string;
  href: string;
  name: string;
  preview: string;
  dateLabel: string;
  conversationType: "direct" | "intent";
  unreadCount: number;
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

  if (
    requestedRecipientId &&
    isValidUuid(requestedRecipientId)
  ) {
    const { data: recipient, error } = await supabase
      .from("profiles")
      .select("id, full_name")
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
      recipientName =
        (recipient as Profile).full_name?.trim() ||
        "RuffNeck member";
    }
  } else if (requestedRecipientId) {
    recipientError = "The selected member link is invalid.";
  }

  const {
    data: participantRows,
    error: participantError,
  } = await supabase
    .from("conversation_participants")
    .select("conversation_id, last_read_at")
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

  const conversationIds = [
    ...new Set(
      ownParticipantRecords.map((row) => row.conversation_id)
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

  // Count unread messages per conversation without downloading message bodies.
  // Each count query is still subject to the existing messages RLS policy.
  const unreadCountByConversation = new Map<string, number>();
  await Promise.all(
    conversations.map(async (conversation) => {
      const lastReadAt =
        lastReadAtByConversation.get(conversation.id) ??
        "1970-01-01T00:00:00.000Z";

      const { count, error } = await supabase
        .from("messages")
        .select("id", { count: "exact", head: true })
        .eq("conversation_id", conversation.id)
        .neq("sender_id", user.id)
        .is("deleted_at", null)
        .gt("created_at", lastReadAt);

      if (error) {
        console.error(
          `Failed to count unread messages for conversation ${conversation.id}:`,
          error.message
        );
        unreadCountByConversation.set(conversation.id, 0);
        return;
      }

      unreadCountByConversation.set(conversation.id, count ?? 0);
    })
  );

  // Use the secure RPC instead of selecting other users' participant rows
  // or profile rows directly. The RPC checks that the caller is active in
  // each conversation and only returns user_id, full_name, and avatar_url.
  const participantProfilesByConversation = new Map<
    string,
    ConversationParticipantProfile[]
  >();

  await Promise.all(
    conversations.map(async (conversation) => {
      const { data, error } = await supabase.rpc(
        "get_conversation_participants",
        { p_conversation_id: conversation.id }
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
      participantProfilesByConversation.get(conversation.id) ?? [];
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
        participant.full_name?.trim() || "RuffNeck member"
      );
    }
  }

  const existingDirectConversation =
    requestedRecipientId &&
    isValidUuid(requestedRecipientId)
      ? conversations.find((conversation) => {
          if (conversation.conversation_type !== "direct") {
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
      .order("created_at", { ascending: false });

    if (error) {
      console.error(
        "Failed to load recent messages:",
        error.message
      );
    } else {
      const seen = new Set<string>();

      latestMessages = ((data ?? []) as Message[]).filter(
        (message) => {
          if (seen.has(message.conversation_id)) {
            return false;
          }

          seen.add(message.conversation_id);
          return true;
        }
      );
    }
  }

  const latestMessageByConversation = new Map(
    latestMessages.map((message) => [
      message.conversation_id,
      message,
    ])
  );

  const conversationListItems: ConversationListItem[] = conversations.map(
    (conversation) => {
      const otherIds = otherParticipantIds.get(conversation.id) ?? [];
      const name =
        conversation.conversation_type === "intent"
          ? conversation.title || "Intent conversation"
          : otherIds
              .map((id) => profileNames.get(id) ?? "RuffNeck member")
              .join(", ") || "Direct conversation";
      const latestMessage = latestMessageByConversation.get(conversation.id);
      const unreadCount = unreadCountByConversation.get(conversation.id) ?? 0;
      const otherProfiles =
        participantProfilesByConversation.get(conversation.id)?.filter(
          (participant) => participant.user_id !== user.id
        ) ?? [];
      const avatarUrl =
        conversation.conversation_type === "direct"
          ? otherProfiles[0]?.avatar_url ?? null
          : null;
      const preview = latestMessage
        ? `${latestMessage.sender_id === user.id ? "You: " : ""}${latestMessage.body}`
        : "No messages yet. Start the conversation.";

      return {
        id: conversation.id,
        href: `/messages/${conversation.id}`,
        name,
        preview,
        dateLabel: latestMessage
          ? formatDate(latestMessage.created_at)
          : `Created ${formatDate(conversation.created_at)}`,
        conversationType: conversation.conversation_type,
        unreadCount,
        avatarUrl,
        isSelected: conversation.id === existingDirectConversation?.id,
      };
    }
  );

  return (
    <main className="page-shell">
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">
              PRIVATE COMMUNICATION
            </p>

            <h1>Messages</h1>
            <p className="muted">
              Continue conversations with people in your
              communities and around shared intentions.
            </p>
          </div>

          <Link
            href="/communities"
            className="button button-secondary"
          >
            Explore communities
          </Link>
        </div>

        {requestedRecipientId && recipientError && (
          <div
            className="feature-card"
            role="alert"
            style={{ marginBottom: "1.5rem" }}
          >
            <h2>Member unavailable</h2>
            <p className="muted">{recipientError}</p>

            <Link
              href="/members"
              className="button button-secondary"
            >
              Return to members
            </Link>
          </div>
        )}

        {requestedRecipientId &&
          !recipientError &&
          recipientName && (
            <div
              className="feature-card"
              style={{ marginBottom: "1.5rem" }}
            >
              <p className="eyebrow">SELECTED MEMBER</p>

              <h2>{recipientName}</h2>
              {existingDirectConversation ? (
                <>
                  <p className="muted">
                    Your direct conversation with this
                    member already exists.
                  </p>
                  <Link
                    href={`/messages/${existingDirectConversation.id}`}
                    className="button button-primary"
                  >
                    Open conversation
                  </Link>
                </>
              ) : (
                <>
                  <p className="muted">
                    No existing direct conversation was
                    found. A new conversation needs to be
                    created before you can send a message.
                  </p>
                  <Link
                    href={`/members/${requestedRecipientId}`}
                    className="button button-secondary"
                  >
                    View member profile
                  </Link>
                </>
              )}
            </div>
          )}

        {conversations.length === 0 ? (
          <div className="feature-card empty-state">
            <h2>No conversations yet</h2>
            <p className="muted">
              Join a community to connect with members.
              You can also respond to an open intention to
              begin a conversation through a shared purpose.
            </p>

            <div className="button-row">
              <Link
                href="/communities"
                className="button button-primary"
              >
                Find communities
              </Link>
              <Link
                href="/intents"
                className="button button-secondary"
              >
                Discover intentions
              </Link>
            </div>
          </div>
        ) : (
          <ConversationListFilters items={conversationListItems} />
        )}
      </section>
    </main>
  );
}
