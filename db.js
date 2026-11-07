// On-device storage. Photos are kept as raw bytes in their own stores, separate from
// the text records: that keeps lists fast and avoids old WebKit bugs with stored Blobs.
const NAME = 'first-year-keepsake';
let opening;

function open() {
  opening ??= new Promise((resolve, reject) => {
    const request = indexedDB.open(NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      db.createObjectStore('entries', { keyPath: 'date' });
      db.createObjectStore('milestones', { keyPath: 'id' });
      db.createObjectStore('photos', { keyPath: 'id' });
      db.createObjectStore('thumbs', { keyPath: 'id' });
      db.createObjectStore('settings', { keyPath: 'k' });
    };
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
    request.onerror = () => reject(request.error);
  });
  return opening;
}

const req = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

// Runs work in one transaction and resolves only once the browser has committed it.
async function run(stores, mode, work) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    let result;
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
    Promise.resolve(work(tx)).then(
      (value) => { result = value; },
      (error) => {
        try { tx.abort(); } catch { /* already finished */ }
        reject(error);
      },
    );
  });
}

export function uid() {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

const asRecords = async (id, photo) => ({
  photo: { id, type: photo.photo.type, data: await photo.photo.arrayBuffer() },
  thumb: { id, type: photo.thumb.type, data: await photo.thumb.arrayBuffer() },
});

function putPhoto(tx, records) {
  tx.objectStore('photos').put(records.photo);
  tx.objectStore('thumbs').put(records.thumb);
}

function dropPhoto(tx, id) {
  if (!id) return;
  tx.objectStore('photos').delete(id);
  tx.objectStore('thumbs').delete(id);
}

function noteChange(tx) {
  tx.objectStore('settings').put({ k: 'lastChangeAt', v: Date.now() });
}

export async function getSetting(key, fallback = null) {
  const record = await run('settings', 'readonly', (tx) => req(tx.objectStore('settings').get(key)));
  return record ? record.v : fallback;
}

export const setSetting = (key, value) =>
  run('settings', 'readwrite', (tx) => req(tx.objectStore('settings').put({ k: key, v: value })));

export const allEntries = () => run('entries', 'readonly', (tx) => req(tx.objectStore('entries').getAll()));
export const allMilestones = () => run('milestones', 'readonly', (tx) => req(tx.objectStore('milestones').getAll()));

// patch.text and patch.photo are each optional. Removes the record if nothing is left.
export async function saveEntry(date, patch) {
  const newId = patch.photo ? uid() : null;
  const records = patch.photo ? await asRecords(newId, patch.photo) : null;
  return run(['entries', 'photos', 'thumbs', 'settings'], 'readwrite', async (tx) => {
    const store = tx.objectStore('entries');
    const current = (await req(store.get(date))) ?? { date, text: '', photoId: null };
    const next = { ...current, updatedAt: Date.now() };
    if (patch.text !== undefined) next.text = patch.text;
    if (records) {
      dropPhoto(tx, current.photoId);
      putPhoto(tx, records);
      Object.assign(next, { photoId: newId, w: patch.photo.w, h: patch.photo.h });
    }
    noteChange(tx);
    const settings = tx.objectStore('settings');
    if (!(await req(settings.get('firstEntryAt')))) settings.put({ k: 'firstEntryAt', v: Date.now() });
    if (!next.text && !next.photoId) {
      store.delete(date);
      return null;
    }
    store.put(next);
    return next;
  });
}

export const deleteEntry = (date) =>
  run(['entries', 'photos', 'thumbs', 'settings'], 'readwrite', async (tx) => {
    const store = tx.objectStore('entries');
    const current = await req(store.get(date));
    if (!current) return;
    dropPhoto(tx, current.photoId);
    store.delete(date);
    noteChange(tx);
  });

export async function saveMilestone(milestone, photo) {
  const newId = photo ? uid() : null;
  const records = photo ? await asRecords(newId, photo) : null;
  return run(['milestones', 'photos', 'thumbs', 'settings'], 'readwrite', async (tx) => {
    const store = tx.objectStore('milestones');
    const current = await req(store.get(milestone.id));
    const next = { ...milestone, photoId: current?.photoId ?? null, updatedAt: Date.now() };
    if (records) {
      dropPhoto(tx, current?.photoId);
      putPhoto(tx, records);
      Object.assign(next, { photoId: newId, w: photo.w, h: photo.h });
    }
    store.put(next);
    noteChange(tx);
    return next;
  });
}

export const deleteMilestone = (id) =>
  run(['milestones', 'photos', 'thumbs', 'settings'], 'readwrite', async (tx) => {
    const store = tx.objectStore('milestones');
    const current = await req(store.get(id));
    if (!current) return;
    dropPhoto(tx, current.photoId);
    store.delete(id);
    noteChange(tx);
  });

async function readImage(storeName, id) {
  if (!id) return null;
  const record = await run(storeName, 'readonly', (tx) => req(tx.objectStore(storeName).get(id)));
  return record ? new Blob([record.data], { type: record.type }) : null;
}

export const getPhoto = (id) => readImage('photos', id);
export const getThumb = (id) => readImage('thumbs', id);

// Raw bytes for the backup.
export async function readPhotoBytes(id) {
  const [photo, thumb] = await run(['photos', 'thumbs'], 'readonly', (tx) =>
    Promise.all([req(tx.objectStore('photos').get(id)), req(tx.objectStore('thumbs').get(id))]));
  if (!photo || !thumb) return null;
  return { type: photo.type, photo: new Uint8Array(photo.data), thumb: new Uint8Array(thumb.data) };
}

// Restore, step 1: add one restored photo next to the existing ones.
export const addRawPhoto = (id, type, photoBytes, thumbBytes) =>
  run(['photos', 'thumbs'], 'readwrite', (tx) => {
    tx.objectStore('photos').put({ id, type, data: photoBytes.slice().buffer });
    tx.objectStore('thumbs').put({ id, type, data: thumbBytes.slice().buffer });
  });

export const removePhotos = (ids) =>
  run(['photos', 'thumbs'], 'readwrite', (tx) => ids.forEach((id) => dropPhoto(tx, id)));

// Restore, step 2: swap to the restored records in a single transaction, so a failure
// part-way leaves the existing keepsake exactly as it was.
export const swapAll = (entries, milestones, settings) =>
  run(['entries', 'milestones', 'photos', 'thumbs', 'settings'], 'readwrite', async (tx) => {
    const keep = new Set([...entries, ...milestones].map((r) => r.photoId).filter(Boolean));
    const photoIds = await req(tx.objectStore('photos').getAllKeys());
    photoIds.filter((id) => !keep.has(id)).forEach((id) => dropPhoto(tx, id));
    const entryStore = tx.objectStore('entries');
    const milestoneStore = tx.objectStore('milestones');
    entryStore.clear();
    milestoneStore.clear();
    entries.forEach((record) => entryStore.put(record));
    milestones.forEach((record) => milestoneStore.put(record));
    const settingStore = tx.objectStore('settings');
    Object.entries(settings).forEach(([k, v]) => settingStore.put({ k, v }));
  });

export const clearAll = () =>
  run(['entries', 'milestones', 'photos', 'thumbs', 'settings'], 'readwrite', (tx) => {
    ['entries', 'milestones', 'photos', 'thumbs'].forEach((s) => tx.objectStore(s).clear());
    ['firstEntryAt', 'lastChangeAt', 'lastBackupAt', 'backupSnoozedUntil', 'birthDetails'].forEach((k) =>
      tx.objectStore('settings').delete(k));
  });
