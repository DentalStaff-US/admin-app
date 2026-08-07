// lib/server/jobs/geocoding-queue.ts

import { geocodeAddress } from '$lib/server/mapbox';
import db from '$lib/server/database/drizzle';
import { companyOfficeLocationTable } from '$lib/server/database/schemas/client';
import { eq } from 'drizzle-orm';
import { candidateProfileTable } from './database/schemas/candidate';
import { addressComponentsToProfilePatch } from '$lib/server/address';

interface GeocodingJob {
	locationId?: string; // For client locations
	candidateId?: string; // For candidates
	address: string;
	email: string;
	type: 'location' | 'candidate'; // Distinguishes which table to update
}

class GeocodingQueue {
	private queue: GeocodingJob[] = [];
	private processing = false;
	private DELAY_BETWEEN_REQUESTS = 100; // ms between geocoding requests

	addJobs(jobs: GeocodingJob[]) {
		this.queue.push(...jobs);
		console.log(`Added ${jobs.length} geocoding jobs. Queue size: ${this.queue.length}`);

		// Start processing if not already running
		if (!this.processing) {
			this.processQueue();
		}
	}

	private async processQueue() {
		if (this.queue.length === 0) {
			this.processing = false;
			console.log('Geocoding queue empty. Stopping processor.');
			return;
		}

		this.processing = true;
		const total = this.queue.length;
		let processed = 0;
		let successful = 0;
		let failed = 0;

		console.log(`Starting geocoding of ${total} items (locations and candidates)...`);

		while (this.queue.length > 0) {
			const job = this.queue.shift();

			if (!job) continue;

			try {
				const geoData = await geocodeAddress(job.address);

				if (geoData) {
					// Update based on type
					if (job.type === 'location' && job.locationId) {
						// Update client company location
						await db
							.update(companyOfficeLocationTable)
							.set({
								lat: geoData.lat.toString(),
								lon: geoData.lon.toString(),
								timezone: geoData.timezone,
								completeAddress: geoData.formattedAddress,
								updatedAt: new Date()
							})
							.where(eq(companyOfficeLocationTable.id, job.locationId));

						console.log(`✓ Geocoded location ${job.locationId}: ${job.address}`);
					} else if (job.type === 'candidate' && job.candidateId) {
						// Update candidate profile. Granular fields are written here too so
						// this queue acts as the backstop that keeps them in sync with
						// complete_address on every address change.
						await db
							.update(candidateProfileTable)
							.set({
								lat: geoData.lat.toString(),
								lon: geoData.lon.toString(),
								completeAddress: geoData.formattedAddress,
								...addressComponentsToProfilePatch(geoData.components),
								updatedAt: new Date()
							})
							.where(eq(candidateProfileTable.id, job.candidateId));

						console.log(`✓ Geocoded candidate ${job.candidateId}: ${job.address}`);
					}

					successful++;
				} else {
					console.error(
						`✗ Geocoding failed for ${job.type} ${job.locationId || job.candidateId}: ${job.address}`
					);
					failed++;
				}
			} catch (error) {
				console.error(`Error geocoding ${job.type} ${job.locationId || job.candidateId}:`, error);
				failed++;
			}

			processed++;

			// Log progress every 10 items or at the end
			if (processed % 10 === 0 || processed === total) {
				console.log(
					`Geocoding progress: ${processed}/${total} (${successful} successful, ${failed} failed)`
				);
			}

			// Rate limiting delay
			if (this.queue.length > 0) {
				await new Promise((resolve) => setTimeout(resolve, this.DELAY_BETWEEN_REQUESTS));
			}
		}

		console.log(
			`Geocoding complete! Processed ${processed} items (${successful} successful, ${failed} failed)`
		);

		this.processing = false;
	}

	getQueueStatus() {
		return {
			queueSize: this.queue.length,
			processing: this.processing
		};
	}
}

console.log('Geocoding queue initialized');
export const geocodingQueue = new GeocodingQueue();
