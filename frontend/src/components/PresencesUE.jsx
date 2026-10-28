/**
 * LES PRÉSENCES PAR UE — le module de l'administration (Charles, 28 octobre
 * 2026). On choisit une UE ; ses inscrits en lignes, toutes les séances de tous
 * ses cours en colonnes ; une case se change d'un clic (P, P*, A, J + motif, —).
 * Juste après la séance du 1er dixième, puis après celle du 5e, une colonne
 * « Régularité » : R (vert) si présences + absences justifiées ≥ 60 % des heures
 * encodées jusque-là, IR sinon. C'est une indication pour la vérification : un
 * clic inverse le badge, sans motif ; Lucie garde qui et quand.
 * Serveur : `routes/presencesUE.js`, calcul `lib/regularite.js`.
 */
import { Fragment, useEffect, useMemo, useState } from 'react';
import { IconSearch } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Encadre } from './ui.jsx';

const API = '/api/presences-ue';
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().slice(0, 2).join('/') : '');
const frl = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const hm = m => { const x = Math.round(m || 0); return `${Math.floor(x / 60)}h${String(x % 60).padStart(2, '0')}`; };
const nb = v => String(v ?? '').replace('.', ',');
const CODE = c => (!c?.statut ? '' : c.statut === 'present' ? (c.retard ? 'P*' : 'P') : { absent: 'A', justifie: 'J', non_concerne: '—', dispense: 'D' }[c.statut] || '');
const TEINTE = { present: 'var(--c-reussi)', absent: 'var(--c-refuse)', justifie: 'var(--c-attente)' };
const CHOIX = [['present', 'P', 'Présent'], ['retard', 'P*', 'Présent, en retard'], ['absent', 'A', 'Absent'],
  ['justifie', 'J', 'Absence justifiée'], ['non_concerne', '—', 'Non concerné'], ['', '×', 'Effacer']];

