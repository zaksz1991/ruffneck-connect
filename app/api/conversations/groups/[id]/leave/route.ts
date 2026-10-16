import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { error } = await supabase.rpc("leave_group_conversation", {
    p_conversation_id: id,
  });
  if (error) {
    const status = /authentication required/i.test(error.message) ? 401
      : /not found/i.test(error.message) ? 404
      : /creator cannot leave/i.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ success: true });
}
