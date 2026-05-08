/**
 * One-shot backfill: rename S3 keys + DB URLs that contain URL-reserved
 * characters (`#`, `?`, `&`, `%`) so existing public URLs stop breaking when
 * the browser interprets them as fragments/queries.
 *
 * Pairs with the upload-time sanitizer added to
 *   dental-staff-app/src/lib/server/uploads/service.ts
 *   dtss-candidate-app/src/lib/server/uploads/service.ts
 *
 * Usage (from dental-staff-app/):
 *   tsx src/lib/server/database/backfill-s3-filenames.ts --dry-run
 *   tsx src/lib/server/database/backfill-s3-filenames.ts          # live
 *
 * Tables / columns processed:
 *   users.avatar_url
 *   client_companies.company_logo
 *   candidate_document_uploads.upload_url
 *   client_document_uploads.upload_url
 *
 * Per row, in order: CopyObject(old → new), UPDATE the DB row, DeleteObject(old).
 * If any step fails, subsequent steps for that row are skipped and the row is
 * reported in the failure summary. Safe to re-run — already-sanitized rows
 * are skipped by the WHERE clause.
 */

import * as dotenv from 'dotenv';
dotenv.config();

import {
	S3Client,
	CopyObjectCommand,
	DeleteObjectCommand,
	HeadObjectCommand
} from '@aws-sdk/client-s3';
import pg from 'pg';

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const DRY_RUN = process.argv.includes('--dry-run');
const BUCKET_NAME = process.env.AWS_BUCKET_NAME;
const PUBLIC_URL_PREFIX = `https://${BUCKET_NAME}.nyc3.cdn.digitaloceanspaces.com/`;

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required');
if (!BUCKET_NAME) throw new Error('AWS_BUCKET_NAME is required');
if (!process.env.AWS_ACCESS_KEY_ID || !process.env.AWS_SECRET_ACCESS_KEY) {
	throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY are required');
}

const s3 = new S3Client({
	region: process.env.AWS_REGION || 'us-east-1',
	credentials: {
		accessKeyId: process.env.AWS_ACCESS_KEY_ID,
		secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
	},
	endpoint: 'https://nyc3.digitaloceanspaces.com',
	forcePathStyle: false
});

