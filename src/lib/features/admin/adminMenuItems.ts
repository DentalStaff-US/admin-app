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

/**
 * Every admin tool. Order within an area is the order on the page. Each names the
 * matrix permission it needs; the menu hides the ones the viewer lacks.
 */
export const ADMIN_MENU_ITEMS: AdminMenuItem<typeof Shield>[] = [
	// People
	{ area: 'People', label: 'Admins', href: '/admin/menu/admins', permission: 'admins.manage', icon: Shield, description: 'DTSS staff accounts and invites.' },
	{ area: 'People', label: 'Professionals', href: '/professionals', permission: 'professionals.manage', icon: UserRound, description: 'Every professional and their credentials.' },
	{ area: 'People', label: 'Clients', href: '/clients', permission: 'practices.manage', icon: Building2, description: 'Practices, their locations and staff.' },
	{ area: 'People', label: 'All users', href: '/admin/menu/users', permission: 'users.read', icon: Users, description: 'Search, suspend or sign in as any account.' },
	{ area: 'People', label: 'User import', href: '/admin/menu/user-import', permission: 'users.import', icon: Upload, description: 'Bulk-create accounts from a CSV.' },
	{ area: 'People', label: 'Blacklists', href: '/admin/menu/blacklists', permission: 'blacklist.add', icon: Ban, description: 'Professionals a practice has blocked.' },

	// Billing
	{ area: 'Billing', label: 'Timesheets', href: '/timesheets', permission: 'timesheets.approve', icon: ClipboardList, description: 'Review, approve and bill worked hours.' },
	{ area: 'Billing', label: 'Affiliate program', href: '/admin/menu/affiliates', permission: 'affiliates.read', icon: HeartHandshake, description: 'Partners, commission, flagged referrals and payouts.' },
	{ area: 'Billing', label: 'Application settings', href: '/admin/menu/application-settings', permission: 'platform.configure', icon: Settings2, description: 'Platform fees and defaults.' },

	// Communication
	{ area: 'Communication', label: 'Mass notifications', href: '/admin/menu/mass-notifications', permission: 'comms.massSend', icon: Megaphone, description: 'Email and SMS campaigns to chosen audiences.' },
	{ area: 'Communication', label: 'Support tickets', href: '/support', permission: 'support.manage', icon: LifeBuoy, description: 'Questions and problems raised by users.' },

	// Data
	{ area: 'Data', label: 'Requisitions', href: '/requisitions', permission: 'requisitions.manage', icon: Briefcase, description: 'Every temp and permanent requisition.' },
	{ area: 'Data', label: 'Compliance', href: '/admin/compliance', permission: 'compliance.manage', icon: ShieldCheck, description: 'Licenses and certifications that need attention.' },
	{ area: 'Data', label: 'Documents', href: '/admin/menu/documents', permission: 'professionals.manage', icon: FileText, description: 'Uploaded credentials and files, with expiry.' },
	{ area: 'Data', label: 'Record history', href: '/admin/menu/record-history', permission: 'audit.read', icon: History, description: 'Who changed or viewed what, and when.' },
	{ area: 'Data', label: 'Exports', href: '/admin/menu/exports', permission: 'exports.run', icon: Download, description: 'Download CSVs of platform data.' },

	// System
	{ area: 'System', label: 'Disciplines', href: '/admin/menu/disciplines', permission: 'platform.configure', icon: GraduationCap, description: 'Roles professionals work in, and license rules.' },
	{ area: 'System', label: 'Experience levels', href: '/admin/menu/experience-levels', permission: 'platform.configure', icon: Award, description: 'Experience bands used on requisitions and profiles.' },
	{ area: 'System', label: 'Skill categories', href: '/admin/menu/skill-categories', permission: 'platform.configure', icon: Tags, description: 'How skills are grouped and matched.' },
	{ area: 'System', label: 'Skills', href: '/admin/menu/skills', permission: 'platform.configure', icon: Sparkles, description: 'Skills professionals list and requisitions require.' }
];
