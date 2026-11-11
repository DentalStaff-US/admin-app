<!--
  Dev-only fixtures for the workday and application detail pages.
  ?view=workday|application · ?role=admin|practice
  workday: ?state=assigned|open|cancelled · application: ?app=pending|approved|denied|recommended
-->
<script lang="ts">
	import { page } from '$app/stores';
	import AdminShell from '$shell/AdminShell.svelte';
	import ApplicationDetailPage from '$features/requisitions/components/ApplicationDetailPage.svelte';
	import WorkdayDetailPage from '$features/requisitions/components/WorkdayDetailPage.svelte';

	const q = $derived($page.url.searchParams);
	const view = $derived(q.get('view') ?? 'workday');
	const admin = $derived(q.get('role') !== 'practice');
	const dayState = $derived(q.get('state') ?? 'assigned');
	const appState = $derived(q.get('app') ?? 'pending');

	const user = $derived({ id: 'u1', role: admin ? 'SUPERADMIN' : 'CLIENT' });

	const sv = (id: string, data: Record<string, unknown>) => ({
		id,
		valid: true,
		posted: false,
		data,
		errors: {},
		constraints: {}
	});

	const pros = [
		{ candidateId: 'c2', firstName: 'Priya', lastName: 'Shah', email: 'priya.shah@example.com', distance: 3.4, disciplineAbbr: 'RDH', avatarUrl: null },
		{
			candidateId: 'c3',
			firstName: 'Daniel',
			lastName: 'Okafor',
			email: 'd.okafor@example.com',
			distance: 7.9,
			disciplineAbbr: 'RDH',
			avatarUrl: null,
			unavailableDates: [{ date: '2026-11-12', reason: 'weekday' }]
		},
		{
			candidateId: 'c4',
			firstName: 'Lena',
			lastName: 'Brooks',
			email: 'lena.b@example.com',
			distance: 12.1,
			disciplineAbbr: 'RDH',
			avatarUrl: null,
			wantsThisWorkType: false,
			meetsSkillRequirements: false
		}
	];

	const workdayData = $derived({
		user,
		activity: [],
		workdayCredential: null,
		recurrenceDay: {
			recurrenceDay: {
				id: 'rd1',
				date: '2026-11-12',
				dayStart: new Date('2026-11-12T12:30:00Z'),
				dayEnd: new Date('2026-11-12T21:00:00Z'),
				lunchStart: new Date('2026-11-12T16:30:00Z'),
				lunchEnd: new Date('2026-11-12T17:00:00Z'),
				status: dayState === 'assigned' ? 'FILLED' : dayState === 'cancelled' ? 'CANCELED' : 'OPEN'
			},
			requisition: {
				id: 1042,
				referenceTimezone: 'America/New_York',
				disciplineName: 'Dental Hygienist',
				companyName: 'Bright Smiles Dental',
				locationName: 'Tampa – Westshore',
				experienceLevelName: '3+ years',
				hourlyRate: 48,
				status: 'OPEN',
				jobDescription:
					'Cover a full hygiene column for a busy family practice. Adult prophys, perio maintenance and SRP; Dentrix charting.',
				specialInstructions: 'Park in the back lot. Ask for Maria at the front desk.'
			}
		},
		workday:
			dayState === 'open'
				? null
				: {
						workday: { id: 'w1', cancelledAt: dayState === 'cancelled' ? new Date() : null },
						candidate: { id: 'c1', firstName: 'Maria', lastName: 'Lopez', email: 'maria.lopez@example.com', phoneNumber: '(813) 555-0142', avatarUrl: null },
						timesheet:
							dayState === 'assigned'
								? { id: 't1', totalHoursWorked: '8.0', totalHoursBilled: '8.0', adjustedHourlyRate: null, status: 'PENDING' }
								: null
					},
		requisition: { requisition: { id: 1042, disciplineId: 'd1' } },
		qualifiedProfessionals: pros,
		defaultSearchRadiusMiles: 60,
		editWorkdayScheduleForm: sv('edit', { date: '2026-11-12', startTime: '07:30', endTime: '16:00', lunchStartTime: '11:30', lunchEndTime: '12:00' })
	});

	const applicationData = $derived({
		user,
		activity: [],
		recommendedBy: 'Shannon Carter',
		messageForm: sv('msg', { id: '' }),
		approvalForm: sv('approval', { applicationId: '' }),
		application: {
			application: {
				id: 'a1',
				status: appState === 'approved' ? 'APPROVED' : appState === 'denied' ? 'DENIED' : 'PENDING',
				source: appState === 'recommended' ? 'ADMIN_RECOMMENDED' : 'CANDIDATE',
				recommendationNote:
					appState === 'recommended' ? 'Eight years in perio-heavy practices, available from December, strong on Dentrix.' : null,
				candidateConsentAt: appState === 'recommended' ? new Date('2026-11-03T15:00:00Z') : null,
				createdAt: new Date('2026-11-02T14:10:00Z'),
				updatedAt: new Date('2026-11-06T09:30:00Z')
			},
			user: { id: 'u9', firstName: 'Maria', lastName: 'Lopez', email: 'maria.lopez@example.com', avatarUrl: null },
			candidateProfile: { id: 'c1', city: 'Tampa', state: 'FL', cellPhone: '(813) 555-0142', completeAddress: '4102 W Kennedy Blvd, Tampa, FL 33609' },
			disciplineExperience: { preferredHourlyMin: 45, preferredHourlyMax: 55 },
			discipline: { name: 'Dental Hygienist' },
			experienceLevel: { value: '5+ years' },
			resume: { filename: 'maria-lopez-resume.pdf', uploadUrl: '#' }
		}
	});

	let sidebar = $state<'expanded' | 'rail'>('expanded');
</script>

<AdminShell
	pathname="/requisitions/1042"
	nav={{ role: admin ? 'SUPERADMIN' : 'CLIENT' }}
	bind:sidebar
	name={admin ? 'Shannon Carter' : 'Dr. Alan Reyes'}
	initials={admin ? 'SC' : 'AR'}
>
	{#key `${view}${admin}${dayState}${appState}`}
		{#if view === 'application'}
			<ApplicationDetailPage data={applicationData} requisitionId={1042} />
		{:else}
			<WorkdayDetailPage data={workdayData} />
		{/if}
	{/key}
</AdminShell>
