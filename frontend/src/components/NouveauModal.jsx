import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';
import { IconX, IconCheck, IconChevronRight, IconBuilding, IconBook, IconSchool } from '@tabler/icons-react';

/**
 * Modale "Nouveau" — 3 chemins :
 *  - Section  → importe toutes les UE + tous les cours (squelettes À DÉSIGNER)
 *  - UE       → importe tous les cours d'une UE
 *  - Cours    → crée une attribution pour un cours précis
 */
export default function NouveauModal({ onClose, onCreated }) {
  const [etape, setEtape]       = useState('choix');    // choix | section | ue | cours
  const [sections, setSections] = useState([]);
  const [section, setSection]   = useState('');
  const [ues, setUes]           = useState([]);
  const [selUE, setSelUE]       = useState('');
  const [cours, setCours]       = useState([]);
  const [selCours, setSelCours] = useState('');
  const [selectedUEs, setSelectedUEs] = useState(new Set());
  const [loading, setLoading]   = useState(false);
  const [creating, setCreating] = useState(false);
  const [result, setResult]     = useState(null);

  const annee = api.getAnnee ? api.getAnnee() : (localStorage.getItem('annee') || '2025-2026');
  const tok = () => localStorage.getItem('token');
  const af = async (url, opts = {}) => {
    const r = await fetch('/api' + url, { ...opts, headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error || 'Erreur');
    return j;
  };

  useEffect(() => {
    api.sections().then(setSections).catch(() => {});
  }, []);

  // Charger UE quand section choisie
  useEffect(() => {
    if (!section) { setUes([]); setSelUE(''); setCours([]); return; }
    setLoading(true);
    fetch(`/api/ref/sections/${encodeURIComponent(section)}/ue-cours?annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${tok()}` } })
      .then(r => r.json())
      .then(data => {
        setUes(data);
        // Pré-sélectionner toutes les UE avec des cours manquants
        setSelectedUEs(new Set(data.filter(u => u.cours_manquants > 0).map(u => u.ue_num)));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [section]);

  // Charger cours quand UE choisie (pour chemin UE ou cours)
  useEffect(() => {
    if (!selUE || !section) { setCours([]); setSelCours(''); return; }
    const ue = ues.find(u => String(u.ue_num) === String(selUE));
    setCours(ue?.cours || []);
    setSelCours('');
  }, [selUE, ues]);

  const toggleUE = (num) => {
    setSelectedUEs(prev => {
      const n = new Set(prev);
      n.has(num) ? n.delete(num) : n.add(num);
      return n;
    });
  };

  const creerSection = async () => {
    if (!section || selectedUEs.size === 0) return;
    setCreating(true);
    try {
      const res = await af('/attributions/bulk-create-from-section', {
        method: 'POST',
        body: JSON.stringify({ section, annee, ue_nums: [...selectedUEs] }),
      });
      setResult(res);
      onCreated();
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  };

  const creerUE = async () => {
    if (!section || !selUE) return;
    setCreating(true);
    try {
      const res = await af('/attributions/bulk-create-from-section', {
        method: 'POST',
        body: JSON.stringify({ section, annee, ue_nums: [selUE] }),
      });
      setResult(res);
      onCreated();
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  };

  const creerCours = async () => {
    if (!section || !selUE || !selCours) return;
    setCreating(true);
    try {
      const res = await af('/attributions/creer-depuis-cours', {
        method: 'POST',
        body: JSON.stringify({ section, annee, cours_code: selCours, ue_num: selUE }),
      });
      setResult({ created: 1, skipped: 0 });
      onCreated();
    } catch (e) { alert(e.message); }
    finally { setCreating(false); }
  };

  // ── Rendu ──────────────────────────────────────────────────────────────────
  if (result) return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-sm p-6 text-center" onClick={e => e.stopPropagation()}>
        <div className="text-4xl mb-3">✅</div>
        <div className="text-lg font-bold text-iip-blue mb-1">
          {result.created} attribution{result.created > 1 ? 's' : ''} créée{result.created > 1 ? 's' : ''}
        </div>
        {result.skipped > 0 && <div className="text-sm text-gray-400">{result.skipped} déjà existante{result.skipped > 1 ? 's' : ''}, ignorée{result.skipped > 1 ? 's' : ''}</div>}
        <button onClick={onClose} className="mt-4 bg-iip-blue text-white px-6 py-2 rounded-lg text-sm font-medium hover:opacity-90">
          Fermer
        </button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg" onClick={e => e.stopPropagation()}>

        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
          <div className="flex items-center gap-2">
            {etape !== 'choix' && (
              <button onClick={() => { setEtape('choix'); setSection(''); setSelUE(''); setSelCours(''); }}
                className="text-gray-400 hover:text-gray-600 mr-1">←</button>
            )}
            <h2 className="text-lg font-bold text-iip-blue">
              {etape === 'choix' ? 'Nouveau' : etape === 'section' ? 'Importer une section' : etape === 'ue' ? 'Importer une UE' : 'Ajouter un cours'}
            </h2>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><IconX size={18} /></button>
        </div>

        <div className="px-5 py-5">

          {/* ── Étape 1 : Choix du mode ── */}
          {etape === 'choix' && (
            <div className="space-y-3">
              <p className="text-sm text-gray-500 mb-4">Que souhaitez-vous créer ?</p>

              <button onClick={() => setEtape('section')}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-iip-blue hover:bg-iip-blue/5 transition text-left group">
                <div className="w-10 h-10 rounded-lg bg-iip-blue/10 flex items-center justify-center flex-shrink-0 group-hover:bg-iip-blue/20">
                  <IconBuilding size={20} className="text-iip-blue" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">Une section</div>
                  <div className="text-xs text-gray-400">Importe toutes les UE et tous les cours de la section depuis le référentiel</div>
                </div>
                <IconChevronRight size={16} className="text-gray-300 group-hover:text-iip-blue flex-shrink-0" />
              </button>

              <button onClick={() => setEtape('ue')}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-iip-blue hover:bg-iip-blue/5 transition text-left group">
                <div className="w-10 h-10 rounded-lg bg-iip-turquoise/10 flex items-center justify-center flex-shrink-0 group-hover:bg-iip-turquoise/20">
                  <IconBook size={20} className="text-iip-turquoise" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">Une unité d'enseignement (UE)</div>
                  <div className="text-xs text-gray-400">Importe tous les cours d'une UE spécifique</div>
                </div>
                <IconChevronRight size={16} className="text-gray-300 group-hover:text-iip-turquoise flex-shrink-0" />
              </button>

              <button onClick={() => setEtape('cours')}
                className="w-full flex items-center gap-4 p-4 border-2 border-gray-200 rounded-xl hover:border-iip-blue hover:bg-iip-blue/5 transition text-left group">
                <div className="w-10 h-10 rounded-lg bg-amber-100 flex items-center justify-center flex-shrink-0 group-hover:bg-amber-200">
                  <IconSchool size={20} className="text-amber-600" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-gray-800">Un cours</div>
                  <div className="text-xs text-gray-400">Ajoute un cours précis avec ses propriétés (type CT/PP, quadrimestre)</div>
                </div>
                <IconChevronRight size={16} className="text-gray-300 group-hover:text-amber-500 flex-shrink-0" />
              </button>
            </div>
          )}

          {/* ── Étape 2a : Section ── */}
          {etape === 'section' && (
            <div className="space-y-4">
              <div>
                <label className="text-xs font-semibold text-gray-500 mb-1 block">Section</label>
                <select value={section} onChange={e => setSection(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-iip-blue">
                  <option value="">— choisir —</option>
                  {sections.map(s => <option key={s.code} value={s.code}>{s.code}{s.libelle ? ` — ${s.libelle}` : ''}</option>)}
                </select>
              </div>

              {loading && <div className="text-sm text-gray-400 text-center py-4">Chargement…</div>}

              {ues.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-semibold text-gray-500">UE à importer</label>
                    <div className="flex gap-2">
                      <button onClick={() => setSelectedUEs(new Set(ues.map(u => u.ue_num)))}
                        className="text-[10px] text-iip-blue hover:underline">Tout</button>
                      <button onClick={() => setSelectedUEs(new Set(ues.filter(u => u.cours_manquants > 0).map(u => u.ue_num)))}
                        className="text-[10px] text-iip-blue hover:underline">Manquantes</button>
                      <button onClick={() => setSelectedUEs(new Set())}
                        className="text-[10px] text-gray-400 hover:underline">Aucune</button>
                    </div>
                  </div>
                  <div className="max-h-64 overflow-y-auto space-y-1 border border-gray-200 rounded-lg p-2">
                    {ues.map(u => (
                      <label key={u.ue_num} className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 ${selectedUEs.has(u.ue_num) ? 'bg-iip-blue/5' : ''}`}>
                        <input type="checkbox" checked={selectedUEs.has(u.ue_num)} onChange={() => toggleUE(u.ue_num)}
                          className="w-4 h-4 accent-iip-blue flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-xs font-semibold text-iip-blue">UE {u.ue_num}</span>
                          <span className="text-xs text-gray-600 ml-2 truncate">{u.ue_nom}</span>
                        </div>
                        <div className="flex gap-1.5 flex-shrink-0 text-[10px]">
                          {u.cours_total > 0 && (
                            <span className={`px-1.5 py-0.5 rounded-full font-semibold ${u.cours_manquants > 0 ? 'bg-orange-100 text-orange-700' : 'bg-green-100 text-green-700'}`}>
                              {u.cours_couverts}/{u.cours_total}
                            </span>
                          )}
                        </div>
                      </label>
                    ))}
                  </div>
                  <div className="text-xs text-gray-400 mt-1">{selectedUEs.size} UE sélectionnée{selectedUEs.size > 1 ? 's' : ''}</div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Annuler</button>
                <button onClick={creerSection} disabled={!section || selectedUEs.size === 0 || creating}
                  className="flex items-center gap-2 bg-iip-blue text-white text-sm px-5 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-40">
                  <IconCheck size={15} /> {creating ? 'Création…' : `Créer (${selectedUEs.size} UE)`}
                </button>
              </div>
            </div>
          )}

          {/* ── Étape 2b : UE ── */}
          {etape === 'ue' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Section</label>
                  <select value={section} onChange={e => { setSection(e.target.value); setSelUE(''); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-iip-blue">
                    <option value="">— choisir —</option>
                    {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">UE</label>
                  <select value={selUE} onChange={e => setSelUE(e.target.value)} disabled={!section || ues.length === 0}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-iip-blue disabled:bg-gray-100">
                    <option value="">— choisir —</option>
                    {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
                  </select>
                </div>
              </div>

              {selUE && cours.length > 0 && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3">
                  <div className="text-xs font-semibold text-gray-500 mb-2">Cours à créer ({cours.filter(c => c.nb_attributions === 0).length} manquant{cours.filter(c => c.nb_attributions === 0).length > 1 ? 's' : ''})</div>
                  <div className="space-y-1">
                    {cours.map(c => (
                      <div key={c.cours_code} className="flex items-center gap-2 text-xs">
                        <span className={`w-2 h-2 rounded-full flex-shrink-0 ${c.nb_attributions > 0 ? 'bg-green-400' : 'bg-orange-400'}`} />
                        <span className="font-mono text-gray-400">{c.cours_code}</span>
                        <span className="text-gray-700 flex-1 truncate">{c.cours_nom}</span>
                        <span className={`px-1.5 py-0.5 rounded font-bold ${c.type_cours === 'CT' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'}`}>{c.type_cours}</span>
                        {c.nb_attributions > 0 && <span className="text-gray-400">déjà créé</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Annuler</button>
                <button onClick={creerUE} disabled={!section || !selUE || creating}
                  className="flex items-center gap-2 bg-iip-blue text-white text-sm px-5 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-40">
                  <IconCheck size={15} /> {creating ? 'Création…' : 'Importer l\'UE'}
                </button>
              </div>
            </div>
          )}

          {/* ── Étape 2c : Cours ── */}
          {etape === 'cours' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Section</label>
                  <select value={section} onChange={e => { setSection(e.target.value); setSelUE(''); setSelCours(''); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-iip-blue">
                    <option value="">— choisir —</option>
                    {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">UE</label>
                  <select value={selUE} onChange={e => setSelUE(e.target.value)} disabled={!section || ues.length === 0}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-iip-blue disabled:bg-gray-100">
                    <option value="">— choisir —</option>
                    {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
                  </select>
                </div>
              </div>

              {selUE && cours.length > 0 && (
                <div>
                  <label className="text-xs font-semibold text-gray-500 mb-1 block">Cours</label>
                  <div className="space-y-1 max-h-48 overflow-y-auto border border-gray-200 rounded-lg p-2">
                    {cours.map(c => (
                      <button key={c.cours_code} onClick={() => setSelCours(c.cours_code)}
                        className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition ${selCours === c.cours_code ? 'bg-iip-blue text-white' : 'hover:bg-gray-50 text-gray-700'}`}>
                        <span className="font-mono text-[11px] flex-shrink-0 w-16 opacity-60">{c.cours_code}</span>
                        <span className="text-xs flex-1 truncate">{c.cours_nom}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded font-bold flex-shrink-0 ${
                          selCours === c.cours_code ? 'bg-white/20 text-white' :
                          c.type_cours === 'CT' ? 'bg-blue-100 text-blue-700' : 'bg-green-100 text-green-700'
                        }`}>{c.type_cours}</span>
                        {c.nb_attributions > 0 && (
                          <span className={`text-[10px] flex-shrink-0 ${selCours === c.cours_code ? 'text-white/70' : 'text-gray-400'}`}>✓</span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {selCours && (() => {
                const c = cours.find(x => x.cours_code === selCours);
                return c ? (
                  <div className="bg-iip-blue/5 border border-iip-blue/20 rounded-lg p-3 text-xs space-y-1">
                    <div className="font-semibold text-iip-blue">{c.cours_code} — {c.cours_nom}</div>
                    <div className="text-gray-500 flex gap-4">
                      <span>Type : <b>{c.type_cours}</b></span>
                      {c.quadrimestre_cours && <span>Q : <b>{c.quadrimestre_cours}</b></span>}
                      {c.cours_per && <span>DP : <b>{c.cours_per} pér.</b></span>}
                    </div>
                  </div>
                ) : null;
              })()}

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={onClose} className="text-sm text-gray-500 hover:text-gray-700 px-4 py-2">Annuler</button>
                <button onClick={creerCours} disabled={!section || !selUE || !selCours || creating}
                  className="flex items-center gap-2 bg-iip-blue text-white text-sm px-5 py-2 rounded-lg font-medium hover:opacity-90 disabled:opacity-40">
                  <IconCheck size={15} /> {creating ? 'Création…' : 'Créer l\'attribution'}
                </button>
              </div>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
