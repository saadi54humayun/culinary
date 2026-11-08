import test from "node:test";
import assert from "node:assert/strict";

// Tiny IndexedDB stub covering operations in storage.js (browser integration still needed).
function installDatabaseStub() {
  const stores = { recipes: new Map(), progress: new Map() };
  globalThis.window = {};
  const local = new Map();
  globalThis.localStorage = { getItem: (key) => local.get(key) ?? null, setItem: (key, value) => local.set(key, value), removeItem: (key) => local.delete(key) };
  globalThis.indexedDB = {
    open() {
      const req = {};
      queueMicrotask(() => {
        req.result = {
          objectStoreNames: { contains: (name) => Boolean(stores[name]) },
          createObjectStore(name) { stores[name] = new Map(); },
          close() {},
          transaction(name) {
            const tx = {};
            tx.objectStore = () => {
              const fake = (fn) => {
                const r = {};
                queueMicrotask(() => {
                  r.result = fn();
                  r.onsuccess?.();
                  queueMicrotask(() => tx.oncomplete?.());
                });
                return r;
              };
              return {
                get: (key) => fake(() => stores[name].get(key)),
                getAll: () => fake(() => [...stores[name].values()]),
                put: (obj) => fake(() => { stores[name].set(obj.key, obj); return obj.key; }),
                delete: (key) => fake(() => stores[name].delete(key))
              };
            };
            return tx;
          }
        };
        req.onupgradeneeded?.();
        req.onsuccess?.();
      });
      return req;
    }
  };
}
installDatabaseStub();
const offline = await import("../src/offline/storage.js");
const recipe = { _id: "r1", title: "Pasta", status: "published", servings: 2, steps: ["Boil"], ingredients: [{ name: "Pasta", quantity: "1", unit: "cup" }] };

test("offline downloaded recipes are scoped to the account", async () => {
  offline.rememberOfflineUser({ id: "u1", username: "one" });
  assert.deepEqual(offline.rememberedOfflineUser(), { id: "u1", username: "one" });
});

test("manual download and saved local cooking progress", async () => {
  await offline.downloadOfflineRecipe("u1", recipe, "version1", null, null);
  assert.equal((await offline.getOfflineRecipe("u1", "r1")).recipe.title, "Pasta");
  assert.equal(await offline.getOfflineRecipe("u2", "r1"), null);
  const initial = await offline.getOfflineProgress("u1", "r1");
  assert.equal(initial.progress.servings, 2);
  await offline.storeOfflineProgress("u1", "r1", "version1", { ...initial.progress, stepIndex: 0, completed: true });
  assert.equal((await offline.getOfflineProgress("u1", "r1")).dirty, true);
  assert.equal((await offline.listOfflineRecipes("u1")).length, 1);
  assert.equal((await offline.listOfflineRecipes("u2")).length, 0);
});

test("pending offline changes sync using an optimistic server revision", async () => {
  const initial = await offline.getOfflineProgress("u1", "r1");
  let sent;
  globalThis.fetch = async (_url, options) => {
    sent = JSON.parse(options.body);
    return { ok: true, status: 200, json: async () => ({ updatedAt: "2026-11-08T01:00:00.000Z" }) };
  };
  assert.equal((await offline.syncOfflineProgress("u1", "r1")).status, "synced");
  assert.equal(sent.recipeVersion, "version1");
  assert.equal(sent.baseUpdatedAt, null);
  const updated = await offline.getOfflineProgress("u1", "r1");
  assert.equal(updated.serverUpdatedAt, "2026-11-08T01:00:00.000Z");
  assert.equal(updated.dirty, false);
  await offline.storeOfflineProgress("u1", "r1", "version1", { ...updated.progress, completed: false });
  globalThis.fetch = async () => ({ ok: false, status: 409 });
  assert.equal((await offline.syncOfflineProgress("u1", "r1")).status, "conflict");
  assert.equal((await offline.getOfflineProgress("u1", "r1")).dirty, true);
});

test("un-downloaded recipes cannot persist progress and deleted recipes vanish", async () => {
  assert.equal(await offline.storeOfflineProgress("u1", "unknown", "v", {}), null);
  await offline.removeOfflineRecipe("u1", "r1");
  assert.equal(await offline.getOfflineRecipe("u1", "r1"), null);
  assert.equal(await offline.getOfflineProgress("u1", "r1"), null);
});
