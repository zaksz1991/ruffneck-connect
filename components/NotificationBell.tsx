"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useState,
} from "react";

export default function NotificationBell() {
  const [unreadCount, setUnreadCount] = useState(0);

  const loadUnreadCount = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const response = await fetch("/api/notifications", {
          method: "GET",
          cache: "no-store",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
          },
          signal,
        });

        if (!response.ok) {
          return;
        }

        const result: { unread_count?: unknown } =
          await response.json();

        if (
          typeof result.unread_count === "number" &&
          Number.isFinite(result.unread_count)
        ) {
          setUnreadCount(
            Math.max(0, Math.floor(result.unread_count))
          );
        }
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        // Preserve the current count if the request fails.
      }
    },
    []
  );

  useEffect(() => {
    let active = true;
    let inFlight = false;
    let controller: AbortController | null = null;

    const refresh = async () => {
      if (
        !active ||
        inFlight ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      inFlight = true;
      controller = new AbortController();

      try {
        await loadUnreadCount(controller.signal);
      } finally {
        inFlight = false;
        controller = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh();
      }
    };

    void refresh();

    const interval = window.setInterval(() => {
      void refresh();
    }, 30_000);

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );

    return () => {
      active = false;
      window.clearInterval(interval);

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );

      controller?.abort();
    };
  }, [loadUnreadCount]);

  return (
    <Link
      href="/notifications"
      aria-label={
        unreadCount > 0
          ? `Notifications, ${unreadCount} unread`
          : "Notifications"
      }
      style={{
        position: "relative",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: "8px",
        padding: "10px 14px",
        border: "1px solid var(--border, #dbe3ec)",
        borderRadius: "10px",
        color: "inherit",
        textDecoration: "none",
        fontWeight: 600,
      }}
    >
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" />
        <path d="M10 21h4" />
      </svg>

      <span>Notifications</span>

      {unreadCount > 0 && (
        <span
          aria-hidden="true"
          style={{
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            minWidth: "20px",
            height: "20px",
            padding: "0 5px",
            borderRadius: "999px",
            background: "#dc2626",
            color: "#ffffff",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          {unreadCount > 99 ? "99+" : unreadCount}
        </span>
      )}
    </Link>
  );
}