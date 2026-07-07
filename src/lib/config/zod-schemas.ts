import { z } from 'zod';
import { isValidUSPhone, usPhoneField } from '$lib/_helpers/phone';

export type Primitive = string | number | boolean | null;

export type JsonType = Primitive | { [key: PropertyKey]: JsonType } | JsonType[];

export const zJsonString = z.string().transform((str, ctx): JsonType => {
	try {
		return JSON.parse(str);
	} catch (e) {
		ctx.addIssue({ code: 'custom', message: 'Invalid JSON' });
		return z.NEVER;
	}
});

export const userSchema = z.object({
	firstName: z
		.string({ required_error: 'First Name is required' })
		.min(1, { message: 'First Name is required' })
		.trim(),
	lastName: z
		.string({ required_error: 'Last Name is required' })
		.min(1, { message: 'Last Name is required' })
		.trim(),
	email: z
		.string({ required_error: 'Email is required' })
		.email({ message: 'Please enter a valid email address' }),
	password: z
		.string({ required_error: 'Password is required' })
		.min(6, { message: 'Password must be at least 6 characters' })
		.trim(),
	confirmPassword: z
		.string({ required_error: 'Password is required' })
		.min(6, { message: 'Password must be at least 6 characters' })
		.trim(),
	//terms: z.boolean({ required_error: 'You must accept the terms and privacy policy' }),
	role: z.enum(['CANDIDATE', 'CLIENT', 'SUPERADMIN'], { required_error: 'You must have a role' }),
	verified: z.boolean().default(false),
	terms: z.literal<boolean>(true, {
		errorMap: () => ({ message: 'You must accept the terms & privacy policy' })
	}),
	token: z.string().optional(),
	receiveEmail: z.boolean().default(true),
	createdAt: z.date().optional(),
	updatedAt: z.date().optional()
});

export const clientProfileSchema = z.object({
	birthday: z.coerce.date().nullable().optional(),
	cell_phone: usPhoneField().nullable().optional()
});

export type UserSchema = typeof userSchema;

export const userResetPasswordSchema = userSchema
	.pick({ password: true, confirmPassword: true })
	.superRefine(({ confirmPassword, password }, ctx) => {
		if (confirmPassword !== password) {
			ctx.addIssue({
				code: 'custom',
				message: 'Password and Confirm Password must match',
				path: ['password']
			});
			ctx.addIssue({
				code: 'custom',
				message: 'Password and Confirm Password must match',
				path: ['confirmPassword']
			});
		}
	});

export type UserResetPasswordSchema = typeof userResetPasswordSchema;

export const userUpdatePasswordSchema = z
	.object({ password: z.string(), newPassword: z.string(), confirmPassword: z.string() })
	.superRefine(({ confirmPassword, newPassword }, ctx) => {
		if (confirmPassword !== newPassword) {
			ctx.addIssue({
				code: 'custom',
				message: 'Password and Confirm Password must match',
				path: ['confirmPassword']
			});
		}
	});

export type UserUpdatePasswordSchema = typeof userUpdatePasswordSchema;

export const clientCompanySchema = z.object({
	companyName: z.string().min(1, { message: 'Company Name is required' }).trim(),
	companyDescription: z.string(),
	baseLocation: z.string(),
	operatingHours: z.string(),
	companyLogo: z.string()
});

export type ClientCompanySchema = typeof clientCompanySchema;

export const clientCompanyLocationSchema = z.object({
	companyId: z.string(),
	name: z.string(),
	streetOne: z.string().optional(),
	streetTwo: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	zipcode: z.string().optional(),
	companyPhone: usPhoneField().nullable().optional(),
	hoursOfOperation: z.string().optional(),
	email: z.string().optional(),
	phoneNumber: usPhoneField().nullable().optional(),
	phoneNumberType: z.union([z.literal('cell'), z.literal('office')]).optional(),
	timezone: z.string().optional(),
	lat: z.number().optional(),
	lon: z.number().optional(),
	completeAddress: z.string().optional()
});

