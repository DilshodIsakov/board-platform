/**
 * CLEANUP STORAGE: Удаление всех файлов из Supabase Storage
 *
 * Запуск:
 *   npx tsx supabase/cleanup_storage.ts
 *
 * Требует: SUPABASE_SERVICE_ROLE_KEY в .env или переменной окружения
 * (НЕ anon key, а service_role key из Supabase Dashboard → Settings → API)
 */

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || "";
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("ERROR: Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY environment variables.");
  console.error("You can find the service_role key in Supabase Dashboard → Settings → API → service_role");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const BUCKETS = ["documents", "board-task-files", "chat-attachments", "briefs"];

async function emptyBucket(bucket: string) {
  console.log(`\nCleaning bucket: ${bucket}`);

  // List all files (Supabase returns max 1000 per call)
  let allFiles: string[] = [];
  let offset = 0;
  const limit = 1000;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list("", { limit, offset, sortBy: { column: "name", order: "asc" } });

    if (error) {
      console.error(`  Error listing ${bucket}:`, error.message);
      break;
    }
    if (!data || data.length === 0) break;

    // Recursively list folders
    for (const item of data) {
      if (item.id === null) {
        // It's a folder — list its contents
        const folderFiles = await listFolder(bucket, item.name);
        allFiles.push(...folderFiles);
      } else {
        allFiles.push(item.name);
      }
    }

    if (data.length < limit) break;
    offset += limit;
  }

  if (allFiles.length === 0) {
    console.log(`  Already empty.`);
    return;
  }

  console.log(`  Found ${allFiles.length} files. Deleting...`);

  // Delete in batches of 100
  for (let i = 0; i < allFiles.length; i += 100) {
    const batch = allFiles.slice(i, i + 100);
    const { error } = await supabase.storage.from(bucket).remove(batch);
    if (error) {
      console.error(`  Error deleting batch:`, error.message);
    } else {
      console.log(`  Deleted ${Math.min(i + 100, allFiles.length)}/${allFiles.length}`);
    }
  }
}

async function listFolder(bucket: string, prefix: string): Promise<string[]> {
  const files: string[] = [];
  const { data, error } = await supabase.storage
    .from(bucket)
    .list(prefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });

  if (error || !data) return files;

  for (const item of data) {
    const path = `${prefix}/${item.name}`;
    if (item.id === null) {
      const subFiles = await listFolder(bucket, path);
      files.push(...subFiles);
    } else {
      files.push(path);
    }
  }
  return files;
}

async function main() {
  console.log("=== Supabase Storage Cleanup ===");
  console.log(`URL: ${SUPABASE_URL}`);

  for (const bucket of BUCKETS) {
    await emptyBucket(bucket);
  }

  console.log("\n=== Storage cleanup complete ===");
}

main().catch(console.error);
