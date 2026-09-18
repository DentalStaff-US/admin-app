<script lang="ts">
	export let data;
	export let form;

	type FormValues = {
		firstName?: string;
		lastName?: string;
		email?: string;
		organizationName?: string;
		website?: string;
		audience?: string;
	};

	// Repopulate the form after a rejected submission. The password is never
	// echoed back by the action.
	$: values = ((form?.values ?? {}) as FormValues) satisfies FormValues;
</script>

<svelte:head>
	<title>Become a Partner | Dental Temps Staffing Solutions</title>
</svelte:head>

<main class="mx-auto max-w-2xl px-6 py-12">
	<h1 class="text-3xl font-bold text-gray-900">Become a Partner</h1>
	<p class="mt-2 text-gray-600">
		For dental schools, supply companies, consultants and creators. Refer practices or dental
		professionals to DTSS and earn commission on the shifts they generate.
	</p>
	<p class="mt-2 text-sm text-gray-500">
		Already a DTSS practice or professional? You don't need to apply — join from the Affiliate
		section of your settings page.
	</p>

	{#if !data.programEnabled}
		<p class="mt-6 rounded bg-gray-100 px-4 py-3 text-sm text-gray-700">
			We're not accepting new partner applications at the moment. Please check back soon.
		</p>
	{:else if form?.success}
		<div class="mt-6 rounded border border-green-200 bg-green-50 px-4 py-4">
			<h2 class="font-semibold text-green-900">Application received</h2>
			<p class="mt-1 text-sm text-green-800">
				Thanks — our team will review your application and email you once it's approved. Your
				referral link becomes active at that point.
			</p>
		</div>
	{:else}
		{#if form?.message}
			<p class="mt-6 rounded bg-red-50 px-4 py-3 text-sm text-red-700">{form.message}</p>
		{/if}

		<form method="POST" class="mt-8 space-y-5">
			<div class="grid grid-cols-1 gap-5 sm:grid-cols-2">
				<div>
					<label class="block text-sm font-medium" for="firstName">First name</label>
					<input
						id="firstName"
						name="firstName"
						required
						value={values.firstName ?? ''}
						class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
					/>
				</div>
				<div>
					<label class="block text-sm font-medium" for="lastName">Last name</label>
					<input
						id="lastName"
						name="lastName"
						required
						value={values.lastName ?? ''}
						class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
					/>
				</div>
			</div>

			<div>
				<label class="block text-sm font-medium" for="email">Email</label>
				<input
					id="email"
					name="email"
					type="email"
					autocomplete="email"
					required
					value={values.email ?? ''}
					class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium" for="password">Password</label>
				<input
					id="password"
					name="password"
					type="password"
					autocomplete="new-password"
					minlength="8"
					required
					class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
				/>
				<p class="mt-1 text-xs text-gray-500">At least 8 characters.</p>
			</div>

			<div>
				<label class="block text-sm font-medium" for="organizationName">
					Organization or brand
				</label>
				<input
					id="organizationName"
					name="organizationName"
					required
					placeholder="e.g. Midwest Dental College, Bright Supply Co."
					value={values.organizationName ?? ''}
					class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium" for="website">Website or social profile</label>
				<input
					id="website"
					name="website"
					placeholder="https://"
					value={values.website ?? ''}
					class="mt-1 w-full rounded border border-gray-300 px-3 py-2"
				/>
			</div>

			<div>
				<label class="block text-sm font-medium" for="audience">
					Tell us about your audience
				</label>
				<textarea
					id="audience"
					name="audience"
					rows="4"
					placeholder="Who would you be referring — practices, professionals, students?"
					class="mt-1 w-full rounded border border-gray-300 px-3 py-2">{values.audience ?? ''}</textarea
				>
			</div>

			<button
				type="submit"
				class="rounded bg-gray-900 px-5 py-2.5 font-medium text-white hover:bg-gray-800"
			>
				Submit application
			</button>
		</form>
	{/if}
</main>
