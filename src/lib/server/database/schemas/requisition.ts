import {
	pgTable,
	text,
	timestamp,
	boolean,
	smallint,
	date,
	time,
	pgEnum,
	decimal,
	serial,
	integer,
	primaryKey,
	json,
	index,
	uuid,
	jsonb
} from 'drizzle-orm/pg-core';
import {
	clientCompanyTable,
	clientProfileTable,
	companyOfficeLocationTable,
	type ClientProfileSelect,
	type ClientCompanySelect
} from './client';
import { candidateProfileTable, type CandidateProfileSelect } from './candidate';
import { disciplineTable, experienceLevelTable } from './skill';
import { sql } from 'drizzle-orm/sql';
import type Stripe from 'stripe';
import type { InvoiceLineItem } from '../queries/requisitions';

export type RawTimesheetHours = {
	date: string;
	hours: number;
	startTime: string;
	endTime: string;
	lunchStartTime?: string;
	lunchEndTime?: string;
};

export const timeCategoryEnum = pgEnum('time_category_enum', [
	'R',
	'PTO',
	'UPTO',
	'H',
	'OT',
	'EXREIM',
	'ME'
]);

export const requisitionStatusEnum = pgEnum('requisition_status_enum', [
	'PENDING',
	'OPEN',
	'CANCELED',
	'CLOSED',
	// Perm-only payment-tracking branch. When a client approves an application
	// on a permanent requisition we transition to PAYMENT_REQUIRED so admin can
	// bill the client; admin then manually flips to PAYMENT_RECEIVED.
	'PAYMENT_REQUIRED',
	'PAYMENT_RECEIVED'
]);

export const recurrenceDayStatusEnum = pgEnum('workday_status_enum', [
	'OPEN',
	'FILLED',
	'UNFULFILLED',
	'CANCELED'
]);

export const requisitionTable = pgTable('requisitions', {
	id: serial('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	status: requisitionStatusEnum('status').default('PENDING').notNull(),
	title: text('name'),
	companyId: text('client_id')
		.notNull()
		.references(() => clientCompanyTable.id, { onDelete: 'cascade' }),
	locationId: text('location_id')
		.notNull()
		.references(() => companyOfficeLocationTable.id, { onDelete: 'cascade' }),
	disciplineId: text('discipline_id')
		.notNull()
		.references(() => disciplineTable.id),
	jobDescription: text('job_description').notNull(),
	specialInstructions: text('special_instructions'),
	experienceLevelId: text('experience_level_id').references(() => experienceLevelTable.id, {
		onDelete: 'set null'
	}),
	archived: boolean('archived').default(false),
	archivedDate: timestamp('archived_at', {
		withTimezone: true,
		mode: 'date'
	}),
	hourlyRate: smallint('hourly_rate'),
	permanentPosition: boolean('permanent_position').default(false),
	referenceTimezone: text('reference_timezone').notNull().default('America/New_York'),
	purchaseOrderNumber: text('purchase_order_number')
});

export const recurrenceDayTable = pgTable('recurrence_days', {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	status: recurrenceDayStatusEnum('status').default('OPEN').notNull(),
	date: date('date').notNull(),
	dayStart: timestamp('day_start_time', { withTimezone: true }).notNull(),
	dayEnd: timestamp('day_end_time', { withTimezone: true }).notNull(),
	lunchStart: timestamp('lunch_start_time', { withTimezone: true }),
	lunchEnd: timestamp('lunch_end_time', { withTimezone: true }),
	requisitionId: integer('requisition_id').references(() => requisitionTable.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade'
	}),
	archived: boolean('archived').default(false),
	archivedDate: timestamp('archived_at', {
		mode: 'date'
	})
});

export const invoiceStatusEnum = pgEnum('invoice_status', [
	'draft', // Matching Stripe's status values
	'open', // Sent/pending payment
	'paid',
	'uncollectible',
	'void'
]);
export type InvoiceStatus = (typeof invoiceStatusEnum.enumValues)[number];

