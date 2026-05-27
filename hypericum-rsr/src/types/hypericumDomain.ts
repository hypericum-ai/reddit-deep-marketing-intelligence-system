export const HYPERICUM_DOMAIN_SLUGS = [
  'ai-production-failure',
  'analytics-reconciliation',
  'acquisition-integration',
  'multitenant-saas-ai',
  'regulatory-audit',
  'knowledge-graph-governance',
  'n/a',
] as const;

export type HypericumDomainSlug = (typeof HYPERICUM_DOMAIN_SLUGS)[number];

export function normalizeHypericumDomain(raw: string): HypericumDomainSlug {
  const normalized = raw.trim().toLowerCase().replace(/\s+/g, '-');
  if ((HYPERICUM_DOMAIN_SLUGS as readonly string[]).includes(normalized)) {
    return normalized as HypericumDomainSlug;
  }
  return 'n/a';
}
