import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

// Conversion heures (×60 min) → périodes (50 min) : ×1.2
const h2p = (h) => Math.round((Number(h) || 0) * 1.2);
const n = (v) => Number(v) || 0;

/**
 * Répartiteur d'autonomie — vue d'ensemble d'une section.
 * Logique par cours :
 *   total heures = classe (heures) + EV1 + VC1
 *   total périodes = total heures × 1.2
 *   autonomie nécessaire = max(0, total périodes − DP)
 */
export default function GrilleSectionModal({ section, onClose }) {
  const [ues, setUes]       = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode]     = useState('grille'); // 'manuel' | 'grille'
  const [saving, setSaving] = useState({});
  const [annee, setAnnee]   = useState('');

  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [section]);

  function charger() {
    setLoading(true);
    api.grilleSection(section)
      .then(d => { setUes(d.ues || []); setAnnee(d.annee || ''); })
      .catch(() => setUes([]))
      .finally(() => setLoading(false));
  }

  function recalcUE(ue, cours) {
    const placee = cours.reduce((s, c) => s + n(c.cours_autonomie), 0);
    return { ...ue, cours, autonomie_placee: placee, autonomie_restante: ue.ue_aut - placee };
  }

  function majChamp(ueNum, coursCode, patch) {
    setUes(prev => prev.map(ue => {
      if (ue.ue_num !== ueNum) return ue;
      const cours = ue.cours.map(c => c.cours_code === coursCode ? { ...c, ...patch } : c);
      return recalcUE(ue, cours);
    }));
  }

  function recalcAutonomie(c) {
    const totalH = n(c.heures) + n(c.cours_ev1) + n(c.cours_vc1);
    return Math.max(0, h2p(totalH) - n(c.cours_per));
  }

  async function sauver(coursCode, payload) {
    setSaving(s => ({ ...s, [coursCode]: true }));
    try {
      await api.updateCours(coursCode, payload);
    } catch (e) {
      alert('Erreur : ' + e.message);
      charger();
    } finally {
      setSaving(s => { const m = { ...s }; delete m[coursCode]; return m; });
    }
  }

  function onChangeGrille(ueNum, c, champ, valeur) {
    const updated = { ...c, [champ]: valeur };
    const auto = recalcAutonomie(updated);
    majChamp(ueNum, c.cours_code, { [champ]: valeur, cours_autonomie: auto });
  }
  function blurGrille(c, champ, valeur) {
    const updated = { ...c, [champ]: valeur };
    const auto = recalcAutonomie(updated);
    sauver(c.cours_code, {
      heures: n(updated.heures),
      cours_ev1: n(updated.cours_ev1),
      cours_vc1: n(updated.cours_vc1),
      cours_autonomie: auto,
    });
  }

  // 🪄 Baguette : répartit l'enveloppe ue_aut au prorata des besoins de chaque cours.
  // besoin(cours) = max(0, (classe+EV1+VC1)×1.2 − DP)
  // - si somme besoins ≤ enveloppe : chaque cours reçoit son besoin exact
  // - sinon : prorata (E/B), arrondi au plus grand reste pour tomber juste sur E
  async function baguette(ue) {
    const besoins = ue.cours.map(c => ({
      code: c.cours_code,
      besoin: Math.max(0, h2p(n(c.heures) + n(c.cours_ev1) + n(c.cours_vc1)) - n(c.cours_per)),
    }));
    const B = besoins.reduce((s, x) => s + x.besoin, 0);
    const E = n(ue.ue_aut);

    let parts;
    if (B === 0) {
      parts = besoins.map(x => ({ code: x.code, val: 0 }));
    } else if (B <= E) {
      parts = besoins.map(x => ({ code: x.code, val: x.besoin }));
    } else {
      // Prorata avec méthode du plus grand reste pour distribuer exactement E
      const bruts = besoins.map(x => ({ code: x.code, exact: x.besoin * E / B }));
      let base = bruts.map(x => ({ code: x.code, val: Math.floor(x.exact), reste: x.exact - Math.floor(x.exact) }));
      let distribue = base.reduce((s, x) => s + x.val, 0);
      let manque = Math.round(E) - distribue;
      base.sort((a, b) => b.reste - a.reste);
      for (let i = 0; i < base.length && manque > 0; i++) { base[i].val += 1; manque -= 1; }
      parts = base.map(x => ({ code: x.code, val: x.val }));
    }

    // Appliquer en local + sauvegarder
    const map = Object.fromEntries(parts.map(p => [p.code, p.val]));
    setUes(prev => prev.map(u => {
      if (u.ue_num !== ue.ue_num) return u;
      const cours = u.cours.map(c => ({ ...c, cours_autonomie: map[c.cours_code] ?? n(c.cours_autonomie) }));
      return recalcUE(u, cours);
    }));
    for (const p of parts) {
      // sauvegarde silencieuse (sans bloquer l'UI sur chaque ligne)
      api.updateCours(p.code, { cours_autonomie: p.val }).catch(() => {});
    }
  }

  const inp = 'w-14 text-center border border-gray-300 rounded px-1 py-1 text-sm focus:outline-none focus:border-iip-mauve';
  const inpRO = 'w-14 text-center border border-gray-200 rounded px-1 py-1 text-sm bg-gray-50 text-gray-500';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50"
         onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col border-t-4 border-iip-mauve">

        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <div>
            <h2 className="font-title text-lg text-iip-mauve">Répartition de l'autonomie — {section}</h2>
            <p className="text-xs text-gray-500">{annee} · classe + EV1 + VC1 → périodes, comblées par l'autonomie</p>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
        </div>

        <div className="px-5 py-2 border-b border-gray-100 flex items-center gap-3">
          <span className="text-sm text-gray-600">Mode :</span>
          <div className="inline-flex rounded-lg bg-gray-100 p-0.5">
            <button onClick={() => setMode('grille')}
              className={`px-3 py-1 text-sm rounded-md transition ${mode === 'grille' ? 'bg-white shadow text-iip-mauve font-medium' : 'text-gray-500'}`}>
              Grille étudiant (heures)
            </button>
            <button onClick={() => setMode('manuel')}
              className={`px-3 py-1 text-sm rounded-md transition ${mode === 'manuel' ? 'bg-white shadow text-iip-mauve font-medium' : 'text-gray-500'}`}>
              Autonomie directe
            </button>
          </div>
          <span className="text-xs text-gray-400 ml-auto">
            {mode === 'grille' ? "Classe + EV1 + VC1 -> l'autonomie se calcule" : "Saisissez directement les periodes d'autonomie"}
          </span>
        </div>

        <div className="overflow-y-auto p-5 space-y-5">
          {loading ? (
            <div className="p-12 text-center text-gray-400">Chargement…</div>
          ) : ues.length === 0 ? (
            <div className="p-8 text-center text-gray-400">Aucune UE dans cette section.</div>
          ) : ues.map(ue => {
            const depasse = ue.autonomie_restante < 0;
            // Besoin total = somme des besoins (objectifs) ; insuffisant si > enveloppe
            const besoinTotal = ue.cours.reduce((s, c) =>
              s + Math.max(0, h2p(n(c.heures) + n(c.cours_ev1) + n(c.cours_vc1)) - n(c.cours_per)), 0);
            const insuffisant = besoinTotal > n(ue.ue_aut);
            return (
              <div key={ue.ue_num} className={`border rounded-lg overflow-hidden ${insuffisant ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200'}`}>
                <div className={`flex items-center justify-between px-3 py-2 border-b ${insuffisant ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    <button onClick={() => baguette(ue)} title="Répartir l'autonomie automatiquement (prorata des besoins)"
                      className="text-base hover:scale-110 transition" >🪄</button>
                    <div className="font-semibold text-iip-gold text-sm">
                      UE {ue.ue_num} <span className="text-gray-600 font-normal">· {ue.ue_nom}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">DP : <strong>{ue.somme_dp}</strong> pér.</span>
                    <span className="text-gray-500">Enveloppe : <strong>{ue.ue_aut}</strong></span>
                    {insuffisant
                      ? <span className="px-2 py-0.5 rounded font-medium bg-red-100 text-red-700">Besoin {besoinTotal} &gt; enveloppe {ue.ue_aut} · il manque {besoinTotal - n(ue.ue_aut)}</span>
                      : <span className={`px-2 py-0.5 rounded font-medium ${
                          depasse ? 'bg-red-100 text-red-700'
                            : ue.autonomie_restante === 0 ? 'bg-green-100 text-green-700'
                            : 'bg-amber-100 text-amber-700'}`}>
                          {depasse ? `Dépassement de ${-ue.autonomie_restante} pér.` : `Reste ${ue.autonomie_restante} à placer`}
                        </span>}
                  </div>
                </div>

                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs uppercase text-gray-500 bg-white border-b border-gray-100">
                      <th className="text-left px-3 py-1.5 font-medium">Code</th>
                      <th className="text-left px-3 py-1.5 font-medium">Cours</th>
                      <th className="px-2 py-1.5 font-medium text-center">DP</th>
                      <th className="px-2 py-1.5 font-medium text-center">Classe (h)</th>
                      <th className="px-2 py-1.5 font-medium text-center">EV1 (h)</th>
                      <th className="px-2 py-1.5 font-medium text-center">VC1 (h)</th>
                      <th className="px-2 py-1.5 font-medium text-center">Total h</th>
                      <th className="px-2 py-1.5 font-medium text-center">→ pér.</th>
                      <th className="px-2 py-1.5 font-medium text-center">Autonomie</th>
                      <th className="px-2 py-1.5 font-medium text-center">Total cours</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ue.cours.map((c, idx) => {
                      const dp = n(c.cours_per);
                      const auto = n(c.cours_autonomie);
                      const totalH = n(c.heures) + n(c.cours_ev1) + n(c.cours_vc1);
                      const totalPer = h2p(totalH);
                      const grille = mode === 'grille';
                      return (
                        <tr key={c.cours_code} className={idx % 2 ? 'bg-gray-50/50' : 'bg-white'}>
                          <td className="px-3 py-1.5 font-medium text-gray-700">{c.cours_code}</td>
                          <td className="px-3 py-1.5 text-gray-600 truncate max-w-[200px]" title={c.cours_nom}>{c.cours_nom}</td>
                          <td className="px-2 py-1.5 text-center text-gray-500">{dp || '—'}</td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" step="0.5" className={grille ? inp : inpRO} readOnly={!grille}
                              value={c.heures ?? ''}
                              onChange={e => onChangeGrille(ue.ue_num, c, 'heures', e.target.value)}
                              onBlur={e => grille && blurGrille(c, 'heures', e.target.value)} />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" step="0.5" className={grille ? inp : inpRO} readOnly={!grille}
                              value={c.cours_ev1 ?? ''}
                              onChange={e => onChangeGrille(ue.ue_num, c, 'cours_ev1', e.target.value)}
                              onBlur={e => grille && blurGrille(c, 'cours_ev1', e.target.value)} />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" step="0.5" className={grille ? inp : inpRO} readOnly={!grille}
                              value={c.cours_vc1 ?? ''}
                              onChange={e => onChangeGrille(ue.ue_num, c, 'cours_vc1', e.target.value)}
                              onBlur={e => grille && blurGrille(c, 'cours_vc1', e.target.value)} />
                          </td>
                          <td className="px-2 py-1.5 text-center font-medium text-gray-700">{totalH || '—'}</td>
                          <td className="px-2 py-1.5 text-center font-semibold text-violet-600">{totalPer || '—'}</td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" className={`${grille ? inpRO : inp} ${saving[c.cours_code] ? 'opacity-50' : ''} ${grille ? '' : 'text-amber-700 font-medium'}`}
                              value={auto}
                              readOnly={grille}
                              onChange={e => majChamp(ue.ue_num, c.cours_code, { cours_autonomie: e.target.value })}
                              onBlur={e => !grille && sauver(c.cours_code, { cours_autonomie: n(e.target.value) })} />
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

        <div className="px-5 py-3 border-t border-gray-100 flex justify-end">
          <button onClick={onClose} className="px-4 py-2 bg-iip-mauve text-white rounded-lg text-sm font-medium hover:opacity-90">
            Fermer
          </button>
        </div>
      </div>
    </div>
  );
}
