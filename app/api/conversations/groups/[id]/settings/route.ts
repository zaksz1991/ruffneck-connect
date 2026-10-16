import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const title = typeof (body as { title?: unknown })?.title === "string"
    ? (body as { title: string }).title.trim()
    : "";
  if (!title || title.length > 100) {
    return NextResponse.json({ error: "Group name must be between 1 and 100 characters." }, { status: 400 });
  }

  const { error } = await supabase.rpc("rename_group_conversation", {
    p_conversation_id: id,
    p_title: title,
  });
  if (error) {
    const status = /authentication required/i.test(error.message) ? 401
      : /not found/i.test(error.message) ? 404
      : /only the group creator/i.test(error.message) ? 403 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ success: true, title });
}
