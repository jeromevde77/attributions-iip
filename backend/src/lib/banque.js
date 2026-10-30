// ─────────────────────────────────────────────────────────────────────────────
// Lucie — Les extraits de compte (3.1.444, Charles, 29 octobre 2026 : « un système qui
// vérifie sur le compte en banque ce qui a été payé » ; première solution retenue :
// l'import des extraits, pas la liaison automatique avec la banque).
//
// LA CLÉ EST LA COMMUNICATION STRUCTURÉE. Sans elle, un virement ne se rattache à un
// étudiant qu'en devinant d'après un nom ou un montant. Lucie la CALCULE — elle ne se
// stocke pas, elle se relit : 10 chiffres (les deux derniers de l'année de début, puis le
// numéro du dossier sur 8 chiffres) et le reste de la division par 97 (97 s'il est nul),
// la règle belge du « +++ddd/dddd/ddddd+++ ». Un virement qui la porte dit donc à lui seul
// quel étudiant et quelle année il paie.
//
// Deux formats d'extrait, ceux que toutes les banques belges fournissent : CODA (lignes
// de 128 caractères) et CAMT.053 (XML ISO 20022). On ne lit que les CRÉDITS : un débit
// du compte n'est pas un versement d'étudiant.
// ─────────────────────────────────────────────────────────────────────────────

const pad = (s, n) => String(s).padStart(n, '0');

/** La communication structurée d'un étudiant pour une année : « +++260/0001/23484+++ ». */
export function communicationStructuree(etudiantId, annee) {
  const yy = String(annee || '').slice(2, 4);
  const id = Number(etudiantId);
  if (!/^\d\d$/.test(yy) || !Number.isInteger(id) || id <= 0 || id > 99999999) return null;
  const base = yy + pad(id, 8);
  const ctl = pad((Number(BigInt(base) % 97n)) || 97, 2);
  const c = base + ctl;
  return `+++${c.slice(0, 3)}/${c.slice(3, 7)}/${c.slice(7)}+++`;
}

/** Douze chiffres valides (contrôle modulo 97) → { etudiant_id, annee } ; sinon null. */
export function lireCommunication(douze) {
  const c = String(douze || '').replace(/\D/g, '');
  if (c.length !== 12) return null;
  const base = c.slice(0, 10), ctl = Number(c.slice(10));
  if (((Number(BigInt(base) % 97n)) || 97) !== ctl) return null;
  const yy = Number(base.slice(0, 2)), id = Number(base.slice(2));
  if (!id) return null;
  const debut = 2000 + yy;
  return { etudiant_id: id, annee: `${debut}-${debut + 1}`, communication: `+++${c.slice(0, 3)}/${c.slice(3, 7)}/${c.slice(7)}+++` };
}

/** Une communication structurée cachée dans un texte libre (« +++260/0001/23484+++ »,
 *  « 260000123484 », « ***…*** ») : la première suite de douze chiffres qui passe le contrôle. */
export function chercherCommunication(texte) {
  const t = String(texte || '');
  const candidats = t.match(/(?:\+{3}|\*{3})?\s*\d{3}\s*\/?\s*\d{4}\s*\/?\s*\d{5}\s*(?:\+{3}|\*{3})?/g) || [];
  for (const k of candidats) { const x = lireCommunication(k); if (x) return x; }
  return null;
}

const dateCoda = s => (/^\d{6}$/.test(s) ? `20${s.slice(4, 6)}-${s.slice(2, 4)}-${s.slice(0, 2)}` : null);

/** CODA : enregistrements 2.1 (mouvement), 2.2 / 2.3 (suite de communication, contrepartie).
 *  Positions de la norme Febelfin, comptées à partir de 1. */
