<script lang="ts">
	import * as Form from '$lib/components/ui/form';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { userSchema } from '$lib/config/zod-schemas';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { Loader2, AlertCircle } from 'lucide-svelte';
	import AuthShell from '$lib/components/auth/auth-shell.svelte';

	const resetPasswordSchema = userSchema.pick({
		email: true
	});

	type ResetPasswordSchema = typeof resetPasswordSchema;

	export let form: SuperValidated<ResetPasswordSchema>;
</script>

<AuthShell>
	<Form.Root let:submitting let:errors method="POST" {form} schema={resetPasswordSchema} let:config>
		<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
			<Card.Header class="space-y-1">
				<Card.Title class="text-2xl">Reset your password</Card.Title>
				<Card.Description>Enter your email and we'll send you a reset link.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				{#if errors?._errors?.length}
					<Alert.Root variant="destructive">
						<AlertCircle class="h-4 w-4" />
						<Alert.Title>Reset password problem</Alert.Title>
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
			</Card.Content>
			<Card.Footer class="flex-col gap-4">
				<Form.Button
					class="h-11 w-full bg-primary text-base hover:bg-primary/90"
					disabled={submitting}
				>
					{#if submitting}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" /> Please wait
					{:else}
						Send reset link
					{/if}
				</Form.Button>
				<a href="/auth/sign-in" class="text-sm text-slate-500 hover:text-primary hover:underline">
					Back to sign in
				</a>
			</Card.Footer>
		</Card.Root>
	</Form.Root>
</AuthShell>
