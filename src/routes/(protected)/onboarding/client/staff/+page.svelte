<script lang="ts">
	import { CLIENT_STAFF_ROLES } from '$lib/config/constants';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import * as Alert from '$lib/components/ui/alert';
	import { Input } from '$lib/components/ui/input';
	import { Select } from 'flowbite-svelte';
	import { Loader2, AlertCircle, TrashIcon } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import { enhance } from '$app/forms';

	type StaffInvite = {
		email: string;
		staffRole: keyof typeof CLIENT_STAFF_ROLES;
	};

	const StaffRoleMap = [
		{
			name: 'Admin',
			value: CLIENT_STAFF_ROLES.CLIENT_ADMIN
		},
		{
			name: 'Manager',
			value: CLIENT_STAFF_ROLES.CLIENT_MANAGER
		},
		{
			name: 'Employee',
			value: CLIENT_STAFF_ROLES.CLIENT_EMPLOYEE
		}
	];

	let inviteEmail = '';
	let inviteRole = '';
	let submitting = false;
	export let data;

	const {
		form,
		errors,
		enhance: inviteEnhance
	} = superForm(data.form, {
		resetForm: false,
		onSubmit: ({ formData }) => {
			// Log what's being sent
			console.log('Current form invitees:', $form.invitees);

			// Add the invitees array as JSON to the formData
			formData.set('invitees', JSON.stringify($form.invitees));

			submitting = true;
			return true;
		},
		onResult: () => {
			submitting = false;
		}
	});

	// Initialize form.invitees if it doesn't exist
	$: if (!$form.invitees) {
		$form.invitees = [];
	}

	const handleAddInvite = (email: string) => {
		console.log('Adding invite for email:', email);
		const emailExpression = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
		const includes = $form.invitees.find((invite) => invite.email === email);
		const isEmail = emailExpression.test(email);

		if (!includes && isEmail && inviteRole) {
			console.log('Adding invite for email:', email);
			console.log('Invite added:', email, inviteRole);
			$form.invitees = [
				{
					email,
					staffRole: inviteRole as keyof typeof CLIENT_STAFF_ROLES
				},
				...$form.invitees
			];
			inviteEmail = '';
			inviteRole = '';
		} else {
			if (includes) {
				console.log('Invite already exists for email:', email);
			}
			if (!isEmail) {
				console.log('Invalid email format:', email);
			}
			if (!inviteRole) {
				console.log('No role selected for email:', email);
			}
		}
	};

	const handleRemoveInvite = (email: string) => {
		$form.invitees = $form.invitees.filter((invite) => invite.email !== email);
	};

	const handleSelectRole = (email: string, role: string) => {
		const inviteeIndex = $form.invitees.findIndex((invitee) => invitee.email === email);
		if (inviteeIndex !== -1) {
			$form.invitees[inviteeIndex] = {
				...$form.invitees[inviteeIndex],
				staffRole: role as keyof typeof CLIENT_STAFF_ROLES
			};
			// Trigger reactivity
			$form.invitees = [...$form.invitees];
		}
	};

	function handleSkip() {
		const skipForm = document.getElementById('skipForm');
		skipForm?.requestSubmit();
	}
</script>

<section class="flex flex-col items-center justify-center min-h-screen">
	<div class="p-6 flex gap-2 w-full max-w-5xl mx-auto">
		<form class="w-full" method="POST" action="?/sendInvites" use:inviteEnhance>
			<Card.Root class="w-full">
				<Card.Header>
					<Card.Title class="text-2xl">Invite Staff</Card.Title>
					<Card.Description>
						Add your staff emails to send them invites to sign up with their own accounts.
					</Card.Description>
				</Card.Header>
				<Card.Content>
					<div class="grid grid-cols-12 gap-4">
						<Input
							name="email"
							bind:value={inviteEmail}
							class="col-span-12 md:col-span-6"
							placeholder="Email address"
						/>
						<Select
							class="col-span-12 md:col-span-4"
							bind:value={inviteRole}
							placeholder="Select Role"
						>
							{#each StaffRoleMap as role}
								<option value={role.value}>{role.name}</option>
							{/each}
						</Select>
						<Button
							class="col-span-12 md:col-span-2 bg-green-400 hover:bg-green-500"
							type="button"
							disabled={!inviteEmail || !inviteRole}
							on:click={() => handleAddInvite(inviteEmail)}
						>
							Add
						</Button>
					</div>

					<div class="mt-8 flex flex-col divide-y">
						{#each $form.invitees as invitee}
							<div class="flex justify-between gap-4 py-4">
								<p>{invitee.email}</p>
								<div class="flex gap-2 items-center">
									<Select
										value={invitee.staffRole}
										on:change={(e) => handleSelectRole(invitee.email, e.target?.value)}
									>
										{#each StaffRoleMap as role}
											<option value={role.value}>{role.name}</option>
										{/each}
									</Select>
									<Button on:click={() => handleRemoveInvite(invitee.email)} variant="destructive">
										<TrashIcon />
									</Button>
								</div>
							</div>
						{/each}
					</div>
					{#each $form.invitees as invitee, i}
						<input type="hidden" name={`invitees[${i}][email]`} value={invitee.email} />
						<input type="hidden" name={`invitees[${i}][staffRole]`} value={invitee.staffRole} />
					{/each}
				</Card.Content>
				<Card.Footer>
					<Button
						type="submit"
						class="ml-auto bg-blue-800 hover:bg-blue-900"
						disabled={submitting || $form.invitees.length === 0}
					>
						{#if submitting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" />
							Sending Invites...
						{:else}
							Send Invites
						{/if}
					</Button>
					<Button type="button" variant="link" on:click={handleSkip}>Skip for now</Button>
				</Card.Footer>
			</Card.Root>
		</form>
		<form
			id="skipForm"
			method="POST"
			action="?/skipInviting"
			use:enhance
			style="display: none;"
		></form>
	</div>
</section>
