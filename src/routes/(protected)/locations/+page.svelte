<script lang="ts">
    import {Button} from '$lib/components/ui/button';
    import type {ClientCompanyLocation} from '$lib/server/database/schemas/client';
    import {
        type ColumnDef,
        type TableOptions,
        getCoreRowModel,
        getSortedRowModel,
        createSvelteTable,
        flexRender
    } from '$lib/components/tables/svelte-table';
    import {onMount} from 'svelte';
    import {writable} from 'svelte/store';
    import * as Table from '$lib/components/ui/table';
    import type {CompanyLocationRaw, LocationsResults} from '$lib/server/database/queries/clients';
    import ViewLink from '$lib/components/tables/ViewLink.svelte';
    import {goto} from '$app/navigation';
    import {page} from '$app/stores';
    import {ArrowUpNarrowWide, ArrowDownWideNarrow} from 'lucide-svelte';
    import AddLocationDrawer from '$lib/components/drawers/addLocationDrawer.svelte';

    const total = 10;

    export let data;
    let drawerExpanded: boolean = false;
    let tableData: LocationsResults = [];

    $: locations = data.locations || [];
    $: count = data.count;
    $: sortOn = $page.url.searchParams.get('sortOn');
    $: sortBy = $page.url.searchParams.get('sortBy');
    $: currentPage = Number($page.url.searchParams.get('skip')) || 0;
    $: totalPages = count ? Math.ceil(count / total) : 0;
    $: {
        tableData = (locations as LocationsResults) || [];
        locationOptions.update((o) => ({...o, data: tableData}));
    }

    const locationColumns: ColumnDef<CompanyLocationRaw>[] = [
        {
            header: '',
            id: 'id',
            accessorKey: 'id',
            cell: (original) =>
                flexRender(ViewLink, {
                    href: `/locations/${original.getValue()}`
                })
        },
        {
            header: 'Name',
            accessorKey: 'location_name'
        },
        {
            header: 'Address',
            accessorKey: 'complete_address',
            accessorFn: (original) => original.complete_address
        },

    ];

    const locationOptions = writable<TableOptions<CompanyLocationRaw>>({
        data: tableData,
        columns: locationColumns,
        getCoreRowModel: getCoreRowModel(),
        getSortedRowModel: getSortedRowModel()
    });

    const resetQueryParams = (clearAll = false) => {
        const query = new URLSearchParams($page.url.searchParams.toString());
        const thisPage = window.location.pathname;
        query.delete('sortBy');
        query.delete('sortOn');
        clearAll && query.delete('skip');
        goto(thisPage);
    };

    const handlePrev = () => {
        if (currentPage < 1) {
            return;
        }
        const query = new URLSearchParams($page.url.searchParams.toString());
        if (currentPage <= totalPages * total) {
            const newPage = Math.ceil(currentPage - 1 * total);
            query.set('skip', String(newPage));
            goto(`?${query.toString()}`);
        }
    };
    const handleNext = () => {
        const query = new URLSearchParams($page.url.searchParams.toString());
        if (currentPage < totalPages * total) {
            const newPage = Math.ceil(currentPage + 1 * total);
            query.set('skip', String(newPage));
            goto(`?${query.toString()}`);
        }
    };

    const handleColumnSort = (columnId: string) => {
        if (columnId === 'id') return;
        const query = new URLSearchParams($page.url.searchParams.toString());

        // Get current sort parameters
        const currentSortOn = query.get('sortOn');
        const currentSortBy = query.get('sortBy');

        // Determine the new sorting state
        if (currentSortOn === columnId) {
            // Cycle through sorting states: asc -> desc -> none
            if (currentSortBy === 'asc') {
                query.set('sortBy', 'desc');
            } else if (currentSortBy === 'desc') {
                query.delete('sortBy');
                query.delete('sortOn');
            } else {
                query.set('sortBy', 'asc');
            }
        } else {
            // If the column changes, reset to ascending sort
            query.set('sortOn', columnId);
            query.set('sortBy', 'asc');
        }

        // Navigate to the new URL with updated query parameters
        goto(`?${query.toString()}`);
    };

    onMount(() => {
        tableData = (locations as LocationsResults) ?? [];
        locationOptions.update((o) => ({...o, data: tableData}));
    });

    const locationTable = createSvelteTable(locationOptions);
</script>

<section class="grow h-screen overflow-y-auto p-6 flex flex-col gap-6">
    <div class=" flex items-center justify-between flex-wrap">
        <h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">Locations</h1>
        <AddLocationDrawer
                newLocationForm={data.locationForm}
                company={data.company}
                bind:open={drawerExpanded}
        />
    </div>
    <div class="column">
        <Table.Root class="table">
            <Table.TableHeader>
                {#each $locationTable.getHeaderGroups() as headerGroup}
                    <Table.TableRow class="bg-white">
                        {#each headerGroup.headers as header}
                            <Table.TableHead
                                    class="hover:bg-white cursor-pointer relative"
                                    colspan={header.colSpan}
                                    click={() => handleColumnSort(header.getContext().header.id)}
                            >
                                <svelte:component
                                        this={flexRender(header.column.columnDef.header, header.getContext())}
                                />
                                {#if sortBy && sortOn && header.getContext().header.id === sortOn}
                                    {#if sortBy === 'asc'}
                                        <ArrowUpNarrowWide class="absolute right-0 top-[25%]" size={18}/>
                                    {:else}
                                        <ArrowDownWideNarrow class="absolute right-0 top-[25%]" size={18}/>
                                    {/if}
                                {/if}
                            </Table.TableHead>
                        {/each}
                    </Table.TableRow>
                {/each}
            </Table.TableHeader>
            <Table.TableBody>
                {#each $locationTable.getRowModel().rows as row}
                    <Table.TableRow class="bg-gray-50">
                        {#each row.getVisibleCells() as cell}
                            <Table.TableCell>
                                <svelte:component
                                        this={flexRender(cell.column.columnDef.cell, cell.getContext())}
                                />
                            </Table.TableCell>
                        {/each}
                    </Table.TableRow>
                {/each}
            </Table.TableBody>
        </Table.Root>
        <div class="flex justify-end gap-4 p-4">
            <Button disabled={currentPage === 0} on:click={handlePrev}>prev</Button>
            <Button disabled={currentPage === (totalPages - 1) * total} on:click={handleNext}>next
            </Button
            >
        </div>
    </div>
</section>
