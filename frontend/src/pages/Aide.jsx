import { useEffect, useMemo, useRef, useState } from 'react';
import {
  IconSearch, IconX, IconHelpCircle, IconFileTypePdf, IconMapPin, IconArrowRight, IconArrowLeft,
  IconBulb, IconChevronRight, IconDeviceMobile, IconEyeCheck, IconSignature,
  IconAccessible, IconAward, IconBook, IconBooks, IconCertificate, IconChartBar, IconChecklist, IconHome, IconLayoutGrid, IconPencil, IconScale, IconSend, IconSettings, IconShieldExclamation, IconStairsUp, IconUserCheck, IconUsers,
  IconZoomIn, IconPlus, IconDeviceFloppy, IconCheck, IconTrash, IconDownload, IconUpload, IconFilter, IconCalendar, IconEye, IconArrowBackUp,
  IconQrcode, IconPrinter, IconFileSpreadsheet, IconClipboardText, IconLock, IconLockOpen, IconMail, IconRefresh, IconCopy,
  IconUserPlus, IconCalendarWeek, IconPlayerPlay, IconDots, IconMessage, IconBell, IconCalendarPlus, IconTicket, IconGift,
  IconBuildingBank, IconCoin, IconFileCertificate, IconCalendarCheck, IconUserCircle, IconUsersGroup,
} from '@tabler/icons-react';

/* LES BOUTONS DANS LE TEXTE (3.1.488, Charles : « des images des boutons… comment veux-tu que les profs comprennent ;
   le mode d'emploi PDF ne doit plus être la base de la recherche »). Dans `modeEmploi.js`, un bouton s'écrit
   [[Libellé]], [[Libellé|IconNom]] ou [[Libellé|IconNom|fort]] (« fort » : l'action principale, marine plein ; « sortir » :
   ce qui produit une pièce). Il se dessine avec les classes de Lucie, comme à l'écran, en plus petit. */
const ICONES_BOUTON = { IconPlus, IconDeviceFloppy, IconCheck, IconTrash, IconDownload, IconUpload, IconFilter, IconCalendar,
  IconEye, IconArrowBackUp, IconQrcode, IconPrinter, IconFileSpreadsheet, IconClipboardText, IconLock, IconLockOpen, IconMail,
  IconRefresh, IconCopy, IconUserPlus, IconCalendarWeek, IconPlayerPlay, IconDots, IconMessage, IconBell, IconCalendarPlus,
  IconTicket, IconGift, IconSend, IconSearch, IconX, IconPencil, IconSettings, IconScale, IconHome, IconUsers, IconUserCheck,
  IconStairsUp, IconCertificate, IconAccessible, IconAward, IconBook, IconChecklist, IconChartBar, IconArrowRight, IconArrowLeft,
  IconFileTypePdf, IconChevronRight, IconZoomIn, IconEyeCheck, IconSignature };
function BoutonGuide({ libelle, icone, sorte }) {
  const I = ICONES_BOUTON[icone];
  const classe = sorte === 'fort' ? 'bouton bouton-fort' : sorte === 'sortir' ? 'bouton bouton-sortir' : sorte === 'detruire' ? 'bouton bouton-detruire' : 'bouton';
  return (
    <span className={`${classe} bouton-guide`} role="img" aria-label={`bouton ${libelle}`}>
      {I && <I size={13} />}{libelle}
    </span>
  );
}
/** Le texte d'un point, avec ses boutons dessinés. */
export function Enrichi({ texte }) {
  const morceaux = String(texte || '').split(/(\[\[[^\]]+\]\])/g);
  return morceaux.map((m, i) => {
    const b = /^\[\[([^\]|]+)(?:\|([^\]|]*))?(?:\|([^\]|]*))?\]\]$/.exec(m);
    if (!b) return <span key={i}>{m}</span>;
    const [, libelle, a2 = '', a3 = ''] = b;
    const icone = /^Icon/.test(a2) ? a2 : /^Icon/.test(a3) ? a3 : '';
    const sorte = [a2, a3].find(x => ['fort', 'sortir', 'detruire'].includes(x)) || '';
    return <BoutonGuide key={i} libelle={libelle.trim()} icone={icone} sorte={sorte} />;
  });
}
/** Les boutons [[Libellé|…]] dans un HTML déjà filtré : une pastille à la forme du bouton, le libellé échappé. */
export const boutonsHtml = h => String(h || '').replace(/\[\[([^\]|]+)(?:\|([^\]|]*))?(?:\|([^\]|]*))?\]\]/g, (_, l, a2 = '', a3 = '') => {
  const sorte = [a2, a3].find(x => ['fort', 'sortir', 'detruire'].includes(x));
  const lib = l.trim().replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return `<span class="bouton ${sorte ? `bouton-${sorte} ` : ''}bouton-guide">${lib}</span>`;
});
/* LA CAPTURE ANNOTÉE (3.5.034, Charles : « comme dans le mode d'emploi initial ») : les numéros au-dessus de la capture,
   chacun avec son trait jusqu'à l'objet (`reperes` : x, y en % de l'image), puis une carte par numéro. Même règle que le
   PDF (`captureAnnotee` de lib/guideKit.js) : rangs qui ne se touchent pas, toute la largeur, jamais à côté du texte. */
