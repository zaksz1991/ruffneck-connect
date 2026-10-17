import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NOTIFICATION_FIELDS =
  "id, actor_id, notification_type, title, body, link, is_read, created_at, read_at";

const ALLOWED_NOTIFICATION_TYPES = new Set([
  "community_join_approved",
  "community_join_declined",
  "community_join_request",
  "community_role_changed",
  "interest_received",
  "interest_approved",
  "interest_declined",
  "new_message",
]);

function sanitizeNotificationLink(link: string | null): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//")) {
    return null;
  }

  if (link.includes("\\") || /[\u0000-\u001F\u007F]/.test(link)) {
    return null;
  }

  try {
    const parsed = new URL(link, "https://ruffneck-connect.invalid");

    if (parsed.origin !== "https://ruffneck-connect.invalid") {
      return null;
    }

    const allowedPath =
      /^\/(home|communities(?:\/[a-zA-Z0-9_-]+)?|intents(?:\/[a-f0-9-]+)?|messages(?:\/[a-f0-9-]+)?|notifications)(?:\/)?$/i;

    if (!allowedPath.test(parsed.pathname)) {
      return null;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return null;
  }
}

function noStoreHeaders() {
  return { "Cache-Control": "no-store, max-age=0" };
}

export async function GET() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401, headers: noStoreHeaders() }
      );
    }

    const [notificationResult, unreadResult] = await Promise.all([
      supabase
        .from("notifications")
        .select(NOTIFICATION_FIELDS)
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(100),
      supabase
        .from("notifications")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("is_read", false),
    ]);

    if (notificationResult.error || unreadResult.error) {
      console.error(
        "Failed to load notifications:",
        notificationResult.error?.message ?? unreadResult.error?.message
      );
      return NextResponse.json(
        { error: "Unable to load notifications." },
        { status: 500, headers: noStoreHeaders() }
      );
    }

    const notifications = (notificationResult.data ?? []).map((item) => ({
      ...item,
      notification_type: ALLOWED_NOTIFICATION_TYPES.has(item.notification_type)
        ? item.notification_type
        : "unknown",
      link: sanitizeNotificationLink(item.link),
      is_read: Boolean(item.is_read),
    }));

    return NextResponse.json(
      {
        notifications,
        unread_count: unreadResult.count ?? 0,
      },
      { headers: noStoreHeaders() }
    );
  } catch (error) {
    console.error(
      "Unexpected notifications API error:",
      error instanceof Error ? error.message : "Unknown error"
    );

    return NextResponse.json(
      { error: "Unable to load notifications." },
      { status: 500, headers: noStoreHeaders() }
    );
  }
}
