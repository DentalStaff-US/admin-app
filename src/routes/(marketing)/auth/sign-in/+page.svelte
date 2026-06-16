<script lang="ts">
	import * as Form from '$lib/components/ui/form';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { userSchema } from '$lib/config/zod-schemas';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { Loader2, AlertCircle } from 'lucide-svelte';
	import AuthShell from '$lib/components/auth/auth-shell.svelte';

	const signInSchema = userSchema.pick({
		email: true,
		password: true
	});

	type SignInSchema = typeof signInSchema;

	export let form: SuperValidated<SignInSchema>;
</script>

<AuthShell>
	<Form.Root let:submitting let:errors method="POST" {form} schema={signInSchema} let:config>
			<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
				<Card.Header class="space-y-1">
					<Card.Title class="text-2xl">Welcome back</Card.Title>
					<Card.Description>
						Don't have an account yet?
						<a href="/auth/sign-up" class="font-medium text-primary hover:underline">Sign up</a>
					</Card.Description>
				</Card.Header>
				<Card.Content class="grid gap-4">
					{#if errors?._errors?.length}
						<Alert.Root variant="destructive">
							<AlertCircle class="h-4 w-4" />
							<Alert.Title>Error</Alert.Title>
							<Alert.Description>
								{#each errors._errors as error}
									{error}
								{/each}
							</Alert.Description>
						</Alert.Root>
					{/if}
					<Form.Field {config} name="email">
						<Form.Item>
							<Form.Label>Email</Form.Label>
							<Form.Input type="email" autocomplete="email" placeholder="you@example.com" />
							<Form.Validation />
						</Form.Item>
					</Form.Field>
					<Form.Field {config} name="password">
						<Form.Item>
							<div class="flex items-center justify-between">
								<Form.Label>Password</Form.Label>
								<a
									href="/auth/password/reset"
									class="text-sm text-slate-500 hover:text-primary hover:underline"
								>
									Forgot password?
								</a>
							</div>
							<Form.Input type="password" autocomplete="current-password" />
							<Form.Validation />
						</Form.Item>
					</Form.Field>
				</Card.Content>
				<Card.Footer>
					<Form.Button
						class="h-11 w-full bg-primary text-base hover:bg-primary/90"
						disabled={submitting}
					>
						{#if submitting}
							<Loader2 class="mr-2 h-4 w-4 animate-spin" /> Please wait
						{:else}
							Sign in
						{/if}
					</Form.Button>
				</Card.Footer>
			</Card.Root>
	</Form.Root>
</AuthShell>
