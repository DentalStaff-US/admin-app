<script lang="ts">
	// The mass-notification builder. Field names, the json superForm and the
	// preview/test endpoints are unchanged; only the controls (shadcn instead of
	// raw inputs and native selects) and the send confirmation are new.
	import { Send, Users } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import type { SuperValidated } from 'sveltekit-superforms';
	import type { MassNotificationSchema } from '$lib/config/zod-schemas';
	import AddressSearchAutocomplete from '$lib/components/AddressSearchAutocomplete.svelte';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import Notice from '$dtss/Notice.svelte';
	import Section from '$dtss/Section.svelte';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Textarea } from '$lib/components/ui/textarea';
	import SelectField from './SelectField.svelte';
	import { audienceLabel, plural } from './comms';

	type PreviewResult = {
		count: number;
		total: number;
		optedOut: number;
		noContact: number;
		channel: string;
		recipients: { key: string; name: string; to: string | null }[];
	};

	let {
		data
	}: {
		data: {
			form: SuperValidated<MassNotificationSchema>;
			disciplines: { id: string | number; name: string }[];
			experienceLevels: { id: string | number; value: string }[];
			candidateStatuses: string[];
			clientStatuses: string[];
			defaultRadiusMiles: number;
			testDefaults: { email: string };
		};
	} = $props();

	// svelte-ignore state_referenced_locally
	const { form, errors, allErrors, enhance, submitting } = superForm(data.form, {
		dataType: 'json',
		taintedMessage: null
	});

	let formEl = $state<HTMLFormElement>();
	let confirmOpen = $state(false);

	let previewLoading = $state(false);
	let previewResult = $state<PreviewResult | null>(null);
	let previewError = $state('');
	// The filter signature captured when the current preview ran. If the admin
	// edits any filter afterwards, the preview (and its selection) goes stale and
	// is cleared so a stale selection can never be queued.
	let previewSig = $state('');

	let testAddress = $state('');
	let testStatus = $state('');

	// Keep a sensible default test destination as the channel changes.
	$effect(() => {
		if (!testAddress && $form.channel === 'EMAIL') testAddress = data.testDefaults.email;
	});

	function filterPayload() {
		return {
			audience: $form.audience,
			channel: $form.channel,
			filterName: $form.filterName,
			filterEmail: $form.filterEmail,
			filterPhone: $form.filterPhone,
			filterStatus: $form.filterStatus,
			createdFrom: $form.createdFrom,
			createdTo: $form.createdTo,
			staleOnly: $form.staleOnly,
			locationLat: $form.locationLat,
			locationLon: $form.locationLon,
			radiusMiles: $form.radiusMiles,
			disciplineId: $form.disciplineId,
			experienceLevelId: $form.experienceLevelId,
			payRateMin: $form.payRateMin,
			payRateMax: $form.payRateMax,
			companyName: $form.companyName,
			paymentType: $form.paymentType,
			clientRecipientTarget: $form.clientRecipientTarget
		};
	}

	const filterSig = $derived(JSON.stringify(filterPayload()));
	const selectedCount = $derived($form.selectedRecipientKeys?.length ?? 0);
	const selectedSet = $derived(new Set($form.selectedRecipientKeys ?? []));

	// Drop a stale preview when the filters that produced it change. Clearing
	// previewResult makes the condition false, so this can't loop.
	$effect(() => {
		if (previewResult && filterSig !== previewSig) invalidatePreview();
	});

	function invalidatePreview() {
		previewResult = null;
		previewError = '';
		previewSig = '';
		$form.applyRecipientSelection = false;
		$form.selectedRecipientKeys = [];
	}

	async function runPreview() {
		previewLoading = true;
		previewError = '';
		previewResult = null;
		$form.applyRecipientSelection = false;
		$form.selectedRecipientKeys = [];
		try {
			const res = await fetch('/admin/menu/mass-notifications/create/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(filterPayload())
			});
			const json = (await res.json()) as PreviewResult & { error?: string };
			if (json.error) {
				previewError = json.error;
			} else {
				previewResult = json;
				previewSig = filterSig;
				// Everyone eligible starts selected; the admin deselects from here.
				$form.selectedRecipientKeys = [...new Set(json.recipients.map((r) => r.key))];
				$form.applyRecipientSelection = true;
			}
		} catch (e) {
			previewError = String(e);
		} finally {
			previewLoading = false;
		}
	}

	function selectAllRecipients() {
		if (!previewResult) return;
		$form.selectedRecipientKeys = [...new Set(previewResult.recipients.map((r) => r.key))];
	}

	function deselectAllRecipients() {
		$form.selectedRecipientKeys = [];
	}

	function toggleRecipient(key: string, on: boolean) {
		const current = $form.selectedRecipientKeys ?? [];
		$form.selectedRecipientKeys = on ? [...new Set([...current, key])] : current.filter((k) => k !== key);
	}

	async function sendTest() {
		testStatus = 'Sending…';
		try {
			const res = await fetch('/admin/menu/mass-notifications/create/test', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({
					channel: $form.channel,
					subject: $form.subject,
					body: $form.body,
					testAddress
				})
			});
			const json = await res.json();
			testStatus = json.success ? 'Test sent.' : `Failed: ${json.error ?? 'unknown error'}`;
		} catch (e) {
			testStatus = `Failed: ${e}`;
		}
	}

	function onAddressSelect(e: CustomEvent) {
		const a = e.detail;
		$form.locationLabel = a.place_name ?? a.formatted_address ?? '';
		$form.locationLat = a.coordinates?.lat;
		$form.locationLon = a.coordinates?.lng;
		// Seed the radius with the platform default so it always has a value; the
		// admin can still change it. (Server also falls back to this if left blank.)
		if ($form.radiusMiles == null) $form.radiusMiles = data.defaultRadiusMiles;
	}
	function onAddressClear() {
		$form.locationLabel = '';
		$form.locationLat = undefined;
		$form.locationLon = undefined;
		$form.radiusMiles = undefined;
	}

	const any = { value: '', label: 'Any' };
	const audienceOptions = [
		{ value: 'CANDIDATE', label: 'Professionals' },
		{ value: 'CLIENT', label: 'Practices' }
	];
	const channelOptions = [
		{ value: 'SMS', label: 'SMS' },
		{ value: 'EMAIL', label: 'Email' }
	];
	const paymentOptions = [
		any,
		{ value: 'STRIPE', label: 'Stripe (active)' },
		{ value: 'SETUP', label: 'Stripe setup pending' },
		{ value: 'PAPER', label: 'Paper invoices' }
	];
	const statusLabel = (s: string) => s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, ' ');
	const candidateStatusOptions = $derived([any, ...data.candidateStatuses.map((s) => ({ value: s, label: statusLabel(s) }))]);
	const clientStatusOptions = $derived([any, ...data.clientStatuses.map((s) => ({ value: s, label: statusLabel(s) }))]);
	const disciplineOptions = $derived([any, ...data.disciplines.map((d) => ({ value: String(d.id), label: d.name }))]);
	const experienceOptions = $derived([any, ...data.experienceLevels.map((e) => ({ value: String(e.id), label: e.value }))]);
	const targetOptions = $derived([
		{ value: 'OWNER', label: `Account owner (${$form.channel === 'SMS' ? 'owner cell' : 'owner email'})` },
		{ value: 'LOCATION', label: `Location (${$form.channel === 'SMS' ? 'office number' : 'office email'})` }
	]);

	const channelNoun = $derived($form.channel === 'SMS' ? 'SMS' : 'email');
	const confirmTitle = $derived(
		$form.applyRecipientSelection
			? `Send to ${plural(selectedCount, audienceLabel($form.audience).toLowerCase().replace(/s$/, ''))}?`
			: `Send to every matching ${audienceLabel($form.audience).toLowerCase().replace(/s$/, '')}?`
	);
	const confirmDescription = $derived(
		`“${$form.name || 'This mass notification'}” goes out by ${channelNoun} in the background once queued, and sent messages can't be recalled. ` +
			($form.applyRecipientSelection
				? 'Only the recipients you selected are queued.'
				: "You haven't previewed, so everyone matching the filters is queued.") +
			` Anyone who opted out of ${channelNoun} campaigns is skipped.`
	);

	function confirmSend() {
		confirmOpen = false;
		formEl?.requestSubmit();
	}
