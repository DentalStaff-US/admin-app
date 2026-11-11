<script lang="ts">
    import convertNameToInitials from '$lib/_helpers/convertNameToInitials';
    import * as Avatar from '$lib/components/ui/avatar';
    import { Pencil } from 'lucide-svelte';

    export let user;
    export let onAvatarUpdated: (newUrl: string, isForUser: boolean) => void = () => {};
    export let isForUser: boolean = true;
    export let company

    let isUploading = false;
    let error: string | null = null;
    let previewUrl: string | null = null;
    let initials: string = '';

    $: {
        if (user) {
            initials = convertNameToInitials(user.firstName, user.lastName);
        }
    }
    // Generate a file input with enhanced behavior
    function handleFileUpload(e: Event) {
        const target = e.target as HTMLInputElement;
        if (!target.files || !target.files[0]) return;

        const file = target.files[0];

        // Validate file size (2MB max)
        if (file.size > 2 * 1024 * 1024) {
            error = 'Image too large (max 2MB)';
            return;
        }

        // Validate file type
        if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
            error = 'Please select a valid image file (JPEG, PNG, or WebP)';
            return;
        }

        error = null;

        // Generate preview
        previewUrl = URL.createObjectURL(file);

        // Upload the file
        uploadFile(file);
    }

    // Upload file directly to your server without a form submission
    async function uploadFile(file: File) {
        isUploading = true;
        error = null;

        try {
            // Create a FormData instance for the upload
            const formData = new FormData();
            formData.append('file', file);
            formData.append('location', 'images');

            // Send directly to an endpoint in the current app
            const response = await fetch('/api/uploadFile', {
                method: 'POST',
                body: formData
                // No need for additional headers or CORS settings since it's same-origin
            });

            if (!response.ok) {
                throw new Error(`Upload failed: ${response.statusText}`);
            }

            const result = await response.json();

            if (result.success && result.url) {
                // Update the avatar URL in the UI
                onAvatarUpdated(result.url as string, isForUser);
            } else {
                throw new Error(result.message || 'Upload failed');
            }
        } catch (err) {
            console.error('Avatar upload error:', err);
            error = err instanceof Error ? err.message : 'Failed to upload avatar';
        } finally {
            isUploading = false;

            // Clean up the object URL to prevent memory leaks
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                previewUrl = null;
            }
        }
    }
</script>

<div class="flex items-start gap-4">
    <div class="relative">
        <Avatar.Root class="h-24 w-24 border-2 border-background shadow-sm">
            {#if previewUrl}
                <Avatar.Image src={previewUrl} alt="Preview" />
                {:else if company}
                <Avatar.Image src={company?.companyLogo} alt="Company logo" />
            {:else}
                <Avatar.Image src={user?.avatarUrl} alt="Profile photo" />
            {/if}
            <Avatar.Fallback class="text-xl">{initials}</Avatar.Fallback>

            <div
                    class="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition-opacity group-hover:opacity-100"
            >
                <span class="text-white text-xs">Update</span>
            </div>
        </Avatar.Root>

        <label
                for="avatar-upload"
                class="absolute bottom-1 right-1 rounded-full bg-card text-muted-foreground p-2 cursor-pointer shadow-sm transition-colors"
                class:opacity-50={isUploading}
                class:pointer-events-none={isUploading}
        >
            <Pencil class="h-4 w-4" />
            <span class="sr-only">Update profile photo</span>
            <input
                    type="file"
                    id="avatar-upload"
                    name="avatar"
                    accept="image/png, image/jpeg, image/webp"
                    class="hidden"
                    on:change={handleFileUpload}
                    disabled={isUploading}
            />
        </label>
    </div>

    <div class="flex flex-col gap-1">
        <p class="text-sm text-muted-foreground">
            {#if isUploading}
                <span class="text-primary font-medium">Uploading...</span>
            {:else if error}
                <span class="text-destructive">{error}</span>
            {:else}
                Upload an image for your profile or company.
            {/if}
        </p>
        <p class="text-xs text-muted-foreground">JPG or PNG, max 2MB</p>
    </div>
</div>
