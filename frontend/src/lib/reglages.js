import { useEffect, useRef, useState } from 'react';
import { authHeaders } from './api.js';
import { poserDesign } from './design.js';
import { poser as poserCouleurs } from './couleurs.js';
import { passeRole, peutGeste } from './droits.js';

/**
 * RÉGLER UN ÉLÉMENT LÀ OÙ ON LE VOIT (3.1.262, Charles, 10 octobre 2026 : « je dois
 * pouvoir un peu éditer tout cela »). Formes et couleurs se lisent et s'écrivent ici
 * ensemble : le catalogue des éléments règle chaque famille sous son spécimen,
 * comme l'atelier règle un bloc. Mêmes routes, mêmes droits que Formes et
 * composants (administrateur) et Thèmes et couleurs (geste configuration.couleurs) ;
 * application immédiate, enregistrement une demi-seconde après le dernier geste.
 */
export function useReglagesVisuels() {
  const [design, setDesign] = useState(null), [catDesign, setCatDesign] = useState({});
  const [couleurs, setCouleurs] = useState(null), [catCouleurs, setCatCouleurs] = useState({}), [gris, setGris] = useState('ardoise');
  const [etat, setEtat] = useState('');
  const tD = useRef(null), tC = useRef(null);
  const peutFormes = passeRole(['admin']);
  const peutCouleurs = peutGeste('configuration.couleurs') || passeRole(['admin']);

  useEffect(() => {
    fetch('/api/config/design', { headers: authHeaders() }).then(r => r.json()).then(j => { setDesign(j.design || {}); setCatDesign(j.catalogue || {}); }).catch(() => {});
    fetch('/api/config/couleurs', { headers: authHeaders() }).then(r => r.json()).then(j => { setCouleurs(j.couleurs || {}); setCatCouleurs(j.catalogue || {}); setGris(j.gris || 'ardoise'); }).catch(() => {});
  }, []);

  function changerForme(cle, v) {
    if (!peutFormes) return;
    const n = { ...design, [cle]: v }; setDesign(n); poserDesign(n);
    clearTimeout(tD.current); setEtat('…');
    tD.current = setTimeout(async () => {
      const r = await fetch('/api/config/design', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ design: n }) });
      setEtat(r.ok ? '✓ enregistré' : 'Refusé');
    }, 500);
  }
  function changerCouleur(cle, v) {
    if (!peutCouleurs) return;
    const n = { ...couleurs }; if (v) n[cle] = v; else delete n[cle];
    setCouleurs(n); poserCouleurs({ [cle]: v || null });
    clearTimeout(tC.current); setEtat('…');
    tC.current = setTimeout(async () => {
      const r = await fetch('/api/config/couleurs', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ couleurs: n, gris }) });
      setEtat(r.ok ? '✓ enregistré' : 'Refusé');
    }, 500);
  }
  /** Plusieurs couleurs d'un coup (un jeu de couleurs) : un seul enregistrement. */
  function changerCouleurs(jeu) {
    if (!peutCouleurs) return;
    const n = { ...couleurs, ...jeu }; setCouleurs(n); poserCouleurs(jeu);
    clearTimeout(tC.current); setEtat('…');
    tC.current = setTimeout(async () => {
      const r = await fetch('/api/config/couleurs', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ couleurs: n, gris }) });
      setEtat(r.ok ? '✓ enregistré' : 'Refusé');
    }, 300);
  }
  /** La couleur montrée pour une clé : réglée, sinon son défaut, sinon celle qu'elle suit (lue à l'écran). */
  function couleurDe(cle) {
    if (couleurs?.[cle]) return couleurs[cle];
    if (catCouleurs[cle]?.valeur) return catCouleurs[cle].valeur;
    const suit = catCouleurs[cle]?.suit || '';
    const m = /^texte à (\d+)/.exec(suit);
    if (m) { // le mélange du texte et du blanc, comme le fait le CSS
      const k = Number(m[1]) / 100, t = couleurDe('texte').slice(1).match(/../g).map(x => parseInt(x, 16));
      return '#' + t.map(c => Math.round(255 - (255 - c) * k).toString(16).padStart(2, '0')).join('').toUpperCase();
    }
    if (catCouleurs[suit]) return couleurDe(suit);
    const v = getComputedStyle(document.documentElement).getPropertyValue(`--c-${suit}`).trim();
    return /^#[0-9a-fA-F]{6}$/.test(v) ? v : '#FFFFFF';
  }
  return { design, catDesign, couleurs, catCouleurs, etat, peutFormes, peutCouleurs, changerForme, changerCouleur, changerCouleurs, couleurDe };
}
