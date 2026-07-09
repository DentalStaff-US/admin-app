<script lang="ts">
	import type { PageData } from './$types';
	import { superForm } from 'sveltekit-superforms/client';
	import AddressSearchAutocomplete from '$lib/components/AddressSearchAutocomplete.svelte';

	export let data: PageData;

	const { form, errors, allErrors, enhance, submitting } = superForm(data.form, {
		dataType: 'json',
		taintedMessage: null
	});

	let previewLoading = false;
	let previewResult: {
		count: number;
		total: number;
		optedOut: number;
		noContact: number;
		channel: string;
		sample: { name: string; to: string | null }[];
	} | null = null;
	let previewError = '';

	let testAddress = '';
	let testStatus = '';

	// Keep a sensible default test destination as the channel changes.
	$: if (!testAddress && $form.channel === 'EMAIL') testAddress = data.testDefaults.email;

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

	async function runPreview() {
		previewLoading = true;
		previewError = '';
		previewResult = null;
		try {
			const res = await fetch('/admin/menu/mass-notifications/create/preview', {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify(filterPayload())
			});
			const json = await res.json();
			if (json.error) previewError = json.error;
			else previewResult = json;
		} catch (e) {
			previewError = String(e);
		} finally {
			previewLoading = false;
		}
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
			testStatus = json.success ? 'Test sent ✓' : `Failed: ${json.error ?? 'unknown error'}`;
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

	const inputCls =
		'w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none';
	const labelCls = 'block text-sm font-medium text-gray-700 mb-1';
</script>

<section class="grow h-screen overflow-y-auto container mx-auto px-4 py-6">
	<div class="p-6">
		<a href="/admin/menu/mass-notifications" class="text-sm text-blue-600 hover:underline">
			← Back to mass notifications
		</a>
		<h1 class="mt-2 text-3xl font-extrabold tracking-tighter md:text-4xl">New Mass Notification Campaign</h1>
	</div>

	<form method="POST" action="?/queue" use:enhance class="px-6 pb-16 grid grid-cols-1 lg:grid-cols-2 gap-8">
		<!-- LEFT: audience + filters -->
		<div class="space-y-5">
			<div>
				<label class={labelCls} for="name">Name (internal)</label>
				<input id="name" class={inputCls} bind:value={$form.name} placeholder="e.g. July RDH re-engagement" />
				{#if $errors.name}<p class="text-xs text-red-600 mt-1">{$errors.name}</p>{/if}
			</div>

			<div class="grid grid-cols-2 gap-4">
				<div>
					<label class={labelCls} for="audience">Audience</label>
					<select id="audience" class={inputCls} bind:value={$form.audience}>
						<option value="CANDIDATE">Professionals (candidates)</option>
						<option value="CLIENT">Businesses (clients)</option>
					</select>
				</div>
				<div>
					<label class={labelCls} for="channel">Channel</label>
					<select id="channel" class={inputCls} bind:value={$form.channel}>
						<option value="SMS">SMS</option>
						<option value="EMAIL">Email</option>
					</select>
				</div>
			</div>

			<fieldset class="border rounded-md p-4 space-y-4">
				<legend class="px-1 text-sm font-semibold text-gray-600">Filters</legend>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class={labelCls} for="filterName">Name contains</label>
						<input id="filterName" class={inputCls} bind:value={$form.filterName} />
					</div>
					<div>
						<label class={labelCls} for="filterPhone">Phone contains</label>
						<input id="filterPhone" class={inputCls} bind:value={$form.filterPhone} />
					</div>
				</div>

				{#if $form.audience === 'CLIENT'}
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class={labelCls} for="companyName">Company name</label>
							<input id="companyName" class={inputCls} bind:value={$form.companyName} />
						</div>
						<div>
							<label class={labelCls} for="filterEmail">Email contains</label>
							<input id="filterEmail" class={inputCls} bind:value={$form.filterEmail} />
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class={labelCls} for="clientStatus">Status</label>
							<select id="clientStatus" class={inputCls} bind:value={$form.filterStatus}>
								<option value="">Any</option>
								{#each data.clientStatuses as s}<option value={s}>{s}</option>{/each}
							</select>
						</div>
						<div>
							<label class={labelCls} for="paymentType">Payment type</label>
							<select id="paymentType" class={inputCls} bind:value={$form.paymentType}>
								<option value="">Any</option>
								<option value="STRIPE">Stripe (active)</option>
								<option value="SETUP">Set Up Customer (pending)</option>
								<option value="PAPER">Paper</option>
							</select>
						</div>
					</div>
					<div>
						<label class={labelCls} for="clientRecipientTarget">Send to</label>
						<select id="clientRecipientTarget" class={inputCls} bind:value={$form.clientRecipientTarget}>
							<option value="OWNER">Account owner ({$form.channel === 'SMS' ? 'owner cell' : 'owner email'}) — e.g. clawbacks</option>
							<option value="LOCATION">Location ({$form.channel === 'SMS' ? 'office number' : 'office email'}) — e.g. job-related</option>
						</select>
						<p class="mt-1 text-xs text-gray-500">
							Owner reaches the business account holder; Location reaches the office that matched your
							location filter (or the primary office).
						</p>
					</div>
				{:else}
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class={labelCls} for="filterEmail">Email contains</label>
							<input id="filterEmail" class={inputCls} bind:value={$form.filterEmail} />
						</div>
						<div>
							<label class={labelCls} for="candStatus">Status</label>
							<select id="candStatus" class={inputCls} bind:value={$form.filterStatus}>
								<option value="">Any</option>
								{#each data.candidateStatuses as s}<option value={s}>{s}</option>{/each}
							</select>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class={labelCls} for="discipline">Discipline</label>
							<select id="discipline" class={inputCls} bind:value={$form.disciplineId}>
								<option value="">Any</option>
								{#each data.disciplines as d}<option value={d.id}>{d.name}</option>{/each}
							</select>
						</div>
						<div>
							<label class={labelCls} for="experience">Experience (this level &amp; above)</label>
							<select id="experience" class={inputCls} bind:value={$form.experienceLevelId}>
								<option value="">Any</option>
								{#each data.experienceLevels as e}<option value={e.id}>{e.value}</option>{/each}
							</select>
						</div>
					</div>
					<div class="grid grid-cols-2 gap-4">
						<div>
							<label class={labelCls} for="payMin">Pay rate min ($/hr)</label>
							<input id="payMin" type="number" class={inputCls} bind:value={$form.payRateMin} />
						</div>
						<div>
							<label class={labelCls} for="payMax">Pay rate max ($/hr)</label>
							<input id="payMax" type="number" class={inputCls} bind:value={$form.payRateMax} />
						</div>
					</div>
				{/if}

				<div class="grid grid-cols-2 gap-4">
					<div>
						<label class={labelCls} for="createdFrom">Created from</label>
						<input id="createdFrom" type="date" class={inputCls} bind:value={$form.createdFrom} />
					</div>
					<div>
						<label class={labelCls} for="createdTo">Created to</label>
						<input id="createdTo" type="date" class={inputCls} bind:value={$form.createdTo} />
					</div>
				</div>

				<div>
					<label class={labelCls} for="location">Location (within radius)</label>
					<AddressSearchAutocomplete
						country="us"
						types="place,locality,region,district,postcode,neighborhood,address"
						placeholder="Search a city or address…"
						on:select={onAddressSelect}
						on:clear={onAddressClear}
					/>
					<div class="mt-2 flex items-center gap-2">
						<span class="text-xs text-gray-500">{$form.locationLabel || 'No location set'}</span>
						{#if $form.locationLat != null}
							<input
								type="number"
								min="1"
								max="500"
								class="w-28 rounded-md border border-gray-300 px-2 py-1 text-sm"
								placeholder={`${data.defaultRadiusMiles}`}
								bind:value={$form.radiusMiles}
							/>
							<span class="text-xs text-gray-500">
								mile radius (default {data.defaultRadiusMiles})
							</span>
						{/if}
					</div>
				</div>

				<label class="flex items-center gap-2 text-sm">
					<input type="checkbox" bind:checked={$form.staleOnly} />
					Only those not contacted in the last 30 days
				</label>
			</fieldset>

			<div class="rounded-md border p-4">
				<button
					type="button"
					on:click={runPreview}
					class="rounded-md bg-gray-800 px-3 py-2 text-sm font-semibold text-white hover:bg-gray-900"
					disabled={previewLoading}
				>
					{previewLoading ? 'Counting…' : 'Preview recipients'}
				</button>
				{#if previewError}<p class="mt-2 text-sm text-red-600">{previewError}</p>{/if}
				{#if previewResult}
					<p class="mt-3 text-sm font-medium">
						{previewResult.count} will receive
						<span class="font-normal text-gray-500">of {previewResult.total} matched</span>
					</p>
					{#if previewResult.optedOut > 0 || previewResult.noContact > 0}
						<ul class="mt-1 text-xs text-amber-700 list-disc pl-5">
							{#if previewResult.optedOut > 0}
								<li>
									{previewResult.optedOut} excluded — opted out of
									{previewResult.channel === 'SMS' ? 'SMS' : 'email'}
								</li>
							{/if}
							{#if previewResult.noContact > 0}
								<li>
									{previewResult.noContact} excluded — no
									{previewResult.channel === 'SMS' ? 'phone number' : 'email address'}
								</li>
							{/if}
						</ul>
					{/if}
					{#if previewResult.sample.length}
						<ul class="mt-2 text-xs text-gray-500 list-disc pl-5">
							{#each previewResult.sample as s}<li>{s.name} — {s.to}</li>{/each}
						</ul>
					{/if}
				{/if}
			</div>
		</div>

		<!-- RIGHT: compose + test + queue -->
		<div class="space-y-5">
			{#if $form.channel === 'EMAIL'}
				<div>
					<label class={labelCls} for="subject">Subject</label>
					<input id="subject" class={inputCls} bind:value={$form.subject} />
					{#if $errors.subject}<p class="text-xs text-red-600 mt-1">{$errors.subject}</p>{/if}
				</div>
			{/if}

			<div>
				<label class={labelCls} for="body">Message</label>
				<textarea id="body" rows="10" class={inputCls} bind:value={$form.body}></textarea>
				<p class="mt-1 text-xs text-gray-500">
					Tokens: <code>{'{{firstName}}'}</code> and <code>{'{{lastName}}'}</code>. SMS gets a
					“Reply STOP to opt out” line automatically; emails get an unsubscribe footer.
				</p>
				{#if $errors.body}<p class="text-xs text-red-600 mt-1">{$errors.body}</p>{/if}
			</div>

			<div class="rounded-md border p-4 space-y-2">
				<label class={labelCls} for="testAddress">Send a test to yourself</label>
				<div class="flex gap-2">
					<input
						id="testAddress"
						class={inputCls}
						bind:value={testAddress}
						placeholder={$form.channel === 'EMAIL' ? 'you@example.com' : '+1 555 555 5555'}
					/>
					<button
						type="button"
						on:click={sendTest}
						class="whitespace-nowrap rounded-md bg-gray-200 px-3 py-2 text-sm font-semibold hover:bg-gray-300"
					>
						Send test
					</button>
				</div>
				{#if testStatus}<p class="text-xs text-gray-600">{testStatus}</p>{/if}
			</div>

			{#if $allErrors.length}
				<div class="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700">
					<p class="font-medium">Please fix the following before sending:</p>
					<ul class="mt-1 list-disc pl-5">
						{#each $allErrors as e}
							<li>{e.path ? `${e.path}: ` : ''}{e.messages.join(', ')}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<button
				type="submit"
				disabled={$submitting}
				class="w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white hover:bg-blue-700 disabled:opacity-60"
			>
				{$submitting ? 'Queueing…' : 'Queue & send'}
			</button>
			<p class="text-center text-xs text-gray-400">
				Recipients are snapshotted when you queue. Sending runs in the background.
			</p>
		</div>
	</form>
</section>
