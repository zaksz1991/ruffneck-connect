import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const INTENT_TYPES = ["need", "offer", "build"] as const;

type IntentType = (typeof INTENT_TYPES)[number];

const MAX_TITLE_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 5000;
const MAX_CATEGORY_LENGTH = 80;
const MAX_LOCATION_LENGTH = 120;

export async function GET() {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { data: memberships, error: membershipError } = await supabase
    .from("community_members")
    .select("community_id")
    .eq("user_id", user.id)
    .eq("status", "active");

  if (membershipError) {
    return NextResponse.json(
      { error: "Could not retrieve community memberships." },
      { status: 500 }
    );
  }

  const communityIds = [
    ...new Set((memberships ?? []).map((item) => item.community_id)),
  ];

  if (communityIds.length === 0) {
    return NextResponse.json({ intents: [] });
  }

  const { data: intents, error } = await supabase
    .from("intents")
    .select(
      "id, community_id, author_id, intent_type, title, description, category, location_label, status, created_at, updated_at"
    )
    .in("community_id", communityIds)
    .in("status", ["open", "in_progress"])
    .order("created_at", { ascending: false })
    .limit(100);

  if (error) {
    return NextResponse.json(
      { error: "Could not retrieve intentions." },
      { status: 500 }
    );
  }

  return NextResponse.json({ intents: intents ?? [] });
}

export async function POST(request: Request) {
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

  let body: Record<string, unknown>;

  try {
    const parsed: unknown = await request.json();

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json(
        { error: "A valid JSON object is required." },
        { status: 400 }
      );
    }

    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON request body." },
      { status: 400 }
    );
  }

  const communityId =
    typeof body.community_id === "string" ? body.community_id : "";

  const intentType =
    typeof body.intent_type === "string" ? body.intent_type : "";

  const title = typeof body.title === "string" ? body.title.trim() : "";

  const description =
    typeof body.description === "string" ? body.description.trim() : "";

  const category =
    typeof body.category === "string" ? body.category.trim() : "";

  const location =
    typeof body.location_label === "string"
      ? body.location_label.trim()
      : "";

  if (!communityId) {
    return NextResponse.json(
      { error: "A community must be selected." },
      { status: 400 }
    );
  }

  if (!INTENT_TYPES.includes(intentType as IntentType)) {
    return NextResponse.json(
      { error: "Intent type must be need, offer, or build." },
      { status: 400 }
    );
  }

  if (title.length < 5 || title.length > MAX_TITLE_LENGTH) {
    return NextResponse.json(
      { error: "Title must contain between 5 and 160 characters." },
      { status: 400 }
    );
  }

  if (
    description.length < 10 ||
    description.length > MAX_DESCRIPTION_LENGTH
  ) {
    return NextResponse.json(
      { error: "Description must contain between 10 and 5000 characters." },
      { status: 400 }
    );
  }

  if (category.length > MAX_CATEGORY_LENGTH) {
    return NextResponse.json(
      { error: "Category cannot exceed 80 characters." },
      { status: 400 }
    );
  }

  if (location.length > MAX_LOCATION_LENGTH) {
    return NextResponse.json(
      { error: "Location cannot exceed 120 characters." },
      { status: 400 }
    );
  }

  const { data: membership, error: membershipError } = await supabase
    .from("community_members")
    .select("status")
    .eq("community_id", communityId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (
    membershipError ||
    !membership ||
    membership.status !== "active"
  ) {
    return NextResponse.json(
      { error: "You must be an active member of this community." },
      { status: 403 }
    );
  }

  const { data: community, error: communityError } = await supabase
    .from("communities")
    .select("id, status")
    .eq("id", communityId)
    .maybeSingle();

  if (communityError || !community || community.status !== "active") {
    return NextResponse.json(
      { error: "The selected community is unavailable." },
      { status: 400 }
    );
  }

  const { data: intent, error: insertError } = await supabase
    .from("intents")
    .insert({
      community_id: communityId,
      author_id: user.id,
      intent_type: intentType,
      title,
      description,
      category: category || null,
      location_label: location || null,
      status: "open",
    })
    .select(
      "id, community_id, author_id, intent_type, title, description, category, location_label, status, created_at"
    )
    .single();

  if (insertError) {
    return NextResponse.json(
      { error: "Could not create the intention." },
      { status: 500 }
    );
  }

  return NextResponse.json({ intent }, { status: 201 });
}