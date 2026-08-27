import { useEffect, useMemo, useRef, useState } from 'react';
import { IconSearch, IconCheck, IconDeviceFloppy } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

/**
 * Encodage rapide des résultats — étudiants en lignes, UE en colonnes.
 *
 * L'année est portée par l'écran et non par la cellule : on délibère une année
 * entière d'un seul tenant. Un clic marque la réussite, deux le refus, trois
 * effacent. Marquer un résultat vaut inscription — celle-ci n'est jamais à
 * saisir séparément.
 *
 * Les acquis des autres années restent visibles en filigrane, avec leur année,
 * pour qu'on sache ce qui est déjà fait sans quitter l'écran.
 */

const CYCLE = [null, 'reussi', 'ajourne'];

const STYLE = {
  reussi:  'bg-emerald-100 text-emerald-800 border-emerald-300',
  ajourne: 'bg-red-100 text-red-700 border-red-300',
  absent:  'bg-slate-100 text-slate-500 border-slate-300',
};
const SIGLE = { reussi: 'C', ajourne: 'R', absent: 'A' };

export default function EncodageRapide() {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [annees, setAnnees] = useState([]);
  const [annee, setAnnee] = useState('');

  const [data, setData] = useState(null);
  const [cellules, setCellules] = useState({});     // "etud|ue" -> resultat
  const [recherche, setRecherche] = useState('');
  const [choisis, setChoisis] = useState(new Set());
  const [niveauLot, setNiveauLot] = useState('');
  const [etat, setEtat] = useState('pret');         // pret | enregistrement | enregistre

  const enAttente = useRef(new Map());
  const minuteur = useRef(null);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => r.json()).then(l => {
        if (Array.isArray(l)) { setSections(l); if (l.length && !section) setSection(l[0].code); }
      }).catch(() => {});
    fetch('/api/etudiants/purge/perimetre', { headers: authHeaders() })
      .then(r => r.json()).then(j => {
        const a = j?.annees || [];
        setAnnees(a); if (a.length && !annee) setAnnee(a[0]);
      }).catch(() => {});
    // eslint-disable-next-line
  }, []);

  async function charger() {
    if (!section || !annee) return;
    setData(null);
    const rep = await fetch(
      `/api/etudiants/matrice?annee=${annee}&section=${encodeURIComponent(section)}`,
      { headers: authHeaders() });
    if (!rep.ok) { setData({ ues: [], etudiants: [] }); return; }
    const j = await rep.json();
    setData(j);
    const c = {};
    for (const e of j.etudiants) {
      for (const [ue, v] of Object.entries(e.cellules || {})) {
        if (v.resultat) c[e.id + '|' + ue] = v.resultat;
      }
    }
    setCellules(c);
    setChoisis(new Set());
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [section, annee]);

  // Enregistrement au fil de l'eau, par lots
  function planifier(etudId, ueNum, resultat) {
    enAttente.current.set(etudId + '|' + ueNum, { etudiant_id: etudId, ue_num: ueNum, resultat });
    setEtat('enregistrement');
    clearTimeout(minuteur.current);
    minuteur.current = setTimeout(async () => {
      const lot = [...enAttente.current.values()];
      enAttente.current.clear();
      if (!lot.length) { setEtat('pret'); return; }
      const rep = await fetch('/api/etudiants/matrice', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, changements: lot }),
      });
      setEtat(rep.ok ? 'enregistre' : 'pret');
      if (rep.ok) setTimeout(() => setEtat('pret'), 1600);
    }, 700);
  }

  function poser(etudId, ueNum, resultat) {
    const cle = etudId + '|' + ueNum;
    setCellules(c => {
      const n = { ...c };
      if (resultat) n[cle] = resultat; else delete n[cle];
      return n;
    });
    planifier(etudId, ueNum, resultat);
  }

  function cycler(etudId, ueNum) {
    const actuel = cellules[etudId + '|' + ueNum] || null;
    const i = CYCLE.indexOf(actuel);
    poser(etudId, ueNum, CYCLE[(i + 1) % CYCLE.length]);
  }

  const filtres = useMemo(() => {
    if (!data?.etudiants) return [];
    if (!recherche) return data.etudiants;
    const q = recherche.toLowerCase();
    return data.etudiants.filter(e =>
      (e.nom || '').toLowerCase().includes(q) ||
      (e.prenom || '').toLowerCase().includes(q) ||
      (e.id_ecampus || '').toLowerCase().includes(q));
  }, [data, recherche]);

  const cibles = () => (choisis.size ? filtres.filter(e => choisis.has(e.id)) : filtres);

  // Action groupée : un résultat sur toutes les UE d'une année d'études
  function appliquerLot(resultat) {
    if (!data) return;
    const ues = data.ues.filter(u => !niveauLot || (u.ue_niv || '') === niveauLot);
    const etuds = cibles();
    if (!ues.length || !etuds.length) return;
    const quoi = resultat === 'reussi' ? 'réussi' : resultat === 'ajourne' ? 'refusé' : 'effacé';
    if (!window.confirm(
      `Marquer ${quoi} ${ues.length} UE${niveauLot ? ' de ' + niveauLot : ''} ` +
      `pour ${etuds.length} étudiant(s), en ${annee} ?`)) return;

    setCellules(c => {
      const n = { ...c };
      for (const e of etuds) for (const u of ues) {
        const cle = e.id + '|' + u.ue_num;
        if (resultat) n[cle] = resultat; else delete n[cle];
      }
      return n;
    });
    for (const e of etuds) for (const u of ues) planifier(e.id, u.ue_num, resultat);
  }

  // Colonne entière
  function appliquerColonne(ueNum) {
    const etuds = cibles();
    if (!etuds.length) return;
    if (!window.confirm(`Marquer réussi l'UE ${ueNum} pour ${etuds.length} étudiant(s) ?`)) return;
    setCellules(c => {
      const n = { ...c };
      for (const e of etuds) n[e.id + '|' + ueNum] = 'reussi';
      return n;
    });
    for (const e of etuds) planifier(e.id, ueNum, 'reussi');
  }

  const niveauxPresents = [...new Set((data?.ues || []).map(u => u.ue_niv).filter(Boolean))].sort();

  return (
    <div className="p-5 space-y-3 max-w-full">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue">Encodage rapide</h2>
          <p className="text-sm text-slate-500">
            Un clic pour la réussite, deux pour le refus, trois pour effacer. L'inscription
            découle du résultat.
          </p>
        </div>
        <div className="text-[12px] flex items-center gap-1.5 text-slate-400">
          <IconDeviceFloppy size={14} />
          {etat === 'enregistrement' ? 'Enregistrement…'
            : etat === 'enregistre' ? <span className="text-emerald-600">Enregistré</span>
            : 'Enregistrement automatique'}
        </div>
      </div>

      <div className="flex gap-2 flex-wrap items-center">
        <select value={annee} onChange={e => setAnnee(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm font-semibold text-iip-blue">
          {annees.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={section} onChange={e => setSection(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <div className="relative">
          <IconSearch size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={recherche} onChange={e => setRecherche(e.target.value)}
            placeholder="Filtrer les étudiants…"
            className="border border-slate-300 rounded-lg pl-8 pr-2 py-1.5 text-sm w-56" />
        </div>
      </div>

      {/* Actions groupées */}
      <div className="flex items-center gap-2 flex-wrap px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl">
        <span className="text-[12px] text-slate-600">
          {choisis.size ? <b>{choisis.size} étudiant(s) sélectionné(s)</b> : `Les ${filtres.length} étudiants affichés`}
        </span>
        <span className="text-slate-300">·</span>
        <select value={niveauLot} onChange={e => setNiveauLot(e.target.value)}
          className="border border-slate-300 rounded-lg px-2 py-1 text-[12px]">
          <option value="">Toutes les UE</option>
          {niveauxPresents.map(n => <option key={n} value={n}>UE de {n}</option>)}
        </select>
        <button onClick={() => appliquerLot('reussi')}
          className="text-[12px] px-2.5 py-1 rounded-lg bg-emerald-600 text-white font-semibold">
          Tout réussi
        </button>
        <button onClick={() => appliquerLot('ajourne')}
          className="text-[12px] px-2.5 py-1 rounded-lg border border-red-300 text-red-700">
          Tout refusé
        </button>
        <button onClick={() => appliquerLot(null)}
          className="text-[12px] px-2.5 py-1 rounded-lg border border-slate-300 text-slate-600">
          Effacer
        </button>
        {choisis.size > 0 && (
          <button onClick={() => setChoisis(new Set())}
            className="text-[12px] px-2 py-1 text-slate-500">Désélectionner</button>
        )}
      </div>

      {!data ? (
        <div className="py-10 text-center text-sm text-slate-400">Chargement…</div>
      ) : !data.etudiants.length ? (
        <div className="py-10 text-center text-sm text-slate-400 border-2 border-dashed rounded-xl">
          Aucun étudiant pour cette section.
        </div>
      ) : (
        <div className="border border-slate-200 rounded-xl overflow-auto" style={{ maxHeight: '68vh' }}>
          <table className="text-sm border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="bg-slate-50">
                <th className="sticky left-0 z-30 bg-slate-50 border-b border-r border-slate-200 px-2 py-2 w-8"></th>
                <th className="sticky left-8 z-30 bg-slate-50 border-b border-r border-slate-200 px-3 py-2 text-left min-w-[190px]">
                  <span className="text-[10.5px] uppercase tracking-wide text-slate-500">Étudiant</span>
                </th>
                {data.ues.map(u => (
                  <th key={u.ue_num} onClick={() => appliquerColonne(u.ue_num)}
                    title={`${u.ue_nom || ''} — cliquer pour marquer réussi sur la sélection`}
                    className="border-b border-slate-200 px-1 py-2 w-11 cursor-pointer hover:bg-slate-100">
                    <div className="text-[11.5px] font-bold text-iip-blue">{u.ue_num}</div>
                    <div className="text-[8.5px] text-slate-400">{u.ue_niv || '—'}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtres.map(e => (
                <tr key={e.id} className="hover:bg-slate-50/60">
                  <td className="sticky left-0 z-10 bg-white border-r border-b border-slate-100 px-2 py-1 text-center">
                    <input type="checkbox" checked={choisis.has(e.id)}
                      onChange={ev => setChoisis(s => {
                        const n = new Set(s);
                        ev.target.checked ? n.add(e.id) : n.delete(e.id);
                        return n;
                      })} />
                  </td>
                  <td className="sticky left-8 z-10 bg-white border-r border-b border-slate-100 px-3 py-1">
                    <div className="text-[12.5px] text-slate-800 truncate max-w-[180px]">
                      {e.nom} {e.prenom}
                    </div>
                    <div className="text-[10px] text-slate-400">{e.id_ecampus}</div>
                  </td>
                  {data.ues.map(u => {
                    const cle = e.id + '|' + u.ue_num;
                    const val = cellules[cle] || null;
                    const ant = e.anterieurs?.[u.ue_num];
                    return (
                      <td key={u.ue_num} className="border-b border-slate-100 p-0.5 text-center">
                        <button onClick={() => cycler(e.id, u.ue_num)}
                          title={ant ? `Déjà ${ant.resultat === 'va' ? 'valorisée' : ant.resultat === 'reussi' ? 'réussie' : 'refusée'} en ${ant.annee}` : ''}
                          className={`w-10 h-8 rounded-md border text-[12px] font-bold transition
                            ${val ? STYLE[val] : 'border-transparent text-slate-300 hover:border-slate-200 hover:bg-slate-50'}`}>
                          {val ? SIGLE[val] : (
                            ant ? (
                              <span className="text-[8.5px] font-normal text-slate-400 leading-none block">
                                {ant.resultat === 'reussi' ? '✓' : ant.resultat === 'va' ? 'VA' : '·'}
                                <span className="block">{ant.annee.slice(2, 4)}-{ant.annee.slice(7, 9)}</span>
                              </span>
                            ) : '·'
                          )}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-[11px] text-slate-400">
        <b>C</b> réussi · <b>R</b> refusé · en gris, l'acquis d'une autre année avec son millésime.
        Cliquer un numéro d'UE marque la colonne comme réussie pour les étudiants sélectionnés,
        ou pour tous ceux affichés si aucune sélection n'est faite.
      </p>
    </div>
  );
}
