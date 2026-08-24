import { useEffect, useState } from 'react';
import {
  IconWand, IconRefresh, IconPlus, IconTrash, IconAlertTriangle,
  IconCheck,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

const fr = n => n == null ? '—' : String(n);

/**
 * Calculateur d'ancienneté de service (art. 29ter).
 * Un onglet dans la fiche Carrière du personnel.
 */
export default function CalculateurAnciennete({ profId, estAdmin, peutEcrire, annee }) {
  const [data, setData] = useState(null);
  const [anneeFiltre, setAnneeFiltre] = useState(annee || '');
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState(null);

  async function charger() {
    const rep = await fetch(`/api/anciennete-service/${profId}`, { headers: authHeaders() });
    const j = await rep.json();
    if (rep.ok) setData(j);
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [profId]);

  async function preremplir() {
    if (!anneeFiltre) return;
    const rep = await fetch(`/api/anciennete-service/${profId}/preremplir`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee: anneeFiltre }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setMessage({ type: 'ok', texte: `${j.ajoutes} cours importé(s) depuis les attributions ${anneeFiltre}.` });
    await charger();
  }

  async function sauvegarderLigne() {
    if (!form) return;
    const rep = await fetch(`/api/anciennete-service/${profId}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(form),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setForm(null); await charger();
  }

  async function supprimerLigne(id) {
    if (!confirm('Supprimer ce service ?')) return;
    await fetch(`/api/anciennete-service/service/${id}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  async function synchroniser() {
    if (!confirm('Pousser les totaux calculés vers le Classement (art. 34) et l\'ancienneté PO ? Cette action écrase les valeurs actuelles.')) return;
    const rep = await fetch(`/api/anciennete-service/${profId}/synchroniser`, {
      method: 'POST', headers: authHeaders(),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setMessage({ type: 'ok', texte: `Synchronisé : ${j.total_po} j PO, ${j.total_cours} cours mis à jour dans le Classement.` });
  }

  if (!data) return <div className="p-6 text-sm text-slate-400">Chargement…</div>;

  const { par_annee, total_cours, total_po } = data.calcul;
  const anneesFiltrees = anneeFiltre
    ? par_annee.filter(a => a.annee_scolaire === anneeFiltre)
    : par_annee;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <div className="font-semibold text-iip-blue">Ancienneté de service</div>
          <div className="text-[11.5px] text-slate-500">Art. 29ter — CT : 800 p/an · PP : 1000 p/an · seuil 40 p · ≥ 50 % → 360 j · &lt; 50 % → 180 j</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {peutEcrire && (
            <>
              <select value={anneeFiltre} onChange={e => setAnneeFiltre(e.target.value)}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="">Toutes les années</option>
                {par_annee.map(a => <option key={a.annee_scolaire} value={a.annee_scolaire}>{a.annee_scolaire}</option>)}
                <option value="2026-2027">2026-2027</option>
              </select>
              <button onClick={preremplir} disabled={!anneeFiltre}
                className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1.5 disabled:opacity-40">
                <IconWand size={14} /> Pré-remplir depuis les attributions
              </button>
              <button onClick={() => setForm({ annee_scolaire: anneeFiltre || '', cours_code: '', cours_nom: '', type_cours: 'CT', periodes: '' })}
                className="text-sm px-2.5 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1.5">
                <IconPlus size={14} /> Ajouter
              </button>
            </>
          )}
          {estAdmin && (
            <button onClick={synchroniser}
              className="text-sm px-2.5 py-1.5 rounded-lg bg-iip-blue text-white font-semibold flex items-center gap-1.5">
              <IconRefresh size={14} /> Synchroniser vers Classement
            </button>
          )}
        </div>
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-sm flex items-center justify-between ${message.type === 'ok'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="ml-3 opacity-60 hover:opacity-100">✕</button>
        </div>
      )}

      {form && (
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Année</span>
              <input value={form.annee_scolaire} onChange={e => setForm(f => ({ ...f, annee_scolaire: e.target.value }))}
                placeholder="2026-2027" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
            <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Code cours</span>
              <input value={form.cours_code} onChange={e => setForm(f => ({ ...f, cours_code: e.target.value }))}
                placeholder="246.1" className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
            <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</span>
              <select value={form.type_cours} onChange={e => setForm(f => ({ ...f, type_cours: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                <option value="CT">CT (réf. 800 p)</option>
                <option value="PP">PP (réf. 1000 p)</option>
              </select></label>
            <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Périodes</span>
              <input type="number" min="0" value={form.periodes} onChange={e => setForm(f => ({ ...f, periodes: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
          </div>
          <div className="flex gap-2">
            <button onClick={sauvegarderLigne} disabled={!form.annee_scolaire || !form.cours_code || !form.periodes}
              className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40">
              Enregistrer
            </button>
            <button onClick={() => setForm(null)}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
          </div>
        </div>
      )}

      {/* Détail par année */}
      {anneesFiltrees.map(a => (
        <div key={a.annee_scolaire} className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="px-4 py-2 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
            <span className="font-semibold text-[13px] text-iip-blue">{a.annee_scolaire}</span>
            <div className="flex gap-4 text-[12px] text-slate-500">
              <span>ETP : <b className="text-slate-700">{a.etp_total}</b></span>
              <span>Jours PO : <b className={a.jours_po >= 360 ? 'text-amber-700' : 'text-slate-700'}>{a.jours_po}</b>
                {a.jours_po >= 360 && <span className="ml-1 text-[10px] bg-amber-100 text-amber-800 px-1 rounded">plafonné</span>}
              </span>
            </div>
          </div>
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50/60 border-b border-slate-200 text-[10.5px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 text-left">Cours</th>
                <th className="px-3 py-2 text-left w-16">Type</th>
                <th className="px-3 py-2 text-right w-24">Périodes</th>
                <th className="px-3 py-2 text-right w-20">ETP</th>
                <th className="px-3 py-2 text-right w-28">Jours cours</th>
                {peutEcrire && <th className="px-3 py-2 w-10"></th>}
              </tr>
            </thead>
            <tbody>
              {a.lignes.map((l, i) => (
                <tr key={i} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                  <td className="px-3 py-2">
                    <span className="font-medium text-slate-700">{l.cours_code}</span>
                    {l.cours_nom && <span className="text-slate-400 text-[11.5px] ml-1.5">{l.cours_nom}</span>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="text-[11px] font-bold px-1.5 py-0.5 rounded bg-slate-100 text-slate-600">{l.type_cours}</span>
                  </td>
                  <td className="px-3 py-2 text-right font-medium">
                    {l.periodes}
                    {l.periodes < 40 && <IconAlertTriangle size={12} className="inline ml-1 text-amber-500" title="< 40 périodes : ne compte pas" />}
                  </td>
                  <td className="px-3 py-2 text-right text-slate-500">{l.etp || '—'}</td>
                  <td className="px-3 py-2 text-right">
                    <span className={`font-bold ${l.jours_cours === 360 ? 'text-emerald-700' : l.jours_cours === 180 ? 'text-iip-blue' : 'text-slate-400'}`}>
                      {l.jours_cours} j
                    </span>
                  </td>
                  {peutEcrire && (
                    <td className="px-3 py-2">
                      {estAdmin && <button onClick={() => supprimerLigne(l.id)}
                        className="text-slate-300 hover:text-red-500"><IconTrash size={14} /></button>}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}

      {/* Récapitulatif global */}
      {!anneeFiltre && (
        <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
          <div className="px-4 py-2 bg-iip-blue/5 border-b border-slate-200 font-semibold text-[13px] text-iip-blue">
            Totaux cumulés — toutes années
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4">
            <div className="border border-slate-200 rounded-xl p-3">
              <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Ancienneté PO totale</div>
              <div className="text-2xl font-bold text-iip-blue">{total_po} j</div>
              <div className="text-[11px] text-slate-400">= {Math.floor(total_po / 360)} an{Math.floor(total_po / 360) > 1 ? 's' : ''} + {total_po % 360} j</div>
            </div>
            {total_cours.map(tc => (
              <div key={tc.cours_code} className="border border-slate-200 rounded-xl p-3">
                <div className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">{tc.cours_code}</div>
                <div className="text-2xl font-bold text-iip-blue">{tc.jours} j</div>
                <div className="text-[11px] text-slate-400">{tc.cours_nom || ''}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        Art. 29ter (D. 19-12-2002) · Ancienneté par cours (IIP) · CT = 800 p charge complète · PP = 1000 p ·
        &lt; 40 périodes → 0 jour · ≥ 50 % → 360 j · &lt; 50 % → 180 j · PO plafonné 360 j/an (art. 29bis §3).
        « Synchroniser vers Classement » pousse les totaux vers le registre art. 34.
      </p>
    </div>
  );
}