const PAS_RANG = 26;
function rangsReperes(reperes, ecartMin) {
  const fins = [];
  return (reperes || []).map(r => {
    let rang = 0;
    while (fins[rang] != null && r.x - fins[rang] < ecartMin) rang++;
    fins[rang] = r.x;
    return { ...r, rang };
  });
}
function CaptureAnnotee({ im, p, onAgrandir }) {
  const reps = rangsReperes(im.reperes, 4.2);
  const nRangs = Math.max(...reps.map(r => r.rang)) + 1;
  const haut = nRangs * PAS_RANG + 8;
  return (
    <figure className="m-0 w-full">
      <div className="relative" style={{ paddingTop: haut }}>
        {reps.map((r, k) => (
          <span key={k} className="absolute -translate-x-1/2 inline-grid place-items-center w-[22px] h-[22px] rounded-full text-white text-mention font-semibold"
            style={{ left: `${r.x}%`, top: r.rang * PAS_RANG, background: 'var(--c-principal)' }}>{k + 1}</span>))}
        <button type="button" className="relative block w-full cursor-zoom-in" title="Agrandir" onClick={() => onAgrandir?.(im)}>
          <img src={im.src} alt={im.legende || p.titre} loading="lazy" className="block w-full h-auto rounded-champ border border-slate-200 bg-white" />
          {reps.map((r, k) => {
            const ecart = haut - (r.rang * PAS_RANG + 22);
            return <i key={k} className="absolute w-[2px] -ml-px" style={{ left: `${r.x}%`, top: -ecart, height: `calc(${r.y ?? 50}% + ${ecart}px)`, background: 'var(--c-principal)' }} />;
          })}
        </button>
      </div>
      {im.legende && <figcaption className="text-mention text-slate-500 text-center mt-1.5"><Enrichi texte={im.legende} /></figcaption>}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-2 mt-2.5">
        {reps.map((r, k) => (
          <div key={k} className="flex items-start gap-2 rounded-champ border border-slate-200 px-2.5 py-2 text-second leading-snug">
            <span className="flex-none inline-grid place-items-center w-[20px] h-[20px] rounded-full text-white text-mention font-semibold"
              style={{ background: 'var(--c-principal)' }}>{k + 1}</span>
            <span><b className="text-iip-texte">{r.titre}</b>{r.texte && <> — <Enrichi texte={r.texte} /></>}</span>
          </div>))}
      </div>
    </figure>
  );
}

/** Les images d'un point : `image` + `legende`, ou `images` [{ src, legende, etroite }]. */
/* LES IMAGES D'UN POINT (3.1.491, puis 3.5.024, Charles : « les captures dans le corps du texte, ou en dessous — on perd
   beaucoup trop de place »). Elles suivent le texte, dans la largeur de la carte, côte à côte quand elles tiennent ; chacune
   garde sa largeur (le cadre s'arrête à l'image), jamais plus grande que sa taille réelle (une capture étroite agrandie
   devient floue), plafonnée en hauteur, et un toucher l'ouvre en grand. */
