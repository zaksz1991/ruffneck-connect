import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id: conversationId } = await params;

  if (!UUID_REGEX.test(conversationId)) {
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
      { status: 401 }
    );
  }

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid edit request." },
      { status: 400 }
    );
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { error: "Invalid edit request." },
      { status: 400 }
    );
  }

  const record = payload as { messageId?: unknown; body?: unknown };
  const messageId = record.messageId;
  const rawBody = record.body;

  if (typeof messageId !== "string" || !UUID_REGEX.test(messageId)) {
    return NextResponse.json(
      { error: "Invalid message ID." },
      { status: 400 }
    );
  }

  if (typeof rawBody !== "string") {
    return NextResponse.json(
      { error: "A message body is required." },
      { status: 400 }
    );
  }

  const body = rawBody.trim();
  if (!body || body.length > 5000) {
    return NextResponse.json(
      { error: "Edited messages must contain between 1 and 5,000 characters." },
      { status: 400 }
    );
  }

  const { data: participant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (participantError || !participant) {
    return NextResponse.json(
      { error: "You are not an active participant in this conversation." },
      { status: 403 }
    );
  }

  // RLS independently enforces that the row belongs to the caller and is not
  // deleted. The database trigger maintains edited_at when body changes.
  const { data: message, error: updateError } = await supabase
    .from("messages")
    .update({ body })
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("sender_id", user.id)
    .is("deleted_at", null)
    .select(
      "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to_message_id"
    )
    .maybeSingle();

  if (updateError) {
    console.error("Message edit failed:", updateError.message);
    return NextResponse.json(
      { error: "Unable to edit this message." },
      { status: 500 }
    );
  }

  if (!message) {
    return NextResponse.json(
      { error: "Message not found or you cannot edit it." },
      { status: 404 }
    );
  }

  return NextResponse.json({ message }, { status: 200 });
}
