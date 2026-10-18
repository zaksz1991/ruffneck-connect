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
    if (loading) return;

    const confirmed = window.confirm(
      "Decline this interest request? The request will be marked as declined."
    );

    if (!confirmed) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/intents/${encodeURIComponent(intentId)}/interests/${encodeURIComponent(interestId)}/decline`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const result: {
        error?: string;
        success?: boolean;
        status?: string;
        interest_id?: string;
      } = await response.json().catch(() => ({}));

      if (!response.ok || !result.success) {
        setError(
          result.error ||
            "Unable to decline this request. Please try again."
        );
        return;
      }

      router.refresh();
    } catch {
      setError(
        "Unable to connect to the server. Check your connection and try again."
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rn-decline-interest">
      <button
        type="button"
        onClick={handleDecline}
        disabled={loading}
        aria-busy={loading}
        className="rn-decline-interest__button"
      >
        {loading ? (
          <>
            <span
              className="rn-decline-interest__spinner"
              aria-hidden="true"
            />
            Declining…
          </>
        ) : (
          "Decline Interest"
        )}
      </button>

      {error && (
        <p
          className="rn-decline-interest__error"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}

      <style jsx>{`
        .rn-decline-interest {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          min-width: 0;
        }

        .rn-decline-interest__button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 42px;
          padding: 10px 15px;
          border: 1px solid #fecaca;
          border-radius: 10px;
          background: #fff;
          color: #b91c1c;
          font: inherit;
          font-size: 13px;
          font-weight: 750;
          cursor: pointer;
          transition:
            background 160ms ease,
            border-color 160ms ease,
            color 160ms ease;
        }

        .rn-decline-interest__button:hover:not(:disabled) {
          background: #fef2f2;
          border-color: #f87171;
          color: #991b1b;
        }

        .rn-decline-interest__button:focus-visible {
          outline: 3px solid rgba(220, 38, 38, 0.25);
          outline-offset: 3px;
        }

        .rn-decline-interest__button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .rn-decline-interest__spinner {
          width: 14px;
          height: 14px;
          border: 2px solid #fecaca;
          border-top-color: #b91c1c;
          border-radius: 50%;
          animation: rn-spin 700ms linear infinite;
        }

        .rn-decline-interest__error {
          max-width: 280px;
          margin: 0;
          color: #b91c1c;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        @keyframes rn-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-decline-interest__button {
            transition: none;
          }

          .rn-decline-interest__spinner {
            animation-duration: 1.5s;
          }
        }
      `}</style>
    </div>
  );
}