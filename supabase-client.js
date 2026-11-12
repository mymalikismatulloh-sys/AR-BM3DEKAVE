import { isSupabaseConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './supabase-config.js';

export { isSupabaseConfigured };

const SESSION_KEY = 'ar-bm3-dekave-supabase-session';

function getStoredSession() {
  const saved = localStorage.getItem(SESSION_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved);
  } catch (error) {
    localStorage.removeItem(SESSION_KEY);
    console.error('Sesi Supabase tersimpan tidak valid:', error);
    return null;
  }
}

function saveSession(session) {
  if (session?.access_token && session?.refresh_token) {
    localStorage.setItem(SESSION_KEY, JSON.stringify({
      ...session,
      expires_at: session.expires_at || Math.floor(Date.now() / 1000) + session.expires_in
    }));
    return;
  }
  localStorage.removeItem(SESSION_KEY);
}

async function request(path, options = {}, accessToken = '') {
  if (!isSupabaseConfigured) {
    throw new Error('Supabase belum dikonfigurasi. Isi URL proyek dan anon key terlebih dahulu.');
  }
  const response = await fetch(`${SUPABASE_URL}${path}`, {
    ...options,
    headers: {
      apikey: SUPABASE_ANON_KEY,
      ...(accessToken ? { Authorization: 'Bearer ' + accessToken } : {}),
      ...options.headers
    }
  });
  if (!response.ok) {
    const body = await response.text();
    let message = body;
    try {
      const details = JSON.parse(body);
      message = details.msg || details.message || details.error_description || details.error || body;
    } catch (parseError) {
      message = body;
    }
    throw new Error(`Supabase (${response.status}): ${message || response.statusText}`);
  }
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  return contentType.includes('application/json') ? response.json() : response;
}

async function getValidSession() {
  const session = getStoredSession();
  if (!session) return null;
  if (session.expires_at > Math.floor(Date.now() / 1000) + 30) return session;

  try {
    const refreshed = await request('/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: session.refresh_token })
    });
    saveSession(refreshed);
    return getStoredSession();
  } catch (error) {
    saveSession(null);
    console.warn('Sesi admin berakhir; silakan masuk kembali.', error);
    return null;
  }
}

export async function signInAdmin(email, password) {
  const session = await request('/auth/v1/token?grant_type=password', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password })
  });
  saveSession(session);
  return session.user;
}

export async function signOutAdmin() {
  const session = await getValidSession();
  try {
    if (session) {
      await request('/auth/v1/logout', { method: 'POST' }, session.access_token);
    }
  } finally {
    saveSession(null);
  }
}

export async function isStudioAdmin() {
  const session = await getValidSession();
  if (!session?.user?.id) return false;
  const admins = await request(
    `/rest/v1/studio_admins?user_id=eq.${encodeURIComponent(session.user.id)}&select=user_id`,
    {},
    session.access_token
  );
  return admins.length > 0;
}

export async function supabaseRequest(path, options = {}) {
  const session = await getValidSession();
  return request(path, options, session?.access_token || '');
}

function encodeStoragePath(path) {
  return path.split('/').map(encodeURIComponent).join('/');
}

export function getPublicStorageUrl(path) {
  return `${SUPABASE_URL}/storage/v1/object/public/studio-assets/${encodeStoragePath(path)}`;
}

export async function uploadStudioAsset(path, file) {
  const session = await getValidSession();
  if (!session) throw new Error('Sesi admin tidak ditemukan. Silakan masuk kembali.');
  await request(`/storage/v1/object/studio-assets/${encodeStoragePath(path)}`, {
    method: 'POST',
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'x-upsert': 'true'
    },
    body: file
  }, session.access_token);
  return getPublicStorageUrl(path);
}

export async function deleteStudioAssets(paths) {
  if (!paths.length) return;
  const session = await getValidSession();
  if (!session) throw new Error('Sesi admin tidak ditemukan. Silakan masuk kembali.');
  await request('/storage/v1/object/studio-assets', {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prefixes: paths })
  }, session.access_token);
}

export async function fetchPublicAsset(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Aset publik gagal dimuat (${response.status}): ${url}`);
  }
  return response.blob();
}

export function getStoragePath(url) {
  const marker = '/storage/v1/object/public/studio-assets/';
  const index = url.indexOf(marker);
  if (index < 0) return null;
  return url.slice(index + marker.length).split('/').map(segment => decodeURIComponent(segment)).join('/');
}
