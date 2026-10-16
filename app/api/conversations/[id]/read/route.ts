import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { data, error } = await supabase.rpc(
    "mark_conversation_messages_read",
    { p_conversation_id: id },
  );

  if (error) {
    const status = /participant/i.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: "Unable to mark conversation as read" }, { status });
  }

  return NextResponse.json({ success: true, updated: data ?? 0 });
}
