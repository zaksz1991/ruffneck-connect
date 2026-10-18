"use client";

import { useState } from "react";

type Props = {
  slug: string;
  name: string;
};

export default function CommunityShareButton({ slug, name }: Props) {
  const [message, setMessage] = useState("");
  const [sharing, setSharing] = useState(false);

  async function copyCommunityLink(url: string) {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
        setMessage("Community link copied.");
        return;
      }

      const input = document.createElement("textarea");
      input.value = url;
      input.setAttribute("readonly", "");
      input.style.position = "fixed";
      input.style.opacity = "0";
      document.body.appendChild(input);
      input.select();
      const copied = document.execCommand("copy");
      input.remove();

      setMessage(
        copied
          ? "Community link copied."
          : "Copy failed. Copy the community address from your browser."
      );
    } catch {
      setMessage("Copy failed. Copy the community address from your browser.");
    }
  }

  async function handleShare() {
    if (sharing) return;

    setSharing(true);
    setMessage("");
    const url = new URL(
      `/communities/${encodeURIComponent(slug)}`,
      window.location.origin
    ).toString();

    try {
      if (typeof navigator.share === "function") {
        try {
          await navigator.share({
            title: name,
            text: `Explore the ${name} community on RuffNeck Connect.`,
            url,
          });
          setMessage("Share completed.");
          return;
        } catch (error) {
          if (error instanceof Error && error.name === "AbortError") return;
          // Fall back to copying the link if the share sheet is unavailable.
        }
      }

      await copyCommunityLink(url);
    } finally {
      setSharing(false);
    }
  }

  return (
    <div className="community-share-control">
      <button
        type="button"
        className="button button-secondary"
        onClick={handleShare}
        disabled={sharing}
        aria-label={`Share the ${name} community`}
      >
        {sharing ? "Preparing link..." : "Share community"}
      </button>
      <span className="muted" role="status" aria-live="polite">
        {message}
      </span>
    </div>
  );
}
