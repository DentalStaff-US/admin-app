<script lang="ts">
	const adminMenu = {
		'User Management': [
			{ name: 'Admins', link: '/admin/menu/admins' },
			{ name: 'Professional Members', link: '/professionals' },
			{ name: 'Business Members', link: '/clients' },
			{ name: 'User Management', link: '/admin/menu/users' },
			{ name: 'User Import', link: '/admin/menu/user-import' }
		],
		'Requisition Management': [
			{ name: 'Requisitions', link: '/requisitions' },
			{ name: 'Timesheets', link: '/timesheets' },
			// { name: 'Ratings', link: '/admin/menu/ratings' },
			{ name: 'Experience Levels', link: '/admin/menu/experience-levels' },
			{ name: 'Skill Categories', link: '/admin/menu/skill-categories' },
			{ name: 'Skills', link: '/admin/menu/skills' },
			{ name: 'Disciplines', link: '/admin/menu/disciplines' }
		],
		'Record Management': [
			{ name: 'Support Tickets', link: '/support' },
			{ name: 'Record History', link: '/admin/menu/record-history' },
			{ name: 'Documents', link: '/admin/menu/documents' },
			{ name: 'Application Settings', link: '/admin/menu/application-settings' }
		]
	};
</script>

<section class="grow h-screen overflow-y-auto container mx-auto px-4 py-6">
	<div class="p-6 flex flex-col gap-6">
		<h1 class="text-3xl font-extrabold leading-tight tracking-tighter md:text-4xl">Admin Menu</h1>
	</div>
	<div class="px-6 pb-6 grid grid-cols-6 gap-12">
		{#each Object.entries(adminMenu) as [section, items]}
			<div class="col-span-6 md:col-span-3 lg:col-span-2">
				<p class="text-lg font-semibold">{section}</p>
				<ul class="pt-4 flex flex-col gap-1">
					{#each items as { name, link }}
						<li class="text-blue-500"><a href={link}>{name}</a></li>
					{/each}
				</ul>
			</div>
		{/each}
	</div>
</section>
