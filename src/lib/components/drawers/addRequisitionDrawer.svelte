<script lang="ts">
	import AdminRequisitionForm from '$lib/views/admin/requisitions/newRequisitionFormAdmin.svelte';
	import CompanyRequisitionForm from '$lib/views/client/companyRequisitionForm.svelte';
	import { cn } from '$lib/utils';
	import { USER_ROLES } from '$lib/config/constants';
	import {
		adminRequisitionSchema,
		type AdminRequisitionSchema,
		type ClientRequisitionSchema
	} from '$lib/config/zod-schemas';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { ClientCompanyLocationSelect } from '$lib/server/database/schemas/client';

	export let adminForm: SuperValidated<AdminRequisitionSchema> | null = null;
	export let clientForm: SuperValidated<ClientRequisitionSchema> | null = null;
	export let user;
	export let drawerExpanded: boolean;
	export let location: ClientCompanyLocationSelect | null | undefined = null;
	export let currentCompanyID: string | null = null;
</script>

<!-- TODO: Need to ensure that if drawer is not open, then anything in the drawer is not able to have positive tabIndex -->
<div
	class={cn(
		'transition-all duration-300 absolute w-full max-w-[500px] top-0 bottom-0 z-30 bg-white shadow-lg h-screen overflow-hidden flex flex-col',
		drawerExpanded ? 'right-0' : '-right-[500px]'
	)}
>
	<div class="p-4 border-b border-b-gray-200">
		<p class="text-xl font-bold">Create New Requisition</p>
	</div>
	{#if drawerExpanded}
		{#if user?.role === USER_ROLES.SUPERADMIN && adminForm}
			<AdminRequisitionForm form={adminForm} bind:drawerExpanded {currentCompanyID} />
		{/if}
		{#if (user?.role === USER_ROLES.CLIENT && clientForm) || (user?.role === USER_ROLES.CLIENT_STAFF && clientForm)}
			<CompanyRequisitionForm {location} form={clientForm} bind:drawerExpanded />
		{/if}
	{:else}
		<div></div>
	{/if}
</div>
