/**
 * Weekly trend charts and the agreements panel for the DTSS admin dashboard.
 * Reads rows here; bucketing lives in ../trends.ts and ../agreements.ts.
 */
import { and, desc, eq, gte, inArray, lt, notInArray, sql } from 'drizzle-orm';
import db from '$lib/server/database/drizzle';
import { clientCompanyTable, clientDocumentUploadsTable, clientProfileTable } from '$lib/server/database/schemas/client';
import { adminConfigTable } from '$lib/server/database/schemas/config';
import { invoiceTable, recurrenceDayTable, requisitionTable } from '$lib/server/database/schemas/requisition';
import { signatureRequestTable } from '$lib/server/database/schemas/signature';
import { resolveAdminFee } from '$lib/server/timesheets/adminFee';
import { agreementStatus, type AgreementPractice, type AgreementStatus } from '../agreements';
import {
	fillRateByWeek,
	moneyByWeek,
	shiftsByStatusWeek,
	STATUS_WEEKS_AHEAD,
	STATUS_WEEKS_BACK,
	topPractices,
	TREND_WEEKS_BACK,
	weekKey,
	weeksAround,
	type AdminTrends
} from '../trends';
import type { DashboardScope } from '../types';
import { settle } from './settle';
import { summarizePipeline } from './shiftValueRule';

function requireAll(scope: DashboardScope) {
	if (scope.kind !== 'all') throw new Error('Admin trends need the DTSS scope');
}

export function adminTrends(scope: DashboardScope, now = new Date()) {
	requireAll(scope);
	return settle('trends', async (): Promise<AdminTrends> => {
		const trendWeeks = weeksAround(now, TREND_WEEKS_BACK);
		const statusWeeks = weeksAround(now, STATUS_WEEKS_BACK, STATUS_WEEKS_AHEAD);
		const from = trendWeeks[0].start < statusWeeks[0].start ? trendWeeks[0].start : statusWeeks[0].start;
		const to = new Date(statusWeeks.at(-1)!.start.getTime() + 7 * 86_400_000);
		const thisWeekEnd = new Date(trendWeeks.at(-1)!.start.getTime() + 7 * 86_400_000);

		const [shifts, invoices, [config]] = await Promise.all([
			db
				.select({
					requisitionId: recurrenceDayTable.requisitionId,
					status: recurrenceDayTable.status,
					dayStart: recurrenceDayTable.dayStart,
					dayEnd: recurrenceDayTable.dayEnd,
					lunchStart: recurrenceDayTable.lunchStart,
					lunchEnd: recurrenceDayTable.lunchEnd,
					hourlyRate: requisitionTable.hourlyRate
				})
				.from(recurrenceDayTable)
				.innerJoin(requisitionTable, eq(requisitionTable.id, recurrenceDayTable.requisitionId))
				.where(
					and(
						eq(recurrenceDayTable.archived, false),
						eq(requisitionTable.permanentPosition, false),
						gte(recurrenceDayTable.dayStart, from),
						lt(recurrenceDayTable.dayStart, to)
					)
				),
			db
				.select({ clientId: invoiceTable.clientId, total: invoiceTable.total, createdAt: invoiceTable.createdAt })
				.from(invoiceTable)
				.where(
					and(
						notInArray(invoiceTable.status, ['draft', 'void']),
						gte(invoiceTable.createdAt, trendWeeks[0].start),
						lt(invoiceTable.createdAt, thisWeekEnd)
					)
				),
			db.select().from(adminConfigTable).limit(1)
		]);

		// Margin per week: the same platform-fee estimate as the shift pipeline, on shifts worked.
		const fee = resolveAdminFee({
			overrideAmount: null,
			overrideType: null,
			platformAmount: config?.adminPaymentFee,
			platformType: config?.adminPaymentFeeType
		});
		const filledByWeek = new Map<string, typeof shifts>();
		for (const s of shifts) {
			if (s.status !== 'FILLED') continue;
			const k = weekKey(s.dayStart);
			filledByWeek.set(k, [...(filledByWeek.get(k) ?? []), s]);
		}
		const marginCents = new Map(
			[...filledByWeek].map(([k, list]) => [k, summarizePipeline(list, { amount: fee.amount, type: fee.type }).FILLED.marginCents])
		);

		const invoiceRows = invoices.filter((i) => i.createdAt).map((i) => ({ clientId: i.clientId, total: Number(i.total) || 0, createdAt: i.createdAt! }));
		const clientIds = [...new Set(invoiceRows.map((i) => i.clientId))];
		// client_companies.client_id isn't unique: take the oldest company's name.
		const companies = clientIds.length
			? await db
					.selectDistinctOn([clientCompanyTable.clientId], { clientId: clientCompanyTable.clientId, name: clientCompanyTable.companyName })
					.from(clientCompanyTable)
					.where(inArray(clientCompanyTable.clientId, clientIds))
					.orderBy(clientCompanyTable.clientId, clientCompanyTable.createdAt)
			: [];
		const names = new Map(companies.map((c) => [c.clientId, c.name ?? 'Unnamed practice']));

		return {
			fillRate: fillRateByWeek(shifts, trendWeeks),
			money: moneyByWeek(invoiceRows, marginCents, trendWeeks),
			shiftsByStatus: shiftsByStatusWeek(shifts, statusWeeks, now),
			topPractices: topPractices(invoiceRows, names)
		};
	});
}

