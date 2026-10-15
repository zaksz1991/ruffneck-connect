"use client";

import Link from "next/link";
import {
  type FormEvent,
  useCallback,
  useEffect,
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

  const membershipByCommunity = new Map(
    memberships.map((membership) => [
      membership.community_id,
      membership,
    ])
  );

  const categories = Array.from(
    new Set(
      communities
        .map((community) => community.category?.trim())
        .filter((value): value is string => Boolean(value))
    )
  ).sort((a, b) => a.localeCompare(b));

  const filteredCommunities = communities.filter((community) => {
    const searchText = search.trim().toLowerCase();

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

  return (
    <>
      <main className="container page-section">
        <div className="page-heading">
          <p className="eyebrow">FIND YOUR PEOPLE</p>

          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "flex-start",
            }}
          >
            <div>
              <h1>Communities</h1>

              <p>
                Discover communities built around shared interests, needs,
                opportunities, and practical goals.
              </p>
            </div>

            <button
              type="button"
              onClick={() => {
                setShowForm((current) => !current);
                setError("");
                setNotice("");
              }}
            >
              {showForm ? "Cancel" : "＋ Create community"}
            </button>
          </div>
        </div>

        {error && (
          <div
            className="alert alert-error"
            role="alert"
            style={{ marginBottom: 18 }}
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            className="alert alert-success"
            role="status"
            style={{ marginBottom: 18 }}
          >
            {notice}
          </div>
        )}

        {showForm && (
          <section className="card" style={{ marginBottom: 30 }}>
            <p className="eyebrow">START SOMETHING USEFUL</p>
            <h2>Create a community</h2>

            <form onSubmit={handleCreateCommunity} className="stack">
              <div className="form-field">
                <label htmlFor="community-name">
                  Community name *
                </label>

                <input
                  id="community-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="e.g. Kano Technology Builders"
                  minLength={3}
                  maxLength={100}
                  required
                />
              </div>

              <div className="form-field">
                <label htmlFor="community-description">
                  Description
                </label>

                <textarea
                  id="community-description"
                  value={description}
                  onChange={(event) =>
                    setDescription(event.target.value)
                  }
                  placeholder="Explain the community's purpose and who it is for."
                  maxLength={1000}
                />
              </div>

              <div className="grid grid-2">
                <div className="form-field">
                  <label htmlFor="community-category">
                    Category
                  </label>

                  <input
                    id="community-category"
                    value={category}
                    onChange={(event) => setCategory(event.target.value)}
                    placeholder="e.g. Technology, Education"
                    maxLength={80}
                  />
                </div>

                <div className="form-field">
                  <label htmlFor="community-location">
                    Location
                  </label>

                  <input
                    id="community-location"
                    value={locationLabel}
                    onChange={(event) =>
                      setLocationLabel(event.target.value)
                    }
                    placeholder="e.g. Kano, Nigeria or Online"
                    maxLength={120}
                  />
                </div>
              </div>

              <div className="grid grid-2">
                <div className="form-field">
                  <label htmlFor="community-visibility">
                    Visibility
                  </label>

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

                  <span className="form-help">
                    Private communities are not listed in public discovery.
                  </span>
                </div>

                <div className="form-field">
                  <label htmlFor="community-approval">
                    Membership
                  </label>

                  <select
                    id="community-approval"
                    value={approvalRequired ? "approval" : "open"}
                    onChange={(event) =>
                      setApprovalRequired(
                        event.target.value === "approval"
                      )
                    }
                  >
                    <option value="approval">
                      Require owner approval
                    </option>
                    <option value="open">
                      Allow immediate joining
                    </option>
                  </select>
                </div>
              </div>

              <div className="row">
                <button type="submit" disabled={submitting}>
                  {submitting ? "Creating..." : "Create community"}
                </button>

                <button
                  type="button"
                  className="button-secondary"
                  onClick={() => setShowForm(false)}
                >
                  Cancel
                </button>
              </div>
            </form>
          </section>
        )}

        <section style={{ marginBottom: 28 }}>
          <div className="grid grid-2">
            <div className="form-field">
              <label htmlFor="community-search">
                Search communities
              </label>

              <input
                id="community-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search by name, topic, or location"
              />
            </div>

            <div className="form-field">
              <label htmlFor="category-filter">
                Filter by category
              </label>

              <select
                id="category-filter"
                value={categoryFilter}
                onChange={(event) =>
                  setCategoryFilter(event.target.value)
                }
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
        </section>

        {loading ? (
          <div className="empty-state">
            <p>Loading communities...</p>
          </div>
        ) : filteredCommunities.length === 0 ? (
          <div className="empty-state">
            <h2>No communities found.</h2>

            <p>
              Try another search or create a community for people with a shared
              goal.
            </p>

            <button
              type="button"
              onClick={() => setShowForm(true)}
            >
              Create a community
            </button>
          </div>
        ) : (
          <div className="grid grid-3">
            {filteredCommunities.map((community) => {
              const membership = membershipByCommunity.get(community.id);
              const isOwner = community.owner_id === currentUserId;

              return (
                <article
                  className="feature-card"
                  key={community.id}
                >
                  <div
                    className="row"
                    style={{
                      justifyContent: "space-between",
                      marginBottom: 14,
                    }}
                  >
                    <span className="badge">
                      {community.category || "Community"}
                    </span>

                    {community.visibility === "private" && (
                      <span className="badge badge-muted">
                        Private
                      </span>
                    )}
                  </div>

                  <h3>{community.name}</h3>

                  <p>
                    {community.description ||
                      "A community for people to connect and collaborate."}
                  </p>

                  {community.location_label && (
                    <p className="muted" style={{ fontSize: 13 }}>
                      {community.location_label}
                    </p>
                  )}

                  {isOwner ? (
                    <span className="badge badge-success">
                      Your community
                    </span>
                  ) : membership?.status === "active" ? (
                    <span className="badge badge-success">
                      Member
                    </span>
                  ) : membership?.status === "pending" ? (
                    <span className="badge badge-gold">
                      Request pending
                    </span>
                  ) : membership?.status === "removed" ? (
                    <span className="badge badge-muted">
                      Membership removed
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={
                        submitting ||
                        joiningId === community.id ||
                        community.visibility === "private"
                      }
                      onClick={() => void handleJoin(community)}
                    >
                      {joiningId === community.id
                        ? "Joining..."
                        : community.visibility === "private"
                          ? "Private community"
                          : community.join_approval_required
                            ? "Request to join"
                            : "Join community"}
                    </button>
                  )}

                  <p style={{ marginTop: 14 }}>
                    <Link
                      href={`/communities/${community.slug}`}
                      className="text-link"
                    >
                      View community →
                    </Link>
                  </p>
                </article>
              );
            })}
          </div>
        )}
      </main>

      <footer className="site-footer">
        <div
          className="container row"
          style={{ justifyContent: "space-between" }}
        >
          <span>
            © {new Date().getFullYear()} RuffNeck Connect
          </span>

          <Link href="/home" className="text-link">
            Back to home
          </Link>
        </div>
      </footer>
    </>
  );
}