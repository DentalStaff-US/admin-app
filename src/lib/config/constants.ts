// Comment out the next two lines to seed db

import { dev } from '$app/environment';
export const BASE_URL = dev ? 'http://localhost:3000' : 'https://internal.dtstaffingsolutions.com';
export const BRAND_BASE = '#2a93d1';

export const APP_NAME = 'Dental Temp Staffing Solutions';
export const CONTACT_EMAIL = 'dtss@dtstaffingsolutions.com';
export const DOMAIN = 'https://internal.dtstaffingsolutions.com';
/* WARNING!!! TERMS AND CONDITIONS AND PRIVACY POLICY
WERE CREATED BY CHATGPT AS AN EXAMPLE ONLY.
CONSULT A LAWYER AND DEVELOP YOUR OWN TERMS AND PRIVACY POLICY!!! */
export const TERMS_PRIVACY_CONTACT_EMAIL = 'dtss@dtstaffingsolutions.com';
export const TERMS_PRIVACY_WEBSITE = 'https://www.dtstaffingsolutions.com';
export const TERMS_PRIVACY_COMPANY = 'Dental Temp Staffing Solutions';
export const TERMS_PRIVACY_EFFECTIVE_DATE = 'January 1, 2023';
export const TERMS_PRIVACY_APP_NAME = 'Dental Temp Staffing Solutions';
export const TERMS_PRIVACY_APP_PRICING_AND_SUBSCRIPTIONS =
	'[Details about the pricing, subscription model, refund policy]';
export const TERMS_PRIVACY_COUNTRY = 'United States';

export const DEV_SUPERADMIN_EMAIL = 'brett.a.cole65@gmail.com';
export const DEV_SUPERADMIN_PASSWORD = 'dentalstaff.us';
export const DEFAULT_MAX_RECORD_LIMIT = 1000;

export const USER_ROLES = {
	SUPERADMIN: 'SUPERADMIN',
	CLIENT: 'CLIENT',
	CLIENT_STAFF: 'CLIENT_STAFF',
	CANDIDATE: 'CANDIDATE'
} as const;

export const CLIENT_STAFF_ROLES = {
	CLIENT_ADMIN: 'CLIENT_ADMIN',
	CLIENT_MANAGER: 'CLIENT_MANAGER',
	CLIENT_EMPLOYEE: 'CLIENT_EMPLOYEE'
} as const;

export const CANDIDATE_STATUS = {
	INACTIVE: 'INACTIVE',
	PENDING: 'PENDING',
	ACTIVE: 'ACTIVE'
} as const;

export const SUPPORT_TICKET_STATUS = {
	NEW: 'NEW',
	PENDING: 'PENDING',
	CLOSED: 'CLOSED'
};

export const STATES: { name: string; abbreviation: string }[] = [
	{ name: 'Alabama', abbreviation: 'AL' },
	{ name: 'Alaska', abbreviation: 'AK' },
	{ name: 'Arizona', abbreviation: 'AZ' },
	{ name: 'Arkansas', abbreviation: 'AR' },
	{ name: 'California', abbreviation: 'CA' },
	{ name: 'Colorado', abbreviation: 'CO' },
	{ name: 'Connecticut', abbreviation: 'CT' },
	{ name: 'Delaware', abbreviation: 'DE' },
	{ name: 'Florida', abbreviation: 'FL' },
	{ name: 'Georgia', abbreviation: 'GA' },
	{ name: 'Hawaii', abbreviation: 'HI' },
	{ name: 'Idaho', abbreviation: 'ID' },
	{ name: 'Illinois', abbreviation: 'IL' },
	{ name: 'Indiana', abbreviation: 'IN' },
	{ name: 'Iowa', abbreviation: 'IA' },
	{ name: 'Kansas', abbreviation: 'KS' },
	{ name: 'Kentucky', abbreviation: 'KY' },
	{ name: 'Louisiana', abbreviation: 'LA' },
	{ name: 'Maine', abbreviation: 'ME' },
	{ name: 'Maryland', abbreviation: 'MD' },
	{ name: 'Massachusetts', abbreviation: 'MA' },
	{ name: 'Michigan', abbreviation: 'MI' },
	{ name: 'Minnesota', abbreviation: 'MN' },
	{ name: 'Mississippi', abbreviation: 'MS' },
	{ name: 'Missouri', abbreviation: 'MO' },
	{ name: 'Montana', abbreviation: 'MT' },
	{ name: 'Nebraska', abbreviation: 'NE' },
	{ name: 'Nevada', abbreviation: 'NV' },
	{ name: 'New Hampshire', abbreviation: 'NH' },
	{ name: 'New Jersey', abbreviation: 'NJ' },
	{ name: 'New Mexico', abbreviation: 'NM' },
	{ name: 'New York', abbreviation: 'NY' },
	{ name: 'North Carolina', abbreviation: 'NC' },
	{ name: 'North Dakota', abbreviation: 'ND' },
	{ name: 'Ohio', abbreviation: 'OH' },
	{ name: 'Oklahoma', abbreviation: 'OK' },
	{ name: 'Oregon', abbreviation: 'OR' },
	{ name: 'Pennsylvania', abbreviation: 'PA' },
	{ name: 'Rhode Island', abbreviation: 'RI' },
	{ name: 'South Carolina', abbreviation: 'SC' },
	{ name: 'South Dakota', abbreviation: 'SD' },
	{ name: 'Tennessee', abbreviation: 'TN' },
	{ name: 'Texas', abbreviation: 'TX' },
	{ name: 'Utah', abbreviation: 'UT' },
	{ name: 'Vermont', abbreviation: 'VT' },
	{ name: 'Virginia', abbreviation: 'VA' },
	{ name: 'Washington', abbreviation: 'WA' },
	{ name: 'West Virginia', abbreviation: 'WV' },
	{ name: 'Wisconsin', abbreviation: 'WI' },
	{ name: 'Wyoming', abbreviation: 'WY' }
];

