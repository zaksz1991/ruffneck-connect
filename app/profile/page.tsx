import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

type Profile = {
  full_name: string | null;
  bio: string | null;
  avatar_url: string | null;
  phone: string | null;
  locale: string | null;
  role: string | null;
  show_in_directory: boolean;
};

type PageProps = {
  searchParams: Promise<{
    saved?: string;
    error?: string;
  }>;
};

function getValue(formData: FormData, key: string): string {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim() : "";
}

function isValidUrl(value: string): boolean {
  if (!value) return true;

  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

function getAvatarDisplayUrl(value: string | null): string {
  if (!value || !isValidUrl(value)) return "";

  try {
    const url = new URL(value);

    if (
      url.hostname === "drive.google.com" ||
      url.hostname === "www.drive.google.com"
    ) {
      const fileId =
        url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
        url.searchParams.get("id");

      if (!fileId) return "";

      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
        fileId
      )}&sz=w800`;
    }

    return url.toString();
  } catch {
    return "";
  }
}

function getInitials(name: string): string {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("") || "RN"
  );
}

const errorMessages: Record<string, string> = {
  name: "Enter your name using 2–100 characters.",
  bio: "Your introduction must not exceed 600 characters.",
  phone: "Your phone number must not exceed 30 characters.",
  locale: "Your preferred language must not exceed 80 characters.",
  avatar: "Enter a valid photo URL beginning with HTTP or HTTPS.",
  privacy: "Choose whether your profile should appear in the member directory.",
  save: "Your profile could not be saved. Please try again.",
};

export default async function ProfilePage({ searchParams }: PageProps) {
  const params = await searchParams;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login?next=/profile");
  }

  const [profileResult, membershipsResult, intentionsResult] =
    await Promise.all([
      supabase
        .from("profiles")
        .select(
          "full_name, bio, avatar_url, phone, locale, role, show_in_directory"
        )
        .eq("id", user.id)
        .maybeSingle(),

      supabase
        .from("community_members")
        .select("community_id", { count: "exact", head: true })
        .eq("user_id", user.id)
        .eq("status", "active"),

      supabase
        .from("intents")
        .select("id", { count: "exact", head: true })
        .eq("author_id", user.id),
    ]);

  if (profileResult.error) {
    console.error("Profile load failed:", profileResult.error.message);
  }

  const profile = (profileResult.data ?? null) as Profile | null;

  const authName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "";

  const fullName = profile?.full_name?.trim() || authName;
  const avatarUrl = getAvatarDisplayUrl(profile?.avatar_url ?? null);

  const completionItems = [
    Boolean(fullName),
    Boolean(profile?.bio),
    Boolean(profile?.avatar_url),
    Boolean(profile?.phone),
    Boolean(profile?.locale),
  ];

  const completion = Math.round(
    (completionItems.filter(Boolean).length / completionItems.length) * 100
  );

  async function saveProfile(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) redirect("/login?next=/profile");

    const full_name = getValue(formData, "full_name");
    const bio = getValue(formData, "bio");
    const avatar_url = getValue(formData, "avatar_url");
    const phone = getValue(formData, "phone");
    const locale = getValue(formData, "locale");
    const directoryValue = formData.get("show_in_directory");

    if (full_name.length < 2 || full_name.length > 100) {
      redirect("/profile?error=name");
    }

    if (bio.length > 600) redirect("/profile?error=bio");
    if (phone.length > 30) redirect("/profile?error=phone");
    if (locale.length > 80) redirect("/profile?error=locale");

    if (avatar_url.length > 1000 || !isValidUrl(avatar_url)) {
      redirect("/profile?error=avatar");
    }

    if (
      directoryValue !== "true" &&
      directoryValue !== "false"
    ) {
      redirect("/profile?error=privacy");
    }

    const show_in_directory = directoryValue === "true";

    const { error } = await supabase.from("profiles").upsert(
      {
        id: user.id,
        email: user.email ?? null,
        full_name,
        bio: bio || null,
        avatar_url: avatar_url || null,
        phone: phone || null,
        locale: locale || null,
        show_in_directory,
      },
      { onConflict: "id" }
    );

    if (error) {
      console.error("Profile save failed:", error.message);
      redirect("/profile?error=save");
    }

    const { error: metadataError } = await supabase.auth.updateUser({
      data: { full_name },
    });

    if (metadataError) {
      console.error(
        "Profile saved, but authentication metadata update failed:",
        metadataError.message
      );
    }

    revalidatePath("/profile");
    revalidatePath("/home");
    revalidatePath("/members");
    revalidatePath(`/members/${user.id}`);
    revalidatePath("/communities");
    revalidatePath("/intents");

    redirect("/profile?saved=1");
  }

  const showInDirectory = profile?.show_in_directory ?? true;

  return (
    <main className="profile-page">
      <div className="container profile-container">
        <header className="profile-page-heading">
          <p className="eyebrow">YOUR IDENTITY</p>
          <h1>My Profile</h1>
          <p>
            Introduce yourself to the RuffNeck Connect community and
            tell people how you can contribute.
          </p>
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
                alt={`${fullName || "Member"} profile photo`}
                width={96}
                height={96}
                unoptimized
                className="profile-avatar"
              />
            ) : (
              <div className="profile-avatar profile-avatar-fallback">
                {getInitials(fullName)}
              </div>
            )}

            <div className="profile-identity-copy">
              <h2>{fullName || "Complete your profile"}</h2>
              <p>{user.email}</p>

              {profile?.role && (
                <span className="profile-role">{profile.role}</span>
              )}
            </div>
          </div>

          <div className="profile-completion">
            <div className="profile-completion-heading">
              <span>Profile completion</span>
              <strong>{completion}%</strong>
            </div>

            <div
              className="profile-progress"
              role="progressbar"
              aria-label="Profile completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={completion}
            >
              <span style={{ width: `${completion}%` }} />
            </div>

            <p>
              A complete profile helps other members get to know you.
            </p>
          </div>
        </section>

        <section className="profile-stats">
          <article className="profile-stat">
            <span>Active communities</span>
            <strong>{membershipsResult.count ?? 0}</strong>
          </article>

          <article className="profile-stat">
            <span>Intentions published</span>
            <strong>{intentionsResult.count ?? 0}</strong>
          </article>

          <article className="profile-stat">
            <span>Member since</span>
            <strong>
              {new Intl.DateTimeFormat("en-NG", {
                month: "short",
                year: "numeric",
              }).format(new Date(user.created_at))}
            </strong>
          </article>
        </section>

        <section className="profile-editor">
          <div className="profile-editor-heading">
            <p className="eyebrow">PERSONAL DETAILS</p>
            <h2>Edit your profile</h2>
            <p>Keep your member information up to date.</p>
          </div>

          <form action={saveProfile} className="profile-form">
            <div className="form-field">
              <label htmlFor="full_name">Full name *</label>
              <input
                id="full_name"
                name="full_name"
                defaultValue={fullName}
                minLength={2}
                maxLength={100}
                autoComplete="name"
                required
              />
            </div>

            <div className="form-field">
              <label htmlFor="email">Email address</label>
              <input
                id="email"
                type="email"
                value={user.email ?? ""}
                readOnly
                disabled
              />
            </div>

            <div className="form-field">
              <label htmlFor="bio">About me</label>
              <textarea
                id="bio"
                name="bio"
                defaultValue={profile?.bio ?? ""}
                rows={5}
                maxLength={600}
                placeholder="Share your interests, skills, experience, or goals."
              />
            </div>

            <div className="grid grid-2">
              <div className="form-field">
                <label htmlFor="phone">Phone number</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  defaultValue={profile?.phone ?? ""}
                  maxLength={30}
                  autoComplete="tel"
                  placeholder="Optional"
                />
              </div>

              <div className="form-field">
                <label htmlFor="locale">Preferred language</label>
                <select
                  id="locale"
                  name="locale"
                  defaultValue={profile?.locale ?? ""}
                >
                  <option value="">Not specified</option>
                  <option value="en">English</option>
                  <option value="ha">Hausa</option>
                  <option value="yo">Yoruba</option>
                  <option value="ig">Igbo</option>
                </select>
              </div>
            </div>

            <div className="form-field">
              <label htmlFor="avatar_url">Profile photo URL</label>
              <input
                id="avatar_url"
                name="avatar_url"
                type="url"
                defaultValue={profile?.avatar_url ?? ""}
                maxLength={1000}
                placeholder="https://drive.google.com/file/d/..."
              />
              <span className="form-help">
                Google Drive photos must be shared with Anyone with the link
                — Viewer. Drive image URLs are not guaranteed to work
                permanently.
              </span>
            </div>

            <div
              className="form-field"
              style={{
                padding: 18,
                border: "1px solid var(--border, #d9e1ec)",
                borderRadius: 12,
              }}
            >
              <label
                htmlFor="show_in_directory"
                style={{
                  display: "block",
                  fontWeight: 700,
                  marginBottom: 8,
                }}
              >
                Member directory privacy
              </label>

              <p className="form-help" style={{ marginBottom: 14 }}>
                Choose whether other signed-in members can find your
                profile in the member directory.
              </p>

              <select
                id="show_in_directory"
                name="show_in_directory"
                defaultValue={String(showInDirectory)}
              >
                <option value="true">
                  Show my profile in the member directory
                </option>
                <option value="false">
                  Hide my profile from the member directory
                </option>
              </select>

              <span className="form-help">
                Hiding your profile should also prevent access through
                the public member-profile route once the directory RPC
                privacy filters are installed.
              </span>
            </div>

            <div className="profile-form-actions">
              <button type="submit" className="button">
                Save profile
              </button>

              <Link href="/home" className="button button-secondary">
                Back to home
              </Link>
            </div>
          </form>
        </section>

        <section className="profile-shortcuts">
          <h2>Keep building connections</h2>

          <div className="profile-shortcut-grid">
            <Link href="/communities" className="profile-shortcut">
              <span>
                <strong>Communities</strong>
                <small>Find people who share your goals.</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>

            <Link href="/intents" className="profile-shortcut">
              <span>
                <strong>Discover</strong>
                <small>Explore needs, offers, and projects.</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>

            <Link href="/messages" className="profile-shortcut">
              <span>
                <strong>Messages</strong>
                <small>Continue your conversations.</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>

            <Link href="/members" className="profile-shortcut">
              <span>
                <strong>Member directory</strong>
                <small>Discover other members.</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          </div>
        </section>
      </div>
    </main>
  );
}