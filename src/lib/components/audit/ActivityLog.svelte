<script lang="ts">
	// Renders a slice of the platform ledger for one entity. Superadmin-only by
	// convention — the pages that include this gate it on the role; the
	// component itself just renders whatever entries it is handed.
	import { format } from 'date-fns';
	import {
		Eye,
		Download,
		Mail,
		History,
		LogIn,
		LogOut,
		UserCog,
		ChevronDown,
		ChevronRight
	} from 'lucide-svelte';
	import { Badge } from '$lib/components/ui/badge';
	import {
		ACTION_LABELS,
		ENTITY_LABELS,
		SOURCE_LABELS,
		type AuditAction,
		type AuditEntityType,
		type AuditSource,
		type ActivityEntry
	} from '$lib/audit/constants';

	export let entries: ActivityEntry[] = [];
	/** Hide the entity noun when every row is about the same entity. */
	export let showEntity = false;
	export let emptyTitle = 'No activity yet';
	export let emptyDescription = 'Views and actions will appear here as they happen.';

	let open: Record<string, boolean> = {};

	const ROLE_LABELS: Record<string, string> = {
		SUPERADMIN: 'Admin',
		CLIENT: 'Client',
		CLIENT_STAFF: 'Client staff',
		CANDIDATE: 'Professional'
	};

	function actionLabel(action: string): string {
		return ACTION_LABELS[action as AuditAction] ?? action.toLowerCase().replace(/_/g, ' ');
	}
	function entityLabel(entityType: string): string {
		return ENTITY_LABELS[entityType as AuditEntityType] ?? entityType.toLowerCase();
	}
	function sourceLabel(source: string | null): string {
		if (!source) return 'Legacy';
		return SOURCE_LABELS[source as AuditSource] ?? source;
	}
	function roleLabel(role: string | null): string | null {
		if (!role) return null;
		return ROLE_LABELS[role] ?? role;
	}
	function icon(action: string) {
		switch (action) {
			case 'VIEW':
				return Eye;
			case 'DOWNLOAD':
				return Download;
			case 'EMAIL_SENT':
				return Mail;
			case 'SIGN_IN':
				return LogIn;
			case 'SIGN_OUT':
				return LogOut;
			case 'IMPERSONATE_START':
			case 'IMPERSONATE_STOP':
				return UserCog;
			default:
				return History;
		}
	}
	function tone(action: string): string {
		switch (action) {
			case 'VIEW':
			case 'DOWNLOAD':
				return 'text-slate-500';
			case 'APPROVE':
			case 'PAYMENT_RECORDED':
			case 'CLAIM':
			case 'ASSIGN':
				return 'text-emerald-600';
			case 'REJECT':
			case 'VOID':
			case 'CANCEL':
			case 'DELETE':
			case 'BLACKLIST':
			case 'PAYMENT_REVERSED':
				return 'text-red-600';
			case 'EMAIL_SENT':
				return 'text-violet-600';
			default:
				return 'text-blue-600';
		}
	}

	/** Keys whose value differs between before and after — the interesting diff. */
	function diff(changes: ActivityEntry['changes']): { key: string; before: unknown; after: unknown }[] {
		if (!changes) return [];
		const before = changes.before ?? {};
		const after = changes.after ?? {};
		const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
		const out: { key: string; before: unknown; after: unknown }[] = [];
		for (const key of keys) {
			if (key === 'updatedAt' || key === 'createdAt') continue;
			const b = before[key];
			const a = after[key];
			if (JSON.stringify(b) !== JSON.stringify(a)) out.push({ key, before: b, after: a });
		}
		return out;
	}
	function fmt(v: unknown): string {
		if (v === null || v === undefined) return '—';
		if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
		return JSON.stringify(v);
	}
	/** Metadata minus the internal/plumbing keys nobody needs to read. */
	function visibleMetadata(metadata: Record<string, unknown> | null) {
		if (!metadata) return [];
		return Object.entries(metadata).filter(([k]) => !k.startsWith('_') && k !== 'navigation');
	}
</script>

