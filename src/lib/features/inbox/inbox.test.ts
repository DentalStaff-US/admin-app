import { describe, expect, it } from 'vitest';
import { dayLabel, describeConversation, filterConversations, initialsOf, otherParticipants, relativeTime, startsNewDay, unreadOf, type InboxConversation } from './inbox';

const me = 'u-admin';
const listShape = (id: string, first: string, last: string) => ({ userId: id, user: { id, firstName: first, lastName: last, avatarUrl: `/${id}.png` } });

const internal: InboxConversation = {
	id: 'c1',
	type: 'INTERNAL',
	participants: [listShape(me, 'Shannon', 'Carter'), listShape('u-maria', 'Maria', 'Lopez')],
	lastMessage: { body: 'Can you cover Tuesday?', createdAt: '2026-11-10T10:00:00Z' },
	unreadCount: '2'
};

const practiceThread: InboxConversation = {
	id: 'c2',
	type: 'CLIENT_CANDIDATE',
	// Thread endpoint: flat participants.
	participants: [{ userId: 'u-owner', firstName: 'Dana', lastName: 'Ruiz' }, { userId: 'u-pro', firstName: 'James', lastName: 'Whitfield', avatarUrl: null }],
	practice: { id: 'co1', name: 'Bright Smiles Dental', logo: null }
};

const application: InboxConversation = {
	id: 'c3',
	type: 'APPLICATION',
	participants: [listShape(me, 'Shannon', 'Carter'), listShape('u-a', 'Ana', 'Ng'), listShape('u-b', 'Bo', 'Li'), listShape('u-c', 'Cy', 'Ho')],
	applicationData: { requisition: { id: 1042, disciplineName: 'Dental Hygienist' }, company: { id: 'co2', name: 'Harbor Dental', logo: null } }
};

describe('describeConversation', () => {
	it('names a direct thread for the other person, with their avatar', () => {
		expect(describeConversation(internal, me)).toMatchObject({ title: 'Maria Lopez', subtitle: '', avatarUrl: '/u-maria.png', initials: 'ML', contextHref: null });
	});

	it('names a practice–professional thread for the other person and says which practice', () => {
		expect(describeConversation(practiceThread, 'u-owner')).toMatchObject({ title: 'James Whitfield', subtitle: 'Bright Smiles Dental' });
	});

	it('summarises big application threads and links to the job', () => {
		const d = describeConversation(application, me);
		expect(d.title).toBe('Ana Ng, Bo Li +1');
		expect(d.subtitle).toBe('Dental Hygienist · Harbor Dental');
		expect(d.contextHref).toBe('/requisitions/1042');
		expect(d.avatarUrl).toBeNull();
	});

	it('falls back when nobody else is named', () => {
		expect(describeConversation({ id: 'x', participants: [] }, me).title).toBe('DTSS team');
	});
});

describe('helpers', () => {
	it('leaves the viewer out of participants in either shape', () => {
		expect(otherParticipants(internal, me).map((p) => p.userId)).toEqual(['u-maria']);
		expect(otherParticipants(practiceThread, 'u-pro').map((p) => p.firstName)).toEqual(['Dana']);
	});

	it('filters by name, practice, job or message text', () => {
		const all = [internal, practiceThread, application];
		expect(filterConversations(all, 'tuesday', me).map((c) => c.id)).toEqual(['c1']);
		expect(filterConversations(all, 'bright', me).map((c) => c.id)).toEqual(['c2']);
		expect(filterConversations(all, 'hygienist', me).map((c) => c.id)).toEqual(['c3']);
		expect(filterConversations(all, '  ', me)).toHaveLength(3);
	});

	it('reads unread counts that arrive as strings', () => {
		expect(unreadOf(internal)).toBe(2);
		expect(unreadOf(practiceThread)).toBe(0);
	});

	it('formats initials, relative times and day dividers', () => {
		expect(initialsOf('maria lopez')).toBe('ML');
		const now = new Date('2026-11-10T12:00:00');
		expect(relativeTime(new Date('2026-11-10T11:15:00'), now)).toBe('45m ago');
		expect(relativeTime(new Date('2026-11-08T12:00:00'), now)).toBe('2d ago');
		expect(dayLabel(new Date('2026-11-10T08:00:00'), now)).toBe('Today');
		expect(dayLabel(new Date('2026-11-09T23:00:00'), now)).toBe('Yesterday');
		expect(dayLabel(new Date('2026-11-03T09:00:00'), now)).toBe('Tue, Nov 3');
		expect(startsNewDay({ createdAt: '2026-11-10T08:00:00' }, { createdAt: '2026-11-10T07:00:00' })).toBe(false);
		expect(startsNewDay({ createdAt: '2026-11-10T08:00:00' }, { createdAt: '2026-11-09T07:00:00' })).toBe(true);
		expect(startsNewDay({ createdAt: '2026-11-10T08:00:00' }, null)).toBe(true);
	});
});
