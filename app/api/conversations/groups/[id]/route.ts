import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function GET(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  const user = authData?.user;
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: conversation, error: conversationError } = await supabase
    .from("conversations")
    .select("id, title, created_by, conversation_type, type, created_at")
    .eq("id", id)
    .maybeSingle();

  if (conversationError) {
    return NextResponse.json({ error: "Unable to load group conversation." }, { status: 500 });
  }
  if (!conversation || (conversation.conversation_type !== "group" && conversation.type !== "group")) {
    return NextResponse.json({ error: "Group conversation not found." }, { status: 404 });
  }

  // This SECURITY DEFINER RPC checks that the caller is an active participant.
  const { data: participants, error: participantsError } = await supabase.rpc(
    "get_conversation_participants",
    { p_conversation_id: id },
  );

  if (participantsError) {
    const status = /participant|permission|access/i.test(participantsError.message) ? 403 : 500;
    return NextResponse.json(
      { error: status === 403 ? "You are not an active member of this group." : "Unable to load group members." },
      { status },
    );
  }

  return NextResponse.json({
    group: {
      id: conversation.id,
      title: conversation.title,
      createdBy: conversation.created_by,
      createdAt: conversation.created_at,
      isCreator: conversation.created_by === user.id,
    },
    participants: Array.isArray(participants) ? participants : [],
  });
}
