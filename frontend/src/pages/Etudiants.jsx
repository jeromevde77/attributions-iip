import { useEffect, useState, useMemo } from 'react';
import {
  IconSearch, IconUser, IconChevronRight, IconPlus, IconCheck,
  IconX, IconPrinter, IconAlertTriangle, IconClock, IconUpload,
} from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';

const RESULTATS = [
  { val: 'reussi',  label: 'Réussi',  cls: 'bg-emerald-100 text-emerald-800' },
  { val: 'ajourne', label: 'Ajourné', cls: 'bg-amber-100 text-amber-800' },
  { val: 'absent',  label: 'Absent',  cls: 'bg-red-100 text-red-800' },
];

// ── Fiche étudiant + PAE ──────────────────────────────────────────────────────
function FicheEtudiant({ id, annee, onClose }) {
  const [data, setData] = useState(null);
  const [pae, setPae] = useState(null);
  const [onglet, setOnglet] = useState('inscriptions');
  const anneePrecedente = useMemo(() => {
    if (!annee) return null;
    const [a1, a2] = annee.split('-').map(Number);
    return `${a1-1}-${a2-1}`;
  }, [annee]);

  async function charger() {
    const rep = await fetch(`/api/etudiants/${id}`, { headers: authHeaders() });
    if (rep.ok) setData(await rep.json());
  }
  async function chargerPAE() {
    const rep = await fetch(
      `/api/etudiants/${id}/pae?annee=${annee}&annee_precedente=${anneePrecedente}`,
      { headers: authHeaders() });
    if (rep.ok) setPae(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [id]);

  async function setResultat(inscId, resultat) {
    await fetch(`/api/etudiants/inscription/${inscId}`, {
      method: 'PATCH', headers: authHeaders(),
      body: JSON.stringify({ resultat }),
    });
    await charger();
  }

  if (!data) return <div className="p-6 text-slate-400 text-sm">Chargement…</div>;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-8">
        {/* En-tête */}
        <div className="bg-iip-blue rounded-t-2xl px-6 py-5 flex items-start justify-between">
          <div>
            <div className="text-white font-bold text-xl">{data.nom} {data.prenom}</div>
            <div className="text-blue-200 text-sm mt-0.5">{data.email_ecole} · {data.id_ecampus}</div>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white">
            <IconX size={22} />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex border-b border-slate-200 px-6">
          {[['inscriptions', `Parcours & résultats (${data.inscriptions?.length || 0})`],
            ['pae', `PAE ${annee}`]].map(([k, l]) => (
            <button key={k} onClick={() => { setOnglet(k); if (k==='pae' && !pae) chargerPAE(); }}
              className={`px-4 py-3 text-sm font-medium border-b-2 -mb-px ${onglet===k
                ? 'border-iip-turquoise text-iip-blue font-semibold'
                : 'border-transparent text-slate-500'}`}>
              {l}
            </button>
          ))}
        </div>

        <div className="p-6">
          {/* Inscriptions + résultats */}
          {onglet === 'inscriptions' && (
            <div>
              <p className="text-[12px] text-slate-500 mb-3">
                Tout le parcours, année par année. Les résultats déterminent les UE accessibles dans le PAE de l'année suivante.
              </p>
              {!data.inscriptions?.length ? (
                <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-xl">
                  Aucune inscription — importez le listing eCampus.
                </div>
              ) : (
                [...new Set(data.inscriptions.map(i => i.annee_scolaire))].map(a => (
                  <div key={a} className="mb-5">
                    <div className="text-[12px] font-bold text-iip-blue uppercase tracking-wide mb-2 pb-1 border-b border-slate-200">
                      {a}
                    </div>
                    <table className="w-full text-sm">
                      <tbody>
                        {data.inscriptions.filter(i => i.annee_scolaire === a).map(i => (
                          <tr key={i.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                            <td className="py-2">
                              <span className="font-medium text-iip-blue">{i.ue_num}</span>
                              <span className="text-slate-600 ml-1.5 text-[12.5px]">{i.ue_nom}</span>
                            </td>
                            <td className="py-2 text-[11px] text-slate-400 w-20">{i.section}</td>
                            <td className="py-2 w-32">
                              <select value={i.resultat || ''}
                                onChange={e => setResultat(i.id, e.target.value || null)}
                                className={`text-[11.5px] px-2 py-1 rounded-lg border border-slate-200 ${
                                  i.resultat === 'reussi' ? 'bg-emerald-50 text-emerald-800' :
                                  i.resultat === 'ajourne' ? 'bg-amber-50 text-amber-800' :
                                  i.resultat === 'absent' ? 'bg-red-50 text-red-800' : ''}`}>
                                <option value="">— non encodé</option>
                                {RESULTATS.map(r => <option key={r.val} value={r.val}>{r.label}</option>)}
                              </select>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))
              )}
            </div>
          )}

          {/* PAE */}
          {onglet === 'pae' && (
            <div>
              {!pae ? (
                <div className="text-center py-8 text-slate-400 text-sm">Chargement du PAE…</div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <div className="font-semibold text-iip-blue">Plan Annuel de l'Étudiant — {pae.annee}</div>
                      <div className="text-[12px] text-slate-500 mt-0.5">
                        {pae.accessibles} UE accessibles · basé sur les résultats {pae.annee_precedente}
                      </div>
                    </div>
                    <button onClick={() => window.print()}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm border border-slate-300 rounded-lg">
                      <IconPrinter size={14} /> Imprimer
                    </button>
                  </div>

                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-[10.5px] uppercase tracking-wide text-slate-400 border-b">
                        <th className="py-2 text-left">UE</th>
                        <th className="py-2 text-left w-20">Section</th>
                        <th className="py-2 text-left w-24">Prérequis</th>
                        <th className="py-2 text-left w-28">Statut</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pae.pae.map((u, i) => (
                        <tr key={i} className={`border-b border-slate-100 last:border-0 ${u.deja_reussie ? 'opacity-40' : ''}`}>
                          <td className="py-2">
                            <span className="font-medium text-iip-blue">{u.ue_num}</span>
                            <span className="text-slate-600 ml-1.5 text-[12.5px]">{u.ue_nom}</span>
                          </td>
                          <td className="py-2 text-[11px] text-slate-400">{u.section}</td>
                          <td className="py-2">
                            {u.prerequis.length === 0
                              ? <span className="text-[11px] text-slate-400">Aucun</span>
                              : u.prerequis_ok
                                ? <span className="flex items-center gap-1 text-[11px] text-emerald-700"><IconCheck size={12} /> OK</span>
                                : <span className="flex items-center gap-1 text-[11px] text-red-700"><IconAlertTriangle size={12} /> Manquants</span>}
                          </td>
                          <td className="py-2">
                            {u.deja_reussie
                              ? <span className="text-[11px] text-slate-400">Déjà réussie</span>
                              : u.accessible
                                ? <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1"><IconCheck size={12} /> Accessible</span>
                                : <span className="text-[11px] text-red-600 flex items-center gap-1"><IconClock size={12} /> Prérequis manquants</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <p className="text-[11px] text-slate-400 mt-4 border-t pt-3">
                    Le PAE est établi en accord avec l'étudiant et validé par la direction.
                    Il peut être modifié en cours d'année sur demande motivée.
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Page principale Étudiants ─────────────────────────────────────────────────
export default function Etudiants() {
  const annee = getAnnee();
  const [etudiants, setEtudiants] = useState([]);
  const [recherche, setRecherche] = useState('');
  const [section, setSection] = useState('');
  const [sections, setSections] = useState([]);
  const [selId, setSelId] = useState(null);
  const [chargement, setChargement] = useState(false);
  const [importing, setImporting] = useState(false);
  const [msgImport, setMsgImport] = useState(null);

  async function importerExcel(fichier) {
    if (!fichier || !annee) return;
    // Détecter l'année depuis le nom du fichier (ex. "20252026" → 2025-2026),
    // sinon proposer l'année précédant l'année active (le listing est celui de l'année écoulée)
    const m = fichier.name.match(/(20\d{2})[-_]?(20\d{2})/);
    let anneeDetectee;
    if (m) anneeDetectee = m[1] + '-' + m[2];
    else {
      const [a1, a2] = annee.split('-').map(Number);
      anneeDetectee = (a1-1) + '-' + (a2-1);
    }
    const anneeImport = window.prompt(
      'Année scolaire des inscriptions de ce fichier ?', anneeDetectee);
    if (!anneeImport || !/^20\d{2}-20\d{2}$/.test(anneeImport.trim())) {
      if (anneeImport !== null) alert('Format attendu : 2025-2026');
      return;
    }
    setImporting(true); setMsgImport(null);
    try {
      // Lecture côté client avec SheetJS — gère .xls et .xlsx
      const XLSX = await import('xlsx');
      const buffer = await fichier.arrayBuffer();
      const wb = XLSX.read(buffer, { type: 'array' });

      // 3e onglet ou celui qui contient 'Inscription'
      const wsName = wb.SheetNames[2] ||
                     wb.SheetNames.find(n => n.includes('Inscription')) ||
                     wb.SheetNames[0];
      if (!wsName) throw new Error('Onglet introuvable dans le fichier');
      const ws = wb.Sheets[wsName];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });

      if (!rows.length) throw new Error('Le fichier semble vide');
      if (!('Id_Etud' in rows[0]) || !('Code_UE' in rows[0])) {
        throw new Error('Colonnes Id_Etud ou Code_UE introuvables — vérifiez que c\'est le bon fichier eCampus');
      }

      // Dédupliquer les étudiants
      const etudiants = [];
      const vus = new Set();
      for (const r of rows) {
        if (vus.has(r.Id_Etud)) continue;
        vus.add(r.Id_Etud);
        etudiants.push({
          id_ecampus: String(r.Id_Etud||'').trim(),
          nom: String(r.NomEtud||'').trim(),
          prenom: String(r['PréEtud']||'').trim(),
          email_ecole: String(r.EmailEcole||'').trim(),
          email_perso: String(r['Email Perso']||'').trim(),
          date_naissance: String(r.StrDatNais||'').trim(),
          num_national: String(r['N°National']||'').trim(),
          gsm: String(r.GSMEtud||'').trim(),
          adresse: String(r['AdrN°Bte']||'').trim(),
          localite: String(r['Localité']||'').trim(),
          cp: String(r.CP||'').trim(),
          titre: String(r.TitreMrMme||'').trim(),
        });
      }

      const inscriptions = rows
        .filter(r => r.Id_Etud && r.Code_UE && !isNaN(Number(r.Code_UE)))
        .map(r => ({ id_ecampus: String(r.Id_Etud).trim(), ue_num: Number(r.Code_UE), groupe: String(r.COG||'').trim() }));

      // Envoyer au backend
      const rep = await fetch('/api/etudiants/import-excel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ annee: anneeImport.trim(), etudiants, inscriptions }),
      });
      const j = await rep.json();
      if (rep.ok) {
        setMsgImport({ type: 'ok', texte: `${j.etudiants} étudiants · ${j.inscriptions_creees} inscriptions importées pour ${j.annee}` });
        await charger();
      } else {
        setMsgImport({ type: 'err', texte: j.error || 'Erreur' });
      }
    } catch(e) { setMsgImport({ type: 'err', texte: e.message }); }
    finally { setImporting(false); }
  }

  async function charger() {
    if (!annee) return;
    setChargement(true);
    try {
      const params = new URLSearchParams();
      if (section) params.set('section', section);
      if (recherche) params.set('q', recherche);
      const rep = await fetch(`/api/etudiants?${params}`, { headers: authHeaders() });
      const j = await rep.json();
      if (rep.ok) setEtudiants(Array.isArray(j) ? j : []);
    } finally { setChargement(false); }
  }

  useEffect(() => {
    fetch('/api/referentiels/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); }).catch(() => {});
  }, []);

  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [annee, section]);

  const filtres = useMemo(() => {
    if (!recherche) return etudiants;
    const q = recherche.toLowerCase();
    return etudiants.filter(e =>
      e.nom?.toLowerCase().includes(q) || e.prenom?.toLowerCase().includes(q) ||
      e.id_ecampus?.toLowerCase().includes(q));
  }, [etudiants, recherche]);

  return (
    <div className="p-5 space-y-4 max-w-5xl">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue">Étudiants</h2>
          <p className="text-sm text-slate-500">{filtres.length} étudiant(s)</p>
        </div>
      </div>

      {msgImport && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${msgImport.type==='ok'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{msgImport.texte}</span>
          <button onClick={() => setMsgImport(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}
      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Nom, prénom ou identifiant…"
            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
        <label className={`flex items-center gap-2 px-3 py-2 text-sm border rounded-lg cursor-pointer
          ${importing ? 'opacity-50 pointer-events-none' : 'border-iip-turquoise text-iip-turquoise hover:bg-iip-turquoise/5'}`}>
          <IconUpload size={15} />
          {importing ? 'Import en cours…' : 'Importer depuis eCampus (.xls)'}
          <input type="file" accept=".xls,.xlsx" className="hidden"
            onChange={e => e.target.files[0] && importerExcel(e.target.files[0])} />
        </label>
        <select value={section} onChange={e => setSection(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle}</option>)}
        </select>
      </div>

      {!filtres.length ? (
        <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-xl text-slate-500 text-sm">
          {chargement ? 'Chargement…' : 'Aucun étudiant — importez les données depuis eCampus.'}
        </div>
      ) : (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[10.5px] uppercase tracking-wide text-slate-500">
                <th className="px-4 py-2.5 text-left">Étudiant</th>
                <th className="px-4 py-2.5 text-left">Email</th>
                <th className="px-4 py-2.5 text-left w-24">Sections</th>
                <th className="px-4 py-2.5 text-right w-16">UE</th>
                <th className="px-4 py-2.5 w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filtres.map(e => (
                <tr key={e.id} onClick={() => setSelId(e.id)}
                  className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60 cursor-pointer">
                  <td className="px-4 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-iip-blue/10 text-iip-blue flex items-center justify-center text-[11px] font-bold flex-none">
                        {(e.nom||'?')[0]}{(e.prenom||'?')[0]}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{e.nom} {e.prenom}</div>
                        <div className="text-[11px] text-slate-400">{e.id_ecampus}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-2.5 text-slate-500 text-[12.5px]">{e.email_ecole}</td>
                  <td className="px-4 py-2.5 text-[11.5px] text-slate-500">{e.sections}</td>
                  <td className="px-4 py-2.5 text-right font-medium text-iip-blue">{e.nb_ue}</td>
                  <td className="px-4 py-2.5 text-slate-300"><IconChevronRight size={16} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selId && (
        <FicheEtudiant id={selId} annee={annee} onClose={() => setSelId(null)} />
      )}
    </div>
  );
}
