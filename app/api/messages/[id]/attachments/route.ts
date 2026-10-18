import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "conversation-attachments";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);
const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
  params: Promise<{ id: string }>;
};

type ParticipantProfile = {
  user_id: string;
  full_name: string | null;
  avatar_url: string | null;
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    { status, headers: { "Cache-Control": "no-store" } }
  );
}

function safeFilename(value: string) {
  const cleaned = value
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 160);
  return cleaned || "attachment";
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id: conversationId } = await params;
  if (!UUID_REGEX.test(conversationId)) {
    return jsonError("Invalid conversation ID.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return jsonError("Authentication required. Sign in and try again.", 401);
  }

  const { data: participant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (participantError || !participant) {
    return jsonError("You are not an active participant in this conversation.", 403);
  }

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return jsonError("Choose a file and try again.", 400);
  }

  const candidate = formData.get("file");
  if (!(candidate instanceof File)) {
    return jsonError("No file was selected.", 400);
  }
  if (candidate.size < 1) {
    return jsonError("The selected file is empty.", 400);
  }
  if (candidate.size > MAX_FILE_BYTES) {
    return jsonError("Attachments must be 10 MB or smaller.", 413);
  }
  if (!ALLOWED_TYPES.has(candidate.type)) {
    return jsonError("Only JPG, PNG, WebP images and PDF documents are supported.", 415);
  }

  const filename = safeFilename(candidate.name);
  const storagePath = `${conversationId}/${user.id}/${crypto.randomUUID()}-${filename}`;
  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, candidate, {
      contentType: candidate.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error("Conversation attachment upload failed:", uploadError.message);
    return jsonError("The attachment could not be uploaded. Check the storage setup and try again.", 500);
  }

  // The attachment path is private. The default message_type is kept as text
  // for compatibility with deployments that restrict allowed message_type values.
  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: filename,
      attachment_url: storagePath,
    })
    .select(
      "id, conversation_id, sender_id, body, created_at, edited_at, deleted_at, reply_to_message_id, forwarded_from_message_id, attachment_url, message_type"
    )
    .single();

  if (insertError || !message) {
    await supabase.storage.from(BUCKET).remove([storagePath]);
    if (insertError?.message?.includes("MEMBER_BLOCKED")) {
      return jsonError("This attachment was not sent because one of these accounts has blocked the other.", 403);
    }
    console.error("Conversation attachment message insert failed:", insertError?.message);
    return jsonError("The file uploaded, but the message could not be saved. Please try again.", 500);
  }

  const { data: participantRows, error: recipientsError } = await supabase.rpc(
    "get_conversation_participants",
    { p_conversation_id: conversationId }
  );

  if (recipientsError) {
    console.error("Unable to load attachment notification recipients:", recipientsError.message);
  } else {
    const recipients = ((participantRows ?? []) as ParticipantProfile[]).filter(
      (recipient) => recipient.user_id !== user.id
    );
    if (recipients.length > 0) {
      const senderName =
        user.user_metadata?.full_name?.trim() ||
        user.email?.split("@")[0] ||
        "A RuffNeck member";
      const { error: notificationError } = await supabase
        .from("notifications")
        .insert(
          recipients.map((recipient) => ({
            user_id: recipient.user_id,
            actor_id: user.id,
            notification_type: "new_message",
            title: `New attachment from ${senderName}`.slice(0, 160),
            body: `Shared an attachment: ${filename}`.slice(0, 1000),
            link: `/messages/${conversationId}`,
          }))
        );
      if (notificationError) {
        console.error("Unable to create attachment notifications:", notificationError.message);
      }
    }
  }

  return NextResponse.json(
    { message },
    { status: 201, headers: { "Cache-Control": "no-store" } }
  );
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id: conversationId } = await params;
  const messageId = request.nextUrl.searchParams.get("messageId") ?? "";

  if (!UUID_REGEX.test(conversationId) || !UUID_REGEX.test(messageId)) {
    return jsonError("Invalid conversation or message ID.", 400);
  }

  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return jsonError("Authentication required.", 401);
  }

  const { data: participant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (participantError || !participant) {
    return jsonError("You cannot access attachments from this conversation.", 403);
  }

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("attachment_url")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (messageError || !message?.attachment_url) {
    return jsonError("This message has no available attachment.", 404);
  }

  const storagePath = message.attachment_url;
  if (!storagePath.startsWith(`${conversationId}/`)) {
    return jsonError("Invalid attachment path.", 403);
  }

  const { data: signedUrlData, error: signedUrlError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(storagePath, 60);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    console.error("Unable to create signed attachment URL:", signedUrlError?.message);
    return jsonError("The attachment could not be opened. Please try again.", 500);
  }

  return new NextResponse(null, {
    status: 302,
    headers: {
      Location: signedUrlData.signedUrl,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
    },
  });
}
