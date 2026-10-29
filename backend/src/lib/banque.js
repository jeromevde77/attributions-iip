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
  return { format: null, mouvements: [] };
}

/** Un IBAN se vérifie (modulo 97 de la norme ISO 13616). Rend la forme groupée, ou null. */
export function ibanValide(v) {
  const s = String(v || '').replace(/\s+/g, '').toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{8,30}$/.test(s)) return null;
  const r = (s.slice(4) + s.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55));
  if (BigInt(r) % 97n !== 1n) return null;
  return s.replace(/(.{4})/g, '$1 ').trim();
}
