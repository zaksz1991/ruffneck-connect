import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ForwardPayload = {
  messageId?: unknown;
  targetConversationId?: unknown;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id: sourceConversationId } = await params;

  if (!UUID_REGEX.test(sourceConversationId)) {
    return NextResponse.json({ error: "Invalid source conversation ID." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to forward a message." }, { status: 401 });
  }

  let payload: ForwardPayload;
  try {
    payload = (await request.json()) as ForwardPayload;
  } catch {
    return NextResponse.json({ error: "Invalid forwarding request." }, { status: 400 });
  }

  const messageId = typeof payload.messageId === "string" ? payload.messageId : "";
  const targetConversationId = typeof payload.targetConversationId === "string"
    ? payload.targetConversationId
    : "";

  if (!UUID_REGEX.test(messageId) || !UUID_REGEX.test(targetConversationId)) {
    return NextResponse.json({ error: "A valid message and destination are required." }, { status: 400 });
  }

  if (targetConversationId === sourceConversationId) {
    return NextResponse.json({ error: "Choose a different destination conversation." }, { status: 400 });
  }

  const { data: forwardedId, error: forwardError } = await supabase.rpc("forward_message", {
    p_source_conversation_id: sourceConversationId,
    p_message_id: messageId,
    p_target_conversation_id: targetConversationId,
  });

  if (forwardError || typeof forwardedId !== "string") {
    console.error("Message forwarding failed:", forwardError?.message ?? "No forwarded message ID returned.");
    const isPermissionError = forwardError?.code === "42501";
    const isNotFound = forwardError?.code === "P0002";
    return NextResponse.json(
      {
        error: isPermissionError
          ? "You must be an active participant in both conversations."
          : isNotFound
            ? "The original message is unavailable or was deleted."
            : "Unable to forward this message. Please try again.",
      },
      { status: isPermissionError ? 403 : isNotFound ? 404 : 500 }
    );
  }

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to_message_id, forwarded_from_message_id")
    .eq("id", forwardedId)
    .eq("conversation_id", targetConversationId)
    .single();

  if (messageError || !message) {
    console.error("Forwarded message was created but could not be reloaded:", messageError?.message);
    return NextResponse.json({ error: "Message was forwarded, but the updated conversation could not be loaded. Refresh it to see the message." }, { status: 200 });
  }

  const { data: participantRows, error: participantsError } = await supabase.rpc(
    "get_conversation_participants",
    { p_conversation_id: targetConversationId }
  );

  if (!participantsError) {
    const recipients = ((participantRows ?? []) as Array<{ user_id: string }>).
      filter((participant) => participant.user_id !== user.id);

    if (recipients.length > 0) {
      const senderName =
        user.user_metadata?.full_name?.trim() ||
        user.email?.split("@")[0] ||
        "A RuffNeck member";
      const preview = message.body.length > 140
        ? `${message.body.slice(0, 137)}...`
        : message.body;
      const { error: notificationError } = await supabase.from("notifications").insert(
        recipients.map((recipient) => ({
          user_id: recipient.user_id,
          actor_id: user.id,
          notification_type: "new_message",
          title: `${senderName} forwarded a message`.slice(0, 160),
          body: preview,
          link: `/messages/${targetConversationId}`,
        }))
      );
      if (notificationError) console.error("Forward notification insert failed:", notificationError.message);
    }
  } else {
    console.error("Could not load forwarding notification recipients:", participantsError.message);
  }

  return NextResponse.json({ message }, { status: 201 });
}
