import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ATTACHMENT_PREFIX = "__RN_CHAT_ATTACHMENT_V1__:";
const MAX_MESSAGE_LENGTH = 5000;
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
const MAX_ATTACHMENT_NAME_LENGTH = 120;

const ALLOWED_ATTACHMENTS: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "text/plain": [".txt"],
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function validateMessageBody(body: string): string | null {
  if (!body || body.length > MAX_MESSAGE_LENGTH) {
    return "Edited messages must contain between 1 and 5,000 characters.";
  }

  // Attachments are immutable through the text-edit endpoint.
  if (body.startsWith(ATTACHMENT_PREFIX)) {
    return "Attachments cannot be edited as text.";
  }

  return null;
}

export async function PATCH(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id: conversationId } = await params;

  if (!UUID_REGEX.test(conversationId)) {
    return jsonError("Invalid conversation ID.", 400);
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Authentication required.", 401);
  }

  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid edit request.", 400);
  }

  if (!isRecord(payload)) {
    return jsonError("Invalid edit request.", 400);
  }

  const messageId = payload.messageId;
  const rawBody = payload.body;

  if (typeof messageId !== "string" || !UUID_REGEX.test(messageId)) {
    return jsonError("Invalid message ID.", 400);
  }

  if (typeof rawBody !== "string") {
    return jsonError("A message body is required.", 400);
  }

  const body = rawBody.trim();
  const validationError = validateMessageBody(body);

  if (validationError) {
    return jsonError(validationError, 400);
  }

  const { data: participant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (participantError) {
    console.error(
      "Conversation participant lookup failed:",
      participantError.message
    );

    return jsonError("Unable to verify conversation membership.", 500);
  }

  if (!participant) {
    return jsonError(
      "You are not an active participant in this conversation.",
      403
    );
  }

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

    return jsonError("Unable to edit this message.", 500);
  }

  if (!message) {
    return jsonError(
      "Message not found or you cannot edit it.",
      404
    );
  }

  return NextResponse.json(
    { message },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}