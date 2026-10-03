import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  IconFileText, IconSignature, IconTrash, IconHistory, IconUpload, IconFileCertificate,
  IconEye, IconPlus, IconX, IconArrowBackUp,
} from '@tabler/icons-react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import { PageHeader, Fenetre, PastilleEtat } from './ui.jsx';
import EditeurTexte from './EditeurTexte.jsx';
import { frDate, nomEcran, ouvrirConvention } from './ConventionStage.jsx';

/**
 * LE REGISTRE DES CONVENTIONS — troisième face de Documentation (Charles,
 * 3 octobre 2026).
 *
 * Quatre familles. Trois se COMPOSENT dans Lucie, sur un modèle que la
 * direction corrige comme un texte du corpus (versions en ajout seul) :
 * convention-cadre de stage, partenariat pédagogique, convention entre
 * établissements. La quatrième se DÉPOSE : le document du partenaire, un PDF
 * reçu — on n'écrit pas le texte d'autrui. Composée ou déposée, une
 * convention part ensuite à la signature du directeur (Accueil → À signer),
 * puis l'exemplaire contresigné par le partenaire revient s'y ranger.
 *
 * L'ACCÈS SE DÉCIDE AU SERVEUR (gestes « conventions.* ») : cette face ne
 * paraît pas pour un enseignant, mais c'est la route qui le refuse.
 */

/* Ceux à qui la face s'affiche — le serveur décide, ceci ne fait que CACHER. */
export const LIRE_CONVENTIONS = ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'editeur', 'coordination'];
const PEUT_MODELES = ['admin', 'directeur', 'directeur_adjoint'];
const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];

const ETATS = {
  deposee:      { etat: 'surveiller', libelle: 'Déposée — à signer' },
  signee:       { etat: 'disponible', libelle: 'Signée par l’IIP' },
  contresignee: { etat: 'reussi',     libelle: 'Contresignée' },
  retiree:      { etat: 'corriger',   libelle: 'Retirée' },
};
const FAMILLES_ORDRE = ['cadre_stage', 'partenariat', 'etablissements', 'partenaire'];
const DESCRIPTIONS = {
  cadre_stage: 'Avec une institution d’accueil : annuelle, renouvelée tacitement, pour un ou plusieurs cursus.',
  partenariat: 'Une activité pédagogique chez un partenaire : une UE, ses cours, un enseignant référent, des séances.',
  etablissements: 'Entre l’Institut et un autre établissement ou une unité de formation (ex. CREA).',
};

/** Un envoi de fichier n'est pas du JSON : le navigateur écrit la frontière. */
const entetesFichier = () => { const { 'Content-Type': _ct, ...h } = authHeaders(); return h; };
const jsonHeaders = () => ({ ...authHeaders(), 'Content-Type': 'application/json' });
const anneesAutour = a => {
  const y = Number(String(a).slice(0, 4)) || new Date().getFullYear();
  return [y - 2, y - 1, y, y + 1].map(x => `${x}-${x + 1}`);
};

/** Ouvre un HTML composé dans un onglet — ouvert AVANT l'attente, sinon bloqué. */
async function ouvrirApercu(corps) {
  const w = window.open('', '_blank');
  const rep = await fetch('/api/conventions/apercu', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(corps) });
  const j = await rep.json().catch(() => ({}));
  if (!rep.ok) { if (w) w.close(); return j.error || 'Aperçu refusé.'; }
  const url = URL.createObjectURL(new Blob([j.html], { type: 'text/html' }));
  if (w) w.location.href = url; else window.location.href = url;
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return null;
}

/* ═════════════════════════════════════════════════════════════════════════ */

