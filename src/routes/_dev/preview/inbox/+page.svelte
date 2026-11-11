<script lang="ts">
	// Dev-only fixtures for the inbox. ?view=thread (default) | list | empty | short
	// Renders inside AdminShell at an /inbox path, so the shell gives it the
	// same full-height, non-scrolling main as the real route.
	import { page } from '$app/state';
	import AdminShell from '$shell/AdminShell.svelte';
	import { cn } from '$lib/utils';
	import { ConversationList, ConversationThread, InboxPlaceholder, NewConversationDialog } from '$features/inbox';

	let sidebar = $state<'expanded' | 'rail'>('expanded');
	const view = $derived(page.url.searchParams.get('view') ?? 'thread');
	const me = 'u-admin';
	const mins = (m: number) => new Date(Date.now() - m * 60000).toISOString();
	const u = (id: string, firstName: string, lastName: string, avatarUrl: string | null = null) => ({ userId: id, user: { id, firstName, lastName, avatarUrl } });

	const conversations = [
		{ id: 'c1', type: 'INTERNAL', participants: [u(me, 'Shannon', 'Carter'), u('u1', 'Maria', 'Lopez')], lastMessage: { body: 'Yes, I can cover Tuesday at Brandon. Same hours as last week?', createdAt: mins(4) }, unreadCount: 2 },
		{ id: 'c2', type: 'CLIENT_CANDIDATE', participants: [u(me, 'Shannon', 'Carter'), u('u2', 'James', 'Whitfield')], practice: { id: 'co1', name: 'Bright Smiles Dental', logo: null }, lastMessage: { body: 'Thanks for the heads up about parking.', createdAt: mins(95) }, unreadCount: 0 },
		{ id: 'c3', type: 'APPLICATION', participants: [u(me, 'Shannon', 'Carter'), u('u3', 'Priya', 'Natarajan'), u('u4', 'Dana', 'Ruiz')], applicationData: { requisition: { id: 1042, disciplineName: 'Dental Hygienist' }, company: { companyName: 'Harbor Dental Group' } }, lastMessage: { body: 'Interview is booked for Thursday 2pm.', createdAt: mins(60 * 26) }, unreadCount: 1 },
		{ id: 'c4', type: 'ADMIN_CLIENT', participants: [u(me, 'Shannon', 'Carter'), u('u5', 'Oak Street', 'Family Dentistry')], lastMessage: { body: 'Invoice 2291 is paid, thank you!', createdAt: mins(60 * 24 * 9) }, unreadCount: 0 },
		...Array.from({ length: 10 }, (_, i) => ({ id: `cx${i}`, type: 'INTERNAL', participants: [u(me, 'Shannon', 'Carter'), u(`ux${i}`, ['Ana', 'Bo', 'Cy', 'Di', 'Ed'][i % 5], ['Ng', 'Li', 'Ho', 'Park', 'Ruiz'][i % 5])], lastMessage: { body: 'See you then.', createdAt: mins(60 * 24 * (12 + i)) }, unreadCount: 0 }))
	];

	const lines = [
		'Hi Maria, are you free to cover a hygiene shift next Tuesday at the Brandon office?',
		'Morning! Possibly. What are the hours?',
		'7:30 to 4, lunch at 12. Same as the last time you were there.',
		'That works. Is parking still behind the building?',
		'Yes, the lot behind the pharmacy. The front desk will validate.',
		'Great. Also, my CPR card renews next month, I uploaded the new one already.',
		'Perfect, I see it. Compliance will clear in a day or so.',
		'Yes, I can cover Tuesday at Brandon. Same hours as last week?'
	];
	const short = $derived(view === 'short');
	const messages = $derived(
		Array.from({ length: short ? 2 : 24 }, (_, i) => ({
			id: i + 1,
			body: lines[i % lines.length],
			senderId: i % 2 === 0 ? me : 'u1',
			createdAt: mins((24 - i) * 180),
			isSystemMessage: i === 3 && !short ? true : false,
			avatarUrl: null
		})).map((m) => (m.isSystemMessage ? { ...m, body: 'Maria was assigned to Tuesday, Nov 17' } : m))
	);
	const conversation = $derived({ ...conversations[0], participants: [{ userId: me, firstName: 'Shannon', lastName: 'Carter' }, { userId: 'u1', firstName: 'Maria', lastName: 'Lopez', avatarUrl: null }], messages });
	const form = { id: 'msg', valid: false, posted: false, data: { body: '' }, errors: {}, constraints: {} };
	const newForm = { id: 'new', valid: false, posted: false, data: { userIDs: '' }, errors: {}, constraints: {} };
	const people = conversations.flatMap((c) => c.participants.map((p) => ({ id: p.user.id, firstName: p.user.firstName, lastName: p.user.lastName, email: `${p.user.firstName.toLowerCase()}@example.com`, avatarUrl: null })));
	let newOpen = $state(false);
	const chatId = $derived(view === 'thread' || view === 'short' ? 'c1' : null);
</script>

<AdminShell pathname={chatId ? '/inbox/c1' : '/inbox'} nav={{ role: 'SUPERADMIN' }} bind:sidebar name="Shannon Carter" initials="SC" unreadCount={3}>
	<div class="flex h-full min-h-0 flex-1 bg-background">
		<aside class={cn('min-h-0 w-full flex-col border-r bg-card lg:flex lg:w-[360px] lg:shrink-0', chatId ? 'hidden' : 'flex')}>
			<ConversationList conversations={view === 'empty' ? [] : conversations} userId={me} activeId={chatId} onNew={() => (newOpen = true)} />
		</aside>
		<section class={cn('min-h-0 min-w-0 flex-1 flex-col', chatId ? 'flex' : 'hidden lg:flex')} aria-label="Conversation">
			{#if chatId}
				<ConversationThread {conversation} userId={me} {form} />
			{:else}
				<InboxPlaceholder onNew={() => (newOpen = true)} />
			{/if}
		</section>
	</div>
</AdminShell>

<NewConversationDialog bind:open={newOpen} {people} userId={me} form={newForm} />
