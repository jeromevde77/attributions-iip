import { useState, useEffect, useRef } from 'react';
import { api } from '../lib/api.js';
import { eidStatus, eidReadAll, eidToProf, eidChamps } from '../lib/eid.js';
import NominationsPanel from '../components/NominationsPanel.jsx';
import { IconId, IconTrash, IconFileText } from '@tabler/icons-react';

const _tok = () => localStorage.getItem('token');
const _fetch = (url, opts = {}) =>
  fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_tok()}`, ...opts.headers } }).then(r => r.json());

/* ════════════════════════════════════════════════════════════════════════
   Fiche signalétique du membre du personnel (MDP) — annexe 3 FWB
   Encodage complet à l'engagement, dans l'ordre du document officiel.
   ════════════════════════════════════════════════════════════════════════ */

const ETAT_CIVIL = [
  ['', '— Non défini —'],
  ['celibataire', 'Célibataire'],
  ['marie', 'Marié(e)'],
  ['veuf', 'Veuf(ve)'],
  ['divorce', 'Divorcé(e)'],
  ['cohab_legal', 'Cohabitant(e) légal(e)'],
  ['cohabitant', 'Cohabitant(e)'],
  ['separe_corps', 'Séparé(e) de corps'],
  ['separe_fait', 'Séparé(e) de fait'],
];

const REVENUS_CONJOINT = [
  ['pro', 'Revenus professionnels propres (salarié/indépendant) — pas de réduction PrP'],
  ['pension', 'Pensions, rentes ou assimilés ≤ 565 €/mois — réduction supplémentaire PrP'],
  ['faibles', 'Faibles revenus (≤ 283 €/mois) — réduction supplémentaire PrP'],
  ['aucun', 'Pas de revenus professionnels propres — réduction supplémentaire PrP'],
];

/* Section repliable */
function Section({ titre, sous, ouvert, onToggle, children, complet }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-iip-gold/5 hover:bg-iip-gold/10 transition text-left">
        <div className="flex items-center gap-2">
          <span className={`text-iip-gold text-sm transition-transform ${ouvert ? 'rotate-90' : ''}`}>▶</span>
          <span className="font-semibold text-iip-gold text-sm">{titre}</span>
          {sous && <span className="text-xs text-gray-400">· {sous}</span>}
        </div>
        {complet && <span className="text-green-600 text-xs">✓</span>}
      </button>
      {ouvert && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
}

/* Champs stables (définis au niveau module → jamais démontés, focus préservé) */
const FIELD_CLS = "w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold";

function Labelled({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <Labelled label={label}>
      <input type={type} value={value ?? ''} placeholder={placeholder}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        name={`field_${label?.replace(/[^a-zA-Z]/g, '') || 'x'}_${Math.random().toString(36).slice(2, 8)}`}
        onChange={e => onChange(e.target.value)} className={FIELD_CLS} />
    </Labelled>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <Labelled label={label}>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={FIELD_CLS}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Labelled>
  );
}

function OuiNon({ label, value, onChange }) {
  return (
    <SelectField label={label} value={value} onChange={onChange}
      options={[['non', 'Non'], ['oui', 'Oui']]} />
  );
}

// ─── Grille de disponibilités ─────────────────────────────────────────────────
const JOURS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi'];

function DispoGrid({ creneaux, dispoQ1, setDispoQ1, dispoQ2, setDispoQ2, profId }) {
  const [quadrimestre, setQ] = useState('Q1');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved]   = useState(false);

  const dispo = quadrimestre === 'Q1' ? dispoQ1 : dispoQ2;
  const setDispo = quadrimestre === 'Q1' ? setDispoQ1 : setDispoQ2;

  function toggle(jour, creneauId) {
    const key = `${jour}_${creneauId}`;
    setDispo(prev => ({ ...prev, [key]: !prev[key] }));
    setSaved(false);
  }

  function toutCocher() {
    const all = {};
    for (let j = 1; j <= 5; j++)
      for (const c of creneaux) all[`${j}_${c.id}`] = true;
    setDispo(all); setSaved(false);
  }

  function toutDecocher() { setDispo({}); setSaved(false); }

  async function sauvegarder() {
    setSaving(true);
    const dispos = [];
    for (let jour = 1; jour <= 5; jour++) {
      for (const c of creneaux) {
        if (dispo[`${jour}_${c.id}`]) dispos.push({ jour, creneau_id: c.id, disponible: 1 });
      }
    }
    await _fetch(`/api/prerequis/disponibilites/${profId}`, {
      method: 'PUT', body: JSON.stringify({ quadrimestre, dispos }),
    });
    setSaving(false); setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  return (
    <div className="space-y-3">
      {/* Sélecteur Q1/Q2 */}
      <div className="flex items-center gap-3">
        {['Q1', 'Q2'].map(q => (
          <button key={q} onClick={() => setQ(q)}
            className={`px-4 py-1.5 text-sm rounded-full font-medium transition
              ${quadrimestre === q ? 'bg-iip-mauve text-white' : 'border border-gray-300 text-gray-600 hover:border-iip-mauve'}`}>
            {q}
          </button>
        ))}
        <div className="flex gap-2 ml-auto">
          <button onClick={toutCocher} className="text-xs text-gray-400 hover:text-iip-gold">Tout cocher</button>
          <button onClick={toutDecocher} className="text-xs text-gray-400 hover:text-red-500">Tout décocher</button>
        </div>
      </div>

      {/* Grille jour × créneau */}
      <div className="overflow-x-auto">
        <table className="text-xs border-collapse w-full">
          <thead>
            <tr>
              <th className="text-left px-2 py-1.5 text-gray-400 font-normal w-32">Créneau</th>
              {JOURS.map(j => (
                <th key={j} className="px-3 py-1.5 text-center text-gray-600 font-medium">{j}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {creneaux.map(c => (
              <tr key={c.id} className="hover:bg-gray-50">
                <td className="px-2 py-2 text-gray-500 font-mono text-[10px]">
                  {c.heure_debut}–{c.heure_fin}
                  <span className="ml-1 text-gray-400">{c.label}</span>
                </td>
                {[1,2,3,4,5].map(jour => {
                  const key = `${jour}_${c.id}`;
                  const actif = !!dispo[key];
                  return (
                    <td key={jour} className="px-3 py-2 text-center">
                      <button onClick={() => toggle(jour, c.id)}
                        className={`w-8 h-8 rounded-lg border-2 transition font-semibold
                          ${actif
                            ? 'bg-iip-gold/20 border-iip-gold text-iip-gold'
                            : 'bg-white border-gray-200 text-gray-200 hover:border-gray-400'}`}>
                        {actif ? '✓' : '·'}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex items-center gap-3">
        <button onClick={sauvegarder} disabled={saving}
          className="bg-iip-mauve text-white text-xs px-4 py-1.5 rounded hover:opacity-90 disabled:opacity-50">
          {saving ? 'Sauvegarde…' : `Enregistrer les dispos ${quadrimestre}`}
        </button>
        {saved && <span className="text-xs text-green-500">✓ Sauvegardé</span>}
      </div>
    </div>
  );
}

export default function ProfFicheModal({ prof, onClose, onSaved }) {
  const isNew = !prof?.id;

  // Champs simples (colonne professeur)
  const [form, setForm] = useState({
    // Identité
    nom: '', prenom: '', sexe: '', niss: '', nationalite: '',
    date_naissance: '', lieu_naissance_ville: '', lieu_naissance_pays: '', photo: '',
    // Coordonnées
    adresse_rue: '', code_postal: '', commune: '',
    adresse_mail: '', mail_prive: '', tel_gsm: '',
    iban: '', bic: '', compte_titulaire: '',
    // Administratif IIP
    statut: '', capaes: '', anciennete_25_26_po: 0, report_anc_po: 0,
    matricule: '', statut_ea12: '', statut_nomination: 'temporaire', statut_helb: '',
    // Situation fiscale
    etat_civil: '', handicap: 'non',
    conjoint_nom: '', conjoint_prenom: '', conjoint_handicap: 'non',
    conjoint_alloc_foyer: 'non', conjoint_revenus: 'pro',
    // CE 883/2004
    ce883_actif: 'non', ce883_date_debut: '', ce883_caisse: '', ce883_num_inscription: '',
  });

  // Listes dynamiques
  const [titres, setTitres] = useState([]);     // {date_obtention, intitule, delivre_par}
  const [charges, setCharges] = useState([]);   // {categorie, date_naissance, handicap}
  const [anciennete, setAnciennete] = useState(null); // {po, cours[], annee} calculé par le backend
  const [reportsCours, setReportsCours] = useState({}); // {cours_nom: jours} reports saisis

  const [saving, setSaving] = useState(false);
  const [genPdf, setGenPdf] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [open, setOpen] = useState({ identite: true }); // sections ouvertes
  const [creneaux, setCreneaux]         = useState([]);
  const [dispoQ1, setDispoQ1]           = useState({}); // { 'jour_creneauId': bool }
  const [dispoQ2, setDispoQ2]           = useState({});
  const [dispoLoaded, setDispoLoaded]   = useState(false);
  // Missions & coordinations (personnel d'établissement)
  const [adminFonction, setAdminFonction] = useState('');     // '' = aucune fonction admin
  const [adminPortee, setAdminPortee]     = useState('etablissement'); // 'etablissement' | 'section'
  const [adminSections, setAdminSections] = useState([]);      // sections coordonnées
  const [sectionsDispo, setSectionsDispo] = useState([]);      // toutes les sections
  const [savingAdmin, setSavingAdmin]     = useState(false);
  const [savedAdmin, setSavedAdmin]       = useState(false);

  function toggle(k) { setOpen(o => ({ ...o, [k]: !o[k] })); }
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  function toggleAdminSection(code) {
    setAdminSections(arr => arr.includes(code) ? arr.filter(c => c !== code) : [...arr, code]);
  }
  async function saveAdmin() {
    if (isNew) { alert('Enregistrez d\'abord la fiche du membre.'); return; }
    setSavingAdmin(true); setSavedAdmin(false);
    try {
      await api.updateProfAdmin(prof.id, {
        fonction: adminFonction || null,
        portee: adminPortee,
        sections: adminSections,
      });
      setSavedAdmin(true);
      setTimeout(() => setSavedAdmin(false), 2500);
    } catch (e) {
      alert('Erreur lors de l\'enregistrement : ' + e.message);
    } finally {
      setSavingAdmin(false);
    }
  }

  // ── Import optionnel depuis la carte eID belge ──
  const eidTimer = useRef(null);
  const [eidState, setEidState] = useState('idle'); // idle|checking|waiting|reading|done|error
  const [eidMsg, setEidMsg] = useState('');
  const eidBusy = eidState === 'checking' || eidState === 'waiting' || eidState === 'reading';

  function stopEid() { if (eidTimer.current) { clearInterval(eidTimer.current); eidTimer.current = null; } }
  useEffect(() => () => stopEid(), []); // nettoyage au démontage

  function cancelEid() { stopEid(); setEidState('idle'); setEidMsg(''); }

  async function importerEid() {
    stopEid();
    setEidState('checking'); setEidMsg('Connexion au lecteur eID…');

    const st = await eidStatus();
    if (st === null) {
      setEidState('error');
      setEidMsg("Service eID non joignable. Lancez l'app « eID Reader » ; au 1er usage, approuvez son certificat (menu tray « Approuver le certificat »), puis réessayez.");
      return;
    }
    const code = st.state || st.code || (st.ok ? 'READY' : 'UNKNOWN');
    if (code === 'NO_READER') {
      setEidState('error');
      setEidMsg('Aucun lecteur de carte détecté. Branchez le lecteur eID, puis réessayez.');
      return;
    }

    setEidState('waiting'); setEidMsg('Insérez votre carte eID dans le lecteur…');

    let attempts = 0;
    const tryRead = async () => {
      attempts++;
      const res = await eidReadAll();
      if (res.ok) {
        const mapped = eidToProf(res.data);
        setForm(f => ({ ...f, ...mapped }));
        setOpen(o => ({ ...o, identite: true, coord: true }));
        const id = res.data.identity || {};
        setEidState('done');
        setEidMsg(`Carte lue : ${[id.firstName, id.lastName].filter(Boolean).join(' ')} — ${eidChamps(mapped).length} champ(s) pré-rempli(s). Vérifiez avant d'enregistrer.`);
        return true;
      }
      if (res.code === 'UNREACHABLE') {
        setEidState('error');
        setEidMsg("Service eID injoignable : app fermée, certificat non approuvé, ou origine non autorisée (CORS). Vérifiez que « eID Reader » tourne et que son certificat est approuvé.");
        return true;
      }
      if (res.code === 'NO_CARD') { setEidState('waiting'); setEidMsg('Insérez votre carte eID dans le lecteur…'); }
      else { setEidState('reading'); setEidMsg('Lecture de la carte en cours…'); } // READING / READ_ERROR → on réessaie
      if (attempts >= 20) { // ~30 s
        setEidState('error');
        setEidMsg("Aucune carte lisible après 30 s. Vérifiez l'insertion de la carte, puis réessayez.");
        return true;
      }
      return false;
    };

    const done = await tryRead();
    if (!done) {
      eidTimer.current = setInterval(async () => { if (await tryRead()) stopEid(); }, 1500);
    }
  }

  // Charger les données complètes du prof (avec titres + charges)
  useEffect(() => {
    if (isNew) return;
    api.professeur(prof.id).then(p => {
      setForm(f => {
        const next = { ...f };
        Object.keys(f).forEach(k => { if (p[k] !== undefined && p[k] !== null) next[k] = p[k]; });
        if (!next.handicap) next.handicap = 'non';
        if (!next.conjoint_handicap) next.conjoint_handicap = 'non';
        if (!next.conjoint_alloc_foyer) next.conjoint_alloc_foyer = 'non';
        if (!next.conjoint_revenus) next.conjoint_revenus = 'pro';
        if (!next.ce883_actif) next.ce883_actif = 'non';
        return next;
      });
      setTitres((p.titres || []).map(t => ({
        date_obtention: t.date_obtention || '', intitule: t.intitule || '', delivre_par: t.delivre_par || ''
      })));
      setCharges((p.charges || []).map(c => ({
        categorie: c.categorie || 'enfant', date_naissance: c.date_naissance || '', handicap: c.handicap || 'non'
      })));
      if (p.anciennete) {
        setAnciennete(p.anciennete);
        const rc = {};
        (p.anciennete.cours || []).forEach(c => { rc[c.cours_nom] = c.report; });
        setReportsCours(rc);
      }
      if (p.admin) {
        setAdminFonction(p.admin.fonction || '');
        setAdminPortee(p.admin.portee || 'etablissement');
        setAdminSections(Array.isArray(p.admin.sections) ? p.admin.sections : []);
      } else {
        setAdminFonction('');
        setAdminPortee('etablissement');
        setAdminSections([]);
      }
    }).catch(e => alert('Erreur de chargement : ' + e.message))
      .finally(() => setLoading(false));
  }, [prof, isNew]);

  // ── Disponibilités ──
  useEffect(() => {
    _fetch('/api/prerequis/creneaux').then(d => setCreneaux(Array.isArray(d) ? d : []));
    api.sections().then(d => setSectionsDispo(Array.isArray(d) ? d : [])).catch(() => {});
    if (prof?.id && !isNew) {
      _fetch(`/api/prerequis/disponibilites/${prof.id}`).then(rows => {
        if (!Array.isArray(rows)) return;
        const q1 = {}, q2 = {};
        for (const r of rows) {
          const key = `${r.jour}_${r.creneau_id}`;
          if (r.quadrimestre === 'Q1') q1[key] = !!r.disponible;
          if (r.quadrimestre === 'Q2') q2[key] = !!r.disponible;
        }
        setDispoQ1(q1); setDispoQ2(q2); setDispoLoaded(true);
      });
    }
  }, [prof?.id, isNew]);

  // ── Titres ──
  function addTitre() { setTitres(t => [...t, { date_obtention: '', intitule: '', delivre_par: '' }]); }
  function setTitre(i, k, v) { setTitres(t => t.map((x, j) => j === i ? { ...x, [k]: v } : x)); }
  function delTitre(i) { setTitres(t => t.filter((_, j) => j !== i)); }

  // ── Charges ──
  function addCharge(cat) { setCharges(c => [...c, { categorie: cat, date_naissance: '', handicap: 'non' }]); }
  function setCharge(i, k, v) { setCharges(c => c.map((x, j) => j === i ? { ...x, [k]: v } : x)); }
  function delCharge(i) { setCharges(c => c.filter((_, j) => j !== i)); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nom.trim() || !form.prenom.trim()) return alert('Nom et prénom sont obligatoires');
    setSaving(true);
    try {
      let id = prof?.id;
      if (isNew) {
        const r = await api.createProfesseur(form);
        id = r.id;
        // Puis appliquer les champs étendus via PATCH
        await api.updateProfesseur(id, form);
      } else {
        await api.updateProfesseur(id, form);
      }
      // Sauver titres + charges
      await api.saveProfTitres(id, titres);
      await api.saveProfCharges(id, charges);
      // Sauver les reports d'ancienneté par cours (CC uniquement)
      if (form.statut === 'CC') {
        const reports = Object.entries(reportsCours).map(([cours_nom, jours]) => ({ cours_nom, jours }));
        await api.saveProfAncienneteCours(id, reports);
      }
      onSaved();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  async function genererFichePdf() {
    setGenPdf(true);
    try {
      const fn = `Fiche_signaletique_${form.nom || ''}_${form.prenom || ''}.pdf`.replace(/\s+/g, '_');
      await api.ficheDocumentPdf(prof.id, fn);
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setGenPdf(false); }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40">
        <div className="bg-white rounded-xl shadow-2xl px-8 py-6 text-gray-400">Chargement…</div>
      </div>
    );
  }

  const charByCat = (cat) => charges.map((c, i) => ({ c, i })).filter(x => x.c.categorie === cat);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border-t-4 border-iip-gold overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-title text-lg text-iip-gold">
            {isNew ? 'Nouveau membre du personnel' : `Fiche — ${prof.nom_prenom || prof.nom + ' ' + prof.prenom}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-5 space-y-3 overflow-auto">

          {/* Import optionnel depuis la carte eID belge */}
          <div className="border border-iip-gold/30 bg-iip-gold/5 rounded-lg p-3 flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-iip-gold flex items-center gap-1.5">
                <IconId size={15}/> Pré-remplir depuis la carte eID
                <span className="text-[10px] font-normal text-gray-400 uppercase tracking-wide">optionnel</span>
              </div>
              <p className="text-xs text-gray-500 mt-0.5">
                Lit l'identité et l'adresse via l'app « eID Reader ». Les champs restent modifiables et rien n'est enregistré tant que vous ne validez pas.
              </p>
              {eidState !== 'idle' && (
                <p className={`text-xs mt-1.5 ${eidState === 'error' ? 'text-red-600' : eidState === 'done' ? 'text-green-700' : 'text-gray-600'}`}>
                  {eidBusy && <span className="inline-block animate-spin mr-1">⏳</span>}
                  {eidMsg}
                  {eidBusy && (
                    <button type="button" onClick={cancelEid} className="ml-2 underline hover:text-gray-800">Annuler</button>
                  )}
                </p>
              )}
            </div>
            <button type="button" onClick={importerEid} disabled={eidBusy}
              className="flex-shrink-0 bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-4 py-2 rounded font-medium">
              {eidBusy ? 'Lecture…' : 'Lire la carte'}
            </button>
          </div>

          {/* 1. Identité civile */}
          <Section titre="1 · Identité civile" ouvert={open.identite} onToggle={() => toggle('identite')}>
            {form.photo && (
              <div className="flex items-center gap-3">
                <img src={form.photo} alt="Photo d'identité"
                  className="w-20 h-24 object-cover rounded border border-gray-200 flex-shrink-0" />
                <div className="text-xs text-gray-500">
                  Photo issue de la carte eID.
                  <button type="button" onClick={() => set('photo', '')}
                    className="block mt-1 text-red-500 hover:text-red-700 underline">Retirer la photo</button>
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Nom *" value={form.nom} onChange={v => set('nom', v)} />
              <TextField label="Prénom *" value={form.prenom} onChange={v => set('prenom', v)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <SelectField label="Sexe" value={form.sexe} onChange={v => set('sexe', v)}
                options={[['', '—'], ['F', 'F'], ['M', 'M']]} />
              <TextField label="Date de naissance" type="date" value={form.date_naissance} onChange={v => set('date_naissance', v)} />
              <TextField label="Nationalité" value={form.nationalite} onChange={v => set('nationalite', v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="NISS / NISS bis" placeholder="00.00.00-000.00" value={form.niss} onChange={v => set('niss', v)} />
              <TextField label="Matricule enseignant" placeholder="11 chiffres" value={form.matricule} onChange={v => set('matricule', v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Lieu de naissance — ville" value={form.lieu_naissance_ville} onChange={v => set('lieu_naissance_ville', v)} />
              <TextField label="Lieu de naissance — pays" value={form.lieu_naissance_pays} onChange={v => set('lieu_naissance_pays', v)} />
            </div>
          </Section>

          {/* 2. Coordonnées */}
          <Section titre="2 · Coordonnées & compte bancaire" ouvert={open.coord} onToggle={() => toggle('coord')}>
            <TextField label="Adresse (rue + n°)" value={form.adresse_rue} onChange={v => set('adresse_rue', v)} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Code postal" value={form.code_postal} onChange={v => set('code_postal', v)} />
              <TextField label="Localité" value={form.commune} onChange={v => set('commune', v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="E-mail" type="email" value={form.adresse_mail} onChange={v => set('adresse_mail', v)} />
              <TextField label="Tél. / GSM" value={form.tel_gsm} onChange={v => set('tel_gsm', v)} />
            </div>
            <TextField label="E-mail privé" type="email" value={form.mail_prive} onChange={v => set('mail_prive', v)} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="N° compte IBAN" placeholder="BE00 0000 0000 0000" value={form.iban} onChange={v => set('iban', v)} />
              <TextField label="BIC (si compte étranger)" value={form.bic} onChange={v => set('bic', v)} />
            </div>
            <TextField label="Compte au nom de" placeholder="si différent du MDP" value={form.compte_titulaire} onChange={v => set('compte_titulaire', v)} />
          </Section>

          {/* 3. Titres de capacité */}
          <Section titre="3 · Titres de capacité" sous={`${titres.length} titre(s)`}
            ouvert={open.titres} onToggle={() => toggle('titres')}>
            <p className="text-xs text-gray-500">Diplômes, brevets, certificats, attestations, reconnaissance d'expérience utile…</p>
            {titres.map((t, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end border-b border-gray-100 pb-2">
                <div className="col-span-3">
                  <TextField label="Date" type="date" value={t.date_obtention} onChange={v => setTitre(i, 'date_obtention', v)} />
                </div>
                <div className="col-span-5">
                  <TextField label="Intitulé — spécificité — niveau" value={t.intitule} onChange={v => setTitre(i, 'intitule', v)} />
                </div>
                <div className="col-span-3">
                  <TextField label="Délivré par" value={t.delivre_par} onChange={v => setTitre(i, 'delivre_par', v)} />
                </div>
                <div className="col-span-1 text-right">
                  <button type="button" onClick={() => delTitre(i)} className="text-red-400 hover:text-red-600 inline-flex" title="Retirer"><IconTrash size={14}/></button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addTitre} className="text-iip-gold hover:text-iip-amber text-sm font-medium">＋ Ajouter un titre</button>
          </Section>

          {/* 4. Situation fiscale */}
          <Section titre="4 · Situation fiscale" ouvert={open.fiscal} onToggle={() => toggle('fiscal')}>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="État civil" value={form.etat_civil} onChange={v => set('etat_civil', v)} options={ETAT_CIVIL} />
              <OuiNon label="Personne porteuse d'un handicap" value={form.handicap} onChange={v => set('handicap', v)} />
            </div>
            {['marie', 'cohab_legal'].includes(form.etat_civil) && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-3 border border-gray-100">
                <div className="text-xs font-semibold text-gray-600">Situation du conjoint / cohabitant légal</div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Nom" value={form.conjoint_nom} onChange={v => set('conjoint_nom', v)} />
                  <TextField label="Prénom" value={form.conjoint_prenom} onChange={v => set('conjoint_prenom', v)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <OuiNon label="Conjoint handicapé" value={form.conjoint_handicap} onChange={v => set('conjoint_handicap', v)} />
                  <OuiNon label="Bénéficiaire allocation de foyer" value={form.conjoint_alloc_foyer} onChange={v => set('conjoint_alloc_foyer', v)} />
                </div>
                <SelectField label="Revenus du conjoint" value={form.conjoint_revenus} onChange={v => set('conjoint_revenus', v)} options={REVENUS_CONJOINT} />
              </div>
            )}
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠️ Marié(e)/cohabitant(e) légal(e) : joindre la déclaration de précompte professionnel,
              sans laquelle les enfants ne seront pas renseignés à charge.
            </p>
          </Section>

          {/* 5. Personnes à charge */}
          <Section titre="5 · Personnes fiscalement à charge" sous={`${charges.length} personne(s)`}
            ouvert={open.charges} onToggle={() => toggle('charges')}>
            {[
              ['enfant', 'Enfant(s) à charge'],
              ['autre_65', 'Personne(s) de +65 ans à charge'],
              ['autre', 'Autre(s) personne(s) à charge'],
            ].map(([cat, titre]) => (
              <div key={cat} className="space-y-2">
                <div className="text-xs font-semibold text-gray-600">{titre}</div>
                {charByCat(cat).map(({ c, i }) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <TextField label="Date de naissance" type="date" value={c.date_naissance} onChange={v => setCharge(i, 'date_naissance', v)} />
                    </div>
                    <div className="col-span-5">
                      <OuiNon label="Handicap" value={c.handicap} onChange={v => setCharge(i, 'handicap', v)} />
                    </div>
                    <div className="col-span-2 text-right">
                      <button type="button" onClick={() => delCharge(i)} className="text-red-400 hover:text-red-600 inline-flex" title="Retirer"><IconTrash size={14}/></button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => addCharge(cat)} className="text-iip-gold hover:text-iip-amber text-xs font-medium">＋ Ajouter</button>
              </div>
            ))}
          </Section>

          {/* 6. Données internes IIP */}
          <Section titre="6 · Données internes IIP" ouvert={open.iip} onToggle={() => toggle('iip')}>
            <div className="grid grid-cols-3 gap-3">
              <SelectField label="Statut" value={form.statut} onChange={v => set('statut', v)}
                options={[['', '—'], ['CC', 'CC — Chargé de cours'], ['EXP', 'EXP — Expert']]} />
              <SelectField label="CAPAES" value={form.capaes} onChange={v => set('capaes', v)}
                options={[['', '—'], ['x', 'Oui']]} />
              <SelectField label="Statut EA12" value={form.statut_ea12} onChange={v => set('statut_ea12', v)}
                options={[['', '—'], ['T', 'T'], ['TPr', 'TPr'], ['St', 'St'], ['D', 'D'], ['ACS', 'ACS'], ['APE', 'APE'], ['PTP', 'PTP']]} />
            </div>
          </Section>

          {/* 6bis. Ancienneté (CC uniquement) */}
          {form.statut === 'CC' && (
            <Section titre="6 bis · Ancienneté" sous={anciennete ? `PO : ${anciennete.po.total} j` : ''}
              ouvert={open.anciennete} onToggle={() => toggle('anciennete')}>
              <p className="text-xs text-gray-500">
                L'ancienneté = report historique (saisi ici) + acquis de l'année courante (calculé
                automatiquement selon le décret du 01/02/1993 : 360 j si ≥ 50 % d'une charge, 180 j si ≥ 40 périodes).
              </p>

              {/* Ancienneté PO */}
              <div className="bg-iip-gold/5 rounded-lg p-3 space-y-2 border border-iip-gold/20">
                <div className="text-xs font-semibold text-iip-gold">Ancienneté Pouvoir Organisateur (toutes périodes)</div>
                <div className="grid grid-cols-3 gap-3 items-end">
                  <Labelled label="Report historique (jours)">
                    <input type="number" min="0" value={form.report_anc_po}
                      onChange={e => set('report_anc_po', Number(e.target.value))} className={FIELD_CLS} />
                  </Labelled>
                  <div className="text-sm">
                    <div className="text-xs text-gray-500">Acquis {anciennete?.annee || 'cette année'}</div>
                    <div className="font-semibold text-gray-700">+ {anciennete?.po.acquis_annee ?? 0} j</div>
                  </div>
                  <div className="text-sm">
                    <div className="text-xs text-gray-500">Total à jour</div>
                    <div className="font-bold text-iip-gold text-lg">
                      {(Number(form.report_anc_po) || 0) + (anciennete?.po.acquis_annee ?? 0)} j
                    </div>
                  </div>
                </div>
              </div>

              {/* Ancienneté par cours */}
              <div className="space-y-2">
                <div className="text-xs font-semibold text-gray-600">Ancienneté par cours (limitée au nom du cours)</div>
                {(anciennete?.cours || []).length === 0 && (
                  <p className="text-xs text-gray-400">Aucun cours attribué cette année.</p>
                )}
                {(anciennete?.cours || []).map((c, i) => {
                  const report = reportsCours[c.cours_nom] ?? 0;
                  return (
                    <div key={i} className="grid grid-cols-12 gap-2 items-end border-b border-gray-100 pb-2">
                      <div className="col-span-5">
                        <div className="text-xs text-gray-500 mb-0.5">Cours</div>
                        <div className="text-sm text-gray-800 truncate" title={c.cours_nom}>{c.cours_nom}</div>
                      </div>
                      <div className="col-span-3">
                        <Labelled label="Report (jours)">
                          <input type="number" min="0" value={report}
                            onChange={e => setReportsCours(rc => ({ ...rc, [c.cours_nom]: Number(e.target.value) }))}
                            className={FIELD_CLS} />
                        </Labelled>
                      </div>
                      <div className="col-span-2 text-sm">
                        <div className="text-xs text-gray-500">Acquis</div>
                        <div className="font-semibold text-gray-700">+ {c.acquis_annee} j</div>
                      </div>
                      <div className="col-span-2 text-sm">
                        <div className="text-xs text-gray-500">Total</div>
                        <div className="font-bold text-iip-gold">{(Number(report) || 0) + c.acquis_annee} j</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Section>
          )}

          {/* 6 ter. Missions & coordinations */}
          <Section titre="6 ter · Missions & coordinations"
            sous={adminFonction ? (adminFonction + (adminSections.length ? ` · ${adminSections.length} section(s)` : ' · toutes sections')) : 'Aucune fonction'}
            ouvert={open.missions} onToggle={() => toggle('missions')}>
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                La fonction administrative et les sections coordonnées déterminent l'apparition de cette personne
                dans les procédures (recours, fraude). Sans section cochée, elle apparaît pour toutes les sections ;
                avec des sections, elle n'apparaît que pour celles-ci.
              </p>

              <div>
                <label className="block text-xs font-semibold text-gray-600 mb-1">Fonction dans l'établissement</label>
                <select value={adminFonction} onChange={e => setAdminFonction(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-iip-gold">
                  <option value="">— Aucune —</option>
                  <option value="Directeur">Directeur</option>
                  <option value="Directeur adjoint">Directeur adjoint</option>
                  <option value="Secrétaire">Secrétaire</option>
                  <option value="Coordinateur de cursus">Coordinateur de cursus</option>
                  <option value="Coordinateur des stages">Coordinateur des stages</option>
                  <option value="Coordinateur pédagogique">Coordinateur pédagogique</option>
                  <option value="Coordinateur de TFE">Coordinateur de TFE (épreuve intégrée)</option>
                  <option value="Conseiller qualité">Conseiller qualité</option>
                </select>
              </div>

              {adminFonction && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">Portée de la fonction</label>
                  <div className="flex flex-col gap-1.5">
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="portee" checked={adminPortee === 'etablissement'}
                        onChange={() => setAdminPortee('etablissement')} />
                      <span>Tout l'établissement <span className="text-gray-400">(apparaît dans toutes les procédures — direction, secrétariat…)</span></span>
                    </label>
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer">
                      <input type="radio" name="portee" checked={adminPortee === 'section'}
                        onChange={() => setAdminPortee('section')} />
                      <span>Sections spécifiques <span className="text-gray-400">(apparaît uniquement pour les sections cochées — coordination…)</span></span>
                    </label>
                  </div>
                </div>
              )}

              {adminFonction && adminPortee === 'section' && (
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1">
                    Sections concernées <span className="font-normal text-gray-400">(coche les sections où cette personne intervient)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {sectionsDispo.map(s => {
                      const code = s.code || s.section || s;
                      const actif = adminSections.includes(code);
                      return (
                        <button key={code} type="button" onClick={() => toggleAdminSection(code)}
                          className={`px-2.5 py-1 rounded text-xs font-medium border transition ${actif
                            ? 'bg-iip-mauve text-white border-iip-mauve'
                            : 'bg-white text-gray-600 border-gray-300 hover:border-iip-mauve'}`}>
                          {code}
                        </button>
                      );
                    })}
                    {sectionsDispo.length === 0 && <span className="text-xs text-gray-400">Aucune section disponible</span>}
                  </div>
                  {adminSections.length === 0 && (
                    <p className="text-xs text-amber-600 mt-1">⚠ Aucune section cochée : cette personne n'apparaîtra dans aucune procédure.</p>
                  )}
                </div>
              )}

              <div className="flex items-center gap-3">
                <button type="button" onClick={saveAdmin} disabled={savingAdmin}
                  className="bg-iip-mauve text-white px-4 py-1.5 rounded-lg text-sm font-medium disabled:opacity-50">
                  {savingAdmin ? 'Enregistrement…' : 'Enregistrer la fonction'}
                </button>
                {savedAdmin && <span className="text-green-600 text-sm">✓ Enregistré</span>}
              </div>
            </div>
          </Section>

          {/* 7. Règlement CE 883/2004 */}
          <Section titre="7 · Règlement CE 883/2004" sous="résident d'un autre État UE"
            ouvert={open.ce883} onToggle={() => toggle('ce883')}>
            <OuiNon label="Concerné (réside dans un autre État UE + activité rémunérée)" value={form.ce883_actif} onChange={v => set('ce883_actif', v)} />
            {form.ce883_actif === 'oui' && (
              <>
                <TextField label="Date de début de l'activité dans le pays de résidence" type="date" value={form.ce883_date_debut} onChange={v => set('ce883_date_debut', v)} />
                <TextField label="Dénomination + adresse de la caisse de sécurité sociale" value={form.ce883_caisse} onChange={v => set('ce883_caisse', v)} />
                <TextField label="Numéro d'inscription" value={form.ce883_num_inscription} onChange={v => set('ce883_num_inscription', v)} />
              </>
            )}
          </Section>

          {/* ── Section Disponibilités ── */}
          {!isNew && (
            <Section titre="8 · Disponibilités horaires" sous="Créneaux disponibles par quadrimestre"
              ouvert={open.dispos} onToggle={() => toggle('dispos')}>
              <DispoGrid
                creneaux={creneaux}
                dispoQ1={dispoQ1} setDispoQ1={setDispoQ1}
                dispoQ2={dispoQ2} setDispoQ2={setDispoQ2}
                profId={prof?.id}
              />
            </Section>
          )}

          {/* ── Section Engagement à titre définitif ── */}
          {!isNew && (
            <Section titre="9 · Engagement à titre définitif" sous="Nominations (code FWB) & remise au travail"
              ouvert={open.nomination} onToggle={() => toggle('nomination')}>
              <div className="mb-3 flex gap-4 flex-wrap">
                <label className="block">
                  <span className="text-[11px] text-gray-500">Statut de nomination</span>
                  <select value={form.statut_nomination || 'temporaire'} onChange={v => set('statut_nomination', v.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm max-w-xs">
                    <option value="temporaire">Temporaire</option>
                    <option value="temporaire_prioritaire">Temporaire prioritaire</option>
                    <option value="definitif">Engagé à titre définitif</option>
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Statut HELB (contrat HE)</span>
                  <select value={form.statut_helb || ''} onChange={v => set('statut_helb', v.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm max-w-xs">
                    <option value="">— aucun —</option>
                    <option value="MA">Maître-Assistant (MA)</option>
                    <option value="MFP">Maître de Formation Pratique (MFP)</option>
                    <option value="PI">Praticien (PI)</option>
                    <option value="COORD">Coordination</option>
                  </select>
                </label>
              </div>
              <NominationsPanel profId={prof?.id} />
            </Section>
          )}

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 sticky bottom-0 bg-white">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            {/* Bouton fiche PDF masqué en prod (nécessite LibreOffice — à activer quand finalisé) */}
            {false && !isNew && (
              <button type="button" onClick={genererFichePdf} disabled={saving || genPdf}
                className="bg-iip-mauve hover:opacity-90 disabled:opacity-40 text-white text-sm px-4 py-2 rounded font-medium">
                {genPdf ? 'Génération…' : <span className="inline-flex items-center gap-1.5"><IconFileText size={15}/>Générer la fiche (PDF)</span>}
              </button>
            )}
            <button type="submit" disabled={saving}
              className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
              {saving ? 'Sauvegarde…' : isNew ? 'Créer la fiche' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
