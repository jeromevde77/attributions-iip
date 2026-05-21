import { useEffect, useState } from 'react';
import { api, getAnnee } from '../lib/api.js';

// ─── Modale UE ───
function UEModal({ ue, sections, onClose, onSaved }) {
  const isNew = !ue?._edit;
  const [form, setForm] = useState({
    ue_num: ue?.ue_num || '', ue_nom: ue?.ue_nom || '', section: ue?.section || (sections[0]?.code || ''),
    ue_niv: ue?.ue_niv || '', ue_niveau: ue?.ue_niveau || '', ue_quad: ue?.ue_quad || '',
    ue_per_cours: ue?.ue_per_cours || '', ue_aut: ue?.ue_aut || '', ue_code_fwb: ue?.ue_code_fwb || '',
    et_ref: ue?.et_ref || ''
  });
  const [saving, setSaving] = useState(false);
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.ue_num || !form.ue_nom) return alert('Numéro et nom requis');
    setSaving(true);
    try {
      if (isNew) await api.createUE(form);
      else await api.updateUE(ue.ue_num, form);
      onSaved();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border-t-4 border-iip-gold">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-title text-lg text-iip-gold">{isNew ? 'Nouvelle UE' : `Modifier UE ${ue.ue_num}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl">×</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">N° UE *</div>
              <input type="number" value={form.ue_num} onChange={e => set('ue_num', e.target.value)} disabled={!isNew}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm disabled:bg-gray-100" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Section *</div>
              <select value={form.section} onChange={e => set('section', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
              </select></label>
          </div>
          <label className="block"><div className="text-xs text-gray-600 mb-0.5">Nom de l'UE *</div>
            <input value={form.ue_nom} onChange={e => set('ue_nom', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Bloc</div>
              <input value={form.ue_niv} onChange={e => set('ue_niv', e.target.value)} placeholder="BA1"
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Niveau</div>
              <select value={form.ue_niveau} onChange={e => set('ue_niveau', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option><option value="SUP">SUP</option><option value="DS">DS</option>
              </select></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Quadri</div>
              <select value={form.ue_quad} onChange={e => set('ue_quad', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q1/Q2">Q1/Q2</option>
              </select></label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Pér. cours</div>
              <input type="number" value={form.ue_per_cours} onChange={e => set('ue_per_cours', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Autonomie</div>
              <input type="number" value={form.ue_aut} onChange={e => set('ue_aut', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Réf.</div>
              <select value={form.et_ref} onChange={e => set('et_ref', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option><option value="IIP">IIP</option><option value="HELB">HELB</option>
              </select></label>
          </div>
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

// ─── Modale Cours ───
function CoursModal({ cours, ueNum, section, onClose, onSaved }) {
  const isNew = !cours?._edit;
  const [form, setForm] = useState({
    cours_code: cours?.cours_code || '', cours_nom: cours?.cours_nom || '',
    ct_pp: cours?.ct_pp || '', cours_per: cours?.cours_per || '',
    quadrimestre_cours: cours?.quadrimestre_cours || '', ue_niveau: cours?.ue_niveau || ''
  });
  const [saving, setSaving] = useState(false);
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function submit(e) {
    e.preventDefault();
    if (!form.cours_code || !form.cours_nom) return alert('Code et nom requis');
    setSaving(true);
    try {
      if (isNew) await api.createCours({ ...form, ue_num: ueNum, section });
      else await api.updateCours(cours.cours_code, form);
      onSaved();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-md w-full border-t-4 border-iip-mauve">
        <div className="flex items-center justify-between px-5 py-3 border-b">
          <h2 className="font-title text-lg text-iip-mauve">{isNew ? `Nouveau cours (UE ${ueNum})` : `Modifier ${cours.cours_code}`}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl">×</button>
        </div>
        <form onSubmit={submit} className="p-5 space-y-3">
          <label className="block"><div className="text-xs text-gray-600 mb-0.5">Code cours *</div>
            <input value={form.cours_code} onChange={e => set('cours_code', e.target.value)} disabled={!isNew} placeholder="ex: 246.1"
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm font-mono disabled:bg-gray-100" /></label>
          <label className="block"><div className="text-xs text-gray-600 mb-0.5">Nom du cours *</div>
            <input value={form.cours_nom} onChange={e => set('cours_nom', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" /></label>
          <div className="grid grid-cols-3 gap-3">
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Type</div>
              <select value={form.ct_pp} onChange={e => set('ct_pp', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option><option value="CT">CT</option><option value="PP">PP</option>
              </select></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Cours_per</div>
              <input type="number" value={form.cours_per} onChange={e => set('cours_per', e.target.value)}
                className="w-full border border-iip-gold/40 rounded px-3 py-1.5 text-sm bg-iip-gold/5" /></label>
            <label className="block"><div className="text-xs text-gray-600 mb-0.5">Quadri</div>
              <select value={form.quadrimestre_cours} onChange={e => set('quadrimestre_cours', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option><option value="Q1">Q1</option><option value="Q2">Q2</option><option value="Q1/Q2">Q1/Q2</option>
              </select></label>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
            <button type="submit" disabled={saving} className="bg-iip-mauve hover:opacity-90 disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
              {saving ? '…' : isNew ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function Referentiels() {
  const [structure, setStructure] = useState([]);
  const [sections, setSections] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState({});  // sections/UE dépliées
  const [ueModal, setUeModal] = useState(null);
  const [coursModal, setCoursModal] = useState(null);
  const annee = getAnnee();

  async function load() {
    setLoading(true);
    try {
      const [s, secs] = await Promise.all([api.refStructure(), api.sections()]);
      setStructure(s); setSections(secs);
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

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h1 className="text-2xl font-title text-iip-gold">Référentiels <span className="text-base font-normal text-gray-400">· {annee}</span></h1>
        <button onClick={() => setUeModal({})} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-2 rounded font-medium">➕ Nouvelle UE</button>
      </div>

      <p className="text-xs text-gray-500 bg-gray-50 rounded px-3 py-2 border border-gray-200">
        Gérez la structure académique de l'année <b>{annee}</b> : sections, UE et cours.
        Les modifications n'affectent que cette année. La suppression est bloquée s'il existe des attributions.
      </p>

      {structure.length === 0 && (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-400">
          Aucune UE pour {annee}. Créez-en une avec « Nouvelle UE ».
        </div>
      )}

      {structure.map(sg => {
        const secKey = 'sec:' + sg.section;
        const secOpen = open[secKey];
        const totalCours = sg.ues.reduce((s, u) => s + u.cours.length, 0);
        return (
          <div key={sg.section} className="bg-white rounded-lg border border-gray-200 overflow-hidden">
            <button onClick={() => toggle(secKey)} className="w-full flex items-center gap-3 px-4 py-3 hover:bg-iip-gold/10 bg-iip-gold/5 text-left">
              <span className={`text-iip-gold font-bold transition-transform ${secOpen ? 'rotate-90' : ''}`}>▶</span>
              <span className="font-bold text-iip-gold text-lg">{sg.section}</span>
              <span className="text-xs text-gray-500 ml-auto">{sg.ues.length} UE · {totalCours} cours</span>
            </button>
            {secOpen && (
              <div className="divide-y divide-gray-100">
                {sg.ues.map(ue => {
                  const ueKey = 'ue:' + sg.section + '/' + ue.ue_num;
                  const ueOpen = open[ueKey];
                  return (
                    <div key={ue.ue_num}>
                      <div className="flex items-center gap-2 px-5 py-2.5 hover:bg-gray-50">
                        <button onClick={() => toggle(ueKey)} className="flex items-center gap-2 flex-1 text-left min-w-0">
                          <span className={`text-iip-gold text-sm transition-transform ${ueOpen ? 'rotate-90' : ''}`}>▶</span>
                          <span className="font-semibold text-iip-gold text-sm">UE {ue.ue_num}</span>
                          {ue.ue_niv && <span className="text-xs bg-iip-gold/10 text-iip-gold px-1.5 rounded">{ue.ue_niv}</span>}
                          {ue.ue_niveau && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 rounded">{ue.ue_niveau}</span>}
                          {ue.ue_quad && <span className="text-xs bg-gray-100 text-gray-600 px-1.5 rounded">{ue.ue_quad}</span>}
                          <span className="text-sm text-gray-700 truncate">{ue.ue_nom}</span>
                        </button>
                        <span className="text-xs text-gray-400 flex-shrink-0">{ue.cours.length} cours · {ue.nb_attributions} attr.</span>
                        <button onClick={() => setUeModal({ ...ue, _edit: true })} className="text-iip-gold hover:text-iip-amber text-sm" title="Modifier">✏</button>
                        <button onClick={() => delUE(ue)} className="text-red-400 hover:text-red-600 text-sm" title="Supprimer">🗑</button>
                      </div>
                      {ueOpen && (
                        <div className="bg-gray-50/50 pl-10 pr-4 pb-2">
                          <table className="w-full text-sm">
                            <thead><tr className="text-xs text-gray-500">
                              <th className="text-left py-1">Code</th><th className="text-left">Nom</th>
                              <th className="text-center">Type</th><th className="text-right">Cours_per</th>
                              <th className="text-center">Quadri</th><th className="text-right">Attr.</th><th></th>
                            </tr></thead>
                            <tbody>
                              {ue.cours.map(c => (
                                <tr key={c.cours_code} className="border-t border-gray-100">
                                  <td className="py-1.5 font-mono text-xs">{c.cours_code}</td>
                                  <td className="text-xs">{c.cours_nom}</td>
                                  <td className="text-center">{c.ct_pp && <span className={`badge ${c.ct_pp==='CT'?'badge-ct':'badge-pp'}`}>{c.ct_pp}</span>}</td>
                                  <td className="text-right font-semibold">{c.cours_per ?? '—'}</td>
                                  <td className="text-center text-xs">{c.quadrimestre_cours || '—'}</td>
                                  <td className="text-right text-xs text-gray-400">{c.nb_attributions}</td>
                                  <td className="text-right whitespace-nowrap">
                                    <button onClick={() => setCoursModal({ cours: { ...c, _edit: true }, ueNum: ue.ue_num, section: sg.section })} className="text-iip-mauve hover:opacity-70 text-sm" title="Modifier">✏</button>
                                    <button onClick={() => delCours(c)} className="text-red-400 hover:text-red-600 text-sm ml-2" title="Supprimer">🗑</button>
                                  </td>
                                </tr>
                              ))}
                              {ue.cours.length === 0 && <tr><td colSpan="7" className="text-center text-gray-400 py-2 text-xs">Aucun cours</td></tr>}
                            </tbody>
                          </table>
                          <button onClick={() => setCoursModal({ cours: {}, ueNum: ue.ue_num, section: sg.section })}
                            className="mt-2 text-xs text-iip-mauve hover:underline">➕ Ajouter un cours</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      {ueModal && <UEModal ue={ueModal} sections={sections} onClose={() => setUeModal(null)} onSaved={() => { setUeModal(null); load(); }} />}
      {coursModal && <CoursModal {...coursModal} onClose={() => setCoursModal(null)} onSaved={() => { setCoursModal(null); load(); }} />}
    </div>
  );
}
