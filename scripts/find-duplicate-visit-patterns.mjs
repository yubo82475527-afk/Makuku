import { createClient } from "@supabase/supabase-js";

const supabaseUrl = "https://qwmqzaiszdomzexdaqmc.supabase.co";
const supabaseKey = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF3bXF6YWlzemRvbXpleGRhcW1jIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3OTgzNDkxMSwiZXhwIjoyMDk1NDEwOTExfQ.0-aavnkjb3e0GJL18IztBy2z9uBwswOLaywkPcz3kgs";

const supabase = createClient(supabaseUrl, supabaseKey);

// Configuration
const DAYS_TO_CHECK = 30; // 检查最近 N 天
const TIME_WINDOW_MINUTES = 15; // 在 N 分钟内提交的算作可疑
const MIN_DUPLICATE_COUNT = 3; // 至少 N 次重复才报告

console.log(`\n${"=".repeat(80)}`);
console.log(`Finding Duplicate Visit Patterns`);
console.log(`Checking last ${DAYS_TO_CHECK} days for visits submitted within ${TIME_WINDOW_MINUTES} minutes`);
console.log(`${"=".repeat(80)}\n`);

async function findDuplicatePatterns() {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - DAYS_TO_CHECK);
  const startDateStr = startDate.toISOString().split('T')[0];

  console.log(`Loading visits since ${startDateStr}...\n`);

  // Fetch all visits with their images
  const { data: visits, error } = await supabase
    .from("offline_store_visits")
    .select(`
      id,
      visit_code,
      store_id,
      store_name,
      promoter,
      uploader_name,
      uploader_user_id,
      visit_date,
      created_at,
      offline_visit_images(id, file_name, image_type, created_at)
    `)
    .gte("created_at", startDate.toISOString())
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching visits:", error);
    process.exit(1);
  }

  console.log(`Loaded ${visits.length} visits. Analyzing patterns...\n`);

  // Group visits by (uploader + store + visit_date)
  const groups = new Map();

  for (const visit of visits) {
    const uploader = visit.uploader_user_id || visit.uploader_name || visit.promoter || "unknown";
    const storeId = visit.store_id || "unknown";
    const visitDate = visit.visit_date || "unknown";
    const key = `${uploader}|${storeId}|${visitDate}`;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key).push(visit);
  }

  console.log(`Found ${groups.size} unique (uploader, store, date) combinations.\n`);

  // Analyze each group for suspicious patterns
  const suspiciousGroups = [];

  for (const [key, groupVisits] of groups.entries()) {
    if (groupVisits.length < MIN_DUPLICATE_COUNT) continue;

    // Sort by created_at
    groupVisits.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

    const firstTime = new Date(groupVisits[0].created_at);
    const lastTime = new Date(groupVisits[groupVisits.length - 1].created_at);
    const timeSpanMinutes = (lastTime - firstTime) / 1000 / 60;

    // Check if all submitted within TIME_WINDOW_MINUTES
    if (timeSpanMinutes > TIME_WINDOW_MINUTES) continue;

    // Check if they have similar image counts
    const imageCounts = groupVisits.map(v => (v.offline_visit_images || []).length);
    const uniqueImageCounts = new Set(imageCounts);

    // If all visits have the same image count (or very similar), it's suspicious
    if (uniqueImageCounts.size <= 2) {
      const [uploader, storeId, visitDate] = key.split('|');
      suspiciousGroups.push({
        uploader,
        storeId,
        visitDate,
        visits: groupVisits,
        timeSpanMinutes: Math.round(timeSpanMinutes * 10) / 10,
        imageCounts,
      });
    }
  }

  if (suspiciousGroups.length === 0) {
    console.log("✓ No suspicious duplicate patterns found.");
    return;
  }

  console.log(`${"=".repeat(80)}`);
  console.log(`Found ${suspiciousGroups.length} suspicious duplicate patterns:\n`);

  let totalSuspiciousVisits = 0;
  let totalSuspiciousImages = 0;

  for (const group of suspiciousGroups) {
    const visits = group.visits;
    const firstVisit = visits[0];
    const imageCount = (firstVisit.offline_visit_images || []).length;

    console.log(`\n${"─".repeat(80)}`);
    console.log(`📍 Store: ${firstVisit.store_name}`);
    console.log(`👤 Promoter: ${firstVisit.promoter || firstVisit.uploader_name || "Unknown"}`);
    console.log(`📅 Visit Date: ${group.visitDate}`);
    console.log(`⏱️  Time Span: ${group.timeSpanMinutes} minutes`);
    console.log(`🔢 Visit Count: ${visits.length} visits`);
    console.log(`📸 Image Count per Visit: ${group.imageCounts.join(", ")}`);
    console.log(`\nVisit Codes and Creation Times:`);

    for (let i = 0; i < visits.length; i++) {
      const v = visits[i];
      const imageCount = (v.offline_visit_images || []).length;
      const timeDiff = i === 0
        ? "(first)"
        : `(+${Math.round((new Date(v.created_at) - new Date(visits[0].created_at)) / 1000)}s)`;

      console.log(`  ${i + 1}. ${v.visit_code} - ${v.created_at} ${timeDiff} - ${imageCount} images`);
      totalSuspiciousVisits++;
      totalSuspiciousImages += imageCount;
    }

    console.log(`\n💡 Recommendation: Keep the LAST visit (${visits[visits.length - 1].visit_code}), delete the rest.`);
  }

  console.log(`\n${"=".repeat(80)}`);
  console.log(`Summary:`);
  console.log(`  Suspicious patterns: ${suspiciousGroups.length}`);
  console.log(`  Total duplicate visits: ${totalSuspiciousVisits}`);
  console.log(`  Total images in duplicates: ${totalSuspiciousImages}`);
  console.log(`${"=".repeat(80)}\n`);

  // Generate cleanup commands
  console.log(`To clean up these duplicates, you can:\n`);
  console.log(`1. Review each group above`);
  console.log(`2. Modify scripts/clean-duplicate-visits.mjs with the visit codes to delete`);
  console.log(`3. Run: node scripts/clean-duplicate-visits.mjs --dry-run`);
  console.log(`4. If looks good: node scripts/clean-duplicate-visits.mjs\n`);

  // Generate visit codes to delete (all except the last one in each group)
  console.log(`Visit codes to potentially DELETE (keeping the newest in each group):\n`);

  const visitCodesToDelete = [];
  for (const group of suspiciousGroups) {
    const visits = group.visits;
    // Keep the last one, delete the rest
    for (let i = 0; i < visits.length - 1; i++) {
      visitCodesToDelete.push(visits[i].visit_code);
    }
  }

  console.log(`const visitCodesToClean = [`);
  for (const code of visitCodesToDelete) {
    console.log(`  "${code}",`);
  }
  console.log(`];\n`);

  console.log(`Total visits to delete: ${visitCodesToDelete.length}`);
  console.log(`Total visits to keep: ${suspiciousGroups.length}`);
}

findDuplicatePatterns().catch(err => {
  console.error("Fatal error:", err);
  process.exit(1);
});
