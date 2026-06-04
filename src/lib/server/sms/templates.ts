export const SMS_TEMPLATES = {
	newRequisitionNotification: () => ({
		textMessage: `Hello, DTSS has a new job that matches your credentials and availability. Please log into your profile or call us at 888-653-1657 to accept this assignment.`
	}),
	candidateAssignedNotification: (vars: {
		firstName: string;
		daysLanguage: string;
		disciplineName: string;
		requisitionNumber: number;
		loginUrl: string;
	}) => ({
		textMessage: `${vars.firstName}, you have been assigned by DTSS to requisition #${vars.requisitionNumber}: ${vars.disciplineName} for ${vars.daysLanguage}. 
		
		Please log in to DTSS to verify your shift start times: ${vars.loginUrl}
		
		Thanks for working with Dental Temps Staffing Solutions.`
	}),
	workdayFilledNotification: (vars: {
		scheduledDate: string;
		requisitionName: string;
		assignedCandidate: string;
	}) => ({
		textMessage: `A day (${vars.scheduledDate}) on ${vars.requisitionName} was accepted by ${vars.assignedCandidate}.`
	}),
	workdayChangeNotification: (vars: { requisitionNumber: number; scheduledDate: string }) => ({
		textMessage: `A change has been made to your upcoming requisition (#${vars.requisitionNumber}) on ${vars.scheduledDate}. Please sign in to review your schedule.`
	}),
	requisitionChangeNotification: (vars: { requisitionNumber: number }) => ({
		textMessage: `Changes to Req. #${vars.requisitionNumber} have been made, please review it at your earliest convenience to ensure you are informed of these changes, thanks DTSS Management.`
	}),
	workdayRepostedNotification: (vars: {
		assignedCandidate: string;
		scheduledDate: string;
		requisitionNumber: number;
		clientName: string;
	}) => ({
		textMessage: `Dear ${vars.clientName}, unfortunately ${vars.assignedCandidate} had to repost (${vars.scheduledDate}) on Req. #${vars.requisitionNumber}. We are working on re-filling this day. DTSS`
	}),
	workday48HrReminderNotification: (vars: {
		assignedCandidate: string;
		scheduledDate: string;
		requisitionName: string;
	}) => ({
		textMessage: `${vars.assignedCandidate}, this is a reminder for DTSS ${vars.requisitionName} on ${vars.scheduledDate}. Please arrive 15 minutes prior to your start time and have a great day.`
	}),
	timesheetGeneratedNotification: (vars: {
		assignedCandidate: string;
		requisitionNumber: number;
	}) => ({
		textMessage: `Hello ${vars.assignedCandidate}. A timesheet ${vars.requisitionNumber} has been created and must be filled out when you have completed the work day.`
	}),
	requisitionCancelledNotification: (vars: {
		requisitionNumber: number;
		associatedCandidate: string;
	}) => ({
		textMessage: `Dear ${vars.associatedCandidate}, we regret to inform you that Req. #${vars.requisitionNumber} has been cancelled.`
	}),
	applicationApprovedNotification: (vars: { discipline: string; company: string }) => ({
		textMessage: `Good news — your application for ${vars.discipline} at ${vars.company} was approved. Check the candidate app for next steps.`
	}),
	applicationDeniedNotification: (vars: { discipline: string; company: string }) => ({
		textMessage: `Thank you for applying for ${vars.discipline} at ${vars.company}. This business has moved forward with another application. We hope to have more positions available soon.`
	})
} as const;

export type TemplateName = keyof typeof SMS_TEMPLATES;

export type TemplateVariables = {
	[K in TemplateName]: Parameters<(typeof SMS_TEMPLATES)[K]>[0];
};