const imagesDe = p => [...(p.image ? [{ src: p.image, legende: p.legende }] : []), ...(p.images || [])];

function ImagesDuPoint({ liste, p, onAgrandir, onTaille }) {
  if (!liste.length) return null;
  return <div className="flex flex-wrap items-start gap-3">{liste.map((im, i) => (im.reperes?.length
    ? <CaptureAnnotee key={im.src + i} im={im} p={p} onAgrandir={onAgrandir} />
    : <ImageDuPoint key={im.src + i} im={im} p={p} onAgrandir={onAgrandir} onTaille={onTaille} />))}</div>;
}

/* Le cadre prend la largeur de l'image telle qu'elle s'affiche (taille réelle, ou réduite par le plafond de hauteur) :
   mesurée au chargement — une image réduite par `max-width` n'impose pas sa largeur à son cadre, la légende l'écrasait. */
function ImageDuPoint({ im, p, onAgrandir, onTaille }) {
  const plafond = im.etroite ? 320 : 384;
  const [largeur, setLargeur] = useState(null);
  const charge = e => {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
    if (!w || !h) return;
    const l = Math.round(Math.min(w, (w * plafond) / h));
    setLargeur(l); onTaille?.(im.src, l);
  };
  return (
    <figure className="m-0 max-w-full rounded-champ border border-slate-200 overflow-hidden bg-white"
      style={{ width: largeur ? `${largeur + 2}px` : '18rem' }}>
      <button type="button" className="relative block w-full bg-slate-50 cursor-zoom-in" title="Agrandir"
        onClick={() => onAgrandir?.(im)}>
        <img src={im.src} alt={im.legende || p.titre} loading="lazy" onLoad={charge}
          className="block w-full h-auto object-contain" style={{ maxHeight: plafond }} />
        <span className="absolute right-1.5 bottom-1.5 inline-grid place-items-center w-7 h-7 rounded-full bg-white/90 border border-slate-200 text-slate-500">
          <IconZoomIn size={15} /></span>
      </button>
      {im.legende && <figcaption className="px-3 py-1.5 text-mention text-slate-500 border-t border-slate-100"><Enrichi texte={im.legende} /></figcaption>}
    </figure>
  );
}
import { authHeaders } from '../lib/api.js';
import { Fenetre } from '../components/ui.jsx';
import { createPortal } from 'react-dom';
import IllustrationGuide, { STYLE_GUIDE } from '../components/IllustrationsGuide.jsx';

/**
 * Mode d'emploi de Lucie — la face « Mode d'emploi de Lucie » de Documentation.
 *
 * UN VRAI GUIDE ILLUSTRÉ (3.1.467, Charles, 29 octobre 2026 : « un vrai guide illustré et joli, même avec
 * animations » ; « filtré par rôle »). Le CONTENU vit côté serveur (`backend/src/lib/modeEmploi.js`, servi par
 * `GET /api/documentation/mode-emploi`) : chacun ne reçoit que les chapitres de son métier. L'écran le met en
 * page : un sommaire, une page par chapitre (en-tête, schéma animé, points en cartes, chemin « Où » en étapes,
 * « À savoir »), chapitre précédent et suivant. Chaque point explique le travail, pas l'informatique
 * (CLAUDE.md, § 7). La version décrite se dit en tête : un guide écrit sur la dev montre des écrans que
 * l'équipe n'a pas.
 */

