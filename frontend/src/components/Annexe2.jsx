import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconPrinter, IconX } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Attestation du progrès des études — annexe 2 de l'arrêté du 28 mars 2022.
 *
 * Pièce destinée à l'Office des Étrangers : sa forme est imposée et son contenu
 * engage l'établissement. Lucie propose ce qu'elle sait, signale ce qu'elle
 * ignore, et laisse le motif à la main de la direction — c'est une
 * appréciation, non une donnée.
 */
export default function Annexe2({ etudId, annee, onClose }) {
  const [donnees, setDonnees] = useState(null);
  const [motif, setMotif] = useState('');
  const [avis, setAvis] = useState('Néant');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    fetch(`/api/annexe2/donnees/${etudId}?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) { setErreur(j.error); return; }
        setDonnees(j);
      }).catch(e => setErreur(e.message));
  }, [etudId, annee]);

  async function produire() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/annexe2/document', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ etudiant_id: etudId, annee, motif, avis }),
      });
      const j = await rep.json();
      if (!rep.ok) { setErreur(j.error); return; }
      // Fenêtre dédiée : Safari imprime le document parent depuis un cadre.
      const w = window.open('', '_blank');
      if (!w) { setErreur('Fenêtre bloquée. Autorisez les fenêtres surgissantes.'); return; }
      w.document.open(); w.document.write(j.html); w.document.close();
      let lance = false;
      const lancer = () => { if (lance) return; lance = true; w.focus(); w.print(); };
      w.onload = lancer;
      setTimeout(lancer, 500);
    } finally { setEnCours(false); }
  }

  const c = donnees?.credits;

  return (
    <div className="fixed inset-0 bg-black/40 flex items-start justify-center z-50 p-4"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl mt-12 p-5 space-y-4
                      max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between">
          <div>
            <h3 className="text-[15px] font-semibold text-iip-blue">
              Attestation du progrès des études
            </h3>
            <p className="text-[11.5px] text-slate-500">
              Annexe 2 — Office des Étrangers · année {annee}
            </p>
          </div>
          <button onClick={onClose} className="text-slate-400"><IconX size={18} /></button>
        </div>

        {erreur && (
          <div className="px-3 py-2 rounded-lg bg-red-50 border border-red-200
                          text-[12.5px] text-red-800">{erreur}</div>
        )}

        {donnees?.manques?.length > 0 && (
          <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200
                          text-[12px] text-amber-900">
            <div className="flex items-center gap-1.5 font-semibold mb-1">
              <IconAlertTriangle size={14} /> À compléter avant envoi
            </div>
            Lucie ne connaît pas {donnees.manques.join(', ')}. Ces champs apparaîtront
            en pointillés sur le document : cette pièce part à une administration
            fédérale, mieux vaut un blanc qu'une valeur inventée.
          </div>
        )}

        {c && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[['Inscrits', c.inscritsAnnee], ['Acquis cette année', c.acquisAnnee],
              ['Acquis au total', c.acquisTotal], ['Dispense', c.valorises]].map(([l, v]) => (
              <div key={l} className="border border-slate-200 rounded-xl px-3 py-2">
                <div className="text-[10px] uppercase tracking-wide text-slate-500 font-semibold">{l}</div>
                <div className="text-[18px] font-bold text-iip-blue">{v}</div>
              </div>
            ))}
          </div>
        )}

        {c?.sansEcts > 0 && (
          <p className="text-[11.5px] text-amber-800">
            {c.sansEcts} unité(s) sans ECTS au référentiel : le décompte ci-dessus
            les compte pour zéro et sera donc sous-évalué.
          </p>
        )}

        <label className="block text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Raisons pour lesquelles les crédits n'ont pas été obtenus
          </span>
          <input value={motif} onChange={e => setMotif(e.target.value)}
            placeholder="échec aux examens"
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
          <span className="block text-[10px] text-slate-400 mt-0.5">
            Appréciation de la direction : Lucie ne la déduit pas des résultats.
          </span>
        </label>

        <label className="block text-xs">
          <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
            Avis facultatif sur le déroulement des études
          </span>
          <textarea value={avis} onChange={e => setAvis(e.target.value)} rows={2}
            className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
        </label>

        <button onClick={produire} disabled={enCours || !donnees}
          className="flex items-center gap-1.5 px-4 py-2 text-sm bg-iip-blue text-white
                     font-semibold rounded-lg disabled:opacity-40">
          <IconPrinter size={15} /> {enCours ? 'Génération…' : 'Produire le document'}
        </button>

        <p className="text-[11px] text-slate-500">
          Le relevé de notes doit être joint au formulaire, comme le prévoit le modèle.
        </p>
      </div>
    </div>
  );
}
