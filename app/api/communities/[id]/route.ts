import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ id: string }>;
};

type UpdatePayload = {
  name?: unknown;
  description?: unknown;
  category?: unknown;
  location_label?: unknown;
  visibility?: unknown;
  join_approval_required?: unknown;
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { success: false, error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function readJson(request: NextRequest): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

async function getAuthenticatedClient() {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) return { supabase, user: null };
  return { supabase, user };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Invalid community ID.", 400);

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return jsonError("Authentication required.", 401);

  const payload = await readJson(request);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonError("A valid JSON object is required.", 400);
  }

  const body = payload as UpdatePayload;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const description = typeof body.description === "string" ? body.description.trim() : "";
  const category = typeof body.category === "string" ? body.category.trim() : "";
  const locationLabel = typeof body.location_label === "string" ? body.location_label.trim() : "";
  const visibility = body.visibility;
  const approvalRequired = body.join_approval_required;

  if (name.length < 3 || name.length > 100) {
    return jsonError("Community name must be between 3 and 100 characters.", 400);
  }
  if (description.length > 1000) return jsonError("Description must be 1000 characters or fewer.", 400);
  if (category.length > 80) return jsonError("Category must be 80 characters or fewer.", 400);
  if (locationLabel.length > 120) return jsonError("Location must be 120 characters or fewer.", 400);
  if (visibility !== "public" && visibility !== "private") {
    return jsonError("Choose public or private visibility.", 400);
  }
  if (typeof approvalRequired !== "boolean") {
    return jsonError("Choose a valid membership approval setting.", 400);
  }

  const { error } = await supabase.rpc("update_community_as_owner", {
    p_community_id: id,
    p_name: name,
    p_description: description || null,
    p_category: category || null,
    p_location_label: locationLabel || null,
    p_visibility: visibility,
    p_join_approval_required: approvalRequired,
  });

  if (error) {
    console.error("Community update failed:", error.message);
    if (error.message.toLowerCase().includes("only the community owner")) {
      return jsonError("Only the community owner can edit this community.", 403);
    }
    if (error.message.toLowerCase().includes("community not found")) {
      return jsonError("Community not found.", 404);
    }
    return jsonError(error.message || "Unable to update the community.", 400);
  }

  return NextResponse.json(
    { success: true, message: "Community settings saved." },
    { headers: { "Cache-Control": "no-store" } }
  );
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const { id } = await context.params;
  if (!isUuid(id)) return jsonError("Invalid community ID.", 400);

  const { supabase, user } = await getAuthenticatedClient();
  if (!user) return jsonError("Authentication required.", 401);

  const payload = await readJson(request);
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return jsonError("A confirmation is required.", 400);
  }

  const confirmation = (payload as { confirmation?: unknown }).confirmation;
  if (typeof confirmation !== "string" || !confirmation.trim()) {
    return jsonError("Type the community name to confirm deletion.", 400);
  }

  const { error } = await supabase.rpc("delete_community_as_owner", {
    p_community_id: id,
    p_confirmation: confirmation,
  });

  if (error) {
    console.error("Community deletion failed:", error.message);
    const message = error.message.toLowerCase();
    if (message.includes("only the community owner")) {
      return jsonError("Only the community owner can delete this community.", 403);
    }
    if (message.includes("community not found")) {
      return jsonError("Community not found.", 404);
    }
    if (message.includes("confirmation did not match")) {
      return jsonError("The community name did not match. Nothing was deleted.", 400);
    }
    if (message.includes("foreign key") || message.includes("violates foreign key constraint")) {
      return jsonError("This community still has linked records that prevent deletion. Nothing was deleted; contact support to review its related content.", 409);
    }
    return jsonError(error.message || "Unable to delete the community.", 400);
  }

  return NextResponse.json(
    { success: true, message: "Community deleted." },
    { headers: { "Cache-Control": "no-store" } }
  );
}