// Aide contextuelle, affichée depuis l'en-tête d'une page.
export const AIDE_CONTEXTUELLE = {
  '/organisation': { titre: 'Organisation', lien: 'organisation', points: [
    "La numérotation des groupes se règle par section.",
    "Les périodes d'un cours tombent sur un multiple du dossier pédagogique ; l'autonomie se compte à part.",
    "Les attributions HELB ne pèsent pas sur la dotation de l'établissement.",
  ] },
  '/etudiants': { titre: 'Étudiants', lien: 'etudiants', points: [
    "L'œil de la fiche ouvre la revue du PAE : on y compose et on y valide.",
    "Un trait pointillé signale une règle interne : elle avertit sans interdire.",
    "Jamais de cote sous 10 sur un document remis à l'étudiant : c'est « NA ».",
  ] },
  '/professeurs': { titre: 'Personnel', lien: 'personnel', points: [
    "L'ETP de la liste porte sur l'année consultée.",
    "Les accès se règlent sur la fiche, onglet « Accès Lucie ».",
    "Un compte ayant signé des décisions est désactivé, non supprimé.",
  ] },
  '/gestion': { titre: 'Gestion', lien: 'gestion', points: [
    "La dotation se lit par année civile, en périodes pondérées.",
    "La répartition prépare le document 2 sur deux années civiles.",
    "Le Rapport ETP sort par Éditions → Gestion → Listes et rapports.",
  ] },
  '/configuration': { titre: 'Configuration', lien: 'config', points: [
    "Identité fait foi : toutes les pièces y lisent l'établissement.",
    "Chaque réglage d'un geste entre dans le journal des réglages.",
  ] },
};

export function BoutonAide({ page }) {
  const [ouvert, setOuvert] = useState(false);
  const aide = AIDE_CONTEXTUELLE[page];
  if (!aide) return null;

  return (
    <div className="relative">
      <button onClick={() => setOuvert(v => !v)}
        className="w-7 h-7 rounded-full bg-slate-100 hover:bg-iip-turquoise/20 flex items-center
                   justify-center text-slate-500 hover:text-iip-blue transition"
        title={`Aide — ${aide.titre}`}>
        <IconHelpCircle size={16} />
      </button>
      {ouvert && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOuvert(false)} />
          <div className="absolute right-0 top-9 z-50 bg-white border border-slate-200 rounded-xl
                          shadow-flottant w-80 p-4">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-sm font-semibold text-iip-blue">{aide.titre}</span>
              <button onClick={() => setOuvert(false)} className="text-slate-400 hover:text-slate-600">
                <IconX size={14} />
              </button>
            </div>
            <ul className="space-y-2">
              {aide.points.map((p, i) => (
                <li key={i} className="text-second text-slate-600 leading-relaxed pl-3 border-l-2
                                       border-slate-200">
                  {p}
                </li>
              ))}
            </ul>
            <a href={`/aide#${aide.lien}`}
              className="mt-3 block text-second text-iip-turquoise hover:underline text-center">
              Voir le mode d'emploi complet
            </a>
          </div>
        </>
      )}
    </div>
  );
}

/* LE MODE D'EMPLOI EN UN SEUL PDF (3.1.512, Charles : « un seul doc, puisque tout le monde a le guide en ligne »).
 * Le serveur compose le même contenu, pour le même public ; l'écran y joint les captures (le serveur ne les a pas),
 * puis demande le PDF. L'onglet s'ouvre AVANT d'attendre : ouvert après, le navigateur le bloquerait en silence. */
const enDataUrl = async src => {
  const r = await fetch(src); if (!r.ok) return null;
  const b = await r.blob();
  return new Promise(ok => { const f = new FileReader(); f.onload = () => ok(f.result); f.onerror = () => ok(null); f.readAsDataURL(b); });
};
/* UNE SEULE MISE EN PAGE, CELLE DU KIT (3.5.044, Charles : « si on clique sur la version PDF, on a un mode d'emploi impeccable
 * dans cette mise en page. POINT ! »). L'ancien repli — la mise en page simple, imprimée par le navigateur — sortait dès que
 * le serveur tardait : c'est lui qu'on recevait. Il est retiré : si le serveur échoue, on le dit, on ne sort rien d'autre.
 * Pendant la composition (une à deux minutes la première fois, puis aussitôt), l'onglet ouvert dit ce qui se passe. */
