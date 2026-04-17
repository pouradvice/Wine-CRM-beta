export const DEFAULT_CALENDLY_URL = 'https://calendly.com/josh-pouradvice/product-tasting';
export const PORTFOLIO_SLUG_RE = /^[a-z0-9-]+$/;

export function defaultSlugForTeam(teamId: string): string {
  return `team-${teamId.toLowerCase()}`;
}

export function storefrontPathForSlug(rawSlug: string): string {
  const slug = rawSlug.trim().toLowerCase();
  return `/pouradvice/${encodeURIComponent(slug)}`;
}