export const newClientCompanyLocationSchema = z.object({
	companyId: z.string(),
	name: z.string(),
	companyPhone: usPhoneField().nullable().optional(),
	hoursOfOperation: z.string().optional(),
	streetOne: z.string().optional(),
	streetTwo: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	zipcode: z.string().optional(),
	email: z.string().optional(),
	phoneNumber: usPhoneField().nullable().optional(),
	phoneNumberType: z.union([z.literal('cell'), z.literal('office')]).optional(),
	timezone: z.string().optional(),
	lat: z.number(),
	lon: z.number(),
	completeAddress: z.string()
});

export type NewClientCompanyLocationSchema = typeof newClientCompanyLocationSchema;
export type CompanyLocationSchema = typeof clientCompanyLocationSchema;

export const newDisciplineSchema = z.object({
	name: z.string().min(1),
	abbreviation: z.string().min(1)
});

export const editDisciplineSchema = z.object({
	id: z.string().min(1),
	name: z.string().min(1),
	abbreviation: z.string().min(1)
});

export const deleteDisciplineSchema = z.object({
	id: z.string().min(1)
});

export type NewDisciplineSchema = typeof newDisciplineSchema;

export const newSkillSchema = z.object({
	name: z.string(),
	categoryId: z.string()
});

export type NewSkillSchema = typeof newSkillSchema;

export const newCategorySchema = z.object({
	name: z.string()
});

export type NewCategorySchema = typeof newSkillSchema;

export const deleteCategorySchema = z.object({
	id: z.string()
});
export type DeleteCategorySchema = typeof deleteCategorySchema;

export const newExperienceLevelSchema = z.object({
	value: z.string()
});

export type NewExperienceLevelSchema = typeof newExperienceLevelSchema;

export const adminRequisitionSchema = z.object({
	title: z.string(),
	clientId: z.string(),
	locationId: z.string(),
	disciplineId: z.string(),
	hourlyRate: z.string(),
	experienceLevelId: z.string().optional(),
	jobDescription: z.string(),
	specialInstructions: z.string().optional(),
	permanentPosition: z.boolean().default(false),
	timezone: z.string(),
	purchaseOrderNumber: z.string().optional()
});

export type AdminRequisitionSchema = typeof adminRequisitionSchema;

export const clientRequisitionSchema = z.object({
	title: z.string(),
	clientId: z.string(),
	locationId: z.string(),
	disciplineId: z.string(),
	hourlyRate: z.string(),
	experienceLevelId: z.string().optional(),
	jobDescription: z.string(),
	specialInstructions: z.string().optional(),
	permanentPosition: z.boolean().default(false),
	timezone: z.string(),
	purchaseOrderNumber: z.string().optional()
});

export type ClientRequisitionSchema = typeof clientRequisitionSchema;

// 24-hour HH:mm (e.g. "08:30", "17:00"). Shift times are stored/submitted in
// this format; anything else is a malformed input.
const HHMM_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const toMinutes = (t: string) => {
	const [h, m] = t.split(':').map(Number);
	return h * 60 + m;
};

/**
 * Cross-field validation for a shift's start/end/lunch times. `start`/`end` are
 * required HH:mm strings; lunch fields are optional ('' or undefined = no lunch).
 *
 * Rejects malformed times, a non-positive shift (e.g. an AM/PM-inverted 8:30 PM
 * start with a 5:00 PM end — the class of misinput that put a July-2 shift on
 * July 1), and lunch that falls outside the shift window. Objective checks only:
 * no business-hours assumptions, since client operating hours aren't reliable.
 *
 * Returns a `superRefine` callback; `fields` maps the logical roles onto the
 * concrete field names used by each schema.
 */
