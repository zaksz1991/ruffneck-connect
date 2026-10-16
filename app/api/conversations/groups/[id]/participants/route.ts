import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function POST(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const userId = (body as { userId?: unknown })?.userId;
  if (typeof userId !== "string" || !isUuid(userId)) {
    return NextResponse.json({ error: "A valid userId is required." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("add_group_participant", {
    p_conversation_id: id,
    p_user_id: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: data === true });
}

export async function DELETE(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const { id } = await context.params;
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const userId = (body as { userId?: unknown })?.userId;
  if (typeof userId !== "string" || !isUuid(userId)) {
    return NextResponse.json({ error: "A valid userId is required." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("remove_group_participant", {
    p_conversation_id: id,
    p_user_id: userId,
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ success: data === true });
}
