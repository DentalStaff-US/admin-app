<script lang="ts">
	import Dropzone from 'svelte-file-dropzone';
	import Button from '$lib/components/ui/button/button.svelte';
	import { File as FileIcon, Upload, Check, AlertCircle, X } from 'lucide-svelte';
	import { fade, fly } from 'svelte/transition';

	// Updated type signature to support both single and multiple files
	export let onFileDrop:
		| ((file: File | undefined) => Promise<void>)
		| ((files: File[]) => Promise<void>) = async () => {};
	export let progress: number = 0;
	export let maxSizeMB: number = 10;
	export let accept: string[] = ['image/*', '.pdf', '.txt'];
	export let multiple: boolean = false;
	export let maxFiles: number = 10; // Maximum number of files when multiple is true

	let files: { accepted?: File[]; rejected?: File[] } = {
		accepted: [],
		rejected: []
	};

	let isUploading = false;
	let hasError = false;
	let errorMessage = '';
	let isComplete = false;

	const maxSizeBytes = maxSizeMB * 1024 * 1024;

	async function handleFilesSelect(e) {
		const { acceptedFiles, fileRejections } = e.detail;

		// Reset states
		hasError = false;
		errorMessage = '';
		isComplete = false;

		// Check for rejection reasons
		if (fileRejections && fileRejections.length > 0) {
			hasError = true;
			const rejection = fileRejections[0];
			if (rejection.errors[0].code === 'file-too-large') {
				errorMessage = `File is too large. Maximum size is ${maxSizeMB}MB.`;
			} else {
				errorMessage = rejection.errors[0].message;
			}
			return;
		}

		if (acceptedFiles && acceptedFiles.length > 0) {
			// Check for maximum files when multiple is true
			if (multiple && acceptedFiles.length > maxFiles) {
				hasError = true;
				errorMessage = `Maximum ${maxFiles} files allowed.`;
				return;
			}

			// Check each file size
			const oversizedFile = acceptedFiles.find((file: File) => file.size > maxSizeBytes);
			if (oversizedFile) {
				hasError = true;
				errorMessage = `File "${oversizedFile.name}" is too large. Maximum size is ${maxSizeMB}MB.`;
				return;
			}

			files.accepted = acceptedFiles;
			isUploading = true;

			try {
				if (multiple) {
					// Call with array of files for multiple mode
					await (onFileDrop as (files: File[]) => Promise<void>)(acceptedFiles);
				} else {
					// Maintain backward compatibility for single file mode
					await (onFileDrop as (file: File | undefined) => Promise<void>)(acceptedFiles[0]);
				}
				isComplete = true;
			} catch (error) {
				hasError = true;
				errorMessage = 'Upload failed. Please try again.';
			} finally {
				isUploading = false;
			}
		}
	}

	function resetDropzone() {
		files = { accepted: [], rejected: [] };
		hasError = false;
		errorMessage = '';
		isComplete = false;
		progress = 0;
	}

	// Format file size to human-readable format
	function formatFileSize(bytes: number): string {
		if (bytes < 1024) return bytes + ' bytes';
		else if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB';
		else return (bytes / 1048576).toFixed(1) + ' MB';
	}

	// Calculate total size of all files
	$: totalSize = files.accepted?.reduce((sum, file) => sum + file.size, 0) || 0;
</script>

<Dropzone
	{multiple}
	on:drop={handleFilesSelect}
	{accept}
	maxSize={maxSizeBytes}
	containerClasses={`dropzone ${hasError ? 'error' : ''} ${isComplete ? 'complete' : ''}`}
>
	{#if !!files.accepted?.length}
		<!-- File(s) has been selected or uploaded -->
		<div class="w-full">
			{#if multiple && files.accepted.length > 1}
				<!-- Multiple files display -->
				<div class="flex flex-col gap-1 mb-2">
					<div class="flex items-center justify-between">
						<span class="text-sm font-medium">{files.accepted.length} files selected</span>
						<span class="text-xs text-gray-500">({formatFileSize(totalSize)})</span>
					</div>
					<div class="max-h-24 overflow-y-auto border border-gray-200 rounded p-1">
						{#each files.accepted as file}
							<div class="flex gap-2 items-center py-1 px-2 text-sm hover:bg-gray-50 rounded">
								<FileIcon size={14} />
								<p class="text-xs overflow-hidden text-ellipsis flex-1">{file.name}</p>
								<span class="text-xs text-gray-500">({formatFileSize(file.size)})</span>
							</div>
						{/each}
					</div>
				</div>
			{:else}
				<!-- Single file display (backwards compatible) -->
				<div class="flex gap-2 items-center mb-2">
					<FileIcon size={20} />
					<p class="text-sm font-medium overflow-hidden text-ellipsis">{files.accepted[0].name}</p>
					<span class="text-xs text-gray-500">({formatFileSize(files.accepted[0].size)})</span>
				</div>
			{/if}

			{#if isUploading}
				<!-- Upload in progress -->
				<div class="flex flex-col gap-1 w-full">
					<div class="flex items-center gap-2">
						<Upload size={16} class="text-blue-600 animate-pulse" />
						<span class="text-sm text-blue-600">Uploading...</span>
					</div>
					<div class="progress-bar">
						<div class="progress-bar-inner" style="width: {progress}%"></div>
					</div>
				</div>
			{:else if hasError}
				<!-- Error state -->
				<div transition:fade={{ duration: 200 }} class="flex items-center gap-2 text-red-600">
					<AlertCircle size={16} />
					<span class="text-sm">{errorMessage}</span>
				</div>
				<Button variant="outline" class="mt-3" size="sm" on:click={resetDropzone}>Try again</Button>
			{:else if isComplete}
				<!-- Success state -->
				<div transition:fade={{ duration: 200 }} class="flex items-center gap-2 text-green-600">
					<Check size={16} />
					<span class="text-sm">Upload complete!</span>
				</div>
				<Button variant="outline" class="mt-3" size="sm" on:click={resetDropzone}>
					Upload {multiple ? 'more files' : 'another file'}
				</Button>
			{:else}
				<!-- File selected but upload not started -->
				<div class="flex gap-2 justify-center mt-2">
					<Button
						class="bg-primary hover:bg-primary/90"
						on:click={() =>
							multiple ? onFileDrop(files.accepted || []) : onFileDrop(files.accepted?.[0])}
					>
						Upload now
					</Button>
					<Button variant="outline" on:click={resetDropzone}>
						<X size={16} />
					</Button>
				</div>
			{/if}
		</div>
	{:else}
		<!-- No file selected yet -->
		<div class="flex flex-col items-center gap-2">
			<Upload size={24} class="text-blue-600" />
			<Button class="bg-primary hover:bg-primary/90">Select {multiple ? 'files' : 'file'}</Button>
			<p class="text-sm text-gray-500">or drop {multiple ? 'files' : 'a file'} here</p>
			<p class="text-xs text-gray-400">
				Supported files: {accept.join(', ')} (max {maxSizeMB}MB{multiple
					? `, ${maxFiles} files max`
					: ''})
			</p>
		</div>
	{/if}
</Dropzone>

{#if hasError && !files.accepted?.length}
	<div
		class="mt-2 text-sm text-red-600 flex items-center gap-1"
		transition:fly={{ y: 10, duration: 200 }}
	>
		<AlertCircle size={14} />
		<span>{errorMessage}</span>
	</div>
{/if}