function refineShiftTimes(fields: {
	start: string;
	end: string;
	lunchStart: string;
	lunchEnd: string;
}) {
	return (val: Record<string, unknown>, ctx: z.RefinementCtx) => {
		const start = val[fields.start] as string | undefined;
		const end = val[fields.end] as string | undefined;
		const lunchStart = val[fields.lunchStart] as string | undefined;
		const lunchEnd = val[fields.lunchEnd] as string | undefined;

		const valid = (v: string | undefined): v is string => !!v && HHMM_RE.test(v);
		const present = (v: string | undefined): v is string => !!v && v.length > 0;

		if (!valid(start)) {
			ctx.addIssue({ code: 'custom', path: [fields.start], message: 'Enter a valid start time' });
		}
		if (!valid(end)) {
			ctx.addIssue({ code: 'custom', path: [fields.end], message: 'Enter a valid end time' });
		}
		if (valid(start) && valid(end) && toMinutes(end) <= toMinutes(start)) {
			ctx.addIssue({
				code: 'custom',
				path: [fields.end],
				message: 'End time must be after start time'
			});
		}

		// Lunch is optional; only validate when the fields are actually filled in.
		if (present(lunchStart) && !HHMM_RE.test(lunchStart)) {
			ctx.addIssue({
				code: 'custom',
				path: [fields.lunchStart],
				message: 'Enter a valid lunch start time'
			});
		}
		if (present(lunchEnd) && !HHMM_RE.test(lunchEnd)) {
			ctx.addIssue({
				code: 'custom',
				path: [fields.lunchEnd],
				message: 'Enter a valid lunch end time'
			});
		}
		if (valid(lunchStart) && valid(lunchEnd)) {
			if (toMinutes(lunchEnd) <= toMinutes(lunchStart)) {
				ctx.addIssue({
					code: 'custom',
					path: [fields.lunchEnd],
					message: 'Lunch end must be after lunch start'
				});
			}
			if (
				valid(start) &&
				valid(end) &&
				(toMinutes(lunchStart) < toMinutes(start) || toMinutes(lunchEnd) > toMinutes(end))
			) {
				ctx.addIssue({
					code: 'custom',
					path: [fields.lunchStart],
					message: 'Lunch must fall within the shift'
				});
			}
		}
	};
}

const recurrenceDaySchema = z
	.object({
		requisitionId: z.number(),
		date: z.string(),
		dayStartTime: z.string(),
		dayEndTime: z.string(),
		lunchStartTime: z.string(),
		lunchEndTime: z.string()
	})
	.superRefine(
		refineShiftTimes({
			start: 'dayStartTime',
			end: 'dayEndTime',
			lunchStart: 'lunchStartTime',
			lunchEnd: 'lunchEndTime'
		})
	);

export const editRecurrenceDaySchema = z
	.object({
		date: z.string(),
		startTime: z.string(),
		endTime: z.string(),
		lunchStartTime: z.string().optional(),
		lunchEndTime: z.string().optional()
	})
	.superRefine(
		refineShiftTimes({
			start: 'startTime',
			end: 'endTime',
			lunchStart: 'lunchStartTime',
			lunchEnd: 'lunchEndTime'
		})
	);

export const newRecurrenceDaySchema = z.object({
	// The drawer submits the day list as a JSON string in a hidden field. Parse
	// and validate each day, surfacing any issue through `ctx.addIssue` (never a
	// thrown ZodError) so superforms reports an invalid form instead of 500ing.
	recurrenceDays: z.string().transform((str, ctx) => {
		let parsed: unknown;
		try {
			parsed = JSON.parse(str);
		} catch {
			ctx.addIssue({ code: 'custom', message: 'Invalid recurrence day data' });
			return z.NEVER;
		}
		const result = z
			.array(recurrenceDaySchema)
			.safeParse(Array.isArray(parsed) ? parsed : [parsed]);
		if (!result.success) {
			for (const issue of result.error.issues) {
				ctx.addIssue(issue);
			}
			return z.NEVER;
		}
		return result.data;
	})
});

