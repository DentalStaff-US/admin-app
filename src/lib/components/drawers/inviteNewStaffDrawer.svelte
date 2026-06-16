<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import { Select } from 'flowbite-svelte';
	import { Checkbox } from '../ui/checkbox';
	import { superForm } from 'sveltekit-superforms/client';
	import { PlusIcon } from 'lucide-svelte';
	import NewStaffInviteForm from '$lib/views/client/newStaffInviteForm.svelte';

	export let inviteForm;

	const form = superForm(inviteForm);

	const { enhance, form: formData } = form;
</script>

<Sheet.Root>
	<Sheet.Trigger asChild let:builder>
		<Button builders={[builder]} class="bg-primary hover:bg-primary/90 mb-4"
			><PlusIcon size={20} class="mr-2" />Invite Staff</Button
		>
	</Sheet.Trigger>
	<Sheet.Content side="right">
		<form method="POST" action="?/inviteStaff" use:enhance class="h-full flex flex-col">
			<Sheet.Header>
				<Sheet.Title>Invite Staff</Sheet.Title>
				<Sheet.Description>Invite new staff members to create an account.</Sheet.Description>
			</Sheet.Header>
			<div class="grid gap-4 py-4">
				<div class="space-y-2">
					<Label for="name" class="text-right">Name</Label>
					<Select>
						<!-- {#each allStaff as staff}
							<option>{staff.user.firstName} {staff.user.lastName}</option>
						{/each} -->
					</Select>
					<div class="flex gap-4"><Checkbox /><span>Primary Location</span></div>
					<input type="hidden" name="companyId" />
					<input type="hidden" name="locationId" />
				</div>
			</div>
			<Sheet.Footer class="mt-auto">
				<Sheet.Close asChild let:builder
					><Button class="bg-destructive hover:bg-destructive/90 mb-4" builders={[builder]} type="button"
						>Cancel</Button
					></Sheet.Close
				>
				<Sheet.Close asChild let:builder>
					<Button class="bg-primary hover:bg-primary/90 mb-4" builders={[builder]} type="submit"
						>Invite Staff Member</Button
					>
				</Sheet.Close>
			</Sheet.Footer>
		</form>
	</Sheet.Content>
</Sheet.Root>