export function lireCoda(texte) {
  const lignes = String(texte).split(/\r?\n/);
  const mouvements = [];
  let compte = null, cur = null;
  for (const l of lignes) {
    if (l.startsWith('1')) compte = l.slice(5, 42).trim() || compte;
    if (l.startsWith('21')) {
      const signe = l[31] === '1' ? -1 : 1;
      const montant = signe * Number(l.slice(32, 47)) / 1000;
      const structuree = l[61] === '1';
      const comm = l.slice(62, 115);
      cur = {
        ref: `coda:${l.slice(10, 31).trim()}:${l.slice(2, 10)}:${l.slice(121, 124)}:${l.slice(115, 121)}`,
        date: dateCoda(l.slice(115, 121)) || dateCoda(l.slice(47, 53)),
        montant,
        communication: structuree && comm.slice(0, 3) === '101' ? comm.slice(3, 15) : comm.trim(),
        structuree: structuree && comm.slice(0, 3) === '101',
        nom: '', compte_tiers: '', compte,
      };
      mouvements.push(cur);
    } else if (cur && l.startsWith('22')) {
      if (!cur.structuree) cur.communication = (cur.communication + ' ' + l.slice(10, 63).trim()).trim();
    } else if (cur && l.startsWith('23')) {
      cur.compte_tiers = l.slice(10, 47).trim();
      cur.nom = l.slice(47, 82).trim();
      if (!cur.structuree) cur.communication = (cur.communication + ' ' + l.slice(82, 125).trim()).trim();
    } else if (l.startsWith('8') || l.startsWith('9')) cur = null;
  }
  return mouvements;
}

const balise = (xml, nom) => { const m = new RegExp(`<(?:\\w+:)?${nom}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nom}>`).exec(xml); return m ? m[1].trim() : ''; };
const toutes = (xml, nom) => { const r = new RegExp(`<(?:\\w+:)?${nom}\\b[^>]*>([\\s\\S]*?)</(?:\\w+:)?${nom}>`, 'g'); const o = []; let m; while ((m = r.exec(xml))) o.push(m[1]); return o; };
const texteXml = s => String(s || '').replace(/<[^>]+>/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&apos;/g, "'").replace(/&quot;/g, '"').replace(/\s+/g, ' ').trim();

/** CAMT.053 : une <Ntry> par mouvement ; la communication structurée dans
 *  RmtInf/Strd/CdtrRefInf/Ref, la libre dans RmtInf/Ustrd. */
export function lireCamt(xml) {
  const compte = texteXml(balise(balise(balise(xml, 'Acct'), 'Id'), 'IBAN'));
  return toutes(xml, 'Ntry').map((n, i) => {
    const montant = Number(texteXml(balise(n, 'Amt')).replace(',', '.')) * (texteXml(balise(n, 'CdtDbtInd')) === 'DBIT' ? -1 : 1);
    const ref = texteXml(balise(n, 'AcctSvcrRef')) || texteXml(balise(n, 'NtryRef')) || texteXml(balise(n, 'EndToEndId'));
    const strd = texteXml(balise(balise(n, 'CdtrRefInf'), 'Ref'));
    const ustrd = toutes(n, 'Ustrd').map(texteXml).join(' ');
    const dbtr = balise(n, 'Dbtr');
    const date = texteXml(balise(balise(n, 'BookgDt'), 'Dt')) || texteXml(balise(balise(n, 'ValDt'), 'Dt'));
    return {
      ref: `camt:${ref || `${date}:${i}:${montant}`}`,
      date: date.slice(0, 10) || null,
      montant,
      communication: strd || ustrd,
      structuree: !!strd,
      nom: texteXml(balise(dbtr, 'Nm')),
      compte_tiers: texteXml(balise(balise(n, 'DbtrAcct'), 'IBAN')),
      compte,
    };
  });
}

/** Le format se reconnaît au contenu, pas à l'extension. */
export function lireExtrait(texte) {
  const t = String(texte || '').replace(/^﻿/, '');
  if (/<(?:\w+:)?BkToCstmrStmt\b/.test(t)) return { format: 'CAMT.053', mouvements: lireCamt(t) };
  if (/^0{5}/.test(t) && /\n21/.test(t)) return { format: 'CODA', mouvements: lireCoda(t) };
  const csv = lireCsv(t);
  if (csv) return { format: 'CSV', mouvements: csv };
  return { format: null, mouvements: [] };
}

