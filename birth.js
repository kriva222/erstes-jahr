// Birth details: reading what people type, and showing it the German way.
const LIMITS = {
  weightG: [300, 7000],
  heightCm: [25, 70],
  headCm: [18, 50],
};
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const inRange = (value, [min, max]) => Number.isFinite(value) && value >= min && value <= max;

// Accepts 3450, 3.450, "3450 g", "3,45" and "3,45 kg".
export function parseWeight(text) {
  const cleaned = String(text).trim().toLowerCase().replace(/\s*(kilogramm|kg|gramm|g)$/, '').trim();
  let grams = NaN;
  if (/^\d{3,4}$/.test(cleaned)) grams = Number(cleaned);
  else if (/^\d{1,2}[.,]\d{1,3}$/.test(cleaned)) grams = Math.round(Number(cleaned.replace(',', '.')) * 1000);
  return inRange(grams, LIMITS.weightG) ? grams : null;
}

// Accepts 52, 34,5, 34.5 and "34,5 cm".
export function parseCm(text, field) {
  const cleaned = String(text).trim().toLowerCase().replace(/\s*(zentimeter|cm)$/, '').trim();
  if (!/^\d{2}([.,]\d{1,2})?$/.test(cleaned)) return null;
  const value = Number(cleaned.replace(',', '.'));
  return inRange(value, LIMITS[field]) ? value : null;
}

// Also protects against anything unexpected in a restored backup.
export function cleanDetails(raw) {
  const number = (value, limits) => (inRange(value, limits) ? value : null);
  return {
    time: TIME.test(raw?.time ?? '') ? raw.time : '',
    weightG: number(raw?.weightG, LIMITS.weightG),
    heightCm: number(raw?.heightCm, LIMITS.heightCm),
    headCm: number(raw?.headCm, LIMITS.headCm),
  };
}

export const hasDetails = (details) =>
  Boolean(details.time || details.weightG || details.heightCm || details.headCm);

export const formatWeight = (grams) => `${grams.toLocaleString('de-DE')} g`;
export const formatCm = (cm) => `${cm.toLocaleString('de-DE')} cm`;
export const formatTime = (time) => `${time} Uhr`;

export function detailRows(details) {
  return [
    ['Uhrzeit', details.time ? formatTime(details.time) : null],
    ['Gewicht', details.weightG ? formatWeight(details.weightG) : null],
    ['Größe', details.heightCm ? formatCm(details.heightCm) : null],
    ['Kopfumfang', details.headCm ? formatCm(details.headCm) : null],
  ];
}

// Newborn pandas weigh roughly 100 g, so this is a playful comparison, not a measurement.
export const pandaCount = (grams) => Math.round(grams / 100);
