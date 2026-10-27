import { describe, it, expect } from 'vitest';
import { toPublicJob, toPublicJobDetail, type PublicJobRow } from './mask';

const baseRow = (over: Partial<PublicJobRow> = {}): PublicJobRow => ({
	publicId: '7d3c0d7e-3b8a-4f3e-9a51-0b4f8c1c2d11',
	permanent: false,
	disciplineName: 'Dental Hygienist',
	disciplineAbbreviation: 'RDH',
	experienceLevel: '2-5 Years',
	city: 'TAMPA',
	state: 'fl',
	hourlyRate: 52,
	createdAt: new Date('2026-10-01T15:00:00Z'),
	referenceTimezone: 'America/New_York',
	jobDescription:
		'Smith Family Dental (smithfamilydental.com) needs an RDH. Dr. Smith runs a friendly office at 742 Evergreen Terrace, Suite 4. Call 813-555-0199 or visit https://www.smithfamilydental.com.',
	distanceMiles: 3.27,
	companyName: 'Smith Family Dental',
	companyWebsite: 'https://www.smithfamilydental.com',
	locationName: 'Smith Family Dental - Westchase',
	locationWebsite: 'westchase-smiles.com',
	streetOne: '742 Evergreen Terrace',
	streetTwo: 'Suite 4',
	...over
});

const openDays = [
	{
		date: '2026-11-03',
		dayStart: new Date('2026-11-03T13:00:00Z'),
		dayEnd: new Date('2026-11-03T22:00:00Z')
	},
	{
		date: '2026-11-04',
		dayStart: new Date('2026-11-04T13:00:00Z'),
		dayEnd: new Date('2026-11-04T22:00:00Z')
	},
	{
		date: '2026-11-05',
		dayStart: new Date('2026-11-05T13:00:00Z'),
		dayEnd: new Date('2026-11-05T22:00:00Z')
	},
	{
		date: '2026-11-06',
		dayStart: new Date('2026-11-06T13:00:00Z'),
		dayEnd: new Date('2026-11-06T22:00:00Z')
	},
	{
		date: '2026-11-07',
		dayStart: new Date('2026-11-07T13:00:00Z'),
		dayEnd: new Date('2026-11-07T22:00:00Z')
	},
	{
		date: '2026-11-10',
		dayStart: new Date('2026-11-10T13:00:00Z'),
		dayEnd: new Date('2026-11-10T22:00:00Z')
	}
];

const FORBIDDEN = [
	'Smith',
	'smithfamilydental',
	'Evergreen',
	'Suite 4',
	'Westchase',
	'westchase-smiles',
	'813-555-0199',
	'555-0199',
	'33626',
	'27.95',
	'-82.45'
];

describe('toPublicJob', () => {
	it('never emits identity, contact, location detail or internal ids', () => {
		const row = {
			...baseRow(),
			// Columns a careless spread would leak. They are not on PublicJobRow, which
			// is the point: the DTO is an allowlist.
			requisitionId: 4242,
			title: 'Smith Family Dental RDH',
			zipcode: '33626',
			lat: '27.95',
			lon: '-82.45',
			specialInstructions: 'Park behind Smith Family Dental',
			purchaseOrderNumber: 'PO-777'
		} as PublicJobRow;

		const dto = toPublicJobDetail(row, { openDays, includeDistance: true });
		const json = JSON.stringify(dto);

		for (const value of FORBIDDEN) expect(json).not.toContain(value);
		expect(json).not.toContain('4242');
		expect(json).not.toContain('PO-777');
		expect(json).not.toContain('Park behind');
		expect(Object.keys(dto).sort()).toEqual(
			[
				'city',
				'descriptionLength',
				'descriptionTeaser',
				'discipline',
				'distanceMiles',
				'experienceLevel',
				'payRate',
				'postedAt',
				'publicId',
				'schedule',
				'skills',
				'state',
				'summary',
				'type'
			].sort()
		);
		expect(dto.descriptionTeaser).toContain('the dentist');
		expect(dto.descriptionTeaser).toContain('the practice');
	});

	it('builds a temp schedule with the next 5 dates in the requisition timezone', () => {
		const dto = toPublicJob(baseRow(), { openDays });
		expect(dto.type).toBe('temp');
		expect(dto.payRate).toBe(52);
		expect(dto.schedule).toEqual({
			permanent: false,
			openDateCount: 6,
			nextDates: openDays.slice(0, 5).map((d) => ({ date: d.date, start: '08:00', end: '17:00' }))
		});
		expect(dto.summary).toBe(
			'Temporary Dental Hygienist shifts in Tampa, FL · 2-5 years experience preferred · 6 open dates starting Nov 3.'
		);
		expect(dto.postedAt).toBe('2026-10-01');
		expect(dto.city).toBe('Tampa');
		expect(dto.state).toBe('FL');
	});

	it('nulls payRate and uses the permanent schedule for perm postings', () => {
		const dto = toPublicJob(baseRow({ permanent: true, hourlyRate: 60, experienceLevel: null }), {
			openDays
		});
		expect(dto.type).toBe('perm');
		expect(dto.payRate).toBeNull();
		expect(dto.schedule).toEqual({ permanent: true });
		expect(dto.summary).toBe('Permanent Dental Hygienist position in Tampa, FL.');
	});

	it('only reports distance when a search point was supplied, bucketed', () => {
		expect(toPublicJob(baseRow()).distanceMiles).toBeNull();
		expect(toPublicJob(baseRow(), { includeDistance: true }).distanceMiles).toBe(3.5);
	});

	it('maps skills to a display-safe shape without ids', () => {
		const dto = toPublicJob(baseRow(), {
			skills: [
				{
					categoryId: 'cat-1',
					categoryName: 'Software',
					matchMode: 'ANY',
					skills: [{ id: 'sk-1', name: 'Dentrix', requiresCertificate: false }]
				}
			]
		});
		expect(dto.skills).toEqual([
			{
				category: 'Software',
				matchMode: 'ANY',
				skills: [{ name: 'Dentrix', requiresCertificate: false }]
			}
		]);
		expect(JSON.stringify(dto)).not.toContain('sk-1');
		expect(JSON.stringify(dto)).not.toContain('cat-1');
	});

	it('detail adds a length hint but still only the teaser', () => {
		const long = 'Friendly team with great benefits. '.repeat(30);
		const dto = toPublicJobDetail(baseRow({ jobDescription: long }));
		expect(dto.descriptionLength).toBeGreaterThan(900);
		expect(dto.descriptionTeaser!.length).toBeLessThanOrEqual(281);
	});
});
