import { useState } from "react";
import { Link } from "react-router-dom";
import EditProfileForm from "../components/EditProfileForm";
import ProfileAvatar from "../components/ProfileAvatar";

export default function Profile({ user, onUserUpdated }) {
    const [editing, setEditing] = useState(false);

    function handleSaved(updatedUser) {
        onUserUpdated(updatedUser);
        setEditing(false);
    }

    return (
        <main className="main-content profile-page">
            <Link to="/">← Back to feed</Link>

            {editing ? (
                <EditProfileForm
                    user={user}
                    onSaved={handleSaved}
                    onCancel={() => setEditing(false)}
                />
            ) : (
                <section className="profile-header-card">
                    <div className="profile-identity">
                        <ProfileAvatar
                            className="profile-avatar"
                            imageUrl={user.profilePhotoUrl}
                            name={user.displayName || user.username}
                        />

                        <div className="profile-identity-copy">
                            <h1>{user.displayName || user.username}</h1>
                            <p className="profile-username">@{user.username}</p>
                            <p className={user.bio ? "profile-bio" : "profile-bio profile-bio-empty"}>
                                {user.bio || "Add a short bio to tell other cooks about yourself."}
                            </p>
                        </div>
                    </div>

                    <div className="profile-header-actions">
                        <button
                            className="primary-button"
                            type="button"
                            onClick={() => setEditing(true)}
                        >
                            Edit profile
                        </button>
                    </div>

                    <div className="profile-secondary-actions">
                        <Link to={`/users/${encodeURIComponent(user.username)}`}>
                            View public profile
                        </Link>
                        <Link to="/my-recipes">Manage my recipes</Link>
                    </div>
                </section>
            )}
        </main>
    );
}
