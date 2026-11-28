<script lang="ts">
	import { Banknote, CalendarDays } from 'lucide-svelte';
</script>

<!-- What will appear here (04 §1). Decorative: the copy beneath it carries the message. -->
<div class="relative mx-auto w-full max-w-sm opacity-60" aria-hidden="true">
	<div class="space-y-3">
		<div class="rounded-2xl border border-dashed bg-card p-5">
			<div class="h-3 w-24 rounded bg-muted"></div>
			<div class="mt-3 h-4 w-40 rounded bg-muted"></div>
			<div class="mt-2 h-3 w-52 rounded bg-muted"></div>
		</div>
		<div class="ml-8 flex items-center gap-3 rounded-2xl border border-dashed bg-card p-4">
			<CalendarDays class="size-5 text-muted-foreground" />
			<div class="h-3 w-36 rounded bg-muted"></div>
		</div>
		<div class="mr-10 flex items-center gap-3 rounded-xl border border-dashed bg-card p-3">
			<Banknote class="size-5 text-muted-foreground" />
			<div class="h-3 w-28 rounded bg-muted"></div>
		</div>
	</div>
</div>
