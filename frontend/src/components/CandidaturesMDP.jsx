import { useEffect, useState } from 'react';
import { IconEye } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Tableau, TableauEntete, Th, Td, Tr, Encadre, PastilleEtat, EnteteCarte } from './ui.jsx';
import { saisir, informer } from '../lib/dialogue.jsx';

/* LES CANDIDATURES DES ENSEIGNANTS — côté école (3.5.229). Personnel → Engagement → Candidatures des enseignants. La direction
   ouvre la campagne (année visée, du … au …) ; les enseignants déposent depuis leur espace ; la coordination (ses sections) analyse ;
   la direction transmet au CA et décide. Serveur : /api/candidatures. */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const ETAT = { deposee: 'disponible', analysee: 'surveiller', transmise_ca: 'surveiller', retenue: 'reussi', non_retenue: 'corriger', retiree: 'neutre' };

export default function CandidaturesMDP() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [camp, setCamp] = useState({ annee_cible: '', du: '', au: '' });
  const charger = () => fetch('/api/candidatures', { headers: authHeaders() })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); return j; })
    .then(j => { setD(j); setCamp({ annee_cible: j.campagne?.annee_cible || '', du: j.campagne?.du || '', au: j.campagne?.au || '' }); }).catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  const regler = async () => {
    const r = await fetch('/api/candidatures/reglage', { method: 'PUT', headers: authHeaders(), body: JSON.stringify(camp) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return informer(j.error || 'Refusé.');
    charger();
  };
  const statut = async (c, st) => {
    let mot = null;
    if (st === 'non_retenue') { mot = await saisir({ titre: 'Candidature non retenue', message: 'Un mot pour l’enseignant.', obligatoire: true, confirmer: 'Enregistrer' }); if (mot == null) return; }
    const r = await fetch(`/api/candidatures/${c.id}/statut`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ statut: st, mot }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) return informer(j.error || 'Refusé.');
    charger();
  };
  const voir = async c => {
    const r = await fetch(`/api/candidatures/${c.id}/document`, { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (r.ok) ouvrirApercu({ html: j.html, titre: j.titre, sousTitre: c.nom, nomFichier: j.nom, destinataire: { type: 'professeur', id: c.professeur_id } });
  };
  if (erreur) return <Encadre etat="corriger" titre="Lecture impossible">{erreur}</Encadre>;
  if (!d) return <p className="text-second text-slate-500">Chargement…</p>;
  const choix = c => [c.renonce && 'renonce à toute sa charge', c.maintien && 'maintien', c.augmentation && `augmentation à ${c.augmentation} p.`,
    c.temporaire && 'engagement temporaire', c.definitif && 'définitif'].filter(Boolean).join(' · ');
  return (
    <div className="space-y-4">
      <div>
        <h1 className="titre-ecran">Candidatures des enseignants</h1>
        <p className="text-second text-slate-500 m-0">Les formulaires de candidature à titre temporaire et à titre définitif, déposés par les enseignants depuis leur espace. Le dépôt vaut accusé de réception.</p>
      </div>
      <section className="carte overflow-hidden">
        <EnteteCarte titre="La campagne" sous={d.campagne?.ouverte ? 'Ouverte : les enseignants voient « Ma candidature » dans leur espace.' : 'Fermée.'} />
        <div className="px-4 py-3 flex flex-wrap items-end gap-3 text-sm">
          <label><span className="block text-slate-500">Année visée</span><input className="controle mt-1 w-32" placeholder="2027-2028" value={camp.annee_cible} disabled={!d.direction} onChange={e => setCamp(x => ({ ...x, annee_cible: e.target.value }))} /></label>
          <label><span className="block text-slate-500">Du</span><input type="date" className="controle mt-1" value={camp.du} disabled={!d.direction} onChange={e => setCamp(x => ({ ...x, du: e.target.value }))} /></label>
          <label><span className="block text-slate-500">Au</span><input type="date" className="controle mt-1" value={camp.au} disabled={!d.direction} onChange={e => setCamp(x => ({ ...x, au: e.target.value }))} /></label>
          {d.direction && <button type="button" className="bouton bouton-fort" onClick={regler}>Enregistrer la campagne</button>}
        </div>
      </section>
      {!d.candidatures.length ? <Encadre etat="neutre" titre="Aucune candidature">{d.annee_cible ? `Aucune candidature pour ${d.annee_cible}.` : 'La campagne n’est pas encore fixée.'}</Encadre>
        : <Tableau dense>
            <TableauEntete><Th>Membre du personnel</Th><Th>Déposée le</Th><Th>Situation actuelle</Th><Th>Demande</Th><Th>Cours / unités visés</Th><Th>État</Th><Th /></TableauEntete>
            <tbody>{d.candidatures.map(c => (
              <Tr key={c.id}>
                <Td><b>{c.nom}</b><div className="text-mention text-slate-500">{c.matricule}</div></Td>
                <Td className="whitespace-nowrap">{fr(c.depose_le)}</Td>
                <Td className="text-second">CC {c.situation?.cc || 0} · exp. {c.situation?.expert || 0} · déf. {c.situation?.definitif || 0}</Td>
                <Td className="text-second">{choix(c)}{c.remarque ? <div className="text-slate-500">« {c.remarque} »</div> : null}</Td>
                <Td className="text-second">{(c.lignes || []).map((l, i) => <div key={i}>{l.nature === 'definitif' ? 'déf.' : 'temp.'} · {l.section} · {l.cours_code} {l.cours_nom}{l.periodes ? ` (${l.periodes})` : ''}</div>)}</Td>
                <Td><PastilleEtat etat={ETAT[c.statut] || 'neutre'}>{d.statuts[c.statut] || c.statut}</PastilleEtat>{c.mot ? <div className="text-mention text-slate-500">{c.mot}</div> : null}</Td>
                <Td className="whitespace-nowrap">
                  <select className="controle !h-8" value="" onChange={e => e.target.value && statut(c, e.target.value)} aria-label="Changer l'état">
                    <option value="">État…</option><option value="analysee">Analysée</option>
                    {d.direction && <><option value="transmise_ca">Transmise au CA</option><option value="retenue">Retenue</option><option value="non_retenue">Non retenue</option></>}
                    <option value="deposee">Revenir à « reçue »</option></select>
                  <button type="button" className="ml-1 text-iip-blue" title="Voir la pièce" onClick={() => voir(c)}><IconEye size={16} /></button>
                </Td>
              </Tr>))}</tbody>
          </Tableau>}
    </div>);
}
