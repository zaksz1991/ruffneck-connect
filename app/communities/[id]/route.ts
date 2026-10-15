import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function POST(request: Request, context: RouteContext) {
  const { id } = await context.params;
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `/communities/${id}`);

    return NextResponse.redirect(loginUrl, 303);
  }

  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("id, slug, owner_id, visibility, join_approval_required, status")
    .eq("id", id)
    .maybeSingle();

  if (communityError || !community || community.status !== "active") {
    return NextResponse.redirect(new URL("/communities", request.url), 303);
  }

  const communityUrl = new URL(
    `/communities/${community.slug}`,
    request.url
  );

  if (community.owner_id === user.id) {
    return NextResponse.redirect(communityUrl, 303);
  }

  if (community.visibility === "private") {
    return NextResponse.redirect(
      new URL("/communities?error=private_community", request.url),
      303
    );
  }

  const { data: existing, error: membershipError } = await supabase
    .from("community_members")
    .select("status, role")
    .eq("community_id", community.id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) {
    return NextResponse.redirect(
      new URL("/communities?error=join_failed", request.url),
      303
    );
  }

  if (existing?.status === "active") {
    return NextResponse.redirect(communityUrl, 303);
  }

  const nextStatus = community.join_approval_required ? "pending" : "active";

  if (existing) {
    const { error: updateError } = await supabase
      .from("community_members")
      .update({
        status: nextStatus,
        role: "member",
      })
      .eq("community_id", community.id)
      .eq("user_id", user.id)
      .eq("status", "removed");

    if (updateError) {
      return NextResponse.redirect(
        new URL("/communities?error=join_failed", request.url),
        303
      );
    }
  } else {
    const { error: insertError } = await supabase
      .from("community_members")
      .insert({
        community_id: community.id,
        user_id: user.id,
        role: "member",
        status: nextStatus,
      });

    if (insertError) {
      return NextResponse.redirect(
        new URL("/communities?error=join_failed", request.url),
        303
      );
    }
  }

  const destination = new URL(communityUrl);
  destination.searchParams.set(
    community.join_approval_required ? "success" : "joined",
    community.join_approval_required ? "request_submitted" : "true"
  );

  return NextResponse.redirect(destination, 303);
}