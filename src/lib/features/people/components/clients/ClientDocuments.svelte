<script lang="ts">
	import { tick } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { format } from 'date-fns';
	import { Download, FileText, Lock, Plus, Trash2, Unlock } from 'lucide-svelte';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Checkbox } from '$lib/components/ui/checkbox';
	import { Label } from '$lib/components/ui/label';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import FileDropzone from '$lib/components/file-upload.svelte';
	import { clientDocumentDownloadUrl } from '$lib/signatures/types';
	import { statusLabel } from '$tokens/status';
	import ConfirmAction from '../ConfirmAction.svelte';
	import ToneBadge from '../ToneBadge.svelte';

	type Doc = { id: string; filename: string; type: string; adminOnly: boolean | null; createdAt: Date | string };
	const TYPES = ['LICENSE', 'CERTIFICATE', 'AGREEMENT', 'OTHER'] as const;

	/**
	 * The practice's documents. Upload goes to /api/uploadFile, then the
	 * existing `uploadClientDocument` action files it; lock toggles admin-only;
	 * delete is a hard delete with a typed confirmation.
	 */
	let { documents, isAdmin }: { documents: Doc[]; isAdmin: boolean } = $props();

	let uploadOpen = $state(false);
	let docType = $state<(typeof TYPES)[number]>('OTHER');
	let adminOnly = $state(false);
	let uploadUrl = $state('');
	let filename = $state('');
	let formEl: HTMLFormElement | undefined = $state();

	async function upload(file: File | undefined) {
		if (!file) return;
		const body = new FormData();
		body.append('file', file);
		body.append('location', 'client-documents');
		const response = await fetch('/api/uploadFile', { method: 'POST', body });
		if (!response.ok) throw new Error('Upload failed');
		const json = await response.json();
		uploadUrl = json.url;
		filename = json.fileName;
		await tick();
		formEl?.requestSubmit();
	}

	const refresh = () => async ({ result, update }: any) => {
		if (result.type === 'success') await invalidateAll();
		await update();
	};

	const columns: DataColumn<Doc>[] = $derived([
		{ id: 'file', header: 'File', cell: fileCell },
		{ id: 'type', header: 'Type', value: (d) => statusLabel(d.type) },
		{ id: 'uploaded', header: 'Uploaded', value: (d) => format(new Date(d.createdAt), 'PP'), class: 'whitespace-nowrap tabular-nums' },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actionsCell, class: 'text-right' }
	]);
</script>

{#snippet fileCell(d: Doc)}
	<span class="flex min-w-0 items-center gap-2">
		<FileText class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
		<span class="max-w-64 truncate font-semibold">{d.filename}</span>
		{#if d.adminOnly}<ToneBadge tone="neutral" label="Admin only" hint="Locked: the practice can't see this file." />{/if}
	</span>
{/snippet}

{#snippet actionsCell(d: Doc)}
	<div class="flex justify-end gap-1">
		<Button href={clientDocumentDownloadUrl(d.id)} variant="ghost" size="icon" class="size-9" aria-label="Download {d.filename}">
			<Download class="size-4" aria-hidden="true" />
		</Button>
		{#if isAdmin}
			<form method="POST" action="?/toggleClientDocumentLock" use:enhance={refresh}>
				<input type="hidden" name="documentId" value={d.id} />
				<Button type="submit" variant="ghost" size="icon" class="size-9" aria-label="{d.adminOnly ? 'Unlock' : 'Lock'} {d.filename}">
					{#if d.adminOnly}<Unlock class="size-4" aria-hidden="true" />{:else}<Lock class="size-4" aria-hidden="true" />{/if}
				</Button>
			</form>
			<ConfirmAction
				action="?/deleteClientDocument"
				fields={{ documentId: d.id }}
				title="Delete {d.filename}?"
				description="The file is removed from this practice's documents for good. This can't be undone."
				confirmLabel="Delete document"
				confirmText="DELETE"
				label="Delete {d.filename}"
				icon={Trash2}
				iconOnly
				variant="ghost"
				onDone={async (ok) => { if (ok) await invalidateAll(); }}
			/>
		{/if}
	</div>
{/snippet}

{#snippet mobile(d: Doc)}
	<div class="flex items-start justify-between gap-2">
		<div class="min-w-0">
			{@render fileCell(d)}
			<p class="mt-1 text-sm text-muted-foreground">{statusLabel(d.type)} · {format(new Date(d.createdAt), 'PP')}</p>
		</div>
		<div class="relative z-10">{@render actionsCell(d)}</div>
	</div>
{/snippet}

{#snippet empty()}
	<EmptyState icon={FileText} title="No documents yet" description="Signed agreements land here automatically. Upload anything else you need on file." />
{/snippet}

<Section title="Documents" flush>
	{#snippet actions()}
		{#if isAdmin}<Button size="sm" class="gap-2" on:click={() => (uploadOpen = true)}><Plus class="size-4" aria-hidden="true" />Upload</Button>{/if}
	{/snippet}
	<DataTable rows={documents} {columns} key={(d) => d.id} caption="Practice documents" {mobile} {empty} class="rounded-none border-0 shadow-none" />
</Section>

<form
	bind:this={formEl}
	method="POST"
	action="?/uploadClientDocument"
	class="hidden"
	use:enhance={() => async ({ result, update }) => {
		if (result.type === 'success') {
			uploadOpen = false;
			docType = 'OTHER';
			adminOnly = false;
			await invalidateAll();
		}
		await update();
	}}
>
	<input type="hidden" name="uploadUrl" value={uploadUrl} />
	<input type="hidden" name="filename" value={filename} />
	<input type="hidden" name="type" value={docType} />
	<input type="hidden" name="adminOnly" value={String(adminOnly)} />
</form>

<Dialog.Root bind:open={uploadOpen}>
	<Dialog.Content class="sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="text-h2">Upload a document</Dialog.Title>
			<Dialog.Description>Choose the type first, then drop the file. It's saved as soon as it uploads.</Dialog.Description>
		</Dialog.Header>
		<div class="space-y-4">
			<div class="space-y-1.5">
				<Label for="client-doc-type">Document type</Label>
				<Select.Root selected={{ value: docType, label: statusLabel(docType) }} onSelectedChange={(v) => v && (docType = v.value as (typeof TYPES)[number])}>
					<Select.Trigger id="client-doc-type"><Select.Value /></Select.Trigger>
					<Select.Content>
						{#each TYPES as t (t)}<Select.Item value={t}>{statusLabel(t)}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
			</div>
			<div class="flex items-center gap-2">
				<Checkbox id="client-doc-admin-only" bind:checked={adminOnly} />
				<Label for="client-doc-admin-only" class="font-normal">Admin only (the practice can't see it)</Label>
			</div>
			<FileDropzone onFileDrop={upload} accept={['image/*', '.jpg', '.png', '.pdf', '.doc', '.docx']} maxSizeMB={10} multiple={false} />
		</div>
		<Dialog.Footer>
			<Button variant="outline" on:click={() => (uploadOpen = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
