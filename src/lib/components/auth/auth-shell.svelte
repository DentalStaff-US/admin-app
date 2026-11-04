<script lang="ts">
	// Shared branded shell for all auth pages: soft sky gradient, centered,
	// responsive, DTSS logo + a portal label so users always know which app
	// they're on (this is the CLIENT / practice + staff portal).
	import logo from '$lib/assets/dtss-logo.png';

	export let label = 'Client Portal';
	export let gradient = 'from-sky-50 via-white to-sky-100';
</script>

<div
	class="flex min-h-screen w-full items-center justify-center bg-gradient-to-br p-4 {gradient}"
>
	<div class="w-full max-w-md">
		<div class="mb-6 flex flex-col items-center gap-3">
			<img
				src={logo}
				alt="Dental Temps Staffing Solutions"
				class="h-20 w-auto max-w-[260px] object-contain"
			/>
			<span
				class="inline-flex items-center rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-primary"
			>
				{label}
			</span>
		</div>
		<slot />
	</div>
</div>
