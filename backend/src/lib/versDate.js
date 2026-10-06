// Lucie — Lire une date telle qu'elle arrive : ISO, « 31/01/1983 », ou
// « 31 janvier 1983 » (les fiches reprises d'eCampus portent les deux).
// Sortie de routes/importSurMesure.js pour servir aussi aux statistiques.
/** Les dates arrivent sous quatre formes ; une valeur illisible ne vaut rien. */
const MOIS = {
  janvier: 1, fevrier: 2, mars: 3, avril: 4, mai: 5, juin: 6, juillet: 7,
  aout: 8, septembre: 9, octobre: 10, novembre: 11, decembre: 12,
};
export function versDate(v) {
  if (v == null || v === '') return null;
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  const num = /^(\d{1,2})[/.\- ](\d{1,2})[/.\- ](\d{2,4})$/.exec(s);
  if (num) {
    const a = num[3].length === 2 ? (Number(num[3]) > 30 ? '19' : '20') + num[3] : num[3];
    return `${a}-${num[2].padStart(2, '0')}-${num[1].padStart(2, '0')}`;
  }
  const l = /^(\d{1,2})\s*(?:er)?\s+([a-zéûôùîà]+)\s+(\d{4})$/i.exec(s);
  if (l) {
    const m = MOIS[l[2].toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')];
    if (m) return `${l[3]}-${String(m).padStart(2, '0')}-${l[1].padStart(2, '0')}`;
  }
  return null;
}
