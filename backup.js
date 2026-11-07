// Backup and restore. The archive is also useful without the app: photos are ordinary
// JPEGs named by date, and notizen.txt holds every line in plain text.
import * as db from './db.js';
import { ZipWriter, openZip, readFile } from './zip.js';
import { cleanDetails, detailRows } from './birth.js';
import { cleanGift } from './gift.js';

const FORMAT = 'erstes-jahr';
const encoder = new TextEncoder();
const slug = (text) =>
  text.toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'meilenstein';

function plainTextNotes(name, birth, details, entries, milestones, labels) {
  const lines = [`${name}s erstes Jahr, geboren am ${labels.date(birth)}`];
  detailRows(details).forEach(([label, value]) => { if (value) lines.push(`${label}: ${value}`); });
  lines.push('');
  [...entries].sort((a, b) => a.date.localeCompare(b.date)).forEach((entry) => {
    if (entry.text) lines.push(`${labels.date(entry.date)}: ${entry.text}`);
  });
  if (milestones.length) lines.push('', 'Meilensteine', '');
  [...milestones].sort((a, b) => a.date.localeCompare(b.date)).forEach((m) => {
    lines.push(`${labels.date(m.date)}: ${m.title}${m.note ? ` (${m.note})` : ''}`);
  });
  return lines.join('\n');
}

export async function createBackup({ gift, birthDate, birthDetails, labels, onProgress = () => {} }) {
  const [entries, milestones] = await Promise.all([db.allEntries(), db.allMilestones()]);
  const zip = new ZipWriter();
  const total = entries.length + milestones.length;
  let done = 0;

  const addPhoto = async (photoId, base) => {
    if (!photoId) return {};
    const bytes = await db.readPhotoBytes(photoId);
    if (!bytes) throw new Error('missing-photo');
    const photo = `fotos/${base}.jpg`;
    const thumb = `vorschau/${base}.jpg`;
    zip.add(photo, bytes.photo);
    zip.add(thumb, bytes.thumb);
    return { photo, thumb, type: bytes.type };
  };

  const data = { format: FORMAT, version: 1, exportedAt: new Date().toISOString(), gift, birthDate, birthDetails, entries: [], milestones: [] };

  for (const entry of entries) {
    const { photoId, ...rest } = entry;
    data.entries.push({ ...rest, files: await addPhoto(photoId, entry.date) });
    onProgress(++done, total);
  }
  for (const milestone of milestones) {
    const { photoId, ...rest } = milestone;
    const base = `meilenstein-${milestone.date}-${slug(milestone.title)}-${milestone.id.slice(0, 6)}`;
    data.milestones.push({ ...rest, files: await addPhoto(photoId, base) });
    onProgress(++done, total);
  }

  zip.add('daten.json', encoder.encode(JSON.stringify(data)));
  zip.add('notizen.txt', encoder.encode(plainTextNotes(gift.name, birthDate, birthDetails, entries, milestones, labels)));

  const stamp = new Date().toISOString().slice(0, 10);
  const name = `Erstes-Jahr-Sicherung-${stamp}.zip`;
  return new File([zip.finish()], name, { type: 'application/zip' });
}

export class BackupError extends Error {}

export async function restoreBackup(file, { onProgress = () => {} } = {}) {
  let files;
  let data;
  try {
    files = await openZip(file);
    const json = files.get('daten.json');
    if (!json) throw new Error('no-data');
    data = JSON.parse(new TextDecoder().decode(await readFile(file, json)));
    if (data.format !== FORMAT) throw new Error('wrong-format');
  } catch {
    throw new BackupError('Diese Datei ist keine Sicherung von „Erstes Jahr“. Bitte wähle die ZIP-Datei aus, die die App erstellt hat.');
  }

  const added = [];
  const restoreRecords = async (records, total, start) => {
    const out = [];
    let done = start;
    for (const record of records) {
      const { files: paths = {}, ...rest } = record;
      let photoId = null;
      if (paths.photo) {
        const photoInfo = files.get(paths.photo);
        const thumbInfo = files.get(paths.thumb);
        if (!photoInfo || !thumbInfo) throw new BackupError('In der Sicherung fehlen Fotos. Es wurde nichts verändert.');
        photoId = db.uid();
        const [photo, thumb] = [await readFile(file, photoInfo), await readFile(file, thumbInfo)];
        await db.addRawPhoto(photoId, paths.type || 'image/jpeg', photo, thumb);
        added.push(photoId);
      }
      out.push({ ...rest, photoId });
      onProgress(++done, total);
    }
    return out;
  };

  const total = data.entries.length + data.milestones.length;
  try {
    const entries = await restoreRecords(data.entries, total, 0);
    const milestones = await restoreRecords(data.milestones, total, data.entries.length);
    const now = Date.now();
    await db.swapAll(entries, milestones, {
      birthDate: data.birthDate,
      ...(cleanGift(data.gift) ? { gift: cleanGift(data.gift) } : {}),
      // Backups made before the Steckbrief existed leave the current details alone.
      ...(data.birthDetails ? { birthDetails: cleanDetails(data.birthDetails) } : {}),
      lastBackupAt: now,
      lastChangeAt: now,
      firstEntryAt: now,
    });
    return { entries: entries.length, milestones: milestones.length };
  } catch (error) {
    await db.removePhotos(added).catch(() => {});
    if (error instanceof BackupError) throw error;
    if (error?.name === 'QuotaExceededError') {
      throw new BackupError('Auf diesem Gerät ist nicht genug Speicher frei. Es wurde nichts verändert.');
    }
    throw new BackupError('Die Sicherung ist beschädigt oder ließ sich nicht lesen. Es wurde nichts verändert.');
  }
}
