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
        "You must sign in to approve an interest.",
        401
      );
    }

    // Verify that the interest belongs to the requested intention.
    const { data: interest, error: interestError } = await supabase
      .from("intent_interests")
      .select("id, intent_id")
      .eq("id", interestId)
      .eq("intent_id", id)
      .maybeSingle();

    if (interestError) {
      console.error(
        "Interest lookup failed:",
        interestError.message
      );

      return jsonError(
        "Unable to verify the interest request.",
        500
      );
    }

    if (!interest) {
      return jsonError("Interest request not found.", 404);
    }

    // The database function must independently enforce ownership,
    // membership requirements, pending status, and safe conversation creation.
    const { data: conversationId, error: approvalError } =
      await supabase.rpc("approve_intent_interest", {
        p_interest_id: interestId,
      });

    if (approvalError) {
      console.error(
        "Interest approval failed:",
        approvalError.message
      );

      const message = approvalError.message.toLowerCase();

      if (
        message.includes("authentication required") ||
        message.includes("not authenticated")
      ) {
        return jsonError("Please sign in again.", 401);
      }

      if (
        message.includes("only the intent owner") ||
        message.includes("both participants must be active") ||
        message.includes("permission denied") ||
        message.includes("not authorized")
      ) {
        return jsonError(
          "You are not authorized to approve this interest, or a participant is not eligible.",
          403
        );
      }

      if (
        message.includes("not found") ||
        message.includes("no longer accepting") ||
        message.includes("only pending interests") ||
        message.includes("already been processed")
      ) {
        return jsonError(
          "This interest request is no longer available or has already been processed.",
          409
        );
      }

      return jsonError(
        "Unable to approve this interest. Please try again.",
        500
      );
    }

    if (
      typeof conversationId !== "string" ||
      !UUID_REGEX.test(conversationId)
    ) {
      console.error(
        "Interest approval returned an invalid conversation ID."
      );

      return jsonError(
        "The approval did not return a valid conversation. Refresh the page to check the request status.",
        500
      );
    }

    return NextResponse.json(
      {
        success: true,
        conversation_id: conversationId,
        conversation_url: `/messages/${conversationId}`,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Unexpected interest approval error:", error);

    return jsonError(
      "An unexpected error occurred. Please try again.",
      500
    );
  }
}