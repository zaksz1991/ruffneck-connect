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
      
    </main>
  );
}