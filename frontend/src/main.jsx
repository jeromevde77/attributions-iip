import React from 'react';
import { ReponsesTypesHote } from './lib/reponsesTypes.jsx';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App.jsx';
import { Dialogues } from './lib/dialogue.jsx';
import './index.css';
// LES COULEURS DE SIGNIFICATION SE POSENT AVANT LE PREMIER RENDU : un badge
// HELB qui change de couleur une seconde après l'affichage se remarque plus
// qu'une couleur fausse.
import { chargerCouleurs } from './lib/couleurs.js';

chargerCouleurs();
import('./lib/design.js').then(m => m.chargerDesign()).catch(() => {});

/* UNE MISE À JOUR PENDANT QU'ON TRAVAILLE NE DOIT PAS FINIR EN ERREUR
   (« Importing a module script failed », 3 octobre 2026). Chaque version
   renomme les morceaux de l'application ; une page ouverte avant la mise à
   jour réclame alors un morceau qui n'existe plus. On recharge, une fois —
   la garde évite une boucle si le serveur était réellement injoignable. */
function rechargerApresMiseAJour(e) {
  try {
    const dernier = Number(sessionStorage.getItem('lucie_rechargement') || 0);
    if (Date.now() - dernier < 30000) return;   // déjà tenté il y a moins de 30 s
    sessionStorage.setItem('lucie_rechargement', String(Date.now()));
  } catch { /* stockage indisponible : on recharge quand même */ }
  e?.preventDefault?.();
  window.location.reload();
}
window.addEventListener('vite:preloadError', rechargerApresMiseAJour);

/* PAS DE REMPLISSAGE AUTOMATIQUE DU NAVIGATEUR DANS LUCIE (Charles, 3 octobre
   2026 : « j'ai cela partout dans les champs, c'est insupportable »). Safari et
   Chrome reconnaissent « nom », « prénom » dans un champ et y proposent les
   contacts et les saisies passées, par-dessus les listes de Lucie. Un champ
   qui DÉCLARE son remplissage (connexion : username, current-password,
   one-time-code) le garde ; tous les autres le perdent — aussi ceux qui
   naissent plus tard, d'où l'observateur. */
let compteurChamps = 0;
/* LE CORRECTEUR ET LES CHAMPS D'IDENTITÉ (12 octobre 2026, Charles : « un correcteur pour ce qu'on
   écrit, pas dans les champs de saisie de nom » ; « j'insiste : enlève la complétion automatique
   dans les champs de nom »). Un seul endroit, comme le remplissage : aucun écran n'a rien à faire.
     · Ce qu'on ÉCRIT (zone de texte, éditeur, titre, motif) : correcteur du navigateur, en français.
     · Un champ d'IDENTITÉ (nom, prénom, matricule, NISS, adresse, téléphone, courriel, code,
       recherche…) : ni correcteur, ni majuscule automatique, ni complétion — même s'il en
       déclarait une. Il se reconnaît à son type, à son nom, à son libellé ou à son texte d'invite.
     · La connexion seule garde son remplissage (identifiant, mot de passe, code à usage unique).
   `data-correcteur="non"` retire le correcteur d'un champ ; `="oui"` le force. */
const CONNEXION = new Set(['username', 'current-password', 'new-password', 'one-time-code']);
const IDENTITE = /\b(nom|noms|pr[ée]noms?|name|matricule|niss|registre|national|courriel|e-?mail|mail|adresse|rue|commune|localit[ée]|postal|cp|t[ée]l[ée]phone|t[ée]l|gsm|num[ée]ro|iban|bic|code|recherche|rechercher|chercher|search|filtre|identifiant|login|date|ann[ée]e|section|ue)\b/i;
const TYPES_IDENTITE = new Set(['email', 'tel', 'number', 'date', 'time', 'datetime-local', 'month', 'url', 'search', 'password']);
function libelleDe(c) {
  const morceaux = [c.getAttribute('name'), c.id, c.getAttribute('placeholder'), c.getAttribute('aria-label'), c.getAttribute('title')];
  const l = c.closest('label') || (c.id && document.querySelector(`label[for="${CSS.escape(c.id)}"]`));
  if (l) morceaux.push(l.textContent.slice(0, 80));
  return morceaux.filter(Boolean).join(' ').replace(/[_-]/g, ' ');
}
function regler(c) {
  if (c.dataset.lucieChamp) return;
  c.dataset.lucieChamp = '1';
  const declare = c.getAttribute('autocomplete');
  if (declare && CONNEXION.has(declare)) return;                    // la connexion garde le sien
  const force = c.dataset.correcteur;
  if (c.isContentEditable || c.tagName === 'TEXTAREA') {
    const oui = force !== 'non';
    c.setAttribute('spellcheck', oui ? 'true' : 'false');
    if (oui) c.setAttribute('lang', 'fr');
    if (c.tagName === 'TEXTAREA') c.setAttribute('autocomplete', 'off');
    return;
  }
  if (c.tagName !== 'INPUT') return;
  const type = (c.getAttribute('type') || 'text').toLowerCase();
  if (['checkbox', 'radio', 'file', 'hidden', 'submit', 'button', 'range', 'color'].includes(type)) return;
  const identite = force === 'non' || (force !== 'oui' && (TYPES_IDENTITE.has(type) || IDENTITE.test(libelleDe(c))));
  c.setAttribute('autocomplete', 'off');
  c.setAttribute('data-lpignore', 'true');      // gestionnaires de mots de passe
  c.setAttribute('data-1p-ignore', 'true');
  c.setAttribute('data-form-type', 'other');
  // SAFARI PASSE OUTRE « off » quand il croit voir un champ de nom et propose les contacts. Il ne
  // remplit jamais un champ dont le NOM contient « search » : c'est la seule parade qui tienne.
  if (!c.getAttribute('name')) c.setAttribute('name', `search_lucie_${++compteurChamps}`);
  if (identite) {
    c.setAttribute('spellcheck', 'false');
    c.setAttribute('autocorrect', 'off');
    c.setAttribute('autocapitalize', 'off');
  } else {
    c.setAttribute('spellcheck', 'true');
    c.setAttribute('lang', 'fr');
  }
}
function sansRemplissage(racine) {
  if (racine.nodeType === 1 && (racine.matches?.('input, textarea, [contenteditable]'))) regler(racine);
  const champs = racine.querySelectorAll ? racine.querySelectorAll('input, textarea, [contenteditable]') : [];
  for (const c of champs) regler(c);
}
sansRemplissage(document);
new MutationObserver(lots => {
  for (const l of lots) for (const n of l.addedNodes) if (n.nodeType === 1) sansRemplissage(n);
}).observe(document.documentElement, { childList: true, subtree: true });
// Un champ dont le libellé arrive après lui (rendu en deux temps) est revu quand on y entre.
document.addEventListener('focusin', e => {
  const c = e.target;
  if (c && (c.tagName === 'INPUT' || c.tagName === 'TEXTAREA' || c.isContentEditable)) { delete c.dataset.lucieChamp; regler(c); }
}, true);
window.addEventListener('unhandledrejection', e => {
  const m = String(e?.reason?.message || e?.reason || '');
  if (/Importing a module script failed|Failed to fetch dynamically imported module|error loading dynamically imported module/i.test(m)) {
    rechargerApresMiseAJour(e);
  }
});

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <BrowserRouter>
      <App />
      <Dialogues />
      <ReponsesTypesHote />
    </BrowserRouter>
  </React.StrictMode>
);
