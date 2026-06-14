<script lang="ts">
	import * as Card from '$lib/components/ui/card';
	import { Button } from '$lib/components/ui/button';
	import { MailCheck } from 'lucide-svelte';
	import { APP_NAME } from '$lib/config/constants';
	import AuthShell from '$lib/components/auth/auth-shell.svelte';
	export let data;
</script>

<AuthShell>
	<Card.Root class="border-slate-200/80 shadow-xl shadow-sky-900/5">
		<Card.Header class="space-y-2 text-center">
			<MailCheck class="mx-auto h-12 w-12 text-primary" />
			<Card.Title class="text-2xl">Confirm your email</Card.Title>
			<Card.Description>
				Check your inbox for a message to confirm your email address for {APP_NAME}. If it doesn't
				appear within a few minutes, check your spam folder.
			</Card.Description>
		</Card.Header>
		<Card.Footer class="flex-col gap-3">
			{#if data.user?.email}
				<Button
					href="/auth/verify/resend-email-{encodeURIComponent(data.user.email)}"
					variant="outline"
					class="w-full"
				>
					Resend verification email
				</Button>
			{/if}
			<a href="/auth/sign-in" class="text-sm text-slate-500 hover:text-primary hover:underline">
				Back to sign in
			</a>
		</Card.Footer>
	</Card.Root>
</AuthShell>
