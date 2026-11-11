<!--
  Dev-only fixtures for the request-detail tab sections.
  ?role=admin|practice · ?empty=1 (empty states) · ?open=invoice|edit (opens a sheet)
-->
<script lang="ts">
	import { browser } from '$app/environment';
	import { page } from '$app/stores';
	import AdminShell from '$shell/AdminShell.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import CreateInvoiceSheet from '$features/requisitions/components/CreateInvoiceSheet.svelte';
	import RequestBillingSection from '$features/requisitions/components/RequestBillingSection.svelte';
	import RequestCommentsSection from '$features/requisitions/components/RequestCommentsSection.svelte';
	import RequestDetailsSection from '$features/requisitions/components/RequestDetailsSection.svelte';
	import RequestMatchesSection from '$features/requisitions/components/RequestMatchesSection.svelte';
	import type { PotentialMatch } from '$lib/server/requisitions/matches';
	import type { RequisitionBilling } from '$lib/server/requisitions/billing';

	const q = $derived($page.url.searchParams);
	const admin = $derived(q.get('role') !== 'practice');
	const empty = $derived(q.get('empty') === '1');
	let sidebar = $state<'expanded' | 'rail'>('expanded');
	let invoiceOpen = $state(false);

	const d = (s: string) => new Date(s);

	const billing: RequisitionBilling = {
		invoices: [
			{ id: 'i2', invoiceNumber: 'DTSS-0192', status: 'open', invoiceType: 'STRIPE', total: 6500, amountPaid: 3000, amountRemaining: 3500, dueDate: d('2026-11-30'), paidAt: null, createdAt: d('2026-11-02'), stripeHostedUrl: 'https://example.com', stripePdfUrl: null },
			{ id: 'i1', invoiceNumber: 'DTSS-0188', status: 'void', invoiceType: 'PAPER', total: 6500, amountPaid: 0, amountRemaining: 0, dueDate: d('2026-11-15'), paidAt: null, createdAt: d('2026-10-28'), stripeHostedUrl: null, stripePdfUrl: null }
		],
		payments: [
			{ id: 'p1', invoiceId: 'i2', invoiceNumber: 'DTSS-0192', date: d('2026-11-06'), amount: 3000, method: 'STRIPE', type: 'PAYMENT', status: 'SETTLED', batchNumber: null, reference: 'ch_3Nx…' },
			{ id: 'p2', invoiceId: 'i2', invoiceNumber: 'DTSS-0192', date: d('2026-11-07'), amount: -250, method: 'PAPER', type: 'REFUND', status: 'SETTLED', batchNumber: 'B-221', reference: null }
		],
		summary: { totalBilled: 6500, totalPaid: 2750, outstanding: 3500, unbilled: false }
	};
	const emptyBilling: RequisitionBilling = {
		invoices: [],
		payments: [],
		summary: { totalBilled: 0, totalPaid: 0, outstanding: 0, unbilled: true }
	};

	const match = (o: Partial<PotentialMatch>) =>
		({
			candidateId: 'c1', userId: 'u1', firstName: 'Maria', lastName: 'Lopez', avatarUrl: null, distance: '3.4', city: 'Tampa',
			disciplineName: 'Dental Hygienist', disciplineAbbr: 'RDH', experienceLevelId: 'e3', experienceLevelOrder: 3,
			workPreference: 'PERMANENT', meetsExperience: true, meetsSkillRequirements: true, application: null, ...o
		}) as unknown as PotentialMatch;
	const matches = [
		match({}),
		match({ candidateId: 'c2', userId: 'u2', firstName: 'James', lastName: 'Okafor', distance: '7.9', city: 'Brandon', workPreference: 'BOTH', application: { id: 'a', status: 'PENDING', source: 'ADMIN_RECOMMENDED' } } as never),
		match({ candidateId: 'c3', userId: 'u3', firstName: 'Priya', lastName: 'Shah', distance: '12.1', city: 'Clearwater', meetsExperience: false, meetsSkillRequirements: false })
	];

	const comments = [
		{ id: 'k1', body: 'We would love someone who can start before the holidays. Is that realistic?', internal: false, createdAt: d('2026-11-08T14:12:00Z'), authorId: 'client', authorFirstName: 'Dana', authorLastName: 'Whitfield', authorRole: 'CLIENT' },
		{ id: 'k2', body: 'Yes — two of our recommended hygienists can start Dec 1. Interviews next week.', internal: false, createdAt: d('2026-11-09T10:02:00Z'), authorId: 'me', authorFirstName: 'Shannon', authorLastName: 'Carter', authorRole: 'SUPERADMIN' },
		{ id: 'k3', body: 'Practice pays net 30 historically; chase the fee early.', internal: true, createdAt: d('2026-11-09T10:05:00Z'), authorId: 'me', authorFirstName: 'Shannon', authorLastName: 'Carter', authorRole: 'SUPERADMIN' }
	];
	const visibleComments = $derived(admin ? comments : comments.filter((c) => !c.internal));

	const requisition = {
		jobDescription: 'Full-time hygienist for a busy family practice. Adult prophys, perio maintenance and SRP; Dentrix charting. Four days a week, no weekends.',
		specialInstructions: 'Park in the back lot. Ask for Dana at the front desk.',
		purchaseOrderNumber: 'PO-55821',
		disciplineId: 'd1',
		experienceLevelId: 'e3',
		hourlyRate: 48
	};
	const disciplines = [{ id: 'd1', name: 'Dental Hygienist' }, { id: 'd2', name: 'Dental Assistant' }];
	const experienceLevels = [{ id: 'e1', value: 'Entry level', order: 1 }, { id: 'e3', value: '3+ years', order: 3 }];
	const skillRequirements = [
		{ categoryId: 's1', categoryName: 'Software', matchMode: 'ALL' as const, skills: [{ id: 'x1', name: 'Dentrix', requiresCertificate: false }] },
		{ categoryId: 's2', categoryName: 'Clinical', matchMode: 'ANY' as const, skills: [{ id: 'x2', name: 'Local anesthesia', requiresCertificate: true }, { id: 'x3', name: 'Nitrous', requiresCertificate: true }] }
	];

	const invoiceForm = { id: 'invoice', valid: false, posted: false, data: { amount: 0, dueDate: '', description: '', invoiceMethod: 'STRIPE', items: '' }, errors: {}, constraints: {} };

	$effect(() => {
		if (browser && q.get('open') === 'invoice') invoiceOpen = true;
	});
	// The skill picker asks the catalog API; answer with nothing so no data is read.
	if (browser) {
		const real = window.fetch.bind(window);
		window.fetch = (input: RequestInfo | URL, init?: RequestInit) =>
			String(input).includes('/api/skills/catalog')
				? Promise.resolve(new Response(JSON.stringify({ categories: [] }), { headers: { 'content-type': 'application/json' } }))
				: real(input, init);
	}
