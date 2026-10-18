import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function wantsJson(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  const accept = request.headers.get("accept") ?? "";

  return (
    contentType.toLowerCase().includes("application/json") ||
    accept.toLowerCase().includes("application/json")
  );
}

function jsonResult(
  body: Record<string, unknown>,
  status = 200
) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function redirectTo(
  request: NextRequest,
  path: string
) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(
  request: NextRequest,
  context: RouteContext
) {
  const returnJson = wantsJson(request);
  const { id: communityId } = await context.params;

  if (!UUID_REGEX.test(communityId)) {
    if (returnJson) {
      return jsonResult(
        { success: false, error: "Invalid community ID." },
        400
      );
    }

    return redirectTo(request, "/communities?member_error=join_failed");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    if (returnJson) {
      return jsonResult(
        { success: false, error: "Please sign in to join this community." },
        401
      );
    }

    return redirectTo(
      request,
      `/login?next=${encodeURIComponent("/communities")}`
    );
  }

  // Used only for the native HTML form response. The RPC remains responsible
  // for validating community availability and membership permissions.
  const { data: community } = await supabase
    .from("communities")
    .select("slug")
    .eq("id", communityId)
    .maybeSingle();

  const { data: membershipStatus, error: joinError } = await supabase.rpc(
    "submit_community_join_request",
    { p_community_id: communityId }
  );

  if (joinError) {
    console.error(
      "Community join request failed:",
      joinError.message
    );

    if (returnJson) {
      return jsonResult(
        {
          success: false,
          error: "Unable to join this community. Please try again.",
        },
        400
      );
    }

    const fallbackPath = community?.slug
      ? `/communities/${encodeURIComponent(community.slug)}?member_error=join_failed`
      : "/communities?member_error=join_failed";

    return redirectTo(request, fallbackPath);
  }

  if (membershipStatus !== "pending" && membershipStatus !== "active") {
    console.error(
      "Community join RPC returned an unexpected status:",
      membershipStatus
    );

    if (returnJson) {
      return jsonResult(
        {
          success: false,
          error: "The community membership status could not be confirmed.",
        },
        500
      );
    }

    const fallbackPath = community?.slug
      ? `/communities/${encodeURIComponent(community.slug)}?member_error=join_failed`
      : "/communities?member_error=join_failed";

    return redirectTo(request, fallbackPath);
  }

  const message =
    membershipStatus === "pending"
      ? "Your request to join this community has been submitted."
      : "You have joined this community.";

  // The communities listing uses fetch() and expects JSON. Returning a 303
  // redirect to fetch() causes it to receive HTML, so response.json() throws
  // even though the database transaction has already succeeded. Return JSON
  // for fetch requests and redirect only for the page's native HTML form.
  if (returnJson) {
    return jsonResult({
      success: true,
      status: membershipStatus,
      message,
    });
  }

  const successPath = community?.slug
    ? `/communities/${encodeURIComponent(community.slug)}`
    : "/communities";

  return redirectTo(request, successPath);
}
