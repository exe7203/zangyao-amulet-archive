export const ADMIN_IMAGE_URL_MAX_LENGTH = 1000;
export const ADMIN_IMAGE_ALT_MAX_LENGTH = 300;

export function validateHttpUrlField(value: string, label: string): string | null {
  if (value.length > ADMIN_IMAGE_URL_MAX_LENGTH) {
    return `${label}不可超過 ${ADMIN_IMAGE_URL_MAX_LENGTH} 個字元`;
  }

  const candidate = value.trim();
  if (!candidate) return null;

  try {
    const url = new URL(candidate);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
      throw new Error("Unsafe URL");
    }
    return null;
  } catch {
    return `${label}必須是有效的 http 或 https 公開網址，且不可包含帳號密碼`;
  }
}

export function validateImagePair({
  url,
  alt,
  urlLabel,
  altLabel,
}: {
  url: string;
  alt: string;
  urlLabel: string;
  altLabel: string;
}): string | null {
  const urlError = validateHttpUrlField(url, urlLabel);
  if (urlError) return urlError;
  if (alt.length > ADMIN_IMAGE_ALT_MAX_LENGTH) {
    return `${altLabel}不可超過 ${ADMIN_IMAGE_ALT_MAX_LENGTH} 個字元`;
  }
  if (url.trim() && !alt.trim()) return `${urlLabel}已填寫時，${altLabel}不可留白`;
  return null;
}
