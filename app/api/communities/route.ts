import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Please sign in to view communities." },
      { status: 401 }
    );
  }

  const { data: communities, error } = await supabase
    .from("communities")
    .select(
      "id, name, slug, description, category, location_label, visibility, join_approval_required, owner_id, created_at"
    )
    .eq("status", "active")
    .eq("visibility", "public")
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Community discovery error:", error.message);

    return NextResponse.json(
      { error: "Unable to load communities." },
      { status: 500 }
    );
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("community_members")
    .select("community_id, status, role")
    .eq("user_id", user.id);

  if (membershipError) {
    console.error("Membership lookup error:", membershipError.message);

    return NextResponse.json(
      { error: "Unable to load your memberships." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    communities: communities ?? [],
    memberships: memberships ?? [],
  });
}

export async function POST(request: Request) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Please sign in to create a community." },
      { status: 401 }
    );
  }

  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description =
    typeof body.description === "string" ? body.description.trim() : "";
  const category =
    typeof body.category === "string" ? body.category.trim() : "";
  const locationLabel =
    typeof body.location_label === "string"
      ? body.location_label.trim()
      : "";

  const visibility =
    body.visibility === "private" ? "private" : "public";

  const joinApprovalRequired = body.join_approval_required === true;

  if (name.length < 3 || name.length > 100) {
    return NextResponse.json(
      { error: "Community name must contain 3–100 characters." },
      { status: 400 }
    );
  }

  if (
    description.length > 1000 ||
    category.length > 80 ||
    locationLabel.length > 120
  ) {
    return NextResponse.json(
      { error: "One or more fields exceed their allowed length." },
      { status: 400 }
    );
  }

  const baseSlug =
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 70) || "community";

  const slug = `${baseSlug}-${crypto.randomUUID().slice(0, 8)}`;

  const { data: community, error } = await supabase
    .from("communities")
    .insert({
      owner_id: user.id,
      name,
      slug,
      description: description || null,
      category: category || null,
      location_label: locationLabel || null,
      visibility,
      join_approval_required: joinApprovalRequired,
      status: "active",
    })
    .select(
      "id, name, slug, description, category, location_label, visibility"
    )
    .single();

  if (error) {
    console.error("Community creation error:", error.message);

    return NextResponse.json(
      { error: "Community creation failed. Please try again." },
      { status: 400 }
    );
  }

  return NextResponse.json({ community }, { status: 201 });
}