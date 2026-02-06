type IDBValue = unknown;

const DB_NAME = "vkomic";
const DB_VERSION = 1;
const STORE_NAME = "kv";

let dbPromise: Promise<IDBDatabase> | null = null;

const isIndexedDBAvailable = () =>
  typeof indexedDB !== "undefined" && typeof indexedDB.open === "function";

const openDatabase = (): Promise<IDBDatabase> => {
  if (!isIndexedDBAvailable()) {
    return Promise.reject(new Error("IndexedDB not available"));
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onerror = () => {
      reject(request.error ?? new Error("Failed to open IndexedDB"));
    };
  });

  return dbPromise;
};

export const idbGet = async <T = IDBValue>(key: string): Promise<T | null> => {
  if (!isIndexedDBAvailable()) return null;
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);

    request.onsuccess = () => {
      resolve((request.result as T) ?? null);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB get failed"));
    };
  });
};

export const idbSet = async <T = IDBValue>(
  key: string,
  value: T,
): Promise<void> => {
  if (!isIndexedDBAvailable()) return;
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.put(value as IDBValue, key);

    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error ?? new Error("IndexedDB set failed"));
  });
};

export const idbDel = async (key: string): Promise<void> => {
  if (!isIndexedDBAvailable()) return;
  const db = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const request = store.delete(key);

    request.onsuccess = () => resolve();
    request.onerror = () =>
      reject(request.error ?? new Error("IndexedDB delete failed"));
  });
};

export const idbGetByPrefix = async <T = IDBValue>(
  prefix: string,
): Promise<T[]> => {
  if (!isIndexedDBAvailable()) return [];
  const db = await openDatabase();

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const range = IDBKeyRange.bound(prefix, prefix + "\uffff");
    const request = store.getAll(range);

    request.onsuccess = () => {
      resolve((request.result as T[]) ?? []);
    };
    request.onerror = () => {
      reject(request.error ?? new Error("IndexedDB getByPrefix failed"));
    };
  });
};

export const migrateLocalStorageJsonToIdb = async <T = unknown>(
  key: string,
): Promise<T | null> => {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(key);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as T;
    await idbSet(key, parsed);
    localStorage.removeItem(key);
    return parsed;
  } catch {
    return null;
  }
};

