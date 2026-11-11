<script lang="ts">
	import { CheckCircle2, Receipt, Zap } from 'lucide-svelte';
</script>

<!-- 04 §1, practice variant: request → filled → paid. Illustrative only, so
     hidden from screen readers; the copy beside it carries the message. -->
<div class="relative mx-auto w-full max-w-md" aria-hidden="true">
	<div class="absolute -inset-6 rounded-[2rem] bg-primary/15 blur-2xl"></div>
	<div class="relative space-y-4">
		<div class="rounded-2xl border bg-card p-5 shadow-float">
			<div class="flex items-center justify-between gap-3">
				<p class="text-overline uppercase text-muted-foreground">New request</p>
				<span class="rounded-full bg-primary-soft px-2.5 py-0.5 text-xs font-bold text-primary-dark">Posted 7:02am</span>
			</div>
			<p class="mt-2 text-lg font-extrabold">Dental Hygienist</p>
			<div class="mt-3 grid grid-cols-3 gap-2 text-sm font-semibold">
				<span class="rounded-lg bg-muted px-3 py-2">Tue, Nov 3</span>
				<span class="rounded-lg bg-muted px-3 py-2">8am–5pm</span>
				<span class="rounded-lg bg-muted px-3 py-2 tabular-nums">$48/hr</span>
			</div>
		</div>
		<div class="ml-8 rounded-2xl border bg-card p-5 shadow-float">
			<div class="flex items-center justify-between gap-3">
				<div class="flex items-center gap-3">
					<span class="flex size-10 items-center justify-center rounded-full bg-gradient-to-br from-primary to-pro text-sm font-bold text-primary-foreground">SK</span>
					<div>
						<p class="font-bold">Sarah K., RDH</p>
						<p class="text-sm text-muted-foreground">Hygienist · 7 years</p>
					</div>
				</div>
				<span class="inline-flex items-center gap-1 rounded-full border border-status-positive-border bg-status-positive-bg px-2.5 py-0.5 text-xs font-bold text-status-positive-fg">
					<CheckCircle2 class="size-3.5" /> Assigned
				</span>
			</div>
			<p class="mt-3 flex items-center gap-2 text-sm font-semibold">
				<Zap class="size-4 text-status-warning-solid" /> Filled 4 minutes after posting
			</p>
		</div>
		<div class="mr-10 flex items-center gap-3 rounded-xl bg-navy px-4 py-3 text-sm text-navy-foreground shadow-lg">
			<Receipt class="size-5 text-primary-soft" />
			Timesheet approved · invoice ready
		</div>
	</div>
</div>
