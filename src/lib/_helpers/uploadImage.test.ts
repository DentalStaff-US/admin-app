import { describe, expect, it } from 'vitest';
import { uniqueImageName } from './uploadImage';

describe('uniqueImageName', () => {
	it('never reuses the file’s own name, so uploads cannot overwrite each other', () => {
		expect(uniqueImageName('image/png', 'abc')).toBe('abc.png');
		expect(uniqueImageName('image/png')).not.toBe(uniqueImageName('image/png'));
	});
	it('refuses other file types', () => {
		expect(uniqueImageName('image/svg+xml')).toBeNull();
		expect(uniqueImageName('application/pdf')).toBeNull();
	});
});
