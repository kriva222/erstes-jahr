// Twelve animal friends, one for each month of the first year. Original drawings on a
// 100 x 100 grid, in natural colours that read on both the light and the night background.
const INK = '#2b2320';

const eye = (x, y, r = 3.6) =>
  `<circle cx="${x}" cy="${y}" r="${r}" fill="${INK}"/><circle cx="${x + r * 0.3}" cy="${y - r * 0.35}" r="${r * 0.3}" fill="#fff"/>`;
const eyes = (y, gap = 14, r = 3.6) => eye(50 - gap, y, r) + eye(50 + gap, y, r);
const cheeks = (y, gap = 24) =>
  `<ellipse cx="${50 - gap}" cy="${y}" rx="5.5" ry="3.5" fill="#f29d8b" opacity=".6"/><ellipse cx="${50 + gap}" cy="${y}" rx="5.5" ry="3.5" fill="#f29d8b" opacity=".6"/>`;
const smile = (y, color = INK) =>
  `<path d="M50 ${y}v2.5M50 ${y + 2.5}q-3.500 4-7 1M50 ${y + 2.500}q3.500 4 7 1" fill="none" stroke="${color}" stroke-width="1.700" stroke-linecap="round"/>`;

function spikes(cx, cy, outer, inner, count) {
  const points = [];
  for (let i = 0; i < count * 2; i++) {
    const radius = i % 2 ? inner : outer;
    const angle = (i / (count * 2)) * 2 * Math.PI;
    points.push(`${(cx + radius * Math.sin(angle)).toFixed(1)},${(cy - radius * Math.cos(angle)).toFixed(1)}`);
  }
  return points.join(' ');
}

function woolRing() {
  let circles = '<circle cx="50" cy="48" r="30" fill="#d9cbb4"/>';
  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * 2 * Math.PI;
    circles += `<circle cx="${(50 + 28 * Math.sin(angle)).toFixed(1)}" cy="${(50 - 28 * Math.cos(angle)).toFixed(1)}" r="12" fill="#d9cbb4"/>`;
  }
  return circles;
}