export type RecurrenceDayData = z.infer<typeof recurrenceDaySchema>;
export type NewRecurrenceDaySchema = typeof newRecurrenceDaySchema;
export type EditRecurrenceDaySchema = typeof editRecurrenceDaySchema;
export const deleteRecurrenceDaySchema = z.object({ id: z.string() });
export type DeleteRecurrenceDaySchema = typeof deleteRecurrenceDaySchema;

export const changeStatusSchema = z.object({
	status: z.enum(['PENDING', 'OPEN', 'CANCELED', 'CLOSED', 'PAYMENT_REQUIRED', 'PAYMENT_RECEIVED']),
	requisitionId: z.string()
});

export type ChangeStatusSchema = typeof changeStatusSchema;

export const newRegionSchema = z.object({
	name: z.string(),
	abbreviation: z.string()
});

export type NewRegionSchema = typeof newRegionSchema;

export const newMessageSchema = z.object({
	body: z.string()
});

export type NewMessageSchema = typeof newMessageSchema;

export const newSupportTicketSchema = z.object({
	title: z.string({ required_error: 'This field is required' }).min(1, 'This field is required.'),
	actualResults: z
		.string({ required_error: 'This field is required' })
		.min(1, 'This field is required.'),
	expectedResults: z
		.string({ required_error: 'This field is required' })
		.min(1, 'This field is required.'),
	stepsToReproduce: z
		.string({ required_error: 'This field is required' })
		.min(1, 'This field is required.'),
	reportedById: z.string()
});

export type NewSupportTicketSchema = typeof newSupportTicketSchema;

export const newCandidateProfileSchema = z.object({
	hourlyRateMin: z.number().nullable().optional(),
	hourlyRateMax: z.number().nullable().optional(),
	cellPhone: usPhoneField().nullable().optional(),
	citizenship: z.string().optional(),
	birthday: z.string().optional(),
	completeAddress: z.string().optional(),
	lat: z.string().optional(),
	lon: z.string().optional()
});
export type NewCandidateProfileSchema = typeof newCandidateProfileSchema;

export const updateCandidateProfileSchema = z.object({
	firstName: z.string().optional(),
	lastName: z.string().optional(),
	email: z.string().email('Invalid email address').optional(),
	hourlyRateMin: z.number().nullable().optional(),
	hourlyRateMax: z.number().nullable().optional(),
	cellPhone: usPhoneField().nullable().optional(),
	citizenship: z.string().optional(),
	birthday: z.string().optional(),
	completeAddress: z.string().optional(),
	lat: z.string().optional(),
	lon: z.string().optional(),
	workersCompCode: z.string().nullable().optional()
});

export type UpdateCandidateProfileSchema = typeof updateCandidateProfileSchema;

export const fileUploadSchema = z.object({
	file: z.instanceof(File, { message: 'Please upload a file.' })
});

export type FileUploadSchema = typeof fileUploadSchema;

export const candidateDocumentUploadSchema = z.object({
	type: z.enum(['RESUME', 'LICENSE', 'CERTIFICATE', 'OTHER']).optional(),
	filename: z.string().optional(),
	url: z.string().optional(),
	urls: z.array(z.string()).optional(),
	createdAt: z.date().optional(),
	filesData: z
		.array(
			z.object({
				filename: z.string(),
				url: z.string()
			})
		)
		.optional()
});

export type CandidateDocumentUploadSchema = typeof candidateDocumentUploadSchema;

export const ApproveTimesheetSchema = z.object({
	id: z.string(),
	entries: z.array(
		z.object({
			workdayId: z.string().min(1, 'Workday ID is required'),
			hours: z.number().min(1, 'Hours worked is required'),
			startTime: z.string().min(1, 'Start time is required'),
			endTime: z.string().min(1, 'End time is required'),
			date: z.string().min(1, 'Date is required')
		})
	),
	totalHours: z.number().min(1, 'Total hours is required')
});

