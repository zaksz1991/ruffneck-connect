import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function DELETE(
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
      { error: "Invalid delete request." },
      { status: 400 }
    );
  }

  if (!payload || typeof payload !== "object") {
    return NextResponse.json(
      { error: "Invalid delete request." },
      { status: 400 }
    );
  }

  const messageId = (payload as { messageId?: unknown }).messageId;
  if (typeof messageId !== "string" || !UUID_REGEX.test(messageId)) {
    return NextResponse.json(
      { error: "Invalid message ID." },
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

  // Soft-delete instead of physically removing the row. The SQL migration
  // included with this bundle grants UPDATE(deleted_at) and adds an RLS policy
  // that only lets the sender mark their own active-conversation message.
  const { data: deletedMessage, error: deleteError } = await supabase
    .from("messages")
    .update({ deleted_at: new Date().toISOString() })
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .eq("sender_id", user.id)
    .is("deleted_at", null)
    .select("id, deleted_at")
    .maybeSingle();

  if (deleteError) {
    console.error("Message soft-delete failed:", deleteError.message);
    return NextResponse.json(
      { error: "Unable to delete this message." },
      { status: 500 }
    );
  }

  if (!deletedMessage) {
    return NextResponse.json(
      { error: "Message not found or you cannot delete it." },
      { status: 404 }
    );
  }

  return NextResponse.json(
    { deleted: true, messageId: deletedMessage.id, deleted_at: deletedMessage.deleted_at },
    { status: 200 }
  );
}
