/**
 * BASCULER DES LIGNES D'ATTRIBUTION VERS UNE AUTRE ORGANISATION (Charles,
 * 30 septembre 2026 : « je sélectionne les lignes — cours ou activités — qui
 * passent en orga 2 »). Le tronc commun d'Optométrie est suivi aussi par les
 * orthoptistes : Optométrie en organisation 1, Orthoptie en 2 (3 pour la 282).
 * Les lignes cochées sont DÉPLACÉES : elles prennent la section et
 * l'organisation choisies. Simulation d'abord ; le serveur refuse un numéro
 * déjà tenu par une autre section.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconArrowsSplit } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

/* LE PRÉVU ET L'ATTRIBUÉ, COURS PAR COURS (Charles, 30 septembre 2026 : « tu
   dois me mettre combien de périodes sont prévues au DP pour chaque cours,
   ainsi que l'autonomie de l'UE »). Une colonne par organisation, et la même
   après bascule si des lignes sont cochées : on voit ce que la bascule change
   avant de la faire. */
function Bilan({ d, parOrg, coches, section, org }) {
  const orgs = [...new Set(parOrg.map(g => g.num))];
  const cible = Number(org);
  if (cible && !orgs.includes(cible)) orgs.push(cible);
  orgs.sort((a, b) => a - b);
  const somme = (filtre, champ = 'periodes_attribuees') => d.lignes.filter(filtre).reduce((t, l) => t + (Number(l[champ]) || 0), 0);
  const apres = l => (coches.has(l.id) ? cible : l.num_organisation);
  const nb = v => (v ? v.toLocaleString('fr-BE') : '—');
  const autreCours = d.lignes.filter(l => !d.cours.some(c => c.cours_code === l.code_cours));
  const lignesCours = [...d.cours.map(c => ({ code: c.cours_code, nom: c.cours_nom, dp: c.ct_pp === 'Z' ? null : c.cours_per, z: c.ct_pp === 'Z' })),
    ...(autreCours.length ? [{ code: null, nom: 'Hors cours (coordination, EPT…)', dp: null }] : [])];
  const deCours = code => l => (code ? l.code_cours === code : !d.cours.some(c => c.cours_code === l.code_cours));
  const modifie = coches.size > 0 && cible > 0;
  return (
    <div className="border border-slate-200 rounded-carte overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="tab-entete"><tr className="text-left text-[11px] text-slate-500">
          <th className="px-2 py-1">Cours</th><th className="px-2 py-1 text-right">Prévu au DP</th>
          {orgs.map(n => <th key={n} className="px-2 py-1 text-right">Org. {n}{modifie ? ' — après' : ''}</th>)}
          <th className="px-2 py-1 text-right">Total attribué</th></tr></thead>
        <tbody>
          {lignesCours.map(c => {
            const total = somme(deCours(c.code));
            return (
              <tr key={c.code || 'hors'} className="border-t border-slate-100 bg-white">
                <td className="px-2 py-1"><b>{c.code || '—'}</b> <span className="text-slate-500">{c.nom || ''}</span>
                  {c.z && <span className="text-slate-400"> · activité Z, ne compte pas</span>}</td>
                <td className="px-2 py-1 text-right tabular-nums font-semibold">{c.code ? nb(c.dp) : ''}</td>
                {orgs.map(n => (
                  <td key={n} className="px-2 py-1 text-right tabular-nums">{nb(somme(l => deCours(c.code)(l) && (modifie ? apres(l) : l.num_organisation) === n))}</td>
                ))}
                <td className="px-2 py-1 text-right tabular-nums">{nb(total)}</td>
              </tr>
            );
          })}
          <tr className="border-t border-slate-200 bg-white">
            <td className="px-2 py-1 text-slate-600">Autonomie de l’UE</td>
            <td className="px-2 py-1 text-right tabular-nums font-semibold">{nb(d.autonomie_dp)}</td>
            {orgs.map(n => (
              <td key={n} className="px-2 py-1 text-right tabular-nums">{nb(somme(l => (modifie ? apres(l) : l.num_organisation) === n, 'autonomie_attribuee'))}</td>
            ))}
            <td className="px-2 py-1 text-right tabular-nums">{nb(somme(() => true, 'autonomie_attribuee'))}</td>
          </tr>
        </tbody>
      </table>
      {modifie && <p className="px-2 py-1 text-[11px] text-slate-500 border-t border-slate-100">
        Colonnes « après » : ce que donnerait la bascule des {coches.size} ligne(s) cochée(s) vers {section}, organisation {cible}.</p>}
    </div>
  );
}

