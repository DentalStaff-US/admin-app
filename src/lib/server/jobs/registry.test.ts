import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { jobs } from './registry';

// Cross-file consistency: each cron job in the registry must have a matching
// endpoint file, and that endpoint must verify the request against the same
// `name` literal the cron service signs with. If they drift (e.g. you rename
// the job but forget the endpoint, or vice versa), the cron call will fail
// at runtime with a 401 "job name mismatch" — this test catches the drift at
// build time instead.

// The endpoint paths in the registry are relative to API_URL, which includes
// the `/api` prefix at runtime. The on-disk SvelteKit route lives under
// `src/routes/api/<rest>/+server.ts`.
function endpointFilePath(endpoint: string): string {
	return resolve(
		__dirname,
		'../../../routes/api',
		endpoint.replace(/^\//, '') + '/+server.ts'
	);
}

describe('cron registry ↔ endpoint consistency', () => {
	it('the registry has at least one job', () => {
		// Sanity check — if the registry is empty something has gone seriously
		// wrong (probably an import error masquerading as an empty array).
		expect(jobs.length).toBeGreaterThan(0);
	});

	it.each(jobs.map((j) => [j.name, j.endpoint] as const))(
		'%s → %s endpoint exists',
		(_name, endpoint) => {
			const file = endpointFilePath(endpoint);
			expect(existsSync(file), `Missing endpoint file: ${file}`).toBe(true);
		}
	);

	it.each(jobs.map((j) => [j.name, j.endpoint] as const))(
		'%s → endpoint verifies the job with the same name',
		(name, endpoint) => {
			const contents = readFileSync(endpointFilePath(endpoint), 'utf8');
			// Match any verifyJobRequest(..., '<name>', ...) call — single or
			// double quotes, any whitespace, on one or multiple lines.
			const pattern = new RegExp(
				`verifyJobRequest\\s*\\(\\s*[^,]+,\\s*['"]${name}['"]`
			);
			expect(
				contents,
				`Endpoint ${endpoint}/+server.ts does not call verifyJobRequest with name '${name}'`
			).toMatch(pattern);
		}
	);

	it('every job name is unique', () => {
		const names = jobs.map((j) => j.name);
		const unique = new Set(names);
		expect(unique.size).toBe(names.length);
	});

	it('every endpoint path is unique', () => {
		const endpoints = jobs.map((j) => j.endpoint);
		const unique = new Set(endpoints);
		expect(unique.size).toBe(endpoints.length);
	});
});
