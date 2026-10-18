"use client";

import { useRef, useState } from "react";

export type UploadedAttachmentMessage = {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
  edited_at: string | null;
  deleted_at: string | null;
  reply_to_message_id: string | null;
  forwarded_from_message_id: string | null;
  attachment_url: string;
  message_type: string;
};

type UploadResponse = {
  message?: UploadedAttachmentMessage;
  error?: string;
};

type Props = {
  conversationId: string;
  onUploaded: (message: UploadedAttachmentMessage) => void;
};

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const ACCEPTED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
]);

export default function ConversationAttachmentButton({
  conversationId,
  onUploaded,
}: Props) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  async function uploadFile(file: File) {
    setError("");
    setNotice("");

    if (!ACCEPTED_TYPES.has(file.type)) {
      setError("Choose a JPG, PNG, WebP image or PDF document.");
      return;
    }
    if (file.size < 1) {
      setError("The selected file is empty.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setError("Attachments must be 10 MB or smaller.");
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(
        `/api/messages/${conversationId}/attachment`,
        { method: "POST", body: formData }
      );
      const result = (await response.json()) as UploadResponse;

      if (!response.ok || !result.message) {
        throw new Error(result.error || "The attachment could not be sent.");
      }

      onUploaded(result.message);
      setNotice(`Attached ${file.name}`);
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "The attachment could not be sent. Please try again."
      );
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="conversation-attachment-control">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,application/pdf,.jpg,.jpeg,.png,.webp,.pdf"
        aria-label="Choose an image or PDF attachment"
        disabled={uploading}
        style={{ display: "none" }}
        onChange={(event) => {
          const file = event.currentTarget.files?.[0];
          if (file) void uploadFile(file);
        }}
      />
      <button
        type="button"
        className="button-secondary"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        aria-busy={uploading}
      >
        {uploading ? "Uploading…" : "Attach file"}
      </button>
      {error && <p role="alert" className="muted">{error}</p>}
      {notice && <p role="status" className="muted">{notice}</p>}
    </div>
  );
}
