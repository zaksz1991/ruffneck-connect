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
  "interest_received",
  "interest_approved",
  "interest_declined",
  "new_message",
]);

function sanitizeNotificationLink(link: string | null): string | null {
  if (!link || !link.startsWith("/") || link.startsWith("//")) {
    return null;
  }

  if (
    link.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(link)
  ) {
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

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const [notificationsResult, unreadResult] = await Promise.all([
    supabase
      .from("notifications")
      .select(NOTIFICATION_FIELDS)
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(50),

    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("is_read", false),
  ]);

  if (notificationsResult.error) {
    console.error(
      "Failed to load notifications:",
      notificationsResult.error.message
    );

    return NextResponse.json(
      { error: "Unable to load notifications." },
      { status: 500 }
    );
  }

  if (unreadResult.error) {
    console.error(
      "Failed to count unread notifications:",
      unreadResult.error.message
    );

    return NextResponse.json(
      { error: "Unable to retrieve unread notification count." },
      { status: 500 }
    );
  }

  const notifications = (notificationsResult.data ?? []).map(
    (notification) => ({
      ...notification,
      notification_type: ALLOWED_NOTIFICATION_TYPES.has(
        notification.notification_type
      )
        ? notification.notification_type
        : "unknown",
      link: sanitizeNotificationLink(notification.link),
    })
  );

  return NextResponse.json(
    {
      notifications,
      unread_count: unreadResult.count ?? 0,
    },
    {
      headers: {
        "Cache-Control": "private, no-store, max-age=0",
        Vary: "Cookie",
      },
    }
  );
}