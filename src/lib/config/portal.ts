/**
 * Affiliate portal location.
 *
 * Separate from constants.ts on purpose: this module reads $env, which only
 * resolves inside the SvelteKit build. constants.ts is imported by tsx-run
 * scripts (db-scripts/*, seed-dev) and must stay free of $app/$env imports.
 * Import this ONLY from SvelteKit server/client code.
 *
 * Three environments, not two, so a `dev ? local : prod` ternary (the pattern in
 * the candidate app's constants.ts) cannot express it:
 *   local    http://localhost:4000
 *   staging  some Railway URL
 *   prod     https://partners.dtstaffingsolutions.com
 *
 * And PUBLIC_APP_ENV cannot be used to branch — it is always INTERNAL in every
 * environment including production.
 */
import { dev } from '$app/environment';
import { env } from '$env/dynamic/public';

/** Dev default; the portal app pins this port in its vite config. */
const LOCAL_PORTAL_URL = 'http://localhost:4000';
const PROD_PORTAL_URL = 'https://partners.dtstaffingsolutions.com';

/**
 * Set PUBLIC_PARTNER_PORTAL_URL per environment (required on staging, where the
 * host is a Railway-generated URL). Falls back to localhost in dev and the
 * production domain otherwise, so a missing var degrades sensibly rather than
 * producing a broken link.
 */
export const PARTNER_PORTAL_URL =
	env.PUBLIC_PARTNER_PORTAL_URL || (dev ? LOCAL_PORTAL_URL : PROD_PORTAL_URL);
