import * as D from './dates.js';
import * as db from './db.js';
import { processPhoto } from './image.js';
import { createBackup, restoreBackup, BackupError } from './backup.js';
import { ANIMALS, POLAR_FOX, faceSvg } from './animals.js';
import * as B from './birth.js';
import { unseal, cleanGift, WrongCode } from './gift.js';
import * as L from './lock.js';

const state = {
  tab: 'heute',
  gift: null,
  birth: null,
  details: B.cleanDetails({}),
  today: D.today(),
  entries: new Map(),
  milestones: [],
  installEvent: null,
};
const app = document.getElementById('app');
let NAME = '';
const THIRTY_DAYS = 30 * 86400000;

const MILESTONES = [
  'Erstes Lächeln', 'Erstes Lachen', 'Zum ersten Mal gebadet', 'Erster Spaziergang',
  'Köpfchen gehoben', 'Zum ersten Mal gedreht', 'Erstes Greifen', 'Erster Brei',
  'Erster Zahn', 'Allein gesessen', 'Erstes Krabbeln', 'Zum ersten Mal hochgezogen',
  'Erste Schritte', 'Erstes Wort', 'Ganze Nacht durchgeschlafen',
];

const prompts = () => [
  'Was möchtest du von heute nicht vergessen?',
  'Was hat dich heute zum Lächeln gebracht?',
  `Wie sah ${NAME} heute aus?`,
  'Welches kleine Geräusch war neu?',
  'Wer war heute zu Besuch?',
  'Wie war die Nacht?',
  'Was war heute anders als gestern?',
  'Was passt heute in einen Satz?',
];

const ICONS = {
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v2.4M12 18.8v2.4M2.8 12h2.4M18.8 12h2.4M5.5 5.5l1.7 1.7M16.8 16.8l1.7 1.7M5.5 18.5l1.7-1.7M16.8 7.2l1.7-1.7"/></svg>',
  close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  camera: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" aria-hidden="true"><path d="M4 8h3.5L9 5.5h6L16.5 8H20a1 1 0 0 1 1 1v9.5a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.2" r="3.6"/></svg>',
  pause: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1"/><rect x="13.5" y="5" width="4" height="14" rx="1"/></svg>',
  play: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5.5v13a.6.6 0 0 0 .9.5l10.3-6.5a.6.6 0 0 0 0-1L8.900 5a.6.6 0 0 0-.9.5z"/></svg>',
  paw: '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><ellipse cx="5.500" cy="11" rx="2.300" ry="3"/><ellipse cx="9.800" cy="6.500" rx="2.300" ry="3.200"/><ellipse cx="14.200" cy="6.500" rx="2.300" ry="3.200"/><ellipse cx="18.500" cy="11" rx="2.300" ry="3"/><path d="M12 11.500c-3 0-6 3.300-6 6 0 2 1.500 3 3.200 3 1.100 0 1.900-.5 2.800-.5s1.700.5 2.800.5c1.700 0 3.200-1 3.200-3 0-2.700-3-6-6-6z"/></svg>',
};

// ---------- small helpers ----------

function el(tag, props, ...kids) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props ?? {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
    else if (key === 'html') node.innerHTML = value; // only ever our own static icons
    else if (key in node) node[key] = value;
    else node.setAttribute(key, value);
  }
  for (const kid of kids.flat()) {
    if (kid === null || kid === undefined || kid === false) continue;
    node.append(kid);
  }
  return node;
}

const iconButton = (icon, label, onclick) =>
  el('button', { class: 'icon-btn', type: 'button', 'aria-label': label, html: ICONS[icon], onclick });
const face = (animal, size = 'm') => el('span', { class: `face face-${size}`, html: faceSvg(animal) });
const currentMonth = () => D.monthOfLife(state.birth, state.today);
const parade = () => el('div', { class: 'parade' }, ANIMALS.map((animal) => face(animal, 's')));

function isStandalone() {
  return matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
}
function isIOS() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

const dayLabel = (date) => `Tag ${D.dayNumber(state.birth, date)}`;
const latestDay = () => {
  const last = D.lastDayOfYear(state.birth);
  return state.today < last ? state.today : last;
};
const yearIsOver = () => state.today >= D.firstBirthday(state.birth);

function storageMessage(error) {
  if (error?.name === 'QuotaExceededError') return 'Der Speicher auf diesem Gerät ist voll. Das wurde nicht gespeichert.';
  return 'Das Speichern hat nicht geklappt. Bitte versuche es noch einmal.';
}

let persistAsked = false;
function askForPersistence() {
  if (persistAsked) return;
  persistAsked = true;
  navigator.storage?.persist?.().catch(() => {});
}

async function reload() {
  const [entries, milestones] = await Promise.all([db.allEntries(), db.allMilestones()]);
  state.entries = new Map(entries.map((entry) => [entry.date, entry]));
  state.milestones = milestones;
  state.details = B.cleanDetails((await db.getSetting('birthDetails')) ?? state.gift.birthDetails);
}

// All writes run one after another, so a photo and a line of text can't overwrite each other.
let writes = Promise.resolve();
function enqueue(work) {
  const next = writes.then(work, work);
  writes = next.catch(() => {});
  return next;
}

// Timeline previews load as they scroll into view, and stay cached for the session.
const thumbUrls = new Map();
async function thumbUrl(id) {
  if (!thumbUrls.has(id)) {
    thumbUrls.set(id, db.getThumb(id).then((blob) => (blob ? URL.createObjectURL(blob) : null)));
  }
  return thumbUrls.get(id);
}
function forgetThumb(id) {
  const known = thumbUrls.get(id);
  if (known) known.then((url) => url && URL.revokeObjectURL(url));
  thumbUrls.delete(id);
}
const thumbObserver = 'IntersectionObserver' in window
  ? new IntersectionObserver((items) => {
    for (const item of items) {
      if (!item.isIntersecting) continue;
      thumbObserver.unobserve(item.target);
      thumbUrl(item.target.dataset.thumb).then((url) => { if (url) item.target.src = url; });
    }
  }, { rootMargin: '300px' })
  : null;
function thumbImage(id, alt) {
  const img = el('img', { alt });
  img.dataset.thumb = id;
  if (thumbObserver) thumbObserver.observe(img);
  else thumbUrl(id).then((url) => { if (url) img.src = url; });
  return img;
}

function confirmAction(label, question, confirmLabel, action) {
  const box = el('div', { class: 'confirm' });
  const showLink = () => box.replaceChildren(el('button', { class: 'link danger', type: 'button', onclick: ask }, label));
  const ask = () => box.replaceChildren(
    el('p', {}, question),
    el('div', { class: 'row' },
      el('button', { class: 'btn danger', type: 'button', onclick: action }, confirmLabel),
      el('button', { class: 'btn ghost', type: 'button', onclick: showLink }, 'Abbrechen')),
  );
  showLink();
  return box;
}

// ---------- sheets ----------

function openSheet(title, build, onClosed) {
  const cleanups = [];
  const dialog = el('dialog', { class: 'sheet', 'aria-label': title });
  let finished = false;
  const finish = async () => {
    if (finished) return;
    finished = true;
    for (const cleanup of cleanups) await cleanup();
    dialog.remove();
    onClosed?.();
  };
  const close = () => {
    dialog.close();
    finish();
  };
  const body = el('div', { class: 'sheet-body' });
  dialog.append(
    el('div', { class: 'sheet-head' }, el('h2', {}, title), iconButton('close', 'Schließen', close)),
    body,
  );
  dialog.addEventListener('click', (event) => { if (event.target === dialog) close(); });
  dialog.addEventListener('close', finish);
  document.body.append(dialog);
  body.append(...[build({ close, cleanups })].flat().filter(Boolean));
  dialog.showModal();
  return dialog;
}