async function appel(chemin, options = {}) {
  const r = await fetch(API + chemin, { ...options, headers: { 'Content-Type': 'application/json', ...authHeaders() } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
  return j;
}

function Badge({ r, jalon, onClick }) {
  if (!r?.atteint) return <span className="text-slate-400" title={jalon ? `Jalon le ${frl(jalon)}` : 'Pas de séance'}>—</span>;
  if (!r.valeur) return <span className="text-slate-400" title="Aucune séance encodée avant le jalon">?</span>;
  const vert = r.valeur === 'R';
  const titre = [r.taux != null ? `${nb(r.taux)} % (présences + justifiées) sur ${hm(r.du)} encodées` : 'Pas de calcul',
    r.non_encodees ? `${r.non_encodees} séance(s) non encodée(s) avant le jalon` : null,
    r.marque ? `Inversé à la main par ${r.marque.par || '—'} le ${frl(r.marque.le)} (calcul : ${r.calcule || '—'})` : null,
    'Cliquer pour inverser'].filter(Boolean).join('\n');
  return (
    <button type="button" onClick={onClick} title={titre}
      className="inline-flex items-center gap-0.5 px-1.5 h-6 rounded-champ text-xs font-bold text-white"
      style={{ background: vert ? 'var(--c-reussi)' : 'var(--c-refuse)', outline: r.marque ? '2px dashed var(--c-texte)' : 'none', outlineOffset: 1 }}>
      {r.valeur}{r.non_encodees ? '·' : ''}
    </button>
  );
}

export default function PresencesUE({ ueInitiale = null }) {
  const annee = getAnnee();
  const [ues, setUes] = useState(null);
  const [ue, setUe] = useState(ueInitiale);
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [filtre, setFiltre] = useState('');
  const [menu, setMenu] = useState(null);       // { li, si, x, y }
  const [motif, setMotif] = useState('');

  useEffect(() => { appel(`/ues?annee=${encodeURIComponent(annee)}`).then(j => setUes(j.ues)).catch(e => setErreur(e.message)); }, [annee]);
  const charger = (u = ue) => u && appel(`/ue/${u}?annee=${encodeURIComponent(annee)}`).then(j => { setD(j); setErreur(null); }).catch(e => setErreur(e.message));
  useEffect(() => { setD(null); charger(ue); }, [ue]);   // eslint-disable-line react-hooks/exhaustive-deps

  const lignes = useMemo(() => (d?.lignes || []).filter(l => !filtre || `${l.etudiant.nom} ${l.etudiant.prenom} ${l.etudiant.id_ecampus || ''}`.toLowerCase().includes(filtre.toLowerCase())), [d, filtre]);
  // L'index de la séance qui porte chaque jalon : la colonne de régularité se pose juste après.
  const apres = useMemo(() => {
    const m = {};
    for (const j of ['10', '50']) {
      const date = d?.jalons?.[j]; if (!date) continue;
      let k = -1; (d.seances || []).forEach((s, i) => { if (!s.annule && s.date === date) k = i; });
      if (k >= 0) (m[k] ||= []).push(j);
    }
    return m;
  }, [d]);

  async function poser(li, si, choix, mot = null) {
    const l = d.lignes.find(x => x.etudiant.id === li); const s = d.seances[si];
    const statut = choix === 'retard' ? 'present' : choix || null;
    if (statut === 'justifie' && !mot) return;
    setMenu(null);
    try {
      await appel(`/ue/${ue}/presences`, { method: 'PUT', body: JSON.stringify({ annee,
        lignes: [{ seance_id: s.id, etudiant_id: l.etudiant.id, statut, motif: mot, retard: choix === 'retard' }] }) });
      await charger();
    } catch (e) { setErreur(e.message); }
  }
  async function inverser(l, j) {
    const r = l.regularite[j];
    try {
      await appel(`/ue/${ue}/regularite`, { method: 'PUT', body: JSON.stringify({ annee, etudiant_id: l.etudiant.id, jalon: Number(j), valeur: r.valeur === 'R' ? 'IR' : 'R' }) });
      await charger();
    } catch (e) { setErreur(e.message); }
  }

  const colReg = j => (
    <th key={`r${j}`} className="px-1.5 py-1 text-center" style={{ borderLeft: '2px solid #C9A227', borderRight: '2px solid #C9A227' }}
      title={`Régularité au ${d.libelles_jalons[j]} (${frl(d.jalons[j])}) : présences + justifiées ≥ ${Math.round(d.seuil * 100)} %`}>
      <div className="font-semibold normal-case tracking-normal text-slate-800">Rég.</div>
      <div className="font-normal normal-case tracking-normal">{j === '10' ? '1/10' : '5/10'}</div>
    </th>);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <select className="controle border border-slate-300 rounded-champ bg-white min-w-[22rem]" value={ue || ''} onChange={e => setUe(e.target.value ? Number(e.target.value) : null)}>
          <option value="">— Choisir une unité —</option>
          {(ues || []).map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num}{u.ue_nom ? ` — ${u.ue_nom}` : ''}{u.sections ? ` (${u.sections})` : ''} · {u.inscrits} inscrits · {u.seances} séances</option>)}
        </select>
        {d && (
          <div className="relative">
            <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={filtre} onChange={e => setFiltre(e.target.value)} placeholder="Nom ou matricule"
              className="controle controle-icone border border-slate-300 rounded-champ bg-white w-56" />
          </div>)}
        {d && <span className="text-second text-slate-500">
          1er dixième : <b>{frl(d.jalons['10'])}</b> · 5e dixième : <b>{frl(d.jalons['50'])}</b> · régulier : présences + justifiées ≥ {Math.round(d.seuil * 100)} %</span>}
      </div>
      {erreur && <Encadre etat="corriger">{erreur}</Encadre>}
      {!ue && <p className="text-sm text-slate-500">Choisissez une unité : ses inscrits, toutes ses séances, et la régularité au 1er et au 5e dixième.</p>}
      {ue && !d && !erreur && <p className="text-sm text-slate-400">Chargement…</p>}
      {d && !d.seances.length && <Encadre etat="neutre">Cette unité n’a pas de séance à l’horaire.</Encadre>}
      {d && d.seances.length > 0 && (
        <div className="carte overflow-auto max-h-[62vh]">
          <table className="text-second border-collapse">
            <thead className="sticky top-0 z-20">
              <tr className="tab-entete">
                <th className="px-2 py-1.5 text-left sticky left-0 z-30 bg-inherit min-w-[190px]">Étudiant</th>
                {d.seances.map((s, i) => (
                  <Fragment key={s.id}>
                    <th className={`px-1 py-1 text-center font-normal normal-case tracking-normal ${s.annule ? 'opacity-40' : ''}`}
                      title={`${frl(s.date)} ${String(s.heure_debut || '').slice(0, 5)}–${String(s.heure_fin || '').slice(0, 5)} · ${s.cours_code}${s.sous_groupe ? ` · gr. ${s.sous_groupe}` : ''}${s.annule ? ' · annulée' : ''}`}
                      style={Object.values(d.jalons).includes(s.date) && !s.annule ? { background: 'color-mix(in srgb, #C9A227 18%, transparent)' } : undefined}>
                      <div className="font-semibold text-slate-800">{fr(s.date)}</div>
                      <div>{s.cours_code}</div>
                    </th>
                    {(apres[i] || []).map(colReg)}
                  </Fragment>
                ))}
                <th className="px-2 py-1.5 text-right">Présent / dû</th>
                <th className="px-2 py-1.5 text-right" title="Absences sans justificatif, sur les heures dues">Injust.</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(l => (
                <tr key={l.etudiant.id} className="border-t border-slate-100 bg-white">
                  <td className="px-2 py-1 sticky left-0 bg-white z-10 whitespace-nowrap">
                    <b>{String(l.etudiant.nom || '').toUpperCase()}</b> {l.etudiant.prenom}
                    {l.etudiant.id_ecampus && <span className="block text-xs text-slate-400">{l.etudiant.id_ecampus}</span>}
                  </td>
                  {d.seances.map((s, i) => {
                    const c = l.cases[i]; const code = CODE(c);
                    const futur = s.date > d.aujourdhui; const fige = s.annule || futur || c?.statut === 'dispense';
                    return (
                      <Fragment key={s.id}>
                        <td className="p-0 text-center">
                          <button type="button" disabled={fige}
                            title={c?.motif ? `Motif : ${d.motifs[c.motif] || c.motif}` : fige ? (s.annule ? 'Séance annulée' : futur ? 'Séance à venir' : 'Dispensé') : 'Changer'}
                            onClick={e => { const r = e.currentTarget.getBoundingClientRect(); setMotif(c?.motif || ''); setMenu({ li: l.etudiant.id, si: i, x: r.left, y: r.bottom }); }}
                            className="w-9 h-7 font-semibold hover:bg-slate-100 disabled:hover:bg-transparent"
                            style={{ color: TEINTE[c?.statut] || 'rgb(var(--gris-500))', opacity: s.annule ? 0.3 : 1 }}>
                            {code || (fige ? '' : '·')}</button>
                        </td>
                        {(apres[i] || []).map(j => (
                          <td key={`r${j}`} className="px-1 text-center" style={{ borderLeft: '2px solid #C9A227', borderRight: '2px solid #C9A227' }}>
                            <Badge r={l.regularite[j]} jalon={d.jalons[j]} onClick={() => inverser(l, j)} />
                          </td>))}
                      </Fragment>
                    );
                  })}
                  <td className="px-2 text-right tabular-nums whitespace-nowrap">{hm(l.present)} / {hm(l.du)}</td>
                  <td className="px-2 text-right tabular-nums" style={{ color: l.taux_injustifie > 0.1 ? 'var(--c-refuse)' : undefined }}>{nb(Math.round(l.taux_injustifie * 1000) / 10)} %</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {d && d.seances.length > 0 && (
        <p className="text-second text-slate-500 m-0">
          P présent · P* en retard · A absent · J justifié · — non concerné · D dispensé · « · » non encodé. Les colonnes dorées : la séance du
          1er et du 5e dixième, puis la régularité. Un badge pointillé a été inversé à la main ; un point après R/IR signale des séances non encodées avant le jalon.
          Chaque changement s’écrit au journal des présences, à votre nom.
        </p>)}

      {menu && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMenu(null)} />
          <div className="fixed z-50 carte bg-white shadow-flottant p-2 space-y-1.5" style={{ left: Math.min(menu.x, window.innerWidth - 300), top: Math.min(menu.y + 4, window.innerHeight - 160), width: 290 }}>
            <div className="flex gap-1">
              {CHOIX.map(([k, l, t]) => (
                <button key={k || 'x'} type="button" title={t} onClick={() => (k === 'justifie' ? null : poser(menu.li, menu.si, k))}
                  className={`h-8 flex-1 rounded-champ border text-second font-semibold ${k === 'justifie' ? 'cursor-default' : ''}`}
                  style={{ borderColor: 'rgb(var(--gris-300))', color: TEINTE[k === 'retard' ? 'present' : k] || 'var(--c-texte)' }}>{l}</button>))}
            </div>
            <div className="flex gap-1 items-center">
              <select className="controle h-8 flex-1 min-w-0 border border-slate-300 rounded-champ text-second" value={motif} onChange={e => setMotif(e.target.value)}>
                <option value="">J — motif de la justification…</option>
                {Object.entries(d.motifs || {}).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
              <button type="button" className="bouton h-8" disabled={!motif} onClick={() => poser(menu.li, menu.si, 'justifie', motif)}>J</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
