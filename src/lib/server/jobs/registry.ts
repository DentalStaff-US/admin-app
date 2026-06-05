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
		rule: () => ny({ minute: 0, second: 0 })
	},
	{
		name: 'processOutdatedRequisitions',
		endpoint: '/jobs/requisitions/processPastRequisitions',
		schedule: 'daily at 1:00 AM ET',
		rule: () => ny({ hour: 1, minute: 0, second: 0 }),
		enabled: false
	}
];
