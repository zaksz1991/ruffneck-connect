import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function PATCH(request: Request, context: RouteContext) {
  const { id } = await context.params;

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  }

  let body: { userId?: unknown; isAdmin?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  if (
    typeof body.userId !== "string" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(body.userId) ||
    typeof body.isAdmin !== "boolean"
  ) {
    return NextResponse.json(
      { error: "userId must be a UUID and isAdmin must be a boolean." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();

  if (authError || !authData.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data, error } = await supabase.rpc("set_group_admin", {
    p_conversation_id: id,
    p_user_id: body.userId,
    p_is_admin: body.isAdmin,
  });

  if (error) {
    const message = error.message || "Unable to update group administrator.";
    const status =
      /authentication required/i.test(message) ? 401 :
      /only the group creator|creator cannot be changed|active group participant/i.test(message) ? 403 :
      /not found/i.test(message) ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }

  return NextResponse.json({ success: Boolean(data) });
}
