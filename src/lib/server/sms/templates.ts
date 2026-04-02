export const templates = {
	workday_reminder_48hr: (vars: {
		candidateFirstName: string;
		date: string;
		startTime: string;
		companyName: string;
		locationName: string;
	}) =>
		`Hi ${vars.candidateFirstName}, this is a reminder that you have a shift at ${vars.companyName} (${vars.locationName}) on ${vars.date} at ${vars.startTime}. Reply STOP to opt out.`,

	timesheet_available: (vars: {
		candidateFirstName: string;
		weekBeginDate: string;
		companyName: string;
	}) =>
		`Hi ${vars.candidateFirstName}, your timesheet for the week of ${vars.weekBeginDate} at ${vars.companyName} is ready to submit. Please log in to complete it. Reply STOP to opt out.`,

	timesheet_approved: (vars: {
		candidateFirstName: string;
		weekBeginDate: string;
		companyName: string;
	}) =>
		`Hi ${vars.candidateFirstName}, your timesheet for the week of ${vars.weekBeginDate} at ${vars.companyName} has been approved. Reply STOP to opt out.`,

	timesheet_discrepancy: (vars: {
		candidateFirstName: string;
		weekBeginDate: string;
		companyName: string;
	}) =>
		`Hi ${vars.candidateFirstName}, there is a discrepancy on your timesheet for the week of ${vars.weekBeginDate} at ${vars.companyName}. Please log in to review and resubmit. Reply STOP to opt out.`,

	timesheet_reminder: (vars: {
		candidateFirstName: string;
		weekBeginDate: string;
		companyName: string;
	}) =>
		`Hi ${vars.candidateFirstName}, your timesheet for the week of ${vars.weekBeginDate} at ${vars.companyName} has not been submitted yet. Please log in to complete it. Reply STOP to opt out.`,

	candidate_approved: (vars: { candidateFirstName: string }) =>
		`Hi ${vars.candidateFirstName}, your Dental Temp Staffing Solutions profile has been approved. You can now browse and apply for available positions. Reply STOP to opt out.`,

	candidate_assigned_to_workday: (vars: {
		candidateFirstName: string;
		date: string;
		startTime: string;
		endTime: string;
		companyName: string;
		locationName: string;
	}) =>
		`Hi ${vars.candidateFirstName}, you have been assigned to a shift at ${vars.companyName} (${vars.locationName}) on ${vars.date} from ${vars.startTime} to ${vars.endTime}. Reply STOP to opt out.`,

	candidate_unassigned_from_workday: (vars: {
		candidateFirstName: string;
		date: string;
		companyName: string;
	}) =>
		`Hi ${vars.candidateFirstName}, you have been removed from your shift at ${vars.companyName} on ${vars.date}. Please log in for more details. Reply STOP to opt out.`
} as const;

export type TemplateName = keyof typeof templates;

export type TemplateVariables = {
	[K in TemplateName]: Parameters<(typeof templates)[K]>[0];
};