export const invoiceSourceTypeEnum = pgEnum('invoice_source_type', [
	'timesheet',
	'manual',
	'recurring',
	'other'
]);
export type InvoiceSourceType = (typeof invoiceSourceTypeEnum.enumValues)[number];

export const invoiceTypeEnum = pgEnum('invoice_type', ['STRIPE', 'PAPER']);

export const invoiceTable = pgTable(
	'invoices',
	{
		// Core fields
		id: uuid('id').notNull().unique().defaultRandom().primaryKey(),
		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow(),

		// Stripe-related fields
		stripeInvoiceId: text('stripe_invoice_id').unique(), // Maps to Stripe's 'id'
		stripeCustomerId: text('stripe_customer_id'), // Maps to Stripe's 'customer'
		stripeStatus: text('stripe_status'), // Original Stripe status for reference
		stripePdfUrl: text('stripe_pdf_url'), // Maps to 'invoice_pdf'
		stripeHostedUrl: text('stripe_hosted_url'), // Maps to 'hosted_invoice_url'

		// Invoice details
		invoiceNumber: text('invoice_number').notNull().unique(),
		status: invoiceStatusEnum('status').notNull().default('draft'),
		sourceType: invoiceSourceTypeEnum('source_type').notNull().default('manual'),

		// Financial data from Stripe
		currency: text('currency').notNull().default('usd'),
		amountDue: decimal('amount_due', { precision: 10, scale: 2 }).notNull().default('0'),
		amountPaid: decimal('amount_paid', { precision: 10, scale: 2 }).notNull().default('0'),
		amountRemaining: decimal('amount_remaining', { precision: 10, scale: 2 })
			.notNull()
			.default('0'),
		subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull().default('0'),
		total: decimal('total', { precision: 10, scale: 2 }).notNull().default('0'),
		taxAmount: decimal('tax_amount', { precision: 10, scale: 2 }).default('0'),

		// Important dates
		dueDate: timestamp('due_date', { withTimezone: true, mode: 'date' }),
		periodStart: timestamp('period_start', { withTimezone: true, mode: 'date' }),
		periodEnd: timestamp('period_end', { withTimezone: true, mode: 'date' }),
		paidAt: timestamp('paid_at', { withTimezone: true, mode: 'date' }),
		voidedAt: timestamp('voided_at', { withTimezone: true, mode: 'date' }),

		// Customer information. Cascade so user deletion (which cascades to
		// client_profiles) doesn't block on invoice FKs.
		clientId: text('client_id')
			.references(() => clientProfileTable.id, { onDelete: 'cascade' })
			.notNull(),
		customerEmail: text('customer_email'),
		customerName: text('customer_name'),

		// Loosely coupled relationships (nullable for flexibility)
		candidateId: text('candidate_id').references(() => candidateProfileTable.id, {
			onDelete: 'set null'
		}),
		requisitionId: integer('requisition_id').references(() => requisitionTable.id, {
			onDelete: 'set null'
		}),
		timesheetId: text('timesheet_id').references(() => timeSheetTable.id, { onDelete: 'set null' }),

		// Additional Stripe fields
		billingReason: text('billing_reason'), // manual, subscription, etc.
		collectionMethod: text('collection_method').default('send_invoice'), // send_invoice, charge_automatically
		description: text('description'),
		footer: text('footer'),
		attemptCount: integer('attempt_count').default(0),
		attempted: boolean('attempted').default(false),
		livemode: boolean('livemode').default(false),

		// Flexible data storage for line items and metadata
		lineItems: jsonb('line_items').default('[]'),
		metadata: jsonb('metadata').default('{}'),
		customFields: jsonb('custom_fields'),
		discounts: jsonb('discounts').default('[]'),

		// Payment settings
		paymentMethodTypes: jsonb('payment_method_types'),
		defaultPaymentMethod: text('default_payment_method'),

		invoiceType: invoiceTypeEnum('invoice_type').notNull().default('STRIPE'),

		// Paper invoice fields (if needed in the future)
		paperInvoiceUrl: text('paper_invoice_url'),
		paperInvoiceKey: text('paper_invoice_key')
	},
	(table) => ({
		// Core indexes
		statusIdx: index('invoice_status_idx').on(table.status),
		sourceTypeIdx: index('invoice_source_type_idx').on(table.sourceType),
		clientIdx: index('invoice_client_idx').on(table.clientId),
		dueDateIdx: index('invoice_due_date_idx').on(table.dueDate),

		// Stripe-related indexes
		stripeInvoiceIdx: index('invoice_stripe_invoice_idx').on(table.stripeInvoiceId),
		stripeCustomerIdx: index('invoice_stripe_customer_idx').on(table.stripeCustomerId),

		// Optional relationship indexes (sparse indexes if your DB supports them)
		candidateIdx: index('invoice_candidate_idx')
			.on(table.candidateId)
			.where(sql`candidate_id IS NOT NULL`),
		requisitionIdx: index('invoice_requisition_idx')
			.on(table.requisitionId)
			.where(sql`requisition_id IS NOT NULL`),
		timesheetIdx: index('invoice_timesheet_idx')
			.on(table.timesheetId)
			.where(sql`timesheet_id IS NOT NULL`),

		// Compound indexes for common queries
		clientStatusIdx: index('invoice_client_status_idx').on(table.clientId, table.status),
		statusDueDateIdx: index('invoice_status_due_date_idx').on(table.status, table.dueDate),
		sourceTypeStatusIdx: index('invoice_source_type_status_idx').on(table.sourceType, table.status)
	})
);