/* LE CSV DE LA BANQUE EN LIGNE (3.1.448, Charles : « on peut prévoir aussi un import CSV »). Chaque
   banque a ses colonnes et sa langue ; on les reconnaît à leur INTITULÉ, en français ou en néerlandais
   (BNP Paribas Fortis, Belfius, ING, KBC…), jamais à leur place. Il faut au moins une date, un montant
   (ou un débit et un crédit) et une communication ; sinon ce n'est pas un extrait, et on le dit. */
const sansAcc = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
// Les motifs se lisent DANS L'ORDRE : le premier qui trouve une colonne libre l'emporte (« Nom de la
// contrepartie » avant « Contrepartie », qui chez BNP Paribas Fortis est le numéro de compte).
const COLONNES = [
  ['ref', [/^(numero de sequence|n. de sequence|numero de transaction|numero de mouvement|reference|reference bancaire|volgnummer|transactienummer|referentie|transaction id)$/]],
  ['date', [/^date d.execution$/, /^date de comptabilisation$/, /^date comptable$/, /^(boekingsdatum|uitvoeringsdatum)$/, /^date$/, /^datum$/, /^booking date$/, /^date (de )?valeur$/, /^valutadatum$/]],
  ['montant', [/^montant( \(eur\))?$/, /^montant de l.operation$/, /^bedrag( \(eur\))?$/, /^amount$/]],
  ['credit', [/^credit$/, /^(bedrag )?credit$/]],
  ['debit', [/^debit$/, /^(bedrag )?debet$/]],
  ['nom', [/^nom( de la)? contrepartie( contient)?$/, /^nom du donneur d.ordre$/, /^naam (van de )?tegenpartij( bevat)?$/, /^donneur d.ordre$/, /^tegenpartij$/]],
  ['compte', [/^(numero de )?compte( de la)? contrepartie$/, /^compte partie adverse$/, /^iban contrepartie$/, /^rekening(nummer)? tegenpartij$/, /^tegenrekening$/, /^contrepartie$/]],
];
// La communication peut tenir en plusieurs colonnes (KBC : structurée ET libre ; ING : libellés, détails,
// message) : on les réunit toutes.
const COMMUNICATION = /^(communications?( structuree| libre)?|mededelingen?|communicatie|gestructureerde mededeling|vrije mededeling|details( du mouvement)?|libelles?|omschrijving|message|description)$/;
function decouperLigne(l, sep) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < l.length; i++) {
    const c = l[i];
    if (q) { if (c === '"' && l[i + 1] === '"') { cur += '"'; i++; } else if (c === '"') q = false; else cur += c; }
    else if (c === '"') q = true; else if (c === sep) { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out.map(x => x.trim());
}
const nombre = v => {
  let s = String(v || '').replace(/[\s€]|EUR/g, '');
  if (!s) return null;
  if (/,\d{1,2}$/.test(s)) s = s.replace(/\./g, '').replace(',', '.'); else s = s.replace(/,/g, '');
  const n = Number(s); return Number.isFinite(n) ? n : null;
};
const dateCsv = v => {
  const s = String(v || '').trim();
  let m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s); if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s); if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  return null;
};
function empreinte(s) { let h = 2166136261; for (const c of s) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); }
export function lireCsv(texte) {
  const lignes = String(texte).split(/\r?\n/).filter(l => l.trim());
  if (lignes.length < 2) return null;
  // L'en-tête est la première ligne qui nomme une date ET un montant (certaines banques mettent un titre au-dessus).
  for (let h = 0; h < Math.min(lignes.length, 30); h++) {
    for (const sep of [';', ',', '\t']) {
      const tetes = decouperLigne(lignes[h], sep).map(sansAcc);
      if (tetes.length < 3) continue;
      const col = {}, pris = new Set();
      for (const [k, motifs] of COLONNES) {
        for (const m of motifs) {
          const i = tetes.findIndex((t, j) => !pris.has(j) && m.test(t));
          if (i >= 0) { col[k] = i; pris.add(i); break; }
        }
      }
      const comms = tetes.map((t, j) => (!pris.has(j) && COMMUNICATION.test(t) ? j : -1)).filter(j => j >= 0);
      if (col.date == null || !comms.length || (col.montant == null && col.credit == null)) continue;
      const vus = new Map();
      const mouvements = [];
      for (const l of lignes.slice(h + 1)) {
        const c = decouperLigne(l, sep);
        const date = dateCsv(c[col.date]);
        let montant = col.montant != null ? nombre(c[col.montant]) : null;
        if (montant == null && col.credit != null) {
          const cr = nombre(c[col.credit]), db = col.debit != null ? nombre(c[col.debit]) : null;
          montant = cr ? Math.abs(cr) : db ? -Math.abs(db) : null;
        }
        if (!date || montant == null) continue;
        const communication = [...new Set(comms.map(j => c[j]).filter(Boolean))].join(' ');
        const nom = col.nom != null ? c[col.nom] || '' : '';
        const compte = col.compte != null ? c[col.compte] || '' : '';
        let ref = col.ref != null && c[col.ref] ? `csv:${c[col.ref]}` : null;
        if (!ref) {
          // Sans référence de la banque : l'empreinte de la ligne, et son rang parmi les lignes identiques
          // — le même fichier réimporté redonne les mêmes références, deux virements identiques restent deux.
          const base = [date, montant.toFixed(2), communication, nom, compte].join('|');
          const n = (vus.get(base) || 0) + 1; vus.set(base, n);
          ref = `csv:${empreinte(base)}:${n}`;
        }
        mouvements.push({ ref, date, montant: Math.round(montant * 100) / 100, communication, structuree: false,
          nom, compte_tiers: compte, compte: null });
      }
      return mouvements;
    }
  }
  return null;
}

