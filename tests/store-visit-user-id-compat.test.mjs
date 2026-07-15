import { readFileSync } from "node:fs";
import test from "node:test";
import assert from "node:assert/strict";
import vm from "node:vm";
import ts from "typescript";

function transpileModule(path) {
  return ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;
}

class QueryBuilder {
  constructor(executor) {
    this.executor = executor;
    this.state = {};
  }

  select(value) {
    this.state.select = value;
    return this;
  }

  eq(column, value) {
    this.state.eq ??= {};
    this.state.eq[column] = value;
    return this;
  }

  in(column, value) {
    this.state.in ??= {};
    this.state.in[column] = value;
    return this;
  }

  is(column, value) {
    this.state.is ??= {};
    this.state.is[column] = value;
    return this;
  }

  order(column, options) {
    this.state.order = { column, options };
    return this;
  }

  single() {
    return Promise.resolve(this.executor(this.state, true));
  }

  then(resolve, reject) {
    return Promise.resolve(this.executor(this.state, false)).then(resolve, reject);
  }
}

function loadRefreshRoute({ requireAppSession, supabase, createStoreVisitAiJob }) {
  const transpiled = transpileModule("src/app/api/store-visit/[id]/refresh/route.ts");
  const testModule = { exports: {} };
  vm.runInNewContext(transpiled, {
    module: testModule,
    exports: testModule.exports,
    Response,
    console,
    require: (id) => {
      if (id === "next/server") return { after: (fn) => fn() };
      if (id === "next/cache") return { revalidatePath: () => {} };
      if (id === "@/lib/auth-session") {
        return {
          isAllowedAdminRole: (role) => role === "admin" || role === "manager",
          requireAppSession,
        };
      }
      if (id === "@/lib/store-visit-image-errors") {
        return {
          isSupportedStoreVisitImageFile: () => true,
          unsupportedStoreVisitImageFormatMessage: () => "unsupported",
        };
      }
      if (id === "@/lib/supabase") return { createSupabaseServiceClient: () => supabase };
      if (id === "@/lib/store-visit-ai-jobs") {
        return {
          createStoreVisitAiJob,
          triggerStoreVisitAiJobRunner: () => {},
        };
      }
      if (id === "@/lib/store-visit-price-candidate-sync") {
        return {
          syncStoreVisitPriceCandidatesFromImages: async () => ({ inserted: 0, deleted: 0, skipped: 0 }),
        };
      }
      throw new Error(`Unexpected require: ${id}`);
    },
  });
  return testModule.exports;
}

function loadAiJobRoute({ requireAppSession, supabase, loadStoreVisitAiJob }) {
  const transpiled = transpileModule("src/app/api/store-visit/ai-jobs/[jobId]/route.ts");
  const testModule = { exports: {} };
  vm.runInNewContext(transpiled, {
    module: testModule,
    exports: testModule.exports,
    Response,
    console,
    require: (id) => {
      if (id === "@/lib/auth-session") {
        return {
          isAllowedAdminRole: (role) => role === "admin" || role === "manager",
          requireAppSession,
        };
      }
      if (id === "@/lib/supabase") return { createSupabaseServiceClient: () => supabase };
      if (id === "@/lib/store-visit-ai-jobs") {
        return {
          loadStoreVisitAiJob,
          summarizeStoreVisitAiJob: (job, items) => ({
            id: job.id,
            visit_id: job.visit_id,
            job_type: job.job_type,
            status: job.status,
            total_count: items.length,
          }),
        };
      }
      throw new Error(`Unexpected require: ${id}`);
    },
  });
  return testModule.exports;
}

test("refresh route falls back to uploader_user_id when offline_store_visits.user_id is missing", async () => {
  const supabase = {
    from(table) {
      if (table === "offline_store_visits") {
        return new QueryBuilder((state, isSingle) => {
          assert.equal(isSingle, true);
          if (state.select === "id,analysis_status,user_id,uploader_user_id") {
            return { data: null, error: { message: "column offline_store_visits.user_id does not exist" } };
          }
          if (state.select === "id,analysis_status,uploader_user_id") {
            return { data: { id: "visit-1", analysis_status: "completed", uploader_user_id: "admin-1" }, error: null };
          }
          throw new Error(`Unexpected visit select: ${state.select}`);
        });
      }
      if (table === "offline_visit_images") {
        return new QueryBuilder((state) => {
          assert.equal(state.eq.visit_id, "visit-1");
          return {
            data: [{ id: "image-1", image_type: "own_shelf", file_name: "a.jpg", content_type: "image/jpeg", deleted_at: null, replaced_by_image_id: null }],
            error: null,
          };
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const route = loadRefreshRoute({
    requireAppSession: async () => ({ session: { id: "admin-1", role: "admin" }, response: null }),
    supabase,
    createStoreVisitAiJob: async () => ({
      conflict: false,
      reused: false,
      job: { id: "job-1" },
      summary: { id: "job-1", status: "queued" },
    }),
  });

  const response = await route.POST(new Request("https://example.com/api/store-visit/visit-1/refresh", {
    method: "POST",
    body: JSON.stringify({ full_visit: true }),
    headers: { "Content-Type": "application/json" },
  }), { params: Promise.resolve({ id: "visit-1" }) });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.queued, true);
  assert.equal(payload.full_visit, true);
});

test("ai job route falls back to uploader_user_id when offline_store_visits.user_id is missing", async () => {
  const supabase = {
    from(table) {
      if (table === "offline_store_visits") {
        return new QueryBuilder((state, isSingle) => {
          assert.equal(isSingle, true);
          if (state.select === "id,user_id,uploader_user_id") {
            return { data: null, error: { message: "column offline_store_visits.user_id does not exist" } };
          }
          if (state.select === "id,uploader_user_id") {
            return { data: { id: "visit-1", uploader_user_id: "user-1" }, error: null };
          }
          throw new Error(`Unexpected job visit select: ${state.select}`);
        });
      }
      throw new Error(`Unexpected table: ${table}`);
    },
  };

  const route = loadAiJobRoute({
    requireAppSession: async () => ({ session: { id: "user-1", role: "field" }, response: null }),
    supabase,
    loadStoreVisitAiJob: async () => ({
      job: {
        id: "job-1",
        visit_id: "visit-1",
        job_type: "full_visit_reanalysis",
        status: "running",
        total_count: 1,
        success_count: 0,
        failed_count: 0,
        retake_required_count: 0,
        remaining_count: 1,
        started_at: null,
        completed_at: null,
      },
      items: [{ id: "item-1", source_image_id: "image-1", position: 0, status: "queued" }],
    }),
  });

  const response = await route.GET(new Request("https://example.com/api/store-visit/ai-jobs/job-1"), {
    params: Promise.resolve({ jobId: "job-1" }),
  });

  assert.equal(response.status, 200);
  const payload = await response.json();
  assert.equal(payload.job.id, "job-1");
  assert.equal(payload.summary.status, "running");
});