</script>

<form
	bind:this={formEl}
	id="mass-notification-form"
	method="POST"
	action="?/queue"
	use:enhance
	class="grid grid-cols-1 gap-6 lg:grid-cols-2"
>
	<!-- LEFT: audience + filters -->
	<div class="space-y-6">
		<Section title="Audience">
			<div class="space-y-4">
				<div class="space-y-2">
					<Label for="name">Name (internal)</Label>
					<Input id="name" bind:value={$form.name} placeholder="e.g. July RDH re-engagement" aria-invalid={$errors.name ? true : undefined} />
					{#if $errors.name}<p class="text-sm text-destructive">{$errors.name}</p>{/if}
				</div>
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="audience">Send to</Label>
						<SelectField id="audience" bind:value={$form.audience} options={audienceOptions} />
					</div>
					<div class="space-y-2">
						<Label for="channel">Channel</Label>
						<SelectField id="channel" bind:value={$form.channel} options={channelOptions} />
					</div>
				</div>
			</div>
		</Section>

		<Section title="Filters" description="Leave a filter blank to include everyone.">
			<div class="space-y-4">
				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="filterName">Name contains</Label>
						<Input id="filterName" bind:value={$form.filterName} />
					</div>
					<div class="space-y-2">
						<Label for="filterPhone">Phone contains</Label>
						<Input id="filterPhone" bind:value={$form.filterPhone} />
					</div>
				</div>

				{#if $form.audience === 'CLIENT'}
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="companyName">Company name</Label>
							<Input id="companyName" bind:value={$form.companyName} />
						</div>
						<div class="space-y-2">
							<Label for="filterEmail">Email contains</Label>
							<Input id="filterEmail" bind:value={$form.filterEmail} />
						</div>
						<div class="space-y-2">
							<Label for="clientStatus">Status</Label>
							<SelectField id="clientStatus" bind:value={$form.filterStatus} options={clientStatusOptions} />
						</div>
						<div class="space-y-2">
							<Label for="paymentType">Payment type</Label>
							<SelectField id="paymentType" bind:value={$form.paymentType} options={paymentOptions} />
						</div>
					</div>
					<div class="space-y-2">
						<Label for="clientRecipientTarget">Reach</Label>
						<SelectField id="clientRecipientTarget" bind:value={$form.clientRecipientTarget} options={targetOptions} placeholder="Account owner" />
						<p class="text-sm text-muted-foreground">
							The owner is the account holder (e.g. clawbacks). A location is the office that matched your
							location filter, or the primary office (e.g. job-related news).
						</p>
					</div>
				{:else}
					<div class="grid gap-4 sm:grid-cols-2">
						<div class="space-y-2">
							<Label for="filterEmail">Email contains</Label>
							<Input id="filterEmail" bind:value={$form.filterEmail} />
						</div>
						<div class="space-y-2">
							<Label for="candStatus">Status</Label>
							<SelectField id="candStatus" bind:value={$form.filterStatus} options={candidateStatusOptions} />
						</div>
						<div class="space-y-2">
							<Label for="discipline">Discipline</Label>
							<SelectField id="discipline" bind:value={$form.disciplineId} options={disciplineOptions} />
						</div>
						<div class="space-y-2">
							<Label for="experience">Experience (this level and above)</Label>
							<SelectField id="experience" bind:value={$form.experienceLevelId} options={experienceOptions} />
						</div>
						<div class="space-y-2">
							<Label for="payMin">Pay rate min ($/hr)</Label>
							<Input id="payMin" type="number" inputmode="decimal" class="tabular-nums" bind:value={$form.payRateMin} />
						</div>
						<div class="space-y-2">
							<Label for="payMax">Pay rate max ($/hr)</Label>
							<Input id="payMax" type="number" inputmode="decimal" class="tabular-nums" bind:value={$form.payRateMax} />
						</div>
					</div>
				{/if}

				<div class="grid gap-4 sm:grid-cols-2">
					<div class="space-y-2">
						<Label for="createdFrom">Joined from</Label>
						<Input id="createdFrom" type="date" bind:value={$form.createdFrom} />
					</div>
					<div class="space-y-2">
						<Label for="createdTo">Joined to</Label>
						<Input id="createdTo" type="date" bind:value={$form.createdTo} />
					</div>
				</div>

				<div class="space-y-2">
					<p class="text-sm font-semibold" id="location-label">Location (within radius)</p>
					<AddressSearchAutocomplete
						country="us"
						types="place,locality,region,district,postcode,neighborhood,address"
						placeholder="Search a city or address…"
						on:select={onAddressSelect}
						on:clear={onAddressClear}
					/>
					<div class="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
						<span>{$form.locationLabel || 'No location set'}</span>
						{#if $form.locationLat != null}
							<Label for="radiusMiles" class="sr-only">Radius in miles</Label>
							<Input
								id="radiusMiles"
								type="number"
								min="1"
								max="500"
								class="h-9 w-24 tabular-nums"
								placeholder={`${data.defaultRadiusMiles}`}
								bind:value={$form.radiusMiles}
							/>
							<span>mile radius (default {data.defaultRadiusMiles})</span>
						{/if}
					</div>
				</div>

				<div class="flex items-center gap-2">
					<Checkbox id="staleOnly" bind:checked={$form.staleOnly} />
					<Label for="staleOnly" class="font-normal">Only people not contacted in the last 30 days</Label>
				</div>
			</div>
		</Section>

		<Section title="Recipients" description="Preview who these filters reach, then untick anyone to leave out.">
			<Button type="button" variant="outline" on:click={runPreview} disabled={previewLoading}>
				<Users class="mr-2 size-4" aria-hidden="true" />
				{previewLoading ? 'Counting…' : 'Preview & select recipients'}
			</Button>
			{#if previewError}<p class="mt-3 text-sm text-destructive" role="alert">{previewError}</p>{/if}
			{#if previewResult}
				<p class="mt-4 text-sm font-semibold">
					{selectedCount} selected
					<span class="font-normal text-muted-foreground">
						of {previewResult.recipients.length} eligible ({previewResult.total} matched)
					</span>
				</p>
				{#if previewResult.optedOut > 0 || previewResult.noContact > 0}
					<ul class="mt-1 list-disc pl-5 text-sm text-status-warning-fg">
						{#if previewResult.optedOut > 0}
							<li>
								{previewResult.optedOut} left out: opted out of {previewResult.channel === 'SMS' ? 'SMS' : 'email'} campaigns
							</li>
						{/if}
						{#if previewResult.noContact > 0}
							<li>
								{previewResult.noContact} left out: no {previewResult.channel === 'SMS' ? 'phone number' : 'email address'}
							</li>
						{/if}
					</ul>
				{/if}

				{#if previewResult.recipients.length}
					<div class="mt-4 flex items-center gap-1 text-sm">
						<span class="mr-2 font-semibold text-muted-foreground">Recipients</span>
						<Button type="button" variant="link" size="sm" class="h-auto px-1" on:click={selectAllRecipients}>Select all</Button>
						<span class="text-muted-foreground" aria-hidden="true">·</span>
						<Button type="button" variant="link" size="sm" class="h-auto px-1" on:click={deselectAllRecipients}>Deselect all</Button>
					</div>
					<ul class="relative mt-2 max-h-72 divide-y overflow-y-auto rounded-md border">
						{#each previewResult.recipients as r (r.key)}
							<li class="flex items-center gap-3 px-3 py-2 text-sm hover:bg-muted/50">
								<Checkbox
									id={`recipient-${r.key}`}
									checked={selectedSet.has(r.key)}
									onCheckedChange={(v) => toggleRecipient(r.key, v === true)}
								/>
								<label for={`recipient-${r.key}`} class="flex min-w-0 flex-1 gap-2">
									<span class="font-semibold">{r.name}</span>
									<span class="truncate text-muted-foreground">{r.to}</span>
								</label>
							</li>
						{/each}
					</ul>
					{#if selectedCount === 0}
						<p class="mt-2 text-sm text-destructive">No recipients selected. Select at least one to send.</p>
					{/if}
				{:else}
					<p class="mt-2 text-sm text-muted-foreground">No eligible recipients to select.</p>
				{/if}
			{/if}
		</Section>
	</div>

	<!-- RIGHT: compose + test + queue -->
	<div class="space-y-6">
		<Section title="Message">
			<div class="space-y-4">
				{#if $form.channel === 'EMAIL'}
					<div class="space-y-2">
						<Label for="subject">Subject</Label>
						<Input id="subject" bind:value={$form.subject} aria-invalid={$errors.subject ? true : undefined} />
						{#if $errors.subject}<p class="text-sm text-destructive">{$errors.subject}</p>{/if}
					</div>
				{/if}
				<div class="space-y-2">
					<Label for="body">Message</Label>
					<Textarea id="body" rows={10} bind:value={$form.body} aria-invalid={$errors.body ? true : undefined} />
					<p class="text-sm text-muted-foreground">
						Tokens: <code>{'{{firstName}}'}</code> and <code>{'{{lastName}}'}</code>. As a manual campaign, SMS gets a
						“Reply STOP to opt out” line and emails get an unsubscribe footer automatically.
					</p>
					{#if $errors.body}<p class="text-sm text-destructive">{$errors.body}</p>{/if}
				</div>
			</div>
		</Section>

		<Section title="Send a test to yourself">
			<div class="space-y-2">
				<Label for="testAddress">{$form.channel === 'EMAIL' ? 'Email address' : 'Phone number'}</Label>
				<div class="flex gap-2">
					<Input
						id="testAddress"
						bind:value={testAddress}
						placeholder={$form.channel === 'EMAIL' ? 'you@example.com' : '+1 555 555 5555'}
					/>
					<Button type="button" variant="secondary" on:click={sendTest}>Send test</Button>
				</div>
				{#if testStatus}<p class="text-sm text-muted-foreground" role="status">{testStatus}</p>{/if}
			</div>
		</Section>

		{#if $allErrors.length}
			<Notice tone="negative" title="Fix these before sending" alert>
				<ul class="list-disc pl-5">
					{#each $allErrors as e (e.path)}
						<li>{e.path ? `${e.path}: ` : ''}{e.messages.join(', ')}</li>
					{/each}
				</ul>
			</Notice>
		{/if}

		<div class="space-y-2">
			<Button
				type="button"
				size="lg"
				class="w-full"
				disabled={$submitting || ($form.applyRecipientSelection && selectedCount === 0)}
				on:click={() => (confirmOpen = true)}
			>
				<Send class="mr-2 size-4" aria-hidden="true" />
				{#if $submitting}
					Queueing…
				{:else if $form.applyRecipientSelection}
					Queue & send to {selectedCount} selected
				{:else}
					Queue & send
				{/if}
			</Button>
			<p class="text-center text-sm text-muted-foreground">
				{#if $form.applyRecipientSelection}
					Only the {selectedCount} selected recipient(s) will be queued.
				{:else}
					Preview to choose recipients, or queue to send to everyone matched.
				{/if}
				Recipients are snapshotted when you queue. Sending runs in the background.
			</p>
		</div>
	</div>
</form>

<ConfirmDialog bind:open={confirmOpen} title={confirmTitle} description={confirmDescription}>
	{#snippet confirm()}
		<Button on:click={confirmSend}>Queue & send</Button>
	{/snippet}
</ConfirmDialog>