function openDay(date) {
  openSheet(`${dayLabel(date)}`, ({ close, cleanups }) => [
    el('p', { class: 'muted' }, `${D.formatLong(date)}. ${D.ageLabel(state.birth, date)}`),
    dayEditor(date, cleanups, close),
  ], render);
}

// ---------- one photo and one line for a day ----------

// Locking the phone mid-sentence must not lose the sentence.
const pendingSaves = new Set();

function dayEditor(date, cleanups, onDeleted) {
  let entry = state.entries.get(date) ?? null;
  let objectUrl = null;
  let timer = null;
  let dirty = false;

  const inputId = `foto-${date}`;
  const textId = `satz-${date}`;
  const status = el('p', { class: 'status', role: 'status' });
  const image = el('img', { alt: `Foto von ${NAME}, ${D.formatDate(date)}`, hidden: true });
  const hint = el('span', { class: 'photo-hint' }, el('span', { html: ICONS.camera }), 'Foto hinzufügen');
  const busy = el('span', { class: 'photo-busy', hidden: true }, 'Foto wird vorbereitet …');
  const frame = el('label', { class: 'photo-frame empty', for: inputId }, image, hint, busy);

  const say = (text, isError = false) => {
    status.textContent = text;
    status.classList.toggle('error', isError);
  };
  const showBlob = (blob) => {
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    objectUrl = URL.createObjectURL(blob);
    image.src = objectUrl;
    image.hidden = false;
    hint.hidden = true;
    frame.className = 'photo-frame filled';
  };
  if (entry?.photoId) {
    frame.className = 'photo-frame filled';
    hint.hidden = true;
    db.getPhoto(entry.photoId).then((blob) => { if (blob) showBlob(blob); });
  }

  const remember = (saved) => {
    entry = saved;
    if (saved) state.entries.set(date, saved);
    else state.entries.delete(date);
  };

  const file = el('input', {
    class: 'visually-hidden', type: 'file', accept: 'image/*', id: inputId,
    onchange: async () => {
      const chosen = file.files?.[0];
      if (!chosen) return;
      file.value = '';
      busy.hidden = false;
      say('');
      try {
        const photo = await processPhoto(chosen);
        const oldId = entry?.photoId;
        await flushText();
        remember(await enqueue(() => db.saveEntry(date, { photo })));
        if (oldId) forgetThumb(oldId);
        showBlob(photo.photo);
        askForPersistence();
        say('Gespeichert');
      } catch (error) {
        say(error?.message === 'unreadable'
          ? 'Dieses Foto ließ sich nicht öffnen. Bitte wähle ein anderes.'
          : storageMessage(error), true);
      } finally {
        busy.hidden = true;
      }
    },
  });

  const flushText = async () => {
    clearTimeout(timer);
    if (!dirty) return;
    dirty = false;
    const text = textarea.value.trim();
    try {
      remember(await enqueue(() => db.saveEntry(date, { text })));
      askForPersistence();
      say('Gespeichert');
    } catch (error) {
      dirty = true;
      say(storageMessage(error), true);
    }
  };

  const textarea = el('textarea', {
    id: textId, rows: 2, maxLength: 600, value: entry?.text ?? '',
    placeholder: prompts()[D.dayNumber(state.birth, date) % prompts().length],
    oninput: () => {
      dirty = true;
      say('');
      clearTimeout(timer);
      timer = setTimeout(flushText, 700);
    },
    onblur: flushText,
  });

  pendingSaves.add(flushText);
  cleanups.push(async () => {
    pendingSaves.delete(flushText);
    await flushText();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  });

  const box = el('div', { class: 'stack' },
    file, frame,
    el('div', { class: 'field' },
      el('label', { class: 'field-label', for: textId }, 'Ein Satz zu diesem Tag'),
      textarea),
    status,
  );

  // Removing a whole day only makes sense once something is stored.
  const deleter = confirmAction('Diesen Tag löschen', 'Foto und Satz dieses Tages löschen?', 'Löschen', async () => {
    try {
      clearTimeout(timer);
      dirty = false;
      const oldId = entry?.photoId;
      await enqueue(() => db.deleteEntry(date));
      if (oldId) forgetThumb(oldId);
      remember(null);
      onDeleted();
    } catch (error) {
      say(storageMessage(error), true);
    }
  });
  const syncDeleter = () => { deleter.hidden = !entry; };
  syncDeleter();
  new MutationObserver(syncDeleter).observe(status, { childList: true, characterData: true, subtree: true });
  box.append(deleter);
  return box;
}

// ---------- year ring ----------

function ringSvg({ welcome = false } = {}) {
  const length = D.yearLength(state.birth);
  const dayIndex = D.diffDays(state.birth, state.today);
  const parts = [];
  const C = 200;
  const polar = (radius, turn) => {
    const angle = turn * 2 * Math.PI - Math.PI / 2;
    return [(C + radius * Math.cos(angle)).toFixed(2), (C + radius * Math.sin(angle)).toFixed(2)];
  };

  for (let i = 0; i < length; i++) {
    const date = D.addDays(state.birth, i);
    const classes = ['tick'];
    const lit = state.entries.has(date);
    if (!welcome) {
      if (lit) classes.push('lit');
      if (i <= dayIndex) classes.push('past');
      if (i === dayIndex) classes.push('now');
    }
    const [x1, y1] = polar(lit ? 146 : 152, i / length);
    const [x2, y2] = polar(lit ? 186 : 180, i / length);
    parts.push(`<line class="${classes.join(' ')}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"/>`);
  }

  if (!welcome) {
    const firstOfBirthMonth = `${state.birth.slice(0, 8)}01`;
    for (let m = 0; m <= 12; m++) {
      const start = D.addMonths(firstOfBirthMonth, m);
      const offset = D.diffDays(state.birth, start);
      if (offset < 0 || offset >= length) continue;
      const [x, y] = polar(126, offset / length);
      parts.push(`<text x="${x}" y="${y}">${D.formatMonthShort(start)}</text>`);
    }
    for (const milestone of state.milestones) {
      const i = D.diffDays(state.birth, milestone.date);
      if (i < 0 || i >= length) continue;
      const [x, y] = polar(194, i / length);
      parts.push(`<circle class="marker" cx="${x}" cy="${y}" r="3.2"/>`);
    }
  }

  // Each month's animal sits in the middle of its stretch of the ring. Months still
  // to come stay faint, so there is always a new friend to look forward to.
  const size = welcome ? 48 : 34;
  const radius = welcome ? 108 : 94;
  ANIMALS.forEach((animal, month) => {
    const start = D.diffDays(state.birth, D.addMonths(state.birth, month));
    const end = D.diffDays(state.birth, D.addMonths(state.birth, month + 1));
    const [x, y] = polar(radius, (start + end) / 2 / length);
    const reached = welcome || month <= currentMonth();
    parts.push(`<svg class="ring-animal${reached ? '' : ' future'}" x="${Number(x) - size / 2}" y="${Number(y) - size / 2}" width="${size}" height="${size}" viewBox="0 0 100 100">${animal.shape}</svg>`);
  });

  const holder = document.createElement('div');
  holder.innerHTML = `<svg class="ring${welcome ? ' welcome' : ''}" viewBox="0 0 400 400" role="img">${parts.join('')}</svg>`;
  const svg = holder.firstElementChild;
  if (welcome) {
    svg.querySelectorAll('.tick').forEach((tick, i) => tick.style.setProperty('--i', i));
    svg.querySelectorAll('.ring-animal').forEach((animal, i) => animal.style.setProperty('--i', i));
  }
  return svg;
}

