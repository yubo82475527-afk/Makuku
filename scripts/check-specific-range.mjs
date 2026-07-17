import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qwmqzaiszdomzexdaqmc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3bXF6YWlzemRvbXpleGRhcW1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgzNDkxMSwiZXhwIjoyMDk1NDEwOTExfQ.0-aavnkjb3e0GJL18IztBy2z9uBwswOLaywkPcz3kgs";

const supabase = createClient(supabaseUrl, supabaseKey);

// Generate visit codes from ST202607080056 to ST202607080074
const visitCodes = [];
for (let i = 56; i <= 74; i++) {
  visitCodes.push(`ST202607080${String(i).padStart(3, '0')}`);
}

console.log(`\n${"=".repeat(80)}`);
console.log(`Checking visits from ST202607080056 to ST202607080074`);
console.log(`${"=".repeat(80)}\n`);

async function checkVisits() {
  const { data: visits, error } = await supabase
    .from("offline_store_visits")
    .select("id, visit_code, store_name, promoter, uploader_name, visit_date, created_at, offline_visit_images(id, file_name, image_type, created_at)")
    .in("visit_code", visitCodes)
    .order("visit_code");

  if (error) {
    console.error("Error:", error);
    process.exit(1);
  }

  console.log(`Found ${visits.length} visits:\n`);

  let totalImages = 0;
  for (const visit of visits) {
    const imageCount = (visit.offline_visit_images || []).length;
    totalImages += imageCount;
    console.log(`${visit.visit_code}`);
    console.log(`  Store: ${visit.store_name}`);
    console.log(`  Promoter: ${visit.promoter || visit.uploader_name}`);
    console.log(`  Date: ${visit.visit_date}`);
    console.log(`  Created: ${visit.created_at}`);
    console.log(`  Images: ${imageCount}`);
    console.log();
  }

  console.log(`${"=".repeat(80)}`);
  console.log(`Summary:`);
  console.log(`  Total visits: ${visits.length}`);
  console.log(`  Total images: ${totalImages}`);
  console.log(`${"=".repeat(80)}\n`);
}

checkVisits().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
