import { useEffect, useState } from 'react';
import { authHeaders } from './api.js';

/**
 * LE MODE MISE EN PAGE (3.1.256, Charles, 10 octobre 2026 : « je veux pouvoir
 * paramétrer en glisser-déposer les pages principales — toutes les pages, mais
 * juste l'admin »). L'administrateur l'allume depuis la barre du haut ; les axes
 * de la barre, les rubriques des rails et les blocs des pages se déplacent alors
 * à la souris, sur les pages elles-mêmes. Ce qu'il range vaut pour toute l'école
 * (`lucie_config` « mise_en_page »). Hors du mode, rien ne bouge.
 *   axes  : ['/accueil', '/etudiants', …]          l'ordre de la barre du haut
 *   rails : { <titre de l'axe> : [[clé, …], …] }   les groupes du rail
 *   pages : { <page> : { ordre: [bloc…], masques: [bloc…], demis: [bloc…] } }
 */
const etat = { actif: false, conf: { axes: null, rails: {}, pages: {} } };
const abonnes = new Set();
const prevenir = () => abonnes.forEach(f => f());
let charge = null;

export function chargerMiseEnPage() {
  if (!charge) charge = fetch('/api/config/mise-en-page', { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : {})).then(j => { etat.conf = { axes: null, rails: {}, pages: {}, ...(j.conf || {}) }; prevenir(); })
    .catch(() => {});
  return charge;
}
/** Relire après une annulation (3.1.267). */
export function rechargerMiseEnPage() { charge = null; return chargerMiseEnPage(); }
export function useMiseEnPage() {
  const [, setN] = useState(0);
  useEffect(() => { const f = () => setN(n => n + 1); abonnes.add(f); chargerMiseEnPage(); return () => { abonnes.delete(f); }; }, []);
  return etat;
}
export function basculerMiseEnPage() { etat.actif = !etat.actif; prevenir(); }

let minuterie = null;
function enregistrer() {
  clearTimeout(minuterie);
  minuterie = setTimeout(() => {
    fetch('/api/config/mise-en-page', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ conf: etat.conf }) }).catch(() => {});
  }, 400);
}
// Une annulation commence : ce qui attendait d'être écrit ne doit pas réécrire après elle.
if (typeof window !== 'undefined') window.addEventListener('lucie:reglages-avant', e => { if (e.detail?.quoi === 'mise_en_page') clearTimeout(minuterie); });
export function changerMiseEnPage(f) { etat.conf = f(structuredClone(etat.conf)); prevenir(); enregistrer(); }

/** Déplacer `de` juste avant `vers` dans une liste. */
export function deplacer(liste, de, vers) {
  const l = liste.filter(x => x !== de);
  const i = l.indexOf(vers);
  l.splice(i < 0 ? l.length : i, 0, de);
  return l;
}
/** Le geste de glisser, sur un élément : `cle` se dépose sur une autre clé du même ensemble. */
export function poigneeGlisser(actif, ensemble, cle, surDepot) {
  if (!actif) return {};
  return {
    draggable: true,
    onDragStart: e => { e.dataTransfer.setData('text/lucie', `${ensemble}|${cle}`); e.dataTransfer.effectAllowed = 'move'; },
    onDragOver: e => { if ([...e.dataTransfer.types].includes('text/lucie')) { e.preventDefault(); e.currentTarget.dataset.survol = '1'; } },
    onDragLeave: e => { delete e.currentTarget.dataset.survol; },
    onDrop: e => {
      e.preventDefault(); delete e.currentTarget.dataset.survol;
      const [ens, de] = String(e.dataTransfer.getData('text/lucie')).split('|');
      if (ens === ensemble && de && de !== cle) surDepot(de, cle);
    },
    'data-glissable': '1',
  };
}
