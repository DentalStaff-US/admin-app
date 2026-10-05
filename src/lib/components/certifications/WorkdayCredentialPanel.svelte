<script lang="ts">
	/**
	 * "Trust but verify" for the practice and DTSS staff: the credentials of the
	 * professional assigned to this workday.
	 *
	 * This is the one case the gate cannot cover — hiding future listings does nothing
	 * about a shift already on the calendar — so it is loudest when something has
	 * lapsed.
	 *
	 * The two tracks are shown differently ON PURPOSE. A LICENSE is platform-required
	 * and document-backed, so the practice can open the file and check it. A
	 * CERTIFICATION is a date the professional typed about their own jurisdiction;
	 * presenting that to a client as though DTSS had verified it would be a liability,
	 * so it is labelled self-declared and has no document to open.
	 *
	 * Files open through /api/credentials/[id]/download, which re-checks that the
	 * viewer owns this requisition and returns a 15-minute signed URL. Never link
	 * `uploadUrl`: that is a permanent public CDN address.
	 */
	import { Button } from '$lib/components/ui/button';
	import {
		FileText,
		AlertCircle,
		CheckCircle2,
		Download,
		Info,
		ChevronDown
	} from 'lucide-svelte';
	import { credentialBadge, formatCertDate } from '$lib/credentialStatusDisplay';
	import type { CertState } from '$lib/credentialStatusDisplay';

	export let credential: {
		candidateName: string;
		disciplineName: string;
		abbreviation: string;
		license: {
			state: CertState;
			expiresOn: string | null;
			graceDaysRemaining: number | null;
			document: { id: string; filename: string | null } | null;
		};
		certification: {
			state: CertState;
			expiresOn: string | null;
			selfDeclared: true;
			document: { id: string; filename: string | null } | null;
		};
	} | null = null;

	/** Recurrence day id — scopes the download authorisation to this workday. */
	export let workdayId: string | undefined;

	const bad = (s: CertState) => s === 'EXPIRED' || s === 'MISSING';

	$: licenseBadge = credential
		? credentialBadge('LICENSE', {
				required: credential.license.state !== 'NOT_REQUIRED',
				expiresOn: credential.license.expiresOn,
				graceStartedOn: credential.license.graceDaysRemaining !== null ? 'tracked' : null
			})
		: null;
	$: showLicense = credential && credential.license.state !== 'NOT_REQUIRED';
	$: showCert = credential && credential.certification.state !== 'NOT_REQUIRED';
	$: alarming =
		credential && (bad(credential.license.state) || bad(credential.certification.state));

	/** Open by default; collapsible to reclaim the space once it has been read. */
	let expanded = true;

	/** One-line summary for the collapsed state, so closing it still says something. */
	$: summary = credential
		? [
				showLicense ? `License/Registration: ${stateWord(credential.license.state)}` : null,
				showCert ? `Certification: ${stateWord(credential.certification.state)}` : null
			]
				.filter(Boolean)
				.join(' · ')
		: '';

	function stateWord(s: CertState): string {
		if (s === 'EXPIRED') return 'expired';
		if (s === 'MISSING' || s === 'MISSING_GRACE') return 'not on file';
		if (s === 'EXPIRING') return 'expiring soon';
		return 'current';
	}
</script>

{#if credential && (showLicense || showCert)}
	<div class="rounded-lg border p-4 {alarming ? 'border-red-200 bg-red-50' : 'bg-white'}">
		<button
			type="button"
			class="flex w-full items-start justify-between gap-3 text-left"
			aria-expanded={expanded}
			on:click={() => (expanded = !expanded)}
		>
			<span class="min-w-0">
				<span class="block text-sm font-medium">
					{credential.disciplineName} ({credential.abbreviation}) credentials — {credential.candidateName}
				</span>
				{#if !expanded}
					<span
						class="mt-0.5 block text-xs {alarming ? 'font-medium text-red-700' : 'text-gray-600'}"
					>
						{summary}
					</span>
				{/if}
			</span>
			<ChevronDown
				class="h-4 w-4 flex-shrink-0 text-gray-500 transition-transform {expanded
					? 'rotate-180'
					: ''}"
			/>
		</button>

		{#if expanded}

		{#if showLicense}
			<div class="mt-3 flex items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						{#if bad(credential.license.state)}
							<AlertCircle class="h-4 w-4 flex-shrink-0 text-red-600" />
						{:else}
							<CheckCircle2 class="h-4 w-4 flex-shrink-0 text-green-600" />
						{/if}
						<span class="text-sm font-medium">License/Registration</span>
					</div>

					<p class="mt-1 text-sm text-gray-700">
						{#if credential.license.state === 'MISSING' || credential.license.state === 'MISSING_GRACE'}
							None on file{#if credential.license.graceDaysRemaining !== null}
								— {credential.license.graceDaysRemaining} day{credential.license
									.graceDaysRemaining === 1
									? ''
									: 's'} to supply one{/if}.
						{:else if credential.license.state === 'EXPIRED'}
							Expired {formatCertDate(credential.license.expiresOn)}.
						{:else}
							Valid through {formatCertDate(credential.license.expiresOn)}.
						{/if}
					</p>

					{#if credential.license.state === 'EXPIRED'}
						<p class="mt-2 text-sm font-medium text-red-700">
							This professional is booked on a lapsed license/registration. Contact DTSS.
						</p>
					{/if}

					{#if credential.license.document?.filename}
						<p class="mt-2 flex items-center gap-1 text-xs text-gray-500">
							<FileText class="h-3 w-3" />
							{credential.license.document.filename}
						</p>
					{/if}
				</div>

				{#if credential.license.document}
					<Button
						href={`/api/credentials/${credential.license.document.id}/download?workdayId=${workdayId}`}
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
		{/if}

		{#if showCert}
			<div class="mt-3 flex items-start justify-between gap-4 border-t pt-3">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						{#if bad(credential.certification.state)}
							<AlertCircle class="h-4 w-4 flex-shrink-0 text-red-600" />
						{:else}
							<CheckCircle2 class="h-4 w-4 flex-shrink-0 text-green-600" />
						{/if}
						<span class="text-sm font-medium">Certification</span>
					</div>

					<p class="mt-1 text-sm text-gray-700">
						{#if credential.certification.state === 'MISSING'}
							Declared as required, but no certificate on file.
						{:else if credential.certification.state === 'EXPIRED'}
							Expired {formatCertDate(credential.certification.expiresOn)}.
						{:else}
							Valid through {formatCertDate(credential.certification.expiresOn)}.
						{/if}
					</p>

					{#if credential.certification.state === 'EXPIRED'}
						<p class="mt-2 text-sm font-medium text-red-700">
							This professional is booked on a lapsed certification. Contact DTSS.
						</p>
					{/if}

					<!-- Full width, below the status: this is a sentence about where the
					     information came from, and squeezing it into a tag beside the
					     label wrapped it over three lines. -->
					<p class="mt-1.5 flex items-start gap-1.5 text-xs text-gray-500">
						<Info class="mt-0.5 h-3 w-3 flex-shrink-0" />
						<span>
							The professional reports that their state requires this certification. The
							date is taken from the certificate they uploaded.
						</span>
					</p>

					{#if credential.certification.document?.filename}
						<p class="mt-2 flex items-center gap-1 text-xs text-gray-500">
							<FileText class="h-3 w-3" />
							{credential.certification.document.filename}
						</p>
					{/if}
				</div>

				{#if credential.certification.document}
					<Button
						href={`/api/credentials/${credential.certification.document.id}/download?workdayId=${workdayId}`}
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
		{/if}
		{/if}
	</div>
{/if}
