import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }
  const input = body as { name?: unknown; memberIds?: unknown };
  const name = typeof input.name === "string" ? input.name.trim() : "";
  const memberIds = Array.isArray(input.memberIds) ? input.memberIds : [];
  if (name.length < 1 || name.length > 80) {
    return NextResponse.json({ error: "Group name must be 1–80 characters." }, { status: 400 });
  }
  if (memberIds.length < 1 || memberIds.length > 49 || memberIds.some((id) => typeof id !== "string")) {
    return NextResponse.json({ error: "Select 1–49 other participants." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_group_conversation", {
    p_group_name: name,
    p_member_ids: memberIds,
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  return NextResponse.json({ conversationId: data }, { status: 201 });
}