export const dentalStaffDisciplines = [
	{ discipline: 'Dentist', abbreviation: 'DDS' },
	{ discipline: 'Dental Hygienist', abbreviation: 'RDH' },
	{ discipline: 'Dental Assistant', abbreviation: 'DA' },
	{ discipline: 'Endodontist', abbreviation: 'Endo' },
	{ discipline: 'Orthodontist', abbreviation: 'Ortho' },
	{ discipline: 'Periodontist', abbreviation: 'Perio' },
	{ discipline: 'Prosthodontist', abbreviation: 'Pros' },
	{ discipline: 'Pediatric Dentist', abbreviation: 'Pedi' },
	{ discipline: 'Oral Surgeon', abbreviation: 'OS' },
	{ discipline: 'Oral Pathologist', abbreviation: 'OP' },
	{ discipline: 'Oral Radiologist', abbreviation: 'OR' },
	{ discipline: 'Dental Public Health Specialist', abbreviation: 'DPH' }
];

export const experienceLevels = ['0-2 Years', '2-5 Years', '5-7 Years', '7-10 Years', '10+ years'];

export const skillsByCategory = {
	'Administrative Skills': [
		'Bookkeeping',
		'Data Entry',
		'Scheduling',
		'Appointment Setting',
		'Inventory Management',
		'Filing',
		'Record Keeping',
		'Insurance Billing',
		'Claims Processing',
		'Medical Transcription'
	],
	'Clinical Skills': [
		'Patient Care',
		'Sterilization Techniques',
		'X-Ray Operation',
		'HIPAA Compliance',
		'Patient Education',
		'Phlebotomy',
		'Medical Terminology',
		'Anesthesia Monitoring',
		'Infection Control'
	],
	'Technical Skills': [
		'Dental Software Proficiency',
		'Computer Skills',
		'Technical Skills',
		'Electronic Health Records (EHR)'
	],
	'Customer Service Skills': ['Communication Skills', 'Customer Service', 'Active Listening'],
	'Office Management Skills': ['Problem-Solving Skills', 'Teamwork Skills', 'Leadership Skills'],
	'Emergency Response Skills': ['Emergency Response', 'CPR Certification', 'First Aid']
};

export const notificationEntityIds: { id: string; entity: string; action: string }[] = [];

// interface Timezone {
// 	label: string;
// 	name: string;
// 	offsetString: string;
// 	timezones: string[];
// 	offsetNum: number;
// }
//
export const TIMEZONES = [
	{
		label: 'Eastern Standard (EST)',
		name: 'America/New_York'
	},
	{
		label: 'Central Standard (CST)',
		name: 'America/Chicago'
	},
	{
		label: 'Mountain Standard (MST)',
		name: 'America/Denver'
	},
	{
		label: 'Pacific Standard (PST)',
		name: 'America/Los_Angeles'
	}
];

