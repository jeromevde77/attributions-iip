import { useEffect, useMemo, useState } from 'react';
import { IconX, IconUsersGroup } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * LA RÉPARTITION DANS LES ORGANISATIONS — le geste de la coordination.
 *
 * Une unité à plusieurs organisations se délibère organisation par
 * organisation : encore faut-il que chaque inscrit soit rangé dans la sienne.
 * Rien ne se déduit — c'est la coordination qui sait. On coche des étudiants
 * et on les affecte d'un bouton, ou l'on choisit ligne par ligne ; rien ne
 * s'écrit avant « Enregistrer ».
 */
export default function RepartitionOrganisation({ ueNum, ueNom, annee, onClose, onSaved }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [affect, setAffect] = useState({});       // etudiant_id → num | '' (non réparti)
  const [coches, setCoches] = useState(new Set());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch(`/api/etudiants/repartition?ue_num=${ueNum}&annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => r.json().then(j => ({ ok: r.ok, j })))
      .then(({ ok, j }) => {
        if (!ok) throw new Error(j.error || 'Erreur');
        setData(j);
        setAffect(Object.fromEntries(j.etudiants.map(e => [e.id, e.num_organisation ?? ''])));
      })
      .catch(e => setErreur(e.message));
  }, [ueNum, annee]);

  const orgs = data?.organisations || [];
  const compte = useMemo(() => {
    const c = {};
    for (const v of Object.values(affect)) { const k = v === '' ? 0 : Number(v); c[k] = (c[k] || 0) + 1; }
    return c;
  }, [affect]);

  const basculer = id => setCoches(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
  });
  const affecterCoches = org => {
    setAffect(a => {
      const n = { ...a };
      for (const id of coches) n[id] = org;
      return n;
    });
    setCoches(new Set());
  };

  async function enregistrer() {
    setSaving(true); setErreur(null);
    try {
      const rep = await fetch('/api/etudiants/repartition', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          ue_num: ueNum, annee,
          affectations: Object.entries(affect).map(([id, org]) => ({
            etudiant_id: Number(id), num_organisation: org === '' ? null : Number(org),
          })),
        }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      onSaved?.();
    } catch (e) { setErreur(e.message); }
    finally { setSaving(false); }
  }

  return (
    <div className="fixed inset-0 bg-[rgba(11,21,45,.32)] backdrop-blur-[3px] flex items-center justify-center z-[60] p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex-none flex items-center justify-between px-5 py-3 border-b border-slate-100">
          <h3 className="text-[15px] font-semibold text-iip-blue flex items-center gap-2">
            <IconUsersGroup size={18} className="text-iip-turquoise" />
            Répartition — UE {ueNum}{ueNom ? ` · ${ueNom}` : ''} · {annee}
          </h3>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500"><IconX size={20} /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-3">
          {erreur && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700">{erreur}</div>
          )}
          {!data && !erreur && <p className="text-sm text-slate-400">Chargement…</p>}

          {data && orgs.length < 2 && (
            <p className="text-sm text-slate-500">
              Cette unité n'a qu'une organisation ({orgs.join(', ') || '1'}) : il n'y a rien à répartir.
            </p>
          )}

          {data && orgs.length >= 2 && (<>
            <p className="text-[13px] text-slate-500">
              {data.etudiants.length} inscrit(s) ·
              {orgs.map(o => ` org. ${o} : ${compte[o] || 0}`).join(' ·')}
              {' · '}<span className={compte[0] ? 'text-[#B45309] font-semibold' : ''}>
                non répartis : {compte[0] || 0}</span>
            </p>

            {coches.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg bg-iip-turquoise/10 border border-iip-turquoise/30">
                <span className="text-[13px] font-semibold text-iip-blue">{coches.size} coché(s) →</span>
                {orgs.map(o => (
                  <button key={o} onClick={() => affecterCoches(o)}
                    className="px-2.5 py-1 text-[12px] font-semibold rounded bg-iip-blue text-white hover:opacity-90">
                    Organisation {o}
                  </button>
                ))}
                <button onClick={() => affecterCoches('')}
                  className="px-2.5 py-1 text-[12px] rounded border border-slate-300 text-slate-600">
                  Non réparti
                </button>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="text-[11px] uppercase text-slate-400 text-left">
                  <th className="py-1 w-8">
                    <input type="checkbox"
                      checked={coches.size === data.etudiants.length && data.etudiants.length > 0}
                      onChange={e => setCoches(e.target.checked
                        ? new Set(data.etudiants.map(x => x.id)) : new Set())} />
                  </th>
                  <th className="py-1">Étudiant</th>
                  <th className="py-1 w-40">Organisation</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {data.etudiants.map(e => (
                  <tr key={e.id} className={coches.has(e.id) ? 'bg-iip-turquoise/5' : ''}>
                    <td className="py-1.5">
                      <input type="checkbox" checked={coches.has(e.id)} onChange={() => basculer(e.id)} />
                    </td>
                    <td className="py-1.5">{e.nom} {e.prenom}
                      {e.id_ecampus && <span className="text-[11px] text-slate-400 ml-1.5">{e.id_ecampus}</span>}
                    </td>
                    <td className="py-1.5">
                      <select value={affect[e.id] ?? ''}
                        onChange={ev => setAffect(a => ({ ...a, [e.id]: ev.target.value }))}
                        className={`border rounded px-2 py-1 text-[13px] w-full
                          ${affect[e.id] === '' ? 'border-amber-300 bg-amber-50' : 'border-slate-300 bg-white'}`}>
                        <option value="">— non réparti —</option>
                        {orgs.map(o => <option key={o} value={o}>Organisation {o}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>)}
        </div>

        {data && orgs.length >= 2 && (
          <div className="flex-none flex items-center justify-end gap-2 px-5 py-3 border-t border-slate-100">
            <button onClick={onClose} className="px-3 py-1.5 text-sm border border-slate-300 rounded-lg text-slate-600">
              Annuler
            </button>
            <button onClick={enregistrer} disabled={saving}
              className="px-4 py-1.5 text-sm font-semibold rounded-lg bg-iip-blue text-white disabled:opacity-40">
              {saving ? 'Enregistrement…' : 'Enregistrer la répartition'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
