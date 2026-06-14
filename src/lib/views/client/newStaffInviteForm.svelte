<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import * as Form from '$lib/components/ui/form';
	import { Button } from '$lib/components/ui/button';

	import type { SuperValidated } from 'sveltekit-superforms';
	import type { AdminRequisitionSchema } from '$lib/config/zod-schemas';
	import { CLIENT_STAFF_ROLES } from '$lib/config/constants';
	import { onMount } from 'svelte';

	export let form: SuperValidated<AdminRequisitionSchema>;
	export let schema: AdminRequisitionSchema;
	export let drawerExpanded: boolean;
	export let clientCompany;

	let locations: any[] = [];
	$: console.log({clientCompany})

	const handleGetLocations = async (companyId: string) => {
		if (!companyId?.length) return;
		const req = await fetch(`/api/admin/fetchCompanyLocations?companyId=${companyId}`, {
			method: 'GET'
		});
		const locationsRes = await req.json();
		locations = locationsRes;
	};

	onMount(async() => {
	 await handleGetLocations(clientCompany.id)
	})
</script>

<Form.Root
	class="grow flex flex-col h-full max-h-[calc(100vh_-_70px)]"
	let:submitting
	let:errors
	method="POST"
	{form}
	{schema}
	let:config
	action="/staff?/invite"
>
	<div class="grow p-4 overflow-y-auto">
		<Form.Field {config} name="clientId">
			<Form.Item>
				<Form.Label>User Email</Form.Label>
				<Form.Input />
				<Form.Validation />
			</Form.Item>
		</Form.Field>
		<Form.Field {config} name="locationId">
			<Form.Item>
				<Form.Label>Location</Form.Label>
				<Form.Select>
					<Form.SelectTrigger tabindex={drawerExpanded ? 0 : -1} placeholder="Select Location"
					></Form.SelectTrigger>
					<Form.SelectContent class=" max-h-[170px] md:max-h-[300px] h-full overflow-y-auto">
						{#each locations as location}
							<Form.SelectItem value={location.id} label={location.name}
								>{location.name}</Form.SelectItem
							>
						{/each}
					</Form.SelectContent>
				</Form.Select>
				<Form.Validation />
			</Form.Item>
		</Form.Field>
		<Form.Field {config} name="experienceLevelId">
			<Form.Item>
				<Form.Label>Staff Role</Form.Label>
				<Form.Select>
					<Form.SelectTrigger tabindex={drawerExpanded ? 0 : -1} placeholder="Select Experience"
					></Form.SelectTrigger>
					<Form.SelectContent class=" overflow-y-auto">
						{#each Object.values(CLIENT_STAFF_ROLES) as role}
							<Form.SelectItem value={role} label={role}
								><span class="first-letter:uppercase">{role.split('_')[1].toLowerCase()}</span
								></Form.SelectItem
							>
						{/each}
					</Form.SelectContent>
				</Form.Select>
				<Form.Validation />
			</Form.Item>
		</Form.Field>
	</div>
	<div class="flex justify-end gap-4 p-4 border-t border-t-gray-200">
		<Button
			tabindex={drawerExpanded ? 0 : -1}
			type="button"
			on:click={() => (drawerExpanded = false)}
			class="bg-white hover:bg-destructive/90 hover:text-white border border-red-500 text-red-500 rounded-md"
			>Cancel</Button
		>
		<Button
			tabindex={drawerExpanded ? 0 : -1}
			disabled={submitting}
			type="submit"
			class="px-4 py-2 bg-primary hover:bg-primary/90 text-white rounded-md"
			>{#if submitting}
				<Loader2 class="mr-2 h-4 w-4 animate-spin" />
				Please wait{:else}Send Invite{/if}</Button
		>
	</div>
</Form.Root>
