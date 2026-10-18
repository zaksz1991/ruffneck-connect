import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

 type RouteContext = {
  params: Promise<{ id: string }>;
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
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401, headers: { "Cache-Control": "no-store" } }
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");
  let rawBody: unknown;
  let rawReplyToMessageId: unknown = null;

  try {
    if (isJson) {
      const payload: unknown = await request.json();
      if (typeof payload === "object" && payload !== null && !Array.isArray(payload)) {
        rawBody = "body" in payload ? payload.body : undefined;
        rawReplyToMessageId = "replyToMessageId" in payload
          ? payload.replyToMessageId
          : null;
      }
    } else {
      const formData = await request.formData();
      rawBody = formData.get("body");
      rawReplyToMessageId = formData.get("replyToMessageId");
    }
  } catch {
    return NextResponse.json(
      { error: "Invalid message request." },
      { status: 400 }
    );
  }

  if (typeof rawBody !== "string") {
    return NextResponse.json(
      { error: "A message is required." },
      { status: 400 }
    );
  }

  const messageBody = rawBody.trim();
  if (!messageBody || messageBody.length > 5000) {
    return NextResponse.json(
      { error: "Messages must contain between 1 and 5,000 characters." },
      { status: 400 }
    );
  }

  const { data: participant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (participantError || !participant) {
    return NextResponse.json(
      { error: "You are not an active participant in this conversation." },
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
      ...(replyToMessageId
        ? { reply_to_message_id: replyToMessageId }
        : {}),
    })
    .select(
      "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to_message_id"
    )
    .single();

  if (insertError || !message) {
    if (insertError?.message?.includes("MEMBER_BLOCKED")) {
      return NextResponse.json(
        {
          error:
            "This message was not sent because you or the other member has blocked the other.",
        },
        { status: 403, headers: { "Cache-Control": "no-store" } }
      );
    }

    console.error("Message insert failed:", insertError?.message);
    return NextResponse.json(
      { error: "Unable to send your message." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }

  // This SECURITY DEFINER RPC inserts notifications without requiring the
  // authenticated client to have direct INSERT permission on notifications.
  const { error: notificationError } = await supabase.rpc(
    "notify_message_recipients",
    { p_message_id: message.id }
  );

  if (notificationError) {
    // A notification failure must not turn a successfully sent message into a failure.
    console.error(
      "Message notification RPC failed:",
      notificationError.message
    );
  }

  if (isJson) {
    return NextResponse.json(
      { message },
      { status: 201, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.redirect(
    new URL(`/messages/${id}`, request.url),
    303
  );
}