/** Un IBAN se vérifie (modulo 97 de la norme ISO 13616). Rend la forme groupée, ou null. */
export function ibanValide(v) {
  const s = String(v || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s)) return null;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  if (BigInt(r) % 97n !== 1n) return null;
  return s.replace(/(.{4})/g, '$1 ').trim();
}

/* LE QR CODE DE PAIEMENT (3.1.445, Charles : « un QR code à scanner — cela évitera les erreurs de
   communication »). Le format européen EPC (« BCD », version 002), que lisent les applications
   bancaires : bénéficiaire, IBAN, montant et communication sont remplis d'office, l'étudiant n'a
   plus rien à recopier. La communication structurée belge part dans la zone libre, sous sa forme
   « +++…+++ » : c'est là que les applications belges la reconnaissent, et l'import des extraits
   la retrouve de toute façon dans le texte (`chercherCommunication`). */
export function chargeEpc({ iban, beneficiaire, montant, communication }) {
  const i = String(iban || '').replace(/\s+/g, '').toUpperCase();
  if (!ibanValide(i) || !communication) return null;
  const nom = String(beneficiaire || 'Institut Ilya Prigogine').normalize('NFC').slice(0, 70);
  const m = Number(montant) > 0 && Number(montant) <= 999999999.99 ? `EUR${Number(montant).toFixed(2)}` : '';
  return ['BCD', '002', '1', 'SCT', '', nom, i, m, '', '', communication].join('\n');
}

/** Un QR code en SVG, dessiné sans dépendre d'une police ni d'une image : il s'imprime net. */
export async function qrSvg(texte, taille = 120) {
  if (!texte) return '';
  const QR = (await import('qrcode')).default;
  const q = QR.create(texte, { errorCorrectionLevel: 'M' });
  const n = q.modules.size, marge = 4, tot = n + 2 * marge;
  let d = '';
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (q.modules.get(x, y)) d += `M${x + marge},${y + marge}h1v1h-1z`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${taille}" height="${taille}" viewBox="0 0 ${tot} ${tot}" shape-rendering="crispEdges"><rect width="${tot}" height="${tot}" fill="#fff"/><path d="${d}" fill="#000"/></svg>`;
}