export const NewAddressSchema = z.object({
	completeAddress: z.string().min(1, 'Complete address is required'),
	lat: z.number(),
	lon: z.number(),
	streetOne: z.string().optional(),
	streetTwo: z.string().optional(),
	city: z.string().optional(),
	state: z.string().optional(),
	zipcode: z.string().optional()
});

export const ContactSchema = z.object({
	companyPhone: usPhoneField().nullable().optional(),
	email: z.string().email('Invalid email address').optional()
});

export const LocationContactDestinationSchema = z
	.object({
		type: z.enum(['EMAIL', 'SMS'], { required_error: 'Type is required' }),
		value: z.string().min(1, 'Value is required')
	})
	.superRefine((data, ctx) => {
		if (data.type === 'EMAIL') {
			if (!z.string().email().safeParse(data.value).success) {
				ctx.addIssue({
					code: z.ZodIssueCode.custom,
					path: ['value'],
					message: 'Invalid email address'
				});
			}
		} else if (!isValidUSPhone(data.value)) {
			ctx.addIssue({
				code: z.ZodIssueCode.custom,
				path: ['value'],
				message: 'Invalid US phone number'
			});
		}
	});

export const RemoveLocationContactDestinationSchema = z.object({
	id: z.string().uuid('Invalid destination id')
});

export const OperatingHoursSchema = z.object({
	operatingHours: z.string()
});

export const LocationSchema = z.object({
	timezone: z.string().min(1, 'Timezone is required')
});

export const ClientLocationDetailsSchema = NewAddressSchema.merge(ContactSchema).merge(
	z.object({
		name: z.string().min(1, 'Location name is required'),
		timezone: z.string().min(1, 'Timezone is required')
	})
);
export const CandidateStatusSchema = z.object({ status: z.string().min(1), id: z.string().min(1) });

export const updateCandidateDisciplinesSchema = z.object({
	disciplines: z
		.array(
			z
				.object({
					disciplineId: z.string().min(1, 'Discipline is required'),
					experienceLevelId: z.string().min(1, 'Experience level is required'),
					preferredHourlyMin: z.coerce.number().min(0, 'Minimum rate must be at least 0').int(),
					preferredHourlyMax: z.coerce.number().min(0, 'Maximum rate must be at least 0').int()
				})
				.refine((data) => data.preferredHourlyMax >= data.preferredHourlyMin, {
					message: 'Maximum rate must be greater than or equal to minimum rate',
					path: ['preferredHourlyMax']
				})
		)
		.min(1, 'Please select at least one discipline')
});

export const adminNewUserSchema = z.object({
	firstName: z.string(),
	lastName: z.string(),
	email: z.string().email(),
	password: z.string().min(8),
	companyName: z.string().optional()
});

export type AdminNewUserSchema = typeof adminNewUserSchema;

export const documentUrlSchema = z.object({
	type: z.enum(['RESUME', 'LICENSE', 'CERTIFICATE', 'OTHER']).optional(),
	filename: z.string().optional(),
	url: z.string().optional(),
	urls: z.array(z.string()).optional(),
	createdAt: z.date().optional(),
	filesData: zJsonString.optional()
});

export const documentResultSchema = z.array(
	z.object({
		filename: z.string(),
		url: z.string()
	})
);

export const updateClientSchema = z
	.object({
		firstName: z.string().min(1, 'First name is required').optional(),
		lastName: z.string().min(1, 'Last name is required').optional(),
		email: z.string().email('Invalid email address').optional(),
		companyName: z.string().min(1, 'Company name is required').optional(),
		baseLocation: z.string().optional().nullable(),
		cellPhone: usPhoneField().nullable().optional(),
		invoiceMethod: z.enum(['STRIPE', 'PAPER']).optional()
	})
	.refine(
		(data) => {
			// At least one field must be present for update
			return Object.values(data).some(
				(value) => value !== undefined && value !== null && value !== ''
			);
		},
		{ message: 'At least one field must be provided for update' }
	);

export type UpdateClientSchema = typeof updateClientSchema;

