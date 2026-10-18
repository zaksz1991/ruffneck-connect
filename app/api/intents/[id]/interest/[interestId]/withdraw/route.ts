import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type RouteContext = {
  params: Promise<{
    id: string;
    interestId: string;
  }>;
};

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function jsonError(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

export async function POST(
  _request: NextRequest,
  { params }: RouteContext
) {
  try {
    const { id, interestId } = await params;

    if (!UUID_REGEX.test(id) || !UUID_REGEX.test(interestId)) {
      return jsonError("Invalid intent or interest ID.", 400);
    }

    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return jsonError(
        "You must sign in to withdraw your interest.",
        401
      );
    }

    // Confirm that the interest exists and belongs to this intention.
    const { data: interest, error: interestError } = await supabase
      .from("intent_interests")
      .select("id, intent_id, user_id, status")
      .eq("id", interestId)
      .eq("intent_id", id)
      .maybeSingle();

    if (interestError) {
      console.error(
        "Interest lookup failed:",
        interestError.message
      );

      return jsonError(
        "Unable to verify this interest request.",
        500
      );
    }

    if (!interest) {
      return jsonError("Interest request not found.", 404);
    }

    // Users can only withdraw their own requests.
    if (interest.user_id !== user.id) {
      return jsonError(
        "You are not authorized to withdraw this interest request.",
        403
      );
    }

    // Only pending requests can be withdrawn.
    if (interest.status !== "pending") {
      if (interest.status === "withdrawn") {
        return jsonError(
          "This interest request has already been withdrawn.",
          409
        );
      }

      if (interest.status === "approved") {
        return jsonError(
          "This interest has already been approved and cannot be withdrawn here.",
          409
        );
      }

      if (interest.status === "declined") {
        return jsonError(
          "This interest request has already been declined.",
          409
        );
      }

      return jsonError(
        "This interest request can no longer be withdrawn.",
        409
      );
    }

    // Update only if the request is still pending and belongs to this user.
    // The status condition prevents overwriting a concurrent approval or decline.
    const { data: updatedInterest, error: updateError } = await supabase
      .from("intent_interests")
      .update({
        status: "withdrawn",
        updated_at: new Date().toISOString(),
      })
      .eq("id", interestId)
      .eq("intent_id", id)
      .eq("user_id", user.id)
      .eq("status", "pending")
      .select("id")
      .maybeSingle();

    if (updateError) {
      console.error(
        "Interest withdrawal failed:",
        updateError.message
      );

      return jsonError(
        "Unable to withdraw this interest request. Please try again.",
        500
      );
    }

    if (!updatedInterest) {
      return jsonError(
        "This request has changed or has already been processed. Refresh the page and try again.",
        409
      );
    }

    return NextResponse.json(
      {
        success: true,
        interest_id: updatedInterest.id,
        status: "withdrawn",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Unexpected interest withdrawal error:", error);

    return jsonError(
      "An unexpected error occurred. Please try again.",
      500
    );
  }
}