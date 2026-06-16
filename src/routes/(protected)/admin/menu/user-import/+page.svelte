<script lang="ts">
	import Papa from 'papaparse';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import { Input } from '$lib/components/ui/input';
	import { Label } from '$lib/components/ui/label';
	import { Loader2, MapPin, RefreshCw } from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';

	export let data;

	type UserRole = 'SUPERADMIN' | 'CLIENT' | 'CANDIDATE';

	interface ParsedUser {
		firstName: string;
		lastName: string;
		email: string;
		companyName?: string;
		companyLogo?: string;
		baseLocation?: string;
		cellPhone?: string;
		companyPhone?: string;
		birthday?: string;
		address?: string;
		addressTwo?: string;
		city?: string;
		state?: string;
		zipcode?: string;
		errors: string[];
		discipline?: string;
	}

	let selectedRole: UserRole | null = null;
	let parsedUsers: ParsedUser[] = [];
	let showPreview = false;
	let importing = false;
	let importResult: {
		success: number;
		skipped: number;
		errors: string[];
		geocodingQueued?: number;
	} | null = null;

	// Geocoding status
	let geocodingStatus = { queueSize: 0, processing: false };
	let checkingStatus = false;
	let statusInterval: NodeJS.Timeout;

	// Column mapping variations
	const columnMappings: Record<string, string[]> = {
		firstName: ['first name', 'firstname', 'first_name', 'first'],
		lastName: ['last name', 'lastname', 'last_name', 'last'],
		email: ['email', 'email address', 'e-mail'],
		birthday: ['birthday', 'birth date', 'date of birth', 'dob'],
		discipline: ['discipline', 'field', 'specialty'],
		companyName: ['company name', 'companyname', 'company_name', 'company', 'business name'],
		companyLogo: ['company logo', 'companylogo', 'company_logo', 'logo', 'logo url'],
		baseLocation: ['base location', 'baselocation', 'base_location', 'location', 'city'],
		companyPhone: ['company phone', 'companyphone', 'company_phone', 'phone', 'phone number'],
		cellPhone: ['cell phone', 'cellphone', 'cell_phone', 'mobile', 'mobile phone']
	};

	// Address component mappings
	const addressComponentMappings: Record<string, string[]> = {
		streetOne: ['address (street 1)', 'address', 'street address', 'street 1', 'address1'],
		streetTwo: ['address (street 2)', 'address 2', 'street 2', 'address2', 'suite', 'apt'],
		city: ['city', 'town'],
		state: ['state', 'province', 'region'],
		zipcode: ['zip code', 'zipcode', 'zip', 'postal code', 'postalcode']
	};

	function findColumnValue(row: any, field: string): string {
		const variations = columnMappings[field] || [];

		// Check exact match first
		if (row[field] !== undefined) return row[field];

		// Check variations (case-insensitive)
		for (const variation of variations) {
			const key = Object.keys(row).find((k) => k.toLowerCase() === variation.toLowerCase());
			if (key && row[key] !== undefined) return row[key];
		}

		return '';
	}

	function findAddressComponent(row: any, component: string): string {
		const variations = addressComponentMappings[component] || [];

		for (const variation of variations) {
			const key = Object.keys(row).find((k) => k.toLowerCase() === variation.toLowerCase());
			if (key && row[key] !== undefined && row[key] !== null) {
				return String(row[key]).trim();
			}
		}

		return '';
	}

	function buildCompleteAddress(row: any): {
		streetOne: string;
		streetTwo: string;
		city: string;
		state: string;
		zipcode: string;
		fullAddress: string;
	} {
		// Find values for each component
		const streetOne = findAddressComponent(row, 'streetOne');
		const streetTwo = findAddressComponent(row, 'streetTwo');
		const city = findAddressComponent(row, 'city');
		const state = findAddressComponent(row, 'state');
		const zipcode = findAddressComponent(row, 'zipcode');

		// Build complete address string
		const parts = [];
		if (streetOne.trim()) parts.push(streetOne.trim());
		if (streetTwo.trim()) parts.push(streetTwo.trim());
		if (city.trim() && state.trim()) {
			parts.push(`${city.trim()}, ${state.trim()}`);
		} else if (city.trim()) {
			parts.push(city.trim());
		} else if (state.trim()) {
			parts.push(state.trim());
		}
		if (zipcode.trim()) parts.push(zipcode.trim());

		return {
			streetOne,
			streetTwo,
			city,
			state,
			zipcode,
			fullAddress: parts.join(', ')
		};
	}

	function validateUser(user: ParsedUser, role: UserRole): string[] {
		const errors: string[] = [];

		// Common validations
		if (!user.firstName?.trim()) errors.push('First name is required');
		if (!user.lastName?.trim()) errors.push('Last name is required');
		if (!user.email?.trim()) {
			errors.push('Email is required');
		} else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(user.email)) {
			errors.push('Invalid email format');
		}

		// Role-specific validations
		if (role === 'CLIENT') {
			if (!user.companyName?.trim()) errors.push('Company name is required');
			// Address is optional but recommended for geocoding
		}

		if (role === 'CANDIDATE') {
			// Address and discipline are optional
		}

		return errors;
	}

	function handleFileUpload(event: Event) {
		const input = event.target as HTMLInputElement;
		const file = input.files?.[0];

		if (!file || !selectedRole) return;

		Papa.parse(file, {
			header: true,
			skipEmptyLines: true,
			complete: (results) => {
				parsedUsers = results.data.map((row: any) => {
					const user: ParsedUser = {
						firstName: findColumnValue(row, 'firstName').trim(),
						lastName: findColumnValue(row, 'lastName').trim(),
						email: findColumnValue(row, 'email').trim().toLowerCase(),
						errors: []
					};

					if (selectedRole === 'CLIENT') {
						user.companyName = findColumnValue(row, 'companyName').trim();
						user.companyLogo = findColumnValue(row, 'companyLogo').trim();
						user.baseLocation = findColumnValue(row, 'baseLocation').trim();
						user.birthday = findColumnValue(row, 'birthday').trim();
						user.companyPhone = findColumnValue(row, 'companyPhone').trim();
						user.cellPhone = findColumnValue(row, 'cellPhone').trim();

						// BUILD COMPLETE ADDRESS FROM COMPONENTS
						const addressParts = buildCompleteAddress(row);
						user.address = addressParts.fullAddress; // This is the complete geocodable address
						user.addressTwo = addressParts.streetTwo;
						user.city = addressParts.city;
						user.state = addressParts.state;
						user.zipcode = addressParts.zipcode;
					}

					if (selectedRole === 'CANDIDATE') {
						const addressParts = buildCompleteAddress(row);
						user.address = addressParts.fullAddress;
						user.city = addressParts.city;
						user.state = addressParts.state;
						user.zipcode = addressParts.zipcode;
						user.discipline = findColumnValue(row, 'discipline').trim();
						user.birthday = findColumnValue(row, 'birthday').trim();
						user.cellPhone = findColumnValue(row, 'cellPhone').trim();
					}

					user.errors = validateUser(user, selectedRole as UserRole);
					return user;
				});
				importResult = null;
				showPreview = true;
			},
			error: (error) => {
				alert('Error parsing CSV: ' + error.message);
			}
		});
	}

	function resetUpload() {
		parsedUsers = [];
		showPreview = false;
		importResult = null;
	}

	function handleRoleChange() {
		resetUpload();
	}

	async function checkGeocodingStatus() {
		checkingStatus = true;
		try {
			const response = await fetch('?/getGeocodingStatus', {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
			});

			if (!response.ok) {
				console.error('Status check failed:', response.statusText);
				return;
			}

			const data = await response.json();
			console.log('Status response:', data);

			// Handle both the wrapped and direct response formats
			if (data.type === 'success') {
				geocodingStatus = data.data || { queueSize: 0, processing: false };
			} else if (data.success !== undefined) {
				geocodingStatus = {
					queueSize: data.queueSize || 0,
					processing: data.processing || false
				};
			}
		} catch (error) {
			console.error('Error checking geocoding status:', error);
			geocodingStatus = { queueSize: 0, processing: false };
		} finally {
			checkingStatus = false;
		}
	}

	async function triggerGeocoding(action: string, buttonText: string) {
		try {
			const response = await fetch(`?/${action}`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
			});

			if (!response.ok) {
				throw new Error(`HTTP ${response.status}: ${response.statusText}`);
			}

			const data = await response.json();
			console.log(`${action} response:`, data);

			// Handle both response formats
			let resultData = data.type === 'success' ? data.data : data;

			if (resultData.success !== false) {
				const message = resultData.message || `Successfully triggered ${buttonText}`;
				alert(message);
				await checkGeocodingStatus();
			} else {
				throw new Error(resultData.error || `Failed to trigger ${buttonText}`);
			}
		} catch (error) {
			console.error(`Error triggering ${action}:`, error);
			alert(`Failed to ${buttonText}: ${error.message}`);
		}
	}

	onMount(() => {
		checkGeocodingStatus();
		statusInterval = setInterval(() => {
			if (geocodingStatus.processing || geocodingStatus.queueSize > 0) {
				checkGeocodingStatus();
			}
		}, 10000); // Check every 10 seconds
	});

	onDestroy(() => {
		if (statusInterval) clearInterval(statusInterval);
	});

	$: validUsers = parsedUsers.filter((u) => u.errors.length === 0);
	$: invalidUsers = parsedUsers.filter((u) => u.errors.length > 0);
	$: hasAddressData = validUsers.some((u) => u.address);
