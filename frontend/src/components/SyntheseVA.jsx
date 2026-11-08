import { useEffect, useMemo, useState } from 'react';
import { Fenetre, Tableau, TableauEntete, Th, Td, Tr, Encadre, PastilleEtat } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { useDroits, peutGeste } from '../lib/droits.js';
import { nomPropre } from '../lib/nom.js';

/* LE TABLEAU DE SYNTHÈSE DES VALORISATIONS (3.5.222, Charles, 8 novembre 2026 : « un tableau de synthèse avec tous les champs
   alignés, pour corriger en masse comme les notes dans délibération » ; tranché : décision et base, dates du circuit, motivation,
   recevabilité et avis ; un dossier validé, la direction le corrige et il se revalide).
   Une ligne par demande (étudiant × unité), les champs du circuit en colonnes. Une case se corrige sur place ; cocher des lignes
   puis « Appliquer aux cochées » pose la même valeur sur toutes. Chaque écriture passe par la porte du dossier
   (PUT /valorisations/:vid/demande | recevabilite | avis | decision | notification | eprom) : mêmes contrôles, même journal —
   ce que la fiche refuse, la grille le refuse aussi, et le dit sur la ligne. Un dossier validé est gelé : pour la direction, la
   correction retire la validation (motif écrit au journal), écrit, puis revalide ; pour les autres, la ligne se lit. */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const jour = d => (d ? String(d).slice(0, 10) : '');
const DECISION = v => (!v.decision_le ? '' : v.decision === 'refusee' ? 'refusee' : v.type === 'partielle' ? 'partielle' : 'totale');
const SENS = [['', '—'], ['favorable', 'favorable'], ['partiel', 'partiel'], ['defavorable', 'défavorable']];

async function appel(methode, url, corps) {
  const r = await fetch(`/api/etudiants${url}`, { method: methode, headers: authHeaders(), body: corps ? JSON.stringify(corps) : undefined });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.error || `Refusé (${r.status}).`);
  return j;
}

/** L'écriture d'un champ, par la porte du dossier. `x` = la valeur nouvelle, fusionnée avec ce que porte déjà le dossier. */
function porteDe(v, champ, x) {
  const m = { ...v, [champ]: x };
  switch (champ) {
    case 'porte': case 'date_reception':
      return () => appel('PUT', `/valorisations/${v.id}/demande`, { [champ]: x || null });
    case 'recevable': case 'motif_irrecevabilite':
      return () => appel('PUT', `/valorisations/${v.id}/recevabilite`, {
        recevable: champ === 'recevable' ? x === 'oui' : !!v.recevable, motif_irrecevabilite: m.motif_irrecevabilite || '' });
    case 'avis_sens': case 'avis_texte': case 'avis_par':
      return () => appel('PUT', `/valorisations/${v.id}/avis`, { avis_sens: m.avis_sens || '', avis_texte: m.avis_texte || '', avis_par: m.avis_par || '' });
    case 'decision': case 'base_code': case 'decision_ce_date': case 'motif_refus': case 'commentaire': {
      const d = champ === 'decision' ? x : DECISION(v) || 'totale';
      return () => appel('PUT', `/valorisations/${v.id}/decision`, {
        decision: d === 'refusee' ? 'refusee' : 'accordee',
        type: d === 'partielle' ? 'partielle' : d === 'totale' ? 'complete' : v.type,
        base_code: m.base_code || '', motif_refus: m.motif_refus || '', commentaire: m.commentaire ?? null,
        decision_ce_date: m.decision_ce_date || null, cible: v.cible, cible_detail: v.cible_detail });
    }
    case 'notifie_le': return () => appel('PUT', `/valorisations/${v.id}/notification`, {});
    case 'eprom_le': return () => appel('PUT', `/valorisations/${v.id}/eprom`, {});
    default: return null;
  }
}

const COLONNES_MASSE = [
  ['decision', 'Décision', [['totale', 'totale'], ['partielle', 'partielle'], ['refusee', 'refusée']]],
  ['base_code', 'Base légale', null],
  ['decision_ce_date', 'Date de séance du Conseil', 'date'],
  ['recevable', 'Recevabilité', [['oui', 'recevable'], ['non', 'irrecevable']]],
  ['avis_sens', 'Sens de l’avis', SENS.slice(1)],
  ['avis_texte', 'Texte de l’avis', 'texte'],
  ['motif_refus', 'Motif du refus', 'texte'],
  ['commentaire', 'Remarque du Conseil', 'texte'],
  ['date_reception', 'Reçue le', 'date'],
  ['notifie_le', 'Notifiée (aujourd’hui)', 'pointer'],
  ['eprom_le', 'Encodée dans eProm (aujourd’hui)', 'pointer'],
];

