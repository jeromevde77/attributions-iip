import { useEffect, useState } from 'react';
import { IconX, IconAlertTriangle, IconSearch } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Purge sélective des résultats.
 *
 * On choisit un périmètre — année, section, UE ou cours — et les étudiants
 * concernés, puis Lucie annonce ce qui sera touché avant toute suppression.
 * Rien n'est effacé sans que le compte ait été montré.
 */
export default function PurgeResultats({ anneeCourante, onClose, onPurge }) {
  const [perimetre, setPerimetre] = useState({ annees: [], ues: [], cours: [] });
  const [sections, setSections] = useState([]);

  const [annee, setAnnee] = useState(anneeCourante || '');
  const [section, setSection] = useState('');
  const [cible, setCible] = useState('section');      // section | ue | cours
  const [ueNum, setUeNum] = useState('');
  const [coursCode, setCoursCode] = useState('');
  const [portee, setPortee] = useState('resultats');  // resultats | inscriptions

  const [quiEtudiants, setQuiEtudiants] = useState('tous');   // tous | selection
  const [etudiants, setEtudiants] = useState([]);
  const [choisis, setChoisis] = useState(new Set());
  const [recherche, setRecherche] = useState('');

  const [simulation, setSimulation] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [fait, setFait] = useState(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setSections(l); }).catch(() => {});
  }, []);

  useEffect(() => {
    const qs = new URLSearchParams({ ...(section ? { section } : {}), ...(annee ? { annee } : {}) });
    fetch(`/api/etudiants/purge/perimetre?${qs}`, { headers: authHeaders() })
      .then(r => r.json()).then(j => { if (j) setPerimetre(j); }).catch(() => {});
    setSimulation(null);
  }, [section, annee]);

  useEffect(() => {
    if (quiEtudiants !== 'selection' || !annee) return;
    const qs = new URLSearchParams({ annee, ...(section ? { section } : {}), ...(cible === 'ue' && ueNum ? { ue_num: ueNum } : {}) });
    fetch(`/api/etudiants/purge/etudiants?${qs}`, { headers: authHeaders() })
      .then(r => r.json()).then(l => { if (Array.isArray(l)) setEtudiants(l); }).catch(() => {});
  }, [quiEtudiants, annee, section, cible, ueNum]);

  function corps(sim) {
    return {
      annee,
      section: section || null,
      ue_num: cible === 'ue' ? Number(ueNum) || null : null,
      cours_code: cible === 'cours' ? coursCode || null : null,
      etudiant_ids: quiEtudiants === 'selection' ? [...choisis] : null,
      portee,
      simulation: sim,
    };
  }

  async function simuler() {
    if (!annee) { setErreur('Choisissez une année.'); return; }
    if (cible === 'ue' && !ueNum) { setErreur('Choisissez une UE.'); return; }
    if (cible === 'cours' && !coursCode) { setErreur('Choisissez un cours.'); return; }
    if (quiEtudiants === 'selection' && !choisis.size) { setErreur('Choisissez au moins un étudiant.'); return; }
    setErreur(null); setEnCours(true);
    try {
      const rep = await fetch('/api/etudiants/purge', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(corps(true)),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error || 'Erreur'); return; }
      setSimulation(j);
    } finally { setEnCours(false); }
  }

  async function executer() {
    const c = simulation?.compte || {};
    const total = (c.resultats_cours || 0) + (c.notes_aa || 0) + (c.reports || 0)
                + (portee === 'inscriptions' ? (c.inscriptions || 0) : 0);
    if (!window.confirm(
      `Confirmer la purge ?\n\n${total} enregistrement(s) seront supprimés.\n` +
      (portee === 'inscriptions'
        ? "Les inscriptions elles-mêmes seront supprimées."
        : "Les inscriptions sont conservées, seuls leurs résultats sont vidés.") +
      `\n\nCette action est définitive.`)) return;

    setEnCours(true);
    try {
      const rep = await fetch('/api/etudiants/purge', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(corps(false)),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error || 'Erreur'); return; }
      setFait(j); setSimulation(null);
      onPurge && onPurge();
    } finally { setEnCours(false); }
  }

  const filtres = etudiants.filter(e => {
    if (!recherche) return true;
    const q = recherche.toLowerCase();
    return (e.nom || '').toLowerCase().includes(q)
        || (e.prenom || '').toLowerCase().includes(q)
        || (e.id_ecampus || '').toLowerCase().includes(q);
  });

  const coursDeLaSection = perimetre.cours.filter(
    co => cible !== 'cours' || !ueNum || co.ue_num === Number(ueNum));

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4 overflow-auto"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl mt-8">
        <div className="bg-iip-blue rounded-t-2xl px-5 py-4 flex items-start justify-between">
          <div>
            <div className="text-white font-bold text-[15px]">Vider des résultats</div>
            <div className="text-blue-200 text-[12px] mt-0.5">
              Purge ciblée — le périmètre est annoncé avant toute suppression
            </div>
          </div>
          <button onClick={onClose} className="text-blue-200 hover:text-white"><IconX size={19} /></button>
        </div>

        <div className="p-5 space-y-4">
          {erreur && (
            <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200 text-[12.5px] text-red-800">
              {erreur}
            </div>
          )}

          {fait ? (
            <>
              <div className="px-4 py-3 rounded-xl bg-emerald-50 border border-emerald-200 text-[13px] text-emerald-900">
                <div className="font-semibold mb-1">Purge effectuée</div>
                <ul className="text-[12px] space-y-0.5">
                  {Object.entries(fait.supprime || {}).map(([k, v]) => (
                    <li key={k}>{LIBELLES[k] || k} : {v}</li>
                  ))}
                </ul>
              </div>
              <div className="flex justify-end">
                <button onClick={onClose}
                  className="text-sm px-4 py-1.5 rounded-lg bg-iip-blue text-white font-semibold">Fermer</button>
              </div>
            </>
          ) : (
            <>
              {/* Périmètre */}
              <div className="grid grid-cols-2 gap-3">
                <label className="text-xs">
                  <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Année</span>
                  <select value={annee} onChange={e => setAnnee(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                    <option value="">—</option>
                    {perimetre.annees.map(a => <option key={a} value={a}>{a}</option>)}
                  </select>
                </label>
                <label className="text-xs">
                  <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Section</span>
                  <select value={section}
                    onChange={e => { setSection(e.target.value); setUeNum(''); setCoursCode(''); }}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                    <option value="">Toutes les sections</option>
                    {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
                  </select>
                </label>
              </div>

              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Étendue
                </div>
                <div className="flex gap-3 flex-wrap mb-2">
                  {[['section', "Toute la section"], ['ue', 'Une UE'], ['cours', 'Un cours']].map(([v, l]) => (
                    <label key={v} className="flex items-center gap-1.5 text-[12.5px]">
                      <input type="radio" checked={cible === v} onChange={() => setCible(v)} /> {l}
                    </label>
                  ))}
                </div>
                {cible === 'ue' && (
                  <select value={ueNum} onChange={e => setUeNum(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                    <option value="">Choisir une UE…</option>
                    {perimetre.ues.map(u => (
                      <option key={u.ue_num} value={u.ue_num}>{u.ue_num} — {u.ue_nom}</option>
                    ))}
                  </select>
                )}
                {cible === 'cours' && (
                  <select value={coursCode} onChange={e => setCoursCode(e.target.value)}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                    <option value="">Choisir un cours…</option>
                    {coursDeLaSection.map(co => (
                      <option key={co.cours_code} value={co.cours_code}>
                        {co.cours_code} — {co.cours_nom}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Étudiants */}
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Étudiants
                </div>
                <div className="flex gap-3 mb-2">
                  {[['tous', 'Tous'], ['selection', 'Une sélection']].map(([v, l]) => (
                    <label key={v} className="flex items-center gap-1.5 text-[12.5px]">
                      <input type="radio" checked={quiEtudiants === v} onChange={() => setQuiEtudiants(v)} /> {l}
                    </label>
                  ))}
                </div>
                {quiEtudiants === 'selection' && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <div className="flex items-center gap-2 px-2 py-1.5 bg-slate-50 border-b border-slate-200">
                      <IconSearch size={14} className="text-slate-400" />
                      <input value={recherche} onChange={e => setRecherche(e.target.value)}
                        placeholder="Nom, prénom ou matricule…"
                        className="flex-1 bg-transparent text-[12px] outline-none" />
                      <span className="text-[11px] text-slate-400">{choisis.size} sélectionné(s)</span>
                      <button onClick={() => setChoisis(new Set(filtres.map(e => e.id)))}
                        className="text-[11px] px-2 py-0.5 border border-slate-300 rounded-lg">Tout</button>
                      <button onClick={() => setChoisis(new Set())}
                        className="text-[11px] px-2 py-0.5 border border-slate-300 rounded-lg">Aucun</button>
                    </div>
                    <div className="max-h-48 overflow-y-auto divide-y divide-slate-100">
                      {!filtres.length ? (
                        <div className="px-3 py-4 text-[12px] text-slate-400 text-center">
                          Aucun étudiant pour ce périmètre.
                        </div>
                      ) : filtres.map(e => (
                        <label key={e.id} className="flex items-center gap-2 px-3 py-1.5 hover:bg-slate-50">
                          <input type="checkbox" checked={choisis.has(e.id)}
                            onChange={ev => setChoisis(s => {
                              const n = new Set(s);
                              ev.target.checked ? n.add(e.id) : n.delete(e.id);
                              return n;
                            })} />
                          <span className="text-[12px] text-slate-700 flex-1">{e.nom} {e.prenom}</span>
                          <span className="text-[10.5px] text-slate-400">{e.nb_ue} UE · {e.nb_resultats} résultat(s)</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Portée */}
              <div>
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">
                  Ce qui est supprimé
                </div>
                <div className="space-y-1.5">
                  <label className="flex items-start gap-2 text-[12.5px]">
                    <input type="radio" checked={portee === 'resultats'} onChange={() => setPortee('resultats')} className="mt-0.5" />
                    <span>
                      <b>Les résultats seulement</b>
                      <span className="block text-[11px] text-slate-500">
                        Notes d'acquis, résultats de cours et reports. Les inscriptions demeurent.
                      </span>
                    </span>
                  </label>
                  <label className="flex items-start gap-2 text-[12.5px]">
                    <input type="radio" checked={portee === 'inscriptions'} onChange={() => setPortee('inscriptions')}
                      className="mt-0.5" disabled={cible === 'cours'} />
                    <span className={cible === 'cours' ? 'opacity-40' : ''}>
                      <b>Les inscriptions aussi</b>
                      <span className="block text-[11px] text-slate-500">
                        {cible === 'cours'
                          ? "Indisponible : une inscription porte sur une UE, pas sur un cours."
                          : "Supprime les inscriptions et les valorisations de l'année."}
                      </span>
                    </span>
                  </label>
                </div>
              </div>

              {/* Simulation */}
              {simulation && (
                <div className="px-4 py-3 rounded-xl bg-amber-50 border border-amber-200">
                  <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-amber-900 mb-1.5">
                    <IconAlertTriangle size={15} /> Ce qui sera supprimé
                  </div>
                  <ul className="text-[12px] text-amber-900 space-y-0.5">
                    <li>{simulation.compte.resultats_cours} résultat(s) de cours</li>
                    <li>{simulation.compte.notes_aa} note(s) d'acquis</li>
                    <li>{simulation.compte.reports} report(s) de note</li>
                    {portee === 'inscriptions' ? (
                      <>
                        <li>{simulation.compte.inscriptions} inscription(s), dont {simulation.compte.inscriptions_avec_resultat} avec un résultat</li>
                        <li>{simulation.compte.valorisations} valorisation(s)</li>
                      </>
                    ) : (
                      <li>{simulation.compte.inscriptions} inscription(s) conservée(s), leurs résultats vidés</li>
                    )}
                  </ul>
                </div>
              )}

              <div className="flex justify-end gap-2">
                <button onClick={onClose} className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">
                  Annuler
                </button>
                <button onClick={simuler} disabled={enCours}
                  className="text-sm px-3 py-1.5 rounded-lg border border-iip-blue text-iip-blue font-medium disabled:opacity-50">
                  {enCours ? '…' : 'Calculer le périmètre'}
                </button>
                <button onClick={executer} disabled={!simulation || enCours}
                  className="text-sm px-4 py-1.5 rounded-lg bg-red-600 text-white font-semibold disabled:opacity-40">
                  Supprimer
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

const LIBELLES = {
  resultats_cours: 'Résultats de cours supprimés',
  notes_aa: "Notes d'acquis supprimées",
  reports: 'Reports de note supprimés',
  inscriptions: 'Inscriptions supprimées',
  valorisations: 'Valorisations supprimées',
  inscriptions_videes: 'Inscriptions vidées de leur résultat',
};
