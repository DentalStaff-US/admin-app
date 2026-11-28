import { describe, expect, it } from 'vitest';
import { groupAlertsByRecipient } from './alerts';

describe('groupAlertsByRecipient', () => {
	it('puts everything due for one person together', () => {
		const grouped = groupAlertsByRecipient([
			{ userId: 'a', conversationId: 'c1', newestMessageId: 1 },
			{ userId: 'b', conversationId: 'c1', newestMessageId: 1 },
			{ userId: 'a', conversationId: 'c2', newestMessageId: 2 }
		]);
		expect(grouped.get('a')?.map((alert) => alert.conversationId)).toEqual(['c1', 'c2']);
		expect(grouped.get('b')).toHaveLength(1);
	});
});
