<script lang="ts">
	import { tick } from 'svelte';
	import { Download, FileText, Lock, Trash2, Upload } from 'lucide-svelte';
	import { format } from 'date-fns';
	import { enhance as formEnhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import ConfirmDialog from '$dtss/ConfirmDialog.svelte';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Hint from '$dtss/Hint.svelte';
	import Section from '$dtss/Section.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import FileDropzone from '$lib/components/file-upload.svelte';
	import SignatureRequestList from '$lib/components/signatures/SignatureRequestList.svelte';
	import { Button } from '$lib/components/ui/button';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { clientDocumentDownloadUrl, type SignatureRequestView } from '$lib/signatures/types';
	import SettingsPanel from './SettingsPanel.svelte';

	type DocType = 'LICENSE' | 'CERTIFICATE' | 'AGREEMENT' | 'OTHER';
	type Doc = { id: string; filename: string; type: string; createdAt: Date | string; adminOnly?: boolean | null };

	let { documents = [], signatureRequests = [] }: { documents?: Doc[]; signatureRequests?: SignatureRequestView[] } = $props();

	const TYPES: { value: DocType; label: string }[] = [
		{ value: 'LICENSE', label: 'License' },
		{ value: 'CERTIFICATE', label: 'Certificate' },
		{ value: 'AGREEMENT', label: 'Agreement' },
		{ value: 'OTHER', label: 'Other' }
	];
	const typeLabel = (value: string) => TYPES.find((t) => t.value === value)?.label ?? value;

	let uploadOpen = $state(false);
	let uploadDocType = $state<DocType>('OTHER');
	let uploadDocUrl = $state('');
	let uploadDocFilename = $state('');
	let uploadForm = $state<HTMLFormElement>();

	let deleting = $state<Doc | null>(null);
	let deleteOpen = $state(false);
	let deleteError = $state('');

	async function handleClientDocUpload(file: File | undefined) {
		if (!file) return;

		const formData = new FormData();
		formData.append('file', file);
		formData.append('location', 'client-documents');

		const response = await fetch('/api/uploadFile', { method: 'POST', body: formData });
		if (!response.ok) throw new Error('Upload failed');

		const { url, fileName } = await response.json();
		uploadDocUrl = url;
		uploadDocFilename = fileName;

		await tick();
		uploadForm?.requestSubmit();
	}

	function askDelete(doc: Doc) {
		deleting = doc;
		deleteError = '';
		deleteOpen = true;
	}

	const columns: DataColumn<Doc>[] = [
		{ id: 'file', header: 'File', cell: fileCell },
		{ id: 'type', header: 'Type', value: (d) => typeLabel(d.type) },
		{ id: 'uploaded', header: 'Uploaded', value: (d) => format(new Date(d.createdAt), 'PP') },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actionsCell, class: 'text-right' }
	];
</script>

