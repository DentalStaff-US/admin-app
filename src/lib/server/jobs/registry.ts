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
	// --- Certification / registration expiry -------------------------------
	// 11:00 ET = 8:00 PT, the earliest slot that is inside TCPA quiet hours
	// (8am-9pm LOCAL) in every US timezone. The D7/D0/EXPIRED stages send SMS, so
	// the usual 7-9am ET window would text Pacific professionals at 4-6am.
	{
		name: 'processCertExpiryReminders',
		endpoint: '/jobs/certifications/processCertExpiryReminders',
		schedule: 'daily at 11:00 AM ET',
		rule: () => ny({ hour: 11, minute: 0, second: 0 })
	},
	// DAILY, and at 11:15 rather than the old Tuesday 10:30, for two reasons.
	//
	// Daily: the gate blocks the moment a 30-day grace clock runs out, evaluated on
	// every job query — but the "your shifts are now hidden" notice only goes out
	// when this job runs. Weekly meant someone could lose their work on a Wednesday
	// and not be told why until the following Tuesday. Nothing here re-sends on a
	// re-run (the grace insert is ON CONFLICT DO NOTHING, the block notice is
	// stamped before sending, and the recurring nudge carries its own 13-day
	// suppression), so running daily costs no extra mail and closes that window to
	// under a day.
	//
	// 11:15: this job stopped being email-only when the grace clock landed — the
	// block notice sends SMS. 10:30 ET is 7:30 PT, inside TCPA quiet hours on the
	// west coast. 11:00 ET is the earliest slot that is past 8am LOCAL everywhere in
	// the US, and 11:15 keeps it off the same tick as processCertExpiryReminders.
	{
		name: 'processMissingCredentialNudge',
		endpoint: '/jobs/certifications/processMissingCredentialNudge',
		schedule: 'daily at 11:15 AM ET',
		rule: () => ny({ hour: 11, minute: 15, second: 0 })
	},
	// Internal digest. Monday morning so staff start the week with the list.
	{
		name: 'processCertExpiryAdminDigest',
		endpoint: '/jobs/certifications/processCertExpiryAdminDigest',
		schedule: 'weekly, Monday 7:30 AM ET',
		rule: () => ny({ dayOfWeek: 1, hour: 7, minute: 30, second: 0 })
	},
	{
		name: 'processPendingApprovalTouchpoint',
		endpoint: '/jobs/onboarding/processPendingApprovalTouchpoint',
		schedule: 'monthly, 1st at 10:30 AM ET',
		rule: () => ny({ date: 1, hour: 10, minute: 30, second: 0 })
	}
];
