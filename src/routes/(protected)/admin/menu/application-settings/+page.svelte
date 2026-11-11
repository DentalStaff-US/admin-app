<script lang="ts">
	import { Loader2 } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import * as Select from '$lib/components/ui/select';

	let { data } = $props();

	const { form, errors, message, enhance, submitting } = superForm(data.settingsForm);

	const feeTypeLabel = (value: string | undefined) => (value === 'FIXED' ? 'Fixed amount' : 'Percentage');
	const selectedFeeType = $derived(
		$form.paymentFeeType ? { label: feeTypeLabel($form.paymentFeeType), value: $form.paymentFeeType } : undefined
	);
</script>

<Page width="narrow">
	<PageHeader title="Application settings" description="Platform-wide fees and defaults. Changes apply as soon as you save." />

	<form method="POST" action="?/updateSettings" use:enhance>
		<!-- 03 › Card: a section card with divide-y rows and a footer. -->
		<section class="overflow-hidden rounded-lg border bg-card shadow-card">
			<div class="divide-y">
				<div class="grid gap-3 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-start sm:px-6">
					<div>
						<Label for="paymentFee" class="font-semibold">Invoice platform fee</Label>
						<p class="mt-1 text-sm text-muted-foreground">
							Charged when DTSS handles invoices on behalf of practices.
						</p>
					</div>
					<div class="flex gap-2">
						<Input
							id="paymentFee"
							type="number"
							name="paymentFee"
							min="0"
							step="1"
							class="w-28 tabular-nums"
							bind:value={$form.paymentFee}
							aria-invalid={$errors.paymentFee ? 'true' : undefined}
							aria-describedby={$errors.paymentFee ? 'paymentFee-error' : undefined}
						/>
						<Select.Root
							selected={selectedFeeType}
							onSelectedChange={(v) => {
								if (v) $form.paymentFeeType = v.value as 'FIXED' | 'PERCENTAGE';
							}}
						>
							<Select.Trigger class="w-40" aria-label="Fee type">
								<Select.Value placeholder="Fee type" />
							</Select.Trigger>
							<Select.Content>
								<Select.Item value="PERCENTAGE" label="Percentage">Percentage</Select.Item>
								<Select.Item value="FIXED" label="Fixed amount">Fixed amount</Select.Item>
							</Select.Content>
							<Select.Input name="paymentFeeType" bind:value={$form.paymentFeeType} />
						</Select.Root>
					</div>
					{#if $errors.paymentFee}
						<p id="paymentFee-error" class="text-sm text-destructive sm:col-span-2">{$errors.paymentFee[0]}</p>
					{/if}
				</div>

				<div class="grid gap-3 px-5 py-5 sm:grid-cols-[1fr_auto] sm:items-start sm:px-6">
					<div>
						<Label for="defaultSearchRadiusMiles" class="font-semibold">Default search radius (miles)</Label>
						<p class="mt-1 text-sm text-muted-foreground">
							Used to find qualified professionals for a request when the request sets no radius of its own.
							Applies in both apps.
						</p>
					</div>
					<Input
						id="defaultSearchRadiusMiles"
						type="number"
						name="defaultSearchRadiusMiles"
						min="1"
						max="500"
						class="w-28 tabular-nums"
						bind:value={$form.defaultSearchRadiusMiles}
						aria-invalid={$errors.defaultSearchRadiusMiles ? 'true' : undefined}
						aria-describedby={$errors.defaultSearchRadiusMiles ? 'radius-error' : undefined}
					/>
					{#if $errors.defaultSearchRadiusMiles}
						<p id="radius-error" class="text-sm text-destructive sm:col-span-2">{$errors.defaultSearchRadiusMiles[0]}</p>
					{/if}
				</div>
			</div>

			<div class="flex flex-col-reverse gap-3 border-t bg-muted/30 px-5 py-4 sm:flex-row sm:items-center sm:justify-end sm:px-6">
				{#if $message}<p class="text-sm text-destructive sm:mr-auto" role="alert">{$message}</p>{/if}
				<Button type="submit" disabled={$submitting}>
					{#if $submitting}<Loader2 class="mr-2 size-4 animate-spin" aria-hidden="true" />Saving…{:else}Save changes{/if}
				</Button>
			</div>
		</section>
	</form>
</Page>
