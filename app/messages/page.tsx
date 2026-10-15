import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<{
    to?: string;
  }>;
};

type Participant = {
  conversation_id: string;
  user_id: string;
  status: string;
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

type Message = {
  conversation_id: string;
  body: string;
  sender_id: string;
  created_at: string;
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
    .select("conversation_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (participantError) {
    console.error(
      "Failed to load conversation participants:",
      participantError.message
    );
  }

  const conversationIds = [
    ...new Set(
      (participantRows ?? []).map(
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

  const otherParticipantIds = new Map<string, string[]>();

  if (conversations.length > 0) {
    const { data: participants, error } = await supabase
      .from("conversation_participants")
      .select("conversation_id, user_id, status")
      .in(
        "conversation_id",
        conversations.map(
          (conversation) => conversation.id
        )
      )
      .eq("status", "active");

    if (error) {
      console.error(
        "Failed to load conversation members:",
        error.message
      );
    } else {
      const rows = (participants ?? []) as Participant[];

      for (const participant of rows) {
        if (participant.user_id === user.id) {
          continue;
        }

        const existing =
          otherParticipantIds.get(
            participant.conversation_id
          ) ?? [];

        existing.push(participant.user_id);

        otherParticipantIds.set(
          participant.conversation_id,
          existing
        );
      }
    }
  }

  const otherUserIds = [
    ...new Set(
      Array.from(otherParticipantIds.values()).flat()
    ),
  ];

  let profiles: Profile[] = [];

  if (otherUserIds.length > 0) {
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name")
      .in("id", otherUserIds);

    if (error) {
      console.error(
        "Failed to load participant profiles:",
        error.message
      );
    } else {
      profiles = (data ?? []) as Profile[];
    }
  }

  const profileNames = new Map(
    profiles.map((profile) => [
      profile.id,
      profile.full_name?.trim() || "RuffNeck member",
    ])
  );

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
          <div className="conversation-list">
            {conversations.map((conversation) => {
              const otherIds =
                otherParticipantIds.get(conversation.id) ?? [];

              const conversationName =
                conversation.conversation_type === "intent"
                  ? conversation.title ||
                    "Intent conversation"
                  : otherIds
                      .map(
                        (id) =>
                          profileNames.get(id) ??
                          "RuffNeck member"
                      )
                      .join(", ") || "Direct conversation";

              const latestMessage =
                latestMessageByConversation.get(
                  conversation.id
                );

              const preview = latestMessage
                ? `${
                    latestMessage.sender_id === user.id
                      ? "You: "
                      : ""
                  }${latestMessage.body}`
                : "No messages yet. Start the conversation.";

              const isSelected =
                conversation.id ===
                existingDirectConversation?.id;

              return (
                <Link
                  key={conversation.id}
                  href={`/messages/${conversation.id}`}
                  className="conversation-card"
                  aria-current={
                    isSelected ? "page" : undefined
                  }
                >
                  <div
                    className="conversation-avatar"
                    aria-hidden="true"
                  >
                    {conversationName
                      .charAt(0)
                      .toUpperCase()}
                  </div>

                  <div className="conversation-content">
                    <div className="conversation-heading">
                      <h2>{conversationName}</h2>

                      <span className="conversation-type">
                        {conversation.conversation_type ===
                        "intent"
                          ? "Intent"
                          : "Direct"}
                      </span>
                    </div>

                    <p className="conversation-preview">
                      {preview.length > 180
                        ? `${preview.slice(0, 180).trim()}…`
                        : preview}
                    </p>

                    <span className="conversation-date">
                      {latestMessage
                        ? formatDate(latestMessage.created_at)
                        : `Created ${formatDate(
                            conversation.created_at
                          )}`}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}