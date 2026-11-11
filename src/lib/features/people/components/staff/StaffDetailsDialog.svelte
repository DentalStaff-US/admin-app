<script lang="ts">
	import * as Dialog from '$lib/components/ui/dialog';
	import { Button } from '$lib/components/ui/button';
	import FactGrid from '$dtss/FactGrid.svelte';
	import PersonAvatar from '../PersonAvatar.svelte';
	import { initialsOf, staffRoleLabel } from '../../people';

	type Member = {
		profile: { createdAt: Date | string; birthday: string | null; staffRole: string | null };
		user: { firstName: string; lastName: string; email: string; avatarUrl: string | null };
		primaryLocation?: { name: string } | null;
	};

	/** Read-only staff details (03 › Which overlay: details without leaving the list). */
	let { open = $bindable(false), member }: { open?: boolean; member: Member | null } = $props();
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="sm:max-w-lg">
		{#if member}
			<Dialog.Header>
				<div class="flex items-center gap-3">
					<PersonAvatar
						name="{member.user.firstName} {member.user.lastName}"
						src={member.user.avatarUrl}
						initials={initialsOf(member.user.firstName, member.user.lastName)}
						size="md"
					/>
					<div class="min-w-0 text-left">
						<Dialog.Title class="text-h2">{member.user.firstName} {member.user.lastName}</Dialog.Title>
						<Dialog.Description class="truncate">{member.user.email}</Dialog.Description>
					</div>
				</div>
			</Dialog.Header>
			<FactGrid
				columns={2}
				facts={[
					{ label: 'Role', value: staffRoleLabel(member.profile.staffRole) },
					...(member.primaryLocation !== undefined
						? [{ label: 'Primary location', value: member.primaryLocation?.name ?? 'None assigned' }]
						: []),
					{ label: 'Birthday', value: member.profile.birthday || '—' },
					{ label: 'Joined', value: new Date(member.profile.createdAt).toLocaleDateString() }
				]}
			/>
		{/if}
		<Dialog.Footer>
			<Button variant="outline" on:click={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