export const ANIMALS = [
  {
    key: 'panda',
    name: 'Panda',
    fact: 'Pandababys wiegen bei der Geburt nur rund 100 Gramm. Dagegen wirkt jedes Menschenbaby riesig.',
    shape: `<circle cx="24" cy="26" r="12" fill="#33363a"/><circle cx="76" cy="26" r="12" fill="#33363a"/>
      <ellipse cx="50" cy="54" rx="36" ry="33" fill="#f8f6f1" stroke="#cfcbc2" stroke-width="1.200"/>
      <ellipse cx="35" cy="50" rx="9" ry="11" transform="rotate(18 35 50)" fill="#33363a"/>
      <ellipse cx="65" cy="50" rx="9" ry="11" transform="rotate(-18 65 50)" fill="#33363a"/>
      <circle cx="36" cy="49" r="3.200" fill="#fff"/><circle cx="64" cy="49" r="3.200" fill="#fff"/>
      <ellipse cx="50" cy="63" rx="4.500" ry="3.200" fill="#33363a"/>${smile(66, '#33363a')}${cheeks(70, 25)}`,
  },
  {
    key: 'igel',
    name: 'Igel',
    fact: 'Igel sind vor allem nachts unterwegs. Wer gerade viele Nächte wach ist, versteht das sofort.',
    shape: `<polygon points="${spikes(50, 52, 46, 35, 22)}" fill="#7a5a43"/>
      <ellipse cx="50" cy="62" rx="27" ry="24" fill="#f2dcbc"/>${eyes(56, 11, 3.400)}
      <circle cx="50" cy="66" r="4.200" fill="${INK}"/>${smile(69)}${cheeks(69, 19)}`,
  },
  {
    key: 'otter',
    name: 'Seeotter',
    fact: 'Seeotter-Mütter tragen ihr Junges beim Schwimmen auf dem Bauch. Der schönste Schlafplatz ist eben oft ein warmer Bauch.',
    shape: `<circle cx="23" cy="33" r="8" fill="#7b583d"/><circle cx="77" cy="33" r="8" fill="#7b583d"/>
      <ellipse cx="50" cy="54" rx="35" ry="32" fill="#92704f"/>
      <ellipse cx="50" cy="66" rx="25" ry="18" fill="#f0e0c9"/>${eyes(46, 15)}
      <ellipse cx="50" cy="58" rx="5" ry="3.500" fill="${INK}"/>${smile(61)}
      <path d="M29 62l-12-3M29 68l-12 1M71 62l12-3M71 68l12 1" stroke="#5d4433" stroke-width="1.200" stroke-linecap="round"/>`,
  },
  {
    key: 'elefant',
    name: 'Elefant',
    fact: 'Elefantenkälber brauchen viele Monate, bis sie ihren Rüssel richtig beherrschen. Greifen will eben geübt sein.',
    shape: `<ellipse cx="18" cy="46" rx="17" ry="24" fill="#8f9da6"/><ellipse cx="82" cy="46" rx="17" ry="24" fill="#8f9da6"/>
      <ellipse cx="18" cy="46" rx="10" ry="16" fill="#e9b8ae"/><ellipse cx="82" cy="46" rx="10" ry="16" fill="#e9b8ae"/>
      <circle cx="50" cy="45" r="30" fill="#a9b5bc"/>
      <path d="M41 58C41 76 46 88 56 91C63 92 65 85 60 83C54 81 54 72 59 58Z" fill="#a9b5bc"/>
      ${eyes(41, 13)}${cheeks(54, 21)}`,
  },
  {
    key: 'eule',
    name: 'Eule',
    fact: 'Eulen können ihren Kopf um rund 270 Grad drehen. Das wäre beim Babysitten sehr praktisch.',
    shape: `<polygon points="19,32 22,8 41,24" fill="#856545"/><polygon points="81,32 78,8 59,24" fill="#856545"/>
      <ellipse cx="50" cy="55" rx="36" ry="36" fill="#9c7a58"/>
      <circle cx="34" cy="48" r="16" fill="#f5ead7"/><circle cx="66" cy="48" r="16" fill="#f5ead7"/>
      ${eye(34, 48, 6.500)}${eye(66, 48, 6.500)}
      <polygon points="44,58 56,58 50,69" fill="#e9a23b"/>
      <path d="M37 78q4 4 8 0M47 80q3 4 7 0M56 78q3 4 7 0" fill="none" stroke="#d6bb97" stroke-width="1.800" stroke-linecap="round"/>`,
  },
  {
    key: 'hase',
    name: 'Feldhase',
    fact: 'Junge Feldhasen kommen mit Fell und offenen Augen zur Welt. Sie sehen sich also von Anfang an alles ganz genau an.',
    shape: `<ellipse cx="35" cy="24" rx="9.500" ry="23" fill="#c6b198"/><ellipse cx="65" cy="24" rx="9.500" ry="23" fill="#c6b198"/>
      <ellipse cx="35" cy="26" rx="4.500" ry="15" fill="#f2b8ab"/><ellipse cx="65" cy="26" rx="4.500" ry="15" fill="#f2b8ab"/>
      <ellipse cx="50" cy="63" rx="30" ry="28" fill="#d3c0a9"/>${eyes(58, 13)}
      <polygon points="46,65 54,65 50,70" fill="#d9786c"/>${smile(69)}${cheeks(70, 20)}`,
  },
  {
    key: 'eichhoernchen',
    name: 'Eichhörnchen',
    fact: 'Eichhörnchen verstecken Vorräte und finden längst nicht alle wieder. Mit Schnullern kann das genauso laufen.',
    shape: `<path d="M76 92C103 74 99 28 74 26C87 44 70 56 66 74Z" fill="#b9622d"/>
      <polygon points="26,32 23,9 42,25" fill="#b9622d"/><polygon points="72,32 75,9 56,25" fill="#b9622d"/>
      <ellipse cx="49" cy="56" rx="30" ry="29" fill="#d08344"/>
      <ellipse cx="49" cy="67" rx="20" ry="16" fill="#f4e3c9"/>${eye(36, 52)}${eye(62, 52)}
      <ellipse cx="49" cy="62" rx="3.800" ry="2.800" fill="${INK}"/>
      <rect x="45.500" y="69" width="7" height="6" rx="1.500" fill="#fff" stroke="#d8c6ac" stroke-width=".8"/>`,
  },
  {
    key: 'baer',
    name: 'Bär',
    fact: 'Bärenjunge kommen während der Winterruhe ihrer Mutter zur Welt. Und auch danach wird viel gekuschelt.',
    shape: `<circle cx="25" cy="26" r="12" fill="#946440"/><circle cx="75" cy="26" r="12" fill="#946440"/>
      <circle cx="25" cy="26" r="6.500" fill="#c9a07e"/><circle cx="75" cy="26" r="6.500" fill="#c9a07e"/>
      <circle cx="50" cy="54" r="35" fill="#a8774f"/>
      <ellipse cx="50" cy="67" rx="16" ry="13" fill="#eedcc3"/>${eyes(47, 14)}
      <ellipse cx="50" cy="61" rx="5.500" ry="3.800" fill="${INK}"/>${smile(64)}${cheeks(62, 25)}`,
  },
  {
    key: 'schaf',
    name: 'Schaf',
    fact: 'Schafe und ihre Lämmer erkennen sich an der Stimme, auch mitten in einer großen Herde.',
    shape: `<ellipse cx="17" cy="56" rx="11" ry="6" transform="rotate(14 17 56)" fill="#8d7868"/>
      <ellipse cx="83" cy="56" rx="11" ry="6" transform="rotate(-14 83 56)" fill="#8d7868"/>${woolRing()}
      <ellipse cx="50" cy="60" rx="22" ry="25" fill="#f6ebdb"/>${eyes(56, 10, 3.400)}
      <ellipse cx="50" cy="66" rx="3.500" ry="2.500" fill="#8d7868"/>${smile(68, '#6f5c4e')}${cheeks(70, 14)}`,
  },
  {
    key: 'ente',
    name: 'Ente',
    fact: 'Entenküken folgen ihrer Mutter auf Schritt und Tritt. Wer schon einmal allein zur Toilette wollte, kennt das.',
    shape: `<path d="M50 24C42 18 42 8 49 6C48 12 53 12 56 9C57 15 55 20 50 24Z" fill="#e8b93f"/>
      <circle cx="50" cy="55" r="34" fill="#f5cf5b"/>${eyes(47, 14)}
      <ellipse cx="50" cy="66" rx="19" ry="9.500" fill="#ef9a3d"/>
      <path d="M33 65q17 5 34 0" fill="none" stroke="#c8741f" stroke-width="1.500" stroke-linecap="round"/>${cheeks(58, 26)}`,
  },
  {
    key: 'fuchs',
    name: 'Fuchs',
    fact: 'Füchse hören Mäuse sogar unter einer Schneedecke. Eltern hören bald genauso jedes leise Piepsen.',
    shape: `<polygon points="16,44 15,6 45,28" fill="#d97a2e"/><polygon points="84,44 85,6 55,28" fill="#d97a2e"/>
      <polygon points="15,6 16,19 27,14" fill="#3b2c26"/><polygon points="85,6 84,19 73,14" fill="#3b2c26"/>
      <path d="M13 42Q50 18 87 42Q83 73 50 92Q17 73 13 42Z" fill="#e18a3d"/>
      <path d="M13 46Q30 51 40 68Q46 79 50 92Q19 74 13 46Z" fill="#fbf3e6"/>
      <path d="M87 46Q70 51 60 68Q54 79 50 92Q81 74 87 46Z" fill="#fbf3e6"/>
      ${eyes(52, 16)}<circle cx="50" cy="81" r="4.500" fill="${INK}"/>`,
  },
  {
    key: 'reh',
    name: 'Reh',
    fact: 'Rehkitze stehen schon kurz nach der Geburt auf ihren Beinen. Wackelig ist das am Anfang natürlich auch.',
    shape: `<ellipse cx="20" cy="36" rx="15" ry="8" transform="rotate(24 20 36)" fill="#b98d5f"/>
      <ellipse cx="80" cy="36" rx="15" ry="8" transform="rotate(-24 80 36)" fill="#b98d5f"/>
      <ellipse cx="21" cy="36" rx="9" ry="4.200" transform="rotate(24 21 36)" fill="#f2c4b7"/>
      <ellipse cx="79" cy="36" rx="9" ry="4.200" transform="rotate(-24 79 36)" fill="#f2c4b7"/>
      <ellipse cx="50" cy="54" rx="28" ry="35" fill="#c9a06f"/>
      <circle cx="42" cy="28" r="2.500" fill="#f5ead7"/><circle cx="55" cy="25" r="2.500" fill="#f5ead7"/><circle cx="50" cy="35" r="2.500" fill="#f5ead7"/>
      <ellipse cx="50" cy="76" rx="15" ry="12" fill="#f3e4cf"/>${eyes(53, 13, 4.400)}
      <ellipse cx="50" cy="72" rx="4.500" ry="3.200" fill="${INK}"/>${smile(75)}${cheeks(65, 19)}`,
  },
];

