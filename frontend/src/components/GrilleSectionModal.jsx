import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Conversion heures (contact étudiant, ×60) → périodes (50 min) : ×1.2
const h2p = (h) => Math.round((Number(h) || 0) * 1.2);

/**
 * Éditeur de répartition d'autonomie — vue d'ensemble d'une section.
 * Pour chaque UE : enveloppe d'autonomie (ue_aut) à répartir entre les cours.
 * Deux modes :
 *  - Manuel : on saisit directement l'autonomie (périodes) par cours.
 *  - Grille étudiant : on saisit un objectif d'heures par cours ; l'outil
 *    calcule l'autonomie nécessaire = objectif_périodes − cours_per (DP).
 */
export default function GrilleSectionModal({ section, onClose }) {
  const [ues, setUes]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode]     = useState('manuel'); // 'manuel' | 'grille'
  const [saving, setSaving] = useState({});        // cours_code -> bool
  const [annee, setAnnee]   = useState('');

  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [section]);

  function charger() {
    setLoading(true);
    api.grilleSection(section)
      .then(d => { setUes(d.ues || []); setAnnee(d.annee || ''); })
      .catch(() => setUes([]))
      .finally(() => setLoading(false));
  }

  // Met à jour une valeur de cours en local (optimiste)
  function majLocal(ueNum, coursCode, champ, valeur) {
    setUes(prev => prev.map(ue => {
      if (ue.ue_num !== ueNum) return ue;
      const cours = ue.cours.map(c => c.cours_code === coursCode ? { ...c, [champ]: valeur } : c);
      const placee = cours.reduce((s, c) => s + (Number(c.cours_autonomie) || 0), 0);
      return { ...ue, cours, autonomie_placee: placee, autonomie_restante: ue.ue_aut - placee };
    }));
  }

  // Sauvegarde l'autonomie d'un cours (auto, au blur)
  async function sauverAutonomie(coursCode, valeur) {
    const v = Number(valeur) || 0;
    setSaving(s => ({ ...s, [coursCode]: true }));
    try {
      await api.updateCours(coursCode, { cours_autonomie: v });
    } catch (e) {
      alert('Erreur : ' + e.message);
      charger(); // resync en cas d'échec (ex. dépassement plafond rejeté par le backend)
    } finally {
      setSaving(s => { const n = { ...s }; delete n[coursCode]; return n; });
    }
  }

  // En mode grille : l'objectif heures fixe l'autonomie = max(0, objectif_pér − DP)
  function appliquerObjectifHeures(ueNum, coursCode, heures, coursPer) {
    const objPer = h2p(heures);
    const autoNecessaire = Math.max(0, objPer - (Number(coursPer) || 0));
    majLocal(ueNum, coursCode, 'heures', heures);
    majLocal(ueNum, coursCode, 'cours_autonomie', autoNecessaire);
  }

  const inp = 'w-16 text-center border border-gray-300 rounded px-1 py-1 text-sm focus:outline-none focus:border-iip-mauve';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col border-t-4 border-iip-mauve">

        {/* En-tête */}
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-title text-lg text-iip-mauve">Répartition de l'autonomie — {section}</h2>
            <p className="text-xs text-gray-500">{annee} · l'autonomie de chaque UE se répartit entre ses cours</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
        </div>

        {/* Sélecteur de mode */}
        <div className="px-5 py-2 border-b border-gray-100 flex items-center gap-3">
          <span className="text-sm text-gray-600">Mode :</span>
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
            <button onClick={() => setMode('manuel')}
              className={`px-3 py-1 text-sm rounded-md transition ${mode === 'manuel' ? 'bg-white shadow text-iip-mauve font-medium' : 'text-gray-500'}`}>
              Autonomie directe
            </button>
            <button onClick={() => setMode('grille')}
              className={`px-3 py-1 text-sm rounded-md transition ${mode === 'grille' ? 'bg-white shadow text-iip-mauve font-medium' : 'text-gray-500'}`}>
              Grille étudiant (heures)
            </button>
          </div>
          <span className="text-xs text-gray-400 ml-auto">
            {mode === 'grille' ? 'Saisissez les heures voulues → l\'autonomie est calculée' : 'Saisissez directement les périodes d\'autonomie'}
          </span>
        </div>

        {/* Contenu */}
        <div className="overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Chargement…</div>
          ) : ues.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Aucune UE dans cette section.</div>
          ) : ues.map(ue => {
            const depasse = ue.autonomie_restante < 0;
            return (
              <div key={ue.ue_num} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Bandeau UE + compteur d'enveloppe */}
                <div className="flex items-center justify-between px-3 py-2 bg-gray-50 border-b border-gray-200">
                  <div className="font-semibold text-iip-gold text-sm">
                    UE {ue.ue_num} <span className="text-gray-600 font-normal">· {ue.ue_nom}</span>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">DP : <strong>{ue.somme_dp}</strong> pér.</span>
                    <span className="text-gray-500">Enveloppe autonomie : <strong>{ue.ue_aut}</strong></span>
                    <span className={`px-2 py-0.5 rounded font-medium ${
                      depasse ? 'bg-red-100 text-red-700'
                        : ue.autonomie_restante === 0 ? 'bg-green-100 text-green-700'
                        : 'bg-amber-100 text-amber-700'}`}>
                      {depasse
                        ? `Dépassement de ${-ue.autonomie_restante} pér.`
                        : `Reste ${ue.autonomie_restante} à placer`}
                    </span>
                  </div>
                </div>

                {/* Tableau des cours */}
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-gray-500 bg-white border-b border-gray-100">
                      <th className="text-left px-3 py-1.5 font-medium">Code</th>
                      <th className="text-left px-3 py-1.5 font-medium">Cours</th>
                      <th className="px-2 py-1.5 font-medium text-center">DP (pér.)</th>
                      {mode === 'grille' && <th className="px-2 py-1.5 font-medium text-center">Objectif (h)</th>}
                      {mode === 'grille' && <th className="px-2 py-1.5 font-medium text-center">→ pér. (×1.2)</th>}
                      <th className="px-2 py-1.5 font-medium text-center">Autonomie</th>
                      <th className="px-2 py-1.5 font-medium text-center">Total cours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ue.cours.map((c, idx) => {
                      const dp = Number(c.cours_per) || 0;
                      const auto = Number(c.cours_autonomie) || 0;
                      return (
                        <tr key={c.cours_code} className={idx % 2 ? 'bg-gray-50/50' : 'bg-white'}>
                          <td className="px-3 py-1.5 font-medium text-gray-700">{c.cours_code}</td>
                          <td className="px-3 py-1.5 text-gray-600 truncate max-w-[260px]" title={c.cours_nom}>{c.cours_nom}</td>
                          <td className="px-2 py-1.5 text-center text-gray-500">{dp || '—'}</td>
                          {mode === 'grille' && (
                            <td className="px-2 py-1.5 text-center">
                              <input type="number" min="0" className={inp}
                                value={c.heures ?? ''}
                                onChange={e => appliquerObjectifHeures(ue.ue_num, c.cours_code, e.target.value, dp)}
                                onBlur={() => { sauverAutonomie(c.cours_code, c.cours_autonomie); api.updateCours(c.cours_code, { heures: Number(c.heures) || 0 }).catch(() => {}); }} />
                            </td>
                          )}
                          {mode === 'grille' && (
                            <td className="px-2 py-1.5 text-center font-semibold text-violet-600">{c.heures ? h2p(c.heures) : '—'}</td>
                          )}
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" className={`${inp} ${saving[c.cours_code] ? 'opacity-50' : ''} text-amber-700 font-medium`}
                              value={auto}
                              disabled={mode === 'grille'}
                              onChange={e => majLocal(ue.ue_num, c.cours_code, 'cours_autonomie', e.target.value)}
                              onBlur={e => sauverAutonomie(c.cours_code, e.target.value)} />
                          </td>
                          <td className="px-2 py-1.5 text-center font-semibold text-gray-700">{dp + auto}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })}
        </div>

        {/* Pied */}
        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-iip-mauve text-white rounded-lg text-sm font-medium hover:opacity-90">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