export const paperInvoiceTransactionStatusEnum = pgEnum('paper_invoice_transaction_status', [
	'SUCCESSFUL',
	'PENDING',
	'FAILED',
	'CANCELLED'
]);

export const paperInvoiceTransactionTypeEnum = pgEnum('paper_invoice_transaction_type', [
	'PAYMENT',
	'REFUND',
	'ADJUSTMENT'
]);

export const paperInvoiceTransactionTable = pgTable(
	'paper_invoice_transactions',
	{
		id: uuid('id').notNull().unique().defaultRandom().primaryKey(),
		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow(),
		updatedAt: timestamp('updated_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow(),
		invoiceId: uuid('invoice_id')
			.references(() => invoiceTable.id, { onDelete: 'cascade' })
			.notNull(),
		timesheetId: text('timesheet_id').references(() => timeSheetTable.id, { onDelete: 'set null' }),

		batchNumber: text('batch_number'),
		transactionType: paperInvoiceTransactionTypeEnum('transaction_type')
			.notNull()
			.default('PAYMENT'), // e.g., 'payment', 'refund', 'adjustment'
		status: paperInvoiceTransactionStatusEnum('status').notNull().default('PENDING'), // e.g., 'pending', 'completed', 'failed'
		details: jsonb('details'), // Flexible field for any additional info about the transaction
		amount: decimal('amount', { precision: 10, scale: 2 }).notNull().default('0')
	},
	(table) => ({
		// Indexes for efficient querying
		// Index on invoiceId for fetching transactions related to a specific invoice
		invoiceIdx: index('paper_invoice_transaction_invoice_idx').on(table.invoiceId),
		// Index on timesheetId for fetching transactions related to a specific timesheet
		timesheetIdx: index('paper_invoice_transaction_timesheet_idx').on(table.timesheetId),
		// Compound index on status and transactionType for reporting and filtering
		statusTypeIdx: index('paper_invoice_transaction_status_type_idx').on(
			table.status,
			table.transactionType
		)
	})
);

export const workdayTable = pgTable('workdays', {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	candidateId: text('candidate_id')
		.notNull()
		.references(() => candidateProfileTable.id, { onDelete: 'cascade', onUpdate: 'cascade' }),
	requisitionId: integer('requisition_id')
		.notNull()
		.references(() => requisitionTable.id, {
			onDelete: 'cascade',
			onUpdate: 'cascade'
		}),
	recurrenceDayId: text('recurrence_day_id').references(() => recurrenceDayTable.id, {
		onDelete: 'cascade',
		onUpdate: 'cascade'
	}),
	timesheetId: text('timesheet_id').references(() => timeSheetTable.id, { onDelete: 'set null' }),
	// Non-null when an admin/client cancelled this workday. Candidate cancellations
	// delete the workday row instead (their recurrence day goes back to OPEN); this
	// column flags admin-side cancellations so the candidate calendar can still
	// surface "your shift was cancelled" days, and so timesheet reads can exclude
	// cancelled rows from hour totals.
	cancelledAt: timestamp('cancelled_at', { withTimezone: true, mode: 'date' })
});

// Audit log for every cancellation of a recurrence-day-level shift, regardless
// of who cancelled it. Lets us answer "how many times has this candidate
// cancelled in the last 30 days?" and "how close to shift start was it?" for
// future penalty rules.
export const recurrenceDayCancellationByRoleEnum = pgEnum('recurrence_day_cancellation_by_role', [
	'SUPERADMIN',
	'CLIENT',
	'CLIENT_STAFF',
	'CANDIDATE'
]);

export const recurrenceDayCancellationTable = pgTable(
	'recurrence_day_cancellations',
	{
		id: text('id').notNull().primaryKey(),
		createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull(),
		recurrenceDayId: text('recurrence_day_id')
			.notNull()
			.references(() => recurrenceDayTable.id, { onDelete: 'cascade' }),
		requisitionId: integer('requisition_id')
			.notNull()
			.references(() => requisitionTable.id, { onDelete: 'cascade' }),
		// Who pressed the cancel button.
		cancelledByUserId: text('cancelled_by_user_id').notNull(),
		cancelledByRole: recurrenceDayCancellationByRoleEnum('cancelled_by_role').notNull(),
		// The candidate who lost (or gave up) the shift. Same as cancelledByUserId
		// for candidate-initiated cancels; the assigned candidate for admin/client-
		// initiated cancels; null when the shift was never claimed.
		candidateId: text('candidate_id').references(() => candidateProfileTable.id, {
			onDelete: 'set null'
		}),
		// Snapshots so penalty rules can read these without re-deriving from a
		// recurrence-day row that may have been edited or cleared after the fact.
		shiftStart: timestamp('shift_start', { withTimezone: true, mode: 'date' }).notNull(),
		hoursBeforeShift: decimal('hours_before_shift'),
		reason: text('reason')
	},
	(table) => [
		index('rdc_candidate_idx').on(table.candidateId, table.createdAt),
		index('rdc_recurrence_day_idx').on(table.recurrenceDayId)
	]
);

export type RecurrenceDayCancellation = typeof recurrenceDayCancellationTable.$inferInsert;
export type RecurrenceDayCancellationSelect = typeof recurrenceDayCancellationTable.$inferSelect;

export const timesheetStatusEnum = pgEnum('timesheet_status', [
	'DRAFT',
	'PENDING',
	'APPROVED',
	'DISCREPANCY',
	'REJECTED',
	'VOID'
]);

export const wagesStatusEnum = pgEnum('wages_status', ['WAGES_DUE', 'WAGES_PAID']);

export const timeSheetTable = pgTable(
	'timesheets',
	{
		id: text('id').notNull().primaryKey(),
		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		}).notNull(),
		updatedAt: timestamp('updated_at', {
			withTimezone: true,
			mode: 'date'
		}).notNull(),
		associatedClientId: text('associated_client_id')
			.references(() => clientProfileTable.id, { onDelete: 'cascade' })
			.notNull(),
		associatedCandidateId: text('associated_candidate_id')
			.references(() => candidateProfileTable.id, { onDelete: 'cascade' })
			.notNull(),
		validated: boolean('validated').default(false),
		totalHoursWorked: decimal('total_hours_worked'),
		totalHoursBilled: decimal('total_hours_billed'),
		awaitingClientSignature: boolean('awaiting_client_signature').default(true),
		requisitionId: integer('requisition_id').references(() => requisitionTable.id, {
			onDelete: 'set null'
		}),
		weekBeginDate: date('week_begin_date').notNull(),
		hoursRaw: json('hours_raw').$type<RawTimesheetHours[]>().default([]),
		status: timesheetStatusEnum('status').default('DRAFT').notNull(),
		submittedAt: timestamp('submitted_at', { withTimezone: true, mode: 'date' }),
		approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
		approvedByUserId: text('approved_by_user_id'),
		discrepancyNote: text('discrepancy_note'),
		adjustedHourlyRate: smallint('adjusted_hourly_rate'),
		wagesStatus: wagesStatusEnum('wages_status')
	},
	(table) => [
		index('timesheet_candidate_idx').on(table.associatedCandidateId),
		index('timesheet_client_idx').on(table.associatedClientId),
		index('timesheet_week_begin_idx').on(table.weekBeginDate),
		index('timesheet_requisition_idx').on(table.requisitionId)
	]
);

