import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JoinStatus = "active" | "pending";

function wantsJson(request: NextRequest) {
  return (
    request.headers.get("content-type")?.toLowerCase().includes("application/json") === true ||
    request.headers.get("accept")?.toLowerCase().includes("application/json") === true ||
    request.headers.get("x-requested-with")?.toLowerCase() === "xmlhttprequest"
  );
}

function failure(
  request: NextRequest,
  message: string,
  status: number,
  redirectPath = "/communities?error=join_failed"
) {
  if (wantsJson(request)) {
    return NextResponse.json(
      { success: false, error: message },
      { status, headers: { "Cache-Control": "no-store" } }
    );
  }

  return NextResponse.redirect(new URL(redirectPath, request.url), 303);
}

function success(
  request: NextRequest,
  status: JoinStatus,
  communityName: string,
  communityPath: string
) {
  if (wantsJson(request)) {
    return NextResponse.json(
      {
        success: true,
        status,
        message:
          status === "pending"
            ? `Your request to join \"${communityName}\" has been submitted.`
            : `You have joined \"${communityName}\".`,
      },
      { headers: { "Cache-Control": "no-store" } }
    );
  }

  const destination = new URL(communityPath, request.url);
  destination.searchParams.set(
    status === "pending" ? "success" : "joined",
    status === "pending" ? "request_submitted" : "true"
  );
  return NextResponse.redirect(destination, 303);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!UUID_REGEX.test(id)) {
    return failure(request, "Invalid community ID.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    if (wantsJson(request)) {
      return failure(request, "Please sign in to join a community.", 401);
    }
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent("/communities")}`, request.url),
      303
    );
  }

  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("id, slug, name, owner_id, visibility, status")
    .eq("id", id)
    .maybeSingle();

  if (communityError) {
    console.error("Community join lookup failed:", communityError.message);
    return failure(request, "Unable to load this community. Please try again.", 500);
  }

  if (!community || community.status !== "active") {
    return failure(request, "This community is unavailable.", 404);
  }

  const communityPath = `/communities/${community.slug}`;

  if (community.owner_id === user.id) {
    return success(request, "active", community.name, communityPath);
  }

  if (community.visibility === "private") {
    return failure(
      request,
      "This is a private community and cannot be joined through public discovery.",
      403,
      "/communities?error=private_community"
    );
  }

  const { data: result, error: joinError } = await supabase.rpc(
    "submit_community_join_request",
    { p_community_id: id }
  );

  if (joinError) {
    console.error("Community join failed:", joinError.message);
    const lowerMessage = joinError.message.toLowerCase();
    const status = lowerMessage.includes("permission") ? 403 : 400;
    return failure(
      request,
      joinError.message || "Unable to submit the membership request.",
      status,
      `${communityPath}?member_error=join_failed`
    );
  }

  if (result !== "active" && result !== "pending") {
    console.error("Unexpected community join result:", result);
    return failure(
      request,
      "The membership request returned an unexpected result.",
      500,
      `${communityPath}?member_error=join_failed`
    );
  }

  return success(request, result as JoinStatus, community.name, communityPath);
}
