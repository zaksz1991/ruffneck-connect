"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";

type ConversationListItem = {
  id: string;
  href: string;
  name: string;
  preview: string;
  dateLabel: string;
  conversationType: "direct" | "intent";
  unreadCount: number;
  isPinned: boolean;
  avatarUrl: string | null;
  isSelected: boolean;
};

type FilterKey = "all" | "pinned" | "unread" | "direct" | "intent";
type SortKey = "recent" | "unread" | "name";

type Props = {
  items: ConversationListItem[];
};

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
  pinned: "Pinned",
  unread: "Unread",
  direct: "Direct",
  intent: "Intent",
};

function truncate(value: string, maxLength = 180) {
  const normalized = value.trim();
  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength).trim()}…`
    : normalized;
}

export default function ConversationListFilters({ items }: Props) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<FilterKey>("all");
  const [sort, setSort] = useState<SortKey>("recent");
  const [pinnedById, setPinnedById] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(items.map((item) => [item.id, item.isPinned]))
  );
  const [pendingPins, setPendingPins] = useState<Set<string>>(() => new Set());
  const [pinError, setPinError] = useState("");

  // Respect freshly loaded server data after navigation or refresh.
  useEffect(() => {
    setPinnedById(Object.fromEntries(items.map((item) => [item.id, item.isPinned])));
  }, [items]);

  const isPinned = (item: ConversationListItem) =>
    pinnedById[item.id] ?? item.isPinned;

  const counts = useMemo<Record<FilterKey, number>>(
    () => ({
      all: items.length,
      pinned: items.filter(
        (item) => pinnedById[item.id] ?? item.isPinned
      ).length,
      unread: items.filter((item) => item.unreadCount > 0).length,
      direct: items.filter((item) => item.conversationType === "direct").length,
      intent: items.filter((item) => item.conversationType === "intent").length,
    }),
    [items, pinnedById]
  );

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const getPinned = (item: ConversationListItem) =>
      pinnedById[item.id] ?? item.isPinned;
    const filteredItems = items.filter((item) => {
      if (filter === "pinned" && !getPinned(item)) return false;
      if (filter === "unread" && item.unreadCount <= 0) return false;
      if (filter === "direct" && item.conversationType !== "direct") return false;
      if (filter === "intent" && item.conversationType !== "intent") return false;
      if (!needle) return true;

      return `${item.name} ${item.preview} ${item.conversationType}`
        .toLocaleLowerCase()
        .includes(needle);
    });

    const originalOrder = new Map(items.map((item, index) => [item.id, index]));
    return [...filteredItems].sort((left, right) => {
      // Pinned conversations stay above unpinned ones regardless of sort mode.
      const pinDifference = Number(getPinned(right)) - Number(getPinned(left));
      if (pinDifference !== 0) return pinDifference;

      if (sort === "unread") {
        const unreadDifference = right.unreadCount - left.unreadCount;
        if (unreadDifference !== 0) return unreadDifference;
      }

      if (sort === "name") {
        const nameDifference = left.name.localeCompare(right.name);
        if (nameDifference !== 0) return nameDifference;
      }

      return (originalOrder.get(left.id) ?? 0) - (originalOrder.get(right.id) ?? 0);
    });
  }, [items, query, filter, sort, pinnedById]);

  async function togglePin(item: ConversationListItem) {
    if (pendingPins.has(item.id)) return;

    setPinError("");
    const previous = isPinned(item);
    const next = !previous;
    setPinnedById((current) => ({ ...current, [item.id]: next }));
    setPendingPins((current) => new Set(current).add(item.id));

    try {
      const supabase = createClient();
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Your session has expired. Sign in again to pin conversations.");
      }

      const { error } = await supabase
        .from("conversation_participants")
        // Cast lets this patch compile against locally generated Supabase types
        // that have not yet been regenerated to include the new migration column.
        .update({ is_pinned: next } as never)
        .eq("conversation_id", item.id)
        .eq("user_id", user.id)
        .eq("status", "active");

      if (error) throw error;
    } catch (error) {
      setPinnedById((current) => ({ ...current, [item.id]: previous }));
      setPinError(
        error instanceof Error
          ? error.message
          : "Unable to update the pinned conversation. Please try again."
      );
    } finally {
      setPendingPins((current) => {
        const nextPending = new Set(current);
        nextPending.delete(item.id);
        return nextPending;
      });
    }
  }

  return (
    <section aria-label="Conversation list">
      <div
        className="feature-card"
        style={{
          marginBottom: 16,
          padding: 16,
          display: "grid",
          gap: 14,
        }}
      >
        <label
          htmlFor="conversation-search"
          style={{ display: "grid", gap: 6, fontWeight: 700 }}
        >
          Search conversations
          <input
            id="conversation-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search a name or recent message…"
            autoComplete="off"
            style={{
              width: "100%",
              minHeight: 44,
              padding: "10px 12px",
              border: "1px solid var(--border, #d1d5db)",
              borderRadius: 10,
              background: "var(--surface, #fff)",
              color: "inherit",
              font: "inherit",
              fontWeight: 400,
            }}
          />
        </label>

        <div
          role="group"
          aria-label="Filter conversations"
          style={{ display: "flex", flexWrap: "wrap", gap: 8 }}
        >
          {(Object.keys(FILTER_LABELS) as FilterKey[]).map((key) => {
            const selected = filter === key;
            return (
              <button
                key={key}
                type="button"
                aria-pressed={selected}
                onClick={() => setFilter(key)}
                className={selected ? "button-primary" : "button-secondary"}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 7,
                  padding: "8px 12px",
                  borderRadius: 999,
                  cursor: "pointer",
                }}
              >
                <span>{FILTER_LABELS[key]}</span>
                <span
                  aria-label={`${counts[key]} conversations`}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    minWidth: 21,
                    height: 21,
                    padding: "0 5px",
                    borderRadius: 999,
                    background: selected
                      ? "rgba(255,255,255,.22)"
                      : "var(--surface-muted, #eef2f7)",
                    fontSize: 11,
                    fontWeight: 800,
                  }}
                >
                  {counts[key]}
                </span>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
          }}
        >
          <p className="muted" aria-live="polite" style={{ margin: 0, fontSize: 13 }}>
            Showing {visibleItems.length} of {items.length} conversations
          </p>
          <label
            htmlFor="conversation-sort"
            style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13 }}
          >
            Sort
            <select
              id="conversation-sort"
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              style={{
                minHeight: 38,
                padding: "6px 10px",
                borderRadius: 8,
                border: "1px solid var(--border, #d1d5db)",
                background: "var(--surface, #fff)",
                color: "inherit",
                font: "inherit",
              }}
            >
              <option value="recent">Most recent</option>
              <option value="unread">Unread first</option>
              <option value="name">Name A–Z</option>
            </select>
          </label>
        </div>
      </div>

      {pinError && (
        <div className="alert alert-error" role="alert" style={{ marginBottom: 14 }}>
          {pinError}
        </div>
      )}

      {visibleItems.length === 0 ? (
        <div className="feature-card empty-state" role="status">
          <h2>{filter === "pinned" ? "No pinned conversations" : "No matching conversations"}</h2>
          <p className="muted">
            {items.length === 0
              ? "Your conversations will appear here when you connect with another member."
              : filter === "pinned"
                ? "Pin an important conversation to keep it at the top of your list."
                : "Try a different search or filter to find the conversation."}
          </p>
          {(query || filter !== "all" || sort !== "recent") && (
            <button
              type="button"
              className="button-secondary"
              onClick={() => {
                setQuery("");
                setFilter("all");
                setSort("recent");
              }}
            >
              Reset search and filters
            </button>
          )}
        </div>
      ) : (
        <div className="conversation-list">
          {visibleItems.map((conversation) => {
            const pinned = isPinned(conversation);
            const busy = pendingPins.has(conversation.id);
            return (
              <div
                key={conversation.id}
                className={`conversation-card${pinned ? " conversation-card-pinned" : ""}`}
                aria-current={conversation.isSelected ? "page" : undefined}
                style={{ display: "flex", alignItems: "stretch", gap: 8 }}
              >
                <Link
                  href={conversation.href}
                  className="conversation-card-main"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    flex: 1,
                    minWidth: 0,
                    gap: 12,
                    color: "inherit",
                    textDecoration: "none",
                  }}
                >
                  <div className="conversation-avatar" aria-hidden="true">
                    {conversation.avatarUrl ? (
                      <img
                        src={conversation.avatarUrl}
                        alt=""
                        loading="lazy"
                        style={{
                          width: "100%",
                          height: "100%",
                          objectFit: "cover",
                          borderRadius: "inherit",
                        }}
                      />
                    ) : (
                      conversation.name.charAt(0).toUpperCase()
                    )}
                  </div>
                  <div className="conversation-content" style={{ flex: 1, minWidth: 0 }}>
                    <div className="conversation-heading">
                      <h2>{conversation.name}</h2>
                      <span className="conversation-type">
                        {conversation.conversationType === "intent" ? "Intent" : "Direct"}
                      </span>
                      {pinned && (
                        <span
                          title="Pinned conversation"
                          aria-label="Pinned conversation"
                          style={{ marginLeft: 6, fontSize: 12 }}
                        >
                          📌 Pinned
                        </span>
                      )}
                      {conversation.unreadCount > 0 && (
                        <span
                          className="conversation-unread-badge"
                          aria-label={`${conversation.unreadCount} unread message${conversation.unreadCount === 1 ? "" : "s"}`}
                          title={`${conversation.unreadCount} unread message${conversation.unreadCount === 1 ? "" : "s"}`}
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            minWidth: 22,
                            height: 22,
                            padding: "0 7px",
                            marginLeft: 8,
                            borderRadius: 999,
                            background: "var(--cyan, #00b4d8)",
                            color: "var(--navy, #0b1e3a)",
                            fontSize: 12,
                            fontWeight: 800,
                            lineHeight: 1,
                          }}
                        >
                          {conversation.unreadCount > 99 ? "99+" : conversation.unreadCount}
                        </span>
                      )}
                    </div>
                    <p
                      className="conversation-preview"
                      style={conversation.unreadCount > 0 ? { fontWeight: 650 } : undefined}
                    >
                      {truncate(conversation.preview)}
                    </p>
                    <span className="conversation-date">{conversation.dateLabel}</span>
                  </div>
                </Link>
                <button
                  type="button"
                  className="button-secondary"
                  aria-pressed={pinned}
                  aria-label={`${pinned ? "Unpin" : "Pin"} ${conversation.name}`}
                  title={pinned ? "Unpin conversation" : "Pin conversation"}
                  disabled={busy}
                  onClick={() => void togglePin(conversation)}
                  style={{
                    alignSelf: "center",
                    flexShrink: 0,
                    minHeight: 36,
                    padding: "6px 10px",
                    borderRadius: 999,
                    fontSize: 12,
                    whiteSpace: "nowrap",
                    opacity: busy ? 0.65 : 1,
                  }}
                >
                  {busy ? "Saving…" : pinned ? "📌 Unpin" : "＋ Pin"}
                </button>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
