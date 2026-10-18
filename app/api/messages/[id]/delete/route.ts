import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

export async function DELETE(
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
    return jsonError("Invalid delete request.", 400);
  }

  if (!isRecord(payload)) {
    return jsonError("Invalid delete request.", 400);
  }

  const { messageId } = payload;

  if (typeof messageId !== "string" || !UUID_REGEX.test(messageId)) {
    return jsonError("Invalid message ID.", 400);
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

    return jsonError(
      "Unable to verify conversation membership.",
      500
    );
  }

  if (!participant) {
    return jsonError(
      "You are not an active participant in this conversation.",
      403
    );
  }

  const { data: deletedMessage, error: deleteError } = await supabase
    .from("messages")
    .update({
      deleted_at: new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("sender_id", user.id)
    .is("deleted_at", null)
    .select("id, deleted_at")
    .maybeSingle();

  if (deleteError) {
    console.error(
      "Message soft-delete failed:",
      deleteError.message
    );

    return jsonError("Unable to delete this message.", 500);
  }

  if (!deletedMessage) {
    return jsonError(
      "Message not found or you cannot delete it.",
      404
    );
  }

  return NextResponse.json(
    {
      deleted: true,
      messageId: deletedMessage.id,
      deleted_at: deletedMessage.deleted_at,
    },
    {
      status: 200,
      headers: { "Cache-Control": "no-store" },
    }
  );
}