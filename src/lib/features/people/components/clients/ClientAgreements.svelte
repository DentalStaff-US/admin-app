<script lang="ts">
	// Legacy syntax on purpose: SignatureRequestList hands each row to its
	// `actions` slot through let:request.
	import { enhance } from '$app/forms';
	import type { SubmitFunction } from '@sveltejs/kit';
	import { FileSignature, X } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import Section from '$dtss/Section.svelte';
	import SignatureRequestList from '$lib/components/signatures/SignatureRequestList.svelte';
	import ConfirmAction from '../ConfirmAction.svelte';

	export let signatureRequests: any[] = [];
	export let signatureKinds: { kind: string; title: string }[] = [];

	// Which send/nudge is in flight. Sending is two Documenso round-trips plus
	// an email, several seconds, so every agreement button waits for it.
	let busy: string | null = null;
	function track(key: string): SubmitFunction {
		return ({ cancel }) => {
			if (busy) return cancel();
			busy = key;
			return async ({ update }) => {
				await update();
				busy = null;
			};
		};
	}

	$: unsent = signatureKinds.filter((k) => !signatureRequests.some((r) => r.kind === k.kind && r.open));
</script>

<Section title="Agreements" description="Sent and tracked through Documenso. Signed copies are filed under Documents.">
	{#snippet actions()}
		{#each unsent as k (k.kind)}
			<form method="POST" action="?/sendSignatureRequest" use:enhance={track(`send:${k.kind}`)}>
				<input type="hidden" name="kind" value={k.kind} />
				<Button type="submit" size="sm" class="gap-2" disabled={!!busy}>
					<FileSignature class="size-4" aria-hidden="true" />
					{busy === `send:${k.kind}` ? 'Sending…' : `Send ${k.title}`}
				</Button>
			</form>
		{/each}
	{/snippet}
	{#if signatureRequests.length > 0}
		<SignatureRequestList requests={signatureRequests} audience="admin">
			<svelte:fragment slot="actions" let:request>
				{#if request.open && request.status !== 'PENDING'}
					<form method="POST" action="?/resendSignatureRequest" use:enhance={track(`resend:${request.id}`)}>
						<input type="hidden" name="requestId" value={request.id} />
						<Button type="submit" size="sm" variant="outline" disabled={!!busy}>
							{busy === `resend:${request.id}` ? 'Sending…' : request.status === 'AWAITING_COUNTERSIGN' ? 'Remind countersigner' : 'Nudge now'}
						</Button>
					</form>
					<ConfirmAction
						action="?/cancelSignatureRequest"
						fields={{ requestId: request.id }}
						title="Cancel this agreement?"
						description="The signing link stops working. To collect a signature later, send a new one."
						confirmLabel="Cancel agreement"
						label="Cancel"
						icon={X}
						variant="destructiveOutline"
						disabled={!!busy}
					/>
				{/if}
			</svelte:fragment>
		</SignatureRequestList>
	{:else}
		<p class="text-sm text-muted-foreground">No agreements sent yet.</p>
	{/if}
</Section>
