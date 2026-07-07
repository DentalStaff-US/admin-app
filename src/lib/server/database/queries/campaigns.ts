import { sql, eq, desc, and } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { experienceLevelTable } from '$lib/server/database/schemas/skill';
import {
	massCampaignTable,
	massCampaignRecipientTable,
	type MassCampaign,
	type MassCampaignChannel,
	type MassCampaignAudience
} from '$lib/server/database/schemas/campaign';
import { getDefaultSearchRadius } from './config';

const METERS_PER_MILE = 1609.34;
const STALE_DAYS = 30;

export type CampaignAudience = 'CANDIDATE' | 'CLIENT';
export type CampaignChannel = 'SMS' | 'EMAIL';

// Mirror of the optional filter fields on massNotificationFilterSchema. Kept as
// a plain type (not derived from zod) so callers can pass a partial object.
export type CampaignFilters = {
	filterName?: string;
	filterEmail?: string;
	filterPhone?: string;
	filterStatus?: string;
	createdFrom?: string;
	createdTo?: string;
	staleOnly?: boolean;
	locationLat?: number;
	locationLon?: number;
	radiusMiles?: number;
	disciplineId?: string;
	experienceLevelId?: string;
	payRateMin?: number;
	payRateMax?: number;
	companyName?: string;
	paymentType?: 'STRIPE' | 'PAPER' | 'SETUP';
	// client-only: who to reach. 'OWNER' (default) = the account owner's
	// email/cell; 'LOCATION' = the office location's email/number. Applies to
	// both email and SMS.
	clientRecipientTarget?: 'OWNER' | 'LOCATION';
};

export type CampaignRecipient = {
	userId: string;
	profileId: string | null;
	firstName: string | null;
	lastName: string | null;
	email: string | null;
	phone: string | null;
};

// A raw segment row — everyone matching the filters, BEFORE opt-out /
// contactability is applied. Carries the per-channel opt-in flags so the
// classifier can report why someone is excluded.
type SegmentRow = CampaignRecipient & {
	receiveSms: boolean;
	receiveEmail: boolean;
};

// Recipient count broken down so admins can see the gap at send time:
// how many matched, how many will actually receive, and why the rest won't.
export type AudienceBreakdown = {
	total: number; // matched the segment filters
	eligible: number; // will actually receive (opted in + has contact info)
	optedOut: number; // excluded: opted out of this channel
	noContact: number; // excluded: no phone (SMS) / no email (EMAIL)
	recipients: CampaignRecipient[]; // the eligible ones only
};

function likeParam(value: string) {
	return `%${value.trim()}%`;
}

/**
 * Map a loose form/JSON payload onto the strongly-typed CampaignFilters, coercing
 * numeric fields and dropping empty strings. Shared by the preview endpoint and
 * the queue action so both interpret the builder form identically.
 */
export function toCampaignFilters(d: Record<string, unknown>): CampaignFilters {
	const num = (v: unknown) => (v === undefined || v === null || v === '' ? undefined : Number(v));
	const str = (v: unknown) => {
		const s = typeof v === 'string' ? v.trim() : '';
		return s ? s : undefined;
	};
	return {
		filterName: str(d.filterName),
		filterEmail: str(d.filterEmail),
		filterPhone: str(d.filterPhone),
		filterStatus: str(d.filterStatus),
		createdFrom: str(d.createdFrom),
		createdTo: str(d.createdTo),
		staleOnly: d.staleOnly === true || d.staleOnly === 'true' || d.staleOnly === 'on',
		locationLat: num(d.locationLat),
		locationLon: num(d.locationLon),
		radiusMiles: num(d.radiusMiles),
		disciplineId: str(d.disciplineId),
		experienceLevelId: str(d.experienceLevelId),
		payRateMin: num(d.payRateMin),
		payRateMax: num(d.payRateMax),
		companyName: str(d.companyName),
		paymentType: str(d.paymentType) as CampaignFilters['paymentType'],
		clientRecipientTarget: str(d.clientRecipientTarget) as CampaignFilters['clientRecipientTarget']
	};
}

