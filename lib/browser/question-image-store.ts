/** Original photos stay on this device. Blob URLs alone cannot survive a reload. */
const DATABASE = "education-question-images-v1";
const STORE = "images";
const writes = new Map<string, Promise<void>>();

function transact<T>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => IDBRequest): Promise<T> {
  return new Promise((resolve, reject) => {
    let db: IDBDatabase | undefined;
    let transaction: IDBTransaction | undefined;
    let settled = false;
    const finish = (error?: Error, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error && transaction) transaction.abort();
      db?.close();
      if (error) reject(error); else resolve(value as T);
    };
    const timer = setTimeout(() => finish(new Error("原图本地存储超时")), 4000);
    try {
      const request = indexedDB.open(DATABASE, 1);
      request.onupgradeneeded = () => request.result.createObjectStore(STORE);
      request.onerror = () => finish(new Error("无法打开原图本地存储"));
      request.onblocked = () => finish(new Error("原图本地存储被其他页面占用"));
      request.onsuccess = () => {
        db = request.result;
        if (settled) { db.close(); return; }
        try {
          transaction = db.transaction(STORE, mode);
          const result = operation(transaction.objectStore(STORE));
          transaction.oncomplete = () => finish(undefined, result.result as T);
          transaction.onabort = () => { transaction = undefined; finish(new Error("原图本地存储未完成")); };
          transaction.onerror = () => { transaction = undefined; finish(new Error("原图本地存储失败")); };
        } catch (error) { finish(error instanceof Error ? error : new Error("原图本地存储不可用")); }
      };
    } catch (error) { finish(error instanceof Error ? error : new Error("原图本地存储不可用")); }
  });
}

export function saveQuestionImage(id: string, blob: Blob): Promise<void> {
  const write = transact("readwrite", store => store.put(blob, id)).then(() => {});
  writes.set(id, write);
  void write.then(() => writes.delete(id), () => writes.delete(id));
  return write;
}

export async function loadQuestionImage(id: string): Promise<Blob | null> {
  const value = await transact<unknown>("readonly", store => store.get(id));
  if (value === undefined) return null;
  if (!(value instanceof Blob)) throw new Error("保存的原图数据已损坏");
  return value;
}

export async function removeQuestionImage(id: string): Promise<void> {
  // Wait for in-flight writes even when a write failed, so reset cannot resurrect an old photo.
  await writes.get(id)?.then(() => undefined, () => undefined);
  await transact("readwrite", store => store.delete(id));
}
