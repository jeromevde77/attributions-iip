// ─────────────────────────────────────────────────────────────────────────────
// TOUTE PIÈCE A UN MODÈLE (Charles, 9 octobre 2026 : « plein de documents ne
// sont pas éditables »).
//
// Les pièces dont le texte a été découpé finement (attestations, motivations,
// PV, aménagements…) ont leur modèle propre, écrit à côté du code qui les
// compose. Toutes les autres — bulletin, frais, fiches, listes, rapports —
// reçoivent ici un modèle COMMUN, posé à la SORTIE de la pièce, quelle que
// soit l'enveloppe qui l'a composée :
//   · le contenu calculé est UN bloc verrouillé ;
//   · on écrit AVANT et APRÈS lui (sous l'en-tête, au-dessus de la signature) ;
//   · on règle la police de la pièce et la taille du texte ajouté ;
//   · on RÉÉCRIT une phrase fixe (« Programme retenu » → « Votre programme ») :
//     le remplacement ne touche que le texte, jamais une balise, et ne vaut
//     que là où la phrase figure telle quelle.
//
// La pièce est reconnue par la route qui la produit — celle que la galerie
// appelle, avec les mêmes paramètres fixes. Une route qui ne correspond à
// aucune pièce de la galerie ne reçoit rien : on ne retouche pas ce qu'on ne
// sait pas nommer.
// ─────────────────────────────────────────────────────────────────────────────

import { parse } from 'node-html-parser';
import { MODELES, declarerModele, blocModele, modeleEnVigueur, brouillonDeLaRequete,
         STYLE_MODELE, POLICES, TAILLES } from './modelesPieces.js';
import { identiteEtablissement } from '../routes/config.js';

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export const CHAMPS_GENERIQUES = { date_jour: 'Date du jour', ville: 'Ville', directeur: 'Directeur', etablissement: "Nom de l'établissement" };

let PIECES = null;          // [{ id, methode, re, query, corps }]

/** Déclare le modèle commun des pièces qui n'en ont pas, et prépare la reconnaissance des routes. */
export function preparerHabillage(documents) {
  const liste = [];
  for (const d of documents) {
    if (!d.modeles?.length) {
      const cle = `piece_${d.id}`.replace(/[^a-z0-9_]/gi, '_').toLowerCase();
      if (!MODELES[cle]) {
        declarerModele(cle, {
          libelle: d.libelle, galerie: d.id, generique: true, champs: CHAMPS_GENERIQUES,
          blocs: { contenu: 'Contenu de la pièce (calculé par Lucie)' },
          obligatoires: { blocs: ['contenu'] },
          defaut: blocModele('contenu'),
        });
      }
      d.modeles = [cle];
    }
    const a = d.appel || {};
    if (!a.chemin) continue;
    const re = new RegExp('^' + a.chemin.split('?')[0]
      .replace(/[.*+?^$()|[\]\\]/g, '\\$&').replace(/\\?\{[a-z_]+\\?\}/gi, '[^/]+') + '/?$');
    const fixes = o => Object.fromEntries(Object.entries(o || {})
      .filter(([, v]) => !(typeof v === 'string' && v.includes('{')) && !Array.isArray(v)));
    liste.push({ id: d.id, cle: d.modeles.find(c => MODELES[c]?.generique) || null,
      methode: a.methode || 'GET', re, query: fixes(a.query), corps: fixes(a.corps) });
  }
  PIECES = liste;
  return documents;
}

/** La pièce de la galerie que produit cette requête, ou null. La plus précise l'emporte. */
function pieceDe(req) {
  if (!PIECES) return null;
  const chemin = req.originalUrl.split('?')[0];
  let meilleure = null, score = -1;
  for (const p of PIECES) {
    if (!p.cle || p.methode !== req.method || !p.re.test(chemin)) continue;
    let n = 0, ok = true;
    for (const [k, v] of Object.entries(p.query)) { if (String(req.query?.[k]) === String(v)) n++; else ok = false; }
    for (const [k, v] of Object.entries(p.corps)) { if (JSON.stringify(req.body?.[k]) === JSON.stringify(v)) n++; else ok = false; }
    if (ok && n > score) { meilleure = p; score = n; }
  }
  return meilleure;
}

