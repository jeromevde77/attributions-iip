import { useEffect, useMemo, useState } from 'react';
import {
  IconSearch, IconX, IconHelpCircle, IconFileTypePdf, IconMapPin, IconArrowRight, IconArrowLeft,
  IconBulb, IconChevronRight,
  IconAccessible, IconAward, IconBook, IconBooks, IconCertificate, IconChartBar, IconChecklist, IconHome, IconLayoutGrid, IconPencil, IconScale, IconSend, IconSettings, IconShieldExclamation, IconStairsUp, IconUserCheck, IconUsers,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
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
const texteDuPoint = p => [p.titre, p.ou, p.texte, ...(p.savoir || [])].filter(Boolean).join(' ').toLowerCase();
const NOMS_PUBLIC = { ens: 'Enseignants', sec: 'Secrétariat', coo: 'Coordinations', dir: 'Direction' };
// Les icônes que le contenu nomme (`icone` côté serveur) : une liste fermée, pas toute la bibliothèque.
const ICONES = { IconAccessible, IconAward, IconBook, IconBooks, IconCertificate, IconChartBar, IconChecklist, IconChevronRight, IconHome, IconLayoutGrid, IconPencil, IconScale, IconSend, IconSettings, IconShieldExclamation, IconStairsUp, IconUserCheck, IconUsers };
const Icone = ({ nom, ...p }) => { const I = ICONES[nom] || IconHelpCircle; return <I {...p} />; };

/* Le chemin « Où », en étapes : « Mes cours → un cours → Présences ». */
function Chemin({ ou }) {
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

function Point({ p, n, delai = 0 }) {
  return (
    <article className="guide-entree bloc-etat px-4 py-3.5 space-y-2.5" data-etat="neutre"
      style={{ borderLeftColor: 'var(--c-principal)', animationDelay: `${delai}s` }}>
      <div className="flex items-start gap-3">
        {n != null && <span className="flex-none inline-grid place-items-center w-6 h-6 rounded-full text-mention font-bold text-white"
          style={{ background: 'var(--c-principal)' }}>{n}</span>}
        <h3 className="titre-carte flex-1 min-w-0 m-0">{p.titre}</h3>
      </div>
      {p.ou && <Chemin ou={p.ou} />}
      <p className="text-sm text-slate-700 leading-relaxed m-0">{p.texte}</p>
      {p.savoir?.length > 0 && (
        <div className="rounded-champ border border-slate-200 bg-white px-3 py-2">
          <div className="flex items-center gap-1.5 text-second font-semibold text-iip-texte mb-1">
            <IconBulb size={15} style={{ color: 'var(--c-iip_or, #F9B619)' }} /> À savoir</div>
          <ul className="space-y-1 m-0 pl-0 list-none">
            {p.savoir.map((s, k) => (
              <li key={k} className="text-second text-slate-600 leading-relaxed pl-3.5 relative">
                <span className="absolute left-0 top-[0.55em] w-1.5 h-1.5 rounded-full" style={{ background: 'var(--c-accent)' }} />{s}</li>))}
          </ul>
        </div>)}
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
            <div className="guide-entree carte p-5 grid gap-5 md:grid-cols-[minmax(0,1fr)_260px] items-center">
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
              <div className="guide-entree" style={{ animationDelay: '.1s' }}><IllustrationGuide id={r.id} /></div>
            </div>

            <div className="space-y-3">
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
