import type { RecurrenceRule } from 'node-schedule';

export type JobDefinition = {
	name: string;
	endpoint: string;
	schedule: string;
	rule: () => Partial<RecurrenceRule>;
	enabled?: boolean;
};

const ny = (rule: Partial<RecurrenceRule>): Partial<RecurrenceRule> => ({
	...rule,
	tz: 'America/New_York'
});

export const jobs: JobDefinition[] = [
	{
		name: 'processPastRecurrenceDays',
		endpoint: '/jobs/requisitions/processPastRecurrenceDays',
		schedule: 'daily at 12:00 AM ET',
		rule: () => ny({ hour: 0, minute: 0, second: 0 })
	},
	{
		name: 'processInvoiceReminders',
		endpoint: '/jobs/invoices/processInvoiceReminders',
		schedule: 'daily at 7:00 AM ET',
		rule: () => ny({ hour: 7, minute: 0, second: 0 })
	},
	{
		name: 'processWorkday48HrReminder',
		endpoint: '/jobs/requisitions/processWorkday48HrReminder',
		schedule: 'hourly on the hour',
		rule: () => ny({ minute: 0, second: 0 })
	},
	{
		name: 'processTimesheetCreation',
		endpoint: '/jobs/timesheets/processTimesheetCreation',
		schedule: 'every 5 minutes',
		rule: () => ny({ minute: [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55] })
	},
	{
		name: 'processTimesheetAutoApproval',
		endpoint: '/jobs/timesheets/processTimesheetAutoApproval',
		schedule: 'hourly on the hour',
		rule: () => ny({ minute: 0, second: 0 }),
		enabled: true
	},
	{
		name: 'processOutdatedRequisitions',
		endpoint: '/jobs/requisitions/processPastRequisitions',
		schedule: 'daily at 1:00 AM ET',
		rule: () => ny({ hour: 1, minute: 0, second: 0 }),
		enabled: false
	},
	{
		name: 'processCampaignQueue',
		endpoint: '/jobs/campaigns/processQueue',
		schedule: 'every minute',
		rule: () => ny({ second: 0 })
	},
	// Onboarding lifecycle nudges. Each of these only *enqueues* a campaign;
	// processCampaignQueue above does the sending, so they stay fast and the
	// recipients get batching, throttling and the unsubscribe footer.
	{
		name: 'processDocumentsMissingNudge',
		endpoint: '/jobs/onboarding/processDocumentsMissingNudge',
		schedule: 'weekly, Tuesday 10:00 AM ET',
		rule: () => ny({ dayOfWeek: 2, hour: 10, minute: 0, second: 0 })
	},
	{
		name: 'processStalledOnboarding',
		endpoint: '/jobs/onboarding/processStalledOnboarding',
		schedule: 'daily at 10:15 AM ET',
		rule: () => ny({ hour: 10, minute: 15, second: 0 })
	},
	// Monthly affiliate payout run. Settles the cohort that matured on the 1st
	// (March payments pay out May 1). Guarded by an advisory lock — a double run
	// would double-pay.
	{
		name: 'processAffiliatePayouts',
		endpoint: '/jobs/affiliates/processPayouts',
		schedule: 'monthly, 1st at 4:00 AM ET',
		rule: () => ny({ date: 1, hour: 4, minute: 0, second: 0 })
	},
	// Nightly finance sweep: re-syncs Connect flags from Stripe for every
	// connected affiliate (catches missed account.updated webhooks) and retries
	// recently FAILED payouts (e.g. after a platform-balance top-up). Runs at
	// 3:30 so it never overlaps the 4:00 monthly payout on the 1st.
	{
		name: 'reconcileAffiliateFinance',
		endpoint: '/jobs/affiliates/reconcileFinance',
		schedule: 'daily at 3:30 AM ET',
		rule: () => ny({ hour: 3, minute: 30, second: 0 })
	},
	// "Your payout is coming" heads-up, a few days before the 1st.
	{
		name: 'notifyUpcomingAffiliatePayouts',
		endpoint: '/jobs/affiliates/notifyUpcomingPayouts',
		schedule: 'monthly, 26th at 10:00 AM ET',
		rule: () => ny({ date: 26, hour: 10, minute: 0, second: 0 })
	},
	// Re-derives affiliate eligibility from client/candidate profile status.
	// Needed because statuses are also edited directly in the DB during support
	// work and by import scripts, where the in-app sync hooks cannot see them.
	{
		name: 'reconcileAffiliateEligibility',
		endpoint: '/jobs/affiliates/reconcileEligibility',
		schedule: 'daily at 3:00 AM ET',
		rule: () => ny({ hour: 3, minute: 0, second: 0 })
	},
	{
		name: 'processPendingApprovalTouchpoint',
		endpoint: '/jobs/onboarding/processPendingApprovalTouchpoint',
		schedule: 'monthly, 1st at 10:30 AM ET',
		rule: () => ny({ date: 1, hour: 10, minute: 30, second: 0 })
	}
];
