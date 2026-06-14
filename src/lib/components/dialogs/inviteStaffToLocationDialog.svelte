<script lang="ts">
	import * as Sheet from '$lib/components/ui/sheet/index.js';
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { Checkbox } from '../ui/checkbox';
	import { superForm } from 'sveltekit-superforms/client';
	import * as Dialog from '../ui/dialog';
	import { Loader2, PlusIcon } from 'lucide-svelte';
	import { Textarea } from 'flowbite-svelte';
	import { cn } from '$lib/utils';
	export let allStaff;
	export let location;
	export let company;
	export let assignForm;
	export let open: boolean;

	const form = superForm(assignForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') {
				open = false;
			}
		}
	});

	const { enhance, form: formData, submitting } = form;
</script>

<Dialog.Root {open}>
	<Dialog.Trigger
		class={cn(buttonVariants({ variant: 'default' }), 'bg-primary hover:bg-primary/90 mb-4')}
		on:click={() => {
			// form = data.form;
			open = true;
		}}><PlusIcon size={20} class="mr-2" />Add Staff</Dialog.Trigger
	>
	<Dialog.Content class="sm:max-w-[425px]">
		<form use:enhance method="POST" action="?/assignStaff" class="space-y-4">
			<Dialog.Header>
				<Dialog.Title>Add Staff to Location</Dialog.Title>
				<Dialog.Description>Add an existing staff member to this location.</Dialog.Description>
			</Dialog.Header>
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
			<Dialog.Footer>
				<Dialog.Close asChild>
					<Button on:click={() => (open = false)} variant="outline" type="button" class="w-full"
						>Close</Button
					>
				</Dialog.Close>
				<Dialog.Close asChild>
					<Button
						class="bg-primary hover:bg-primary/90 w-full"
						type="submit"
						disabled={$submitting}
						>{#if $submitting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Please wait...{:else}Add Staff{/if}
					</Button>
				</Dialog.Close>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
