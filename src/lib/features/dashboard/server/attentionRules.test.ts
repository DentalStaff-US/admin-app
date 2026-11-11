import { describe, expect, it } from 'vitest';
import {
	complianceItem,
	dueInvoiceItem,
	overdueInvoiceItem,
	pendingTimesheetItem,
	permApplicantsItem,
	unbilledPlacementItem,
	unfilledSoonItem,
	type TimesheetRow
} from './attentionRules';

const NOW = new Date('2026-11-10T15:00:00Z'); // Tue 10am ET

const sheet: TimesheetRow = {
	id: 'ts1',
	weekBeginDate: '2026-11-01',
	totalHoursWorked: '32.5',
	since: new Date('2026-11-08T15:00:00Z'),
	candidateFirstName: 'Maria',
	candidateLastName: 'Chen',
	companyName: 'Bright Smiles',
	disciplineName: 'Hygienist',
	locationName: 'Tampa'
};

describe('unfilledSoonItem', () => {
	it('links the exact request and says when, in its timezone', () => {
		const i = unfilledSoonItem(
			{
				id: 'rd1',
				requisitionId: 42,
				createdAt: new Date('2026-11-07T15:00:00Z'),
				dayStart: new Date('2026-11-11T12:30:00Z'),
				dayEnd: new Date('2026-11-11T21:00:00Z'),
				timezone: 'America/New_York',
				disciplineName: 'Hygienist',
				companyName: 'Bright Smiles',
				locationName: 'Tampa'
			},
			NOW
		);
		expect(i).toMatchObject({ id: 'UNFILLED_SOON:rd1', href: '/requisitions/42', title: 'Hygienist · Bright Smiles', location: 'Tampa' });
		expect(i.detail).toContain('Tomorrow 7:30 AM–4 PM');
		expect(i.action.label).toBe('Find coverage');
	});
});

describe('pendingTimesheetItem', () => {
	it('offers inline Approve, behind a confirmation, when allowed', () => {
		const i = pendingTimesheetItem(sheet, { audience: 'practice', canApprove: true });
		expect(i.action.form?.action).toBe('?/approveTimesheet');
		expect(i.action.form?.fields).toEqual({ timesheetId: 'ts1' });
		expect(i.action.form?.confirm?.title).toBe("Approve M. Chen's hours?");
		expect(i.secondary?.href).toBe('/timesheets/ts1');
	});

	it('shows View and who it waits on when the user can’t approve', () => {
		const i = pendingTimesheetItem(sheet, { audience: 'practice', canApprove: false, approverName: 'Dana (owner)' });
		expect(i.action.form).toBeUndefined();
		expect(i.action.label).toBe('View');
		expect(i.note).toBe('Waiting on Dana (owner)');
	});
});

describe('invoices', () => {
	const row = {
		id: 'inv1',
		invoiceNumber: '1043',
		amountRemaining: '820.00',
		dueDate: new Date('2026-11-13T15:00:00Z'),
		createdAt: new Date('2026-10-30T15:00:00Z'),
		companyName: null,
		hostedUrl: 'https://invoice.stripe.com/x'
	};

	it('offers the Stripe pay link to Stripe-billed practices', () => {
		const i = dueInvoiceItem({ ...row, invoiceMethod: 'STRIPE' }, NOW);
		expect(i.detail).toBe('$820.00 · due in 3 days');
		expect(i.action).toMatchObject({ label: 'Pay invoice', external: true });
	});

	it('never offers a Stripe link to a PAPER practice, even with a live customer', () => {
		const i = dueInvoiceItem({ ...row, invoiceMethod: 'PAPER' }, NOW);
		expect(i.action).toEqual({ label: 'View invoice', href: '/invoices/inv1' });
	});

	it('says how late an overdue invoice is', () => {
		const i = overdueInvoiceItem({ ...row, dueDate: new Date('2026-10-20T15:00:00Z'), companyName: 'Coastal Dental' }, 'admin', NOW);
		expect(i.title).toBe('Invoice #1043 overdue · Coastal Dental');
		expect(i.detail).toBe('$820.00 · 21 days past due');
	});
});

describe('unbilledPlacementItem', () => {
	it('sends the action to the request’s invoices', () => {
		const i = unbilledPlacementItem({ id: 7, disciplineName: 'Assistant', companyName: 'Coastal Dental', since: new Date('2026-11-04T15:00:00Z') }, NOW);
		expect(i.action).toMatchObject({ label: 'Create invoice', href: '/requisitions/7?tab=invoices' });
		expect(i.detail).toBe('Hired 6d ago · no invoice raised');
	});
});

describe('permApplicantsItem', () => {
	it('words the row per audience', () => {
		const row = { requisitionId: 9, disciplineName: 'Hygienist', companyName: 'Coastal', locationName: null, waiting: 3, oldest: new Date('2026-11-05T15:00:00Z') };
		expect(permApplicantsItem(row, 'admin', NOW).title).toBe('3 applicants waiting · Hygienist (permanent)');
		expect(permApplicantsItem(row, 'practice', NOW).title).toBe('3 applicants for Hygienist (permanent)');
		expect(permApplicantsItem(row, 'practice', NOW).action.href).toBe('/requisitions/9?tab=applications');
	});
});

describe('complianceItem', () => {
	const row = {
		subjectId: 'p1',
		subjectName: 'Maria Chen',
		ruleKey: 'LICENSE:rdh',
		severity: 'CRITICAL' as const,
		title: 'License · Hygienist (RDH)',
		detail: 'License expired 2026-11-01',
		dueOn: '2026-11-01',
		upcomingShiftCount: 2,
		remindable: true,
		remindedAt: null
	};

	it('reuses the compliance page’s Remind action', () => {
		const i = complianceItem(row, NOW);
		expect(i.kind).toBe('COMPLIANCE_CRITICAL');
		expect(i.detail).toContain('booked on 2 upcoming shifts');
		expect(i.action.form).toEqual({ action: '/admin/compliance?/sendReminder', fields: { candidateId: 'p1', ruleKey: 'LICENSE:rdh' } });
	});

	it('explains a throttled reminder instead of a bare disabled button', () => {
		const i = complianceItem({ ...row, remindedAt: '2026-11-10T12:00:00Z' }, NOW);
		expect(i.action.disabledReason).toBe('Reminded 3h ago. You can send another tomorrow.');
	});
});
