import { useState } from "react";

export default function ProfileAvatar({
  imageUrl,
  name,
  className,
  decorative = false
}) {
  const initial = (name || "?").charAt(0).toUpperCase();
  const [failedImageUrl, setFailedImageUrl] = useState("");

  // A failed URL is remembered per rendered avatar. A different URL renders
  // an image again automatically, which lets profile-photo updates recover.
  if (imageUrl && failedImageUrl !== imageUrl) {
    return (
      <img
        className={className}
        src={imageUrl}
        alt={decorative ? "" : `${name}'s profile photo`}
        onError={() => setFailedImageUrl(imageUrl)}
      />
    );
  }

  return (
    <span
      className={`${className} avatar-placeholder`}
      aria-hidden={decorative ? "true" : undefined}
      role={decorative ? undefined : "img"}
      aria-label={decorative ? undefined : `${name}'s profile photo`}
    >
      {initial}
    </span>
  );
}
