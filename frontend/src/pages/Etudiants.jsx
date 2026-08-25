import { useEffect, useState, useMemo } from 'react';
import {
  IconSearch, IconUser, IconChevronRight, IconPlus, IconCheck,
  IconX, IconPrinter, IconAlertTriangle, IconClock,
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
    const rep = await fetch(`/api/etudiants/${id}?annee=${annee}`, { headers: authHeaders() });
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
          {[['inscriptions', `Inscriptions ${annee} (${data.inscriptions?.length || 0})`],
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
                Encodez les résultats — ils servent à calculer le PAE de l'année suivante.
              </p>
              {!data.inscriptions?.length ? (
                <div className="text-center py-8 text-slate-400 text-sm border-2 border-dashed rounded-xl">
                  Aucune inscription pour {annee}
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[10.5px] uppercase tracking-wide text-slate-400 border-b">
                      <th className="py-2 text-left">UE</th>
                      <th className="py-2 text-left w-20">Section</th>
                      <th className="py-2 text-left w-28">Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.inscriptions.map(i => (
                      <tr key={i.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                        <td className="py-2">
                          <span className="font-medium text-iip-blue">{i.ue_num}</span>
                          <span className="text-slate-600 ml-1.5 text-[12.5px]">{i.ue_nom}</span>
                        </td>
                        <td className="py-2 text-[11px] text-slate-400">{i.section}</td>
                        <td className="py-2">
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

  async function charger() {
    if (!annee) return;
    setChargement(true);
    try {
      const params = new URLSearchParams({ annee });
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
          <p className="text-sm text-slate-500">{filtres.length} étudiant(s) — {annee}</p>
        </div>
      </div>

      <div className="flex gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <IconSearch size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Nom, prénom ou identifiant…"
            className="w-full border border-slate-300 rounded-lg pl-9 pr-3 py-2 text-sm" />
        </div>
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
