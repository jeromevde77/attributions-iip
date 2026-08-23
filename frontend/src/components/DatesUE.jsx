import { useEffect, useMemo, useState } from 'react';
import {
  IconCalendarEvent, IconDeviceFloppy, IconCopy, IconHistory,
  IconAlertTriangle, IconCheck, IconEye, IconRefresh, IconX,
} from '@tabler/icons-react';
import { Btn, KpiCard } from './ui.jsx';
import { authHeaders } from '../lib/api.js';

/**
 * Paramétrage annuel — Dates réelles des unités d'enseignement.
 *
 * Ces dates ne relèvent PAS du référentiel légal : elles se rejouent chaque
 * rentrée. Elles conditionnent tout l'échéancier (comptage au 1/10, conseil
 * des études, publication des résultats et fenêtres de recours).
 */
export default function DatesUE({ annee }) {
  const [data, setData] = useState(null);
  const [chargement, setChargement] = useState(true);
  const [section, setSection] = useState('');
  // Mode d'affichage : chaque établissement a sa logique de lecture — par
  // section (l'usage IIP), par numéro d'UE, par quadrimestre ou par date.
  const [affichage, setAffichage] = useState('section');
  const [filtreSansDates, setFiltreSansDates] = useState(false);
  const [modifs, setModifs] = useState({});          // { [id]: {date_debut, date_fin, nb_semaines} }
  const [selection, setSelection] = useState(new Set());
  const [enregistrement, setEnregistrement] = useState(false);
  const [message, setMessage] = useState(null);
  const [jalonsPour, setJalonsPour] = useState(null); // { organisation, jalons }
  const [groupe, setGroupe] = useState({ date_debut: '', date_fin: '' });

  async function charger() {
    setChargement(true);
    try {
      const p = new URLSearchParams({ annee });
      if (section) p.set('section', section);
      if (filtreSansDates) p.set('sansDates', '1');
      const rep = await fetch(`/api/annuel/dates-ue?${p}`, { headers: authHeaders() });
      setData(await rep.json());
      setModifs({});
      setSelection(new Set());
    } finally { setChargement(false); }
  }

  useEffect(() => { if (annee) charger(); /* eslint-disable-next-line */ }, [annee, section, filtreSansDates]);

  const lignes = data?.lignes || [];
  const nbModifs = Object.keys(modifs).length;

  // Valeur affichée : modification en cours si elle existe, sinon valeur en base
  const val = (l, champ) => (modifs[l.id]?.[champ] ?? l[champ] ?? '');

  function editer(id, champ, valeur) {
    setModifs(m => {
      const ligne = { ...(m[id] || {}), [champ]: valeur };
      // Recalcul automatique du nombre de semaines
      const l = lignes.find(x => x.id === id) || {};
      const d = champ === 'date_debut' ? valeur : (ligne.date_debut ?? l.date_debut);
      const f = champ === 'date_fin' ? valeur : (ligne.date_fin ?? l.date_fin);
      if (d && f && f >= d && champ !== 'nb_semaines') {
        const jours = Math.round((new Date(f) - new Date(d)) / 86400000);
        ligne.nb_semaines = Math.max(1, Math.round(jours / 7));
      }
      return { ...m, [id]: ligne };
    });
  }

  function appliquerAuGroupe() {
    if (!selection.size || (!groupe.date_debut && !groupe.date_fin)) return;
    setModifs(m => {
      const copie = { ...m };
      for (const id of selection) {
        const l = lignes.find(x => x.id === id) || {};
        const ligne = { ...(copie[id] || {}) };
        if (groupe.date_debut) ligne.date_debut = groupe.date_debut;
        if (groupe.date_fin) ligne.date_fin = groupe.date_fin;
        const d = ligne.date_debut ?? l.date_debut;
        const f = ligne.date_fin ?? l.date_fin;
        if (d && f && f >= d) {
          ligne.nb_semaines = Math.max(1, Math.round((new Date(f) - new Date(d)) / 86400000 / 7));
        }
        copie[id] = ligne;
      }
      return copie;
    });
    setMessage({ type: 'ok', texte: `Dates appliquées à ${selection.size} organisation(s). Pensez à enregistrer.` });
  }

  async function enregistrer() {
    if (!nbModifs) return;
    setEnregistrement(true);
    try {
      const charge = Object.entries(modifs).map(([id, v]) => ({ id: Number(id), ...v }));
      const rep = await fetch('/api/annuel/dates-ue', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ lignes: charge }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'échec');
      // Régénérer les échéances liées aux UE
      await fetch('/api/annuel/echeancier/instancier', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee }),
      });
      setMessage({
        type: 'ok',
        texte: `${j.modifiees} organisation(s) enregistrée(s), échéancier mis à jour.` +
               (j.erreurs?.length ? ` ${j.erreurs.length} refusée(s) : dates incohérentes.` : ''),
      });
      await charger();
    } catch (e) {
      setMessage({ type: 'err', texte: e.message });
    } finally { setEnregistrement(false); }
  }

  async function reprendreAnneePrecedente() {
    if (!confirm("Pré-remplir les dates manquantes à partir de l'année précédente, décalées de 52 semaines ?\n\nLes organisations déjà datées ne seront pas modifiées. Les dates obtenues sont à vérifier.")) return;
    const rep = await fetch('/api/annuel/dates-ue/reprendre', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ annee, ecraser: false }),
    });
    const j = await rep.json();
    setMessage({ type: j.appliquees ? 'ok' : 'err', texte: j.message });
    if (j.appliquees) await charger();
  }

  async function voirJalons(id) {
    const rep = await fetch(`/api/annuel/dates-ue/${id}/jalons`, { headers: authHeaders() });
    setJalonsPour(await rep.json());
  }

  // Lignes ordonnées selon le mode choisi, avec en-têtes de groupe éventuels
  const lignesAffichees = useMemo(() => {
    const copie = [...lignes];
    const cmp = {
      section:  (a, b) => (a.section || '').localeCompare(b.section || '') || (a.ue_num - b.ue_num) || ((a.num_organisation || 1) - (b.num_organisation || 1)),
      ue:       (a, b) => (a.ue_num - b.ue_num) || ((a.num_organisation || 1) - (b.num_organisation || 1)),
      quadri:   (a, b) => (a.ue_quad || '').localeCompare(b.ue_quad || '') || (a.ue_num - b.ue_num),
      debut:    (a, b) => (a.date_debut || '9999').localeCompare(b.date_debut || '9999') || (a.ue_num - b.ue_num),
    }[affichage] || ((a, b) => a.ue_num - b.ue_num);
    copie.sort(cmp);

    const cleGroupe = {
      section: l => l.section || 'Sans section',
      quadri:  l => l.ue_quad ? `Quadrimestre ${l.ue_quad}` : 'Sans quadrimestre',
    }[affichage];
    if (!cleGroupe) return copie.map(l => ({ type: 'ligne', l }));

    const out = [];
    let derniere = null;
    for (const l of copie) {
      const g = cleGroupe(l);
      if (g !== derniere) { out.push({ type: 'groupe', libelle: g }); derniere = g; }
      out.push({ type: 'ligne', l });
    }
    return out;
  }, [lignes, affichage]);

  const incoherentes = useMemo(() => lignes.filter(l => {
    const d = val(l, 'date_debut'), f = val(l, 'date_fin');
    return d && f && f < d;
  }).length, [lignes, modifs]);

  const fr = (iso) => iso ? iso.split('-').reverse().join('/') : '—';

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue flex items-center gap-2">
            <IconCalendarEvent size={22} className="text-iip-turquoise" />
            Dates des unités d'enseignement
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Paramétrage annuel — ces dates déclenchent le comptage au 1/10, le conseil
            des études, la publication des résultats et les fenêtres de recours.
          </p>
        </div>
        <div className="flex gap-2">
          <Btn variant="secondary" icon={IconHistory} onClick={reprendreAnneePrecedente}>
            Reprendre l'an dernier
          </Btn>
          <Btn variant="secondary" icon={IconRefresh} onClick={charger}>
            Actualiser
          </Btn>
          <Btn variant="primary" icon={IconDeviceFloppy} onClick={enregistrer}
               disabled={!nbModifs || enregistrement}>
            {enregistrement ? 'Enregistrement…' : `Enregistrer${nbModifs ? ` (${nbModifs})` : ''}`}
          </Btn>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between gap-3
          ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                  : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span className="flex items-center gap-2">
            {message.type === 'ok' ? <IconCheck size={16} /> : <IconAlertTriangle size={16} />}
            {message.texte}
          </span>
          <button onClick={() => setMessage(null)}><IconX size={15} /></button>
        </div>
      )}

      {/* Complétude */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <KpiCard label="Organisations d'UE" valeur={data?.total ?? '—'} />
        <KpiCard label="Datées" valeur={data?.datees ?? '—'} ton="good" />
        <KpiCard label="Sans dates" valeur={data?.manquantes ?? '—'}
                 ton={data?.manquantes ? 'bad' : 'neutral'} />
        <KpiCard label="Incohérentes" valeur={incoherentes}
                 ton={incoherentes ? 'bad' : 'neutral'} />
      </div>

      {/* Filtres et saisie groupée */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Section</label>
          <select value={section} onChange={e => setSection(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="">Toutes</option>
            {(data?.sections || []).map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Affichage</label>
          <select value={affichage} onChange={e => setAffichage(e.target.value)}
                  className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm">
            <option value="section">Par section</option>
            <option value="ue">Par n° d'UE</option>
            <option value="quadri">Par quadrimestre</option>
            <option value="debut">Par date de début</option>
          </select>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700 pb-1.5">
          <input type="checkbox" checked={filtreSansDates}
                 onChange={e => setFiltreSansDates(e.target.checked)} />
          Uniquement celles sans dates
        </label>

        <div className="flex-1" />

        <div className="flex items-end gap-2 border-l border-slate-200 pl-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">
              Appliquer à la sélection ({selection.size})
            </label>
            <div className="flex gap-2">
              <input type="date" value={groupe.date_debut}
                     onChange={e => setGroupe(g => ({ ...g, date_debut: e.target.value }))}
                     className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              <input type="date" value={groupe.date_fin}
                     onChange={e => setGroupe(g => ({ ...g, date_fin: e.target.value }))}
                     className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
              <Btn variant="accent" icon={IconCopy} onClick={appliquerAuGroupe} disabled={!selection.size}>
                Appliquer
              </Btn>
            </div>
          </div>
        </div>
      </div>

      {/* Tableau */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                <th className="px-3 py-2 w-9">
                  <input type="checkbox"
                    checked={selection.size > 0 && selection.size === lignes.length}
                    onChange={e => setSelection(e.target.checked ? new Set(lignes.map(l => l.id)) : new Set())} />
                </th>
                <th className="px-3 py-2 text-left">UE</th>
                <th className="px-3 py-2 text-left">Section</th>
                <th className="px-3 py-2 text-left w-14">Org.</th>
                <th className="px-3 py-2 text-left w-40">Début</th>
                <th className="px-3 py-2 text-left w-40">Fin</th>
                <th className="px-3 py-2 text-left w-24">Semaines</th>
                <th className="px-3 py-2 text-left w-24">Profs</th>
                <th className="px-3 py-2 w-16"></th>
              </tr>
            </thead>
            <tbody>
              {chargement && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">Chargement…</td></tr>
              )}
              {!chargement && !lignes.length && (
                <tr><td colSpan={9} className="px-3 py-8 text-center text-slate-400">
                  Aucune organisation d'UE pour ces critères.
                </td></tr>
              )}
              {lignesAffichees.map((item, idx) => {
                if (item.type === 'groupe') {
                  return (
                    <tr key={`g-${idx}`} className="bg-slate-50/80">
                      <td colSpan={9} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-500 border-y border-slate-200">
                        {item.libelle}
                      </td>
                    </tr>
                  );
                }
                const l = item.l;
                const d = val(l, 'date_debut'), f = val(l, 'date_fin');
                const modifiee = !!modifs[l.id];
                const incoherente = d && f && f < d;
                const vide = !d || !f;
                return (
                  <tr key={l.id}
                      className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/60
                        ${modifiee ? 'bg-cyan-50/50' : ''} ${incoherente ? 'bg-red-50' : ''}`}>
                    <td className="px-3 py-1.5">
                      <input type="checkbox" checked={selection.has(l.id)}
                        onChange={e => setSelection(s => {
                          const n = new Set(s);
                          e.target.checked ? n.add(l.id) : n.delete(l.id);
                          return n;
                        })} />
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="font-semibold text-iip-blue">{l.ue_num}</span>
                      {l.is_epreuve_integree === 1 && (
                        <span className="ml-1.5 text-[10px] font-bold px-1.5 py-0.5 rounded bg-iip-turquoise/15 text-iip-blue">EI</span>
                      )}
                      <div className="text-xs text-slate-500 truncate max-w-[260px]">{l.ue_nom || '—'}</div>
                    </td>
                    <td className="px-3 py-1.5 text-slate-600">{l.section}</td>
                    <td className="px-3 py-1.5 text-slate-500">{l.num_organisation}</td>
                    <td className="px-3 py-1.5">
                      <input type="date" value={d}
                        onChange={e => editer(l.id, 'date_debut', e.target.value)}
                        className={`border rounded-lg px-2 py-1 text-sm w-full
                          ${vide ? 'border-amber-300 bg-amber-50/50' : 'border-slate-300'}`} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="date" value={f}
                        onChange={e => editer(l.id, 'date_fin', e.target.value)}
                        className={`border rounded-lg px-2 py-1 text-sm w-full
                          ${incoherente ? 'border-red-400 bg-red-50'
                            : vide ? 'border-amber-300 bg-amber-50/50' : 'border-slate-300'}`} />
                    </td>
                    <td className="px-3 py-1.5">
                      <input type="number" min="1" value={val(l, 'nb_semaines')}
                        onChange={e => editer(l.id, 'nb_semaines', e.target.value)}
                        className="border border-slate-300 rounded-lg px-2 py-1 text-sm w-20" />
                    </td>
                    <td className="px-3 py-1.5">
                      {l.nb_attributions > 0
                        ? <span className="text-emerald-700 font-medium">{l.nb_attributions}</span>
                        : <span className="text-red-600 font-medium flex items-center gap-1">
                            <IconAlertTriangle size={14} /> 0
                          </span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <button onClick={() => voirJalons(l.id)} disabled={vide}
                        title="Aperçu des échéances générées"
                        className="text-slate-400 hover:text-iip-turquoise disabled:opacity-30">
                        <IconEye size={17} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Aperçu des jalons */}
      {jalonsPour && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4"
             onClick={() => setJalonsPour(null)}>
          <div className="bg-white rounded-xl max-w-2xl w-full max-h-[80vh] overflow-auto"
               onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between sticky top-0 bg-white">
              <div>
                <h3 className="font-semibold text-iip-blue">
                  Échéances générées — UE {jalonsPour.organisation?.ue_num}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  du {fr(jalonsPour.organisation?.date_debut)} au {fr(jalonsPour.organisation?.date_fin)}
                </p>
              </div>
              <button onClick={() => setJalonsPour(null)} className="text-slate-400 hover:text-slate-700">
                <IconX size={20} />
              </button>
            </div>
            <div className="p-5 space-y-2">
              {!jalonsPour.jalons?.length && (
                <p className="text-sm text-slate-500">Aucun jalon (dates manquantes).</p>
              )}
              {(jalonsPour.jalons || []).map((j, i) => (
                <div key={i} className="flex items-start gap-3 py-2 border-b border-slate-100 last:border-0">
                  <div className="text-sm font-semibold text-iip-blue w-24 flex-none">{fr(j.date_due)}</div>
                  <div className="flex-1">
                    <div className="text-sm text-slate-800">{j.libelle}</div>
                    {j.base_legale && (
                      <div className="text-[11px] text-slate-400 mt-0.5">{j.base_legale}</div>
                    )}
                  </div>
                  <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 flex-none">
                    {j.responsable || '—'}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