// Resolve the location filter into a radius in meters (falls back to the
// admin-configured default radius when a point is given without one).
async function resolveRadiusMeters(filters: CampaignFilters): Promise<number | null> {
	if (filters.locationLat == null || filters.locationLon == null) return null;
	if (filters.radiusMiles && filters.radiusMiles > 0) {
		return filters.radiusMiles * METERS_PER_MILE;
	}
	const { meters } = await getDefaultSearchRadius();
	return meters;
}

/**
 * Classify segment rows for a channel: opted-out and no-contact rows are counted
 * and dropped; the rest become deliverable recipients. This is where opt-out
 * (receive_sms / receive_email) and contactability are enforced — kept out of
 * SQL so the preview can report *why* people were excluded.
 */
function classifySegment(rows: SegmentRow[], channel: CampaignChannel): AudienceBreakdown {
	const recipients: CampaignRecipient[] = [];
	let optedOut = 0;
	let noContact = 0;

	for (const r of rows) {
		const optedIn = channel === 'SMS' ? r.receiveSms : r.receiveEmail;
		const contact = channel === 'SMS' ? r.phone : r.email;
		if (!optedIn) {
			optedOut++;
			continue;
		}
		if (!contact) {
			noContact++;
			continue;
		}
		recipients.push({
			userId: r.userId,
			profileId: r.profileId,
			firstName: r.firstName,
			lastName: r.lastName,
			email: r.email,
			phone: r.phone
		});
	}

	return { total: rows.length, eligible: recipients.length, optedOut, noContact, recipients };
}

/**
 * Resolve the segment and classify it for the channel. Role (audience) is the
 * top-level filter; every other criterion is scoped within it. Returns the full
 * breakdown (matched / eligible / opted-out / no-contact) plus the deliverable
 * recipient list.
 *
 * Both branches reuse the requisition search's PostGIS ST_DWithin approach for
 * location radius (see getQualifiedProfessionalsForRequisition).
 */
export async function getCampaignAudienceBreakdown(
	audience: CampaignAudience,
	channel: CampaignChannel,
	filters: CampaignFilters
): Promise<AudienceBreakdown> {
	const radiusMeters = await resolveRadiusMeters(filters);
	const rows =
		audience === 'CANDIDATE'
			? await getCandidateSegment(filters, radiusMeters)
			: await getClientSegment(filters, radiusMeters);
	return classifySegment(rows, channel);
}

// Deliverable recipients only — thin wrapper used by the queue action.
export async function getCampaignAudience(
	audience: CampaignAudience,
	channel: CampaignChannel,
	filters: CampaignFilters
): Promise<CampaignRecipient[]> {
	return (await getCampaignAudienceBreakdown(audience, channel, filters)).recipients;
}

