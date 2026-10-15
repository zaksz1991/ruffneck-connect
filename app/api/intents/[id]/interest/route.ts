import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type Intent = {
  id: string;
  community_id: string;
  author_id: string;
  status: string;
  title: string;
};

type ExistingInterest = {
  id: string;
  status: string;
};

const MAX_MESSAGE_LENGTH = 1500;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: Request,
  context: RouteContext
) {
  const { id } = await context.params;

  if (!UUID_REGEX.test(id)) {
    return NextResponse.redirect(
      new URL("/intents", request.url),
      303
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("next", `/intents/${id}`);

    return NextResponse.redirect(loginUrl, 303);
  }

  let formData: FormData;

  try {
    formData = await request.formData();
  } catch {
    return NextResponse.redirect(
      new URL(`/intents/${id}?error=invalid_request`, request.url),
      303
    );
  }

  const rawMessage = formData.get("message");

  if (rawMessage !== null && typeof rawMessage !== "string") {
    return NextResponse.redirect(
      new URL(`/intents/${id}?error=invalid_request`, request.url),
      303
    );
  }

  const message =
    typeof rawMessage === "string" ? rawMessage.trim() : "";

  if (message.length > MAX_MESSAGE_LENGTH) {
    return NextResponse.redirect(
      new URL(`/intents/${id}?error=message_too_long`, request.url),
      303
    );
  }

  const { data: intentData, error: intentError } = await supabase
    .from("intents")
    .select("id, community_id, author_id, status, title")
    .eq("id", id)
    .maybeSingle();

  if (intentError || !intentData) {
    return NextResponse.redirect(
      new URL("/intents", request.url),
      303
    );
  }

  const intent = intentData as Intent;

  if (intent.author_id === user.id) {
    return NextResponse.redirect(
      new URL(`/intents/${id}?error=self_interest`, request.url),
      303
    );
  }

  if (intent.status !== "open") {
    return NextResponse.redirect(
      new URL(`/intents/${id}?error=intent_closed`, request.url),
      303
    );
  }

  const { data: membership, error: membershipError } =
    await supabase
      .from("community_members")
      .select("status")
      .eq("community_id", intent.community_id)
      .eq("user_id", user.id)
      .maybeSingle();

  if (
    membershipError ||
    !membership ||
    membership.status !== "active"
  ) {
    return NextResponse.redirect(
      new URL(
        `/intents/${id}?error=membership_required`,
        request.url
      ),
      303
    );
  }

  const { data: existingData, error: existingError } =
    await supabase
      .from("intent_interests")
      .select("id, status")
      .eq("intent_id", id)
      .eq("user_id", user.id)
      .maybeSingle();

  if (existingError) {
    return NextResponse.redirect(
      new URL(`/intents/${id}?error=try_again`, request.url),
      303
    );
  }

  const existing = existingData as ExistingInterest | null;

  if (existing && existing.status !== "withdrawn") {
    return NextResponse.redirect(
      new URL(
        `/intents/${id}?error=already_submitted`,
        request.url
      ),
      303
    );
  }

  let saveError;

  if (existing?.status === "withdrawn") {
    const { error } = await supabase
      .from("intent_interests")
      .update({
        message: message || null,
        status: "pending",
        updated_at: new Date().toISOString(),
      })
      .eq("id", existing.id)
      .eq("user_id", user.id)
      .eq("status", "withdrawn");

    saveError = error;
  } else {
    const { error } = await supabase
      .from("intent_interests")
      .insert({
        intent_id: id,
        user_id: user.id,
        message: message || null,
        status: "pending",
      });

    saveError = error;
  }

  if (saveError) {
    console.error(
      "Failed to submit intent interest:",
      saveError.message
    );

    return NextResponse.redirect(
      new URL(`/intents/${id}?error=try_again`, request.url),
      303
    );
  }

  // Notify the intent author only after the interest is saved.
  // Notification failure must not invalidate the submitted interest.
  const { error: notificationError } = await supabase
    .from("notifications")
    .insert({
      user_id: intent.author_id,
      actor_id: user.id,
      notification_type: "interest_received",
      title: "Someone is interested in your intention",
      body: `A RuffNeck member has expressed interest in "${intent.title}".`,
      link: `/intents/${intent.id}`,
    });

  if (notificationError) {
    console.error(
      "Failed to create interest notification:",
      notificationError.message
    );
  }

  return NextResponse.redirect(
    new URL(
      `/intents/${id}?success=interest_submitted`,
      request.url
    ),
    303
  );
}