import { useEffect, useMemo, useState } from 'react';
import { IconUsersGroup } from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
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
    <Fenetre icone={IconUsersGroup} large="moyenne" onFermer={onClose}
      titre={`Répartition — UE ${ueNum}${ueNom ? ` · ${ueNom}` : ''} · ${annee}`}
      pied={data && orgs.length >= 2 ? (<>
        <span />
        <button onClick={onClose} className="bouton">
          Annuler
        </button>
        <button onClick={enregistrer} disabled={saving}
          className="bouton bouton-fort">
          {saving ? 'Enregistrement…' : 'Enregistrer la répartition'}
        </button>
      </>) : null}>
        <div className="space-y-3">
          {erreur && (
            <div className="bloc-etat etat-corriger p-3 text-sm text-red-700">{erreur}</div>
          )}
          {!data && !erreur && <p className="text-sm text-slate-400">Chargement…</p>}

          {data && orgs.length < 2 && (
            <p className="text-sm text-slate-500">
              Cette unité n'a qu'une organisation ({orgs.join(', ') || '1'}) : il n'y a rien à répartir.
            </p>
          )}

          {data && orgs.length >= 2 && (<>
            <p className="text-sm text-slate-500">
              {data.etudiants.length} inscrit(s) ·
              {orgs.map(o => ` org. ${o} : ${compte[o] || 0}`).join(' ·')}
              {' · '}<span className={compte[0] ? 'text-iip-texte font-semibold' : ''}>
                non répartis : {compte[0] || 0}</span>
            </p>

            {coches.size > 0 && (
              <div className="flex items-center gap-2 flex-wrap px-3 py-2 rounded-lg bg-iip-turquoise/10 border border-iip-turquoise/30">
                <span className="text-sm font-semibold text-iip-blue">{coches.size} coché(s) →</span>
                {orgs.map(o => (
                  <button key={o} onClick={() => affecterCoches(o)}
                    className="px-2.5 py-1 text-second font-semibold rounded bg-iip-blue text-white hover:opacity-90">
                    Organisation {o}
                  </button>
                ))}
                <button onClick={() => affecterCoches('')}
                  className="px-2.5 py-1 text-second rounded border border-slate-300 text-slate-600">
                  Non réparti
                </button>
              </div>
            )}

            <table className="w-full text-sm">
              <thead>
                <tr className="text-xs uppercase text-slate-400 text-left">
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
                      {e.id_ecampus && <span className="text-xs text-slate-400 ml-1.5">{e.id_ecampus}</span>}
                    </td>
                    <td className="py-1.5">
                      <select value={affect[e.id] ?? ''}
                        onChange={ev => setAffect(a => ({ ...a, [e.id]: ev.target.value }))}
                        className={`border rounded px-2 py-1 text-sm w-full
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
    </Fenetre>
  );
}