function openAnimal(month) {
  const animal = ANIMALS[month];
  openSheet(`${month + 1}. Lebensmonat`, () => [
    el('div', { class: 'animal-hero' }, face(animal, 'xl'), el('h3', { class: 'section-title' }, animal.name)),
    el('p', {}, animal.fact),
  ]);
}

function animalCard(month) {
  const animal = ANIMALS[month];
  return el('section', { class: 'animal-card' },
    face(animal, 'l'),
    el('div', { class: 'stack-tight' },
      el('p', { class: 'small muted' }, `Dein Tier im ${month + 1}. Lebensmonat`),
      el('h2', { class: 'section-title' }, animal.name),
      el('p', { class: 'small' }, animal.fact)));
}

// ---------- birth details ----------

function detailsList() {
  return el('dl', { class: 'details' },
    el('div', {}, el('dt', {}, 'Geboren'), el('dd', {}, D.formatDate(state.birth))),
    B.detailRows(state.details).map(([label, value]) =>
      el('div', {}, el('dt', {}, label), el('dd', { class: value ? '' : 'missing' }, value ?? 'noch offen'))));
}

function birthCard() {
  const grams = state.details.weightG;
  return el('section', { class: 'birth-card' },
    el('div', { class: 'birth-card-head' },
      face(POLAR_FOX, 'm'),
      el('h2', { class: 'section-title' }, `${NAME}s Steckbrief`)),
    detailsList(),
    grams ? el('p', { class: 'small muted' }, `${NAME} wog bei der Geburt so viel wie etwa ${B.pandaCount(grams)} neugeborene Pandas.`) : null,
    el('button', { class: 'btn ghost wide', type: 'button', onclick: openDetails },
      B.hasDetails(state.details) ? 'Steckbrief bearbeiten' : 'Steckbrief ausfüllen'));
}

function openDetails() {
  openSheet(`${NAME}s Steckbrief`, ({ close }) => {
    const current = state.details;
    const status = el('p', { class: 'status error', role: 'status' });
    const time = el('input', { id: 's-zeit', type: 'time', value: current.time });
    const textField = (id, value) => el('input', {
      id, type: 'text', inputMode: 'decimal', autocomplete: 'off', value,
    });
    const weight = textField('s-gewicht', current.weightG ? String(current.weightG) : '');
    const height = textField('s-groesse', current.heightCm ? current.heightCm.toLocaleString('de-DE') : '');
    const head = textField('s-kopf', current.headCm ? current.headCm.toLocaleString('de-DE') : '');
    const field = (id, label, input) => el('div', { class: 'field' },
      el('label', { class: 'field-label', for: id }, label), input);

    const save = el('button', {
      class: 'btn wide', type: 'button',
      onclick: async () => {
        const next = { time: time.value };
        const read = (input, parser) => (input.value.trim() ? parser(input.value) : undefined);
        const weightG = read(weight, B.parseWeight);
        const heightCm = read(height, (text) => B.parseCm(text, 'heightCm'));
        const headCm = read(head, (text) => B.parseCm(text, 'headCm'));
        if (weightG === null) { status.textContent = 'Bitte gib das Gewicht in Gramm an, zum Beispiel 3450.'; return; }
        if (heightCm === null) { status.textContent = 'Bitte gib die Größe in Zentimetern an, zum Beispiel 52.'; return; }
        if (headCm === null) { status.textContent = 'Bitte gib den Kopfumfang in Zentimetern an, zum Beispiel 34,5.'; return; }
        Object.assign(next, { weightG: weightG ?? null, heightCm: heightCm ?? null, headCm: headCm ?? null });
        save.disabled = true;
        try {
          const details = B.cleanDetails(next);
          await enqueue(async () => {
            await db.setSetting('birthDetails', details);
            await db.setSetting('lastChangeAt', Date.now());
          });
          state.details = details;
          askForPersistence();
          close();
        } catch (error) {
          save.disabled = false;
          status.textContent = storageMessage(error);
        }
      },
    }, 'Steckbrief speichern');

    return [
      el('p', { class: 'muted' }, 'Alle Angaben sind freiwillig und bleiben nur auf diesem Gerät.'),
      field('s-zeit', 'Uhrzeit der Geburt', time),
      field('s-gewicht', 'Gewicht in Gramm', weight),
      field('s-groesse', 'Größe in Zentimetern', height),
      field('s-kopf', 'Kopfumfang in Zentimetern', head),
      status,
      save,
    ];
  }, render);
}

function interactiveRing() {
  const length = D.yearLength(state.birth);
  const svg = ringSvg();
  svg.setAttribute('aria-label', `${NAME}s Jahresring: ${state.entries.size} von ${length} Tagen festgehalten`);
  svg.addEventListener('click', (event) => {
    const box = svg.getBoundingClientRect();
    const x = event.clientX - box.left - box.width / 2;
    const y = event.clientY - box.top - box.height / 2;
    const distance = Math.hypot(x, y) / box.width;
    if (distance < 0.17) return; // the centre is only a label
    const turn = (Math.atan2(x, -y) + 2 * Math.PI) % (2 * Math.PI) / (2 * Math.PI);
    const date = D.addDays(state.birth, Math.round(turn * length) % length);
    if (distance < 0.28) {
      const month = D.monthOfLife(state.birth, date);
      if (month <= currentMonth()) openAnimal(month);
      return;
    }
    if (distance >= 0.34 && date <= latestDay()) openDay(date);
  });

  const center = yearIsOver()
    ? el('div', { class: 'ring-center' }, el('b', {}, `${state.entries.size}`), el('span', {}, state.entries.size === 1 ? 'Tag festgehalten' : 'Tage festgehalten'))
    : el('div', { class: 'ring-center' }, el('b', {}, dayLabel(latestDay())), el('span', {}, `von ${length}`));
  return el('div', { class: 'ring-wrap' }, svg, center);
}

// ---------- pages ----------

function backupReminderDue(settings) {
  const reference = settings.lastBackupAt ?? settings.firstEntryAt;
  if (!reference || Date.now() - reference < THIRTY_DAYS) return false;
  if (settings.backupSnoozedUntil && Date.now() < settings.backupSnoozedUntil) return false;
  return !settings.lastBackupAt || (settings.lastChangeAt ?? 0) > settings.lastBackupAt;
}

async function stripsFor(holder) {
  const strips = [];
  if (!isStandalone()) {
    strips.push(el('div', { class: 'strip' },
      el('button', { class: 'strip-text', type: 'button', onclick: openInstall },
        el('strong', {}, 'Zum Home-Bildschirm hinzufügen'),
        'So bleiben deine Fotos sicher auf dem Handy.')));
  }
  if (!B.hasDetails(state.details)) {
    strips.push(el('div', { class: 'strip' },
      face(POLAR_FOX, 's'),
      el('button', { class: 'strip-text', type: 'button', onclick: openDetails },
        el('strong', {}, `${NAME}s Steckbrief ausfüllen`),
        'Uhrzeit, Gewicht, Größe und Kopfumfang bei der Geburt.')));
  }
  const [lastBackupAt, firstEntryAt, lastChangeAt, backupSnoozedUntil] = await Promise.all(
    ['lastBackupAt', 'firstEntryAt', 'lastChangeAt', 'backupSnoozedUntil'].map((k) => db.getSetting(k)),
  );
  if (backupReminderDue({ lastBackupAt, firstEntryAt, lastChangeAt, backupSnoozedUntil })) {
    const strip = el('div', { class: 'strip' },
      el('button', { class: 'strip-text', type: 'button', onclick: openSettings },
        el('strong', {}, 'Zeit für eine Sicherung'),
        lastBackupAt
          ? `Die letzte war am ${D.formatDate(D.today(new Date(lastBackupAt), ''))}.`
          : 'Bisher gibt es noch keine.'),
      iconButton('close', 'Später erinnern', async () => {
        await db.setSetting('backupSnoozedUntil', Date.now() + THIRTY_DAYS);
        strip.remove();
      }));
    strips.push(strip);
  }
  holder.replaceChildren(...strips);
  holder.hidden = !strips.length;
}

