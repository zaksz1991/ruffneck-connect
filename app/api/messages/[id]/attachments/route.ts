import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const BUCKET = "rn-chat-attachments";
const ATTACHMENT_PREFIX = "__RN_CHAT_ATTACHMENT_V1__:";
const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_FILENAME_LENGTH = 120;

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const ALLOWED_TYPES: Record<string, string[]> = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
  "application/pdf": [".pdf"],
  "application/msword": [".doc"],
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    ".docx",
  ],
  "text/plain": [".txt"],
};

type RouteContext = {
  params: Promise<{ id: string }>;
};

type AttachmentMetadata = {
  path: string;
  name: string;
  type: string;
  size: number;
};

function jsonError(message: string, status: number) {
  return NextResponse.json(
    { error: message },
    {
      status,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

function safeFilename(value: string): string {
  const cleaned = value
    .replace(/[\\/]/g, "_")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, MAX_FILENAME_LENGTH);

  return cleaned || "attachment";
}

function isValidAttachment(value: unknown): value is AttachmentMetadata {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value)
  ) {
    return false;
  }

  const metadata = value as Record<string, unknown>;
  const { path, name, type, size } = metadata;

  if (
    typeof path !== "string" ||
    typeof name !== "string" ||
    typeof type !== "string" ||
    typeof size !== "number" ||
    !Number.isSafeInteger(size) ||
    size < 1 ||
    size > MAX_FILE_BYTES ||
    name.length < 1 ||
    name.length > MAX_FILENAME_LENGTH
  ) {
    return false;
  }

  const segments = path.split("/");

  if (
    segments.length !== 3 ||
    segments.some(
      (segment) =>
        !segment ||
        segment === "." ||
        segment === ".." ||
        /[\\\u0000-\u001f\u007f]/.test(segment)
    )
  ) {
    return false;
  }

  const extension = name.slice(name.lastIndexOf(".")).toLowerCase();
  const allowedExtensions = ALLOWED_TYPES[type];

  return Boolean(
    allowedExtensions &&
      allowedExtensions.includes(extension)
  );
}

async function getAuthenticatedParticipant(
  conversationId: string
) {
  const supabase = await createClient();

  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return {
      supabase,
      user: null,
      error: jsonError("Authentication required.", 401),
    };
  }

  const { data: participant, error: participantError } = await supabase
    .from("conversation_participants")
    .select("conversation_id")
    .eq("conversation_id", conversationId)
    .eq("user_id", user.id)
    .eq("status", "active")
    .maybeSingle();

  if (participantError) {
    console.error(
      "Conversation participant lookup failed:",
      participantError.message
    );

    return {
      supabase,
      user: null,
      error: jsonError(
        "Unable to verify conversation membership.",
        500
      ),
    };
  }

  if (!participant) {
    return {
      supabase,
      user: null,
      error: jsonError(
        "You are not an active participant in this conversation.",
        403
      ),
    };
  }

  return { supabase, user, error: null };
}

