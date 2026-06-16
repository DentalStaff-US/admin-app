<script lang="ts">
	import * as Form from '$lib/components/ui/form';
	import * as Card from '$lib/components/ui/card';
	import * as Alert from '$lib/components/ui/alert';
	import { userResetPasswordSchema, type UserResetPasswordSchema } from '$lib/config/zod-schemas';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { Loader2, AlertCircle } from 'lucide-svelte';
	import AuthShell from '$lib/components/auth/auth-shell.svelte';

	export let data: { form: SuperValidated<UserResetPasswordSchema>; hasToken: boolean };
	$: form = data.form;
</script>

<AuthShell>
	<Form.Root let:submitting let:errors method="POST" {form} schema={userResetPasswordSchema} let:config>
		<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
			<Card.Header class="space-y-1">
				<Card.Title class="text-2xl">Change your password</Card.Title>
				<Card.Description>Choose a new password for your account.</Card.Description>
			</Card.Header>
			<Card.Content class="grid gap-4">
				{#if !data.hasToken}
					<Alert.Root variant="destructive">
						<AlertCircle class="h-4 w-4" />
						<Alert.Title>Invalid or expired link</Alert.Title>
						<Alert.Description>
							This password reset link is invalid or has expired. Please request a new one.
						</Alert.Description>
					</Alert.Root>
				{/if}
				{#if errors?._errors?.length}
					<Alert.Root variant="destructive">
						<AlertCircle class="h-4 w-4" />
						<Alert.Title>Change password problem</Alert.Title>
						<Alert.Description>
							{#each errors._errors as error}
								{error}
							{/each}
						</Alert.Description>
					</Alert.Root>
				{/if}

				<Form.Field {config} name="password">
					<Form.Item>
						<Form.Label>New password</Form.Label>
						<Form.Input type="password" autocomplete="new-password" />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
				<Form.Field {config} name="confirmPassword">
					<Form.Item>
						<Form.Label>Confirm new password</Form.Label>
						<Form.Input type="password" autocomplete="new-password" />
						<Form.Validation />
					</Form.Item>
				</Form.Field>
			</Card.Content>
			<Card.Footer>
				<Form.Button
					class="h-11 w-full bg-primary text-base hover:bg-primary/90"
					disabled={submitting || !data.hasToken}
				>
					{#if submitting}
						<Loader2 class="mr-2 h-4 w-4 animate-spin" /> Please wait
					{:else}
						Update password
					{/if}
				</Form.Button>
			</Card.Footer>
		</Card.Root>
	</Form.Root>
</AuthShell>
