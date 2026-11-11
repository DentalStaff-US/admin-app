<script lang="ts">
	import { enhance } from '$app/forms';
	import { format } from 'date-fns';
	import { Download, FileImage, FileText, Lock, Plus, Trash2, Unlock } from 'lucide-svelte';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import DataTable from '$dtss/DataTable.svelte';
	import EmptyState from '$dtss/EmptyState.svelte';
	import Section from '$dtss/Section.svelte';
	import type { DataColumn } from '$dtss/tableState';
	import { CANDIDATE_DOCUMENT_TYPES } from '$lib/config/zod-schemas';
	import { toISODate } from '$lib/credentialStatusDisplay';
	import { statusLabel } from '$tokens/status';
	import ConfirmAction from '../ConfirmAction.svelte';
	import ToneBadge from '../ToneBadge.svelte';
	import AutoSubmitSelect from './AutoSubmitSelect.svelte';
	import DocumentUploadDialog from './DocumentUploadDialog.svelte';
	import { documentCredential } from '../../credentials';

	type Doc = {
		id: string;
		filename: string | null;
		type: string;
		uploadUrl: string;
		adminOnly: boolean | null;
		createdAt: Date | string;
		expiryDate?: string | Date | null;
		disciplineId?: string | null;
		skillId?: string | null;
	};

	const CREDENTIAL_TYPES = ['LICENSE', 'CERTIFICATE'];

	/**
	 * A professional's documents. Admins edit type, credential link and expiry
	 * inline (each saves on change through `updateDocumentCredential`), lock a
	 * file to admins only, and hard-delete with a typed confirmation.
	 */
	let {
		documents,
		disciplines,
		certSkills,
		documentsForm,
		isAdmin
	}: {
		documents: Doc[];
		disciplines: { discipline: { id: string; name: string; abbreviation?: string | null; requiresLicense?: boolean | null } }[];
		certSkills: { skillId: string; name: string }[];
		documentsForm: SuperValidated<any>;
		isAdmin: boolean;
	} = $props();

	let uploadOpen = $state(false);

	const isImage = (name: string | null) => /\.(jpe?g|png|gif|webp)$/i.test(name ?? '');
	const appliesTo = (d: Doc) => (d.skillId ? `skill:${d.skillId}` : d.disciplineId ? `discipline:${d.disciplineId}` : '');
	const appliesLabel = (d: Doc) =>
		d.skillId
			? certSkills.find((s) => s.skillId === d.skillId)?.name ?? 'Skill'
			: disciplines.find((x) => x.discipline.id === d.disciplineId)?.discipline.abbreviation ?? '—';
	const typeOptions = CANDIDATE_DOCUMENT_TYPES.map((t) => ({ value: t, label: statusLabel(t) }));
	const linkOptions = (d: Doc) => [
		{ value: '', label: '—' },
		...disciplines.map((x) => ({ value: `discipline:${x.discipline.id}`, label: x.discipline.abbreviation || x.discipline.name, group: 'Discipline' })),
		...(d.type === 'CERTIFICATE' ? certSkills.map((s) => ({ value: `skill:${s.skillId}`, label: s.name, group: 'Skill' })) : [])
	];

	const columns: DataColumn<Doc>[] = $derived([
		{ id: 'file', header: 'Document', cell: fileCell },
		{ id: 'type', header: 'Type', cell: typeCell },
		{ id: 'applies', header: 'Applies to', cell: appliesCell },
		{ id: 'expires', header: 'Expires', cell: expiresCell },
		{ id: 'uploaded', header: 'Uploaded', value: (d) => format(new Date(d.createdAt), 'PP'), class: 'whitespace-nowrap tabular-nums' },
		{ id: 'actions', header: 'Actions', srOnlyHeader: true, cell: actionsCell, class: 'text-right' }
	]);
</script>

