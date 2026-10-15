import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ReadRequest = {
  notification_id?: unknown;
  mark_all?: unknown;
};

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Authentication required." },
      {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  let body: ReadRequest;

  try {
    const payload: unknown = await request.json();

    if (
      typeof payload !== "object" ||
      payload === null ||
      Array.isArray(payload)
    ) {
      return NextResponse.json(
        { error: "The request body must be a JSON object." },
        { status: 400 }
      );
    }

    body = payload as ReadRequest;
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const markAll = body.mark_all === true;
  const notificationId = body.notification_id;

  if (
    markAll &&
    notificationId !== undefined
  ) {
    return NextResponse.json(
      {
        error:
          "Provide either notification_id or mark_all, not both.",
      },
      { status: 400 }
    );
  }

  if (
    !markAll &&
    (
      typeof notificationId !== "string" ||
      !UUID_REGEX.test(notificationId)
    )
  ) {
    return NextResponse.json(
      {
        error:
          "Provide a valid notification_id or set mark_all to true.",
      },
      { status: 400 }
    );
  }

  const now = new Date().toISOString();

  let query = supabase
    .from("notifications")
    .update({
      is_read: true,
      read_at: now,
    })
    .eq("user_id", user.id)
    .eq("is_read", false);

  if (!markAll && typeof notificationId === "string") {
    query = query.eq("id", notificationId);
  }

  const { data, error } = await query.select("id");

  if (error) {
    console.error(
      "Failed to mark notifications as read:",
      error.message
    );

    return NextResponse.json(
      { error: "Unable to update notifications." },
      {
        status: 500,
        headers: { "Cache-Control": "no-store" },
      }
    );
  }

  return NextResponse.json(
    {
      success: true,
      updated_count: data?.length ?? 0,
    },
    {
      headers: { "Cache-Control": "no-store" },
    }
  );
}