const ATTENTE = `<!doctype html><meta charset="utf-8"><title>Lucie — mode d'emploi</title>
<body style="margin:0;display:grid;place-items:center;height:100vh;background:#0E2A4F;color:#fff;font-family:Inter,Segoe UI,Helvetica,Arial,sans-serif">
<div style="text-align:center;max-width:30rem;padding:2rem"><div style="font-size:28px;font-weight:700;margin-bottom:12px">Lucie — mode d'emploi</div>
<div style="opacity:.85;line-height:1.5">Composition du document, chapitre par chapitre, avec ses captures.<br>La première fois, cela prend une à deux minutes ; ensuite, il s'ouvre aussitôt.</div></div></body>`;
async function ouvrirModeEmploiPdf(setErreur, voir) {
  const onglet = window.open('', '_blank');
  try { onglet?.document.write(ATTENTE); onglet?.document.close(); } catch { /* onglet bloqué */ }
  const q = voir && voir !== 'tous' ? `?voir=${voir}` : '';
  try {
    const ri = await fetch(`/api/documentation/mode-emploi/pdf/images${q}`, { headers: authHeaders() });
    const ji = await ri.json();
    if (!ri.ok) throw new Error(ji.error || `Erreur ${ri.status}`);
    const images = {};
    for (const src of ji.images || []) { const d = await enDataUrl(src); if (d) images[src] = d; }
    const rp = await fetch('/api/documentation/mode-emploi/pdf', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ voir: voir && voir !== 'tous' ? voir : null, images }) });
    if (!rp.ok) {
      const j = await rp.json().catch(() => ({}));
      throw new Error(j.error || `Le PDF n'a pas pu être composé (erreur ${rp.status}). Réessayez dans un instant.`);
    }
    const url = URL.createObjectURL(await rp.blob());
    if (onglet && !onglet.closed) onglet.location = url; else window.location = url;
  } catch (e) {
    try { onglet?.close(); } catch { /* */ }
    setErreur(e.message);
  }
}

/* La recherche lit tout ce que le point dit : titre, chemin, texte, règles. */
const texteDuPoint = p => [p.titre, p.ou, p.texte, ...(p.savoir || [])].filter(Boolean).join(' ').replace(/\[\[([^\]|]+)[^\]]*\]\]/g, '$1').toLowerCase();
const NOMS_PUBLIC = { ens: 'Enseignants', sec: 'Secrétariat', coo: 'Coordinations', dir: 'Direction' };
// Les icônes que le contenu nomme (`icone` côté serveur) : une liste fermée, pas toute la bibliothèque.
const ICONES = { IconBuildingBank, IconCoin, IconFileCertificate, IconCalendarCheck, IconUserCircle, IconUsersGroup, IconAccessible, IconAward, IconBook, IconBooks, IconCertificate, IconChartBar, IconChecklist, IconChevronRight, IconDeviceMobile, IconHome, IconLayoutGrid, IconPencil, IconScale, IconSend, IconSettings, IconShieldExclamation, IconStairsUp, IconUserCheck, IconUsers };
const Icone = ({ nom, ...p }) => { const I = ICONES[nom] || IconHelpCircle; return <I {...p} />; };

/* Le chemin « Où », en étapes : « Mes cours → un cours → Présences ». */
export function Chemin({ ou }) {
  const [chemin, ...reste] = String(ou).split(/(?<=\.)\s|·|;/).map(x => x.trim()).filter(Boolean);
  const etapes = String(chemin || '').replace(/\.$/, '').split('→').map(x => x.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-second">
      <IconMapPin size={14} className="text-slate-400 flex-none" />
      {etapes.map((x, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <IconChevronRight size={12} className="text-slate-300" />}
          <span className="px-2 py-0.5 rounded-champ border border-slate-200 bg-white text-iip-texte">{x}</span>
        </span>))}
      {reste.length > 0 && <span className="text-slate-500">· {reste.join(' · ')}</span>}
    </div>
  );
}

/* LE NUMÉRO D'UN POINT : un cercle, rien de plus (3.1.484, Charles : « pas d'étoiles pour les points »). */
export function NumeroPoint({ n }) {
  return (
    <span className="flex-none inline-grid place-items-center min-w-[1.5rem] h-6 px-1 rounded-full text-[11px] font-bold text-white tabular-nums"
      style={{ background: 'var(--c-principal)' }}>{n}</span>
  );
}

