import { useEffect, useMemo, useState } from 'react';
import {
  IconSearch, IconX, IconHelpCircle, IconFileTypePdf, IconMapPin, IconArrowRight, IconArrowLeft,
  IconBulb, IconChevronRight,
  IconAccessible, IconAward, IconBook, IconBooks, IconCertificate, IconChartBar, IconChecklist, IconHome, IconLayoutGrid, IconPencil, IconScale, IconSend, IconSettings, IconShieldExclamation, IconStairsUp, IconUserCheck, IconUsers,
  IconZoomIn, IconPlus, IconDeviceFloppy, IconCheck, IconTrash, IconDownload, IconUpload, IconFilter, IconCalendar, IconEye, IconArrowBackUp,
  IconQrcode, IconPrinter, IconFileSpreadsheet, IconClipboardText, IconLock, IconLockOpen, IconMail, IconRefresh, IconCopy,
  IconUserPlus, IconCalendarWeek, IconPlayerPlay, IconDots, IconMessage, IconBell, IconCalendarPlus, IconTicket, IconGift,
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
  IconFileTypePdf, IconChevronRight };
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
/** Les images d'un point : `image` + `legende`, ou `images` [{ src, legende, etroite }]. */
/* LES IMAGES D'UN POINT (3.1.491, Charles : « certaines sont trop grandes ; il est plus malin de mettre le texte à côté
   pour gagner en confort »). Elles vivent à DROITE du texte sur grand écran, sous lui sur iPad en portrait ; jamais plus
   grandes que leur taille réelle (une capture étroite agrandie devient floue), plafonnées en hauteur, et un toucher les
   ouvre en grand. */
function ImagesDuPoint({ p, onAgrandir }) {
  const liste = [...(p.image ? [{ src: p.image, legende: p.legende }] : []), ...(p.images || [])];
  if (!liste.length) return null;
  return (
    <div className="grid gap-3 content-start">
      {liste.map((im, i) => (
        <figure key={i} className="m-0 rounded-champ border border-slate-200 overflow-hidden bg-white">
          <button type="button" className="relative block w-full bg-slate-50 cursor-zoom-in" title="Agrandir"
            onClick={() => onAgrandir?.(im)}>
            <img src={im.src} alt={im.legende || p.titre} loading="lazy"
              className="block mx-auto w-auto h-auto max-w-full max-h-[17rem] object-contain" />
            <span className="absolute right-1.5 bottom-1.5 inline-grid place-items-center w-7 h-7 rounded-full bg-white/90 border border-slate-200 text-slate-500">
              <IconZoomIn size={15} /></span>
          </button>
          {im.legende && <figcaption className="px-3 py-1.5 text-mention text-slate-500 border-t border-slate-100"><Enrichi texte={im.legende} /></figcaption>}
        </figure>))}
    </div>
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

/* LE GUIDE ILLUSTRÉ (PDF, captures de la version de test) — servi derrière la
 * connexion. L'onglet s'ouvre AVANT d'attendre le fichier : ouvert après, le
 * navigateur le prend pour une fenêtre surgissante et le bloque en silence. */
async function ouvrirGuide(setErreur, nom = 'secretariat') {
  const onglet = window.open('', '_blank');
  try {
    const rep = await fetch(`/api/documentation/guide/${nom}`, { headers: authHeaders() });
    if (!rep.ok) throw new Error((await rep.json().catch(() => ({}))).error || `Erreur ${rep.status}`);
    const url = URL.createObjectURL(await rep.blob());
    if (onglet) onglet.location = url; else window.location = url;
  } catch (e) {
    onglet?.close();
    setErreur(e.message);
  }
}

/* La recherche lit tout ce que le point dit : titre, chemin, texte, règles. */
const texteDuPoint = p => [p.titre, p.ou, p.texte, ...(p.savoir || [])].filter(Boolean).join(' ').replace(/\[\[([^\]|]+)[^\]]*\]\]/g, '$1').toLowerCase();
const NOMS_PUBLIC = { ens: 'Enseignants', sec: 'Secrétariat', coo: 'Coordinations', dir: 'Direction' };
// Les icônes que le contenu nomme (`icone` côté serveur) : une liste fermée, pas toute la bibliothèque.
const ICONES = { IconAccessible, IconAward, IconBook, IconBooks, IconCertificate, IconChartBar, IconChecklist, IconChevronRight, IconHome, IconLayoutGrid, IconPencil, IconScale, IconSend, IconSettings, IconShieldExclamation, IconStairsUp, IconUserCheck, IconUsers };
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

export function Point({ p, n, delai = 0 }) {
  const [grand, setGrand] = useState(null);
  const aImages = !!(p.image || p.images?.length);
  return (
    <article className="guide-entree bloc-etat px-4 py-3.5 space-y-2.5" data-etat="neutre"
      style={{ borderLeftColor: 'var(--c-principal)', animationDelay: `${delai}s` }}>
      <div className="flex items-start gap-3">
        {n != null && <NumeroPoint n={n} />}
        <h3 className="titre-carte flex-1 min-w-0 m-0">{p.titre}</h3>
      </div>
      <div className={aImages ? 'grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.85fr)] items-start' : ''}>
        <div className="space-y-2.5 min-w-0">
          {p.ou && <Chemin ou={p.ou} />}
          {p.qui && (
            <div className="flex flex-wrap items-center gap-1.5 text-second">
              <IconUsers size={14} className="text-slate-400 flex-none" />
              <span className="text-slate-500">Qui :</span><span className="text-iip-texte font-semibold">{p.qui}</span>
            </div>)}
          {p.texte && <p className="text-sm text-slate-700 leading-relaxed m-0"><Enrichi texte={p.texte} /></p>}
          {/* Le texte d'une procédure (3.1.489) : du HTML que le serveur a filtré à l'écriture ; les boutons [[…]] s'y dessinent. */}
          {p.contenu && <div className="texte-corpus text-sm" dangerouslySetInnerHTML={{ __html: boutonsHtml(p.contenu) }} />}
          {p.savoir?.length > 0 && (
            <div className="rounded-champ border border-slate-200 bg-white px-3 py-2">
              <div className="flex items-center gap-1.5 text-second font-semibold text-iip-texte mb-1">
                <IconBulb size={15} style={{ color: 'var(--c-iip_or, #F9B619)' }} /> À savoir</div>
              <ul className="space-y-1 m-0 pl-0 list-none">
                {p.savoir.map((s, k) => (
                  <li key={k} className="text-second text-slate-600 leading-relaxed pl-3.5 relative">
                    <span className="absolute left-0 top-[0.55em] w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-accent)' }} /><Enrichi texte={s} /></li>))}
              </ul>
            </div>)}
        </div>
        <ImagesDuPoint p={p} onAgrandir={setGrand} />
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
        {(!data?.publics || data.publics.includes('sec')) && (
          <button onClick={() => { setErreurGuide(null); ouvrirGuide(setErreurGuide); }} className="bouton bouton-sortir controle">
            <IconFileTypePdf size={16} /> Guide du secrétariat (PDF)</button>)}
        <button onClick={() => { setErreurGuide(null); ouvrirGuide(setErreurGuide, 'presence-qr'); }} className="bouton bouton-sortir controle">
          <IconFileTypePdf size={16} /> La présence par QR code (PDF)</button>
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
