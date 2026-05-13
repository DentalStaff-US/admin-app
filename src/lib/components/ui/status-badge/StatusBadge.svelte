<script lang="ts">
	import { Badge } from '$lib/components/ui/badge';
	import { cn } from '$lib/utils';
	import { statusBadgeClass, statusLabel } from '.';

	export let status: string | null | undefined;
	// Optional override label. When omitted we humanize the raw enum value
	// (e.g. WAGES_DUE -> Wages Due, paid -> Paid).
	export let label: string | undefined = undefined;
	let className: string | undefined = undefined;
	export { className as class };
</script>

<Badge value={label ?? statusLabel(status)} class={cn(statusBadgeClass(status), className)} />
