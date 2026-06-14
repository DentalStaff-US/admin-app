<script lang="ts">
	import Button from '$lib/components/ui/button/button.svelte';
	import * as Card from '$lib/components/ui/card';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import {
		Select,
		SelectContent,
		SelectInput,
		SelectItem,
		SelectTrigger,
		SelectValue
	} from '$lib/components/ui/select';
	import { Loader2, Save } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';

	export let data;

	const { form, enhance, submitting } = superForm(data.settingsForm);

	$: selectedPaymentType = $form.paymentFeeType
		? {
				label: $form.paymentFeeType === 'FIXED' ? 'Fixed' : 'Percentage',
				value: $form.paymentFeeType
			}
		: undefined;
</script>

<section class="container mx-auto flex flex-col min-h-screen">
	<div class="py-6 flex flex-col gap-6">
		<div>
			<h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">
				Application Settings
			</h1>
			<p class="text-sm text-muted-foreground">
				Manage application-wide settings and configurations.
			</p>
		</div>

		<form method="POST" use:enhance action="?/updateSettings">
			<Card.Root>
				<Card.Content class="space-y-6 pt-6">
					<div class="space-y-1">
						<Label for="paymentFee">Invoice Platform Fee</Label>
						<p class="text-xs text-muted-foreground">
							Platform fee charged when handling invoices on behalf of Business Members.
						</p>
						<div class="flex gap-2 pt-1">
							<Input
								id="paymentFee"
								type="number"
								name="paymentFee"
								class="max-w-[140px]"
								bind:value={$form.paymentFee}
							/>
							<Select
								selected={selectedPaymentType}
								onSelectedChange={(v) => {
									if (v) $form.paymentFeeType = v.value;
								}}
							>
								<SelectTrigger class="max-w-[180px]">
									<SelectValue placeholder="Select Fee Type" />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="FIXED">Fixed</SelectItem>
									<SelectItem value="PERCENTAGE">Percentage</SelectItem>
								</SelectContent>
								<SelectInput name="paymentFeeType" bind:value={$form.paymentFeeType} />
							</Select>
						</div>
					</div>

					<div class="space-y-1">
						<Label for="defaultSearchRadiusMiles">Default Search Radius (miles)</Label>
						<p class="text-xs text-muted-foreground">
							Default radius used when finding qualified candidates for a requisition. Applies
							across both apps as the fallback when no per-requisition radius is set.
						</p>
						<Input
							id="defaultSearchRadiusMiles"
							type="number"
							name="defaultSearchRadiusMiles"
							min="1"
							max="500"
							class="max-w-[140px]"
							bind:value={$form.defaultSearchRadiusMiles}
						/>
					</div>
				</Card.Content>
				<Card.Footer>
					<Button class="bg-primary hover:bg-primary/90 ml-auto" type="submit">
						<Save class="mr-2" />
						{#if $submitting}
							<Loader2 class="animate-spin" /> Saving...
						{:else}
							Save Changes
						{/if}
					</Button>
				</Card.Footer>
			</Card.Root>
		</form>
	</div>
</section>