/** Agreements still needing work, for practices that aren't denied or inactive. */
export function adminAgreements(scope: DashboardScope) {
	requireAll(scope);
	return settle('agreements', async (): Promise<AgreementStatus> => {
		const [clients, requests, uploads] = await Promise.all([
			db
				.selectDistinctOn([clientProfileTable.id], {
					clientId: clientProfileTable.id,
					createdAt: clientProfileTable.createdAt,
					name: clientCompanyTable.companyName
				})
				.from(clientProfileTable)
				.leftJoin(clientCompanyTable, eq(clientCompanyTable.clientId, clientProfileTable.id))
				.where(inArray(clientProfileTable.status, ['PENDING', 'ACTIVE']))
				.orderBy(clientProfileTable.id, clientCompanyTable.createdAt),
			db
				.select({
					clientId: signatureRequestTable.clientId,
					status: signatureRequestTable.status,
					sentAt: signatureRequestTable.sentAt,
					subjectSignedAt: signatureRequestTable.subjectSignedAt,
					createdAt: signatureRequestTable.createdAt
				})
				.from(signatureRequestTable)
				.where(and(eq(signatureRequestTable.kind, 'CLIENT_AGREEMENT'), sql`${signatureRequestTable.clientId} is not null`))
				.orderBy(desc(signatureRequestTable.createdAt)),
			db
				.selectDistinct({ clientId: clientDocumentUploadsTable.clientId })
				.from(clientDocumentUploadsTable)
				.where(eq(clientDocumentUploadsTable.type, 'AGREEMENT'))
		]);

		const latest = new Map<string, (typeof requests)[number]>();
		const completed = new Set<string>();
		for (const r of requests) {
			if (!r.clientId) continue;
			if (!latest.has(r.clientId)) latest.set(r.clientId, r);
			if (r.status === 'COMPLETED') completed.add(r.clientId);
		}
		const uploaded = new Set(uploads.map((u) => u.clientId).filter(Boolean) as string[]);

		const practices: AgreementPractice[] = clients.map((c) => ({
			clientId: c.clientId,
			name: c.name || 'Unnamed practice',
			clientCreatedAt: c.createdAt,
			latest: latest.get(c.clientId) ?? null,
			everCompleted: completed.has(c.clientId),
			hasUploadedAgreement: uploaded.has(c.clientId)
		}));
		return agreementStatus(practices);
	});
}
