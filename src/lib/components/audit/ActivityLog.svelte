<script lang="ts">
	// Renders a slice of the platform ledger for one entity. Superadmin-only by
	// convention — the pages that include this gate it on the role; the
	// component itself just renders whatever entries it is handed.
	//
	// Styled on the 03 › Timeline recipe (border-l, tone dots). It doesn't use
	// $dtss/Timeline directly because each entry expands in place to show the
	// request, the before/after diff and metadata, which that component's
	// entry shape has no room for.
	import { format } from 'date-fns';
	import { ChevronDown, History } from 'lucide-svelte';
	import type { StatusTone } from '$tokens/status';
	import EmptyState from '$dtss/EmptyState.svelte';
	import { cn } from '$lib/utils';
	import {
		ACTION_LABELS,
		ENTITY_LABELS,
		SOURCE_LABELS,
		type AuditAction,
		type AuditEntityType,
		type AuditSource,
		type ActivityEntry
	} from '$lib/audit/constants';
	import { auditActionTone, changedFields, displayValue, visibleMetadata } from './auditTone';

	let {
		entries = [],
		showEntity = false,
		emptyTitle = 'No activity yet',
		emptyDescription = 'Views and actions will appear here as they happen.'
	}: {
		entries?: ActivityEntry[];
		/** Name the entity on each row (when the rows aren't all about one record). */
		showEntity?: boolean;
		emptyTitle?: string;
		emptyDescription?: string;
	} = $props();

	let open = $state<Record<string, boolean>>({});

	const ROLE_LABELS: Record<string, string> = {
		SUPERADMIN: 'Admin',
		CLIENT: 'Client',
		CLIENT_STAFF: 'Client staff',
		CANDIDATE: 'Professional'
	};

	const DOT: Record<StatusTone, string> = {
		positive: 'bg-status-positive-solid',
		info: 'bg-status-info-solid',
		pending: 'bg-status-pending-solid',
		warning: 'bg-status-warning-solid',
		negative: 'bg-status-negative-solid',
		neutral: 'bg-status-neutral-solid'
	};

	const actionLabel = (action: string) =>
		ACTION_LABELS[action as AuditAction] ?? action.toLowerCase().replace(/_/g, ' ');
	const entityLabel = (entityType: string) =>
		ENTITY_LABELS[entityType as AuditEntityType] ?? entityType.toLowerCase();
	const sourceLabel = (source: string | null) =>
		!source ? 'Legacy' : (SOURCE_LABELS[source as AuditSource] ?? source);
	const roleLabel = (role: string | null) => (role ? (ROLE_LABELS[role] ?? role) : null);
</script>

{#if entries.length > 0}
	<ol class="relative space-y-4 border-l pl-6">
		{#each entries as entry (entry.id)}
			{@const changed = changedFields(entry.changes)}
			{@const meta = visibleMetadata(entry.metadata)}
			{@const expanded = !!open[entry.id]}
			<li class="relative">
				<span
					class={cn(
						'absolute -left-[29px] top-3 size-2.5 rounded-full ring-4 ring-background',
						DOT[auditActionTone(entry.action)]
					)}
					aria-hidden="true"
				></span>
				<button
					type="button"
					class="flex w-full items-start gap-3 rounded-md px-2 py-1.5 text-left hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
					onclick={() => (open[entry.id] = !expanded)}
					aria-expanded={expanded}
				>
					<span class="min-w-0 flex-1">
						<span class="block text-sm">
							<b class="font-bold">{entry.actorName ?? (entry.userId ? 'Deleted user' : 'System')}</b>
							{#if roleLabel(entry.actorRole)}
								<span class="text-muted-foreground">({roleLabel(entry.actorRole)})</span>
							{/if}
							{actionLabel(entry.action)}
							{#if showEntity}
								{entityLabel(entry.entityType)}
							{:else if entry.action !== 'SIGN_IN' && entry.action !== 'SIGN_OUT'}
								this {entityLabel(entry.entityType)}
							{/if}
						</span>
						<span class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground">
							<time datetime={new Date(entry.createdAt).toISOString()}>{format(entry.createdAt, 'PPp')}</time>
							<span class="rounded-full border px-2 text-xs font-semibold">{sourceLabel(entry.source)}</span>
							{#if entry.impersonatedBy}
								<span class="rounded-full border border-status-warning-border bg-status-warning-bg px-2 text-xs font-semibold text-status-warning-fg">
									Impersonated by {entry.impersonatorName ?? entry.impersonatedBy}
								</span>
							{/if}
							{#if entry.ipAddress}<span class="font-mono">{entry.ipAddress}</span>{/if}
						</span>
					</span>
					<ChevronDown
						class={cn('mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform', !expanded && '-rotate-90')}
						aria-hidden="true"
					/>
					<span class="sr-only">{expanded ? 'Hide details' : 'Show details'}</span>
				</button>

				{#if expanded}
					<div class="mt-2 space-y-3 rounded-md bg-muted/50 px-3 py-3 text-sm">
						<dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-1">
							<dt class="font-semibold text-muted-foreground">Entity</dt>
							<dd class="break-all font-mono text-xs">{entry.entityType} · {entry.entityId}</dd>
							{#if entry.actorEmail}
								<dt class="font-semibold text-muted-foreground">Actor</dt>
								<dd class="break-all">{entry.actorEmail}{entry.userId ? ` · ${entry.userId}` : ''}</dd>
							{/if}
							{#if entry.requestPath}
								<dt class="font-semibold text-muted-foreground">Request</dt>
								<dd class="break-all font-mono text-xs">{entry.requestPath}</dd>
							{/if}
							{#if entry.userAgent}
								<dt class="font-semibold text-muted-foreground">Browser</dt>
								<dd class="break-all text-xs">{entry.userAgent}</dd>
							{/if}
						</dl>

						{#if changed.length > 0}
							<div>
								<p class="mb-1 font-semibold text-muted-foreground">Changes</p>
								<table class="w-full text-left text-xs">
									<caption class="sr-only">Changed fields, before and after</caption>
									<thead class="sr-only">
										<tr><th scope="col">Field</th><th scope="col">Before</th><th scope="col">After</th></tr>
									</thead>
									<tbody>
										{#each changed as c (c.key)}
											<tr class="align-top">
												<td class="py-0.5 pr-3 font-mono text-muted-foreground">{c.key}</td>
												<td class="break-all py-0.5 pr-3 text-status-negative-fg line-through">{displayValue(c.before)}</td>
												<td class="break-all py-0.5 text-status-positive-fg">{displayValue(c.after)}</td>
											</tr>
										{/each}
									</tbody>
								</table>
							</div>
						{/if}

						{#if meta.length > 0}
							<div>
								<p class="mb-1 font-semibold text-muted-foreground">Details</p>
								<dl class="grid grid-cols-[max-content_1fr] gap-x-3 gap-y-0.5 text-xs">
									{#each meta as [k, v] (k)}
										<dt class="font-mono text-muted-foreground">{k}</dt>
										<dd class="break-all">{displayValue(v)}</dd>
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
	<EmptyState icon={History} title={emptyTitle} description={emptyDescription} />
{/if}
