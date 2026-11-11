<script lang="ts">
	// "New request" (practices) / "New requisition" (admins) in a right-hand
	// FormSheet. Props are unchanged: dashboards, clients and locations pages
	// open it by binding `drawerExpanded`.
	import FormSheet from '$dtss/FormSheet.svelte';
	import AdminRequisitionForm from '$lib/views/admin/requisitions/newRequisitionFormAdmin.svelte';
	import CompanyRequisitionForm from '$lib/views/client/companyRequisitionForm.svelte';
	import { USER_ROLES } from '$lib/config/constants';
	import type { AdminRequisitionSchema, ClientRequisitionSchema } from '$lib/config/zod-schemas';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { ClientCompanyLocationSelect } from '$lib/server/database/schemas/client';

	let {
		adminForm = null,
		clientForm = null,
		user,
		drawerExpanded = $bindable(false),
		location = null,
		currentCompanyID = null
	}: {
		adminForm?: SuperValidated<AdminRequisitionSchema> | null;
		clientForm?: SuperValidated<ClientRequisitionSchema> | null;
		user: { role?: string | null } | null | undefined;
		drawerExpanded: boolean;
		location?: ClientCompanyLocationSelect | null | undefined;
		currentCompanyID?: string | null;
	} = $props();

	let dirty = $state(false);
	const isAdmin = $derived(user?.role === USER_ROLES.SUPERADMIN);
	const isClient = $derived(user?.role === USER_ROLES.CLIENT || user?.role === USER_ROLES.CLIENT_STAFF);
</script>

<FormSheet
	bind:open={drawerExpanded}
	title={isAdmin ? 'New requisition' : 'New request'}
	description={isAdmin
		? 'Post a temp or permanent requisition for a practice. You can add days once it exists.'
		: 'Tell us who you need. You can add the days once the request is posted.'}
	{dirty}
>
	{#if isAdmin && adminForm}
		<AdminRequisitionForm form={adminForm} bind:drawerExpanded bind:dirty {currentCompanyID} />
	{:else if isClient && clientForm}
		<CompanyRequisitionForm {location} form={clientForm} bind:drawerExpanded bind:dirty />
	{/if}
</FormSheet>
