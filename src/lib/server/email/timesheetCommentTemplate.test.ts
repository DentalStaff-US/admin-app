import { describe, expect, it } from 'vitest';
import { EMAIL_TEMPLATES } from './templates';

const base = {
	timesheetId: 'ts-1',
	professionalName: 'Dana Reyes',
	weekOf: 'Nov 16, 2026',
	place: 'Main Street Office',
	author: 'DTSS',
	body: 'Lunch was 30 minutes.\nPlease check Tuesday.',
	status: 'DISCREPANCY'
};

describe('timesheetCommentEmail', () => {
	it('says who commented, on which timesheet, what they wrote, and where to reply', () => {
		const t = EMAIL_TEMPLATES.timesheetCommentEmail(base);
		for (const part of [t.textEmail, t.htmlEmail]) {
			for (const s of ['DTSS', 'Dana Reyes', 'Nov 16, 2026', 'Main Street Office', 'Please check Tuesday.', '/timesheets/ts-1', 'sent back for correction']) {
				expect(part).toContain(s);
			}
		}
		expect(t.subject).toContain('Dana Reyes’s timesheet for the week of Nov 16, 2026');
	});

	it('leaves the state line out once nothing is waiting on anyone', () => {
		const t = EMAIL_TEMPLATES.timesheetCommentEmail({ ...base, status: 'APPROVED' });
		expect(t.textEmail).not.toMatch(/sent back|waiting for/);
	});

	it('escapes what people typed and keeps the subject on one line', () => {
		const t = EMAIL_TEMPLATES.timesheetCommentEmail({
			...base,
			author: '<b>Al</b>',
			body: '<script>alert(1)</script>',
			professionalName: 'Dana\r\nBcc: x@y.z'
		});
		expect(t.htmlEmail).not.toMatch(/<script>|<b>Al/);
		expect(t.subject).not.toMatch(/[\r\n]/);
	});
});
