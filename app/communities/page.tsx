"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { createClient } from "@/lib/supabase/client";

type Community = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  category: string | null;
  location_label: string | null;
  visibility: "public" | "private";
  join_approval_required: boolean;
  owner_id: string;
  created_at: string;
};

type Membership = {
  community_id: string;
  user_id?: string;
  status: "pending" | "active" | "removed";
  role: "owner" | "moderator" | "member";
};

type ApiResponse = {
  communities?: Community[];
  memberships?: Membership[];
  error?: string;
};

const CATEGORY_ICONS: Record<string, string> = {
  technology: "⌘",
  education: "▤",
  business: "↗",
  entrepreneurship: "◇",
  career: "◎",
  community: "⌂",
  health: "+",
  creative: "✳",
  finance: "₦",
  default: "✦",
};

function getCategoryIcon(category: string | null) {
  if (!category) return CATEGORY_ICONS.default;

  return (
    CATEGORY_ICONS[category.toLowerCase()] ??
    CATEGORY_ICONS.default
  );
}

export default function CommunitiesPage() {
  const [communities, setCommunities] = useState<Community[]>([]);
  const [memberships, setMemberships] = useState<Membership[]>([]);
  const [currentUserId, setCurrentUserId] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [joiningId, setJoiningId] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [search, setSearch] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [locationLabel, setLocationLabel] = useState("");
  const [visibility, setVisibility] = useState<"public" | "private">(
    "public"
  );
  const [approvalRequired, setApprovalRequired] = useState(true);

  const loadCommunities = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const supabase = createClient();

      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        window.location.assign("/login?next=/communities");
        return;
      }

      setCurrentUserId(user.id);

      const response = await fetch("/api/communities", {
        cache: "no-store",
      });

      const result = (await response.json()) as ApiResponse;

      if (!response.ok) {
        setError(result.error || "Unable to load communities.");
        return;
      }

      setCommunities(result.communities ?? []);
      setMemberships(result.memberships ?? []);
    } catch {
      setError("Unable to connect to the server. Please try again.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCommunities();
  }, [loadCommunities]);

  const membershipByCommunity = useMemo(
    () =>
      new Map(
        memberships.map((membership) => [
          membership.community_id,
          membership,
        ])
      ),
    [memberships]
  );

  const categories = useMemo(
    () =>
      Array.from(
        new Set(
          communities
            .map((community) => community.category?.trim())
            .filter((value): value is string => Boolean(value))
        )
      ).sort((a, b) => a.localeCompare(b)),
    [communities]
  );

  const filteredCommunities = useMemo(() => {
    const searchText = search.trim().toLowerCase();

    return communities.filter((community) => {
      const matchesSearch =
        !searchText ||
        community.name.toLowerCase().includes(searchText) ||
        (community.description ?? "").toLowerCase().includes(searchText) ||
        (community.category ?? "").toLowerCase().includes(searchText) ||
        (community.location_label ?? "").toLowerCase().includes(searchText);

      const matchesCategory =
        categoryFilter === "all" ||
        community.category === categoryFilter;

      return matchesSearch && matchesCategory;
    });
  }, [communities, search, categoryFilter]);

  const activeMembershipCount = useMemo(
    () =>
      memberships.filter(
        (membership) => membership.status === "active"
      ).length,
    [memberships]
  );

  const pendingMembershipCount = useMemo(
    () =>
      memberships.filter(
        (membership) => membership.status === "pending"
      ).length,
    [memberships]
  );

  async function handleCreateCommunity(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (name.trim().length < 3) {
      setError("Community name must contain at least 3 characters.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        window.location.assign("/login?next=/communities");
        return;
      }

      const response = await fetch("/api/communities", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category: category.trim(),
          location_label: locationLabel.trim(),
          visibility,
          join_approval_required: approvalRequired,
        }),
      });

      const result = (await response.json()) as {
        community?: Community;
        error?: string;
      };

      if (!response.ok || !result.community) {
        setError(result.error || "Community creation failed.");
        return;
      }

      setNotice(`Community "${result.community.name}" was created.`);

      setName("");
      setDescription("");
      setCategory("");
      setLocationLabel("");
      setVisibility("public");
      setApprovalRequired(true);
      setShowForm(false);

      await loadCommunities();
    } catch {
      setError("Unable to create the community. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleJoin(community: Community) {
    setError("");
    setNotice("");
    setJoiningId(community.id);

    try {
      const supabase = createClient();

      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        window.location.assign("/login?next=/communities");
        return;
      }

      const response = await fetch(
        `/api/communities/${community.id}/join`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
        }
      );

      const result = (await response.json()) as {
        success?: boolean;
        status?: string;
        error?: string;
      };

      if (!response.ok || !result.success) {
        setError(result.error || "Unable to join this community.");
        return;
      }

      setNotice(
        result.status === "pending"
          ? `Your request to join "${community.name}" has been submitted.`
          : `You have joined "${community.name}".`
      );

      await loadCommunities();
    } catch {
      setError("Unable to join the community. Please try again.");
    } finally {
      setJoiningId("");
    }
  }

  function resetFilters() {
    setSearch("");
    setCategoryFilter("all");
  }

  return (
    <div className="rn-communities-page">
      <main className="rn-communities-shell">
        <section className="rn-community-hero">
          <div className="rn-community-hero-content">
            <div className="rn-community-eyebrow">
              <span className="rn-live-dot" />
              RUFFNECK CONNECT / COMMUNITY SPACE
            </div>

            <h1>
              Find your people.
              <br />
              <span>Build something together.</span>
            </h1>

            <p className="rn-community-hero-copy">
              Discover people who share your interests, exchange knowledge,
              work on meaningful ideas, and turn common goals into action.
            </p>

            <div className="rn-community-hero-actions">
              <button
                type="button"
                className="rn-primary-button"
                onClick={() => {
                  setShowForm((current) => !current);
                  setError("");
                  setNotice("");
                }}
              >
                {showForm ? "Close form" : "+ Create a community"}
              </button>

              <a className="rn-outline-button" href="#community-directory">
                Explore communities <span aria-hidden="true">↓</span>
              </a>
            </div>

            <div className="rn-community-hero-footnote">
              <span>SHARED INTERESTS</span>
              <span className="rn-footnote-divider" />
              <span>REAL CONNECTIONS</span>
              <span className="rn-footnote-divider" />
              <span>COLLECTIVE PROGRESS</span>
            </div>
          </div>

          <div className="rn-community-hero-art" aria-hidden="true">
            <div className="rn-orbit rn-orbit-one" />
            <div className="rn-orbit rn-orbit-two" />
            <div className="rn-orbit rn-orbit-three" />

            <div className="rn-orbit-center">
              <span className="rn-center-symbol">R</span>
              <span className="rn-center-label">CONNECT</span>
            </div>

            <div className="rn-orbit-node rn-node-one">
              <span>✳</span>
            </div>
            <div className="rn-orbit-node rn-node-two">
              <span>⌘</span>
            </div>
            <div className="rn-orbit-node rn-node-three">
              <span>◇</span>
            </div>
            <div className="rn-orbit-node rn-node-four">
              <span>↗</span>
            </div>

            <div className="rn-floating-label rn-floating-top">
              PEOPLE <span>+</span>
            </div>
            <div className="rn-floating-label rn-floating-bottom">
              SHARED PURPOSE
            </div>
          </div>

          <div className="rn-community-hero-glow" aria-hidden="true" />
        </section>

        {error && (
          <div className="rn-feedback rn-feedback-error" role="alert">
            <span className="rn-feedback-icon">!</span>
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        {notice && (
          <div className="rn-feedback rn-feedback-success" role="status">
            <span className="rn-feedback-icon">✓</span>
            <span>{notice}</span>
            <button
              type="button"
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
            >
              ×
            </button>
          </div>
        )}

        <section className="rn-community-stats" aria-label="Community overview">
          <article className="rn-stat-card rn-stat-featured">
            <span className="rn-stat-icon">✳</span>
            <div>
              <span className="rn-stat-label">DISCOVER</span>
              <strong>{loading ? "—" : communities.length}</strong>
              <p>Communities available</p>
            </div>
            <span className="rn-stat-decoration" aria-hidden="true">
              01
            </span>
          </article>

          <article className="rn-stat-card">
            <span className="rn-stat-icon rn-stat-icon-cyan">◎</span>
            <div>
              <span className="rn-stat-label">YOUR NETWORK</span>
              <strong>{loading ? "—" : activeMembershipCount}</strong>
              <p>Active memberships</p>
            </div>
            <span className="rn-stat-decoration" aria-hidden="true">
              02
            </span>
          </article>

          <article className="rn-stat-card">
            <span className="rn-stat-icon rn-stat-icon-gold">◷</span>
            <div>
              <span className="rn-stat-label">IN PROGRESS</span>
              <strong>{loading ? "—" : pendingMembershipCount}</strong>
              <p>Pending requests</p>
            </div>
            <span className="rn-stat-decoration" aria-hidden="true">
              03
            </span>
          </article>
        </section>

        {showForm && (
          <section className="rn-create-panel" id="create-community">
            <div className="rn-create-heading">
              <div>
                <span className="rn-section-kicker">
                  YOUR IDEA STARTS HERE
                </span>
                <h2>Create a community</h2>
                <p>
                  Give people a place to connect around a shared purpose.
                </p>
              </div>

              <button
                type="button"
                className="rn-close-button"
                onClick={() => setShowForm(false)}
                aria-label="Close community form"
              >
                ×
              </button>
            </div>

            <form onSubmit={handleCreateCommunity} className="rn-create-form">
              <div className="rn-form-field rn-field-full">
                <label htmlFor="community-name">Community name *</label>
                <input
                  id="community-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Kano Technology Builders"
                  minLength={3}
                  maxLength={100}
                  required
                />
                <span className="rn-field-hint">
                  Choose a clear name that people can recognize.
                </span>
              </div>

              <div className="rn-form-field rn-field-full">
                <label htmlFor="community-description">Description</label>
                <textarea
                  id="community-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  placeholder="What brings this community together? Who is it for?"
                  maxLength={1000}
                  rows={4}
                />
                <span className="rn-field-hint">
                  {description.length}/1000 characters
                </span>
              </div>

              <div className="rn-form-field">
                <label htmlFor="community-category">Category</label>
                <input
                  id="community-category"
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  placeholder="e.g. Technology, Education"
                  maxLength={80}
                />
              </div>

              <div className="rn-form-field">
                <label htmlFor="community-location">Location</label>
                <input
                  id="community-location"
                  value={locationLabel}
                  onChange={(event) => setLocationLabel(event.target.value)}
                  placeholder="e.g. Kano, Nigeria or Online"
                  maxLength={120}
                />
              </div>

              <div className="rn-form-field">
                <label htmlFor="community-visibility">Visibility</label>
                <select
                  id="community-visibility"
                  value={visibility}
                  onChange={(event) =>
                    setVisibility(
                      event.target.value as "public" | "private"
                    )
                  }
                >
                  <option value="public">Public</option>
                  <option value="private">Private</option>
                </select>
                <span className="rn-field-hint">
                  Private communities are not listed in public discovery.
                </span>
              </div>

              <div className="rn-form-field">
                <label htmlFor="community-approval">Membership access</label>
                <select
                  id="community-approval"
                  value={approvalRequired ? "approval" : "open"}
                  onChange={(event) =>
                    setApprovalRequired(event.target.value === "approval")
                  }
                >
                  <option value="approval">Require owner approval</option>
                  <option value="open">Allow immediate joining</option>
                </select>
                <span className="rn-field-hint">
                  Choose how people can become members.
                </span>
              </div>

              <div className="rn-form-actions rn-field-full">
                <button
                  type="submit"
                  className="rn-primary-button"
                  disabled={submitting}
                >
                  {submitting ? "Creating community..." : "Create community"}
                  {!submitting && <span aria-hidden="true"> →</span>}
                </button>

                <button
                  type="button"
                  className="rn-cancel-button"
                  onClick={() => setShowForm(false)}
                  disabled={submitting}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        <section
          className="rn-directory-section"
          id="community-directory"
        >
          <div className="rn-directory-heading">
            <div>
              <span className="rn-section-kicker">THE COMMUNITY DIRECTORY</span>
              <h2>Find your circle<span>.</span></h2>
              <p>
                Browse by interest, discover new perspectives, and connect
                with people moving in the same direction.
              </p>
            </div>

            <div className="rn-directory-count">
              <strong>
                {loading ? "—" : filteredCommunities.length.toString().padStart(2, "0")}
              </strong>
              <span>
                {filteredCommunities.length === 1
                  ? "COMMUNITY FOUND"
                  : "COMMUNITIES FOUND"}
              </span>
            </div>
          </div>

          <div className="rn-search-panel">
            <div className="rn-search-input-wrap">
              <span className="rn-search-icon" aria-hidden="true">
                ⌕
              </span>
              <label
                htmlFor="community-search"
                className="rn-visually-hidden"
              >
                Search communities
              </label>
              <input
                id="community-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, topic, description, or location..."
              />
              {search && (
                <button
                  type="button"
                  className="rn-clear-search"
                  onClick={() => setSearch("")}
                  aria-label="Clear search"
                >
                  ×
                </button>
              )}
            </div>

            <div className="rn-category-select-wrap">
              <label htmlFor="category-filter">CATEGORY</label>
              <select
                id="category-filter"
                value={categoryFilter}
                onChange={(event) => setCategoryFilter(event.target.value)}
              >
                <option value="all">All categories</option>
                {categories.map((item) => (
                  <option value={item} key={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {categoryFilter !== "all" || search ? (
            <div className="rn-active-filters">
              <span>FILTERS ACTIVE</span>
              {search && (
                <button type="button" onClick={() => setSearch("")}>
                  Search: {search} <span aria-hidden="true">×</span>
                </button>
              )}
              {categoryFilter !== "all" && (
                <button
                  type="button"
                  onClick={() => setCategoryFilter("all")}
                >
                  {categoryFilter} <span aria-hidden="true">×</span>
                </button>
              )}
              <button
                type="button"
                className="rn-reset-filters"
                onClick={resetFilters}
              >
                Clear all
              </button>
            </div>
          ) : null}

          {loading ? (
            <div className="rn-loading-grid" aria-label="Loading communities">
              {[1, 2, 3].map((item) => (
                <div className="rn-community-skeleton" key={item}>
                  <div className="rn-skeleton-line rn-skeleton-short" />
                  <div className="rn-skeleton-line rn-skeleton-title" />
                  <div className="rn-skeleton-line" />
                  <div className="rn-skeleton-line rn-skeleton-medium" />
                  <div className="rn-skeleton-bottom" />
                </div>
              ))}
            </div>
          ) : filteredCommunities.length === 0 ? (
            <div className="rn-empty-state">
              <div className="rn-empty-symbol" aria-hidden="true">
                {search || categoryFilter !== "all" ? "⌕" : "✳"}
              </div>

              <span className="rn-section-kicker">
                {search || categoryFilter !== "all"
                  ? "NO MATCHES YET"
                  : "BE THE FIRST"}
              </span>

              <h3>
                {search || categoryFilter !== "all"
                  ? "No communities found."
                  : "Your next community starts here."}
              </h3>

              <p>
                {search || categoryFilter !== "all"
                  ? "Try a different search term or category, or clear your filters to see more communities."
                  : "Create a space for people who share your interests, skills, or ambitions."}
              </p>

              <div className="rn-empty-actions">
                {(search || categoryFilter !== "all") && (
                  <button
                    type="button"
                    className="rn-cancel-button"
                    onClick={resetFilters}
                  >
                    Clear filters
                  </button>
                )}
                <button
                  type="button"
                  className="rn-primary-button"
                  onClick={() => {
                    setShowForm(true);
                    setError("");
                    setNotice("");
                  }}
                >
                  + Create a community
                </button>
              </div>
            </div>
          ) : (
            <div className="rn-community-grid">
              {filteredCommunities.map((community, index) => {
                const membership = membershipByCommunity.get(community.id);
                const isOwner = community.owner_id === currentUserId;

                return (
                  <article
                    className="rn-community-card"
                    key={community.id}
                    style={{ animationDelay: `${Math.min(index, 8) * 45}ms` }}
                  >
                    <div className="rn-card-topline">
                      <div className="rn-category-mark">
                        <span aria-hidden="true">
                          {getCategoryIcon(community.category)}
                        </span>
                      </div>

                      <div className="rn-card-badges">
                        {community.visibility === "private" && (
                          <span className="rn-status-badge rn-badge-private">
                            <span aria-hidden="true">⌑</span> Private
                          </span>
                        )}

                        {isOwner ? (
                          <span className="rn-status-badge rn-badge-owner">
                            Your community
                          </span>
                        ) : membership?.status === "active" ? (
                          <span className="rn-status-badge rn-badge-member">
                            <span aria-hidden="true">✓</span> Member
                          </span>
                        ) : membership?.status === "pending" ? (
                          <span className="rn-status-badge rn-badge-pending">
                            <span aria-hidden="true">◷</span> Request pending
                          </span>
                        ) : membership?.status === "removed" ? (
                          <span className="rn-status-badge rn-badge-removed">
                            Membership removed
                          </span>
                        ) : null}
                      </div>
                    </div>

                    <div className="rn-card-category">
                      {community.category || "GENERAL COMMUNITY"}
                    </div>

                    <h3>{community.name}</h3>

                    <p className="rn-card-description">
                      {community.description ||
                        "A community for people to connect, exchange ideas, and collaborate."}
                    </p>

                    {community.location_label ? (
                      <div className="rn-card-location">
                        <span aria-hidden="true">⌖</span>
                        <span>{community.location_label}</span>
                      </div>
                    ) : (
                      <div className="rn-card-location rn-location-placeholder">
                        <span aria-hidden="true">◎</span>
                        <span>Location not specified</span>
                      </div>
                    )}

                    <div className="rn-card-divider" />

                    <div className="rn-card-bottom">
                      <Link
                        href={`/communities/${community.slug}`}
                        className="rn-view-community"
                      >
                        View community <span aria-hidden="true">↗</span>
                      </Link>

                      {isOwner ? (
                        <span className="rn-card-action-note">OWNER</span>
                      ) : membership?.status === "active" ? (
                        <span className="rn-card-action-note">CONNECTED</span>
                      ) : membership?.status === "pending" ? (
                        <span className="rn-card-action-note">IN REVIEW</span>
                      ) : membership?.status === "removed" ? (
                        <span className="rn-card-action-note">INACTIVE</span>
                      ) : (
                        <button
                          type="button"
                          className="rn-join-button"
                          disabled={
                            Boolean(joiningId) ||
                            community.visibility === "private"
                          }
                          onClick={() => void handleJoin(community)}
                        >
                          {joiningId === community.id
                            ? "Joining..."
                            : community.visibility === "private"
                              ? "Private"
                              : community.join_approval_required
                                ? "Request to join"
                                : "Join community"}
                        </button>
                      )}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="rn-community-cta">
          <div className="rn-cta-decoration" aria-hidden="true">
            <span />
            <span />
            <span />
          </div>

          <div className="rn-cta-content">
            <span className="rn-section-kicker">GOOD THINGS START WITH PEOPLE</span>
            <h2>
              Have an idea worth
              <br />
              <span>bringing people together for?</span>
            </h2>
            <p>
              Start a community, set a shared direction, and create a place
              where people can contribute to something meaningful.
            </p>
            <button
              type="button"
              className="rn-primary-button"
              onClick={() => {
                setShowForm(true);
                setError("");
                setNotice("");
                window.setTimeout(() => {
                  document
                    .getElementById("create-community")
                    ?.scrollIntoView({ behavior: "smooth", block: "start" });
                }, 50);
              }}
            >
              Start your community <span aria-hidden="true">→</span>
            </button>
          </div>

          <div className="rn-cta-mark" aria-hidden="true">
            <span>R</span>
            <div className="rn-cta-ring rn-cta-ring-one" />
            <div className="rn-cta-ring rn-cta-ring-two" />
          </div>
        </section>

        <nav className="rn-community-shortcuts" aria-label="Explore RuffNeck Connect">
          <Link href="/members" className="rn-shortcut-card">
            <span className="rn-shortcut-icon">◎</span>
            <span>
              <strong>Find people</strong>
              <small>Meet members with shared interests</small>
            </span>
            <span className="rn-shortcut-arrow" aria-hidden="true">↗</span>
          </Link>

          <Link href="/intents" className="rn-shortcut-card">
            <span className="rn-shortcut-icon rn-shortcut-cyan">◇</span>
            <span>
              <strong>Explore intentions</strong>
              <small>Discover needs, offers, and opportunities</small>
            </span>
            <span className="rn-shortcut-arrow" aria-hidden="true">↗</span>
          </Link>

          <Link href="/messages" className="rn-shortcut-card">
            <span className="rn-shortcut-icon rn-shortcut-gold">↗</span>
            <span>
              <strong>Start a conversation</strong>
              <small>Turn a connection into a discussion</small>
            </span>
            <span className="rn-shortcut-arrow" aria-hidden="true">↗</span>
          </Link>
        </nav>
      </main>

      <footer className="rn-community-footer">
        <div className="rn-footer-inner">
          <Link href="/home" className="rn-footer-brand">
            <span className="rn-footer-logo">R</span>
            <span>
              <strong>RUFFNECK CONNECT</strong>
              <small>PEOPLE · PURPOSE · PROGRESS</small>
            </span>
          </Link>

          <span className="rn-footer-copy">
            © {new Date().getFullYear()} RuffNeck Connect
          </span>

          <Link href="/home" className="rn-footer-link">
            Back to home <span aria-hidden="true">↗</span>
          </Link>
        </div>
      </footer>

      <style jsx global>{`
        .rn-communities-page {
          --rn-navy: #0b1e3a;
          --rn-navy-deep: #07152a;
          --rn-cyan: #00b4d8;
          --rn-gold: #fbbf24;
          --rn-text: #172b45;
          --rn-muted: #6e7d90;
          --rn-border: #e4eaf1;
          --rn-surface: #ffffff;
          background: #f5f8fc;
          color: var(--rn-text);
          min-height: 100vh;
          overflow: hidden;
        }

        .rn-communities-page *,
        .rn-communities-page *::before,
        .rn-communities-page *::after {
          box-sizing: border-box;
        }

        .rn-communities-shell {
          width: min(1180px, calc(100% - 40px));
          margin: 0 auto;
          padding: 34px 0 72px;
        }

        .rn-community-hero {
          position: relative;
          display: grid;
          grid-template-columns: 1.15fr 0.85fr;
          align-items: center;
          min-height: 400px;
          overflow: hidden;
          border-radius: 25px;
          padding: 48px 54px;
          color: #fff;
          background:
            radial-gradient(ellipse at 85% 15%, rgba(0, 180, 216, 0.18), transparent 43%),
            linear-gradient(125deg, #07152a 0%, #0b1e3a 58%, #102e4d 100%);
          box-shadow: 0 20px 55px rgba(11, 30, 58, 0.12);
        }

        .rn-community-hero-content {
          position: relative;
          z-index: 2;
          max-width: 610px;
        }

        .rn-community-eyebrow,
        .rn-section-kicker {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          color: #8295ad;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.8px;
          line-height: 1.5;
        }

        .rn-community-eyebrow {
          color: #a8bed3;
        }

        .rn-live-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: var(--rn-gold);
          box-shadow: 0 0 0 4px rgba(251, 191, 36, 0.12);
        }

        .rn-community-hero h1 {
          margin: 24px 0 18px;
          color: #fff;
          font-size: clamp(34px, 4.2vw, 52px);
          font-weight: 850;
          letter-spacing: -2.2px;
          line-height: 1.08;
        }

        .rn-community-hero h1 span {
          color: var(--rn-cyan);
        }

        .rn-community-hero-copy {
          max-width: 510px;
          margin: 0;
          color: #c2cedc;
          font-size: 15px;
          line-height: 1.85;
        }

        .rn-community-hero-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 12px;
          margin-top: 28px;
        }

        .rn-primary-button,
        .rn-outline-button,
        .rn-cancel-button {
          display: inline-flex;
          min-height: 46px;
          align-items: center;
          justify-content: center;
          gap: 9px;
          border: 1px solid transparent;
          border-radius: 10px;
          padding: 12px 18px;
          font: inherit;
          font-size: 13px;
          font-weight: 750;
          text-decoration: none;
          cursor: pointer;
          transition:
            background 160ms ease,
            color 160ms ease,
            border-color 160ms ease,
            transform 160ms ease,
            box-shadow 160ms ease;
        }

        .rn-primary-button {
          color: #071a30;
          background: var(--rn-gold);
          box-shadow: 0 7px 18px rgba(251, 191, 36, 0.12);
        }

        .rn-primary-button:hover:not(:disabled) {
          background: #ffd45f;
          box-shadow: 0 9px 23px rgba(251, 191, 36, 0.22);
          transform: translateY(-2px);
        }

        .rn-primary-button:disabled,
        .rn-join-button:disabled {
          cursor: not-allowed;
          opacity: 0.55;
        }

        .rn-outline-button {
          color: #e7f0fa;
          border-color: rgba(255, 255, 255, 0.24);
          background: rgba(255, 255, 255, 0.045);
        }

        .rn-outline-button:hover {
          color: #fff;
          border-color: var(--rn-cyan);
          background: rgba(0, 180, 216, 0.1);
        }

        .rn-community-hero-footnote {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 10px;
          margin-top: 34px;
          color: #8fa5bd;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.25px;
        }

        .rn-footnote-divider {
          width: 4px;
          height: 4px;
          border-radius: 50%;
          background: var(--rn-cyan);
        }

        .rn-community-hero-art {
          position: relative;
          width: min(100%, 390px);
          aspect-ratio: 1;
          justify-self: end;
          display: grid;
          place-items: center;
        }

        .rn-orbit {
          position: absolute;
          top: 50%;
          left: 50%;
          border: 1px solid rgba(0, 180, 216, 0.18);
          border-radius: 50%;
          transform: translate(-50%, -50%);
        }

        .rn-orbit-one {
          width: 44%;
          height: 44%;
        }

        .rn-orbit-two {
          width: 69%;
          height: 69%;
          border-color: rgba(0, 180, 216, 0.22);
        }

        .rn-orbit-three {
          width: 94%;
          height: 94%;
          border-style: dashed;
          border-color: rgba(255, 255, 255, 0.12);
        }

        .rn-orbit-center {
          position: relative;
          z-index: 2;
          display: flex;
          width: 118px;
          height: 118px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 4px;
          border: 1px solid rgba(0, 180, 216, 0.5);
          border-radius: 28px;
          background: linear-gradient(145deg, #123c5c, #0b1e3a);
          box-shadow:
            0 0 0 12px rgba(0, 180, 216, 0.045),
            0 0 55px rgba(0, 180, 216, 0.18);
          transform: rotate(-7deg);
        }

        .rn-center-symbol {
          color: var(--rn-gold);
          font-size: 55px;
          font-weight: 900;
          letter-spacing: -5px;
          line-height: 1;
        }

        .rn-center-label {
          color: #b8d4e8;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .rn-orbit-node {
          position: absolute;
          z-index: 3;
          display: grid;
          width: 46px;
          height: 46px;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.15);
          border-radius: 15px;
          color: #fff;
          background: #163753;
          box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
          font-size: 20px;
        }

        .rn-node-one {
          top: 10%;
          left: 43%;
          color: var(--rn-gold);
          transform: rotate(9deg);
        }

        .rn-node-two {
          top: 39%;
          right: 0;
          color: var(--rn-cyan);
          transform: rotate(9deg);
        }

        .rn-node-three {
          bottom: 10%;
          left: 35%;
          color: var(--rn-gold);
          transform: rotate(-10deg);
        }

        .rn-node-four {
          top: 46%;
          left: 0;
          color: var(--rn-cyan);
          transform: rotate(-10deg);
        }

        .rn-floating-label {
          position: absolute;
          z-index: 4;
          border: 1px solid rgba(255, 255, 255, 0.13);
          border-radius: 8px;
          padding: 9px 11px;
          color: #b8c9dc;
          background: rgba(7, 21, 42, 0.8);
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 1.5px;
        }

        .rn-floating-top {
          top: 17%;
          right: 8%;
        }

        .rn-floating-top span {
          margin-left: 7px;
          color: var(--rn-gold);
        }

        .rn-floating-bottom {
          bottom: 17%;
          left: 2%;
        }

        .rn-community-hero-glow {
          position: absolute;
          right: -140px;
          bottom: -240px;
          width: 440px;
          height: 440px;
          border-radius: 50%;
          background: rgba(0, 180, 216, 0.08);
          filter: blur(35px);
          pointer-events: none;
        }

        .rn-feedback {
          display: flex;
          align-items: center;
          gap: 12px;
          margin-top: 22px;
          border: 1px solid;
          border-radius: 12px;
          padding: 13px 16px;
          font-size: 13px;
          line-height: 1.6;
        }

        .rn-feedback-icon {
          display: grid;
          width: 24px;
          height: 24px;
          flex-shrink: 0;
          place-items: center;
          border-radius: 50%;
          font-weight: 900;
        }

        .rn-feedback-error {
          color: #a12c35;
          border-color: #f3c9ce;
          background: #fff4f4;
        }

        .rn-feedback-error .rn-feedback-icon {
          color: #fff;
          background: #c9404b;
        }

        .rn-feedback-success {
          color: #176b4a;
          border-color: #b9e6d0;
          background: #effcf5;
        }

        .rn-feedback-success .rn-feedback-icon {
          color: #fff;
          background: #219767;
        }

        .rn-feedback > span:nth-child(2) {
          flex: 1;
        }

        .rn-feedback > button {
          border: 0;
          padding: 0 3px;
          color: inherit;
          background: transparent;
          font-size: 23px;
          cursor: pointer;
        }

        .rn-community-stats {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 17px;
          margin: 24px 0 70px;
        }

        .rn-stat-card {
          position: relative;
          display: flex;
          min-width: 0;
          align-items: flex-start;
          gap: 15px;
          overflow: hidden;
          border: 1px solid var(--rn-border);
          border-radius: 15px;
          padding: 23px 22px;
          background: #fff;
          box-shadow: 0 6px 20px rgba(11, 30, 58, 0.025);
        }

        .rn-stat-featured {
          border-color: rgba(0, 180, 216, 0.22);
          background: linear-gradient(125deg, #fff, #f0fbfe);
        }

        .rn-stat-icon {
          display: grid;
          width: 43px;
          height: 43px;
          flex-shrink: 0;
          place-items: center;
          border-radius: 12px;
          color: #8a5b00;
          background: #fff4d5;
          font-size: 22px;
        }

        .rn-stat-icon-cyan {
          color: #007d99;
          background: #e4faff;
        }

        .rn-stat-icon-gold {
          color: #976600;
          background: #fff5d9;
        }

        .rn-stat-label {
          display: block;
          margin: 2px 0 5px;
          color: #8190a2;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1.4px;
        }

        .rn-stat-card strong {
          display: block;
          color: var(--rn-navy);
          font-size: 28px;
          font-weight: 850;
          letter-spacing: -1px;
          line-height: 1.15;
        }

        .rn-stat-card p {
          margin: 5px 0 0;
          color: var(--rn-muted);
          font-size: 12px;
        }

        .rn-stat-decoration {
          position: absolute;
          right: 13px;
          bottom: 6px;
          color: rgba(11, 30, 58, 0.045);
          font-size: 42px;
          font-weight: 900;
          letter-spacing: -3px;
        }

        .rn-create-panel {
          scroll-margin-top: 24px;
          margin: 0 0 64px;
          border: 1px solid #dce7f0;
          border-radius: 20px;
          padding: 32px;
          background: #fff;
          box-shadow: 0 15px 45px rgba(11, 30, 58, 0.055);
          animation: rn-panel-enter 220ms ease both;
        }

        .rn-create-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 27px;
        }

        .rn-create-heading h2 {
          margin: 10px 0 7px;
          color: var(--rn-navy);
          font-size: 28px;
          font-weight: 850;
          letter-spacing: -0.8px;
        }

        .rn-create-heading p {
          margin: 0;
          color: var(--rn-muted);
          font-size: 13px;
          line-height: 1.7;
        }

        .rn-close-button {
          display: grid;
          width: 37px;
          height: 37px;
          flex-shrink: 0;
          place-items: center;
          border: 1px solid var(--rn-border);
          border-radius: 10px;
          color: var(--rn-navy);
          background: #f8fafc;
          font-size: 23px;
          cursor: pointer;
        }

        .rn-close-button:hover {
          color: #fff;
          border-color: var(--rn-navy);
          background: var(--rn-navy);
        }

        .rn-create-form {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 21px;
        }

        .rn-form-field {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 8px;
        }

        .rn-field-full {
          grid-column: 1 / -1;
        }

        .rn-form-field label {
          color: #263a52;
          font-size: 12px;
          font-weight: 800;
        }

        .rn-form-field input,
        .rn-form-field textarea,
        .rn-form-field select {
          display: block;
          width: 100%;
          min-height: 46px;
          border: 1px solid #dbe4ee;
          border-radius: 10px;
          padding: 12px 13px;
          outline: none;
          color: #172b45;
          background: #fbfcfe;
          font: inherit;
          font-size: 13px;
          transition:
            border-color 150ms ease,
            box-shadow 150ms ease,
            background 150ms ease;
        }

        .rn-form-field textarea {
          min-height: 115px;
          resize: vertical;
          line-height: 1.7;
        }

        .rn-form-field input::placeholder,
        .rn-form-field textarea::placeholder {
          color: #9aa8b8;
        }

        .rn-form-field input:focus,
        .rn-form-field textarea:focus,
        .rn-form-field select:focus {
          border-color: var(--rn-cyan);
          background: #fff;
          box-shadow: 0 0 0 3px rgba(0, 180, 216, 0.11);
        }

        .rn-field-hint {
          color: #8593a3;
          font-size: 11px;
          line-height: 1.6;
        }

        .rn-form-actions {
          display: flex;
          flex-wrap: wrap;
          gap: 10px;
          padding-top: 5px;
        }

        .rn-cancel-button {
          color: #41536a;
          border-color: #dce4ed;
          background: #fff;
        }

        .rn-cancel-button:hover {
          border-color: #a9b8c9;
          background: #f5f8fb;
        }

        .rn-directory-section {
          scroll-margin-top: 25px;
        }

        .rn-directory-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 25px;
          margin-bottom: 25px;
        }

        .rn-directory-heading h2 {
          margin: 10px 0 9px;
          color: var(--rn-navy);
          font-size: clamp(30px, 3vw, 39px);
          font-weight: 850;
          letter-spacing: -1.6px;
          line-height: 1.15;
        }

        .rn-directory-heading h2 > span {
          color: var(--rn-cyan);
        }

        .rn-directory-heading p {
          max-width: 610px;
          margin: 0;
          color: var(--rn-muted);
          font-size: 13px;
          line-height: 1.8;
        }

        .rn-directory-count {
          display: flex;
          flex-shrink: 0;
          flex-direction: column;
          align-items: flex-end;
          gap: 5px;
          padding-bottom: 4px;
        }

        .rn-directory-count strong {
          color: var(--rn-navy);
          font-size: 35px;
          font-weight: 850;
          letter-spacing: -1.5px;
          line-height: 1;
        }

        .rn-directory-count span {
          color: #8998aa;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1.3px;
        }

        .rn-search-panel {
          display: flex;
          align-items: center;
          gap: 18px;
          margin-bottom: 20px;
          border: 1px solid var(--rn-border);
          border-radius: 14px;
          padding: 12px 14px;
          background: #fff;
          box-shadow: 0 5px 17px rgba(11, 30, 58, 0.025);
        }

        .rn-search-input-wrap {
          display: flex;
          min-width: 0;
          flex: 1;
          align-items: center;
          gap: 12px;
        }

        .rn-search-icon {
          flex-shrink: 0;
          color: var(--rn-cyan);
          font-size: 28px;
          line-height: 1;
        }

        .rn-search-input-wrap input {
          width: 100%;
          min-width: 0;
          min-height: 40px;
          border: 0;
          outline: none;
          color: var(--rn-text);
          background: transparent;
          font: inherit;
          font-size: 12px;
        }

        .rn-search-input-wrap input::placeholder {
          color: #96a3b3;
        }

        .rn-clear-search {
          display: grid;
          width: 28px;
          height: 28px;
          flex-shrink: 0;
          place-items: center;
          border: 0;
          border-radius: 50%;
          color: #687b91;
          background: #eef2f6;
          font-size: 19px;
          cursor: pointer;
        }

        .rn-category-select-wrap {
          display: flex;
          min-width: 190px;
          flex-direction: column;
          gap: 4px;
          border-left: 1px solid #e8edf3;
          padding-left: 18px;
        }

        .rn-category-select-wrap label {
          color: #8a98a9;
          font-size: 8px;
          font-weight: 850;
          letter-spacing: 1.3px;
        }

        .rn-category-select-wrap select {
          width: 100%;
          min-height: 26px;
          border: 0;
          outline: none;
          color: #273c54;
          background: transparent;
          font: inherit;
          font-size: 12px;
          font-weight: 750;
          cursor: pointer;
        }

        .rn-active-filters {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin: 0 0 19px;
        }

        .rn-active-filters > span {
          margin-right: 3px;
          color: #8a98a9;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1px;
        }

        .rn-active-filters button {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          border: 1px solid #dbe8ef;
          border-radius: 7px;
          padding: 7px 9px;
          color: #2d536b;
          background: #eef9fc;
          font: inherit;
          font-size: 11px;
          cursor: pointer;
        }

        .rn-active-filters .rn-reset-filters {
          border-color: transparent;
          color: #667a90;
          background: transparent;
          text-decoration: underline;
          text-underline-offset: 3px;
        }

        .rn-community-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .rn-community-card {
          position: relative;
          display: flex;
          min-width: 0;
          min-height: 315px;
          flex-direction: column;
          border: 1px solid #e3eaf2;
          border-radius: 16px;
          padding: 22px;
          background: #fff;
          box-shadow: 0 5px 18px rgba(11, 30, 58, 0.025);
          animation: rn-card-enter 350ms ease both;
          transition:
            border-color 180ms ease,
            box-shadow 180ms ease,
            transform 180ms ease;
        }

        .rn-community-card:hover {
          z-index: 1;
          border-color: rgba(0, 180, 216, 0.42);
          box-shadow: 0 15px 34px rgba(11, 30, 58, 0.075);
          transform: translateY(-4px);
        }

        .rn-card-topline {
          display: flex;
          min-height: 47px;
          align-items: flex-start;
          justify-content: space-between;
          gap: 8px;
          margin-bottom: 20px;
        }

        .rn-category-mark {
          display: grid;
          width: 46px;
          height: 46px;
          flex-shrink: 0;
          place-items: center;
          border: 1px solid #d9f1f7;
          border-radius: 13px;
          color: #007f9b;
          background: #e9faff;
          font-size: 22px;
          font-weight: 800;
          transition:
            color 180ms ease,
            background 180ms ease,
            transform 180ms ease;
        }

        .rn-community-card:hover .rn-category-mark {
          color: #08223b;
          background: #bff3ff;
          transform: rotate(-5deg);
        }

        .rn-card-badges {
          display: flex;
          flex-wrap: wrap;
          justify-content: flex-end;
          gap: 5px;
        }

        .rn-status-badge {
          display: inline-flex;
          max-width: 100%;
          align-items: center;
          gap: 4px;
          border: 1px solid transparent;
          border-radius: 6px;
          padding: 5px 7px;
          font-size: 9px;
          font-weight: 800;
          line-height: 1.35;
        }

        .rn-badge-private {
          color: #59687a;
          border-color: #e3e8ef;
          background: #f2f5f8;
        }

        .rn-badge-owner {
          color: #795400;
          border-color: #f5df9f;
          background: #fff7df;
        }

        .rn-badge-member {
          color: #167449;
          border-color: #c5ebd5;
          background: #edfbf3;
        }

        .rn-badge-pending {
          color: #8c5c08;
          border-color: #f4e0b1;
          background: #fff8e8;
        }

        .rn-badge-removed {
          color: #68778a;
          border-color: #e3e8ef;
          background: #f4f6f8;
        }

        .rn-card-category {
          margin-bottom: 9px;
          color: #0793b0;
          font-size: 9px;
          font-weight: 850;
          letter-spacing: 1.35px;
          overflow-wrap: anywhere;
        }

        .rn-community-card h3 {
          margin: 0 0 11px;
          color: var(--rn-navy);
          font-size: 19px;
          font-weight: 850;
          letter-spacing: -0.45px;
          line-height: 1.35;
          overflow-wrap: anywhere;
        }

        .rn-card-description {
          display: -webkit-box;
          overflow: hidden;
          margin: 0;
          color: #6c7c8f;
          font-size: 12px;
          line-height: 1.85;
          overflow-wrap: anywhere;
          -webkit-box-orient: vertical;
          -webkit-line-clamp: 3;
        }

        .rn-card-location {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-top: 15px;
          color: #61768b;
          font-size: 11px;
          line-height: 1.6;
          overflow-wrap: anywhere;
        }

        .rn-card-location > span:first-child {
          flex-shrink: 0;
          color: var(--rn-cyan);
          font-size: 16px;
        }

        .rn-location-placeholder {
          color: #a0acba;
        }

        .rn-card-divider {
          height: 1px;
          margin-top: auto;
          margin-bottom: 15px;
          background: #edf1f5;
        }

        .rn-card-bottom {
          display: flex;
          min-height: 31px;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
        }

        .rn-view-community {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: var(--rn-navy);
          font-size: 11px;
          font-weight: 850;
          text-decoration: none;
          transition: color 150ms ease;
        }

        .rn-view-community span {
          color: var(--rn-cyan);
          font-size: 15px;
          transition: transform 150ms ease;
        }

        .rn-view-community:hover {
          color: #0088a5;
        }

        .rn-view-community:hover span {
          transform: translate(2px, -2px);
        }

        .rn-join-button {
          max-width: 57%;
          min-height: 33px;
          border: 1px solid #dce6ef;
          border-radius: 8px;
          padding: 7px 9px;
          color: #12344f;
          background: #f7fafc;
          font: inherit;
          font-size: 10px;
          font-weight: 800;
          cursor: pointer;
          transition:
            color 150ms ease,
            border-color 150ms ease,
            background 150ms ease;
        }

        .rn-join-button:hover:not(:disabled) {
          color: #fff;
          border-color: var(--rn-navy);
          background: var(--rn-navy);
        }

        .rn-card-action-note {
          color: #8392a4;
          font-size: 8px;
          font-weight: 850;
          letter-spacing: 0.9px;
          text-align: right;
        }

        .rn-loading-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 18px;
        }

        .rn-community-skeleton {
          min-height: 315px;
          border: 1px solid #e5ebf2;
          border-radius: 16px;
          padding: 23px;
          background: #fff;
        }

        .rn-skeleton-line {
          height: 11px;
          margin-bottom: 13px;
          border-radius: 5px;
          background: linear-gradient(
            90deg,
            #edf1f6 25%,
            #f7f9fb 50%,
            #edf1f6 75%
          );
          background-size: 200% 100%;
          animation: rn-skeleton-shimmer 1.5s ease infinite;
        }

        .rn-skeleton-short {
          width: 35%;
          height: 35px;
          margin-bottom: 25px;
        }

        .rn-skeleton-title {
          width: 78%;
          height: 18px;
          margin-bottom: 20px;
        }

        .rn-skeleton-medium {
          width: 65%;
        }

        .rn-skeleton-bottom {
          height: 35px;
          margin-top: 70px;
          border-top: 1px solid #edf1f5;
        }

        .rn-empty-state {
          display: flex;
          min-height: 310px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px dashed #d6e2ed;
          border-radius: 18px;
          padding: 35px 22px;
          background:
            radial-gradient(ellipse at 50% 0%, rgba(0, 180, 216, 0.055), transparent 55%),
            #fff;
          text-align: center;
        }

        .rn-empty-symbol {
          display: grid;
          width: 62px;
          height: 62px;
          place-items: center;
          margin-bottom: 19px;
          border: 1px solid #d8f1f7;
          border-radius: 19px;
          color: #0096b4;
          background: #edfbfe;
          font-size: 29px;
        }

        .rn-empty-state h3 {
          margin: 11px 0 8px;
          color: var(--rn-navy);
          font-size: 22px;
          font-weight: 850;
          letter-spacing: -0.5px;
        }

        .rn-empty-state p {
          max-width: 470px;
          margin: 0;
          color: var(--rn-muted);
          font-size: 13px;
          line-height: 1.8;
        }

        .rn-empty-actions {
          display: flex;
          flex-wrap: wrap;
          justify-content: center;
          gap: 10px;
          margin-top: 22px;
        }

        .rn-community-cta {
          position: relative;
          display: flex;
          min-height: 285px;
          align-items: center;
          justify-content: space-between;
          overflow: hidden;
          margin-top: 70px;
          border-radius: 20px;
          padding: 40px 48px;
          color: #fff;
          background:
            radial-gradient(ellipse at 85% 55%, rgba(0, 180, 216, 0.13), transparent 42%),
            linear-gradient(125deg, #0b1e3a, #102d4b);
        }

        .rn-cta-content {
          position: relative;
          z-index: 2;
          max-width: 640px;
        }

        .rn-cta-content .rn-section-kicker {
          color: #9eb5cd;
        }

        .rn-cta-content h2 {
          margin: 13px 0 12px;
          color: #fff;
          font-size: clamp(27px, 3vw, 36px);
          font-weight: 850;
          letter-spacing: -1.3px;
          line-height: 1.2;
        }

        .rn-cta-content h2 span {
          color: var(--rn-cyan);
        }

        .rn-cta-content p {
          max-width: 550px;
          margin: 0;
          color: #bdcddd;
          font-size: 13px;
          line-height: 1.8;
        }

        .rn-cta-content .rn-primary-button {
          margin-top: 23px;
        }

        .rn-cta-mark {
          position: relative;
          display: grid;
          width: 210px;
          height: 210px;
          flex-shrink: 0;
          place-items: center;
          margin-right: 35px;
          border: 1px solid rgba(0, 180, 216, 0.22);
          border-radius: 50%;
          color: var(--rn-gold);
          background: rgba(0, 180, 216, 0.035);
        }

        .rn-cta-mark > span {
          z-index: 2;
          font-size: 91px;
          font-weight: 900;
          letter-spacing: -10px;
        }

        .rn-cta-ring {
          position: absolute;
          inset: 17px;
          border: 1px solid rgba(0, 180, 216, 0.25);
          border-radius: 50%;
        }

        .rn-cta-ring-two {
          inset: -18px;
          border-style: dashed;
          border-color: rgba(255, 255, 255, 0.12);
        }

        .rn-cta-decoration {
          position: absolute;
          top: -45px;
          right: 220px;
          display: flex;
          gap: 9px;
          opacity: 0.1;
          transform: rotate(28deg);
        }

        .rn-cta-decoration span {
          width: 17px;
          height: 370px;
          border: 1px solid #fff;
          border-radius: 12px;
        }

        .rn-community-shortcuts {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 15px;
          margin-top: 25px;
        }

        .rn-shortcut-card {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 12px;
          border: 1px solid #e2e9f1;
          border-radius: 13px;
          padding: 17px;
          background: #fff;
          text-decoration: none;
          transition:
            border-color 160ms ease,
            box-shadow 160ms ease,
            transform 160ms ease;
        }

        .rn-shortcut-card:hover {
          border-color: rgba(0, 180, 216, 0.45);
          box-shadow: 0 9px 24px rgba(11, 30, 58, 0.055);
          transform: translateY(-3px);
        }

        .rn-shortcut-icon {
          display: grid;
          width: 41px;
          height: 41px;
          flex-shrink: 0;
          place-items: center;
          border-radius: 12px;
          color: #087d99;
          background: #e7faff;
          font-size: 21px;
        }

        .rn-shortcut-cyan {
          color: #087d99;
          background: #e7faff;
        }

        .rn-shortcut-gold {
          color: #8b6200;
          background: #fff4d4;
        }

        .rn-shortcut-card > span:nth-child(2) {
          display: flex;
          min-width: 0;
          flex: 1;
          flex-direction: column;
          gap: 5px;
        }

        .rn-shortcut-card strong {
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 850;
        }

        .rn-shortcut-card small {
          color: #7d8b9d;
          font-size: 10px;
          line-height: 1.6;
        }

        .rn-shortcut-arrow {
          flex-shrink: 0;
          color: #8a9caf;
          font-size: 17px;
          transition:
            color 150ms ease,
            transform 150ms ease;
        }

        .rn-shortcut-card:hover .rn-shortcut-arrow {
          color: var(--rn-cyan);
          transform: translate(2px, -2px);
        }

        .rn-community-footer {
          border-top: 1px solid #e5ebf2;
          background: #fff;
        }

        .rn-footer-inner {
          display: flex;
          width: min(1180px, calc(100% - 40px));
          min-height: 93px;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin: 0 auto;
        }

        .rn-footer-brand {
          display: inline-flex;
          align-items: center;
          gap: 11px;
          text-decoration: none;
        }

        .rn-footer-logo {
          display: grid;
          width: 37px;
          height: 37px;
          place-items: center;
          border-radius: 11px;
          color: var(--rn-gold);
          background: var(--rn-navy);
          font-size: 23px;
          font-weight: 900;
        }

        .rn-footer-brand > span:last-child {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .rn-footer-brand strong {
          color: var(--rn-navy);
          font-size: 10px;
          font-weight: 900;
          letter-spacing: 1px;
        }

        .rn-footer-brand small {
          color: #8a98a9;
          font-size: 8px;
          font-weight: 800;
          letter-spacing: 1.1px;
        }

        .rn-footer-copy {
          color: #8290a1;
          font-size: 11px;
        }

        .rn-footer-link {
          display: inline-flex;
          align-items: center;
          gap: 7px;
          color: #354c65;
          font-size: 11px;
          font-weight: 800;
          text-decoration: none;
        }

        .rn-footer-link span {
          color: var(--rn-cyan);
        }

        .rn-footer-link:hover {
          color: #0087a3;
        }

        .rn-visually-hidden {
          position: absolute;
          width: 1px;
          height: 1px;
          overflow: hidden;
          clip: rect(0, 0, 0, 0);
          white-space: nowrap;
          clip-path: inset(50%);
        }

        @keyframes rn-card-enter {
          from {
            opacity: 0;
            transform: translateY(9px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes rn-panel-enter {
          from {
            opacity: 0;
            transform: translateY(7px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes rn-skeleton-shimmer {
          from {
            background-position: 100% 0;
          }
          to {
            background-position: -100% 0;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-communities-page *,
          .rn-communities-page *::before,
          .rn-communities-page *::after {
            scroll-behavior: auto !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
            transition-duration: 0.01ms !important;
          }
        }

        @media (max-width: 1000px) {
          .rn-community-hero {
            grid-template-columns: 1.2fr 0.8fr;
            padding: 40px;
          }

          .rn-community-hero-art {
            width: 300px;
          }

          .rn-community-grid,
          .rn-loading-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }

          .rn-cta-mark {
            width: 165px;
            height: 165px;
            margin-right: 18px;
          }

          .rn-cta-mark > span {
            font-size: 73px;
          }
        }

        @media (max-width: 700px) {
          .rn-communities-shell {
            width: min(100% - 28px, 560px);
            padding-top: 18px;
            padding-bottom: 45px;
          }

          .rn-community-hero {
            grid-template-columns: minmax(0, 1fr);
            min-height: 0;
            border-radius: 19px;
            padding: 30px 23px 22px;
          }

          .rn-community-hero h1 {
            margin-top: 21px;
            font-size: clamp(33px, 8vw, 44px);
            letter-spacing: -1.7px;
          }

          .rn-community-hero-copy {
            font-size: 13px;
            line-height: 1.8;
          }

          .rn-community-hero-actions {
            align-items: stretch;
            gap: 9px;
          }

          .rn-community-hero-actions .rn-primary-button,
          .rn-community-hero-actions .rn-outline-button {
            min-height: 43px;
            padding: 11px 12px;
            font-size: 11px;
          }

          .rn-community-hero-footnote {
            gap: 7px;
            margin-top: 24px;
            font-size: 8px;
            letter-spacing: 0.8px;
          }

          .rn-community-hero-art {
            width: min(100%, 250px);
            margin: 12px auto 0;
          }

          .rn-orbit-center {
            width: 91px;
            height: 91px;
            border-radius: 23px;
          }

          .rn-center-symbol {
            font-size: 43px;
          }

          .rn-center-label {
            font-size: 7px;
          }

          .rn-orbit-node {
            width: 36px;
            height: 36px;
            border-radius: 11px;
            font-size: 17px;
          }

          .rn-floating-label {
            padding: 7px 8px;
            font-size: 7px;
          }

          .rn-community-stats {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            margin: 16px 0 49px;
          }

          .rn-stat-card {
            display: flex;
            min-height: 137px;
            flex-direction: column;
            gap: 10px;
            padding: 12px 10px;
            border-radius: 12px;
          }

          .rn-stat-icon {
            width: 31px;
            height: 31px;
            border-radius: 9px;
            font-size: 17px;
          }

          .rn-stat-label {
            margin-bottom: 4px;
            font-size: 7px;
            letter-spacing: 0.8px;
          }

          .rn-stat-card strong {
            font-size: 23px;
          }

          .rn-stat-card p {
            font-size: 9px;
            line-height: 1.5;
          }

          .rn-stat-decoration {
            right: 6px;
            bottom: 3px;
            font-size: 27px;
          }

          .rn-create-panel {
            margin-bottom: 48px;
            border-radius: 15px;
            padding: 21px 16px;
          }

          .rn-create-heading h2 {
            font-size: 24px;
          }

          .rn-create-heading p {
            font-size: 12px;
          }

          .rn-create-form {
            grid-template-columns: minmax(0, 1fr);
            gap: 17px;
          }

          .rn-field-full {
            grid-column: auto;
          }

          .rn-form-actions {
            grid-column: auto;
          }

          .rn-directory-heading {
            align-items: flex-start;
            gap: 12px;
          }

          .rn-directory-heading h2 {
            font-size: 31px;
          }

          .rn-directory-heading p {
            font-size: 12px;
          }

          .rn-directory-count {
            align-items: flex-end;
            padding-top: 6px;
          }

          .rn-directory-count strong {
            font-size: 28px;
          }

          .rn-directory-count span {
            max-width: 75px;
            font-size: 7px;
            line-height: 1.5;
            text-align: right;
          }

          .rn-search-panel {
            align-items: stretch;
            flex-direction: column;
            gap: 11px;
            padding: 11px 13px;
          }

          .rn-search-input-wrap {
            gap: 8px;
          }

          .rn-search-input-wrap input {
            font-size: 12px;
          }

          .rn-category-select-wrap {
            min-width: 0;
            border-top: 1px solid #edf1f5;
            border-left: 0;
            padding: 10px 0 2px;
          }

          .rn-category-select-wrap select {
            min-height: 30px;
          }

          .rn-community-grid,
          .rn-loading-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 12px;
          }

          .rn-community-card {
            min-height: 290px;
            padding: 19px;
          }

          .rn-community-card h3 {
            font-size: 19px;
          }

          .rn-card-description {
            font-size: 12px;
          }

          .rn-card-bottom {
            gap: 6px;
          }

          .rn-join-button {
            max-width: 60%;
          }

          .rn-community-cta {
            min-height: 0;
            margin-top: 49px;
            border-radius: 16px;
            padding: 28px 22px;
          }

          .rn-cta-content h2 {
            font-size: 29px;
          }

          .rn-cta-content p {
            font-size: 12px;
          }

          .rn-cta-mark {
            position: absolute;
            right: -55px;
            bottom: -55px;
            width: 145px;
            height: 145px;
            margin: 0;
            opacity: 0.18;
          }

          .rn-cta-mark > span {
            font-size: 68px;
          }

          .rn-community-shortcuts {
            grid-template-columns: minmax(0, 1fr);
            gap: 9px;
            margin-top: 16px;
          }

          .rn-shortcut-card {
            padding: 14px;
          }

          .rn-community-footer {
            padding: 18px 0;
          }

          .rn-footer-inner {
            width: calc(100% - 28px);
            min-height: 0;
            flex-wrap: wrap;
            gap: 15px;
          }

          .rn-footer-brand {
            flex: 1 1 100%;
          }

          .rn-footer-copy,
          .rn-footer-link {
            font-size: 10px;
          }
        }

        @media (max-width: 370px) {
          .rn-communities-shell {
            width: calc(100% - 20px);
          }

          .rn-community-hero {
            padding-right: 17px;
            padding-left: 17px;
          }

          .rn-community-hero h1 {
            font-size: 31px;
          }

          .rn-community-hero-actions {
            flex-direction: column;
          }

          .rn-community-hero-actions > * {
            width: 100%;
          }

          .rn-community-hero-footnote {
            font-size: 7px;
          }

          .rn-stat-card {
            padding: 10px 7px;
          }

          .rn-stat-card strong {
            font-size: 21px;
          }

          .rn-stat-card p {
            font-size: 8px;
          }

          .rn-directory-heading h2 {
            font-size: 27px;
          }

          .rn-directory-count strong {
            font-size: 24px;
          }

          .rn-card-bottom {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-join-button {
            max-width: 100%;
          }
        }
      `}</style>
    </div>
  );
}