/** Applique le modèle commun à un document HTML complet. */
export function habiller(html, v) {
  if (typeof html !== 'string' || !/<body/i.test(html)) return html;
  const ident = identiteEtablissement() || {};
  const champs = {
    date_jour: new Date().toLocaleDateString('fr-BE', { day: 'numeric', month: 'long', year: 'numeric' }),
    ville: esc(ident.ville || 'Bruxelles'), directeur: esc(ident.directeur || ''), etablissement: esc(ident.nom || 'Institut Ilya Prigogine'),
  };
  const remplir = t => t.replace(/<span[^>]*\bdata-champ="([a-z0-9_]+)"[^>]*>[\s\S]*?<\/span>/g, (_, k) => champs[k] ?? '')
    .replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/g, (_, k) => champs[k] ?? '');
  const [avantBrut, apresBrut = ''] = String(v.contenu || '').split(/<div[^>]*\bdata-bloc="contenu"[^>]*>[\s\S]*?<\/div>/);
  const style = v.taille && TAILLES.includes(v.taille) ? ` style="--mp-taille:${v.taille}"` : '';
  const avant = avantBrut.replace(/<p>\s*<\/p>/g, '').trim() ? `<div class="modele-piece"${style}>${remplir(avantBrut)}</div>` : '';
  const apres = apresBrut.replace(/<p>\s*<\/p>/g, '').trim() ? `<div class="modele-piece"${style}>${remplir(apresBrut)}</div>` : '';

  const racine = parse(html, { comment: true, blockTextElements: { script: true, style: true, pre: true } });
  const corps = racine.querySelector('body');
  if (!corps) return html;
  const tete = racine.querySelector('head');
  const police = v.police && POLICES.includes(v.police)
    ? `body, body *:not(svg):not(svg *) { font-family: '${v.police}', Arial, sans-serif !important; }` : '';
  if (tete) tete.insertAdjacentHTML('beforeend', `<style>${STYLE_MODELE}${police}</style>`);

  if (avant || apres) {
    // Les pièces d'un lot (une par étudiant) reçoivent chacune leur texte.
    let cadres = corps.querySelectorAll('.attestation').filter(el => !el.parentNode?.closest?.('.attestation'));
    if (!cadres.length) cadres = [corps.querySelector('table.feuille > tbody > tr > td') || corps];
    for (const c of cadres) {
      if (avant) {
        const e = c.querySelector('.doc-entete');
        if (e) e.insertAdjacentHTML('afterend', avant); else c.insertAdjacentHTML('afterbegin', avant);
      }
      if (apres) {
        const clo = c.querySelector('.cloture');
        const pied = c.querySelector('.pied-lucie');
        if (clo) clo.insertAdjacentHTML('beforebegin', apres);
        else if (pied) pied.insertAdjacentHTML('beforebegin', apres);
        else c.insertAdjacentHTML('beforeend', apres);
      }
    }
  }

  const remp = v.remplacements || [];
  if (remp.length) {
    const marcher = n => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3) {
          let t = c.text, change = false;
          for (const r of remp) if (t.includes(r.avant)) { t = t.split(r.avant).join(r.apres); change = true; }
          if (change) c.rawText = esc(t);
        } else if (c.nodeType === 1 && !['style', 'script', 'svg'].includes(String(c.rawTagName || '').toLowerCase())) marcher(c);
      }
    };
    marcher(corps);
  }
  return racine.toString();
}

/** La version à appliquer pour cette requête, ou null s'il n'y a rien à faire. */
function versionPour(req) {
  const p = pieceDe(req);
  if (!p) return null;
  const b = brouillonDeLaRequete(p.cle);
  if (b) return { contenu: b.contenu || MODELES[p.cle].defaut, police: b.police, taille: b.taille, remplacements: b.remplacements || [] };
  const v = modeleEnVigueur(p.cle);
  return v.d_origine ? null : v;
}

/** Middleware : habille le HTML des réponses qui portent une pièce de la galerie. */
export function habillerReponses(req, res, next) {
  if (!req.originalUrl.startsWith('/api/') || req.originalUrl.startsWith('/api/documentation/modeles')) return next();
  const json = res.json.bind(res);
  res.json = (body) => {
    try {
      const v = body && typeof body === 'object' ? versionPour(req) : null;
      if (v) {
        for (const k of ['html', 'html_pv', 'attestation', 'provisoire', 'supplement']) {
          if (typeof body[k] === 'string') body[k] = habiller(body[k], v);
        }
        if (Array.isArray(body.documents)) for (const d of body.documents) if (d && typeof d.html === 'string') d.html = habiller(d.html, v);
        if (body.collectif?.html) body.collectif.html = habiller(body.collectif.html, v);
      }
    } catch (e) { console.error('[habillage]', e.message); }
    return json(body);
  };
  const send = res.send.bind(res);
  res.send = (body) => {
    try {
      if (typeof body === 'string' && /^\s*<!DOCTYPE html/i.test(body)) {
        const v = versionPour(req);
        if (v) body = habiller(body, v);
      }
    } catch (e) { console.error('[habillage]', e.message); }
    return send(body);
  };
  next();
}