export const timesheetExpenseStatusEnum = pgEnum('timesheet_expense_status', [
	'PENDING',
	'APPROVED',
	'REJECTED'
]);

export const timesheetExpenseTable = pgTable(
	'timesheet_expenses',
	{
		id: text('id').notNull().primaryKey(),
		createdAt: timestamp('created_at', {
			withTimezone: true,
			mode: 'date'
		}).notNull(),
		updatedAt: timestamp('updated_at', {
			withTimezone: true,
			mode: 'date'
		}).notNull(),
		timesheetId: text('timesheet_id')
			.references(() => timeSheetTable.id, { onDelete: 'cascade' })
			.notNull(),
		candidateId: text('candidate_id')
			.references(() => candidateProfileTable.id, { onDelete: 'cascade' })
			.notNull(),
		description: text('description').notNull(),
		amountCents: integer('amount_cents').notNull(),
		status: timesheetExpenseStatusEnum('status').default('PENDING').notNull(),
		createdByUserId: text('created_by_user_id').notNull(),
		approvedByUserId: text('approved_by_user_id'),
		approvedAt: timestamp('approved_at', { withTimezone: true, mode: 'date' }),
		rejectionReason: text('rejection_reason')
	},
	(table) => [
		index('timesheet_expense_timesheet_idx').on(table.timesheetId),
		index('timesheet_expense_status_idx').on(table.status)
	]
);

