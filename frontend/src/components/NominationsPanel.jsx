import { useState, useEffect } from 'react';
import { IconTrash } from '@tabler/icons-react';
import { getAnnee } from '../lib/api.js';

const TOKEN = () => localStorage.getItem('token');
const authFetch = (url, opts = {}) =>
  fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}`, ...opts.headers } }).then(r => r.json());

/**
 * Panneau "Engagement à titre définitif" pour la fiche d'un prof.
 * Liste les nominations (code FWB, UE, cours, périodes, type CT/PP/CG)
 * et permet la remise au travail (RT) si une UE n'est plus organisée.
 */
export default function NominationsPanel({ profId }) {
  const annee = getAnnee();
  const [noms, setNoms] = useState([]);
  const [ues, setUes] = useState([]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ code_fwb: '', ue_num: '', cours_code: '', cours_libre: '', periodes: '', type_charge: 'CT', ueAbsente: false });
  const [coursListe, setCoursListe] = useState([]);
  const [rtPour, setRtPour] = useState(null); // nomination en cours de remise au travail
  const [situation, setSituation] = useState([]); // nominations (détail)
  const [attributions, setAttributions] = useState([]); // attributions réelles du prof
  const [bilan, setBilan] = useState(null); // bilan ETP global

  const chargerSituation = () => authFetch(`/api/nominations/prof/${profId}/situation?annee=${encodeURIComponent(annee)}`)
    .then(d => { setSituation(d?.situation || []); setAttributions(d?.attributions || []); setBilan(d?.bilan || null); }).catch(() => {});

  const charger = () => { authFetch(`/api/nominations/prof/${profId}`).then(d => setNoms(Array.isArray(d) ? d : [])).catch(() => {}); chargerSituation(); };

  useEffect(() => { if (profId) charger(); }, [profId]);
  useEffect(() => {
    authFetch(`/api/ref/ue?annee=${encodeURIComponent(annee)}`).then(d => setUes(Array.isArray(d) ? d : [])).catch(() => {});
  }, [annee]);

  // Charger les cours quand une UE est choisie (pour le formulaire)
  useEffect(() => {
    if (form.ue_num) {
      authFetch(`/api/ref/ue/${form.ue_num}?annee=${encodeURIComponent(annee)}`)
        .then(d => {
          setCoursListe(Array.isArray(d?.cours) ? d.cours : []);
          // auto-remplir le code FWB depuis l'UE
          if (d?.ue_code_fwb && !form.code_fwb) setForm(f => ({ ...f, code_fwb: d.ue_code_fwb }));
        }).catch(() => setCoursListe([]));
    }
  }, [form.ue_num, annee]);

  async function ajouter() {
    if (form.ueAbsente) {
      if (!form.cours_libre || !form.periodes) { alert('Nom de cours et périodes requis'); return; }
    } else if (!form.code_fwb || !form.ue_num) { alert('Code FWB et UE requis'); return; }
    await authFetch('/api/nominations', {
      method: 'POST',
      body: JSON.stringify({
        professeur_id: profId,
        code_fwb: form.ueAbsente ? 'INCONNU' : form.code_fwb,
        ue_num: form.ueAbsente ? null : Number(form.ue_num),
        cours_code: form.ueAbsente ? null : (form.cours_code || null),
        cours_libre: form.ueAbsente ? form.cours_libre : null,
        periodes: Number(form.periodes) || 0,
        type_charge: form.type_charge,
      }),
    });
    setForm({ code_fwb: '', ue_num: '', cours_code: '', cours_libre: '', periodes: '', type_charge: 'CT', ueAbsente: false });
    setAdding(false);
    charger();
  }

  async function supprimer(id) {
    if (!confirm('Supprimer cette nomination ?')) return;
    await authFetch(`/api/nominations/${id}`, { method: 'DELETE' });
    charger();
  }

  async function toggleRT(attr) {
    await authFetch(`/api/nominations/attribution/${attr.id}/rt`, {
      method: 'PATCH',
      body: JSON.stringify({ est_rt: attr.est_rt ? 0 : 1 }),
    });
    chargerSituation();
  }

  const totalParType = noms.reduce((acc, n) => {
    acc[n.type_charge || '?'] = (acc[n.type_charge || '?'] || 0) + (n.periodes || 0);
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      {noms.length === 0 && !adding && (
        <p className="text-sm text-gray-400">Aucune nomination définitive enregistrée.</p>
      )}

      {/* Liste des nominations */}
      {noms.length > 0 && (
        <div className="space-y-1.5">
          {noms.map(n => (
            <div key={n.id} className="flex items-center gap-2 border border-gray-200 rounded-lg p-2.5 text-sm">
              <span title="Nomination — attribution verrouillée">🔒</span>
              <div className="flex-1 min-w-0">
                <div className="font-medium text-gray-800 truncate">
                  {n.ue_num
                    ? <>UE {n.ue_num} {n.ue_nom ? `— ${n.ue_nom}` : ''}{n.cours_code ? ` · cours ${n.cours_code}` : ''}</>
                    : <>{n.cours_libre || 'Cours (UE absente)'}</>}
                </div>
                <div className="text-[11px] text-gray-500">
                  Code FWB <span className="font-mono">{n.code_fwb === 'INCONNU' ? 'Code inconnu' : n.code_fwb}</span> · {n.periodes} pér. · {n.type_charge}
                </div>
              </div>
              <button type="button" onClick={() => setRtPour(n)} title="Remise au travail (UE non organisée)"
                className="text-[11px] bg-amber-100 text-amber-700 px-2 py-1 rounded hover:bg-amber-200 whitespace-nowrap">
                RT
              </button>
              <button type="button" onClick={() => supprimer(n.id)} className="text-gray-400 hover:text-red-500 text-sm"><IconTrash size={15} /></button>
            </div>
          ))}
          {/* Totaux par type */}
          <div className="flex gap-3 text-[11px] text-gray-500 pt-1">
            {Object.entries(totalParType).map(([t, p]) => (
              <span key={t} className="bg-gray-100 rounded px-2 py-0.5">{t} : <strong>{Math.round(p*10)/10}</strong> pér.</span>
            ))}
          </div>
        </div>
      )}

      {/* Bilan ETP global de couverture */}
      {bilan && situation.length > 0 && (
        <div className={`border rounded-lg p-3 ${bilan.couvert ? 'border-green-200 bg-green-50/50' : 'border-red-200 bg-red-50/50'}`}>
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-500 uppercase">Couverture (équivalent ETP)</span>
            {bilan.couvert
              ? <span className="text-green-600 font-semibold text-sm">✓ couvert</span>
              : <span className="text-red-600 font-semibold text-sm">manque {bilan.etp_manque} ETP (~{Math.round(bilan.etp_manque*800)} pér. CT)</span>}
          </div>
          <div className="text-[11px] text-gray-500 mt-1">
            ETP nommé <strong>{bilan.etp_nomme}</strong> · couvert <strong>{bilan.etp_couvert}</strong>
            {bilan.etp_rt > 0 && <span> (dont RT {bilan.etp_rt})</span>}
            <span className="text-gray-400"> · CT/PP comptés en équivalent (CT/800, PP/1000)</span>
          </div>
        </div>
      )}

      {/* Congé global : met/lève le congé sur toutes ses attributions */}
      {attributions.length > 0 && (() => {
        const nbConge = attributions.filter(a => a.en_conge).length;
        const nbRemplacables = attributions.filter(a => !a.remplace_attribution_id).length;
        const tousEnConge = nbRemplacables > 0 && attributions.filter(a => !a.remplace_attribution_id).every(a => a.en_conge);
        return (
          <div className="flex items-center justify-between border border-gray-200 rounded-lg p-3">
            <div>
              <div className="text-sm font-medium text-gray-700">Congé</div>
              <div className="text-[11px] text-gray-400">
                {nbConge > 0 ? `${nbConge} ligne(s) en congé (remplacée)` : 'Met toutes ses heures en congé et crée les remplacements'}
              </div>
            </div>
            <button type="button" onClick={async () => {
                const activer = !tousEnConge;
                if (activer && !confirm('Mettre cette personne en congé sur TOUTES ses heures ? Un remplaçant (À désigner) sera créé pour chaque ligne.')) return;
                await authFetch(`/api/nominations/prof/${profId}/conge-global`, {
                  method: 'POST', body: JSON.stringify({ annee, en_conge: activer }),
                });
                chargerSituation();
              }}
              className={`text-xs font-bold px-3 py-1.5 rounded border ${tousEnConge ? 'bg-transparent text-red-600 border-red-500' : 'bg-gray-50 text-gray-500 border-gray-300 hover:border-red-400 hover:text-red-500'}`}>
              {tousEnConge ? 'En congé — réactiver' : 'Mettre en congé (C)'}
            </button>
          </div>
        );
      })()}

      {/* Attributions réelles du prof — cocher celles qui sont de la remise au travail */}
      {attributions.length > 0 && (
        <div className="border border-gray-200 rounded-lg p-3 space-y-1.5">
          <div className="text-xs font-semibold text-gray-500 uppercase mb-1">Ses attributions · cocher la remise au travail</div>
          {attributions.map(a => (
            <div key={a.id} className={`flex items-center gap-2 text-[12px] rounded px-2 py-1.5 ${a.en_conge ? 'opacity-50 bg-gray-100' : a.est_rt ? 'bg-orange-50 border border-red-300' : 'bg-gray-50'}`}>
              <div className="flex-1 min-w-0">
                <span className="font-medium text-gray-800">UE {a.ue_num} · {a.code_cours}</span>
                <span className="text-gray-500"> — {a.cours_nom || ''}</span>
                <span className="text-gray-400"> · {a.total} pér. ({a.type_cours})</span>
                {a.remplace_attribution_id && <span className="text-[9px] text-iip-blue font-bold ml-1">remplacement</span>}
              </div>
              {a.en_conge && <span className="text-[9px] px-1 rounded font-bold text-red-600 border border-red-500 shrink-0">C</span>}
              {a.est_rt && <span className="text-[9px] px-1 rounded font-bold text-orange-600 border border-red-500 shrink-0">RT</span>}
              <label className="flex items-center gap-1 shrink-0 cursor-pointer">
                <input type="checkbox" checked={!!a.est_rt} onChange={() => toggleRT(a)} disabled={!!a.remplace_attribution_id} />
                <span className="text-gray-500">RT</span>
              </label>
            </div>
          ))}
          {bilan && !bilan.couvert && (
            <p className="text-[11px] text-amber-600 pt-1">
              Cochez une attribution comme RT pour compenser la charge manquante, ou créez-en une nouvelle ci-dessous.
            </p>
          )}
        </div>
      )}

      {/* Formulaire d'ajout */}
      {adding ? (
        <div className="border border-iip-gold/40 bg-iip-gold/5 rounded-lg p-3 space-y-2">
          <label className="flex items-center gap-2 text-[12px] text-gray-600">
            <input type="checkbox" checked={form.ueAbsente} onChange={e => setForm(f => ({ ...f, ueAbsente: e.target.checked }))} />
            UE absente de la base de données (ancienne UE — code inconnu)
          </label>
          {form.ueAbsente ? (
            <>
              <div className="bg-amber-50 text-amber-700 text-[11px] rounded px-2 py-1.5">
                Code FWB : <strong>Code inconnu</strong> — saisissez librement le cours et le nombre de périodes.
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block col-span-1">
                  <span className="text-[11px] text-gray-500">Nom du cours</span>
                  <input value={form.cours_libre} onChange={e => setForm(f => ({ ...f, cours_libre: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" placeholder="ex. Anatomie (ancienne UE)" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Périodes</span>
                  <input type="number" value={form.periodes} onChange={e => setForm(f => ({ ...f, periodes: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Type</span>
                  <select value={form.type_charge} onChange={e => setForm(f => ({ ...f, type_charge: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="CT">CT</option><option value="PP">PP</option><option value="CG">CG</option>
                  </select>
                </label>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="text-[11px] text-gray-500">UE</span>
                  <select value={form.ue_num} onChange={e => setForm(f => ({ ...f, ue_num: e.target.value, cours_code: '', code_fwb: '' }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="">— UE —</option>
                    {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
                  </select>
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Cours (optionnel)</span>
                  <select value={form.cours_code} onChange={e => setForm(f => ({ ...f, cours_code: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="">— toute l'UE —</option>
                    {coursListe.map(c => <option key={c.cours_code} value={c.cours_code}>{c.cours_code} — {c.cours_nom}</option>)}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <label className="block">
                  <span className="text-[11px] text-gray-500">Code FWB</span>
                  <input value={form.code_fwb} onChange={e => setForm(f => ({ ...f, code_fwb: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm font-mono" placeholder="ex. 946201U34D1" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Périodes</span>
                  <input type="number" value={form.periodes} onChange={e => setForm(f => ({ ...f, periodes: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                </label>
                <label className="block">
                  <span className="text-[11px] text-gray-500">Type</span>
                  <select value={form.type_charge} onChange={e => setForm(f => ({ ...f, type_charge: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
                    <option value="CT">CT</option><option value="PP">PP</option><option value="CG">CG</option>
                  </select>
                </label>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setAdding(false)} className="text-sm text-gray-500 px-3 py-1.5">Annuler</button>
            <button type="button" onClick={ajouter} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-1.5 rounded font-medium">Ajouter</button>
          </div>
        </div>
      ) : (
        <button type="button" onClick={() => setAdding(true)}
          className="text-sm text-iip-gold hover:text-iip-amber font-medium">
          + Ajouter une nomination
        </button>
      )}

      {/* Dialogue remise au travail */}

      {rtPour && <RTDialog nomination={rtPour} profId={profId} ues={ues} annee={annee}
        onClose={() => setRtPour(null)} onSaved={() => { setRtPour(null); charger(); }} />}
    </div>
  );
}

function RTDialog({ nomination, profId, ues, annee, onClose, onSaved }) {
  const [ueNum, setUeNum] = useState('');
  const [coursCode, setCoursCode] = useState('');
  const [periodes, setPeriodes] = useState(nomination.periodes || 0);
  const [coursListe, setCoursListe] = useState([]);
  const [mode, setMode] = useState('cours'); // 'cours' (périodes) | 'autonomie'

  useEffect(() => {
    if (ueNum) authFetch(`/api/ref/ue/${ueNum}?annee=${encodeURIComponent(annee)}`)
      .then(d => setCoursListe(Array.isArray(d?.cours) ? d.cours : [])).catch(() => {});
  }, [ueNum, annee]);

  async function valider() {
    if (!ueNum || !coursCode) { alert('Choisissez une UE et un cours pour la remise au travail.'); return; }
    await authFetch('/api/nominations/rt', {
      method: 'POST',
      body: JSON.stringify({
        nomination_id: nomination.id,
        professeur_id: profId,
        charge_perdue: nomination.periodes || 0,
        ue_num: Number(ueNum) || null,
        cours_code: coursCode || null,
        periodes: Number(periodes) || 0,
        annee_scolaire: annee,
        mode,
      }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
        <h3 className="font-title text-lg text-iip-gold mb-1">Remise au travail</h3>
        <p className="text-sm text-gray-600 mb-3">
          Charge nommée : <strong>{nomination.periodes} pér.</strong> (UE {nomination.ue_num}, FWB {nomination.code_fwb}).
          Réaffectez les périodes manquantes vers un cours (ou en autonomie). Une ligne sera créée, marquée RT.
        </p>
        <div className="space-y-2">
          <label className="block">
            <span className="text-[11px] text-gray-500">UE de remise au travail</span>
            <select value={ueNum} onChange={e => { setUeNum(e.target.value); setCoursCode(''); }}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
              <option value="">— UE —</option>
              {ues.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-500">Cours</span>
            <select value={coursCode} onChange={e => setCoursCode(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm">
              <option value="">— cours —</option>
              {coursListe.map(c => <option key={c.cours_code} value={c.cours_code}>{c.cours_code} — {c.cours_nom}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-500">Affecter en</span>
            <div className="flex gap-2 mt-1">
              <button type="button" onClick={() => setMode('cours')}
                className={`flex-1 text-sm px-3 py-1.5 rounded border ${mode==='cours' ? 'bg-iip-gold text-white border-iip-gold' : 'bg-white text-gray-600 border-gray-300'}`}>
                Périodes de cours
              </button>
              <button type="button" onClick={() => setMode('autonomie')}
                className={`flex-1 text-sm px-3 py-1.5 rounded border ${mode==='autonomie' ? 'bg-iip-gold text-white border-iip-gold' : 'bg-white text-gray-600 border-gray-300'}`}>
                Autonomie
              </button>
            </div>
          </label>
          <label className="block">
            <span className="text-[11px] text-gray-500">Périodes {mode === 'autonomie' ? "d'autonomie" : 'de cours'} en RT</span>
            <input type="number" value={periodes} onChange={e => setPeriodes(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
          <button type="button" onClick={valider} disabled={!ueNum || !coursCode || !(Number(periodes) > 0)}
            className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
            Remettre au travail
          </button>
        </div>
      </div>
    </div>
  );
}
