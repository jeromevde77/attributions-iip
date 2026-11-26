/* (CS) LES GROUPES DE LA SECTION (3.5.759, Charles, 26 novembre 2026 : « une fenêtre qui me permet de voir, pour chaque UE, chaque
   cours, chaque activité, les groupes… pour changer en un coup » ; tranché : un tableau à modifier sur place). Une ligne par
   attribution, rangée par UE puis cours et activité : professeur, périodes, groupe. Le groupe se change sur la ligne (Ts, A, B, C…,
   ou libre : « 1+2 ») ; cocher des lignes pose le même groupe sur toutes. Rien ne s'écrit avant l'aperçu des changements. */
import { useMemo, useState } from 'react';
import { IconUsersGroup } from '@tabler/icons-react';
import { api } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

const trier = (a, b) => String(a).localeCompare(String(b), 'fr', { numeric: true });
const net = c => (String(c || '').trim() === '' || String(c).trim().toUpperCase() === 'TS' ? 'Ts' : String(c).replace(/\s/g, ''));
const SUGGESTIONS = ['Ts', ...'ABCDEFGH'.split(''), '1', '2', '3', '4', '5', '6', '1+2', '3+4', '5+6'];

export default function GroupesSection({ section, ues, onClose, onApplied }) {
  const [filtre, setFiltre] = useState('');
  const [ueChoisie, setUeChoisie] = useState('');
  const [codes, setCodes] = useState({});          // id d'attribution → nouveau groupe
  const [coches, setCoches] = useState(new Set());
  const [enLot, setEnLot] = useState('');
  const [apercu, setApercu] = useState(false);
  const [busy, setBusy] = useState(false);
  const [erreurs, setErreurs] = useState([]);

  // Une ligne par attribution (les morceaux « split » se lisent mais gardent leur Ts partagé).
  const lignes = useMemo(() => {
    const out = [];
    for (const ue of [...ues].sort((a, b) => a.ue_num - b.ue_num || (a.num_organisation || 1) - (b.num_organisation || 1))) {
      for (const c of [...(ue.cours || [])].sort((a, b) => trier(a.code_cours, b.code_cours))) {
        for (const r of [...(c.rows || [])].sort((a, b) => trier(a.activite_nom || '', b.activite_nom || '') || trier(net(a.code), net(b.code)))) {
          if (r.is_z) continue;
          out.push({ ...r, ue_num: ue.ue_num, ue_nom: ue.ue_nom, org: ue.num_organisation || 1, cours_nom: c.nom_cours || r.nom_cours,
            prof: r.prof_nom || r.prof_prenom ? `${String(r.prof_nom || '').toUpperCase()} ${r.prof_prenom || ''}`.trim() : null });
        }
      }
    }
    return out;
  }, [ues]);
  const t = filtre.trim().toLowerCase();
  const visibles = lignes.filter(l => (!ueChoisie || `${l.ue_num}/${l.org}` === ueChoisie)
    && (!t || `${l.code_cours} ${l.cours_nom || ''} ${l.activite_nom || ''} ${l.prof || ''} ${net(l.code)}`.toLowerCase().includes(t)));
  const changes = lignes.filter(l => codes[l.id] !== undefined && net(codes[l.id]) !== net(l.code));
  const toutesCochees = visibles.length > 0 && visibles.every(l => coches.has(l.id));

  const basculer = id => setCoches(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const poserLot = () => {
    const v = net(enLot); if (!enLot.trim()) return;
    setCodes(m => { const n = { ...m }; for (const id of coches) n[id] = v; return n; });
    setCoches(new Set()); setEnLot('');
  };
  const enregistrer = async () => {
    setBusy(true); const errs = []; let ok = 0;
    for (const l of changes) {
      try { await api.updateAttribution(l.id, { code: net(codes[l.id]) }); ok++; }
      catch (e) { errs.push(`${l.code_cours} · ${l.prof || 'à désigner'} : ${e.message}`); }
    }
    setBusy(false);
    if (errs.length) { setErreurs(errs); setApercu(false); return; }
    onApplied(ok);
  };

  // Les en-têtes d'UE dans le tableau.
  let ueCourante = null;
  return (
    <Fenetre icone={IconUsersGroup} large="pleine" onFermer={onClose} titre={`Groupes de la section — ${section}`}
      sous="Chaque attribution et son groupe. Changez sur la ligne, ou cochez plusieurs lignes et posez le même groupe. Rien n’est écrit avant l’aperçu."
      pied={apercu ? <>
        <span className="flex-1 min-w-0 text-second">{changes.length} groupe{changes.length > 1 ? 's' : ''} à changer.</span>
        <button className="bouton" onClick={() => setApercu(false)} disabled={busy}>Revenir</button>
        <button className="bouton bouton-fort" onClick={enregistrer} disabled={busy || !changes.length}>{busy ? 'Enregistrement…' : 'Enregistrer'}</button>
      </> : <>
        <span className="flex-1 min-w-0 text-second text-slate-500">{changes.length ? `${changes.length} changement${changes.length > 1 ? 's' : ''} en attente` : 'Aucun changement.'}</span>
        <button className="bouton" onClick={onClose}>Annuler</button>
        <button className="bouton bouton-fort" disabled={!changes.length} onClick={() => setApercu(true)}>Voir les changements ({changes.length})</button>
      </>}>
      {erreurs.length > 0 && <div data-etat="corriger" className="bloc-etat px-3 py-2 mb-3 text-second">
        <b>Certains groupes n’ont pas été changés :</b><ul className="list-disc ml-5">{erreurs.map((e, i) => <li key={i}>{e}</li>)}</ul></div>}
      {apercu ? (
        <table className="w-full text-sm">
          <thead><tr><th className="text-left">UE</th><th className="text-left">Cours</th><th className="text-left">Activité</th>
            <th className="text-left">Professeur</th><th className="text-left">Groupe</th></tr></thead>
          <tbody>{changes.map(l => (
            <tr key={l.id}><td>UE {l.ue_num}{l.org > 1 ? ` · org. ${l.org}` : ''}</td><td><b>{l.code_cours}</b> {l.cours_nom}</td>
              <td>{l.activite_nom || '—'}</td><td>{l.prof || 'À désigner'}</td>
              <td className="whitespace-nowrap">{net(l.code)} → <b>{net(codes[l.id])}</b></td></tr>))}</tbody>
        </table>
      ) : <>
        <div className="flex items-center gap-2 flex-nowrap mb-3 overflow-x-auto">
          <input className="controle min-w-[14rem]" placeholder="Filtrer : cours, professeur, groupe…" value={filtre} onChange={e => setFiltre(e.target.value)} />
          <select className="controle" value={ueChoisie} onChange={e => setUeChoisie(e.target.value)}>
            <option value="">Toutes les UE</option>
            {[...new Map(lignes.map(l => [`${l.ue_num}/${l.org}`, l])).values()].map(l => (
              <option key={`${l.ue_num}/${l.org}`} value={`${l.ue_num}/${l.org}`}>UE {l.ue_num}{l.org > 1 ? ` · org. ${l.org}` : ''} — {l.ue_nom || ''}</option>))}
          </select>
          <span className="flex-1" />
          <span className="text-second text-slate-500 whitespace-nowrap">{coches.size} cochée{coches.size > 1 ? 's' : ''} →</span>
          <input className="controle w-24" list="groupes-suggestions" placeholder="groupe" value={enLot} onChange={e => setEnLot(e.target.value)} />
          <button className="bouton" disabled={!coches.size || !enLot.trim()} onClick={poserLot}>Poser</button>
        </div>
        <datalist id="groupes-suggestions">{SUGGESTIONS.map(s => <option key={s} value={s} />)}</datalist>
        <table className="w-full text-sm">
          <thead><tr>
            <th className="w-8"><input type="checkbox" checked={toutesCochees} aria-label="Cocher toutes les lignes visibles"
              onChange={() => setCoches(c => { const n = new Set(c); visibles.forEach(l => (toutesCochees ? n.delete(l.id) : n.add(l.id))); return n; })} /></th>
            <th className="text-left">Cours</th><th className="text-left">Activité</th><th className="text-left">Professeur</th>
            <th className="text-right">Périodes</th><th className="text-left w-28">Groupe</th>
          </tr></thead>
          <tbody>
            {!visibles.length && <tr><td colSpan={6} className="text-slate-400 py-4 text-center">Aucune attribution.</td></tr>}
            {visibles.flatMap(l => {
              const cle = `${l.ue_num}/${l.org}`;
              const out = [];
              if (cle !== ueCourante) {
                ueCourante = cle;
                out.push(<tr key={`ue${cle}`} className="tab-repere"><td colSpan={6} className="font-semibold">UE {l.ue_num}{l.org > 1 ? ` · org. ${l.org}` : ''} — {l.ue_nom || ''}</td></tr>);
              }
              const v = codes[l.id] !== undefined ? codes[l.id] : net(l.code);
              const change = codes[l.id] !== undefined && net(codes[l.id]) !== net(l.code);
              out.push(
                <tr key={l.id}>
                  <td><input type="checkbox" checked={coches.has(l.id)} onChange={() => basculer(l.id)} aria-label="Cocher la ligne" /></td>
                  <td><b>{l.code_cours}</b> {l.cours_nom || ''}</td>
                  <td>{l.activite_nom || '—'}{l.split_groupe === 'O' ? <span className="text-slate-400"> · partagé</span> : null}</td>
                  <td>{l.prof || <i className="text-slate-400">À désigner</i>}</td>
                  <td className="text-right tabular-nums">{l.periodes_attribuees ?? '—'}</td>
                  <td>
                    <input className={`controle !h-8 w-24 ${change ? '!border-[color:var(--c-attente)] font-semibold' : ''}`} list="groupes-suggestions"
                      value={v} onChange={e => setCodes(m => ({ ...m, [l.id]: e.target.value }))} aria-label="Groupe" />
                    {change && <span className="text-mention text-slate-400 ml-1">était {net(l.code)}</span>}
                  </td>
                </tr>);
              return out;
            })}
          </tbody>
        </table>
      </>}
    </Fenetre>
  );
}