export const addExpenseSchema = z.object({
	description: z.string().min(1, 'Description is required').max(500),
	amountDollars: z.number({ invalid_type_error: 'Amount must be a number' }).positive()
});
export type AddExpenseSchema = typeof addExpenseSchema;

// ──────────────────────────────────────────────────────────────────────────
// Mass Notifications (targeted SMS / email campaigns to existing platform users)
// ──────────────────────────────────────────────────────────────────────────

export const massNotificationAudienceEnum = z.enum(['CANDIDATE', 'CLIENT']);
export const massNotificationChannelEnum = z.enum(['SMS', 'EMAIL']);

// Segment criteria. Every field is optional — an empty filter targets the whole
// audience. Fields are shared across audiences; the audience query interprets
// only the ones relevant to it (e.g. paymentType/companyName are client-only,
// discipline/experience/payRate are candidate-only). Numbers use z.coerce so
// they parse from the multipart form body superforms submits.
const massNotificationFilterFields = {
	// shared
	filterName: z.string().trim().optional(),
	filterEmail: z.string().trim().optional(),
	filterPhone: z.string().trim().optional(),
	filterStatus: z.string().trim().optional(),
	createdFrom: z.string().trim().optional(),
	createdTo: z.string().trim().optional(),
	// "not contacted in the last 30 days (or never)"
	staleOnly: z.boolean().default(false),
	// location radius — geocoded via mapbox on the client, lat/lon submitted here
	locationLabel: z.string().trim().optional(),
	locationLat: z.coerce.number().optional(),
	locationLon: z.coerce.number().optional(),
	radiusMiles: z.coerce.number().positive().max(500).optional(),
	// candidate-only
	disciplineId: z.string().trim().optional(),
	// "this level and above" — resolved to experience_levels.order >= selected
	experienceLevelId: z.string().trim().optional(),
	payRateMin: z.coerce.number().optional(),
	payRateMax: z.coerce.number().optional(),
	// client-only
	companyName: z.string().trim().optional(),
	// STRIPE = active Stripe billing, PAPER = paper invoicing,
	// SETUP = Stripe selected but customer setup still pending
	paymentType: z.enum(['STRIPE', 'PAPER', 'SETUP']).optional(),
	// client-only: reach the account OWNER (owner's email/cell — e.g. clawbacks)
	// or the LOCATION (office email/number — e.g. job-related blasts). Applies to
	// whichever channel is chosen. Defaults to OWNER when unset.
	clientRecipientTarget: z.enum(['OWNER', 'LOCATION']).optional()
};

// Used by the "Preview recipients" action — audience + channel + filters, no
// message content required yet.
export const massNotificationFilterSchema = z.object({
	audience: massNotificationAudienceEnum,
	channel: massNotificationChannelEnum,
	...massNotificationFilterFields
});
export type MassNotificationFilterSchema = typeof massNotificationFilterSchema;

// The full builder form — filters plus message content. Queued on submit.
export const massNotificationSchema = z
	.object({
		name: z.string().trim().min(1, { message: 'Give this send a name' }),
		audience: massNotificationAudienceEnum,
		channel: massNotificationChannelEnum,
		subject: z.string().trim().optional(),
		body: z.string().trim().min(1, { message: 'Message body is required' }),
		...massNotificationFilterFields
	})
	.refine((d) => d.channel !== 'EMAIL' || (d.subject?.trim().length ?? 0) > 0, {
		message: 'Subject is required for email',
		path: ['subject']
	});
export type MassNotificationSchema = typeof massNotificationSchema;

// Send a single test message to the current admin before queueing.
export const massNotificationTestSchema = z.object({
	channel: massNotificationChannelEnum,
	subject: z.string().trim().optional(),
	body: z.string().trim().min(1, { message: 'Message body is required' }),
	// where to send the test — the admin's own phone (SMS) or email
	testAddress: z.string().trim().min(1, { message: 'A test destination is required' })
});
export type MassNotificationTestSchema = typeof massNotificationTestSchema;