// The Steckbrief has its own companion, separate from the twelve monthly animals:
// short ears, a tapered snout and thick cheek fluff, drawn twice for one clean outline.
const foxCoat = (paint) => `<g ${paint} stroke-linejoin="round">
    <path d="M15 46C13 30 16 17 24 13C33 16 43 25 47 35Z"/>
    <path d="M85 46C87 30 84 17 76 13C67 16 57 25 53 35Z"/>
    <ellipse cx="50" cy="51" rx="35" ry="26"/>
    <circle cx="17" cy="58" r="9"/><circle cx="83" cy="58" r="9"/>
    <circle cx="23" cy="68" r="8.500"/><circle cx="77" cy="68" r="8.500"/>
    <path d="M25 66Q38 86 50 92Q62 86 75 66Z"/></g>`;

export const POLAR_FOX = {
  key: 'polarfuchs',
  name: 'Polarfuchs',
  shape: `${foxCoat('fill="#b8c5ce" stroke="#b8c5ce" stroke-width="2.600"')}${foxCoat('fill="#f7f9fb"')}
    <path d="M22 38C21 29 23 23 26 21C31 23 36 28 39 34Z" fill="#f0c9c0" stroke="#f0c9c0" stroke-width="2" stroke-linejoin="round"/>
    <path d="M78 38C79 29 77 23 74 21C69 23 64 28 61 34Z" fill="#f0c9c0" stroke="#f0c9c0" stroke-width="2" stroke-linejoin="round"/>
    <path d="M34 62Q50 54 66 62Q61 78 50 87Q39 78 34 62Z" fill="#ffffff"/>
    ${eyes(51, 16)}<circle cx="50" cy="72" r="4.200" fill="${INK}"/>${smile(75)}${cheeks(62, 27)}`,
};

export const faceSvg = (animal) =>
  `<svg viewBox="0 0 100 100" aria-hidden="true">${animal.shape}</svg>`;
