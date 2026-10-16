import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConversationMessages from "@/components/ConversationMessages";

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

  // Use the membership-checked RPC to reveal only participant IDs, names,
  // and avatar URLs. Direct reads of other membership rows remain restricted.
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
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);

  if (messagesError) {
    console.error(
      "Failed to load messages:",
      messagesError.message
    );
  }

  // Fetch newest rows for scale, then restore chronological display order.
  const messages = ((messageRows ?? []) as Message[]).reverse();

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
              Messages are visible to active participants in this conversation.
            </p>
          </div>
          {otherParticipants[0]?.avatar_url && (
            <img
              src={otherParticipants[0].avatar_url}
              alt=""
              width={52}
              height={52}
              loading="lazy"
              style={{
                width: 52,
                height: 52,
                borderRadius: "50%",
                objectFit: "cover",
                border: "2px solid var(--border)",
              }}
            />
          )}
        </div>

        <ConversationMessages
          conversationId={id}
          currentUserId={user.id}
          initialMessages={messages}
          participants={participants}
        />
      </section>
    </main>
  );
}
