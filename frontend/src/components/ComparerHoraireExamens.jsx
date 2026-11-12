import { useMemo, useState } from 'react';
import { IconFileSpreadsheet, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre, Tableau, Th, Td, Tr, Encadre, PastilleEtat, TuileEtat } from './ui.jsx';

/**
 * COMPARER UN HORAIRE D'EXAMENS (EXCEL) AU CALENDRIER DES SESSIONS (3.5.361, Charles, 12 novembre 2026 : « puis-je envoyer ça dans
 * Lucie afin de comparer à ce que nous avons ? »). On dépose le classeur du campus ; Lucie garde les lignes de nos sections, les
 * rattache à un cours ou à une unité, et dit pour chacune : pareil, différent (date ou heure), absent de Lucie, non reconnu ; puis ce
 * que Lucie a dans la même période et que le classeur ne porte pas. LECTURE SEULE : rien ne s'écrit.
 */
const ETATS = {
  pareil: { etat: 'reussi', mot: 'Pareil' },
  different: { etat: 'corriger', mot: 'Différent' },
  absent: { etat: 'surveiller', mot: 'Absent de Lucie' },
  inconnu: { etat: 'neutre', mot: 'Non reconnu' },
};
const jour = d => (d ? new Date(`${d}T12:00:00`).toLocaleDateString('fr-BE', { weekday: 'short', day: '2-digit', month: '2-digit' }) : '—');

export default function ComparerHoraireExamens({ onFermer }) {
  const [res, setRes] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [filtre, setFiltre] = useState('ecarts');
  const lire = async f => {
    if (!f) return;
    setErreur(null); setEnCours(true); setRes(null);
    try {
      const fichier = await new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = () => ko(new Error('Fichier illisible.')); r.readAsDataURL(f); });
      const r = await fetch('/api/calendrier/comparer-excel', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee: getAnnee(), fichier }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'La comparaison a échoué.');
      setRes(j);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  const lignes = useMemo(() => (res?.lignes || []).filter(l => filtre === 'tout' || (filtre === 'ecarts' ? l.etat !== 'pareil' : l.etat === filtre)), [res, filtre]);
  const T = res?.totaux || {};
  return (
    <Fenetre icone={IconFileSpreadsheet} titre="Comparer un horaire d’examens" sous={`Calendrier des sessions — ${getAnnee()} · lecture seule, rien ne s’écrit`}
      large="pleine" onFermer={onFermer}
      pied={<div className="flex items-center gap-2 w-full"><span className="text-second text-slate-500 flex-1 min-w-0">
        Seules les lignes de nos sections et les épreuves (pas les cours ni les formations) sont comparées à la première session.</span>
        <button type="button" className="bouton" onClick={onFermer}>Fermer</button></div>}>
      <div className="space-y-3">
        <label className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-slate-600">Le classeur Excel de l’horaire d’examens :</span>
          <input type="file" accept=".xlsx" onChange={e => lire(e.target.files?.[0])} />
          {enCours && <span className="text-second text-slate-500">Lecture…</span>}
        </label>
        {erreur && <Encadre etat="corriger" icone={IconAlertTriangle} titre={erreur} />}
        {res && <>
          <p className="text-second text-slate-600 m-0">Du {jour(res.periode?.du)} au {jour(res.periode?.au)} · sections : {res.sections.join(', ') || '—'}
            · {res.ignorees.autres_sections} ligne(s) d’autres écoles et {res.ignorees.pas_examen} cours ou formations écartés.</p>
          <div className="flex flex-wrap gap-2">
            {[['ecarts', 'À regarder', T.lignes - T.pareil, 'surveiller'], ['pareil', 'Pareil', T.pareil, 'reussi'], ['different', 'Différent', T.different, 'corriger'],
              ['absent', 'Absent de Lucie', T.absent, 'surveiller'], ['inconnu', 'Non reconnu', T.inconnu, 'neutre'], ['tout', 'Toutes les lignes', T.lignes, 'neutre']].map(([k, l, n, e]) => (
              <TuileEtat key={k} etat={e} taille="compacte" valeur={n ?? 0} libelle={l} actif={filtre === k} onClick={() => setFiltre(k)} />))}
          </div>
          <Tableau dense>
            <thead><tr><Th>État</Th><Th>Excel : date</Th><Th>Heure</Th><Th>Section</Th><Th>Épreuve (Excel)</Th><Th>Rattachée à</Th><Th>Lucie</Th><Th>Locaux (Excel)</Th></tr></thead>
            <tbody>{lignes.map((l, i) => (
              <Tr key={i} className="align-top">
                <Td><PastilleEtat etat={ETATS[l.etat].etat}>{ETATS[l.etat].mot}</PastilleEtat>
                  {l.ecarts?.length > 0 && <div className="text-mention text-slate-500 mt-0.5">{l.ecarts.join(', ')}</div>}</Td>
                <Td className="whitespace-nowrap">{jour(l.date)}</Td>
                <Td className="whitespace-nowrap tabular-nums">{l.debut || '—'}{l.fin ? `–${l.fin}` : ''}</Td>
                <Td className="text-second">{l.section_excel}{l.bloc ? ` · ${l.bloc}` : ''}<div className="text-mention text-slate-400">{l.type}</div></Td>
                <Td>{l.intitule}{l.titulaire && <div className="text-mention text-slate-500">{l.titulaire}</div>}</Td>
                <Td className="text-second">{l.ue_num ? <>UE {l.ue_num}{l.cours_code ? ` · ${l.cours_code}` : ''}<div className="text-mention text-slate-500">{l.cours_nom}</div>
                  <div className="text-mention text-slate-400">par {l.par}</div></> : '—'}</Td>
                <Td className="text-second whitespace-nowrap">{l.lucie ? <>{jour(l.lucie.date)} {l.lucie.heure || ''}{l.lucie.local && <div className="text-mention text-slate-500">{l.lucie.local}</div>}</> : '—'}</Td>
                <Td className="text-second">{l.locaux.join(', ')}{l.groupes > 1 && <div className="text-mention text-slate-400">{l.groupes} groupes</div>}</Td>
              </Tr>))}
            </tbody>
          </Tableau>
          {res.seulement_lucie.length > 0 && <>
            <div className="intertitre">Dans Lucie, mais pas dans le classeur ({res.seulement_lucie.length})</div>
            <Tableau dense>
              <thead><tr><Th>Date</Th><Th>Heure</Th><Th>Unité · cours</Th><Th>Local</Th></tr></thead>
              <tbody>{res.seulement_lucie.map((x, i) => (
                <Tr key={i}><Td>{jour(x.s1_date)}</Td><Td>{x.s1_heure || '—'}</Td>
                  <Td>UE {x.ue_num}{x.cours_code ? ` · ${x.cours_code}` : ''} <span className="text-slate-500">{x.cours_nom}</span></Td><Td>{x.s1_local || '—'}</Td></Tr>))}
              </tbody>
            </Tableau></>}
        </>}
      </div>
    </Fenetre>);
}
