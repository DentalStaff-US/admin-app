/**
 * Stand-in for `@tanstack/svelte-table`, whose v8 build is precompiled Svelte 4
 * and won't run on Svelte 5. Same API as the 20 existing tables use
 * (`createSvelteTable`, `flexRender`, the table-core re-exports), so they only
 * change their import path.
 *
 * TEMPORARY: the overhaul rebuilds every table on the new DataTable (design
 * doc 03 › DataTable). Delete this file when the last import is gone.
 */
import { createTable, type RowData, type Table, type TableOptions } from '@tanstack/table-core';
import { derived, get, readable, writable, type Readable } from 'svelte/store';
import FlexText from './FlexText.svelte';

export * from '@tanstack/table-core';

const BOUND = Symbol('flexRender.bound');

type BoundComponent = ((anchor: unknown, props?: unknown) => unknown) & { [BOUND]: true };

/** A component with its props fixed, usable as `<svelte:component this={…} />`. */
function bind(component: any, props: Record<string, unknown>): BoundComponent {
	const wrapper = ((anchor: unknown) => component(anchor, props)) as BoundComponent;
	wrapper[BOUND] = true;
	return wrapper;
}

/**
 * Called two ways, as in TanStack's original:
 * - `flexRender(Component, props)` inside a column's `cell`/`header` → bind props.
 * - `flexRender(columnDef.cell, cell.getContext())` in the markup → run the cell
 *   function (its context always carries `table`) and render what it returns:
 *   a bound component, or text.
 */
export function flexRender(content: unknown, props?: unknown): BoundComponent | null {
	if (content === null || content === undefined) return null;
	if (typeof content === 'function') {
		if ((content as Partial<BoundComponent>)[BOUND]) return content as BoundComponent;
		if (props && typeof props === 'object' && 'table' in props) {
			return flexRender((content as (ctx: unknown) => unknown)(props));
		}
		return bind(content, (props as Record<string, unknown>) ?? {});
	}
	return bind(FlexText, { content });
}

/** TanStack's implementation, compiled against Svelte 5's stores. */
export function createSvelteTable<TData extends RowData>(
	options: TableOptions<TData> | Readable<TableOptions<TData>>
): Readable<Table<TData>> {
	const optionsStore: Readable<TableOptions<TData>> =
		'subscribe' in options ? options : readable(options);

	const resolvedOptions = {
		state: {},
		onStateChange() {},
		renderFallbackValue: null,
		...get(optionsStore)
	} as Parameters<typeof createTable<TData>>[0];

	const table = createTable(resolvedOptions);
	const stateStore = writable(table.initialState);
	const stateOptionsStore = derived([stateStore, optionsStore], (s) => s);

	return readable(table, (set) =>
		stateOptionsStore.subscribe(([state, opts]) => {
			table.setOptions((prev) => ({
				...prev,
				...opts,
				state: { ...state, ...opts.state },
				onStateChange: (updater) => {
					if (updater instanceof Function) stateStore.update(updater);
					else stateStore.set(updater);
					resolvedOptions.onStateChange?.(updater);
				}
			}));
			set(table);
		})
	);
}
