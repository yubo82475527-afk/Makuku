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
console.log(`Analyzing duplicates in ST202607080056 to ST202607080074`);
console.log(`${"=".repeat(80)}\n`);

async function analyzeRange() {
  const { data: visits, error } = await supabase
    .from("offline_store_visits")
    .select("id, visit_code, store_name, promoter, uploader_name, visit_date, created_at, offline_visit_images(id, file_name)")
    .in("visit_code", visitCodes)
    .order("created_at");

  if (error) {
    console.error("Error:", error);
    process.exit(1);
  }

  // Group by promoter + store
  const groups = new Map();
  for (const visit of visits) {
    const promoter = visit.promoter || visit.uploader_name || "Unknown";
    const key = `${promoter}|${visit.store_name}`;
    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(visit);
  }

  console.log(`Found ${groups.size} unique (promoter, store) combinations:\n`);

  for (const [key, groupVisits] of groups.entries()) {
    const [promoter, store] = key.split('|');

    if (groupVisits.length < 2) continue;

    const firstTime = new Date(groupVisits[0].created_at);
    const lastTime = new Date(groupVisits[groupVisits.length - 1].created_at);
    const timeSpanMinutes = Math.round((lastTime - firstTime) / 1000 / 60 * 10) / 10;

    console.log(`${"─".repeat(80)}`);
    console.log(`👤 ${promoter} @ 🏪 ${store}`);
    console.log(`   ${groupVisits.length} visits in ${timeSpanMinutes} minutes\n`);

    for (const v of groupVisits) {
      const imageCount = (v.offline_visit_images || []).length;
      console.log(`   ${v.visit_code} - ${v.created_at} - ${imageCount} images`);
    }
    console.log();
  }

  // Specific analysis for Ninis Herlina @ Benny Mart Poris
  const ninisVisits = visits.filter(v =>
    (v.promoter === "Ninis Herlina" || v.uploader_name === "Ninis Herlina") &&
    v.store_name === "Benny Mart Poris"
  );

  if (ninisVisits.length > 0) {
    console.log(`${"=".repeat(80)}`);
    console.log(`🔍 Detailed Analysis: Ninis Herlina @ Benny Mart Poris`);
    console.log(`${"=".repeat(80)}\n`);

    console.log(`Total visits: ${ninisVisits.length}`);
    const firstTime = new Date(ninisVisits[0].created_at);
    const lastTime = new Date(ninisVisits[ninisVisits.length - 1].created_at);
    const totalMinutes = Math.round((lastTime - firstTime) / 1000 / 60 * 10) / 10;
    console.log(`Time span: ${totalMinutes} minutes\n`);

    for (const v of ninisVisits) {
      const imageCount = (v.offline_visit_images || []).length;
      const fileNames = (v.offline_visit_images || []).map(img => img.file_name || "unknown").join(", ");
      console.log(`${v.visit_code} - ${imageCount} images`);
      if (imageCount > 0 && imageCount <= 3) {
        console.log(`  Files: ${fileNames}`);
      }
    }

    console.log(`\n💡 Recommendation:`);
    console.log(`   This looks like repeated submission attempts.`);
    console.log(`   Keep: ${ninisVisits[ninisVisits.length - 1].visit_code} (last/most complete)`);
    console.log(`   Delete: ${ninisVisits.slice(0, -1).map(v => v.visit_code).join(", ")}`);
  }
}

analyzeRange().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
