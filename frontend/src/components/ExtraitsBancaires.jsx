/* LES EXTRAITS DE COMPTE (3.1.444, Charles, 29 octobre 2026 : « un système qui vérifie sur
 * le compte en banque ce qui a été payé »). On dépose l'extrait téléchargé de la banque en
 * ligne (CODA, CAMT.053 ou CSV) ; Lucie montre d'abord, ligne par ligne, quel étudiant chaque
 * virement paie — reconnu par sa communication structurée, ou à vérifier — et n'enregistre
 * que ce qui est coché, au nom de la personne connectée. Un virement déjà importé ne se
 * verse pas deux fois. */
import { useState } from 'react';
import { IconCash, IconUpload } from '@tabler/icons-react';
import { Fenetre, Tableau, TableauEntete, Th, Td, Tr, PastilleEtat } from './ui.jsx';
import { authHeaders, getAnnee } from '../lib/api.js';
import { informer } from '../lib/dialogue.jsx';

const entetesFichier = () => { const { 'Content-Type': _ct, ...h } = authHeaders(); return h; };
const eur = n => (Number(n) || 0).toFixed(2).replace('.', ',') + ' €';
const fr = d => d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—';
const ETAT = {
  reconnu: ['reussi', 'reconnu'],
  douteux: ['surveiller', 'à vérifier'],
  inconnu: ['corriger', 'non rattaché'],
  deja: ['neutre', 'déjà importé'],
  ignore: ['indisponible', 'débit'],
};

