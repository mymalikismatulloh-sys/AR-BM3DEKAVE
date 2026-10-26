const DATABASE_NAME = 'ar-bm3-dekave-studio';
const DATABASE_VERSION = 1;
const TARGETS_STORE = 'targets';
const SETTINGS_STORE = 'settings';

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(TARGETS_STORE)) {
        database.createObjectStore(TARGETS_STORE, { keyPath: 'id' });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: 'id' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error('Database Studio tidak dapat dibuka.'));
  });
}

async function runTransaction(storeName, mode, action) {
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let request;
    try {
      request = action(store);
    } catch (error) {
      database.close();
      reject(error);
      return;
    }
    transaction.oncomplete = () => {
      database.close();
      resolve(request?.result);
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error || request?.error || new Error('Perubahan Studio gagal disimpan.'));
    };
    transaction.onabort = () => {
      database.close();
      reject(transaction.error || request?.error || new Error('Perubahan Studio dibatalkan.'));
    };
  });
}

export function getTargets() {
  return runTransaction(TARGETS_STORE, 'readonly', store => store.getAll());
}

export function saveTarget(target) {
  return runTransaction(TARGETS_STORE, 'readwrite', store => store.put(target));
}

export function deleteTarget(id) {
  return runTransaction(TARGETS_STORE, 'readwrite', store => store.delete(id));
}

export function getMindFile() {
  return runTransaction(SETTINGS_STORE, 'readonly', store => store.get('mind-file'));
}

export function saveMindFile(file) {
  return runTransaction(SETTINGS_STORE, 'readwrite', store => store.put({ id: 'mind-file', file }));
}
