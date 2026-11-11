<script lang="ts">
	import { Plus, X } from 'lucide-svelte';
	import { CLIENT_STAFF_ROLES, STAFF_ROLE_ENUM } from '$lib/config/constants';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import * as Select from '$lib/components/ui/select';

	export type Invitee = { email: string; staffRole: keyof typeof CLIENT_STAFF_ROLES };

	// The invitee list behind the staff-invite forms (settings › Team and
	// onboarding › Staff). Both post the list as hidden fields and as JSON.
	let { invitees = $bindable([]) }: { invitees?: Invitee[] } = $props();

	const ROLES = [
		{ value: CLIENT_STAFF_ROLES.CLIENT_ADMIN, label: STAFF_ROLE_ENUM.CLIENT_ADMIN },
		{ value: CLIENT_STAFF_ROLES.CLIENT_MANAGER, label: STAFF_ROLE_ENUM.CLIENT_MANAGER },
		{ value: CLIENT_STAFF_ROLES.CLIENT_EMPLOYEE, label: STAFF_ROLE_ENUM.CLIENT_EMPLOYEE }
	];
	const roleOption = (value: string) => ROLES.find((r) => r.value === value);

	let email = $state('');
	let role = $state('');
	let problem = $state('');

	function add() {
		// Permissive client-side check; the server's z.string().email() decides.
		const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
		if (!isEmail) return (problem = 'Enter a full email address, like name@practice.com.');
		if (invitees.some((i) => i.email === email)) return (problem = 'That email is already on the list.');
		if (!role) return (problem = 'Choose a role.');
		invitees = [{ email, staffRole: role as Invitee['staffRole'] }, ...invitees];
		email = '';
		role = '';
		problem = '';
	}

	function setRole(target: string, value: string) {
		invitees = invitees.map((i) => (i.email === target ? { ...i, staffRole: value as Invitee['staffRole'] } : i));
	}

	function remove(target: string) {
		invitees = invitees.filter((i) => i.email !== target);
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter') {
			event.preventDefault();
			add();
		}
	}
</script>

<div class="space-y-4">
	<div class="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-end">
		<div class="space-y-1.5">
			<label for="invite-email" class="block text-sm font-semibold">Email</label>
			<Input id="invite-email" type="email" placeholder="name@practice.com" bind:value={email} on:keydown={onKeydown} />
		</div>
		<div class="space-y-1.5">
			<span id="invite-role-label" class="block text-sm font-semibold">Role</span>
			<Select.Root
				selected={roleOption(role)}
				onSelectedChange={(v) => (role = v ? String(v.value) : '')}
			>
				<Select.Trigger aria-labelledby="invite-role-label">
					<Select.Value placeholder="Choose a role" />
				</Select.Trigger>
				<Select.Content>
					{#each ROLES as option (option.value)}
						<Select.Item value={option.value} label={option.label}>
							{option.label}
						</Select.Item>
					{/each}
				</Select.Content>
			</Select.Root>
		</div>
		<Button type="button" variant="outline" disabled={!email || !role} on:click={add}>
			<Plus class="mr-1 size-4" aria-hidden="true" /> Add
		</Button>
	</div>
	{#if problem}<p class="text-sm text-destructive" role="alert">{problem}</p>{/if}

	{#if invitees.length}
		<ul class="divide-y rounded-lg border">
			{#each invitees as invitee (invitee.email)}
				<li class="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
					<span class="min-w-0 break-all text-sm font-semibold">{invitee.email}</span>
					<div class="flex items-center gap-2">
						<Select.Root
							selected={roleOption(invitee.staffRole)}
							onSelectedChange={(v) => v && setRole(invitee.email, String(v.value))}
						>
							<Select.Trigger class="h-9 w-32" aria-label={`Role for ${invitee.email}`}>
								<Select.Value />
							</Select.Trigger>
							<Select.Content>
								{#each ROLES as option (option.value)}
									<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
								{/each}
							</Select.Content>
						</Select.Root>
						<Button type="button" variant="ghost" size="icon" aria-label={`Remove ${invitee.email}`} on:click={() => remove(invitee.email)}>
							<X class="size-4" aria-hidden="true" />
						</Button>
					</div>
				</li>
			{/each}
		</ul>
	{:else}
		<p class="rounded-lg border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
			Add each person's email and role. They'll get an invite to set up their own sign-in.
		</p>
	{/if}

	{#each invitees as invitee, i (invitee.email)}
		<input type="hidden" name={`invitees[${i}][email]`} value={invitee.email} />
		<input type="hidden" name={`invitees[${i}][staffRole]`} value={invitee.staffRole} />
	{/each}
</div>
