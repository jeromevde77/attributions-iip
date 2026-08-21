import { useEffect, useState } from 'react';
import {
import { authHeaders } from '../lib/api.js';
  IconFileCheck, IconAlertTriangle, IconCheck, IconPlus, IconTrash,
  IconStethoscope, IconMessage, IconLock, IconX, IconCalendarPlus,
} from '@tabler/icons-react';

const fr = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

const STATUTS_PIECE = {
  manquante:   { label: 'Manquante',    classe: 'bg-red-100 text-red-800' },
  a_demander:  { label: 'À demander',   classe: 'bg-amber-100 text-amber-900' },
  recue:       { label: 'Au dossier',   classe: 'bg-emerald-100 text-emerald-800' },
  transmise:   { label: 'Transmise',    classe: 'bg-emerald-100 text-emerald-800' },
  non_requise: { label: 'Non requise',  classe: 'bg-slate-100 text-slate-500' },
  expiree:     { label: 'Expirée',      classe: 'bg-red-100 text-red-800' },
};

const TYPES_ABSENCE = [
  ['maladie_1j', "Maladie d'un jour"], ['maladie', 'Maladie (plus d\'un jour)'],
  ['maternite', 'Maternité'], ['accident_travail', 'Accident du travail'],
  ['accident_hors_service', 'Accident hors service'], ['anrj', 'Absence non justifiée'],
  ['greve', 'Grève'], ['cad', 'Congé (CAD)'], ['autre', 'Autre'],
];

const TYPES_ENTRETIEN = [
  ['accueil', 'Accueil'], ['suivi', 'Suivi'], ['visite_classe', 'Visite de classe'],
  ['evaluation', 'Évaluation'], ['recadrage', 'Recadrage'],
  ['fin_fonction', 'Fin de fonction'], ['autre', 'Autre'],
];

