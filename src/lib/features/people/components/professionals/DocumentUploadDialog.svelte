<script lang="ts">
	import { tick } from 'svelte';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms/client';
	import * as Dialog from '$lib/components/ui/dialog';
	import * as Select from '$lib/components/ui/select';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import Notice from '$dtss/Notice.svelte';
	import FileDropzone from '$lib/components/file-upload.svelte';
	import { CANDIDATE_DOCUMENT_TYPES } from '$lib/config/zod-schemas';
	import { statusLabel } from '$tokens/status';

	type FileUploadResult = { filename: string; url: string };

	/** Credential types; only these can be linked to a discipline and gate placement. */
	const CREDENTIAL_TYPES = ['LICENSE', 'CERTIFICATE'];

	/**
	 * Upload one or more files for a professional (short form → Dialog). Files go
	 * to /api/uploadFile first, then the existing `documentsUpload` action files
	 * them with the chosen type and, for a license or certificate, the
	 * discipline or skill it evidences plus its expiry. The server rejects a
	 * link to something they don't hold, or one without an expiry.
	 */
	let {
		open = $bindable(false),
		form,
		disciplines,
		certSkills,
		action = '?/documentsUpload'
	}: {
		open?: boolean;
		form: SuperValidated<any>;
		disciplines: { discipline: { id: string; name: string; abbreviation?: string | null } }[];
		certSkills: { skillId: string; name: string }[];
		action?: string;
	} = $props();

	// svelte-ignore state_referenced_locally
	const sf = superForm(form, {
		id: 'professional-documents',
		taintedMessage: null,
		onResult: ({ result }) => {
			if (result.type === 'success') open = false;
		}
	});
	const { form: values, errors, enhance } = sf;

	let docType = $state('OTHER');
	/** '' | 'discipline:<id>' | 'skill:<id>': a document evidences one or the other. */
	let appliesTo = $state('');
	let expiry = $state('');
	let failures = $state<{ filename: string; error: string }[]>([]);

	const isCredential = $derived(CREDENTIAL_TYPES.includes(docType));
	$effect(() => {
		if (!isCredential) {
			appliesTo = '';
			expiry = '';
		}
		if (docType !== 'CERTIFICATE' && appliesTo.startsWith('skill:')) appliesTo = '';
	});
	const disciplineId = $derived(appliesTo.startsWith('discipline:') ? appliesTo.slice(11) : '');
	const skillId = $derived(appliesTo.startsWith('skill:') ? appliesTo.slice(6) : '');
	const canLink = $derived(isCredential && (disciplines.length > 0 || (docType === 'CERTIFICATE' && certSkills.length > 0)));

	const linkOptions = $derived([
		{ value: '', label: 'Not a credential' },
		...disciplines.map((d) => ({ value: `discipline:${d.discipline.id}`, label: `${d.discipline.name}${d.discipline.abbreviation ? ` (${d.discipline.abbreviation})` : ''}` })),
		...(docType === 'CERTIFICATE' ? certSkills.map((s) => ({ value: `skill:${s.skillId}`, label: `Skill: ${s.name}` })) : [])
	]);

	function filesFrom(data: any): FileUploadResult[] {
		try {
			return data.filesData ? JSON.parse(data.filesData) : [];
		} catch {
			return [];
		}
	}

	async function upload(files: File[]) {
		if (!files?.length) return;
		failures = [];
		const results = await Promise.allSettled(
			files.map(async (file) => {
				const body = new FormData();
				body.append('file', file);
				body.append('location', 'candidate-documents');
				const response = await fetch('/api/uploadFile', { method: 'POST', body });
				if (!response.ok) throw new Error(`Server responded with ${response.status}`);
				const json = await response.json();
				return { filename: file.name, url: json.url as string };
			})
		);
		const ok: FileUploadResult[] = [];
		results.forEach((r, i) => {
			if (r.status === 'fulfilled') ok.push(r.value);
			else failures.push({ filename: files[i]?.name ?? 'Unknown file', error: r.reason?.message ?? 'Upload failed' });
		});
		if (!ok.length) throw new Error('All file uploads failed');
		const all = [...filesFrom($values), ...ok];
		$values.filesData = JSON.stringify(all);
		$values.urls = all.map((f) => f.url);
		await tick();
		(document.getElementById('professional-documents-form') as HTMLFormElement | null)?.requestSubmit();
	}
</script>

<Dialog.Root bind:open>
	<Dialog.Content class="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
		<Dialog.Header>
			<Dialog.Title class="text-h2">Upload documents</Dialog.Title>
			<Dialog.Description>PDF, JPG or PNG, clearly legible, up to 10 MB each. Choose the type first: it applies to every file.</Dialog.Description>
		</Dialog.Header>
		<form id="professional-documents-form" method="POST" {action} use:enhance class="space-y-4">
			<input type="hidden" name="urls" value={JSON.stringify($values.urls || [])} />
			<input type="hidden" name="filesData" value={JSON.stringify(filesFrom($values))} />
			<input type="hidden" name="documentType" value={docType} />
			<input type="hidden" name="documentDisciplineId" value={disciplineId} />
			<input type="hidden" name="documentSkillId" value={skillId} />

			<div class="space-y-1.5">
				<Label for="upload-doc-type">Document type</Label>
				<Select.Root selected={{ value: docType, label: statusLabel(docType) }} onSelectedChange={(v) => (docType = (v?.value as string) ?? 'OTHER')}>
					<Select.Trigger id="upload-doc-type"><Select.Value /></Select.Trigger>
					<Select.Content>
						{#each CANDIDATE_DOCUMENT_TYPES as t (t)}<Select.Item value={t}>{statusLabel(t)}</Select.Item>{/each}
					</Select.Content>
				</Select.Root>
			</div>

			{#if canLink}
				<div class="grid gap-4 rounded-lg bg-muted/50 p-4 sm:grid-cols-2">
					<div class="space-y-1.5">
						<Label for="upload-applies-to">Credential for (optional)</Label>
						<Select.Root
							selected={linkOptions.find((o) => o.value === appliesTo) ?? linkOptions[0]}
							onSelectedChange={(v) => (appliesTo = (v?.value as string) ?? '')}
						>
							<Select.Trigger id="upload-applies-to"><Select.Value /></Select.Trigger>
							<Select.Content>
								{#each linkOptions as o (o.value)}<Select.Item value={o.value}>{o.label}</Select.Item>{/each}
							</Select.Content>
						</Select.Root>
					</div>
					{#if appliesTo}
						<div class="space-y-1.5">
							<Label for="upload-expiry">Expires on</Label>
							<!-- No min: staff must be able to record a credential that already lapsed. -->
							<Input id="upload-expiry" name="documentExpiryDate" type="date" bind:value={expiry} required />
						</div>
					{/if}
				</div>
			{/if}

			<FileDropzone onFileDrop={upload} accept={['image/*', '.jpg', '.png', '.pdf', '.doc', '.docx', '.txt']} maxSizeMB={10} multiple={true} />

			{#if failures.length}
				<Notice tone="warning" title="Some files didn't upload">
					{failures.map((f) => f.filename).join(', ')}
				</Notice>
			{/if}
			{#if $errors._errors?.length}
				<Notice tone="negative" alert>{$errors._errors[0]}</Notice>
			{/if}
		</form>
		<Dialog.Footer>
			<Button variant="outline" on:click={() => (open = false)}>Close</Button>
		</Dialog.Footer>
	</Dialog.Content>
</Dialog.Root>
