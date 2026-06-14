<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Checkbox } from '../ui/checkbox';
	import { superForm } from 'sveltekit-superforms/client';
	import { CLIENT_STAFF_ROLES } from '$lib/config/constants';
	export let allStaff;
	export let location;
	export let company;
	export let assignForm;

	const form = superForm(assignForm);
	export let selectedStaffId = '';

	const { enhance, form: formData } = form;

	$: console.log(allStaff);
</script>

<Sheet.Root>
	<Sheet.Trigger asChild let:builder>
		<Button builders={[builder]} class="bg-primary hover:bg-primary/90 mb-4">
			Add Staff Member
		</Button>
	</Sheet.Trigger>
	<Sheet.Content side="right">
		<form method="POST" action="?/assignStaff" use:enhance>
			<Sheet.Header>
				<Sheet.Title>Add Staff</Sheet.Title>
				<Sheet.Description>Add an existing staff member to this location.</Sheet.Description>
			</Sheet.Header>
			<div class="grid gap-4 py-4">
				<div class="space-y-2">
					<Label for="name" class="text-right">Name</Label>
					<Select.Root
						preventScroll={false}
						onSelectedChange={(v) => {
							v && ($formData.staffId = String(v.value));
						}}
					>
						<Select.Trigger>
							<Select.Value />
						</Select.Trigger>
						<Select.Content class="max-h-[150px] overflow-y-scroll">
							{#each allStaff as staff}
								<Select.Item value={staff.profile.id}>
									<span>{staff.user.firstName} {staff.user.lastName}</span>
								</Select.Item>
							{/each}
						</Select.Content>
						<Input name="staffId" type="hidden" value={$formData.staffId} />
					</Select.Root>
					<div class="flex gap-4"><Checkbox /><span>Primary Location</span></div>
					<input type="hidden" value={company.id} name="companyId" />
					<input type="hidden" value={location.id} name="locationId" />
				</div>
			</div>
			<Sheet.Footer>
				<Sheet.Close asChild let:builder>
					<Button class="bg-primary hover:bg-primary/90 mb-4" type="submit">Add Staff Member</Button>
				</Sheet.Close>
			</Sheet.Footer>
		</form>
	</Sheet.Content>
</Sheet.Root>
