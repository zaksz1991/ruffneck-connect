import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const BUCKET = "conversation-voice-messages";
const MAX_BYTES = 10 * 1024 * 1024;
const MAX_SECONDS = 300;
const MIME_EXTENSIONS: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "m4a",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
};

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const { id: conversationId } = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(conversationId)) {
    return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  }

  const form = await request.formData().catch(() => null);
  const file = form?.get("audio");
  const duration = Number(form?.get("durationSeconds"));
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Audio file is required." }, { status: 400 });
  }
  const mime = file.type.toLowerCase().split(";")[0];
  const extension = MIME_EXTENSIONS[mime];
  if (!extension || file.size < 1 || file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Unsupported audio format or file exceeds 10 MB." }, { status: 400 });
  }
  if (!Number.isInteger(duration) || duration < 1 || duration > MAX_SECONDS) {
    return NextResponse.json({ error: "Recording must be between 1 and 300 seconds." }, { status: 400 });
  }

  const { data: participant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (participantError || !participant) {
    return NextResponse.json({ error: "Active conversation membership required." }, { status: 403 });
  }

  const path = `${conversationId}/${user.id}/${crypto.randomUUID()}.${extension}`;
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    contentType: mime,
    upsert: false,
  });
  if (uploadError) {
    return NextResponse.json({ error: "Could not upload voice message." }, { status: 500 });
  }

  // Keep attachment_url as the private storage object path. Playback should use
  // the signed-URL GET route below rather than exposing a public URL.
  const { data: message, error: insertError } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      sender_id: user.id,
      body: "Voice message",
      attachment_url: path,
      message_type: "voice",
      audio_duration_seconds: duration,
    })
    .select("id, conversation_id, sender_id, body, attachment_url, message_type, audio_duration_seconds, created_at")
    .single();

  if (insertError || !message) {
    await supabase.storage.from(BUCKET).remove([path]);
    return NextResponse.json({ error: "Could not save voice message." }, { status: 500 });
  }
  return NextResponse.json({ message }, { status: 201 });
}

export async function GET(_request: Request, context: RouteContext) {
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const { id: conversationId } = await context.params;
  const { searchParams } = new URL(_request.url);
  const path = searchParams.get("path");
  if (!path || !path.startsWith(`${conversationId}/`)) {
    return NextResponse.json({ error: "Valid audio path is required." }, { status: 400 });
  }
  const { data: participant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();
  if (participantError || !participant) {
    return NextResponse.json({ error: "Active conversation membership required." }, { status: 403 });
  }
  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id")
    .eq("conversation_id", conversationId)
    .eq("attachment_url", path)
    .eq("message_type", "voice")
    .is("deleted_at", null)
    .maybeSingle();
  if (messageError || !message) {
    return NextResponse.json({ error: "Voice message not found." }, { status: 404 });
  }
  const { data: signed, error: signedError } = await supabase.storage.from(BUCKET).createSignedUrl(path, 60 * 10);
  if (signedError || !signed) {
    return NextResponse.json({ error: "Could not create playback URL." }, { status: 500 });
  }
  return NextResponse.json({ url: signed.signedUrl, expiresIn: 600 });
}
