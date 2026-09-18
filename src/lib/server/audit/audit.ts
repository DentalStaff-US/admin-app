/**
 * The platform ledger writer.
 *
 * Every acute action (and throttled view) on the platform is recorded through
 * here so superadmins can later prove who did what, when, from where, and
 * whether they were being impersonated at the time. Request context (actor,
 * role, IP, user agent, impersonator, source app, path) is resolved
 * automatically from SvelteKit's request event so call sites only describe the
 * domain event.
 *
 * Do NOT import from `$lib/server/database/queries/*` here — queries/admin.ts
 * re-exports `writeActionHistory` from this module, and requisitions.ts imports
 * admin.ts, so any such import would close a cycle.
 */
import { getRequestEvent } from '$app/server';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq, gt } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { actionHistoryTable } from '$lib/server/database/schemas/admin';
import { userTable } from '$lib/server/database/schemas/auth';
import { logger } from '$lib/server/logger';
import {
	FORWARDED_CLIENT_IP_HEADER,
	FORWARDED_CLIENT_UA_HEADER,
	VIEW_THROTTLE_MS,
	type AuditAction,
	type AuditEntityType,
	type AuditSource
} from '$lib/audit/constants';

export type AuditActor = {
	id: string;
	role?: string | null;
	firstName?: string | null;
	lastName?: string | null;
	email?: string | null;
};

// Either the shared pool or a transaction handle from db.transaction(...).
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbExecutor = typeof db | any;

export interface RecordActionInput {
	// Typed vocabulary, but legacy call sites may still pass arbitrary strings.
	// eslint-disable-next-line @typescript-eslint/ban-types
	entityType: AuditEntityType | (string & {});
	entityId: string;
	action: AuditAction;
	/**
	 * Who did it.
	 * - `undefined` → resolved from `event.locals.user` (normal page/form actions)
	 * - `AuditActor`  → used as-is (JWT endpoints pass the `users` row from authenticateUser)
	 * - `string`      → a users.id; snapshot is taken from locals.user if it matches, else looked up
	 * - `null`        → no actor (cron, Stripe, system)
	 */
	actor?: AuditActor | string | null;
	before?: Record<string, unknown>;
	after?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
	/** Override the path-derived source (e.g. the Stripe webhook passes 'STRIPE'). */
	source?: AuditSource;
	/** Write inside the caller's transaction so a rollback also drops the audit row. */
	tx?: DbExecutor;
}

export type RecordViewInput = Omit<RecordActionInput, 'action' | 'before' | 'after' | 'tx'>;

export type ActionHistoryRow = typeof actionHistoryTable.$inferSelect;

type ResolvedContext = {
	event: RequestEvent | null;
	source: AuditSource;
	requestPath: string | null;
	impersonatedBy: string | null;
	ipAddress: string | null;
	userAgent: string | null;
	/** Peer address when the IP came from a forwarded header (candidate app). */
	proxyIp: string | null;
};

/** getRequestEvent() throws outside a request (tests, scripts). */
function safeRequestEvent(): RequestEvent | null {
	try {
		return getRequestEvent();
	} catch {
		return null;
	}
}

/** getClientAddress() throws when the adapter has no address to give. */
function safeClientAddress(event: RequestEvent): string | null {
	try {
		return event.getClientAddress();
	} catch {
		return null;
	}
}

function sourceForPath(pathname: string): AuditSource {
	if (pathname.startsWith('/api/external')) return 'CANDIDATE_APP';
	if (pathname.startsWith('/api/jobs')) return 'CRON';
	if (pathname.startsWith('/api/webhooks/stripe')) return 'STRIPE';
	return 'ADMIN_APP';
}

/**
 * Must be called synchronously at the top of the public functions — before any
 * `await` — so fire-and-forget callers (`void recordView(...)`) still resolve
 * the AsyncLocalStorage-backed request event.
 */
function resolveContext(sourceOverride?: AuditSource): ResolvedContext {
	const event = safeRequestEvent();
	if (!event) {
		return {
			event: null,
			source: sourceOverride ?? 'SYSTEM',
			requestPath: null,
			impersonatedBy: null,
			ipAddress: null,
			userAgent: null,
			proxyIp: null
		};
	}

	const source = sourceOverride ?? sourceForPath(event.url.pathname);
	const headers = event.request.headers;
	const peerIp = headers.get('x-forwarded-for')?.split(',')[0]?.trim() || safeClientAddress(event);

	let ipAddress = peerIp;
	let userAgent = headers.get('user-agent');
	let proxyIp: string | null = null;

	// The candidate app calls us server-to-server; it forwards the professional's
	// real browser IP/UA on custom headers. Only trusted on the JWT-guarded path.
	if (source === 'CANDIDATE_APP') {
		const forwardedIp = headers.get(FORWARDED_CLIENT_IP_HEADER);
		const forwardedUa = headers.get(FORWARDED_CLIENT_UA_HEADER);
		if (forwardedIp) {
			proxyIp = peerIp;
			ipAddress = forwardedIp;
		}
		if (forwardedUa) userAgent = forwardedUa;
	}

	// locals.user/session are undefined (not null) on the webhook bypass paths.
	const session = event.locals?.session ?? null;

	return {
		event,
		source,
		requestPath: `${event.url.pathname}${event.url.search}`,
		impersonatedBy: session?.impersonatedBy ?? null,
		ipAddress: ipAddress ?? null,
		userAgent: userAgent ?? session?.userAgent ?? null,
		proxyIp
	};
}

