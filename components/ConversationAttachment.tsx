"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export const ATTACHMENT_PREFIX = "__RN_CHAT_ATTACHMENT_V1__:";

export type ChatAttachmentData = {
  path: string;
  name: string;
  type: string;
  size: number;
};

const ATTACHMENT_BUCKET = "rn-chat-attachments";
const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
]);

export function parseChatAttachment(
  body: string
): ChatAttachmentData | null {
  if (
    typeof body !== "string" ||
    !body.startsWith(ATTACHMENT_PREFIX)
  ) {
    return null;
  }

  try {
    const value: unknown = JSON.parse(
      body.slice(ATTACHMENT_PREFIX.length)
    );

    if (
      typeof value !== "object" ||
      value === null ||
      !("path" in value) ||
      !("name" in value) ||
      !("type" in value) ||
      !("size" in value)
    ) {
      return null;
    }

    const attachment = value as ChatAttachmentData;
    const segments = attachment.path.split("/");

    if (
      typeof attachment.path !== "string" ||
      typeof attachment.name !== "string" ||
      typeof attachment.type !== "string" ||
      typeof attachment.size !== "number" ||
      attachment.path.length > 1024 ||
      attachment.path.startsWith("/") ||
      attachment.path.includes("\\") ||
      attachment.path.includes("..") ||
      segments.length !== 3 ||
      segments.some((segment) => segment.trim() === "") ||
      attachment.name.trim() === "" ||
      attachment.name.length > 255 ||
      !ALLOWED_TYPES.has(attachment.type) ||
      !Number.isSafeInteger(attachment.size) ||
      attachment.size < 1 ||
      attachment.size > MAX_FILE_SIZE
    ) {
      return null;
    }

    return attachment;
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  }

  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function ConversationAttachment({
  attachment,
}: {
  attachment: ChatAttachmentData;
}) {
  const [url, setUrl] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    setUrl("");
    setError("");
    setLoading(true);

    async function loadAttachment() {
      try {
        const supabase = createClient();

        const { data, error: signedUrlError } =
          await supabase.storage
            .from(ATTACHMENT_BUCKET)
            .createSignedUrl(attachment.path, 300);

        if (cancelled) return;

        if (signedUrlError || !data?.signedUrl) {
          setError(
            "This attachment is unavailable or you no longer have access."
          );
          setLoading(false);
          return;
        }

        setUrl(data.signedUrl);
        setLoading(false);
      } catch {
        if (cancelled) return;

        setError("Unable to load this attachment. Please try again.");
        setLoading(false);
      }
    }

    void loadAttachment();

    return () => {
      cancelled = true;
    };
  }, [attachment.path]);

  const isImage = [
    "image/jpeg",
    "image/png",
    "image/webp",
  ].includes(attachment.type);

  return (
    <div
      style={{
        marginTop: 10,
        padding: 12,
        border: "1px solid var(--border, #d1d5db)",
        borderRadius: 12,
        background: "rgba(255,255,255,0.7)",
        maxWidth: "100%",
        minWidth: 0,
      }}
    >
      {loading ? (
        <p
          className="muted"
          role="status"
          style={{ margin: 0, fontSize: 13 }}
        >
          Loading attachment…
        </p>
      ) : error ? (
        <p
          role="status"
          style={{
            margin: 0,
            fontSize: 13,
            overflowWrap: "anywhere",
          }}
        >
          {error}
        </p>
      ) : (
        <>
          {isImage && url && (
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              aria-label={`Open image ${attachment.name}`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt={attachment.name}
                loading="lazy"
                style={{
                  display: "block",
                  maxWidth: "100%",
                  maxHeight: 300,
                  objectFit: "contain",
                  borderRadius: 8,
                  marginBottom: 10,
                }}
              />
            </a>
          )}

          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              minWidth: 0,
            }}
          >
            <span
              aria-hidden="true"
              style={{
                display: "grid",
                placeItems: "center",
                width: 42,
                height: 42,
                flex: "0 0 42px",
                borderRadius: 10,
                background: "#eaf7fc",
                fontSize: 20,
              }}
            >
              {isImage ? "▧" : "📄"}
            </span>

            <div style={{ minWidth: 0, flex: 1 }}>
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  fontWeight: 750,
                  overflowWrap: "anywhere",
                }}
              >
                {attachment.name}
              </p>

              <p
                className="muted"
                style={{ margin: "4px 0 0", fontSize: 11 }}
              >
                {formatFileSize(attachment.size)}
              </p>
            </div>

            {url && (
              <a
                href={url}
                download={attachment.name}
                target="_blank"
                rel="noopener noreferrer"
                className="button-secondary"
                style={{
                  padding: "7px 10px",
                  fontSize: 12,
                  textDecoration: "none",
                  whiteSpace: "nowrap",
                }}
              >
                Download
              </a>
            )}
          </div>
        </>
      )}
    </div>
  );
}