{#snippet fileCell(doc: Doc)}
	<span class="flex min-w-0 items-center gap-2">
		<FileText class="size-4 shrink-0 text-primary-dark" aria-hidden="true" />
		<span class="truncate font-semibold">{doc.filename}</span>
		{#if doc.adminOnly}
			<Hint text="Locked by DTSS. Only our team can remove it." class="inline-flex shrink-0 text-muted-foreground">
				<Lock class="size-4" aria-hidden="true" /><span class="sr-only">Locked</span>
			</Hint>
		{/if}
	</span>
{/snippet}
{#snippet actionsCell(doc: Doc)}
	<div class="flex justify-end gap-1">
		<Button variant="ghost" size="icon" href={clientDocumentDownloadUrl(doc.id)} aria-label={`Download ${doc.filename}`}>
			<Download class="size-4" aria-hidden="true" />
		</Button>
		{#if !doc.adminOnly}
			<Button variant="ghost" size="icon" class="text-destructive hover:text-destructive" aria-label={`Delete ${doc.filename}`} on:click={() => askDelete(doc)}>
				<Trash2 class="size-4" aria-hidden="true" />
			</Button>
		{:else}
			<span class="size-10" aria-hidden="true"></span>
		{/if}
	</div>
{/snippet}
{#snippet mobile(doc: Doc)}
	<div class="flex items-center justify-between gap-3">
		<div class="min-w-0">
			{@render fileCell(doc)}
			<p class="mt-0.5 text-sm text-muted-foreground">{typeLabel(doc.type)} · {format(new Date(doc.createdAt), 'PP')}</p>
		</div>
		{@render actionsCell(doc)}
	</div>
{/snippet}
{#snippet empty()}
	<EmptyState icon={FileText} title="No documents yet" description="Keep licenses, certificates and agreements for your practice in one place.">
		<Button on:click={() => (uploadOpen = true)}><Upload class="mr-2 size-4" aria-hidden="true" /> Upload a document</Button>
	</EmptyState>
{/snippet}

<SettingsPanel title="Documents" description="Agreements with DTSS and your practice's own files.">
	{#snippet actions()}
		<Button on:click={() => (uploadOpen = true)}><Upload class="mr-2 size-4" aria-hidden="true" /> Upload</Button>
	{/snippet}

	{#if signatureRequests.length > 0}
		<Section title="Agreements" description="Documents we've sent you to sign. Signed copies are saved below.">
			<SignatureRequestList requests={signatureRequests} audience="client" />
		</Section>
	{/if}

	<DataTable rows={documents} {columns} key={(d) => d.id} caption="Practice documents" {mobile} {empty} />
</SettingsPanel>

<Dialog.Root bind:open={uploadOpen}>
	<Dialog.Content class="max-w-lg rounded-2xl">
		<Dialog.Header>
			<Dialog.Title class="text-h2">Upload a document</Dialog.Title>
			<Dialog.Description>PDF, Word or an image, up to 10 MB. It uploads as soon as you choose the file.</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="space-y-1.5">
				<span id="doc-type-label" class="block text-sm font-semibold">Document type</span>
				<Select.Root
					selected={TYPES.find((t) => t.value === uploadDocType)}
					onSelectedChange={(v) => v && (uploadDocType = v.value as DocType)}
				>
					<Select.Trigger aria-labelledby="doc-type-label"><Select.Value /></Select.Trigger>
					<Select.Content>
						{#each TYPES as option (option.value)}
							<Select.Item value={option.value} label={option.label}>{option.label}</Select.Item>
						{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<FileDropzone
				onFileDrop={handleClientDocUpload}
				accept={['image/*', '.jpg', '.png', '.pdf', '.doc', '.docx']}
				maxSizeMB={10}
				multiple={false}
			/>
		</div>
		<Dialog.Footer>
			<Button variant="outline" on:click={() => (uploadOpen = false)}>Cancel</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>

<!-- Posted once the file is in storage. -->
<form
	bind:this={uploadForm}
	method="POST"
	action="?/uploadClientDocument"
	use:formEnhance={() => {
		return async ({ result, update }) => {
			if (result.type === 'success') {
				uploadOpen = false;
				uploadDocType = 'OTHER';
				await invalidateAll();
			}
			await update();
		};
	}}
	class="hidden"
>
	<input type="hidden" name="uploadUrl" value={uploadDocUrl} />
	<input type="hidden" name="filename" value={uploadDocFilename} />
	<input type="hidden" name="type" value={uploadDocType} />
</form>

<!-- A hard delete: the row and the link to the file go. Typed confirmation (03). -->
<ConfirmDialog
	bind:open={deleteOpen}
	title={`Delete ${deleting?.filename ?? 'this document'}?`}
	description="The document is removed from your practice's files for good. This can't be undone."
	confirmText="DELETE"
	cancelLabel="Keep it"
>
	{#snippet confirm({ ready, typed })}
		<form
			method="POST"
			action="?/deleteClientDocument"
			use:formEnhance={() => {
				return async ({ result, update }) => {
					if (result.type === 'success') {
						deleteOpen = false;
						await invalidateAll();
					} else if (result.type === 'failure') {
						deleteError = String(result.data?.error ?? "We couldn't delete that. Try again.");
					}
					await update();
				};
			}}
		>
			<input type="hidden" name="documentId" value={deleting?.id ?? ''} />
			<input type="hidden" name="confirm" value={typed} />
			<Button type="submit" variant="destructive" class="min-h-11 w-full sm:min-h-10" disabled={!ready}>Delete document</Button>
		</form>
		{#if deleteError}<p class="text-sm text-destructive sm:order-first sm:mr-auto" role="alert">{deleteError}</p>{/if}
	{/snippet}
</ConfirmDialog>
