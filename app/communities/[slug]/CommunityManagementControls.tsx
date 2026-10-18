"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./CommunityManagementControls.module.css";

type Community = {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  category: string | null;
  location_label: string | null;
  visibility: "public" | "private";
  join_approval_required: boolean;
};

type Props = { community: Community };

type ApiResult = { success?: boolean; message?: string; error?: string };

export default function CommunityManagementControls({ community }: Props) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState(community.name);
  const [description, setDescription] = useState(community.description ?? "");
  const [category, setCategory] = useState(community.category ?? "");
  const [locationLabel, setLocationLabel] = useState(community.location_label ?? "");
  const [visibility, setVisibility] = useState<"public" | "private">(community.visibility);
  const [approvalRequired, setApprovalRequired] = useState(community.join_approval_required);
  const [confirmation, setConfirmation] = useState("");

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setNotice("");

    if (name.trim().length < 3) {
      setError("Community name must contain at least 3 characters.");
      return;
    }

    setSaving(true);
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(community.id)}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim(),
          category: category.trim(),
          location_label: locationLabel.trim(),
          visibility,
          join_approval_required: approvalRequired,
        }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.success) {
        setError(result.error || "Unable to save community settings.");
        return;
      }
      setNotice("Community settings saved successfully.");
      setEditing(false);
      router.refresh();
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    setError("");
    setNotice("");

    if (confirmation !== community.name) {
      setError("Type the exact community name to confirm deletion.");
      return;
    }

    const confirmed = window.confirm(
      `Permanently delete “${community.name}”? This cannot be undone. Linked records may also be removed according to the database's foreign-key rules.`
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const response = await fetch(`/api/communities/${encodeURIComponent(community.id)}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmation }),
      });
      const result = (await response.json()) as ApiResult;
      if (!response.ok || !result.success) {
        setError(result.error || "Unable to delete this community.");
        return;
      }
      window.location.assign("/communities?community_deleted=1");
    } catch {
      setError("Unable to reach the server. Please try again.");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className={styles.management} aria-labelledby="community-management-title">
      <div className={styles.header}>
        <div>
          <span className={styles.eyebrow}>OWNER CONTROLS</span>
          <h2 id="community-management-title">Manage community</h2>
          <p className={styles.intro}>Update your community details or remove the community if it is no longer needed.</p>
        </div>
        <div className={styles.actions}>
          <button type="button" className={styles.editButton} onClick={() => { setEditing((value) => !value); setError(""); setNotice(""); }}>
            {editing ? "Close editor" : "Edit community"}
          </button>
        </div>
      </div>

      {error && <p className={styles.error} role="alert">{error}</p>}
      {notice && <p className={styles.notice} role="status">{notice}</p>}

      {editing && (
        <form className={styles.form} onSubmit={handleSave}>
          <div className={styles.field}>
            <label htmlFor="community-edit-name">Community name</label>
            <input id="community-edit-name" value={name} onChange={(event) => setName(event.target.value)} minLength={3} maxLength={100} required />
          </div>
          <div className={styles.field}>
            <label htmlFor="community-edit-description">Description</label>
            <textarea id="community-edit-description" value={description} onChange={(event) => setDescription(event.target.value)} maxLength={1000} rows={4} />
            <span className={styles.help}>{description.length}/1000 characters</span>
          </div>
          <div className={styles.twoColumn}>
            <div className={styles.field}>
              <label htmlFor="community-edit-category">Category</label>
              <input id="community-edit-category" value={category} onChange={(event) => setCategory(event.target.value)} maxLength={80} />
            </div>
            <div className={styles.field}>
              <label htmlFor="community-edit-location">Location</label>
              <input id="community-edit-location" value={locationLabel} onChange={(event) => setLocationLabel(event.target.value)} maxLength={120} placeholder="City or Online" />
            </div>
          </div>
          <div className={styles.twoColumn}>
            <div className={styles.field}>
              <label htmlFor="community-edit-visibility">Visibility</label>
              <select id="community-edit-visibility" value={visibility} onChange={(event) => setVisibility(event.target.value as "public" | "private")}>
                <option value="public">Public</option>
                <option value="private">Private</option>
              </select>
              <span className={styles.help}>Public communities can appear in discovery.</span>
            </div>
            <div className={styles.field}>
              <label htmlFor="community-edit-approval">Join policy</label>
              <select id="community-edit-approval" value={approvalRequired ? "approval" : "open"} onChange={(event) => setApprovalRequired(event.target.value === "approval")}>
                <option value="approval">Require approval</option>
                <option value="open">Allow immediate joining</option>
              </select>
            </div>
          </div>
          <div className={styles.formActions}>
            <button type="submit" className={styles.saveButton} disabled={saving}>{saving ? "Saving changes…" : "Save changes"}</button>
            <button type="button" className={styles.cancelButton} onClick={() => { setEditing(false); setError(""); }}>Cancel</button>
          </div>
        </form>
      )}

      <div className={styles.dangerZone}>
        <div>
          <h3>Delete community</h3>
          <p>Permanent deletion cannot be undone. Database relationships may cause associated records to be deleted or may prevent deletion until those records are handled.</p>
        </div>
        <div className={styles.deleteFields}>
          <label htmlFor="community-delete-confirm">Type <strong>{community.name}</strong> to confirm</label>
          <input id="community-delete-confirm" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
          <button type="button" className={styles.deleteButton} onClick={() => void handleDelete()} disabled={deleting || confirmation !== community.name}>
            {deleting ? "Deleting…" : "Delete community permanently"}
          </button>
        </div>
      </div>
    </section>
  );
}
