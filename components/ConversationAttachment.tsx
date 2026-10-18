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

export function parseChatAttachment(
  body: string
): ChatAttachmentData | null {
  if (!body.startsWith(ATTACHMENT_PREFIX)) {
    return null;
  }

  try {
    const value = JSON.parse(
      body.slice(ATTACHMENT_PREFIX.length)
    ) as Partial<ChatAttachmentData>;

    if (
      typeof value.path !== "string" ||
      typeof value.name !== "string" ||
      typeof value.type !== "string" ||
      typeof value.size !== "number"
    ) {
      return null;
    }

    if (
      !value.path.startsWith(
        ""
      ) ||
      value.path.includes("..") ||
      value.path.startsWith("/") ||
      value.path.includes("\\")
    ) {
      return null;
    }

    return {
      path: value.path,
      name: value.name,
      type: value.type,
      size: value.size,
    };
  } catch {
    return null;
  }
}

function formatFileSize(bytes: number) {
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
    const supabase = createClient();

    async function loadAttachment() {
      setLoading(true);
      setError("");

      const { data, error: signedUrlError } =
        await supabase.storage
          .from("rn-chat-attachments")
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
      }}
    >
      {loading ? (
        <p
          className="muted"
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