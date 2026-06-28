import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import Module from "node:module";
import test from "node:test";
import ts from "typescript";

function loadDataModule() {
  const source = readFileSync("src/lib/data.ts", "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
  }).outputText;

  const dataModule = new Module("src/lib/data.ts");
  dataModule.filename = "src/lib/data.ts";
  dataModule.paths = Module._nodeModulePaths(process.cwd());

  const originalLoad = Module._load;
  Module._load = function mockedLoad(request, parent, isMain) {
    if (request === "@/lib/demo-data") {
      return {
        demoChannels: [
          { id: "ebbdbd6c-dbbf-4301-b4a7-2ed701d43b55", code: "LKA", name: "LKA", type: "offline" },
        ],
        demoOfflineStores: [],
        demoOfflineStoreVisits: [],
        demoOfflineUploads: [],
        demoBrands: [],
        demoPriceSnapshots: [],
        demoSkuMaster: [],
        demoCompetitorProducts: [],
        demoMaterialMaster: [],
        demoPromoEvents: [],
        demoAiPriceCandidates: [],
        demoOrganizations: [],
        demoAppUsers: [],
      };
    }
    if (request.startsWith("@/")) return {};
    return originalLoad.call(this, request, parent, isMain);
  };

  try {
    dataModule._compile(compiled, "src/lib/data.ts");
  } finally {
    Module._load = originalLoad;
  }

  return dataModule.exports;
}

test("store list merges visit-derived rows into their master store by store id", () => {
  const { mergeOfflineStores } = loadDataModule();
  assert.equal(typeof mergeOfflineStores, "function");

  const masterStore = {
    id: "043a7a0e-24bd-46fc-84e3-9740e2f0cae6",
    name: "GrandLucky PIK @ Central Market",
    city: "Daerah Khusus Ibukota Jakarta",
    province: "Daerah Khusus Ibukota Jakarta",
    city_name: "Daerah Khusus Ibukota Jakarta",
    district: null,
    channel_type: "LKA",
    channel_id: "ebbdbd6c-dbbf-4301-b4a7-2ed701d43b55",
    address: "Jl. Pulau Maju Bersama Jl. Akasia",
    google_place_id: "ChIJO1pM1EMdai4RbKwCDEN2Au0",
    status: "enabled",
    disabled_at: null,
    deleted_at: null,
    created_at: "2026-06-27T01:30:55.216789+00:00",
    created_by: "Phil\uff08Yan Zexue\uff09",
    created_by_name: "Phil\uff08Yan Zexue\uff09",
  };
  const visitDerivedStore = {
    id: "043a7a0e-24bd-46fc-84e3-9740e2f0cae6",
    name: "GrandLucky PIK @ Central Market",
    city: "Daerah Khusus Ibukota Jakarta",
    channel_type: "LKA",
    channel_id: "ebbdbd6c-dbbf-4301-b4a7-2ed701d43b55",
    address: null,
    status: "enabled",
    disabled_at: null,
    deleted_at: null,
    created_at: "2026-06-27T01:32:28.416799+00:00",
  };

  const stores = mergeOfflineStores([masterStore, visitDerivedStore]);

  assert.equal(stores.length, 1);
  assert.equal(stores[0].id, masterStore.id);
  assert.equal(stores[0].created_at, masterStore.created_at);
  assert.equal(stores[0].created_by, masterStore.created_by);
  assert.equal(stores[0].google_place_id, masterStore.google_place_id);
  assert.equal(stores[0].city, "Daerah Khusus Ibukota Jakarta / Daerah Khusus Ibukota Jakarta");
});

test("store list still keeps history-only derived stores without a master id", () => {
  const { mergeOfflineStores } = loadDataModule();
  const stores = mergeOfflineStores([
    {
      id: "visit-store-90d86e6d-c145-43f1-955e-48c7ad487f80",
      name: "History Only Store",
      city: "Jakarta",
      channel_type: "LKA",
      channel_id: null,
      address: null,
      status: "enabled",
      disabled_at: null,
      deleted_at: null,
      created_at: "2026-06-27T01:32:28.416799+00:00",
    },
  ]);

  assert.equal(stores.length, 1);
  assert.equal(stores[0].id, "visit-store-90d86e6d-c145-43f1-955e-48c7ad487f80");
  assert.equal(stores[0].city, "Jakarta");
});
