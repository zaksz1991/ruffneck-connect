"use client";

import {
  FormEvent,
  Suspense,
  useEffect,
  useState,
} from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import NotificationBell from "@/components/NotificationBell";

type Community = {
  id: string;
  name: string;
};

type IntentType = "need" | "offer" | "build";

function NewIntentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabase = createClient();

  const requestedType = searchParams.get("type");

  const initialType: IntentType =
    requestedType === "offer" || requestedType === "build"
      ? requestedType
      : "need";

  const [intentType, setIntentType] = useState<IntentType>(initialType);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [communityId, setCommunityId] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [location, setLocation] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    async function loadCommunities() {
      try {
        const {
          data: { user },
          error: authError,
        } = await supabase.auth.getUser();

        if (authError || !user) {
          router.replace("/login?next=/intents/new");
          return;
        }

        const { data: memberships, error: membershipError } =
          await supabase
            .from("community_members")
            .select("community_id")
            .eq("user_id", user.id)
            .eq("status", "active");

        if (membershipError) {
          throw membershipError;
        }

        const ids = [
          ...new Set(
            (memberships ?? []).map((item) => item.community_id)
          ),
        ];

        if (ids.length === 0) {
          if (!cancelled) {
            setCommunities([]);
          }
          return;
        }

        const { data, error: communityError } = await supabase
          .from("communities")
          .select("id, name")
          .in("id", ids)
          .eq("status", "active")
          .order("name");

        if (communityError) {
          throw communityError;
        }

        if (!cancelled) {
          const available = (data ?? []) as Community[];

          setCommunities(available);

          if (available.length > 0) {
            setCommunityId(available[0].id);
          }
        }
      } catch {
        if (!cancelled) {
          setError(
            "Could not load your communities. Please try again."
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCommunities();

    return () => {
      cancelled = true;
    };
  }, [router, supabase]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const cleanTitle = title.trim();
    const cleanDescription = description.trim();
    const cleanCategory = category.trim();
    const cleanLocation = location.trim();

    if (!communityId) {
      setError("Select a community before publishing.");
      return;
    }

    if (cleanTitle.length < 5 || cleanTitle.length > 160) {
      setError("The title must contain between 5 and 160 characters.");
      return;
    }

    if (
      cleanDescription.length < 10 ||
      cleanDescription.length > 5000
    ) {
      setError(
        "The description must contain between 10 and 5,000 characters."
      );
      return;
    }

    if (cleanCategory.length > 80) {
      setError("The category cannot exceed 80 characters.");
      return;
    }

    if (cleanLocation.length > 120) {
      setError("The location cannot exceed 120 characters.");
      return;
    }

    setSubmitting(true);

    try {
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        router.replace("/login?next=/intents/new");
        return;
      }

      const { data, error: insertError } = await supabase
        .from("intents")
        .insert({
          community_id: communityId,
          author_id: user.id,
          intent_type: intentType,
          title: cleanTitle,
          description: cleanDescription,
          category: cleanCategory || null,
          location_label: cleanLocation || null,
          status: "open",
        })
        .select("id")
        .single();

      if (insertError) {
        throw insertError;
      }

      router.push(`/intents/${data.id}`);
      router.refresh();
    } catch {
      setError(
        "Your intention could not be published. Confirm that you are an active member of the selected community and try again."
      );
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="empty-state">
        <p>Loading your communities...</p>
      </div>
    );
  }

  if (communities.length === 0) {
    return (
      <div className="empty-state">
        <h2>Join a community first</h2>
        <p>
          You need active membership in a community before you can
          publish an intention.
        </p>

        <Link
          className="button button-primary"
          href="/communities"
        >
          Explore communities
        </Link>

        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }

  return (
    <form
      className="intent-form feature-card"
      onSubmit={handleSubmit}
    >
      <div className="form-group">
        <label htmlFor="intent-type">
          What do you want to do?
        </label>

        <select
          id="intent-type"
          value={intentType}
          onChange={(event) =>
            setIntentType(event.target.value as IntentType)
          }
          disabled={submitting}
        >
          <option value="need">
            Need — I need help, a resource, or a connection
          </option>
          <option value="offer">
            Offer — I can provide help, a skill, or a resource
          </option>
          <option value="build">
            Build — I want to collaborate on an idea or project
          </option>
        </select>

        <small>
          Choose the option that best describes your intention.
        </small>
      </div>

      <div className="form-group">
        <label htmlFor="community">Community</label>

        <select
          id="community"
          value={communityId}
          onChange={(event) => setCommunityId(event.target.value)}
          required
          disabled={submitting}
        >
          {communities.map((community) => (
            <option key={community.id} value={community.id}>
              {community.name}
            </option>
          ))}
        </select>
      </div>

      <div className="form-group">
        <label htmlFor="title">Title</label>

        <input
          id="title"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          minLength={5}
          maxLength={160}
          placeholder="Describe what you need, offer, or want to build"
          required
          disabled={submitting}
        />

        <small>{title.length}/160 characters</small>
      </div>

      <div className="form-group">
        <label htmlFor="description">Details</label>

        <textarea
          id="description"
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          minLength={10}
          maxLength={5000}
          rows={7}
          placeholder="Explain the situation, what is required, and what a useful outcome would look like."
          required
          disabled={submitting}
        />

        <small>{description.length}/5000 characters</small>
      </div>

      <div className="form-group">
        <label htmlFor="category">Category (optional)</label>

        <input
          id="category"
          value={category}
          onChange={(event) => setCategory(event.target.value)}
          maxLength={80}
          placeholder="e.g. Education, Technology, Business"
          disabled={submitting}
        />
      </div>

      <div className="form-group">
        <label htmlFor="location">Location (optional)</label>

        <input
          id="location"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          maxLength={120}
          placeholder="e.g. Kano, Nigeria or Remote"
          disabled={submitting}
        />
      </div>

      {error && (
        <p className="form-error" role="alert">
          {error}
        </p>
      )}

      <div className="hero-actions">
        <button
          className="button button-primary"
          type="submit"
          disabled={submitting}
        >
          {submitting ? "Publishing..." : "Publish intention"}
        </button>

        <Link
          className="button button-secondary"
          href="/intents"
          aria-disabled={submitting}
        >
          Cancel
        </Link>
      </div>
    </form>
  );
}

export default function NewIntentPage() {
  return (
    <>
      <header className="site-header">
        <div className="container site-header-inner">
          <Link href="/home" className="brand">
            <span className="brand-mark">RN</span>
            <span>RuffNeck Connect</span>
          </Link>

          <nav className="site-nav" aria-label="Main navigation">
            <Link href="/home">Home</Link>
            <Link href="/communities">Communities</Link>
            <Link href="/intents">Discover</Link>
            <Link href="/messages">Messages</Link>
            <NotificationBell />
          </nav>
        </div>
      </header>

      <main className="page-shell">
        <section className="section">
          <Link href="/intents" className="muted">
            ← Back to intentions
          </Link>

          <div className="section-heading">
            <div>
              <span className="eyebrow">NEED · OFFER · BUILD</span>
              <h1>Publish an intention</h1>
              <p className="muted">
                Be specific about what you need, what you can contribute,
                or what you want to build with others.
              </p>
            </div>
          </div>

          <Suspense
            fallback={
              <div className="empty-state">
                <p>Loading form...</p>
              </div>
            }
          >
            <NewIntentForm />
          </Suspense>
        </section>
      </main>
    </>
  );
}