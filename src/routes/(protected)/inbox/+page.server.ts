import { isRedirect, redirect } from '@sveltejs/kit';
import type { RequestEvent } from './$types';
import { superValidate } from 'sveltekit-superforms/server';
import { z } from 'zod';
import { InboxService } from '$lib/server/inbox';
import { getUserById } from '$lib/server/database/queries/users';

export const actions = {
	startConversation: async (event: RequestEvent) => {
		const user = event.locals.user;
		if (!user) {
			redirect(301, '/auth/sign-in');
		}

		const form = await superValidate(
			event,
			z.object({
				userIDs: z.string().min(1)
			})
		);

		const parsedIds = JSON.parse(form.data.userIDs);

		console.log(parsedIds);

		try {
			const inboxService = new InboxService();

			const existingConversation = await inboxService.findExistingConversation({
				participantIds: [user.id, ...parsedIds]
			});

			if (existingConversation.exists) {
				console.log('Existing conversation found:', existingConversation);
				return redirect(302, `/inbox/${existingConversation.conversationId}`);
			}
			let participants = [];

			participants.push({
				userId: user.id,
				participantType: user.role
			});
			// First, fetch all users concurrently
			const otherUsers = await Promise.all(parsedIds.map((id: string) => getUserById(id)));

			// Then add them to participants
			for (const user of otherUsers) {
				if (user) {
					participants.push({
						userId: user.user.id,
						participantType: user.user.role
					});
				}
			}

			const conversationId = await inboxService.createConversation({
				type: 'INTERNAL',
				participants: participants
			});

			redirect(302, `/inbox/${conversationId}`);
		} catch (error) {
			// redirect() works by throwing — don't swallow the hop to the thread.
			if (isRedirect(error)) throw error;
			console.log(error);
		}
	}
};
