<script lang="ts">
    import {Button} from "$lib/components/ui/button";
    import {Label} from "$lib/components/ui/label";
    import {Input} from "$lib/components/ui/input";
    import type {PageData} from "./$types";
    import {superForm} from "sveltekit-superforms/client";

    let editing = false;
    export let data: PageData;
    $: user = data.user;
    $: profile = data.profile

    const {form, submitting, enhance} = superForm(data.updateAdminForm, {
        onSubmit: () => {
            console.log("Submitting form...")
            editing = false
        }
    })
    const handleToggleEdit = () => {
        if (editing) {
            form.set({
                firstName: profile.firstName,
                lastName: profile.lastName,
                email: profile.email
            });
        }
        editing = !editing;
    };
</script>

<section class="flex flex-col h-full p-6 space-y-6">
    <!-- Header -->
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
            <h1 class="text-3xl font-bold tracking-tight">Admin Profile</h1>
            <p class="text-muted-foreground">Manage profile details</p>
        </div>
        <div class="flex gap-4 items-center">
            {#if user.id !== profile.id}
                <form action="?/deleteAdminUser" method="POST">
                    <Button type="submit" variant="destructive">
                        Delete User
                    </Button>
            </form>
            {/if}
            <Button on:click={() => handleToggleEdit()} class="bg-primary hover:bg-primary/90">
                {#if editing}
                    Cancel
                {:else}
                    Edit Profile
                {/if}
            </Button>
        </div>
    </div>
    {#if (editing)}
        <form use:enhance method="POST" action="?/updateAdminProfile">
            <div>
                <Label for="name">First Name</Label>
                <Input bind:value={$form.firstName} id="firstName" name="firstName" type="text"
                       class="bg-white max-w-lg"/>
            </div>
            <div>
                <Label for="name">Last Name</Label>
                <Input bind:value={$form.lastName} id="lastName" name="lastName" type="text" class="bg-white max-w-lg"/>
            </div>

            <div>
                <Label for="email">Email</Label>
                <Input bind:value={$form.email} id="email" name="email" type="email" class="bg-white max-w-lg"/>
            </div>
            <Button type="submit" class="bg-primary hover:bg-primary/90 mt-4">
                {#if $submitting}
                    Saving...
                {:else}
                    Save Profile
                {/if}
            </Button>
        </form>
    {:else}
        <div>
            <p class="text-sm font-semibold">First Name</p>
            <p>{profile.firstName}</p>
        </div>
        <div>
            <p class="text-sm font-semibold">Last Name</p>
            <p>{profile.lastName}</p>
        </div>
        <div>
            <p class="text-sm font-semibold">Email</p>
            <p>{profile.email}</p>
        </div>
        <div>
            <p class="text-sm font-semibold">Role</p>
            <p>{profile.role}</p>
        </div>
    {/if}
</section>