// export const TIMEZONES: Timezone[] = [
// 	{
// 		label: 'Hawaii',
// 		name: 'Hawaiian Standard Time',
// 		offsetString: '-10:00',
// 		timezones: ['America/Adak', 'Pacific/Honolulu'],
// 		offsetNum: -10
// 	},
// 	{
// 		label: 'Alaska',
// 		name: 'Alaskan Standard Time',
// 		offsetString: '-09:00',
// 		timezones: [
// 			'America/Anchorage',
// 			'America/Juneau',
// 			'America/Sitka',
// 			'America/Metlakatla',
// 			'America/Nome',
// 			'America/Adak'
// 		],
// 		offsetNum: -9
// 	},
// 	{
// 		label: 'Pacific',
// 		name: 'Pacific Standard Time',
// 		offsetString: '-08:00',
// 		timezones: ['America/Los_Angeles'],
// 		offsetNum: -8
// 	},
// 	{
// 		label: 'Mountain',
// 		name: 'Mountain Standard Time',
// 		offsetString: '-07:00',
// 		timezones: ['America/Denver', 'America/Boise', 'America/Phoenix', 'America/Shiprock'],
// 		offsetNum: -7
// 	},
// 	{
// 		label: 'Central',
// 		name: 'Central Standard Time',
// 		offsetString: '-06:00',
// 		timezones: [
// 			'America/Chicago',
// 			'America/Indiana/Tell_City',
// 			'America/Indiana/Knox',
// 			'America/Menominee',
// 			'America/North_Dakota/Center',
// 			'America/North_Dakota/New_Salem',
// 			'America/North_Dakota/Beulah'
// 		],
// 		offsetNum: -6
// 	},
// 	{
// 		label: 'Eastern',
// 		name: 'Eastern Standard Time',
// 		offsetString: '-05:00',
// 		timezones: [
// 			'America/New_York',
// 			'America/Detroit',
// 			'America/Kentucky/Louisville',
// 			'America/Kentucky/Monticello',
// 			'America/Indiana/Indianapolis',
// 			'America/Indiana/Vincennes',
// 			'America/Indiana/Winamac',
// 			'America/Indiana/Marengo',
// 			'America/Indiana/Petersburg',
// 			'America/Indiana/Vevay'
// 		],
// 		offsetNum: -5
// 	},
// 	{
// 		label: 'Atlantic',
// 		name: 'Atlantic Standard Time',
// 		offsetString: '-04:00',
// 		timezones: [
// 			'America/Halifax',
// 			'America/Barbados',
// 			'America/Blanc-Sablon',
// 			'America/Glace_Bay',
// 			'America/Goose_Bay',
// 			'America/Moncton',
// 			'America/Puerto_Rico',
// 			'America/Santo_Domingo',
// 			'America/Thule',
// 			'America/Anguilla',
// 			'America/Antigua',
// 			'America/Aruba',
// 			'America/Curacao',
// 			'America/Dominica',
// 			'America/Grenada',
// 			'America/Guadeloupe',
// 			'America/Martinique',
// 			'America/Montserrat',
// 			'America/St_Kitts',
// 			'America/St_Lucia',
// 			'America/St_Thomas',
// 			'America/St_Vincent',
// 			'America/Tortola'
// 		],
// 		offsetNum: -4
// 	}
// ];

export const SETTINGS_MENU_OPTIONS = {
	ADMIN: {
		PROFILE: 'ADMIN-PROFILE',
		PASSWORD: 'ADMIN-PASSWORD',
		NOTIFICATIONS: 'ADMIN-NOTIFICATIONS',
		BILLING: 'ADMIN-BILLING',
		TEAM: 'ADMIN-TEAM'
	},
	CLIENT: {
		PROFILE: 'CLIENT-PROFILE',
		COMPANY: 'COMPANY-PROFILE',
		PASSWORD: 'CLIENT-PASSWORD',
		NOTIFICATIONS: 'CLIENT-NOTIFICATIONS',
		BILLING: 'CLIENT-BILLING',
		STAFF: 'CLIENT-STAFF',
		DOCUMENTS: 'DOCUMENTS'
	},
	CLIENT_STAFF: {
		PROFILE: 'STAFF-PROFILE',
		COMPANY: 'STAFF-COMPANY',
		PASSWORD: 'STAFF-PASSWORD',
		NOTIFICATIONS: 'STAFF-NOTIFICATIONS',
		STAFF: 'STAFF-STAFF'
	}
};

export const STAFF_ROLE_ENUM = {
	CLIENT_ADMIN: 'Admin',
	CLIENT_MANAGER: 'Manager',
	CLIENT_EMPLOYEE: 'Employee'
} as const;

export const RADIUS_MILES = 30;
export const METERS_PER_MILE = 1609.34;
export const RADIUS_METERS = RADIUS_MILES * METERS_PER_MILE;
