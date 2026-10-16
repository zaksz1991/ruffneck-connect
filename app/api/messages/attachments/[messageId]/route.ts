import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  context: { params: Promise<{ messageId: string }> },
) {
  const { messageId } = await context.params;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "Sign in to access this attachment." }, { status: 401 });
  }

  const { data: message, error } = await supabase
    .from("messages")
    .select("id, conversation_id, attachment_url, deleted_at")
    .eq("id", messageId)
    .is("deleted_at", null)
    .maybeSingle();

  if (error || !message?.attachment_url) {
    return NextResponse.json({ error: "Attachment not found." }, { status: 404 });
  }

  const { data: participant } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", message.conversation_id)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (!participant) {
    return NextResponse.json({ error: "Access denied." }, { status: 403 });
  }

  const path = message.attachment_url;
  if (!path.startsWith(`${message.conversation_id}/`)) {
    return NextResponse.json({ error: "Invalid attachment reference." }, { status: 400 });
  }

  const filename = path.split("/").pop()?.replace(/^[0-9a-f-]{36}-/i, "") || "attachment";
  const { data, error: signedError } = await supabase.storage
    .from("message-attachments")
    .createSignedUrl(path, 300, { download: filename });

  if (signedError || !data?.signedUrl) {
    return NextResponse.json({ error: "Could not create a secure download link." }, { status: 500 });
  }

  return NextResponse.redirect(data.signedUrl, 302);
}
