<script lang="ts">
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';

	export let firstName: string | null = null;
	export let lastName: string | null = null;
	export let avatarUrl: string | null = null;
	/** True when the assignment was cancelled — shown as historical context. */
	export let cancelled = false;

	$: fullName = [firstName, lastName].filter(Boolean).join(' ');
	$: initials = `${firstName?.[0] ?? ''}${lastName?.[0] ?? ''}`;
</script>

{#if fullName}
	<div class="flex items-center gap-2" class:opacity-60={cancelled}>
		<Avatar class="h-7 w-7">
			<AvatarImage src={avatarUrl} alt={fullName} />
			<AvatarFallback class="text-xs">{initials}</AvatarFallback>
		</Avatar>
		<span class="whitespace-nowrap {cancelled ? 'line-through' : 'font-medium'}">{fullName}</span>
	</div>
{:else}
	<span class="text-sm text-muted-foreground">Unassigned</span>
{/if}
