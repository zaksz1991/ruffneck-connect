"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

type NotificationItem = {
  id: string;
  actor_id: string | null;
  notification_type: string;
  title: string;
  body: string | null;
  link: string | null;
  is_read: boolean;
  created_at: string;
  read_at: string | null;
};

type NotificationsResponse = {
  notifications?: NotificationItem[];
  unread_count?: number;
  error?: string;
};

type ActionResponse = {
  error?: string;
};

const NOTIFICATION_LABELS: Record<string, string> = {
  community_join_approved: "Community request approved",
  community_join_declined: "Community request declined",
  community_join_request: "Community join request",
  community_role_changed: "Community role updated",
  interest_received: "New interest received",
  interest_approved: "Interest approved",
  interest_declined: "Interest declined",
  new_message: "New message",
  connection_request_received: "Connection request",
  connection_request_accepted: "Connection accepted",
  connection_request_declined: "Connection request declined",
  unknown: "Other notification",
};

function isSafeInternalLink(
  link: string | null
): link is string {
  if (
    !link ||
    !link.startsWith("/") ||
    link.startsWith("//") ||
    link.includes("\\") ||
    /[\u0000-\u001F\u007F]/.test(link)
  ) {
    return false;
  }

  try {
    const baseUrl = "https://ruffneck-connect.invalid";
    const url = new URL(link, baseUrl);

    if (url.origin !== baseUrl) {
      return false;
    }

    return /^\/(?:home|communities(?:\/[a-zA-Z0-9_-]+)?|intents(?:\/[a-f0-9-]+)?|messages(?:\/[a-f0-9-]+)?|connections|notifications)\/?$/i.test(
      url.pathname
    );
  } catch {
    return false;
  }
}