export async function POST(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id: conversationId } = await params;

  if (!UUID_REGEX.test(conversationId)) {
    return jsonError("Invalid conversation ID.", 400);
  }

  const auth = await getAuthenticatedParticipant(conversationId);

  if (auth.error || !auth.user) {
    return auth.error ?? jsonError("Authentication required.", 401);
  }

  const { supabase, user } = auth;

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

  const allowedExtensions = ALLOWED_TYPES[candidate.type];

  if (!allowedExtensions) {
    return jsonError(
      "This file type is not supported.",
      415
    );
  }

  const filename = safeFilename(candidate.name);
  const extension = filename
    .slice(filename.lastIndexOf("."))
    .toLowerCase();

  if (!allowedExtensions.includes(extension)) {
    return jsonError(
      "The filename extension does not match the supported file type.",
      415
    );
  }

  const storagePath =
    `${conversationId}/${user.id}/${crypto.randomUUID()}-${filename}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(storagePath, candidate, {
      contentType: candidate.type,
      cacheControl: "3600",
      upsert: false,
    });

  if (uploadError) {
    console.error(
      "Conversation attachment upload failed:",
      uploadError.message
    );

    return jsonError(
      "The attachment could not be uploaded. Check the storage bucket and permissions.",
      500
    );
  }

  const metadata: AttachmentMetadata = {
    path: storagePath,
    name: filename,
    type: candidate.type,
    size: candidate.size,
  };

  const body = ATTACHMENT_PREFIX + JSON.stringify(metadata);

  const sendUrl = new URL(
    `/api/messages/${conversationId}/send`,
    request.url
  );

  let sendResponse: Response;

  try {
    sendResponse = await fetch(sendUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Cookie: request.headers.get("cookie") ?? "",
      },
      body: JSON.stringify({
        body,
        replyToMessageId: null,
      }),
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    await supabase.storage.from(BUCKET).remove([storagePath]);

    return jsonError(
      "The attachment was uploaded, but the message could not be sent.",
      502
    );
  }

  if (!sendResponse.ok) {
    await supabase.storage.from(BUCKET).remove([storagePath]);

    const result = (await sendResponse
      .json()
      .catch(() => null)) as { error?: string } | null;

    return jsonError(
      result?.error ?? "Unable to send the attachment.",
      sendResponse.status >= 400 && sendResponse.status < 600
        ? sendResponse.status
        : 500
    );
  }

  const result = (await sendResponse.json().catch(() => null)) as {
    message?: unknown;
  } | null;

  return NextResponse.json(
    result ?? { success: true },
    {
      status: 201,
      headers: { "Cache-Control": "no-store" },
    }
  );
}

export async function GET(
  request: NextRequest,
  { params }: RouteContext
) {
  const { id: conversationId } = await params;
  const messageId = request.nextUrl.searchParams.get("messageId") ?? "";

  if (
    !UUID_REGEX.test(conversationId) ||
    !UUID_REGEX.test(messageId)
  ) {
    return jsonError(
      "Invalid conversation or message ID.",
      400
    );
  }

  const auth = await getAuthenticatedParticipant(conversationId);

  if (auth.error || !auth.user) {
    return auth.error ?? jsonError("Authentication required.", 401);
  }

  const { supabase, user } = auth;

  const { data: message, error: messageError } = await supabase
    .from("messages")
    .select("id, sender_id, body, deleted_at")
    .eq("id", messageId)
    .eq("conversation_id", conversationId)
    .is("deleted_at", null)
    .maybeSingle();

  if (messageError) {
    console.error(
      "Attachment message lookup failed:",
      messageError.message
    );

    return jsonError("Unable to retrieve the attachment.", 500);
  }

  if (!message || typeof message.body !== "string") {
    return jsonError(
      "This message has no available attachment.",
      404
    );
  }

  if (!message.body.startsWith(ATTACHMENT_PREFIX)) {
    return jsonError(
      "This message does not contain an attachment.",
      404
    );
  }

  let metadata: unknown;

  try {
    metadata = JSON.parse(
      message.body.slice(ATTACHMENT_PREFIX.length)
    );
  } catch {
    return jsonError("Invalid attachment information.", 400);
  }

  if (!isValidAttachment(metadata)) {
    return jsonError("Invalid attachment information.", 400);
  }

  const attachment = metadata as AttachmentMetadata;
  const expectedPrefix = `${conversationId}/${message.sender_id}/`;

  if (
    !attachment.path.startsWith(expectedPrefix) ||
    !UUID_REGEX.test(message.sender_id)
  ) {
    return jsonError("Invalid attachment path.", 403);
  }

  // The stored attachment must belong to the sender of this message.
  // Access remains subject to the private bucket's Storage policies.
  const { data: signedUrlData, error: signedUrlError } =
    await supabase.storage
      .from(BUCKET)
      .createSignedUrl(attachment.path, 60);

  if (signedUrlError || !signedUrlData?.signedUrl) {
    console.error(
      "Unable to create signed attachment URL:",
      signedUrlError?.message
    );

    return jsonError(
      "The attachment could not be opened. Check storage permissions and try again.",
      500
    );
  }

  return NextResponse.json(
    {
      url: signedUrlData.signedUrl,
      name: attachment.name,
      type: attachment.type,
      size: attachment.size,
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "private, no-store",
        "Referrer-Policy": "no-referrer",
      },
    }
  );
}