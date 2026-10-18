import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ConversationMessages from "@/components/ConversationMessages";
import ConversationReadStatus from "@/components/ConversationReadStatus";

export const dynamic = "force-dynamic";

type PageProps = { params: Promise<{ id: string }> };
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
  forwarded_from_message_id?: string | null;
  reply_to?: ReplyPreview | null;
};
type Conversation = {
  id: string;
  conversation_type: "direct" | "intent";
  intent_id: string | null;
  title: string | null;
  created_at: string;
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function ConversationPage({ params }: PageProps) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/messages/${id}`)}`);

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, conversation_type, intent_id, title, created_at")
    .eq("id", id)
    .maybeSingle();
  if (conversationError) console.error("Failed to load conversation:", conversationError.message);
  if (!conversation) notFound();
  const currentConversation = conversation as Conversation;

  const { data: ownParticipant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("user_id, status")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (participantError || !ownParticipant) notFound();

  const { data: participantRows, error: participantProfilesError } = await supabase.rpc(
    "get_conversation_participants",
    { p_conversation_id: id }
  );
  if (participantProfilesError) {
    console.error("Failed to load conversation participant profiles:", participantProfilesError.message);
  }
  const participants = (participantRows ?? []) as ConversationParticipantProfile[];
  const otherParticipants = participants.filter((participant) => participant.user_id !== user.id);
  const otherNames = otherParticipants.map((participant) => participant.full_name?.trim() || "RuffNeck member");
  const conversationTitle = currentConversation.conversation_type === "intent"
    ? currentConversation.title || "Intent conversation"
    : otherNames.join(", ") || "Direct conversation";

  // Use separate queries for reply targets. The previous self-relationship embed
  // failed in production because PostgREST could not resolve messages -> messages.
  const { data: messageRows, error: messagesError } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to_message_id, forwarded_from_message_id")
    .eq("conversation_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(200);
  if (messagesError) console.error("Failed to load messages:", messagesError.message);

  const newestFirst = (messageRows ?? []) as Message[];
  const replyIds = [...new Set(newestFirst
    .map((message) => message.reply_to_message_id)
    .filter((replyId): replyId is string => Boolean(replyId)))];
  const replyTargets = new Map<string, ReplyPreview>();

  if (replyIds.length > 0) {
    const { data: targetRows, error: targetError } = await supabase
      .from("messages")
      .select("id, sender_id, body, deleted_at")
      .eq("conversation_id", id)
      .in("id", replyIds);
    if (targetError) {
      console.error("Failed to load reply previews:", targetError.message);
    } else {
      for (const row of (targetRows ?? []) as ReplyPreview[]) replyTargets.set(row.id, row);
    }
  }

  const messages: Message[] = newestFirst.map((message) => ({
    ...message,
    reply_to: message.reply_to_message_id
      ? replyTargets.get(message.reply_to_message_id) ?? null
      : null,
  })).reverse();

  const latestOwnMessageAt = [...messages].reverse()
    .find((message) => message.sender_id === user.id)?.created_at ?? null;

  return (
    <main className="page-shell">
      <section className="section">
        <Link href="/messages" className="back-link">← All messages</Link>
        <div className="conversation-page-header">
          <div>
            <p className="eyebrow">
              {currentConversation.conversation_type === "intent" ? "INTENT CONVERSATION" : "PRIVATE CONVERSATION"}
            </p>
            <h1>{conversationTitle}</h1>
            <p className="muted">Messages are visible to active participants in this conversation.</p>
          </div>
          {otherParticipants[0]?.avatar_url && (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={otherParticipants[0].avatar_url}
              alt=""
              width={52}
              height={52}
              loading="lazy"
              style={{ width: 52, height: 52, borderRadius: "50%", objectFit: "cover", border: "2px solid var(--border)" }}
            />
          )}
        </div>
        <ConversationMessages
          conversationId={id}
          currentUserId={user.id}
          initialMessages={messages}
          participants={participants}
        />
        <ConversationReadStatus
          conversationId={id}
          currentUserId={user.id}
          initialLatestOwnMessageAt={latestOwnMessageAt}
        />
      </section>
    </main>
  );
}
