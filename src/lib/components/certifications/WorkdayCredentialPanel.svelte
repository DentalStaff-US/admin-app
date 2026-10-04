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
	import { FileText, AlertCircle, CheckCircle2, Download, Info } from 'lucide-svelte';
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
			/** Set only when the attached certificate contradicts the declared date. */
			documentExpiresOn: string | null;
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
</script>

{#if credential && (showLicense || showCert)}
	<div class="rounded-lg border p-4 {alarming ? 'border-red-200 bg-red-50' : 'bg-white'}">
		<h4 class="text-sm font-medium">
			{credential.disciplineName} ({credential.abbreviation}) credentials — {credential.candidateName}
		</h4>

		{#if showLicense}
			<div class="mt-3 flex items-start justify-between gap-4">
				<div class="min-w-0 flex-1">
					<div class="flex items-center gap-2">
						{#if bad(credential.license.state)}
							<AlertCircle class="h-4 w-4 flex-shrink-0 text-red-600" />
						{:else}
							<CheckCircle2 class="h-4 w-4 flex-shrink-0 text-green-600" />
						{/if}
						<span class="text-sm font-medium">License</span>
					</div>

					<p class="mt-1 text-sm text-gray-700">
						{#if credential.license.state === 'MISSING' || credential.license.state === 'MISSING_GRACE'}
							No license on file{#if credential.license.graceDaysRemaining !== null}
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
							This professional is booked on a lapsed license. Contact DTSS.
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
						<span
							class="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-600"
						>
							<Info class="h-3 w-3" /> self-declared
						</span>
					</div>

					<p class="mt-1 text-sm text-gray-700">
						{#if credential.certification.state === 'MISSING'}
							Declared as required, but no expiration date on file.
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

					{#if credential.certification.documentExpiresOn}
						<!-- The attached certificate disagrees with the date they typed. This
						     is precisely what verification is for, so it is shown rather than
						     one value being quietly preferred. -->
						<p class="mt-2 text-sm font-medium text-amber-800">
							The attached certificate shows {formatCertDate(
								credential.certification.documentExpiresOn
							)}, which does not match the date entered. Worth checking.
						</p>
					{/if}

					{#if credential.certification.document?.filename}
						<p class="mt-2 flex items-center gap-1 text-xs text-gray-500">
							<FileText class="h-3 w-3" />
							{credential.certification.document.filename}
						</p>
					{:else if !bad(credential.certification.state)}
						<p class="mt-2 text-xs text-gray-500">No certificate attached to verify against.</p>
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
	</div>
{/if}
