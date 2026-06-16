<script lang="ts">
  import * as Card from "$lib/components/ui/card";
  import { Button } from "$lib/components/ui/button";
  import { FileClock, FileText, Plus } from "lucide-svelte";
</script>

<Card.Root class="w-full flex flex-col items-center p-12 border-dashed">
  <div class="flex flex-col items-center gap-4 text-center">
    <div class="rounded-full bg-muted p-4">
      <FileClock class="h-8 w-8 text-muted-foreground" />
    </div>
    <Card.Title class="text-2xl">No timesheets yet</Card.Title>
    <Card.Description class="max-w-[420px] text-center text-muted-foreground">
        You haven't received any timesheet submissions yet. When requisitions are submitted, timesheets will be submitted by candidates and will appear here.
    </Card.Description>
    <!-- <Button class="mt-4 bg-primary hover:bg-primary/90" size="lg">
      <Plus class="mr-2 h-4 w-4" />
      Create Timesheet
    </Button> -->
  </div>
</Card.Root>
