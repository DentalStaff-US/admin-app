<script lang="ts">
	/**
	 * "Trust but verify" for the practice and DTSS staff: the credential of the
	 * professional assigned to this workday.
	 *
	 * This is the one case the gate cannot cover — hiding future listings does nothing
	 * about a shift already on the calendar — so it is loudest exactly when the
	 * credential has lapsed.
	 *
	 * The file opens through /api/credentials/[id]/download, which re-checks that the
	 * viewer owns this requisition and hands back a 15-minute signed URL. Never link
	 * `uploadUrl` here: that is a permanent public CDN address.
	 */
	import * as Alert from '$lib/components/ui/alert';
	import { Button } from '$lib/components/ui/button';
	import { FileText, AlertCircle, CheckCircle2, Download } from 'lucide-svelte';
	import { certBadge, formatCertDate } from '$lib/certStatusDisplay';

	export let credential: {
		candidateName: string;
		disciplineName: string;
		abbreviation: string;
		state: 'NOT_REQUIRED' | 'MISSING' | 'VALID' | 'EXPIRING' | 'EXPIRED';
		expiresOn: string | null;
		document: { id: string; filename: string | null } | null;
	} | null = null;

	/**
	 * Recurrence day id — scopes the download authorisation to this workday, so a
	 * signed link cannot be reused to pull a credential out of context.
	 */
	export let workdayId: string | undefined;

	$: badge = credential ? certBadge(credential.state, credential.expiresOn) : null;
	$: expired = credential?.state === 'EXPIRED';
	$: missing = credential?.state === 'MISSING';
</script>

{#if credential}
	<div
		class="rounded-lg border p-4 {expired || missing
			? 'border-red-200 bg-red-50'
			: 'bg-white'}"
	>
		<div class="flex items-start justify-between gap-4">
			<div class="min-w-0 flex-1">
				<div class="flex items-center gap-2">
					{#if expired || missing}
						<AlertCircle class="h-4 w-4 flex-shrink-0 text-red-600" />
					{:else}
						<CheckCircle2 class="h-4 w-4 flex-shrink-0 text-green-600" />
					{/if}
					<h4 class="text-sm font-medium">
						{credential.disciplineName} ({credential.abbreviation}) credential
					</h4>
				</div>

				<p class="mt-1 text-sm text-gray-700">
					{#if missing}
						No certificate on file for {credential.candidateName}.
					{:else if expired}
						{credential.candidateName}'s certification expired on
						{formatCertDate(credential.expiresOn)}.
					{:else}
						{credential.candidateName} — valid through {formatCertDate(credential.expiresOn)}.
					{/if}
				</p>

				{#if badge}
					<span
						class="mt-2 inline-flex rounded-full px-2 py-0.5 text-xs font-medium {badge.class}"
					>
						{badge.label}
					</span>
				{/if}

				{#if expired}
					<p class="mt-2 text-sm font-medium text-red-700">
						This professional is booked on a lapsed credential. Contact DTSS.
					</p>
				{/if}
			</div>

			{#if credential.document}
				<Button
					href={`/api/credentials/${credential.document.id}/download?workdayId=${workdayId}`}
					target="_blank"
					rel="noopener noreferrer"
					variant="outline"
					size="sm"
					class="flex-shrink-0"
				>
					<Download class="mr-2 h-4 w-4" />
					View
				</Button>
			{/if}
		</div>

		{#if credential.document?.filename}
			<p class="mt-2 flex items-center gap-1 text-xs text-gray-500">
				<FileText class="h-3 w-3" />
				{credential.document.filename}
			</p>
		{/if}
	</div>
{/if}