{#snippet fileCell(d: Doc)}
	<span class="flex min-w-0 items-center gap-2">
		{#if isImage(d.filename)}<FileImage class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{:else}<FileText class="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />{/if}
		<span class="max-w-56 truncate font-semibold">{d.filename ?? 'Untitled'}</span>
		{#if d.adminOnly}<ToneBadge tone="neutral" label="Admin only" hint="Locked: the professional can't see this file." />{/if}
	</span>
{/snippet}

{#snippet typeCell(d: Doc)}
	{#if isAdmin}
		<AutoSubmitSelect action="?/updateDocumentCredential" documentId={d.id} name="type" value={d.type} options={typeOptions} label="Type of {d.filename}" />
	{:else}
		{statusLabel(d.type)}
	{/if}
{/snippet}

{#snippet appliesCell(d: Doc)}
	{#if !CREDENTIAL_TYPES.includes(d.type)}
		<span class="text-muted-foreground">—</span>
	{:else if isAdmin}
		<AutoSubmitSelect action="?/updateDocumentCredential" documentId={d.id} name="appliesTo" value={appliesTo(d)} options={linkOptions(d)} label="Credential {d.filename} applies to" />
	{:else}
		{appliesLabel(d)}
	{/if}
{/snippet}

{#snippet expiresCell(d: Doc)}
	{@const chip = documentCredential(d, disciplines)}
	{#if !CREDENTIAL_TYPES.includes(d.type)}
		<span class="text-muted-foreground">—</span>
	{:else}
		<div class="space-y-1">
			{#if isAdmin}
				<form method="POST" action="?/updateDocumentCredential" use:enhance>
					<input type="hidden" name="documentId" value={d.id} />
					<Input
						name="expiryDate"
						type="date"
						class="h-9 w-40"
						aria-label="Expiry of {d.filename}"
						value={d.expiryDate ? String(toISODate(d.expiryDate)) : ''}
						on:change={(e) => e.currentTarget.form?.requestSubmit()}
					/>
				</form>
			{:else}
				{d.expiryDate ? format(new Date(String(toISODate(d.expiryDate)) + 'T12:00:00'), 'PP') : '—'}
			{/if}
			{#if chip}<ToneBadge tone={chip.tone} label={chip.label} />{/if}
		</div>
	{/if}
{/snippet}

{#snippet actionsCell(d: Doc)}
	<div class="flex justify-end gap-1">
		<Button href={d.uploadUrl} target="_blank" rel="noopener noreferrer" variant="ghost" size="icon" class="size-9" aria-label="Download {d.filename}">
			<Download class="size-4" aria-hidden="true" />
		</Button>
		{#if isAdmin}
			<form method="POST" action="?/toggleAdminDocumentLock" use:enhance>
				<input type="hidden" name="documentId" value={d.id} />
				<Button type="submit" variant="ghost" size="icon" class="size-9" aria-label="{d.adminOnly ? 'Unlock' : 'Lock'} {d.filename}">
					{#if d.adminOnly}<Unlock class="size-4" aria-hidden="true" />{:else}<Lock class="size-4" aria-hidden="true" />{/if}
				</Button>
			</form>
			<ConfirmAction
				action="?/deleteDocument"
				fields={{ documentId: d.id }}
				title="Delete {d.filename ?? 'this document'}?"
				description="The file is removed from this professional's documents for good, along with any credential link. This can't be undone."
				confirmLabel="Delete document"
				confirmText="DELETE"
				label="Delete {d.filename}"
				icon={Trash2}
				iconOnly
				variant="ghost"
			/>
		{/if}
	</div>
{/snippet}

{#snippet mobile(d: Doc)}
	{@const chip = CREDENTIAL_TYPES.includes(d.type) ? documentCredential(d, disciplines) : null}
	<div class="space-y-2">
		<div class="flex items-start justify-between gap-2">
			<div class="min-w-0">{@render fileCell(d)}</div>
			<div class="relative z-10">{@render actionsCell(d)}</div>
		</div>
		<p class="text-sm text-muted-foreground">
			{statusLabel(d.type)}{#if CREDENTIAL_TYPES.includes(d.type)}{' · '}{appliesLabel(d)}{/if} · uploaded {format(new Date(d.createdAt), 'PP')}
		</p>
		{#if chip}<ToneBadge tone={chip.tone} label={chip.label} />{/if}
	</div>
{/snippet}

<Section title="Documents" description={isAdmin ? 'Type, credential link and expiry save as soon as you change them.' : undefined} flush>
	{#snippet actions()}
		<Button size="sm" class="gap-2" on:click={() => (uploadOpen = true)}><Plus class="size-4" aria-hidden="true" />Upload</Button>
	{/snippet}
	{#if documents.length === 0}
		<div class="p-4 sm:p-6">
			<EmptyState icon={FileText} title="No documents yet" description="Licenses, certificates and résumés show up here once uploaded.">
				<Button on:click={() => (uploadOpen = true)}>Upload a document</Button>
			</EmptyState>
		</div>
	{:else}
		<DataTable rows={documents} {columns} key={(d) => d.id} caption="Documents" {mobile} class="rounded-none border-0 shadow-none" />
	{/if}
</Section>

<DocumentUploadDialog bind:open={uploadOpen} form={documentsForm} {disciplines} {certSkills} />
