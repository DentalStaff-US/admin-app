/**
 * Derived state both timesheet views read from the page data, so the admin
 * and practice components can't drift on what "hours", "rate" or "total" mean.
 */
import {
	billingSummary,
	buildDayTable,
	requisitionTimeZone,
	timeZoneName,
	weekRangeLabel,
	type HoursRawEntry
} from './timesheets';

/** The bits of the timesheet page load both views use. */
export type TimesheetPageData = {
	user: { role: string };
	timesheet: any;
	requisition: any;
	workdays: any[];
	recurrenceDays: any[];
	invoice: { id: string; invoiceType?: string | null } | null;
	expenses: any[];
	adminFeeSettings: any;
	addExpenseForm: any;
	hasUnfinishedWorkdays?: boolean;
	unfinishedWorkdayCount?: number;
	priorWeekHours?: number;
	auditHistory?: any[];
	invoiceMethod?: 'PAPER' | 'STRIPE' | null;
};

export const FALLBACK_FEE = {
	amount: 0,
	type: 'PERCENTAGE' as const,
	source: 'PLATFORM' as const,
	label: 'Admin Fee',
	overrideAmount: null,
	overrideType: null,
	platformAmount: 0,
	platformType: 'PERCENTAGE' as const,
	frozen: false
};

export function timesheetView(data: TimesheetPageData, billableHours?: number) {
	const t = data.timesheet ?? {};
	const status: string = t.status ?? 'DRAFT';
	const timeZone = requisitionTimeZone(data.requisition);
	const fee = data.adminFeeSettings ?? FALLBACK_FEE;
	const expenses = data.expenses ?? [];
	const approvedExpenses = expenses.filter((e) => e.status === 'APPROVED');
	const pendingExpenses = expenses.filter((e) => e.status === 'PENDING');
	const hours = billableHours ?? (parseFloat(t.totalHoursWorked || '0') || 0);
	const rate = Number(t.adjustedHourlyRate ?? t.hourlyRate ?? 0);
	const priorWeekHours = data.priorWeekHours ?? 0;
	const scheduledDates: string[] = (data.workdays ?? []).map((w) => w?.recurrenceDay?.date).filter(Boolean);
	const name = `${t.candidate?.firstName ?? ''} ${t.candidate?.lastName ?? ''}`.trim() || 'Professional';
	const discipline: string = data.requisition?.discipline?.name ?? data.requisition?.title ?? 'Request';

	return {
		status,
		isDraft: status === 'DRAFT',
		isPending: status === 'PENDING',
		isDiscrepancy: status === 'DISCREPANCY',
		isApproved: status === 'APPROVED',
		isVoid: status === 'VOID',
		isRejected: status === 'REJECTED',
		timeZone,
		timeZoneLabel: timeZoneName(timeZone),
		week: weekRangeLabel(t.weekBeginDate),
		name,
		discipline,
		requisitionId: data.requisition?.id ?? t.requisitionId ?? null,
		fee,
		expenses,
		approvedExpenses,
		pendingExpenses,
		scheduledDates,
		summary: billingSummary({
			hours,
			rate,
			priorWeekHours,
			adminFee: { amount: Number(fee.amount) || 0, type: fee.type },
			approvedExpensesTotal: approvedExpenses.reduce((s, e) => s + e.amountCents / 100, 0)
		}),
		days: buildDayTable({
			scheduledDates,
			scheduledDays: data.recurrenceDays ?? [],
			hoursRaw: (t.hoursRaw ?? []) as HoursRawEntry[],
			timeZone,
			priorWeekHours,
			flagMissing: status !== 'DRAFT'
		})
	};
}
