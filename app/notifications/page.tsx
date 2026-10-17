"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

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

type NotificationsResponse = {
  notifications?: Notification[];
  unread_count?: number;
  error?: string;
};

type UpdateResponse = {
  error?: string;
};

type Filter = "all" | "unread" | "community" | "interests" | "messages";

const NOTIFICATION_LABELS: Record<string, string> = {
  community_join_approved: "Community request approved",
  community_join_declined: "Community request declined",
  community_join_request: "New community join request",
  community_role_changed: "Community role updated",
  interest_received: "New interest received",
  interest_approved: "Interest approved",
  interest_declined: "Interest declined",
  new_message: "New message",
  unknown: "Other notification",
};

function isSafeInternalLink(link: string | null): link is string {
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

    if (url.origin !== baseUrl) return false;

    return /^\/(?:home|communities(?:\/[a-zA-Z0-9_-]+)?|intents(?:\/[a-f0-9-]+)?|messages(?:\/[a-f0-9-]+)?|notifications)\/?$/i.test(
      url.pathname
    );
  } catch {
    return false;
  }
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";

  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatType(value: string): string {
  return NOTIFICATION_LABELS[value] ?? "Other notification";
}

function notificationCategory(value: string): Exclude<Filter, "all" | "unread"> {
  if (value.startsWith("community_")) return "community";
  if (value.startsWith("interest_")) return "interests";
  return "messages";
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [updatingIds, setUpdatingIds] = useState<string[]>([]);
  const [markingAll, setMarkingAll] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const updating = markingAll || updatingIds.length > 0;

  const loadNotifications = useCallback(async (silent = false) => {
    if (silent) setRefreshing(true);
    else setLoading(true);
    setError("");

    try {
      const response = await fetch("/api/notifications", {
        method: "GET",
        cache: "no-store",
        credentials: "same-origin",
        headers: { Accept: "application/json" },
      });

      const result = (await response.json()) as NotificationsResponse;
      if (!response.ok) {
        throw new Error(result.error || "Unable to load notifications.");
      }

      const nextNotifications = Array.isArray(result.notifications)
        ? result.notifications
        : [];

      setNotifications(nextNotifications);
      setUnreadCount(
        typeof result.unread_count === "number" &&
          Number.isFinite(result.unread_count)
          ? Math.max(0, Math.floor(result.unread_count))
          : nextNotifications.filter((item) => !item.is_read).length
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Unable to load notifications."
      );
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadNotifications();
  }, [loadNotifications]);

  const markAsRead = useCallback(
    async (notificationId?: string): Promise<boolean> => {
      if (
        markingAll ||
        (notificationId && updatingIds.includes(notificationId)) ||
        (!notificationId && updatingIds.length > 0)
      ) {
        return false;
      }

      const target = notificationId
        ? notifications.find((notification) => notification.id === notificationId)
        : null;

      if (notificationId && (!target || target.is_read)) return true;
      if (!notificationId && notifications.every((notification) => notification.is_read)) {
        return true;
      }

      setError("");
      setSuccess("");

      const previousNotifications = notifications;
      const previousUnreadCount = unreadCount;

      if (notificationId) setUpdatingIds((current) => [...current, notificationId]);
      else setMarkingAll(true);

      setNotifications((current) =>
        current.map((notification) => {
          if (notificationId && notification.id !== notificationId) return notification;
          if (notification.is_read) return notification;
          return {
            ...notification,
            is_read: true,
            read_at: new Date().toISOString(),
          };
        })
      );

      setUnreadCount((current) => {
        if (!notificationId) return 0;
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

        const result = (await response.json()) as UpdateResponse;
        if (!response.ok) {
          throw new Error(result.error || "Unable to update notifications.");
        }

        setSuccess(
          notificationId
            ? "Notification marked as read."
            : "All notifications marked as read."
        );
        await loadNotifications(true);
        return true;
      } catch (err) {
        setNotifications(previousNotifications);
        setUnreadCount(previousUnreadCount);
        setError(
          err instanceof Error ? err.message : "Unable to update notifications."
        );
        return false;
      } finally {
        if (notificationId) {
          setUpdatingIds((current) => current.filter((id) => id !== notificationId));
        } else {
          setMarkingAll(false);
        }
      }
    },
    [loadNotifications, markingAll, notifications, unreadCount, updatingIds]
  );

  const counts = useMemo(() => {
    const result: Record<Filter, number> = {
      all: notifications.length,
      unread: notifications.filter((item) => !item.is_read).length,
      community: 0,
      interests: 0,
      messages: 0,
    };

    for (const notification of notifications) {
      result[notificationCategory(notification.notification_type)] += 1;
    }

    return result;
  }, [notifications]);

  const visibleNotifications = useMemo(
    () =>
      notifications.filter((notification) => {
        if (filter === "all") return true;
        if (filter === "unread") return !notification.is_read;
        return notificationCategory(notification.notification_type) === filter;
      }),
    [filter, notifications]
  );

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "All" },
    { value: "unread", label: "Unread" },
    { value: "community", label: "Community" },
    { value: "interests", label: "Interests" },
    { value: "messages", label: "Messages" },
  ];

  return (
    <main className="page-shell">
      <section className="section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">RUFFNECK CONNECT</p>
            <h1>Notifications</h1>
            <p className="muted">
              Updates about your communities, interests, and conversations.
            </p>
          </div>
          <span className="status-badge" aria-live="polite">
            {unreadCount} unread
          </span>
        </div>

        <div className="hero-actions" role="group" aria-label="Notification actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void loadNotifications(true)}
            disabled={loading || refreshing}
          >
            {refreshing ? "Refreshing..." : "Refresh"}
          </button>
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
        </div>

        <div
          className="hero-actions"
          role="group"
          aria-label="Filter notifications"
          style={{ marginTop: 18 }}
        >
          {filters.map((item) => (
            <button
              key={item.value}
              type="button"
              className={
                filter === item.value
                  ? "button button-primary"
                  : "button button-secondary"
              }
              aria-pressed={filter === item.value}
              onClick={() => setFilter(item.value)}
            >
              {item.label} ({counts[item.value]})
            </button>
          ))}
        </div>

        {error && (
          <div className="empty-state" role="alert" style={{ marginTop: 20 }}>
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
          <p role="status" aria-live="polite" className="muted" style={{ marginTop: 16 }}>
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
        ) : visibleNotifications.length === 0 ? (
          <div className="empty-state">
            <h2>No notifications in this filter</h2>
            <p>Choose another filter to view your notifications.</p>
          </div>
        ) : (
          <div className="grid-2">
            {visibleNotifications.map((notification) => {
              const isUpdating = updatingIds.includes(notification.id);
              const notificationLink = isSafeInternalLink(notification.link)
                ? notification.link
                : null;

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
                  {notification.body && <p>{notification.body}</p>}
                  <p className="muted">{formatDate(notification.created_at)}</p>

                  <div
                    style={{
                      display: "flex",
                      flexWrap: "wrap",
                      gap: 10,
                      marginTop: 12,
                    }}
                  >
                    {notificationLink && (
                      <Link
                        className="button button-primary"
                        href={notificationLink}
                        onClick={async (event) => {
                          if (notification.is_read) return;
                          event.preventDefault();
                          const marked = await markAsRead(notification.id);
                          if (marked) window.location.assign(notificationLink);
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
                        onClick={() => void markAsRead(notification.id)}
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
