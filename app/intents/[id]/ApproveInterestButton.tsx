"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ApproveInterestButtonProps = {
  intentId: string;
  interestId: string;
};

export default function ApproveInterestButton({
  intentId,
  interestId,
}: ApproveInterestButtonProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleApprove() {
    if (loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/intents/${encodeURIComponent(intentId)}/interests/${encodeURIComponent(interestId)}/approve`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        setError(
          typeof result.error === "string"
            ? result.error
            : "Unable to approve this interest."
        );
        return;
      }

      if (
        typeof result.conversation_url !== "string" ||
        !result.conversation_url.startsWith("/messages/")
      ) {
        setError("Approval succeeded, but the conversation link is invalid.");
        router.refresh();
        return;
      }

      router.push(result.conversation_url);
      router.refresh();
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="approve-interest-control">
      <button
        type="button"
        className="button-primary"
        onClick={handleApprove}
        disabled={loading}
      >
        {loading ? "Approving..." : "Approve & Start Conversation"}
      </button>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}