export type TimesheetExpense = typeof timesheetExpenseTable.$inferInsert;
export type TimesheetExpenseSelect = typeof timesheetExpenseTable.$inferSelect;

export const requisitionApplicationStatusEnum = pgEnum('requisition_application_status', [
	'PENDING',
	'APPROVED',
	'DENIED'
]);

export const requisitionApplicationTable = pgTable('requisition_application', {
	id: text('id').notNull().primaryKey(),
	createdAt: timestamp('created_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	updatedAt: timestamp('updated_at', {
		withTimezone: true,
		mode: 'date'
	}).notNull(),
	clientId: text('client_id')
		.notNull()
		.references(() => clientProfileTable.id, { onDelete: 'cascade' }),
	requisitionId: integer('requisition_id')
		.references(() => requisitionTable.id, { onDelete: 'cascade', onUpdate: 'cascade' })
		.notNull(),
	candidateId: text('candidate_id')
		.references(() => candidateProfileTable.id, { onDelete: 'cascade', onUpdate: 'cascade' })
		.notNull(),
	status: requisitionApplicationStatusEnum('application_status').default('PENDING'),
	archived: boolean('archived').default(false),
	archivedDate: timestamp('archived_at', {
		mode: 'date'
	})
});

export const candidateRequisitionSavesTable = pgTable(
	'candidate_saved_requisitions',
	{
		candidateId: text('candidate_id')
			.notNull()
			.references(() => candidateProfileTable.id, { onDelete: 'cascade' }),
		requisitionId: integer('requisition_id')
			.notNull()
			.references(() => requisitionTable.id, { onDelete: 'cascade' }),
		savedAt: timestamp('saved_at', {
			withTimezone: true,
			mode: 'date'
		})
			.notNull()
			.defaultNow()
	},
	(table) => {
		return {
			pk: primaryKey({ columns: [table.candidateId, table.requisitionId] })
		};
	}
);

