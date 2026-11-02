import {
  deleteStudioAssets,
  fetchPublicAsset,
  getStoragePath,
  isStudioAdmin,
  isSupabaseConfigured,
  supabaseRequest,
  uploadStudioAsset
} from './supabase-client.js';

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

export async function getTargets({ includeBlobs = true } = {}) {
  if (!isSupabaseConfigured) {
    return runTransaction(TARGETS_STORE, 'readonly', store => store.getAll());
  }
  const records = await supabaseRequest(
    '/rest/v1/studio_targets?select=id,target_index,title,marker_url,content_url,content_type,width,height,position_x,position_y,position_z,enabled,updated_at&order=target_index.asc'
  );
  return Promise.all(records.map(async record => ({
    ...record,
    ...(includeBlobs ? {
      marker_blob: await fetchPublicAsset(record.marker_url),
      content_blob: await fetchPublicAsset(record.content_url)
    } : {}),
    _marker_url: record.marker_url,
    _content_url: record.content_url
  })));
}

export async function saveTarget(target) {
  if (!isSupabaseConfigured) {
    return runTransaction(TARGETS_STORE, 'readwrite', store => store.put(target));
  }
  if (!await isStudioAdmin()) {
    throw new Error('Akses admin diperlukan untuk menerbitkan karya.');
  }

  const assetVersion = crypto.randomUUID();
  const markerPath = `${target.id}/marker-${assetVersion}`;
  const contentPath = `${target.id}/content-${assetVersion}`;
  const [markerUrl, contentUrl] = await Promise.all([
    uploadStudioAsset(markerPath, target.marker_blob),
    uploadStudioAsset(contentPath, target.content_blob)
  ]);
  const { _marker_url, _content_url, marker_blob, content_blob, ...record } = target;
  await supabaseRequest('/rest/v1/studio_targets?on_conflict=id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({
      ...record,
      marker_url: markerUrl,
      content_url: contentUrl
    })
  });
  const oldPaths = [_marker_url, _content_url]
    .map(url => url ? getStoragePath(url) : null)
    .filter(Boolean);
  await deleteStudioAssets(oldPaths);
}

export async function deleteTarget(id) {
  if (!isSupabaseConfigured) {
    return runTransaction(TARGETS_STORE, 'readwrite', store => store.delete(id));
  }
  if (!await isStudioAdmin()) {
    throw new Error('Akses admin diperlukan untuk menghapus karya.');
  }
  const matches = await supabaseRequest(
    `/rest/v1/studio_targets?id=eq.${encodeURIComponent(id)}&select=marker_url,content_url`
  );
  await supabaseRequest(`/rest/v1/studio_targets?id=eq.${encodeURIComponent(id)}`, {
    method: 'DELETE'
  });
  await deleteStudioAssets(matches.flatMap(record => [record.marker_url, record.content_url])
    .map(getStoragePath)
    .filter(Boolean));
}

export async function getMindFile() {
  if (!isSupabaseConfigured) {
    return runTransaction(SETTINGS_STORE, 'readonly', store => store.get('mind-file'));
  }
  const settings = await supabaseRequest('/rest/v1/studio_settings?id=eq.1&select=target_file_url');
  if (!settings.length) return null;
  return { file: await fetchPublicAsset(settings[0].target_file_url), _url: settings[0].target_file_url };
}

export async function saveMindFile(file) {
  if (!isSupabaseConfigured) {
    return runTransaction(SETTINGS_STORE, 'readwrite', store => store.put({ id: 'mind-file', file }));
  }
  if (!await isStudioAdmin()) {
    throw new Error('Akses admin diperlukan untuk menerbitkan file marker.');
  }
  const existing = await supabaseRequest('/rest/v1/studio_settings?id=eq.1&select=target_file_url');
  const path = `tracking/targets-${crypto.randomUUID()}.mind`;
  const targetFileUrl = await uploadStudioAsset(path, file);
  await supabaseRequest('/rest/v1/studio_settings?on_conflict=id', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify({ id: 1, target_file_url: targetFileUrl, updated_at: new Date().toISOString() })
  });
  await deleteStudioAssets(existing.map(record => getStoragePath(record.target_file_url)).filter(Boolean));
}
