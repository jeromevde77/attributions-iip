/**
 * RÉPARTIR LES LIGNES D'UNE UE ENTRE DEUX ORGANISATIONS (Charles, 30 septembre
 * 2026). Le tronc commun d'Optométrie est suivi aussi par les orthoptistes :
 * Optométrie en organisation 1, Orthoptie en 2 (3 pour la 282).
 *
 * « Je ne veux pas effacer mes groupes (mais je peux mettre zéro période). Je
 * dois rester dans les multiples. Je DOIS avoir dans mon orga 2 au moins un
 * groupe de chaque cours et une part d'autonomie. » Trois gestes, dans une
 * seule fenêtre, écrits d'un bloc après vérification :
 *   · RECOPIER une ligne dans l'organisation cible (la ligne d'origine reste) ;
 *   · MODIFIER les périodes et l'autonomie d'une ligne, 0 compris ;
 *   · DÉPLACER une ligne (cocher) — la bascule d'origine.
 * Le bilan en tête dit, cours par cours et organisation par organisation, ce
 * que prévoit le dossier pédagogique et ce qui sera attribué ; le serveur
 * nomme ce qui ne tombe pas sur un multiple, le cours sans groupe dans
 * l'organisation cible, l'autonomie dépassée. Il signale, il n'empêche pas.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconArrowsSplit, IconCopy, IconX } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

const nb = v => (v ? Number(v).toLocaleString('fr-BE') : '—');

function Bilan({ d, projetees, orgs }) {
  const somme = (filtre, champ = 'periodes_attribuees') => projetees.filter(filtre).reduce((t, l) => t + (Number(l[champ]) || 0), 0);
  const autreCours = projetees.some(l => !d.cours.some(c => c.cours_code === l.code_cours));
  const lignesCours = [...d.cours.map(c => ({ code: c.cours_code, nom: c.cours_nom, dp: c.ct_pp === 'Z' ? null : Number(c.cours_per) || null, z: c.ct_pp === 'Z' })),
    ...(autreCours ? [{ code: null, nom: 'Hors cours (coordination, EPT…)', dp: null }] : [])];
  const deCours = code => l => (code ? l.code_cours === code : !d.cours.some(c => c.cours_code === l.code_cours));
  return (
    <div className="border border-slate-200 rounded-carte overflow-x-auto">
      <table className="w-full text-second">
        <thead className="tab-entete"><tr className="text-left text-xs text-slate-500">
          <th className="px-2 py-1">Cours</th><th className="px-2 py-1 text-right">Prévu au DP</th>
          {orgs.map(n => <th key={n} className="px-2 py-1 text-right">Org. {n}</th>)}
          <th className="px-2 py-1 text-right">Total</th></tr></thead>
        <tbody>
          {lignesCours.map(c => (
            <tr key={c.code || 'hors'} className="border-t border-slate-100 bg-white">
              <td className="px-2 py-1"><b>{c.code || '—'}</b> <span className="text-slate-500">{c.nom || ''}</span>
                {c.z && <span className="text-slate-400"> · activité Z, ne compte pas</span>}</td>
              <td className="px-2 py-1 text-right tabular-nums font-semibold">{c.code ? nb(c.dp) : ''}</td>
              {orgs.map(n => {
                const t = somme(l => deCours(c.code)(l) && l.num_organisation === n);
                const faux = c.dp && t % c.dp !== 0;
                return <td key={n} className="px-2 py-1 text-right tabular-nums"
                  style={faux ? { color: 'var(--c-refuse)', fontWeight: 700 } : undefined}
                  title={faux ? `Pas un multiple de ${c.dp}` : undefined}>{nb(t)}{faux ? ' ✗' : ''}</td>;
              })}
              <td className="px-2 py-1 text-right tabular-nums">{nb(somme(deCours(c.code)))}</td>
            </tr>
          ))}
          <tr className="border-t border-slate-200 bg-white">
            <td className="px-2 py-1 text-slate-600">Autonomie de l’UE</td>
            <td className="px-2 py-1 text-right tabular-nums font-semibold">{nb(d.autonomie_dp)}</td>
            {orgs.map(n => <td key={n} className="px-2 py-1 text-right tabular-nums">{nb(somme(l => l.num_organisation === n, 'autonomie_attribuee'))}</td>)}
            <td className="px-2 py-1 text-right tabular-nums">{nb(somme(() => true, 'autonomie_attribuee'))}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

export default function BasculeOrganisation({ ueNum, onClose, onFait }) {
  const annee = getAnnee();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState('');
  const [org, setOrg] = useState('');
  const [modifs, setModifs] = useState({});      // id → { periodes, autonomie }
  const [copies, setCopies] = useState([]);      // { cle, source_id, periodes, autonomie }
  const [deplace, setDeplace] = useState(() => new Set());
  const [verif, setVerif] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(null);

  const charger = async () => {
    setErreur(null);
    try {
      const r = await fetch(`/api/attributions/basculer/${ueNum}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setD(j);
      const autre = j.sections.find(s => !j.lignes.some(l => l.section === s)) || j.sections[1] || j.sections[0] || '';
      setSection(sec => sec || autre);
      const tenu = n => (j.organisations.find(o => o.num === n)?.sections || []).some(s => s !== autre);
      let n = 1; while (tenu(n)) n++;
      setOrg(o => o || String(n));
    } catch (e) { setErreur(e.message); }
  };
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [ueNum]);

  const cible = Number(org) || null;
  const valeur = (l, champ) => {
    const m = modifs[l.id];
    const k = champ === 'periodes_attribuees' ? 'periodes' : 'autonomie';
    return m && m[k] !== undefined ? m[k] : (l[champ] ?? '');
  };
  // Les lignes TELLES QU'ELLES SERONT, copies comprises : c'est ce que lit le bilan.
  const projetees = useMemo(() => {
    if (!d) return [];
    const src = new Map(d.lignes.map(l => [l.id, l]));
    const base = d.lignes.map(l => ({ ...l,
      num_organisation: deplace.has(l.id) && cible ? cible : l.num_organisation,
      section: deplace.has(l.id) ? section : l.section,
      periodes_attribuees: Number(String(valeur(l, 'periodes_attribuees')).replace(',', '.')) || 0,
      autonomie_attribuee: Number(String(valeur(l, 'autonomie_attribuee')).replace(',', '.')) || 0 }));
    const cps = copies.map(c => ({ ...src.get(c.source_id), id: null, cle: c.cle, copie: true, num_organisation: cible, section,
      periodes_attribuees: Number(String(c.periodes).replace(',', '.')) || 0, autonomie_attribuee: Number(String(c.autonomie).replace(',', '.')) || 0 }));
    return [...base, ...cps];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [d, modifs, copies, deplace, cible, section]);
  const orgs = [...new Set([...projetees.map(l => l.num_organisation), ...(cible ? [cible] : [])])].sort((a, b) => a - b);
  const cle = JSON.stringify([modifs, copies, [...deplace], section, org]);
  useEffect(() => { setVerif(null); }, [cle]);

  const corps = simulation => ({
    annee, ue_num: ueNum, section, num_organisation: cible, simulation,
    copies: copies.map(c => ({ source_id: c.source_id, periodes: c.periodes, autonomie: c.autonomie })),
    modifs: Object.entries(modifs).map(([id, m]) => ({ id: Number(id), periodes: m.periodes, autonomie: m.autonomie })),
    deplace: [...deplace],
  });
  const appeler = async simulation => {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/attributions/repartir-organisations', { method: 'POST', headers: authHeaders(), body: JSON.stringify(corps(simulation)) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      return j;
    } catch (e) { setErreur(e.message); return null; } finally { setEnCours(false); }
  };
  const verifier = async () => { const j = await appeler(true); if (j) setVerif({ ...j, cle }); };
  const enregistrer = async () => {
    const j = await appeler(false);
    if (j) { setFait(j); setModifs({}); setCopies([]); setDeplace(new Set()); setVerif(null); await charger(); onFait?.(); }
  };

  const poser = (id, k, v) => setModifs(m => ({ ...m, [id]: { ...(m[id] || {}), [k]: v } }));
  const recopier = l => setCopies(c => [...c, { cle: `${l.id}-${Date.now()}`, source_id: l.id, periodes: l.periodes_attribuees ?? 0, autonomie: 0 }]);
  const nomDe = l => [l.prenom, String(l.nom || '').toUpperCase()].filter(Boolean).join(' ') || '—';
  const aChanger = copies.length + Object.keys(modifs).length + deplace.size;
  const verifValide = verif && verif.cle === cle;

  const groupes = useMemo(() => {
    const m = new Map();
    for (const l of projetees) {
      const k = `${l.num_organisation}|${l.section || ''}`;
      if (!m.has(k)) m.set(k, { num: l.num_organisation, section: l.section, lignes: [] });
      m.get(k).lignes.push(l);
    }
    return [...m.values()].sort((a, b) => a.num - b.num);
  }, [projetees]);

  const champ = (l, k, champBase) => (l.copie
    ? <input className="controle h-7 w-16 text-right" value={copies.find(c => c.cle === l.cle)?.[k] ?? ''}
        onChange={e => setCopies(cs => cs.map(c => (c.cle === l.cle ? { ...c, [k]: e.target.value } : c)))} />
    : <input className="controle h-7 w-16 text-right" value={valeur(l, champBase)}
        onChange={e => poser(l.id, k, e.target.value)} />);

  return (
    <Fenetre icone={IconArrowsSplit} large="pleine" onFermer={onClose}
      titre={`Répartir entre organisations — UE ${ueNum}`}
      sous={`${d?.ue_nom || ''} · ${annee} — rien n’est effacé ; rien ne s’écrit avant « Enregistrer »`}
      pied={<>
        <span className="flex-1 min-w-0 text-second text-slate-500">
          {!aChanger ? 'Recopiez des groupes vers l’organisation cible, ajustez les périodes (0 permis), ou cochez une ligne à déplacer.'
            : verifValide ? (verif.controles.length ? `${verif.controles.length} point(s) signalé(s) ci-dessus — vous pouvez enregistrer quand même.` : 'Tout tombe juste.')
              : `${aChanger} changement(s) en attente — vérifiez d’abord.`}
        </span>
        <button className="bouton" onClick={onClose}>Fermer</button>
        <button className="bouton" disabled={!aChanger || !section || !cible || enCours} onClick={verifier}>Vérifier</button>
        <button className="bouton bouton-fort" disabled={!verifValide || enCours} onClick={enregistrer}>{enCours ? '…' : 'Enregistrer'}</button>
      </>}>
      <div className="space-y-3 text-sm">
        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2">{erreur}</div>}
        {fait && <div data-etat="reussi" className="bloc-etat px-3 py-2"><b>Enregistré :</b> {fait.creees} copie(s), {fait.modifiees} ligne(s) modifiée(s), {fait.deplacees} déplacée(s)
          {fait.organisation_ouverte ? ' — l’organisation a été ouverte : ses dates se posent dans « Organisations (Doc A) »' : ''}.</div>}
        {d && (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-slate-600">Organisation cible :</span>
              <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
                {d.sections.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <span className="text-slate-600">n°</span>
              <input type="number" min="1" className="controle w-20" value={org} onChange={e => setOrg(e.target.value)} />
              <span className="text-second text-slate-500">
                Existantes : {d.organisations.map(o => `${o.num} (${o.sections.join(', ') || '—'})`).join(' · ') || 'aucune'}
              </span>
            </div>
            <Bilan d={d} projetees={projetees} orgs={orgs} />
            {verifValide && verif.controles.length > 0 && (
              <div data-etat="surveiller" className="bloc-etat px-3 py-2 text-second">
                {verif.controles.map((c, i) => <div key={i}>{c.texte}</div>)}
              </div>
            )}
            {verifValide && !verif.controles.length && (
              <div data-etat="reussi" className="bloc-etat px-3 py-2 text-second">Chaque cours tombe sur un multiple du DP dans chaque organisation, l’organisation {cible} a un groupe de chaque cours et sa part d’autonomie.</div>
            )}
            {groupes.map(g => (
              <div key={`${g.num}|${g.section}`} className="border border-slate-200 rounded-carte overflow-x-auto">
                <div className="tab-entete px-3 py-1.5 text-second font-semibold text-slate-700">
                  Organisation {g.num} — {g.section || 'sans section'} <span className="font-normal text-slate-500">· {g.lignes.length} ligne(s)</span>
                </div>
                <table className="w-full text-second">
                  <thead className="tab-entete"><tr className="text-left text-xs text-slate-500">
                    <th className="px-2 py-1 w-10" title="Déplacer la ligne vers l’organisation cible">Dépl.</th>
                    <th className="px-2 py-1">Cours</th><th className="px-2 py-1">Activité</th>
                    <th className="px-2 py-1">Enseignant</th><th className="px-2 py-1">Contrat</th>
                    <th className="px-2 py-1 text-right">Périodes</th><th className="px-2 py-1 text-right">Autonomie</th><th className="px-2 py-1"></th></tr></thead>
                  <tbody>
                    {g.lignes.map(l => (
                      <tr key={l.cle || l.id} className="border-t border-slate-100 bg-white">
                        <td className="px-2 py-1">{!l.copie && (
                          <input type="checkbox" checked={deplace.has(l.id)} title="Déplacer vers l’organisation cible"
                            onChange={() => setDeplace(s => { const n = new Set(s); n.has(l.id) ? n.delete(l.id) : n.add(l.id); return n; })} />)}</td>
                        <td className="px-2 py-1 whitespace-nowrap"><b>{l.code_cours || '—'}</b> <span className="text-slate-500">{l.cours_nom || ''}</span>
                          {l.copie && <span className="ml-1.5 text-xs text-slate-500 border border-slate-200 rounded-champ px-1">copie</span>}</td>
                        <td className="px-2 py-1 text-slate-600">{l.activite_nom || l.type_cours || ''}{l.code && l.code !== 'Ts' ? ` · gr. ${l.code}` : l.num_groupe ? ` · gr. ${l.num_groupe}` : ''}</td>
                        <td className="px-2 py-1">{nomDe(l)}</td>
                        <td className="px-2 py-1 text-slate-500">{l.contrat_mdp || ''}</td>
                        <td className="px-2 py-1 text-right">{champ(l, 'periodes', 'periodes_attribuees')}</td>
                        <td className="px-2 py-1 text-right">{champ(l, 'autonomie', 'autonomie_attribuee')}</td>
                        <td className="px-2 py-1 whitespace-nowrap">
                          {l.copie
                            ? <button className="text-slate-400 hover:text-slate-700" title="Retirer cette copie" onClick={() => setCopies(cs => cs.filter(c => c.cle !== l.cle))}><IconX size={14} /></button>
                            : cible && l.num_organisation !== cible && (
                              <button className="bouton h-7 text-xs" title={`Recopier ce groupe dans ${section}, organisation ${cible}`} onClick={() => recopier(l)}>
                                <IconCopy size={13} /> en org. {cible}</button>)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
            {!groupes.length && <p className="text-slate-500">Aucune attribution pour cette UE en {annee}.</p>}
          </>
        )}
      </div>
    </Fenetre>
  );
}
