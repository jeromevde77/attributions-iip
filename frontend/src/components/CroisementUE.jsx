/**
 * LE CROISEMENT ACQUIS × PROGRAMME (Charles, 8 octobre 2026 : le classeur de
 * l'UE 335, « tableau AA et contenus programme par cours » — « je veux faire
 * cela pour toutes les UE »).
 *
 * L'ORDRE DU TRAVAIL (Charles, le même jour : « 1) croisement cours/AA, on
 * coche ; 2) cela complète le DUE et la matrice de pondération — la pondération
 * en dépend directement ») :
 *   1. Pour chaque cours, la grille est remplie d'office : TOUS les acquis de
 *      l'unité en colonnes, TOUS les points du programme de ce cours en lignes
 *      (le descriptif s'il les a écrits, sinon le dossier pédagogique). On coche.
 *   2. L'enregistrement en tire le reste :
 *      - le tableau des critères du descriptif suit les croix (une ligne
 *        « acquis + point du programme » par croix ; une croix retirée retire
 *        sa ligne tant qu'aucun indicateur n'y a été écrit ; les lignes posées à
 *        la main dans le descriptif ne sont jamais touchées) ;
 *      - la pondération de l'année : les dix points de chaque cours répartis
 *        au prorata des croix, par pas de 0,5. Elle s'écrit pour qui a le droit
 *        de pondérer (direction, secrétariat) ; pour les autres, elle s'affiche
 *        et attend.
 *
 * Les croix vivent avec le descriptif (`due.contenu.croisement`, par cours puis
 * par point) : elles suivent ses droits et son gel à la validation. Un point
 * ajouté ici s'ajoute au programme du descriptif : une seule liste de points.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { useEnregistrementAuto } from '../lib/enregistrementAuto.js';
import { IconCheck, IconDeviceFloppy, IconAlertTriangle, IconPlus, IconPencil, IconTrash, IconHeading } from '@tabler/icons-react';
import { demander, saisir } from '../lib/dialogue.jsx';
import { api, authHeaders, getAnnee, getUser } from '../lib/api.js';
import { useDroits } from '../lib/droits.js';
import { EnteteCarte, Tableau, Th, Tr, TrTotal, TableauVide, Encadre } from './ui.jsx';
import { blocsDepuisPoints, lireProgramme } from '../pages/DUE.jsx';
import { decouperProgramme, memeCours, texteVersHtml } from '../lib/texteDossier.js';
const majuscule = t => String(t ?? '').replace(/^([«"“(\s]*)(\p{Ll})/u, (m, a, b) => a + b.toUpperCase());

const ANNEE_POINTS = '2026-2027';
const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
const fr = n => Number(n || 0).toLocaleString('fr-BE', { maximumFractionDigits: 1 });
const echap = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Les points d'un bloc mis en page : ses puces, à défaut ses paragraphes. */
function pointsDuBloc(html) {
  if (!html) return [];
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  /* UN POINT, C'EST LA PUCE PRINCIPALE AVEC SES SOUS-PUCES (14 octobre 2026, UE 333) : « définir les
     notions suivantes : » ne se comprend qu'avec ce qu'elle énumère. On ne prend que les puces de
     premier niveau, leur texte et celui de leurs sous-puces mis bout à bout ; une sous-puce n'est
     pas un point à croiser à part. */
  const texteDe = e => {
    const ps = [...e.querySelectorAll('p')];
    return ps.length ? ps.map(p => p.textContent.trim()).filter(Boolean).join(' ') : e.textContent;
  };
  let el = [...doc.querySelectorAll('li')].filter(li => !li.parentElement?.closest('li'));
  if (!el.length) el = [...doc.querySelectorAll('p')];
  return [...new Set(el.map(e => norm(texteDe(e))).filter(t => t.length > 3))];
}
/* LES PUCES TELLES QUE LE DOSSIER LES DONNE (3.1.383, Charles, 15 octobre 2026 : « que les puces soient
   les bonnes ») : la clé d'un point reste son texte entier (les croix déjà posées tiennent), mais il
   s'affiche comme dans le dossier — la puce principale, ses sous-puces dessous. */
function structureDuBloc(html) {
  const m = {};
  if (!html) return m;
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  for (const li of [...doc.querySelectorAll('li')].filter(x => !x.parentElement?.closest('li'))) {
    const tout = norm([...li.querySelectorAll('p')].map(p => p.textContent.trim()).filter(Boolean).join(' ') || li.textContent);
    const propre = li.querySelector(':scope > p')?.textContent || '';
    const sous = [...li.querySelectorAll(':scope > ul > li, :scope > ol > li')].map(x => ({
      texte: norm(x.querySelector(':scope > p')?.textContent || x.textContent),
      sous: [...x.querySelectorAll(':scope > ul > li')].map(y => norm(y.textContent)),
    }));
    m[tout] = { principal: norm(propre) || tout, sous };
  }
  return m;
}

