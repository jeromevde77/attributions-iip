import { useState, useEffect } from 'react';
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

  const charger = () => authFetch(`/api/nominations/prof/${profId}`).then(d => setNoms(Array.isArray(d) ? d : [])).catch(() => {});

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
              <button type="button" onClick={() => supprimer(n.id)} className="text-gray-400 hover:text-red-500 text-sm">🗑</button>
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

  useEffect(() => {
    if (ueNum) authFetch(`/api/ref/ue/${ueNum}?annee=${encodeURIComponent(annee)}`)
      .then(d => setCoursListe(Array.isArray(d?.cours) ? d.cours : [])).catch(() => {});
  }, [ueNum, annee]);

  const insuffisant = Number(periodes) < (nomination.periodes || 0);

  async function valider() {
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
      }),
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[70]" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-5">
        <h3 className="font-title text-lg text-iip-gold mb-1">Remise au travail</h3>
        <p className="text-sm text-gray-600 mb-3">
          Charge perdue : <strong>{nomination.periodes} pér.</strong> (UE {nomination.ue_num}, FWB {nomination.code_fwb}).
          Réaffectez vers une UE/cours pour un volume ≥ à la charge perdue.
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
            <span className="text-[11px] text-gray-500">Périodes attribuées en RT</span>
            <input type="number" value={periodes} onChange={e => setPeriodes(e.target.value)}
              className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
            {insuffisant && <span className="text-[11px] text-red-600">⚠ Inférieur à la charge perdue ({nomination.periodes} pér.)</span>}
          </label>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
          <button type="button" onClick={valider} disabled={!ueNum || insuffisant}
            className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
            Remettre au travail
          </button>
        </div>
      </div>
    </div>
  );
}
