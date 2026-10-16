import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
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

  const payload = body as { title?: unknown; participantIds?: unknown };
  const title = typeof payload.title === "string" ? payload.title.trim() : "";
  const participantIds = Array.isArray(payload.participantIds)
    ? payload.participantIds.filter((value): value is string => typeof value === "string")
    : [];

  if (!title || title.length > 100) {
    return NextResponse.json({ error: "Group name must be between 1 and 100 characters." }, { status: 400 });
  }
  if (participantIds.some((id) => !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id))) {
    return NextResponse.json({ error: "One or more participant IDs are invalid." }, { status: 400 });
  }

  const { data, error } = await supabase.rpc("create_group_conversation", {
    p_title: title,
    p_participant_ids: participantIds,
  });

  if (error) {
    const status = /Authentication required/i.test(error.message) ? 401 : 400;
    return NextResponse.json({ error: error.message }, { status });
  }

  return NextResponse.json({ conversationId: data }, { status: 201 });
}