function pageHeute(cleanups) {
  if (yearIsOver()) return pageBirthday();
  const day = state.today < state.birth ? state.birth : state.today;
  const strips = el('div', { class: 'stack', hidden: true });
  stripsFor(strips);

  const earlier = day > state.birth
    ? el('button', {
      class: 'link', type: 'button',
      onclick: () => openDay(D.addDays(day, -1)),
    }, `Gestern öffnen (${dayLabel(D.addDays(day, -1))})`)
    : null;

  return [
    strips,
    el('header', { class: 'day-header' },
      el('div', {},
        el('p', { class: 'eyebrow' }, D.formatLong(day)),
        el('h1', { class: 'day-title' }, dayLabel(day)),
        el('p', { class: 'age' }, D.ageLabel(state.birth, day)),
        earlier),
      face(ANIMALS[D.monthOfLife(state.birth, day)], 'l')),
    dayEditor(day, cleanups, render),
    animalCard(D.monthOfLife(state.birth, day)),
  ];
}

function pageBirthday() {
  const birthday = D.firstBirthday(state.birth);
  const isTheDay = state.today === birthday;
  return [
    el('header', { class: 'stack-tight' },
      el('p', { class: 'eyebrow' }, D.formatDate(state.today)),
      el('h1', { class: 'page-title' }, isTheDay
        ? `Alles Gute zum ersten Geburtstag, ${NAME}!`
        : `${NAME}s erstes Jahr ist beisammen`),
      el('p', { class: 'age' }, D.ageLabel(state.birth, state.today))),
    interactiveRing(),
    hasMemories()
      ? el('button', { class: 'btn wide', type: 'button', onclick: openReview }, 'Das ganze Jahr ansehen')
      : null,
    birthCard(),
    el('p', { class: 'muted' }, 'Sichere das Jahr jetzt noch einmal, dann ist es gut aufgehoben.'),
    el('button', { class: 'btn ghost wide', type: 'button', onclick: openSettings }, 'Zur Sicherung'),
  ];
}

const hasMemories = () => state.entries.size > 0 || state.milestones.length > 0;

function timeline() {
  if (!state.entries.size) {
    return el('div', { class: 'empty-note' }, face(ANIMALS[1], 'm'),
      el('p', {}, 'Hier sammeln sich die Tage, sobald der erste festgehalten ist. Jeder Tag leuchtet dann im Jahresring auf.'));
  }
  const marked = new Map();
  for (const milestone of state.milestones) marked.set(milestone.date, milestone.title);

  const months = new Map();
  [...state.entries.values()]
    .sort((a, b) => b.date.localeCompare(a.date))
    .forEach((entry) => {
      const key = entry.date.slice(0, 7);
      if (!months.has(key)) months.set(key, []);
      months.get(key).push(entry);
    });

  return el('div', { class: 'stack' }, [...months.values()].map((entries) =>
    el('section', { class: 'month' },
      el('h2', { class: 'section-title' }, D.formatMonth(entries[0].date)),
      el('div', { class: 'tiles' }, entries.map((entry) => {
        const title = marked.get(entry.date);
        return el('button', {
          class: 'tile', type: 'button', onclick: () => openDay(entry.date),
          'aria-label': `${dayLabel(entry.date)}, ${D.formatDate(entry.date)}${title ? `, ${title}` : ''}`,
        },
        entry.photoId ? thumbImage(entry.photoId, '') : el('span', { class: 'tile-text' }, entry.text),
        title ? el('span', { class: 'tile-paw', title, html: ICONS.paw }) : null,
        el('span', { class: 'tile-day' }, D.dayNumber(state.birth, entry.date)));
      })))));
}

function pageYear() {
  const picker = el('input', {
    id: 'tag-waehlen', type: 'date', min: state.birth, max: latestDay(),
    onchange: () => {
      if (D.isValid(picker.value) && picker.value >= state.birth && picker.value <= latestDay()) openDay(picker.value);
    },
  });
  return [
    el('h1', { class: 'page-title' }, `${NAME}s Jahresring`),
    interactiveRing(),
    hasMemories() ? el('button', { class: 'btn wide', type: 'button', onclick: openReview }, 'Rückblick ansehen') : null,
    birthCard(),
    el('div', { class: 'field' },
      el('label', { class: 'field-label', for: 'tag-waehlen' }, 'Einen Tag nachtragen'),
      picker),
    timeline(),
  ];
}

function openMilestone(existing, presetTitle) {
  const isPreset = Boolean(presetTitle || existing?.preset);
  const heading = existing?.title ?? presetTitle ?? 'Eigener Meilenstein';
  openSheet(heading, ({ close, cleanups }) => {
    let pending = null;
    let url = null;
    const status = el('p', { class: 'status', role: 'status' });
    const say = (text) => { status.textContent = text; status.classList.toggle('error', Boolean(text)); };

    const titleInput = isPreset ? null : el('input', { id: 'm-titel', type: 'text', maxLength: 80, value: existing?.title ?? '' });
    const dateInput = el('input', { id: 'm-datum', type: 'date', min: state.birth, max: state.today, value: existing?.date ?? (state.today < state.birth ? state.birth : state.today) });
    const noteInput = el('textarea', { id: 'm-notiz', rows: 3, maxLength: 600, value: existing?.note ?? '', placeholder: 'Wo wart ihr? Wie war es?' });

    const image = el('img', { alt: `Foto zu ${heading}`, hidden: true });
    const hint = el('span', { class: 'photo-hint' }, el('span', { html: ICONS.camera }), 'Foto hinzufügen (optional)');
    const frame = el('label', { class: 'photo-frame empty', for: 'm-foto' }, image, hint);
    const show = (blob) => {
      if (url) URL.revokeObjectURL(url);
      url = URL.createObjectURL(blob);
      image.src = url;
      image.hidden = false;
      hint.hidden = true;
      frame.className = 'photo-frame filled';
    };
    if (existing?.photoId) db.getPhoto(existing.photoId).then((blob) => { if (blob) show(blob); });
    cleanups.push(() => { if (url) URL.revokeObjectURL(url); });

    const file = el('input', {
      class: 'visually-hidden', type: 'file', accept: 'image/*', id: 'm-foto',
      onchange: async () => {
        const chosen = file.files?.[0];
        if (!chosen) return;
        say('');
        try {
          pending = await processPhoto(chosen);
          show(pending.photo);
        } catch {
          say('Dieses Foto ließ sich nicht öffnen. Bitte wähle ein anderes.');
        }
      },
    });

    const save = el('button', {
      class: 'btn wide', type: 'button',
      onclick: async () => {
        const title = isPreset ? heading : titleInput.value.trim();
        const date = dateInput.value;
        if (!title) return say('Bitte gib dem Meilenstein einen Namen.');
        if (!D.isValid(date) || date < state.birth || date > state.today) {
          return say(`Bitte wähle ein Datum zwischen dem ${D.formatDate(state.birth)} und heute.`);
        }
        save.disabled = true;
        try {
          const record = {
            id: existing?.id ?? db.uid(), preset: isPreset, title, date, note: noteInput.value.trim(),
          };
          const oldId = existing?.photoId;
          await enqueue(() => db.saveMilestone(record, pending));
          if (pending && oldId) forgetThumb(oldId);
          await reload();
          askForPersistence();
          close();
        } catch (error) {
          save.disabled = false;
          say(storageMessage(error));
        }
      },
    }, 'Meilenstein speichern');

    return [
      titleInput ? el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'm-titel' }, 'Name'), titleInput) : null,
      el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'm-datum' }, 'Wann war es?'), dateInput),
      el('div', { class: 'field' }, el('label', { class: 'field-label', for: 'm-notiz' }, 'Notiz'), noteInput),
      file, frame, status, save,
      existing ? confirmAction('Meilenstein löschen', 'Diesen Meilenstein wirklich löschen?', 'Löschen', async () => {
        try {
          await enqueue(() => db.deleteMilestone(existing.id));
          if (existing.photoId) forgetThumb(existing.photoId);
          await reload();
          close();
        } catch (error) {
          say(storageMessage(error));
        }
      }) : null,
    ];
  }, render);
}

