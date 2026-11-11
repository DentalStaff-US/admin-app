<script lang="ts">
	// Admin or Super admin, each with the one sentence that says what it can do.
	// Native radios styled as cards: the whole card is the label, so it's one tap.
	import { STAFF_ROLE_OPTIONS, type StaffRole } from '$lib/authz';

	let { value = $bindable('ADMIN'), name = 'role' }: { value?: StaffRole; name?: string } = $props();
</script>

<fieldset class="grid gap-2">
	<legend class="mb-2 text-sm font-medium">Role</legend>
	{#each STAFF_ROLE_OPTIONS as option (option.value)}
		<label
			class="flex cursor-pointer items-start gap-3 rounded-lg border bg-card p-3 transition duration-fast hover:border-primary/40 has-[:checked]:border-primary has-[:checked]:bg-primary-soft has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring"
		>
			<input type="radio" {name} value={option.value} bind:group={value} class="mt-1 size-4 accent-primary" />
			<span class="min-w-0">
				<span class="block font-semibold">{option.label}</span>
				<span class="block text-sm text-muted-foreground">{option.description}</span>
			</span>
		</label>
	{/each}
</fieldset>
