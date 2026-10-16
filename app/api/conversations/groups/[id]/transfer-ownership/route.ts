import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  try {
    const { id } = await context.params;
    const body: unknown = await request.json();

    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
      return NextResponse.json({ error: "Invalid group ID" }, { status: 400 });
    }
    if (!body || typeof body !== "object" || !("newOwnerId" in body)) {
      return NextResponse.json({ error: "newOwnerId is required" }, { status: 400 });
    }

    const newOwnerId = (body as { newOwnerId?: unknown }).newOwnerId;
    if (typeof newOwnerId !== "string" || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(newOwnerId)) {
      return NextResponse.json({ error: "Invalid newOwnerId" }, { status: 400 });
    }

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }

    const { error } = await supabase.rpc("transfer_group_ownership", {
      p_conversation_id: id,
      p_new_owner_id: newOwnerId,
    });

    if (error) {
      const status = /Authentication required/i.test(error.message) ? 401
        : /Only the current group creator|active group member|Group conversation not found|Choose another/i.test(error.message) ? 403
        : 400;
      return NextResponse.json({ error: error.message }, { status });
    }

    return NextResponse.json({ success: true, conversationId: id, ownerId: newOwnerId });
  } catch {
    return NextResponse.json({ error: "Unable to transfer group ownership" }, { status: 500 });
  }
}
