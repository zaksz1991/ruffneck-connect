"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Notification = {
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
    const url = new URL(link, window.location.origin);

    if (url.origin !== window.location.origin) {
      return false;
    }

    return /^\/(home|communities(?:\/[a-zA-Z0-9_-]+)?|intents(?:\/[a-f0-9-]+)?|messages(?:\/[a-f0-9-]+)?|notifications)\/?$/i.test(
      url.pathname
    );
  } catch {
    return false;
  }
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const [markingAll, setMarkingAll] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const updating = markingAll || updatingIds.length > 0;

  const loadNotifications = useCallback(async () => {
    try {
      setError("");

      const response = await fetch("/api/notifications", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: {
          Accept: "application/json",
        },
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          result.error || "Unable to load notifications."
        );
      }

      setNotifications(
        Array.isArray(result.notifications)
          ? result.notifications
          : []
      );

      setUnreadCount(
        typeof result.unread_count === "number"
          ? Math.max(0, result.unread_count)
          : 0
      );
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to load notifications."
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markAsRead = useCallback(
    async (notificationId?: string): Promise<boolean> => {
      if (markingAll || (notificationId && updatingIds.includes(notificationId))) {
        return false;
      }

      if (!notificationId && updatingIds.length > 0) {
        return false;
      }

      const target = notificationId
        ? notifications.find(
            (notification) => notification.id === notificationId
          )
        : null;

      if (notificationId && (!target || target.is_read)) {
        return true;
      }

      if (
        !notificationId &&
        notifications.every((notification) => notification.is_read)
      ) {
        return true;
      }

      setError("");
      setSuccess("");

      const previousNotifications = notifications;
      const previousUnreadCount = unreadCount;

      if (notificationId) {
        setUpdatingIds((current) => [...current, notificationId]);
      } else {
        setMarkingAll(true);
      }

      // Update the interface immediately while the request runs.
      setNotifications((current) =>
        current.map((notification) => {
          if (
            notificationId &&
            notification.id !== notificationId
          ) {
            return notification;
          }

          if (notification.is_read) {
            return notification;
          }

          return {
            ...notification,
            is_read: true,
            read_at: new Date().toISOString(),
          };
        })
      );

      setUnreadCount((current) => {
        if (!notificationId) {
          return 0;
        }

        return Math.max(0, current - (target && !target.is_read ? 1 : 0));
      });

      try {
        const response = await fetch("/api/notifications/read", {
          method: "POST",
          credentials: "same-origin",
          headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
          },
          body: JSON.stringify(
            notificationId
              ? { notification_id: notificationId }
              : { mark_all: true }
          ),
        });

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            result.error || "Unable to update notifications."
          );
        }

        setSuccess(
          notificationId
            ? "Notification marked as read."
            : "All notifications marked as read."
        );

        // Reconcile the local state with the server.
        await loadNotifications();

        return true;
      } catch (err) {
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);

        setError(
          err instanceof Error
            ? err.message
            : "Unable to update notifications."
        );

        return false;
      } finally {
        if (notificationId) {
          setUpdatingIds((current) =>
            current.filter((id) => id !== notificationId)
          );
        } else {
          setMarkingAll(false);
        }
      }
    },
    [
      markingAll,
      notifications,
      updatingIds,
      unreadCount,
      loadNotifications,
    ]
  );

  function formatDate(value: string) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "Date unavailable";
    }

    return new Intl.DateTimeFormat("en-NG", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(date);
  }

  function formatType(value: string) {
    return value
      .replaceAll("_", " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  return (
    <main className="page-shell">
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="muted">RUFFNECK CONNECT</p>
            <h1>Notifications</h1>
            <p className="muted">
              Updates about your communities, interests, and conversations.
            </p>
          </div>

          <span className="status-badge" aria-live="polite">
            {unreadCount} unread
          </span>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            className="button button-primary"
            onClick={() => void markAsRead()}
            disabled={updating}
          >
            {markingAll ? "Updating..." : "Mark all as read"}
          </button>
        )}

        {error && (
          <div className="empty-state" role="alert">
            <p>{error}</p>

            <button
              type="button"
              className="button button-secondary"
              onClick={() => void loadNotifications()}
              disabled={loading}
            >
              Try again
            </button>
          </div>
        )}

        {success && (
          <p role="status" aria-live="polite" className="muted">
            {success}
          </p>
        )}

        {loading ? (
          <div className="empty-state" aria-live="polite">
            <p>Loading notifications...</p>
          </div>
        ) : notifications.length === 0 ? (
          <div className="empty-state">
            <h2>You are all caught up</h2>
            <p>New notifications will appear here.</p>
          </div>
        ) : (
          <div className="grid-2">
            {notifications.map((notification) => {
              const isUpdating = updatingIds.includes(notification.id);
              const safeLink = isSafeInternalLink(notification.link);

              return (
                <article
                  key={notification.id}
                  className="feature-card"
                  style={{
                    borderLeft: notification.is_read
                      ? "3px solid #d1d5db"
                      : "3px solid #00b4d8",
                    opacity: isUpdating ? 0.75 : 1,
                  }}
                >
                  <div className="card-topline">
                    <span className="intent-badge">
                      {formatType(notification.notification_type)}
                    </span>

                    <span className="status-badge">
                      {notification.is_read ? "Read" : "Unread"}
                    </span>
                  </div>

                  <h2>{notification.title}</h2>

                  {notification.body && (
                    <p>{notification.body}</p>
                  )}

                  <p className="muted">
                    {formatDate(notification.created_at)}
                  </p>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: "10px",
                      marginTop: "12px",
                    }}
                  >
                    {safeLink && (
                      <Link
                        className="button button-primary"
                        href={notification.link}
                        onClick={async (event) => {
                          if (notification.is_read) {
                            return;
                          }

                          event.preventDefault();

                          const success = await markAsRead(
                            notification.id
                          );

                          if (success) {
                            window.location.assign(notification.link!);
                          }
                        }}
                      >
                        View details
                      </Link>
                    )}

                    {!notification.is_read && (
                      <button
                        type="button"
                        className="button button-secondary"
                        disabled={updating || isUpdating}
                        onClick={() =>
                          void markAsRead(notification.id)
                        }
                      >
                        {isUpdating ? "Updating..." : "Mark as read"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>
    </main>
  );
}