export default function RegistreConventions({ action, onActionFin }) {
  const u = getUser();
  const direction = DIRECTION.includes(u?.role);
  const [annee, setAnnee] = useState(getAnnee());
  const [fFamille, setFFamille] = useState('');
  const [fEtat, setFEtat] = useState('');
  const [fSection, setFSection] = useState('');
  const [fTexte, setFTexte] = useState('');
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [sections, setSections] = useState([]);
  const [familles, setFamilles] = useState({});
  const [journal, setJournal] = useState(null);       // convention
  const [retrait, setRetrait] = useState(null);       // convention

  const charger = useCallback(async () => {
    const p = new URLSearchParams();
    if (annee) p.set('annee', annee);
    if (fFamille) p.set('famille', fFamille);
    if (fEtat) p.set('etat', fEtat);
    if (fSection) p.set('section', fSection);
    if (fTexte.trim()) p.set('q', fTexte.trim());
    try {
      const r = await fetch(`/api/conventions?${p}`, { headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Lecture refusée.'); setListe([]); return; }
      setErreur(null); setListe(j.conventions || []); setFamilles(j.familles || {});
    } catch (e) { setErreur(e.message); }
  }, [annee, fFamille, fEtat, fSection, fTexte]);
  useEffect(() => { const t = setTimeout(charger, 200); return () => clearTimeout(t); }, [charger]);
  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(setSections).catch(() => {});
  }, []);

  async function ouvrir(id, version) { const e = await ouvrirConvention(id, version); if (e) setMessage({ ok: false, texte: e }); }

  async function supprimer(c) {
    const r = await fetch(`/api/conventions/${c.id}`, { method: 'DELETE', headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage({ ok: false, texte: j.error || 'Suppression refusée.' }); return; }
    setMessage({ ok: true, texte: 'Convention supprimée avant signature — le geste reste au journal.' });
    charger();
  }

  async function contresigne(c, fichier) {
    if (!fichier) return;
    const fd = new FormData(); fd.append('fichier', fichier);
    const r = await fetch(`/api/conventions/${c.id}/contresigne`, { method: 'POST', headers: entetesFichier(), body: fd });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage({ ok: false, texte: j.error || 'Dépôt refusé.' }); return; }
    setMessage({ ok: true, texte: `Exemplaire contresigné rangé avec la convention n° ${c.id}.` });
    charger();
  }

  const nb = liste?.length || 0;
  const aSigner = (liste || []).filter(c => c.etat === 'deposee').length;
  const echues = (liste || []).filter(c => c.echue).length;

  return (
    <>
      <PageHeader titre="Conventions"
        sous="Le registre des conventions de l’Institut — préparées ici, signées par la direction, contresignées par le partenaire" />

      <div className="flex flex-wrap items-center gap-2">
        <select value={annee} onChange={e => setAnnee(e.target.value)} className="controle text-[13px]" aria-label="Année académique">
          {anneesAutour(getAnnee()).map(a => <option key={a} value={a}>{a}</option>)}
          <option value="">Toutes les années</option>
        </select>
        <select value={fFamille} onChange={e => setFFamille(e.target.value)} className="controle text-[13px]" aria-label="Famille">
          <option value="">Toutes les familles</option>
          {FAMILLES_ORDRE.map(f => <option key={f} value={f}>{familles[f] || f}</option>)}
        </select>
        <select value={fEtat} onChange={e => setFEtat(e.target.value)} className="controle text-[13px]" aria-label="État">
          <option value="">Tous les états</option>
          <option value="deposee">Déposées — à signer</option>
          <option value="signee">Signées par l’IIP</option>
          <option value="contresignee">Contresignées</option>
          <option value="echue">Échues</option>
          <option value="retiree">Retirées</option>
        </select>
        <select value={fSection} onChange={e => setFSection(e.target.value)} className="controle text-[13px]" aria-label="Section">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
        </select>
        <input value={fTexte} onChange={e => setFTexte(e.target.value)} placeholder="Partenaire, objet, étudiant…"
          className="controle text-[13px] w-56" aria-label="Rechercher un partenaire" />
        <span className="text-[12px] text-slate-500">
          {nb} convention{nb > 1 ? 's' : ''}{aSigner ? ` · ${aSigner} à signer` : ''}{echues ? ` · ${echues} échue${echues > 1 ? 's' : ''}` : ''}
        </span>
      </div>

      {erreur && <div className="carte p-3 text-[13px] text-rose-700">{erreur}</div>}
      {message && (
        <div className={`text-[12px] ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.texte}</div>
      )}

      {liste && !nb && !erreur && (
        <p className="text-[13px] text-slate-400">
          Aucune convention{annee ? ` en ${annee}` : ''} pour ces critères. « Nouvelle convention » en compose une ;
          « Déposer un document du partenaire » range un PDF reçu.
        </p>
      )}

      <div className="space-y-1.5">
        {(liste || []).map(c => {
          const E = ETATS[c.etat] || ETATS.deposee;
          return (
            <div key={c.id} className="carte px-3 py-2 flex items-center gap-3 flex-wrap">
              <span className="flex-1 min-w-[260px]">
                <span className="block text-[11px] text-slate-500">
                  {familles[c.famille] || c.famille} · n° {c.id}{c.annee_scolaire ? ` · ${c.annee_scolaire}` : ''}
                  {c.origine === 'iip' ? ' · modèle IIP' : ' · document du partenaire'}
                </span>
                <span className="text-[13px] font-semibold text-iip-blue">{c.partenaire || '—'}</span>
                {c.famille === 'partenariat' && c.objet && (
                  <span className="block text-[12px] text-slate-600 truncate max-w-[520px]" title={c.objet}>{c.objet}</span>
                )}
                <span className="block text-[12px] text-slate-600">
                  {[c.etud_nom ? nomEcran(c.etud_nom, c.etud_prenom) : null,
                    c.famille === 'partenaire' ? c.objet : null,
                    (c.sections_liste?.length ? c.sections_liste.join(', ') : c.section) || null]
                    .filter(Boolean).join(' · ')}
                </span>
                <span className="block text-[11px] text-slate-400">
                  {[c.periode_debut && `du ${frDate(c.periode_debut)}`, c.periode_fin && `au ${frDate(c.periode_fin)}`,
                    c.tacite ? 'renouvelée tacitement' : null,
                    c.echeance ? `échéance ${frDate(c.echeance)}` : null,
                    `${c.origine === 'iip' ? 'composée' : 'déposée'} par ${c.depose_par_nom || '—'} le ${frDate(c.depose_le)}`]
                    .filter(Boolean).join(' · ')}
                </span>
              </span>

              <span className="flex flex-col items-end gap-1 flex-none">
                <span className="flex items-center gap-1.5">
                  <PastilleEtat etat={E.etat}>{E.libelle}</PastilleEtat>
                  {c.echue && <PastilleEtat etat="surveiller">Échue</PastilleEtat>}
                </span>
                <span className="text-[11px] text-slate-500">
                  {c.etat === 'retiree' ? `le ${frDate(c.retire_le)} par ${c.retire_par || '—'}`
                    : c.contresigne_le ? `signée le ${frDate(c.signe_le)} par ${c.signe_par_nom} · contresignée reçue le ${frDate(c.contresigne_le)}`
                    : c.signe_le ? `le ${frDate(c.signe_le)} par ${c.signe_par_nom} · réf. ${c.reference}` : 'attend la griffe de la direction'}
                </span>
              </span>

              <span className="flex items-center gap-1.5 flex-none">
                <button type="button" className="bouton text-[12px] px-2.5 py-1" title={c.fichier_nom}
                  onClick={() => ouvrir(c.id, 'original')}><IconFileText size={14} /> Original</button>
                {c.a_signe && (
                  <button type="button" className="bouton bouton-sortir text-[12px] px-2.5 py-1"
                    onClick={() => ouvrir(c.id, 'signe')}><IconSignature size={14} /> Signée</button>
                )}
                {c.a_contresigne && (
                  <button type="button" className="bouton text-[12px] px-2.5 py-1"
                    onClick={() => ouvrir(c.id, 'contresigne')}><IconFileCertificate size={14} /> Contresignée</button>
                )}
                {c.etat === 'signee' && (
                  <label className="bouton text-[12px] px-2.5 py-1 cursor-pointer"
                    title="Déposer l’exemplaire revenu signé par le partenaire (PDF)">
                    <IconUpload size={14} /> Contresignée…
                    <input type="file" accept="application/pdf,.pdf" className="hidden"
                      onChange={e => { contresigne(c, e.target.files?.[0]); e.target.value = ''; }} />
                  </label>
                )}
                <button type="button" className="bouton text-[12px] px-2 py-1" title="Journal de la convention"
                  aria-label="Journal" onClick={() => setJournal(c)}><IconHistory size={14} /></button>
                {c.etat === 'deposee' && (
                  <button type="button" className="bouton text-[12px] px-2 py-1" title="Supprimer (avant signature seulement)"
                    aria-label="Supprimer" onClick={() => supprimer(c)}><IconTrash size={14} /></button>
                )}
                {direction && ['signee', 'contresignee'].includes(c.etat) && (
                  <button type="button" className="bouton text-[12px] px-2 py-1" title="Retirer (motif écrit)"
                    aria-label="Retirer" onClick={() => setRetrait(c)}><IconArrowBackUp size={14} /></button>
                )}
              </span>
            </div>
          );
        })}
      </div>

      {action === 'nouvelle' && (
        <NouvelleConvention sections={sections} annee={annee || getAnnee()}
          onClose={onActionFin}
          onCree={c => { onActionFin(); setMessage({ ok: true, texte: `Convention n° ${c.id} composée — elle attend la signature de la direction (Accueil → À signer).` }); charger(); }} />
      )}
      {action === 'deposer' && (
        <DeposerPartenaire sections={sections} annee={annee || getAnnee()}
          onClose={onActionFin}
          onCree={c => { onActionFin(); setMessage({ ok: true, texte: `Document n° ${c.id} déposé — il attend la signature de la direction.` }); charger(); }} />
      )}
      {action === 'modeles' && <ModelesConvention onClose={onActionFin} />}
      {journal && <JournalConvention c={journal} onClose={() => setJournal(null)} />}
      {retrait && <RetirerConvention c={retrait} onClose={() => setRetrait(null)}
        onFait={() => { setRetrait(null); charger(); }} />}
    </>
  );
}

/* ══ CHAMPS ══════════════════════════════════════════════════════════════ */

function Champ({ label, requis, children, aide, large = false }) {
  return (
    <label className={`block ${large ? 'col-span-2' : ''}`}>
      <span className="block text-[11px] text-slate-500 mb-0.5">{label}{requis ? ' *' : ''}</span>
      {children}
      {aide && <span className="block text-[11px] text-slate-400 mt-0.5">{aide}</span>}
    </label>
  );
}
const Texte = ({ v, set, ...p }) => (
  <input value={v || ''} onChange={e => set(e.target.value)} className="controle text-[13px] w-full" {...p} />
);
const Zone = ({ v, set, rows = 3, ...p }) => (
  <textarea value={v || ''} onChange={e => set(e.target.value)} rows={rows}
    className="w-full border border-slate-300 rounded-champ px-2.5 py-1.5 text-[13px]" {...p} />
);

function FichePartenaire({ p, set, avecSigle, avecPo, avecAdresse = true }) {
  const maj = k => v => set({ ...p, [k]: v });
  return (
    <div className="grid grid-cols-2 gap-3">
      <Champ label="Dénomination" requis><Texte v={p.nom} set={maj('nom')} /></Champ>
      {avecSigle && (
        <Champ label="Appellation courte" requis aide="Telle qu’elle se lit dans le texte : « l’école Les Pommiers », « CREA ».">
          <Texte v={p.sigle} set={maj('sigle')} />
        </Champ>
      )}
      {avecAdresse && <Champ label="Adresse" requis={avecAdresse === 'requis'} large={!avecSigle}><Texte v={p.adresse} set={maj('adresse')} /></Champ>}
      <Champ label="Représenté(e) par (Prénom NOM)" requis><Texte v={p.representant} set={maj('representant')} /></Champ>
      <Champ label="Fonction du représentant" requis><Texte v={p.fonction} set={maj('fonction')} /></Champ>
      <Champ label="Téléphone"><Texte v={p.tel} set={maj('tel')} /></Champ>
      <Champ label="Courriel"><Texte v={p.email} set={maj('email')} type="email" /></Champ>
      {avecPo && <Champ label="Pouvoir organisateur"><Texte v={p.po} set={maj('po')} /></Champ>}
    </div>
  );
}

/* ══ NOUVELLE CONVENTION ═════════════════════════════════════════════════ */

function NouvelleConvention({ sections, annee: anneeDefaut, onClose, onCree }) {
  const [famille, setFamille] = useState(null);
  const [annee, setAnnee] = useState(anneeDefaut);
  const y = String(anneeDefaut).slice(0, 4);
  const [p, setP] = useState({});
  const [lieux, setLieux] = useState([]);
  const [lieuId, setLieuId] = useState('');
  const [partenaires, setPartenaires] = useState([]);
  const [partenaireId, setPartenaireId] = useState('');
  const [debut, setDebut] = useState(`${y}-09-14`);
  const [fin, setFin] = useState('');
  const [cursus, setCursus] = useState(new Set());
  const [d, setD] = useState({ seances: [], cours: [] });
  const [ues, setUes] = useState([]);
  const [coursUe, setCoursUe] = useState([]);
  const [profs, setProfs] = useState([]);
  const [nouvelleDate, setNouvelleDate] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const md = k => v => setD(x => ({ ...x, [k]: v }));

  useEffect(() => {
    fetch('/api/stages/lieux', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(setLieux).catch(() => {});
    fetch('/api/conventions/partenaires', { headers: authHeaders() }).then(r => (r.ok ? r.json() : {}))
      .then(j => setPartenaires(j.partenaires || [])).catch(() => {});
    fetch('/api/ref/professeurs', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(setProfs).catch(() => {});
  }, []);

  // L'unité et ses cours se choisissent dans le référentiel, jamais se tapent.
  useEffect(() => {
    if (famille !== 'partenariat' || !d.section) { setUes([]); return; }
    fetch(`/api/ref/ue?section=${encodeURIComponent(d.section)}&annee=${annee}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(setUes).catch(() => {});
    fetch(`/api/ref/sections/${encodeURIComponent(d.section)}/ue-cours?annee=${annee}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setCoursUe(l)).catch(() => {});
  }, [famille, d.section, annee]);
  const coursDeLue = useMemo(() => (coursUe.find(x => String(x.ue_num) === String(d.ue_num))?.cours || []), [coursUe, d.ue_num]);

  function choisirLieu(id) {
    setLieuId(id);
    const l = lieux.find(x => String(x.id) === String(id));
    if (!l) return;
    setP({
      nom: l.nom, adresse: [l.adresse, [l.cp, l.localite].filter(Boolean).join(' ')].filter(Boolean).join(', '),
      representant: l.representant || '', fonction: l.representant_fonction || '',
      tel: l.contact_tel || '', email: l.contact_email || '', _contact: l.contact_nom ? { nom: l.contact_nom, fonction: l.contact_fonction } : null,
    });
  }
  function choisirPartenaire(id) {
    setPartenaireId(id);
    const x = partenaires.find(q => String(q.id) === String(id));
    setP(x ? { nom: x.nom, sigle: x.sigle || '', adresse: x.adresse || '', representant: x.representant || '',
      fonction: x.fonction || '', tel: x.tel || '', email: x.email || '', po: x.po || '' } : {});
  }
  function choisirSection(code) {
    const s = sections.find(x => x.code === code);
    const niveau = String(s?.niveau || '').toLowerCase();
    const lib = s?.libelle || code;
    const cur = !s ? '' : lib.toLowerCase().startsWith(niveau) || !niveau ? lib.charAt(0).toLowerCase() + lib.slice(1) : `${niveau} en ${lib}`;
    setD(x => ({ ...x, section: code, ue_num: '', cours: [], cursus: cur }));
  }

  const corps = () => ({
    famille, annee_scolaire: annee,
    lieu_id: famille === 'cadre_stage' ? Number(lieuId) || null : undefined,
    partenaire_id: famille !== 'cadre_stage' ? Number(partenaireId) || null : undefined,
    partenaire: p, periode_debut: famille === 'etablissements' ? null : debut || null, periode_fin: famille === 'partenariat' ? fin || null : null,
    donnees: famille === 'cadre_stage' ? { cursus: [...cursus] }
      : famille === 'partenariat' ? { ...d, ue_num: Number(d.ue_num) || null } : {},
  });

  async function apercu() {
    setErreur(null);
    const e = await ouvrirApercu(corps());
    if (e) setErreur(e);
  }
  async function composer() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/conventions/composer', { method: 'POST', headers: jsonHeaders(), body: JSON.stringify(corps()) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Composition refusée.'); return; }
      onCree(j.convention || { id: j.id });
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  return (
    <Fenetre icone={IconPlus} large="grande" onFermer={onClose}
      titre={famille ? `Nouvelle convention — ${({ cadre_stage: 'convention-cadre de stage', partenariat: 'partenariat pédagogique', etablissements: 'convention entre établissements' })[famille]}` : 'Nouvelle convention'}
      sous={famille ? 'Le texte vient du modèle publié ; l’Institut (nom, adresse, signataire) vient de Configuration → Établissement.' : 'Quelle sorte de convention ?'}
      pied={famille ? (<>
        <p className="flex-1 min-w-0 text-[12px] text-red-700">{erreur}</p>
        <button type="button" className="bouton" onClick={() => { setFamille(null); setErreur(null); }}>Changer de famille</button>
        <button type="button" className="bouton" onClick={apercu}><IconEye size={15} /> Aperçu</button>
        <button type="button" className="bouton bouton-fort" disabled={enCours} onClick={composer}>
          {enCours ? 'Composition…' : 'Composer'}
        </button>
      </>) : null}>
      {!famille ? (
        <div className="grid grid-cols-3 gap-3">
          {['cadre_stage', 'partenariat', 'etablissements'].map(f => (
            <button key={f} type="button" onClick={() => setFamille(f)}
              className="carte p-4 text-left hover:border-iip-blue">
              <span className="block text-[15px] font-semibold text-iip-blue">
                {({ cadre_stage: 'Convention-cadre de stage', partenariat: 'Partenariat pédagogique', etablissements: 'Convention entre établissements' })[f]}
              </span>
              <span className="block text-[12px] text-slate-600 mt-1">{DESCRIPTIONS[f]}</span>
            </button>
          ))}
          <p className="col-span-3 text-[12px] text-slate-500">
            Un PDF reçu du partenaire ne se compose pas : il se dépose (« Déposer un document du partenaire »).
          </p>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <Champ label="Année académique" requis>
              <select value={annee} onChange={e => setAnnee(e.target.value)} className="controle text-[13px] w-full">
                {anneesAutour(anneeDefaut).map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </Champ>
            {famille !== 'etablissements' && (
              <Champ label={famille === 'cadre_stage' ? 'Prend cours le' : 'Valable du'} requis>
                <input type="date" value={debut} onChange={e => setDebut(e.target.value)} className="controle text-[13px] w-full" />
              </Champ>
            )}
            {famille === 'partenariat' && (
              <Champ label="au" requis>
                <input type="date" value={fin} onChange={e => setFin(e.target.value)} className="controle text-[13px] w-full" />
              </Champ>
            )}
          </div>

          {/* LE PARTENAIRE */}
          <section className="space-y-2">
            <h3 className="text-[13px] font-semibold text-iip-blue">
              {famille === 'cadre_stage' ? 'L’institution d’accueil' : 'Le partenaire'}
            </h3>
            {famille === 'cadre_stage' ? (
              <Champ label="Lieu de stage" requis aide="Les lieux viennent du répertoire des stages ; un représentant complété ici y est enregistré.">
                <select value={lieuId} onChange={e => choisirLieu(e.target.value)} className="controle text-[13px] w-full">
                  <option value="">— choisir un lieu —</option>
                  {lieux.map(l => <option key={l.id} value={l.id}>{l.nom}{l.localite ? ` (${l.localite})` : ''}</option>)}
                </select>
              </Champ>
            ) : (
              <Champ label="Partenaire" aide="Un partenaire nouveau entre au répertoire en composant.">
                <select value={partenaireId} onChange={e => choisirPartenaire(e.target.value)} className="controle text-[13px] w-full">
                  <option value="">— nouveau partenaire —</option>
                  {partenaires.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
                </select>
              </Champ>
            )}
            {(famille !== 'cadre_stage' || lieuId) && (
              <>
                {famille === 'cadre_stage' && p._contact && !p.representant && (
                  <p className="text-[12px] text-slate-600">
                    Le lieu n’a pas de représentant enregistré. Contact : {p._contact.nom}{p._contact.fonction ? `, ${p._contact.fonction}` : ''}.{' '}
                    <button type="button" className="text-iip-blue font-semibold"
                      onClick={() => setP(x => ({ ...x, representant: x._contact.nom, fonction: x._contact.fonction || '' }))}>
                      Le reprendre comme représentant
                    </button>
                  </p>
                )}
                <FichePartenaire p={p} set={setP} avecSigle={famille !== 'cadre_stage'}
                  avecPo={famille === 'partenariat'} avecAdresse={famille === 'etablissements' ? true : 'requis'} />
              </>
            )}
          </section>

          {famille === 'cadre_stage' && (
            <section className="space-y-2">
              <h3 className="text-[13px] font-semibold text-iip-blue">Cursus concernés *</h3>
              <div className="flex flex-wrap gap-2">
                {sections.map(s => (
                  <label key={s.code} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-champ border cursor-pointer text-[12px] ${cursus.has(s.code) ? 'border-iip-blue' : 'border-slate-200 text-slate-600'}`}>
                    <input type="checkbox" checked={cursus.has(s.code)} className="w-3.5 h-3.5"
                      onChange={() => setCursus(c => { const n = new Set(c); n.has(s.code) ? n.delete(s.code) : n.add(s.code); return n; })} />
                    {s.libelle && s.libelle !== s.code ? `${s.libelle}` : s.code}
                  </label>
                ))}
              </div>
            </section>
          )}

          {famille === 'partenariat' && (
            <section className="space-y-3">
              <h3 className="text-[13px] font-semibold text-iip-blue">L’activité</h3>
              <Champ label="Objet — « … visant à »" requis>
                <Zone v={d.objet} set={md('objet')} rows={2}
                  placeholder="permettre aux étudiants de l’Institut d’expérimenter…" />
              </Champ>
              <div className="grid grid-cols-2 gap-3">
                <Champ label="Section" requis>
                  <select value={d.section || ''} onChange={e => choisirSection(e.target.value)} className="controle text-[13px] w-full">
                    <option value="">— choisir —</option>
                    {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                  </select>
                </Champ>
                <Champ label="Cursus, tel qu’il se lit « dans le cadre du … »" requis>
                  <Texte v={d.cursus} set={md('cursus')} placeholder="bachelier en Psychomotricité" />
                </Champ>
                <Champ label="Unité d’enseignement" requis large>
                  <select value={d.ue_num || ''} onChange={e => setD(x => ({ ...x, ue_num: e.target.value, cours: [] }))}
                    className="controle text-[13px] w-full" disabled={!d.section}>
                    <option value="">{d.section ? (ues.length ? '— choisir —' : 'aucune unité pour cette section et cette année') : 'choisissez d’abord la section'}</option>
                    {ues.map(x => <option key={`${x.ue_num}`} value={x.ue_num}>{x.ue_num} — {x.ue_nom}</option>)}
                  </select>
                </Champ>
              </div>
              {d.ue_num && (
                <Champ label="Cours concernés" requis>
                  <div className="flex flex-wrap gap-2">
                    {coursDeLue.map(c => (
                      <label key={c.cours_code} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-champ border cursor-pointer text-[12px] ${d.cours.includes(c.cours_code) ? 'border-iip-blue' : 'border-slate-200 text-slate-600'}`}>
                        <input type="checkbox" className="w-3.5 h-3.5" checked={d.cours.includes(c.cours_code)}
                          onChange={() => setD(x => ({ ...x, cours: x.cours.includes(c.cours_code) ? x.cours.filter(k => k !== c.cours_code) : [...x.cours, c.cours_code] }))} />
                        {c.cours_code} — {c.cours_nom}
                      </label>
                    ))}
                    {!coursDeLue.length && <span className="text-[12px] text-slate-400">aucun cours au référentiel pour cette unité</span>}
                  </div>
                </Champ>
              )}
              <div className="grid grid-cols-2 gap-3">
                <Champ label="Enseignant référent" requis>
                  <select value={d.enseignant_id || ''} onChange={e => md('enseignant_id')(e.target.value)} className="controle text-[13px] w-full">
                    <option value="">— choisir dans le personnel —</option>
                    {profs.map(x => <option key={x.id} value={x.id}>{nomEcran(x.nom, x.prenom)}</option>)}
                  </select>
                </Champ>
                <Champ label="Son téléphone (imprimé entre parenthèses)"><Texte v={d.enseignant_tel} set={md('enseignant_tel')} /></Champ>
              </div>
              <Champ label="Dates des séances" requis>
                <div className="flex flex-wrap items-center gap-2">
                  {[...d.seances].sort().map(s => (
                    <span key={s} className="flex items-center gap-1 px-2 py-0.5 rounded-champ border border-slate-200 text-[12px]">
                      {frDate(s)}
                      <button type="button" aria-label={`Retirer le ${frDate(s)}`} onClick={() => md('seances')(d.seances.filter(x => x !== s))}>
                        <IconX size={12} />
                      </button>
                    </span>
                  ))}
                  <input type="date" value={nouvelleDate} onChange={e => setNouvelleDate(e.target.value)} className="controle text-[13px]" />
                  <button type="button" className="bouton" disabled={!nouvelleDate}
                    onClick={() => { if (!d.seances.includes(nouvelleDate)) md('seances')([...d.seances, nouvelleDate]); setNouvelleDate(''); }}>
                    Ajouter
                  </button>
                </div>
              </Champ>
              <Champ label="Horaires des séances" requis aide="Un paragraphe par ligne vide.">
                <Zone v={d.horaires} set={md('horaires')} rows={3} />
              </Champ>
              <Champ label="Organisation des séances" requis aide="Un paragraphe par ligne vide.">
                <Zone v={d.organisation} set={md('organisation')} rows={3} />
              </Champ>
              <div className="grid grid-cols-2 gap-3">
                <Champ label="Le partenaire met à disposition…" requis>
                  <Texte v={d.locaux} set={md('locaux')} placeholder="un local, soit la salle de psychomotricité…, ainsi que son matériel" />
                </Champ>
                <Champ label="Interlocuteurs pour l’évaluation du partenariat">
                  <Texte v={d.interlocuteurs} set={md('interlocuteurs')} placeholder="les enseignants des classes concernées" />
                </Champ>
                <Champ label="Annexe" large aide="Omise si vide.">
                  <Texte v={d.annexes} set={md('annexes')} />
                </Champ>
              </div>
            </section>
          )}

          {famille === 'etablissements' && (
            <p className="text-[12px] text-slate-500">
              Le texte de cette famille est fixe (articles 1 à 6) : seuls les parties et l’année académique changent.
            </p>
          )}
        </div>
      )}
    </Fenetre>
  );
}

/* ══ DÉPOSER UN DOCUMENT DU PARTENAIRE ══════════════════════════════════ */

function DeposerPartenaire({ sections, annee: anneeDefaut, onClose, onCree }) {
  const [fichier, setFichier] = useState(null);
  const [type, setType] = useState('partenariat');
  const [types, setTypes] = useState([]);
  const [sorte, setSorte] = useState('partenaire');     // partenaire | lieu
  const [lieux, setLieux] = useState([]);
  const [partenaires, setPartenaires] = useState([]);
  const [lieuId, setLieuId] = useState('');
  const [partenaireId, setPartenaireId] = useState('');
  const [nouveauNom, setNouveauNom] = useState('');
  const [section, setSection] = useState('');
  const [objet, setObjet] = useState('');
  const [annee, setAnnee] = useState(anneeDefaut);
  const [debut, setDebut] = useState('');
  const [fin, setFin] = useState('');
  const [tacite, setTacite] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const champ = useRef(null);

  useEffect(() => {
    fetch('/api/stages/lieux', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).then(setLieux).catch(() => {});
    fetch('/api/conventions/partenaires', { headers: authHeaders() }).then(r => (r.ok ? r.json() : {}))
      .then(j => setPartenaires(j.partenaires || [])).catch(() => {});
    fetch('/api/conventions/modeles', { headers: authHeaders() }).then(r => (r.ok ? r.json() : {}))
      .then(j => setTypes(j.types_depot || [])).catch(() => {});
  }, []);

  async function deposer() {
    setEnCours(true); setErreur(null);
    const fd = new FormData();
    fd.append('fichier', fichier);
    fd.append('type', type);
    if (sorte === 'lieu') fd.append('lieu_id', lieuId);
    else if (partenaireId) fd.append('partenaire_id', partenaireId);
    else fd.append('partenaire_nom', nouveauNom);
    if (section) fd.append('section', section);
    fd.append('objet', objet);
    fd.append('annee_scolaire', annee);
    if (debut) fd.append('periode_debut', debut);
    if (fin) fd.append('periode_fin', fin);
    fd.append('tacite', tacite ? '1' : '0');
    try {
      const r = await fetch('/api/conventions', { method: 'POST', headers: entetesFichier(), body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Dépôt refusé.'); return; }
      onCree(j.convention || { id: j.id });
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const partenaireOk = sorte === 'lieu' ? !!lieuId : (!!partenaireId || !!nouveauNom.trim());
  const pret = fichier && partenaireOk && objet.trim();
  return (
    <Fenetre icone={IconUpload} large="moyenne" onFermer={onClose}
      titre="Déposer un document du partenaire"
      sous="Un PDF reçu : il est rangé tel quel et part à la signature de la direction."
      pied={<>
        <p className="flex-1 min-w-0 text-[12px] text-red-700">
          {erreur || (!pret ? 'Choisissez le fichier, le partenaire et dites l’objet.' : '')}
        </p>
        <button type="button" className="bouton bouton-fort" disabled={!pret || enCours} onClick={deposer}>
          {enCours ? 'Envoi…' : 'Déposer'}
        </button>
      </>}>
      <div className="space-y-3">
        <Champ label="Fichier (PDF, 15 Mo au plus)" requis>
          <input ref={champ} type="file" accept="application/pdf,.pdf" className="text-[13px]"
            onChange={e => setFichier(e.target.files?.[0] || null)} />
        </Champ>
        <div className="grid grid-cols-2 gap-3">
          <Champ label="Nature" requis>
            <select value={type} onChange={e => setType(e.target.value)} className="controle text-[13px] w-full">
              {types.map(t => <option key={t.cle} value={t.cle}>{t.libelle}</option>)}
            </select>
          </Champ>
          <Champ label="Année académique" requis>
            <select value={annee} onChange={e => setAnnee(e.target.value)} className="controle text-[13px] w-full">
              {anneesAutour(anneeDefaut).map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </Champ>
        </div>
        <div className="segments flex gap-1">
          <button type="button" className={`bouton ${sorte === 'partenaire' ? 'bouton-fort' : ''}`} onClick={() => setSorte('partenaire')}>Un partenaire</button>
          <button type="button" className={`bouton ${sorte === 'lieu' ? 'bouton-fort' : ''}`} onClick={() => setSorte('lieu')}>Un lieu de stage</button>
        </div>
        {sorte === 'lieu' ? (
          <Champ label="Lieu de stage" requis>
            <select value={lieuId} onChange={e => setLieuId(e.target.value)} className="controle text-[13px] w-full">
              <option value="">— choisir —</option>
              {lieux.map(l => <option key={l.id} value={l.id}>{l.nom}{l.localite ? ` (${l.localite})` : ''}</option>)}
            </select>
          </Champ>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            <Champ label="Partenaire du répertoire">
              <select value={partenaireId} onChange={e => setPartenaireId(e.target.value)} className="controle text-[13px] w-full">
                <option value="">— nouveau partenaire —</option>
                {partenaires.map(x => <option key={x.id} value={x.id}>{x.nom}</option>)}
              </select>
            </Champ>
            {!partenaireId && <Champ label="Dénomination du nouveau partenaire" requis><Texte v={nouveauNom} set={setNouveauNom} /></Champ>}
          </div>
        )}
        <Champ label="Objet" requis><Texte v={objet} set={setObjet} placeholder="Convention relative au tutorat" /></Champ>
        <div className="grid grid-cols-3 gap-3">
          <Champ label="Section" aide="Requise pour une coordination.">
            <select value={section} onChange={e => setSection(e.target.value)} className="controle text-[13px] w-full">
              <option value="">— aucune —</option>
              {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
            </select>
          </Champ>
          <Champ label="Valable du"><input type="date" value={debut} onChange={e => setDebut(e.target.value)} className="controle text-[13px] w-full" /></Champ>
          <Champ label="au" aide="Après cette date, elle est « échue »."><input type="date" value={fin} onChange={e => setFin(e.target.value)} className="controle text-[13px] w-full" /></Champ>
        </div>
        <label className="flex items-center gap-2 text-[13px]">
          <input type="checkbox" checked={tacite} onChange={e => setTacite(e.target.checked)} className="w-4 h-4" />
          Renouvelée tacitement chaque année (échéance au 31 août, sans date de fin)
        </label>
      </div>
    </Fenetre>
  );
}

/* ══ MODÈLES ════════════════════════════════════════════════════════════ */

/** Les jetons {{…}} se voient dans le texte lu : surlignés, jamais confondus avec du texte. */
const marquerJetons = html => String(html || '').replace(/\{\{\s*([a-z_.]+)\s*\}\}/g,
  '<mark style="background-color:#E8F0F8">{{$1}}</mark>');

function ModelesConvention({ onClose }) {
  const u = getUser();
  const peut = PEUT_MODELES.includes(u?.role);
  const [familles, setFamilles] = useState(null);
  const [onglet, setOnglet] = useState('cadre_stage');
  const [lue, setLue] = useState(null);           // version ancienne lue
  const [edition, setEdition] = useState(null);   // { texte, note }
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    const r = await fetch('/api/conventions/modeles', { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Lecture refusée.'); return; }
    setFamilles((j.familles || []).filter(f => f.modele));
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const f = familles?.find(x => x.cle === onglet);
  async function lire(id) {
    const r = await fetch(`/api/conventions/modeles/version/${id}`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (r.ok) setLue(j.version);
  }
  async function publier() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/conventions/modeles/${onglet}`, { method: 'POST', headers: jsonHeaders(),
        body: JSON.stringify({ texte_html: edition.texte, note: edition.note }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Publication refusée.'); return; }
      setEdition(null); setLue(null); await charger();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const montre = lue && lue.famille === onglet ? lue : f?.courant;
  return (
    <Fenetre icone={IconFileText} large="pleine" hauteurFixe onFermer={onClose}
      titre="Modèles de convention"
      sous="Les textes vivent dans Lucie : une version publiée ne se modifie plus, on publie la suivante en disant ce qui change."
      pied={edition ? (<>
        <p className="flex-1 min-w-0 text-[12px] text-red-700">{erreur}</p>
        <button type="button" className="bouton" onClick={() => { setEdition(null); setErreur(null); }}>Abandonner</button>
        <button type="button" className="bouton bouton-fort" disabled={enCours || (edition.note || '').trim().length < 5} onClick={publier}>
          {enCours ? 'Publication…' : `Publier la version ${(f?.courant?.version || 0) + 1}`}
        </button>
      </>) : (erreur ? <p className="flex-1 text-[12px] text-red-700">{erreur}</p> : null)}>
      <div className="flex gap-4 border-b border-slate-200 mb-4">
        {(familles || []).map(x => (
          <button key={x.cle} type="button" onClick={() => { setOnglet(x.cle); setLue(null); setEdition(null); }}
            className={x.cle === onglet ? 'onglet-page onglet-page-actif' : 'onglet-page'}>
            {x.libelle}
          </button>
        ))}
      </div>
      {f && (
        <div className="grid grid-cols-[1fr_260px] gap-5">
          <div className="min-w-0 space-y-3">
            {edition ? (
              <>
                <div className="border border-slate-200 rounded-champ">
                  <EditeurTexte valeur={edition.texte} onChange={t => setEdition(e => ({ ...e, texte: t }))} importer={false} />
                </div>
                <Champ label="Ce qui change (accompagne la version)" requis>
                  <Zone v={edition.note} set={v => setEdition(e => ({ ...e, note: v }))} rows={2} />
                </Champ>
              </>
            ) : montre ? (
              <>
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-[12px] text-slate-500">
                    Version {montre.version} du {frDate(montre.publie_le)}{montre.publie_par ? ` · ${montre.publie_par}` : ''}
                    {lue && lue.id !== f.courant?.id ? ' — version ancienne' : ''}
                  </span>
                  <span className="flex-1" />
                  {peut && !lue && (
                    <button type="button" className="bouton"
                      onClick={() => setEdition({ texte: f.courant?.texte_html || '', note: '' })}>
                      Préparer la version {(f.courant?.version || 0) + 1}
                    </button>
                  )}
                  {lue && <button type="button" className="bouton" onClick={() => setLue(null)}>Revenir à la version en vigueur</button>}
                </div>
                {montre.note && (
                  <div className="carte p-3 text-[12px] text-slate-600 whitespace-pre-line">{montre.note}</div>
                )}
                <div className="texte-corpus carte p-4" dangerouslySetInnerHTML={{ __html: marquerJetons(montre.texte_html) }} />
              </>
            ) : <p className="text-[13px] text-slate-400">Aucune version.</p>}
          </div>
          <aside className="space-y-4 text-[12px]">
            <div>
              <h3 className="font-semibold text-iip-blue mb-1">Champs du texte</h3>
              <p className="text-slate-500 mb-1.5">Ils s’écrivent entre doubles accolades ; un champ inconnu est refusé à la publication.</p>
              <ul className="space-y-0.5">
                {f.champs.map(c => (
                  <li key={c.cle}><code className="text-[11px]">{`{{${c.cle}}}`}</code>{c.requis ? ' *' : ''}
                    <span className="block text-slate-500">{c.libelle}</span></li>
                ))}
              </ul>
            </div>
            <div>
              <h3 className="font-semibold text-iip-blue mb-1">Versions</h3>
              <ul className="space-y-1">
                {f.versions.map(v => (
                  <li key={v.id}>
                    <button type="button" className="text-left text-iip-blue" onClick={() => (v.id === f.courant?.id ? setLue(null) : lire(v.id))}>
                      v{v.version} — {frDate(v.publie_le)}
                    </button>
                    <span className="block text-slate-500">{v.publie_par}</span>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
    </Fenetre>
  );
}

/* ══ JOURNAL, RETRAIT ═══════════════════════════════════════════════════ */

function JournalConvention({ c, onClose }) {
  const [lignes, setLignes] = useState(null);
  useEffect(() => {
    fetch(`/api/conventions/${c.id}/journal`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : { journal: [] }))
      .then(j => setLignes(j.journal || [])).catch(() => setLignes([]));
  }, [c.id]);
  return (
    <Fenetre icone={IconHistory} large="moyenne" onFermer={onClose}
      titre={`Journal — convention n° ${c.id}`} sous={`${c.partenaire || ''} · en ajout seul : rien ne s’y efface`}>
      <div className="space-y-1.5">
        {(lignes || []).map(l => (
          <div key={l.id} className="text-[12px] border-b border-slate-100 pb-1.5">
            <span className="text-slate-500">{frDate(l.horodatage)} {String(l.horodatage).slice(11, 16)} · {l.acteur_nom}</span>
            <span className="block"><b>{l.geste}</b> — {l.detail}</span>
          </div>
        ))}
        {lignes && !lignes.length && <p className="text-[12px] text-slate-400">Aucune ligne.</p>}
      </div>
    </Fenetre>
  );
}

function RetirerConvention({ c, onClose, onFait }) {
  const [motif, setMotif] = useState('');
  const [erreur, setErreur] = useState(null);
  async function retirer() {
    const r = await fetch(`/api/conventions/${c.id}/retirer`, { method: 'POST', headers: jsonHeaders(), body: JSON.stringify({ motif }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Retrait refusé.'); return; }
    onFait();
  }
  return (
    <Fenetre icone={IconArrowBackUp} large="petite" onFermer={onClose}
      titre={`Retirer la convention n° ${c.id}`} sous={c.partenaire || ''}
      pied={<>
        <p className="flex-1 min-w-0 text-[12px] text-red-700">{erreur || (motif.trim().length < 5 ? 'Le retrait se motive par écrit.' : '')}</p>
        <button type="button" className="bouton bouton-detruire" disabled={motif.trim().length < 5} onClick={retirer}>Retirer</button>
      </>}>
      <Champ label="Motif" requis><Zone v={motif} set={setMotif} rows={3} /></Champ>
      <p className="text-[12px] text-slate-500 mt-2">La convention signée reste lisible ; elle cesse de valoir. Le motif est conservé au journal.</p>
    </Fenetre>
  );
}
