<script lang="ts">
	import Papa from 'papaparse';
	import { enhance } from '$app/forms';
	import { Button } from '$lib/components/ui/button';
	import {Loader2} from 'lucide-svelte'

	type UserRole = 'SUPERADMIN' | 'CLIENT' | 'CANDIDATE';

	interface ParsedUser {
		firstName: string;
		lastName: string;
		email: string;
		companyName?: string;
		companyLogo?: string;
		baseLocation?: string;
		hourlyRateMin?: number;
		hourlyRateMax?: number;
		cellPhone?: string;
		companyPhone?: string;
		birthday?: string;
		address?: string;
		addressTwo?: string;
		city?: string;
		state?: string;
		zipcode?: string;
		errors: string[];
	}

	let selectedRole: UserRole | null = null;
	let parsedUsers: ParsedUser[] = [];
	let showPreview = false;
	let importing = false;
	let importResult: { success: number; skipped: number; errors: string[] } | null = null;

	// Column mapping variations
	const columnMappings: Record<string, string[]> = {
		firstName: ['first name', 'firstname', 'first_name', 'first'],
		lastName: ['last name', 'lastname', 'last_name', 'last'],
		email: ['email', 'email address', 'e-mail'],
		birthday: ['birthday', 'birth date', 'date of birth', 'dob'],
		companyName: ['company name', 'companyname', 'company_name', 'company', 'business name'],
		companyLogo: ['company logo', 'companylogo', 'company_logo', 'logo', 'logo url'],
		baseLocation: ['base location', 'baselocation', 'base_location', 'location', 'city'],
		companyPhone: ['company phone', 'companyphone', 'company_phone', 'phone', 'phone number'],
		cellPhone: ['cell phone', 'cellphone', 'cell_phone', 'mobile', 'mobile phone'],
		address: ['address', 'street address', 'full address', 'address (street 1)'],
		addressTwo: ['address two', 'address2', 'address_2', 'secondary address', 'address (street 2)'],
		city: ['city', 'town'],
		state: ['state', 'province', 'region'],
		zipcode: ['zipcode', 'zip code', 'postal code', 'postalcode'],
		hourlyRateMin: ['hourly rate min', 'hourlyratemin', 'hourly_rate_min', 'min rate', 'rate min'],
		hourlyRateMax: ['hourly rate max', 'hourlyratemax', 'hourly_rate_max', 'max rate', 'rate max']
	};

	function findColumnValue(row: any, field: string): string {
		const variations = columnMappings[field] || [];

		// Check exact match first
		if (row[field] !== undefined) return row[field];

		// Check variations (case-insensitive)
		for (const variation of variations) {
			const key = Object.keys(row).find(k => k.toLowerCase() === variation.toLowerCase());
			if (key && row[key] !== undefined) return row[key];
		}

		return '';
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
			if (!user.baseLocation?.trim()) errors.push('Base location is required');
		}

		if (role === 'CANDIDATE') {
			if (!user.address?.trim()) errors.push('Address is required');
			if (user.hourlyRateMin === undefined || user.hourlyRateMin === null || isNaN(user.hourlyRateMin)) {
				errors.push('Hourly rate min is required');
			}
			if (user.hourlyRateMax === undefined || user.hourlyRateMax === null || isNaN(user.hourlyRateMax)) {
				errors.push('Hourly rate max is required');
			}
			if (user.hourlyRateMin && user.hourlyRateMax && user.hourlyRateMin > user.hourlyRateMax) {
				errors.push('Min rate cannot exceed max rate');
			}
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
						user.birthday = findColumnValue(row, 'birthday').trim()
						user.companyPhone = findColumnValue(row, 'companyPhone').trim()
						user.cellPhone = findColumnValue(row, 'cellPhone').trim()
						user.address = findColumnValue(row, 'address').trim();
						user.addressTwo = findColumnValue(row, 'addressTwo').trim();
						user.city = findColumnValue(row, 'city').trim()
						user.state = findColumnValue(row, 'state').trim()
						user.zipcode = findColumnValue(row, 'zipcode').trim()
					}

					if (selectedRole === 'CANDIDATE') {
						user.address = findColumnValue(row, 'address').trim();
						const minRate = findColumnValue(row, 'hourlyRateMin');
						const maxRate = findColumnValue(row, 'hourlyRateMax');
						user.hourlyRateMin = minRate ? parseFloat(minRate) : undefined;
						user.hourlyRateMax = maxRate ? parseFloat(maxRate) : undefined;
					}

					user.errors = validateUser(user, selectedRole as UserRole);
					return user;
				});
				importResult = null
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

	$: validUsers = parsedUsers.filter(u => u.errors.length === 0);
	$: invalidUsers = parsedUsers.filter(u => u.errors.length > 0);
</script>

<svelte:head>
    <title>Admin Menu - User Management</title>
</svelte:head>

<section class="flex flex-col h-full p-6 space-y-6">
	<!-- Header -->
	<div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">Manage Users</h1>
			<p class="text-muted-foreground">Upload csv files to add users</p>
		</div>
	</div>


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
			<input
				type="file"
				id="csvFile"
				accept=".csv"
				on:change={handleFileUpload}
			/>
			<p class="help-text">
				Required columns for {selectedRole}:
				{#if selectedRole === 'SUPERADMIN'}
					First Name, Last Name, Email
				{:else if selectedRole === 'CLIENT'}
					First Name, Last Name, Email, Company Name, Base Location
				{:else if selectedRole === 'CANDIDATE'}
					First Name, Last Name, Email, Address, Hourly Rate Min, Hourly Rate Max
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
			</div>
			</div>
			<!-- Action Buttons -->
			<div class="actions">
				<Button type="button" variant="destructive" on:click={resetUpload}>
					Cancel
				</Button>
				<form method="POST" action="?/importUsers" use:enhance={() => {
					importing = true;
					return async ({ result, update }) => {
						importing = false;
						console.log({result})
						if (result.type === 'success' && result.data) {
                            importResult = result.data;
                            // Clear the preview but keep the import result
                            parsedUsers = [];
                            showPreview = false;
                            // Don't set importResult = null here!
                        }
						await update();
					};
				}}>
					<input type="hidden" name="role" value={selectedRole} />
					<input type="hidden" name="users" value={JSON.stringify(validUsers)} />
					<Button
						type="submit"
					    variant="default"
						class="bg-green-500 hover:bg-green-600 gap-2"
						disabled={validUsers.length === 0 || importing}
					>
						{#if importing}
						<Loader2 class="animate-spin"/>
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
								<th>Base Location</th>
							{/if}
							{#if selectedRole === 'CANDIDATE'}
								<th>Address</th>
								<th>Min Rate</th>
								<th>Max Rate</th>
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
									<td>{user.baseLocation || ''}</td>
								{/if}
								{#if selectedRole === 'CANDIDATE'}
									<td>{user.address || ''}</td>
									<td>{user.hourlyRateMin ?? ''}</td>
									<td>{user.hourlyRateMax ?? ''}</td>
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

	select, input[type="file"] {
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

	th, td {
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
</style>
