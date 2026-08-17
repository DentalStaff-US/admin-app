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
	{
		name: 'processPendingApprovalTouchpoint',
		endpoint: '/jobs/onboarding/processPendingApprovalTouchpoint',
		schedule: 'monthly, 1st at 10:30 AM ET',
		rule: () => ny({ date: 1, hour: 10, minute: 30, second: 0 })
	}
];
