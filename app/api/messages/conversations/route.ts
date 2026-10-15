import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function POST(request: NextRequest) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "You must sign in to start a conversation." },
        { status: 401 }
      );
    }

    let body: { recipient_id?: unknown };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json(
        { error: "Invalid JSON request body." },
        { status: 400 }
      );
    }

    const recipientId = body.recipient_id;

    if (
      typeof recipientId !== "string" ||
      !UUID_REGEX.test(recipientId)
    ) {
      return NextResponse.json(
        { error: "A valid recipient ID is required." },
        { status: 400 }
      );
    }

    if (recipientId.toLowerCase() === user.id.toLowerCase()) {
      return NextResponse.json(
        { error: "You cannot start a conversation with yourself." },
        { status: 400 }
      );
    }

    const { data: conversationId, error: rpcError } =
      await supabase.rpc("create_direct_conversation", {
        p_recipient_id: recipientId,
      });

    if (rpcError) {
      console.error("Direct conversation creation failed:", rpcError);

      if (
        rpcError.message.includes("Authentication required")
      ) {
        return NextResponse.json(
          { error: "Please sign in again." },
          { status: 401 }
        );
      }

      if (
        rpcError.message.includes("Invalid recipient") ||
        rpcError.message.includes("Recipient not found")
      ) {
        return NextResponse.json(
          { error: "The selected recipient is invalid." },
          { status: 400 }
        );
      }

      if (
        rpcError.message.includes("share an active community")
      ) {
        return NextResponse.json(
          {
            error:
              "You must share an active community with this person before starting a direct conversation.",
          },
          { status: 403 }
        );
      }

      return NextResponse.json(
        { error: "Unable to start the conversation." },
        { status: 500 }
      );
    }

    if (typeof conversationId !== "string") {
      return NextResponse.json(
        { error: "The conversation could not be created." },
        { status: 500 }
      );
    }

    return NextResponse.json(
      {
        conversation: {
          id: conversationId,
          conversation_type: "direct",
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Conversation API error:", error);

    return NextResponse.json(
      { error: "An unexpected error occurred." },
      { status: 500 }
    );
  }
}