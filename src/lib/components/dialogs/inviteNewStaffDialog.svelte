<script lang="ts">
	import { Button, buttonVariants } from '$lib/components/ui/button/index.js';
	import { Input } from '$lib/components/ui/input/index.js';
	import { Label } from '$lib/components/ui/label/index.js';
	import * as Select from '$lib/components/ui/select/index.js';
	import { superForm } from 'sveltekit-superforms/client';
	import * as Dialog from '../ui/dialog';
	import { Loader2, PlusIcon } from 'lucide-svelte';
	import { cn } from '$lib/utils';
	import { STAFF_ROLE_ENUM } from '$lib/config/constants';

	export let locations;
	export let company;
	export let inviteForm;
	export let open: boolean;

	const form = superForm(inviteForm, {
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
		}}><PlusIcon size={20} class="mr-2" />Add Staff to Location</Dialog.Trigger
	>
	<Dialog.Content class="sm:max-w-[425px]">
		<form use:enhance method="POST" action="?/inviteStaff" class="space-y-4">
			<Dialog.Header>
				<Dialog.Title>Add Staff to Location</Dialog.Title>
				<Dialog.Description>Add an existing staff member to this location.</Dialog.Description>
			</Dialog.Header>
			<div class="grid gap-4 py-4">
				<div>
					<Label for="email" class="text-right">Email</Label>
					<Input
						id="email"
						name="email"
						type="email"
						placeholder="Enter staff email"
						bind:value={$formData.email}
						required
						class="w-full"
					/>
				</div>
				<div class="space-y-2">
					<Label for="locationId" class="text-right">Primary Location</Label>
					<Select.Root
						preventScroll={false}
						onSelectedChange={(v) => {
							v && ($formData.locationId = String(v.value));
						}}
					>
						<Select.Trigger>
							<Select.Value />
						</Select.Trigger>
						<Select.Content class="max-h-[150px] overflow-y-scroll">
							{#each locations as location}
								<Select.Item value={location.id} class="cursor-pointer">
									<span>{location.name}</span>
								</Select.Item>
							{/each}
						</Select.Content>
						<Input name="locationId" type="hidden" value={$formData.locationId} />
					</Select.Root>

					<input type="hidden" value={company.id} name="companyId" />
				</div>
				<div class="space-y-2">
					<Label for="staffRole" class="text-right">Staff Role</Label>
					<Select.Root
						preventScroll={false}
						onSelectedChange={(v) => {
							v && ($formData.staffRole = String(v.value));
						}}
					>
						<Select.Trigger>
							<Select.Value />
						</Select.Trigger>
						<Select.Content class="max-h-[150px] overflow-y-scroll">
							{#each Object.values(STAFF_ROLE_ENUM) as role}
								<Select.Item value={role} class="cursor-pointer">
									<span>{role}</span>
								</Select.Item>
							{/each}
						</Select.Content>
						<Input name="staffRole" type="hidden" value={$formData.staffRole} />
					</Select.Root>
					<input type="hidden" value={company.id} name="companyId" />
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