</script>

<AdminShell pathname="/requisitions/1042" nav={{ role: admin ? 'SUPERADMIN' : 'CLIENT' }} bind:sidebar name="Shannon Carter" initials="SC">
	<Page>
		<PageHeader title="Requisition tabs preview" description="Details · Billing · Matches · Comments · Create invoice" />
		<RequestDetailsSection {requisition} skillRequirements={empty ? [] : skillRequirements} {disciplines} {experienceLevels} canEdit />
		<RequestBillingSection
			billing={empty ? emptyBilling : billing}
			isAdmin={admin}
			canOpenInvoicePage={!admin}
			permanentPosition
			requisitionStatus="PAYMENT_REQUIRED"
			onCreateInvoice={() => (invoiceOpen = true)}
		/>
		{#if admin}<RequestMatchesSection matches={empty ? [] : matches} requisitionOpen />{/if}
		<RequestCommentsSection comments={empty ? [] : visibleComments} isAdmin={admin} currentUserId="me" companyName="Bright Smiles Dental" />
	</Page>
</AdminShell>

{#if admin}
	<CreateInvoiceSheet
		bind:open={invoiceOpen}
		{invoiceForm}
		requisitionId={1042}
		label="Dental Hygienist"
		clientInvoiceMethod="PAPER"
		billingMismatchMessage="Paper invoicing with an unused Stripe customer."
	/>
{/if}
