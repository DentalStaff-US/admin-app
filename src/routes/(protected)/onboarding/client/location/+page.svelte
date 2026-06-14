<script lang="ts">
    import * as Card from '$lib/components/ui/card';
    import * as Form from '$lib/components/ui/form';
    import * as Alert from '$lib/components/ui/alert';
    import * as Select from '$lib/components/ui/select';
    import {clientCompanyLocationSchema, type CompanyLocationSchema} from '$lib/config/zod-schemas';

    import {Loader2, AlertCircle} from 'lucide-svelte';
    import type {SuperValidated} from 'sveltekit-superforms';
    import {STATES} from '$lib/config/constants';
    import AddressSearchAutocomplete from "$lib/components/AddressSearchAutocomplete.svelte";
    import type {AddressResult} from "$lib/types";
    import {Label} from "$lib/components/ui/label";

    export let form: SuperValidated<CompanyLocationSchema>;

    const companyLocationSchema = clientCompanyLocationSchema.pick({
        name: true,
        completeAddress: true,
        lat: true,
        lon: true,
        timezone: true,
        phoneNumber: true,
        phoneNumberType: true,
        email: true
    });

    let selectedAddress: AddressResult | null = null;
    let selectedTimezone = '';

    function handleAddressSelect(event: CustomEvent<AddressResult>) {
        const address = event.detail;
        selectedAddress = address;
    }

    function handleClear() {
        selectedAddress = null;
    }

    // Same display rules as $lib/components/PhoneInput.svelte.
    function maskPhone(e: Event) {
        const target = e.currentTarget as HTMLInputElement;
        const digits = target.value.replace(/\D/g, '');
        const local = digits.length === 11 && digits.startsWith('1') ? digits.slice(1) : digits;
        const trimmed = local.slice(0, 10);
        if (trimmed.length === 0) target.value = '';
        else if (trimmed.length <= 3) target.value = `(${trimmed}`;
        else if (trimmed.length <= 6) target.value = `(${trimmed.slice(0, 3)}) ${trimmed.slice(3)}`;
        else target.value = `(${trimmed.slice(0, 3)}) ${trimmed.slice(3, 6)}-${trimmed.slice(6)}`;
    }
</script>

<section class="flex flex-col items-center justify-center min-h-screen">
    <div class="p-6 flex gap-2 w-full max-w-2xl mx-auto">
        <Form.Root
                class="w-full"
                let:submitting
                let:errors
                method="POST"
                {form}
                schema={companyLocationSchema}
                let:config
        >
            <Card.Root>
                <Card.Header>
                    <Card.Title class="text-2xl">Add Main Location</Card.Title>
                    <Card.Description
                    >Add your main location. If you operate more than one, you can add more later in your
                        dashboard.
                    </Card.Description
                    >
                </Card.Header>
                <Card.Content>
                    {#if errors?._errors?.length}
                        <Alert.Root variant="destructive">
                            <AlertCircle class="h-4 w-4"/>
                            <Alert.Title>Error</Alert.Title>
                            <Alert.Description>
                                {#each errors._errors as error}
                                    {error}
                                {/each}
                            </Alert.Description>
                        </Alert.Root>
                    {/if}
                    <Form.Field {config} name="name">
                        <Form.Item>
                            <Form.Label>Location Name</Form.Label>
                            <Form.Input/>
                            <Form.Validation/>
                        </Form.Item>
                    </Form.Field>
                    <div class="mb-2">
                        <Label>Address</Label>
                        <AddressSearchAutocomplete
                                bind:selected={selectedAddress}
                                on:select={handleAddressSelect}
                                on:clear={handleClear}
                                placeholder="Enter your address..."
                                country="us"
                                maxResults={8}
                        />
                    </div>
                    <Form.Field {config} name="timezone">
                        <Form.Item>
                            <Form.Label>Timezone</Form.Label>
                            <Select.Root
                                    preventScroll={false}
                                    onSelectedChange={(v) => {
										v && (selectedTimezone = String(v.value));
									}}
                            >
                                <Select.Trigger>
                                    <Select.Value/>
                                </Select.Trigger>
                                <Select.Content class="max-h-[150px] overflow-y-scroll">
                                    {#each Intl.supportedValuesOf('timeZone').filter(z => z.startsWith('America')) as timezone}
                                        <Select.Item value={timezone}>
                                            <span>{timezone}</span>
                                        </Select.Item>
                                    {/each}
                                </Select.Content>
                                <input name="timezone" type="hidden" value={selectedTimezone}/>
                            </Select.Root>
                            <Form.Validation/>
                        </Form.Item>
                    </Form.Field>

                    <input type="hidden" name="completeAddress" value={selectedAddress?.formatted_address}/>
                    <input type="hidden" name="lat" value={selectedAddress?.coordinates.lat}/>
                    <input type="hidden" name="lon" value={selectedAddress?.coordinates.lng}/>
                    <Form.Field {config} name="email">
                        <Form.Item>
                            <Form.Label>Office Email</Form.Label>
                            <Form.Input type="email"/>
                            <Form.Validation/>
                        </Form.Item>
                    </Form.Field>
                    <div class="grid grid-cols-4 gap-2 md:gap-4">
                        <div class="col-span-4 md:col-span-3">
                            <Form.Field {config} name="phoneNumber">
                                <Form.Item>
                                    <Form.Label>Phone Number</Form.Label>
                                    <Form.Input
                                        type="tel"
                                        inputmode="numeric"
                                        placeholder="(555) 555-5555"
                                        on:input={maskPhone}
                                    />
                                    <Form.Validation/>
                                </Form.Item>
                            </Form.Field>
                        </div>
                        <div class="col-span-2 md:col-span-1">
                            <Form.Field {config} name="phoneNumberType">
                                <Form.Item>
                                    <Form.Label>Type</Form.Label>
                                    <Form.Select>
                                        <Form.SelectTrigger placeholder="Type"></Form.SelectTrigger>
                                        <Form.SelectContent class="">
                                            <Form.SelectItem value={'cell'} label={'Cell'}>Cell</Form.SelectItem>
                                            <Form.SelectItem value={'office'} label={'Office'}>Office</Form.SelectItem>
                                        </Form.SelectContent>
                                    </Form.Select>
                                    <Form.Validation/>
                                </Form.Item>
                            </Form.Field>
                        </div>
                    </div>
                </Card.Content>
                <Card.Footer>
                    <Form.Button class="ml-auto bg-primary hover:bg-primary/90" disabled={submitting}
                    >
                        {#if submitting}
                            <Loader2 class="mr-2 h-4 w-4 animate-spin"/>
                        {:else}Next
                        {/if}
                    </Form.Button>
                </Card.Footer>
            </Card.Root>
        </Form.Root>
    </div>
</section>
