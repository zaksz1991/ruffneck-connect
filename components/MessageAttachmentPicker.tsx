"use client";

import { useRef, useState } from "react";

type Props = {
  conversationId: string;
  onSent?: () => void;
};

const ACCEPT = ".jpg,.jpeg,.png,.webp,.pdf,.txt,.doc,.docx";
const MAX_BYTES = 10 * 1024 * 1024;

export default function MessageAttachmentPicker({ conversationId, onSent }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [caption, setCaption] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  async function sendAttachment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!file || busy) return;
    setError("");
    setSuccess("");

    if (file.size > MAX_BYTES) {
      setError("The maximum file size is 10 MB.");
      return;
    }

    setBusy(true);
    try {
      const data = new FormData();
      data.append("file", file);
      data.append("caption", caption);
      const response = await fetch(`/api/messages/${encodeURIComponent(conversationId)}/attachments`, {
        method: "POST",
        body: data,
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || "Could not send the attachment.");

      setSuccess("Attachment sent.");
      setFile(null);
      setCaption("");
      if (inputRef.current) inputRef.current.value = "";
      onSent?.();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the attachment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={sendAttachment} className="message-attachment-picker">
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        onChange={(event) => {
          setFile(event.target.files?.[0] ?? null);
          setError("");
          setSuccess("");
        }}
        aria-label="Choose message attachment"
      />
      {file && (
        <>
          <p>{file.name} · {(file.size / 1024 / 1024).toFixed(2)} MB</p>
          <label>
            Caption (optional)
            <input
              value={caption}
              maxLength={1000}
              onChange={(event) => setCaption(event.target.value)}
              placeholder="Add a message"
            />
          </label>
          <button type="submit" disabled={busy}>{busy ? "Sending…" : "Send attachment"}</button>
          <button type="button" disabled={busy} onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }}>Cancel</button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
      {success && <p role="status">{success}</p>}
    </form>
  );
}
