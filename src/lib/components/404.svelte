<script>
	import Button from "./ui/button/button.svelte";

</script>
<div class="w-full min-h-screen flex flex-col gap-4 items-center justify-center py-12 text-center">
    <h1 class="text-6xl md:text-8xl">404</h1>
    <p class="text-lg md:text-xl">Page Not Found</p>
    <p class="text-muted-foreground text-sm">We apologize, the page you were looking for could not be found at this time.</p>
    <Button on:click={() => window.history.back()} class="bg-primary hover:bg-primary/90">Go Back</Button>
</div>
