<script lang="ts">
	import Page from '$dtss/Page.svelte';
	import PageHeader from '$dtss/PageHeader.svelte';
	import { ComplianceQueue } from '$features/admin';
	import type { ComplianceSeverity } from '$lib/config/compliance';

	let { data } = $props();

	// Filter links keep the other filter in place.
	function href(severity: ComplianceSeverity | null, snoozed: boolean): string {
		const p = new URLSearchParams();
		if (severity) p.set('severity', severity);
		if (snoozed) p.set('snoozed', '1');
		const qs = p.toString();
		return qs ? `?${qs}` : '?';
	}
</script>

<Page>
	<PageHeader
		title="Compliance"
		description="Professionals whose license or certification needs attention. Clients will appear here once agreement tracking exists."
	/>
	<ComplianceQueue
		items={data.items}
		counts={data.summary.counts}
		snoozedCount={data.summary.snoozed}
		severity={data.severity}
		showSnoozed={data.showSnoozed}
		loadError={'loadError' in data ? data.loadError : null}
		{href}
	/>
</Page>
