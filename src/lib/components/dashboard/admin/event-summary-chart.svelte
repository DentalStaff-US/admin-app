<script lang="ts">
	import { cn } from '$lib/utils';

	let data = [
		{ color: 'bg-success', name: 'Filled', value: 120 },
		{ color: 'bg-primary', name: 'Open', value: 100 },
		{ color: 'bg-destructive', name: 'Canceled', value: 50 },
		{ color: 'bg-orange-400', name: 'Unfilled', value: 20 }
	];

	let totalVal = data.map((el) => el.value).reduce((prev, current) => prev + current, 0);
	let valPercent = data.map((el) => ({
		...el,
		percentage: (el.value / totalVal) * 100
	}));
	$: console.log(totalVal);
</script>

<div class="w-full">
	<div class="flex h-4 w-full rounded-lg">
		{#each valPercent as point, index}
			<div
				style={`width: ${Math.floor(point.percentage)}%`}
				class={cn(
					`h-full filter-none hover:filter brightness-150 transition-all duration-100`,

					point.color,
					index === 0 && 'rounded-l-lg',
					index === valPercent.length - 1 && 'rounded-r-lg'
				)}
			></div>
		{/each}
	</div>
	<div class="grid grid-cols-2 p-6 gap-y-2">
		{#each valPercent as point}
			<div class="col-span-2 md:col-span-1 flex items-center gap-2">
				<span class={cn('rounded-full h-4 w-4', point.color)}></span>
				<span>{point.name} - {point.value}</span>
			</div>
		{/each}
	</div>
</div>