{#if entries.length > 0}
	<ol class="space-y-2">
		{#each entries as entry (entry.id)}
			{@const Icon = icon(entry.action)}
			{@const changed = diff(entry.changes)}
			{@const meta = visibleMetadata(entry.metadata)}
			<li class="rounded-lg border bg-white">
				<button
					type="button"
					class="flex w-full items-start gap-3 p-3 text-left"
					on:click={() => (open[entry.id] = !open[entry.id])}
					aria-expanded={!!open[entry.id]}
				>
					<span class="mt-0.5 {tone(entry.action)}">
						<svelte:component this={Icon} class="h-4 w-4" />
					</span>
					<span class="min-w-0 flex-1">
						<span class="block text-sm">
							<span class="font-medium">
								{entry.actorName ?? (entry.userId ? 'Deleted user' : 'System')}
							</span>
							{#if roleLabel(entry.actorRole)}
								<span class="text-xs text-gray-500">({roleLabel(entry.actorRole)})</span>
							{/if}
							<span class="text-gray-700">
								{actionLabel(entry.action)}
								{#if showEntity}
									{entityLabel(entry.entityType)}
								{:else if entry.action !== 'SIGN_IN' && entry.action !== 'SIGN_OUT'}
									this {entityLabel(entry.entityType)}
								{/if}
							</span>
						</span>
						<span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-gray-500">
							<span>{format(entry.createdAt, 'PPpp')}</span>
							<Badge
								variant="outline"
								class="px-1.5 py-0 text-[10px] font-normal"
								value={sourceLabel(entry.source)}
							/>
							{#if entry.impersonatedBy}
								<Badge
									variant="destructive"
									class="px-1.5 py-0 text-[10px] font-normal"
									value={`impersonated by ${entry.impersonatorName ?? entry.impersonatedBy}`}
								/>
							{/if}
							{#if entry.ipAddress}
								<span class="font-mono">{entry.ipAddress}</span>
							{/if}
						</span>
					</span>
					<span class="mt-1 text-gray-400">
						{#if open[entry.id]}
							<ChevronDown class="h-4 w-4" />
						{:else}
							<ChevronRight class="h-4 w-4" />
						{/if}
					</span>
				</button>

				{#if open[entry.id]}
					<div class="space-y-3 border-t px-3 py-3 text-xs">
						<dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1 text-gray-600">
							<dt class="font-medium text-gray-500">Entity</dt>
							<dd class="font-mono break-all">{entry.entityType} · {entry.entityId}</dd>
							{#if entry.actorEmail}
								<dt class="font-medium text-gray-500">Actor</dt>
								<dd class="break-all">{entry.actorEmail}{entry.userId ? ` · ${entry.userId}` : ''}</dd>
							{/if}
							{#if entry.requestPath}
								<dt class="font-medium text-gray-500">Request</dt>
								<dd class="font-mono break-all">{entry.requestPath}</dd>
							{/if}
							{#if entry.userAgent}
								<dt class="font-medium text-gray-500">Browser</dt>
								<dd class="break-all">{entry.userAgent}</dd>
							{/if}
						</dl>

						{#if changed.length > 0}
							<div>
								<p class="mb-1 font-medium text-gray-500">Changes</p>
								<table class="w-full text-left">
									<tbody>
										{#each changed as c}
											<tr class="align-top">
												<td class="pr-3 font-mono text-gray-500">{c.key}</td>
												<td class="pr-3 text-red-700 line-through break-all">{fmt(c.before)}</td>
												<td class="text-emerald-700 break-all">{fmt(c.after)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}

						{#if meta.length > 0}
							<div>
								<p class="mb-1 font-medium text-gray-500">Details</p>
								<dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-gray-600">
									{#each meta as [k, v]}
										<dt class="font-mono text-gray-500">{k}</dt>
										<dd class="break-all">{fmt(v)}</dd>
									{/each}
								</dl>
							</div>
						{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ol>
{:else}
	<div class="p-8 text-center">
		<History class="mx-auto mb-3 h-12 w-12 text-gray-400" />
		<h3 class="text-lg font-medium">{emptyTitle}</h3>
		<p class="mt-1 text-gray-600">{emptyDescription}</p>
	</div>
{/if}
