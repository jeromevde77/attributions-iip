import { useEffect, useState, Fragment } from 'react';
import { api, getAnnee, getUser } from '../lib/api.js';
import CoursFormModal from '../components/CoursFormModal.jsx';
import GrilleSectionModal from '../components/GrilleSectionModal.jsx';
import ImportUEAssistant from '../components/ImportUEAssistant.jsx';
import { IconX, IconPencil, IconTrash, IconPlus, IconCheck, IconLink, IconChevronRight, IconTarget, IconUpload, IconFileText, IconAlertTriangle } from '@tabler/icons-react';

// ─── Import Dossier Pédagogique FWB ───────────────────────────────────────────
function DPImportModal({ annee, sections, onClose, onSaved }) {
  const [file, setFile]           = useState(null);
  const [section, setSection]     = useState('');
  const [loading, setLoading]     = useState(false);
  const [preview, setPreview]     = useState(null); // résultat du parse avant confirmation
  const [result, setResult]       = useState(null); // résultat après import
  const [error, setError]         = useState('');

  async function analyser() {
    if (!file) return setError('Sélectionnez un fichier .docx');
    setError(''); setLoading(true); setPreview(null);
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch(`/api/ref/import-dp?annee=${annee}&section=${section}&preview=1`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: buf,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur analyse');
      setPreview(data);
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  async function confirmer() {
    if (!file) return;
    setError(''); setLoading(true);
    try {
      const buf = await file.arrayBuffer();
      const res = await fetch(`/api/ref/import-dp?annee=${annee}&section=${section}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream', 'Authorization': `Bearer ${localStorage.getItem('token')}` },
        body: buf,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erreur import');
      setResult(data);
      onSaved?.();
    } catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }

  const ue = preview?.parsed?.ue || result?.parsed?.ue;
  const cours = preview?.parsed?.cours || result?.parsed?.cours || [];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-xl w-full border-t-4 border-iip-turquoise max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <h2 className="font-title text-lg text-iip-blue flex items-center gap-2">
            <IconFileText size={20} className="text-iip-turquoise" />
            Import dossier pédagogique FWB
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500"><IconX size={20} /></button>
        </div>

        <div className="p-5 space-y-4 overflow-auto">
          {!result ? (<>
            {/* Étape 1 : sélection fichier */}
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Fichier .docx</div>
              <label className="flex items-center gap-3 border-2 border-dashed border-iip-turquoise/30 rounded-lg p-4 cursor-pointer hover:border-iip-turquoise/60 hover:bg-iip-turquoise/3 transition">
                <IconUpload size={22} className="text-iip-turquoise flex-shrink-0" />
                <div>
                  <div className="text-sm font-medium text-iip-blue">{file ? file.name : 'Cliquer pour sélectionner'}</div>
                  <div className="text-xs text-gray-400">Dossier pédagogique FWB au format Word (.docx)</div>
                </div>
                <input type="file" accept=".docx" className="sr-only" onChange={e => { setFile(e.target.files[0]); setPreview(null); setError(''); }} />
              </label>
            </div>

            {/* Section (pour création) */}
            <div>
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">Section cible <span className="text-gray-400 font-normal normal-case">(si l'UE n'existe pas encore)</span></div>
              <select value={section} onChange={e => setSection(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:outline-none focus:border-iip-blue">
                <option value="">— Rechercher par code FWB uniquement —</option>
                {sections.map(s => <option key={s.code} value={s.code}>{s.code} — {s.libelle}</option>)}
              </select>
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-start gap-2">
                <IconAlertTriangle size={16} className="flex-shrink-0 mt-0.5" />{error}
              </div>
            )}

            <button onClick={analyser} disabled={loading || !file}
              className="w-full bg-iip-turquoise hover:opacity-90 disabled:opacity-40 text-white text-sm py-2.5 rounded-lg font-medium flex items-center justify-center gap-2">
              <IconFileText size={16} />{loading ? 'Analyse en cours…' : 'Analyser le document'}
            </button>

            {/* Preview du parsing */}
            {preview && (
              <div className="border border-iip-turquoise/30 rounded-lg overflow-hidden">
                <div className="bg-iip-turquoise/8 px-4 py-2 text-xs font-semibold text-iip-blue uppercase tracking-wide">
                  Résultat de l'analyse
                </div>
                <div className="p-4 space-y-3 text-sm">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div><span className="text-gray-500">Code FWB :</span> <strong>{ue?.ue_code_fwb || '—'}</strong></div>
                    <div><span className="text-gray-500">Action :</span> <strong className={preview.action === 'created' ? 'text-iip-turquoise' : 'text-iip-blue'}>{preview.action === 'created' ? '✚ Création' : '↻ Mise à jour'}</strong></div>
                    <div><span className="text-gray-500">UE N° :</span> <strong>{preview.ue_num}</strong></div>
                    <div><span className="text-gray-500">Niveau :</span> {ue?.ue_niveau} · {ue?.ects} ECTS</div>
                    <div className="col-span-2"><span className="text-gray-500">Intitulé :</span> {ue?.ue_nom}</div>
                    <div><span className="text-gray-500">Autonomie :</span> {ue?.ue_aut ?? '—'} pér.</div>
                    <div><span className="text-gray-500">Total périodes :</span> {ue?.ue_per_etudiants ?? '—'}</div>
                  </div>
                  <div>
                    <div className="text-xs text-gray-500 mb-1">Cours détectés ({cours.length}) :</div>
                    {cours.map((c, i) => (
                      <div key={i} className="text-xs flex gap-2 py-0.5 border-b border-gray-50 last:border-0">
                        <span className="font-mono bg-gray-100 rounded px-1 text-gray-600 flex-shrink-0">{c.classement || '?'} {c.codeU}</span>
                        <span className="flex-1">{c.nom}</span>
                        <span className="text-gray-400 flex-shrink-0">{c.periodes ?? '—'} pér.</span>
                      </div>
                    ))}
                  </div>
                  {preview.action === 'created' && !section && (
                    <div className="bg-amber-50 border border-amber-200 rounded p-2 text-xs text-amber-700 flex items-start gap-1.5">
                      <IconAlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
                      UE non trouvée — sélectionnez une section cible pour la créer.
                    </div>
                  )}
                  <button onClick={confirmer} disabled={loading || (preview.action === 'created' && !section)}
                    className="w-full bg-iip-blue hover:bg-iip-blue-dark disabled:opacity-40 text-white text-sm py-2 rounded-lg font-medium flex items-center justify-center gap-2">
                    <IconCheck size={16} />{loading ? 'Import en cours…' : 'Confirmer l\'import'}
                  </button>
                </div>
              </div>
            )}
          </>) : (
            /* Résultat final */
            <div className="space-y-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-start gap-3">
                <IconCheck size={20} className="text-green-600 flex-shrink-0 mt-0.5" />
                <div>
                  <div className="font-semibold text-green-800">Import réussi</div>
                  <div className="text-sm text-green-700 mt-0.5">
                    UE N° <strong>{result.ue_num}</strong> — {result.action === 'created' ? 'créée' : 'mise à jour'}
                  </div>
                </div>
              </div>
              {result.cours_crees?.length > 0 && (
                <div className="text-sm text-gray-700">
                  <strong>{result.cours_crees.length}</strong> cours créé(s) :
                  {result.cours_crees.map(c => <div key={c.code} className="text-xs text-gray-500 pl-3">· {c.code} — {c.nom}</div>)}
                </div>
              )}
              {result.cours_existants?.length > 0 && (
                <div className="text-xs text-gray-400">
                  {result.cours_existants.length} cours déjà présent(s) (inchangé(s)) : {result.cours_existants.join(', ')}
                </div>
              )}
              <button onClick={onClose} className="w-full bg-iip-blue text-white text-sm py-2 rounded-lg font-medium">Fermer</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Modale Section ───
// Modal d'import des effectifs étudiants par UE — colle le tableau (n° UE + nb étudiants)
function EffectifsImportModal({ annee, onClose, onSaved }) {
  const [texte, setTexte] = useState('');
  const [preview, setPreview] = useState(null);
  const [busy, setBusy] = useState(false);

  function parser() {
    // Chaque ligne : on prend le 1er entier comme n° UE et le DERNIER entier comme effectif.
    const lignes = texte.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const out = [];
    for (const ligne of lignes) {
      const nombres = (ligne.match(/\d+/g) || []).map(Number);
      if (nombres.length < 2) continue; // besoin d'au moins un n° UE et un effectif
      // Heuristique : n° UE = un nombre entre 1 et 999 ; effectif = dernier nombre de la ligne
      const ue_num = nombres.find(n => n >= 1 && n <= 999);
      const nb_etudiants = nombres[nombres.length - 1];
      if (ue_num == null) continue;
      out.push({ ue_num, nb_etudiants });
    }
    setPreview(out);
  }

  async function importer() {
    if (!preview || preview.length === 0) return;
    setBusy(true);
    try {
      const r = await api.importEffectifs(preview);
      alert(`${r.maj} UE mises à jour.` + (r.inconnus?.length ? `\nUE non trouvées pour ${annee} : ${r.inconnus.join(', ')}` : ''));
      onSaved();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setBusy(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 flex flex-col" style={{ maxHeight: '85vh' }}>
        <h2 className="font-title text-lg text-iip-blue mb-1">Importer les effectifs étudiants — {annee}</h2>
        <p className="text-xs text-gray-500 mb-3">
          Collez votre tableau (depuis Word/Excel). Chaque ligne doit contenir le <b>n° d'UE</b> et le <b>nombre d'étudiants</b> (dernier nombre de la ligne). Les colonnes intermédiaires (section, nom, bloc, quadri) sont ignorées.
        </p>
        <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={8}
          placeholder={"Exemple :\nTIM\t248\tPhysique…\tBA1\tQ1/Q2\t144\nTIM\t260\tContrôle qualité…\tBA1\tQ2\t139"}
          className="w-full border border-gray-300 rounded px-3 py-2 text-xs font-mono mb-3" />
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={parser} className="bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm px-4 py-1.5 rounded">Analyser</button>
          {preview && <span className="text-sm text-gray-500 self-center">{preview.length} ligne(s) détectée(s)</span>}
        </div>
        {preview && preview.length > 0 && (
          <div className="border border-gray-200 rounded-lg overflow-auto mb-3 flex-1" style={{ minHeight: '80px' }}>
            <table className="w-full text-[12px]">
              <thead className="bg-gray-50 sticky top-0"><tr><th className="text-left px-3 py-1.5 text-gray-500">N° UE</th><th className="text-right px-3 py-1.5 text-gray-500">Nb étudiants</th></tr></thead>
              <tbody>
                {preview.map((e, i) => (
                  <tr key={i} className="border-t border-gray-100"><td className="px-3 py-1 text-gray-700">{e.ue_num}</td><td className="px-3 py-1 text-right text-gray-700">{e.nb_etudiants}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
          <button type="button" onClick={importer} disabled={!preview || preview.length === 0 || busy}
            className="bg-iip-blue hover:bg-iip-blue-dark disabled:opacity-30 text-white text-sm px-5 py-2 rounded font-medium">
            {busy ? 'Import…' : `Importer ${preview?.length || 0} effectif(s)`}
          </button>
        </div>
      </div>
    </div>
  );
}

function SectionModal({ section, onClose, onSaved }) {
  const isNew = !section?._edit;
  const [form, setForm] = useState({
    code: section?.code || '',
    libelle: section?.libelle || '',
    niveau: section?.niveau || '',
    responsable: section?.responsable || '',
    code_fwb: section?.code_fwb || ''
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  async function submit(e) {
    e.preventDefault();
    setError('');
    if (!form.code.trim()) { setError('Le code de section est requis'); return; }
    setSaving(true);
    try {
      const payload = {
        libelle: form.libelle.trim() || form.code.trim(),
        niveau: form.niveau || null,
        responsable: form.responsable.trim() || null,
        code_fwb: form.code_fwb.trim() || null
      };
      if (isNew) {
        await api.createSection({ code: form.code.trim(), ...payload });
      } else {
        // Si le code a changé, renommer d'abord (propagation), puis mettre à jour les autres champs
        const nouveauCode = form.code.trim();
        if (nouveauCode && nouveauCode !== section.code) {
          await api.renameSectionCode(section.code, nouveauCode);
        }
        await api.updateSection(nouveauCode || section.code, payload);
      }
      onSaved();
    } catch (e) { setError(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border-t-4 border-iip-gold">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-title text-lg text-iip-gold">{isNew ? 'Nouvelle section' : `Modifier ${section.code}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl"><IconX size={20} /></button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Code *</div>
              <input value={form.code} onChange={e => set('code', e.target.value)} placeholder="ex: TIM"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Code FWB</div>
              <input value={form.code_fwb} onChange={e => set('code_fwb', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
          </div>
          {!isNew && form.code.trim() && form.code.trim() !== section.code && (
            <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-2 py-1.5">
              ⚠️ Renommer « {section.code} » → « {form.code.trim()} » mettra à jour toutes les attributions, cours, UE et rattachements liés.
            </div>
          )}
          <label className="block"><div className="text-xs text-gray-600 mb-0.5">Libellé</div>
            <input value={form.libelle} onChange={e => set('libelle', e.target.value)} placeholder="Nom complet de la section"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Niveau</div>
              <select value={form.niveau} onChange={e => set('niveau', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option>
                <option value="FC Secondaire Supérieur">FC Secondaire Supérieur</option>
                <option value="FC Enseignement Supérieur">FC Enseignement Supérieur</option>
                <option value="BES">BES — Brevet d'enseignement supérieur</option>
                <option value="Bachelier">Bachelier</option>
                <option value="Master">Master</option>
              </select></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Responsable</div>
              <input value={form.responsable} onChange={e => set('responsable', e.target.value)} placeholder="Coordinateur (optionnel)"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
          </div>
          {error && <div className="bg-red-50 text-red-700 text-sm rounded p-2">{error}</div>}
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
            <button type="submit" disabled={saving} className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
              {saving ? '…' : isNew ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Modale UE ───
function UEModal({ ue, sections, onClose, onSaved }) {
  const isNew = !ue?._edit;
  const me = getUser?.();
  const isAdmin = me?.role === 'admin';
  const [form, setForm] = useState({
    ue_num: ue?.ue_num || '', ue_nom: ue?.ue_nom || '', section: ue?.section || (sections[0]?.code || ''),
    ue_niv: ue?.ue_niv || '', ue_niveau: ue?.ue_niveau || '', ue_quad: ue?.ue_quad || '',
    ue_per_cours: ue?.ue_per_cours || '', ue_aut: ue?.ue_aut || '', ue_code_fwb: ue?.ue_code_fwb || '',
    et_ref: ue?.et_ref || '', ue_tc: ue?.ue_tc || '', ue_det: ue?.ue_det || '',
    ue_per_etudiants: ue?.ue_per_etudiants || '', ue_tot_prf: ue?.ue_tot_prf || '',
    ects: ue?.ects || '', ue_prerequise: ue?.ue_prerequise || '', ue_per_z: ue?.ue_per_z || '',
    nb_etudiants: ue?.nb_etudiants ?? ''
  });
  const [saving, setSaving] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newNum, setNewNum] = useState('');
  // Multi-sections : ensemble des codes de sections cochées
  const [selSections, setSelSections] = useState(new Set(ue?._sections ? [...ue._sections] : (ue?.section ? [ue.section] : [])));
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }
  function toggleSection(code) {
    setSelSections(s => { const n = new Set(s); n.has(code) ? n.delete(code) : n.add(code); return n; });
  }

  async function forcerNum() {
    const n = String(newNum).trim();
    if (!n || n === String(ue.ue_num)) { setRenaming(false); return; }
    setSaving(true);
    try { await api.renameUENum(ue.ue_num, n); onSaved(); }
    catch (e) { alert('Erreur : ' + e.message); setSaving(false); }
  }

  async function submit(e) {
    e.preventDefault();
    if (!form.ue_num || !form.ue_nom) return alert('Numéro et nom requis');
    if (selSections.size === 0) return alert('Sélectionnez au moins une section.');
    setSaving(true);
    try {
      // La 1re section cochée reste la section "principale" (champ ue.section)
      const principale = [...selSections][0];
      if (isNew) await api.createUE({ ...form, section: principale });
      else await api.updateUE(ue.ue_num, { ...form, section: principale });
      // Synchroniser les rattachements multi-sections (ue_section)
      const avant = new Set(ue?._sections ? [...ue._sections] : (ue?.section ? [ue.section] : []));
      const apres = selSections;
      for (const code of apres) if (!avant.has(code)) await api.rattacherUE(form.ue_num, code);
      for (const code of avant) if (!apres.has(code)) await api.detacherUE(form.ue_num, code).catch(() => {});
      onSaved();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  const lbl = 'text-xs font-medium text-gray-500 mb-0.5 uppercase tracking-wide';
  const inp = 'w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:border-iip-blue';
  const sep = 'text-[10px] font-semibold uppercase tracking-widest text-gray-400 border-b border-gray-100 pb-1 mb-2 mt-1';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border-t-4 border-iip-blue max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <h2 className="font-title text-lg text-iip-blue">{isNew ? 'Nouvelle UE' : `Modifier UE ${ue.ue_num}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500"><IconX size={20} /></button>
        </div>

        <form onSubmit={submit} className="p-5 space-y-4 overflow-auto">

          {/* ── 1. IDENTIFICATION OFFICIELLE (FWB) ── */}
          <div className={sep}>Identification officielle</div>
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><div className={lbl}>N° UE *</div>
              <div className="flex gap-1 items-center">
                <input type="number" value={form.ue_num} onChange={e => set('ue_num', e.target.value)} disabled={!isNew}
                  className={inp + ' disabled:bg-gray-100'} />
                {!isNew && isAdmin && !renaming && (
                  <button type="button" onClick={() => { setRenaming(true); setNewNum(ue.ue_num); }}
                    className="text-xs text-iip-blue border border-iip-blue/30 rounded px-2 py-1.5 hover:bg-iip-blue/5" title="Forcer le N°">
                    <IconPencil size={14} />
                  </button>
                )}
              </div>
            </label>
            <label className="block"><div className={lbl}>Code FWB</div>
              <input value={form.ue_code_fwb} onChange={e => set('ue_code_fwb', e.target.value)} className={inp} />
            </label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><div className={lbl}>Niveau</div>
              <select value={form.ue_niveau} onChange={e => set('ue_niveau', e.target.value)} className={inp + ' bg-white'}>
                <option value="">—</option><option value="SUP">SUP</option><option value="DS">DS</option>
              </select></label>
            <label className="block"><div className={lbl}>Bloc</div>
              <input value={form.ue_niv} onChange={e => set('ue_niv', e.target.value)} placeholder="BA1" className={inp} />
            </label>
            <label className="block"><div className={lbl}>ECTS</div>
              <input type="number" value={form.ects} onChange={e => set('ects', e.target.value)} className={inp} />
            </label>
          </div>
          <label className="block"><div className={lbl}>Section(s) *</div>
            <div className="border border-gray-300 rounded px-2 py-1.5 max-h-24 overflow-auto bg-white grid grid-cols-3 gap-x-2">
              {sections.map(s => (
                <label key={s.code} className="flex items-center gap-1.5 py-0.5 text-sm cursor-pointer hover:bg-gray-50 rounded px-1">
                  <input type="checkbox" checked={selSections.has(s.code)} onChange={() => toggleSection(s.code)} />
                  <span>{s.code}</span>
                </label>
              ))}
            </div>
          </label>

          {renaming && (
            <div className="bg-iip-blue/5 border border-iip-blue/20 rounded p-3 space-y-2">
              <div className="text-xs text-gray-700">⚠️ Forcer le N° d'UE met à jour l'UE, ses cours, attributions et rattachements. Lucie vérifie l'unicité.</div>
              <div className="flex gap-2">
                <input type="number" value={newNum} onChange={e => setNewNum(e.target.value)} placeholder="Nouveau N°"
                  className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm" />
                <button type="button" onClick={forcerNum} disabled={saving}
                  className="bg-iip-blue text-white text-sm px-3 py-1.5 rounded disabled:opacity-40">Forcer</button>
                <button type="button" onClick={() => setRenaming(false)} className="text-sm text-gray-500 px-2">Annuler</button>
              </div>
            </div>
          )}

          {/* ── 2. CONTENU PÉDAGOGIQUE ── */}
          <div className={sep}>Contenu pédagogique</div>
          <label className="block"><div className={lbl}>Nom de l'UE *</div>
            <input value={form.ue_nom} onChange={e => set('ue_nom', e.target.value)} className={inp} />
          </label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><div className={lbl}>Quadrimestre</div>
              <select value={form.ue_quad} onChange={e => set('ue_quad', e.target.value)} className={inp + ' bg-white'}>
                <option value="">—</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q1/Q2">Q1/Q2</option>
              </select></label>
            <label className="block"><div className={lbl}>Tronc commun</div>
              <select value={form.ue_tc} onChange={e => set('ue_tc', e.target.value)} className={inp + ' bg-white'}>
                <option value="">Non</option><option value="x">Oui</option>
              </select></label>
            <label className="block"><div className={lbl}>Réf.</div>
              <select value={form.et_ref} onChange={e => set('et_ref', e.target.value)} className={inp + ' bg-white'}>
                <option value="">—</option><option value="IIP">IIP</option><option value="HELB">HELB</option>
              </select></label>
          </div>
          <label className="block"><div className={lbl}>Prérequis</div>
            <input value={form.ue_prerequise} onChange={e => set('ue_prerequise', e.target.value)} className={inp} />
          </label>

          {/* ── 3. CHARGE ── */}
          <div className={sep}>Charge</div>
          <div className="grid grid-cols-4 gap-3">
            <label className="block"><div className={lbl}>Autonomie</div>
              <input type="number" value={form.ue_aut} onChange={e => set('ue_aut', e.target.value)} className={inp} />
            </label>
            <label className="block"><div className={lbl}>Pér. étud.</div>
              <input type="number" value={form.ue_per_etudiants} onChange={e => set('ue_per_etudiants', e.target.value)} className={inp} />
            </label>
            <label className="block"><div className={lbl}>Nb étud.</div>
              <input type="number" value={form.nb_etudiants} onChange={e => set('nb_etudiants', e.target.value)} placeholder="Effectif" className={inp} />
            </label>
            <label className="block"><div className={lbl}>Pér. Z (7.3)</div>
              <input type="number" value={form.ue_per_z} onChange={e => set('ue_per_z', e.target.value)} placeholder="Auto." className={inp} />
            </label>
          </div>

          {/* ── 4. DÉTAILS ── */}
          <div className={sep}>Détails</div>
          <label className="block">
            <textarea value={form.ue_det} onChange={e => set('ue_det', e.target.value)} rows="2" className={inp} />
          </label>

          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
            <button type="submit" disabled={saving} className="bg-iip-blue hover:bg-iip-blue-dark disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
              {saving ? '…' : isNew ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Catalogue : rattacher une UE existante à une section ───
function CatalogueUEModal({ section, onClose, onDone }) {
  const [ues, setUes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState('');
  const [busy, setBusy] = useState(null);

  useEffect(() => {
    api.catalogueUE().then(setUes).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const dejaLa = (ue) => ue.sections.some(s => s.toUpperCase() === section.toUpperCase());
  const filtered = ues.filter(ue =>
    !q || `${ue.ue_num} ${ue.ue_nom}`.toLowerCase().includes(q.toLowerCase()));

  async function rattacher(ue) {
    setBusy(ue.ue_num);
    try {
      const r = await api.rattacherUE(ue.ue_num, section);
      // Placer automatiquement les profs définitifs nommés sur les cours de cette UE
      try {
        const res = await api.appliquerNominations(ue.ue_num, section);
        if (res?.alertes?.length) {
          alert('Profs définitifs placés.\n\n⚠ ' + res.alertes.map(a => a.message).join('\n'));
        }
      } catch { /* non bloquant */ }
      onDone(r);
    }
    catch (e) { alert(e.message); setBusy(null); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] flex flex-col border-t-4 border-iip-gold">
        <div className="flex items-center justify-between px-5 py-3 border-b flex-shrink-0">
          <div>
            <h2 className="font-title text-lg text-iip-gold">Rattacher une UE à {section}</h2>
            <p className="text-xs text-gray-500">Catalogue de toutes les UE. Une UE absente de l'année courante y sera copiée automatiquement.</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl"><IconX size={20} /></button>
        </div>
        <div className="px-5 py-2 border-b flex-shrink-0">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Rechercher une UE (numéro ou nom)…"
            className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" autoFocus />
        </div>
        {loading ? (
          <div className="p-8 text-center text-gray-400">Chargement…</div>
        ) : (
          <div className="flex-1 overflow-auto divide-y divide-gray-100">
            {filtered.map(ue => {
              const present = dejaLa(ue);
              return (
                <div key={ue.ue_num} className={`flex items-center gap-3 px-5 py-2 ${present ? 'opacity-50' : 'hover:bg-iip-gold/5'}`}>
                  <span className="font-semibold text-iip-gold text-sm w-16 flex-shrink-0">UE {ue.ue_num}</span>
                  {ue.ue_niv && <span className="text-xs bg-gray-100 px-1.5 rounded flex-shrink-0">{ue.ue_niv}</span>}
                  <span className="text-sm text-gray-700 truncate flex-1" title={ue.ue_nom}>{ue.ue_nom}</span>
                  {!ue.presente_annee_active && <span className="text-xs text-iip-mauve flex-shrink-0" title="Sera copiée dans l'année courante">à copier</span>}
                  {ue.sections.length > 0 && <span className="text-xs text-gray-400 flex-shrink-0">{ue.sections.join(', ')}</span>}
                  {present ? (
                    <span className="text-xs text-green-600 font-medium flex-shrink-0">✓ déjà rattachée</span>
                  ) : (
                    <button onClick={() => rattacher(ue)} disabled={busy === ue.ue_num}
                      className="text-xs bg-iip-gold hover:bg-iip-amber text-white px-3 py-1 rounded flex-shrink-0 disabled:opacity-40">
                      {busy === ue.ue_num ? '…' : 'Rattacher'}
                    </button>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && <div className="p-6 text-center text-gray-400 text-sm">Aucune UE trouvée.</div>}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Referentiels({ embedded = false }) {
  const [structure, setStructure] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({});  // sections/UE dépliées
  const [ueModal, setUeModal] = useState(null);
  const [coursModal, setCoursModal] = useState(null);
  const [sectionModal, setSectionModal] = useState(null); // {code, libelle, _edit} ou {} pour nouvelle
  const [importOpen, setImportOpen] = useState(false);
  const [dpImportOpen, setDpImportOpen] = useState(false);
  const [effectifsOpen, setEffectifsOpen] = useState(false);
  const [catalogueSection, setCatalogueSection] = useState(null); // menu + ouvert pour cette section
  const [grilleSection, setGrilleSection] = useState(null); // section dont on édite l'autonomie
  const [catalogueOpen, setCatalogueOpen] = useState(null); // section pour laquelle le catalogue UE est ouvert
  const [annees, setAnnees] = useState([]);
  const [viewMode, setViewMode] = useState(() => {
    const wanted = localStorage.getItem('referentiels_goto');
    if (wanted) { localStorage.removeItem('referentiels_goto'); return wanted; }
    return 'section';
  }); // 'sections' (gestion) | 'section' (UE) | 'table' (global) | 'activites'
  const [activeUE, setActiveUE] = useState(null); // clé de la dernière UE cliquée (encadrée)
  const annee = getAnnee();

  async function load() {
    setLoading(true);
    try {
      const [s, secs] = await Promise.all([api.refStructure(), api.sections()]);
      setStructure(s); setSections(secs);
      api.annees().then(setAnnees).catch(() => {});
    } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function toggle(key) { setOpen(o => ({ ...o, [key]: !o[key] })); }

  async function delUE(ue) {
    if (!confirm(`Supprimer l'UE ${ue.ue_num} — ${ue.ue_nom} et ses cours ?`)) return;
    try { await api.deleteUE(ue.ue_num); load(); } catch (e) { alert(e.message); }
  }
  async function delCours(c) {
    if (!confirm(`Supprimer le cours ${c.cours_code} ?`)) return;
    try { await api.deleteCours(c.cours_code); load(); } catch (e) { alert(e.message); }
  }
  async function delSection(code) {
    if (!confirm(`Supprimer la section "${code}" ? (bloqué si des attributions existent)`)) return;
    try { await api.deleteSection(code); load(); } catch (e) { alert(e.message); }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  return (
    <div className={embedded ? 'space-y-4' : 'p-4 md:p-6 max-w-5xl mx-auto space-y-4'}>
      <div className="flex items-center justify-between flex-wrap gap-2">
        {!embedded && <h1 className="text-2xl font-title text-iip-gold">Référentiels <span className="text-base font-normal text-gray-400">· {annee}</span></h1>}
        {embedded && <div className="text-sm text-gray-500">Structure académique · {annee}</div>}
        <div className="flex gap-2">
          {annees.filter(a => a.code !== annee).length > 0 && (
            <button onClick={() => setImportOpen(true)} className="bg-white border border-iip-mauve text-iip-mauve hover:bg-iip-mauve/5 text-sm px-4 py-2 rounded font-medium">Importer des UE</button>
          )}
          <button onClick={() => setEffectifsOpen(true)} className="bg-white border border-iip-turquoise/40 text-iip-blue hover:bg-iip-turquoise/5 text-sm px-4 py-2 rounded font-medium">Importer effectifs étudiants</button>
          <button onClick={() => setSectionModal({})} className="bg-white border border-iip-gold text-iip-gold hover:bg-iip-gold/5 text-sm px-4 py-2 rounded font-medium"><IconPlus size={15} className="inline align-[-2px] mr-0.5" /> Nouvelle section</button>
          <button onClick={() => setDpImportOpen(true)} className="bg-white border border-iip-turquoise text-iip-blue hover:bg-iip-turquoise/5 text-sm px-4 py-2 rounded font-medium flex items-center gap-1.5"><IconUpload size={15} /> Import DP</button>
          <button onClick={() => setUeModal({})} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-2 rounded font-medium"><IconPlus size={15} className="inline align-[-2px] mr-0.5" /> Nouvelle UE</button>
        </div>
      </div>

      <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 border border-gray-200">
        Gérez la structure académique de l'année <b>{annee}</b> : sections, UE et cours.
        Les UE et cours sont propres à chaque année. Les sections sont communes à toutes les années.
        La suppression est bloquée s'il existe des attributions.
      </p>

      {/* Sélecteur de vue */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button onClick={() => setViewMode('sections')}
          className={`px-3 py-1.5 text-sm rounded-md transition ${viewMode === 'sections' ? 'bg-white shadow-sm text-iip-gold font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
          Sections
        </button>
        <button onClick={() => setViewMode('section')}
          className={`px-3 py-1.5 text-sm rounded-md transition ${viewMode === 'section' ? 'bg-white shadow-sm text-iip-gold font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
          UE
        </button>
        <button onClick={() => setViewMode('table')}
          className={`px-3 py-1.5 text-sm rounded-md transition ${viewMode === 'table' ? 'bg-white shadow-sm text-iip-gold font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
          Tableau global
        </button>
        <button onClick={() => setViewMode('activites')}
          className={`px-3 py-1.5 text-sm rounded-md transition ${viewMode === 'activites' ? 'bg-white shadow-sm text-iip-gold font-medium' : 'text-gray-500 hover:text-gray-700'}`}>
          <IconTarget size={15} className="inline align-[-2px] mr-1" />Activités
        </button>
      </div>

      {/* ── Vue Sections : tableau de gestion des sections ── */}
      {viewMode === 'sections' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-gray-500 border-b border-gray-200">
                <th className="text-left px-3 py-2">Code</th>
                <th className="text-left px-3 py-2">Libellé</th>
                <th className="text-center px-3 py-2">Niveau</th>
                <th className="text-left px-3 py-2">Responsable</th>
                <th className="text-center px-3 py-2">Code FWB</th>
                <th className="text-right px-3 py-2">UE</th>
                <th className="text-right px-3 py-2">Cours</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {sections.length === 0 && (
                <tr><td colSpan="8" className="text-center text-gray-400 py-8">Aucune section. Créez-en une avec « Nouvelle section ».</td></tr>
              )}
              {sections.map(s => {
                const grp = structure.find(sg => sg.section && sg.section.toUpperCase() === s.code.toUpperCase());
                const nbUe = grp ? grp.ues.length : 0;
                const nbCours = grp ? grp.ues.reduce((n, u) => n + u.cours.length, 0) : 0;
                return (
                  <tr key={s.code} className="border-b border-gray-100 hover:bg-gray-50">
                    <td className="px-3 py-2 font-semibold text-iip-gold">{s.code}</td>
                    <td className="px-3 py-2 text-gray-700">{s.libelle && s.libelle !== s.code ? s.libelle : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-center">{s.niveau ? <span className="text-xs bg-iip-gold/10 text-iip-gold px-1.5 py-0.5 rounded">{s.niveau}</span> : <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-gray-700">{s.responsable || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-center text-gray-600">{s.code_fwb || <span className="text-gray-300">—</span>}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{nbUe}</td>
                    <td className="px-3 py-2 text-right text-gray-500">{nbCours}</td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => setUeModal({ section: s.code })} className="text-iip-mauve hover:opacity-70 font-bold" title={`Ajouter une UE à ${s.code}`}><IconPlus size={14} /></button>
                      <button onClick={() => setSectionModal({ ...s, _edit: true })} className="text-iip-gold hover:text-iip-amber ml-3" title="Modifier"><IconPencil size={15} /></button>
                      <button onClick={() => delSection(s.code)} className="text-red-400 hover:text-red-600 ml-2" title="Supprimer"><IconTrash size={15} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {viewMode === 'section' && structure.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          Aucune UE pour {annee}. Créez-en une avec « Nouvelle UE ».
        </div>
      )}


      {viewMode === 'section' && (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-gray-50 text-sm text-gray-500 border-b border-gray-200">
                <th className="w-8"></th>
                <th className="text-left px-2 py-2">N° UE</th>
                <th className="text-center px-2 py-2">Bloc</th>
                <th className="text-center px-2 py-2">Niveau</th>
                <th className="text-center px-2 py-2">Quadri</th>
                <th className="text-center px-2 py-2">Réf.</th>
                <th className="text-left px-2 py-2">Nom de l'UE</th>
                <th className="text-right px-2 py-2" title="Somme des périodes prof de tous les cours de l'UE">Pér. prof.</th>
                <th className="text-right px-2 py-2" title="Autonomie (7.2) de l'UE">Aut. 7.2</th>
                <th className="text-right px-2 py-2 text-iip-blue" title="Nombre d'étudiants inscrits à l'UE">Étud.</th>
                <th className="text-right px-2 py-2 text-iip-mauve" title="Périodes étudiant cibles (DP) = cours + autonomie + Z — encodées dans la fiche UE">Pér. étud. DP</th>
                <th className="text-right px-2 py-2">Cours</th>
                <th className="text-right px-2 py-2">Attr.</th>
                <th className="px-2 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {structure.length === 0 && (
                <tr><td colSpan="14" className="text-center text-gray-400 py-8">Aucune UE pour {annee}.</td></tr>
              )}
              {structure.map(sg => {
                const secKey = 'sec:' + sg.section;
                const secOpen = open[secKey];
                const totalCours = sg.ues.reduce((s, u) => s + u.cours.length, 0);
                return (
                  <Fragment key={sg.section}>
                    {/* Bandeau de section (ligne de regroupement) */}
                    <tr className="bg-iip-gold/5 border-t border-gray-200">
                      <td className="px-2 py-2 text-center">
                        <button onClick={() => toggle(secKey)} className="text-iip-gold font-bold">
                          <IconChevronRight size={14} className={`inline-block transition-transform ${secOpen ? 'rotate-90' : ''}`} />
                        </button>
                      </td>
                      <td colSpan="7" className="px-2 py-2 cursor-pointer" onClick={() => toggle(secKey)}>
                        <span className="font-bold text-iip-gold text-sm">{sg.section}</span>
                        {sg.section_niveau && <span className="ml-2 text-xs bg-iip-gold/10 text-iip-gold px-1.5 py-0.5 rounded">{sg.section_niveau}</span>}
                      </td>
                      <td colSpan="6" className="px-2 py-2 text-right text-sm text-gray-500">
                        <button onClick={(e) => { e.stopPropagation(); setGrilleSection(sg.section); }}
                          title={`Répartir l'autonomie de ${sg.section}`}
                          className="mr-3 text-xs px-2 py-1 rounded bg-iip-mauve/10 text-iip-mauve hover:bg-iip-mauve hover:text-white transition font-medium">
                          ⚖ Autonomie
                        </button>
                        {sg.ues.length} UE · {totalCours} cours
                      </td>
                      <td className="px-2 py-2 text-right relative">
                        <button onClick={() => setCatalogueSection(catalogueSection === sg.section ? null : sg.section)}
                          title={`Ajouter une UE à ${sg.section}`}
                          className="w-6 h-6 inline-flex items-center justify-center rounded-full bg-iip-gold/10 hover:bg-iip-gold hover:text-white text-iip-gold font-bold transition"><IconPlus size={14} /></button>
                        {catalogueSection === sg.section && (
                          <div className="absolute right-2 top-full mt-1 z-30 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-64 text-left">
                            <button onClick={() => { setCatalogueOpen(sg.section); setCatalogueSection(null); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-iip-gold/10 flex items-center gap-2">
                              <IconLink size={15} className="text-iip-gold" /><span>Rattacher une UE existante</span>
                            </button>
                            <button onClick={() => { setUeModal({ section: sg.section }); setCatalogueSection(null); }}
                              className="w-full text-left px-3 py-2 text-sm hover:bg-iip-mauve/10 text-iip-mauve border-t border-gray-100 flex items-center gap-2">
                              <span>＋</span><span>Créer une nouvelle UE</span>
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                    {/* UE de la section */}
                    {secOpen && sg.ues.map(ue => {
                      const ueKey = 'ue:' + sg.section + '/' + ue.ue_num;
                      const ueOpen = open[ueKey];
                      const isHelb = ue.et_ref === 'HELB';
                      return (
                        <Fragment key={ue.ue_num}>
                          <tr className={`${
                            activeUE === ueKey
                              ? (isHelb
                                  ? `bg-pink-50 border-t-2 border-pink-400 ${ueOpen ? '' : 'border-b-2'}`
                                  : `bg-iip-gold/5 border-t-2 border-iip-gold/60 ${ueOpen ? '' : 'border-b-2'}`)
                              : (isHelb ? 'bg-pink-50 hover:bg-pink-100/60 border-b border-gray-100 border-l-2 border-l-pink-400' : 'hover:bg-gray-50 border-b border-gray-100')
                          }`}>
                            <td className={`px-2 py-1.5 text-center ${activeUE === ueKey ? (isHelb ? 'border-l-2 border-pink-400' : 'border-l-2 border-iip-gold/60') : ''}`}>
                              <button onClick={() => { toggle(ueKey); setActiveUE(ueKey); }} className="text-iip-gold">
                                <IconChevronRight size={14} className={`inline-block text-sm transition-transform ${ueOpen ? 'rotate-90' : ''}`} />
                              </button>
                            </td>
                            <td className="px-2 py-1.5 font-semibold text-iip-gold whitespace-nowrap cursor-pointer" onClick={() => { toggle(ueKey); setActiveUE(ueKey); }}>UE {ue.ue_num}</td>
                            <td className="px-2 py-1.5 text-center">{ue.ue_niv || '—'}</td>
                            <td className="px-2 py-1.5 text-center">{ue.ue_niveau || '—'}</td>
                            <td className="px-2 py-1.5 text-center">{ue.ue_quad || '—'}</td>
                            <td className="px-2 py-1.5 text-center">
                              {isHelb ? <span className="text-pink-600 font-bold">HELB</span> : (ue.et_ref || '—')}
                            </td>
                            <td className="px-2 py-1.5 cursor-pointer truncate max-w-[280px]" title={ue.ue_nom} onClick={() => { toggle(ueKey); setActiveUE(ueKey); }}>
                              {ue.ue_nom}
                              {ue._orpheline && (
                                <span className="ml-2 text-xs bg-orange-100 text-orange-700 border border-orange-200 rounded px-1.5 py-0.5" title="Des attributions existent pour cette UE mais elle n'a pas de fiche dans le référentiel">
                                  ⚠ fiche manquante
                                </span>
                              )}
                              {ue.sections_partagees && (
                                <span className="ml-2 text-sm text-iip-mauve" title={`Aussi organisée dans : ${ue.sections_partagees.filter(s => s !== sg.section).join(', ')}`}>
                                  partagée
                                </span>
                              )}
                            </td>
                            <td className="px-2 py-1.5 text-right" title="Périodes prof. = somme des cours_per des cours">{ue.calc_per_cours ?? ue.ue_per_cours ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right text-gray-400" title="Autonomie (7.2) saisie dans la fiche UE">{ue.ue_aut ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right text-iip-blue font-medium">{ue.nb_etudiants ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right font-semibold text-iip-mauve">{ue.ue_per_etudiants ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right text-gray-400">{ue.cours.length}</td>
                            <td className="px-2 py-1.5 text-right text-gray-400">{ue.nb_attributions}</td>
                            <td className={`px-2 py-1.5 text-right whitespace-nowrap ${activeUE === ueKey ? (isHelb ? 'border-r-2 border-pink-400' : 'border-r-2 border-iip-gold/60') : ''}`}>
                              <button onClick={() => setUeModal({ ...ue, _edit: true })} className="text-iip-gold hover:text-iip-amber" title="Modifier l'UE"><IconPencil size={15} /></button>
                              <button onClick={() => delUE(ue)} className="text-red-400 hover:text-red-600 ml-2" title="Supprimer"><IconTrash size={15} /></button>
                            </td>
                          </tr>
                          {ueOpen && (
                            <tr className={
                              activeUE === ueKey
                                ? (isHelb ? 'bg-pink-50/60' : 'bg-iip-gold/5')
                                : (isHelb ? 'bg-pink-50/40' : 'bg-gray-50/50')
                            }>
                              <td colSpan="14" className={`px-8 py-2 ${activeUE === ueKey ? (isHelb ? 'border-b-2 border-l-2 border-r-2 border-pink-400' : 'border-b-2 border-l-2 border-r-2 border-iip-gold/60') : ''}`}>
                                <table className="w-full text-sm">
                                  <thead><tr className="text-gray-500 text-xs">
                                    <th className="text-left py-1 pr-2">Code</th>
                                    <th className="text-left">Nom du cours</th>
                                    <th className="text-center px-2" title="Type d'enseignement (CT/PP/CG)">Type</th>
                                    <th className="text-center px-2" title="Code U (Z/B/F/T/P/O)">Code U</th>
                                    <th className="text-right px-2" title="Périodes professeur">Pér. Prof.</th>
                                    <th className="text-right px-2" title="Périodes étudiant">Pér. Étud.</th>
                                    <th className="text-center px-2">Quadri</th>
                                    <th className="text-right px-1">Attr.</th>
                                    <th></th>
                                  </tr></thead>
                                  <tbody>
                                    {ue.cours.map(c => (
                                      <tr key={c.cours_code} className="border-t border-gray-100">
                                        <td className="py-1 font-mono">{c.cours_code}</td>
                                        <td>{c.cours_nom}</td>
                                        <td className="text-center px-1">{["CT","PP","CG"].includes(c.ct_pp) ? <span className={`badge ${{CT:'badge-ct',CG:'badge-cc',PP:'badge-pp',Z:'badge-z',B:'badge-b',F:'badge-f',T:'badge-t',P:'badge-p',O:'badge-o'}[c.ct_pp]}`}>{c.ct_pp}</span> : null}</td>
                                        <td className="text-center px-1">{["Z","B","F","T","P","O"].includes(c.ct_pp) ? <span className={`badge ${{CT:'badge-ct',CG:'badge-cc',PP:'badge-pp',Z:'badge-z',B:'badge-b',F:'badge-f',T:'badge-t',P:'badge-p',O:'badge-o'}[c.ct_pp]}`}>{c.ct_pp}</span> : null}</td>
                                        <td className="text-right px-2 font-semibold tabular-nums">{["Z","B","F","T","P","O"].includes(c.ct_pp) ? <span className="text-gray-300">—</span> : (c.cours_per ?? '—')}</td>
                                        <td className="text-right px-2 tabular-nums">{c.ct_pp === 'Z' ? <span className="font-semibold text-iip-mauve">{c.per_etudiant ?? '—'}</span> : (c.cours_per ?? '—')}</td>
                                        <td className="text-center">{c.quadrimestre_cours || '—'}</td>
                                        <td className="text-right text-gray-400">{c.nb_attributions}</td>
                                        <td className="text-right whitespace-nowrap">
                                          <button onClick={() => setCoursModal({ cours: { ...c, _edit: true }, ueNum: ue.ue_num, section: sg.section })} className="text-iip-mauve hover:opacity-70" title="Modifier"><IconPencil size={15} /></button>
                                          <button onClick={() => delCours(c)} className="text-red-400 hover:text-red-600 ml-2" title="Supprimer"><IconTrash size={15} /></button>
                                        </td>
                                      </tr>
                                    ))}
                                    {ue.cours.length === 0 && <tr><td colSpan="7" className="text-center text-gray-400 py-2">Aucun cours</td></tr>}
                                  </tbody>
                                </table>
                                <button onClick={() => setCoursModal({ cours: {}, ueNum: ue.ue_num, section: sg.section })}
                                  className="mt-2 text-iip-mauve hover:underline"><IconPlus size={15} className="inline align-[-2px] mr-0.5" /> Ajouter un cours</button>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Vue tableau global : toutes les UE triées par numéro */}
      {viewMode === 'table' && (() => {
        // Liste UNIQUE des UE (source primaire), avec la/les section(s) en colonne.
        // Une UE n'apparaît qu'une fois, même si partagée ; "-" si aucune section.
        const parNum = new Map();
        for (const sg of structure) {
          for (const ue of sg.ues) {
            if (!parNum.has(ue.ue_num)) {
              parNum.set(ue.ue_num, { ...ue, _sections: new Set() });
            }
            if (sg.section && sg.section !== '(sans section)') {
              parNum.get(ue.ue_num)._sections.add(sg.section);
            }
          }
        }
        const allUes = [...parNum.values()]
          .map(ue => ({ ...ue, _sectionsLabel: ue._sections.size ? [...ue._sections].sort().join(', ') : '-' }))
          .sort((a, b) => (a.ue_num || 0) - (b.ue_num || 0));
        if (allUes.length === 0) {
          return <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">Aucune UE pour {annee}.</div>;
        }
        return (
          <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-iip-gold/5 text-xs text-gray-600 border-b border-gray-200">
                  <th className="text-left px-3 py-2 w-8"></th>
                  <th className="text-left px-2 py-2">N° UE</th>
                  <th className="text-left px-2 py-2">Section(s)</th>
                  <th className="text-left px-2 py-2">Nom</th>
                  <th className="text-center px-2 py-2">Bloc</th>
                  <th className="text-center px-2 py-2">Niveau</th>
                  <th className="text-center px-2 py-2">Quadri</th>
                  <th className="text-center px-2 py-2">Réf.</th>
                  <th className="text-right px-2 py-2" title="Somme des périodes prof de tous les cours de l'UE">Pér. prof.</th>
                  <th className="text-right px-2 py-2" title="Autonomie (7.2) de l'UE">Aut. 7.2</th>
                <th className="text-right px-2 py-2 text-iip-blue" title="Nombre d'étudiants inscrits à l'UE">Étud.</th>
                  <th className="text-right px-2 py-2">ECTS</th>
                  <th className="text-right px-2 py-2">Cours</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {allUes.map(ue => {
                  const ueKey = 'tbl:' + ue.ue_num;
                  const ueOpen = open[ueKey];
                  const isHelb = ue.et_ref === 'HELB';
                  return (
                    <Fragment key={ueKey}>
                      <tr className={`border-b border-gray-100 hover:bg-gray-50 ${isHelb ? 'bg-pink-50' : ''}`}>
                        <td className="px-3 py-1.5">
                          <button onClick={() => { toggle(ueKey); setActiveUE(ueKey); }} className="text-iip-gold">
                            <IconChevronRight size={14} className={`inline-block text-sm transition-transform ${ueOpen ? 'rotate-90' : ''}`} />
                          </button>
                        </td>
                        <td className="px-2 py-1.5 font-semibold text-iip-gold cursor-pointer" onClick={() => { toggle(ueKey); setActiveUE(ueKey); }}>{ue.ue_num}</td>
                        <td className="px-2 py-1.5 text-xs text-gray-600">{ue._sectionsLabel}</td>
                        <td className="px-2 py-1.5 cursor-pointer" onClick={() => { toggle(ueKey); setActiveUE(ueKey); }}>
                          {ue.ue_nom}
                          {isHelb && <span className="text-xs text-pink-600 font-bold ml-1.5">HELB</span>}
                        </td>
                        <td className="px-2 py-1.5 text-center">{ue.ue_niv || '—'}</td>
                        <td className="px-2 py-1.5 text-center">{ue.ue_niveau || '—'}</td>
                        <td className="px-2 py-1.5 text-center">{ue.ue_quad || '—'}</td>
                        <td className="px-2 py-1.5 text-center">{ue.et_ref || '—'}</td>
                        <td className="px-2 py-1.5 text-right" title="Périodes prof. = somme des cours_per des cours">{ue.calc_per_cours ?? ue.ue_per_cours ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right text-gray-400" title="Autonomie (7.2) saisie dans la fiche UE">{ue.ue_aut ?? '—'}</td>
                            <td className="px-2 py-1.5 text-right text-iip-blue font-medium">{ue.nb_etudiants ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right">{ue.ects ?? '—'}</td>
                        <td className="px-2 py-1.5 text-right text-gray-400">{ue.cours.length}</td>
                        <td className="px-2 py-1.5 text-right whitespace-nowrap">
                          <button onClick={() => setUeModal({ ...ue, _edit: true })} className="text-iip-gold hover:text-iip-amber" title="Modifier l'UE"><IconPencil size={15} /></button>
                          <button onClick={() => delUE(ue)} className="text-red-400 hover:text-red-600 ml-2" title="Supprimer"><IconTrash size={15} /></button>
                        </td>
                      </tr>
                      {ueOpen && (
                        <tr className={isHelb ? 'bg-pink-50/40' : 'bg-gray-50/50'}>
                          <td colSpan="14" className="px-6 py-2">
                            <table className="w-full text-sm">
                              <thead><tr className="text-gray-500 text-xs">
                                <th className="text-left py-1 pr-2">Code</th><th className="text-left">Nom du cours</th>
                                <th className="text-center px-1" title="Type (CT/PP/CG)">Type</th>
                                <th className="text-center px-1" title="Code U (Z/B/F/T/P/O)">Code U</th>
                                <th className="text-right px-2" title="Périodes professeur">Pér. Prof.</th>
                                <th className="text-right px-2" title="Périodes étudiant">Pér. Étud.</th>
                                <th className="text-center px-1">Quadri</th><th className="text-right">Attr.</th><th></th>
                              </tr></thead>
                              <tbody>
                                {ue.cours.map(c => (
                                  <tr key={c.cours_code} className="border-t border-gray-100">
                                    <td className="py-1 font-mono">{c.cours_code}</td>
                                    <td>{c.cours_nom}</td>
                                    <td className="text-center px-1">{["CT","PP","CG"].includes(c.ct_pp) ? <span className={`badge ${{CT:'badge-ct',CG:'badge-cc',PP:'badge-pp',Z:'badge-z',B:'badge-b',F:'badge-f',T:'badge-t',P:'badge-p',O:'badge-o'}[c.ct_pp]}`}>{c.ct_pp}</span> : null}</td>
                                    <td className="text-center px-1">{["Z","B","F","T","P","O"].includes(c.ct_pp) ? <span className={`badge ${{CT:'badge-ct',CG:'badge-cc',PP:'badge-pp',Z:'badge-z',B:'badge-b',F:'badge-f',T:'badge-t',P:'badge-p',O:'badge-o'}[c.ct_pp]}`}>{c.ct_pp}</span> : null}</td>
                                    <td className="text-right px-2 font-semibold tabular-nums">{["Z","B","F","T","P","O"].includes(c.ct_pp) ? <span className="text-gray-300">—</span> : (c.cours_per ?? '—')}</td>
                                    <td className="text-right px-2 tabular-nums">{c.ct_pp === 'Z' ? <span className="font-semibold text-iip-mauve">{c.per_etudiant ?? '—'}</span> : (c.cours_per ?? '—')}</td>
                                    <td className="text-center">{c.quadrimestre_cours || '—'}</td>
                                    <td className="text-right text-gray-400">{c.nb_attributions}</td>
                                    <td className="text-right whitespace-nowrap">
                                      <button onClick={() => setCoursModal({ cours: { ...c, _edit: true }, ueNum: ue.ue_num, section: ([...ue._sections][0] || null) })} className="text-iip-mauve hover:opacity-70" title="Modifier"><IconPencil size={15} /></button>
                                      <button onClick={() => delCours(c)} className="text-red-400 hover:text-red-600 ml-2" title="Supprimer"><IconTrash size={15} /></button>
                                    </td>
                                  </tr>
                                ))}
                                {ue.cours.length === 0 && <tr><td colSpan="7" className="text-center text-gray-400 py-2">Aucun cours</td></tr>}
                              </tbody>
                            </table>
                            <button onClick={() => setCoursModal({ cours: {}, ueNum: ue.ue_num, section: ([...ue._sections][0] || null) })}
                              className="mt-2 text-iip-mauve hover:underline"><IconPlus size={15} className="inline align-[-2px] mr-0.5" /> Ajouter un cours</button>
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        );
      })()}

      {catalogueSection && <div className="fixed inset-0 z-20" onClick={() => setCatalogueSection(null)} />}
      {catalogueOpen && (
        <CatalogueUEModal section={catalogueOpen}
          onClose={() => setCatalogueOpen(null)}
          onDone={(r) => { setCatalogueOpen(null); load(); if (r?.copiee) alert('UE copiée dans l\'année courante et rattachée à la section.'); }} />
      )}
      {sectionModal && <SectionModal section={sectionModal} onClose={() => setSectionModal(null)} onSaved={() => { setSectionModal(null); load(); }} />}
      {importOpen && (
        <ImportUEAssistant
          source={(annees.find(a => a.code !== annee && a.code === '2025-2026') || annees.find(a => a.code !== annee))?.code}
          cible={annee}
          onClose={() => setImportOpen(false)}
          onDone={(r) => { setImportOpen(false); load(); alert(`Import réussi : ${r.ues} UE, ${r.cours} cours${r.attributions ? `, ${r.attributions} attributions` : ''}.`); }}
        />
      )}
      {effectifsOpen && <EffectifsImportModal annee={annee} onClose={() => setEffectifsOpen(false)} onSaved={() => { setEffectifsOpen(false); load(); }} />}
      {dpImportOpen && <DPImportModal annee={annee} sections={sections} onClose={() => setDpImportOpen(false)} onSaved={() => { setDpImportOpen(false); load(); }} />}
      {ueModal && <UEModal ue={ueModal} sections={sections} onClose={() => setUeModal(null)} onSaved={() => { setUeModal(null); load(); }} />}
      {coursModal && <CoursFormModal {...coursModal} onClose={() => setCoursModal(null)} onSaved={() => { setCoursModal(null); load(); }} />}
      {grilleSection && <GrilleSectionModal section={grilleSection} onClose={() => { setGrilleSection(null); load(); }} />}

      {/* ── Vue Activités ── */}
      {viewMode === 'activites' && <GestionActivites sections={sections} />}
    </div>
  );
}

// ─── Gestion des activités ────────────────────────────────────────────────────
const _tok = () => localStorage.getItem('token');
const _fetch = (url, opts = {}) =>
  fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${_tok()}`, ...opts.headers } }).then(r => r.json());

function GestionActivites({ sections = [] }) {
  const [activites, setActivites]   = useState([]);
  const [loading, setLoading]       = useState(true);
  const [newLibelle, setNewLibelle] = useState('');
  const [newSection, setNewSection] = useState('');
  const [saving, setSaving]         = useState(false);
  const [editId, setEditId]         = useState(null);
  const [editVal, setEditVal]       = useState('');
  const [search, setSearch]         = useState('');
  const [collapsed, setCollapsed]   = useState({}); // { section: true } = replié

  function charger() {
    setLoading(true);
    _fetch('/api/ref/activites?all=1')
      .then(d => setActivites(Array.isArray(d) ? d : []))
      .finally(() => setLoading(false));
  }
  useEffect(() => { charger(); }, []);

  async function creer() {
    if (!newLibelle.trim()) return;
    setSaving(true);
    try {
      await _fetch('/api/ref/activites', {
        method: 'POST',
        body: JSON.stringify({ libelle: newLibelle.trim(), section: newSection || null }),
      });
      setNewLibelle(''); setNewSection('');
      charger();
    } catch(e) { alert(e.message); }
    finally { setSaving(false); }
  }

  async function sauvegarderEdit(id) {
    await _fetch(`/api/ref/activites/${id}`, { method: 'PATCH', body: JSON.stringify({ libelle: editVal }) });
    setEditId(null);
    charger();
  }

  async function changerSection(id, section) {
    await _fetch(`/api/ref/activites/${id}`, { method: 'PATCH', body: JSON.stringify({ section: section || null }) });
    charger();
  }

  async function changerType(id, type_etp) {
    await _fetch(`/api/ref/activites/${id}`, { method: 'PATCH', body: JSON.stringify({ type_etp: type_etp || null }) });
    charger();
  }

  async function supprimer(id, libelle) {
    if (!confirm(`Supprimer l'activité "${libelle}" ?`)) return;
    const r = await _fetch(`/api/ref/activites/${id}`, { method: 'DELETE' });
    if (r.error) { alert(r.error); return; }
    charger();
  }

  // Filtre recherche
  const q = search.trim().toLowerCase();
  const filtre = (a) => !q || (a.libelle || '').toLowerCase().includes(q);

  // Groupes : globales (section null, ue_num null), par section, par cours (ue_num)
  const globales   = activites.filter(a => !a.section && !a.ue_num).filter(filtre);
  const parCours   = activites.filter(a => a.ue_num).filter(filtre);
  const parSection = {};
  for (const a of activites.filter(a => a.section && !a.ue_num).filter(filtre)) {
    (parSection[a.section] ||= []).push(a);
  }
  // Ordonner les sections selon la liste fournie, puis alpha
  const ordreSections = sections.map(s => s.code);
  const sectionsTriees = Object.keys(parSection).sort((a, b) => {
    const ia = ordreSections.indexOf(a), ib = ordreSections.indexOf(b);
    if (ia !== -1 && ib !== -1) return ia - ib;
    if (ia !== -1) return -1; if (ib !== -1) return 1;
    return a.localeCompare(b, 'fr');
  });

  function RowAct({ a }) {
    const isEdit = editId === a.id;
    return (
      <tr className="hover:bg-gray-50 group border-b border-gray-100 last:border-0">
        <td className="px-4 py-2 w-full">
          {isEdit
            ? <input autoFocus value={editVal} onChange={e => setEditVal(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') sauvegarderEdit(a.id); if (e.key === 'Escape') setEditId(null); }}
                className="border border-iip-gold rounded px-3 py-1.5 text-sm w-full" />
            : <span className="text-sm text-gray-700">{a.libelle}</span>}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          {a.ue_num
            ? <span className="text-xs text-gray-400">UE{a.ue_num}</span>
            : <select value={a.section || ''} onChange={e => changerSection(a.id, e.target.value)}
                className="text-xs border border-gray-200 rounded px-1.5 py-0.5 bg-white text-gray-500 cursor-pointer hover:border-iip-gold">
                <option value="">Globale</option>
                {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
              </select>}
        </td>
        <td className="px-3 py-2 whitespace-nowrap">
          <select value={a.type_etp || ''} onChange={e => changerType(a.id, e.target.value)}
            className={`text-xs font-semibold border rounded px-1.5 py-0.5 cursor-pointer outline-none
              ${a.type_etp === 'TH' ? 'bg-slate-100 text-slate-800 border-slate-300'
              : a.type_etp === 'TP' ? 'bg-cyan-50 text-cyan-700 border-cyan-300'
              : a.type_etp === 'COD' ? 'bg-iip-gold/10 text-iip-gold border-iip-gold/40'
              : 'bg-gray-50 text-gray-400 border-gray-200'}`}
            title="Type pour le calcul ETP : TH ÷800, TP ÷1000, COD ÷1440">
            <option value="">— Type —</option>
            <option value="TH">TH (÷800)</option>
            <option value="TP">TP (÷1000)</option>
            <option value="COD">COD (÷1440)</option>
          </select>
        </td>
        <td className="px-3 py-2 text-right whitespace-nowrap">
          <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition">
            {isEdit
              ? <>
                  <button onClick={() => sauvegarderEdit(a.id)} className="text-xs text-iip-gold hover:underline"><IconCheck size={13} className="inline align-[-2px]" /> OK</button>
                  <button onClick={() => setEditId(null)} className="text-xs text-gray-400 hover:underline">Annuler</button>
                </>
              : <>
                  <button onClick={() => { setEditId(a.id); setEditVal(a.libelle); }}
                    className="text-xs text-gray-400 hover:text-iip-gold">Renommer</button>
                  <button onClick={() => supprimer(a.id, a.libelle)}
                    className="text-xs text-gray-400 hover:text-red-500"><IconX size={14} /></button>
                </>}
          </div>
        </td>
      </tr>
    );
  }

  function Bloc({ cle, titre, sousTitre, acts, couleur }) {
    const replie = collapsed[cle];
    return (
      <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
        <button onClick={() => setCollapsed(c => ({ ...c, [cle]: !c[cle] }))}
          className="w-full flex items-center justify-between px-5 py-3 border-b bg-gray-50 hover:bg-gray-100 transition text-left">
          <div>
            <p className={`text-sm font-semibold ${couleur || 'text-gray-700'}`}>
              <IconChevronRight size={14} className={`inline-block transition-transform ${replie ? '' : 'rotate-90'} mr-1 text-gray-400`} />
              {titre} <span className="text-gray-400 font-normal">({acts.length})</span>
            </p>
            {sousTitre && <p className="text-xs text-gray-400 ml-4">{sousTitre}</p>}
          </div>
        </button>
        {!replie && (
          <table className="w-full">
            <tbody>
              {acts.map(a => <RowAct key={a.id} a={a} />)}
              {!acts.length && <tr><td colSpan={4} className="px-4 py-3 text-xs text-gray-400 italic">Aucune</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Formulaire ajout */}
      <div className="bg-white rounded-lg border border-gray-200 px-5 py-4">
        <p className="text-sm font-medium text-gray-700 mb-3">Ajouter une activité</p>
        <div className="flex gap-2 flex-wrap items-end">
          <div className="flex-1 min-w-48">
            <label className="block text-xs text-gray-500 mb-1">Nom</label>
            <input value={newLibelle} onChange={e => setNewLibelle(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && creer()}
              placeholder="ex. Remédiation, Atelier…"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:border-iip-gold outline-none" />
          </div>
          <div>
            <label className="block text-xs text-gray-500 mb-1">Section</label>
            <select value={newSection} onChange={e => setNewSection(e.target.value)}
              className="border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
              <option value="">Globale (toutes sections)</option>
              {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
            </select>
          </div>
          <button onClick={creer} disabled={!newLibelle.trim() || saving}
            className="bg-iip-gold text-white text-sm px-4 py-1.5 rounded hover:bg-iip-amber disabled:opacity-50">
            + Ajouter
          </button>
        </div>
      </div>

      {/* Recherche */}
      <input value={search} onChange={e => setSearch(e.target.value)}
        placeholder="Rechercher une activité…"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:border-iip-gold outline-none" />

      {loading ? <div className="text-center text-gray-400 py-8">Chargement…</div> : (
        <>
          <Bloc cle="__glob" titre="Communes à toutes les sections" sousTitre="Disponibles partout"
            acts={globales} couleur="text-iip-gold" />
          {sectionsTriees.map(sec => (
            <Bloc key={sec} cle={sec} titre={`${sec}`} acts={parSection[sec]} />
          ))}
          {parCours.length > 0 && (
            <Bloc cle="__cours" titre="Spécifiques à un cours" sousTitre="Créées depuis le modal d'un cours" acts={parCours} />
          )}
        </>
      )}
    </div>
  );
}

// build final 2.23.0 frontend 1781716177
