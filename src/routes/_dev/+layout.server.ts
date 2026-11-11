import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';

// Fixture-driven design review. Never reachable outside local dev.
export function load() {
	if (!dev) error(404, 'Not found');
}
