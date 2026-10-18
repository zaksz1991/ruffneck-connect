"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type ApproveInterestButtonProps = {
  intentId: string;
  interestId: string;
};

type ApprovalResponse = {
  error?: string;
  success?: boolean;
  conversation_url?: string;
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

      const result: ApprovalResponse = await response
        .json()
        .catch(() => ({}));

      if (!response.ok) {
        setError(
          typeof result.error === "string"
            ? result.error
            : "Unable to approve this interest. Please try again."
        );
        return;
      }

      if (
        typeof result.conversation_url !== "string" ||
        !/^\/messages\/[0-9a-f-]+(?:\?[^\s]*)?$/i.test(
          result.conversation_url
        )
      ) {
        setError(
          "The request may have been approved, but a valid conversation link was not returned. Refresh the page to check its status."
        );
        router.refresh();
        return;
      }

      router.push(result.conversation_url);
    } catch {
      setError(
        "Unable to connect to the server. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rn-approve-interest">
      <button
        type="button"
        className="rn-approve-interest__button"
        onClick={handleApprove}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <span
              className="rn-approve-interest__spinner"
              aria-hidden="true"
            />
            Approving…
          </>
        ) : (
          <>
            <span aria-hidden="true">✓</span>
            Approve &amp; Start Conversation
          </>
        )}
      </button>

      {error && (
        <p
          className="rn-approve-interest__error"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}

      <style jsx>{`
        .rn-approve-interest {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          min-width: 0;
        }

        .rn-approve-interest__button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 9px;
          min-height: 44px;
          padding: 11px 16px;
          border: 1px solid #047857;
          border-radius: 10px;
          background: #047857;
          color: #ffffff;
          font: inherit;
          font-size: 13px;
          font-weight: 750;
          text-align: center;
          cursor: pointer;
          transition:
            background 160ms ease,
            border-color 160ms ease;
        }

        .rn-approve-interest__button:hover:not(:disabled) {
          background: #065f46;
          border-color: #065f46;
        }

        .rn-approve-interest__button:focus-visible {
          outline: 3px solid rgba(5, 150, 105, 0.25);
          outline-offset: 3px;
        }

        .rn-approve-interest__button:disabled {
          opacity: 0.7;
          cursor: not-allowed;
        }

        .rn-approve-interest__spinner {
          width: 14px;
          height: 14px;
          border: 2px solid rgba(255, 255, 255, 0.4);
          border-top-color: #ffffff;
          border-radius: 50%;
          animation: rn-approve-spin 700ms linear infinite;
        }

        .rn-approve-interest__error {
          max-width: 320px;
          margin: 0;
          color: #b91c1c;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        @keyframes rn-approve-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (max-width: 480px) {
          .rn-approve-interest__button {
            width: 100%;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-approve-interest__button {
            transition: none;
          }

          .rn-approve-interest__spinner {
            animation-duration: 1.5s;
          }
        }
      `}</style>
    </div>
  );
}