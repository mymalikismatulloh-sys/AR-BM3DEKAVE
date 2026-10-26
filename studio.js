import { deleteTarget, getTargets, saveMindFile, saveTarget } from './studio-storage.js';

const listStatus = document.getElementById('list-status');
const formStatus = document.getElementById('form-status');
const mindStatus = document.getElementById('mind-status');
const targetForm = document.getElementById('target-form');
const targetList = document.getElementById('target-list');
const formTitle = document.getElementById('form-title');
const MAX_FILE_SIZE = 50 * 1024 * 1024;
let previewUrls = [];

function setStatus(element, message, type = '') {
  element.textContent = message;
  element.className = `status${type ? ` ${type}` : ''}`;
}

function createId() {
  return crypto.randomUUID();
}

async function loadTargets() {
  setStatus(listStatus, 'Memuat daftar karya dari browser ini...');
  const targets = (await getTargets()).sort((left, right) => left.target_index - right.target_index);
  previewUrls.forEach(url => URL.revokeObjectURL(url));
  previewUrls = [];
  targetList.replaceChildren();

  if (!targets.length) {
    setStatus(listStatus, 'Belum ada karya tersimpan di browser ini.');
    return targets;
  }
  setStatus(listStatus, '');

  targets.forEach(target => {
    const row = document.createElement('article');
    row.className = 'target-row';
    const preview = document.createElement('img');
    preview.src = URL.createObjectURL(target.marker_blob);
    previewUrls.push(preview.src);
    preview.alt = `Marker ${target.title}`;
    const info = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'target-title';
    title.textContent = target.title;
    const meta = document.createElement('div');
    meta.className = 'target-meta';
    meta.textContent = `Index ${target.target_index} · ${target.content_type} · ${target.enabled ? 'Aktif' : 'Nonaktif'}`;
    info.append(title, meta);
    const actions = document.createElement('div');
    actions.className = 'row-actions';
    const editButton = document.createElement('button');
    editButton.type = 'button';
    editButton.textContent = 'Edit';
    editButton.addEventListener('click', () => populateForm(target));
    const deleteButton = document.createElement('button');
    deleteButton.type = 'button';
    deleteButton.className = 'danger';
    deleteButton.textContent = 'Hapus';
    deleteButton.addEventListener('click', () => removeTarget(target));
    actions.append(editButton, deleteButton);
    row.append(preview, info, actions);
    targetList.append(row);
  });
  return targets;
}

