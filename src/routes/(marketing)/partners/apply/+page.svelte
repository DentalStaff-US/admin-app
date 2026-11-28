<script lang="ts">
	import { enhance } from '$app/forms';
	import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2 } from 'lucide-svelte';
	import * as Alert from '$lib/components/ui/alert';
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import { Textarea } from '$lib/components/ui/textarea';
	import AuthShell from '$lib/components/auth/auth-shell.svelte';

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

	let submitting = false;
	let showPassword = false;
</script>

<svelte:head>
	<title>Become a Partner | Dental Temps Staffing Solutions</title>
</svelte:head>

<AuthShell label="Partner Portal" gradient="from-slate-50 via-white to-sky-50">
	{#if !data.programEnabled}
		<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
			<Card.Header class="space-y-1">
				<Card.Title class="text-2xl" tag="h1">Become a partner</Card.Title>
				<Card.Description>
					We're not accepting new partner applications at the moment. Please check back soon.
				</Card.Description>
			</Card.Header>
		</Card.Root>
	{:else if form?.success}
		<Card.Root class="border-slate-200/80 text-center shadow-xl shadow-sky-900/5">
			<Card.Header class="items-center space-y-3">
				<span
					class="flex size-12 items-center justify-center rounded-full bg-success/10 text-success"
				>
					<CheckCircle2 class="size-6" aria-hidden="true" />
				</span>
				<Card.Title class="text-2xl" tag="h1">Application received</Card.Title>
				<Card.Description>
					Thanks! Our team will review your application and email you once it's approved. Your
					referral link becomes active at that point.
				</Card.Description>
			</Card.Header>
			<Card.Content>
				<p class="text-sm text-muted-foreground">
					In the meantime, you can sign in with the email and password you just chose to see your
					application status.
				</p>
				<Button href={data.portalUrl} class="mt-4 h-11 w-full text-base">
					Go to the Partner Portal
				</Button>
			</Card.Content>
		</Card.Root>
	{:else}
		<form
			method="POST"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					await update({ reset: false });
					submitting = false;
				};
			}}
		>
			<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
				<Card.Header class="space-y-1">
					<Card.Title class="text-2xl" tag="h1">Become a partner</Card.Title>
					<Card.Description>
						For dental schools, supply companies, consultants and creators. Refer practices or
						dental professionals to DTSS and earn commission on the shifts they generate.
					</Card.Description>
				</Card.Header>
				<Card.Content class="grid gap-4">
					{#if form?.message}
						<Alert.Root variant="destructive">
							<AlertCircle class="h-4 w-4" />
							<Alert.Title>We couldn't submit your application</Alert.Title>
							<Alert.Description>{form.message}</Alert.Description>
						</Alert.Root>
					{/if}

					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div class="grid gap-1.5">
							<Label for="firstName">First name</Label>
							<Input
								id="firstName"
								name="firstName"
								autocomplete="given-name"
								required
								value={values.firstName ?? ''}
							/>
						</div>
						<div class="grid gap-1.5">
							<Label for="lastName">Last name</Label>
							<Input
								id="lastName"
								name="lastName"
								autocomplete="family-name"
								required
								value={values.lastName ?? ''}
							/>
						</div>
					</div>

					<div class="grid gap-1.5">
						<Label for="email">Email</Label>
						<Input
							id="email"
							name="email"
							type="email"
							autocomplete="email"
							placeholder="you@example.com"
							required
							value={values.email ?? ''}
						/>
					</div>

					<div class="grid gap-1.5">
						<Label for="password">Password</Label>
						<div class="relative">
							<Input
								id="password"
								name="password"
								type={showPassword ? 'text' : 'password'}
								autocomplete="new-password"
								minlength={8}
								required
								aria-describedby="password-help"
								class="pr-11"
							/>
							<button
								type="button"
								aria-label={showPassword ? 'Hide password' : 'Show password'}
								aria-pressed={showPassword}
								on:click={() => (showPassword = !showPassword)}
								class="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
							>
								{#if showPassword}
									<EyeOff class="size-4" aria-hidden="true" />
								{:else}
									<Eye class="size-4" aria-hidden="true" />
								{/if}
							</button>
						</div>
						<p id="password-help" class="text-sm text-muted-foreground">At least 8 characters.</p>
					</div>

					<div class="grid gap-1.5">
						<Label for="organizationName">Organization or brand</Label>
						<Input
							id="organizationName"
							name="organizationName"
							autocomplete="organization"
							placeholder="e.g. Midwest Dental College, Bright Supply Co."
							required
							value={values.organizationName ?? ''}
						/>
					</div>

					<div class="grid gap-1.5">
						<Label for="website">
							Website or social profile <span class="font-normal text-muted-foreground"
								>(optional)</span
							>
						</Label>
						<Input
							id="website"
							name="website"
							autocomplete="url"
							placeholder="https://"
							value={values.website ?? ''}
						/>
					</div>

					<div class="grid gap-1.5">
						<Label for="audience">
							Tell us about your audience <span class="font-normal text-muted-foreground"
								>(optional)</span
							>
						</Label>
						<Textarea
							id="audience"
							name="audience"
							rows={4}
							placeholder="Who would you be referring: practices, professionals, students?"
							value={values.audience ?? ''}
						/>
					</div>
				</Card.Content>
				<Card.Footer>
					<Button type="submit" class="h-11 w-full text-base" disabled={submitting}>
						{#if submitting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" /> Please wait
						{:else}
							Submit application
						{/if}
					</Button>
				</Card.Footer>
			</Card.Root>
		</form>

		<div class="mt-4 rounded-lg border bg-card p-5 text-sm shadow-sm">
			<p class="font-semibold">Already a DTSS practice or professional?</p>
			<p class="mt-1 text-muted-foreground">
				You don't need to apply. Join from the affiliate section of your settings page.
			</p>
			<p class="mt-3 text-muted-foreground">
				Already applied?
				<a href={data.portalUrl} class="font-medium text-primary hover:underline">Sign in</a>
			</p>
		</div>
	{/if}
</AuthShell>