/* « CARRÉ COMME WORD » (3.5.025, Charles : « si la capture est plus petite que 3/4 de la largeur de la zone de texte, image
   à gauche et texte à droite — sois malin »). Une capture affichée à moins des trois quarts de la colonne flotte à gauche, le
   texte coule à sa droite puis reprend toute la largeur ; une capture plus large suit le texte. La largeur de la colonne se
   MESURE (elle change avec l'écran : sur téléphone, presque tout passe dessous) ; celle d'une capture, à son chargement —
   avant, une capture marquée `etroite` est tenue pour petite. */
export function Point({ p, n, delai = 0 }) {
  const [grand, setGrand] = useState(null);
  const liste = imagesDe(p);
  const boite = useRef(null);
  const [colonne, setColonne] = useState(0);
  const [tailles, setTailles] = useState({});
  useEffect(() => {
    const el = boite.current;
    if (!el || !liste.length || typeof ResizeObserver === 'undefined') return undefined;
    const ro = new ResizeObserver(([e]) => setColonne(Math.round(e.contentRect.width)));
    ro.observe(el);
    return () => ro.disconnect();
  }, [liste.length]);
  // Les petites, côte à côte, tant que leur largeur cumulée reste sous les trois quarts ; les autres suivent le texte.
  const largeurDe = im => tailles[im.src] || (im.etroite ? 180 : 0);
  const petites = [], grandes = [];
  let cumul = 0;
  for (const im of liste) {
    if (im.reperes?.length) { grandes.push(im); continue; }   // une capture annotée prend toute la largeur
    const l = largeurDe(im);
    // Une seule capture : jusqu'aux trois quarts ; à plusieurs, 55 % — le texte garde de quoi se lire.
    const plafondGroupe = colonne * (petites.length ? 0.55 : 0.75);
    const tient = colonne ? l && cumul + l + (petites.length ? 12 : 0) < plafondGroupe : im.etroite && !petites.length;
    if (tient) { petites.push(im); cumul += l + (petites.length > 1 ? 12 : 0); } else grandes.push(im);
  }
  const noterTaille = (src, l) => setTailles(t => (t[src] === l ? t : { ...t, [src]: l }));
  return (
    <article className="guide-entree bloc-etat px-4 py-3.5 space-y-2.5" data-etat="neutre"
      style={{ borderLeftColor: 'var(--c-principal)', animationDelay: `${delai}s` }}>
      {/* Un point sans titre (le texte d'ouverture d'une partie) n'a pas d'en-tête : un numéro seul ne dirait rien. */}
      {p.titre && (
        <div className="flex items-start gap-3">
          {n != null && <NumeroPoint n={n} />}
          <h3 className="titre-carte flex-1 min-w-0 m-0">{p.titre}</h3>
        </div>)}
      <div ref={boite} className="space-y-2.5 min-w-0 flow-root">
          {p.ou && <Chemin ou={p.ou} />}
          {petites.length > 0 && (
            <div className="float-left mr-4 mb-2.5 flex items-start gap-3 max-w-[75%]">
              {petites.map((im, i) => <ImageDuPoint key={im.src + i} im={im} p={p} onAgrandir={setGrand} onTaille={noterTaille} />)}
            </div>)}
          {p.qui && (
            <div className="flex flex-wrap items-center gap-1.5 text-second">
              <IconUsers size={14} className="text-slate-400 flex-none" />
              <span className="text-slate-500">Qui :</span><span className="text-iip-texte font-semibold">{p.qui}</span>
            </div>)}
          {p.texte && <p className="text-sm text-slate-700 leading-relaxed m-0"><Enrichi texte={p.texte} /></p>}
          {/* Le texte d'une procédure (3.1.489) : du HTML que le serveur a filtré à l'écriture ; les boutons [[…]] s'y dessinent. */}
          {p.contenu && <div className="texte-corpus text-sm" dangerouslySetInnerHTML={{ __html: boutonsHtml(p.contenu) }} />}
          <ImagesDuPoint liste={grandes} p={p} onAgrandir={setGrand} onTaille={noterTaille} />
          {p.savoir?.length > 0 && (
            <div className="flow-root rounded-champ border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-1.5 text-second font-semibold text-iip-texte mb-1">
                <IconBulb size={15} style={{ color: 'var(--c-iip_or, #F9B619)' }} /> À savoir</div>
              <ul className="space-y-1 m-0 pl-0 list-none">
                {p.savoir.map((s, k) => (
                  <li key={k} className="text-second text-slate-600 leading-relaxed pl-3.5 relative">
                    <span className="absolute left-0 top-[0.55em] w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-accent)' }} /><Enrichi texte={s} /></li>))}
              </ul>
            </div>)}
      </div>
      {/* Hors de la carte : son animation (transform) enfermerait la fenêtre dans le point. */}
      {grand && createPortal(
        <Fenetre large="pleine" titre={p.titre} onFermer={() => setGrand(null)}
          pied={<button type="button" className="bouton ml-auto" onClick={() => setGrand(null)}>Fermer</button>}>
          <img src={grand.src} alt={grand.legende || p.titre} className="block mx-auto w-auto h-auto max-w-full" />
          {grand.legende && <p className="text-second text-slate-500 mt-2 mb-0"><Enrichi texte={grand.legende} /></p>}
        </Fenetre>, document.body)}
    </article>
  );
}

export default function Aide({ integre = false }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [voir, setVoir] = useState('tous');
  const [recherche, setRecherche] = useState('');
  const [erreurGuide, setErreurGuide] = useState(null);
  const [pdfEnCours, setPdfEnCours] = useState(false);
  const [cle, setCle] = useState(() => (window.location.hash || '').replace(/^#/, '') || null);

  useEffect(() => {
    setErreur(null);
    fetch(`/api/documentation/mode-emploi${voir !== 'tous' ? `?voir=${voir}` : ''}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture refusée.'); setData(j); })
      .catch(e => setErreur(e.message));
  }, [voir]);

  const rubriques = data?.rubriques || [];
  const index = Math.max(0, rubriques.findIndex(r => r.id === cle));
  const r = rubriques[index];
  const aller = id => { setCle(id); setRecherche(''); try { window.history.replaceState(null, '', `#${id}`); } catch { /* */ }
    document.getElementById('guide-haut')?.scrollIntoView({ behavior: 'smooth', block: 'start' }); };

  const resultats = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    if (!q) return null;
    return rubriques.flatMap(x => x.points.filter(p => texteDuPoint(p).includes(q)).map(p => ({ r: x, p })));
  }, [recherche, rubriques]);

  return (
    <div className={`${integre ? '' : 'p-5 '}space-y-4`} id="guide-haut">
      <style>{STYLE_GUIDE}</style>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="titre-ecran mb-0">Mode d’emploi de Lucie</h2>
          <p className="text-sm text-slate-500 m-0">
            Lucie {data?.version || '…'}. Pour chaque écran : où aller, ce qu’on y fait, et ce qu’il faut savoir.
          </p>
        </div>
        {data?.filtrable && (
          <div className="segments" title="Voir le mode d’emploi tel que le reçoit ce public">
            {[['tous', 'Tout'], ...Object.entries(NOMS_PUBLIC)].map(([k, l]) => (
              <button key={k} type="button" onClick={() => setVoir(k)}
                className={`px-3 py-1.5 text-second ${voir === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>))}
          </div>)}
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px] max-w-md">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={recherche} onChange={e => setRecherche(e.target.value)} data-reponses="non"
            placeholder="Rechercher — PAE, valorisation, présences, horaire…" className="controle controle-icone w-full pr-8" />
          {recherche && (
            <button onClick={() => setRecherche('')} aria-label="Effacer"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"><IconX size={15} /></button>)}
        </div>
        <button onClick={() => { setErreurGuide(null); setPdfEnCours(true); ouvrirModeEmploiPdf(setErreurGuide, voir).finally(() => setPdfEnCours(false)); }}
          disabled={pdfEnCours} className="bouton bouton-sortir controle">
          <IconFileTypePdf size={16} /> {pdfEnCours ? 'Composition du PDF…' : 'Tout le mode d’emploi (PDF)'}</button>
        {erreurGuide && <span className="text-second text-red-700">{erreurGuide}</span>}
      </div>

      {erreur && <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{erreur}</div>}
      {!data && !erreur && <div className="text-sm text-slate-400">Chargement…</div>}

      {resultats ? (
        <div className="space-y-3">
          <div className="text-second text-slate-500">{resultats.length} réponse(s) pour « {recherche} »</div>
          {!resultats.length && <div className="py-10 text-center text-sm text-slate-400 border-2 border-dashed rounded-carte">Rien ne correspond.</div>}
          {resultats.map(({ r: x, p }, i) => (
            <div key={i} className="space-y-1">
              <button type="button" onClick={() => aller(x.id)} className="inline-flex items-center gap-1.5 text-second text-iip-blue hover:underline">
                <Icone nom={x.icone} size={14} /> {x.titre}</button>
              <Point p={p} delai={Math.min(i, 8) * 0.04} />
            </div>))}
        </div>
      ) : r && (
        <div className="grid gap-5 lg:grid-cols-[230px_minmax(0,1fr)] items-start">
          {/* LE SOMMAIRE : collé à gauche sur un grand écran, en bandeau au-dessus sur l'iPad. */}
          <nav className="lg:sticky lg:top-20 flex lg:flex-col gap-1 overflow-x-auto lg:overflow-visible pb-1 lg:pb-0 -mx-1 px-1">
            {rubriques.map((x, i) => (
              <button key={x.id} type="button" onClick={() => aller(x.id)}
                className={`flex-none flex items-center gap-2 px-2.5 py-2 rounded-champ text-left text-second transition-colors
                  ${x.id === r.id ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-100'}`}>
                <Icone nom={x.icone} size={16} className="flex-none" />
                <span className="whitespace-nowrap lg:whitespace-normal">{i + 1}. {x.titre}</span>
              </button>))}
          </nav>

          <div key={`${r.id}-${voir}`} className="space-y-4 min-w-0">
            {/* L'EN-TÊTE DU CHAPITRE : ce qu'il couvre, pour qui, et son schéma. */}
            <div className="carte p-5 grid gap-4 grid-cols-[minmax(0,1fr)_auto] items-center">
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-second text-slate-500">
                  <span className="tabular-nums">Chapitre {index + 1} sur {rubriques.length}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="inline-grid place-items-center w-11 h-11 rounded-carte text-white flex-none" style={{ background: 'var(--c-principal)' }}>
                    <Icone nom={r.icone} size={22} /></span>
                  <h2 className="text-xl font-bold text-iip-texte m-0 leading-tight">{r.titre}</h2>
                </div>
                <p className="text-sm text-slate-600 m-0">{r.resume}</p>
                {data.filtrable && <div className="flex flex-wrap gap-1.5">
                  {String(r.pour || '').split(/\s+/).filter(Boolean).map(k => (
                    <span key={k} className="pastille-etat" data-etat="disponible">{NOMS_PUBLIC[k] || k}</span>))}
                </div>}
              </div>
              {/* Le logo de Lucie, fixe : chaque chapitre y allume son étoile, qui porte son pictogramme. */}
              <div className="w-36 sm:w-44 flex-none">
                <IllustrationGuide chapitres={rubriques} rang={index} Icone={ICONES[r.icone] || IconHelpCircle} onChoisir={aller} />
              </div>
            </div>

            <div className="space-y-3 min-w-0">
              {r.points.map((p, i) => <Point key={i} p={p} n={i + 1} delai={0.08 + Math.min(i, 8) * 0.05} />)}
            </div>

            <div className="flex flex-wrap justify-between gap-2 pt-1">
              {rubriques[index - 1] ? (
                <button type="button" className="bouton" onClick={() => aller(rubriques[index - 1].id)}>
                  <IconArrowLeft size={15} /> {rubriques[index - 1].titre}</button>) : <span />}
              {rubriques[index + 1] && (
                <button type="button" className="bouton bouton-fort" onClick={() => aller(rubriques[index + 1].id)}>
                  Chapitre suivant : {rubriques[index + 1].titre} <IconArrowRight size={15} /></button>)}
            </div>
          </div>
        </div>
      )}

      <p className="text-xs text-slate-400 pt-2">
        Les règles citées renvoient au décret du 16 avril 1991, au règlement des études et aux
        circulaires applicables ; en cas de divergence, ce sont ces textes qui font foi.
      </p>
    </div>
  );
}
