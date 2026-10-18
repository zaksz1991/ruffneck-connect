import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AttachmentMetadata = {
  path: string;
  name: string;
  type: string;
  size: number;
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

function isValidAttachment(value: unknown): value is AttachmentMetadata {
  if (!isRecord(value)) {
    return false;
  }

  const { path, name, type, size } = value;

  if (
    typeof path !== "string" ||
    typeof name !== "string" ||
    typeof type !== "string" ||
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > MAX_ATTACHMENT_SIZE ||
    name.length < 1 ||
    name.length > MAX_ATTACHMENT_NAME_LENGTH ||
    name !== name.trim() ||
    /[/\\\u0000-\u001f\u007f]/.test(name)
  ) {
    return false;
  }

  const segments = path.split("/");

  if (
    segments.length !== 3 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\\\u0000-\u001f\u007f]/.test(segment)
    )
  ) {
    return false;
  }

  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  const allowedExtensions = ALLOWED_ATTACHMENTS[type];

  if (!allowedExtensions || !allowedExtensions.includes(extension)) {
    return false;
  }

  return true;
}

function validateMessageBody(body: string): string | null {
  if (!body || body.length > MAX_MESSAGE_LENGTH) {
    return "Messages must contain between 1 and 5,000 characters.";
  }

  if (!body.startsWith(ATTACHMENT_PREFIX)) {
    return null;
  }

  const encodedMetadata = body.slice(ATTACHMENT_PREFIX.length);

  if (!encodedMetadata || encodedMetadata.length > 4000) {
    return "Invalid attachment information.";
  }

  try {
    const metadata: unknown = JSON.parse(encodedMetadata);

    if (!isValidAttachment(metadata)) {
      return "Invalid attachment information.";
    }

    return null;
  } catch {
    return "Invalid attachment information.";
  }
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id } = await params;

  if (!UUID_REGEX.test(id)) {
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

  const contentType = request.headers.get("content-type") ?? "";
  const isJson = contentType.includes("application/json");

  let rawBody: unknown;
  let rawReplyToMessageId: unknown = null;

  try {
    if (isJson) {
      const payload: unknown = await request.json();

      if (!isRecord(payload)) {
        return jsonError("Invalid message request.", 400);
      }

      rawBody = payload.body;
      rawReplyToMessageId = payload.replyToMessageId ?? null;
    } else {
      const formData = await request.formData();

      rawBody = formData.get("body");
      rawReplyToMessageId = formData.get("replyToMessageId");
    }
  } catch {
    return jsonError("Invalid message request.", 400);
  }

  if (typeof rawBody !== "string") {
    return jsonError("A message is required.", 400);
  }

  const messageBody = rawBody.trim();
  const validationError = validateMessageBody(messageBody);

  if (validationError) {
    return jsonError(validationError, 400);
  }

  const { data: participant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", id)
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
      return jsonError("Invalid reply target.", 400);
    }

    const { data: parentMessage, error: parentError } = await supabase
      .from("messages")
      .select("id, conversation_id, deleted_at")
      .eq("id", rawReplyToMessageId)
      .maybeSingle();

    if (parentError) {
      console.error(
        "Reply target lookup failed:",
        parentError.message
      );

      return jsonError("Unable to verify the reply target.", 500);
    }

    if (
      !parentMessage ||
      parentMessage.conversation_id !== id ||
      parentMessage.deleted_at !== null
    ) {
      return jsonError(
        "Choose an available message in this conversation to reply to.",
        400
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
      return jsonError(
        "This message was not sent because you or the other member has blocked the other.",
        403
      );
    }

    console.error(
      "Message insert failed:",
      insertError?.message ?? "No message returned."
    );

    return jsonError("Unable to send your message.", 500);
  }

  const { error: notificationError } = await supabase.rpc(
    "notify_message_recipients",
    { p_message_id: message.id }
  );

  if (notificationError) {
    console.error(
      "Message notification RPC failed:",
      notificationError.message
    );
  }

  if (isJson) {
    return NextResponse.json(
      { message },
      {
        status: 201,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  return NextResponse.redirect(
    new URL(`/messages/${id}`, request.url),
    303
  );
}