async function getCandidateSegment(
	filters: CampaignFilters,
	radiusMeters: number | null
): Promise<SegmentRow[]> {
	const conditions: ReturnType<typeof sql>[] = [];

	if (filters.filterName) {
		const p = likeParam(filters.filterName);
		conditions.push(
			sql`(u.first_name ILIKE ${p} OR u.last_name ILIKE ${p} OR (u.first_name || ' ' || u.last_name) ILIKE ${p})`
		);
	}
	if (filters.filterEmail) conditions.push(sql`u.email ILIKE ${likeParam(filters.filterEmail)}`);
	if (filters.filterPhone)
		conditions.push(sql`cand.cell_phone ILIKE ${likeParam(filters.filterPhone)}`);
	if (filters.filterStatus)
		conditions.push(sql`cand.candidate_status = ${filters.filterStatus}::candidate_status`);
	if (filters.createdFrom) conditions.push(sql`cand.created_at >= ${filters.createdFrom}`);
	if (filters.createdTo) conditions.push(sql`cand.created_at <= ${filters.createdTo}`);
	if (filters.staleOnly) {
		conditions.push(
			sql`(cand.last_contacted_at IS NULL OR cand.last_contacted_at < now() - ${`${STALE_DAYS} days`}::interval)`
		);
	}
	if (radiusMeters != null) {
		conditions.push(sql`cand.geom IS NOT NULL AND ST_DWithin(
			cand.geom::geography,
			ST_SetSRID(ST_MakePoint(${filters.locationLon}, ${filters.locationLat}), 4326)::geography,
			${radiusMeters}
		)`);
	}

	// Discipline / experience / pay-rate all live on candidate_discipline_experience.
	const needsCde =
		!!filters.disciplineId ||
		!!filters.experienceLevelId ||
		filters.payRateMin != null ||
		filters.payRateMax != null;

	if (filters.disciplineId) conditions.push(sql`cde.discipline_id = ${filters.disciplineId}`);

	if (filters.experienceLevelId) {
		// "This level and above" — resolve the selected level's order and keep
		// candidates whose level order is >= it (same reductive semantics as the
		// requisition qualification flow).
		const [level] = await db
			.select({ order: experienceLevelTable.order })
			.from(experienceLevelTable)
			.where(eq(experienceLevelTable.id, filters.experienceLevelId))
			.limit(1);
		if (level?.order != null) conditions.push(sql`el."order" >= ${level.order}`);
	}

	// Overlap between the requested pay band and the candidate's preferred band
	// for this discipline (preferred_hourly_min/max on the CDE row).
	if (filters.payRateMin != null)
		conditions.push(sql`cde.preferred_hourly_max >= ${filters.payRateMin}`);
	if (filters.payRateMax != null)
		conditions.push(sql`cde.preferred_hourly_min <= ${filters.payRateMax}`);

	const joinCde = needsCde
		? sql`
			JOIN candidate_discipline_experience cde ON cde.candidate_id = cand.id
			JOIN experience_levels el ON el.id = cde.experience_level_id`
		: sql``;

	const whereClause = conditions.length ? sql` WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

	const query = sql`
		SELECT DISTINCT
			u.id AS "userId",
			cand.id AS "profileId",
			u.first_name AS "firstName",
			u.last_name AS "lastName",
			u.email AS "email",
			cand.cell_phone AS "phone",
			u.receive_sms AS "receiveSms",
			u.receive_email AS "receiveEmail"
		FROM users u
		JOIN candidate_profiles cand ON cand.user_id = u.id
		${joinCde}
		${whereClause}
	`;

	const result = await db.execute(query);
	return result.rows as SegmentRow[];
}

async function getClientSegment(
	filters: CampaignFilters,
	radiusMeters: number | null
): Promise<SegmentRow[]> {
	const conditions: ReturnType<typeof sql>[] = [];

	if (filters.filterName) {
		const p = likeParam(filters.filterName);
		conditions.push(
			sql`(u.first_name ILIKE ${p} OR u.last_name ILIKE ${p} OR (u.first_name || ' ' || u.last_name) ILIKE ${p})`
		);
	}
	if (filters.companyName)
		conditions.push(sql`cc.company_name ILIKE ${likeParam(filters.companyName)}`);
	if (filters.filterEmail) conditions.push(sql`u.email ILIKE ${likeParam(filters.filterEmail)}`);
	if (filters.filterPhone) {
		const p = likeParam(filters.filterPhone);
		conditions.push(
			sql`(cp.cell_phone ILIKE ${p} OR loc.cell_phone ILIKE ${p} OR loc.company_phone ILIKE ${p})`
		);
	}
	if (filters.filterStatus)
		conditions.push(sql`cp.client_status = ${filters.filterStatus}::client_status`);
	if (filters.createdFrom) conditions.push(sql`cp.created_at >= ${filters.createdFrom}`);
	if (filters.createdTo) conditions.push(sql`cp.created_at <= ${filters.createdTo}`);
	if (filters.staleOnly) {
		conditions.push(
			sql`(cp.last_contacted_at IS NULL OR cp.last_contacted_at < now() - ${`${STALE_DAYS} days`}::interval)`
		);
	}

	// Payment type. STRIPE = active Stripe billing (customer set up, not pending);
	// SETUP = Stripe selected but customer setup still pending / missing;
	// PAPER = paper invoicing.
	if (filters.paymentType === 'PAPER') {
		conditions.push(sql`cp.client_invoice_method = 'PAPER'`);
	} else if (filters.paymentType === 'STRIPE') {
		conditions.push(sql`cp.client_invoice_method = 'STRIPE' AND EXISTS (
			SELECT 1 FROM client_subscriptions sub
			WHERE sub.client_id = cp.id
			AND sub.stripe_customer_id IS NOT NULL
			AND COALESCE(sub.stripe_customer_setup_pending, false) = false
		)`);
	} else if (filters.paymentType === 'SETUP') {
		conditions.push(sql`cp.client_invoice_method = 'STRIPE' AND NOT EXISTS (
			SELECT 1 FROM client_subscriptions sub
			WHERE sub.client_id = cp.id
			AND sub.stripe_customer_id IS NOT NULL
			AND COALESCE(sub.stripe_customer_setup_pending, false) = false
		)`);
	}

	if (radiusMeters != null) {
		// Match on a real office location within the radius. We build the point from
		// the office's lat/lon (what the geocoder always writes) rather than the
		// derived `geom` column — some offices have lat/lon but a NULL geom (the
		// geom-sync trigger predates their geocoding), and keying on geom silently
		// dropped them. base_location is intentionally NOT used (vanity field).
		conditions.push(sql`EXISTS (
			SELECT 1 FROM company_office_locations o
			WHERE o.company_id = cc.id
			AND o.lat IS NOT NULL AND o.lon IS NOT NULL
			AND ST_DWithin(
				ST_SetSRID(ST_MakePoint(o.lon::float, o.lat::float), 4326)::geography,
				ST_SetSRID(ST_MakePoint(${filters.locationLon}, ${filters.locationLat}), 4326)::geography,
				${radiusMeters}
			)
		)`);
	}

	const whereClause = conditions.length ? sql` WHERE ${sql.join(conditions, sql` AND `)}` : sql``;

	const target = filters.clientRecipientTarget === 'LOCATION' ? 'LOCATION' : 'OWNER';

	// Which office represents the company: when a location radius filter is active,
	// prefer the office nearest the searched point (so "Location" targets the one
	// that actually matched); otherwise the first-created office.
	const locOrderBy =
		filters.locationLat != null && filters.locationLon != null
			? sql`ORDER BY (
					CASE WHEN lat IS NOT NULL AND lon IS NOT NULL THEN
						ST_Distance(
							ST_SetSRID(ST_MakePoint(lon::float, lat::float), 4326)::geography,
							ST_SetSRID(ST_MakePoint(${filters.locationLon}, ${filters.locationLat}), 4326)::geography
						)
					END
				) NULLS LAST, created_at ASC`
			: sql`ORDER BY created_at ASC`;

	// OWNER → the account owner's own email/cell (e.g. clawbacks). LOCATION → the
	// office's email/number only, no owner fallback, so missing office contact
	// shows up as "no contact" in the preview breakdown.
	const emailExpr = target === 'LOCATION' ? sql`loc.email` : sql`u.email`;
	const phoneExpr =
		target === 'LOCATION' ? sql`COALESCE(loc.cell_phone, loc.company_phone)` : sql`cp.cell_phone`;

	const query = sql`
		SELECT DISTINCT
			u.id AS "userId",
			cp.id AS "profileId",
			u.first_name AS "firstName",
			u.last_name AS "lastName",
			${emailExpr} AS "email",
			${phoneExpr} AS "phone",
			u.receive_sms AS "receiveSms",
			u.receive_email AS "receiveEmail"
		FROM users u
		JOIN client_profiles cp ON cp.user_id = u.id
		LEFT JOIN client_companies cc ON cc.client_id = cp.id
		LEFT JOIN LATERAL (
			SELECT company_phone, cell_phone, email
			FROM company_office_locations
			WHERE company_id = cc.id
			${locOrderBy}
			LIMIT 1
		) loc ON true
		${whereClause}
	`;

	const result = await db.execute(query);
	return result.rows as SegmentRow[];
}

// ──────────────────────────────────────────────────────────────────────────
// Campaign CRUD
// ──────────────────────────────────────────────────────────────────────────

/**
 * Create a campaign and snapshot its recipient list in one transaction. Sets
 * status straight to QUEUED so the cron picks it up on the next tick. Recipients
 * whose channel address is missing are skipped (belt-and-suspenders — the
 * audience query already filters on contactability).
 */
export async function createCampaignWithRecipients(params: {
	name: string;
	channel: MassCampaignChannel;
	audience: MassCampaignAudience;
	filters: CampaignFilters;
	subject: string | null;
	body: string;
	createdBy: string;
	recipients: CampaignRecipient[];
}): Promise<{ campaignId: string; recipientCount: number }> {
	const rows = params.recipients
		.map((r) => {
			const toAddress = params.channel === 'SMS' ? r.phone : r.email;
			if (!toAddress) return null;
			return {
				userId: r.userId,
				profileId: r.profileId,
				toAddress,
				firstName: r.firstName,
				lastName: r.lastName
			};
		})
		.filter((r): r is NonNullable<typeof r> => r !== null);

	return db.transaction(async (tx) => {
		const [campaign] = await tx
			.insert(massCampaignTable)
			.values({
				name: params.name,
				channel: params.channel,
				audience: params.audience,
				status: 'QUEUED',
				filters: params.filters,
				subject: params.subject,
				body: params.body,
				recipientCount: rows.length,
				createdBy: params.createdBy
			})
			.returning({ id: massCampaignTable.id });

		if (rows.length > 0) {
			// Chunk the recipient insert to stay well under Postgres' parameter cap.
			const CHUNK = 500;
			for (let i = 0; i < rows.length; i += CHUNK) {
				await tx
					.insert(massCampaignRecipientTable)
					.values(rows.slice(i, i + CHUNK).map((r) => ({ ...r, campaignId: campaign.id })));
			}
		}

		return { campaignId: campaign.id, recipientCount: rows.length };
	});
}

export async function listCampaigns(): Promise<MassCampaign[]> {
	return db.select().from(massCampaignTable).orderBy(desc(massCampaignTable.createdAt));
}

export async function getCampaignById(id: string): Promise<MassCampaign | undefined> {
	const [row] = await db
		.select()
		.from(massCampaignTable)
		.where(eq(massCampaignTable.id, id))
		.limit(1);
	return row;
}

export async function getCampaignRecipients(campaignId: string, limit = 500) {
	return db
		.select()
		.from(massCampaignRecipientTable)
		.where(eq(massCampaignRecipientTable.campaignId, campaignId))
		.orderBy(desc(massCampaignRecipientTable.createdAt))
		.limit(limit);
}

/**
 * Cancel a campaign that hasn't finished. Marks the campaign CANCELLED and drops
 * any still-PENDING recipients to SKIPPED so the drain loop stops touching them.
 */
export async function cancelCampaign(id: string): Promise<boolean> {
	return db.transaction(async (tx) => {
		const [campaign] = await tx
			.select({ status: massCampaignTable.status })
			.from(massCampaignTable)
			.where(eq(massCampaignTable.id, id))
			.limit(1);
		if (!campaign || ['COMPLETED', 'CANCELLED', 'FAILED'].includes(campaign.status)) {
			return false;
		}
		await tx
			.update(massCampaignRecipientTable)
			.set({ status: 'SKIPPED' })
			.where(
				and(
					eq(massCampaignRecipientTable.campaignId, id),
					eq(massCampaignRecipientTable.status, 'PENDING')
				)
			);
		await tx
			.update(massCampaignTable)
			.set({ status: 'CANCELLED', updatedAt: new Date() })
			.where(eq(massCampaignTable.id, id));
		return true;
	});
}
