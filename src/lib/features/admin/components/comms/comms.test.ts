import { describe, expect, it } from 'vitest';
import {
	campaignPending,
	canCancelCampaign,
	canRetryCampaign,
	exportHref,
	hasRecordHistoryFilters,
	plural,
	recipientName,
	recordHistoryUrl,
	shortId
} from './comms';

const none = { search: '', startDate: '', endDate: '', entityType: '', action: '', role: '', source: '' };

describe('mass notification helpers', () => {
	it('counts pending recipients and never goes negative', () => {
		expect(campaignPending({ recipientCount: 10, sentCount: 6, failedCount: 1 })).toBe(3);
		expect(campaignPending({ recipientCount: 1, sentCount: 1, failedCount: 1 })).toBe(0);
	});

	it('offers cancel only while unfinished, retry only after with failures', () => {
		expect(canCancelCampaign('QUEUED')).toBe(true);
		expect(canCancelCampaign('SENDING')).toBe(true);
		expect(canCancelCampaign('DRAFT')).toBe(true);
		expect(canCancelCampaign('COMPLETED')).toBe(false);
		expect(canRetryCampaign({ status: 'COMPLETED', failedCount: 2 })).toBe(true);
		expect(canRetryCampaign({ status: 'SENDING', failedCount: 2 })).toBe(false);
		expect(canRetryCampaign({ status: 'COMPLETED', failedCount: 0 })).toBe(false);
	});

	it('formats names and plurals', () => {
		expect(recipientName({ firstName: 'Maria', lastName: null })).toBe('Maria');
		expect(recipientName({ firstName: null, lastName: null })).toBe('—');
		expect(plural(1, 'failed send')).toBe('1 failed send');
		expect(plural(3, 'failed send')).toBe('3 failed sends');
	});
});

describe('exportHref', () => {
	it('adds only the dates that are set', () => {
		expect(exportHref('affiliate-ledger', '', '')).toBe('/admin/menu/exports/affiliate-ledger');
		expect(exportHref('affiliate-ledger', '2026-01-01', '')).toBe('/admin/menu/exports/affiliate-ledger?from=2026-01-01');
		expect(exportHref('payouts', '2026-01-01', '2026-01-31')).toBe('/admin/menu/exports/payouts?from=2026-01-01&to=2026-01-31');
	});
});

describe('record history URL', () => {
	it('is the bare path with no filters on page 1', () => {
		expect(recordHistoryUrl(none)).toBe('/admin/menu/record-history');
		expect(hasRecordHistoryFilters(none)).toBe(false);
	});

	it('keeps the params the load reads, plus page and a non-default page size', () => {
		const url = recordHistoryUrl({ ...none, search: ' maria ', action: 'VIEW' }, 3, 100);
		expect(url).toBe('/admin/menu/record-history?search=maria&action=VIEW&page=3&pageSize=100');
		expect(hasRecordHistoryFilters({ ...none, role: 'CLIENT' })).toBe(true);
	});

	it('shortens long ids', () => {
		expect(shortId('abc')).toBe('abc');
		expect(shortId('0123456789abcdefghijkl')).toBe('0123456789abcdefgh…');
	});
});
