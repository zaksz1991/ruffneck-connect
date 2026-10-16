import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ParticipantProfile = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.json(
      { error: "Invalid conversation ID." },
      { status: 400 }
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.redirect(
      new URL(
        `/login?next=${encodeURIComponent(`/messages/${id}`)}`,
        request.url
      ),
      303
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  let body: unknown;
  let rawReplyToMessageId: unknown = null;

  try {
    if (isJson) {
      const payload: unknown = await request.json();
      if (typeof payload === "object" && payload !== null) {
        body = "body" in payload ? payload.body : undefined;
        rawReplyToMessageId = "replyToMessageId" in payload
          ? payload.replyToMessageId
          : null;
      }
    } else {
      const formData = await request.formData();
      body = formData.get("body");
      rawReplyToMessageId = formData.get("replyToMessageId");
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid message request." },
      { status: 400 }
    );
  }

  if (typeof body !== "string") {
    return NextResponse.json(
      { error: "A message is required." },
      { status: 400 }
    );
  }

  const messageBody = body.trim();

  if (!messageBody || messageBody.length > 5000) {
    return NextResponse.json(
      {
        error:
          "Messages must contain between 1 and 5,000 characters.",
      },
      { status: 400 }
    );
  }

  const { data: participant, error: participantError } =
    await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", id)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

  if (participantError || !participant) {
    return NextResponse.json(
      {
        error:
          "You are not an active participant in this conversation.",
      },
      { status: 403 }
    );
  }

  let replyToMessageId: string | null = null;

  if (
    rawReplyToMessageId !== null &&
    rawReplyToMessageId !== undefined &&
    rawReplyToMessageId !== ""
  ) {
    if (
      typeof rawReplyToMessageId !== "string" ||
      !UUID_REGEX.test(rawReplyToMessageId)
    ) {
      return NextResponse.json(
        { error: "Invalid reply target." },
        { status: 400 }
      );
    }

    // Do not disclose whether a message exists in a different conversation.
    const { data: parentMessage, error: parentError } = await supabase
      .from("messages")
      .select("id, conversation_id, deleted_at")
      .eq("id", rawReplyToMessageId)
      .maybeSingle();

    if (
      parentError ||
      !parentMessage ||
      parentMessage.conversation_id !== id ||
      parentMessage.deleted_at !== null
    ) {
      return NextResponse.json(
        { error: "Choose an available message in this conversation to reply to." },
        { status: 400 }
      );
    }

    replyToMessageId = parentMessage.id;
  }

  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: id,
      sender_id: user.id,
      body: messageBody,
      ...(replyToMessageId ? { reply_to_message_id: replyToMessageId } : {}),
    })
    .select(
      "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to_message_id"
    )
    .single();

  if (insertError || !message) {
    console.error("Message insert failed:", insertError?.message);

    return NextResponse.json(
      { error: "Unable to send your message." },
      { status: 500 }
    );
  }

  // The AFTER INSERT database trigger updates last_message_at and updated_at.
  // The application role may not update these system-managed columns directly.

  // Use the membership-checked RPC to identify notification recipients.
  const { data: participantRows, error: recipientsError } =
    await supabase.rpc("get_conversation_participants", {
      p_conversation_id: id,
    });

  if (recipientsError) {
    console.error(
      "Failed to load message notification recipients:",
      recipientsError.message
    );
  } else {
    const recipients = (
      (participantRows ?? []) as ParticipantProfile[]
    ).filter((recipient) => recipient.user_id !== user.id);

    if (recipients.length > 0) {
      const senderName =
        user.user_metadata?.full_name?.trim() ||
        user.email?.split("@")[0] ||
        "A RuffNeck member";
      const preview =
        messageBody.length > 140
          ? `${messageBody.slice(0, 137)}...`
          : messageBody;

      const notifications = recipients.map((recipient) => ({
        user_id: recipient.user_id,
        actor_id: user.id,
        notification_type: "new_message",
        title: `New message from ${senderName}`.slice(0, 160),
        body: preview,
        link: `/messages/${id}`,
      }));

      const { error: notificationError } = await supabase
        .from("notifications")
        .insert(notifications);

      if (notificationError) {
        console.error(
          "Message notification insert failed:",
          notificationError.message
        );
      }
    }
  }

  if (isJson) {
    return NextResponse.json({ message }, { status: 201 });
  }

  return NextResponse.redirect(
    new URL(`/messages/${id}`, request.url),
    303
  );
}
