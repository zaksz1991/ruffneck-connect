import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Profile = {
  full_name: string | null;
  bio: string | null;
  location_label: string | null;
  website: string | null;
  avatar_url: string | null;
  updated_at: string | null;
};

type PageProps = {
  searchParams: Promise<{
    saved?: string;
    error?: string;
  }>;
};

function getText(formData: FormData, name: string) {
  const value = formData.get(name);

  return typeof value === "string" ? value.trim() : "";
}

function isValidWebUrl(value: string) {
  if (!value) return true;

  try {
    const url = new URL(value);

    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);

  if (parts.length === 0) return "RN";

  return parts
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export default async function ProfilePage({
  searchParams,
}: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
  }

  const [
    profileResult,
    membershipResult,
    intentResult,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select(
        "full_name, bio, location_label, website, avatar_url, updated_at"
      )
      .eq("id", user.id)
      .maybeSingle(),

    supabase
      .from("community_members")
      .select("community_id", {
        count: "exact",
        head: true,
      })
      .eq("user_id", user.id)
      .eq("status", "active"),

    supabase
      .from("intents")
      .select("id", {
        count: "exact",
        head: true,
      })
      .eq("author_id", user.id),
  ]);

  if (profileResult.error) {
    console.error(
      "Failed to load profile:",
      profileResult.error.message
    );
  }

  const profile = (profileResult.data ?? null) as Profile | null;

  const fullName =
    profile?.full_name?.trim() ||
    (typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "") ||
    "";

  const avatarUrl =
    profile?.avatar_url &&
    isValidWebUrl(profile.avatar_url)
      ? profile.avatar_url
      : "";

  async function saveProfile(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      redirect("/login?next=/profile");
    }

    const fullName = getText(formData, "full_name");
    const bio = getText(formData, "bio");
    const locationLabel = getText(formData, "location_label");
    const website = getText(formData, "website");
    const avatarUrl = getText(formData, "avatar_url");

    if (fullName.length < 2 || fullName.length > 100) {
      redirect("/profile?error=name");
    }

    if (bio.length > 600) {
      redirect("/profile?error=bio");
    }

    if (locationLabel.length > 120) {
      redirect("/profile?error=location");
    }

    if (
      website.length > 300 ||
      avatarUrl.length > 1000 ||
      !isValidWebUrl(website) ||
      !isValidWebUrl(avatarUrl)
    ) {
      redirect("/profile?error=url");
    }

    const { error } = await supabase
      .from("profiles")
      .upsert(
        {
          id: user.id,
          full_name: fullName,
          bio: bio || null,
          location_label: locationLabel || null,
          website: website || null,
          avatar_url: avatarUrl || null,
          updated_at: new Date().toISOString(),
        },
        {
          onConflict: "id",
        }
      );

    if (error) {
      console.error("Failed to save profile:", error.message);
      redirect("/profile?error=save");
    }

    // Keep the existing authentication metadata in sync.
    const { error: metadataError } =
      await supabase.auth.updateUser({
        data: {
          full_name: fullName,
        },
      });

    if (metadataError) {
      console.error(
        "Profile saved, but auth metadata was not updated:",
        metadataError.message
      );
    }

    revalidatePath("/profile");
    revalidatePath("/home");
    revalidatePath("/communities");
    revalidatePath("/intents");

    redirect("/profile?saved=1");
  }

  const displayName = fullName || "Your name";

  const profileCompletion = [
    Boolean(fullName),
    Boolean(profile?.bio),
    Boolean(profile?.location_label),
    Boolean(profile?.avatar_url),
    Boolean(profile?.website),
  ].filter(Boolean).length;

  const completionPercentage = Math.round(
    (profileCompletion / 5) * 100
  );

  const errorMessages: Record<string, string> = {
    name: "Your name must contain between 2 and 100 characters.",
    bio: "Your biography must not exceed 600 characters.",
    location: "Your location must not exceed 120 characters.",
    url: "Enter valid website and photo URLs beginning with http:// or https://.",
    save: "Your profile could not be saved. Check your permissions and try again.",
  };

  return (
    <main className="profile-page">
      <div className="container profile-container">
        <header className="profile-page-heading">
          <div>
            <p className="eyebrow">YOUR IDENTITY</p>

            <h1>My profile</h1>

            <p>
              Introduce yourself to the RuffNeck Connect community.
              Share who you are, what interests you, and how people
              might connect with you.
            </p>
          </div>
        </header>

        {params.saved === "1" && (
          <div className="alert alert-success" role="status">
            Your profile has been saved successfully.
          </div>
        )}

        {params.error && (
          <div className="alert alert-error" role="alert">
            {errorMessages[params.error] ||
              "Something went wrong. Please try again."}
          </div>
        )}

        <section className="profile-overview">
          <div className="profile-identity">
            {avatarUrl ? (
              <Image
                src={avatarUrl}
                alt={`${displayName}'s profile photo`}
                width={100}
                height={100}
                unoptimized
                className="profile-avatar-image"
              />
            ) : (
              <div className="profile-avatar-fallback">
                {getInitials(displayName)}
              </div>
            )}

            <div className="profile-identity-copy">
              <h2>{displayName}</h2>

              <p className="profile-email">{user.email}</p>

              {profile?.location_label && (
                <p className="profile-location">
                  {profile.location_label}
                </p>
              )}

              {profile?.website && isValidWebUrl(profile.website) && (
                <a
                  className="text-link"
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Visit website ↗
                </a>
              )}
            </div>
          </div>

          <div className="profile-completion">
            <div className="profile-completion-heading">
              <span>Profile completion</span>
              <strong>{completionPercentage}%</strong>
            </div>

            <div
              className="profile-progress-track"
              role="progressbar"
              aria-label="Profile completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={completionPercentage}
            >
              <span
                style={{ width: `${completionPercentage}%` }}
              />
            </div>

            <p>
              Complete your details to help other members understand
              who you are.
            </p>
          </div>
        </section>

        <section className="profile-stat-grid">
          <article className="profile-stat">
            <span>Active communities</span>
            <strong>{membershipResult.count ?? 0}</strong>
          </article>

          <article className="profile-stat">
            <span>Intentions published</span>
            <strong>{intentResult.count ?? 0}</strong>
          </article>

          <article className="profile-stat">
            <span>Member since</span>
            <strong className="profile-member-since">
              {new Intl.DateTimeFormat("en-NG", {
                month: "short",
                year: "numeric",
              }).format(new Date(user.created_at))}
            </strong>
          </article>
        </section>

        <section className="profile-editor">
          <div className="profile-editor-heading">
            <div>
              <p className="eyebrow">PERSONAL DETAILS</p>
              <h2>Edit your profile</h2>

              <p>
                Keep your information current so other members can
                understand your interests and contributions.
              </p>
            </div>
          </div>

          <form action={saveProfile} className="profile-form">
            <div className="form-field">
              <label htmlFor="profile-full-name">
                Full name *
              </label>

              <input
                id="profile-full-name"
                name="full_name"
                defaultValue={fullName}
                minLength={2}
                maxLength={100}
                autoComplete="name"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="profile-email">
                Email address
              </label>

              <input
                id="profile-email"
                type="email"
                value={user.email ?? ""}
                readOnly
                disabled
              />

              <span className="form-help">
                Your account email is managed through authentication.
              </span>
            </div>

            <div className="form-field">
              <label htmlFor="profile-bio">
                About me
              </label>

              <textarea
                id="profile-bio"
                name="bio"
                defaultValue={profile?.bio ?? ""}
                maxLength={600}
                rows={5}
                placeholder="Describe your interests, experience, skills, or what you hope to accomplish."
              />
            </div>

            <div className="grid grid-2">
              <div className="form-field">
                <label htmlFor="profile-location">
                  Location
                </label>

                <input
                  id="profile-location"
                  name="location_label"
                  defaultValue={profile?.location_label ?? ""}
                  maxLength={120}
                  autoComplete="address-level2"
                  placeholder="e.g. Kano, Nigeria or Online"
                />
              </div>

              <div className="form-field">
                <label htmlFor="profile-website">
                  Website
                </label>

                <input
                  id="profile-website"
                  name="website"
                  type="url"
                  defaultValue={profile?.website ?? ""}
                  maxLength={300}
                  placeholder="https://example.com"
                />
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="profile-avatar">
                Profile photo URL
              </label>

              <input
                id="profile-avatar"
                name="avatar_url"
                type="url"
                defaultValue={profile?.avatar_url ?? ""}
                maxLength={1000}
                placeholder="https://example.com/photo.jpg"
              />

              <span className="form-help">
                Use a publicly accessible image URL. Leave blank
                to use your initials.
              </span>
            </div>

            <div className="profile-form-actions">
              <button type="submit" className="button">
                Save profile
              </button>

              <Link
                href="/home"
                className="button button-secondary"
              >
                Back to dashboard
              </Link>
            </div>
          </form>
        </section>

        <section className="profile-shortcuts">
          <h2>Continue building connections</h2>

          <div className="profile-shortcut-grid">
            <Link
              href="/communities"
              className="profile-shortcut"
            >
              <span>
                <strong>Communities</strong>
                <small>Find people who share your goals.</small>
              </span>

              <span aria-hidden="true">→</span>
            </Link>

            <Link
              href="/intents"
              className="profile-shortcut"
            >
              <span>
                <strong>Discover opportunities</strong>
                <small>Find needs, offers, and projects.</small>
              </span>

              <span aria-hidden="true">→</span>
            </Link>

            <Link
              href="/messages"
              className="profile-shortcut"
            >
              <span>
                <strong>Messages</strong>
                <small>Continue meaningful conversations.</small>
              </span>

              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}