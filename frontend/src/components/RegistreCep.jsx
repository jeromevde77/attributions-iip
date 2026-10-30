/**
 * LE REGISTRE DU CONGÉ-ÉDUCATION PAYÉ (audit du 28 octobre 2026 : la route
 * `/api/cep/registre` existait, aucun écran ne l'appelait — « le registre CEP dans le
 * rail » restait à venir). Qui est au CEP cette année et, unité par unité, où en est
 * son assiduité : le seuil de 10 % d'absences injustifiées se voit ici avant d'être
 * découvert par l'employeur. Une face du Suivi des présences.
 */
import { useEffect, useState } from 'react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Encadre, PastilleEtat } from './ui.jsx';

const REGION = { bruxelles: 'Bruxelles', wallonie: 'Wallonie', flandre: 'Flandre' };
const pc = v => `${String(Math.round((v || 0) * 1000) / 10).replace('.', ',')} %`;

export default function RegistreCep() {
  const annee = getAnnee();
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  useEffect(() => {
    fetch(`/api/cep/registre?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); setD(j); })
      .catch(e => setErreur(e.message));
  }, [annee]);
  if (erreur) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!d) return <p className="text-sm text-slate-400">Calcul du registre…</p>;
  if (!d.lignes.length) return <Encadre etat="neutre">Aucun étudiant au congé-éducation payé en {annee}. La case se coche sur la fiche, onglet Congé-éducation.</Encadre>;
  const alertes = d.lignes.filter(l => l.ues.some(u => u.alerte)).length;
  return (
    <div className="space-y-2">
      <p className="text-second text-slate-600 m-0">{d.lignes.length} étudiant(s) au congé-éducation payé en {annee}
        {alertes ? <> · <b style={{ color: 'var(--c-refuse)' }}>{alertes} au-delà de 10 % d’absences injustifiées</b> sur une période</> : null}.
        Les attestations se produisent depuis la fiche, onglet Congé-éducation.</p>
      <div className="overflow-auto">
        <table className="w-full text-sm">
          <thead><tr className="tab-entete text-left">
            <th className="px-2 py-1.5">Étudiant</th><th className="px-2 py-1.5">Région · employeur</th><th className="px-2 py-1.5">Unités</th></tr></thead>
          <tbody>{d.lignes.map(l => (
            <tr key={l.etudiant_id} className="border-b border-slate-100 align-top">
              <td className="px-2 py-1.5"><b>{String(l.nom || '').toUpperCase()}</b> {l.prenom}
                <div className="text-second text-slate-500">{[l.id_ecampus, l.section].filter(Boolean).join(' · ')}</div></td>
              <td className="px-2 py-1.5">{REGION[l.region] || l.region}<div className="text-second text-slate-500">{l.employeur || '—'}</div></td>
              <td className="px-2 py-1.5">
                <div className="flex flex-wrap gap-1.5">
                  {l.ues.map(u => (
                    <span key={u.ue_num} title={`${u.nb_seances} séance(s) · ${u.non_encodees} présence(s) non encodée(s) · pire période : ${pc(u.taux_max)} d’absences injustifiées`}>
                      <PastilleEtat etat={u.alerte ? 'corriger' : u.non_encodees ? 'surveiller' : 'reussi'}>
                        UE {u.ue_num} · {pc(u.taux_max)}{u.non_encodees ? ` · ${u.non_encodees} à encoder` : ''}</PastilleEtat>
                    </span>))}
                  {!l.ues.length && <span className="text-second text-slate-500">aucune unité</span>}
                </div>
              </td>
            </tr>))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