function pageMilestones() {
  const done = [...state.milestones].sort((a, b) => b.date.localeCompare(a.date));
  const used = new Set(state.milestones.map((m) => m.title));
  return [
    el('h1', { class: 'page-title' }, 'Meilensteine'),
    done.length
      ? el('div', { class: 'stack' }, done.map((m) =>
        el('button', { class: 'moment', type: 'button', onclick: () => openMilestone(m) },
          el('span', { class: 'moment-pic' }, m.photoId ? thumbImage(m.photoId, '') : el('i', { html: ICONS.paw })),
          el('span', {},
            el('h3', {}, m.title),
            el('span', { class: 'small muted' }, `${D.formatDate(m.date)}, ${dayLabel(m.date)}`)))))
      : el('div', { class: 'empty-note' }, face(ANIMALS[2], 'm'),
        el('p', {}, `Alles zu seiner Zeit. Jedes Kind hat sein eigenes Tempo, und ${NAME} auch.`)),
    el('section', { class: 'stack' },
      el('h2', { class: 'section-title' }, 'Wenn es so weit ist'),
      el('div', { class: 'chips' }, MILESTONES.filter((title) => !used.has(title)).map((title) =>
        el('button', { class: 'chip', type: 'button', onclick: () => openMilestone(null, title) }, title))),
      el('button', { class: 'btn ghost wide', type: 'button', onclick: () => openMilestone(null, null) }, 'Eigenen Meilenstein hinzufügen')),
  ];
}

// ---------- year in review ----------

function reviewSlides() {
  const days = [...state.entries.values()].map((entry) => ({ kind: 'day', ...entry }));
  const moments = state.milestones.map((m) => ({ kind: 'moment', ...m }));
  const items = [...days, ...moments].sort((a, b) =>
    a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
  return [{ kind: 'intro' }, ...items, { kind: 'end' }];
}

function openReview() {
  const slides = reviewSlides();
  let index = -1;
  let timer = null;
  let paused = false;
  let url = null;
  let token = 0;
  let wakeLock = null;

  const stage = el('div', { class: 'review-stage' });
  const barFill = el('i', {});
  const dialog = el('dialog', { class: 'review', 'aria-label': `${NAME}s erstes Jahr` });
  const pauseButton = iconButton('pause', 'Anhalten', (event) => {
    event.stopPropagation();
    paused = !paused;
    pauseButton.innerHTML = paused ? ICONS.play : ICONS.pause;
    pauseButton.setAttribute('aria-label', paused ? 'Weiter abspielen' : 'Anhalten');
    clearTimeout(timer);
    if (!paused) schedule();
  });

  const schedule = () => {
    clearTimeout(timer);
    if (paused || index >= slides.length - 1) return;
    timer = setTimeout(() => show(index + 1), slides[index].kind === 'intro' ? 3200 : 4500);
  };

  const caption = (slide) => {
    const friend = face(ANIMALS[D.monthOfLife(state.birth, slide.date)], 's');
    if (slide.kind === 'moment') {
      return el('div', { class: 'review-caption' },
        el('p', { class: 'when' }, friend, `${D.formatDate(slide.date)}, ${dayLabel(slide.date)}`),
        el('h2', {}, slide.title),
        slide.note ? el('p', { class: 'line' }, slide.note) : null);
    }
    return el('div', { class: 'review-caption' },
      el('p', { class: 'when' }, friend, `${dayLabel(slide.date)}, ${D.formatDate(slide.date)}`),
      slide.text ? el('p', { class: 'line' }, slide.text) : null);
  };

  async function show(next) {
    index = Math.max(0, Math.min(next, slides.length - 1));
    const current = ++token;
    clearTimeout(timer);
    const slide = slides[index];
    barFill.style.setProperty('--done', index / (slides.length - 1));

    if (slide.kind === 'intro') {
      const known = B.detailRows(state.details).filter(([, value]) => value);
      stage.replaceChildren(el('div', { class: 'review-card' },
        parade(),
        el('h2', {}, `${NAME}s erstes Jahr`),
        el('p', {}, `Geboren am ${D.formatDate(state.birth)}`),
        known.length ? el('p', { class: 'review-details' }, known.map(([, value]) => value).join('  ·  ')) : null));
    } else if (slide.kind === 'end') {
      stage.replaceChildren(el('div', { class: 'review-card' },
        parade(),
        el('h2', {}, yearIsOver() ? `Alles Gute zum ersten Geburtstag, ${NAME}!` : 'Bis hierhin'),
        el('p', {}, `${state.entries.size} ${state.entries.size === 1 ? 'Tag' : 'Tage'} und ${state.milestones.length} ${state.milestones.length === 1 ? 'Meilenstein' : 'Meilensteine'} festgehalten.`),
        el('button', {
          class: 'btn', type: 'button',
          onclick: (event) => { event.stopPropagation(); show(0); },
        }, 'Noch einmal ansehen')));
    } else {
      const picture = el('div', { class: 'review-pic' });
      stage.replaceChildren(picture, caption(slide));
      if (slide.photoId) {
        const blob = await db.getPhoto(slide.photoId);
        if (current !== token) return;
        if (blob) {
          if (url) URL.revokeObjectURL(url);
          url = URL.createObjectURL(blob);
          picture.append(el('img', { src: url, alt: '' }));
        }
      }
    }
    schedule();
  }

  dialog.append(
    el('div', { class: 'review-bar' }, barFill),
    stage,
    el('div', { class: 'review-controls' }, pauseButton, iconButton('close', 'Rückblick schließen', () => dialog.close())),
  );
  dialog.addEventListener('click', (event) => {
    if (event.target.closest('button')) return;
    show(event.clientX < dialog.clientWidth * 0.3 ? index - 1 : index + 1);
  });
  dialog.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowRight') show(index + 1);
    if (event.key === 'ArrowLeft') show(index - 1);
  });
  dialog.addEventListener('close', () => {
    token++;
    clearTimeout(timer);
    if (url) URL.revokeObjectURL(url);
    wakeLock?.release?.().catch(() => {});
    dialog.remove();
  });

  document.body.append(dialog);
  dialog.showModal();
  navigator.wakeLock?.request?.('screen').then((lock) => { wakeLock = lock; }).catch(() => {});
  show(0);
}

// ---------- settings ----------

