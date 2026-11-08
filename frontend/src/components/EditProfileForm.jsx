import { useEffect, useState } from "react";

export default function EditProfileForm({ user, onSaved, onCancel }) {
  const [displayName, setDisplayName] = useState(user.displayName || "");
  const [bio, setBio] = useState(user.bio || "");
  const [imageFile, setImageFile] = useState(null);
  const [imageUrl, setImageUrl] = useState(user.profilePhotoUrl || "");
  const [previewUrl, setPreviewUrl] = useState("");
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // Release each local preview when replaced or when the form closes.
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  function handleImageChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    setError("");
    setImageFile(null);
    setPreviewUrl("");

    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
      setError("Choose a JPEG, PNG, or WebP image.");
      event.target.value = "";
      return;
    }

    if (file.size > 4 * 1024 * 1024) {
      setError("Your image must be 4 MB or smaller.");
      event.target.value = "";
      return;
    }

    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (saving) return;
    setError("");

    if (!displayName.trim()) {
      setError("Please enter a display name.");
      return;
    }

    setSaving(true);

    try {
      let savedImageUrl = imageUrl;

      if (imageFile) {
        setUploading(true);
        const formData = new FormData();
        formData.append("image", imageFile);

        const uploadResponse = await fetch("/api/uploads/profile-image", {
          method: "POST",
          credentials: "include",
          body: formData
        });
        // A stale backend or proxy can return HTML instead of JSON.
        const uploadData = await uploadResponse.json().catch(() => null);

        if (!uploadResponse.ok) {
          throw new Error(uploadData?.message || (
            uploadResponse.status === 404
              ? "Profile photo uploads are unavailable. Please restart the backend and try again."
              : "Unable to upload your profile photo. Please try again."
          ));
        }

        if (typeof uploadData?.imageUrl !== "string" || !uploadData.imageUrl) {
          throw new Error("The upload returned an unexpected response. Please try again.");
        }

        savedImageUrl = uploadData.imageUrl;
        // Reuse this upload if the profile save fails and the user retries.
        setImageUrl(savedImageUrl);
        setImageFile(null);
        setPreviewUrl("");
        setUploading(false);
      }

      const response = await fetch("/api/auth/profile", {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          displayName: displayName.trim(),
          bio: bio.trim(),
          ...(savedImageUrl !== (user.profilePhotoUrl || "") && {
            profilePhotoUrl: savedImageUrl
          })
        })
      });

      const data = await response.json().catch(() => null);

      if (!response.ok) {
        throw new Error(data?.message || "Unable to update your profile. Please try again.");
      }

      if (!data?.user) {
        throw new Error("The profile save returned an unexpected response. Please try again.");
      }

      onSaved(data.user);
    } catch (error) {
      setError(error.message);
    } finally {
      setUploading(false);
      setSaving(false);
    }
  }

  return (
    <form className="profile-edit-form" onSubmit={handleSubmit} aria-busy={saving}>
      <h2>Edit profile</h2>

      <label htmlFor="profile-photo">Profile photo</label>
      <input
        id="profile-photo"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        onChange={handleImageChange}
        disabled={saving}
        aria-describedby="profile-photo-help"
      />
      <p id="profile-photo-help">Optional. JPEG, PNG, or WebP, up to 4 MB. Uploads when you save.</p>

      {(previewUrl || imageUrl) && (
        <img
          className="profile-photo-preview"
          src={previewUrl || imageUrl}
          alt="Profile photo preview"
        />
      )}

      <label htmlFor="profile-display-name">Display name</label>
      <input
        id="profile-display-name"
        value={displayName}
        onChange={(event) => setDisplayName(event.target.value)}
        maxLength={50}
        disabled={saving}
        required
      />

      <label htmlFor="profile-bio">Bio</label>
      <textarea
        id="profile-bio"
        value={bio}
        onChange={(event) => setBio(event.target.value)}
        maxLength={300}
        rows={4}
        disabled={saving}
      />

      {error && <p role="alert">{error}</p>}
      {saving && <p role="status">{uploading ? "Uploading photo…" : "Saving profile…"}</p>}

      <div className="profile-form-actions">
        <button
          className="primary-button"
          type="submit"
          disabled={saving}
        >
          {uploading ? "Uploading photo…" : saving ? "Saving…" : "Save changes"}
        </button>

        <button type="button" onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
