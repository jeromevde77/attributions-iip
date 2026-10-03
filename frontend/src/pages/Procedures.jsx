// ─────────────────────────────────────────────────────────────────────────────
// Lucie — PROCÉDURES : RECOURS ET DISCIPLINE (RDE 2026-2027)
//
// Refonte du 3 octobre 2026, sur l'API /api/procedures/dossiers
// (backend/src/routes/dossiers.js, lib/procedures.js) — c'est elle qui fait
// foi pour les champs, l'ordre des étapes, les contrôles et les délais.
//
// Deux circuits, et pas un de plus : le RECOURS (art. 87-91) et la procédure
// DISCIPLINAIRE (art. 115-119), dont la FRAUDE (art. 72-75) est une nature.
// Chaque dossier part d'un ÉTUDIANT de Lucie et de son inscription : aucun nom,
// aucune section, aucune UE tapés à la main. L'état se lit des traces ; chaque
// étape porte le nom de celui qui l'a posée (la personne connectée).
//
// Les dossiers d'avant le 3 octobre se relisent sous « Anciens dossiers »
// (pages/ProceduresAnciennes.jsx).
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import {
  IconListDetails, IconArchive, IconPlus, IconArrowLeft, IconCheck, IconSearch,
  IconUpload, IconDownload, IconFileText, IconTrash, IconScale, IconShieldExclamation,
  IconAlertTriangle, IconCircleCheck,
} from '@tabler/icons-react';
import { authHeaders, getAnnee, telechargerFichier } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { nomPropre } from '../lib/nom.js';
import { informer } from '../lib/dialogue.jsx';
import {
  RailLateral, PageHeader, Fenetre, Encadre, PastilleEtat,
  Tableau, TableauEntete, Th, Td, Tr, TableauVide,
} from '../components/ui.jsx';
// Les anciens dossiers ne se chargent que si on les ouvre : l'ancien écran est lourd.
const ArchivesProcedures = lazy(() => import('./ProceduresAnciennes.jsx').then(m => ({ default: m.ArchivesProcedures })));

const BASE = '/api/procedures/dossiers';

// ── Utilitaires ──────────────────────────────────────────────────────────────
/** LA DATE DU JOUR EST LE DÉFAUT (CLAUDE.md, « Les traces »). Date locale. */
function aujourdHui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
/** jj/mm/aaaa — à partir de « aaaa-mm-jj » ou « aaaa-mm-jj hh:mm:ss ». */
function fmt(s) {
  if (!s) return '—';
  const [a, m, j] = String(s).slice(0, 10).split('-');
  return a && m && j ? `${j}/${m}/${a}` : String(s);
}
function fmtHeure(s) {
  if (!s) return '';
  const h = String(s).slice(11, 16);
  return h ? ` à ${h}` : '';
}
/** Jours entre aujourd'hui et une date (négatif si dépassée). */
function joursAvant(date) {
  if (!date) return null;
  const [a, m, j] = String(date).slice(0, 10).split('-').map(Number);
  const cible = new Date(a, m - 1, j);
  const t = new Date(); const auj = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((cible - auj) / 86400000);
}

/** Un appel JSON : rend { ok, status, data } — l'erreur se lit, elle ne jette pas. */
async function appel(url, opts = {}) {
  try {
    const rep = await fetch(url, { ...opts, headers: authHeaders(opts.headers) });
    let data = null;
    try { data = await rep.json(); } catch { data = null; }
    return { ok: rep.ok, status: rep.status, data };
  } catch (e) {
    return { ok: false, status: 0, data: { error: e.message } };
  }
}

// ── Les vocabulaires de l'écran ──────────────────────────────────────────────
/** Le genre d'un dossier, tel que le registre le nomme. */
function genre(d) {
  if (d.type === 'recours') return 'recours';
  return d.nature === 'fraude' ? 'fraude' : 'discipline';
}
const GENRES = {
  recours:    { label: 'Recours',    etat: 'disponible', icone: IconScale },
  fraude:     { label: 'Fraude',     etat: 'surveiller', icone: IconShieldExclamation },
  discipline: { label: 'Discipline', etat: 'corriger',   icone: IconShieldExclamation },
};
function PastilleType({ dossier }) {
  const g = GENRES[genre(dossier)];
  return <PastilleEtat etat={g.etat}>{g.label}</PastilleEtat>;
}

const MODES_REMISE = [['main_propre', 'Remise en main propre'], ['recommande', 'Recommandé']];
const ISSUES_EXTERNES = [['accueilli', 'Accueilli'], ['rejete', 'Rejeté']];
const PV_AUDITION = [
  ['signe', "PV signé par l'étudiant"],
  ['refus_constate', 'Refus de signer constaté par deux membres du personnel'],
  ['absent', 'Étudiant absent'],
];
const CATEGORIES_PIECE = [
  ['plainte', 'Plainte'], ['pv_surveillance', 'PV de surveillance'], ['preuve', 'Preuve'],
  ['courrier', 'Courrier'], ['autre', 'Autre'],
];
const ROLES = {
  president: 'Président', membre: 'Membre', redacteur: 'Rédacteur du PV', rapporteur: 'A constaté les faits',
};
const ROLES_PAR_TYPE = {
  recours: ['president', 'membre'],
  disciplinaire: ['rapporteur', 'redacteur'],
};

/** Les pièces officielles, et l'étape qui les rend possibles. */
const PIECES_OFFICIELLES = {
  recours: [
    { piece: 'accuse_reception', label: 'Accusé de réception', etape: 'plainte', pret: d => !!d.etapes?.plainte },
    { piece: 'irrecevabilite', label: "Décision d'irrecevabilité", etape: 'recevabilite',
      pret: d => d.etapes?.recevabilite?.recevable === false },
    { piece: 'decision_recours', label: 'Décision motivée du CDE restreint', etape: 'decision', pret: d => !!d.etapes?.decision },
  ],
  disciplinaire: [
    { piece: 'convocation', label: "Convocation à l'audition", etape: 'convocation', pret: d => !!d.etapes?.convocation },
    { piece: 'pv_audition', label: "Procès-verbal d'audition", etape: 'audition', pret: d => !!d.etapes?.audition },
    { piece: 'decision_disciplinaire', label: 'Décision motivée', etape: 'decision', pret: d => !!d.etapes?.decision },
  ],
};

/** Le résultat d'une inscription, lu comme un état. */
function lireResultat(i) {
  const r = String(i.resultat || '').toLowerCase();
  const s = i.session === 2 ? ' · S2' : '';
  if (r === 'refuse') return { etat: 'corriger', label: `Refusé${s}` };
  if (r === 'reussi') return { etat: 'reussi', label: `Réussi${s}` };
  if (r === 'ajourne') return { etat: 'surveiller', label: `Ajourné${s}` };
  if (!r) return { etat: 'neutre', label: 'Pas de décision' };
  return { etat: 'neutre', label: i.resultat };
}

