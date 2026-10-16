import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "text/plain",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function safeFilename(value: string) {
  const cleaned = value
    .normalize("NFKC")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.{2,}/g, ".")
    .slice(0, 120);
  return cleaned || "attachment";
}

export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const { id: conversationId } = await context.params;
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Sign in to send attachments." }, { status: 401 });
    }

    const { data: participant, error: participantError } = await supabase
      .from("conversation_participants")
      .select("conversation_id")
      .eq("conversation_id", conversationId)
      .eq("user_id", user.id)
      .eq("status", "active")
      .maybeSingle();

    if (participantError || !participant) {
      return NextResponse.json({ error: "Conversation not found or access denied." }, { status: 403 });
    }

    const formData = await request.formData();
    const fileValue = formData.get("file");
    const captionValue = formData.get("caption");

    if (!(fileValue instanceof File)) {
      return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
    }
    if (fileValue.size < 1 || fileValue.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "Files must be between 1 byte and 10 MB." }, { status: 413 });
    }
    if (!ALLOWED_TYPES.has(fileValue.type)) {
      return NextResponse.json({ error: "Unsupported file type. Use an image, PDF, TXT, DOC, or DOCX file." }, { status: 415 });
    }

    const filename = safeFilename(fileValue.name);
    const objectPath = `${conversationId}/${user.id}/${crypto.randomUUID()}-${filename}`;
    const bytes = new Uint8Array(await fileValue.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from("message-attachments")
      .upload(objectPath, bytes, {
        contentType: fileValue.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: "File upload failed. Please try again." }, { status: 500 });
    }

    const caption = typeof captionValue === "string" ? captionValue.trim().slice(0, 1000) : "";
    const body = caption || `Attachment: ${filename}`;
    const { data: message, error: messageError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        sender_id: user.id,
        body,
        attachment_url: objectPath,
      })
      .select("id, conversation_id, sender_id, body, attachment_url, created_at")
      .single();

    if (messageError || !message) {
      await supabase.storage.from("message-attachments").remove([objectPath]);
      return NextResponse.json({ error: "The attachment uploaded, but the message could not be saved." }, { status: 500 });
    }

    const { data: signed, error: signedError } = await supabase.storage
      .from("message-attachments")
      .createSignedUrl(objectPath, 300, { download: filename });

    return NextResponse.json({
      message,
      filename,
      signedUrl: signedError ? null : signed?.signedUrl ?? null,
    }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "Unable to process this attachment." }, { status: 500 });
  }
}
