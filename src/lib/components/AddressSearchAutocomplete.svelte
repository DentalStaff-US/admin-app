<!-- AddressAutocomplete.svelte -->
<script lang="ts">
    import * as Command from "$lib/components/ui/command";
    import {createEventDispatcher, onMount, tick} from "svelte";
    import {debounce} from "lodash-es";
    import {PUBLIC_MAPBOX_TOKEN} from "$env/static/public";
    import type {AddressResult} from "$lib/types";

    // Props
    export let placeholder = "Search for an address...";
    export let debounceMs = 300;
    export let minChars = 3;
    export let maxResults = 5;
    export let country: string | undefined = undefined; // e.g., 'us', 'ca'
    export let selected: AddressResult | null = null;
    // Mapbox Geocoding v6 feature types to search. Defaults to street addresses
    // (unchanged behavior for existing consumers). Pass a broader list — e.g.
    // "place,locality,region,postcode,address" — to allow city/area searches.
    export let types = "address,secondary_address";

    const MAPBOX_TOKEN = PUBLIC_MAPBOX_TOKEN;

    const dispatch = createEventDispatcher<{
        select: AddressResult;
        clear: null;
    }>();

    // Component state
    let query = "";
    let suggestions: AddressResult[] = [];
    let loading = false;
    let open = false;
    let inputElement: HTMLInputElement;
    let dropdownStyle = "";
    let portalTarget: HTMLElement;

    // Mapbox Geocoding API call
    async function searchAddresses(searchQuery: string): Promise<AddressResult[]> {
        console.log('searchAddresses called with:', searchQuery);

        if (!MAPBOX_TOKEN) {
            console.error("Mapbox access token not found");
            return [];
        }

        const params = new URLSearchParams({
            q: searchQuery,
            access_token: MAPBOX_TOKEN,
            limit: maxResults.toString(),
            autocomplete: "true",
            types // caller-configurable; defaults to street addresses
        });

        if (country) {
            params.append("country", country);
        }

        const url = `https://api.mapbox.com/search/geocode/v6/forward?${params}`;
        console.log('Making request to:', url);

        try {
            const response = await fetch(url);
            console.log('Response status:', response.status);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('API Error Response:', errorText);
                throw new Error(`Mapbox API error: ${response.status}`);
            }

            const data = await response.json();
            console.log('Raw API response:', data);

            const results = data.features?.map((feature: any) => {
                const props = feature.properties;
                const context = props.context || {};

                return {
                    place_name: props.full_address || props.name,
                    formatted_address: props.full_address || props.name,
                    coordinates: {
                        lat: feature.geometry.coordinates[1],
                        lng: feature.geometry.coordinates[0]
                    },
                    context: {
                        country: context.country?.name,
                        region: context.region?.name || context.state?.name,
                        region_code: context.region?.region_code,
                        district: context.district?.name,
                        postcode: props.postcode || context.postcode?.name,
                        // Mapbox v6 puts the city in `place`; `locality` is a
                        // sub-city area and is frequently absent.
                        place: context.place?.name,
                        locality: context.locality?.name,
                        neighborhood: context.neighborhood?.name,
                        street: context.street?.name,
                    },
                    address_components: {
                        street_number: props.address_number || context.address?.address_number,
                        street_name: props.street || context.street?.name,
                        subpremise: props.subpremise, // Suite/apartment number
                        premise: props.premise, // Building name
                        secondary_address: props.secondary_address, // Unit, suite, apt, etc.
                        address_line1: props.address_line_1,
                        address_line2: props.address_line_2,
                    },
                    place_id: props.mapbox_id || feature.id,
                    place_type: feature.place_type || props.feature_type,
                    // Raw properties for debugging
                    raw_properties: props
                };
            }) || [];

            console.log('Processed results:', results);
            return results;
        } catch (error) {
            console.error("Error fetching addresses:", error);
            return [];
        }
    }

    // Debounced search function
    const debouncedSearch = debounce(async (searchQuery: string) => {
        console.log('debouncedSearch called with:', searchQuery);

        if (searchQuery.length < minChars) {
            console.log('Query too short, returning early');
            suggestions = [];
            open = false;
            return;
        }

        console.log('Starting search, setting loading = true, open = true');
        loading = true;
        open = true;

        try {
            console.log('Calling searchAddresses...');
            suggestions = await searchAddresses(searchQuery);
            console.log('Search completed, got', suggestions.length, 'results:', suggestions);
            updateDropdownPosition();
        } catch (error) {
            console.error('Search error:', error);
            suggestions = [];
        } finally {
            console.log('Setting loading = false');
            loading = false;
        }
    }, debounceMs);

    // Handle input changes
    function handleInput(event: Event) {
        console.log('Input event fired:', event);
        console.log('Current query value:', query);

        selected = null;
        dispatch("clear");
        debouncedSearch(query);
    }

    // Alternative: Watch for query changes reactively
    $: {
        console.log('Query changed reactively to:', query, 'length:', query?.length);
        if (query && query.length >= minChars && !selected) {
            console.log('Triggering search via reactive statement for:', query);
            debouncedSearch(query);
        } else if (query && query.length < minChars) {
            console.log('Query too short, clearing suggestions');
            suggestions = [];
            open = false;
        }
    }

    // Handle selection
    function selectAddress(address: AddressResult) {
        selected = address;
        query = address.formatted_address;
        open = false;
        suggestions = [];
        dispatch("select", address);
    }

    // Clear selection
    function clearSelection() {
        selected = null;
        query = "";
        suggestions = [];
        open = false;
        dispatch("clear");
    }

    // Update display when selected changes externally
    $: if (selected) {
        query = selected.formatted_address;
    }

    // Position dropdown relative to input
    async function updateDropdownPosition() {
        if (inputElement && open) {
            await tick();
            const rect = inputElement.getBoundingClientRect();
            dropdownStyle = `top: ${rect.bottom + 2}px; left: ${rect.left}px; width: ${rect.width}px;`;
        }
    }

    // Update position when opening
    $: if (open) {
        updateDropdownPosition();
    }

    // Close dropdown when clicking outside
    function handleKeydown(event: KeyboardEvent) {
        if (event.key === "Escape") {
            open = false;
        }
    }

    onMount(() => {
        console.log("AddressAutocomplete component mounted");
        console.log("MAPBOX_TOKEN:", MAPBOX_TOKEN ? "Token found" : "NO TOKEN");
        if (!MAPBOX_TOKEN) {
            console.warn("Mapbox access token not configured. Add PUBLIC_MAPBOX_ACCESS_TOKEN to your environment variables.");
        }

        // Create portal target
        portalTarget = document.createElement('div');
        portalTarget.style.position = 'absolute';
        portalTarget.style.top = '0';
        portalTarget.style.left = '0';
        portalTarget.style.zIndex = '99999';
        document.body.appendChild(portalTarget);

        return () => {
            if (portalTarget && portalTarget.parentNode) {
                portalTarget.parentNode.removeChild(portalTarget);
            }
        };
    });
