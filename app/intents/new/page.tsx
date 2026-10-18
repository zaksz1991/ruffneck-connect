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

const INTENT_OPTIONS: {
  value: IntentType;
  label: string;
  title: string;
  description: string;
  icon: string;
}[] = [
  {
    value: "need",
    label: "Need",
    title: "I need support",
    description: "Find help, resources, expertise, or useful connections.",
    icon: "↗",
  },
  {
    value: "offer",
    label: "Offer",
    title: "I can contribute",
    description: "Share your skills, experience, services, or resources.",
    icon: "＋",
  },
  {
    value: "build",
    label: "Build",
    title: "Let's collaborate",
    description: "Find people to develop an idea, solution, or project.",
    icon: "⌘",
  },
];

function NewIntentForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [supabase] = useState(() => createClient());

  const requestedType = searchParams.get("type");

  const initialType: IntentType =
    requestedType === "offer" || requestedType === "build"
      ? requestedType
      : "need";

  const [intentType, setIntentType] =
    useState<IntentType>(initialType);
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

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
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
      setError(
        "The title must contain between 5 and 160 characters."
      );
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
      <div className="rn-intent-state" aria-live="polite">
        <span className="rn-intent-spinner" aria-hidden="true" />
        <h2>Preparing your workspace</h2>
        <p>Loading your active communities...</p>
      </div>
    );
  }

  if (communities.length === 0) {
    return (
      <div className="rn-intent-state">
        <div className="rn-intent-state-icon" aria-hidden="true">
          ◇
        </div>
        <span className="rn-intent-kicker">ONE MORE STEP</span>
        <h2>Join a community first</h2>
        <p>
          You need active membership in a community before you can
          publish an intention. Join a community to start connecting
          with people who share your interests.
        </p>

        {error && (
          <p className="rn-intent-error" role="alert">
            {error}
          </p>
        )}

        <Link
          className="rn-intent-primary-button"
          href="/communities"
        >
          Explore communities <span aria-hidden="true">→</span>
        </Link>

        <Link className="rn-intent-back-link" href="/intents">
          Return to Discover
        </Link>
      </div>
    );
  }

  return (
    <div className="rn-intent-workspace">
      <aside className="rn-intent-sidebar">
        <span className="rn-intent-kicker">YOUR CONTRIBUTION</span>
        <h2>Good things start with a clear intention.</h2>
        <p>
          Explain what you need, what you can contribute, or what
          you want to build. Give the community enough detail to
          understand how they can help.
        </p>

        <div className="rn-intent-guidance">
          <div className="rn-intent-guidance-item">
            <span className="rn-intent-guidance-number">01</span>
            <div>
              <strong>Be specific</strong>
              <p>Describe the challenge, opportunity, or idea.</p>
            </div>
          </div>

          <div className="rn-intent-guidance-item">
            <span className="rn-intent-guidance-number">02</span>
            <div>
              <strong>Choose your community</strong>
              <p>Publish where relevant members can discover it.</p>
            </div>
          </div>

          <div className="rn-intent-guidance-item">
            <span className="rn-intent-guidance-number">03</span>
            <div>
              <strong>Make collaboration possible</strong>
              <p>Explain what a useful outcome would look like.</p>
            </div>
          </div>
        </div>

        <div className="rn-intent-sidebar-footer">
          <span className="rn-intent-status-dot" />
          Built for meaningful connections
        </div>
      </aside>

      <form className="rn-intent-form" onSubmit={handleSubmit}>
        <div className="rn-intent-form-heading">
          <div>
            <span className="rn-intent-kicker">INTENTION DETAILS</span>
            <h2>Tell us what you have in mind</h2>
            <p>Complete the details below to publish your intention.</p>
          </div>

          <span className="rn-intent-required-note">
            * Required
          </span>
        </div>

        <fieldset className="rn-intent-type-fieldset">
          <legend>
            What do you want to do? <span>*</span>
          </legend>

          <div className="rn-intent-type-options">
            {INTENT_OPTIONS.map((option) => {
              const selected = intentType === option.value;

              return (
                <button
                  className={`rn-intent-type-option${
                    selected ? " is-selected" : ""
                  }`}
                  type="button"
                  key={option.value}
                  onClick={() => setIntentType(option.value)}
                  aria-pressed={selected}
                  disabled={submitting}
                >
                  <span className="rn-intent-type-top">
                    <span
                      className="rn-intent-type-icon"
                      aria-hidden="true"
                    >
                      {option.icon}
                    </span>
                    <span className="rn-intent-radio">
                      {selected && (
                        <span className="rn-intent-radio-inner" />
                      )}
                    </span>
                  </span>

                  <strong>{option.label}</strong>
                  <span className="rn-intent-type-title">
                    {option.title}
                  </span>
                  <span className="rn-intent-type-description">
                    {option.description}
                  </span>
                </button>
              );
            })}
          </div>
        </fieldset>

        <div className="rn-intent-field">
          <label htmlFor="community">
            Community <span>*</span>
          </label>
          <select
            id="community"
            value={communityId}
            onChange={(event) =>
              setCommunityId(event.target.value)
            }
            required
            disabled={submitting}
          >
            <option value="" disabled>
              Select a community
            </option>
            {communities.map((community) => (
              <option key={community.id} value={community.id}>
                {community.name}
              </option>
            ))}
          </select>
          <small>
            Choose an active community where your intention belongs.
          </small>
        </div>

        <div className="rn-intent-field">
          <div className="rn-intent-label-row">
            <label htmlFor="title">
              Intention title <span>*</span>
            </label>
            <span className="rn-intent-counter">
              {title.length}/160
            </span>
          </div>
          <input
            id="title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            minLength={5}
            maxLength={160}
            placeholder="e.g. Looking for a graphic designer for a community project"
            required
            disabled={submitting}
          />
          <small>
            Use a clear title that helps people understand your intention.
          </small>
        </div>

        <div className="rn-intent-field">
          <div className="rn-intent-label-row">
            <label htmlFor="description">
              Description <span>*</span>
            </label>
            <span className="rn-intent-counter">
              {description.length}/5000
            </span>
          </div>
          <textarea
            id="description"
            value={description}
            onChange={(event) =>
              setDescription(event.target.value)
            }
            minLength={10}
            maxLength={5000}
            rows={7}
            placeholder="Explain the situation, what is required, the skills or resources involved, and what a useful outcome would look like."
            required
            disabled={submitting}
          />
          <small>
            Include enough detail for community members to respond
            meaningfully.
          </small>
        </div>

        <div className="rn-intent-form-grid">
          <div className="rn-intent-field">
            <label htmlFor="category">
              Category <span className="rn-intent-optional">(Optional)</span>
            </label>
            <input
              id="category"
              value={category}
              onChange={(event) =>
                setCategory(event.target.value)
              }
              maxLength={80}
              placeholder="e.g. Education, Technology"
              disabled={submitting}
            />
            <small>Maximum 80 characters.</small>
          </div>

          <div className="rn-intent-field">
            <label htmlFor="location">
              Location <span className="rn-intent-optional">(Optional)</span>
            </label>
            <input
              id="location"
              value={location}
              onChange={(event) =>
                setLocation(event.target.value)
              }
              maxLength={120}
              placeholder="e.g. Kano, Nigeria or Remote"
              disabled={submitting}
            />
            <small>Indicate where collaboration can happen.</small>
          </div>
        </div>

        {error && (
          <div className="rn-intent-error" role="alert">
            <span aria-hidden="true">!</span>
            <p>{error}</p>
          </div>
        )}

        <div className="rn-intent-form-footer">
          <p>
            Your intention will be published as open so community
            members can discover it.
          </p>

          <div className="rn-intent-form-actions">
            <Link
              className="rn-intent-secondary-button"
              href="/intents"
              aria-disabled={submitting}
              tabIndex={submitting ? -1 : undefined}
              onClick={(event) => {
                if (submitting) event.preventDefault();
              }}
            >
              Cancel
            </Link>

            <button
              className="rn-intent-primary-button"
              type="submit"
              disabled={submitting}
            >
              {submitting ? (
                <>
                  <span
                    className="rn-intent-button-spinner"
                    aria-hidden="true"
                  />
                  Publishing...
                </>
              ) : (
                <>
                  Publish intention
                  <span aria-hidden="true">→</span>
                </>
              )}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}

