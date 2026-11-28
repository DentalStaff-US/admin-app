import { error, redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { can } from '$lib/authz';
import { recordView } from '$lib/server/audit/audit';
import { getConversationForReview } from '$lib/server/inbox/conversationLog';
import { conversationLogBack } from '$features/inbox/conversationLog';

export const load: PageServerLoad = async (event) => {
	const user = event.locals.user;
	if (!user) redirect(302, '/auth/sign-in');
	if (!can(user, 'inbox.monitor')) redirect(302, '/dashboard');

	const conversation = await getConversationForReview(event.params.id, user.id);
	if (!conversation) error(404, 'Conversation not found');

	void recordView({
		entityType: 'CONVERSATIONS',
		entityId: conversation.id,
		metadata: { participantIds: conversation.participants.map((p) => p.userId) }
	});

	return { conversation, back: conversationLogBack(event.url.searchParams.get('from')) };
};
