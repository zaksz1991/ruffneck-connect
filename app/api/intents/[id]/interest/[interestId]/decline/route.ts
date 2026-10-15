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
  _request: NextRequest,
  { params }: RouteContext
) {
  const { id, interestId } = await params;

  if (!UUID_REGEX.test(id) || !UUID_REGEX.test(interestId)) {
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
      { error: "You must sign in to continue." },
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
    console.error("Interest verification failed:", interestError.message);

    return NextResponse.json(
      { error: "Unable to verify this interest request." },
      { status: 500 }
    );
  }

  if (!interest) {
    return NextResponse.json(
      { error: "Interest request not found." },
      { status: 404 }
    );
  }

  // The database function independently verifies ownership and status.
  const { data, error } = await supabase.rpc(
    "decline_intent_interest",
    {
      p_interest_id: interestId,
    }
  );

  if (error) {
    console.error("Decline interest RPC failed:", error.message);

    const message = error.message;

    if (message.includes("Authentication required")) {
      return NextResponse.json(
        { error: "Your session has expired. Please sign in again." },
        { status: 401 }
      );
    }

    if (message.includes("Only the intent owner")) {
      return NextResponse.json(
        { error: "Only the intent owner can decline interest." },
        { status: 403 }
      );
    }

    if (
      message.includes("not found") ||
      message.includes("Only pending interests")
    ) {
      return NextResponse.json(
        { error: "This request no longer exists or has already been processed." },
        { status: 409 }
      );
    }

    return NextResponse.json(
      { error: "Unable to decline this request. Please try again." },
      { status: 500 }
    );
  }

  if (data !== true) {
    return NextResponse.json(
      { error: "The request could not be declined." },
      { status: 500 }
    );
  }

  return NextResponse.json({
    success: true,
    interest_id: interestId,
    status: "declined",
  });
}