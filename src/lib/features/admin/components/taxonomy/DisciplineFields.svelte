<script lang="ts">
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';

	let {
		name = $bindable(''),
		abbreviation = $bindable(''),
		requiresLicense = $bindable(false),
		errors = {},
		editing = false
	}: {
		name?: string;
		abbreviation?: string;
		requiresLicense?: boolean;
		errors?: { name?: string[]; abbreviation?: string[] };
		/** Edit copy explains what turning the flag off does. */
		editing?: boolean;
	} = $props();

	const prefix = $derived(editing ? 'edit' : 'add');
</script>

<div class="space-y-4">
	<div class="space-y-1.5">
		<Label for="{prefix}-discipline-name" class="font-semibold">Discipline name</Label>
		<Input
			id="{prefix}-discipline-name"
			name="name"
			required
			placeholder="e.g. Dental Hygienist"
			bind:value={name}
			aria-invalid={errors.name ? 'true' : undefined}
		/>
		{#if errors.name}<p class="text-sm text-destructive">{errors.name[0]}</p>{/if}
	</div>
	<div class="space-y-1.5">
		<Label for="{prefix}-discipline-abbr" class="font-semibold">Abbreviation</Label>
		<Input
			id="{prefix}-discipline-abbr"
			name="abbreviation"
			required
			placeholder="e.g. RDH"
			bind:value={abbreviation}
			aria-invalid={errors.abbreviation ? 'true' : undefined}
		/>
		{#if errors.abbreviation}<p class="text-sm text-destructive">{errors.abbreviation[0]}</p>{/if}
	</div>
	<div class="rounded-lg border bg-muted/40 p-4">
		<div class="flex items-start gap-3">
			<Checkbox id="{prefix}-discipline-license" bind:checked={requiresLicense} class="mt-0.5" />
			<!-- bits-ui 0.x checkboxes post nothing; the hidden field is what the action reads. -->
			{#if requiresLicense}<input type="hidden" name="requiresLicense" value="on" />{/if}
			<Label for="{prefix}-discipline-license" class="font-semibold leading-snug">
				Requires a license or registration to practise
			</Label>
		</div>
		{#if editing}
			<p class="mt-2 text-sm text-muted-foreground">
				Turning this off stops license enforcement for this discipline immediately, including for anyone
				currently blocked or mid-countdown.
			</p>
		{:else}
			<p class="mt-2 text-sm text-muted-foreground">
				A legal requirement for everyone holding this discipline, such as dentists and hygienists.
				Registrations count the same as licenses. Professionals are asked to upload theirs with its
				expiration date.
			</p>
			<p class="mt-2 text-sm font-semibold text-foreground">
				Flagging this starts a 30-day countdown: anyone without one on file is nudged, and 30 days after
				that first notice their jobs for this discipline are hidden until they supply one.
			</p>
			<p class="mt-2 text-sm text-muted-foreground">
				An expired license hides jobs immediately, with no grace period. Certifications are separate and
				are declared by each professional on their own profile.
			</p>
		{/if}
	</div>
</div>