function formatSize(bytes) {
  if (bytes < 1048576) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1048576).toLocaleString('de-DE', { maximumFractionDigits: 1 })} MB`;
}

function backupSection() {
  const lastLine = el('p', { class: 'small muted' });
  const refreshLast = async () => {
    const last = await db.getSetting('lastBackupAt');
    lastLine.textContent = last
      ? `Letzte Sicherung: ${D.formatDate(D.today(new Date(last), ''))}`
      : 'Bisher gibt es noch keine Sicherung.';
  };
  refreshLast();
  const status = el('p', { class: 'status', role: 'status' });
  const say = (text, isError = false) => {
    status.textContent = text;
    status.classList.toggle('error', isError);
  };

  const markSaved = async () => {
    await db.setSetting('lastBackupAt', Date.now());
    await db.setSetting('backupSnoozedUntil', null);
    refreshLast();
  };

  const download = (file) => {
    const url = URL.createObjectURL(file);
    const link = el('a', { href: url, download: file.name });
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
  };

  // Sharing has to start from a fresh tap, so building and saving are two steps.
  const deliver = async (file) => {
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: 'Erstes Jahr: Sicherung' });
        await markSaved();
        say('Gesichert. Bewahre die Datei am besten in iCloud oder Google Drive auf.');
        return;
      } catch (error) {
        if (error?.name === 'AbortError') {
          say('Die Sicherung wurde noch nicht gespeichert.');
          return;
        }
      }
    }
    download(file);
    await markSaved();
    say('Die Datei liegt in deinen Downloads. Verschiebe sie am besten in iCloud oder Google Drive.');
  };

  const actions = el('div', { class: 'stack-tight' });
  const showCreate = () => actions.replaceChildren(createButton);
  const createButton = el('button', {
    class: 'btn wide', type: 'button',
    onclick: async () => {
      createButton.disabled = true;
      say('Sicherung wird erstellt …');
      try {
        await writes;
        const file = await createBackup({
          gift: state.gift,
          birthDate: state.birth,
          birthDetails: state.details,
          labels: { date: D.formatDate },
          onProgress: (done, total) => say(`Sicherung wird erstellt: ${done} von ${total}`),
        });
        say('');
        actions.replaceChildren(el('button', {
          class: 'btn wide', type: 'button', onclick: () => deliver(file),
        }, `Sicherung speichern (${formatSize(file.size)})`));
      } catch {
        say('Die Sicherung ließ sich nicht erstellen. Bitte versuche es noch einmal.', true);
      } finally {
        createButton.disabled = false;
      }
    },
  }, 'Sicherung erstellen');
  showCreate();

  const restoreStatus = el('div', { class: 'stack-tight' });
  const runRestore = async (file) => {
    restoreStatus.replaceChildren();
    say('Sicherung wird gelesen …');
    try {
      await writes;
      const result = await restoreBackup(file, {
        onProgress: (done, total) => say(`Wird wiederhergestellt: ${done} von ${total}`),
      });
      thumbUrls.forEach((_, id) => forgetThumb(id));
      applyGift((await db.getSetting('gift')) ?? state.gift);
      state.birth = (await db.getSetting('birthDate')) ?? state.birth;
      await reload();
      refreshLast();
      say(`Wiederhergestellt: ${result.entries} Tage und ${result.milestones} Meilensteine.`);
    } catch (error) {
      say(error instanceof BackupError ? error.message : 'Die Sicherung ließ sich nicht lesen. Es wurde nichts verändert.', true);
    }
  };
  const restoreInput = el('input', {
    class: 'visually-hidden', type: 'file', id: 'sicherung-datei', accept: '.zip,application/zip',
    onchange: () => {
      const file = restoreInput.files?.[0];
      restoreInput.value = '';
      if (!file) return;
      say('');
      if (!hasMemories()) { runRestore(file); return; }
      restoreStatus.replaceChildren(
        el('p', {}, 'Die Sicherung ersetzt alles, was gerade in der App gespeichert ist. Fortfahren?'),
        el('div', { class: 'row' },
          el('button', { class: 'btn danger', type: 'button', onclick: () => runRestore(file) }, 'Ersetzen'),
          el('button', { class: 'btn ghost', type: 'button', onclick: () => restoreStatus.replaceChildren() }, 'Abbrechen')),
      );
    },
  });

  return el('section', { class: 'stack' },
    el('h3', { class: 'section-title' }, 'Sicherung'),
    el('p', {}, 'Fotos und Notizen liegen nur auf diesem Gerät. Eine Sicherung schützt sie, falls das Handy verloren geht oder die App gelöscht wird.'),
    lastLine,
    actions,
    restoreInput,
    el('label', { class: 'btn ghost wide', for: 'sicherung-datei', tabIndex: 0 }, 'Aus Sicherung wiederherstellen'),
    restoreStatus,
    status,
  );
}

const lockName = () => (isIOS() ? 'Face ID' : 'Fingerabdruck oder Gerätesperre');

function lockSection() {
  const box = el('section', { class: 'setting', hidden: true });
  const draw = async () => {
    const enabled = Boolean(await db.getSetting('lockCredential'));
    if (!enabled && !(await L.isAvailable())) {
      box.hidden = true;
      return;
    }
    box.hidden = false;
    const status = el('p', { class: 'status error', role: 'status' });
    box.replaceChildren(
      el('h3', { class: 'section-title' }, 'App-Sperre'),
      el('p', {}, enabled
        ? `Die App öffnet sich nur nach ${lockName()}. Nach fünf Minuten im Hintergrund sperrt sie sich wieder.`
        : `Schütze die App mit ${lockName()}, falls jemand anderes dein entsperrtes Handy in der Hand hat.`),
      el('button', {
        class: 'btn ghost wide', type: 'button',
        onclick: async () => {
          try {
            await db.setSetting('lockCredential', enabled ? null : await L.enroll());
            await draw();
          } catch {
            status.textContent = 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
          }
        },
      }, enabled ? 'Sperre ausschalten' : 'Sperre einschalten'),
      status,
    );
  };
  draw();
  return box;
}

function themeSection() {
  let current = null;
  try { current = localStorage.getItem('year-theme'); } catch { /* storage blocked */ }
  const choices = [['auto', 'Automatisch'], ['light', 'Hell'], ['dark', 'Dunkel']];
  const buttons = choices.map(([value, label]) =>
    el('button', {
      class: 'btn ghost', type: 'button', 'aria-pressed': String((current ?? 'auto') === value),
      onclick: () => {
        try {
          if (value === 'auto') localStorage.removeItem('year-theme');
          else localStorage.setItem('year-theme', value);
        } catch { /* the choice just won't be remembered */ }
        window.applyTheme(value === 'auto' ? null : value);
        buttons.forEach((b, i) => b.setAttribute('aria-pressed', String(choices[i][0] === value)));
      },
    }, label));
  return el('section', { class: 'stack' },
    el('h3', { class: 'section-title' }, 'Darstellung'),
    el('div', { class: 'segmented' }, buttons));
}

function openSettings() {
  openSheet('Einstellungen', () => {
    const usage = el('p', { class: 'small muted' });
    navigator.storage?.estimate?.().then((estimate) => {
      if (estimate?.usage !== undefined) usage.textContent = `Belegter Speicher: ${formatSize(estimate.usage)}`;
    }).catch(() => {});

    const birth = el('input', {
      id: 'geburtsdatum', type: 'date', value: state.birth, max: state.today,
      onchange: async () => {
        if (!D.isValid(birth.value) || birth.value > state.today) {
          birth.value = state.birth;
          return;
        }
        state.birth = birth.value;
        await db.setSetting('birthDate', birth.value);
      },
    });

    return [
      backupSection(),
      lockSection(),
      el('section', { class: 'setting' },
        el('div', { class: 'field' },
          el('label', { class: 'section-title', for: 'geburtsdatum' }, `${NAME}s Geburtsdatum`),
          birth)),
      el('div', { class: 'setting' }, themeSection()),
      !isStandalone() ? el('section', { class: 'setting' },
        el('h3', { class: 'section-title' }, 'Als App speichern'),
        el('button', { class: 'btn ghost wide', type: 'button', onclick: openInstall }, 'Zum Home-Bildschirm hinzufügen')) : null,
      el('section', { class: 'setting' },
        el('h3', { class: 'section-title' }, 'Die Nachricht'),
        el('button', {
          class: 'btn ghost wide', type: 'button',
          onclick: () => openSheet(state.gift.headline, () => letter()),
        }, 'Noch einmal lesen')),
      el('section', { class: 'setting' },
        el('h3', { class: 'section-title' }, 'Speicher'),
        usage,
        confirmAction('Alle Fotos und Notizen löschen', 'Alles in dieser App wird unwiderruflich gelöscht. Sicherungsdateien bleiben davon unberührt.', 'Alles löschen', async () => {
          await writes;
          await db.clearAll();
          thumbUrls.forEach((_, id) => forgetThumb(id));
          await reload();
          document.querySelector('dialog.sheet')?.close();
        })),
    ];
  }, render);
}

// ---------- installing ----------

function installSteps() {
  if (state.installEvent) {
    return [
      el('p', {}, 'Mit einem Tipp liegt die App wie jede andere auf deinem Handy.'),
      el('button', {
        class: 'btn wide', type: 'button',
        onclick: async () => {
          const event = state.installEvent;
          event.prompt();
          await event.userChoice.catch(() => {});
          state.installEvent = null;
          render();
        },
      }, 'Jetzt installieren'),
    ];
  }
  if (isIOS()) {
    return [
      el('ol', { class: 'steps' },
        el('li', {}, 'Öffne diese Seite in Safari. Kommst du aus WhatsApp oder einer anderen App, wähle zuerst „In Safari öffnen“.'),
        el('li', {}, 'Tippe auf das Teilen-Symbol, das Quadrat mit dem Pfeil nach oben. Siehst du es nicht, tippe zuerst auf die drei Punkte.'),
        el('li', {}, 'Wähle „Zum Home-Bildschirm“ und dann „Hinzufügen“.'),
        el('li', {}, 'Öffne die App ab jetzt immer über das neue Symbol.')),
      el('p', { class: 'note' }, 'Am besten machst du das gleich: Auf dem iPhone wandert nichts aus dem Browser mit in die App, und Safari kann Daten von selten besuchten Seiten löschen. Halte deinen Code bereit, denn die App fragt beim ersten Öffnen noch einmal danach.'),
    ];
  }
  return [
    el('ol', { class: 'steps' },
      el('li', {}, 'Öffne das Menü deines Browsers, in Chrome die drei Punkte oben rechts.'),
      el('li', {}, 'Wähle „App installieren“ oder „Zum Startbildschirm hinzufügen“.'),
      el('li', {}, 'Öffne die App ab jetzt immer über das neue Symbol.')),
  ];
}

function openInstall() {
  openSheet('Zum Home-Bildschirm hinzufügen', () => installSteps(), render);
}

// ---------- welcome ----------

function letter() {
  const birthday = D.formatDate(D.firstBirthday(state.birth));
  const gift = state.gift;
  return el('div', { class: 'letter' },
    gift.greeting ? el('p', {}, gift.greeting) : null,
    gift.message.map((paragraph) => el('p', {}, paragraph.replace('{geburtstag}', birthday))),
    el('p', { class: 'sign' }, gift.sender ? `${gift.signoff}, ${gift.sender}` : gift.signoff));
}

function showWelcome() {
  const finish = async () => {
    await db.setSetting('welcomed', true);
    render();
  };
  const screen = (...children) => app.replaceChildren(el('main', { class: 'welcome-screen' }, children));
  const actions = (...buttons) => el('div', { class: 'welcome-actions' }, buttons);

  const showLetter = () => screen(
    el('div', { class: 'ring-wrap' }, ringSvg({ welcome: true }),
      el('div', { class: 'ring-center' }, el('b', {}, NAME))),
    el('h1', { class: 'rise' }, state.gift.headline),
    el('div', { class: 'rise' }, letter()),
    B.hasDetails(state.details) ? el('div', { class: 'rise' }, detailsList()) : null,
    actions(el('button', { class: 'btn wide', type: 'button', onclick: showHow }, 'Weiter')),
  );

  const showHow = () => {
    window.scrollTo(0, 0);
    screen(
      el('h1', {}, 'So einfach geht es'),
      el('div', { class: 'facts' },
        el('div', {}, el('h2', {}, 'Ein Foto und ein Satz'), el('p', {}, 'Mehr braucht es nicht. Fehlt ein Tag, ist das völlig in Ordnung, und du kannst ihn jederzeit nachtragen.')),
        el('div', {}, el('h2', {}, 'Nur auf deinem Handy'), el('p', {}, 'Fotos und Notizen werden nirgendwohin hochgeladen. Niemand sonst kann sie sehen.')),
        el('div', {}, el('h2', {}, 'Einmal im Monat sichern'), el('p', {}, 'Geht das Handy verloren oder wird die App gelöscht, ist alles seit der letzten Sicherung weg. Die App erinnert dich leise daran.'))),
      actions(el('button', {
        class: 'btn wide', type: 'button',
        onclick: isStandalone() ? offerLock : showInstall,
      }, isStandalone() ? 'Los geht’s' : 'Weiter')),
    );
  };

  const offerLock = async () => {
    if (!(await L.isAvailable())) return finish();
    window.scrollTo(0, 0);
    const status = el('p', { class: 'status error', role: 'status' });
    const turnOn = el('button', {
      class: 'btn wide', type: 'button',
      onclick: async () => {
        status.textContent = '';
        try {
          await db.setSetting('lockCredential', await L.enroll());
          await finish();
        } catch {
          status.textContent = 'Das hat nicht geklappt. Du kannst die Sperre später in den Einstellungen einschalten.';
        }
      },
    }, `Mit ${lockName()} schützen`);
    screen(
      parade(),
      el('h1', {}, 'Soll die App gesperrt sein?'),
      el('p', {}, `Dann öffnet sie sich nur nach ${lockName()}. Dein Handy prüft das selbst, die App sieht dein Gesicht oder deinen Fingerabdruck nie.`),
      status,
      actions(turnOn, el('button', { class: 'btn ghost wide', type: 'button', onclick: finish }, 'Jetzt nicht')),
    );
    return null;
  };

  const showInstall = () => {
    window.scrollTo(0, 0);
    screen(
      el('h1', {}, 'Als App speichern'),
      el('div', { class: 'stack' }, installSteps()),
      actions(
        el('button', { class: 'btn wide', type: 'button', onclick: finish }, 'Fertig'),
      ),
    );
  };

  showLetter();
}

// ---------- shell ----------

let pageCleanups = [];

async function render() {
  const previous = pageCleanups;
  pageCleanups = [];
  for (const cleanup of previous) await cleanup();

  const pages = { heute: pageHeute, jahr: pageYear, meilensteine: pageMilestones };
  const content = pages[state.tab](pageCleanups);
  const tab = (key, label) => el('button', {
    class: 'tab', type: 'button', 'aria-current': state.tab === key ? 'page' : null,
    onclick: () => {
      state.tab = key;
      window.scrollTo(0, 0);
      render();
    },
  }, label);

  app.replaceChildren(
    el('div', { class: 'topbar' },
      el('span', { class: 'wordmark' }, `${NAME}s erstes Jahr`),
      iconButton('gear', 'Einstellungen', openSettings)),
    el('main', { class: 'page' }, [content].flat().filter(Boolean)),
    el('nav', { class: 'tabs', 'aria-label': 'Hauptnavigation' },
      el('div', { class: 'tabs-inner' },
        tab('heute', 'Heute'), tab('jahr', 'Das Jahr'), tab('meilensteine', 'Meilensteine'))),
  );
}

function applyGift(gift) {
  state.gift = gift;
  NAME = gift.name;
  document.title = `${NAME}s erstes Jahr`;
}

function showStorageProblem() {
  app.replaceChildren(el('main', { class: 'welcome-screen' },
    el('h1', {}, 'Hier lässt sich nichts speichern'),
    el('p', {}, 'Dieser Browser erlaubt der App gerade keinen Speicher, zum Beispiel in einem privaten Fenster. Bitte öffne den Link in einem normalen Fenster.')));
}

// Opens the app once the personal part is available on this device.
async function start() {
  try {
    applyGift(await db.getSetting('gift'));
    state.birth = (await db.getSetting('birthDate')) ?? state.gift.birthDate;
    await reload();
    const welcomed = await db.getSetting('welcomed', false);
    if (welcomed) render();
    else showWelcome();
  } catch {
    showStorageProblem();
  }
}

// ---------- the app lock screen ----------

const RELOCK_AFTER = 5 * 60 * 1000;
let lockOpen = false;
let hiddenAt = null;

async function requireUnlock() {
  const credentialId = await db.getSetting('lockCredential');
  if (!credentialId || lockOpen) return;
  await new Promise((resolve) => showLock(credentialId, resolve));
}

function showLock(credentialId, resolve) {
  lockOpen = true;
  const dialog = el('dialog', { class: 'lock-screen', 'aria-label': 'App gesperrt' });
  const unlock = () => {
    lockOpen = false;
    dialog.close();
    dialog.remove();
    resolve();
  };
  dialog.addEventListener('cancel', (event) => event.preventDefault());

  const status = el('p', { class: 'status error', role: 'status' });
  const biometric = el('button', {
    class: 'btn wide', type: 'button',
    onclick: async () => {
      status.textContent = '';
      try {
        if (await L.verify(credentialId)) unlock();
      } catch {
        status.textContent = `${lockName()} hat nicht geklappt. Versuche es noch einmal oder nimm deinen Code.`;
      }
    },
  }, `Mit ${lockName()} öffnen`);

  const codeInput = el('input', {
    id: 'sperre-code', type: 'text', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: false, placeholder: 'XXXX-XXXX-XXXX-XXXX',
  });
  const codeButton = el('button', {
    class: 'btn ghost wide', type: 'button',
    onclick: async () => {
      status.textContent = '';
      codeButton.disabled = true;
      try {
        const response = await fetch('gift.enc.json');
        await unseal(await response.json(), codeInput.value);
        codeInput.value = '';
        unlock();
      } catch (error) {
        codeButton.disabled = false;
        status.textContent = error instanceof WrongCode
          ? 'Dieser Code passt nicht. Prüfe ihn bitte noch einmal.'
          : 'Das hat nicht geklappt. Bitte versuche es noch einmal.';
      }
    },
  }, 'Mit Code öffnen');
  const codeArea = el('div', { class: 'stack-tight', hidden: true },
    el('label', { class: 'field-label', for: 'sperre-code' }, 'Dein Code'), codeInput, codeButton);
  const showCode = el('button', {
    class: 'link', type: 'button',
    onclick: () => {
      codeArea.hidden = false;
      showCode.hidden = true;
      codeInput.focus();
    },
  }, 'Stattdessen den Code eingeben');

  dialog.append(el('div', { class: 'lock-inner' },
    face(POLAR_FOX, 'xl'),
    el('h1', { class: 'page-title' }, 'Die App ist gesperrt'),
    status,
    biometric,
    showCode,
    codeArea));
  document.body.append(dialog);
  dialog.showModal();
}

// ---------- the code screen ----------

function showCodeScreen() {
  const status = el('p', { class: 'status', role: 'status' });
  const say = (message, isError = true) => {
    status.textContent = message;
    status.classList.toggle('error', isError);
  };
  const input = el('input', {
    id: 'geschenk-code', type: 'text', autocomplete: 'off', autocapitalize: 'characters',
    spellcheck: false, placeholder: 'XXXX-XXXX-XXXX-XXXX',
  });

  const open = el('button', {
    class: 'btn wide', type: 'button',
    onclick: async () => {
      if (!input.value.trim()) return say('Bitte gib deinen Code ein.');
      if (!globalThis.crypto?.subtle) return say('Dieser Browser kann den Code nicht prüfen. Bitte öffne den Link in Safari oder Chrome.');
      open.disabled = true;
      say('Wird geöffnet …', false);
      try {
        const response = await fetch('gift.enc.json');
        if (!response.ok) throw new Error('unavailable');
        const gift = await unseal(await response.json(), input.value);
        await db.setSetting('gift', gift);
        input.value = '';
        await start();
      } catch (error) {
        open.disabled = false;
        say(error instanceof WrongCode
          ? 'Dieser Code passt nicht. Prüfe ihn bitte noch einmal.'
          : 'Das hat nicht geklappt. Prüfe bitte deine Internetverbindung und versuche es noch einmal.');
      }
    },
  }, 'Öffnen');
  input.addEventListener('keydown', (event) => { if (event.key === 'Enter') open.click(); });

  const restore = el('input', {
    class: 'visually-hidden', type: 'file', id: 'sicherung-start', accept: '.zip,application/zip',
    onchange: async () => {
      const file = restore.files?.[0];
      restore.value = '';
      if (!file) return;
      say('Sicherung wird gelesen …', false);
      try {
        await restoreBackup(file, { onProgress: (done, total) => say(`Wird wiederhergestellt: ${done} von ${total}`, false) });
        if (!cleanGift(await db.getSetting('gift'))) return say('In dieser Sicherung fehlen die persönlichen Angaben. Bitte gib deinen Code ein.');
        await db.setSetting('welcomed', true);
        await start();
      } catch (error) {
        say(error instanceof BackupError ? error.message : 'Die Sicherung ließ sich nicht lesen.');
      }
    },
  });

  app.replaceChildren(el('main', { class: 'welcome-screen' },
    parade(),
    el('h1', {}, 'Für dich gibt es eine kleine Überraschung'),
    el('p', {}, 'Gib den Code aus deiner Nachricht ein. Er öffnet etwas, das nur für dich gedacht ist.'),
    el('div', { class: 'field' },
      el('label', { class: 'field-label', for: 'geschenk-code' }, 'Dein Code'),
      input),
    status,
    el('div', { class: 'welcome-actions' },
      open,
      restore,
      el('label', { class: 'btn ghost wide', for: 'sicherung-start', tabIndex: 0 }, 'Ich habe schon eine Sicherung'))));
}

async function boot() {
  let hasGift = false;
  try {
    hasGift = Boolean(cleanGift(await db.getSetting('gift')));
  } catch {
    showStorageProblem();
    return;
  }
  if (hasGift) {
    await requireUnlock();
    await start();
  } else {
    showCodeScreen();
  }

  // A phone can keep the app open for days, so check for a new day when it returns.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') {
      pendingSaves.forEach((save) => save());
      hiddenAt = Date.now();
      return;
    }
    if (hiddenAt && Date.now() - hiddenAt >= RELOCK_AFTER) requireUnlock();
    hiddenAt = null;
    const now = D.today();
    if (now === state.today) return;
    state.today = now;
    const busy = document.querySelector('dialog[open]') || document.activeElement?.tagName === 'TEXTAREA';
    if (!busy && app.querySelector('.tabs')) render();
  });
}

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  state.installEvent = event;
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}

boot();
