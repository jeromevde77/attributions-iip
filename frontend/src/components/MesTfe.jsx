import { useEffect, useState } from 'react';
import { IconSchool, IconFileDownload, IconCheck, IconClock } from '@tabler/icons-react';
import { ListeEtats, LigneEtat, PastilleEtat, Encadre, EnteteCarte } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { informer } from '../lib/dialogue.jsx';

/* MES TFE (3.5.210, Charles, 7 novembre 2026 : « avons-nous tout pensé ? » ; tranché : ses TFE et leur suivi, et les fiches de son
   rôle). Une ligne par TFE (liseré : ocre s'il reste une fiche à remplir, vert si tout est rempli) ; déplié : la question de
   recherche, le jury, la défense, les remises du calendrier de la section, les fichiers déposés par l'étudiant, puis les fiches.
   Une fiche de son rôle se remplit critère par critère (points sur le maximum, ou PP · NP · CM) ; elle s'écrit dans le carnet du
   cours (`/api/mes-cours/tfe/:tfe/fiche/:fiche`). Lu dans Lucie comme dans l'espace enseignant (par le relais). */
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const valeurDe = n => (n ? (n.mention || (n.points == null ? '' : String(n.points).replace('.', ','))) : '');

export function Fiche({ url, fiche, onFait, children }) {
  const [vals, setVals] = useState(() => Object.fromEntries(fiche.criteres.map(c => [c.aa_code, valeurDe(c.note)])));
  const [erreur, setErreur] = useState(null);
  const [envoi, setEnvoi] = useState(false);
  const change = fiche.criteres.some(c => (vals[c.aa_code] || '') !== valeurDe(c.note));
  const enregistrer = async () => {
    setEnvoi(true); setErreur(null);
    try {
      const r = await fetch(url, { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ notes: fiche.criteres.map(c => ({ aa_code: c.aa_code, valeur: vals[c.aa_code] || '' })) }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Enregistrement refusé.');
      onFait();
    } catch (e) { setErreur(e.message); } finally { setEnvoi(false); }
  };
  const remplie = fiche.criteres.length > 0 && fiche.criteres.every(c => c.note);
  return (
    <div className="carte overflow-hidden">
      <EnteteCarte titre={fiche.intitule}>
        <span className="flex items-center gap-2">
          {fiche.moment && <span className="text-second text-slate-500">{fiche.moment}</span>}
          <PastilleEtat etat={remplie ? 'reussi' : fiche.a_moi ? 'surveiller' : 'neutre'}>{remplie ? 'remplie' : fiche.a_moi ? 'à remplir' : 'pas la mienne'}</PastilleEtat>
        </span>
      </EnteteCarte>
      <div className="px-4 py-3 space-y-3">
        <div className="text-second text-slate-500">Remplie par : {fiche.rempli_par_libelle} · sur {String(fiche.sur).replace('.', ',')} · cours {fiche.cours_code}
          {fiche.ensemble?.points != null && <> · note de la fiche : <b className="text-iip-texte">{String(fiche.ensemble.points).replace('.', ',')}</b></>}</div>
        {fiche.criteres.map(c => (
          <div key={c.aa_code} className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-2 items-start">
            <div className="min-w-0">
              <div className="text-sm"><b>{c.aa_code}</b> {c.description}</div>
              {c.consigne && <div className="text-second text-slate-500 whitespace-pre-line">{c.consigne}</div>}
            </div>
            {fiche.a_moi
              ? <input className="controle w-28 text-right tabular-nums" value={vals[c.aa_code] || ''} placeholder={`/ ${fiche.sur}`}
                  onChange={e => setVals(v => ({ ...v, [c.aa_code]: e.target.value }))} aria-label={`Note ${c.aa_code}`} />
              : <span className="text-sm tabular-nums text-right w-28">{valeurDe(c.note) || '—'}</span>}
          </div>))}
        {children}
        {!fiche.criteres.length && <div className="text-second text-slate-500">Cette fiche n’a pas encore de critères : la coordination la règle.</div>}
        {fiche.a_moi && fiche.criteres.length > 0 && (
          <div className="flex items-center gap-3 justify-end">
            {erreur && <span className="text-second min-w-0" style={{ color: 'var(--c-refuse)' }}>{erreur}</span>}
            <span className="text-mention text-slate-400">Points sur {String(fiche.sur).replace('.', ',')}, ou PP · NP · CM ; vide = effacer.</span>
            <button type="button" className="bouton bouton-fort" disabled={!change || envoi} onClick={enregistrer}>{envoi ? 'Enregistrement…' : 'Enregistrer la fiche'}</button>
          </div>)}
      </div>
    </div>);
}

export default function MesTfe() {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [ouvert, setOuvert] = useState(null);
  const charger = () => fetch('/api/mes-cours/tfe', { headers: authHeaders() })
    .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Lecture impossible.'); setD(j); })
    .catch(e => setErreur(e.message));
  useEffect(() => { charger(); }, []);
  const ouvrirDepot = async dep => {
    try {
      const r = await fetch(`/api/mes-cours/tfe/depot/${dep.id}`, { headers: authHeaders() });
      if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error || 'Fichier introuvable.');
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.target = '_blank'; a.rel = 'noopener'; a.download = dep.nom; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (e) { informer(e.message); }
  };

  if (erreur) return <Encadre etat="corriger" titre="Mes TFE">{erreur}</Encadre>;
  if (!d) return <div className="text-second text-slate-500 py-8">Chargement…</div>;
  return (
    <div className="space-y-4">
      <div>
        <h1 className="titre-ecran">Mes TFE</h1>
        <p className="text-second text-slate-500">Les travaux de fin d’études où vous êtes membre du jury, {d.annee}. Les fiches de votre rôle se remplissent ici ; la note va dans le carnet du cours.</p>
      </div>
      {!d.relie && <Encadre etat="surveiller" titre="Compte non relié">Votre compte n’est relié à aucune fiche du personnel : le secrétariat fait le lien (Personnel → fiche → Accès Lucie).</Encadre>}
      {d.relie && !d.tfes.length && <Encadre etat="neutre" titre="Aucun TFE">Vous n’êtes membre d’aucun jury de TFE cette année. La coordination compose les jurys (Organisation → Travaux de fin d’études).</Encadre>}
      {d.tfes.length > 0 && (
        <ListeEtats>
          {d.tfes.map(t => {
            const miennes = t.fiches.filter(f => f.a_moi);
            const reste = miennes.filter(f => !(f.criteres.length && f.criteres.every(c => c.note))).length;
            const etat = !miennes.length ? 'neutre' : reste ? 'surveiller' : 'reussi';
            return (
              <LigneEtat key={t.id} etat={etat} icone={IconSchool} ouverte={ouvert === t.id} onClick={() => setOuvert(o => (o === t.id ? null : t.id))}
                titre={`${String(t.etudiant.nom || '').toUpperCase()} ${t.etudiant.prenom || ''}`}
                sous={t.titre || t.question || 'Titre à venir'}
                meta={t.roles_libelles.map(x => <PastilleEtat key={x} etat="disponible">{x}</PastilleEtat>)}
                droite={<span className="text-second text-slate-500 whitespace-nowrap">{miennes.length ? (reste ? `${reste} fiche${reste > 1 ? 's' : ''} à remplir` : 'fiches remplies') : ''}{t.defense.date ? ` · défense le ${fr(t.defense.date)}` : ''}</span>}>
                <div className="space-y-4 py-2">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                    <div className="space-y-1">
                      <div><span className="text-slate-500">Unité :</span> {t.ue_num ? `${t.ue_num} — ${t.ue_nom || ''}` : '—'}{t.section ? ` · ${t.section}` : ''}</div>
                      <div><span className="text-slate-500">Question de recherche :</span> {t.question || <i className="text-slate-400">pas encore arrêtée</i>}</div>
                      {t.question_proposee && <div className="text-second text-slate-500">Proposée par l’étudiant le {fr(t.question_proposee.proposee_le)} : « {t.question_proposee.texte} » — la coordination l’accepte ou la renvoie.</div>}
                      <div><span className="text-slate-500">Jury :</span> {t.jury.map(j => `${j.nom} (${j.role.toLowerCase()})`).join(' · ') || '—'}</div>
                      <div><span className="text-slate-500">Défense :</span> {t.defense.date ? `${fr(t.defense.date)}${t.defense.heure ? ` à ${t.defense.heure}` : ''}${t.defense.local ? `, ${t.defense.local}` : ''}` : 'à fixer'}</div>
                      {t.etudiant.email && <div><span className="text-slate-500">Adresse :</span> <span className="select-all">{t.etudiant.email}</span></div>}
                    </div>
                    <div className="space-y-1">
                      <div className="text-slate-500">Remises</div>
                      {!t.jalons.length && <div className="text-second text-slate-400">Aucun calendrier de remises pour la section.</div>}
                      {t.jalons.map(j => (
                        <div key={j.id} className="flex items-center gap-2">
                          {j.recu_le ? <IconCheck size={16} style={{ color: 'var(--c-reussi)' }} /> : <IconClock size={16} className="text-slate-400" />}
                          <span className="min-w-0 flex-1">{j.libelle}{j.date_limite ? <span className="text-slate-500"> — pour le {fr(j.date_limite)}</span> : ''}</span>
                          <span className="text-second text-slate-500">{j.recu_le ? `reçu le ${fr(j.recu_le)}` : ''}</span>
                        </div>))}
                      {t.depots.length > 0 && <div className="pt-2 text-slate-500">Fichiers déposés par l’étudiant</div>}
                      {t.depots.map(dep => (
                        <button key={dep.id} type="button" className="flex items-center gap-2 text-left hover:underline" onClick={() => ouvrirDepot(dep)}>
                          <IconFileDownload size={16} className="text-slate-500" /><span>{dep.nom}</span>
                          <span className="text-second text-slate-500">{dep.libelle ? `${dep.libelle} · ` : ''}{fr(dep.depose_le)}</span>
                        </button>))}
                    </div>
                  </div>
                  {t.fiches.length > 0
                    ? t.fiches.map(f => <Fiche key={f.id} url={`/api/mes-cours/tfe/${t.id}/fiche/${f.id}`} fiche={f} onFait={charger} />)
                    : <div className="text-second text-slate-500">Aucune fiche d’évaluation n’est encore réglée pour cette unité (Organisation → TFE → Fiches d’évaluation).</div>}
                </div>
              </LigneEtat>);
          })}
        </ListeEtats>)}
    </div>);
}
