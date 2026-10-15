import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const ALLOWED_ACTIONS = ["approve", "decline", "remove"] as const;

type MemberAction = (typeof ALLOWED_ACTIONS)[number];

export async function PATCH(request: Request, context: RouteContext) {
  const { id: communityId } = await context.params;
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

  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "A valid JSON body is required." },
      { status: 400 }
    );
  }

  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const payload = body as Record<string, unknown>;

  const userId =
    typeof payload.user_id === "string" ? payload.user_id : "";

  const action =
    typeof payload.action === "string" ? payload.action : "";

  if (!userId) {
    return NextResponse.json(
      { error: "A member user_id is required." },
      { status: 400 }
    );
  }

  if (!ALLOWED_ACTIONS.includes(action as MemberAction)) {
    return NextResponse.json(
      { error: "Action must be approve, decline, or remove." },
      { status: 400 }
    );
  }

  if (userId === user.id) {
    return NextResponse.json(
      { error: "You cannot review your own membership." },
      { status: 400 }
    );
  }

  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("id, owner_id, name, slug, status")
    .eq("id", communityId)
    .maybeSingle();

  if (communityError || !community) {
    return NextResponse.json(
      { error: "Community not found." },
      { status: 404 }
    );
  }

  if (community.owner_id !== user.id) {
    return NextResponse.json(
      { error: "Only the community owner can manage membership." },
      { status: 403 }
    );
  }

  if (community.status !== "active") {
    return NextResponse.json(
      { error: "This community is not active." },
      { status: 400 }
    );
  }

  const { data: target, error: targetError } = await supabase
    .from("community_members")
    .select("role, status")
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .maybeSingle();

  if (targetError || !target) {
    return NextResponse.json(
      { error: "Membership record not found." },
      { status: 404 }
    );
  }

  if (target.role === "owner") {
    return NextResponse.json(
      {
        error:
          "The community owner's membership cannot be changed here.",
      },
      { status: 400 }
    );
  }

  let nextStatus: "active" | "removed";

  if (action === "approve") {
    if (target.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending requests can be approved." },
        { status: 409 }
      );
    }

    nextStatus = "active";
  } else if (action === "decline" || action === "remove") {
    if (action === "decline" && target.status !== "pending") {
      return NextResponse.json(
        { error: "Only pending requests can be declined." },
        { status: 409 }
      );
    }

    if (action === "remove" && target.status !== "active") {
      return NextResponse.json(
        { error: "Only active members can be removed." },
        { status: 409 }
      );
    }

    nextStatus = "removed";
  } else {
    return NextResponse.json(
      { error: "Unsupported membership action." },
      { status: 400 }
    );
  }

  const { data: updated, error: updateError } = await supabase
    .from("community_members")
    .update({ status: nextStatus })
    .eq("community_id", communityId)
    .eq("user_id", userId)
    .eq("status", target.status)
    .select("community_id, user_id, role, status")
    .maybeSingle();

  if (updateError || !updated) {
    return NextResponse.json(
      {
        error:
          "Could not update membership. Check community_members RLS policies and column-level permissions.",
      },
      { status: 500 }
    );
  }

  let notificationSent = false;

  if (action === "approve" || action === "decline") {
    const { error: notificationError } = await supabase.rpc(
      "notify_community_membership_decision",
      {
        p_user_id: userId,
        p_community_id: communityId,
        p_approved: action === "approve",
      }
    );

    if (notificationError) {
      console.error(
        "Membership notification failed:",
        notificationError.message
      );
    } else {
      notificationSent = true;
    }
  }

  return NextResponse.json({
    success: true,
    member: updated,
    notification_sent: notificationSent,
  });
}