function formatNotificationDate(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "Date unavailable";
  }

  return new Intl.DateTimeFormat("en-NG", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function notificationLabel(type: string): string {
  return NOTIFICATION_LABELS[type] ?? "New activity";
}

export default function NotificationBell() {
  const pathname = usePathname();

  const [notifications, setNotifications] = useState<
    NotificationItem[]
  >([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [workingId, setWorkingId] = useState<string | null>(
    null
  );
  const [markingAll, setMarkingAll] = useState(false);
  const [toast, setToast] = useState<NotificationItem | null>(
    null
  );

  const [supabase] = useState(() => createClient());

  const wrapperRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  const initialLoadRef = useRef(false);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const requestInFlightRef = useRef(false);
  const controllerRef = useRef<AbortController | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const pathnameRef = useRef(pathname);

  const showToast = useCallback(
    (notification: NotificationItem) => {
      setToast(notification);

      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }

      toastTimerRef.current = window.setTimeout(() => {
        setToast(null);
        toastTimerRef.current = null;
      }, 8000);
    },
    []
  );

  const dismissToast = useCallback(() => {
    setToast(null);

    if (toastTimerRef.current !== null) {
      window.clearTimeout(toastTimerRef.current);
      toastTimerRef.current = null;
    }
  }, []);

  const loadNotifications = useCallback(
    async (
      showNewAlerts = false,
      signal?: AbortSignal
    ) => {
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
          if (response.status === 401) {
            setLoading(false);
            return;
          }

          throw new Error("Unable to load notifications.");
        }

        const result =
          (await response.json()) as NotificationsResponse;

        const nextNotifications = Array.isArray(
          result.notifications
        )
          ? result.notifications
          : [];

        if (!initialLoadRef.current) {
          seenIdsRef.current = new Set(
            nextNotifications.map((item) => item.id)
          );

          initialLoadRef.current = true;
        } else {
          const newlyArrived = nextNotifications.filter(
            (item) => !seenIdsRef.current.has(item.id)
          );

          const newestUnread = newlyArrived.find(
            (item) => !item.is_read
          );

          seenIdsRef.current = new Set(
            nextNotifications.map((item) => item.id)
          );

          if (
            showNewAlerts &&
            newestUnread &&
            pathnameRef.current !== "/notifications"
          ) {
            showToast(newestUnread);
          }
        }

        setNotifications(nextNotifications);

        setUnreadCount(
          typeof result.unread_count === "number" &&
            Number.isFinite(result.unread_count)
            ? Math.max(0, Math.floor(result.unread_count))
            : nextNotifications.filter(
                (item) => !item.is_read
              ).length
        );

        setLoadError("");
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }

        setLoadError(
          error instanceof Error
            ? error.message
            : "Unable to load notifications."
        );
      } finally {
        setLoading(false);
      }
    },
    [showToast]
  );

  const refresh = useCallback(
    async (showNewAlerts = false) => {
      if (
        !mountedRef.current ||
        requestInFlightRef.current ||
        document.visibilityState === "hidden"
      ) {
        return;
      }

      requestInFlightRef.current = true;

      const controller = new AbortController();
      controllerRef.current = controller;

      try {
        await loadNotifications(
          showNewAlerts,
          controller.signal
        );
      } finally {
        if (controllerRef.current === controller) {
          controllerRef.current = null;
        }

        requestInFlightRef.current = false;
      }
    },
    [loadNotifications]
  );

  useEffect(() => {
    pathnameRef.current = pathname;
  }, [pathname]);

  useEffect(() => {
    mountedRef.current = true;

    let active = true;
    let channel: ReturnType<typeof supabase.channel> | null =
      null;
    let debounceTimer: number | null = null;

    const scheduleRefresh = () => {
      if (!active) {
        return;
      }

      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }

      debounceTimer = window.setTimeout(() => {
        debounceTimer = null;
        void refresh(true);
      }, 400);
    };

    const subscribe = async () => {
      try {
        const {
          data: { user },
          error,
        } = await supabase.auth.getUser();

        if (!active || error || !user) {
          return;
        }

        channel = supabase
          .channel(`notification-bell:${user.id}`)
          .on(
            "postgres_changes",
            {
              event: "*",
              schema: "public",
              table: "notifications",
              filter: `user_id=eq.${user.id}`,
            },
            scheduleRefresh
          )
          .subscribe((status) => {
            if (status === "SUBSCRIBED") {
              scheduleRefresh();
            }
          });
      } catch {
        // Periodic refresh remains available if Realtime fails.
      }
    };

    void refresh(false);
    void subscribe();

    const interval = window.setInterval(() => {
      void refresh(true);
    }, 30000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void refresh(true);
      }
    };

    const handleOutsideClick = (event: PointerEvent) => {
      if (
        wrapperRef.current &&
        !wrapperRef.current.contains(
          event.target as Node
        )
      ) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
        dismissToast();
      }
    };

    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange
    );
    document.addEventListener(
      "pointerdown",
      handleOutsideClick
    );
    document.addEventListener("keydown", handleEscape);

    return () => {
      active = false;
      mountedRef.current = false;

      window.clearInterval(interval);

      if (debounceTimer !== null) {
        window.clearTimeout(debounceTimer);
      }

      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange
      );
      document.removeEventListener(
        "pointerdown",
        handleOutsideClick
      );
      document.removeEventListener(
        "keydown",
        handleEscape
      );

      controllerRef.current?.abort();

      if (channel) {
        void supabase.removeChannel(channel);
      }

      if (toastTimerRef.current !== null) {
        window.clearTimeout(toastTimerRef.current);
      }
    };
  }, [supabase, refresh, dismissToast]);

  const markAsRead = useCallback(
    async (notificationId: string): Promise<boolean> => {
      const target = notifications.find(
        (item) => item.id === notificationId
      );

      if (!target || target.is_read) {
        return true;
      }

      if (workingId || markingAll) {
        return false;
      }

      const previousNotifications = notifications;
      const previousUnreadCount = unreadCount;

      setWorkingId(notificationId);

      setNotifications((current) =>
        current.map((item) =>
          item.id === notificationId
            ? {
                ...item,
                is_read: true,
                read_at: new Date().toISOString(),
              }
            : item
        )
      );

      setUnreadCount((current) =>
        Math.max(0, current - 1)
      );

      try {
        const response = await fetch(
          "/api/notifications/read",
          {
            method: "POST",
            credentials: "same-origin",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              notification_id: notificationId,
            }),
          }
        );

        const result =
          (await response.json()) as ActionResponse;

        if (!response.ok) {
          throw new Error(
            result.error ||
              "Unable to mark notification as read."
          );
        }

        return true;
      } catch {
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
        setLoadError(
          "The notification could not be updated. Please try again."
        );

        return false;
      } finally {
        setWorkingId(null);
      }
    },
    [
      notifications,
      unreadCount,
      workingId,
      markingAll,
    ]
  );

  const markAllAsRead = useCallback(async () => {
    if (markingAll || workingId || unreadCount === 0) {
      return;
    }

    const previousNotifications = notifications;
    const previousUnreadCount = unreadCount;

    setMarkingAll(true);
    setNotifications((current) =>
      current.map((item) =>
        item.is_read
          ? item
          : {
              ...item,
              is_read: true,
              read_at: new Date().toISOString(),
            }
      )
    );
    setUnreadCount(0);

    try {
      const response = await fetch(
        "/api/notifications/read",
        {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify({
            mark_all: true,
          }),
        }
      );

      const result =
        (await response.json()) as ActionResponse;

      if (!response.ok) {
        throw new Error(
          result.error ||
            "Unable to mark all notifications as read."
        );
      }

      setLoadError("");
    } catch {
      setNotifications(previousNotifications);
      setUnreadCount(previousUnreadCount);
      setLoadError(
        "Unable to update notifications. Please try again."
      );
    } finally {
      setMarkingAll(false);
    }
  }, [
    markingAll,
    workingId,
    unreadCount,
    notifications,
  ]);

  const navigateToNotification = useCallback(
    async (
      event: React.MouseEvent<HTMLAnchorElement>,
      notification: NotificationItem,
      destination: string
    ) => {
      event.preventDefault();

      const marked = notification.is_read
        ? true
        : await markAsRead(notification.id);

      if (!marked) {
        return;
      }

      setIsOpen(false);
      dismissToast();
      window.location.assign(destination);
    },
    [markAsRead, dismissToast]
  );

  const recentNotifications = notifications.slice(0, 6);

  const triggerStyle: React.CSSProperties = {
    position: "relative",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    gap: "8px",
    minHeight: "42px",
    padding: "9px 13px",
    border: "1px solid var(--border, #dbe3ec)",
    borderRadius: "10px",
    background: "#ffffff",
    color: "#0b1e3a",
    fontSize: "13px",
    fontWeight: 700,
    cursor: "pointer",
    whiteSpace: "nowrap",
  };

  const panelStyle: React.CSSProperties = {
    position: "absolute",
    top: "calc(100% + 10px)",
    right: 0,
    zIndex: 1000,
    width: "min(390px, calc(100vw - 24px))",
    maxHeight: "min(580px, calc(100vh - 120px))",
    overflowY: "auto",
    border: "1px solid #e2e8f0",
    borderRadius: "17px",
    background: "#ffffff",
    color: "#0f172a",
    boxShadow: "0 20px 55px rgba(15, 23, 42, 0.2)",
  };

  return (
    <div
      ref={wrapperRef}
      style={{
        position: "relative",
        display: "inline-flex",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        aria-label={
          unreadCount > 0
            ? `Notifications, ${unreadCount} unread`
            : "Open notifications"
        }
        aria-expanded={isOpen}
        aria-haspopup="dialog"
        aria-controls="rn-notification-panel"
        onClick={() => {
          setIsOpen((current) => !current);

          if (!isOpen) {
            void refresh(false);
          }
        }}
        style={triggerStyle}
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
              fontSize: "11px",
              fontWeight: 800,
            }}
          >
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {isOpen && (
        <section
          id="rn-notification-panel"
          role="dialog"
          aria-label="Recent notifications"
          style={panelStyle}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "12px",
              padding: "18px",
              borderBottom: "1px solid #e2e8f0",
              background:
                "linear-gradient(135deg, #ffffff, #f0f9ff)",
            }}
          >
            <div>
              <p
                style={{
                  margin: "0 0 4px",
                  color: "#0284c7",
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: "0.13em",
                }}
              >
                RUFFNECK CONNECT
              </p>

              <h2
                style={{
                  margin: 0,
                  fontSize: "19px",
                  fontWeight: 800,
                }}
              >
                Notifications
              </h2>

              <p
                style={{
                  margin: "5px 0 0",
                  color: "#64748b",
                  fontSize: "12px",
                }}
              >
                {unreadCount === 0
                  ? "You are all caught up."
                  : `${unreadCount} unread ${
                      unreadCount === 1
                        ? "notification"
                        : "notifications"
                    }`}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Close notifications"
              style={{
                width: "34px",
                height: "34px",
                border: "1px solid #e2e8f0",
                borderRadius: "10px",
                background: "#ffffff",
                color: "#475569",
                fontSize: "20px",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>

          {unreadCount > 0 && (
            <div
              style={{
                padding: "10px 16px",
                borderBottom: "1px solid #e2e8f0",
                textAlign: "right",
              }}
            >
              <button
                type="button"
                disabled={markingAll || Boolean(workingId)}
                onClick={() => void markAllAsRead()}
                style={{
                  border: 0,
                  background: "transparent",
                  color: "#0284c7",
                  fontSize: "12px",
                  fontWeight: 800,
                  cursor: "pointer",
                  opacity:
                    markingAll || workingId ? 0.5 : 1,
                }}
              >
                {markingAll
                  ? "Updating..."
                  : "Mark all as read"}
              </button>
            </div>
          )}

          {loadError && (
            <div
              role="alert"
              style={{
                margin: "12px",
                padding: "12px",
                borderRadius: "10px",
                background: "#fef2f2",
                color: "#b91c1c",
                fontSize: "12px",
                lineHeight: 1.6,
              }}
            >
              {loadError}
              <button
                type="button"
                onClick={() => void refresh(false)}
                style={{
                  display: "block",
                  marginTop: "8px",
                  padding: 0,
                  border: 0,
                  background: "transparent",
                  color: "#991b1b",
                  fontWeight: 800,
                  cursor: "pointer",
                }}
              >
                Try again
              </button>
            </div>
          )}

          {loading && notifications.length === 0 ? (
            <div
              style={{
                padding: "28px 18px",
                color: "#64748b",
                fontSize: "13px",
                textAlign: "center",
              }}
              aria-live="polite"
            >
              Loading notifications...
            </div>
          ) : recentNotifications.length === 0 ? (
            <div
              style={{
                padding: "30px 18px",
                textAlign: "center",
              }}
            >
              <div
                aria-hidden="true"
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: "46px",
                  height: "46px",
                  margin: "0 auto 12px",
                  borderRadius: "50%",
                  background: "#e0f2fe",
                  color: "#0284c7",
                  fontSize: "22px",
                }}
              >
                ✓
              </div>

              <h3
                style={{
                  margin: "0 0 6px",
                  fontSize: "15px",
                  fontWeight: 800,
                }}
              >
                All caught up
              </h3>

              <p
                style={{
                  margin: 0,
                  color: "#64748b",
                  fontSize: "12px",
                }}
              >
                New activity will appear here.
              </p>
            </div>
          ) : (
            <div>
              {recentNotifications.map((notification) => {
                const safeLink = isSafeInternalLink(
                  notification.link
                )
                  ? notification.link
                  : null;

                return (
                  <article
                    key={notification.id}
                    style={{
                      padding: "14px 16px",
                      borderBottom: "1px solid #f1f5f9",
                      background: notification.is_read
                        ? "#ffffff"
                        : "#f0f9ff",
                      borderLeft: notification.is_read
                        ? "3px solid transparent"
                        : "3px solid #00b4d8",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: "10px",
                      }}
                    >
                      <span
                        style={{
                          color: "#0284c7",
                          fontSize: "10px",
                          fontWeight: 800,
                          letterSpacing: "0.03em",
                          lineHeight: 1.6,
                        }}
                      >
                        {notificationLabel(
                          notification.notification_type
                        )}
                      </span>

                      {!notification.is_read && (
                        <span
                          aria-label="Unread"
                          style={{
                            flexShrink: 0,
                            width: "8px",
                            height: "8px",
                            marginTop: "4px",
                            borderRadius: "50%",
                            background: "#00b4d8",
                          }}
                        />
                      )}
                    </div>

                    {safeLink ? (
                      <Link
                        href={safeLink}
                        onClick={(event) =>
                          void navigateToNotification(
                            event,
                            notification,
                            safeLink
                          )
                        }
                        style={{
                          display: "block",
                          marginTop: "6px",
                          color: "#0f172a",
                          fontSize: "14px",
                          fontWeight: 800,
                          lineHeight: 1.45,
                          textDecoration: "none",
                          overflowWrap: "anywhere",
                        }}
                      >
                        {notification.title}
                      </Link>
                    ) : (
                      <h3
                        style={{
                          margin: "6px 0 0",
                          color: "#0f172a",
                          fontSize: "14px",
                          fontWeight: 800,
                          lineHeight: 1.45,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {notification.title}
                      </h3>
                    )}

                    {notification.body && (
                      <p
                        style={{
                          margin: "6px 0 0",
                          color: "#475569",
                          fontSize: "12px",
                          lineHeight: 1.6,
                          overflowWrap: "anywhere",
                        }}
                      >
                        {notification.body}
                      </p>
                    )}

                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        flexWrap: "wrap",
                        gap: "8px",
                        marginTop: "10px",
                      }}
                    >
                      <time
                        dateTime={notification.created_at}
                        style={{
                          color: "#94a3b8",
                          fontSize: "11px",
                        }}
                      >
                        {formatNotificationDate(
                          notification.created_at
                        )}
                      </time>

                      {!notification.is_read && (
                        <button
                          type="button"
                          disabled={
                            markingAll ||
                            workingId === notification.id ||
                            Boolean(workingId)
                          }
                          onClick={() =>
                            void markAsRead(notification.id)
                          }
                          style={{
                            padding: "5px 8px",
                            border: "1px solid #bae6fd",
                            borderRadius: "7px",
                            background: "#ffffff",
                            color: "#0369a1",
                            fontSize: "11px",
                            fontWeight: 700,
                            cursor: "pointer",
                          }}
                        >
                          {workingId === notification.id
                            ? "Updating..."
                            : "Mark as read"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}

          <div
            style={{
              padding: "13px 16px",
              borderTop: "1px solid #e2e8f0",
              background: "#f8fafc",
            }}
          >
            <Link
              href="/notifications"
              onClick={() => setIsOpen(false)}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: "8px",
                width: "100%",
                padding: "11px",
                borderRadius: "10px",
                background: "#0b1e3a",
                color: "#ffffff",
                fontSize: "12px",
                fontWeight: 800,
                textDecoration: "none",
              }}
            >
              View all notifications <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      )}

      {toast && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "fixed",
            top: "88px",
            right: "16px",
            zIndex: 2000,
            width: "min(360px, calc(100vw - 32px))",
            padding: "16px",
            border: "1px solid #bae6fd",
            borderLeft: "4px solid #00b4d8",
            borderRadius: "14px",
            background: "#ffffff",
            color: "#0f172a",
            boxShadow: "0 16px 45px rgba(15, 23, 42, 0.2)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              justifyContent: "space-between",
              gap: "12px",
            }}
          >
            <div style={{ minWidth: 0 }}>
              <p
                style={{
                  margin: "0 0 5px",
                  color: "#0284c7",
                  fontSize: "10px",
                  fontWeight: 800,
                  letterSpacing: "0.1em",
                }}
              >
                NEW NOTIFICATION
              </p>

              <h3
                style={{
                  margin: 0,
                  fontSize: "14px",
                  fontWeight: 800,
                  lineHeight: 1.5,
                  overflowWrap: "anywhere",
                }}
              >
                {toast.title}
              </h3>

              {toast.body && (
                <p
                  style={{
                    margin: "5px 0 0",
                    color: "#64748b",
                    fontSize: "12px",
                    lineHeight: 1.6,
                  }}
                >
                  {toast.body}
                </p>
              )}

              <Link
                href={
                  isSafeInternalLink(toast.link)
                    ? toast.link
                    : "/notifications"
                }
                onClick={(event) =>
                  void navigateToNotification(
                    event,
                    toast,
                    isSafeInternalLink(toast.link)
                      ? toast.link
                      : "/notifications"
                  )
                }
                style={{
                  display: "inline-block",
                  marginTop: "10px",
                  color: "#0284c7",
                  fontSize: "12px",
                  fontWeight: 800,
                  textDecoration: "none",
                }}
              >
                View notification →
              </Link>
            </div>

            <button
              type="button"
              aria-label="Dismiss alert"
              onClick={dismissToast}
              style={{
                flexShrink: 0,
                width: "28px",
                height: "28px",
                border: "1px solid #e2e8f0",
                borderRadius: "8px",
                background: "#ffffff",
                color: "#64748b",
                fontSize: "17px",
                cursor: "pointer",
              }}
            >
              ×
            </button>
          </div>
        </div>
      )}
    </div>
  );
}