import { useEffect, useState } from 'react';
import { IconBriefcase, IconSend, IconCheck, IconClock } from '@tabler/icons-react';
import { ListeEtats, LigneEtat, PastilleEtat, Encadre } from './ui.jsx';
import { Fiche } from './MesTfe.jsx';
import { authHeaders } from '../lib/api.js';
import { informer, saisir } from '../lib/dialogue.jsx';

/* MES STAGES (3.5.213, Charles, 8 novembre 2026 : « il faut avancer » ; choisis : la fiche du superviseur et une porte pour le
   maître de stage). Les stages dont le professeur est le superviseur (professeur de stage) : étudiant, lieu, maître de stage,
   période, visites ; puis les fiches d'évaluation de l'UE. Il remplit la sienne ; celle du maître de stage, il l'encode à sa
   place OU lui envoie un lien (sans compte, 60 jours). La note va dans le carnet du cours. Lu dans Lucie comme dans l'espace
   enseignant (par le relais). */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const remplie = f => f.criteres.length > 0 && f.criteres.every(c => c.note);

function LienMaitre({ stage, fiche, onFait }) {
  const [envoi, setEnvoi] = useState(false);
  const l = fiche.lien;
  const envoyer = async () => {
    let email = stage.maitre.email || '';
    if (!email || l) {
      const v = await saisir({ message: `Adresse du maître de stage${stage.maitre.nom ? ` (${stage.maitre.nom})` : ''}`, valeur: email });
      if (v == null) return; email = String(v).trim();
    }
    setEnvoi(true);
    try {
      const r = await fetch(`/api/mes-cours/stages/${stage.id}/fiche/${fiche.id}/lien`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ email }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Envoi refusé.');
      informer(`✓ Lien envoyé à ${j.email}, valable jusqu’au ${fr(j.expire_le)}.`);
      onFait();
    } catch (e) { informer(e.message); } finally { setEnvoi(false); }
  };
  return (
    <div className="flex flex-wrap items-center gap-3 pt-1">
      <span className="text-second text-slate-500 min-w-0 flex-1">
        {l ? <>Lien envoyé à <span className="select-all">{l.email}</span> le {fr(l.cree_le)} (jusqu’au {fr(l.expire_le)})
          {l.rempli_le ? <> · <b style={{ color: 'var(--c-reussi)' }}>rempli le {fr(l.rempli_le)}</b></> : l.ouvert_le ? ' · ouvert, pas encore rempli' : ' · pas encore ouvert'}</>
          : 'Le maître de stage peut remplir cette fiche lui-même, sans compte : envoyez-lui un lien. Vous pouvez aussi l’encoder à sa place.'}
      </span>
      <button type="button" className="bouton inline-flex items-center gap-1.5" disabled={envoi} onClick={envoyer}>
        <IconSend size={16} /> {envoi ? 'Envoi…' : l ? 'Renvoyer un lien' : 'Envoyer le lien au maître de stage'}
      </button>
    </div>);
}

