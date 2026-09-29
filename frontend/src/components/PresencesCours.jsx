/**
 * LES PRÉSENCES D'UN COURS, SÉANCE PAR SÉANCE (Charles, 29 septembre 2026 :
 * « idéalement depuis Mes cours, encodé par le prof »).
 *
 * Les séances viennent de l'horaire de Lucie ; le professeur choisit la
 * séance, pose « tous présents » puis marque les absents. Une absence se
 * justifie sur pièce, par un motif de la liste du congé-éducation payé — pas
 * un texte libre. Une séance à venir ne s'encode pas.
 */
import { useEffect, useMemo, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { Encadre } from './ui.jsx';

const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const JOURS = ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'];
const jourDe = d => JOURS[new Date(d + 'T12:00:00').getDay()];
const BOUTONS = [
  ['present', 'P', 'Présent', 'var(--c-reussi)'],
  ['absent', 'A', 'Absent', 'var(--c-corriger)'],
  ['justifie', 'J', 'Absence justifiée', 'var(--c-surveiller)'],
  ['non_concerne', '—', 'Non concerné (autre sous-groupe)', '#94a3b8'],
];

export default function PresencesCours({ coursCode, annee }) {
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [seanceId, setSeanceId] = useState(null);
  const [saisie, setSaisie] = useState({});      // etudiant_id → { statut, motif }
  const [fait, setFait] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [recharge, setRecharge] = useState(0);

  useEffect(() => {
    let vivant = true;
    fetch(`/api/mes-cours/${encodeURIComponent(coursCode)}/presences?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(j => {
        if (!vivant) return;
        setData(j);
        // La dernière séance passée : c'est celle qu'on vient de donner.
        if (!seanceId) {
          const passees = j.seances.filter(s => s.date <= j.aujourdhui && !s.annule);
          setSeanceId((passees[passees.length - 1] || j.seances[0])?.id || null);
        }
      })
      .catch(e => { if (vivant) setErreur(e.message); });
    return () => { vivant = false; };
  }, [coursCode, annee, recharge]);   // eslint-disable-line react-hooks/exhaustive-deps

  const seance = data?.seances.find(s => s.id === seanceId) || null;
  useEffect(() => {
    if (!data || !seance) return;
    const enreg = data.presences[seance.id] || {};
    setSaisie(Object.fromEntries(data.etudiants.map(e => [e.id, enreg[e.id] ? { statut: enreg[e.id].statut, motif: enreg[e.id].motif } : { statut: null, motif: null }])));
    setFait(null);
  }, [data, seanceId]);   // eslint-disable-line react-hooks/exhaustive-deps

  const future = seance && data && seance.date > data.aujourdhui;
  const modifiees = useMemo(() => {
    if (!data || !seance) return [];
    const enreg = data.presences[seance.id] || {};
    return data.etudiants.filter(e => (saisie[e.id]?.statut || null) !== (enreg[e.id]?.statut || null)
      || (saisie[e.id]?.motif || null) !== (enreg[e.id]?.motif || null));
  }, [data, seance, saisie]);
  const sansMotif = data ? data.etudiants.filter(e => saisie[e.id]?.statut === 'justifie' && !saisie[e.id]?.motif) : [];

  const poser = (id, statut) => setSaisie(s => ({ ...s, [id]: { statut: s[id]?.statut === statut ? null : statut,
    motif: statut === 'justifie' ? s[id]?.motif || null : null } }));
  const tousPresents = () => setSaisie(s => Object.fromEntries(Object.entries(s).map(([k, v]) =>
    [k, v.statut ? v : { statut: 'present', motif: null }])));
  const enregistrer = async () => {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/mes-cours/${encodeURIComponent(coursCode)}/presences/${seance.id}`, {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, presences: modifiees.map(e => ({ etudiant_id: e.id, ...saisie[e.id] })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setFait(`${j.ecrites} présence(s) enregistrée(s) pour la séance du ${fr(seance.date)}.`);
      setRecharge(x => x + 1);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };

  if (erreur && !data) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!data) return <p className="text-sm text-slate-400">Chargement…</p>;
  if (!data.seances.length) {
    return <Encadre etat="neutre" titre="Aucune séance de ce cours dans l'horaire de Lucie">
      Les présences se prennent sur les séances de l'horaire (Organisation → Horaires). Tant que le cours n'y est pas,
      il n'y a rien à cocher.</Encadre>;
  }
  const n = data.etudiants.length;
  return (
    <div className="grid gap-3 items-start lg:grid-cols-[260px_minmax(0,1fr)]">
      <div className="carte max-h-[70vh] overflow-auto">
        {data.seances.map(s => {
          const passe = s.date <= data.aujourdhui;
          const complet = s.encodees >= n && n > 0;
          return (
            <button key={s.id} type="button" onClick={() => setSeanceId(s.id)}
              className={`w-full text-left px-3 py-1.5 border-b border-slate-100 text-[12.5px] flex items-center gap-2
                ${s.id === seanceId ? 'bg-white font-semibold' : 'hover:bg-white/60'} ${passe ? '' : 'text-slate-400'}`}>
              <span className="tabular-nums w-[92px]">{jourDe(s.date)} {fr(s.date)}</span>
              <span className="tabular-nums text-slate-500">{String(s.heure_debut).slice(0, 5)}–{String(s.heure_fin).slice(0, 5)}</span>
              {s.sous_groupe && <span className="text-[11px] text-slate-400">gr. {s.sous_groupe}</span>}
              <span className="ml-auto text-[11px]" style={{ color: s.annule ? '#94a3b8' : complet ? 'var(--c-reussi)'
                : passe ? 'var(--c-surveiller)' : '#94a3b8' }}>
                {s.annule ? 'annulée' : complet ? '✓' : passe ? `${s.encodees}/${n}` : 'à venir'}</span>
            </button>
          );
        })}
      </div>

      {seance && (
        <div className="carte">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2 border-b border-slate-100">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-semibold">Séance du {jourDe(seance.date)} {fr(seance.date)} ·
                {' '}{String(seance.heure_debut).slice(0, 5)}–{String(seance.heure_fin).slice(0, 5)}</div>
              <div className="text-[11.5px] text-slate-500">{seance.matiere || ''}{seance.sous_groupe ? ` · sous-groupe ${seance.sous_groupe}` : ''}</div>
            </div>
            {!future && !seance.annule && (
              <button type="button" className="bouton" onClick={tousPresents}>Tous présents</button>
            )}
            <button type="button" className="bouton bouton-fort"
              disabled={future || seance.annule || !modifiees.length || sansMotif.length > 0 || enCours}
              onClick={enregistrer}>Enregistrer</button>
          </div>
          <div className="px-3 py-1 text-[11.5px] min-h-[1.5rem]" style={{ color: 'var(--c-surveiller)' }}>
            {seance.annule ? 'Séance annulée : pas de présences.'
              : future ? "Cette séance n'a pas encore eu lieu."
                : sansMotif.length ? `Choisissez le motif de ${sansMotif.length} absence(s) justifiée(s).`
                  : fait ? <span style={{ color: 'var(--c-reussi)' }}>✓ {fait}</span>
                    : modifiees.length ? `${modifiees.length} changement(s) à enregistrer.` : ''}
            {erreur && <span style={{ color: 'var(--c-corriger)' }}> {erreur}</span>}
          </div>
          <table className="w-full text-[12.5px]">
            <tbody>
              {data.etudiants.map(e => {
                const v = saisie[e.id] || {};
                return (
                  <tr key={e.id} className="border-t border-slate-100 bg-white">
                    <td className="px-3 py-1.5">
                      <b>{(e.nom || '').toUpperCase()}</b> {e.prenom}
                      {e.cep && <span className="ml-1.5 text-[10.5px] text-slate-400" title="Congé-éducation payé : ses présences partent sur une attestation">CEP</span>}
                      {e.groupe && <span className="block text-[11px] text-slate-400">{e.groupe}</span>}
                    </td>
                    <td className="px-2 py-1.5 whitespace-nowrap">
                      {BOUTONS.map(([k, l, t, c]) => (
                        <button key={k} type="button" title={t} disabled={future || seance.annule}
                          onClick={() => poser(e.id, k)}
                          className="w-8 h-7 mr-1 rounded-champ border text-[12px] font-semibold disabled:opacity-40"
                          style={v.statut === k ? { background: c, borderColor: c, color: '#fff' } : { borderColor: '#cbd5e1', color: '#475569' }}>
                          {l}</button>
                      ))}
                    </td>
                    <td className="px-2 py-1.5 w-[45%]">
                      {v.statut === 'justifie' && (
                        <select className="controle h-8 w-full" value={v.motif || ''}
                          onChange={ev => setSaisie(s => ({ ...s, [e.id]: { ...s[e.id], motif: ev.target.value || null } }))}>
                          <option value="">— motif de la justification —</option>
                          {Object.entries(data.motifs || {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                        </select>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
