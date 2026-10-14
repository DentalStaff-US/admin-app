import { newMessageSchema } from '$lib/config/zod-schemas';
import { InboxService, sendMessageSchema, type SendMessageParams } from '$lib/server/inbox';
import { fail, isRedirect, redirect, type RequestEvent } from '@sveltejs/kit';
import { setFlash } from 'sveltekit-flash-message/server';
import { message, setError, superValidate } from 'sveltekit-superforms/server';
import type { PageServerLoad } from './$types';
import { z } from 'zod';
import { getUserById } from '$lib/server/database/queries/users';

export const load: PageServerLoad = async (event) => {
	const { chatId } = event.params;
	const user = event.locals.user;

	if (!user) {
		redirect(301, '/auth/sign-in');
	}

	const form = await superValidate(event, newMessageSchema);
	const inboxService = new InboxService();
	const conversation = await inboxService.getConversationDetails(chatId, user.id);

	const lastMessage = conversation.messages[conversation.messages.length - 1];

	if (lastMessage) {
		await inboxService.markAsRead(chatId, user.id, lastMessage.id);
	}

	return {
		form,
		user,
		conversation
	};
};

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
	},
	sendNewMessage: async (event: RequestEvent) => {
		const { chatId } = event.params;
		if (!chatId) return;

		const form = await superValidate(event, sendMessageSchema);

		if (!form.valid) {
			return fail(400, {
				form
			});
		}
		const inboxService = new InboxService();
		try {
			const newMessageData: SendMessageParams = {
				conversationId: chatId,
				body: form.data.body,
				senderId: event.locals.user!.id,
				isSystemMessage: form.data.isSystemMessage
			};
			await inboxService.sendMessage(newMessageData);

			const result = message({ ...form, data: { ...form.data, body: '' } }, 'Message Sent.');

			return result;
		} catch (error) {
			console.error(error);
			setFlash(
				{ type: 'error', message: 'Unable to send message. Please refresh and try again.' },
				event
			);
			return setError(form, 'Error sending message.');
		}
	}
};
