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
        "You must sign in to continue.",
        401
      );
    }

    // Confirm that this interest belongs to the requested intention.
    const { data: interest, error: interestError } = await supabase
      .from("intent_interests")
      .select("id, intent_id")
      .eq("id", interestId)
      .eq("intent_id", id)
      .maybeSingle();

    if (interestError) {
      console.error(
        "Interest verification failed:",
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

    // The database function must independently verify ownership
    // and ensure that the interest is still pending.
    const { data, error } = await supabase.rpc(
      "decline_intent_interest",
      {
        p_interest_id: interestId,
      }
    );

    if (error) {
      console.error(
        "Decline interest RPC failed:",
        error.message
      );

      const message = error.message.toLowerCase();

      if (
        message.includes("authentication required") ||
        message.includes("not authenticated")
      ) {
        return jsonError(
          "Your session has expired. Please sign in again.",
          401
        );
      }

      if (
        message.includes("only the intent owner") ||
        message.includes("permission denied") ||
        message.includes("not authorized")
      ) {
        return jsonError(
          "Only the intent owner can decline interest.",
          403
        );
      }

      if (
        message.includes("only pending interests") ||
        message.includes("already been processed") ||
        message.includes("not found")
      ) {
        return jsonError(
          "This request no longer exists or has already been processed.",
          409
        );
      }

      return jsonError(
        "Unable to decline this request. Please try again.",
        500
      );
    }

    if (data !== true) {
      return jsonError(
        "The request could not be declined.",
        500
      );
    }

    return NextResponse.json({
      success: true,
      interest_id: interestId,
      status: "declined",
    });
  } catch (error) {
    console.error("Unexpected decline-interest error:", error);

    return jsonError(
      "An unexpected error occurred. Please try again.",
      500
    );
  }
}