<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { userSchema } from '$lib/config/zod-schemas';
	import { Loader2, AlertCircle } from 'lucide-svelte';
	import { superForm } from 'sveltekit-superforms/client';
	import Input from '$lib/components/ui/input/input.svelte';
	import Label from '$lib/components/ui/label/label.svelte';
	import { Checkbox } from '$lib/components/ui/checkbox/index.js';
	import { Button } from '$lib/components/ui/button';
	import AuthShell from '$lib/components/auth/auth-shell.svelte';

	const signUpSchema = userSchema.pick({
		firstName: true,
		lastName: true,
		email: true,
		password: true,
		terms: true
	});

	export let data;
	const { signupForm } = data;

	const {
		form: formData,
		errors,
		enhance,
		submitting
	} = superForm(signupForm, {
		resetForm: false,
		dataType: 'json'
	});
</script>

<AuthShell>
	<form method="POST" use:enhance>
			<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
				<Card.Header class="space-y-1">
					<Card.Title class="text-2xl">Create your account</Card.Title>
					<Card.Description>
						Already have an account?
						<a href="/auth/sign-in" class="font-medium text-primary hover:underline">Sign in</a>
					</Card.Description>
				</Card.Header>
				<Card.Content class="grid gap-4">
					{#if $errors?._errors?.length}
						<Alert.Root variant="destructive">
							<AlertCircle class="h-4 w-4" />
							<Alert.Title>Error</Alert.Title>
							<Alert.Description>
								{#each $errors._errors as error}
									{error}
								{/each}
							</Alert.Description>
						</Alert.Root>
					{/if}

					<div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
						<div class="grid gap-1.5">
							<Label for="firstName">First name</Label>
							<Input id="firstName" bind:value={$formData.firstName} name="firstName" />
							{#if $errors.firstName}
								<p class="text-sm text-destructive">{$errors.firstName}</p>
							{/if}
						</div>
						<div class="grid gap-1.5">
							<Label for="lastName">Last name</Label>
							<Input id="lastName" bind:value={$formData.lastName} name="lastName" />
							{#if $errors.lastName}
								<p class="text-sm text-destructive">{$errors.lastName}</p>
							{/if}
						</div>
					</div>
					<div class="grid gap-1.5">
						<Label for="email">Email address</Label>
						<Input
							id="email"
							type="email"
							autocomplete="email"
							bind:value={$formData.email}
							name="email"
							placeholder="you@example.com"
						/>
						{#if $errors.email}
							<p class="text-sm text-destructive">{$errors.email}</p>
						{/if}
					</div>
					<div class="grid gap-1.5">
						<Label for="password">Password</Label>
						<Input
							id="password"
							type="password"
							autocomplete="new-password"
							bind:value={$formData.password}
							name="password"
						/>
						{#if $errors.password}
							<p class="text-sm text-destructive">{$errors.password}</p>
						{/if}
					</div>
					<div class="flex flex-row items-start space-x-3 rounded-md border border-slate-200 p-4">
						<Checkbox id="terms" bind:checked={$formData.terms} aria-labelledby="terms-label" />
						<div class="text-sm leading-relaxed">
							<Label for="terms" id="terms-label">I accept the terms and privacy policy.</Label>
							<div class="text-slate-500">
								You agree to the
								<a href="/terms" class="text-primary underline">terms</a>
								and
								<a href="/privacy" class="text-primary underline">privacy policy</a>.
							</div>
						</div>
					</div>
				</Card.Content>
				<Card.Footer>
					<Button
						type="submit"
						class="h-11 w-full bg-primary text-base hover:bg-primary/90"
						disabled={$submitting}
					>
						{#if $submitting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" /> Please wait
						{:else}
							Create account
						{/if}
					</Button>
				</Card.Footer>
			</Card.Root>
	</form>
</AuthShell>
