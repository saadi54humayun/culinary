// Only explicitly downloaded, published recipes and their cooking state are stored locally.
// The offline identity is a convenience for this device, NOT proof of authentication.
const DB_NAME = "culinary-offline-v1";
const IDENTITY_KEY = "culinary:offline-identity";
const IMAGE_CACHE = "culinary-downloaded-recipe-images-v1";

function openDatabase() {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) return reject(new Error("Offline storage isn't supported by this browser."));
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains("recipes")) db.createObjectStore("recipes", { keyPath: "key" });
      if (!db.objectStoreNames.contains("progress")) db.createObjectStore("progress", { keyPath: "key" });
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function withStore(name, mode, callback) {
  const db = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(name, mode);
      const request = callback(tx.objectStore(name));
      tx.oncomplete = () => resolve(request?.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

function keyFor(userId, recipeId) {
  if (!userId || !recipeId) throw new Error("Missing account or recipe ID.");
  return `${String(userId)}:${String(recipeId)}`;
}

export function rememberedOfflineUser() {
  try {
    const user = JSON.parse(localStorage.getItem(IDENTITY_KEY) || "null");
    return user?.id && user?.username ? user : null;
  } catch { return null; }
}

export function rememberOfflineUser(user) {
  if (user?.id || user?._id) {
    const id = String(user.id || user._id);
    localStorage.setItem(IDENTITY_KEY, JSON.stringify({ id, username: user.username, displayName: user.displayName }));
  } else {
    localStorage.removeItem(IDENTITY_KEY);
  }
}

export async function getOfflineRecipe(userId, recipeId) {
  return (await withStore("recipes", "readonly", (store) => store.get(keyFor(userId, recipeId)))) || null;
}

export async function listOfflineRecipes(userId) {
  const entries = await withStore("recipes", "readonly", (store) => store.getAll());
  return entries.filter((entry) => entry.userId === String(userId)).sort((a, b) => b.savedAt.localeCompare(a.savedAt));
}

export function freshOfflineProgress(recipe) {
  return {
    stepIndex: 0,
    checkedIngredients: [],
    servings: Number.isInteger(recipe.servings) && recipe.servings > 0 ? recipe.servings : 1,
    completed: false,
    timer: { stepIndex: null, remainingSeconds: 0, running: false, endsAt: null }
  };
}

export async function getOfflineProgress(userId, recipeId) {
  return (await withStore("progress", "readonly", (store) => store.get(keyFor(userId, recipeId)))) || null;
}

// Retain any unsynchronized edits made while the recipe was previously open.
export async function downloadOfflineRecipe(userId, recipe, serverVersion, initialProgress, serverUpdatedAt = null) {
  if (!recipe || recipe.status === "draft" || !recipe._id || !recipe.steps?.length) {
    throw new Error("Only published recipes with cooking steps can be downloaded.");
  }
  const key = keyFor(userId, recipe._id);
  const existing = await getOfflineProgress(userId, recipe._id);
  const entry = { key, userId: String(userId), recipeId: String(recipe._id), recipe, recipeVersion: serverVersion, savedAt: new Date().toISOString() };
  await withStore("recipes", "readwrite", (store) => store.put(entry));
  if (!existing) {
    await withStore("progress", "readwrite", (store) => store.put({ key, userId: String(userId), recipeId: String(recipe._id), recipeVersion: serverVersion, progress: initialProgress || freshOfflineProgress(recipe), serverUpdatedAt, dirty: false, updatedAt: Date.now() }));
  }

  // Images are optional. Only the user's explicitly downloaded recipe photo is cached.
  // Opaque responses are permitted because Cloudinary or other CDNs may not enable CORS.
  let imageCached = false;
  if (recipe.imageUrl && /^https:\/\//i.test(recipe.imageUrl) && "caches" in window) {
    try {
      const cache = await caches.open(IMAGE_CACHE);
      const response = await fetch(recipe.imageUrl, { mode: "no-cors", credentials: "omit" });
      if (response.ok || response.type === "opaque") {
        await cache.put(recipe.imageUrl, response);
        imageCached = true;
      }
    } catch { /* Recipe content still works without the optional photo. */ }
  }
  return { imageCached };
}

export async function removeOfflineRecipe(userId, recipeId) {
  const stored = await getOfflineRecipe(userId, recipeId);
  if (!stored) return;
  await withStore("recipes", "readwrite", (store) => store.delete(keyFor(userId, recipeId)));
  await withStore("progress", "readwrite", (store) => store.delete(keyFor(userId, recipeId)));
  if (stored.recipe.imageUrl && "caches" in window) {
    const all = await withStore("recipes", "readonly", (store) => store.getAll());
    if (!all.some((entry) => entry.recipe.imageUrl === stored.recipe.imageUrl)) {
      const cache = await caches.open(IMAGE_CACHE);
      await cache.delete(stored.recipe.imageUrl);
    }
  }
}

export async function storeOfflineProgress(userId, recipeId, recipeVersion, progress, dirty = true, serverUpdatedAt = undefined) {
  const entry = await getOfflineRecipe(userId, recipeId);
  if (!entry) return null; // No silent downloading of recipes.
  const updatedAt = Date.now() + Math.random(); // Distinguishes consecutive same-ms edits.
  const previous = await getOfflineProgress(userId, recipeId);
  const record = { key: keyFor(userId, recipeId), userId: String(userId), recipeId: String(recipeId), recipeVersion, progress, dirty,
    serverUpdatedAt: serverUpdatedAt === undefined ? previous?.serverUpdatedAt ?? null : serverUpdatedAt, updatedAt };
  await withStore("progress", "readwrite", (store) => store.put(record));
  return record;
}

async function markSynced(record, serverUpdatedAt) {
  // Read and update within one IndexedDB transaction; preserve any newer edit.
  await withStore("progress", "readwrite", (store) => {
    const request = store.get(record.key);
    request.onsuccess = () => {
      const current = request.result;
      if (current) {
        store.put({ ...current, serverUpdatedAt,
          dirty: current.updatedAt === record.updatedAt ? false : current.dirty });
      }
    };
    return request;
  });
}

export async function syncOfflineProgress(userId, recipeId) {
  const local = await getOfflineProgress(userId, recipeId);
  if (!local?.dirty) return { status: "synced" };
  if (!local.recipeVersion) return { status: "needs-online-reload" };
  const response = await fetch(`/api/recipes/${encodeURIComponent(recipeId)}/cook-progress`, {
    method: "PUT", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ...local.progress, recipeVersion: local.recipeVersion, baseUpdatedAt: local.serverUpdatedAt ?? null })
  });
  if (response.status === 401 || response.status === 403) return { status: "unauthorized" };
  if (response.status === 409) return { status: "conflict" };
  if (!response.ok) throw new Error("Could not synchronize cooking progress.");
  const data = await response.json();
  await markSynced(local, data.updatedAt);
  return { status: "synced" };
}

export async function syncAllOfflineProgress(userId) {
  const records = (await withStore("progress", "readonly", (store) => store.getAll())).filter((entry) => entry.userId === String(userId) && entry.dirty);
  const results = [];
  for (const entry of records) {
    try {
      results.push({ recipeId: entry.recipeId, ...(await syncOfflineProgress(userId, entry.recipeId)) });
    } catch { results.push({ recipeId: entry.recipeId, status: "offline" }); }
  }
  return results;
}

export async function clearOfflineAccount(userId) {
  for (const storeName of ["recipes", "progress"]) {
    const records = await withStore(storeName, "readonly", (store) => store.getAll());
    for (const record of records.filter((entry) => entry.userId === String(userId))) {
      await withStore(storeName, "readwrite", (store) => store.delete(record.key));
    }
  }
  const recipes = await withStore("recipes", "readonly", (store) => store.getAll());
  if (!recipes.length && "caches" in window) await caches.delete(IMAGE_CACHE);
  rememberOfflineUser(null);
}
