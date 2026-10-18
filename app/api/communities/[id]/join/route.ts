import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function redirectTo(request: NextRequest, path: string) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;

  if (!UUID_REGEX.test(id)) {
    return redirectTo(request, "/communities?member_error=join_failed");
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const nextPath = `/communities`;
    return redirectTo(
      request,
      `/login?next=${encodeURIComponent(nextPath)}`
    );
  }

  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("id, slug, status")
    .eq("id", id)
    .maybeSingle();

  if (communityError || !community || community.status !== "active") {
    console.error(
      "Community join lookup failed:",
      communityError?.message ?? "Community missing or inactive"
    );
    return redirectTo(request, "/communities?member_error=join_failed");
  }

  const destination = `/communities/${community.slug}`;
  const { data: result, error: joinError } = await supabase.rpc(
    "submit_community_join_request",
    { p_community_id: id }
  );

  if (joinError) {
    console.error("Community join failed:", joinError.message);
    return redirectTo(
      request,
      `${destination}?member_error=join_failed`
    );
  }

  if (result !== "active" && result !== "pending") {
    console.error("Unexpected community join result:", result);
    return redirectTo(
      request,
      `${destination}?member_error=join_failed`
    );
  }

  return redirectTo(request, destination);
}
