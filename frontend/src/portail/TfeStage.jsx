/* MON TFE, MON STAGE (3.5.081, Charles, 2 novembre 2026 : « un onglet stage et un onglet TFE, avec des infos ; pour le TFE il
 * pourrait y entrer sa question de recherche »). Derrière le mur, comme le reste de l'espace : on lit ce que Lucie a déposé,
 * et les gestes (question de recherche, remise) attendent son relevé, qui les juge. Serveur : portail/src/serveur.js
 * (/api/portail/tfe, /api/portail/stage) ; Lucie : backend/src/lib/portailTfeStage.js. */
import { useCallback, useEffect, useRef, useState } from 'react';
import ChargementLucie from '../components/ChargementLucie.jsx';
import { IconUpload, IconCheck, IconClock, IconMapPin, IconCalendarEvent, IconAlertTriangle, IconClipboardList } from '@tabler/icons-react';

const jourFr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');

/** Les fiches d'évaluation : ce qu'on regardera, acquis par acquis — jamais une note. */
function Fiches({ fiches }) {
  if (!fiches?.length) return null;
  return (
    <section className="carte p-4 space-y-3">
      <h2 className="titre-carte flex items-center gap-2"><IconClipboardList size={17} className="text-slate-400" /> Comment vous serez évalué</h2>
      {fiches.map(f => (
        <details key={f.intitule} className="border-t border-slate-100 pt-2 first:border-t-0 first:pt-0">
          <summary className="cursor-pointer text-sm font-semibold">{f.intitule}
            <span className="font-normal text-slate-500"> — {f.rempli_par}{f.moment ? `, ${f.moment.charAt(0).toLowerCase()}${f.moment.slice(1)}` : ''}</span></summary>
          <ul className="mt-2 pl-0 list-none space-y-2 text-sm">
            {f.criteres.map(c => (
              <li key={c.aa_code}><div><b>{c.aa_code}</b> {c.description}</div>
                {c.consigne && <div className="text-slate-600 text-xs mt-0.5">Ce qui sera regardé : {c.consigne}</div>}</li>))}
          </ul>
        </details>))}
    </section>
  );
}