export default function NewIntentPage() {
  return (
    <>
      <style>{`
        .rn-new-intent-page {
          --rn-navy: #0b1e3a;
          --rn-cyan: #00b4d8;
          --rn-gold: #fbbf24;
          --rn-muted: #68778d;
          --rn-border: #e3eaf2;
          min-height: 100vh;
          color: var(--rn-navy);
          background:
            radial-gradient(ellipse at 88% 5%, rgba(0,180,216,.075), transparent 31%),
            #f5f8fc;
        }

        .rn-new-intent-page *,
        .rn-new-intent-page *::before,
        .rn-new-intent-page *::after {
          box-sizing: border-box;
        }

        .rn-new-intent-page a {
          text-decoration: none;
        }

        .rn-new-intent-page .rn-topbar {
          position: relative;
          z-index: 5;
          background: rgba(255,255,255,.96);
          border-bottom: 1px solid var(--rn-border);
        }

        .rn-new-intent-page .rn-topbar-inner {
          width: min(1220px, calc(100% - 48px));
          min-height: 76px;
          margin: 0 auto;
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 24px;
        }

        .rn-new-intent-page .rn-brand {
          display: inline-flex;
          align-items: center;
          gap: 11px;
          color: var(--rn-navy);
          font-size: 16px;
          font-weight: 850;
          letter-spacing: -.4px;
          white-space: nowrap;
        }

        .rn-new-intent-page .rn-brand-mark {
          width: 42px;
          height: 42px;
          display: grid;
          place-items: center;
          border-radius: 13px;
          color: white;
          background: var(--rn-navy);
          border: 1px solid rgba(0,180,216,.45);
          box-shadow: 0 5px 14px rgba(11,30,58,.12);
          font-size: 13px;
          font-weight: 900;
          letter-spacing: -.5px;
        }

        .rn-new-intent-page .rn-nav {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 25px;
        }

        .rn-new-intent-page .rn-nav > a {
          color: #526178;
          font-size: 13px;
          font-weight: 700;
          transition: color .18s ease;
        }

        .rn-new-intent-page .rn-nav > a:hover,
        .rn-new-intent-page .rn-nav > a[aria-current="page"] {
          color: var(--rn-cyan);
        }

        .rn-new-intent-page .rn-notification-slot {
          display: flex;
          align-items: center;
        }

        .rn-new-intent-page .rn-main {
          width: min(1220px, calc(100% - 48px));
          margin: 0 auto;
          padding: 36px 0 72px;
        }

        .rn-new-intent-page .rn-breadcrumb {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          color: #6a7890;
          font-size: 13px;
          font-weight: 700;
          margin-bottom: 25px;
        }

        .rn-new-intent-page .rn-breadcrumb:hover {
          color: var(--rn-cyan);
        }

        .rn-new-intent-page .rn-breadcrumb-arrow {
          color: var(--rn-cyan);
          font-size: 17px;
        }

        .rn-new-intent-page .rn-page-heading {
          display: flex;
          align-items: flex-end;
          justify-content: space-between;
          gap: 24px;
          margin-bottom: 29px;
        }

        .rn-new-intent-page .rn-page-kicker,
        .rn-new-intent-page .rn-intent-kicker {
          display: block;
          color: #0788a7;
          font-size: 10px;
          font-weight: 850;
          letter-spacing: 1.65px;
          line-height: 1.6;
        }

        .rn-new-intent-page .rn-page-heading h1 {
          margin: 8px 0 9px;
          color: var(--rn-navy);
          font-size: clamp(29px, 4vw, 41px);
          font-weight: 850;
          letter-spacing: -1.5px;
          line-height: 1.13;
        }

        .rn-new-intent-page .rn-page-heading p {
          max-width: 660px;
          margin: 0;
          color: var(--rn-muted);
          font-size: 14px;
          line-height: 1.8;
        }

        .rn-new-intent-page .rn-heading-badge {
          display: inline-flex;
          align-items: center;
          gap: 9px;
          flex-shrink: 0;
          padding: 11px 14px;
          color: #526178;
          background: white;
          border: 1px solid var(--rn-border);
          border-radius: 12px;
          font-size: 11px;
          font-weight: 750;
        }

        .rn-new-intent-page .rn-heading-badge span {
          width: 7px;
          height: 7px;
          border-radius: 50%;
          background: #13b981;
          box-shadow: 0 0 0 4px rgba(19,185,129,.1);
        }

        .rn-new-intent-page .rn-intent-workspace {
          display: grid;
          grid-template-columns: minmax(250px, .76fr) minmax(0, 1.65fr);
          align-items: stretch;
          overflow: hidden;
          background: white;
          border: 1px solid #e4ebf3;
          border-radius: 22px;
          box-shadow: 0 18px 55px rgba(11,30,58,.055);
        }

        .rn-new-intent-page .rn-intent-sidebar {
          position: relative;
          display: flex;
          flex-direction: column;
          min-width: 0;
          padding: 35px 27px 25px;
          overflow: hidden;
          color: white;
          background:
            radial-gradient(circle at 95% 5%, rgba(0,180,216,.25), transparent 36%),
            linear-gradient(155deg, #102c50 0%, #0b1e3a 64%, #07172d 100%);
        }

        .rn-new-intent-page .rn-intent-sidebar::after {
          position: absolute;
          right: -100px;
          bottom: 50px;
          width: 230px;
          height: 230px;
          border: 1px solid rgba(0,180,216,.14);
          border-radius: 50%;
          content: "";
          pointer-events: none;
        }

        .rn-new-intent-page .rn-intent-sidebar .rn-intent-kicker {
          color: #62d8ed;
        }

        .rn-new-intent-page .rn-intent-sidebar > h2 {
          position: relative;
          z-index: 1;
          margin: 19px 0 13px;
          font-size: clamp(23px, 2.5vw, 29px);
          line-height: 1.27;
          letter-spacing: -.8px;
        }

        .rn-new-intent-page .rn-intent-sidebar > p {
          position: relative;
          z-index: 1;
          margin: 0;
          color: #c1d0e2;
          font-size: 13px;
          line-height: 1.85;
        }

        .rn-new-intent-page .rn-intent-guidance {
          position: relative;
          z-index: 1;
          display: grid;
          gap: 24px;
          margin-top: 35px;
        }

        .rn-new-intent-page .rn-intent-guidance-item {
          display: grid;
          grid-template-columns: 34px minmax(0, 1fr);
          gap: 12px;
          align-items: start;
        }

        .rn-new-intent-page .rn-intent-guidance-number {
          display: grid;
          place-items: center;
          width: 33px;
          height: 33px;
          color: #78e2f1;
          background: rgba(0,180,216,.12);
          border: 1px solid rgba(0,180,216,.3);
          border-radius: 10px;
          font-size: 11px;
          font-weight: 850;
        }

        .rn-new-intent-page .rn-intent-guidance-item strong {
          display: block;
          margin: 1px 0 5px;
          color: #fff;
          font-size: 12px;
          font-weight: 800;
        }

        .rn-new-intent-page .rn-intent-guidance-item p {
          margin: 0;
          color: #b6c6da;
          font-size: 11px;
          line-height: 1.75;
        }

        .rn-new-intent-page .rn-intent-sidebar-footer {
          position: relative;
          z-index: 1;
          display: flex;
          align-items: center;
          gap: 9px;
          margin-top: auto;
          padding-top: 32px;
          color: #b7c8dc;
          font-size: 10px;
          font-weight: 700;
        }

        .rn-new-intent-page .rn-intent-status-dot {
          width: 7px;
          height: 7px;
          flex-shrink: 0;
          border-radius: 50%;
          background: var(--rn-gold);
        }

        .rn-new-intent-page .rn-intent-form {
          min-width: 0;
          padding: 35px clamp(22px, 3.3vw, 43px) 28px;
        }

        .rn-new-intent-page .rn-intent-form-heading {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 18px;
          margin-bottom: 27px;
        }

        .rn-new-intent-page .rn-intent-form-heading h2 {
          margin: 8px 0 7px;
          color: var(--rn-navy);
          font-size: 23px;
          line-height: 1.3;
          letter-spacing: -.65px;
        }

        .rn-new-intent-page .rn-intent-form-heading p {
          margin: 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.7;
        }

        .rn-new-intent-page .rn-intent-required-note {
          padding-top: 5px;
          color: #7b8798;
          font-size: 10px;
          white-space: nowrap;
        }

        .rn-new-intent-page .rn-intent-type-fieldset {
          min-width: 0;
          margin: 0 0 26px;
          padding: 0;
          border: 0;
        }

        .rn-new-intent-page .rn-intent-type-fieldset legend {
          width: 100%;
          margin-bottom: 12px;
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 800;
        }

        .rn-new-intent-page .rn-intent-type-fieldset legend > span,
        .rn-new-intent-page .rn-intent-field label > span:not(.rn-intent-optional) {
          color: #0788a7;
        }

        .rn-new-intent-page .rn-intent-type-options {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
        }

        .rn-new-intent-page .rn-intent-type-option {
          display: flex;
          flex-direction: column;
          align-items: flex-start;
          min-width: 0;
          min-height: 154px;
          padding: 13px 12px 14px;
          color: var(--rn-navy);
          text-align: left;
          background: #fff;
          border: 1px solid #e1e8f0;
          border-radius: 13px;
          cursor: pointer;
          transition: border-color .18s ease, background .18s ease, box-shadow .18s ease, transform .18s ease;
        }

        .rn-new-intent-page .rn-intent-type-option:hover:not(:disabled) {
          border-color: #8ddcec;
          transform: translateY(-1px);
        }

        .rn-new-intent-page .rn-intent-type-option.is-selected {
          background: #f0fbfe;
          border-color: var(--rn-cyan);
          box-shadow: 0 0 0 1px rgba(0,180,216,.08);
        }

        .rn-new-intent-page .rn-intent-type-option:focus-visible {
          outline: 3px solid rgba(0,180,216,.28);
          outline-offset: 2px;
        }

        .rn-new-intent-page .rn-intent-type-top {
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 13px;
        }

        .rn-new-intent-page .rn-intent-type-icon {
          display: grid;
          place-items: center;
          width: 31px;
          height: 31px;
          color: #0788a7;
          background: #e9f9fc;
          border-radius: 9px;
          font-size: 19px;
          font-weight: 800;
        }

        .rn-new-intent-page .rn-intent-radio {
          display: grid;
          place-items: center;
          width: 15px;
          height: 15px;
          border: 1.5px solid #c6d2df;
          border-radius: 50%;
        }

        .rn-new-intent-page .rn-intent-type-option.is-selected .rn-intent-radio {
          border-color: #009cbb;
        }

        .rn-new-intent-page .rn-intent-radio-inner {
          width: 7px;
          height: 7px;
          background: #009cbb;
          border-radius: 50%;
        }

        .rn-new-intent-page .rn-intent-type-option > strong {
          margin-bottom: 4px;
          font-size: 13px;
          font-weight: 850;
        }

        .rn-new-intent-page .rn-intent-type-title {
          margin-bottom: 7px;
          color: #64748a;
          font-size: 10px;
          font-weight: 700;
        }

        .rn-new-intent-page .rn-intent-type-description {
          color: #738197;
          font-size: 10px;
          line-height: 1.65;
        }

        .rn-new-intent-page .rn-intent-field {
          min-width: 0;
          margin-bottom: 21px;
        }

        .rn-new-intent-page .rn-intent-field > label,
        .rn-new-intent-page .rn-intent-label-row > label {
          display: block;
          margin-bottom: 9px;
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 800;
        }

        .rn-new-intent-page .rn-intent-optional {
          margin-left: 4px;
          color: #8290a2 !important;
          font-size: 10px;
          font-weight: 600;
        }

        .rn-new-intent-page .rn-intent-label-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .rn-new-intent-page .rn-intent-counter {
          margin-bottom: 9px;
          color: #8a96a7;
          font-size: 10px;
          font-variant-numeric: tabular-nums;
        }

        .rn-new-intent-page .rn-intent-field input,
        .rn-new-intent-page .rn-intent-field select,
        .rn-new-intent-page .rn-intent-field textarea {
          display: block;
          width: 100%;
          min-width: 0;
          margin: 0;
          padding: 12px 14px;
          color: var(--rn-navy);
          background: #fff;
          border: 1px solid #dce5ef;
          border-radius: 10px;
          font: inherit;
          font-size: 12px;
          line-height: 1.6;
          outline: none;
          transition: border-color .18s ease, box-shadow .18s ease, background .18s ease;
        }

        .rn-new-intent-page .rn-intent-field input,
        .rn-new-intent-page .rn-intent-field select {
          min-height: 46px;
        }

        .rn-new-intent-page .rn-intent-field select {
          cursor: pointer;
        }

        .rn-new-intent-page .rn-intent-field textarea {
          min-height: 145px;
          resize: vertical;
        }

        .rn-new-intent-page .rn-intent-field input::placeholder,
        .rn-new-intent-page .rn-intent-field textarea::placeholder {
          color: #9aa6b6;
          opacity: 1;
        }

        .rn-new-intent-page .rn-intent-field input:focus,
        .rn-new-intent-page .rn-intent-field select:focus,
        .rn-new-intent-page .rn-intent-field textarea:focus {
          background: #fff;
          border-color: var(--rn-cyan);
          box-shadow: 0 0 0 3px rgba(0,180,216,.11);
        }

        .rn-new-intent-page .rn-intent-field input:disabled,
        .rn-new-intent-page .rn-intent-field select:disabled,
        .rn-new-intent-page .rn-intent-field textarea:disabled {
          cursor: not-allowed;
          background: #f4f7fa;
          opacity: .75;
        }

        .rn-new-intent-page .rn-intent-field > small {
          display: block;
          margin-top: 7px;
          color: #8290a2;
          font-size: 10px;
          line-height: 1.6;
        }

        .rn-new-intent-page .rn-intent-form-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .rn-new-intent-page .rn-intent-error {
          display: flex;
          align-items: flex-start;
          gap: 10px;
          margin: 4px 0 20px;
          padding: 13px 14px;
          color: #9d2e2e;
          background: #fff5f4;
          border: 1px solid #f4d5d1;
          border-radius: 10px;
          font-size: 12px;
          line-height: 1.65;
        }

        .rn-new-intent-page .rn-intent-error > span {
          display: grid;
          place-items: center;
          width: 19px;
          height: 19px;
          flex-shrink: 0;
          color: white;
          background: #c84b43;
          border-radius: 50%;
          font-size: 11px;
          font-weight: 900;
        }

        .rn-new-intent-page .rn-intent-error p {
          margin: 0;
        }

        .rn-new-intent-page .rn-intent-form-footer {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 18px;
          margin-top: 5px;
          padding-top: 22px;
          border-top: 1px solid #eaf0f5;
        }

        .rn-new-intent-page .rn-intent-form-footer > p {
          max-width: 260px;
          margin: 0;
          color: #7b899d;
          font-size: 10px;
          line-height: 1.7;
        }

        .rn-new-intent-page .rn-intent-form-actions {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 10px;
          flex-shrink: 0;
        }

        .rn-new-intent-page .rn-intent-primary-button,
        .rn-new-intent-page .rn-intent-secondary-button {
          display: inline-flex;
          min-height: 43px;
          align-items: center;
          justify-content: center;
          gap: 10px;
          padding: 11px 16px;
          border-radius: 10px;
          font-family: inherit;
          font-size: 11px;
          font-weight: 800;
          text-align: center;
          text-decoration: none;
          transition: transform .18s ease, background .18s ease, box-shadow .18s ease;
        }

        .rn-new-intent-page .rn-intent-primary-button {
          color: #fff;
          background: var(--rn-navy);
          border: 1px solid var(--rn-navy);
          box-shadow: 0 5px 12px rgba(11,30,58,.12);
          cursor: pointer;
        }

        .rn-new-intent-page .rn-intent-primary-button:hover:not(:disabled) {
          background: #12365c;
          box-shadow: 0 8px 18px rgba(11,30,58,.16);
          transform: translateY(-1px);
        }

        .rn-new-intent-page .rn-intent-primary-button > span[aria-hidden="true"] {
          color: #5ce1f3;
          font-size: 16px;
        }

        .rn-new-intent-page .rn-intent-primary-button:disabled {
          cursor: wait;
          opacity: .72;
        }

        .rn-new-intent-page .rn-intent-secondary-button {
          color: #526178;
          background: white;
          border: 1px solid #dce5ef;
        }

        .rn-new-intent-page .rn-intent-secondary-button:hover {
          background: #f6f9fc;
        }

        .rn-new-intent-page .rn-intent-secondary-button[aria-disabled="true"] {
          pointer-events: none;
          opacity: .6;
        }

        .rn-new-intent-page .rn-intent-button-spinner,
        .rn-new-intent-page .rn-intent-spinner {
          display: inline-block;
          width: 15px;
          height: 15px;
          border: 2px solid rgba(255,255,255,.35);
          border-top-color: white;
          border-radius: 50%;
          animation: rn-intent-spin .7s linear infinite;
        }

        .rn-new-intent-page .rn-intent-state {
          display: flex;
          min-height: 330px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 38px 24px;
          background: white;
          border: 1px solid var(--rn-border);
          border-radius: 20px;
          box-shadow: 0 15px 40px rgba(11,30,58,.04);
          text-align: center;
        }

        .rn-new-intent-page .rn-intent-state .rn-intent-spinner {
          width: 28px;
          height: 28px;
          margin-bottom: 20px;
          border-color: #d9edf2;
          border-top-color: var(--rn-cyan);
          border-width: 3px;
        }

        .rn-new-intent-page .rn-intent-state-icon {
          display: grid;
          place-items: center;
          width: 55px;
          height: 55px;
          margin-bottom: 20px;
          color: #0788a7;
          background: #e9f9fc;
          border-radius: 17px;
          font-size: 28px;
        }

        .rn-new-intent-page .rn-intent-state h2 {
          margin: 10px 0;
          font-size: 24px;
          letter-spacing: -.6px;
        }

        .rn-new-intent-page .rn-intent-state > p {
          max-width: 490px;
          margin: 0 0 22px;
          color: var(--rn-muted);
          font-size: 13px;
          line-height: 1.8;
        }

        .rn-new-intent-page .rn-intent-state > .rn-intent-error {
          text-align: left;
        }

        .rn-new-intent-page .rn-intent-back-link {
          margin-top: 17px;
          color: #64748a;
          font-size: 11px;
          font-weight: 750;
        }

        .rn-new-intent-page .rn-intent-back-link:hover {
          color: #0788a7;
        }

        @keyframes rn-intent-spin {
          to { transform: rotate(360deg); }
        }

        @media (max-width: 900px) {
          .rn-new-intent-page .rn-nav {
            gap: 15px;
          }

          .rn-new-intent-page .rn-intent-workspace {
            grid-template-columns: minmax(210px, .7fr) minmax(0, 1.5fr);
          }

          .rn-new-intent-page .rn-intent-sidebar {
            padding: 29px 21px 23px;
          }

          .rn-new-intent-page .rn-intent-form {
            padding: 29px 23px 24px;
          }

          .rn-new-intent-page .rn-intent-type-options {
            gap: 7px;
          }

          .rn-new-intent-page .rn-intent-type-option {
            padding: 11px 9px 12px;
          }

          .rn-new-intent-page .rn-intent-form-footer {
            align-items: flex-start;
            flex-direction: column;
          }

          .rn-new-intent-page .rn-intent-form-footer > p {
            max-width: none;
          }

          .rn-new-intent-page .rn-intent-form-actions {
            width: 100%;
          }
        }

        @media (max-width: 680px) {
          .rn-new-intent-page .rn-topbar-inner {
            width: calc(100% - 32px);
            min-height: 65px;
            gap: 12px;
          }

          .rn-new-intent-page .rn-brand {
            gap: 8px;
            font-size: 13px;
          }

          .rn-new-intent-page .rn-brand-mark {
            width: 36px;
            height: 36px;
            border-radius: 11px;
            font-size: 11px;
          }

          .rn-new-intent-page .rn-nav {
            gap: 13px;
          }

          .rn-new-intent-page .rn-nav > a {
            display: none;
          }

          .rn-new-intent-page .rn-main {
            width: calc(100% - 30px);
            padding: 25px 0 45px;
          }

          .rn-new-intent-page .rn-breadcrumb {
            margin-bottom: 21px;
          }

          .rn-new-intent-page .rn-page-heading {
            align-items: flex-start;
            flex-direction: column;
            gap: 15px;
            margin-bottom: 22px;
          }

          .rn-new-intent-page .rn-page-heading h1 {
            font-size: 32px;
            letter-spacing: -1.1px;
          }

          .rn-new-intent-page .rn-page-heading p {
            font-size: 13px;
          }

          .rn-new-intent-page .rn-intent-workspace {
            grid-template-columns: minmax(0, 1fr);
            border-radius: 17px;
          }

          .rn-new-intent-page .rn-intent-sidebar {
            padding: 25px 23px 21px;
          }

          .rn-new-intent-page .rn-intent-sidebar > h2 {
            max-width: 380px;
            margin-top: 12px;
            font-size: 25px;
          }

          .rn-new-intent-page .rn-intent-sidebar > p {
            max-width: 520px;
            font-size: 12px;
          }

          .rn-new-intent-page .rn-intent-guidance {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 12px;
            margin-top: 24px;
          }

          .rn-new-intent-page .rn-intent-guidance-item {
            grid-template-columns: minmax(0, 1fr);
            gap: 8px;
          }

          .rn-new-intent-page .rn-intent-guidance-item p {
            font-size: 10px;
          }

          .rn-new-intent-page .rn-intent-sidebar-footer {
            margin-top: 23px;
            padding-top: 17px;
            border-top: 1px solid rgba(255,255,255,.12);
          }

          .rn-new-intent-page .rn-intent-form {
            padding: 26px 20px 22px;
          }

          .rn-new-intent-page .rn-intent-form-heading {
            gap: 10px;
            margin-bottom: 23px;
          }

          .rn-new-intent-page .rn-intent-form-heading h2 {
            font-size: 21px;
          }

          .rn-new-intent-page .rn-intent-required-note {
            font-size: 9px;
          }

          .rn-new-intent-page .rn-intent-type-options {
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 7px;
          }

          .rn-new-intent-page .rn-intent-type-option {
            min-height: 150px;
            padding: 10px 8px;
            border-radius: 11px;
          }

          .rn-new-intent-page .rn-intent-type-icon {
            width: 28px;
            height: 28px;
          }

          .rn-new-intent-page .rn-intent-type-title {
            font-size: 9px;
            line-height: 1.5;
          }

          .rn-new-intent-page .rn-intent-type-description {
            font-size: 9px;
            line-height: 1.55;
          }

          .rn-new-intent-page .rn-intent-form-grid {
            gap: 12px;
          }
        }

        @media (max-width: 420px) {
          .rn-new-intent-page .rn-main {
            width: calc(100% - 22px);
          }

          .rn-new-intent-page .rn-page-heading h1 {
            font-size: 29px;
          }

          .rn-new-intent-page .rn-intent-sidebar {
            padding: 23px 18px 19px;
          }

          .rn-new-intent-page .rn-intent-guidance {
            gap: 9px;
          }

          .rn-new-intent-page .rn-intent-guidance-number {
            width: 29px;
            height: 29px;
          }

          .rn-new-intent-page .rn-intent-form {
            padding: 23px 14px 19px;
          }

          .rn-new-intent-page .rn-intent-form-heading h2 {
            font-size: 19px;
          }

          .rn-new-intent-page .rn-intent-required-note {
            white-space: normal;
            text-align: right;
          }

          .rn-new-intent-page .rn-intent-type-option {
            padding: 9px 6px;
          }

          .rn-new-intent-page .rn-intent-type-option > strong {
            font-size: 12px;
          }

          .rn-new-intent-page .rn-intent-form-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 0;
          }

          .rn-new-intent-page .rn-intent-form-actions {
            align-items: stretch;
          }

          .rn-new-intent-page .rn-intent-primary-button,
          .rn-new-intent-page .rn-intent-secondary-button {
            padding: 10px 12px;
            font-size: 10px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-new-intent-page *,
          .rn-new-intent-page *::before,
          .rn-new-intent-page *::after {
            animation-duration: .01ms !important;
            animation-iteration-count: 1 !important;
            scroll-behavior: auto !important;
            transition-duration: .01ms !important;
          }
        }
      `}</style>

      <div className="rn-new-intent-page">
        <header className="rn-topbar">
          <div className="rn-topbar-inner">
            <Link href="/home" className="rn-brand">
              <span className="rn-brand-mark">RN</span>
              <span>RuffNeck Connect</span>
            </Link>

            <nav className="rn-nav" aria-label="Main navigation">
              <Link href="/home">Home</Link>
              <Link href="/communities">Communities</Link>
              <Link href="/intents" aria-current="page">
                Discover
              </Link>
              <Link href="/messages">Messages</Link>
              <span className="rn-notification-slot">
                <NotificationBell />
              </span>
            </nav>
          </div>
        </header>

        <main className="rn-main">
          <Link href="/intents" className="rn-breadcrumb">
            <span className="rn-breadcrumb-arrow" aria-hidden="true">
              ←
            </span>
            Back to intentions
          </Link>

          <div className="rn-page-heading">
            <div>
              <span className="rn-page-kicker">
                NEED <span aria-hidden="true">·</span> OFFER{" "}
                <span aria-hidden="true">·</span> BUILD
              </span>
              <h1>Turn intention into action.</h1>
              <p>
                Share what you need, what you can offer, or what you
                want to build. Connect with people who can help make
                it happen.
              </p>
            </div>

            <div className="rn-heading-badge">
              <span aria-hidden="true" />
              Community-powered collaboration
            </div>
          </div>

          <Suspense
            fallback={
              <div className="rn-intent-state" aria-live="polite">
                <span className="rn-intent-spinner" aria-hidden="true" />
                <h2>Loading your workspace</h2>
                <p>Preparing the intention form...</p>
              </div>
            }
          >
            <NewIntentForm />
          </Suspense>
        </main>
      </div>
    </>
  );
}