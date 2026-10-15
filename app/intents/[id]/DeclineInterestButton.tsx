"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type DeclineInterestButtonProps = {
  intentId: string;
  interestId: string;
};

export default function DeclineInterestButton({
  intentId,
  interestId,
}: DeclineInterestButtonProps) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleDecline() {
    const confirmed = window.confirm(
      "Decline this interest request? This action cannot be undone."
    );

    if (!confirmed || loading) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/intents/${intentId}/interests/${interestId}/decline`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const result: { error?: string; success?: boolean } =
        await response.json();

      if (!response.ok || !result.success) {
        setError(result.error || "Unable to decline this request.");
        return;
      }

      router.refresh();
    } catch {
      setError("A network error occurred. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleDecline}
        disabled={loading}
        style={{
          padding: "10px 16px",
          border: "1px solid #dc2626",
          borderRadius: "8px",
          background: loading ? "#f3f4f6" : "#fff",
          color: loading ? "#6b7280" : "#b91c1c",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Declining..." : "Decline Interest"}
      </button>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}