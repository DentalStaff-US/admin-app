import { env } from '$env/dynamic/private';

/**
 * App origins from env, with any trailing slash removed. Every link we build is
 * `${BASE_URL}/path`, so `BASE_URL=https://host/` would produce `https://host//path`
 * — which broke staff invite links once. Read these here, never from $env
 * directly, so one stray slash in a Railway variable can't break links, CORS or
 * Better Auth's trusted origins.
 */
export const trimTrailingSlash = (url: string | undefined) => (url ?? '').trim().replace(/\/+$/, '');

/** This app's public origin (admin / practice portal). */
export const BASE_URL = trimTrailingSlash(env.BASE_URL);

/** The professional app's public origin. */
export const CANDIDATE_APP_DOMAIN = trimTrailingSlash(env.CANDIDATE_APP_DOMAIN);
