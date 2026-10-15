function getAvatarDisplayUrl(value: string | null): string {
  if (!value || !isValidUrl(value)) {
    return "";
  }

  try {
    const url = new URL(value);

    // Convert Google Drive sharing links into image URLs.
    if (
      url.hostname === "drive.google.com" ||
      url.hostname === "www.drive.google.com"
    ) {
      const fileId =
        url.pathname.match(/\/file\/d\/([^/]+)/)?.[1] ??
        url.searchParams.get("id");

      if (!fileId) {
        return "";
      }

      return `https://drive.google.com/thumbnail?id=${encodeURIComponent(
        fileId
      )}&sz=w800`;
    }

    return url.toString();
  } catch {
    return "";
  }
}