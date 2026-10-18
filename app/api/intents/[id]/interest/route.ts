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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), 303);
}

export async function POST(
  request: Request,
  context: RouteContext
) {
  try {
    const { id } = await context.params;

    if (!UUID_REGEX.test(id)) {
      return redirectTo(request, "/intents");
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
      return redirectTo(
        request,
        `/intents/${id}?error=invalid_request`
      );
    }

    const rawMessage = formData.get("message");

    if (rawMessage !== null && typeof rawMessage !== "string") {
      return redirectTo(
        request,
        `/intents/${id}?error=invalid_request`
      );
    }

    const message =
      typeof rawMessage === "string" ? rawMessage.trim() : "";

    if (message.length > MAX_MESSAGE_LENGTH) {
      return redirectTo(
        request,
        `/intents/${id}?error=message_too_long`
      );
    }

    const { data: intentData, error: intentError } = await supabase
      .from("intents")
      .select("id, community_id, author_id, status, title")
      .eq("id", id)
      .maybeSingle();

    if (intentError) {
      console.error(
        "Intent lookup failed:",
        intentError.message
      );

      return redirectTo(
        request,
        `/intents/${id}?error=try_again`
      );
    }

    if (!intentData) {
      return redirectTo(request, "/intents");
    }

    const intent = intentData as Intent;

    if (intent.author_id === user.id) {
      return redirectTo(
        request,
        `/intents/${id}?error=self_interest`
      );
    }

    if (intent.status !== "open") {
      return redirectTo(
        request,
        `/intents/${id}?error=intent_closed`
      );
    }

    // Only active community members may express interest.
    const { data: membership, error: membershipError } =
      await supabase
        .from("community_members")
        .select("status")
        .eq("community_id", intent.community_id)
        .eq("user_id", user.id)
        .maybeSingle();

    if (membershipError) {
      console.error(
        "Community membership lookup failed:",
        membershipError.message
      );

      return redirectTo(
        request,
        `/intents/${id}?error=try_again`
      );
    }

    if (!membership || membership.status !== "active") {
      return redirectTo(
        request,
        `/intents/${id}?error=membership_required`
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
      console.error(
        "Existing interest lookup failed:",
        existingError.message
      );

      return redirectTo(
        request,
        `/intents/${id}?error=try_again`
      );
    }

    const existing = existingData as ExistingInterest | null;

    if (existing && existing.status !== "withdrawn") {
      return redirectTo(
        request,
        `/intents/${id}?error=already_submitted`
      );
    }

    if (existing?.status === "withdrawn") {
      // Reopen only a withdrawn request belonging to this user.
      const { data: updatedInterest, error: updateError } =
        await supabase
          .from("intent_interests")
          .update({
            message: message || null,
            status: "pending",
            updated_at: new Date().toISOString(),
          })
          .eq("id", existing.id)
          .eq("intent_id", id)
          .eq("user_id", user.id)
          .eq("status", "withdrawn")
          .select("id")
          .maybeSingle();

      if (updateError || !updatedInterest) {
        console.error(
          "Failed to reopen withdrawn interest:",
          updateError?.message ?? "No row was updated."
        );

        return redirectTo(
          request,
          `/intents/${id}?error=try_again`
        );
      }
    } else {
      const { error: insertError } = await supabase
        .from("intent_interests")
        .insert({
          intent_id: id,
          user_id: user.id,
          message: message || null,
          status: "pending",
        });

      if (insertError) {
        console.error(
          "Failed to submit intent interest:",
          insertError.message
        );

        return redirectTo(
          request,
          `/intents/${id}?error=try_again`
        );
      }
    }

    // Notify the author after the interest is successfully saved.
    // Notification failure does not undo a successful submission.
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

    return redirectTo(
      request,
      `/intents/${id}?success=interest_submitted`
    );
  } catch (error) {
    console.error(
      "Unexpected intent-interest submission error:",
      error
    );

    const url = new URL(request.url);
    const match = url.pathname.match(
      /^\/api\/intents\/([0-9a-f-]+)\/interest$/i
    );

    if (match && UUID_REGEX.test(match[1])) {
      return redirectTo(
        request,
        `/intents/${match[1]}?error=try_again`
      );
    }

    return redirectTo(request, "/intents");
  }
}