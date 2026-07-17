import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qwmqzaiszdomzexdaqmc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3bXF6YWlzemRvbXpleGRhcW1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgzNDkxMSwiZXhwIjoyMDk1NDEwOTExfQ.0-aavnkjb3e0GJL18IztBy2z9uBwswOLaywkPcz3kgs";

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

const visitCodes = [
  "ST202607170004",
  "ST202607170005",
  "ST202607170006",
  "ST202607170007",
  "ST202607170008",
  "ST202607170009",
  "ST202607170010",
  "ST202607170011",
  "ST202607170012"
];

const { data: visits, error } = await supabase
  .from("offline_store_visits")
  .select("id, visit_code, store_name, promoter, uploader_name, visit_date, created_at, visit_status, analysis_status, offline_visit_images(id, image_path, image_type, file_name, created_at)")
  .in("visit_code", visitCodes)
  .order("visit_code");

if (error) {
  console.error("Error:", error);
  process.exit(1);
}

console.log("\n=== Visit Summary ===");
for (const visit of visits) {
  console.log(`\nVisit Code: ${visit.visit_code}`);
  console.log(`Visit ID: ${visit.id}`);
  console.log(`Store: ${visit.store_name}`);
  console.log(`Promoter: ${visit.promoter || visit.uploader_name}`);
  console.log(`Visit Date: ${visit.visit_date}`);
  console.log(`Created At: ${visit.created_at}`);
  console.log(`Status: ${visit.visit_status} / ${visit.analysis_status || "null"}`);
  console.log(`Image Count: ${visit.offline_visit_images?.length || 0}`);

  if (visit.offline_visit_images?.length > 0) {
    console.log(`\nImages:`);
    for (const img of visit.offline_visit_images) {
      console.log(`  - ${img.file_name || img.image_path.split('/').pop()} (${img.image_type}, created: ${img.created_at})`);
    }
  }
}

// Analysis summary
console.log(`\n=== Analysis Summary ===`);
console.log(`Total visits found: ${visits.length}`);

if (visits.length > 0) {
  const stores = new Set(visits.map(v => v.store_name));
  const promoters = new Set(visits.map(v => v.promoter || v.uploader_name));
  const dates = new Set(visits.map(v => v.visit_date));

  console.log(`Unique stores: ${stores.size} (${[...stores].join(", ")})`);
  console.log(`Unique promoters: ${promoters.size} (${[...promoters].join(", ")})`);
  console.log(`Unique dates: ${dates.size} (${[...dates].join(", ")})`);

  // Check creation time pattern
  const createdTimes = visits.map(v => ({
    code: v.visit_code,
    time: new Date(v.created_at)
  })).sort((a, b) => a.time - b.time);

  console.log(`\n=== Creation Timeline ===`);
  for (let i = 0; i < createdTimes.length; i++) {
    const current = createdTimes[i];
    if (i === 0) {
      console.log(`${current.code}: ${current.time.toISOString()} (first)`);
    } else {
      const prev = createdTimes[i - 1];
      const diffSeconds = Math.round((current.time - prev.time) / 1000);
      console.log(`${current.code}: ${current.time.toISOString()} (+${diffSeconds}s)`);
    }
  }

  const firstTime = createdTimes[0].time;
  const lastTime = createdTimes[createdTimes.length - 1].time;
  const totalSeconds = Math.round((lastTime - firstTime) / 1000);
  console.log(`\nTotal time span: ${totalSeconds} seconds (${Math.floor(totalSeconds / 60)}m ${totalSeconds % 60}s)`);

  // Check if all images have same filenames
  if (visits.length > 1) {
    const allFilenames = visits.map(v =>
      new Set((v.offline_visit_images || []).map(img => img.file_name || img.image_path.split('/').pop()))
    );

    const firstFilenames = allFilenames[0];
    const allSameFilenames = allFilenames.every(set =>
      set.size === firstFilenames.size && [...set].every(name => firstFilenames.has(name))
    );

    console.log(`\n=== Image Comparison ===`);
    console.log(`All visits have same image filenames: ${allSameFilenames ? "YES ⚠️" : "NO"}`);
    console.log(`All visits have same image count: ${visits.every(v => (v.offline_visit_images?.length || 0) === (visits[0].offline_visit_images?.length || 0)) ? "YES" : "NO"}`);

    if (allSameFilenames && stores.size === 1 && promoters.size === 1 && dates.size === 1) {
      console.log(`\n🚨 DUPLICATE SUBMISSION DETECTED`);
      console.log(`Same promoter uploaded the same ${firstFilenames.size} images to the same store ${visits.length} times within ${Math.floor(totalSeconds / 60)} minutes.`);
      console.log(`This is likely a client-side bug causing multiple visit creation.`);
    }
  }
}
