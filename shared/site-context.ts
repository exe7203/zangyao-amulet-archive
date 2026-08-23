export const DEFAULT_PUBLIC_SITE_CODE = "taijuda";

export function normalizePublicSiteCode(value: unknown) {
  if (typeof value !== "string") return DEFAULT_PUBLIC_SITE_CODE;
  const candidate = value.trim().normalize("NFKC").toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/u.test(candidate)
    ? candidate
    : DEFAULT_PUBLIC_SITE_CODE;
}

/**
 * One deployment serves one public brand. The shared D1 model can hold more
 * than one site, while this explicit build-time setting prevents requests from
 * silently drifting between tenants.
 */
export const PUBLIC_SITE_CODE = normalizePublicSiteCode(
  process.env.NEXT_PUBLIC_SITE_CODE,
);