function populateForm(target) {
  document.getElementById('record-id').value = target.id;
  document.getElementById('title').value = target.title;
  document.getElementById('target-index').value = target.target_index;
  document.getElementById('content-type').value = target.content_type;
  document.getElementById('width').value = target.width;
  document.getElementById('height').value = target.height;
  document.getElementById('position-x').value = target.position_x;
  document.getElementById('position-y').value = target.position_y;
  document.getElementById('position-z').value = target.position_z;
  document.getElementById('enabled').value = String(target.enabled);
  formTitle.textContent = `Edit: ${target.title}`;
  setStatus(formStatus, 'Pilih file baru hanya jika ingin mengganti file yang tersimpan.');
  targetForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function resetForm() {
  targetForm.reset();
  document.getElementById('record-id').value = '';
  document.getElementById('target-index').value = '';
  document.getElementById('width').value = '1';
  document.getElementById('height').value = '1';
  document.getElementById('position-x').value = '0';
  document.getElementById('position-y').value = '0';
  document.getElementById('position-z').value = '0.65';
  document.getElementById('enabled').value = 'true';
  formTitle.textContent = 'Tambah karya AR';
  setStatus(formStatus, '');
}

async function removeTarget(target) {
  if (!window.confirm(`Hapus karya "${target.title}" dari katalog browser ini?`)) return;
  try {
    await deleteTarget(target.id);
    if (document.getElementById('record-id').value === target.id) resetForm();
    await loadTargets();
  } catch (error) {
    setStatus(listStatus, error.message, 'error');
  }
}

async function validateFile(file, description) {
  if (file && file.size > MAX_FILE_SIZE) {
    throw new Error(`Ukuran ${description} maksimal 50 MB.`);
  }
}

targetForm.addEventListener('submit', async event => {
  event.preventDefault();
  const submitButton = targetForm.querySelector('button[type="submit"]');
  submitButton.disabled = true;
  setStatus(formStatus, 'Menyimpan di browser ini...');
  try {
    const id = document.getElementById('record-id').value;
    const existingTargets = await getTargets();
    const existing = existingTargets.find(target => target.id === id) || null;
    const markerFile = document.getElementById('marker-file').files[0];
    const contentFile = document.getElementById('content-file').files[0];
    const contentType = document.getElementById('content-type').value;
    const targetIndex = Number(document.getElementById('target-index').value);

    if (!existing && (!markerFile || !contentFile)) {
      throw new Error('Karya baru wajib memiliki gambar marker dan konten AR.');
    }
    if (existing && !contentFile && existing.content_type !== contentType) {
      throw new Error('Unggah konten baru jika jenis kontennya berubah.');
    }
    if (markerFile && !markerFile.type.startsWith('image/')) {
      throw new Error('File marker harus berupa gambar.');
    }
    if (contentFile && !contentFile.type.startsWith(`${contentType}/`)) {
      throw new Error(`Pilih file ${contentType === 'image' ? 'gambar' : 'video'} untuk jenis konten ini.`);
    }
    await validateFile(markerFile, 'marker');
    await validateFile(contentFile, 'konten AR');
    if (existingTargets.some(target => target.id !== id && target.target_index === targetIndex)) {
      throw new Error(`Index marker ${targetIndex} sudah digunakan.`);
    }

    const target = {
      id: id || createId(),
      title: document.getElementById('title').value.trim(),
      target_index: targetIndex,
      content_type: contentType,
      marker_blob: markerFile || existing?.marker_blob,
      content_blob: contentFile || existing?.content_blob,
      width: Number(document.getElementById('width').value),
      height: Number(document.getElementById('height').value),
      position_x: Number(document.getElementById('position-x').value),
      position_y: Number(document.getElementById('position-y').value),
      position_z: Number(document.getElementById('position-z').value),
      enabled: document.getElementById('enabled').value === 'true',
      updated_at: new Date().toISOString()
    };
    if (!target.marker_blob || !target.content_blob) {
      throw new Error('File marker dan konten AR wajib tersedia.');
    }
    await saveTarget(target);
    resetForm();
    await loadTargets();
    setStatus(formStatus, 'Tersimpan di browser ini. Perubahan belum dipublikasikan ke pengunjung lain.', 'success');
  } catch (error) {
    setStatus(formStatus, error.message, 'error');
  } finally {
    submitButton.disabled = false;
  }
});

document.getElementById('new-target-button').addEventListener('click', async () => {
  resetForm();
  try {
    const targets = await getTargets();
    const nextIndex = targets.reduce((maximum, target) => Math.max(maximum, target.target_index), -1) + 1;
    document.getElementById('target-index').value = String(nextIndex);
    document.getElementById('title').focus();
  } catch (error) {
    setStatus(listStatus, error.message, 'error');
  }
});
document.getElementById('cancel-edit-button').addEventListener('click', resetForm);

document.getElementById('mind-form').addEventListener('submit', async event => {
  event.preventDefault();
  const file = document.getElementById('mind-file').files[0];
  if (!file || !file.name.toLowerCase().endsWith('.mind')) {
    setStatus(mindStatus, 'Pilih file dengan ekstensi .mind.', 'error');
    return;
  }
  const button = event.currentTarget.querySelector('button[type="submit"]');
  button.disabled = true;
  setStatus(mindStatus, 'Menyimpan file tracking di browser ini...');
  try {
    await validateFile(file, 'tracking');
    await saveMindFile(file);
    event.currentTarget.reset();
    setStatus(mindStatus, 'File tracking tersimpan di browser ini, belum dipublikasikan.', 'success');
  } catch (error) {
    setStatus(mindStatus, error.message, 'error');
  } finally {
    button.disabled = false;
  }
});

loadTargets().catch(error => setStatus(listStatus, error.message, 'error'));
