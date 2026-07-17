import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qwmqzaiszdomzexdaqmc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3bXF6YWlzemRvbXpleGRhcW1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgzNDkxMSwiZXhwIjoyMDk1NDEwOTExfQ.0-aavnkjb3e0GJL18IztBy2z9uBwswOLaywkPcz3kgs";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase credentials");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration: which visits to delete (keep the newest one)
const visitCodesToClean = [
  "ST202607080056",
  "ST202607080058",
  "ST202607080059",
  "ST202607080060",
  "ST202607080061",
  "ST202607080063",
  "ST202607080073",
];

const dryRun = process.argv.includes("--dry-run");

console.log(`\n${"=".repeat(60)}`);
console.log(`Clean Duplicate Visits`);
console.log(`Mode: ${dryRun ? "DRY RUN (no changes)" : "LIVE (will delete)"}`);
console.log(`${"=".repeat(60)}\n`);

if (!dryRun) {
  console.log("⚠️  WARNING: This will permanently delete visits and their images!");
  console.log("⚠️  Run with --dry-run flag first to preview changes.\n");
}

async function cleanDuplicateVisits() {
  // Fetch visits to delete
  const { data: visits, error } = await supabase
    .from("offline_store_visits")
    .select("id, visit_code, store_name, promoter, uploader_name, visit_date, created_at, offline_visit_images(id, image_path)")
    .in("visit_code", visitCodesToClean)
    .order("created_at");

  if (error) {
    console.error("Error fetching visits:", error);
    process.exit(1);
  }

  if (!visits || visits.length === 0) {
    console.log("No visits found to delete.");
    return;
  }

  console.log(`Found ${visits.length} visits to delete:\n`);

  let totalImageCount = 0;
  for (const visit of visits) {
    const imageCount = visit.offline_visit_images?.length || 0;
    totalImageCount += imageCount;
    console.log(`  - ${visit.visit_code} (${visit.store_name}, ${visit.created_at})`);
    console.log(`    Visit ID: ${visit.id}`);
    console.log(`    Images: ${imageCount}`);
  }

  console.log(`\nTotal: ${visits.length} visits, ${totalImageCount} images`);

  if (dryRun) {
    console.log("\n✓ DRY RUN complete. No changes made.");
    console.log("Run without --dry-run to actually delete these visits.");
    return;
  }

  console.log("\n🗑️  Starting deletion...\n");

  let deletedVisits = 0;
  let deletedImages = 0;
  let errors = [];

  for (const visit of visits) {
    try {
      // Delete visit images first
      const imageIds = (visit.offline_visit_images || []).map(img => img.id);
      if (imageIds.length > 0) {
        const { error: imageError } = await supabase
          .from("offline_visit_images")
          .delete()
          .in("id", imageIds);

        if (imageError) {
          errors.push(`Failed to delete images for ${visit.visit_code}: ${imageError.message}`);
          continue;
        }
        deletedImages += imageIds.length;
      }

      // Delete visit
      const { error: visitError } = await supabase
        .from("offline_store_visits")
        .delete()
        .eq("id", visit.id);

      if (visitError) {
        errors.push(`Failed to delete visit ${visit.visit_code}: ${visitError.message}`);
        continue;
      }

      deletedVisits++;
      console.log(`  ✓ Deleted ${visit.visit_code} (${imageIds.length} images)`);
    } catch (err) {
      errors.push(`Unexpected error for ${visit.visit_code}: ${err.message}`);
    }
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log(`Summary:`);
  console.log(`  Deleted visits: ${deletedVisits}/${visits.length}`);
  console.log(`  Deleted images: ${deletedImages}/${totalImageCount}`);
  if (errors.length > 0) {
    console.log(`  Errors: ${errors.length}`);
    console.log(`\nErrors:`);
    errors.forEach(err => console.log(`  - ${err}`));
  } else {
    console.log(`  ✓ All deletions completed successfully`);
  }
  console.log(`${"=".repeat(60)}\n`);
}

cleanDuplicateVisits().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