/** Le texte brut d'un bloc HTML (pour l'introduction du dossier). */
function texteDe(html) {
  if (!html) return '';
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, 'text/html');
  return [...doc.body.querySelectorAll('p, li')].map(x => x.textContent.trim()).filter(Boolean).join('\n') || doc.body.textContent.trim();
}
function BoutonChapeau({ titre, onClick, discret = false }) {
  return (
    <button type="button" title={titre} aria-label={titre} onClick={onClick}
      className={`flex-none inline-flex items-center gap-1 text-mention not-italic text-slate-500 hover:text-iip-blue ${discret ? 'opacity-40 group-hover/aa:opacity-100 focus:opacity-100' : ''}`}>
      <IconHeading size={14} />{discret ? null : 'Chapeau'}</button>);
}

/** Dix points répartis au prorata des croix, par pas de 0,5, somme exacte. */
export function proposer(comptes) {
  const total = Object.values(comptes).reduce((s, n) => s + n, 0);
  if (!total) return {};
  const demi = Object.entries(comptes).map(([aa, n]) => ({ aa, brut: (n / total) * 20 }));
  const out = Object.fromEntries(demi.map(x => [x.aa, Math.floor(x.brut)]));
  let reste = 20 - Object.values(out).reduce((s, n) => s + n, 0);
  for (const x of [...demi].sort((a, b) => (b.brut % 1) - (a.brut % 1))) { if (reste <= 0) break; out[x.aa] += 1; reste -= 1; }
  return Object.fromEntries(Object.entries(out).map(([aa, n]) => [aa, n / 2]));
}