async function resolveActor(
	input: RecordActionInput['actor'],
	event: RequestEvent | null,
	tx: DbExecutor
): Promise<AuditActor | null> {
	if (input === null) return null;

	const localUser = event?.locals?.user ?? null;

	if (input === undefined) {
		return localUser
			? {
					id: localUser.id,
					role: localUser.role,
					firstName: localUser.firstName,
					lastName: localUser.lastName,
					email: localUser.email
				}
			: null;
	}

	if (typeof input === 'object') return input;

	// A bare users.id. Prefer the already-loaded session user; otherwise one
	// cheap lookup so the snapshot is still captured.
	if (localUser && localUser.id === input) {
		return {
			id: localUser.id,
			role: localUser.role,
			firstName: localUser.firstName,
			lastName: localUser.lastName,
			email: localUser.email
		};
	}
	const [row] = await tx
		.select({
			id: userTable.id,
			role: userTable.role,
			firstName: userTable.firstName,
			lastName: userTable.lastName,
			email: userTable.email
		})
		.from(userTable)
		.where(eq(userTable.id, input))
		.limit(1);
	// User already deleted — keep the id so the row is still attributable by id.
	return row ?? { id: input };
}

function snapshotOf(actor: AuditActor | null) {
	if (!actor) return null;
	return {
		firstName: actor.firstName ?? null,
		lastName: actor.lastName ?? null,
		email: actor.email ?? null
	};
}

/**
 * Record an acute action. Throws if the insert fails — a mutation without its
 * ledger row is worse than a failed mutation. Callers on paths that must never
 * fail for audit reasons (webhooks, emails, downloads) wrap this themselves.
 */
export async function recordAction(input: RecordActionInput): Promise<ActionHistoryRow> {
	const ctx = resolveContext(input.source);
	const tx = input.tx ?? db;

	try {
		const actor = await resolveActor(input.actor, ctx.event, tx);
		const metadata = {
			...(input.metadata ?? {}),
			...(ctx.proxyIp ? { _proxyIp: ctx.proxyIp } : {})
		};

		const [row] = await tx
			.insert(actionHistoryTable)
			.values({
				id: crypto.randomUUID(),
				entityId: input.entityId,
				entityType: input.entityType,
				userId: actor?.id ?? null,
				action: input.action,
				changes: { before: input.before, after: input.after },
				metadata,
				actorRole: actor?.role ?? null,
				actorSnapshot: snapshotOf(actor),
				impersonatedBy: ctx.impersonatedBy,
				ipAddress: ctx.ipAddress,
				userAgent: ctx.userAgent,
				source: ctx.source,
				requestPath: ctx.requestPath
			})
			.returning();

		return row;
	} catch (error) {
		logger.error('Failed to write action history', {
			error,
			entityType: input.entityType,
			entityId: input.entityId,
			action: input.action
		});
		throw new Error('Failed to record action history');
	}
}

/**
 * Record that an actor looked at an entity. Never throws and never blocks —
 * call it as `void recordView(...)` AFTER the entity has been authorised and
 * loaded, so a 403/404 never yields a "viewed" row. Throttled to one row per
 * actor per entity per VIEW_THROTTLE_MS: SvelteKit re-runs `load` after every
 * form action, and a ledger that says "viewed" once per 30 minutes is both
 * honest and readable.
 */
export async function recordView(input: RecordViewInput): Promise<void> {
	const ctx = resolveContext(input.source);

	try {
		const actor = await resolveActor(input.actor, ctx.event, db);
		// Anonymous views are not evidence of anything.
		if (!actor) return;

		const since = new Date(Date.now() - VIEW_THROTTLE_MS);
		const [recent] = await db
			.select({ id: actionHistoryTable.id })
			.from(actionHistoryTable)
			.where(
				and(
					eq(actionHistoryTable.entityType, input.entityType),
					eq(actionHistoryTable.entityId, input.entityId),
					eq(actionHistoryTable.userId, actor.id),
					eq(actionHistoryTable.action, 'VIEW'),
					gt(actionHistoryTable.createdAt, since)
				)
			)
			.limit(1);
		if (recent) return;

		await db.insert(actionHistoryTable).values({
			id: crypto.randomUUID(),
			entityId: input.entityId,
			entityType: input.entityType,
			userId: actor.id,
			action: 'VIEW',
			changes: null,
			metadata: {
				...(input.metadata ?? {}),
				navigation: ctx.event?.isDataRequest ? 'client' : 'ssr',
				...(ctx.proxyIp ? { _proxyIp: ctx.proxyIp } : {})
			},
			actorRole: actor.role ?? null,
			actorSnapshot: snapshotOf(actor),
			impersonatedBy: ctx.impersonatedBy,
			ipAddress: ctx.ipAddress,
			userAgent: ctx.userAgent,
			source: ctx.source,
			requestPath: ctx.requestPath
		});
	} catch (error) {
		logger.warn('Failed to record view', {
			error,
			entityType: input.entityType,
			entityId: input.entityId
		});
	}
}

/**
 * Back-compat shape used by the pre-ledger call sites. New code should call
 * recordAction directly (it can pass a tx and a typed actor).
 */
export const writeActionHistory = async ({
	table,
	userId,
	action,
	entityId,
	beforeState,
	afterState,
	metadata = {},
	tx
}: {
	table: string;
	userId: string | null;
	action: AuditAction;
	entityId: string;
	beforeState?: Record<string, unknown>;
	afterState?: Record<string, unknown>;
	metadata?: Record<string, unknown>;
	tx?: DbExecutor;
}) =>
	recordAction({
		entityType: table,
		entityId,
		action,
		actor: userId,
		before: beforeState,
		after: afterState,
		metadata,
		tx
	});
