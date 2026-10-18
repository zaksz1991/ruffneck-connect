import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import ProfilePreview from "@/components/ProfilePreview";

export const dynamic = "force-dynamic";

const AVATAR_BUCKET = "profile-avatars";
const MAX_AVATAR_SIZE = 5 * 1024 * 1024;

const ALLOWED_AVATAR_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

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
  photo_type: "Choose a JPG, PNG, WebP, or GIF image.",
  photo_size: "Your profile photo must not exceed 5 MB.",
  photo_upload:
    "Your photo could not be uploaded. Check the storage permissions and try again.",
  missing:
    "Your profile record could not be found. Please contact support.",
  save: "Your profile could not be saved. Please try again.",
  privacy: "Choose a valid member directory privacy setting.",
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
    console.error("Profile load failed:", {
      code: profileResult.error.code,
      message: profileResult.error.message,
      details: profileResult.error.details,
      hint: profileResult.error.hint,
    });
  }

  const profile = (profileResult.data ?? null) as Profile | null;

  const authName =
    typeof user.user_metadata?.full_name === "string"
      ? user.user_metadata.full_name
      : "";

  const fullName = profile?.full_name?.trim() || authName;
  const avatarUrl = getAvatarDisplayUrl(profile?.avatar_url ?? null);
  const showInDirectory = profile?.show_in_directory ?? true;

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

  const memberSince = new Intl.DateTimeFormat("en-NG", {
    month: "short",
    year: "numeric",
  }).format(new Date(user.created_at));

  async function saveProfile(formData: FormData) {
    "use server";

    const supabase = await createClient();

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError || !user) {
      redirect("/login?next=/profile");
    }

    const full_name = getValue(formData, "full_name");
    const bio = getValue(formData, "bio");
    const avatar_url = getValue(formData, "avatar_url");
    const phone = getValue(formData, "phone");
    const locale = getValue(formData, "locale");
    const directoryValue = formData.get("show_in_directory");
    const photoValue = formData.get("avatar_file");

    if (full_name.length < 2 || full_name.length > 100) {
      redirect("/profile?error=name");
    }

    if (bio.length > 600) {
      redirect("/profile?error=bio");
    }

    if (phone.length > 30) {
      redirect("/profile?error=phone");
    }

    if (locale.length > 80) {
      redirect("/profile?error=locale");
    }

    if (avatar_url.length > 1000 || !isValidUrl(avatar_url)) {
      redirect("/profile?error=avatar");
    }

    if (
      directoryValue !== "true" &&
      directoryValue !== "false"
    ) {
      redirect("/profile?error=privacy");
    }

    let avatarFile: File | null = null;

    if (photoValue instanceof File && photoValue.size > 0) {
      avatarFile = photoValue;

      if (!Object.hasOwn(ALLOWED_AVATAR_TYPES, avatarFile.type)) {
        redirect("/profile?error=photo_type");
      }

      if (avatarFile.size > MAX_AVATAR_SIZE) {
        redirect("/profile?error=photo_size");
      }
    }

    const show_in_directory = directoryValue === "true";

    const { data: existingProfile, error: lookupError } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", user.id)
      .maybeSingle();

    if (lookupError) {
      console.error("Profile lookup failed:", {
        code: lookupError.code,
        message: lookupError.message,
        details: lookupError.details,
        hint: lookupError.hint,
        userId: user.id,
      });

      redirect("/profile?error=save");
    }

    if (!existingProfile) {
      console.error("Profile save failed: no profile row exists for user", {
        userId: user.id,
        email: user.email,
      });

      redirect("/profile?error=missing");
    }

    let finalAvatarUrl: string | null = avatar_url || null;
    let uploadedAvatarPath: string | null = null;

    if (avatarFile) {
      const extension = ALLOWED_AVATAR_TYPES[avatarFile.type];
      const uniqueFilename = `${crypto.randomUUID()}.${extension}`;

      uploadedAvatarPath = `${user.id}/${uniqueFilename}`;

      const { error: uploadError } = await supabase.storage
        .from(AVATAR_BUCKET)
        .upload(uploadedAvatarPath, avatarFile, {
          contentType: avatarFile.type,
          cacheControl: "3600",
          upsert: false,
        });

      if (uploadError) {
        console.error("Profile photo upload failed:", {
          message: uploadError.message,
          name: uploadError.name,
          userId: user.id,
          path: uploadedAvatarPath,
        });

        redirect("/profile?error=photo_upload");
      }

      const { data: publicUrlData } = supabase.storage
        .from(AVATAR_BUCKET)
        .getPublicUrl(uploadedAvatarPath);

      finalAvatarUrl = publicUrlData.publicUrl;
    }

    const { data: updatedProfile, error: updateError } = await supabase
      .from("profiles")
      .update({
        email: user.email ?? null,
        full_name,
        bio: bio || null,
        avatar_url: finalAvatarUrl,
        phone: phone || null,
        locale: locale || "en",
        show_in_directory,
        updated_at: new Date().toISOString(),
      })
      .eq("id", user.id)
      .select("id")
      .maybeSingle();

    if (updateError || !updatedProfile) {
      console.error("Profile save failed:", {
        code: updateError?.code ?? "NO_ROW_UPDATED",
        message:
          updateError?.message ??
          "The update did not return a profile row. Check RLS policies and user ID.",
        details: updateError?.details ?? null,
        hint: updateError?.hint ?? null,
        userId: user.id,
      });

      if (uploadedAvatarPath) {
        const { error: cleanupError } = await supabase.storage
          .from(AVATAR_BUCKET)
          .remove([uploadedAvatarPath]);

        if (cleanupError) {
          console.error("Could not remove unused profile photo:", {
            message: cleanupError.message,
            path: uploadedAvatarPath,
          });
        }
      }

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

  return (
    <main className="rn-profile-page">
      <div className="rn-profile-shell">
        <header className="rn-profile-hero">
          <div className="rn-profile-hero-content">
            <div className="rn-profile-breadcrumb">
              <Link href="/home">Home</Link>
              <span aria-hidden="true">/</span>
              <span>My profile</span>
            </div>

            <span className="rn-profile-eyebrow">
              RUFFNECK CONNECT / YOUR IDENTITY
            </span>

            <h1>Your profile.<br />Your opportunities.</h1>

            <p>
              Tell the community who you are, what you care about, and
              what you can contribute. A clear profile makes meaningful
              connections easier.
            </p>

            <div className="rn-profile-hero-actions">
              <a href="#edit-profile" className="rn-profile-primary-link">
                Edit profile <span aria-hidden="true">↓</span>
              </a>

              <Link href="/members" className="rn-profile-text-link">
                Explore members <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>

          <div className="rn-profile-hero-art" aria-hidden="true">
            <div className="rn-profile-orbit rn-profile-orbit-one" />
            <div className="rn-profile-orbit rn-profile-orbit-two" />
            <div className="rn-profile-orbit rn-profile-orbit-three" />

            <div className="rn-profile-art-center">
              <span>RN</span>
              <small>CONNECT</small>
            </div>

            <div className="rn-profile-art-node rn-profile-node-one">01</div>
            <div className="rn-profile-art-node rn-profile-node-two">02</div>
            <div className="rn-profile-art-node rn-profile-node-three">03</div>
          </div>

          <div className="rn-profile-hero-footer">
            <span>PEOPLE</span>
            <span className="rn-profile-footer-line" />
            <span>PURPOSE</span>
            <span className="rn-profile-footer-line" />
            <span>POSSIBILITY</span>
          </div>
        </header>

        {params.saved === "1" && (
          <div className="rn-profile-alert rn-profile-alert-success" role="status">
            <span className="rn-profile-alert-icon" aria-hidden="true">✓</span>
            <div>
              <strong>Profile updated</strong>
              <p>Your profile changes have been saved successfully.</p>
            </div>
          </div>
        )}

        {params.error && (
          <div className="rn-profile-alert rn-profile-alert-error" role="alert">
            <span className="rn-profile-alert-icon" aria-hidden="true">!</span>
            <div>
              <strong>We could not complete that action</strong>
              <p>
                {errorMessages[params.error] ??
                  "Something went wrong. Please try again."}
              </p>
            </div>
          </div>
        )}

        <section className="rn-profile-overview">
          <div className="rn-profile-identity-card">
            <div className="rn-profile-avatar-wrap">
              {avatarUrl ? (
                <Image
                  src={avatarUrl}
                  alt={`${fullName || "Member"} profile photo`}
                  width={104}
                  height={104}
                  unoptimized
                  className="rn-profile-avatar"
                />
              ) : (
                <div className="rn-profile-avatar rn-profile-avatar-fallback">
                  {getInitials(fullName)}
                </div>
              )}

              <span
                className="rn-profile-avatar-status"
                title="Signed in"
                aria-label="Signed in"
              />
            </div>

            <div className="rn-profile-identity-copy">
              <span className="rn-profile-section-label">YOUR MEMBER IDENTITY</span>
              <h2>{fullName || "Complete your profile"}</h2>
              <p className="rn-profile-email">{user.email}</p>

              <div className="rn-profile-identity-tags">
                {profile?.role && (
                  <span className="rn-profile-role">
                    {profile.role.replace(/[_-]/g, " ")}
                  </span>
                )}
                <span className="rn-profile-member-since">
                  Member since {memberSince}
                </span>
              </div>
            </div>

            <a href="#edit-profile" className="rn-profile-outline-link">
              Edit details <span aria-hidden="true">↗</span>
            </a>
          </div>

          <div className="rn-profile-completion-card">
            <div className="rn-profile-completion-top">
              <div>
                <span className="rn-profile-section-label">PROFILE STRENGTH</span>
                <h2>Make your profile count.</h2>
              </div>
              <strong className="rn-profile-completion-number">
                {completion}<span>%</span>
              </strong>
            </div>

            <div
              className="rn-profile-progress"
              role="progressbar"
              aria-label="Profile completion"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={completion}
            >
              <span style={{ width: `${completion}%` }} />
            </div>

            <p>
              {completion === 100
                ? "Your core profile details are complete. Keep them up to date."
                : "Complete your key details to help other members understand your experience and interests."}
            </p>

            <div className="rn-profile-checklist">
              {[
                { label: "Full name", done: Boolean(fullName) },
                { label: "Introduction", done: Boolean(profile?.bio) },
                { label: "Profile photo", done: Boolean(profile?.avatar_url) },
                { label: "Phone number", done: Boolean(profile?.phone) },
                { label: "Preferred language", done: Boolean(profile?.locale) },
              ].map((item) => (
                <div className="rn-profile-check-item" key={item.label}>
                  <span className={item.done ? "is-complete" : ""}>
                    {item.done ? "✓" : "·"}
                  </span>
                  {item.label}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="rn-profile-stat-grid" aria-label="Your activity">
          <article className="rn-profile-stat-card">
            <div className="rn-profile-stat-icon rn-stat-cyan" aria-hidden="true">
              ◈
            </div>
            <div>
              <span>Active communities</span>
              <strong>{membershipsResult.count ?? 0}</strong>
              <small>Groups you belong to</small>
            </div>
          </article>

          <article className="rn-profile-stat-card">
            <div className="rn-profile-stat-icon rn-stat-gold" aria-hidden="true">
              ↗
            </div>
            <div>
              <span>Intentions published</span>
              <strong>{intentionsResult.count ?? 0}</strong>
              <small>Needs, offers, and projects</small>
            </div>
          </article>

          <article className="rn-profile-stat-card">
            <div className="rn-profile-stat-icon rn-stat-navy" aria-hidden="true">
              ✳
            </div>
            <div>
              <span>Community membership</span>
              <strong>{memberSince}</strong>
              <small>Your RuffNeck journey</small>
            </div>
          </article>
        </section>

        <div className="rn-profile-main-grid">
          <section className="rn-profile-editor" id="edit-profile">
            <div className="rn-profile-editor-heading">
              <div className="rn-profile-heading-mark">01</div>
              <div>
                <span className="rn-profile-section-label">PERSONAL DETAILS</span>
                <h2>Edit your profile</h2>
                <p>
                  Keep your information accurate so people can connect
                  with you for the right reasons.
                </p>
              </div>
            </div>

            <form
              action={saveProfile}
              className="rn-profile-form"
              encType="multipart/form-data"
            >
              <div className="rn-profile-form-section">
                <h3>Basic information</h3>
                <p>Your name and introduction help people recognise you.</p>

                <div className="rn-profile-field">
                  <label htmlFor="full_name">
                    Full name <span>*</span>
                  </label>
                  <input
                    id="full_name"
                    name="full_name"
                    defaultValue={fullName}
                    minLength={2}
                    maxLength={100}
                    autoComplete="name"
                    placeholder="Enter your full name"
                    required
                  />
                  <small>Use the name you want other members to recognise.</small>
                </div>

                <div className="rn-profile-field">
                  <label htmlFor="email">Email address</label>
                  <input
                    id="email"
                    type="email"
                    value={user.email ?? ""}
                    readOnly
                    disabled
                  />
                  <small>Your account email cannot be changed here.</small>
                </div>

                <div className="rn-profile-field">
                  <label htmlFor="bio">About me</label>
                  <textarea
                    id="bio"
                    name="bio"
                    defaultValue={profile?.bio ?? ""}
                    rows={5}
                    maxLength={600}
                    placeholder="Share your interests, skills, experience, or goals."
                  />
                  <div className="rn-profile-field-footer">
                    <small>Write a clear introduction that reflects what you do.</small>
                    <small>600 characters max.</small>
                  </div>
                </div>
              </div>

              <div className="rn-profile-form-section">
                <h3>Contact and language</h3>
                <p>Help members understand how to communicate with you.</p>

                <div className="rn-profile-form-row">
                  <div className="rn-profile-field">
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

                  <div className="rn-profile-field">
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
              </div>

              <div className="rn-profile-form-section">
                <h3>Profile photo</h3>
                <p>
                  Use a clear photo to make your profile easier to recognise.
                </p>

                <div className="rn-profile-field">
                  <label htmlFor="avatar_file">Upload a photo</label>
                  <input
                    id="avatar_file"
                    name="avatar_file"
                    type="file"
                    accept="image/jpeg,image/png,image/webp,image/gif"
                  />
                  <small>
                    JPG, PNG, WebP, or GIF. Maximum file size: 5 MB.
                    A newly uploaded photo takes priority over the photo URL.
                  </small>
                </div>

                <div className="rn-profile-field">
                  <label htmlFor="avatar_url">Or use a photo URL</label>
                  <input
                    id="avatar_url"
                    name="avatar_url"
                    type="url"
                    defaultValue={profile?.avatar_url ?? ""}
                    maxLength={1000}
                    placeholder="https://example.com/photo.jpg"
                  />
                  <small>
                    Enter a publicly accessible HTTP or HTTPS image URL.
                    If uploading a new photo, you can leave this field unchanged.
                  </small>
                </div>
              </div>

              <div className="rn-profile-privacy-box">
                <div className="rn-profile-privacy-icon" aria-hidden="true">
                  ◉
                </div>
                <div className="rn-profile-privacy-content">
                  <h3>Member directory privacy</h3>
                  <p>
                    Control whether your profile appears in the member
                    directory for other signed-in members.
                  </p>

                  <label
                    className="rn-profile-field-label"
                    htmlFor="show_in_directory"
                  >
                    Directory visibility
                  </label>
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
                </div>
              </div>

              <div className="rn-profile-form-actions">
                <button type="submit" className="rn-profile-save-button">
                  Save profile <span aria-hidden="true">→</span>
                </button>

                <Link href="/home" className="rn-profile-cancel-button">
                  Back to home
                </Link>
              </div>

              <p className="rn-profile-form-note">
                Your profile settings are saved to your RuffNeck Connect account.
              </p>
            </form>
          </section>

          <aside className="rn-profile-sidebar">
            <div className="rn-profile-sidebar-card rn-profile-sidebar-dark">
              <span className="rn-profile-section-label">YOUR NEXT STEP</span>
              <div className="rn-profile-sidebar-symbol" aria-hidden="true">
                ↗
              </div>
              <h2>Turn your profile into connections.</h2>
              <p>
                Find people with shared interests, join communities,
                and discover opportunities to collaborate.
              </p>
              <Link href="/members" className="rn-profile-sidebar-button">
                Find members <span aria-hidden="true">→</span>
              </Link>
            </div>

            <div className="rn-profile-sidebar-card rn-profile-sidebar-light">
              <span className="rn-profile-section-label">YOUR PRIVACY</span>
              <h3>You control your visibility.</h3>
              <p>
                Your directory setting determines whether your profile
                appears in the member directory. Review it whenever
                your preferences change.
              </p>
              <a href="#edit-profile" className="rn-profile-sidebar-link">
                Review privacy settings →
              </a>
            </div>
          </aside>
        </div>

        <section className="rn-profile-preview-section">
          <div className="rn-profile-section-intro">
            <span className="rn-profile-section-label">HOW OTHERS SEE YOU</span>
            <h2>Profile preview</h2>
            <p>
              Review your public-facing profile information before
              connecting with other members.
            </p>
          </div>

          <ProfilePreview
            initialName={fullName}
            initialBio={profile?.bio ?? ""}
            initialAvatarUrl={profile?.avatar_url ?? ""}
            initialLocale={profile?.locale ?? ""}
            showInDirectory={showInDirectory}
          />
        </section>

        <section className="rn-profile-discovery">
          <div className="rn-profile-discovery-heading">
            <div>
              <span className="rn-profile-section-label">KEEP BUILDING</span>
              <h2>Make your next connection.</h2>
              <p>
                Your profile is the starting point. Explore the rest of
                RuffNeck Connect to turn shared interests into action.
              </p>
            </div>

            <span className="rn-profile-discovery-mark" aria-hidden="true">
              RN<span>.</span>
            </span>
          </div>

          <div className="rn-profile-shortcut-grid">
            <Link href="/communities" className="rn-profile-shortcut">
              <span className="rn-profile-shortcut-icon" aria-hidden="true">
                ◈
              </span>
              <span className="rn-profile-shortcut-copy">
                <strong>Communities</strong>
                <small>Find people who share your goals.</small>
              </span>
              <span className="rn-profile-shortcut-arrow" aria-hidden="true">↗</span>
            </Link>

            <Link href="/intents" className="rn-profile-shortcut">
              <span className="rn-profile-shortcut-icon" aria-hidden="true">
                ↗
              </span>
              <span className="rn-profile-shortcut-copy">
                <strong>Discover intentions</strong>
                <small>Explore needs, offers, and projects.</small>
              </span>
              <span className="rn-profile-shortcut-arrow" aria-hidden="true">↗</span>
            </Link>

            <Link href="/messages" className="rn-profile-shortcut">
              <span className="rn-profile-shortcut-icon" aria-hidden="true">
                ▤
              </span>
              <span className="rn-profile-shortcut-copy">
                <strong>Messages</strong>
                <small>Continue your conversations.</small>
              </span>
              <span className="rn-profile-shortcut-arrow" aria-hidden="true">↗</span>
            </Link>

            <Link href="/members" className="rn-profile-shortcut">
              <span className="rn-profile-shortcut-icon" aria-hidden="true">
                ◎
              </span>
              <span className="rn-profile-shortcut-copy">
                <strong>Member directory</strong>
                <small>Discover people across the community.</small>
              </span>
              <span className="rn-profile-shortcut-arrow" aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>

        <footer className="rn-profile-footer">
          <span>RUFFNECK CONNECT</span>
          <span>People. Purpose. Possibility.</span>
          <Link href="/home">Back to home ↑</Link>
        </footer>
      </div>

      <style jsx global>{`
        .rn-profile-page {
          --rn-navy: #0b1e3a;
          --rn-navy-soft: #132d50;
          --rn-cyan: #00b4d8;
          --rn-gold: #fbbf24;
          --rn-ink: #17243a;
          --rn-muted: #718096;
          --rn-border: #e2e8f0;
          --rn-surface: #ffffff;
          --rn-background: #f5f8fc;
          min-height: 100vh;
          padding: 30px 22px 60px;
          background: var(--rn-background);
          color: var(--rn-ink);
          font-family: inherit;
        }

        .rn-profile-page *,
        .rn-profile-page *::before,
        .rn-profile-page *::after {
          box-sizing: border-box;
        }

        .rn-profile-shell {
          width: 100%;
          max-width: 1180px;
          margin: 0 auto;
        }

        .rn-profile-page a {
          text-decoration: none;
        }

        .rn-profile-hero {
          position: relative;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          min-height: 330px;
          overflow: hidden;
          padding: 30px 42px 0;
          border-radius: 24px;
          background:
            radial-gradient(
              circle at 80% 20%,
              rgba(0, 180, 216, 0.18),
              transparent 30%
            ),
            linear-gradient(120deg, #09172d 0%, #0b1e3a 58%, #123558 100%);
          color: #fff;
          isolation: isolate;
        }

        .rn-profile-hero-content {
          position: relative;
          z-index: 2;
          width: min(650px, 68%);
          padding-bottom: 30px;
        }

        .rn-profile-breadcrumb {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 27px;
          color: #a8b8cd;
          font-size: 12px;
        }

        .rn-profile-breadcrumb a {
          color: #d9e5f4;
        }

        .rn-profile-breadcrumb a:hover {
          color: var(--rn-cyan);
        }

        .rn-profile-eyebrow,
        .rn-profile-section-label {
          display: block;
          color: #73869f;
          font-size: 10px;
          font-weight: 800;
          letter-spacing: 1.7px;
          line-height: 1.6;
        }

        .rn-profile-eyebrow {
          color: var(--rn-cyan);
        }

        .rn-profile-hero h1 {
          max-width: 590px;
          margin: 13px 0 14px;
          color: #fff;
          font-size: clamp(32px, 4.2vw, 49px);
          font-weight: 800;
          letter-spacing: -1.8px;
          line-height: 1.09;
        }

        .rn-profile-hero-content > p {
          max-width: 510px;
          margin: 0;
          color: #c0ccdc;
          font-size: 14px;
          line-height: 1.85;
        }

        .rn-profile-hero-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 23px;
          margin-top: 25px;
        }

        .rn-profile-primary-link {
          display: inline-flex;
          align-items: center;
          gap: 15px;
          padding: 12px 17px;
          border-radius: 9px;
          background: var(--rn-cyan);
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 800;
          transition: transform 0.2s, background 0.2s;
        }

        .rn-profile-primary-link:hover {
          transform: translateY(-2px);
          background: #3dd4ee;
        }

        .rn-profile-text-link {
          color: #e1e9f4;
          font-size: 12px;
          font-weight: 700;
        }

        .rn-profile-text-link:hover {
          color: var(--rn-cyan);
        }

        .rn-profile-hero-art {
          position: absolute;
          z-index: 1;
          top: 4px;
          right: 25px;
          width: 340px;
          height: 285px;
          pointer-events: none;
        }

        .rn-profile-orbit {
          position: absolute;
          top: 50%;
          left: 50%;
          border: 1px solid rgba(0, 180, 216, 0.22);
          border-radius: 50%;
          transform: translate(-50%, -50%);
        }

        .rn-profile-orbit-one {
          width: 150px;
          height: 150px;
        }

        .rn-profile-orbit-two {
          width: 225px;
          height: 225px;
          border-color: rgba(255, 255, 255, 0.11);
        }

        .rn-profile-orbit-three {
          width: 300px;
          height: 300px;
          border-style: dashed;
          border-color: rgba(0, 180, 216, 0.16);
        }

        .rn-profile-art-center {
          position: absolute;
          top: 50%;
          left: 50%;
          display: flex;
          width: 92px;
          height: 92px;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          border: 1px solid rgba(0, 180, 216, 0.55);
          border-radius: 25px;
          background: linear-gradient(145deg, #143d61, #0b1e3a);
          box-shadow: 0 15px 55px rgba(0, 180, 216, 0.12);
          transform: translate(-50%, -50%) rotate(-8deg);
        }

        .rn-profile-art-center > span {
          color: #fff;
          font-size: 29px;
          font-weight: 900;
          letter-spacing: -2px;
        }

        .rn-profile-art-center small {
          margin-top: 1px;
          color: var(--rn-cyan);
          font-size: 7px;
          font-weight: 800;
          letter-spacing: 2px;
        }

        .rn-profile-art-node {
          position: absolute;
          display: grid;
          width: 35px;
          height: 35px;
          place-items: center;
          border: 1px solid rgba(255, 255, 255, 0.18);
          border-radius: 12px;
          background: #163653;
          color: var(--rn-cyan);
          font-size: 10px;
          font-weight: 800;
        }

        .rn-profile-node-one {
          top: 37px;
          left: 140px;
        }

        .rn-profile-node-two {
          right: 18px;
          bottom: 64px;
          color: var(--rn-gold);
        }

        .rn-profile-node-three {
          bottom: 28px;
          left: 57px;
        }

        .rn-profile-hero-footer {
          position: relative;
          z-index: 2;
          display: flex;
          align-items: center;
          gap: 13px;
          min-height: 43px;
          border-top: 1px solid rgba(255, 255, 255, 0.13);
          color: #a9bdd2;
          font-size: 9px;
          font-weight: 800;
          letter-spacing: 1.5px;
        }

        .rn-profile-footer-line {
          width: 24px;
          height: 1px;
          background: rgba(0, 180, 216, 0.7);
        }

        .rn-profile-alert {
          display: flex;
          align-items: flex-start;
          gap: 13px;
          margin-top: 22px;
          padding: 17px 19px;
          border: 1px solid;
          border-radius: 12px;
        }

        .rn-profile-alert-success {
          border-color: #a7e9d2;
          background: #ecfbf5;
          color: #116b50;
        }

        .rn-profile-alert-error {
          border-color: #fecaca;
          background: #fff1f2;
          color: #a51d36;
        }

        .rn-profile-alert-icon {
          display: grid;
          width: 27px;
          height: 27px;
          flex: 0 0 27px;
          place-items: center;
          border-radius: 50%;
          background: rgba(0, 0, 0, 0.06);
          font-size: 13px;
          font-weight: 900;
        }

        .rn-profile-alert strong {
          display: block;
          margin-bottom: 3px;
          font-size: 13px;
        }

        .rn-profile-alert p {
          margin: 0;
          font-size: 12px;
          line-height: 1.6;
        }

        .rn-profile-overview {
          display: grid;
          grid-template-columns: minmax(0, 1.35fr) minmax(290px, 0.8fr);
          gap: 17px;
          margin-top: 22px;
        }

        .rn-profile-identity-card,
        .rn-profile-completion-card,
        .rn-profile-stat-card,
        .rn-profile-editor,
        .rn-profile-sidebar-card,
        .rn-profile-shortcut {
          min-width: 0;
          border: 1px solid var(--rn-border);
          border-radius: 16px;
          background: var(--rn-surface);
          box-shadow: 0 4px 18px rgba(11, 30, 58, 0.025);
        }

        .rn-profile-identity-card {
          display: flex;
          align-items: center;
          gap: 18px;
          padding: 25px;
        }

        .rn-profile-avatar-wrap {
          position: relative;
          flex: 0 0 auto;
        }

        .rn-profile-avatar {
          display: block;
          width: 96px;
          height: 96px;
          border: 4px solid #eef7fb;
          border-radius: 24px;
          background: #eaf4fa;
          object-fit: cover;
        }

        .rn-profile-avatar-fallback {
          display: grid;
          place-items: center;
          background: linear-gradient(140deg, #0b1e3a, #146c91);
          color: #fff;
          font-size: 27px;
          font-weight: 800;
          letter-spacing: -1px;
        }

        .rn-profile-avatar-status {
          position: absolute;
          right: -2px;
          bottom: 3px;
          width: 16px;
          height: 16px;
          border: 3px solid #fff;
          border-radius: 50%;
          background: #27bd86;
        }

        .rn-profile-identity-copy {
          flex: 1;
          min-width: 0;
        }

        .rn-profile-identity-copy h2 {
          margin: 6px 0 5px;
          color: var(--rn-navy);
          font-size: clamp(18px, 2vw, 23px);
          font-weight: 800;
          letter-spacing: -0.5px;
          overflow-wrap: anywhere;
        }

        .rn-profile-email {
          margin: 0;
          color: var(--rn-muted);
          font-size: 12px;
          overflow-wrap: anywhere;
        }

        .rn-profile-identity-tags {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 8px;
          margin-top: 12px;
        }

        .rn-profile-role {
          display: inline-flex;
          align-items: center;
          padding: 5px 9px;
          border-radius: 6px;
          background: #e6f9fd;
          color: #08728c;
          font-size: 10px;
          font-weight: 800;
          text-transform: capitalize;
        }

        .rn-profile-member-since {
          color: #7b8ba0;
          font-size: 10px;
        }

        .rn-profile-outline-link {
          display: inline-flex;
          align-items: center;
          gap: 8px;
          flex: 0 0 auto;
          align-self: flex-start;
          padding: 10px 12px;
          border: 1px solid var(--rn-border);
          border-radius: 8px;
          color: var(--rn-navy);
          font-size: 11px;
          font-weight: 800;
        }

        .rn-profile-outline-link:hover {
          border-color: var(--rn-cyan);
          color: #007f9c;
        }

        .rn-profile-completion-card {
          padding: 23px;
        }

        .rn-profile-completion-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 12px;
        }

        .rn-profile-completion-top h2 {
          margin: 6px 0 0;
          color: var(--rn-navy);
          font-size: 16px;
          font-weight: 800;
          letter-spacing: -0.3px;
        }

        .rn-profile-completion-number {
          color: var(--rn-navy);
          font-size: 31px;
          font-weight: 900;
          letter-spacing: -1.5px;
        }

        .rn-profile-completion-number span {
          color: var(--rn-cyan);
          font-size: 17px;
        }

        .rn-profile-progress {
          height: 7px;
          overflow: hidden;
          margin-top: 19px;
          border-radius: 20px;
          background: #eaf0f6;
        }

        .rn-profile-progress > span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, var(--rn-cyan), #57d6e7);
          transition: width 0.35s ease;
        }

        .rn-profile-completion-card > p {
          margin: 12px 0 17px;
          color: var(--rn-muted);
          font-size: 11px;
          line-height: 1.7;
        }

        .rn-profile-checklist {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 11px 13px;
          padding-top: 15px;
          border-top: 1px solid #edf1f6;
        }

        .rn-profile-check-item {
          display: flex;
          align-items: center;
          gap: 7px;
          color: #687990;
          font-size: 10px;
        }

        .rn-profile-check-item > span {
          display: grid;
          width: 17px;
          height: 17px;
          flex: 0 0 17px;
          place-items: center;
          border-radius: 50%;
          background: #edf1f6;
          color: #8391a4;
          font-size: 11px;
          font-weight: 800;
        }

        .rn-profile-check-item > span.is-complete {
          background: #dff9ee;
          color: #12875e;
        }

        .rn-profile-stat-grid {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 16px;
          margin-top: 17px;
        }

        .rn-profile-stat-card {
          display: flex;
          align-items: center;
          gap: 15px;
          padding: 21px;
        }

        .rn-profile-stat-icon {
          display: grid;
          width: 45px;
          height: 45px;
          flex: 0 0 45px;
          place-items: center;
          border-radius: 13px;
          font-size: 23px;
          font-weight: 800;
        }

        .rn-stat-cyan {
          background: #e4faff;
          color: #008aa8;
        }

        .rn-stat-gold {
          background: #fff7df;
          color: #a87300;
        }

        .rn-stat-navy {
          background: #eaf0fb;
          color: #234776;
        }

        .rn-profile-stat-card > div:last-child {
          display: flex;
          min-width: 0;
          flex-direction: column;
        }

        .rn-profile-stat-card > div:last-child > span {
          color: #708096;
          font-size: 11px;
        }

        .rn-profile-stat-card strong {
          margin: 5px 0 3px;
          color: var(--rn-navy);
          font-size: 26px;
          font-weight: 900;
          letter-spacing: -0.8px;
          overflow-wrap: anywhere;
        }

        .rn-profile-stat-card small {
          color: #8b98a9;
          font-size: 10px;
          line-height: 1.5;
        }

        .rn-profile-main-grid {
          display: grid;
          grid-template-columns: minmax(0, 1fr) 280px;
          align-items: start;
          gap: 20px;
          margin-top: 25px;
        }

        .rn-profile-editor {
          padding: 29px;
          scroll-margin-top: 24px;
        }

        .rn-profile-editor-heading {
          display: flex;
          align-items: flex-start;
          gap: 16px;
          padding-bottom: 24px;
          border-bottom: 1px solid #edf1f6;
        }

        .rn-profile-heading-mark {
          display: grid;
          width: 39px;
          height: 39px;
          flex: 0 0 39px;
          place-items: center;
          border-radius: 11px;
          background: var(--rn-navy);
          color: var(--rn-cyan);
          font-size: 11px;
          font-weight: 900;
        }

        .rn-profile-editor-heading h2 {
          margin: 5px 0 7px;
          color: var(--rn-navy);
          font-size: 24px;
          font-weight: 850;
          letter-spacing: -0.8px;
        }

        .rn-profile-editor-heading p {
          margin: 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.7;
        }

        .rn-profile-form-section {
          padding: 25px 0;
          border-bottom: 1px solid #edf1f6;
        }

        .rn-profile-form-section h3,
        .rn-profile-privacy-content h3 {
          margin: 0 0 6px;
          color: var(--rn-navy);
          font-size: 14px;
          font-weight: 800;
        }

        .rn-profile-form-section > p {
          margin: 0 0 20px;
          color: var(--rn-muted);
          font-size: 11px;
          line-height: 1.7;
        }

        .rn-profile-field {
          display: flex;
          min-width: 0;
          flex-direction: column;
          gap: 8px;
          margin-top: 17px;
        }

        .rn-profile-field > label,
        .rn-profile-field-label {
          color: #293a52;
          font-size: 12px;
          font-weight: 750;
        }

        .rn-profile-field > label > span {
          color: #d64156;
        }

        .rn-profile-field input:not([type="file"]),
        .rn-profile-field textarea,
        .rn-profile-field select,
        .rn-profile-privacy-content select {
          display: block;
          width: 100%;
          min-width: 0;
          min-height: 45px;
          padding: 11px 13px;
          border: 1px solid #dce4ed;
          border-radius: 9px;
          outline: none;
          background: #fff;
          color: #20324a;
          font: inherit;
          font-size: 12px;
          transition: border-color 0.2s, box-shadow 0.2s;
        }

        .rn-profile-field input:not([type="file"]):focus,
        .rn-profile-field textarea:focus,
        .rn-profile-field select:focus,
        .rn-profile-privacy-content select:focus {
          border-color: var(--rn-cyan);
          box-shadow: 0 0 0 3px rgba(0, 180, 216, 0.12);
        }

        .rn-profile-field input:disabled {
          background: #f4f7fa !important;
          color: #7a899c !important;
          cursor: not-allowed;
        }

        .rn-profile-field textarea {
          min-height: 120px;
          resize: vertical;
          line-height: 1.7;
        }

        .rn-profile-field input[type="file"] {
          width: 100%;
          padding: 12px;
          border: 1px dashed #cbd7e5;
          border-radius: 9px;
          background: #f8fafc;
          color: #53647b;
          font-size: 11px;
        }

        .rn-profile-field input[type="file"]::file-selector-button {
          margin-right: 12px;
          padding: 8px 11px;
          border: 0;
          border-radius: 6px;
          background: #e2f7fc;
          color: #08728c;
          font-size: 11px;
          font-weight: 800;
          cursor: pointer;
        }

        .rn-profile-field > small,
        .rn-profile-field-footer > small {
          color: #8290a2;
          font-size: 10px;
          line-height: 1.7;
        }

        .rn-profile-field-footer {
          display: flex;
          flex-wrap: wrap;
          justify-content: space-between;
          gap: 8px;
        }

        .rn-profile-form-row {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 16px;
        }

        .rn-profile-form-row .rn-profile-field {
          margin-top: 0;
        }

        .rn-profile-privacy-box {
          display: flex;
          align-items: flex-start;
          gap: 14px;
          margin-top: 23px;
          padding: 19px;
          border: 1px solid #dce9f2;
          border-radius: 12px;
          background: #f5fbfe;
        }

        .rn-profile-privacy-icon {
          display: grid;
          width: 38px;
          height: 38px;
          flex: 0 0 38px;
          place-items: center;
          border-radius: 10px;
          background: #dff6fc;
          color: #007e9c;
          font-size: 22px;
        }

        .rn-profile-privacy-content {
          flex: 1;
          min-width: 0;
        }

        .rn-profile-privacy-content h3 {
          font-size: 13px;
        }

        .rn-profile-privacy-content > p {
          margin: 0 0 16px;
          color: #697b91;
          font-size: 11px;
          line-height: 1.7;
        }

        .rn-profile-field-label {
          display: block;
          margin-bottom: 8px;
        }

        .rn-profile-form-actions {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          gap: 12px;
          margin-top: 25px;
        }

        .rn-profile-save-button,
        .rn-profile-cancel-button {
          display: inline-flex;
          min-height: 45px;
          align-items: center;
          justify-content: center;
          gap: 13px;
          padding: 12px 18px;
          border: 1px solid transparent;
          border-radius: 9px;
          font: inherit;
          font-size: 12px;
          font-weight: 800;
          cursor: pointer;
          transition: transform 0.2s, background 0.2s, border-color 0.2s;
        }

        .rn-profile-save-button {
          background: var(--rn-navy);
          color: #fff;
        }

        .rn-profile-save-button:hover {
          transform: translateY(-1px);
          background: #163b62;
        }

        .rn-profile-save-button:focus-visible,
        .rn-profile-cancel-button:focus-visible,
        .rn-profile-primary-link:focus-visible,
        .rn-profile-sidebar-button:focus-visible {
          outline: 3px solid rgba(0, 180, 216, 0.4);
          outline-offset: 3px;
        }

        .rn-profile-cancel-button {
          border-color: #dce4ed;
          background: #fff;
          color: #465a72;
        }

        .rn-profile-cancel-button:hover {
          border-color: #aab9cb;
          background: #f8fafc;
        }

        .rn-profile-form-note {
          margin: 16px 0 0;
          color: #8a97a8;
          font-size: 10px;
          line-height: 1.6;
        }

        .rn-profile-sidebar {
          display: grid;
          gap: 16px;
        }

        .rn-profile-sidebar-card {
          padding: 23px;
        }

        .rn-profile-sidebar-dark {
          position: relative;
          overflow: hidden;
          border-color: #102b4b;
          background:
            radial-gradient(
              circle at 100% 0,
              rgba(0, 180, 216, 0.16),
              transparent 45%
            ),
            var(--rn-navy);
          color: #fff;
        }

        .rn-profile-sidebar-dark .rn-profile-section-label {
          color: var(--rn-cyan);
        }

        .rn-profile-sidebar-symbol {
          display: grid;
          width: 47px;
          height: 47px;
          margin-top: 25px;
          place-items: center;
          border: 1px solid rgba(0, 180, 216, 0.38);
          border-radius: 14px;
          background: rgba(0, 180, 216, 0.1);
          color: var(--rn-cyan);
          font-size: 26px;
        }

        .rn-profile-sidebar-dark h2 {
          margin: 18px 0 10px;
          color: #fff;
          font-size: 22px;
          font-weight: 850;
          letter-spacing: -0.6px;
          line-height: 1.3;
        }

        .rn-profile-sidebar-dark > p {
          margin: 0;
          color: #b5c5d8;
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-profile-sidebar-button {
          display: flex;
          min-height: 44px;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
          margin-top: 22px;
          padding: 11px 13px;
          border-radius: 8px;
          background: var(--rn-cyan);
          color: var(--rn-navy);
          font-size: 11px;
          font-weight: 850;
          transition: background 0.2s;
        }

        .rn-profile-sidebar-button:hover {
          background: #43d3e9;
        }

        .rn-profile-sidebar-light {
          background: #fff;
        }

        .rn-profile-sidebar-light h3 {
          margin: 12px 0 8px;
          color: var(--rn-navy);
          font-size: 15px;
          font-weight: 800;
          line-height: 1.5;
        }

        .rn-profile-sidebar-light > p {
          margin: 0;
          color: var(--rn-muted);
          font-size: 11px;
          line-height: 1.8;
        }

        .rn-profile-sidebar-link {
          display: inline-block;
          margin-top: 17px;
          color: #0089a6;
          font-size: 11px;
          font-weight: 800;
        }

        .rn-profile-sidebar-link:hover {
          color: var(--rn-navy);
        }

        .rn-profile-preview-section {
          margin-top: 35px;
          padding: 29px;
          border: 1px solid var(--rn-border);
          border-radius: 16px;
          background: #fff;
        }

        .rn-profile-section-intro {
          margin-bottom: 22px;
        }

        .rn-profile-section-intro h2 {
          margin: 6px 0 7px;
          color: var(--rn-navy);
          font-size: 25px;
          font-weight: 850;
          letter-spacing: -0.8px;
        }

        .rn-profile-section-intro > p {
          max-width: 580px;
          margin: 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-profile-discovery {
          margin-top: 25px;
          padding: 30px;
          border: 1px solid var(--rn-border);
          border-radius: 16px;
          background: #fff;
        }

        .rn-profile-discovery-heading {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 20px;
          margin-bottom: 23px;
        }

        .rn-profile-discovery-heading h2 {
          margin: 6px 0 7px;
          color: var(--rn-navy);
          font-size: 25px;
          font-weight: 850;
          letter-spacing: -0.8px;
        }

        .rn-profile-discovery-heading p {
          max-width: 590px;
          margin: 0;
          color: var(--rn-muted);
          font-size: 12px;
          line-height: 1.8;
        }

        .rn-profile-discovery-mark {
          flex: 0 0 auto;
          color: #dbeaf4;
          font-size: 46px;
          font-weight: 950;
          letter-spacing: -4px;
        }

        .rn-profile-discovery-mark span {
          color: var(--rn-cyan);
        }

        .rn-profile-shortcut-grid {
          display: grid;
          grid-template-columns: repeat(2, minmax(0, 1fr));
          gap: 12px;
        }

        .rn-profile-shortcut {
          display: flex;
          min-width: 0;
          align-items: center;
          gap: 13px;
          padding: 16px;
          transition: border-color 0.2s, transform 0.2s, box-shadow 0.2s;
        }

        .rn-profile-shortcut:hover {
          transform: translateY(-2px);
          border-color: #b7e9f2;
          box-shadow: 0 8px 20px rgba(11, 30, 58, 0.055);
        }

        .rn-profile-shortcut-icon {
          display: grid;
          width: 42px;
          height: 42px;
          flex: 0 0 42px;
          place-items: center;
          border-radius: 12px;
          background: #e8f9fd;
          color: #0089a6;
          font-size: 21px;
          font-weight: 800;
        }

        .rn-profile-shortcut-copy {
          display: flex;
          min-width: 0;
          flex: 1;
          flex-direction: column;
          gap: 5px;
        }

        .rn-profile-shortcut-copy strong {
          color: var(--rn-navy);
          font-size: 12px;
          font-weight: 800;
        }

        .rn-profile-shortcut-copy small {
          color: #7c8b9e;
          font-size: 10px;
          line-height: 1.6;
        }

        .rn-profile-shortcut-arrow {
          flex: 0 0 auto;
          color: #8fa1b6;
          font-size: 16px;
        }

        .rn-profile-footer {
          display: flex;
          flex-wrap: wrap;
          align-items: center;
          justify-content: space-between;
          gap: 14px;
          margin-top: 25px;
          padding: 18px 3px 0;
          border-top: 1px solid #e1e8f0;
          color: #7b8ba0;
          font-size: 10px;
        }

        .rn-profile-footer > span:first-child {
          color: var(--rn-navy);
          font-weight: 900;
          letter-spacing: 1.5px;
        }

        .rn-profile-footer a {
          color: #087f9b;
          font-weight: 800;
        }

        .rn-profile-footer a:hover {
          color: var(--rn-navy);
        }

        @media (max-width: 1000px) {
          .rn-profile-hero-art {
            right: -65px;
            opacity: 0.65;
          }

          .rn-profile-hero-content {
            width: 75%;
          }

          .rn-profile-overview {
            grid-template-columns: minmax(0, 1.1fr) minmax(270px, 0.9fr);
          }

          .rn-profile-identity-card {
            flex-wrap: wrap;
          }

          .rn-profile-outline-link {
            margin-left: 114px;
          }

          .rn-profile-main-grid {
            grid-template-columns: minmax(0, 1fr) 245px;
            gap: 15px;
          }

          .rn-profile-editor {
            padding: 23px;
          }

          .rn-profile-sidebar-card {
            padding: 19px;
          }
        }

        @media (max-width: 760px) {
          .rn-profile-page {
            padding: 16px 13px 38px;
          }

          .rn-profile-hero {
            min-height: 0;
            padding: 23px 22px 0;
            border-radius: 18px;
          }

          .rn-profile-hero-art {
            top: 30px;
            right: -155px;
            opacity: 0.3;
          }

          .rn-profile-hero-content {
            width: 100%;
            padding-bottom: 26px;
          }

          .rn-profile-breadcrumb {
            margin-bottom: 23px;
          }

          .rn-profile-hero h1 {
            max-width: 450px;
            font-size: clamp(31px, 8vw, 43px);
            letter-spacing: -1.3px;
          }

          .rn-profile-hero-content > p {
            max-width: 470px;
            font-size: 13px;
          }

          .rn-profile-hero-footer {
            gap: 9px;
            font-size: 8px;
            letter-spacing: 1px;
          }

          .rn-profile-footer-line {
            width: 13px;
          }

          .rn-profile-overview {
            grid-template-columns: minmax(0, 1fr);
            gap: 13px;
            margin-top: 15px;
          }

          .rn-profile-identity-card {
            gap: 14px;
            padding: 19px;
          }

          .rn-profile-avatar {
            width: 76px;
            height: 76px;
            border-radius: 19px;
          }

          .rn-profile-identity-copy {
            flex-basis: calc(100% - 100px);
          }

          .rn-profile-identity-copy h2 {
            font-size: 19px;
          }

          .rn-profile-outline-link {
            margin-left: 90px;
          }

          .rn-profile-completion-card {
            padding: 20px;
          }

          .rn-profile-stat-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 10px;
            margin-top: 13px;
          }

          .rn-profile-stat-card {
            padding: 15px 18px;
          }

          .rn-profile-stat-icon {
            width: 41px;
            height: 41px;
            flex-basis: 41px;
          }

          .rn-profile-stat-card strong {
            font-size: 23px;
          }

          .rn-profile-main-grid {
            grid-template-columns: minmax(0, 1fr);
            gap: 15px;
            margin-top: 20px;
          }

          .rn-profile-editor {
            padding: 21px 17px;
          }

          .rn-profile-editor-heading h2 {
            font-size: 22px;
          }

          .rn-profile-form-row {
            grid-template-columns: minmax(0, 1fr);
            gap: 0;
          }

          .rn-profile-form-row .rn-profile-field + .rn-profile-field {
            margin-top: 17px;
          }

          .rn-profile-privacy-box {
            gap: 11px;
            padding: 15px;
          }

          .rn-profile-privacy-icon {
            width: 33px;
            height: 33px;
            flex-basis: 33px;
          }

          .rn-profile-sidebar {
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 12px;
          }

          .rn-profile-sidebar-card {
            padding: 17px;
          }

          .rn-profile-sidebar-dark h2 {
            font-size: 19px;
          }

          .rn-profile-sidebar-dark > p,
          .rn-profile-sidebar-light > p {
            font-size: 11px;
          }

          .rn-profile-preview-section,
          .rn-profile-discovery {
            margin-top: 19px;
            padding: 21px 17px;
          }

          .rn-profile-section-intro h2,
          .rn-profile-discovery-heading h2 {
            font-size: 22px;
          }

          .rn-profile-shortcut-grid {
            grid-template-columns: minmax(0, 1fr);
          }

          .rn-profile-discovery-mark {
            font-size: 34px;
          }

          .rn-profile-footer {
            align-items: flex-start;
          }
        }

        @media (max-width: 460px) {
          .rn-profile-hero {
            padding-right: 17px;
            padding-left: 17px;
          }

          .rn-profile-hero h1 {
            font-size: 32px;
          }

          .rn-profile-hero-actions {
            align-items: flex-start;
            gap: 16px;
          }

          .rn-profile-hero-footer {
            flex-wrap: wrap;
            gap: 8px;
            padding: 12px 0;
          }

          .rn-profile-identity-card {
            align-items: flex-start;
            gap: 12px;
            padding: 16px;
          }

          .rn-profile-avatar {
            width: 64px;
            height: 64px;
            border-width: 3px;
            border-radius: 16px;
          }

          .rn-profile-identity-copy {
            flex-basis: calc(100% - 80px);
          }

          .rn-profile-identity-copy h2 {
            font-size: 17px;
          }

          .rn-profile-email {
            font-size: 11px;
          }

          .rn-profile-identity-tags {
            gap: 6px;
          }

          .rn-profile-outline-link {
            margin-left: 76px;
            font-size: 10px;
          }

          .rn-profile-checklist {
            grid-template-columns: minmax(0, 1fr);
            gap: 9px;
          }

          .rn-profile-sidebar {
            grid-template-columns: minmax(0, 1fr);
          }

          .rn-profile-sidebar-dark h2 {
            max-width: 260px;
          }

          .rn-profile-discovery-heading {
            align-items: flex-start;
          }

          .rn-profile-discovery-mark {
            font-size: 28px;
          }

          .rn-profile-form-actions {
            align-items: stretch;
            flex-direction: column;
          }

          .rn-profile-save-button,
          .rn-profile-cancel-button {
            width: 100%;
          }

          .rn-profile-footer {
            flex-direction: column;
            gap: 10px;
          }
        }

        @media (prefers-reduced-motion: reduce) {
          .rn-profile-page *,
          .rn-profile-page *::before,
          .rn-profile-page *::after {
            scroll-behavior: auto !important;
            transition-duration: 0.01ms !important;
            animation-duration: 0.01ms !important;
            animation-iteration-count: 1 !important;
          }
        }
      `}</style>
    </main>
  );
}