export default function SyntheseVA({ annee, onClose, onFait }) {
  useDroits();
  const direction = peutGeste('valorisation.valider');
  const [lignes, setLignes] = useState(null);
  const [bases, setBases] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [filtre, setFiltre] = useState({ q: '', section: '', ue: '' });
  const [coches, setCoches] = useState(new Set());
  const [etats, setEtats] = useState({});           // vid → { enCours, erreur, ok }
  const [masse, setMasse] = useState({ champ: 'decision', valeur: '' });
  const [enMasse, setEnMasse] = useState(false);

  const charger = () => fetch(`/api/etudiants/valorisations/registre?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
    .then(r => (r.ok ? r.json() : Promise.reject(new Error('Lecture impossible.'))))
    .then(l => setLignes((Array.isArray(l) ? l : []).filter(v => !v.archive_le)))
    .catch(e => setErreur(e.message));
  useEffect(() => {
    charger();
    fetch('/api/etudiants/valorisations/referentiel', { headers: authHeaders() }).then(r => r.json()).then(j => setBases(j.bases || [])).catch(() => {});
  }, [annee]);   // eslint-disable-line react-hooks/exhaustive-deps

  const visibles = useMemo(() => (lignes || []).filter(v => {
    const q = filtre.q.trim().toLowerCase();
    if (q && !`${v.nom} ${v.prenom}`.toLowerCase().includes(q)) return false;
    if (filtre.section && (v.section || '') !== filtre.section) return false;
    if (filtre.ue && String(v.ue_num) !== filtre.ue) return false;
    return true;
  }).sort((a, b) => (a.ue_num - b.ue_num) || String(a.nom).localeCompare(String(b.nom), 'fr')), [lignes, filtre]);
  const sections = useMemo(() => [...new Set((lignes || []).map(v => v.section).filter(Boolean))].sort(), [lignes]);
  const ues = useMemo(() => [...new Set((lignes || []).map(v => v.ue_num))].sort((a, b) => a - b), [lignes]);

  /** Une écriture, avec le dégel et le regel d'un dossier validé (direction seulement). */
  const ecrire = async (v, champ, x) => {
    const faire = porteDe(v, champ, x);
    if (!faire) return false;
    if (v.valide_le && !direction) { setEtats(e => ({ ...e, [v.id]: { erreur: 'Dossier validé : seule la direction le corrige.' } })); return false; }
    setEtats(e => ({ ...e, [v.id]: { enCours: true } }));
    try {
      if (v.valide_le) await appel('DELETE', `/valorisations/${v.id}/validation`, { motif: `Correction dans le tableau de synthèse : ${champ}` });
      try { await faire(); } finally {
        if (v.valide_le) {
          try { await appel('PUT', `/valorisations/${v.id}/validation`, { detail: 'Revalidé après correction dans le tableau de synthèse' }); }
          catch (e) { throw new Error(`Corrigé, mais pas revalidé : ${e.message}`); }
        }
      }
      setEtats(e => ({ ...e, [v.id]: { ok: true } }));
      return true;
    } catch (e) {
      setEtats(s => ({ ...s, [v.id]: { erreur: e.message } }));
      return false;
    }
  };
  const ecrireEtRelire = async (v, champ, x) => { await ecrire(v, champ, x); await charger(); onFait?.(); };

  const appliquer = async () => {
    const cibles = visibles.filter(v => coches.has(v.id));
    setEnMasse(true);
    for (const v of cibles) await ecrire(v, masse.champ, masse.valeur);
    setEnMasse(false);
    await charger(); onFait?.();
  };

  const def = COLONNES_MASSE.find(c => c[0] === masse.champ);
  const choixMasse = def?.[0] === 'base_code' ? bases.map(b => [b.code, `${b.code} — ${b.libelle}`]) : Array.isArray(def?.[2]) ? def[2] : null;
  const toutCoche = visibles.length > 0 && visibles.every(v => coches.has(v.id));
  const nbErreurs = Object.values(etats).filter(e => e.erreur).length;

  const Choix = ({ v, champ, valeur, options, largeur = 'w-28' }) => (
    <select className={`controle !h-8 text-second ${largeur}`} value={valeur || ''} disabled={(v.valide_le && !direction) || etats[v.id]?.enCours}
      onChange={e => ecrireEtRelire(v, champ, e.target.value)}>
      <option value="">—</option>
      {options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
    </select>);
  const Texte = ({ v, champ, valeur, largeur = 'w-56' }) => (
    <input className={`controle !h-8 text-second ${largeur}`} defaultValue={valeur || ''} disabled={(v.valide_le && !direction) || etats[v.id]?.enCours}
      onBlur={e => { if (e.target.value !== (valeur || '')) ecrireEtRelire(v, champ, e.target.value); }} />);
  const DateC = ({ v, champ, valeur }) => (
    <input type="date" className="controle !h-8 text-second w-36" defaultValue={jour(valeur)} disabled={(v.valide_le && !direction) || etats[v.id]?.enCours}
      onBlur={e => { if (e.target.value !== jour(valeur)) ecrireEtRelire(v, champ, e.target.value); }} />);
  const Pointer = ({ v, champ, valeur }) => (valeur ? <span className="whitespace-nowrap">{fr(valeur)}</span>
    : <button type="button" className="bouton !h-8 text-second" disabled={!v.decision_le || etats[v.id]?.enCours} onClick={() => ecrireEtRelire(v, champ, 'oui')}>pointer</button>);

  return (
    <Fenetre titre="Tableau de synthèse des valorisations" sous={`${annee} · ${visibles.length} demande(s)`} large="pleine" hauteurFixe onFermer={onClose}
      pied={<div className="flex flex-wrap items-center gap-2 w-full">
        <span className="text-second text-slate-500">{coches.size} cochée(s) · appliquer</span>
        <select className="controle text-second" value={masse.champ} onChange={e => setMasse({ champ: e.target.value, valeur: '' })}>
          {COLONNES_MASSE.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        {choixMasse ? (
          <select className="controle text-second max-w-[18rem]" value={masse.valeur} onChange={e => setMasse(m => ({ ...m, valeur: e.target.value }))}>
            <option value="">— choisir —</option>
            {choixMasse.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>)
          : def?.[2] === 'date' ? <input type="date" className="controle text-second" value={masse.valeur} onChange={e => setMasse(m => ({ ...m, valeur: e.target.value }))} />
          : def?.[2] === 'texte' ? <input className="controle text-second w-72" value={masse.valeur} onChange={e => setMasse(m => ({ ...m, valeur: e.target.value }))} placeholder="Le même texte pour toutes" />
          : null}
        <button type="button" className="bouton bouton-fort" disabled={!coches.size || enMasse || (def?.[2] !== 'pointer' && !masse.valeur)} onClick={appliquer}>
          {enMasse ? 'Écriture…' : 'Appliquer aux cochées'}</button>
        {nbErreurs > 0 && <span className="text-second" style={{ color: 'var(--c-refuse)' }}>{nbErreurs} ligne(s) refusée(s) : le motif est sur la ligne.</span>}
      </div>}>
      {erreur && <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>}
      {!erreur && !lignes && <div className="text-second text-slate-500 py-6">Chargement…</div>}
      {lignes && (
        <div className="space-y-3">
          <div className="flex flex-nowrap items-center gap-2">
            <input className="controle w-56" placeholder="Nom de l’étudiant" value={filtre.q} onChange={e => setFiltre(f => ({ ...f, q: e.target.value }))} />
            <select className="controle" value={filtre.section} onChange={e => setFiltre(f => ({ ...f, section: e.target.value }))}>
              <option value="">Toutes les sections</option>{sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select className="controle" value={filtre.ue} onChange={e => setFiltre(f => ({ ...f, ue: e.target.value }))}>
              <option value="">Toutes les unités</option>{ues.map(n => <option key={n} value={n}>{n === 0 ? 'Admission' : `UE ${n}`}</option>)}
            </select>
            <span className="text-second text-slate-500 truncate">Une case se corrige sur place ; un dossier validé, la direction le corrige et il se revalide.</span>
          </div>
          <div className="overflow-x-auto">
            <Tableau dense>
              <TableauEntete>
                <Th largeur="w-8"><input type="checkbox" aria-label="Tout cocher" checked={toutCoche}
                  onChange={e => setCoches(e.target.checked ? new Set(visibles.map(v => v.id)) : new Set())} /></Th>
                <Th>Étudiant</Th><Th>UE</Th><Th>Porte</Th><Th>Reçue le</Th><Th>Recevabilité</Th><Th>Motif d’irrecevabilité</Th>
                <Th>Avis</Th><Th>Texte de l’avis</Th><Th>Chargé de cours</Th><Th>Décision</Th><Th>Base</Th><Th>Séance du Conseil</Th>
                <Th>Motif du refus</Th><Th>Remarque du Conseil</Th><Th>Validée</Th><Th>Notifiée</Th><Th>eProm</Th><Th>État</Th>
              </TableauEntete>
              <tbody>
                {visibles.map(v => {
                  const s = etats[v.id] || {};
                  return (
                    <Tr key={`${v.id}-${v.valide_le || ''}-${v.decision_le || ''}-${v.avis_le || ''}`}>
                      <Td><input type="checkbox" aria-label={`${v.nom} UE ${v.ue_num}`} checked={coches.has(v.id)}
                        onChange={() => setCoches(c => { const x = new Set(c); x.has(v.id) ? x.delete(v.id) : x.add(v.id); return x; })} /></Td>
                      <Td className="whitespace-nowrap">{nomPropre(v.nom, v.prenom)}</Td>
                      <Td className="whitespace-nowrap" title={v.ue_nom || ''}>{v.ue_num === 0 ? 'Admission' : `UE ${v.ue_num}`}</Td>
                      <Td><Choix v={v} champ="porte" valeur={v.porte} largeur="w-20" options={[['AD', 'AD'], ['VA', 'VA'], ['VAE', 'VAE']]} /></Td>
                      <Td><DateC v={v} champ="date_reception" valeur={v.date_reception} /></Td>
                      <Td><Choix v={v} champ="recevable" valeur={v.recevabilite_le ? (v.recevable ? 'oui' : 'non') : ''} options={[['oui', 'recevable'], ['non', 'irrecevable']]} /></Td>
                      <Td><Texte v={v} champ="motif_irrecevabilite" valeur={v.motif_irrecevabilite} largeur="w-44" /></Td>
                      <Td><Choix v={v} champ="avis_sens" valeur={v.avis_sens} options={SENS.slice(1)} /></Td>
                      <Td><Texte v={v} champ="avis_texte" valeur={v.avis_texte} /></Td>
                      <Td><Texte v={v} champ="avis_par" valeur={v.avis_par} largeur="w-40" /></Td>
                      <Td><Choix v={v} champ="decision" valeur={DECISION(v)} options={[['totale', 'totale'], ['partielle', 'partielle'], ['refusee', 'refusée']]} /></Td>
                      <Td><Choix v={v} champ="base_code" valeur={v.base_code} largeur="w-20" options={bases.map(b => [b.code, b.code])} /></Td>
                      <Td><DateC v={v} champ="decision_ce_date" valeur={v.decision_ce_date} /></Td>
                      <Td><Texte v={v} champ="motif_refus" valeur={v.motif_refus} /></Td>
                      <Td><Texte v={v} champ="commentaire" valeur={v.commentaire} /></Td>
                      <Td className="whitespace-nowrap">{v.valide_le ? <PastilleEtat etat="reussi">{fr(v.valide_le)}</PastilleEtat>
                        : direction && v.decision_le ? <button type="button" className="bouton !h-8 text-second" disabled={s.enCours}
                          onClick={async () => { setEtats(e => ({ ...e, [v.id]: { enCours: true } }));
                            try { await appel('PUT', `/valorisations/${v.id}/validation`, {}); setEtats(e => ({ ...e, [v.id]: { ok: true } })); }
                            catch (x) { setEtats(e => ({ ...e, [v.id]: { erreur: x.message } })); }
                            await charger(); onFait?.(); }}>valider</button> : '—'}</Td>
                      <Td><Pointer v={v} champ="notifie_le" valeur={v.notifie_le} /></Td>
                      <Td><Pointer v={v} champ="eprom_le" valeur={v.eprom_le} /></Td>
                      <Td className="min-w-[12rem] text-second">
                        {s.enCours ? <span className="text-slate-500">écriture…</span>
                          : s.erreur ? <span style={{ color: 'var(--c-refuse)' }}>{s.erreur}</span>
                          : s.ok ? <span style={{ color: 'var(--c-reussi)' }}>✓ enregistré</span>
                          : <span className="text-slate-500">{v.etat || ''}</span>}
                      </Td>
                    </Tr>);
                })}
              </tbody>
            </Tableau>
          </div>
        </div>)}
    </Fenetre>);
}
