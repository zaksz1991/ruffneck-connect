"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type WithdrawInterestButtonProps = {
  intentId: string;
  interestId: string;
};

type WithdrawResponse = {
  success?: boolean;
  error?: string;
};

export default function WithdrawInterestButton({
  intentId,
  interestId,
}: WithdrawInterestButtonProps) {
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleWithdraw() {
    if (loading) return;

    const confirmed = window.confirm(
      "Withdraw your interest in this intention? You may be able to submit interest again later."
    );

    if (!confirmed) return;

    setLoading(true);
    setError("");

    try {
      const response = await fetch(
        `/api/intents/${encodeURIComponent(intentId)}/interests/${encodeURIComponent(interestId)}/withdraw`,
        {
          method: "POST",
          headers: {
            Accept: "application/json",
          },
        }
      );

      const result: WithdrawResponse = await response
        .json()
        .catch(() => ({}));

      if (!response.ok || !result.success) {
        setError(
          typeof result.error === "string"
            ? result.error
            : "Unable to withdraw your interest. Please try again."
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
    <div className="rn-withdraw-interest">
      <button
        type="button"
        className="rn-withdraw-interest__button"
        onClick={handleWithdraw}
        disabled={loading}
        aria-busy={loading}
      >
        {loading ? (
          <>
            <span
              className="rn-withdraw-interest__spinner"
              aria-hidden="true"
            />
            Withdrawing…
          </>
        ) : (
          "Withdraw Interest"
        )}
      </button>

      {error && (
        <p
          className="rn-withdraw-interest__error"
          role="alert"
          aria-live="polite"
        >
          {error}
        </p>
      )}

      <style jsx>{`
        .rn-withdraw-interest {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          gap: 8px;
          min-width: 0;
        }

        .rn-withdraw-interest__button {
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          min-height: 42px;
          padding: 10px 15px;
          border: 1px solid #d1d5db;
          border-radius: 10px;
          background: #ffffff;
          color: #374151;
          font: inherit;
          font-size: 13px;
          font-weight: 700;
          cursor: pointer;
          transition:
            background 160ms ease,
            border-color 160ms ease;
        }

        .rn-withdraw-interest__button:hover:not(:disabled) {
          background: #f3f4f6;
          border-color: #9ca3af;
        }

        .rn-withdraw-interest__button:focus-visible {
          outline: 3px solid rgba(100, 116, 139, 0.25);
          outline-offset: 3px;
        }

        .rn-withdraw-interest__button:disabled {
          opacity: 0.65;
          cursor: not-allowed;
        }

        .rn-withdraw-interest__spinner {
          width: 14px;
          height: 14px;
          border: 2px solid #d1d5db;
          border-top-color: #374151;
          border-radius: 50%;
          animation: rn-withdraw-spin 700ms linear infinite;
        }

        .rn-withdraw-interest__error {
          max-width: 300px;
          margin: 0;
          color: #b91c1c;
          font-size: 12px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        @keyframes rn-withdraw-spin {
          to {
            transform: rotate(360deg);
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-withdraw-interest__button {
            transition: none;
          }

          .rn-withdraw-interest__spinner {
            animation-duration: 1.5s;
          }
        }
      `}</style>
    </div>
  );
}