</script>

<svelte:head>
	<title>Admin Menu - User Management</title>
</svelte:head>

<section class="flex flex-col h-full p-6 space-y-4">
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Manage Users</h1>
			<p class="text-muted-foreground">Upload csv files to add users</p>
		</div>
	</div>

	<!-- DANGER ZONE - Delete Bad Import (Temporary for cleanup) -->
	{#if data.user?.role === 'SUPERADMIN' && parsedUsers.length > 0}
		<details class="p-4 border-2 border-red-500 rounded-lg bg-red-50">
			<summary class="cursor-pointer font-bold text-red-700"
				>⚠️ DANGER ZONE - Delete Bad Import</summary
			>
			<div class="mt-4">
				<p class="text-sm text-red-600 mb-3">
					This will delete {parsedUsers.length} users from this CSV. This action cannot be undone!
				</p>
				<form
					method="POST"
					action="?/deleteAllUsers"
					use:enhance={() => {
						return async ({ result, update }) => {
							if (result.type === 'success') {
								parsedUsers = [];
								showPreview = false;
							}
							await update();
						};
					}}
				>
					<input
						type="hidden"
						name="emails"
						value={JSON.stringify(parsedUsers.map((u) => u.email))}
					/>
					<Label for="confirm">Type DELETE_ALL_IMPORTED_USERS to confirm:</Label>
					<Input
						id="confirm"
						name="confirm"
						placeholder="DELETE_ALL_IMPORTED_USERS"
						class="mb-3 border-red-500"
					/>
					<Button type="submit" variant="destructive" class="w-full">
						Delete All Users from This CSV
					</Button>
				</form>
			</div>
		</details>
	{/if}

	<!-- Geocoding Status Panel - Always show for admins -->
	{#if data.user?.role === 'SUPERADMIN'}
		<div class="geocoding-status-panel">
			<div class="flex items-center justify-between mb-3">
				<div class="flex items-center gap-2">
					<MapPin class="h-5 w-5 text-blue-600" />
					<h3 class="text-lg font-semibold">Geocoding Status</h3>
				</div>
				<Button
					type="button"
					variant="outline"
					size="sm"
					on:click={checkGeocodingStatus}
					disabled={checkingStatus}
					class="gap-2"
				>
					<RefreshCw class="h-4 w-4 {checkingStatus ? 'animate-spin' : ''}" />
					Refresh Status
				</Button>
			</div>

			<div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
				<div class="status-card">
					<div class="status-label">Queue Size</div>
					<div class="status-value">{geocodingStatus.queueSize ?? 'N/A'}</div>
				</div>
				<div class="status-card">
					<div class="status-label">Status</div>
					<div class="status-value">
						{#if geocodingStatus.processing}
							<span class="text-blue-600">Processing...</span>
						{:else if geocodingStatus.queueSize > 0}
							<span class="text-yellow-600">Pending</span>
						{:else}
							<span class="text-green-600">Idle</span>
						{/if}
					</div>
				</div>
				<div class="status-card">
					<div class="status-label">Last Import</div>
					<div class="status-value">
						{importResult?.geocodingQueued ?? 0} queued
					</div>
				</div>
			</div>

			<!-- Geocoding Action Buttons -->
			<div class="flex gap-2 flex-wrap">
				<Button
					type="button"
					variant="default"
					size="sm"
					on:click={() => triggerGeocoding('geocodeAllPending', 'Geocode All Pending')}
					class="bg-primary hover:bg-primary/90 gap-2"
				>
					<MapPin class="h-4 w-4" />
					Geocode All (Locations + Candidates)
				</Button>

				<Button
					type="button"
					variant="outline"
					size="sm"
					on:click={() => triggerGeocoding('geocodePendingLocations', 'Geocode Locations')}
					class="border-blue-500 text-blue-600 hover:bg-blue-50 gap-2"
				>
					<MapPin class="h-4 w-4" />
					Locations Only
				</Button>

				<Button
					type="button"
					variant="outline"
					size="sm"
					on:click={() => triggerGeocoding('geocodePendingCandidates', 'Geocode Candidates')}
					class="border-purple-500 text-purple-600 hover:bg-purple-50 gap-2"
				>
					<MapPin class="h-4 w-4" />
					Candidates Only
				</Button>
			</div>
		</div>
	{/if}

	<!-- Role Selection -->
	<div class="form-group">
		<label for="role">Select User Role</label>
		<select id="role" bind:value={selectedRole} on:change={handleRoleChange}>
			<option value={null}>-- Select Role --</option>
			<option value="SUPERADMIN">Admin</option>
			<option value="CLIENT">Business</option>
			<option value="CANDIDATE">Professional</option>
		</select>
	</div>

	<!-- File Upload -->
	{#if selectedRole}
		<div class="form-group">
			<label for="csvFile">Upload CSV File</label>
			<input type="file" id="csvFile" accept=".csv" on:change={handleFileUpload} />
			<p class="help-text">
				Required columns for {selectedRole}:
				{#if selectedRole === 'SUPERADMIN'}
					First Name, Last Name, Email
				{:else if selectedRole === 'CLIENT'}
					First Name, Last Name, Email, Company Name, Address (Street 1), Address (Street 2), City,
					State, Zip Code
				{:else if selectedRole === 'CANDIDATE'}
					First Name, Last Name, Email, Address (Street 1), Address (Street 2), City, State, Zip
					Code, Discipline
				{/if}
			</p>
		</div>
	{/if}

	<!-- Preview Table -->
	{#if showPreview && parsedUsers.length > 0}
		<div class="preview-section">
			<div class="flex items-start justify-between">
				<div>
					<h2>Preview ({parsedUsers.length} users)</h2>

					<div class="stats">
						<span class="valid">✓ {validUsers.length} Valid</span>
						<span class="invalid">✗ {invalidUsers.length} Invalid</span>
						{#if hasAddressData}
							<span class="info"
								>📍 Will geocode {validUsers.filter((u) => u.address).length}
								{selectedRole === 'CLIENT' ? 'locations' : 'candidates'}</span
							>
						{/if}
					</div>
				</div>
				<!-- Action Buttons -->
				<div class="actions">
					<Button type="button" variant="destructiveOutline" on:click={resetUpload}>Cancel</Button>
					<form
						method="POST"
						action="?/importUsers"
						use:enhance={() => {
							importing = true;
							return async ({ result, update }) => {
								importing = false;
								console.log({ result });
								if (result.type === 'success' && result.data) {
									importResult = result.data;
									// Clear the preview but keep the import result
									parsedUsers = [];
									showPreview = false;
									// Refresh geocoding status after import
									setTimeout(() => checkGeocodingStatus(), 1000);
								}
								await update();
							};
						}}
					>
						<input type="hidden" name="role" value={selectedRole} />
						<input type="hidden" name="users" value={JSON.stringify(validUsers)} />
						<Button
							type="submit"
							variant="default"
							class="bg-primary hover:bg-primary/90 gap-2"
							disabled={validUsers.length === 0 || importing}
						>
							{#if importing}
								<Loader2 class="animate-spin" />
								Importing...
							{:else}
								Import {validUsers.length} Valid Users
							{/if}
						</Button>
					</form>
				</div>
			</div>

			<div class="table-wrapper">
				<table>
					<thead>
						<tr>
							<th>Status</th>
							<th>First Name</th>
							<th>Last Name</th>
							<th>Email</th>
							{#if selectedRole === 'CLIENT'}
								<th>Company Name</th>
								<th>Complete Address</th>
							{/if}
							{#if selectedRole === 'CANDIDATE'}
								<th>Complete Address</th>
								<th>Discipline(s)</th>
							{/if}
							<th>Errors</th>
						</tr>
					</thead>
					<tbody>
						{#each parsedUsers as user}
							<tr class={user.errors.length > 0 ? 'error-row' : 'valid-row'}>
								<td>
									{#if user.errors.length > 0}
										<span class="status-icon error">✗</span>
									{:else}
										<span class="status-icon success">✓</span>
									{/if}
								</td>
								<td>{user.firstName}</td>
								<td>{user.lastName}</td>
								<td>{user.email}</td>
								{#if selectedRole === 'CLIENT'}
									<td>{user.companyName || ''}</td>
									<td class="max-w-xs truncate" title={user.address}
										>{user.address || 'No address'}</td
									>
								{/if}
								{#if selectedRole === 'CANDIDATE'}
									<td class="max-w-md truncate" title={user.address}
										>{user.address || 'No address'}</td
									>
									<td>{user.discipline || 'Not specified'}</td>
								{/if}
								<td>
									{#if user.errors.length > 0}
										<ul class="error-list">
											{#each user.errors as error}
												<li>{error}</li>
											{/each}
										</ul>
									{/if}
								</td>
							</tr>
						{/each}
					</tbody>
				</table>
			</div>
		</div>
	{/if}

	<!-- Import Result -->
	{#if importResult}
		<div class="result-section">
			<h2>Import Complete</h2>
			<p><strong>Successfully imported:</strong> {importResult.success} users</p>
			<p><strong>Skipped (duplicates):</strong> {importResult.skipped} users</p>
			{#if importResult.geocodingQueued}
				<p class="geocoding-notice">
					<MapPin class="inline h-4 w-4" />
					<strong>Geocoding:</strong>
					{importResult.geocodingQueued}
					{selectedRole === 'CLIENT' ? 'locations' : 'addresses'} queued for background processing
				</p>
			{/if}

			{#if importResult.errors.length > 0}
				<div class="errors">
					<h3>Skipped Users:</h3>
					<ul>
						{#each importResult.errors as error}
							<li>{error}</li>
						{/each}
					</ul>
				</div>
			{/if}
		</div>
	{/if}
</section>

<style>
	.form-group {
		margin-bottom: 1.5rem;
	}

	label {
		display: block;
		font-weight: 600;
		margin-bottom: 0.5rem;
	}

	select,
	input[type='file'] {
		padding: 0.5rem;
		border: 1px solid #ddd;
		border-radius: 4px;
		font-size: 1rem;
	}

	select {
		min-width: 200px;
	}

	.help-text {
		margin-top: 0.5rem;
		font-size: 0.875rem;
		color: #666;
	}

	.geocoding-status-panel {
		padding: 1.5rem;
		background: linear-gradient(to bottom, #eff6ff, #ffffff);
		border: 1px solid #bfdbfe;
		border-radius: 8px;
		margin-bottom: 1rem;
	}

	.status-card {
		padding: 1rem;
		background: white;
		border: 1px solid #e5e7eb;
		border-radius: 6px;
	}

	.status-label {
		font-size: 0.875rem;
		color: #6b7280;
		margin-bottom: 0.25rem;
	}

	.status-value {
		font-size: 1.25rem;
		font-weight: 600;
		color: #111827;
	}

	.preview-section {
		margin-top: 2rem;
		border: 1px solid #ddd;
		border-radius: 8px;
		padding: 1.5rem;
		background: #f9f9f9;
	}

	.stats {
		display: flex;
		gap: 1rem;
		margin-bottom: 1rem;
		font-weight: 600;
	}

	.stats .valid {
		color: #059669;
	}

	.stats .invalid {
		color: #dc2626;
	}

	.stats .info {
		color: #2563eb;
	}

	.table-wrapper {
		overflow-x: auto;
		margin-bottom: 1rem;
	}

	table {
		width: 100%;
		border-collapse: collapse;
		background: white;
		border-radius: 4px;
		overflow: hidden;
	}

	th,
	td {
		padding: 0.75rem;
		text-align: left;
		border-bottom: 1px solid #e5e7eb;
	}

	th {
		background: #f3f4f6;
		font-weight: 600;
	}

	.valid-row {
		background: #f0fdf4;
	}

	.error-row {
		background: #fef2f2;
	}

	.status-icon {
		font-weight: bold;
	}

	.status-icon.success {
		color: #059669;
	}

	.status-icon.error {
		color: #dc2626;
	}

	.error-list {
		margin: 0;
		padding-left: 1.25rem;
		font-size: 0.875rem;
		color: #dc2626;
	}

	.actions {
		display: flex;
		gap: 1rem;
		justify-content: flex-end;
	}

	.result-section {
		margin-top: 2rem;
		padding: 1.5rem;
		background: #f0fdf4;
		border: 1px solid #86efac;
		border-radius: 8px;
	}

	.result-section h2 {
		color: #059669;
		margin-top: 0;
	}

	.geocoding-notice {
		color: #2563eb;
		font-weight: 500;
		margin-top: 0.5rem;
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.errors {
		margin-top: 1rem;
		padding: 1rem;
		background: #fef2f2;
		border: 1px solid #fecaca;
		border-radius: 4px;
	}

	.errors h3 {
		margin-top: 0;
		color: #dc2626;
	}

	.errors ul {
		margin: 0.5rem 0 0 0;
		padding-left: 1.25rem;
	}

	.max-w-xs {
		max-width: 20rem;
	}

	.max-w-md {
		max-width: 28rem;
	}

	.truncate {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	td[title] {
		cursor: help;
	}
</style>
