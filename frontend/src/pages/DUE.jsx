import { useEffect, useMemo, useState } from 'react';
import { OuvrirEditions } from '../components/ui.jsx';
import {
  IconPrinter, IconDeviceFloppy, IconLock, IconLockOpen, IconArrowLeft,
  IconAlertTriangle, IconCheck, IconCircleCheck, IconPencil, IconEye, IconFileText,
} from '@tabler/icons-react';
import { api, authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import EditeurDUE from '../components/EditeurDUE.jsx';

/**
 * LES DESCRIPTIFS D'UNITÉ D'ENSEIGNEMENT.
 *
 * La DUE était un Word recopié d'année en année : le volume horaire y
 * divergeait du référentiel et les acquis n'étaient plus ceux du dossier
 * pédagogique. L'écran sépare donc nettement deux choses.
 *
 * En GRIS, ce que Lucie sait déjà et que personne ne retape : périodes,
 * crédits, quadrimestre, cours de l'unité, acquis avec leur libellé,
 * titulaires tirés des attributions. Corriger le référentiel corrige la DUE.
 *
 * En BLANC, ce que l'enseignant rédige — et lui seul : finalités, programme,
 * méthodes, supports, modalités d'évaluation, critères, degré de maîtrise.
 *
 * Le titulaire écrit tant que la DUE est en préparation ; la direction valide,
 * et la fiche passe alors en lecture seule.
 */

const METHODES = [
  ['ex_cathedra', 'Cours ex cathedra'], ['exercices', "Réalisation d'exercices"],
  ['etude_cas', 'Étude de cas'], ['problemes', 'Apprentissage par problèmes'],
  ['classe_inversee', 'Classe inversée'], ['groupe', 'Collaboration en groupe'],
  ['pairs', 'Apprentissage par les pairs'], ['situation', 'Mise en situation'],
  ['pratique', 'Pratique'], ['debats', 'Débats'], ['jeux_roles', 'Jeux de rôles'],
  ['simulation', 'Simulation'], ['hybridation', 'Hybridation'],
];
/* TRAVAIL INDIVIDUEL OU DE GROUPE (Charles, 8 octobre 2026) : deux colonnes. L'ancienne
   case « Travail » se lit comme un travail individuel. */
const EPREUVES = [['ecrit', 'Écrit'], ['oral', 'Oral'], ['pratique', 'Pratique'],
  ['travail', 'Travail individuel'], ['travail_groupe', 'Travail de groupe'], ['continue', 'Év. continue']];

// ── Briques d'écriture ───────────────────────────────────────────────────────

function Bloc({ titre, aide, children }) {
  return (
    <section className="mb-4">
      <div className="px-3 py-1.5 bg-iip-blue text-white text-[11px] font-semibold
                      uppercase tracking-wide rounded-t-lg">{titre}</div>
      <div className="border border-t-0 border-slate-200 rounded-b-lg p-3 bg-white">
        {aide && <p className="text-[11px] text-slate-500 mb-2">{aide}</p>}
        {children}
      </div>
    </section>
  );
}

/**
 * LE TEXTE OFFICIEL, À PORTÉE DE CLIC.
 *
 * Le modèle Word disait « copier le contenu du DP » — et chacun recopiait à la
 * main un texte qui figure déjà dans Lucie depuis l'import du dossier
 * pédagogique. On le montre, replié, avec un bouton qui le reprend.
 *
 * Reprendre n'écrase jamais en silence : si le champ contient déjà quelque
 * chose, le texte du dossier s'ajoute à la suite plutôt que de se substituer
 * au travail de l'enseignant.
 */
function DuDossier({ texte, valeur, onChange, lecture,
  libelle = 'le texte du dossier pédagogique' }) {
  const [ouvert, setOuvert] = useState(false);
  if (lecture || !texte) return null;
  const dejaLa = (valeur || '').includes(texte.slice(0, 40));

  return (
    <div className="mt-2 border-t border-dashed border-slate-200 pt-2">
      <div className="flex items-center justify-between gap-2">
        <button onClick={() => setOuvert(o => !o)}
          className="text-[11px] text-slate-500 hover:text-iip-blue flex items-center gap-1">
          <IconFileText size={12} />
          {ouvert ? 'Masquer' : 'Voir'} {libelle}
        </button>
        <button disabled={dejaLa}
          onClick={() => onChange(valeur ? `${valeur.trim()}\n\n${texte}` : texte)}
          className="text-[11px] px-2 py-1 rounded-lg border border-iip-gold/60 text-iip-blue
                     hover:bg-amber-50 disabled:opacity-40 disabled:hover:bg-transparent">
          {dejaLa ? 'déjà repris' : valeur ? 'Ajouter à la suite' : 'Reprendre ce texte'}
        </button>
      </div>
      {ouvert && (
        <pre className="mt-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-[12px]
                        text-slate-600 whitespace-pre-wrap font-sans max-h-56 overflow-y-auto">
          {texte}
        </pre>
      )}
    </div>
  );
}

// Dire d'où vient un texte qu'on n'a pas écrit : sans cela, l'enseignant croit
// avoir déjà rédigé, ou pense qu'un autre l'a fait à sa place.
function Repris({ actif }) {
  if (!actif) return null;
  return (
    <p className="mt-1.5 text-[11px] text-slate-500 flex items-start gap-1">
      <IconFileText size={12} className="mt-0.5 flex-none text-iip-gold" />
      Repris du dossier pédagogique. Adaptez-le à votre unité : tant que vous n'y
      touchez pas, il suivra les mises à jour du dossier.
    </p>
  );
}

function Zone({ valeur, onChange, lignes = 4, lecture, placeholder }) {
  if (lecture) {
    return valeur
      ? <div className="text-[13px] text-slate-700 whitespace-pre-wrap">{valeur}</div>
      : <div className="text-[13px] text-slate-400 italic">non complété</div>;
  }
  return (
    <textarea rows={lignes} value={valeur || ''} placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      className="w-full text-[13px] border border-slate-300 rounded-lg px-2.5 py-2
                 focus:outline-none focus:ring-2 focus:ring-iip-blue/30" />
  );
}

function Champ({ label, valeur, onChange, lecture, placeholder }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">{label}</span>
      {lecture
        ? <span className="text-[13px] text-slate-700">{valeur || '—'}</span>
        : <input value={valeur || ''} placeholder={placeholder}
          onChange={e => onChange(e.target.value)}
          className="w-full text-[13px] border border-slate-300 rounded-lg px-2.5 py-1.5
                     focus:outline-none focus:ring-2 focus:ring-iip-blue/30" />}
    </label>
  );
}

/**
 * LE RESPONSABLE DE L'UNITÉ.
 *
 * Le champ était libre : chacun y écrivait ce qu'il voulait, sans garantie que
 * la personne citée enseignât dans l'unité. On choisit désormais parmi les
 * titulaires, et Lucie propose celui qui y porte le plus de périodes — c'est
 * en général lui qui en répond. La proposition n'est qu'un défaut : le choix
 * reste ouvert, et l'écran dit lequel des deux est affiché.
 */
function Responsable({ c, d, lecture, onChange }) {
  const liste = d.enseignants || [];
  const choisi = c.responsable ?? d.responsable_propose ?? '';
  const parDefaut = c.responsable == null && d.responsable_propose != null;
  const nom = id => {
    const e = liste.find(x => String(x.id) === String(id));
    return e ? `${(e.nom || '').toUpperCase()} ${e.prenom || ''}`.trim() : (id || '—');
  };

  if (lecture) {
    return (
      <div>
        <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">
          Responsable de l'unité
        </span>
        <span className="text-[13px] text-slate-700">{nom(choisi)}</span>
      </div>
    );
  }

  if (!liste.length) {
    return (
      <div>
        <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">
          Responsable de l'unité
        </span>
        <span className="text-[12px] text-amber-800">
          Aucune attribution encodée : le responsable ne peut pas être choisi.
        </span>
      </div>
    );
  }

  return (
    <label className="block">
      <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">
        Responsable de l'unité
      </span>
      <select value={String(choisi)} onChange={e => onChange(e.target.value)}
        className="w-full text-[13px] border border-slate-300 rounded-lg px-2 py-1.5
                   focus:outline-none focus:ring-2 focus:ring-iip-blue/30">
        {liste.map(e => (
          <option key={e.id} value={String(e.id)}>
            {(e.nom || '').toUpperCase()} {e.prenom}{e.periodes ? ` — ${e.periodes} p.` : ''}
          </option>
        ))}
      </select>
      <span className="block text-[11px] text-slate-400 mt-0.5">
        {parDefaut
          ? 'Proposé : le titulaire qui porte le plus de périodes dans l’unité.'
          : 'Choisi manuellement parmi les titulaires de l’unité.'}
      </span>
    </label>
  );
}

// Ce que Lucie sait déjà : posé sur fond gris, sans champ de saisie, pour que
// nul ne cherche à le corriger ici.
function Su({ label, valeur }) {
  return (
    <div className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{label}</div>
      <div className="text-[13px] text-slate-700 font-medium">{valeur ?? '—'}</div>
    </div>
  );
}

/* LA MISE EN PAGE POUR LES COORDINATIONS (Charles, 8 octobre 2026 : « gras, passer
   à la ligne, tabulations, couleurs… »). L'éditeur de la Documentation, sans
   import de fichier ; un texte simple (repris du dossier) y entre en paragraphes.
   Le serveur filtre le HTML à l'enregistrement (liste fermée). */
const echapper = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const estHtml = t => /<\/?(p|br|b|strong|i|em|u|ul|ol|li|span|h[1-4]|table|mark|sub|sup|a)\b/i.test(String(t || ''));
const enHtml = t => (estHtml(t) ? t : String(t || '').split(/\n+/).filter(Boolean).map(l => `<p>${echapper(l)}</p>`).join(''));
function Riche({ valeur, onChange, lecture }) {
  if (lecture) {
    if (!valeur) return <div className="text-[13px] text-slate-400 italic">non complété</div>;
    return estHtml(valeur)
      ? <div className="texte-due" dangerouslySetInnerHTML={{ __html: valeur }} />
      : <div className="text-[13px] text-slate-700 whitespace-pre-wrap">{valeur}</div>;
  }
  return (
    <div className="border border-slate-300 rounded-lg overflow-hidden bg-white">
      <EditeurDUE valeur={enHtml(valeur)} onChange={onChange} />
    </div>);
}

/* LE PROGRAMME, RANGÉ PAR ACTIVITÉ (Charles, 8 octobre 2026 : « cette partie pas
   top »). Le dossier pédagogique écrit le programme d'un tenant : une introduction,
   puis, cours par cours, des phrases de contexte (« Pour les systèmes …, ») et
   des points. On le lit ainsi : l'intitulé d'un cours ouvre son groupe, une ligne
   qui finit par « , » ou « : » est un chapeau, le reste est un point. */
const norm = t => String(t || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function lireProgramme(texte, cours) {
  const out = [];
  let courant = null;
  /* L'INTITULÉ COLLÉ EN FIN DE LIGNE (Charles, 8 octobre 2026 : « pourquoi en
     psychomot les cours n'ont pas de point de programme ? »). Les dossiers lus
     d'un PDF collent l'intitulé du cours à la ligne précédente — « L'étudiant
     sera capable : Psychologie générale », « …situations concrètes ; Psychologie
     sociale » — et rien ne commençait de groupe. On le remet sur sa ligne. */
  const echap = t => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  let brutTexte = String(texte || '').replace(/<[^>]+>/g, '\n');
  for (const c of cours) {
    const n = String(c.cours_nom || '').trim();
    if (n.length < 4) continue;
    // L'intitulé, et ce qui le suit sur la même ligne (« … interpersonnelle à partir
    // de situations d'expérimentation, ») devient la ligne suivante.
    brutTexte = brutTexte.replace(new RegExp(`([:;.])[ \\t]*(${echap(n)})(?=[ \\t,]|\\n|$)[ \\t]*`, 'gi'), '$1\n$2\n');
  }
  /* L'INTITULÉ DU DOSSIER N'EST PAS TOUJOURS CELUI DU COURS : « Pratique des écrits »
     pour « Pratique des écrits - Psychomotricité », « Théorie et concepts » pour
     « Théorie et concept ». On compare les MOTS — sans accents, sans les petits
     mots, au singulier : presque tous ceux de l'intitulé lu, la moitié au moins
     de ceux du cours. */
  // « 1er soins » et « Premiers soins » disent la même chose.
  const motsDe = t => norm(t).split(' ').filter(w => w.length >= 3)
    .map(w => (/^1(er|re|ers|res)$/.test(w) ? 'premier' : w.replace(/s$/, '')));
  const ressemble = (t, c) => {
    const a = motsDe(t), b = new Set(motsDe(c.cours_nom));
    if (a.length < 2 || !b.size || a.length > 14) return false;
    const inter = a.filter(w => b.has(w)).length;
    // Presque tous les mots lus sont ceux du cours… ou tous ceux du cours sont lus
    // (« Élaboration ET MÉTHODOLOGIE de l'intervention en éducation-prévention »).
    return (inter / a.length >= 0.8 && inter / b.size >= 0.5)
      || (b.size >= 2 && inter >= b.size && a.length <= b.size * 2);
  };
  const coursDe = t => cours.find(x => norm(x.cours_nom) && norm(t) === norm(x.cours_nom))
    || cours.find(x => ressemble(t, x));
  /* UNE LIGNE QUI PORTE TOUT LE PROGRAMME (l'UE 76 : les puces du PDF perdues, les
     points séparés par « ; ») se coupe à chaque point-virgule. */
  const lignesLues = brutTexte.split('\n')
    .flatMap(x => (x.length > 250 && (x.match(/;/g) || []).length >= 2 ? x.split(/(?<=;)\s+/) : [x]));
  for (const brut of lignesLues) {
    let l = brut.replace(/^[\s•\-–*]+/, '').trim();
    if (l.length < 3) continue;
    // Un intitulé collé après le dernier « : ; , . » de la ligne : la ligne s'arrête là.
    const m = /^(.*[:;,.])\s*([^:;,.]{4,})$/.exec(l);
    const queue = m && coursDe(m[2]);
    if (queue) {
      const tete = m[1].trim();
      if (tete.length >= 3) {
        if (!courant) out.push({ type: 'intro', texte: tete, cours: [] });
        else out.push({ type: /[,:]$/.test(tete) ? 'chapeau' : 'point', texte: tete, cours: [courant] });
      }
      courant = queue.cours_code; continue;
    }
    const c = !/^[\s•\-–*]/.test(brut) && coursDe(l);
    if (c) { courant = c.cours_code; continue; }
    if (!courant) { out.push({ type: 'intro', texte: l, cours: [] }); continue; }
    out.push({ type: /[,:]$/.test(l) ? 'chapeau' : 'point', texte: l, cours: [courant] });
  }
  // UNE UNITÉ D'UN SEUL COURS : le dossier n'a pas d'intitulé à donner, tout le
  // programme est le sien (la première phrase, « L'étudiant sera capable… », reste
  // l'introduction).
  if (cours.length === 1 && !out.some(p => p.type !== 'intro')) {
    return out.map((p, i) => (i === 0 ? p : { type: /[,:]$/.test(p.texte) ? 'chapeau' : 'point', texte: p.texte, cours: [cours[0].cours_code] }));
  }
  return out;
}
/* LE PROGRAMME, UN BLOC PAR COURS — ET RIEN DE PLUS (Charles, 8 octobre 2026 :
   « ok de mettre par blocs de cours, mais pas plus… c'est trop complexe ; et prévoir
   le même type de possibilité de mise en page »). Une introduction, puis, pour
   chaque activité d'apprentissage, un texte mis en page avec le même éditeur que le
   reste de la DUE. Le premier affichage reprend ce que le dossier pédagogique (ou
   l'ancienne liste de points) disait déjà, rangé sous son cours. */
const echap = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
export function blocsDepuisPoints(points, cours) {
  const codes = new Set(cours.map(x => x.cours_code));
  const html = items => {
    let h = ''; let liste = [];
    const vider = () => { if (liste.length) { h += `<ul>${liste.join('')}</ul>`; liste = []; } };
    for (const p of items) {
      if (p.type === 'point') liste.push(`<li><p>${echap(p.texte)}</p></li>`);
      else { vider(); h += p.type === 'chapeau' ? `<p><em>${echap(p.texte)}</em></p>` : `<p>${echap(p.texte)}</p>`; }
    }
    vider(); return h;
  };
  const premier = p => ((p.cours || [])[0] && codes.has(p.cours[0]) ? p.cours[0] : '');
  const out = { _intro: html(points.filter(p => p.type === 'intro' || !premier(p))) };
  for (const x of cours) out[x.cours_code] = html(points.filter(p => p.type !== 'intro' && premier(p) === x.cours_code));
  return out;
}
function ProgrammeParCours({ blocs, cours, lecture, onChange }) {
  const poser = (k, v) => onChange({ ...blocs, [k]: v });
  const bloc = (k, titre) => {
    if (lecture && !String(blocs[k] || '').replace(/<[^>]+>/g, '').trim()) return null;
    return (
      <div key={k || '_'} className="rounded-lg border border-slate-200 overflow-hidden">
        <div className="px-3 py-1.5 tab-entete text-[12px] font-semibold">{titre}</div>
        <div className={lecture ? 'px-3 py-2' : ''}>
          {lecture ? <div className="texte-due" dangerouslySetInnerHTML={{ __html: blocs[k] }} />
            : <EditeurDUE valeur={blocs[k] || ''} onChange={v => poser(k, v)} />}
        </div>
      </div>);
  };
  return (
    <div className="space-y-3">
      {bloc('_intro', 'Introduction')}
      {cours.map(x => bloc(x.cours_code, `${x.cours_code} — ${x.cours_nom || ''}`))}
    </div>);
}

/** La situation de l'unité dans sa section : prérequis, suites, mini schéma. */
function Situation({ d }) {
  const S = d.situation || {};
  const n = d.ue.ue_num;
  const lien = l => l.map(x => `UE ${x.ue_num}${x.ue_nom ? ` (${x.ue_nom})` : ''}${x.type === 'interne' ? ' — prérequis interne' : ''}`).join(', ');
  return (
    <div className="space-y-2 text-[13px]">
      <p className="m-0">{S.prerequis?.length ? <>L'UE {n} <b>fait suite à</b> {lien(S.prerequis)}.</> : <>L'UE {n} n'a pas de prérequis dans la section.</>}</p>
      <p className="m-0">{S.suites?.length ? <>L'UE {n} <b>est prérequise à</b> {lien(S.suites)}.</> : <>L'UE {n} n'est prérequise à aucune autre unité.</>}</p>
      {S.schema && <>
        {/* Le dessin vient du serveur (lib/schemaSvg.js) : le même que la fiche de l'étudiant. */}
        <div className="inline-block border border-slate-200 rounded-lg p-1.5 bg-white max-w-full overflow-x-auto" dangerouslySetInnerHTML={{ __html: S.schema }} />
        <p className="text-[11px] text-slate-500 m-0">En bleu plein, cette unité ; cerclées de bleu, ses prérequis et ses suites ; en bleu, les flèches qui la touchent ; pastille marine : unité déterminante. Les liens se règlent dans les référentiels (prérequis).</p>
      </>}
    </div>);
}

// ── La liste ─────────────────────────────────────────────────────────────────

function Liste({ onOuvrir }) {
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [fSection, setFSection] = useState('');
  const [rechercheUE, setRechercheUE] = useState('');

  useEffect(() => {
    api.dueListe().then(setEtat).catch(e => setErreur(e.message));
  }, []);

  if (erreur) return <div className="p-6 text-sm text-red-700">{erreur}</div>;
  if (!etat) return <div className="p-6 text-sm text-slate-400">Chargement…</div>;
  if (!etat.ues.length) {
    return (
      <div className="p-8 text-center text-sm text-slate-500">
        Aucune unité d'enseignement dans votre périmètre en {etat.annee} — ni
        gestion de section, ni attribution.
      </div>
    );
  }

  // LE NUMÉRO D'UE (Charles, 8 octobre 2026) : on tape quelques chiffres, la liste se
  // réduit aux unités qui commencent par eux — nom et section à côté ; Entrée ouvre
  // l'unité quand une seule répond.
  const q = rechercheUE.trim();
  const visibles = (fSection ? etat.ues.filter(u => u.section === fSection) : etat.ues)
    .filter(u => !q || String(u.ue_num).startsWith(q) || (/\D/.test(q) && String(u.ue_nom || '').toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="p-4">
      <div className="flex items-center gap-3 flex-wrap mb-3">
        <p className="text-[12px] text-slate-500 m-0 flex-1 min-w-[240px]">
          {etat.peut_valider
            ? "Toutes les unités de l'année. Une DUE validée passe en lecture seule pour ses titulaires."
            : "Les unités de vos sections et celles où vous portez une attribution. Vous complétez le descriptif de vos unités tant qu'il n'est pas validé."}
        </p>
        <label className="flex items-center gap-2 text-[12px] text-slate-500">
          UE n°
          <input value={rechercheUE} autoFocus inputMode="numeric" placeholder="ex. 333" data-reponses="non"
            onChange={e => setRechercheUE(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && visibles.length === 1) onOuvrir(visibles[0].ue_num); }}
            className="controle w-28" />
          {q && <span className="text-[12px] text-slate-600">
            {visibles.length === 1 ? <>UE {visibles[0].ue_num} — <b>{visibles[0].ue_nom}</b> · {visibles[0].section} <span className="text-slate-400">(Entrée pour ouvrir)</span></>
              : `${visibles.length} unité(s)`}</span>}
        </label>
        {(etat.sections || []).length > 1 && (
          <label className="flex items-center gap-2 text-[12px] text-slate-500">
            Section
            <select value={fSection} onChange={e => setFSection(e.target.value)}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-[13px] bg-white">
              <option value="">— Toutes —</option>
              {etat.sections.map(sx => <option key={sx} value={sx}>{sx}</option>)}
            </select>
          </label>
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
        {visibles.map(u => (
          <button key={u.ue_num} onClick={() => onOuvrir(u.ue_num)}
            className="text-left px-3 py-2.5 rounded-xl border border-slate-200 bg-white
                       hover:border-iip-blue/40 hover:shadow-sm transition">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-iip-blue truncate">
                  UE {u.ue_num} — {u.ue_nom}
                  {String(u.ue_tc || '').trim().toLowerCase() === 'x' && (
                    <span className="ml-1.5 align-middle text-[9px] font-bold px-1.5 py-0.5
                                     rounded bg-iip-blue text-white">TC</span>
                  )}
                </div>
                <div className="text-[11px] text-slate-500">
                  {u.section}{u.ects ? ` · ${u.ects} ECTS` : ''}{u.ue_quad ? ` · ${u.ue_quad}` : ''}
                </div>
              </div>
              <span className={`flex-none text-[10px] px-2 py-0.5 rounded-champ font-semibold ${
                u.statut === 'validee'
                  ? 'bg-emerald-500 text-white border border-emerald-500'
                  : 'bg-amber-500 text-white border border-amber-500'}`}>
                {u.statut === 'validee' ? 'validée' : 'en préparation'}
              </span>
            </div>
            <div className="text-[11px] text-slate-400 mt-1">
              {u.valide_le ? `Validée le ${u.valide_le}`
                : u.maj_le ? `Modifiée le ${String(u.maj_le).slice(0, 10)}`
                  : 'Jamais complétée'}
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Le tableau des critères d'évaluation ────────────────────────────────────
/* (Charles, 30 septembre 2026 ; modèle : UE 333, « 4.1 Introduction à
   l'anatomie ».) Pour chaque acquis, les points du programme qui le composent,
   et pour chacun l'indicateur (seuil = 50 %), le signe de non-réussite et un
   exemple de question — la chaîne du Guide pour l'évaluation par acquis
   d'apprentissage (Documentation). DEUX FORMES, cochées par la coordination ou
   la direction : un tableau pour l'unité si elle est évaluée d'une seule
   épreuve, un par activité d'enseignement sinon. La case écrit le réglage
   « évaluation unique » que la délibération lit : un seul fait, une source. */
/* LE MODÈLE DU 8 OCTOBRE 2026 (Charles) : Contexte = chapeau · AA · Critère · Indicateurs ·
   Signe de non-réussite · Exemples. « point » garde sa clé : les lignes déjà saisies restent. */
const COLONNES_CRIT = [
  ['point', 'Critère', 'l’AA contextualisée par le point du programme : l’étudiant est capable concrètement de…'],
  ['indicateur', 'Indicateurs', 'l’échelle : quand j’observe que c’est réussi (seuil = 50 %) — composé des degrés de maîtrise du DP'],
  // Signe de non-réussite et exemples de question : le chargé de cours les donne en
  // classe (Charles, 8 octobre 2026) — ils ne figurent pas dans la DUE.
];
// **gras** dans une case, comme sur le modèle.
const avecGras = t => String(t || '').split(/(\*\*.+?\*\*)/g).map((m, i) => (/^\*\*.+\*\*$/.test(m) ? <b key={i}>{m.slice(2, -2)}</b> : m));
function GrilleCriteres({ d, c, lecture, ueNum, onGrille, onMode }) {
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const unique = !!d.evaluation_unique;
  const grille = c.grille_criteres || {};
  const acquis = d.acquis || [];
  const descr = Object.fromEntries(acquis.map(a => [a.aa_code, a.description || '']));
  const contexte = Object.fromEntries(acquis.map(a => [a.aa_code, a.contexte || '']));
  const tables = unique
    ? [{ cle: '__ue__', titre: 'Épreuve de l’unité — évaluation globale', aa: acquis.map(a => a.aa_code) }]
    : (d.cours || []).map(co => ({ cle: co.cours_code, titre: `${co.cours_code} — ${co.cours_nom || ''}`,
        aa: co.acquis?.length ? co.acquis : acquis.map(a => a.aa_code) }));
  const poser = (cle, lignes) => onGrille({ ...grille, [cle]: lignes });
  const changerMode = async u => {
    setEnCours(true); setErreur(null);
    try { await api.dueModeEvaluation(ueNum, u); onMode(u); }
    catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const idList = `points-${ueNum}`;
  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center gap-3 text-[12px]">
        <span className="font-semibold text-slate-600">L'unité est évaluée</span>
        {[[true, 'globalement — un tableau pour l’unité'], [false, 'par activité d’enseignement — un tableau par cours']].map(([v, l]) => (
          <label key={String(v)} className={`flex items-center gap-1.5 ${d.droits?.regler_mode ? 'cursor-pointer' : 'text-slate-500'}`}>
            <input type="radio" name={`mode-${ueNum}`} checked={unique === v} disabled={!d.droits?.regler_mode || enCours}
              onChange={() => changerMode(v)} /> {l}
          </label>
        ))}
        {!d.droits?.regler_mode && <span className="text-slate-400">— réglé par la coordination ou la direction</span>}
      </div>
      {erreur && <p className="text-[12px]" style={{ color: 'var(--c-refuse)' }}>{erreur}</p>}
      {!lecture && !c.grille_criteres && d.grille_precedente && (
        <p className="text-[12px] text-slate-600">Le tableau de {d.grille_precedente.annee} existe.{' '}
          <button type="button" className="underline" onClick={() => onGrille(d.grille_precedente.grille)}>Le reprendre</button>, puis l'adapter.</p>
      )}
      <datalist id={idList}>{(d.points_programme || []).map((p, i) => <option key={i} value={p} />)}</datalist>
      {tables.map(t => {
        const lignes = grille[t.cle] || [];
        const maj = (i, k, v) => poser(t.cle, lignes.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
        const ajouter = aa => {
          // La nouvelle ligne se range sous les lignes du même acquis.
          const dernier = lignes.map(l => l.aa_code).lastIndexOf(aa);
          const n = [...lignes]; n.splice(dernier >= 0 ? dernier + 1 : n.length, 0, { aa_code: aa });
          poser(t.cle, n);
        };
        return (
          <div key={t.cle} className="border border-slate-200 rounded-carte overflow-x-auto">
            <div className="tab-entete px-3 py-1.5 text-[12px] font-semibold text-slate-700">{t.titre}</div>
            <table className="w-full text-[12px]">
              <thead className="tab-entete"><tr className="text-left text-[11px] text-slate-500">
                <th className="px-2 py-1 w-[14%] align-top">Contexte (chapeau)</th>
                <th className="px-2 py-1 w-[16%] align-top">Acquis d’apprentissage</th>
                {COLONNES_CRIT.map(([k, l, def]) => <th key={k} className="px-2 py-1 align-top">{l}
                  {def && <div className="font-normal italic normal-case text-[10px] text-slate-500 leading-snug">{def}</div>}</th>)}
                {!lecture && <th className="w-8" />}
              </tr></thead>
              <tbody>
                {!lignes.length && (
                  <tr><td colSpan={5} className="px-2 py-2 text-slate-400">Aucune ligne. {!lecture && 'Ajoutez un acquis ci-dessous, ou tous d’un coup.'}</td></tr>
                )}
                {lignes.map((l, i) => {
                  const premier = i === 0 || lignes[i - 1].aa_code !== l.aa_code;
                  return (
                    <tr key={i} className={`bg-white align-top ${premier ? 'border-t border-slate-200' : ''}`}>
                      <td className="px-2 py-1 text-slate-600 whitespace-pre-line">{premier ? contexte[l.aa_code] || '' : ''}</td>
                      <td className="px-2 py-1">
                        {premier && (lecture
                          ? <span title={descr[l.aa_code]}><b>{l.aa_code}</b> <span className="text-slate-500">{descr[l.aa_code]}</span></span>
                          : <select className="controle w-full h-auto py-1 text-[12px]" value={l.aa_code || ''}
                              onChange={e => maj(i, 'aa_code', e.target.value)}>
                              <option value="">— acquis —</option>
                              {acquis.map(a => <option key={a.aa_code} value={a.aa_code}>{a.aa_code} — {(a.description || '').slice(0, 60)}</option>)}
                            </select>)}
                      </td>
                      {COLONNES_CRIT.map(([k]) => (
                        <td key={k} className="px-1 py-1">
                          {lecture ? <span className="whitespace-pre-line">{avecGras(l[k])}</span>
                            : <>
                              <textarea rows={3} className="controle w-full h-auto py-1 text-[12px]" value={l[k] || ''} data-reponses="non"
                                onChange={e => maj(i, k, e.target.value)} />
                              {k === 'point' && (d.points_programme || []).length > 0 && (
                                <select className="w-full text-[11px] text-slate-500 border-0 bg-transparent" value=""
                                  onChange={e => e.target.value && maj(i, k, l[k] ? `${l[k]} ${e.target.value}` : e.target.value)}>
                                  <option value="">+ un point du programme…</option>
                                  {(d.points_programme || []).map((p, j) => <option key={j} value={p}>{p.slice(0, 90)}</option>)}
                                </select>)}
                            </>}
                        </td>
                      ))}
                      {!lecture && (
                        <td className="px-1 py-1 whitespace-nowrap">
                          <button type="button" className="text-slate-400 hover:text-slate-700" title="Un point de plus pour cet acquis" onClick={() => ajouter(l.aa_code)}>+</button>
                          <button type="button" className="ml-1.5 text-slate-400 hover:text-slate-700" title="Retirer cette ligne"
                            onClick={() => poser(t.cle, lignes.filter((_, j) => j !== i))}>×</button>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {!lecture && (
              <div className="px-2 py-1.5 border-t border-slate-100 flex flex-wrap items-center gap-2 text-[12px]">
                <span className="text-slate-500">Ajouter un acquis :</span>
                {t.aa.some(a => !lignes.some(l => l.aa_code === a)) && (
                  <button type="button" className="bouton" title="Une ligne pour chaque acquis qui n'en a pas encore"
                    onClick={() => poser(t.cle, [...lignes, ...t.aa.filter(a => !lignes.some(l => l.aa_code === a)).map(a => ({ aa_code: a }))]
                      .sort((x, y) => String(x.aa_code).localeCompare(String(y.aa_code), 'fr', { numeric: true })))}>Tous les acquis</button>)}
                {t.aa.filter(a => !lignes.some(l => l.aa_code === a)).map(a => (
                  <button key={a} type="button" className="bouton" title={descr[a]} onClick={() => ajouter(a)}>{a}</button>
                ))}
                {t.aa.every(a => lignes.some(l => l.aa_code === a)) && <span className="text-slate-400">tous les acquis de {unique ? 'l’unité' : 'ce cours'} ont leur ligne.</span>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── La fiche ─────────────────────────────────────────────────────────────────

/* `integree` : la fiche vit dans l'onglet « Pondération, croisement et DUE », qui
   porte déjà l'unité et son titre — ni retour, ni second titre. */
export function Fiche({ ueNum, onRetour, integree = false }) {
  const [d, setD] = useState(null);
  const [c, setC] = useState({});
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [sale, setSale] = useState(false);
  const [enCours, setEnCours] = useState(false);
  /* L'APERÇU AVANT IMPRESSION (Charles, 8 octobre 2026 : « prévoir en haut un mode
     aperçu pour voir ce que cela donne avant impression ») : le PDF même que sortira
     l'impression — enveloppe, pages, pied —, composé par le serveur. Ce qui n'est
     pas encore enregistré l'est d'abord : l'aperçu montre ce qui sortira, pas un
     brouillon que la pièce ignorerait. */
  const [vue, setVue] = useState('rediger');
  const [apercu, setApercu] = useState({ url: null, html: null, enCours: false, erreur: null });
  useEffect(() => () => { if (apercu.url) URL.revokeObjectURL(apercu.url); }, [apercu.url]);

  useEffect(() => {
    api.dueLire(ueNum)
      .then(j => { setD(j); setC(j.contenu || {}); setSale(false); })
      .catch(e => setErreur(e.message));
  }, [ueNum]);

  const lecture = !d?.droits?.ecrire;

  // CE QUI N'EST PAS ENCORE RÉDIGÉ EST REPRIS DU DOSSIER PÉDAGOGIQUE.
  //
  // Proposer un bouton « reprendre ce texte » revenait à demander seize fois
  // le même clic pour recopier un texte officiel que Lucie détient déjà. Le
  // champ arrive donc rempli du dossier, et l'enseignant l'adapte. Rien n'est
  // enregistré tant qu'il n'a rien touché : le jour où le dossier change, la
  // DUE suit.
  const duDP = { finalites: 'finalites', finalites_generales: 'finalites_generales', programme: 'programme',
    degre_maitrise: 'degre_maitrise' };
  const valeur = cle => c[cle] ?? (duDP[cle] ? d?.dp?.[duDP[cle]] : null) ?? '';
  const reprisDuDP = cle => c[cle] == null && !!(duDP[cle] && d?.dp?.[duDP[cle]]);
  const maj = (cle, val) => { setC(x => ({ ...x, [cle]: val })); setSale(true); };
  const majSous = (cle, sous, val) => {
    setC(x => ({ ...x, [cle]: { ...(x[cle] || {}), [sous]: val } })); setSale(true);
  };

  async function enregistrer() {
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      const j = await api.dueEnregistrer(ueNum, c);
      setD(x => ({ ...x, ...j })); setSale(false);
      setMessage('Descriptif enregistré.');
      return true;
    } catch (e) { setErreur(e.message); return false; }
    finally { setEnCours(false); }
  }

  async function voirApercu() {
    setVue('apercu');
    setApercu(a => ({ ...a, enCours: true, erreur: null }));
    try {
      if (sale && !lecture && !(await enregistrer())) throw new Error("Le descriptif n'a pas pu être enregistré : l'aperçu montrerait une version ancienne.");
      const j = await api.dueDocument(ueNum);
      const r = await fetch('/api/impression/pdf', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ html: j.html, nom: `DUE_UE${ueNum}`, orientation: 'portrait' }) }).catch(() => null);
      // LE MÊME REPLI QUE PARTOUT : sans PDF du serveur, la pièce elle-même, telle
      // que le navigateur l'imprimerait.
      if (!r?.ok) {
        const e = r ? await r.json().catch(() => ({})) : {};
        setApercu({ url: null, html: j.html, raison: e.error || (r ? `Erreur ${r.status}` : 'serveur injoignable'), enCours: false, erreur: null });
        return;
      }
      const url = URL.createObjectURL(await r.blob());
      setApercu({ url, html: null, enCours: false, erreur: null });
    } catch (e) { setApercu({ url: null, html: null, enCours: false, erreur: e.message }); }
  }

  async function basculerValidation() {
    setEnCours(true); setErreur(null); setMessage(null);
    try {
      const rouvrir = d.statut === 'validee';
      await api.dueValider(ueNum, rouvrir);
      const j = await api.dueLire(ueNum);
      setD(j); setC(j.contenu || {}); setSale(false);
      setMessage(rouvrir ? 'DUE rouverte : les titulaires peuvent à nouveau la compléter.'
        : 'DUE validée : elle est désormais en lecture seule.');
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function imprimer() {
    try {
      const j = await api.dueDocument(ueNum);
      ouvrirApercu({
        html: j.html, titre: `Descriptif de l'unité ${ueNum}`, nomFichier: `DUE_UE${ueNum}`,
        envoiPossible: false, astuceImpression: 'A4 portrait', pdf: { orientation: 'portrait' },
      });
    } catch (e) { setErreur(e.message); }
  }

  // Les champs restés vides : ce sont eux qui empêchent la validation d'être
  // sereine, autant les nommer plutôt que de laisser chercher.
  const manques = useMemo(() => {
    if (!d) return [];
    const m = [];
    const vide = cle => !(c[cle] || d.dp?.[cle]);
    if (vide('finalites')) m.push('finalités particulières');
    const blocsPleins = Object.values(c.programme_blocs || {}).some(h => String(h || '').replace(/<[^>]+>/g, '').trim());
    if (vide('programme') && !blocsPleins && !(c.points || []).length) m.push('programme');
    if (!Object.values(c.methodes || {}).some(Boolean)) m.push("méthodes d'apprentissage");
    if (!c.criteres) m.push('contrat pédagogique');
    if (vide('degre_maitrise')) m.push('degré de maîtrise');
    const sansEval = (d.cours || []).filter(x =>
      !Object.values(c.evaluation?.[x.cours_code]?.s1 || {}).some(Boolean));
    if (sansEval.length) m.push(`modalités de 1re session (${sansEval.length} cours)`);
    return m;
  }, [c, d]);

  if (erreur && !d) return <div className="p-6 text-sm text-red-700">{erreur}</div>;
  if (!d) return <div className="p-6 text-sm text-slate-400">Chargement…</div>;
  const u = d.ue;

  return (
    /* PLEINE PAGE (Charles, 8 octobre 2026 : « laisser en pleine page pour la mise en page »). */
    <div className={integree ? '' : 'p-4'}>
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="min-w-0">
          {!integree && <>
          <button onClick={onRetour}
            className="text-[12px] text-slate-500 hover:text-iip-blue flex items-center gap-1 mb-1">
            <IconArrowLeft size={13} /> Tous les descriptifs
          </button>
          <h2 className="text-[15px] font-semibold text-iip-blue truncate">
            UE {u.ue_num} — {u.ue_nom}
          </h2>
          </>}
          <div className="flex items-center gap-2 mt-1">
            <span className={`text-[11px] px-2 py-0.5 rounded-champ font-semibold ${
              d.statut === 'validee'
                ? 'bg-emerald-500 text-white border border-emerald-500'
                : 'bg-amber-500 text-white border border-amber-500'}`}>
              {d.statut === 'validee' ? `validée le ${d.valide_le || ''}` : 'en préparation'}
            </span>
            <span className="text-[11px] text-slate-400 flex items-center gap-1">
              {lecture ? <><IconEye size={12} /> lecture seule</>
                : <><IconPencil size={12} /> vous pouvez modifier</>}
            </span>
          </div>
        </div>
        <div className="flex flex-none gap-2 items-center">
          <div className="segments" role="tablist" aria-label="Mode">
            {[['rediger', 'Rédiger', IconPencil], ['apercu', 'Aperçu', IconEye]].map(([v, l, I]) => (
              <button key={v} type="button" role="tab" aria-selected={vue === v}
                onClick={() => (v === 'apercu' ? voirApercu() : setVue('rediger'))}
                className={`gap-1.5 ${vue === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}`}>
                <I size={14} /> {l}
              </button>))}
          </div>
          <OuvrirEditions titre="Imprimer ou envoyer le DUE — centre d'édition"
            pieces={[{ cle: 'due', label: 'Document d’unité d’enseignement (DUE)', description: 'Tel qu’il est à l’écran', onClick: () => imprimer() }]} />
          {d.droits.valider && (
            <button onClick={basculerValidation} disabled={enCours}
              className={`px-3 py-1.5 text-[12px] rounded-lg font-semibold flex items-center gap-1.5
                ${d.statut === 'validee'
      ? 'border border-amber-500 text-white bg-amber-500'
      : 'bg-emerald-600 text-white'}`}>
              {d.statut === 'validee' ? <><IconLockOpen size={14} /> Rouvrir</>
                : <><IconLock size={14} /> Valider</>}
            </button>
          )}
          {!lecture && (
            <button onClick={enregistrer} disabled={enCours || !sale}
              className="px-3 py-1.5 text-[12px] rounded-lg bg-iip-blue text-white font-semibold
                         flex items-center gap-1.5 disabled:opacity-40">
              <IconDeviceFloppy size={14} /> Enregistrer
            </button>
          )}
        </div>
      </div>

      {erreur && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-red-50 border border-red-200
                        text-[12px] text-red-800 flex items-start gap-1.5">
          <IconAlertTriangle size={14} className="mt-0.5 flex-none" /> {erreur}
        </div>
      )}
      {message && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200
                        text-[12px] text-emerald-800 flex items-start gap-1.5">
          <IconCircleCheck size={14} className="mt-0.5 flex-none" /> {message}
        </div>
      )}
      {!lecture && !!manques.length && (
        <div className="mb-3 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                        text-[12px] text-amber-900">
          <b>Reste à compléter :</b> {manques.join(' · ')}.
        </div>
      )}

      {vue === 'apercu' ? (
        <div className="rounded-lg border border-slate-200 bg-slate-100 p-3">
          {apercu.enCours && <p className="text-[13px] text-slate-500 m-0 p-6 text-center">Composition de la pièce…</p>}
          {apercu.erreur && <p className="text-[13px] text-red-700 m-0 p-4">{apercu.erreur}</p>}
          {apercu.url && !apercu.enCours && (
            <iframe title={`Aperçu du descriptif de l'UE ${ueNum}`} src={apercu.url}
              className="w-full bg-white rounded" style={{ height: 'calc(100vh - 220px)', minHeight: 500, border: 0 }} />)}
          {apercu.html && !apercu.enCours && apercu.raison && (
            <p className="text-[12px] text-slate-600 m-0 mb-2">Le PDF n'a pas pu être composé ({apercu.raison}) : voici la pièce telle que le navigateur l'imprimerait.</p>)}
          {apercu.html && !apercu.enCours && (
            <iframe title={`Aperçu du descriptif de l'UE ${ueNum}`} srcDoc={apercu.html} sandbox=""
              className="block mx-auto bg-white shadow" style={{ width: '210mm', maxWidth: '100%', height: 'calc(100vh - 220px)', minHeight: 500, border: 0 }} />)}
        </div>
      ) : (<>
      {/* ── Ce que Lucie sait déjà ── */}
      <Bloc titre="Identification de l'unité"
        aide="Repris du référentiel de l'année : pour le corriger, passez par les référentiels.">
        <div className="grid gap-2 sm:grid-cols-3 mb-3">
          <Su label="Section" valeur={u.section} />
          <Su label="Crédits ECTS" valeur={u.ects} />
          <Su label="Volume horaire"
            valeur={u.periodes ? `${u.periodes} périodes · ${u.heures} h` : null} />
          <Su label="Situation dans la formation" valeur={[u.niv, u.quadrimestre].filter(Boolean).join(' · ') || null} />
          <Su label="Unité prérequise" valeur={u.prerequise || 'Aucune'} />
          <Su label="Code FWB" valeur={u.ue_code_fwb} />
        </div>
        <div className="grid gap-2 sm:grid-cols-2">
          <Responsable c={c} d={d} lecture={lecture} onChange={v => maj('responsable', v)} />
          <Champ label="Bloc d'études administratif" valeur={c.bloc} lecture={lecture}
            placeholder="1, 2 ou 3" onChange={v => maj('bloc', v)} />
          <Champ label="Niveau du cadre européen des certifications" valeur={c.niveau_cec}
            lecture={lecture} placeholder={d.cec_defaut || 'aucun (formation continue)'} onChange={v => maj('niveau_cec', v)} />
          <Champ label="Langue d'enseignement" valeur={c.langue_ens} lecture={lecture}
            placeholder="Français" onChange={v => maj('langue_ens', v)} />
          <Champ label="Langue d'évaluation" valeur={c.langue_eval} lecture={lecture}
            placeholder="Français" onChange={v => maj('langue_eval', v)} />
        </div>
        {!lecture && (
          <label className="flex items-center gap-2 mt-2 text-[12px] text-slate-700">
            <input type="checkbox" checked={!!c.codiplomation} className="w-4 h-4 accent-iip-blue"
              onChange={e => maj('codiplomation', e.target.checked)} />
            Co-diplomation HELB
          </label>
        )}
      </Bloc>

      <Bloc titre="Situation dans la section" aide="Les prérequis du référentiel : ce que l'unité suppose, et ce qu'elle ouvre.">
        <Situation d={d} />
      </Bloc>

      <Bloc titre="Titulaires" aide="Tirés des attributions de l'année.">
        {d.enseignants.length ? (
          <ul className="text-[13px] text-slate-700 space-y-0.5">
            {d.enseignants.map((e, i) => (
              <li key={i}>{(e.nom || '').toUpperCase()} {e.prenom}
                {e.cours && <span className="text-slate-400"> — {e.cours}</span>}</li>
            ))}
          </ul>
        ) : (
          <div className="text-[12px] text-amber-800">
            Aucune attribution encodée pour cette unité : les titulaires manqueront au document.
          </div>
        )}
      </Bloc>

      <Bloc titre="Acquis d'apprentissage"
        aide="Encodés dans le référentiel des acquis ; rattachés aux cours par la pondération.">
        {d.acquis.length ? (
          /* Comme le dossier : la phrase de l'unité, puis chaque groupe sous
             son chapeau. */
          <div className="text-[13px] text-slate-700 space-y-1">
            {d.introduction_acquis && <p className="font-semibold text-slate-800">{d.introduction_acquis}</p>}
            {d.acquis.map(a => (
              <div key={a.aa_code}>
                {a.chapeau && <p className="italic text-slate-600 mt-1.5 whitespace-pre-line">{a.chapeau}</p>}
                <p className="pl-4">
                  <b className="text-iip-blue">{a.aa_code}</b> — {a.description
                    || <i className="text-amber-700">libellé absent du référentiel</i>}
                </p>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-[12px] text-amber-800">
            Aucun acquis encodé pour cette unité.
            {d.dp?.acquis && (
              <div className="mt-2 text-slate-600">
                Le dossier pédagogique en énonce pourtant ; ils s'encodent dans le référentiel
                des acquis, où ils serviront aussi à l'encodage et à la délibération :
                <pre className="mt-1 p-2 bg-slate-50 border border-slate-200 rounded-lg
                                text-[12px] whitespace-pre-wrap font-sans max-h-56
                                overflow-y-auto">{d.dp.acquis}</pre>
              </div>
            )}
          </div>
        )}
      </Bloc>

      <Bloc titre="Activités d'apprentissage">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] uppercase text-slate-400">
              <th className="pb-1">Code</th><th>Intitulé</th>
              <th className="text-right">Périodes</th><th className="text-right">Heures</th>
              <th className="pl-3">Acquis évalués</th>
            </tr>
          </thead>
          <tbody>
            {d.cours.map(x => (
              <tr key={x.cours_code} className="border-t border-slate-100">
                <td className="py-1 text-slate-500">{x.cours_code}</td>
                <td className="text-slate-800">{x.cours_nom}</td>
                <td className="text-right">{x.cours_per ?? '—'}</td>
                <td className="text-right">{x.heures ?? '—'}</td>
                <td className="pl-3 text-slate-500">{(x.acquis || []).join(', ') || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Bloc>

      {/* ── Ce que l'enseignant et la coordination rédigent ── */}
      <Bloc titre="Finalités générales"
        aide="Celles du dossier pédagogique quand il les écrit à part ; à défaut, le texte de l'établissement (article 7 du décret).">
        <Riche valeur={c.finalites_generales ?? d.dp?.finalites_generales ?? d.finalites_generales_defaut} lecture={lecture}
          onChange={v => maj('finalites_generales', v)} />
      </Bloc>

      <Bloc titre="Finalités particulières"
        aide="Ce que cette unité vise à faire acquérir, au-delà des finalités générales.">
        <Riche valeur={valeur('finalites')} lecture={lecture} onChange={v => maj('finalites', v)} />
        <Repris actif={reprisDuDP('finalites')} />
      </Bloc>

      <Bloc titre="Programme"
        aide="Une introduction, puis un bloc par activité d'apprentissage, mis en page avec la même barre que le reste du descriptif.">
        <ProgrammeParCours cours={d.cours || []} lecture={lecture}
          blocs={c.programme_blocs ?? blocsDepuisPoints(c.points ?? lireProgramme(c.programme || d.dp?.programme || (d.points_programme || []).join('\n'), d.cours || []), d.cours || [])}
          onChange={v => maj('programme_blocs', v)} />
      </Bloc>

      <Bloc titre="Méthodes d'apprentissage">
        <div className="flex flex-wrap gap-1.5">
          {METHODES.map(([k, l]) => {
            const on = !!c.methodes?.[k];
            if (lecture && !on) return null;
            return (
              <button key={k} disabled={lecture}
                onClick={() => majSous('methodes', k, !on)}
                className={`px-2.5 py-1 rounded-champ text-[12px] border ${on
                  ? 'bg-iip-blue text-white border-iip-blue'
                  : 'bg-white text-slate-600 border-slate-300 hover:border-iip-blue/50'}`}>
                {on && <IconCheck size={11} className="inline mr-1" />}{l}
              </button>
            );
          })}
        </div>
        <div className="mt-2">
          <Champ label="Autre" valeur={c.methode_autre} lecture={lecture}
            onChange={v => maj('methode_autre', v)} />
        </div>
        {/* LE CONTRAT PÉDAGOGIQUE (Charles, 8 octobre 2026 : « ceci doit passer dans
            méthodes d'apprentissage, c'est le contrat pédagogique ») — le même champ
            qu'avant (« criteres ») : ce qui y était écrit suit. */}
        <div className="mt-3">
          <span className="block text-[11px] font-semibold text-slate-500 mb-1">Contrat pédagogique</span>
          <Riche valeur={c.criteres} lecture={lecture} onChange={v => maj('criteres', v)} />
          <DuDossier texte={d.dp?.capacites} valeur={c.criteres} lecture={lecture}
            onChange={v => maj('criteres', v)}
            libelle="les capacités préalables du dossier pédagogique" />
        </div>
      </Bloc>

      <Bloc titre="Supports de cours"
        aide="Un support obligatoire doit être déposé sur eCampus, sauf ouvrage protégé.">
        <table className="w-full text-[12px]">
          <thead>
            <tr className="text-left text-[11px] uppercase text-slate-400">
              <th className="pb-1">Activité</th><th>Type de support</th>
              <th className="text-right">Obligatoire</th>
            </tr>
          </thead>
          <tbody>
            {d.cours.map(x => {
              const s = c.supports?.[x.cours_code] || {};
              const poser = v => majSous('supports', x.cours_code, { ...s, ...v });
              return (
                <tr key={x.cours_code} className="border-t border-slate-100">
                  <td className="py-1 text-slate-800"><b className="text-iip-blue">{x.cours_code}</b> — {x.cours_nom}</td>
                  <td>
                    {lecture ? (s.type || '—')
                      : <input value={s.type || ''} placeholder="Syllabus, PowerPoint, ouvrage…"
                        onChange={e => poser({ type: e.target.value })}
                        className="w-full text-[12px] border border-slate-300 rounded px-2 py-1" />}
                  </td>
                  <td className="text-right">
                    <input type="checkbox" disabled={lecture} checked={!!s.obligatoire}
                      onChange={e => poser({ obligatoire: e.target.checked })}
                      className="w-4 h-4 accent-iip-blue" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Bloc>

      {d.note_supports && <p className="-mt-2 mb-4 text-[12px] text-slate-600 italic">{d.note_supports}</p>}

      <Bloc titre="Modalités d'évaluation">
        {['s1', 's2'].map(sess => (
          <div key={sess} className="mb-3 last:mb-0">
            <div className="text-[11px] font-semibold text-slate-500 mb-1">
              {sess === 's1' ? 'Première session' : 'Seconde session'}
            </div>
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-[10px] uppercase text-slate-400">
                  <th className="text-left pb-1">Activité</th>
                  {EPREUVES.map(([k, l]) => <th key={k} className="text-center">{l}</th>)}
                </tr>
              </thead>
              <tbody>
                {d.cours.map(x => {
                  const e = c.evaluation?.[x.cours_code]?.[sess] || {};
                  const poser = (k, v) => {
                    const parCours = { ...(c.evaluation?.[x.cours_code] || {}) };
                    parCours[sess] = { ...e, [k]: v };
                    majSous('evaluation', x.cours_code, parCours);
                  };
                  return (
                    <tr key={x.cours_code} className="border-t border-slate-100">
                      <td className="py-1 text-slate-800"><b className="text-iip-blue">{x.cours_code}</b> — {x.cours_nom}</td>
                      {EPREUVES.map(([k]) => (
                        <td key={k} className="text-center">
                          <input type="checkbox" disabled={lecture} checked={!!e[k]}
                            onChange={ev => poser(k, ev.target.checked)}
                            className="w-4 h-4 accent-iip-blue" />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ))}
        <div className="mt-2">
          <span className="block text-[11px] font-semibold text-slate-500 mb-0.5">
            Note générale de l'unité
          </span>
          <Riche valeur={c.note_ue} lecture={lecture} onChange={v => maj('note_ue', v)} />
          {!c.note_ue && <p className="text-[11px] text-slate-500 mt-1">Laissée vide, la DUE reprend la règle usuelle : moyenne pondérée des acquis, mais unité non acquise dès qu'une note est sous 10/20, sauf décision du Conseil des études.</p>}
        </div>
      </Bloc>

      <Bloc titre="Critères d'évaluation" aide="Acquis par acquis, sous son chapeau : le critère et ses indicateurs. Pour mettre un mot en gras dans une case : **mot**.">
        <GrilleCriteres d={d} c={c} lecture={lecture} ueNum={ueNum}
          onGrille={g => maj('grille_criteres', g)}
          onMode={unique => setD(x => ({ ...x, evaluation_unique: unique }))} />
      </Bloc>

      <Bloc titre="Degré de maîtrise" aide="Pour chaque acquis, ce qui distingue la maîtrise.">
        <Riche valeur={valeur('degre_maitrise')} lecture={lecture} onChange={v => maj('degre_maitrise', v)} />
        <Repris actif={reprisDuDP('degre_maitrise')} />
      </Bloc>

      </>)}
      {vue === 'rediger' && !lecture && sale && (
        <div className="sticky bottom-3 flex justify-end">
          <button onClick={enregistrer} disabled={enCours}
            className="px-4 py-2 text-[13px] rounded-lg bg-iip-blue text-white font-semibold
                       shadow-lg flex items-center gap-1.5">
            <IconDeviceFloppy size={15} /> Enregistrer les modifications
          </button>
        </div>
      )}
    </div>
  );
}

export default function DUE({ ueInitiale = null }) {
  const [ueNum, setUeNum] = useState(ueInitiale);
  return ueNum == null
    ? <Liste onOuvrir={setUeNum} />
    : <Fiche ueNum={ueNum} onRetour={() => setUeNum(null)} />;
}
