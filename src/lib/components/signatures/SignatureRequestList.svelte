<script lang="ts">
	import { format } from 'date-fns';
	import { FileSignature, Download, ExternalLink } from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import { Button } from '$lib/components/ui/button';
	import {
		SIGNATURE_STATUS_DISPLAY,
		clientDocumentDownloadUrl,
		type SignatureRequestView
	} from '$lib/signatures/types';

	export let requests: SignatureRequestView[] = [];
	/** 'client' = the practice's own view; 'admin' = internal labels and detail. */
	export let audience: 'client' | 'admin' = 'client';

	const fmt = (d: Date | string | null) => (d ? format(new Date(d), 'PP') : null);

	function detail(r: SignatureRequestView): string | null {
		if (r.status === 'COMPLETED') return `Signed ${fmt(r.completedAt)}`;
		if (r.status === 'AWAITING_COUNTERSIGN') {
			return audience === 'admin' && r.countersignerNames.length
				? `Client signed ${fmt(r.subjectSignedAt)} · waiting on ${r.countersignerNames.join(', ')}`
				: `You signed ${fmt(r.subjectSignedAt)}`;
		}
		if (r.status === 'SENT' || r.status === 'OPENED') {
			const sent = `Sent ${fmt(r.sentAt)}`;
			return audience === 'admin'
				? `${sent} to ${r.recipientName} <${r.recipientEmail}>${r.nudgesExhaustedAt ? ' · reminders finished' : ''}`
				: sent;
		}
		if (audience === 'admin' && r.closedReason) return `${fmt(r.closedAt)} · ${r.closedReason}`;
		return fmt(r.closedAt);
	}
</script>

{#if requests.length > 0}
	<ul class="divide-y rounded-lg border">
		{#each requests as r (r.id)}
			{@const display = SIGNATURE_STATUS_DISPLAY[r.status]}
			<li class="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
				<div class="flex items-start gap-3 min-w-0">
					<FileSignature class="mt-0.5 h-5 w-5 flex-shrink-0 text-muted-foreground" />
					<div class="min-w-0">
						<div class="flex flex-wrap items-center gap-2">
							<span class="font-medium">{r.title}</span>
							<Badge
								variant={display.tone}
								value={audience === 'admin' ? display.admin : display.client}
							/>
						</div>
						{#if detail(r)}
							<p class="mt-1 text-sm text-muted-foreground break-words">{detail(r)}</p>
						{/if}
					</div>
				</div>

				<div class="flex flex-shrink-0 flex-wrap gap-2">
					{#if r.signingUrl}
						<a href={r.signingUrl} target="_blank" rel="noopener noreferrer">
							<Button size="sm" class="gap-1">
								Review & sign <ExternalLink class="h-3.5 w-3.5" />
							</Button>
						</a>
					{/if}
					{#if r.clientDocumentUploadId}
						<a href={clientDocumentDownloadUrl(r.clientDocumentUploadId)}>
							<Button size="sm" variant="outline" class="gap-1">
								<Download class="h-3.5 w-3.5" /> Download
							</Button>
						</a>
					{/if}
					<slot name="actions" request={r} />
				</div>
			</li>
		{/each}
	</ul>
{/if}
