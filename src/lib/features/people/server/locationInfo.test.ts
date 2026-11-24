// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { superValidate } from 'sveltekit-superforms/server';
import { ClientLocationDetailsSchema } from '$lib/config/zod-schemas';

const update = vi.hoisted(() => vi.fn());
vi.mock('$lib/server/database/queries/clients', () => ({ updateCompanyLocation: update }));
vi.mock('$lib/server/logger', () => ({ logger: { error: vi.fn() } }));

import { saveLocationInfo } from './locationInfo';

function fd(fields: Record<string, string>) {
	const data = new FormData();
	for (const [k, v] of Object.entries(fields)) data.set(k, v);
	return data;
}
const blank = { locationId: 'loc', name: 'Main', companyPhone: '', cellPhone: '', email: '', website: '' };

describe('saveLocationInfo', () => {
	beforeEach(() => update.mockReset().mockImplementation(async (_id, v) => ({ id: 'loc', ...v })));

	it('saves a trimmed name and normalized contact details, and nothing else', async () => {
		const result = await saveLocationInfo(
			'loc',
			fd({ ...blank, name: '  Downtown ', companyPhone: '(813) 555-0134', email: 'desk@x.com', companyId: 'other' })
		);
		expect(result).toEqual({ locationSaved: 'Downtown' });
		expect(update).toHaveBeenCalledWith('loc', {
			name: 'Downtown',
			companyPhone: '+18135550134',
			cellPhone: null,
			email: 'desk@x.com',
			website: null
		});
	});

	it('refuses a blank name, a bad email and a bad phone without saving', async () => {
		const result = await saveLocationInfo('loc', fd({ ...blank, name: '   ', email: 'nope', cellPhone: '12' }));
		expect(result).toMatchObject({ status: 400 });
		expect(Object.keys((result as any).data.locationErrors).sort()).toEqual(['cellPhone', 'email', 'name']);
		expect(update).not.toHaveBeenCalled();
	});

	it('answers 404 for a location that is gone', async () => {
		update.mockResolvedValue(null);
		expect(await saveLocationInfo('loc', fd(blank))).toMatchObject({ status: 404 });
	});
});

describe('ClientLocationDetailsSchema', () => {
	it('saves without an address, leaving the stored address and coordinates alone', async () => {
		const form = await superValidate(
			fd({ name: 'Main', timezone: 'America/New_York', companyPhone: '', email: '' }),
			ClientLocationDetailsSchema
		);
		expect(form.valid).toBe(true);
		expect(form.data.completeAddress).toBeUndefined();
		expect(form.data.lat).toBeUndefined();
		expect(form.data.lon).toBeUndefined();
	});
	it('refuses a blank name', async () => {
		const form = await superValidate(fd({ name: '  ', timezone: 'America/New_York' }), ClientLocationDetailsSchema);
		expect(form.errors.name).toBeTruthy();
	});
});
