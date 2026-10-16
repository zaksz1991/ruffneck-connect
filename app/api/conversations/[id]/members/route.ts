import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id: conversationId } = await context.params;
  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const input = body as { memberId?: unknown; action?: unknown };
  if (typeof input.memberId !== "string" || !["add", "remove"].includes(String(input.action))) {
    return NextResponse.json({ error: "Provide a memberId and an add/remove action." }, { status: 400 });
  }

  const { error } = await supabase.rpc("manage_group_member", {
    p_conversation_id: conversationId,
    p_member_id: input.memberId,
    p_action: input.action,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: true });
}
