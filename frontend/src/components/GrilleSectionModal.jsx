import { useEffect, useState } from 'react';
import { IconPrinter } from '@tabler/icons-react';
import { api, getAnnee } from '../lib/api.js';
import PreviewModal from './PreviewModal.jsx';

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
  const [printHtml, setPrintHtml] = useState(null);
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
    const complement = cours.reduce((s, c) => s + n(c.cours_complement), 0);
    const utilise = placee + complement;
    return { ...ue, cours, autonomie_placee: placee, autonomie_complement: complement,
             autonomie_utilisee: utilise, autonomie_restante: ue.ue_aut - utilise };
  }

  function majChamp(ueNum, coursCode, patch) {
    setUes(prev => prev.map(ue => {
      if (ue.ue_num !== ueNum) return ue;
      const cours = ue.cours.map(c => c.cours_code === coursCode ? { ...c, ...patch } : c);
      return recalcUE(ue, cours);
    }));
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

  // Calcule la répartition de l'autonomie d'une UE (prorata si besoin > enveloppe).
  // besoin(cours) = max(0, (classe+EV1+VC1)×1.2 − DP)
  function calculerParts(coursList, enveloppe) {
    const besoins = coursList.map(c => ({
      code: c.cours_code,
      besoin: Math.max(0, h2p(n(c.heures) + n(c.cours_ev1) + n(c.cours_vc1)) - n(c.cours_per)),
    }));
    const B = besoins.reduce((s, x) => s + x.besoin, 0);
    const E = n(enveloppe);
    let parts;
    if (B === 0) {
      parts = besoins.map(x => ({ code: x.code, val: 0 }));
    } else if (B <= E) {
      parts = besoins.map(x => ({ code: x.code, val: x.besoin }));
    } else {
      const base = besoins.map(x => {
        const exact = x.besoin * E / B;
        return { code: x.code, val: Math.floor(exact), reste: exact - Math.floor(exact) };
      });
      let manque = Math.round(E) - base.reduce((s, x) => s + x.val, 0);
      base.sort((a, b) => b.reste - a.reste);
      for (let i = 0; i < base.length && manque > 0; i++) { base[i].val += 1; manque -= 1; }
      parts = base.map(x => ({ code: x.code, val: x.val }));
    }
    return Object.fromEntries(parts.map(p => [p.code, p.val]));
  }

  // Recalcule + applique la répartition d'une UE à partir d'une liste de cours à jour
  function repartirUE(ueNum, coursMaj) {
    setUes(prev => prev.map(u => {
      if (u.ue_num !== ueNum) return u;
      const liste = coursMaj || u.cours;
      const map = calculerParts(liste, u.ue_aut);
      for (const [code, val] of Object.entries(map)) {
        api.updateCours(code, { cours_autonomie: val }).catch(() => {});
      }
      const cours = liste.map(c => ({ ...c, cours_autonomie: map[c.cours_code] ?? n(c.cours_autonomie) }));
      return recalcUE(u, cours);
    }));
  }

  // Édition d'une cellule heures : recalcule la répartition de l'UE EN TEMPS RÉEL (local, sans sauvegarde)
  function onChangeGrille(ueNum, c, champ, valeur) {
    setUes(prev => prev.map(u => {
      if (u.ue_num !== ueNum) return u;
      const coursMaj = u.cours.map(x => x.cours_code === c.cours_code ? { ...x, [champ]: valeur } : x);
      const map = calculerParts(coursMaj, u.ue_aut);
      const cours = coursMaj.map(x => ({ ...x, cours_autonomie: map[x.cours_code] ?? n(x.cours_autonomie) }));
      return recalcUE(u, cours);
    }));
  }

  // Au blur : sauvegarde les heures du cours édité + l'autonomie (déjà recalculée) de toute l'UE
  function blurGrille(ueNum, c, champ, valeur) {
    setUes(prev => {
      const ue = prev.find(u => u.ue_num === ueNum);
      if (!ue) return prev;
      // L'état local est déjà à jour (recalculé par onChangeGrille) : on persiste tel quel
      for (const x of ue.cours) {
        const payload = { cours_autonomie: n(x.cours_autonomie) };
        if (x.cours_code === c.cours_code) {
          payload.heures = n(x.heures);
          payload.cours_ev1 = n(x.cours_ev1);
          payload.cours_vc1 = n(x.cours_vc1);
        }
        api.updateCours(x.cours_code, payload).catch(() => {});
      }
      return prev;
    });
  }

  // 🪄 Baguette : applique la répartition au prorata à toute l'UE
  function baguette(ue) {
    repartirUE(ue.ue_num, ue.cours);
  }

  // Complément (autonomie affectée librement au prof : activité, surveillances…)
  function onChangeComplement(ueNum, coursCode, valeur) {
    majChamp(ueNum, coursCode, { cours_complement: valeur });
  }
  function blurComplement(coursCode, valeur) {
    sauver(coursCode, { cours_complement: n(valeur) });
  }

  // Génère le document imprimable (même format que la grille de section, avec nos colonnes + TC)
  function imprimer() {
    const S = 'padding:1px 5px;font-size:10px;';
    const SR = S + 'text-align:right;';
    const SC = S + 'text-align:center;';
    const lignesUE = ues.map(ue => {
      const tc = ue.ue_tc === 'x'
        ? '<span style="display:inline-block;background:#eff6ff;color:#1e3a8a;border:1px solid #1e3a8a;font-size:8px;font-weight:700;padding:0 5px;border-radius:3px;margin-left:6px">TC</span>'
        : '';
      const lignesCours = ue.cours.map((c, i) => {
        const dp = n(c.cours_per), auto = n(c.cours_autonomie);
        const totalH = n(c.heures) + n(c.cours_ev1) + n(c.cours_vc1);
        const totalPer = h2p(totalH);
        const comp = n(c.cours_complement);
        return `
          <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
            <td style="${S}padding-left:20px;color:#6b7280;font-family:monospace">${c.cours_code||''}</td>
            <td style="${S}">${c.cours_nom||'—'}</td>
            <td style="${SR}color:#374151">${dp||'—'}</td>
            <td style="${SR}">${n(c.heures)||'—'}</td>
            <td style="${SR}">${n(c.cours_ev1)||'—'}</td>
            <td style="${SR}">${n(c.cours_vc1)||'—'}</td>
            <td style="${SR}color:#1d4ed8">${comp||'—'}</td>
            <td style="${SR}font-weight:600">${totalH||'—'}</td>
            <td style="${SR}color:#7c3aed;font-weight:700">${totalPer||'—'}</td>
            <td style="${SR}color:#f59e0b;font-weight:600">${auto||'—'}</td>
            <td style="${SR}font-weight:700">${dp+auto}</td>
          </tr>`;
      }).join('');
      const restant = ue.autonomie_restante;
      const badgeEnv = restant < 0
        ? `<span style="color:#b91c1c;font-weight:700">Dépassement ${-restant}</span>`
        : `<span style="color:#92740c">Reste ${restant}</span>`;
      return `
        <tr style="background:#f1f5f9;border-left:3px solid ${ue.ue_tc==='x'?'#1e3a8a':'#C9A84C'}">
          <td colspan="6" style="padding:4px 6px 4px 8px;font-weight:700;font-size:11px;color:#111827">
            UE\u00a0${ue.ue_num} — ${ue.ue_nom||''}${tc}
          </td>
          <td colspan="5" style="${SR}font-size:9px;color:#6b7280">DP ${ue.somme_dp} · Enveloppe ${ue.ue_aut} · Utilisé ${ue.autonomie_utilisee||0} · ${badgeEnv}</td>
        </tr>
        ${lignesCours}`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb}@media print{@page{margin:10mm;size:A4 landscape}tr{page-break-inside:avoid}thead{display:table-header-group}}</style>
      </head><body><div style="padding:8mm">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1B2B4B;padding-bottom:6px;margin-bottom:10px">
          <div>
            <div style="font-size:16px;font-weight:700;color:#1B2B4B">Grille de répartition — ${section}</div>
            <div style="font-size:11px;color:#6b7280">Année scolaire ${annee} · classe + EV1 + VC1 → périodes (×1.2) + autonomie</div>
          </div>
          <div style="font-size:9px;color:#9ca3af">Généré le ${new Date().toLocaleDateString('fr-BE')} · Lucie · IIP</div>
        </div>
        <table><thead>
          <tr style="background:#1B2B4B;color:white">
            <th style="padding:3px 5px;text-align:left;font-size:10px">Code</th>
            <th style="padding:3px 5px;text-align:left;font-size:10px">Cours / UE</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">DP</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Classe</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">EV1</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">VC1</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Compl.</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Total h</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">→ pér.</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Auton.</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Total</th>
          </tr>
        </thead><tbody>
          ${lignesUE}
        </tbody></table>
      </div></body></html>`;
    setPrintHtml({ html, nom: `Grille_${section}_${annee}` });
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
          <div className="flex items-center gap-2">
            <button onClick={imprimer} title="Imprimer la grille"
              className="px-3 py-1.5 text-sm rounded-lg bg-slate-800 text-white hover:bg-slate-700 font-medium">
              <IconPrinter size={14} className="inline align-[-2px] mr-1" />Imprimer
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
          </div>
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
              <div key={ue.ue_num} className={`border rounded-lg overflow-hidden ${insuffisant ? 'border-red-400 ring-1 ring-red-300' : 'border-gray-200'} ${ue.ue_tc === 'x' ? 'border-t-2 border-t-blue-900' : ''}`}>
                <div className={`flex items-center justify-between px-3 py-2 border-b ${insuffisant ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-200'}`}>
                  <div className="flex items-center gap-2">
                    <button onClick={() => baguette(ue)} title="Répartir l'autonomie automatiquement (prorata des besoins)"
                      className="text-base hover:scale-110 transition" >🪄</button>
                    <div className="font-semibold text-iip-gold text-sm">
                      UE {ue.ue_num} <span className="text-gray-600 font-normal">· {ue.ue_nom}</span>
                      {ue.ue_tc === 'x' && (
                        <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded bg-iip-turquoise/5 text-iip-blue border border-iip-turquoise font-bold align-middle" title="Unité du tronc commun">TC</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-xs">
                    <span className="text-gray-500">DP : <strong>{ue.somme_dp}</strong> pér.</span>
                    <span className="text-gray-500">Enveloppe : <strong>{ue.ue_aut}</strong></span>
                    <span className="px-2 py-0.5 rounded bg-iip-mauve/10 text-iip-mauve font-medium"
                      title={`Cours ${ue.autonomie_placee || 0} + complément ${ue.autonomie_complement || 0}`}>
                      Utilisé {ue.autonomie_utilisee || 0}/{ue.ue_aut}
                    </span>
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
                      <th className="px-2 py-1.5 font-medium text-center">Complément</th>
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
                              onBlur={e => grille && blurGrille(ue.ue_num, c, 'heures', e.target.value)} />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" step="0.5" className={grille ? inp : inpRO} readOnly={!grille}
                              value={c.cours_ev1 ?? ''}
                              onChange={e => onChangeGrille(ue.ue_num, c, 'cours_ev1', e.target.value)}
                              onBlur={e => grille && blurGrille(ue.ue_num, c, 'cours_ev1', e.target.value)} />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" step="0.5" className={grille ? inp : inpRO} readOnly={!grille}
                              value={c.cours_vc1 ?? ''}
                              onChange={e => onChangeGrille(ue.ue_num, c, 'cours_vc1', e.target.value)}
                              onBlur={e => grille && blurGrille(ue.ue_num, c, 'cours_vc1', e.target.value)} />
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input type="number" min="0" className={`${inp} text-iip-blue font-medium ${saving[c.cours_code] ? 'opacity-50' : ''}`}
                              value={c.cours_complement ?? 0}
                              title="Autonomie donnée au prof (activité, surveillances…) — consomme l'enveloppe"
                              onChange={e => onChangeComplement(ue.ue_num, c.cours_code, e.target.value)}
                              onBlur={e => blurComplement(c.cours_code, e.target.value)} />
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
      {printHtml && <PreviewModal html={printHtml.html} titre={`Grille — ${section}`} nomFichier={printHtml.nom} onClose={() => setPrintHtml(null)} />}
    </div>
  );
}