export default function CroisementUE({ ueNum, onEnregistre, suivante = null }) {
  const annee = getAnnee();
  const { passe } = useDroits();
  const [d, setD] = useState(null);
  const [croix, setCroix] = useState({});
  const [ajouts, setAjouts] = useState({});          // cours → points ajoutés ici
  const [saisie, setSaisie] = useState({});
  const [sale, setSale] = useState(false);
  const [liens, setLiens] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(false);
  /* MODIFIER ET SUPPRIMER UN POINT, PAS SEULEMENT EN AJOUTER (3.5.269, Charles : « on ne sait pas changer, on peut juste ajouter ;
     on doit pouvoir supprimer, modifier ou ajouter »). Dès qu'on touche aux points d'un cours, sa liste devient la nôtre
     (`contenu.points_croisement[cours]`, dans l'ordre) : le dossier pédagogique n'est pas modifié. Une croix suit son point
     renommé, et la ligne de critère qui en vient aussi (`renommes`). */
  const [liste, setListe] = useState({});
  const [renommes, setRenommes] = useState({});
  /* LES CHAPEAUX (3.5.359, Charles, 12 novembre 2026 : « il manque la partie chapeau général ; pouvoir ajouter un chapeau entre
     plusieurs AA ou cours »). Ceux du programme vivent dans la DUE de l'année (`contenu.chapeaux` : intro, cours, points) et partent
     avec le croisement ; ceux des acquis sont ceux de l'unité (phrase générale, chapeau d'un groupe d'acquis), écrits aussitôt. */
  const [chapeaux, setChapeaux] = useState({});
  const [dernierEnreg, setDernierEnreg] = useState(null);
  const [aaChap, setAaChap] = useState(null);       // { intro, parCode }

  async function charger() {
    try {
      const j = await api.dueLire(ueNum);
      setD(j); setCroix(j.contenu?.croisement || {}); setAjouts({}); setSale(false);
      setListe(j.contenu?.points_croisement || {}); setRenommes({});
      setChapeaux(j.contenu?.chapeaux || {});
      setAaChap({ intro: j.introduction_acquis || '', parCode: Object.fromEntries((j.acquis || []).map(a => [a.aa_code, a.chapeau || ''])) });
    } catch (e) { setErreur(e.message); }
    // La pondération actuelle : lue si l'on y a accès, sinon simplement tue.
    fetch(`/api/acquis/ue/${ueNum}/liens?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setLiens).catch(() => setLiens(null));
  }
  useEffect(() => { setMessage(null); setErreur(null); charger(); /* eslint-disable-next-line */ }, [ueNum]);

  const c = d?.contenu || {};
  // Les activités Z (développement professionnel) ne s'évaluent pas et ne comptent pas.
  const cours = (d?.cours || []).filter(x => String(x.ct_pp || '').toUpperCase() !== 'Z');
  const acquis = d?.acquis || [];
  const lecture = !d?.droits?.ecrire;
  // LA DIRECTION FIXE, LA COORDINATION PROPOSE (14 octobre 2026) : seule la direction écrit les poids.
  const peutPonderer = ['admin', 'directeur', 'directeur_adjoint'].includes(getUser()?.role) && annee >= ANNEE_POINTS;

  // TOUS LES POINTS, D'OFFICE. Le descriptif d'abord ; un cours qu'il laisse vide
  // reprend ceux du dossier pédagogique ; une unité d'un seul cours prend tout le
  // programme, faute d'intitulé de cours pour le découper.
  /* LE MÊME DÉCOUPAGE QUE LE DOSSIER PÉDAGOGIQUE (3.5.259, Charles : « compare le dossier pédagogique et l'étape 1 ») : l'étape 1
     lisait le programme avec son propre lecteur (lireProgramme), qui ne rangeait pas toujours les points sous le même cours que
     l'étape 0 — 15 unités sur 38 différaient. Elle lit désormais le programme du dossier comme l'étape 0 : decouperProgramme,
     cours par cours (memeCours), mis en page par texteVersHtml. L'ancien lecteur ne sert plus qu'à défaut de dossier. */
  const blocsDP = useMemo(() => {
    if (!d) return {};
    const prog = d.dp?.programme;
    if (prog && (/^###\s/m.test(prog) || cours.length === 1)) {
      const P = decouperProgramme(prog, cours.map(x => x.cours_nom).filter(Boolean));
      const m = { _intro: P.preambule ? texteVersHtml(P.preambule) : '' };
      for (const x of cours) { const b = P.cours.find(k => memeCours(k.nom, x.cours_nom)); m[x.cours_code] = b?.texte ? texteVersHtml(b.texte) : ''; }
      return m;
    }
    return blocsDepuisPoints(lireProgramme(prog || (d.points_programme || []).join('\n'), cours), cours);
  },
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [d]);
  const blocsDUE = useMemo(() => (d ? (c.programme_blocs ?? blocsDepuisPoints(
    c.points ?? lireProgramme(c.programme || d.dp?.programme || (d.points_programme || []).join('\n'), cours), cours)) : {}),
  // eslint-disable-next-line react-hooks/exhaustive-deps
  [d]);
  const pointsDe = useMemo(() => {
    const m = {};
    for (const x of cours) {
      /* LE DOSSIER PÉDAGOGIQUE D'ABORD (3.1.383) : le programme de la fiche d'UE, cours par cours, avec
         ses puces. Le descriptif ne sert qu'au cours que le dossier ne détaille pas. */
      let p = pointsDuBloc(blocsDP[x.cours_code]);
      if (!p.length) p = pointsDuBloc(blocsDUE[x.cours_code]);
      if (!p.length && cours.length === 1) p = pointsDuBloc(blocsDP._intro).filter(t => !/[,:]$/.test(t));
      m[x.cours_code] = p;
    }
    return m;
  }, [cours, blocsDUE, blocsDP]);
  const structure = useMemo(() => {
    const m = {};
    for (const x of cours) m[x.cours_code] = { ...structureDuBloc(blocsDUE[x.cours_code]), ...structureDuBloc(blocsDP[x.cours_code]) };
    return m;
  }, [cours, blocsDUE, blocsDP]);
  const pointsDOrigine = co => [...(pointsDe[co] || []), ...(ajouts[co] || []).filter(t => !(pointsDe[co] || []).includes(t))];
  const points = co => (Array.isArray(liste[co]) ? liste[co] : pointsDOrigine(co));
  const modifierPoint = async (co, pt) => {
    const t = norm(await saisir({ titre: 'Modifier le point du programme', message: 'Le texte du point (les croix posées le suivent) :', valeur: pt, confirmer: 'Modifier' }) || '');
    if (!t || t === pt) return;
    if (points(co).includes(t)) { setErreur('Ce point existe déjà dans ce cours.'); return; }
    setListe(l => ({ ...l, [co]: points(co).map(x => (x === pt ? t : x)) }));
    setCroix(x => { const m = { ...(x[co] || {}) }; if (m[pt]) { m[t] = m[pt]; delete m[pt]; } return { ...x, [co]: m }; });
    setRenommes(r => { const m = { ...(r[co] || {}) }; const origine = Object.keys(m).find(k => m[k] === pt) || pt; m[origine] = t; return { ...r, [co]: m }; });
    setChapeaux(ch => { const pts = { ...(ch.points?.[co] || {}) }; if (pts[pt] != null) { pts[t] = pts[pt]; delete pts[pt]; } return { ...ch, points: { ...(ch.points || {}), [co]: pts } }; });
    setSale(true); setMessage(null);
  };
  const supprimerPoint = async (co, pt) => {
    const n = (croix[co]?.[pt] || []).length;
    if (!(await demander({ titre: 'Supprimer ce point ?', message: `« ${pt.slice(0, 120)} »${n ? ` porte ${n} croix : elles partent avec lui.` : ''} Le dossier pédagogique n'est pas modifié.`, confirmer: 'Supprimer' }))) return;
    setListe(l => ({ ...l, [co]: points(co).filter(x => x !== pt) }));
    setCroix(x => { const m = { ...(x[co] || {}) }; delete m[pt]; return { ...x, [co]: m }; });
    setChapeaux(ch => { const pts = { ...(ch.points?.[co] || {}) }; delete pts[pt]; return { ...ch, points: { ...(ch.points || {}), [co]: pts } }; });
    setSale(true); setMessage(null);
  };
  /* Écrire un chapeau : une phrase, vide pour le retirer. */
  const demanderChapeau = async (titre, valeur) => {
    const t = await saisir({ titre, message: 'La phrase qui introduit ce qui suit (vide pour retirer le chapeau) :', valeur: valeur || '', confirmer: 'Poser', multiligne: true });
    return t == null ? null : String(t).trim();
  };
  const chapeauProgramme = async (zone, co, pt) => {
    const actuelT = zone === 'intro' ? (chapeaux.intro ?? texteDe(blocsDP._intro)) : zone === 'cours' ? chapeaux.cours?.[co] : chapeaux.points?.[co]?.[pt];
    const t = await demanderChapeau(zone === 'intro' ? 'Introduction commune du programme' : zone === 'cours' ? `Chapeau au-dessus du cours ${co}` : 'Chapeau avant ce point', actuelT);
    if (t == null) return;
    setChapeaux(ch => zone === 'intro' ? { ...ch, intro: t }
      : zone === 'cours' ? { ...ch, cours: { ...(ch.cours || {}), [co]: t } }
        : { ...ch, points: { ...(ch.points || {}), [co]: { ...(ch.points?.[co] || {}), [pt]: t } } });
    setSale(true); setMessage(null);
  };
  const chapeauAcquis = async (code) => {
    const t = await demanderChapeau(code ? `Chapeau avant ${code}` : 'Phrase qui introduit tous les acquis', code ? aaChap?.parCode?.[code] : aaChap?.intro);
    if (t == null) return;
    try {
      const r = await fetch(`/api/due/${ueNum}/chapeaux-acquis`, { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(code ? { chapeaux: { [code]: t } } : { introduction: t }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Chapeau refusé.');
      setAaChap({ intro: j.introduction?.texte || '', parCode: Object.fromEntries((j.acquis || []).map(a => [a.aa_code, a.chapeau || ''])) });
    } catch (e) { setErreur(e.message); }
  };

  const actuel = useMemo(() => {
    const m = {};
    for (const l of liens?.liens || []) (m[l.cours_code] ||= {})[l.aa_code] = Number(l.poids) || 0;
    return m;
  }, [liens]);

  const coche = (co, pt, aa) => (croix[co]?.[pt] || []).includes(aa);
  const basculer = (co, pt, aa) => {
    if (lecture || enCours) return;   // pendant l'envoi automatique, la grille se recharge : un clic s'y perdrait
    setMessage(null); setSale(true);
    setCroix(x => {
      const l = x[co]?.[pt] || [];
      const n = l.includes(aa) ? l.filter(k => k !== aa) : [...l, aa];
      return { ...x, [co]: { ...(x[co] || {}), [pt]: n } };
    });
  };
  /* L'AIDE DE L'IA (3.5.415) : des propositions, jamais des croix. Elles se lisent en pointillé, avec leur raison au survol ;
     l'équipe les coche une à une, ou toutes d'un geste. */
  const [ia, setIa] = useState(null);          // { liens, manques } | null
  const [iaEnCours, setIaEnCours] = useState(false);
  const proposeIA = (co, pt, aa) => (ia?.liens || []).find(l => l.cours === co && l.point === pt && l.acquis.includes(aa)) || null;
  const demanderIA = async () => {
    setIaEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/due/${ueNum}/croisement/proposer`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({
        acquis: acquis.map(a => ({ code: a.aa_code, texte: a.description || '' })),
        cours: cours.map(x => ({ code: x.cours_code, nom: x.cours_nom || '', points: points(x.cours_code) })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'L’IA n’a pas répondu.');
      setIa(j);
    } catch (e) { setErreur(e.message); } finally { setIaEnCours(false); }
  };
  const toutCocherIA = () => {
    if (!ia || lecture) return;
    setMessage(null); setSale(true);
    setCroix(x => {
      const n = { ...x };
      for (const l of ia.liens) { const cur = n[l.cours]?.[l.point] || []; n[l.cours] = { ...(n[l.cours] || {}), [l.point]: [...new Set([...cur, ...l.acquis])] }; }
      return n;
    });
  };
  const ajouterTexte = (co, texte) => {
    const t = norm(texte);
    if (t.length < 4 || points(co).includes(t)) return;
    if (Array.isArray(liste[co])) setListe(l => ({ ...l, [co]: [...l[co], t] }));
    setAjouts(a => ({ ...a, [co]: [...(a[co] || []), t] })); setSale(true); setMessage(null);
  };
  const ajouterPoint = co => {
    const t = norm(saisie[co]);
    if (t.length < 4 || points(co).includes(t)) return;
    if (Array.isArray(liste[co])) setListe(l => ({ ...l, [co]: [...l[co], t] }));
    setAjouts(a => ({ ...a, [co]: [...(a[co] || []), t] }));
    setSaisie(s => ({ ...s, [co]: '' })); setSale(true); setMessage(null);
  };
  const comptes = co => {
    const m = Object.fromEntries(acquis.map(a => [a.aa_code, 0]));
    for (const pt of points(co)) for (const aa of croix[co]?.[pt] || []) if (aa in m) m[aa] += 1;
    return m;
  };
  const orphelins = co => Object.keys(croix[co] || {}).filter(pt => (croix[co][pt] || []).length && !points(co).includes(pt));

  async function enregistrer() {
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      // 1. Les croix des points qui existent, rien d'autre.
      const croisement = Object.fromEntries(cours.map(x => [x.cours_code, Object.fromEntries(
        points(x.cours_code).filter(pt => (croix[x.cours_code]?.[pt] || []).length)
          .map(pt => [pt, croix[x.cours_code][pt]]))]));

      // 2. Les points ajoutés ici rejoignent le programme du descriptif.
      let programme_blocs = c.programme_blocs;
      if (Object.values(ajouts).some(l => l?.length)) {
        programme_blocs = { ...blocsDUE };
        for (const [co, l] of Object.entries(ajouts)) {
          if (!l?.length) continue;
          const base = String(programme_blocs[co] || '').trim() || String(blocsDP[co] || '');
          programme_blocs[co] = base + `<ul>${l.map(t => `<li><p>${echap(t)}</p></li>`).join('')}</ul>`;
        }
      }

      /* 3. LE TABLEAU DES CRITÈRES SUIT LES CROIX — LE SERVEUR S'EN CHARGE (3.5.265, lib/grilleDuCroisement.js) : une ligne par
         acquis et par point croisé, le critère reformulé gardé, une croix retirée qui part si rien n'y est écrit. */
      const reprises = g => Object.values(g || {}).flat().filter(l => l?.src_point && !l.plus_croisee).length;
      const avantN = reprises(c.grille_criteres);
      // Un point renommé emmène sa ligne de critère (son origine, et son texte s'il n'avait pas été reformulé).
      const grille = JSON.parse(JSON.stringify(c.grille_criteres || {}));
      for (const [co, m] of Object.entries(renommes)) for (const [ancien, neuf] of Object.entries(m)) for (const lignes of Object.values(grille))
        for (const l of lignes || []) if (l && l.src_point === ancien && (!l.src_cours || l.src_cours === co)) { if (norm(l.point) === ancien) l.point = neuf; l.src_point = neuf; }
      const points_croisement = Object.fromEntries(Object.entries(liste).filter(([, v]) => Array.isArray(v)));
      // LA DATE DES CROIX, COURS PAR COURS (3.5.378) : l'étape 2 sait ainsi qu'une pondération enregistrée avant elles est une reprise.
      const avant = c.croisement || {};
      const maintenant = new Date().toISOString().replace('T', ' ').slice(0, 19);
      const croisement_le = { ...(c.croisement_le || {}) };
      for (const co of Object.keys(croisement)) if (JSON.stringify(croisement[co] || {}) !== JSON.stringify(avant[co] || {})) croisement_le[co] = maintenant;
      const rep = await api.dueEnregistrer(ueNum, { ...c, croisement, croisement_le, grille_criteres: grille, points_croisement, chapeaux,
        ...(programme_blocs ? { programme_blocs } : {}) });
      const apresN = reprises(rep?.contenu?.grille_criteres);
      const ajoutees = Math.max(0, apresN - avantN); const retirees = Math.max(0, avantN - apresN);

      /* 4. LA PONDÉRATION N'EST PLUS ÉCRITE ICI (3.5.254) : elle est PROPOSÉE à l'étape 2, en gris, d'après ces croix ; le référent,
         la coordination ou la direction la valide ou la change. */
      let ponderes = 0;
      if (false) {
        for (const x of cours) {
          const n = {};
          for (const a of acquis) n[a.aa_code] = 0;
          for (const pt of points(x.cours_code)) for (const aa of croisement[x.cours_code]?.[pt] || []) if (aa in n) n[aa] += 1;
          const prop = proposer(n);
          if (!Object.keys(prop).length) continue;
          const identique = acquis.every(a => (prop[a.aa_code] || 0) === (actuel[x.cours_code]?.[a.aa_code] || 0));
          if (identique) continue;
          const r = await fetch('/api/acquis/ponderations', { method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ ue_num: ueNum, cours_code: x.cours_code, annee,
              ponderations: acquis.map(a => ({ aa_code: a.aa_code, poids: prop[a.aa_code] || 0 })) }) });
          if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(`Pondération du cours ${x.cours_code} : ${j.error || r.status}`); }
          ponderes += 1;
        }
      }
      setDernierEnreg(new Date().toLocaleTimeString('fr-BE', { hour: '2-digit', minute: '2-digit' }));
      // La direction a fixé (ou confirmé) les pondérations : l'étape de la DUE est franchie.
      await charger();
      onEnregistre?.();
      setMessage(['Croisement enregistré',
        ajoutees || retirees ? `tableau des critères : ${ajoutees} ligne(s) ajoutée(s)${retirees ? `, ${retirees} retirée(s)` : ''}` : null,
        'la pondération qu’il propose vous attend à l’étape 2, à valider ou à changer'].filter(Boolean).join(' — ') + '.');
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  // AU CLIC (3.5.298) : une pause d'une seconde et demie après la dernière croix, et le croisement part seul.
  const traceAuto = useMemo(() => ({ croix, chapeaux }), [croix, chapeaux]);
  useEnregistrementAuto(traceAuto, { pret: sale && !!d && !lecture && !enCours, delai: 1500, enregistrer: () => enregistrer() });

  if (erreur && !d) return <p className="text-sm text-red-700">{erreur}</p>;
  if (!d) return <p className="text-sm text-slate-400">Chargement…</p>;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-second text-slate-600 m-0 mr-auto max-w-3xl">
          Pour chaque cours, cochez les acquis que sert chaque point de son programme. L’enregistrement
          en tire la pondération (étape 2) et le tableau des critères du descriptif (étape 3).
        </p>
        {/* PLUS DE BOUTON GRIS QUI FAIT CROIRE À UNE PANNE (3.5.378, réunion du 12/11 : « le bouton Enregistrer du haut n'est pas
            cliquable ») : l'étape s'enregistre seule ; on dit où on en est, et le bouton ne paraît que s'il reste quelque chose à envoyer. */}
        {!lecture && (enCours ? <span className="text-second text-slate-500">Enregistrement…</span>
          : sale ? <button className="bouton bouton-fort" onClick={enregistrer}><IconDeviceFloppy size={14} /> Enregistrer maintenant</button>
            : <span className="text-second text-slate-500 inline-flex items-center gap-1"><IconCheck size={14} /> Enregistré automatiquement{dernierEnreg ? ` à ${dernierEnreg}` : ''}</span>)}
      </div>
      {lecture && <p className="text-second text-slate-500 m-0">Lecture seule{d.statut === 'validee' ? ' : le descriptif est validé' : ''}.</p>}
      {erreur && <p className="text-second flex items-start gap-1.5 m-0" style={{ color: 'var(--c-refuse)' }}><IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}</p>}
      {message && (
        <p className="text-second text-slate-700 flex flex-wrap items-center gap-1.5 m-0"><IconCheck size={14} />{message}
          {suivante && <button type="button" className="underline text-iip-blue ml-1" onClick={suivante}>Étape suivante →</button>}</p>)}

      {/* LA LÉGENDE DES ACQUIS (Charles, 8 octobre 2026 : « il faut la légende des AA…
          c'est important »). Les colonnes ne portent que le code : sans le texte, on
          coche au jugé. */}
      {!lecture && acquis.length > 0 && cours.length > 0 && (
        <section className="carte overflow-hidden">
          <EnteteCarte titre="L’aide de l’IA" sous="Elle lit les acquis et les points du programme, et propose des croix — en pointillé, à relire : rien n’est coché sans vous.">
            <button type="button" className="bouton" disabled={iaEnCours} onClick={demanderIA}>
              {iaEnCours ? 'L’IA lit l’unité…' : ia ? 'Redemander' : 'Proposer avec l’IA'}</button>
            {ia?.liens?.length > 0 && <button type="button" className="bouton" onClick={toutCocherIA}>Cocher toutes les propositions ({ia.liens.reduce((t, l) => t + l.acquis.length, 0)})</button>}
            {ia && <button type="button" className="bouton" onClick={() => setIa(null)}>Effacer</button>}
          </EnteteCarte>
          {ia && (
            <div className="px-4 py-2 space-y-1 text-second">
              <p className="m-0 text-slate-500">{ia.liens.length ? `${ia.liens.length} point(s) relié(s) : les cases proposées sont en pointillé bleu, la raison s’affiche au survol.` : 'Aucune proposition.'}</p>
              {(ia.manques || []).map((m, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="flex-1 min-w-0"><b>{m.acquis}</b> n’est porté par aucun point{m.cours ? ` — à ajouter au cours ${m.cours}` : ''} : « {m.point_propose} »{m.raison ? <span className="text-slate-500"> · {m.raison}</span> : null}</span>
                  {m.cours && m.point_propose && cours.some(x => x.cours_code === m.cours) && (
                    <button type="button" className="bouton flex-none" onClick={() => ajouterTexte(m.cours, m.point_propose)}>Ajouter ce point à {m.cours}</button>)}
                </div>))}
            </div>)}
        </section>)}
      {/* UN ACQUIS QU'AUCUN POINT NE PORTE SE SIGNALE (3.5.414, Charles, UE 298 : « AA298.4 — nous devons compléter ce tableau ») :
          sans croix, il n'a aucun poids à l'étape 2 et ne s'évalue nulle part. Le remède est dans le cours où il s'enseigne :
          « Ajouter un point du programme à ce cours… », puis la croix. */}
      {acquis.length > 0 && cours.length > 0 && (() => {
        const porte = new Set();
        for (const x of cours) for (const pt of points(x.cours_code)) for (const aa of croix[x.cours_code]?.[pt] || []) porte.add(aa);
        const seuls = acquis.filter(a => !porte.has(a.aa_code));
        return seuls.length ? (
          <Encadre etat="surveiller" titre={`${seuls.map(a => a.aa_code).join(', ')} : porté${seuls.length > 1 ? 's' : ''} par aucun point du programme`}>
            Sans croix, un acquis n’a aucun poids à l’étape 2 et ne s’évalue dans aucun cours. Dans le cours où il s’enseigne, ajoutez le
            point qui le porte (« Ajouter un point du programme à ce cours… », au bas de son tableau), puis cochez sa colonne.
          </Encadre>) : null;
      })()}
      {acquis.length > 0 && (
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Acquis d’apprentissage de l’unité" />
          <div className="px-3 pt-2 text-second italic text-slate-700 flex items-start gap-2">
            <span className="flex-1 min-w-0 whitespace-pre-line">{aaChap?.intro || '—'}</span>
            {!lecture && <BoutonChapeau titre="Modifier la phrase qui introduit tous les acquis" onClick={() => chapeauAcquis(null)} />}
          </div>
          <dl className="m-0 px-3 py-2 grid gap-x-4 gap-y-1 text-second" style={{ gridTemplateColumns: 'max-content 1fr' }}>
            {acquis.map(a => (
              <div key={a.aa_code} className="contents">
                {aaChap?.parCode?.[a.aa_code] && <dd className="m-0 col-span-2 italic text-slate-700 pt-1 whitespace-pre-line">{aaChap.parCode[a.aa_code]}</dd>}
                <dt className="font-semibold text-iip-blue">{a.aa_code}</dt>
                <dd className="m-0 text-slate-700 flex items-start gap-2 group/aa">
                  {/* LES SOUS-POINTS SUR LEURS LIGNES (3.5.360) : ils vivent dans la description, une ligne « – … » chacun. */}
                  <span className="flex-1 min-w-0 whitespace-pre-line">{a.description || '—'}</span>
                  {!lecture && <BoutonChapeau titre={`Chapeau avant ${a.aa_code}`} discret onClick={() => chapeauAcquis(a.aa_code)} />}
                </dd>
              </div>))}
          </dl>
        </section>)}

      {cours.length > 0 && (chapeaux.intro || texteDe(blocsDP._intro) || !lecture) && (
        <section className="carte overflow-hidden">
          <EnteteCarte titre="Programme — introduction commune à tous les cours" />
          <div className="px-3 py-2 text-second italic text-slate-700 flex items-start gap-2">
            <span className="flex-1 min-w-0 whitespace-pre-line">{(chapeaux.intro ?? texteDe(blocsDP._intro)) || 'Aucune introduction.'}</span>
            {!lecture && <BoutonChapeau titre="Modifier l’introduction commune" onClick={() => chapeauProgramme('intro')} />}
          </div>
        </section>)}
      {cours.map(x => {
        const co = x.cours_code;
        const pts = points(co);
        const n = comptes(co);
        const total = Object.values(n).reduce((s, v) => s + v, 0);
        const prop = proposer(n);
        const lies = new Set(x.acquis || []);
        const orph = orphelins(co);
        const aActuel = !!actuel[co] && Object.keys(actuel[co]).length > 0;
        return (
          <section key={co} className="carte overflow-hidden">
            <EnteteCarte titre={`${co} — ${String(x.cours_nom || '').replace(/^\d+(\.\d+)+\.?\s*/, '')}`} sous={`${pts.length} point(s) du programme · ${total} croix`} />
            {(chapeaux.cours?.[co] || !lecture) && (
              <div className="px-3 py-1.5 text-second italic text-slate-700 flex items-start gap-2 border-b border-slate-200">
                <span className="flex-1 min-w-0 whitespace-pre-line">{chapeaux.cours?.[co] || <span className="not-italic text-slate-400">Pas de chapeau au-dessus de ce cours.</span>}</span>
                {!lecture && <BoutonChapeau titre="Chapeau au-dessus de ce cours" onClick={() => chapeauProgramme('cours', co)} />}
              </div>)}
            <Tableau dense className="!border-0 !rounded-none">
                <thead><tr className="tab-entete">
                  <Th align="droite" className="w-10 !px-2">N°</Th>
                  <Th>Point du programme</Th>
                  {acquis.map(a => (
                    <Th key={a.aa_code} align="centre" title={a.description} className={`!px-1.5 w-16 ${lies.has(a.aa_code) ? 'text-iip-blue' : 'text-slate-500 !font-normal'}`}>
                      {a.aa_code}
                    </Th>))}
                </tr></thead>
                <tbody>
                  {!pts.length && (
                    <TableauVide colonnes={acquis.length + 2}>
                      Le programme ne nomme aucun point pour ce cours. Ajoutez-les ci-dessous : ils rejoindront le descriptif.
                    </TableauVide>)}
                  {/* NUMÉROTÉS, ET UNE MAJUSCULE À CHAQUE POINT (3.5.165, Charles : « il faut que cela soit clair, numéroté ») : le
                      numéro est celui du point dans le cours (250.1 · 3) ; le texte du dossier n'est pas modifié, seul l'affichage. */}
                  {pts.map((pt, ip) => (<Fragment key={pt}>
                    {chapeaux.points?.[co]?.[pt] && (
                      <tr><td /><td colSpan={acquis.length + 1} className="px-3 pt-2 pb-0.5 text-second italic text-slate-700 whitespace-pre-line">{chapeaux.points[co][pt]}</td></tr>)}
                    <Tr className="align-top">
                      <td className="px-2 py-1.5 text-right tabular-nums text-slate-400">{ip + 1}</td>
                      <td className="px-3 py-1.5 text-slate-800 group/pt">
                        {!lecture && (
                          <span className="float-right ml-2 inline-flex gap-1.5 opacity-40 group-hover/pt:opacity-100 focus-within:opacity-100">
                            <button type="button" className="text-slate-500 hover:text-iip-blue" title="Chapeau avant ce point" aria-label="Chapeau avant ce point" onClick={() => chapeauProgramme('point', co, pt)}><IconHeading size={14} /></button>
                            <button type="button" className="text-slate-500 hover:text-iip-blue" title="Modifier ce point" aria-label="Modifier ce point" onClick={() => modifierPoint(co, pt)}><IconPencil size={14} /></button>
                            <button type="button" className="text-slate-500 hover:text-red-700" title="Supprimer ce point" aria-label="Supprimer ce point" onClick={() => supprimerPoint(co, pt)}><IconTrash size={14} /></button>
                          </span>)}
                        {(() => {
                          const st = structure[co]?.[pt];
                          if (!st || !st.sous.length) return majuscule(pt);
                          return (<>
                            {majuscule(st.principal)}
                            <ul className="list-[circle] pl-5 mt-0.5 mb-0 text-slate-600">
                              {st.sous.map((y, i) => <li key={i}>{y.texte}
                                {y.sous.length > 0 && <ul className="list-[square] pl-5 m-0">{y.sous.map((z, j) => <li key={j}>{z}</li>)}</ul>}</li>)}
                            </ul>
                          </>);
                        })()}
                      </td>
                      {acquis.map(a => {
                        const on = coche(co, pt, a.aa_code);
                        const pIA = !on ? proposeIA(co, pt, a.aa_code) : null;
                        return (
                          <td key={a.aa_code} className="text-center py-1">
                            <button type="button" disabled={lecture} onClick={() => basculer(co, pt, a.aa_code)}
                              aria-label={`${a.aa_code} — ${pt}`} aria-pressed={on}
                              title={pIA ? `Proposé par l’IA : ${pIA.raison}` : undefined}
                              className={`w-6 h-6 rounded-md border inline-grid place-items-center ${on ? 'text-white border-transparent' : pIA ? 'text-transparent' : 'border-slate-300 text-transparent'} ${lecture ? '' : 'hover:border-iip-blue'}`}
                              style={on ? { background: 'var(--c-principal)' } : pIA ? { border: '2px dashed var(--c-accent, #05B7E6)' } : undefined}>
                              <IconCheck size={14} />
                            </button>
                          </td>);
                      })}
                    </Tr></Fragment>))}
                  {!lecture && (
                    <tr>
                      <td />
                      <td colSpan={acquis.length + 1} className="px-3 py-1">
                        <div className="flex items-center gap-2">
                          <input className="controle flex-1 min-w-0 h-8" placeholder="Ajouter un point du programme à ce cours…"
                            value={saisie[co] || ''} onChange={e => setSaisie(s => ({ ...s, [co]: e.target.value }))}
                            onKeyDown={e => { if (e.key === 'Enter') ajouterPoint(co); }} />
                          <button type="button" className="bouton h-8" onClick={() => ajouterPoint(co)}><IconPlus size={13} /> Point</button>
                        </div>
                      </td>
                    </tr>)}
                </tbody>
                {/* LE PIED EN UNE LIGNE (3.5.235, Charles : « moche ») : trois bandes pleines, dont deux souvent vides, devenaient
                    une seule ligne blanche ; chaque acquis porte ses trois valeurs empilées — les croix, la pondération qui en
                    découle (sur 10), celle enregistrée pour l'année. */}
                <tfoot>
                  <tr style={{ borderTop: '1px solid var(--c-filet, rgb(var(--gris-200)))' }}>
                    <td colSpan={2} className="px-3 py-2 text-right align-top">
                      <div className="text-mention text-slate-500 leading-5">Croix<br />Pondération qui en découle (sur 10){aActuel ? <><br />Enregistrée en {annee}</> : null}</div>
                    </td>
                    {acquis.map(a => (
                      <td key={a.aa_code} className="px-1 py-2 text-center align-top tabular-nums">
                        <div className="text-mention leading-5 text-slate-500">{n[a.aa_code] || '–'}</div>
                        <div className="text-second leading-5 font-semibold text-iip-blue">{prop[a.aa_code] ? fr(prop[a.aa_code]) : '–'}</div>
                        {aActuel && <div className="text-mention leading-5 text-slate-400">{actuel[co]?.[a.aa_code] ? fr(actuel[co][a.aa_code]) : '–'}</div>}
                      </td>))}
                  </tr>
                </tfoot>
            </Tableau>
            {orph.length > 0 && (
              <p className="text-second text-slate-500 m-0 px-3 py-1.5 border-t border-slate-200">
                {orph.length} point(s) coché(s) n’existent plus au programme (texte modifié) : leurs croix seront retirées à l’enregistrement.
              </p>)}
          </section>);
      })}
    </div>);
}
