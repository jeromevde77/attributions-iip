/**
 * COMPLÉTER L'AUTONOMIE D'UNE UE (Charles, 24 novembre 2026 : « dans les attributions AeSI, l'autonomie attribuée est
 * inférieure à ce que le dossier pédagogique prévoit » ; tranché : « Lucie propose pour chaque ligne l'autonomie au
 * prorata de ses périodes, montre l'avant et l'après ligne par ligne, et n'écrit qu'après confirmation. Les lignes en
 * congé restent à 0. »). La fenêtre ne calcule rien : elle montre la simulation du serveur
 * (`POST /api/attributions/autonomie/completer`), puis la même requête avec `simulation: false`.
 */
import { useEffect, useState } from 'react';
import { IconClockPlus } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { demander } from '../lib/dialogue.jsx';
import { Fenetre, Tableau, TableauEntete, Th, Td, Tr, TrTotal, Encadre } from './ui.jsx';

const nb = v => Number(v || 0).toLocaleString('fr-BE', { maximumFractionDigits: 2 });
const pct = t => `${Math.round(Number(t || 0) * 100)} %`;

export default function CompleterAutonomie({ ueNum, section, onFermer, onFait }) {
  const annee = getAnnee();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const appeler = async simulation => {
    const r = await fetch('/api/attributions/autonomie/completer', { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ annee, ue_num: ueNum, section, simulation }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
    return j;
  };

  useEffect(() => {
    let vivant = true;
    appeler(true).then(j => { if (vivant) setD(j); }).catch(e => { if (vivant) setErreur(e.message); });
    return () => { vivant = false; };
  }, [ueNum, section, annee]);

  const n = d?.a_changer || 0;
  const completer = async () => {
    if (!n) return;
    if (!(await demander(`Ajuster l'autonomie de ${n} ligne${n > 1 ? 's' : ''} de l'UE ${ueNum} ?\n\n`
      + `Total de l'UE : ${nb(d.total_avant)} → ${nb(d.total_apres)} périodes d'autonomie.`))) return;
    setEnCours(true); setErreur(null);
    try { await appeler(false); onFait?.(); onFermer?.(); }
    catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  };

  const pied = (
    <div className="flex items-center justify-between gap-3 w-full">
      <span className="text-second text-slate-500 min-w-0">
        {d ? (n ? `${n} ligne${n > 1 ? 's' : ''} à ajuster.` : 'L’autonomie de chaque organisation respecte déjà la règle : rien à ajuster.') : ''}
      </span>
      <span className="flex gap-2">
        <button className="bouton" onClick={onFermer}>Fermer</button>
        <button className="bouton bouton-fort" disabled={!n || enCours} onClick={completer}>
          {enCours ? 'Écriture…' : `Ajuster ${n} ligne${n > 1 ? 's' : ''}`}
        </button>
      </span>
    </div>
  );

  return (
    <Fenetre icone={IconClockPlus} titre={`Compléter l'autonomie — UE ${ueNum}`} sous={section ? `${section} · ${annee}` : annee}
      large="grande" onFermer={onFermer} pied={pied}>
      {erreur && <Encadre etat="corriger" className="mb-3">{erreur}</Encadre>}
      {!d && !erreur && <p className="text-second text-slate-500">Calcul de la proposition…</p>}
      {d && (
        <>
          <p className="text-sm mb-2">
            Autonomie du dossier : <b>{nb(d.autonomie_dossier)} p.</b> pour <b>{nb(d.periodes_dossier)} p.</b> de cours.
            Lucie applique la règle du contrôle des attributions, organisation par organisation : tous les cours dédoublés
            ×N → autonomie × N exactement ; sinon entre l'autonomie du dossier et + 20 % des périodes ajoutées. La cible se
            répartit au prorata des périodes. Les lignes en congé, hors IIP, les activités Z et l'encadrement restent tels quels.
          </p>
          {(d.organisations || []).length > 0 && (
            <ul className="text-second mb-3 pl-0 list-none space-y-0.5">
              {d.organisations.map(o => (
                <li key={o.cle}>Organisation {o.organisation} : {o.multiple ? `dédoublée ×${o.multiple} → ${nb(o.cible)} exactement`
                  : `entre ${nb(o.minimum)} et ${nb(o.maximum)} → ${nb(o.cible)}`} <span className="text-slate-500">(aujourd’hui {nb(o.avant)})</span></li>))}
            </ul>)}
          <Tableau dense>
            <TableauEntete>
              <Th>Cours</Th><Th>Groupe</Th><Th align="droite">Org.</Th><Th>Professeur</Th>
              <Th align="droite">Périodes</Th><Th align="droite">Autonomie</Th><Th align="droite">Proposée</Th>
            </TableauEntete>
            <tbody>
              <TrTotal>
                <Td colSpan={4}>Total de l'UE</Td>
                <Td align="droite">{nb(d.lignes.reduce((t, l) => t + l.periodes, 0))}</Td>
                <Td align="droite">{nb(d.total_avant)}</Td>
                <Td align="droite">{nb(d.total_apres)}</Td>
              </TrTotal>
              {d.lignes.map(l => (
                <Tr key={l.id} className={l.change ? '' : 'opacity-50'}>
                  <Td>{l.code_cours || '—'}</Td>
                  <Td>{l.groupe || '—'}</Td>
                  <Td align="droite">{l.organisation}</Td>
                  <Td>{l.professeur || <span className="text-slate-400">— à désigner —</span>}</Td>
                  <Td align="droite">{nb(l.periodes)}</Td>
                  <Td align="droite">{nb(l.avant)}</Td>
                  <Td align="droite" ton={l.change ? 'fort' : 'secondaire'} title={l.raison || undefined}>
                    {l.change ? `→ ${nb(l.apres)}` : (l.raison || '')}
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Tableau>
        </>
      )}
    </Fenetre>
  );
}