export default function BasculeOrganisation({ ueNum, onClose, onFait }) {
  const annee = getAnnee();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [coches, setCoches] = useState(() => new Set());
  const [section, setSection] = useState('');
  const [org, setOrg] = useState('');
  const [simu, setSimu] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(null);

  const charger = async () => {
    setErreur(null);
    try {
      const r = await fetch(`/api/attributions/basculer/${ueNum}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setD(j);
      // Proposition : la section rattachée qui n'est pas la principale, et le
      // premier numéro d'organisation qu'aucune autre section ne tient.
      const autre = j.sections.find(s => !j.lignes.some(l => l.section === s)) || j.sections[1] || j.sections[0] || '';
      setSection(sec => sec || autre);
      const tenu = n => (j.organisations.find(o => o.num === n)?.sections || []).some(s => s !== autre);
      let n = 1; while (tenu(n)) n++;
      setOrg(o => o || String(n));
    } catch (e) { setErreur(e.message); }
  };
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [ueNum]);

  const cleSimu = `${[...coches].sort().join(',')}|${section}|${org}`;
  useEffect(() => { setSimu(null); }, [cleSimu]);

  const appeler = async simulation => {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/attributions/basculer', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, ue_num: ueNum, ids: [...coches], section, num_organisation: Number(org), simulation }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      return j;
    } catch (e) { setErreur(e.message); return null; } finally { setEnCours(false); }
  };
  const simuler = async () => { const j = await appeler(true); if (j) setSimu({ ...j, cle: cleSimu }); };
  const basculer = async () => {
    const j = await appeler(false);
    if (j) { setFait(j); setCoches(new Set()); setSimu(null); await charger(); onFait?.(); }
  };

  const parOrg = useMemo(() => {
    const m = new Map();
    for (const l of d?.lignes || []) {
      const k = `${l.num_organisation}|${l.section || ''}`;
      if (!m.has(k)) m.set(k, { num: l.num_organisation, section: l.section, lignes: [] });
      m.get(k).lignes.push(l);
    }
    return [...m.values()].sort((a, b) => a.num - b.num);
  }, [d]);
  const bascule = id => setCoches(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const nom = l => [l.prenom, String(l.nom || '').toUpperCase()].filter(Boolean).join(' ') || '—';
  const simuValide = simu && simu.cle === cleSimu;

  return (
    <Fenetre icone={IconArrowsSplit} large="grande" onFermer={onClose}
      titre={`Basculer des lignes vers une autre organisation — UE ${ueNum}`}
      sous={`${d?.ue_nom || ''} · ${annee} — les lignes cochées sont déplacées, pas recopiées`}
      pied={<>
        <span className="flex-1 min-w-0 text-[12px] text-slate-500">
          {!coches.size ? 'Cochez les lignes qui changent d’organisation.'
            : simuValide ? `${simu.a_basculer} ligne(s) passeront en ${section}, organisation ${org}${simu.organisation_a_ouvrir ? ' — l’organisation sera ouverte (sans dates)' : ''}.`
              : 'Vérifiez d’abord : rien ne s’écrit avant.'}
        </span>
        <button className="bouton" onClick={onClose}>Fermer</button>
        <button className="bouton" disabled={!coches.size || !section || !org || enCours} onClick={simuler}>Vérifier</button>
        <button className="bouton bouton-fort" disabled={!simuValide || !simu.a_basculer || enCours} onClick={basculer}>
          {enCours ? '…' : 'Basculer'}</button>
      </>}>
      <div className="space-y-3 text-[13px]">
        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
        {fait && <div data-etat="reussi" className="bloc-etat px-3 py-2"><b>{fait.basculees} ligne(s) basculée(s).</b>
          {fait.organisation_ouverte ? ' L’organisation a été ouverte : ses dates se posent dans « Organisations (Doc A) ».' : ''}</div>}
        {d && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600">Vers la section</span>
              <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
                {d.sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="text-slate-600">organisation</span>
              <input type="number" min="1" className="controle w-20" value={org} onChange={e => setOrg(e.target.value)} />
              <span className="text-[12px] text-slate-500">
                Organisations existantes : {d.organisations.map(o => `${o.num} (${o.sections.join(', ') || '—'})`).join(' · ') || 'aucune'}
              </span>
            </div>
            <Bilan d={d} parOrg={parOrg} coches={coches} section={section} org={org} />
            {parOrg.map(g => (
              <div key={`${g.num}|${g.section}`} className="border border-slate-200 rounded-carte overflow-x-auto">
                <div className="tab-entete px-3 py-1.5 text-[12px] font-semibold text-slate-700 flex items-center gap-2">
                  <input type="checkbox" aria-label="Tout cocher"
                    checked={g.lignes.every(l => coches.has(l.id))}
                    onChange={e => setCoches(s => { const n = new Set(s); g.lignes.forEach(l => (e.target.checked ? n.add(l.id) : n.delete(l.id))); return n; })} />
                  Organisation {g.num} — {g.section || 'sans section'} <span className="font-normal text-slate-500">· {g.lignes.length} ligne(s)</span>
                </div>
                <table className="w-full text-[12px]">
                  <thead className="tab-entete"><tr className="text-left text-[11px] text-slate-500">
                    <th className="px-2 py-1 w-8"></th><th className="px-2 py-1">Cours</th><th className="px-2 py-1">Activité</th>
                    <th className="px-2 py-1">Enseignant</th><th className="px-2 py-1">Contrat</th><th className="px-2 py-1 text-right">Périodes</th></tr></thead>
                  <tbody>
                    {g.lignes.map(l => (
                      <tr key={l.id} className="border-t border-slate-100 bg-white cursor-pointer hover:bg-slate-50" onClick={() => bascule(l.id)}>
                        <td className="px-2 py-1"><input type="checkbox" checked={coches.has(l.id)} onChange={() => bascule(l.id)} onClick={e => e.stopPropagation()} /></td>
                        <td className="px-2 py-1 whitespace-nowrap"><b>{l.code_cours || '—'}</b> <span className="text-slate-500">{l.cours_nom || ''}</span></td>
                        <td className="px-2 py-1 text-slate-600">{l.activite_nom || l.type_cours || ''}{l.num_groupe ? ` · gr. ${l.num_groupe}` : ''}</td>
                        <td className="px-2 py-1">{nom(l)}</td>
                        <td className="px-2 py-1 text-slate-500">{l.contrat_mdp || ''}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{l.periodes_attribuees ?? ''}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {!parOrg.length && <p className="text-slate-500">Aucune attribution pour cette UE en {annee}.</p>}
          </>
        )}
      </div>
    </Fenetre>
  );
}
