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
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id, interestId } = await params;

  if (
    !UUID_REGEX.test(id) ||
    !UUID_REGEX.test(interestId)
  ) {
    return NextResponse.json(
      { error: "Invalid intent or interest ID." },
      { status: 400 }
    );
  }

  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "You must sign in to approve an interest." },
      { status: 401 }
    );
  }

  // Verify that the interest belongs to the requested intent.
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

    return NextResponse.json(
      { error: "Unable to verify the interest request." },
      { status: 500 }
    );
  }

  if (!interest) {
    return NextResponse.json(
      { error: "Interest request not found." },
      { status: 404 }
    );
  }

  const { data: conversationId, error: approvalError } =
    await supabase.rpc("approve_intent_interest", {
      p_interest_id: interestId,
    });

  if (approvalError) {
    console.error(
      "Interest approval failed:",
      approvalError.message
    );

    const message = approvalError.message;

    if (
      message.includes("Only the intent owner") ||
      message.includes("Both participants must be active")
    ) {
      return NextResponse.json(
        { error: message },
        { status: 403 }
      );
    }

    if (
      message.includes("not found") ||
      message.includes("no longer accepting") ||
      message.includes("Only pending interests")
    ) {
      return NextResponse.json(
        { error: message },
        { status: 409 }
      );
    }

    if (message.includes("Authentication required")) {
      return NextResponse.json(
        { error: "Please sign in again." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: "Unable to approve this interest." },
      { status: 500 }
    );
  }

  if (typeof conversationId !== "string") {
    return NextResponse.json(
      { error: "Conversation creation failed." },
      { status: 500 }
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
}