// ── Petites briques ──────────────────────────────────────────────────────────
function Segments({ options, valeur, onChange, desactive = false }) {
  return (
    <div className="segments">
      {options.map(([v, l]) => (
        <button key={v} type="button" disabled={desactive} onClick={() => onChange(v)}
          className={valeur === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}>{l}</button>
      ))}
    </div>
  );
}
function Champ({ label, children, aide }) {
  return (
    <label className="block">
      <span className="block text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-1">{label}</span>
      {children}
      {aide && <span className="block text-[11px] text-slate-400 mt-1">{aide}</span>}
    </label>
  );
}
function Intertitre({ children }) {
  return <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 mb-2">{children}</div>;
}
const CLS_TEXTE = 'w-full rounded-champ border border-slate-300 bg-white px-3 py-2 text-[13px] text-slate-800';
function Choix({ valeur, onChange, options, vide = '— choisir —', desactive }) {
  return (
    <select className="controle w-full" value={valeur ?? ''} disabled={desactive}
      onChange={e => onChange(e.target.value || null)}>
      <option value="">{vide}</option>
      {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
    </select>
  );
}
function Date_({ valeur, onChange, desactive }) {
  return <input type="date" className="controle w-full" value={valeur || ''} disabled={desactive}
    onChange={e => onChange(e.target.value || null)} />;
}
function Case({ coche, onChange, children, desactive }) {
  return (
    <label className={`flex items-start gap-2 text-[13px] text-slate-700 ${desactive ? 'opacity-60' : 'cursor-pointer'}`}>
      <input type="checkbox" className="mt-0.5" checked={!!coche} disabled={desactive}
        onChange={e => onChange(e.target.checked)} />
      <span>{children}</span>
    </label>
  );
}
function OuiNon({ valeur, onChange, oui = 'Oui', non = 'Non', desactive }) {
  return <Segments desactive={desactive} options={[['oui', oui], ['non', non]]}
    valeur={valeur === true ? 'oui' : valeur === false ? 'non' : null}
    onChange={v => onChange(v === 'oui')} />;
}
function Bloc({ titre, children, actions }) {
  return (
    <section className="carte p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{titre}</div>
        {actions}
      </div>
      {children}
    </section>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// L'ÉCRAN
// ═════════════════════════════════════════════════════════════════════════════
export default function Procedures() {
  const annee = getAnnee();
  const [vue, setVue] = useState('registre');          // registre | anciens
  const [dossierId, setDossierId] = useState(null);
  const [ouvrir, setOuvrir] = useState(false);
  const [ref, setRef] = useState(null);
  const [refErreur, setRefErreur] = useState(null);

  useEffect(() => {
    appel(`${BASE}/referentiel`).then(r => {
      if (r.ok) setRef(r.data); else setRefErreur(r.data?.error || 'Référentiel indisponible.');
    });
  }, []);

  return (
    <div className="relative">
      <RailLateral
        icon={IconScale}
        titre="Procédures"
        sousTitre={`Année ${annee}`}
        sections={[{
          items: [
            { key: 'registre', label: 'Registre', icon: IconListDetails,
              actif: vue === 'registre', onClick: () => { setVue('registre'); setDossierId(null); } },
            { key: 'anciens', label: 'Anciens dossiers', icon: IconArchive,
              actif: vue === 'anciens', onClick: () => { setVue('anciens'); setDossierId(null); } },
          ],
        }]}
      />
      <div className="gouttiere-rail p-4 md:p-6">
        {refErreur && <Encadre etat="corriger" className="mb-3">{refErreur}</Encadre>}
        {vue === 'anciens' && (
          <>
            <PageHeader titre="Anciens dossiers" sous="Recours et fraudes enregistrés avant le 3 octobre 2026 — en lecture" />
            <Suspense fallback={<div className="text-[13px] text-slate-400 p-6">Chargement…</div>}>
              <ArchivesProcedures />
            </Suspense>
          </>
        )}
        {vue === 'registre' && !dossierId && (
          <Registre annee={annee} peutOuvrir={!!ref?.peut_instruire}
            onOuvrir={() => setOuvrir(true)} onChoisir={setDossierId} />
        )}
        {vue === 'registre' && dossierId && (
          <Dossier id={dossierId} ref_={ref} onRetour={() => setDossierId(null)} />
        )}
      </div>
      {ouvrir && (
        <OuvrirDossier annee={annee} onFermer={() => setOuvrir(false)}
          onOuvert={d => { setOuvrir(false); setVue('registre'); setDossierId(d.id); }} />
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LE REGISTRE
// ═════════════════════════════════════════════════════════════════════════════
function PastilleEcheance({ dossier }) {
  const p = dossier.prochaine;
  if (dossier.hors_delai && !p) return <PastilleEtat etat="corriger">hors délai</PastilleEtat>;
  if (!p) {
    if (dossier.clos) return <span className="text-[12px] text-slate-400">clos{dossier.issue ? ` · ${libelleIssue(dossier.issue)}` : ''}</span>;
    return <span className="text-[12px] text-slate-400">—</span>;
  }
  const n = joursAvant(p.date);
  const etat = dossier.hors_delai || (n != null && n <= 3) ? 'corriger' : n != null && n <= 7 ? 'surveiller' : 'reussi';
  const j = n == null ? '' : n < 0 ? ` · dépassée de ${-n} j` : n === 0 ? " · aujourd'hui" : ` · J-${n}`;
  return <PastilleEtat etat={etat} title={p.label}>{`${p.label.replace(/ au plus (tard|tôt)$/, '')} ${fmt(p.date)}${j}`}</PastilleEtat>;
}
function libelleIssue(i) {
  const T = { accueilli: 'accueilli', rejete: 'rejeté', irrecevable: 'irrecevable' };
  return T[i] || i.replace(/_/g, ' ');
}

function Registre({ annee, peutOuvrir, onOuvrir, onChoisir }) {
  const [dossiers, setDossiers] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [q, setQ] = useState('');
  const [filtreType, setFiltreType] = useState('tous');
  const [section, setSection] = useState('');
  const [etat, setEtat] = useState('ouverts');

  useEffect(() => {
    appel(`${BASE}?annee=${encodeURIComponent(annee)}`).then(r => {
      if (r.ok) setDossiers(r.data?.dossiers || []);
      else { setDossiers([]); setErreur(r.data?.error || 'Le registre ne se charge pas.'); }
    });
  }, [annee]);

  const sections = useMemo(() => [...new Set((dossiers || []).map(d => d.section).filter(Boolean))].sort(), [dossiers]);
  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (dossiers || []).filter(d => {
      if (filtreType !== 'tous' && genre(d) !== filtreType) return false;
      if (section && d.section !== section) return false;
      if (etat === 'ouverts' && d.clos) return false;
      if (etat === 'clos' && !d.clos) return false;
      if (t) {
        const n = `${d.etudiant?.nom || ''} ${d.etudiant?.prenom || ''} ${d.etudiant?.id_ecampus || ''}`.toLowerCase();
        if (!n.includes(t)) return false;
      }
      return true;
    });
  }, [dossiers, q, filtreType, section, etat]);

  return (
    <>
      <PageHeader titre="Recours et discipline"
        sous={`Registre ${annee} · RDE art. 72-75, 87-91, 115-119`} />
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <div className="relative">
          <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
          <input className="controle controle-icone w-64" placeholder="Chercher un étudiant…"
            value={q} onChange={e => setQ(e.target.value)} />
        </div>
        <Segments valeur={filtreType} onChange={setFiltreType}
          options={[['tous', 'Tous'], ['recours', 'Recours'], ['fraude', 'Fraude'], ['discipline', 'Discipline']]} />
        <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        <select className="controle" value={etat} onChange={e => setEtat(e.target.value)}>
          <option value="ouverts">Ouverts</option>
          <option value="clos">Clos</option>
          <option value="tous">Ouverts et clos</option>
        </select>
        <span className="flex-1" />
        {peutOuvrir && (
          <button type="button" className="bouton bouton-fort" onClick={onOuvrir}>
            <IconPlus size={15} /> Ouvrir un dossier
          </button>
        )}
      </div>
      {erreur && <Encadre etat="corriger" className="mb-3">{erreur}</Encadre>}
      <Tableau>
        <TableauEntete>
          <Th>Type</Th><Th>Étudiant</Th><Th>Section · UE</Th><Th>Objet</Th><Th>Étape</Th><Th>Échéance</Th>
        </TableauEntete>
        <tbody>
          {dossiers == null && <TableauVide colonnes={6}>Chargement…</TableauVide>}
          {dossiers && !visibles.length && (
            <TableauVide colonnes={6}>
              {dossiers.length ? 'Aucun dossier ne répond à ces filtres.' : `Aucun dossier ouvert en ${annee}.`}
            </TableauVide>
          )}
          {visibles.map(d => (
            <Tr key={d.id} className="cursor-pointer" onClick={() => onChoisir(d.id)}>
              <Td><PastilleType dossier={d} /></Td>
              <Td ton="fort">{nomPropre(d.etudiant?.nom, d.etudiant?.prenom)}</Td>
              <Td>{[d.section, d.ue_num ? `UE ${d.ue_num}` : null].filter(Boolean).join(' · ') || '—'}</Td>
              <Td>{d.objet || <span className="text-slate-400">—</span>}</Td>
              <Td>{d.clos ? <span className="text-slate-400">Clos</span> : (d.courante_label || '—')}</Td>
              <Td><PastilleEcheance dossier={d} /></Td>
            </Tr>
          ))}
        </tbody>
      </Tableau>
    </>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// OUVRIR UN DOSSIER — on part de l'étudiant, Lucie remplit le reste
// ═════════════════════════════════════════════════════════════════════════════
function OuvrirDossier({ annee, onFermer, onOuvert }) {
  const [recherche, setRecherche] = useState('');
  const [resultats, setResultats] = useState([]);
  const [etudiant, setEtudiant] = useState(null);
  const [contexte, setContexte] = useState(null);
  const [genreChoisi, setGenreChoisi] = useState('recours');
  const [ueNum, setUeNum] = useState(null);
  const [ue, setUe] = useState(null);                  // cours, charges, séance
  const [acquis, setAcquis] = useState([]);            // [{cours_code, aa_code}]
  const [objet, setObjet] = useState('');
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const minuterie = useRef(null);

  // La recherche d'étudiant, avec un temps de réflexion.
  useEffect(() => {
    clearTimeout(minuterie.current);
    const t = recherche.trim();
    if (etudiant || t.length < 2) { setResultats([]); return undefined; }
    minuterie.current = setTimeout(() => {
      appel(`/api/etudiants?q=${encodeURIComponent(t)}`).then(r => {
        setResultats(r.ok && Array.isArray(r.data) ? r.data.slice(0, 10) : []);
      });
    }, 250);
    return () => clearTimeout(minuterie.current);
  }, [recherche, etudiant]);

  function choisirEtudiant(e) {
    setEtudiant(e); setResultats([]); setUeNum(null); setUe(null); setAcquis([]); setContexte(null); setErreur(null);
    appel(`${BASE}/contexte/${e.id}?annee=${encodeURIComponent(annee)}`).then(r => {
      if (r.ok) setContexte(r.data); else setErreur(r.data?.error || "Les inscriptions de l'étudiant ne se chargent pas.");
    });
  }
  function changerEtudiant() {
    setEtudiant(null); setContexte(null); setRecherche(''); setUeNum(null); setUe(null); setAcquis([]);
  }

  // Changer de type efface le choix d'UE s'il n'est plus permis.
  function changerGenre(g) {
    setGenreChoisi(g);
    if (g === 'recours' && ueNum) {
      const i = contexte?.inscriptions?.find(x => x.ue_num === ueNum);
      if (!i?.recourable) { setUeNum(null); setUe(null); }
    }
    if (g !== 'fraude') setAcquis([]);
  }

  useEffect(() => {
    setUe(null); setAcquis([]);
    if (!ueNum) return;
    appel(`${BASE}/ue/${ueNum}?annee=${encodeURIComponent(annee)}`).then(r => { if (r.ok) setUe(r.data); });
  }, [ueNum, annee]);

  const inscriptions = contexte?.inscriptions || [];
  const permise = i => genreChoisi !== 'recours' || i.recourable;

  const raison = !etudiant ? "Choisissez l'étudiant."
    : !contexte ? 'Chargement des inscriptions…'
    : genreChoisi === 'recours' && !ueNum ? 'Choisissez la décision contestée (une UE refusée).'
    : genreChoisi === 'fraude' && !ueNum ? "Choisissez l'UE dont l'épreuve est en cause."
    : genreChoisi === 'fraude' && !acquis.length ? 'Cochez les acquis visés par l’épreuve (art. 75 §1).'
    : !objet.trim() ? "Écrivez l'objet en une phrase."
    : null;

  async function ouvrirLeDossier() {
    if (raison || envoi) return;
    setEnvoi(true); setErreur(null);
    const corps = {
      type: genreChoisi === 'recours' ? 'recours' : 'disciplinaire',
      nature: genreChoisi === 'recours' ? undefined : genreChoisi === 'fraude' ? 'fraude' : 'comportement',
      etudiant_id: etudiant.id, annee_scolaire: annee, ue_num: ueNum || null,
      objet: objet.trim(), acquis: genreChoisi === 'fraude' ? acquis : [],
    };
    const r = await appel(BASE, { method: 'POST', body: JSON.stringify(corps) });
    setEnvoi(false);
    if (!r.ok) { setErreur(r.data?.error || "Le dossier n'a pas pu s'ouvrir."); return; }
    onOuvert(r.data);
  }

  const basculerAcquis = (cours_code, aa_code) => setAcquis(l => (l.some(a => a.aa_code === aa_code)
    ? l.filter(a => a.aa_code !== aa_code) : [...l, { cours_code, aa_code }]));

  return (
    <Fenetre icone={IconPlus} titre="Ouvrir un dossier" sous={`Recours ou procédure disciplinaire · ${annee}`}
      large="grande" onFermer={onFermer}
      pied={<>
        <span className="text-[12px]" style={{ color: erreur ? 'var(--c-refuse)' : undefined }}>
          {erreur || raison || ''}
        </span>
        <button type="button" className="bouton" onClick={onFermer}>Annuler</button>
        <button type="button" className="bouton bouton-fort" disabled={!!raison || envoi} onClick={ouvrirLeDossier}>
          {envoi ? 'Ouverture…' : 'Ouvrir le dossier'}
        </button>
      </>}>
      <div className="grid md:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] gap-4">
        <div className="space-y-4">
          <Champ label="1. Étudiant">
            {etudiant ? (
              <div className="flex items-center gap-2">
                <div className="controle w-full">
                  <span className="font-semibold">{nomPropre(etudiant.nom, etudiant.prenom)}</span>
                  {etudiant.id_ecampus && <span className="text-slate-400">· {etudiant.id_ecampus}</span>}
                </div>
                <button type="button" className="bouton" onClick={changerEtudiant}>Changer</button>
              </div>
            ) : (
              <div className="relative">
                <IconSearch size={15} className="absolute left-2.5 top-[18px] -translate-y-1/2 text-slate-400 pointer-events-none" />
                <input className="controle controle-icone w-full" autoFocus placeholder="Nom, prénom ou matricule…"
                  value={recherche} onChange={e => setRecherche(e.target.value)} />
                {resultats.length > 0 && (
                  <div className="mt-1 border border-slate-200 rounded-champ bg-white max-h-64 overflow-y-auto">
                    {resultats.map(e => (
                      <button key={e.id} type="button" onClick={() => choisirEtudiant(e)}
                        className="w-full text-left px-3 py-1.5 text-[13px] hover:bg-slate-50 border-b border-slate-100 last:border-0">
                        <span className="font-semibold text-slate-800">{nomPropre(e.nom, e.prenom)}</span>
                        <span className="text-[12px] text-slate-400"> · {[e.id_ecampus, e.sections].filter(Boolean).join(' · ')}</span>
                      </button>
                    ))}
                  </div>
                )}
                {recherche.trim().length >= 2 && !resultats.length && (
                  <div className="text-[12px] text-slate-400 mt-1">Aucun étudiant trouvé.</div>
                )}
              </div>
            )}
          </Champ>
          <Champ label="2. Type">
            <Segments valeur={genreChoisi} onChange={changerGenre}
              options={[['recours', 'Recours'], ['fraude', 'Fraude'], ['discipline', 'Discipline — comportement']]} />
          </Champ>
          {genreChoisi === 'recours' && ue?.seance && (
            <Champ label="Résultats publiés le">
              <div className="text-[13px] text-slate-700">
                {ue.seance.publie_le ? fmt(ue.seance.publie_le) : 'pas encore publiés'}
                {ue.seance.president_nom && <span className="text-slate-400"> · séance présidée par {ue.seance.president_nom}</span>}
              </div>
            </Champ>
          )}
          <Champ label="Objet" aide="Une phrase : ce qui est contesté, ou ce qui est reproché.">
            <input className="controle w-full" value={objet} onChange={e => setObjet(e.target.value)}
              placeholder={genreChoisi === 'recours' ? 'Refus en 2e session — 2 acquis' : genreChoisi === 'fraude' ? "Usage d'une IA non autorisée" : 'Perturbation répétée des cours'} />
          </Champ>
        </div>

        <div className="space-y-4">
          <div>
            <Intertitre>
              {genreChoisi === 'recours' ? `3. Décision contestée (${annee})`
                : genreChoisi === 'fraude' ? `3. UE de l'épreuve (${annee})` : `3. UE concernée — facultatif (${annee})`}
            </Intertitre>
            {!etudiant && <div className="text-[12px] text-slate-400">Choisissez d'abord l'étudiant.</div>}
            {etudiant && contexte && !inscriptions.length && (
              <div className="text-[12px] text-slate-400">Aucune inscription en {annee} dans votre périmètre.</div>
            )}
            <div className="divide-y divide-slate-100">
              {genreChoisi === 'discipline' && inscriptions.length > 0 && (
                <label className="flex items-center gap-2 py-1.5 text-[13px] cursor-pointer">
                  <input type="radio" checked={!ueNum} onChange={() => setUeNum(null)} />
                  <span className="text-slate-600">Aucune UE en particulier</span>
                </label>
              )}
              {inscriptions.map(i => {
                const ok = permise(i);
                const r = lireResultat(i);
                return (
                  <label key={i.ue_num} className={`flex items-center gap-2 py-1.5 text-[13px] ${ok ? 'cursor-pointer' : 'opacity-50'}`}>
                    <input type="radio" disabled={!ok} checked={ueNum === i.ue_num} onChange={() => setUeNum(i.ue_num)} />
                    <span className="flex-1 min-w-0 truncate text-slate-800">
                      UE {i.ue_num} · {i.ue_nom || '—'}
                      {i.section && <span className="text-slate-400"> · {i.section}</span>}
                    </span>
                    {ok ? <PastilleEtat etat={r.etat}>{r.label}</PastilleEtat>
                      : <span className="text-[12px] text-slate-400">{r.label} — non recourable</span>}
                  </label>
                );
              })}
            </div>
          </div>

          {genreChoisi === 'fraude' && ueNum && (
            <div>
              <Intertitre>4. Acquis visés par l'épreuve (art. 75 §1)</Intertitre>
              {!ue && <div className="text-[12px] text-slate-400">Chargement des cours…</div>}
              {ue && !(ue.cours || []).length && <div className="text-[12px] text-slate-400">Aucun cours connu pour cette UE.</div>}
              <ArbreAcquis cours={ue?.cours || []} coches={acquis} onBasculer={basculerAcquis} />
            </div>
          )}

          {genreChoisi === 'recours' && ueNum && ue && (
            <div>
              <Intertitre>CDE restreint (art. 89 §1) — proposé depuis la séance</Intertitre>
              <div className="text-[12px] text-slate-600">
                {ue.seance?.president_nom ? <>Président : <b>{ue.seance.president_nom}</b>. </> : 'Pas de président de séance connu. '}
                {(ue.charges || []).length
                  ? <>Chargés de cours proposés : {[...new Map(ue.charges.map(c => [c.id, c])).values()].map(c => nomPropre(c.nom, c.prenom)).join(', ')}.</>
                  : 'Aucun chargé de cours attribué.'}
                <span className="text-slate-400"> Les présences se cochent dans le dossier.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </Fenetre>
  );
}

/** Les cours d'une UE et leurs acquis, à cocher. */
function ArbreAcquis({ cours, coches, onBasculer, desactive = false }) {
  const coche = aa => coches.some(a => a.aa_code === aa);
  return (
    <div className="space-y-2">
      {cours.map(c => (
        <div key={c.cours_code}>
          <div className="text-[12px] font-semibold text-slate-700">{c.cours_code} · {c.cours_nom}</div>
          {!(c.aas || []).length && <div className="text-[12px] text-slate-400 pl-4">aucun acquis rattaché</div>}
          {(c.aas || []).map(a => (
            <div key={`${c.cours_code}|${a.aa_code}`} className="pl-4 py-0.5">
              <Case coche={coche(a.aa_code)} desactive={desactive} onChange={() => onBasculer(c.cours_code, a.aa_code)}>
                <b className="font-semibold">{a.aa_code}</b>
                {a.description && <span className="text-slate-500"> — {a.description}</span>}
              </Case>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════════════════════
// LE DOSSIER
// ═════════════════════════════════════════════════════════════════════════════
function Dossier({ id, ref_, onRetour }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ue, setUe] = useState(null);
  const [personnel, setPersonnel] = useState([]);
  const [etapeSel, setEtapeSel] = useState(null);
  const [effets, setEffets] = useState([]);

  const charger = useCallback(async () => {
    const r = await appel(`${BASE}/${id}`);
    if (!r.ok) { setErreur(r.data?.error || 'Dossier introuvable.'); return null; }
    setD(r.data);
    return r.data;
  }, [id]);

  useEffect(() => {
    setD(null); setErreur(null); setEffets([]); setEtapeSel(null);
    charger().then(x => {
      if (!x) return;
      setEtapeSel(x.circuit?.courante || x.circuit?.etapes?.[x.circuit.etapes.length - 1]?.cle || null);
      if (x.ue_num) {
        appel(`${BASE}/ue/${x.ue_num}?annee=${encodeURIComponent(x.annee_scolaire)}`).then(r => { if (r.ok) setUe(r.data); });
      }
    });
    appel(`/api/ref/professeurs?annee=${encodeURIComponent(getAnnee())}`).then(r => {
      if (r.ok && Array.isArray(r.data)) setPersonnel(r.data);
    });
  }, [id, charger]);

  if (erreur) {
    return (
      <>
        <button type="button" className="bouton mb-3" onClick={onRetour}><IconArrowLeft size={15} /> Registre</button>
        <Encadre etat="corriger">{erreur}</Encadre>
      </>
    );
  }
  if (!d) return <div className="text-[13px] text-slate-400 p-6">Chargement du dossier…</div>;

  const peutInstruire = !!d.peut_instruire;
  const peutDecider = !!d.peut_decider;
  const g = GENRES[genre(d)];
  const etapes = d.circuit?.etapes || [];
  // L'écartement provisoire (art. 115 septies) est une mesure facultative,
  // hors de la frise : il a son entrée à côté.
  const ecartementPossible = d.type === 'disciplinaire';

  function apresEtape(rep) {
    // La réponse d'une étape ne redit pas les droits : on garde ceux du dossier.
    setD({ ...rep, peut_instruire: d.peut_instruire, peut_decider: d.peut_decider });
    setEffets(rep.effets || []);
    const suivante = rep.circuit?.courante;
    if (suivante) setEtapeSel(suivante);
  }

  return (
    <>
      <div className="flex items-center gap-3 mb-3">
        <button type="button" className="bouton" onClick={onRetour}><IconArrowLeft size={15} /> Registre</button>
        <span className="text-[12px] text-slate-400">Dossier n° {d.id} · ouvert le {fmt(d.cree_le)}{d.cree_par_nom ? ` par ${d.cree_par_nom}` : ''}</span>
      </div>

      {/* En-tête */}
      <div className="carte p-4 mb-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <PastilleEtat etat={g.etat}>{d.type === 'recours' ? 'Recours interne' : d.nature === 'fraude' ? 'Fraude' : 'Discipline — comportement'}</PastilleEtat>
          <h1 className="titre-ecran mb-0">{nomPropre(d.etudiant?.nom, d.etudiant?.prenom)}</h1>
          <span className="text-[13px] text-slate-500">
            {[d.section, d.ue_num ? `UE ${d.ue_num}${d.ue_nom ? ` · ${d.ue_nom}` : ''}` : null,
              d.session ? `session ${d.session}` : null, d.etudiant?.id_ecampus].filter(Boolean).join(' · ')}
          </span>
        </div>
        {d.objet && <div className="text-[13px] text-slate-700 mt-1">{d.objet}</div>}
        {d.type === 'recours' && (
          <div className="text-[12px] text-slate-400 mt-0.5">
            Résultats publiés le {d.publie_le ? fmt(d.publie_le) : '— (date de publication inconnue : les délais ne se calculent pas)'}
          </div>
        )}
      </div>

      {d.recidive?.length > 0 && (
        <Encadre etat="surveiller" icone={IconAlertTriangle} className="mb-3"
          titre={`Récidive : dossier${d.recidive.length > 1 ? 's' : ''} n° ${d.recidive.map(x => x.id).join(', ')}`}>
          Fraude déjà sanctionnée ({d.recidive.map(x => `${x.annee_scolaire}${x.ue_num ? ` · UE ${x.ue_num}` : ''}`).join(' ; ')}) :
          la récidive emporte le refus (art. 75 §1).
        </Encadre>
      )}
      {effets.length > 0 && (
        <Encadre etat="reussi" icone={IconCircleCheck} className="mb-3" titre="Ce que l'étape a entraîné">
          <ul className="list-disc pl-4">{effets.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </Encadre>
      )}

      {/* La frise */}
      <div className="carte p-4 mb-3">
        <Frise etapes={etapes} courante={d.circuit?.courante} selection={etapeSel} onChoisir={setEtapeSel} />
        {ecartementPossible && (
          <div className="mt-3 flex items-center gap-2 text-[12px]">
            <button type="button" onClick={() => setEtapeSel('ecartement')}
              className={`bouton bouton-compact ${etapeSel === 'ecartement' ? 'bouton-sortir' : ''}`}>
              Écartement provisoire (art. 115 septies)
            </button>
            <span className="text-slate-400">
              {d.etapes?.ecartement ? `du ${fmt(d.etapes.ecartement.du)} au ${fmt(d.etapes.ecartement.au)}` : 'mesure facultative, hors circuit'}
            </span>
          </div>
        )}
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_340px] gap-3 items-start">
        <div className="carte p-4">
          {etapeSel && (
            <FormulaireEtape key={`${etapeSel}-${d.traces?.[etapeSel]?.le || ''}`} dossier={d} cle={etapeSel}
              ref_={ref_} ue={ue} peutInstruire={peutInstruire} peutDecider={peutDecider} onPose={apresEtape} />
          )}
        </div>
        <div className="space-y-3">
          <Echeances dossier={d} />
          <Personnes dossier={d} ue={ue} personnel={personnel} peut={peutInstruire} onMaj={setD} />
          {d.type === 'disciplinaire' && d.nature === 'fraude' && (
            <AcquisVises dossier={d} ue={ue} peut={peutInstruire} onMaj={setD} />
          )}
          <Pieces dossier={d} peut={peutInstruire} onMaj={setD} />
          <Journal dossier={d} />
        </div>
      </div>
    </>
  );
}

// ── La frise numérotée ───────────────────────────────────────────────────────
function Frise({ etapes, courante, selection, onChoisir }) {
  return (
    <ol className="flex items-start">
      {etapes.map((e, i) => {
        const faite = e.faite;
        const estCourante = e.cle === courante;
        const choisie = e.cle === selection;
        const plein = faite || estCourante;
        return (
          <li key={e.cle} className="flex-1 min-w-0 relative">
            {i > 0 && (
              <span aria-hidden="true"
                className={`absolute top-[13px] right-1/2 w-full h-[2px] ${etapes[i - 1].faite ? '' : 'bg-slate-300'}`}
                style={etapes[i - 1].faite ? { background: 'var(--c-reussi)' } : undefined} />
            )}
            <button type="button" onClick={() => onChoisir(e.cle)}
              className="relative z-10 w-full flex flex-col items-center text-center px-1 group">
              <span className={`w-[28px] h-[28px] rounded-full grid place-items-center text-[12px] font-bold
                                ${plein ? 'text-white' : 'bg-white text-slate-500 border-2 border-slate-300'}
                                ${choisie ? 'ring-4 ring-iip-blue/20' : ''}`}
                style={plein ? { background: faite ? 'var(--c-reussi)' : 'var(--c-principal)' } : undefined}>
                {faite ? <IconCheck size={15} stroke={3} /> : i + 1}
              </span>
              <span className={`mt-1.5 text-[12px] leading-tight ${choisie || estCourante ? 'font-semibold text-slate-800' : 'text-slate-500'} group-hover:underline`}>
                {e.label}
              </span>
              <span className="text-[10px] text-slate-400 leading-tight">
                {faite && e.trace ? `${fmt(e.trace.le)}${e.trace.par ? ` · ${e.trace.par}` : ''}`
                  : `art. ${e.art}${e.facultatif ? ' · facultatif' : ''}${e.decision ? ' · direction' : ''}`}
              </span>
            </button>
          </li>
        );
      })}
    </ol>
  );
}

// ── Le formulaire d'une étape ────────────────────────────────────────────────
/** Les valeurs de départ : ce qui est posé, sinon les défauts (date du jour). */
function valeursInitiales(d, cle) {
  const pose = d.etapes?.[cle];
  if (pose) return { ...pose };
  const j = aujourdHui();
  const et = d.etapes || {};
  if (d.type === 'recours') {
    switch (cle) {
      case 'plainte': return { recue_le: j, mode: null, griefs: '' };
      case 'recevabilite': return { ecrite: false, dans_delai: false, porte_sur_refus: true, irregularites: false, recevable: null, motif: '' };
      case 'cde': return { date: j };
      case 'decision': return { issue: null, motivation: '' };
      case 'envoi': return { envoye_le: j };
      case 'externe': return { introduit_le: j, issue: null, decision_le: null };
      default: return {};
    }
  }
  switch (cle) {
    case 'faits': return { date: j, description: '', moment: null, type_fraude: null, pv_surveillance: false };
    case 'ecartement': return { du: j, au: null };
    case 'convocation': return { envoyee_le: j, mode: null, audition_le: null, heure: '', lieu: '', sanction_envisagee: null };
    case 'audition': return { tenue_le: et.convocation?.audition_le || j, etudiant_present: null, assiste_par: '', conteste: null, pv: null, declarations: '' };
    case 'avis': return { demande_le: j, rendu_le: null, avis: '' };
    case 'decision': return {
      sanction: null, motivation: '',
      academique: d.nature === 'fraude' ? ((d.session === 2 || d.recidive?.length) ? 'refuse' : 'ajourne') : undefined,
    };
    case 'notification': return { envoyee_le: j, mode: null };
    case 'recours_po': return { introduit_le: j, decision_le: null, issue: null };
    default: return {};
  }
}

function FormulaireEtape({ dossier: d, cle, ref_, ue, peutInstruire, peutDecider, onPose }) {
  const def = (d.circuit?.etapes || []).find(e => e.cle === cle)
    || (cle === 'ecartement' ? { cle, label: 'Écartement provisoire', art: '115 septies', facultatif: true } : null);
  const [v, setV] = useState(() => valeursInitiales(d, cle));
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const pose = !!d.etapes?.[cle];
  const trace = d.traces?.[cle];
  const reservee = def?.decision && !peutDecider;
  const lecture = !peutInstruire || reservee;
  const maj = (k, x) => setV(o => ({ ...o, [k]: x }));
  if (!def) return <div className="text-[13px] text-slate-400">Étape inconnue.</div>;

  async function poser() {
    setEnvoi(true); setErreur(null);
    const r = await appel(`${BASE}/${d.id}/etape`, { method: 'POST', body: JSON.stringify({ etape: cle, donnees: v }) });
    setEnvoi(false);
    if (!r.ok) { setErreur(r.data?.error || "L'étape n'a pas pu s'enregistrer."); return; }
    onPose(r.data);
  }

  const sanctions = (ref_?.sanctions || []).map(([k, l, art]) => [k, `${l} (art. ${art})`]);
  const typesFraude = ref_?.types_fraude || [];
  const P = { desactive: lecture };

  let corps = null;
  if (d.type === 'recours') {
    if (cle === 'plainte') corps = (
      <div className="grid sm:grid-cols-2 gap-3">
        <Champ label="Reçue le"><Date_ valeur={v.recue_le} onChange={x => maj('recue_le', x)} {...P} /></Champ>
        <Champ label="Mode de remise"><Choix valeur={v.mode} onChange={x => maj('mode', x)} options={MODES_REMISE} {...P} /></Champ>
        <div className="sm:col-span-2">
          <Champ label="Irrégularités invoquées" aide="Ce que l'étudiant reproche à la procédure, tel qu'il l'écrit.">
            <textarea rows={4} className={CLS_TEXTE} value={v.griefs || ''} disabled={lecture} onChange={e => maj('griefs', e.target.value)} />
          </Champ>
        </div>
      </div>
    );
    if (cle === 'recevabilite') {
      const tout = v.ecrite && v.dans_delai && v.porte_sur_refus && v.irregularites;
      corps = (
        <div className="space-y-3">
          <div>
            <Intertitre>Conditions de l'art. 88 §3</Intertitre>
            <div className="space-y-1.5">
              <Case coche={v.ecrite} onChange={x => maj('ecrite', x)} {...P}>Écrite, en la forme</Case>
              <Case coche={v.dans_delai} onChange={x => maj('dans_delai', x)} {...P}>Reçue dans les 4 jours calendrier de la publication</Case>
              <Case coche={v.porte_sur_refus} onChange={x => maj('porte_sur_refus', x)} {...P}>Porte sur un refus</Case>
              <Case coche={v.irregularites} onChange={x => maj('irregularites', x)} {...P}>Mentionne des irrégularités précises</Case>
            </div>
          </div>
          <Champ label="La plainte est-elle recevable ?" aide={tout ? 'Les quatre conditions sont remplies.' : v.recevable === true ? 'Une condition au moins n’est pas cochée.' : null}>
            <OuiNon valeur={v.recevable} onChange={x => maj('recevable', x)} oui="Recevable" non="Irrecevable" {...P} />
          </Champ>
          {v.recevable === false && (
            <Champ label="Motif précis de l'irrecevabilité (art. 88 §4)">
              <textarea rows={3} className={CLS_TEXTE} value={v.motif || ''} disabled={lecture} onChange={e => maj('motif', e.target.value)} />
            </Champ>
          )}
        </div>
      );
    }
    if (cle === 'cde') {
      const pres = (d.membres || []).filter(m => m.present);
      const president = pres.some(m => m.role === 'president');
      const membres = pres.filter(m => m.role === 'membre').length;
      corps = (
        <div className="space-y-3">
          <Champ label="Réunion du CDE restreint le"><Date_ valeur={v.date} onChange={x => maj('date', x)} {...P} /></Champ>
          <Encadre etat={president && membres >= 2 ? 'reussi' : 'surveiller'}>
            {president ? 'Président présent' : 'Aucun président présent'} · {membres} membre{membres > 1 ? 's' : ''} présent{membres > 1 ? 's' : ''}
            {president && membres >= 2 ? ' : composition valable (art. 89 §1).' : ' : il faut un président et au moins deux membres — cochez les présences dans « Personnes ».'}
          </Encadre>
        </div>
      );
    }
    if (cle === 'decision') corps = (
      <div className="space-y-3">
        <Champ label="Le recours est"><Segments desactive={lecture} valeur={v.issue} onChange={x => maj('issue', x)}
          options={[['accueilli', 'Accueilli'], ['rejete', 'Rejeté']]} /></Champ>
        {v.issue === 'accueilli' && (
          <Encadre etat="disponible">Un recours accueilli rouvre la séance de délibération de l'UE : le CDE re-délibère cet étudiant.</Encadre>
        )}
        <Champ label="Motivation, grief par grief (art. 89 §2)">
          <textarea rows={6} className={CLS_TEXTE} value={v.motivation || ''} disabled={lecture} onChange={e => maj('motivation', e.target.value)} />
        </Champ>
      </div>
    );
    if (cle === 'envoi') corps = (
      <Champ label="Décision envoyée par recommandé le"><Date_ valeur={v.envoye_le} onChange={x => maj('envoye_le', x)} {...P} /></Champ>
    );
    if (cle === 'externe') corps = (
      <div className="grid sm:grid-cols-3 gap-3">
        <Champ label="Introduit le"><Date_ valeur={v.introduit_le} onChange={x => maj('introduit_le', x)} {...P} /></Champ>
        <Champ label="Décision de la Commission le"><Date_ valeur={v.decision_le} onChange={x => maj('decision_le', x)} {...P} /></Champ>
        <Champ label="Issue"><Choix valeur={v.issue} onChange={x => maj('issue', x)} options={ISSUES_EXTERNES} vide="— en attente —" {...P} /></Champ>
      </div>
    );
  } else {
    if (cle === 'faits') corps = (
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Champ label="Date des faits"><Date_ valeur={v.date} onChange={x => maj('date', x)} {...P} /></Champ>
          {d.nature === 'fraude' && (
            <Champ label="Constatée"><Segments desactive={lecture} valeur={v.moment} onChange={x => maj('moment', x)}
              options={[['epreuve', "Pendant l'épreuve"], ['correction', 'À la correction']]} /></Champ>
          )}
        </div>
        {d.nature === 'fraude' && (
          <div className="grid sm:grid-cols-2 gap-3 items-end">
            <Champ label="Type de fraude (art. 72)"><Choix valeur={v.type_fraude} onChange={x => maj('type_fraude', x)} options={typesFraude} {...P} /></Champ>
            <Case coche={v.pv_surveillance} onChange={x => maj('pv_surveillance', x)} {...P}>Un PV de surveillance a été dressé</Case>
          </div>
        )}
        <Champ label="Description des faits">
          <textarea rows={5} className={CLS_TEXTE} value={v.description || ''} disabled={lecture} onChange={e => maj('description', e.target.value)} />
        </Champ>
        <div className="text-[12px] text-slate-500">
          La personne qui a constaté les faits se choisit dans « Personnes »
          {d.nature === 'fraude' ? ', les acquis visés dans « Acquis visés »' : ''}.
        </div>
      </div>
    );
    if (cle === 'ecartement') corps = (
      <div className="space-y-2">
        <div className="grid sm:grid-cols-2 gap-3">
          <Champ label="Premier jour"><Date_ valeur={v.du} onChange={x => maj('du', x)} {...P} /></Champ>
          <Champ label="Dernier jour"><Date_ valeur={v.au} onChange={x => maj('au', x)} {...P} /></Champ>
        </div>
        <div className="text-[12px] text-slate-500">Quinze jours ouvrables au plus (art. 115 septies).</div>
      </div>
    );
    if (cle === 'convocation') corps = (
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Champ label="Envoyée le"><Date_ valeur={v.envoyee_le} onChange={x => maj('envoyee_le', x)} {...P} /></Champ>
          <Champ label="Mode de remise"><Choix valeur={v.mode} onChange={x => maj('mode', x)} options={MODES_REMISE} {...P} /></Champ>
          <Champ label="Audition le"><Date_ valeur={v.audition_le} onChange={x => maj('audition_le', x)} {...P} /></Champ>
          <Champ label="Heure"><input type="time" className="controle w-full" value={v.heure || ''} disabled={lecture} onChange={e => maj('heure', e.target.value)} /></Champ>
        </div>
        <Champ label="Lieu de l'audition">
          <input className="controle w-full" value={v.lieu || ''} disabled={lecture} onChange={e => maj('lieu', e.target.value)} placeholder="Bureau de la direction, Campus Erasme" />
        </Champ>
        <Champ label="Sanction envisagée (art. 115 quater)"
          aide={v.sanction_envisagee === 'renvoi_definitif' ? "Renvoi définitif : l'audition ne peut se tenir avant huit jours ouvrables." : null}>
          <Choix valeur={v.sanction_envisagee} onChange={x => maj('sanction_envisagee', x)} options={sanctions} {...P} />
        </Champ>
      </div>
    );
    if (cle === 'audition') corps = (
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Champ label="Tenue le"><Date_ valeur={v.tenue_le} onChange={x => maj('tenue_le', x)} {...P} /></Champ>
          <Champ label="L'étudiant était"><OuiNon valeur={v.etudiant_present} onChange={x => maj('etudiant_present', x)} oui="Présent" non="Absent" {...P} /></Champ>
          <Champ label="Assisté par" aide="La personne de son choix — elle peut être extérieure à l'Institut.">
            <input className="controle w-full" value={v.assiste_par || ''} disabled={lecture} onChange={e => maj('assiste_par', e.target.value)} placeholder="personne" />
          </Champ>
          <Champ label="Conteste-t-il les faits ?"><OuiNon valeur={v.conteste} onChange={x => maj('conteste', x)} oui="Conteste" non="Reconnaît" {...P} /></Champ>
        </div>
        <Champ label="Procès-verbal"><Choix valeur={v.pv} onChange={x => maj('pv', x)} options={PV_AUDITION} {...P} /></Champ>
        <Champ label="Déclarations de l'étudiant">
          <textarea rows={5} className={CLS_TEXTE} value={v.declarations || ''} disabled={lecture} onChange={e => maj('declarations', e.target.value)} />
        </Champ>
        <div className="text-[12px] text-slate-500">Le membre du personnel qui rédige le PV se choisit dans « Personnes » (art. 115 quinquies).</div>
      </div>
    );
    if (cle === 'avis') corps = (
      <div className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <Champ label="Avis demandé le"><Date_ valeur={v.demande_le} onChange={x => maj('demande_le', x)} {...P} /></Champ>
          <Champ label="Avis rendu le"><Date_ valeur={v.rendu_le} onChange={x => maj('rendu_le', x)} {...P} /></Champ>
        </div>
        <Champ label="Avis du CDE">
          <textarea rows={5} className={CLS_TEXTE} value={v.avis || ''} disabled={lecture} onChange={e => maj('avis', e.target.value)} />
        </Champ>
      </div>
    );
    if (cle === 'decision') corps = (
      <div className="space-y-3">
        <Champ label="Sanction (art. 115)"><Choix valeur={v.sanction} onChange={x => maj('sanction', x)} options={sanctions} {...P} /></Champ>
        {d.nature === 'fraude' && (
          <Champ label="Sanction académique (art. 75 §1)"
            aide={`Ajourné en 1re session sur les acquis visés ; refusé en 2e session ou en cas de récidive.${d.acquis?.length ? ` ${d.acquis.length} acquis visé(s) seront ajournés dans la délibération.` : ''}`}>
            <Segments desactive={lecture} valeur={v.academique} onChange={x => maj('academique', x)}
              options={[['ajourne', 'Ajourné'], ['refuse', 'Refusé']]} />
          </Champ>
        )}
        <Champ label="Motivation : faits, dispositions, gravité (art. 119)">
          <textarea rows={6} className={CLS_TEXTE} value={v.motivation || ''} disabled={lecture} onChange={e => maj('motivation', e.target.value)} />
        </Champ>
      </div>
    );
    if (cle === 'notification') corps = (
      <div className="grid sm:grid-cols-2 gap-3">
        <Champ label="Envoyée le"><Date_ valeur={v.envoyee_le} onChange={x => maj('envoyee_le', x)} {...P} /></Champ>
        <Champ label="Mode de remise"><Choix valeur={v.mode} onChange={x => maj('mode', x)} options={MODES_REMISE} {...P} /></Champ>
      </div>
    );
    if (cle === 'recours_po') corps = (
      <div className="grid sm:grid-cols-3 gap-3">
        <Champ label="Introduit le"><Date_ valeur={v.introduit_le} onChange={x => maj('introduit_le', x)} {...P} /></Champ>
        <Champ label="Décision du PO le"><Date_ valeur={v.decision_le} onChange={x => maj('decision_le', x)} {...P} /></Champ>
        <Champ label="Issue"><Choix valeur={v.issue} onChange={x => maj('issue', x)} options={ISSUES_EXTERNES} vide="— en attente —" {...P} /></Champ>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-baseline gap-x-2 mb-1">
        <h2 className="text-[15px] font-semibold text-slate-800">{def.label}</h2>
        <span className="text-[12px] text-slate-400">art. {def.art}{def.facultatif ? ' · facultatif' : ''}</span>
      </div>
      <div className="text-[12px] text-slate-500 mb-3">
        {pose && trace ? <>Posée le {fmt(trace.le)}{fmtHeure(trace.le)}{trace.par ? ` par ${trace.par}` : ''}. Enregistrer à nouveau la corrige ; la version précédente reste au journal.</>
          : 'Pas encore posée.'}
      </div>
      {corps}
      <div className="flex flex-wrap items-center gap-3 mt-4 pt-3 border-t border-slate-200">
        <button type="button" className="bouton bouton-fort" disabled={lecture || envoi} onClick={poser}>
          {envoi ? 'Enregistrement…' : pose ? 'Corriger l’étape' : 'Poser l’étape'}
        </button>
        <span className="text-[12px] min-w-0 flex-1" style={{ color: erreur ? 'var(--c-refuse)' : undefined }}>
          {erreur || (reservee ? 'Cette étape est une décision : elle revient à la direction.'
            : !peutInstruire ? "Vous pouvez lire ce dossier, pas l'instruire." : '')}
        </span>
      </div>
    </div>
  );
}

// ── Échéances ───────────────────────────────────────────────────────────────
const ETAT_ECHEANCE = {
  tenue: ['reussi', 'tenue'],
  hors_delai: ['corriger', 'hors délai'],
  trop_tot: ['corriger', 'trop tôt'],
};
function Echeances({ dossier: d }) {
  const liste = d.echeances || [];
  return (
    <Bloc titre="Échéances (RDE)">
      {!liste.length && (
        <div className="text-[12px] text-slate-400">
          {d.type === 'recours' && !d.publie_le ? 'La date de publication des résultats manque : aucun délai ne se calcule.'
            : 'Aucune échéance pour l’instant : elles naissent des étapes posées.'}
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {liste.map((e, i) => {
          let pastille;
          if (ETAT_ECHEANCE[e.etat]) {
            const [etat, lib] = ETAT_ECHEANCE[e.etat];
            pastille = <PastilleEtat etat={etat}>{lib}</PastilleEtat>;
          } else {
            const n = joursAvant(e.date);
            const etat = e.information ? 'neutre' : n != null && n <= 3 ? 'corriger' : n != null && n <= 7 ? 'surveiller' : 'reussi';
            pastille = <PastilleEtat etat={etat}>{n == null ? 'ouverte' : n < 0 ? `dépassée de ${-n} j` : n === 0 ? "aujourd'hui" : `J-${n}`}</PastilleEtat>;
          }
          return (
            <div key={i} className="py-1.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] text-slate-700">{e.label}</span>
                <span className="text-[13px] font-semibold text-slate-800 whitespace-nowrap">{fmt(e.date)}</span>
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400">art. {e.art}{e.information ? ' · pour information' : ''}</span>
                {pastille}
              </div>
            </div>
          );
        })}
      </div>
    </Bloc>
  );
}

// ── Personnes ───────────────────────────────────────────────────────────────
function Personnes({ dossier: d, ue, personnel, peut, onMaj }) {
  const roles = ROLES_PAR_TYPE[d.type] || [];
  const [role, setRole] = useState(roles[0]);
  const [qui, setQui] = useState('');
  const [erreur, setErreur] = useState(null);
  const membres = d.membres || [];

  // Les chargés de cours de l'UE d'abord, puis tout le personnel.
  const charges = useMemo(() => [...new Map((ue?.charges || []).map(c => [c.id, c])).values()], [ue]);
  const idsCharges = new Set(charges.map(c => c.id));
  const autres = (personnel || []).filter(p => !idsCharges.has(p.id));

  async function ecrire(liste) {
    setErreur(null);
    const r = await appel(`${BASE}/${d.id}/membres`, {
      method: 'PUT',
      body: JSON.stringify({ membres: liste.map(m => ({ role: m.role, cle: m.cle, nom: m.nom, present: !!m.present })) }),
    });
    if (!r.ok) { setErreur(r.data?.error || 'Les personnes ne se sont pas enregistrées.'); return; }
    onMaj({ ...d, ...r.data, peut_instruire: d.peut_instruire, peut_decider: d.peut_decider });
  }
  function ajouter() {
    if (!qui) return;
    const id = Number(qui);
    const p = charges.find(c => c.id === id) || personnel.find(x => x.id === id);
    if (!p) return;
    const cle = `p:${p.id}`;
    if (membres.some(m => m.cle === cle && m.role === role)) { setQui(''); return; }
    // UN SEUL PRÉSIDENT : en choisir un remplace le précédent.
    const base = role === 'president' ? membres.filter(m => m.role !== 'president') : membres;
    ecrire([...base, { role, cle, nom: nomPropre(p.nom, p.prenom), present: true }]);
    setQui('');
  }

  const parRole = r => membres.filter(m => m.role === r);
  return (
    <Bloc titre={d.type === 'recours' ? 'CDE restreint (art. 89 §1)' : 'Personnes'}>
      {erreur && <div className="text-[12px] mb-1" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}
      {!membres.length && <div className="text-[12px] text-slate-400 mb-1">Personne pour l'instant.</div>}
      <div className="divide-y divide-slate-100">
        {roles.flatMap(r => parRole(r)).map(m => {
          const avecPresence = m.role === 'president' || m.role === 'membre';
          return (
            <div key={m.id ?? `${m.role}-${m.cle}-${m.nom}`} className="flex items-center gap-2 py-1 text-[13px]">
              {avecPresence && (
                <input type="checkbox" title="Présent" checked={!!m.present} disabled={!peut}
                  onChange={e => ecrire(membres.map(x => (x === m ? { ...x, present: e.target.checked } : x)))} />
              )}
              <span className={`flex-1 min-w-0 truncate ${m.role === 'president' ? 'font-semibold text-slate-800' : 'text-slate-700'}`}>{m.nom}</span>
              <span className="text-[11px] text-slate-400 whitespace-nowrap">{ROLES[m.role]}</span>
              {peut && (
                <button type="button" title="Retirer" className="text-slate-400 hover:text-slate-700"
                  onClick={() => ecrire(membres.filter(x => x !== m))}><IconTrash size={14} /></button>
              )}
            </div>
          );
        })}
      </div>
      {d.type === 'recours' && membres.length > 0 && (
        <div className="text-[11px] text-slate-400 mt-1">La case cochée dit « présent à la réunion ».</div>
      )}
      {peut && (
        <div className="mt-2 space-y-1.5">
          <div className="flex gap-1.5">
            <select className="controle flex-none" value={role} onChange={e => setRole(e.target.value)}>
              {roles.map(r => <option key={r} value={r}>{ROLES[r]}</option>)}
            </select>
            <select className="controle flex-1 min-w-0" value={qui} onChange={e => setQui(e.target.value)}>
              <option value="">— choisir une personne —</option>
              {charges.length > 0 && (
                <optgroup label={`Chargés de cours de l'UE ${d.ue_num}`}>
                  {charges.map(c => <option key={`c${c.id}`} value={c.id}>{nomPropre(c.nom, c.prenom)}</option>)}
                </optgroup>
              )}
              <optgroup label="Personnel">
                {autres.map(p => <option key={p.id} value={p.id}>{nomPropre(p.nom, p.prenom)}</option>)}
              </optgroup>
            </select>
          </div>
          <button type="button" className="bouton bouton-compact" disabled={!qui} onClick={ajouter}>
            <IconPlus size={14} /> Ajouter
          </button>
        </div>
      )}
    </Bloc>
  );
}

// ── Acquis visés (fraude) ───────────────────────────────────────────────────
function AcquisVises({ dossier: d, ue, peut, onMaj }) {
  const [erreur, setErreur] = useState(null);
  const gele = !!d.etapes?.decision;
  async function basculer(cours_code, aa_code) {
    const liste = d.acquis.some(a => a.aa_code === aa_code)
      ? d.acquis.filter(a => a.aa_code !== aa_code) : [...d.acquis, { cours_code, aa_code }];
    setErreur(null);
    const r = await appel(`${BASE}/${d.id}/acquis`, { method: 'PUT', body: JSON.stringify({ acquis: liste }) });
    if (!r.ok) { setErreur(r.data?.error || 'Les acquis ne se sont pas enregistrés.'); return; }
    onMaj({ ...d, ...r.data, peut_instruire: d.peut_instruire, peut_decider: d.peut_decider });
  }
  return (
    <Bloc titre={`Acquis visés · ${d.acquis?.length || 0}`}>
      {erreur && <div className="text-[12px] mb-1" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}
      {gele && <div className="text-[11px] text-slate-400 mb-1">La décision est posée : les acquis visés ne se changent plus.</div>}
      {ue ? <ArbreAcquis cours={ue.cours || []} coches={d.acquis || []} onBasculer={basculer} desactive={!peut || gele} />
        : (
          <div className="text-[13px] text-slate-700">
            {(d.acquis || []).map(a => a.aa_code).join(', ') || <span className="text-slate-400">aucun</span>}
          </div>
        )}
    </Bloc>
  );
}

// ── Pièces ──────────────────────────────────────────────────────────────────
function Pieces({ dossier: d, peut, onMaj }) {
  const [categorie, setCategorie] = useState(d.type === 'recours' ? 'plainte' : 'pv_surveillance');
  const [envoi, setEnvoi] = useState(false);
  const [erreur, setErreur] = useState(null);
  const champ = useRef(null);
  const officielles = PIECES_OFFICIELLES[d.type] || [];

  async function deposer(fichier) {
    if (!fichier) return;
    setEnvoi(true); setErreur(null);
    const fd = new FormData();
    fd.append('fichier', fichier);
    fd.append('categorie', categorie);
    // Un envoi de fichier laisse le navigateur écrire la frontière du multipart.
    const h = authHeaders(); delete h['Content-Type'];
    try {
      const rep = await fetch(`${BASE}/${d.id}/pieces`, { method: 'POST', headers: h, body: fd });
      const data = await rep.json().catch(() => null);
      if (!rep.ok) setErreur(data?.error || 'La pièce ne s’est pas déposée.');
      else onMaj({ ...d, ...data, peut_instruire: d.peut_instruire, peut_decider: d.peut_decider });
    } catch (e) { setErreur(e.message); }
    setEnvoi(false);
    if (champ.current) champ.current.value = '';
  }
  async function telecharger(p) {
    try { await telechargerFichier(`${BASE}/${d.id}/pieces/${p.id}`, p.nom); }
    catch (e) { informer({ message: e.message, ton: 'alerte' }); }
  }
  async function produire(o) {
    const r = await appel(`${BASE}/${d.id}/document/${o.piece}`);
    if (!r.ok || !r.data?.html) {
      informer({ message: r.data?.error || `« ${o.label} » ne peut pas encore se produire.`, ton: 'alerte' });
      return;
    }
    ouvrirApercu({
      html: r.data.html, titre: o.label,
      sousTitre: `${nomPropre(d.etudiant?.nom, d.etudiant?.prenom)} · dossier n° ${d.id}`,
      nomFichier: r.data.nom || `${o.piece}_${d.id}`,
    });
  }
  const libCat = c => CATEGORIES_PIECE.find(x => x[0] === c)?.[1] || c;

  return (
    <Bloc titre="Pièces">
      {officielles.length > 0 && (
        <div className="divide-y divide-slate-100 mb-2">
          {officielles.map(o => {
            const pret = o.pret(d);
            return (
              <div key={o.piece} className="flex items-center gap-2 py-1">
                <IconFileText size={15} className="text-slate-400 flex-none" />
                <span className="flex-1 min-w-0 text-[13px] text-slate-700 truncate">{o.label}</span>
                {pret ? (
                  <button type="button" className="bouton bouton-compact bouton-sortir" onClick={() => produire(o)}>Produire</button>
                ) : (
                  <span className="text-[11px] text-slate-400 whitespace-nowrap">
                    après « {(d.circuit?.etapes || []).find(e => e.cle === o.etape)?.label || o.etape} »
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
      <div className="divide-y divide-slate-100">
        {(d.pieces || []).map(p => (
          <button key={p.id} type="button" onClick={() => telecharger(p)}
            className="w-full flex items-center gap-2 py-1 text-left hover:bg-slate-50">
            <IconDownload size={14} className="text-slate-400 flex-none" />
            <span className="flex-1 min-w-0">
              <span className="block text-[13px] text-slate-700 truncate">{p.nom}</span>
              <span className="block text-[11px] text-slate-400">{libCat(p.categorie)} · {fmt(p.le)}{p.par_nom ? ` · ${p.par_nom}` : ''}</span>
            </span>
          </button>
        ))}
        {!(d.pieces || []).length && <div className="text-[12px] text-slate-400 py-1">Aucune pièce déposée.</div>}
      </div>
      {erreur && <div className="text-[12px] mt-1" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}
      {peut && (
        <div className="mt-2 flex gap-1.5">
          <select className="controle flex-1 min-w-0" value={categorie} onChange={e => setCategorie(e.target.value)}>
            {CATEGORIES_PIECE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
          <input ref={champ} type="file" className="hidden" onChange={e => deposer(e.target.files?.[0])} />
          <button type="button" className="bouton" disabled={envoi} onClick={() => champ.current?.click()}>
            <IconUpload size={15} /> {envoi ? 'Dépôt…' : 'Déposer'}
          </button>
        </div>
      )}
    </Bloc>
  );
}

// ── Journal ─────────────────────────────────────────────────────────────────
function Journal({ dossier: d }) {
  const libelles = Object.fromEntries((d.circuit?.etapes || []).map(e => [e.cle, e.label]));
  libelles.ecartement = 'Écartement provisoire';
  const lignes = [...(d.journal || [])].reverse();
  return (
    <Bloc titre={`Journal · ${lignes.length} geste${lignes.length > 1 ? 's' : ''}`}>
      {!lignes.length && <div className="text-[12px] text-slate-400">Aucun geste encore.</div>}
      <div className="divide-y divide-slate-100 max-h-72 overflow-y-auto">
        {lignes.map((l, i) => (
          <div key={i} className="py-1">
            <div className="text-[13px] text-slate-700">
              {libelles[l.etape] || l.etape}{l.retiree ? ' — retirée' : ''}
            </div>
            <div className="text-[11px] text-slate-400">{fmt(l.le)}{fmtHeure(l.le)}{l.par ? ` · ${l.par}` : ''}</div>
          </div>
        ))}
      </div>
    </Bloc>
  );
}