function Pastille({ statut }) {
  const s = STATUTS_PIECE[statut] || STATUTS_PIECE.manquante;
  return <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold ${s.classe}`}>{s.label}</span>;
}

// ═══ DOSSIER ADMINISTRATIF ═════════════════════════════════════════════════

export function DossierAdmin({ profId, peutEcrire }) {
  const [data, setData] = useState(null);
  const [enCours, setEnCours] = useState(null);

  async function charger() {
    const rep = await fetch(`/api/dossier/${profId}/pieces`, { headers: authHeaders() });
    setData(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [profId]);

  async function majPiece(code, corps) {
    setEnCours(code);
    try {
      await fetch(`/api/dossier/${profId}/pieces/${code}`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify(corps),
      });
      await charger();
    } finally { setEnCours(null); }
  }

  if (!data) return <div className="p-6 text-sm text-slate-400">Chargement…</div>;
  const c = data.completude || {};
  const pct = c.requises ? Math.round(100 * c.completes / c.requises) : 0;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center gap-2">
          <IconFileCheck size={18} className="text-iip-turquoise" />
          <span className="font-semibold text-iip-blue">Dossier administratif</span>
        </div>
        <div className="flex-1 min-w-[160px]">
          <div className="flex justify-between text-xs text-slate-600 mb-1">
            <span>{c.completes} / {c.requises} pièces</span>
            <span>{pct} %</span>
          </div>
          <div className="h-1.5 bg-slate-200 rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${pct === 100 ? 'bg-emerald-500' : pct >= 60 ? 'bg-iip-turquoise' : 'bg-amber-500'}`}
                 style={{ width: `${pct}%` }} />
          </div>
        </div>
        {c.manquantes > 0 && (
          <span className="text-xs font-semibold text-red-700 flex items-center gap-1">
            <IconAlertTriangle size={14} /> {c.manquantes} manquante(s)
          </span>
        )}
      </div>

      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left">Pièce</th>
              <th className="px-3 py-2 text-left w-32">Référence</th>
              <th className="px-3 py-2 text-left w-32">Reçue le</th>
              <th className="px-3 py-2 text-left w-28">Statut</th>
              {peutEcrire && <th className="px-3 py-2 w-36"></th>}
            </tr>
          </thead>
          <tbody>
            {data.pieces.map(p => (
              <tr key={p.code_piece} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-3 py-2">
                  <div className={`${p.statut === 'non_requise' ? 'text-slate-400' : 'text-slate-800'}`}>
                    {p.libelle}
                  </div>
                  {p.titre_intitule && p.code_piece === 'titre' && (
                    <div className="text-[11px] text-slate-500">{p.titre_intitule}</div>
                  )}
                  {p.base_legale && (
                    <div className="text-[10px] text-slate-400 mt-0.5">{p.base_legale}</div>
                  )}
                </td>
                <td className="px-3 py-2 text-slate-600">{p.annexe || '—'}</td>
                <td className="px-3 py-2">
                  {peutEcrire ? (
                    <input type="date" value={p.date_reception || ''}
                      onChange={e => majPiece(p.code_piece, {
                        statut: e.target.value ? 'recue' : 'manquante',
                        date_reception: e.target.value || null,
                      })}
                      disabled={enCours === p.code_piece}
                      className="border border-slate-300 rounded-lg px-2 py-1 text-[13px] w-full" />
                  ) : fr(p.date_reception)}
                </td>
                <td className="px-3 py-2"><Pastille statut={p.statut} /></td>
                {peutEcrire && (
                  <td className="px-3 py-2">
                    <div className="flex gap-1">
                      {p.statut !== 'transmise' && p.statut !== 'non_requise' && (
                        <button onClick={() => majPiece(p.code_piece, {
                            statut: 'transmise', date_reception: p.date_reception,
                            date_transmission: new Date().toISOString().slice(0, 10) })}
                          className="text-[11px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50">
                          GEDI
                        </button>
                      )}
                      {p.statut !== 'non_requise' && (
                        <button onClick={() => majPiece(p.code_piece, { statut: 'non_requise' })}
                          title="Marquer non requise"
                          className="text-[11px] px-2 py-1 rounded border border-slate-300 hover:bg-slate-50 text-slate-500">
                          N/A
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[11px] text-slate-400">
        Les pièces transmises via GEDI portent la date de transmission. Le titre de
        capacité est repris automatiquement de la fiche s'il y est encodé.
      </p>
    </div>
  );
}

// ═══ ABSENCES ═══════════════════════════════════════════════════════════════

export function Absences({ profId, peutEcrire }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);

  async function charger() {
    const rep = await fetch(`/api/dossier/${profId}/absences`, { headers: authHeaders() });
    setData(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [profId]);

  async function creer() {
    const rep = await fetch(`/api/dossier/${profId}/absences`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify(form),
    });
    if (!rep.ok) { alert((await rep.json()).error || 'échec'); return; }
    setForm(null); await charger();
  }

  async function supprimer(id) {
    if (!confirm('Supprimer cette absence ?')) return;
    await fetch(`/api/dossier/absences/${id}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  async function basculer(a, champ) {
    await fetch(`/api/dossier/absences/${a.id}`, {
      method: 'PATCH', headers: authHeaders(),
      body: JSON.stringify({ [champ]: a[champ] ? 0 : 1 }),
    });
    await charger();
  }

  if (!data) return <div className="p-6 text-sm text-slate-400">Chargement…</div>;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <IconStethoscope size={18} className="text-iip-turquoise" />
          <span className="font-semibold text-iip-blue">Absences</span>
          <span className="text-xs text-slate-500">
            {data.jours_annee} jour(s) en {data.annee}
          </span>
        </div>
        {peutEcrire && !form && (
          <button onClick={() => setForm({ type: 'maladie', date_debut: '', date_fin: '' })}
            className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold flex items-center gap-1.5">
            <IconPlus size={15} /> Déclarer une absence
          </button>
        )}
      </div>

      {form && (
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</span>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {TYPES_ABSENCE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Début</span>
              <input type="date" value={form.date_debut}
                onChange={e => setForm(f => ({ ...f, date_debut: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Fin</span>
              <input type="date" value={form.date_fin || ''}
                onChange={e => setForm(f => ({ ...f, date_fin: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Code CAD / DI</span>
              <input value={form.code_cad || ''} placeholder="ex. CAD 12"
                onChange={e => setForm(f => ({ ...f, code_cad: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={creer} disabled={!form.date_debut}
              className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40">
              Enregistrer
            </button>
            <button onClick={() => setForm(null)}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
          </div>
          <p className="text-[11px] text-slate-500">
            L'enregistrement crée les échéances liées : déclaration CAMMAT et, au-delà
            de dix jours ouvrables, organisation du remplacement.
          </p>
        </div>
      )}

      {!data.absences.length && (
        <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl">
          Aucune absence enregistrée.
        </div>
      )}

      {data.absences.map(a => {
        const libelle = TYPES_ABSENCE.find(([v]) => v === a.type)?.[1] || a.type;
        return (
          <div key={a.id} className="border border-slate-200 rounded-xl px-4 py-3 flex items-center gap-3 flex-wrap">
            <div className="text-sm font-semibold text-iip-blue min-w-[150px]">
              {fr(a.date_debut)}{a.date_fin ? ` → ${fr(a.date_fin)}` : ''}
            </div>
            <div className="flex-1 min-w-[140px]">
              <div className="text-sm text-slate-800">{libelle}</div>
              {(a.code_cad || a.motif) && (
                <div className="text-[11px] text-slate-500">{[a.code_cad, a.motif].filter(Boolean).join(' · ')}</div>
              )}
            </div>
            <button onClick={() => peutEcrire && basculer(a, 'cammat_declare')}
              disabled={!peutEcrire}
              className={`text-[11px] px-2 py-1 rounded-full font-bold ${a.cammat_declare
                ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
              CAMMAT {a.cammat_declare ? '✓' : '✗'}
            </button>
            <button onClick={() => peutEcrire && basculer(a, 'certificat_recu')}
              disabled={!peutEcrire}
              className={`text-[11px] px-2 py-1 rounded-full font-bold ${a.certificat_recu
                ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
              Certificat {a.certificat_recu ? '✓' : '✗'}
            </button>
            {a.remplacement_requis === 1 && (
              <span className="text-[11px] px-2 py-1 rounded-full bg-red-100 text-red-800 font-bold">
                Remplacement requis
              </span>
            )}
            {peutEcrire && (
              <button onClick={() => supprimer(a.id)} className="text-slate-300 hover:text-red-600">
                <IconTrash size={16} />
              </button>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ═══ ENTRETIENS ═════════════════════════════════════════════════════════════

export function Entretiens({ profId, peutEcrire, estAdmin }) {
  const [data, setData] = useState(null);
  const [form, setForm] = useState(null);
  const [ouvert, setOuvert] = useState(null);

  async function charger() {
    const rep = await fetch(`/api/dossier/${profId}/entretiens`, { headers: authHeaders() });
    setData(await rep.json());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [profId]);

  async function creer() {
    const rep = await fetch(`/api/dossier/${profId}/entretiens`, {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify(form),
    });
    if (!rep.ok) { alert((await rep.json()).error || 'échec'); return; }
    setForm(null); await charger();
  }

  if (!data) return <div className="p-6 text-sm text-slate-400">Chargement…</div>;

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <IconMessage size={18} className="text-iip-turquoise" />
          <span className="font-semibold text-iip-blue">Entretiens et rendez-vous</span>
        </div>
        {peutEcrire && !form && (
          <button onClick={() => setForm({ type: 'suivi', date_prevue: '', confidentiel: 0 })}
            className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold flex items-center gap-1.5">
            <IconCalendarPlus size={15} /> Planifier
          </button>
        )}
      </div>

      {form && (
        <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Type</span>
              <select value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {TYPES_ENTRETIEN.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Date prévue</span>
              <input type="date" value={form.date_prevue || ''}
                onChange={e => setForm(f => ({ ...f, date_prevue: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Mené par</span>
              <input value={form.mene_par || ''}
                onChange={e => setForm(f => ({ ...f, mene_par: e.target.value }))}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            <label className="text-xs flex items-end gap-2 pb-1.5">
              <input type="checkbox" checked={!!form.confidentiel}
                onChange={e => setForm(f => ({ ...f, confidentiel: e.target.checked ? 1 : 0 }))} />
              <span className="text-slate-700">Confidentiel</span>
            </label>
          </div>
          <div className="flex gap-2">
            <button onClick={creer} disabled={!form.date_prevue && !form.date_tenue}
              className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40">
              Enregistrer
            </button>
            <button onClick={() => setForm(null)}
              className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
          </div>
        </div>
      )}

      {!data.entretiens.length && (
        <div className="text-sm text-slate-500 py-6 text-center border border-dashed border-slate-200 rounded-xl">
          Aucun entretien enregistré.
        </div>
      )}

      {data.entretiens.map(e => {
        const libelle = TYPES_ENTRETIEN.find(([v]) => v === e.type)?.[1] || e.type;
        return (
          <div key={e.id} className="border border-slate-200 rounded-xl px-4 py-3">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="text-sm font-semibold text-iip-blue min-w-[90px]">
                {fr(e.date_tenue || e.date_prevue)}
              </div>
              <div className="flex-1 min-w-[140px]">
                <div className="text-sm text-slate-800 flex items-center gap-2">
                  {libelle}
                  {e.confidentiel === 1 && <IconLock size={13} className="text-slate-400" />}
                </div>
                {e.mene_par && <div className="text-[11px] text-slate-500">{e.mene_par}</div>}
              </div>
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-bold ${e.date_tenue
                ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-900'}`}>
                {e.date_tenue ? 'Tenu' : 'Prévu'}
              </span>
              {(e.compte_rendu_html || e.masque) && (
                <button onClick={() => setOuvert(ouvert === e.id ? null : e.id)}
                  className="text-[12px] text-iip-turquoise font-semibold">
                  {ouvert === e.id ? 'Masquer' : 'Compte rendu'}
                </button>
              )}
            </div>
            {ouvert === e.id && (
              <div className="mt-3 pt-3 border-t border-slate-100 text-sm text-slate-700">
                {e.masque
                  ? <span className="text-slate-400 italic flex items-center gap-1.5">
                      <IconLock size={14} /> Entretien confidentiel — réservé à la direction
                    </span>
                  : <div dangerouslySetInnerHTML={{ __html: e.compte_rendu_html || '' }} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