export default function MesStages() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const charger = () => fetch('/api/mes-cours/stages', { headers: authHeaders() })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); setD(j); })
    .catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);

  if (erreur) return <Encadre etat="corriger" titre="Mes stages">{erreur}</Encadre>;
  if (!d) return <div className="text-second text-slate-500 py-8">Chargement…</div>;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="titre-ecran">Mes stages</h1>
        <p className="text-second text-slate-500">Les stages dont vous êtes le professeur de stage (superviseur), {d.annee}. Les fiches d’évaluation se remplissent ici ; la note va dans le carnet du cours.</p>
      </div>
      {!d.relie && <Encadre etat="surveiller" titre="Compte non relié">Votre compte n’est relié à aucune fiche du personnel : le secrétariat fait le lien (Personnel → fiche → Accès Lucie).</Encadre>}
      {d.relie && !d.stages.length && <Encadre etat="neutre" titre="Aucun stage">Vous n’êtes professeur de stage d’aucun étudiant cette année. La coordination ou le secrétariat l’indique sur le stage (Organisation → Stages).</Encadre>}
      {d.stages.length > 0 && (
        <ListeEtats>
          {d.stages.map(s => {
            const reste = s.fiches.filter(f => f.a_moi && !remplie(f)).length;
            const etat = !s.fiches.length ? 'neutre' : reste ? 'surveiller' : 'reussi';
            return (
              <LigneEtat key={s.id} etat={etat} icone={IconBriefcase} ouverte={ouvert === s.id} onClick={() => setOuvert(o => (o === s.id ? null : s.id))}
                titre={`${String(s.etudiant.nom || '').toUpperCase()} ${s.etudiant.prenom || ''}`}
                sous={[s.lieu.nom, s.intitule || s.domaine].filter(Boolean).join(' · ') || 'Lieu à préciser'}
                meta={s.en_cours ? <PastilleEtat etat="disponible">en cours</PastilleEtat> : null}
                droite={<span className="text-second text-slate-500 whitespace-nowrap">
                  {s.debut ? `${fr(s.debut)} → ${fr(s.fin)}` : 'dates à fixer'}{s.fiches.length ? ` · ${reste ? `${reste} fiche${reste > 1 ? 's' : ''} à remplir` : 'fiches remplies'}` : ''}</span>}>
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <div><span className="text-slate-500">Unité :</span> {s.ue_num ? `${s.ue_num} — ${s.ue_nom || ''}` : '—'}{s.section ? ` · ${s.section}` : ''}</div>
                      <div><span className="text-slate-500">Lieu :</span> {s.lieu.nom || '—'}{s.lieu.service ? ` — ${s.lieu.service}` : ''}</div>
                      {s.lieu.adresse && <div className="text-second text-slate-500">{s.lieu.adresse}</div>}
                      <div><span className="text-slate-500">Période :</span> {s.debut ? `du ${fr(s.debut)} au ${fr(s.fin)}` : 'à fixer'}{s.heures_prevues ? ` · ${s.heures_prevues} h prévues` : ''}</div>
                      {s.etudiant.email && <div><span className="text-slate-500">Étudiant :</span> <span className="select-all">{s.etudiant.email}</span></div>}
                    </div>
                    <div className="space-y-1">
                      <div><span className="text-slate-500">Maître de stage :</span> {s.maitre.nom || <i className="text-slate-400">non indiqué</i>}{s.maitre.fonction ? `, ${s.maitre.fonction}` : ''}</div>
                      {s.maitre.email && <div className="text-second"><span className="select-all">{s.maitre.email}</span></div>}
                      {s.maitre.tel && <div className="text-second"><span className="select-all">{s.maitre.tel}</span></div>}
                      <div className="flex items-center gap-2 pt-1">
                        {s.visites.faites ? <IconCheck size={16} style={{ color: 'var(--c-reussi)' }} /> : <IconClock size={16} className="text-slate-400" />}
                        <span>Visites : {s.visites.faites} faite{s.visites.faites > 1 ? 's' : ''}, {s.visites.prevues} prévue{s.visites.prevues > 1 ? 's' : ''}{s.visites.prochaine ? ` · prochaine le ${fr(s.visites.prochaine)}` : ''}</span>
                      </div>
                    </div>
                  </div>
                  {s.fiches.length > 0
                    ? s.fiches.map(f => (
                      <Fiche key={f.id} url={`/api/mes-cours/stages/${s.id}/fiche/${f.id}`} fiche={f} onFait={charger}>
                        {f.rempli_par === 'maitre_stage' && <LienMaitre stage={s} fiche={f} onFait={charger} />}
                      </Fiche>))
                    : <div className="text-second text-slate-500">Aucune fiche d’évaluation n’est encore réglée pour cette unité (Organisation → Stages → Fiches d’évaluation).</div>}
                </div>
              </LigneEtat>);
          })}
        </ListeEtats>)}
    </div>);
}
