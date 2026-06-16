<script lang="ts">
	import * as Dialog from '../ui/dialog';
	import * as Form from '$lib/components/ui/form';
	import { Loader2, Plus } from 'lucide-svelte';
	import { Button } from '$lib/components/ui/button';
	import { newRecurrenceDaySchema, type NewRecurrenceDaySchema } from '$lib/config/zod-schemas';
	import type { SuperValidated } from 'sveltekit-superforms';
	import { superForm } from 'sveltekit-superforms/client';
	import Input from '../ui/input/input.svelte';
	import Label from '../ui/label/label.svelte';
	import { getTimezoneOffset } from 'date-fns-tz';

	export let requisitionId: number | undefined;
	export let form: SuperValidated<NewRecurrenceDaySchema>;
	let userTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;

	$: timezoneOffsetString = getTimezoneOffset(userTimeZone) / 60 / 60 / 1000;

	const { form: formObj, enhance } = superForm(form);

	$: console.log(formObj);
</script>

<Dialog.Root>
	<Dialog.Trigger
		><Button
			class="w-fit lg:w-full max-w-[400px] lg:mx-auto gap-2 bg-primary text-white hover:bg-primary/90"
			><Plus size={20} /> Add Workday</Button
		></Dialog.Trigger
	>
	<Dialog.Content>
		<Dialog.Header>
			<Dialog.Title>Add Day to Requisition</Dialog.Title>
			<Dialog.Description>Add date and start/end times</Dialog.Description>
		</Dialog.Header>
		<form use:enhance method="POST" action="?/addRecurrenceDay">
			<Label for="date">Date</Label>
			<Input type="date" name="date" bind:value={$formObj.date} />
			<div class="grid grid-cols-2 gap-8">
				<div class="col-span-2 md:col-span-1">
					<Label for="date">Day Start Time</Label>
					<Input type="time" name="dayStartTime" required bind:value={$formObj.dayStartTime} />
				</div>
				<div class="col-span-2 md:col-span-1">
					<Label for="date">Day End Time</Label>
					<Input type="time" name="dayEndTime" required bind:value={$formObj.dayEndTime} />
				</div>
			</div>
			<div class="grid grid-cols-2 gap-8">
				<div class="col-span-2 md:col-span-1">
					<Label for="date">Lunch Start Time</Label>
					<Input type="time" name="lunchStartTime" required bind:value={$formObj.lunchStartTime} />
				</div>
				<div class="col-span-2 md:col-span-1">
					<Label for="date">Lunch End Time</Label>
					<Input type="time" name="lunchEndTime" required bind:value={$formObj.lunchEndTime} />
				</div>
			</div>
			<input type="hidden" bind:value={requisitionId} name="requisitionId" />
			<input type="hidden" bind:value={timezoneOffsetString} name="timezoneOffset" />
			<Dialog.Footer>
				<Button type="submit" class="ml-auto mt-4">Submit</Button>
			</Dialog.Footer>
		</form>
	</Dialog.Content>
</Dialog.Root>
