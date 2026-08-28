import { useEffect, useState } from 'react';
import { IconTargetArrow, IconLink, IconUnlink, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Acquis d'apprentissage d'une UE.
 *
 * Les libellés proviennent du dossier pédagogique approuvé par la FWB : ils
 * relèvent du référentiel légal et ne sont modifiables que par l'administrateur.
 * Le rattachement d'un acquis à un cours de l'UE est en revanche du travail
 * pédagogique courant, ouvert aux éditeurs.
 */
export default function AcquisUE({ ueNum, annee, estAdmin }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(null);

  async function charger() {
    try {
      const p = annee ? `?annee=${encodeURIComponent(annee)}` : '';
      const rep = await fetch(`/api/aa/ue/${ueNum}${p}`, { headers: authHeaders() });
      if (!rep.ok) throw new Error('chargement impossible');
      setData(await rep.json());
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { if (ueNum) charger(); /* eslint-disable-next-line */ }, [ueNum, annee]);

  async function rattacher(aaCode, coursCode) {
    setEnCours(aaCode);
    try {
      const rep = await fetch(`/api/aa/${encodeURIComponent(aaCode)}`, {
        method: 'PATCH', headers: authHeaders(),
        body: JSON.stringify({ cours_code: coursCode || null }),
      });
      if (!rep.ok) { setErreur((await rep.json()).error || 'échec'); return; }
      await charger();
    } finally { setEnCours(null); }
  }

  if (erreur) return <div className="text-sm text-red-700 py-3">{erreur}</div>;
  if (!data) return <div className="text-sm text-gray-400 py-3">Chargement…</div>;

  if (!data.acquis.length) {
    return (
      <div className="text-sm text-gray-500 py-4 px-3 border border-dashed border-gray-200 rounded-lg">
        Aucun acquis d'apprentissage encodé pour cette UE.
        <div className="text-xs text-gray-400 mt-1">
          Ils sont extraits automatiquement lors de l'import du dossier pédagogique.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2 text-xs text-gray-500">
        <IconTargetArrow size={15} className="text-iip-turquoise" />
        <span>{data.acquis.length} acquis</span>
        {data.non_rattaches > 0 && (
          <span className="flex items-center gap-1 text-amber-700 font-medium">
            <IconAlertTriangle size={13} /> {data.non_rattaches} non rattaché(s) à un cours
          </span>
        )}
      </div>

      <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
        {data.acquis.map(a => (
          <div key={a.aa_code} className="px-3 py-2.5 flex items-start gap-3 hover:bg-gray-50/60">
            <span className="text-[11px] font-bold text-iip-blue bg-iip-blue/8 px-1.5 py-0.5 rounded flex-none mt-0.5">
              {a.aa_code}
            </span>
            <div className="flex-1 min-w-0">
              <div className="text-[13px] text-gray-800 leading-snug">{a.description}</div>
              <div className="flex items-center gap-2 mt-1.5">
                {a.cours_code
                  ? <IconLink size={13} className="text-emerald-600 flex-none" />
                  : <IconUnlink size={13} className="text-gray-300 flex-none" />}
                <select
                  value={a.cours_code || ''}
                  disabled={enCours === a.aa_code || !data.cours.length}
                  onChange={e => rattacher(a.aa_code, e.target.value)}
                  className="text-[12px] border border-gray-300 rounded px-2 py-1 max-w-[320px] bg-white">
                  <option value="">— non rattaché —</option>
                  {data.cours.map(c => (
                    <option key={c.cours_code} value={c.cours_code}>
                      {c.cours_code} · {c.cours_nom}{c.ct_pp ? ` (${c.ct_pp})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        ))}
      </div>

      {!data.cours.length && (
        <p className="text-[11px] text-amber-700">
          Aucun cours n'est encodé pour cette UE : le rattachement sera possible une
          fois les cours créés.
        </p>
      )}
      {!estAdmin && (
        <p className="text-[11px] text-gray-400">
          Le libellé des acquis provient du dossier pédagogique et n'est modifiable
          que par l'administrateur ; le rattachement à un cours reste ouvert.
        </p>
      )}
    </div>
  );
}
