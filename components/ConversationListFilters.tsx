"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type ConversationListItem = {
  id: string;
  href: string;
  name: string;
  preview: string;
  dateLabel: string;
  conversationType: "direct" | "intent";
  unreadCount: number;
  avatarUrl: string | null;
  isSelected: boolean;
};

type FilterKey = "all" | "unread" | "direct" | "intent";
type SortKey = "recent" | "unread" | "name";

type Props = {
  items: ConversationListItem[];
};

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All",
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

  const counts = useMemo<Record<FilterKey, number>>(
    () => ({
      all: items.length,
      unread: items.filter((item) => item.unreadCount > 0).length,
      direct: items.filter((item) => item.conversationType === "direct").length,
      intent: items.filter((item) => item.conversationType === "intent").length,
    }),
    [items]
  );

  const visibleItems = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase();
    const filteredItems = items.filter((item) => {
      if (filter === "unread" && item.unreadCount <= 0) return false;
      if (filter === "direct" && item.conversationType !== "direct") return false;
      if (filter === "intent" && item.conversationType !== "intent") return false;
      if (!needle) return true;

      return `${item.name} ${item.preview} ${item.conversationType}`
        .toLocaleLowerCase()
        .includes(needle);
    });

    return [...filteredItems].sort((left, right) => {
      if (sort === "unread") {
        const unreadDifference = right.unreadCount - left.unreadCount;
        if (unreadDifference !== 0) return unreadDifference;
      }

      if (sort === "name") {
        const nameDifference = left.name.localeCompare(right.name);
        if (nameDifference !== 0) return nameDifference;
      }

      // The server returns conversations in recent-first order. Preserve that
      // ordering for ties and when Recent is selected.
      return items.findIndex((item) => item.id === left.id) -
        items.findIndex((item) => item.id === right.id);
    });
  }, [items, query, filter, sort]);

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

      {visibleItems.length === 0 ? (
        <div className="feature-card empty-state" role="status">
          <h2>No matching conversations</h2>
          <p className="muted">
            {items.length === 0
              ? "Your conversations will appear here when you connect with another member."
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
          {visibleItems.map((conversation) => (
            <Link
              key={conversation.id}
              href={conversation.href}
              className="conversation-card"
              aria-current={conversation.isSelected ? "page" : undefined}
            >
              <div className="conversation-avatar" aria-hidden="true">
                {conversation.avatarUrl ? (
                  // This URL is supplied by the profile's avatar_url field.
                  // Keep the existing direct image approach for compatibility.
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
              <div className="conversation-content">
                <div className="conversation-heading">
                  <h2>{conversation.name}</h2>
                  <span className="conversation-type">
                    {conversation.conversationType === "intent" ? "Intent" : "Direct"}
                  </span>
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
          ))}
        </div>
      )}
    </section>
  );
}
