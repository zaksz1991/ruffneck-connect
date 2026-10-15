import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import NotificationBell from "@/components/NotificationBell";

export const dynamic = "force-dynamic";

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
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export default async function MessagesPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/messages");
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
      (participantRows ?? []).map((row) => row.conversation_id)
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
        conversations.map((conversation) => conversation.id)
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
          otherParticipantIds.get(participant.conversation_id) ?? [];

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

  let latestMessages: Message[] = [];

  if (conversations.length > 0) {
    const { data, error } = await supabase
      .from("messages")
      .select("conversation_id, body, sender_id, created_at")
      .in(
        "conversation_id",
        conversations.map((conversation) => conversation.id)
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
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <Link href="/home" className="brand">
            <span className="brand-mark">RN</span>
            <span>RuffNeck Connect</span>
          </Link>

          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/home">Home</Link>
            <Link href="/communities">Communities</Link>
            <Link href="/intents">Discover</Link>
            <Link href="/messages">Messages</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <main className="page-shell">
        <section className="section">
          <div className="section-heading">
            <div>
              <p className="eyebrow">PRIVATE COMMUNICATION</p>
              <h1>Messages</h1>
              <p className="muted">
                Continue conversations with people in your communities
                and around shared intentions.
              </p>
            </div>

            <Link
              href="/communities"
              className="button button-secondary"
            >
              Explore communities
            </Link>
          </div>

          {conversations.length === 0 ? (
            <div className="feature-card empty-state">
              <h2>No conversations yet</h2>

              <p className="muted">
                Join a community to connect with members. You can also
                respond to an open intention to begin a conversation
                through a shared purpose.
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

                const preview = latestMessage
                  ? `${latestMessage.sender_id === user.id ? "You: " : ""}${latestMessage.body}`
                  : "No messages yet. Start the conversation.";

                return (
                  <Link
                    key={conversation.id}
                    href={`/messages/${conversation.id}`}
                    className="conversation-card"
                  >
                    <div
                      className="conversation-avatar"
                      aria-hidden="true"
                    >
                      {conversationName.charAt(0).toUpperCase()}
                    </div>

                    <div className="conversation-content">
                      <div className="conversation-heading">
                        <h2>{conversationName}</h2>

                        <span className="conversation-type">
                          {conversation.conversation_type === "intent"
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
                          : `Created ${formatDate(conversation.created_at)}`}
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </>
  );
}