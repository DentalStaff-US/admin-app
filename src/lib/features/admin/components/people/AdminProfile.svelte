<script lang="ts">
	import { Pencil, Trash2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import FactGrid from '$dtss/FactGrid.svelte';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { roleLabel } from './people';

	type Profile = { id: string; firstName: string | null; lastName: string | null; email: string; role: string };

	let {
		profile,
		isSelf,
		updateForm,
		deleteError
	}: {
		profile: Profile;
		/** The signed-in admin is looking at their own record: no delete. */
		isSelf: boolean;
		updateForm: any;
		deleteError?: string | null;
	} = $props();

	let editOpen = $state(false);
	let deleteOpen = $state(false);

	const { form, errors, submitting, enhance } = superForm(updateForm, {
		onResult: ({ result }) => {
			if (result.type === 'success') editOpen = false;
		}
	});

	const name = $derived([profile.firstName, profile.lastName].filter(Boolean).join(' ') || profile.email);

	function startEdit() {
		// Always start from the saved values.
		form.set({ firstName: profile.firstName, lastName: profile.lastName, email: profile.email });
		editOpen = true;
	}
</script>

<Page width="narrow">
	<PageHeader title={name} description="Administrator · {profile.email}">
		{#snippet actions()}
			{#if !isSelf}
				<Button variant="destructiveOutline" on:click={() => (deleteOpen = true)}>
					<Trash2 class="mr-2 size-4" aria-hidden="true" /> Delete admin
				</Button>
			{/if}
			<Button on:click={startEdit}><Pencil class="mr-2 size-4" aria-hidden="true" /> Edit details</Button>
		{/snippet}
	</PageHeader>

	{#if deleteError}
		<p role="alert" class="rounded-xl border border-status-negative-border bg-status-negative-bg p-4 text-sm text-status-negative-fg">{deleteError}</p>
	{/if}

	<Section title="Details">
		<FactGrid
			columns={2}
			facts={[
				{ label: 'First name', value: profile.firstName },
				{ label: 'Last name', value: profile.lastName },
				{ label: 'Email', value: profile.email },
				{ label: 'Role', value: roleLabel(profile.role) }
			]}
		/>
	</Section>
</Page>

<Dialog.Root bind:open={editOpen}>
	<Dialog.Content class="max-w-lg">
		<Dialog.Header>
			<Dialog.Title>Edit details</Dialog.Title>
			<Dialog.Description>Changing the email changes where they sign in.</Dialog.Description>
		</Dialog.Header>
		<form use:enhance method="POST" action="?/updateAdminProfile" class="grid gap-4">
			<div class="grid items-start gap-4 sm:grid-cols-2">
				<div class="grid gap-2">
					<Label for="firstName">First name</Label>
					<Input bind:value={$form.firstName} id="firstName" name="firstName" />
				</div>
				<div class="grid gap-2">
					<Label for="lastName">Last name</Label>
					<Input bind:value={$form.lastName} id="lastName" name="lastName" />
				</div>
			</div>
			<div class="grid gap-2">
				<Label for="email">Email</Label>
				<Input bind:value={$form.email} id="email" name="email" type="email" aria-invalid={$errors.email ? 'true' : undefined} />
				{#if $errors.email}<p class="text-sm text-destructive">{$errors.email}</p>{/if}
			</div>
			<Dialog.Footer class="gap-2">
				<Button type="button" variant="outline" on:click={() => (editOpen = false)}>Cancel</Button>
				<Button type="submit" disabled={$submitting}>{$submitting ? 'Saving…' : 'Save details'}</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>

<ConfirmDialog
	bind:open={deleteOpen}
	title="Delete {name}?"
	description="{name} ({profile.email}) loses admin access and their account is permanently deleted. This can't be undone."
	confirmText="DELETE"
>
	{#snippet confirm({ ready, typed })}
		<form method="POST" action="?/deleteAdminUser">
			<input type="hidden" name="confirm" value={typed} />
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10 sm:w-auto" disabled={!ready}>Delete admin</Button>
		</form>
	{/snippet}
</ConfirmDialog>
