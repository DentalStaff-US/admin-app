<script lang="ts">
	import { Avatar, AvatarFallback, AvatarImage } from '$lib/components/ui/avatar';

	export let name: string;
	/** A user's avatar or a company logo; initials show when it's missing or fails to load. */
	export let imageUrl: string | null = null;
	export let initials: string;
</script>

<div class="flex items-center gap-3">
	<Avatar class="h-8 w-8">
		<AvatarImage src={imageUrl} alt={name} class="object-cover" />
		<AvatarFallback class="text-xs font-medium text-muted-foreground">{initials}</AvatarFallback>
	</Avatar>
	<span class="whitespace-nowrap">{name}</span>
</div>