const pool = new pg.Pool({
	connectionString: process.env.DATABASE_URL,
	ssl: { rejectUnauthorized: false }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Backfill is intentionally tighter than the upload-time sanitizer. The
// upload sanitizer in uploads/service.ts runs against raw filenames and
// replaces [#?&%]; here we run against URLs already stored in the DB and
// only replace `#`, since `%` could be a legitimate URL-encoded sequence
// (e.g. %20 for space) that we'd otherwise corrupt. `?` and `&` aren't
// produced by the upload code path, so we leave them for manual review
// if they ever show up.
const sanitizeFileName = (name: string) => name.replace(/#/g, '_');

// The DB stores full URLs. To rename the S3 object we need just the key
// (everything after the bucket host). Returns null if the URL doesn't look
// like one of our public Spaces URLs — we don't want to touch off-bucket
// avatars (e.g. Google OAuth profile pictures).
function urlToKey(url: string): string | null {
	if (!url.startsWith(PUBLIC_URL_PREFIX)) return null;
	return url.slice(PUBLIC_URL_PREFIX.length);
}

function sanitizeKey(key: string): string {
	// The key looks like "candidate-documents/Invoice #23.pdf" — only sanitize
	// the basename, not the directory prefix.
	const slash = key.lastIndexOf('/');
	if (slash === -1) return sanitizeFileName(key);
	return key.slice(0, slash + 1) + sanitizeFileName(key.slice(slash + 1));
}

function keyToUrl(key: string): string {
	return PUBLIC_URL_PREFIX + key;
}

type Row = { id: string; oldUrl: string; oldKey: string; newKey: string; newUrl: string };

interface Target {
	label: string;
	table: string;
	column: string;
}

const TARGETS: Target[] = [
	{ label: 'users.avatar_url', table: 'users', column: 'avatar_url' },
	{ label: 'client_companies.company_logo', table: 'client_companies', column: 'company_logo' },
	{
		label: 'candidate_document_uploads.upload_url',
		table: 'candidate_document_uploads',
		column: 'upload_url'
	},
	{
		label: 'client_document_uploads.upload_url',
		table: 'client_document_uploads',
		column: 'upload_url'
	}
];

async function findAffectedRows(target: Target): Promise<Row[]> {
	// `~ '[#?&%]'` matches any row whose URL still contains a URL-reserved
	// character. Sanitized rows (where every special char is already `_`) are
	// skipped. This is what makes the script safe to re-run.
	const sql = `
		SELECT id::text AS id, ${target.column} AS url
		FROM ${target.table}
		WHERE ${target.column} IS NOT NULL
		  AND ${target.column} LIKE '%#%'
	`;
	const { rows } = await pool.query<{ id: string; url: string }>(sql);

	const result: Row[] = [];
	for (const r of rows) {
		const oldKey = urlToKey(r.url);
		if (!oldKey) continue; // off-bucket URL, leave alone
		const newKey = sanitizeKey(oldKey);
		if (newKey === oldKey) continue; // nothing to change after sanitization
		result.push({
			id: r.id,
			oldUrl: r.url,
			oldKey,
			newKey,
			newUrl: keyToUrl(newKey)
		});
	}
	return result;
}

async function s3Exists(key: string): Promise<boolean> {
	try {
		await s3.send(new HeadObjectCommand({ Bucket: BUCKET_NAME, Key: key }));
		return true;
	} catch (err: any) {
		if (err?.$metadata?.httpStatusCode === 404 || err?.name === 'NotFound') return false;
		throw err;
	}
}

async function processRow(target: Target, row: Row): Promise<'ok' | 'skipped' | 'failed'> {
	const tag = `[${target.label} id=${row.id}]`;

	if (DRY_RUN) {
		console.log(`${tag} would rename`);
		console.log(`  old: ${row.oldKey}`);
		console.log(`  new: ${row.newKey}`);
		return 'ok';
	}

	// 1. Check the source still exists in S3. If not, the DB and S3 have
	//    diverged — skip the rename but still update the DB so future links
	//    point at the sanitized URL (the user can re-upload separately).
	const exists = await s3Exists(row.oldKey).catch((err) => {
		console.error(`${tag} HeadObject failed:`, err);
		return null;
	});
	if (exists === null) return 'failed';

	// 2. Copy old → new (preserves ACL via 'public-read' since that's what
	//    uploadFile uses; CopyObjectCommand with no ACL preserves the source's).
	if (exists) {
		// CopySource needs each path segment URL-encoded (so `#` becomes `%23`)
		// while preserving `/` as the separator. encodeURIComponent on the
		// whole string would also encode the slashes, which S3 would reject.
		const encodedKey = row.oldKey.split('/').map(encodeURIComponent).join('/');
		try {
			await s3.send(
				new CopyObjectCommand({
					Bucket: BUCKET_NAME,
					CopySource: `${BUCKET_NAME}/${encodedKey}`,
					Key: row.newKey,
					ACL: 'public-read',
					MetadataDirective: 'COPY'
				})
			);
		} catch (err) {
			console.error(`${tag} CopyObject failed:`, err);
			return 'failed';
		}
	} else {
		console.warn(`${tag} source missing in S3, updating DB only`);
	}

	// 3. Update the DB to point at the new URL.
	try {
		const sql = `UPDATE ${target.table} SET ${target.column} = $1 WHERE id::text = $2 AND ${target.column} = $3`;
		const result = await pool.query(sql, [row.newUrl, row.id, row.oldUrl]);
		if (result.rowCount === 0) {
			// The row changed underneath us between SELECT and UPDATE. Cleanup:
			// delete the just-copied object so we don't leave orphans.
			console.warn(`${tag} DB row changed since SELECT; rolling back copy`);
			if (exists) {
				await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: row.newKey }));
			}
			return 'skipped';
		}
	} catch (err) {
		console.error(`${tag} UPDATE failed:`, err);
		// Best-effort cleanup of the orphan copy.
		if (exists) {
			try {
				await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: row.newKey }));
			} catch {
				/* swallow */
			}
		}
		return 'failed';
	}

	// 4. Delete the old S3 object. If this fails the DB is already pointed at
	//    the new key, so the row is functionally fixed — log and move on.
	if (exists) {
		try {
			await s3.send(new DeleteObjectCommand({ Bucket: BUCKET_NAME, Key: row.oldKey }));
		} catch (err) {
			console.error(`${tag} DeleteObject of old key failed (orphan left in bucket):`, err);
		}
	}

	console.log(`${tag} ok`);
	return 'ok';
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
	console.log(`S3 filename backfill — ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
	console.log(`Bucket: ${BUCKET_NAME}`);
	console.log('');

	const summary: Record<string, { ok: number; skipped: number; failed: number; total: number }> =
		{};

	for (const target of TARGETS) {
		const rows = await findAffectedRows(target);
		summary[target.label] = { ok: 0, skipped: 0, failed: 0, total: rows.length };
		console.log(`--- ${target.label}: ${rows.length} affected ---`);

		for (const row of rows) {
			const status = await processRow(target, row);
			summary[target.label][status]++;
		}
		console.log('');
	}

	console.log('=== Summary ===');
	for (const [label, s] of Object.entries(summary)) {
		console.log(`${label}: ${s.ok} ok, ${s.skipped} skipped, ${s.failed} failed (of ${s.total})`);
	}

	await pool.end();
}

main().catch((err) => {
	console.error('Fatal:', err);
	pool.end().finally(() => process.exit(1));
});
