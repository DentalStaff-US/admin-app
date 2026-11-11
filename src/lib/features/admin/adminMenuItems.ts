import {
	Award,
	Ban,
	Briefcase,
	Building2,
	ClipboardList,
	Download,
	FileText,
	GraduationCap,
	HeartHandshake,
	History,
	LifeBuoy,
	Megaphone,
	Settings2,
	Shield,
	ShieldCheck,
	Sparkles,
	Tags,
	Upload,
	UserRound,
	Users
} from 'lucide-svelte';
import type { AdminMenuItem } from './menu';

/** Every admin tool. Order within an area is the order on the page. */
export const ADMIN_MENU_ITEMS: AdminMenuItem<typeof Shield>[] = [
	// People
	{ area: 'People', label: 'Admins', href: '/admin/menu/admins', icon: Shield, description: 'DTSS staff accounts and invites.' },
	{ area: 'People', label: 'Professionals', href: '/professionals', icon: UserRound, description: 'Every professional and their credentials.' },
	{ area: 'People', label: 'Clients', href: '/clients', icon: Building2, description: 'Practices, their locations and staff.' },
	{ area: 'People', label: 'All users', href: '/admin/menu/users', icon: Users, description: 'Search, suspend or sign in as any account.' },
	{ area: 'People', label: 'User import', href: '/admin/menu/user-import', icon: Upload, description: 'Bulk-create accounts from a CSV.' },
	{ area: 'People', label: 'Blacklists', href: '/admin/menu/blacklists', icon: Ban, description: 'Professionals a practice has blocked.' },

	// Billing
	{ area: 'Billing', label: 'Timesheets', href: '/timesheets', icon: ClipboardList, description: 'Review, approve and bill worked hours.' },
	{ area: 'Billing', label: 'Affiliate program', href: '/admin/menu/affiliates', icon: HeartHandshake, description: 'Partners, commission, flagged referrals and payouts.' },
	{ area: 'Billing', label: 'Application settings', href: '/admin/menu/application-settings', icon: Settings2, description: 'Platform fees and defaults.' },

	// Communication
	{ area: 'Communication', label: 'Mass notifications', href: '/admin/menu/mass-notifications', icon: Megaphone, description: 'Email and SMS campaigns to chosen audiences.' },
	{ area: 'Communication', label: 'Support tickets', href: '/support', icon: LifeBuoy, description: 'Questions and problems raised by users.' },

	// Data
	{ area: 'Data', label: 'Requisitions', href: '/requisitions', icon: Briefcase, description: 'Every temp and permanent request.' },
	{ area: 'Data', label: 'Compliance', href: '/admin/compliance', icon: ShieldCheck, description: 'Licenses and certifications that need attention.' },
	{ area: 'Data', label: 'Documents', href: '/admin/menu/documents', icon: FileText, description: 'Uploaded credentials and files, with expiry.' },
	{ area: 'Data', label: 'Record history', href: '/admin/menu/record-history', icon: History, description: 'Who changed or viewed what, and when.' },
	{ area: 'Data', label: 'Exports', href: '/admin/menu/exports', icon: Download, description: 'Download CSVs of platform data.' },

	// System
	{ area: 'System', label: 'Disciplines', href: '/admin/menu/disciplines', icon: GraduationCap, description: 'Roles professionals work in, and license rules.' },
	{ area: 'System', label: 'Experience levels', href: '/admin/menu/experience-levels', icon: Award, description: 'Experience bands used on requests and profiles.' },
	{ area: 'System', label: 'Skill categories', href: '/admin/menu/skill-categories', icon: Tags, description: 'How skills are grouped and matched.' },
	{ area: 'System', label: 'Skills', href: '/admin/menu/skills', icon: Sparkles, description: 'Skills professionals list and requests require.' }
];