</script>

<svelte:window on:keydown={handleKeydown}/>

<Command.Root class="relative">
    <div class="relative">
        <input
                bind:this={inputElement}
                bind:value={query}
                on:input={handleInput}
                placeholder={placeholder}
                class="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        />

        {#if query && !selected}
            <button
                    type="button"
                    on:click={clearSelection}
                    class="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    aria-label="Clear search"
            >
                <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                </svg>
            </button>
        {/if}
    </div>
</Command.Root>

<!-- Portal the dropdown to body to escape overflow constraints -->
{#if open && (suggestions.length > 0 || loading || query.length >= minChars)}
    <div style="position: fixed; z-index: 99999; background: white; border: 1px solid #ccc; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.1); max-height: 300px; overflow-y: auto; min-width: 300px; {dropdownStyle}"
         class="suggestions-dropdown">
        {#if loading}
            <div class="flex items-center gap-2 px-4 py-2">
                <svg class="animate-spin h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
                          d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
                </svg>
                <span>Searching addresses...</span>
            </div>
        {/if}

        {#each suggestions as suggestion}
            <div
                    on:click={() => selectAddress(suggestion)}
                    class="cursor-pointer px-4 py-2 hover:bg-gray-100 border-b border-gray-100 last:border-b-0"
            >
                <div class="flex flex-col gap-1">
                    <span class="font-medium text-sm">{suggestion.place_name}</span>

                    <!-- Show additional address components if available -->
                    {#if suggestion.address_components?.subpremise || suggestion.address_components?.secondary_address}
                        <span class="text-xs text-blue-600">
                            Unit/Suite: {suggestion.address_components.subpremise || suggestion.address_components.secondary_address}
                        </span>
                    {/if}

                    {#if suggestion.context?.country}
                        <span class="text-xs text-gray-600">
                            {[
                                suggestion.context.neighborhood,
                                suggestion.context.locality,
                                suggestion.context.region,
                                suggestion.context.country
                            ].filter(Boolean).join(", ")}
                        </span>
                    {/if}

                </div>
            </div>
        {/each}

        {#if !loading && suggestions.length === 0 && query.length >= minChars}
            <div class="px-4 py-2 text-gray-600 text-sm">
                No addresses found for "{query}"
            </div>
        {/if}
    </div>
{/if}

<style>
    /* Ensure the dropdown appears above other elements */
    :global(.relative) {
        position: relative;
    }
</style>