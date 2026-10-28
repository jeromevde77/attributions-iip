import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { useDroits } from '../lib/droits.js';
import { informer } from '../lib/dialogue.jsx';

/**
 * LE MOTIF PAR DÉFAUT D'UN ACQUIS (3.1.439). La délibération le propose quand l'acquis est en
 * échec et que la case reste vide (`aa.motif_defaut`, lu par la proposition de motivation) —
 * mais aucun écran ne permettait de l'écrire : la route existait, la boucle restait ouverte.
 * Il vit avec l'acquis, dans le référentiel : il ne change pas d'un étudiant à l'autre.
 * Une proposition, jamais une décision : le Conseil ou le chargé de cours la remplace.
 */
export default function MotifsDefautUE({ ueNum }) {
  const [aas, setAas] = useState(null);
  const [brouillon, setBrouillon] = useState({});
  const peut = useDroits().passe('admin', 'editeur');
  useEffect(() => {
    if (!ueNum) return;
    fetch(`/api/acquis/motifs-defaut/${ueNum}`, { headers: authHeaders() })
      .then(r => r.json()).then(j => setAas(Array.isArray(j) ? j : [])).catch(() => setAas([]));
  }, [ueNum]);
  if (!aas) return <p className="text-second text-slate-400">Chargement…</p>;
  if (!aas.length) return <p className="text-second text-slate-400">Aucun acquis encodé pour cette unité.</p>;

  async function enregistrer(a) {
    const texte = brouillon[a.aa_code];
    const rep = await fetch(`/api/acquis/motifs-defaut/${ueNum}/${encodeURIComponent(a.aa_code)}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify({ texte }) });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok) { informer(`❌ ${j.error || 'Refusé'}`); return; }
    setAas(l => l.map(x => x.aa_code === a.aa_code ? { ...x, motif_defaut: j.texte } : x));
    setBrouillon(b => { const n = { ...b }; delete n[a.aa_code]; return n; });
  }

  return (
    <div className="space-y-2">
      <p className="text-second text-slate-500 m-0">Proposé par la délibération quand l’acquis est en échec et que le motif reste vide.
        Le Conseil ou le chargé de cours le remplace ; il n’est jamais écrit d’office.</p>
      {aas.map(a => {
        const enCours = a.aa_code in brouillon;
        return (
          <div key={a.aa_code} className="border-b border-slate-100 pb-2">
            <div className="text-second"><b>{a.aa_code}</b> <span className="text-slate-500">{a.description}</span></div>
            {peut ? (
              <div className="flex items-start gap-2 mt-1">
                <textarea rows={2} className="flex-1 border border-slate-300 rounded-champ px-2 py-1 text-sm" data-reponses="motif-defaut-acquis"
                  value={enCours ? brouillon[a.aa_code] : (a.motif_defaut || '')} placeholder="ex. : l’étudiant n’a pas démontré…"
                  onChange={e => setBrouillon(b => ({ ...b, [a.aa_code]: e.target.value }))} />
                {enCours && <button type="button" className="bouton bouton-fort h-8" onClick={() => enregistrer(a)}>Enregistrer</button>}
              </div>
            ) : <div className="text-second text-slate-600 mt-0.5">{a.motif_defaut || <span className="text-slate-400">—</span>}</div>}
          </div>);
      })}
    </div>
  );
}