export type Requisition = typeof requisitionTable.$inferInsert;
export type UpdateRequisition = Partial<typeof requisitionTable.$inferInsert>;

export type RecurrenceDay = typeof recurrenceDayTable.$inferInsert;
export type UpdateRecurrenceDay = Partial<typeof recurrenceDayTable.$inferInsert>;

export type RequisitionApplication = typeof requisitionApplicationTable.$inferInsert;

export type Invoice = typeof invoiceTable.$inferInsert;
export type UpdateInvoice = Partial<typeof invoiceTable.$inferInsert>;

export type TimeSheet = typeof timeSheetTable.$inferInsert;
export type UpdateTimeSheet = Partial<typeof timeSheetTable.$inferInsert>;

export type Workday = typeof workdayTable.$inferInsert;
export type UpdateWorkday = Partial<typeof workdayTable.$inferInsert>;

export type CandidateRequisitionSave = typeof candidateRequisitionSavesTable.$inferInsert;
export type UpdateCandidateRequisitionSave = Partial<
	typeof candidateRequisitionSavesTable.$inferInsert
>;

// Add select types for more precise querying
export type RequisitionSelect = typeof requisitionTable.$inferSelect;
export type RecurrenceDaySelect = typeof recurrenceDayTable.$inferSelect;
export type InvoiceSelect = typeof invoiceTable.$inferSelect;
export type TimeSheetSelect = typeof timeSheetTable.$inferSelect;
export type WorkdaySelect = typeof workdayTable.$inferSelect;
export type RequisitionApplicationSelect = typeof requisitionApplicationTable.$inferSelect;
export type CandidateRequisitionSaveSelect = typeof candidateRequisitionSavesTable.$inferSelect;
export type RecurrenceDayWithWorkdaySelect = {
	recurrenceDay: RecurrenceDaySelect;
	workday: WorkdaySelect;
};

type UserSelect = {
	id: string;
	firstName: string;
	lastName: string;
	avatarUrl: string | null;
};

// Timesheet query result type
export type TimesheetWithRelations = {
	timesheet: TimeSheetSelect;
	candidate: CandidateProfileSelect;
	clientCompany?: ClientCompanySelect;
	user: Partial<UserSelect>;
	requisition: RequisitionSelect | null;
	wagesStatus?: 'WAGES_DUE' | 'WAGES_PAID' | null;
};

export type InvoiceWithRelations = {
	invoice: InvoiceSelect;
	candidate: {
		profile: CandidateProfileSelect;
		user: {
			id: string;
			firstName: string | null;
			lastName: string | null;
			avatarUrl: string | null;
		};
	} | null;
	timesheet: TimeSheetSelect | null;
	requisition: RequisitionSelect | null;
	lineItems: InvoiceLineItem[];
	client: ClientProfileSelect;
	company: ClientCompanySelect | null;
	clientUser: {
		id: string;
		firstName: string | null;
		lastName: string | null;
		avatarUrl: string | null;
	};
};