export function MonTfe({ appel, jeton, onErreur }) {
  const [p, setP] = useState(null);
  const charger = useCallback(() => appel('GET', '/tfe').then(setP).catch(onErreur), [appel, onErreur]);
  useEffect(() => { charger(); }, [charger]);
  // Un geste attend le relevé de Lucie (quelques secondes) : on relit jusqu'à ce qu'il soit passé.
  useEffect(() => { if (!p || (p.pret && !p.en_attente?.length)) return undefined; const t = setTimeout(charger, 4000); return () => clearTimeout(t); }, [p, charger]);
  useEffect(() => { if (p?.refus?.length) appel('POST', '/tfe/refus-lus').catch(() => {}); }, [p, appel]);
  if (!p) return <ChargementLucie />;
  if (!p.pret) return <p className="text-sm text-slate-500">Préparation de votre TFE… quelques secondes.</p>;
  if (!p.tfe?.length) return <p className="text-sm text-slate-500">Aucun TFE n’est encore encodé pour vous cette année. Votre coordination l’encode avec votre titre et votre promoteur.</p>;
  return (
    <div className="space-y-4">
      {p.refus?.map(r => <div key={r.id} className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">{r.type === 'remise' ? `Remise « ${r.nom || 'fichier'} » : ` : 'Question de recherche : '}{r.erreur}</div>)}
      {p.tfe.map(t => <UnTfe key={t.id} t={t} enAttente={(p.en_attente || []).filter(g => Number(g.tfe_id) === t.id)} appel={appel} jeton={jeton} onFait={charger} onErreur={onErreur} />)}
    </div>
  );
}

function UnTfe({ t, enAttente, appel, jeton, onFait, onErreur }) {
  const qEnCours = enAttente.find(g => g.type === 'question');
  const qp = t.question_proposee;
  const [texte, setTexte] = useState('');
  const [ouvert, setOuvert] = useState(false);
  const proposer = async () => {
    try { await appel('POST', '/tfe/question', { tfe_id: t.id, texte }); setTexte(''); setOuvert(false); onFait(); } catch (e) { onErreur(e); }
  };
  return (
    <div className="space-y-4">
      <section className="carte p-4 space-y-2">
        <div className="text-xs text-slate-500">UE {t.ue_num}{t.ue_nom ? ` — ${t.ue_nom}` : ''}</div>
        <h2 className="titre-carte">{t.titre}</h2>
        {t.jury?.length > 0 && <div className="text-sm space-y-0.5">{t.jury.map((m, i) => <div key={i}><span className="text-slate-500">{m.role} :</span> {m.nom}</div>)}</div>}
        {t.defense && <div className="bloc-etat px-3 py-2 text-sm" data-etat="disponible"><IconCalendarEvent size={15} className="inline -mt-0.5 mr-1 text-slate-400" />
          Défense le <b>{jourFr(t.defense.date)}</b>{t.defense.heure ? ` à ${t.defense.heure}` : ''}{t.defense.local ? `, local ${t.defense.local}` : ''}.</div>}
      </section>

      <section className="carte p-4 space-y-2">
        <h2 className="titre-carte">Ma question de recherche</h2>
        {t.question ? <p className="text-sm m-0 whitespace-pre-wrap">{t.question}</p>
          : <p className="text-sm text-slate-500 m-0">Pas encore de question retenue.</p>}
        {qEnCours ? <div className="text-xs text-slate-500 flex items-center gap-1"><IconClock size={13} /> Votre proposition part vers l’école…</div>
          : qp?.etat === 'proposee' ? <div className="bloc-etat px-3 py-2 text-sm" data-etat="surveiller">Proposée le {jourFr(qp.proposee_le)} : votre promoteur ou votre coordination va la lire.
            <div className="text-slate-600 mt-1 whitespace-pre-wrap">« {qp.texte} »</div></div>
          : qp?.etat === 'renvoyee' ? <div className="bloc-etat px-3 py-2 text-sm" data-etat="corriger">Votre proposition vous revient{qp.mot ? <> : <i>{qp.mot}</i></> : '.'} Proposez-en une autre.</div>
          : null}
        {!qEnCours && qp?.etat !== 'proposee' && (ouvert ? (
          <div className="space-y-2">
            <textarea className="controle w-full h-auto py-2" rows={4} maxLength={2000} value={texte} onChange={e => setTexte(e.target.value)}
              placeholder="Votre question de recherche, en une ou deux phrases." />
            <div className="flex gap-2 justify-end">
              <button type="button" className="bouton" onClick={() => setOuvert(false)}>Annuler</button>
              <button type="button" className="bouton bouton-fort" disabled={texte.trim().length < 10} onClick={proposer}>Proposer</button>
            </div>
            <p className="text-xs text-slate-500 m-0">Une proposition : votre promoteur ou votre coordination l’accepte, ou vous la renvoie avec un mot.</p>
          </div>)
          : <button type="button" className="bouton" onClick={() => setOuvert(true)}>{t.question ? 'Proposer une nouvelle question' : 'Proposer ma question de recherche'}</button>)}
      </section>

      {t.remises?.length > 0 && (
        <section className="carte divide-y divide-slate-100">
          <h2 className="titre-carte px-4 py-2.5">Mes remises</h2>
          {t.remises.map(r => <Remise key={r.jalon_id} t={t} r={r} enCours={enAttente.some(g => g.type === 'remise' && Number(g.jalon_id) === r.jalon_id)}
            jeton={jeton} onFait={onFait} onErreur={onErreur} />)}
        </section>)}
      <Fiches fiches={t.fiches} />
    </div>
  );
}

function Remise({ t, r, enCours, jeton, onFait, onErreur }) {
  const champ = useRef(null);
  const [envoi, setEnvoi] = useState(false);
  const auj = new Date().toISOString().slice(0, 10);
  const etat = r.recu_le ? 'reussi' : r.date_limite && r.date_limite < auj ? 'corriger' : 'neutre';
  const deposer = async f => {
    if (!f) return;
    if (f.size > 25 * 1024 * 1024) { onErreur(new Error('Fichier trop lourd (25 Mo au plus).')); return; }
    setEnvoi(true);
    try {
      const tk = jeton();
      const res = await fetch(`/api/portail/tfe/remise?tfe_id=${t.id}&jalon_id=${r.jalon_id}&nom=${encodeURIComponent(f.name)}`, {
        method: 'POST', headers: { 'Content-Type': 'application/octet-stream', ...(tk ? { Authorization: `Bearer ${tk}` } : {}) }, body: f, credentials: 'same-origin' });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || (res.status === 413 ? 'Fichier trop lourd (25 Mo au plus).' : `Erreur ${res.status}`));
      onFait();
    } catch (e) { onErreur(e); } finally { setEnvoi(false); if (champ.current) champ.current.value = ''; }
  };
  return (
    <div className="px-4 py-3 flex flex-wrap items-center gap-3">
      <span className={`flex-none ${etat === 'reussi' ? 'text-[color:var(--c-reussi)]' : etat === 'corriger' ? 'text-[color:var(--c-refuse)]' : 'text-slate-400'}`}>
        {r.recu_le ? <IconCheck size={18} /> : etat === 'corriger' ? <IconAlertTriangle size={18} /> : <IconClock size={18} />}</span>
      <div className="flex-1 min-w-[11rem] text-sm">
        <div className="font-semibold">{r.libelle}</div>
        <div className="text-xs text-slate-500">{r.date_limite ? `pour le ${jourFr(r.date_limite)}` : 'sans date'}{r.recu_le ? ` · reçue le ${jourFr(r.recu_le)}` : ''}
          {r.depots?.length ? ` · ${r.depots.length} fichier${r.depots.length > 1 ? 's' : ''} déposé${r.depots.length > 1 ? 's' : ''}, le dernier le ${jourFr(r.depots[0].depose_le)}` : ''}</div>
      </div>
      {enCours ? <span className="text-xs text-slate-500 flex items-center gap-1"><IconClock size={13} /> en route vers l’école…</span> : <>
        <input ref={champ} type="file" className="hidden" accept=".pdf,.doc,.docx,image/*" onChange={e => deposer(e.target.files?.[0])} />
        <button type="button" className="bouton inline-flex items-center gap-1.5" disabled={envoi} onClick={() => champ.current?.click()}>
          <IconUpload size={15} /> {envoi ? 'Envoi…' : r.depots?.length ? 'Déposer une nouvelle version' : 'Déposer'}</button></>}
    </div>
  );
}

export function MonStage({ appel, onErreur }) {
  const [p, setP] = useState(null);
  const charger = useCallback(() => appel('GET', '/stage').then(setP).catch(onErreur), [appel, onErreur]);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => { if (!p || p.pret) return undefined; const t = setTimeout(charger, 4000); return () => clearTimeout(t); }, [p, charger]);
  if (!p) return <ChargementLucie />;
  if (!p.pret) return <p className="text-sm text-slate-500">Préparation de votre stage… quelques secondes.</p>;
  if (!p.stage?.length) return <p className="text-sm text-slate-500">Aucun stage n’est encore encodé pour vous cette année.</p>;
  const auj = new Date().toISOString().slice(0, 10);
  return (
    <div className="space-y-4">
      {p.stage.map(s => (
        <div key={s.id} className="space-y-4">
          <section className="carte p-4 space-y-2">
            <div className="text-xs text-slate-500">{s.ue_num ? `UE ${s.ue_num}${s.ue_nom ? ` — ${s.ue_nom}` : ''}` : 'Stage'}</div>
            <h2 className="titre-carte">{s.lieu ? s.lieu.nom : 'Lieu de stage à fixer'}</h2>
            {s.lieu && <div className="text-sm text-slate-600 flex gap-1.5"><IconMapPin size={15} className="text-slate-400 mt-0.5 flex-none" />
              <span>{[s.lieu.service, s.lieu.adresse].filter(Boolean).join(' · ')}</span></div>}
            <div className="text-sm">{s.date_debut ? <>Du <b>{jourFr(s.date_debut)}</b>{s.date_fin ? <> au <b>{jourFr(s.date_fin)}</b></> : ''}</> : 'Dates à fixer'}
              {s.heures_prevues ? ` · ${s.heures_prevues} heures` : ''}</div>
            <div className="text-sm space-y-0.5">
              <div><span className="text-slate-500">Superviseur (IIP) :</span> {s.superviseur || 'à désigner'}</div>
              <div><span className="text-slate-500">Maître de stage :</span> {s.maitre ? `${s.maitre.nom}${s.maitre.fonction ? `, ${s.maitre.fonction}` : ''}` : 'à préciser'}</div>
            </div>
          </section>
          {s.manquent?.length > 0 && (
            <div className="bloc-etat px-4 py-3 text-sm" data-etat={s.urgence === 'rouge' ? 'corriger' : 'surveiller'}>
              <div className="font-semibold mb-1">Avant de commencer, il manque encore :</div>
              <ul className="m-0 pl-5">{s.manquent.map(m => <li key={m}>{m}</li>)}</ul>
              <div className="text-xs text-slate-600 mt-1">Sans ces pièces (art. 51 et 55 du règlement), le stage ne peut pas commencer. Remettez-les au secrétariat.</div>
            </div>)}
          {s.visites?.length > 0 && (
            <section className="carte p-4 space-y-1">
              <h2 className="titre-carte">Les visites de votre superviseur</h2>
              {s.visites.map((v, i) => <div key={i} className="text-sm flex gap-2"><span className="w-24 tabular-nums">{jourFr(v.date)}</span>
                <span className="flex-1">{v.heure ? `à ${v.heure}` : ''}</span><span className="text-slate-500">{v.faite ? 'faite' : v.date < auj ? 'passée' : 'prévue'}</span></div>)}
            </section>)}
          <Fiches fiches={s.fiches} />
        </div>))}
    </div>
  );
}