export default function ExtraitsBancaires({ onFermer }) {
  const [lu, setLu] = useState(null);
  const [coches, setCoches] = useState(new Set());
  const [envoi, setEnvoi] = useState(false);
  const [voirTout, setVoirTout] = useState(false);

  async function lire(fichier) {
    if (!fichier) return;
    const fd = new FormData(); fd.append('fichier', fichier); fd.append('annee', getAnnee());
    setEnvoi(true);
    const r = await fetch('/api/frais-scolarite/banque/lire', { method: 'POST', headers: entetesFichier(), body: fd });
    const j = await r.json().catch(() => ({}));
    setEnvoi(false);
    if (!r.ok) { informer(`❌ ${j.error || 'Lecture refusée.'}`); return; }
    setLu(j);
    // Ce qui est reconnu part coché ; ce qui est à vérifier se coche à la main.
    setCoches(new Set(j.lignes.map((l, i) => (l.etat === 'reconnu' ? i : null)).filter(i => i !== null)));
  }

  async function verser() {
    const lignes = [...coches].map(i => lu.lignes[i]).map(l => ({ ref: l.ref, date: l.date, montant: l.montant,
      etudiant_id: l.etudiant.id, annee: l.annee, nom: l.nom, communication: l.communication }));
    setEnvoi(true);
    const r = await fetch('/api/frais-scolarite/banque/verser', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ lignes }) });
    const j = await r.json().catch(() => ({}));
    setEnvoi(false);
    if (!r.ok) { informer(`❌ ${j.error || 'Enregistrement refusé.'}`); return; }
    await informer(`✓ ${j.verses} versement(s) enregistré(s)${j.sautes ? ` ; ${j.sautes} déjà présent(s), laissé(s) tel(s) quel(s)` : ''}.`);
    setLu(null); setCoches(new Set());
  }

  const visibles = lu ? lu.lignes.map((l, i) => ({ l, i })).filter(({ l }) => voirTout || !['ignore', 'deja'].includes(l.etat)) : [];
  const total = [...coches].reduce((s, i) => s + (lu?.lignes[i]?.montant || 0), 0);
  const basculer = i => setCoches(s => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n; });

  return (
    <Fenetre icone={IconCash} titre="Extraits de compte — versements des étudiants" large="pleine" onFermer={onFermer}
      sous="Déposez l’extrait téléchargé de la banque en ligne. Rien ne s’enregistre avant votre confirmation."
      pied={lu && (
        <div className="flex items-center justify-between gap-3 w-full">
          <span className="min-w-0 text-second text-slate-500">
            {coches.size ? `${coches.size} versement(s) coché(s), ${eur(total)}` : 'Cochez les virements à enregistrer.'}
          </span>
          <div className="flex gap-2">
            <button type="button" className="bouton" onClick={() => { setLu(null); setCoches(new Set()); }}>Autre extrait</button>
            <button type="button" className="bouton bouton-fort" disabled={!coches.size || envoi} onClick={verser}>Enregistrer les versements cochés</button>
          </div>
        </div>
      )}>
      {!lu ? (
        <div className="space-y-3 text-sm text-slate-700">
          <p>Dans la banque en ligne, téléchargez l’extrait du compte qui reçoit les frais, au format <b>CODA</b>,
            <b> XML (CAMT.053)</b> ou <b>CSV</b>, puis déposez-le ici. Pour le CSV, gardez la ligne des titres de colonnes
            telle que la banque la donne : Lucie y reconnaît la date, le montant, le donneur d’ordre et la communication.</p>
          <p className="text-second text-slate-500">Un virement est reconnu par la <b>communication structurée</b> de
            l’étudiant (elle figure sur sa note de frais). Sans elle, Lucie cherche le nom du donneur d’ordre parmi les
            inscrits de l’année ; la ligne est alors à vérifier.</p>
          <label className="bouton bouton-fort inline-flex items-center gap-2 cursor-pointer">
            <IconUpload size={15} /> {envoi ? 'Lecture…' : 'Choisir l’extrait'}
            <input type="file" className="hidden" accept=".cod,.coda,.txt,.xml,.csv,.CODA,.COD,.XML,.CSV" onChange={e => lire(e.target.files?.[0])} />
          </label>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2 text-second text-slate-600">
            <span><b>{lu.fichier}</b> · {lu.format} · {lu.resume.total} mouvement(s)</span>
            <PastilleEtat etat="reussi">{lu.resume.reconnu} reconnu(s)</PastilleEtat>
            <PastilleEtat etat="surveiller">{lu.resume.douteux} à vérifier</PastilleEtat>
            <PastilleEtat etat="corriger">{lu.resume.inconnu} non rattaché(s)</PastilleEtat>
            {(lu.resume.deja + lu.resume.ignore) > 0 && (
              <button type="button" className="underline text-slate-500" onClick={() => setVoirTout(v => !v)}>
                {voirTout ? 'masquer' : 'voir'} les {lu.resume.deja} déjà importé(s) et {lu.resume.ignore} débit(s)
              </button>)}
          </div>
          <Tableau dense>
            <TableauEntete>
              <Th largeur="w-8" />
              <Th>Date</Th><Th align="droite">Montant</Th><Th>Donneur d’ordre</Th><Th>Communication</Th>
              <Th>Étudiant</Th><Th align="droite">Reste dû</Th><Th>État</Th>
            </TableauEntete>
            <tbody>
              {visibles.map(({ l, i }) => {
                const cochable = !!l.etudiant && ['reconnu', 'douteux'].includes(l.etat);
                const [etat, mot] = ETAT[l.etat] || ['neutre', l.etat];
                return (
                  <Tr key={l.ref}>
                    <Td>{cochable && <input type="checkbox" checked={coches.has(i)} onChange={() => basculer(i)} />}</Td>
                    <Td>{fr(l.date)}</Td>
                    <Td align="droite" className="tabular-nums whitespace-nowrap">{eur(l.montant)}</Td>
                    <Td>{l.nom || '—'}<div className="text-second text-slate-400">{l.compte_tiers}</div></Td>
                    <Td className="max-w-[260px] break-words">{l.communication || '—'}</Td>
                    <Td>{l.etudiant ? <>{String(l.etudiant.nom).toUpperCase()} {l.etudiant.prenom}
                      <div className="text-second text-slate-400">{l.annee}{l.etudiant.id_ecampus ? ` · ${l.etudiant.id_ecampus}` : ''}</div></> : '—'}</Td>
                    <Td align="droite" className="tabular-nums whitespace-nowrap">{l.reste != null ? eur(l.reste) : '—'}</Td>
                    <Td><PastilleEtat etat={etat}>{mot}</PastilleEtat>
                      {l.motif && <div className="text-second text-slate-500 mt-0.5">{l.motif}</div>}</Td>
                  </Tr>
                );
              })}
              {!visibles.length && <Tr><Td colSpan={8} className="text-center text-slate-400">Aucun crédit à rattacher dans cet extrait.</Td></Tr>}
            </tbody>
          </Tableau>
          <p className="text-second text-slate-500">Un virement non rattaché s’encode à la main dans la fiche de
            l’étudiant (Finances → Versements), après avoir retrouvé qui l’a fait.</p>
        </div>
      )}
    </Fenetre>
  );
}
