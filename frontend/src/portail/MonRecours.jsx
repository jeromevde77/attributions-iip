/* (CS) MON RECOURS (3.5.658, Charles, 23 novembre 2026 : « la possibilité de faire un recours s'il reçoit des résultats en
 * deuxième session » ; « intégrer le module de recours dans l'espace étudiant »). Le RDE (art. 87-88) : un recours contre un
 * REFUS publié, jamais contre un ajournement ; la plainte écrite, avec les irrégularités invoquées, dans les quatre jours
 * calendrier qui suivent la publication. Le portail note la plainte ; Lucie la juge et ouvre le dossier (lib/recoursEnLigne.js).
 * L'étudiant suit ensuite la réception, la recevabilité et la décision — celle-ci une fois envoyée par recommandé.
 * LE PARCOURS GUIDÉ (Charles, même jour : « accessible seulement si l'étudiant est refusé pour l'UE ; un bouton apparaît à côté ;
 * guider l'étudiant pour que le dossier soit bien rempli ; rappeler le cadre légal ; pousser des documents en preuve, joindre des
 * documents ou des photos ; terminé, il est envoyé à la direction, la coordinatrice en copie ») : cinq étapes — la décision, le
 * cadre légal, les irrégularités, les preuves, relire et envoyer. */
import { useCallback, useEffect, useRef, useState } from 'react';
import ChargementLucie from '../components/ChargementLucie.jsx';
import { Encadre, EnteteCarte, PastilleEtat } from '../components/ui.jsx';
import { IconUpload, IconCheck, IconClock, IconAlertTriangle, IconScale, IconX, IconCamera, IconChevronLeft, IconChevronRight, IconSend } from '@tabler/icons-react';

const jourFr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '');
const enBase64 = f => new Promise((ok, ko) => { const r = new FileReader(); r.onload = () => ok(String(r.result).split(',')[1] || ''); r.onerror = ko; r.readAsDataURL(f); });
const cle = r => `${r.annee}|${r.ue_num}|${r.session}`;
const SESSION = n => (n === 2 ? 'seconde session' : 'première session');

/** La frise du recours, telle que l'étudiant peut la lire. */
function Suivi({ d }) {
  const etapes = [
    { t: 'Plainte reçue', fait: true, s: `le ${jourFr(d.introduit_le)}${d.en_ligne ? ', en ligne' : ''}` },
    { t: 'Recevabilité', fait: d.recevabilite !== 'en_examen', etat: d.recevabilite === 'irrecevable' ? 'corriger' : null,
      s: d.recevabilite === 'en_examen' ? 'en examen par la direction' : d.recevabilite === 'recevable' ? 'recevable' : `irrecevable${d.motif_irrecevabilite ? ` — ${d.motif_irrecevabilite}` : ''}` },
    d.recevabilite !== 'irrecevable' && { t: 'Conseil des études restreint', fait: !!d.cde_le, s: d.cde_le ? `réuni le ${jourFr(d.cde_le)}` : 'à venir' },
    { t: 'Décision motivée', fait: !!d.envoye_le,
      etat: d.decision === 'accueilli' ? 'reussi' : d.decision === 'rejete' ? 'corriger' : null,
      s: d.envoye_le ? `${d.decision === 'accueilli' ? 'Recours accueilli' : d.decision === 'rejete' ? 'Recours rejeté' : 'Décision'} — envoyée par recommandé le ${jourFr(d.envoye_le)}` : 'vous sera adressée par courrier recommandé' },
  ].filter(Boolean);
  return (
    <ol className="m-0 p-0 list-none space-y-1.5">
      {etapes.map((e, i) => (
        <li key={i} className="flex items-start gap-2 text-sm">
          {e.fait ? <IconCheck size={16} className="mt-0.5 shrink-0" style={{ color: `var(--c-${e.etat === 'corriger' ? 'refuse' : 'reussi'})` }} />
            : <IconClock size={16} className="mt-0.5 shrink-0 text-slate-400" />}
          <span><b>{e.t}</b> · <span className="text-slate-600">{e.s}</span></span>
        </li>))}
      {d.externe_jusquau && (
        <li className="text-second text-slate-500 pl-6">Si vous contestez cette décision, un recours externe auprès de la Commission est possible jusqu’au {jourFr(d.externe_jusquau)} (RDE art. 90) : la lettre de décision en donne la marche à suivre.</li>)}
    </ol>);
}

const MOMENTS = [
  ['epreuve', 'L’organisation de l’épreuve', 'conditions, durée, consignes, matière annoncée, local…'],
  ['correction', 'La correction', 'grille, critères annoncés, erreur de calcul ou d’encodage…'],
  ['deliberation', 'La délibération', 'composition du Conseil, prise en compte de tous vos résultats…'],
  ['motivation', 'La motivation de la décision', 'motif absent, incomplet ou qui ne correspond pas à vos épreuves…'],
  ['autre', 'Autre irrégularité', ''],
];
const ETAPES = ['La décision', 'Le cadre légal', 'Les irrégularités', 'Vos preuves', 'Relire et envoyer'];

function Etapes({ i }) {
  return (
    <ol className="m-0 p-0 list-none flex flex-wrap gap-x-4 gap-y-1">
      {ETAPES.map((t, k) => (
        <li key={t} className={`flex items-center gap-1.5 text-second ${k === i ? 'font-semibold text-slate-800' : 'text-slate-500'}`}>
          <span className="inline-flex items-center justify-center w-5 h-5 rounded-full text-[11px]"
            style={k < i ? { background: 'var(--c-reussi)', color: '#fff' } : k === i ? { background: 'var(--c-principal)', color: '#fff' } : { border: '1px solid rgb(var(--gris-300))' }}>
            {k < i ? <IconCheck size={12} /> : k + 1}</span>{t}
        </li>))}
    </ol>);
}

export default function MonRecours({ appel, onErreur, initial = null }) {
  const [p, setP] = useState(null);
  const [choix, setChoix] = useState(initial);
  const [etape, setEtape] = useState(initial ? 1 : 0);
  const [lu, setLu] = useState(false);
  const [moments, setMoments] = useState(new Set());
  const [griefs, setGriefs] = useState('');
  const [fichiers, setFichiers] = useState([]);
  const [envoi, setEnvoi] = useState(false);
  const [commence, setCommence] = useState(!!initial);
  const champ = useRef(null), photo = useRef(null);
  const charger = useCallback(() => appel('GET', '/recours').then(setP).catch(onErreur), [appel, onErreur]);
  useEffect(() => { charger(); }, [charger]);
  // Tant qu'un envoi attend le relevé de Lucie, on relit.
  useEffect(() => { if (!p?.gestes?.some(g => !g.releve_le)) return undefined; const t = setTimeout(charger, 4000); return () => clearTimeout(t); }, [p, charger]);

  if (!p) return <ChargementLucie />;
  if (!p.pret || !p.recours) return <div className="carte px-4 py-3 text-sm text-slate-600">Vos informations arrivent de l’école : revenez dans quelques minutes.</div>;
  const refus = p.recours.refus || [];
  const n = p.recours.delai_jours || 4;
  const enAttente = (p.gestes || []).some(g => !g.releve_le);
  const ouverts = refus.filter(r => r.ouvert);
  const sel = refus.find(r => r.ouvert && cle(r) === choix) || (ouverts.length === 1 ? ouverts[0] : null);
  const poids = fichiers.reduce((t, f) => t + f.size, 0);
  const texte = () => `${moments.size ? `Porte sur : ${MOMENTS.filter(([k]) => moments.has(k)).map(m => m[1].toLowerCase()).join(', ')}.\n\n` : ''}${griefs.trim()}`;
  const ajouter = liste => setFichiers(f => [...f, ...Array.from(liste || [])].slice(0, 5));
  const peutSuivre = [!!sel, lu, griefs.trim().length >= 30 && moments.size > 0, fichiers.length <= 5 && poids <= 25 * 1024 * 1024, true][etape];

  async function envoyer() {
    if (!sel) return;
    if (fichiers.some(f => f.size > 10 * 1024 * 1024)) { onErreur(new Error('Une pièce dépasse 10 Mo.')); return; }
    setEnvoi(true);
    try {
      const pieces = [];
      for (const f of fichiers) pieces.push({ nom: f.name || 'photo.jpg', fichier: await enBase64(f) });
      await appel('POST', '/recours', { ue_num: sel.ue_num, annee: sel.annee, session: sel.session, griefs: texte(), pieces });
      setGriefs(''); setFichiers([]); setChoix(null); setMoments(new Set()); setLu(false); setEtape(0); setCommence(false);
      charger();
    } catch (e) { onErreur(e); } finally { setEnvoi(false); }
  }
  const basculer = k => setMoments(s => { const x = new Set(s); x.has(k) ? x.delete(k) : x.add(k); return x; });

  return (
    <div className="space-y-4">
      {/* LES RECOURS DÉJÀ INTRODUITS */}
      {refus.filter(r => r.dossier).map(r => (
        <div key={cle(r)} className="carte">
          <EnteteCarte titre={`Mon recours — UE ${r.ue_num}${r.ue_nom ? ` · ${r.ue_nom}` : ''}`} icone={IconScale}>
            <PastilleEtat etat="neutre">{SESSION(r.session)} {r.annee}</PastilleEtat>
          </EnteteCarte>
          <div className="px-4 py-3"><Suivi d={r.dossier} /></div>
        </div>))}

      {(p.gestes || []).some(g => !g.releve_le) && (
        <Encadre etat="disponible" titre="Votre recours est en cours de transmission">Il arrive à la direction dans quelques secondes ; cette page se met à jour seule.</Encadre>)}

      {/* LE PARCOURS GUIDÉ — seulement pour un refus dont le délai court. */}
      {ouverts.length > 0 && !enAttente && (!commence ? (
        <div className="carte">
          <EnteteCarte titre="Contester un refus" icone={IconScale} />
          <div className="px-4 py-3 space-y-3 text-sm">
            {ouverts.map(r => (
              <div key={cle(r)} className="flex flex-wrap items-center justify-between gap-3">
                <span>UE {r.ue_num}{r.ue_nom ? ` — ${r.ue_nom}` : ''} · refus en {SESSION(r.session)} · <span className="text-slate-500">recours possible jusqu’au <b>{jourFr(r.limite)}</b></span></span>
                <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" onClick={() => { setChoix(cle(r)); setCommence(true); setEtape(1); }}><IconScale size={15} /> Faire un recours</button>
              </div>))}
          </div>
        </div>
      ) : (
        <div className="carte">
          <EnteteCarte titre={sel ? `Mon recours — UE ${sel.ue_num}${sel.ue_nom ? ` · ${sel.ue_nom}` : ''}` : 'Mon recours'} icone={IconScale}
            sous={sel ? `À envoyer au plus tard le ${jourFr(sel.limite)}` : null} />
          <div className="px-4 py-3 space-y-4">
            <Etapes i={etape} />

            {etape === 0 && (
              <div className="space-y-1.5 text-sm">
                <p className="m-0 text-slate-600">Quelle décision contestez-vous ? Seul un <b>refus</b> se conteste ; un ajournement ouvre la seconde session.</p>
                {ouverts.map(r => (
                  <label key={cle(r)} className="flex items-start gap-2">
                    <input type="radio" name="refus" className="mt-1" checked={sel ? cle(sel) === cle(r) : false} onChange={() => setChoix(cle(r))} />
                    <span>UE {r.ue_num}{r.ue_nom ? ` — ${r.ue_nom}` : ''} · refus en {SESSION(r.session)} ({r.annee})
                      <span className="text-slate-500"> · publié le {jourFr(r.publie_le)}, recours jusqu’au <b>{jourFr(r.limite)}</b></span></span>
                  </label>))}
              </div>)}

            {etape === 1 && (
              <div className="space-y-3 text-sm">
                <p className="m-0">Le recours est réglé par le <b>Règlement des études</b> de l’Institut (articles 87 à 91). L’essentiel :</p>
                <ul className="m-0 pl-5 space-y-1.5">
                  <li><b>Ce qui se conteste</b> : une décision de <b>refus</b> du Conseil des études (art. 87). Un recours ne refait pas l’examen : il porte sur une <b>irrégularité</b> dans l’évaluation ou la délibération.</li>
                  <li><b>Le délai</b> : votre plainte doit être remise dans les <b>{n} jours calendrier</b> qui suivent la publication des résultats (art. 88 §1){sel ? <> — ici, au plus tard le <b>{jourFr(sel.limite)}</b></> : null}. La date de votre envoi en ligne fait foi.</li>
                  <li><b>Le contenu</b> : la plainte est écrite et indique <b>précisément</b> les irrégularités que vous invoquez (art. 88 §2). Une plainte hors délai, ou sans irrégularité précise, est <b>irrecevable</b> ; le motif vous est alors communiqué (art. 88 §3-4).</li>
                  <li><b>L’examen</b> : si elle est recevable, un Conseil des études restreint l’examine et prend une <b>décision motivée</b>, qui vous est adressée par <b>courrier recommandé</b> (art. 89).</li>
                  <li><b>Après</b> : si vous contestez cette décision, un recours externe auprès de la Commission reste possible, dans les délais que la lettre vous indiquera (art. 90-91).</li>
                </ul>
                <label className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={lu} onChange={e => setLu(e.target.checked)} />
                  <span>J’ai pris connaissance de ce cadre.</span></label>
              </div>)}

            {etape === 2 && (
              <div className="space-y-3 text-sm">
                <div>
                  <div className="font-semibold mb-1">Sur quoi porte l’irrégularité ? <span className="font-normal text-slate-500">(une ou plusieurs)</span></div>
                  {MOMENTS.map(([k, t, aide]) => (
                    <label key={k} className="flex items-start gap-2"><input type="checkbox" className="mt-1" checked={moments.has(k)} onChange={() => basculer(k)} />
                      <span>{t}{aide ? <span className="text-slate-500"> — {aide}</span> : null}</span></label>))}
                </div>
                <label className="block">
                  <div className="font-semibold mb-1">Décrivez ce qui s’est passé</div>
                  <div className="text-second text-slate-500 mb-1">Soyez précis : quel cours ou quelle épreuve, quand, ce qui n’a pas été fait selon les règles, et pourquoi cela a pesé sur la décision. Une plainte précise a plus de chances d’être déclarée recevable.</div>
                  <textarea className="controle w-full !h-auto py-2" rows={8} value={griefs} onChange={e => setGriefs(e.target.value)} data-reponses="non" />
                  <div className="text-second text-slate-500 mt-1">{griefs.trim().length < 30 ? 'Quelques phrases au moins.' : `${griefs.trim().length} caractères.`}</div>
                </label>
              </div>)}

            {etape === 3 && (
              <div className="space-y-2 text-sm">
                <p className="m-0">Joignez ce qui appuie votre plainte : copie d’examen, consignes reçues, courriels, captures, photos d’un document… <span className="text-slate-500">(facultatif — cinq pièces au plus, 10 Mo chacune)</span></p>
                <input ref={champ} type="file" multiple className="hidden" accept="application/pdf,image/jpeg,image/png" onChange={e => { ajouter(e.target.files); e.target.value = ''; }} />
                <input ref={photo} type="file" className="hidden" accept="image/*" capture="environment" onChange={e => { ajouter(e.target.files); e.target.value = ''; }} />
                <div className="flex flex-wrap items-center gap-2">
                  <button type="button" className="bouton inline-flex items-center gap-1.5" disabled={fichiers.length >= 5} onClick={() => champ.current?.click()}><IconUpload size={15} /> Joindre un document</button>
                  <button type="button" className="bouton inline-flex items-center gap-1.5" disabled={fichiers.length >= 5} onClick={() => photo.current?.click()}><IconCamera size={15} /> Prendre une photo</button>
                </div>
                {fichiers.length > 0 && (
                  <ul className="m-0 pl-0 list-none space-y-1">{fichiers.map((f, i) => (
                    <li key={i} className="flex items-center gap-2 text-slate-700">{f.name || 'photo'} <span className="text-second text-slate-500">{Math.max(1, Math.round(f.size / 1024))} Ko</span>
                      <button type="button" className="text-slate-400 hover:text-slate-700" title="Retirer" onClick={() => setFichiers(l => l.filter((_, j) => j !== i))}><IconX size={13} /></button></li>))}</ul>)}
                {fichiers.some(f => f.size > 10 * 1024 * 1024) && <p className="m-0" style={{ color: 'var(--c-refuse)' }}>Une pièce dépasse 10 Mo : retirez-la.</p>}
                {poids > 25 * 1024 * 1024 && <p className="m-0" style={{ color: 'var(--c-refuse)' }}>Vos pièces dépassent 25 Mo en tout.</p>}
              </div>)}

            {etape === 4 && sel && (
              <div className="space-y-2 text-sm">
                <div><span className="text-slate-500">Décision contestée :</span> UE {sel.ue_num}{sel.ue_nom ? ` — ${sel.ue_nom}` : ''}, refus en {SESSION(sel.session)} ({sel.annee}), publié le {jourFr(sel.publie_le)}.</div>
                <div><span className="text-slate-500">Votre plainte :</span><div className="whitespace-pre-line border-l-2 pl-3 mt-1" style={{ borderColor: 'rgb(var(--gris-300))' }}>{texte()}</div></div>
                <div><span className="text-slate-500">Pièces :</span> {fichiers.length ? fichiers.map(f => f.name || 'photo').join(', ') : 'aucune'}</div>
                <Encadre etat="disponible">En envoyant, vous datez et signez votre plainte. Elle est adressée à la <b>direction</b>, la coordination de votre section en copie. Vous suivrez ici sa recevabilité, puis la décision.</Encadre>
              </div>)}

            <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
              <button type="button" className="bouton inline-flex items-center gap-1" onClick={() => (etape === 0 || (etape === 1 && ouverts.length === 1) ? setCommence(false) : setEtape(etape - 1))}>
                <IconChevronLeft size={15} /> {etape === 0 || (etape === 1 && ouverts.length === 1) ? 'Annuler' : 'Précédent'}</button>
              {etape < 4
                ? <button type="button" className="bouton bouton-fort inline-flex items-center gap-1" disabled={!peutSuivre} onClick={() => setEtape(etape + 1)}>Étape suivante <IconChevronRight size={15} /></button>
                : <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={!sel || envoi || enAttente || fichiers.some(f => f.size > 10 * 1024 * 1024)} onClick={envoyer}><IconSend size={15} /> {envoi ? 'Envoi…' : 'Envoyer mon recours'}</button>}
            </div>
          </div>
        </div>))}

      {!ouverts.length && !refus.some(r => r.dossier) && (
        <div className="carte px-4 py-3 text-sm text-slate-600">
          {refus.length ? <>Le délai de recours est passé pour vos refus récents ({refus.map(r => `UE ${r.ue_num}, jusqu’au ${jourFr(r.limite)}`).join(' ; ')}). Pour toute question, adressez-vous à la direction.</>
            : <>Aucune décision de refus publiée ne vous concerne : il n’y a rien à contester.</>}
        </div>)}

      {(p.gestes || []).filter(g => g.releve_le).length > 0 && (
        <div className="carte">
          <EnteteCarte titre="Mes envois" />
          <div className="px-4 py-3 space-y-1.5">
            {p.gestes.filter(g => g.releve_le).map(g => (
              <div key={g.id} className="flex items-start gap-2 text-sm">
                {g.erreur ? <IconAlertTriangle size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--c-refuse)' }} /> : <IconCheck size={16} className="mt-0.5 shrink-0" style={{ color: 'var(--c-reussi)' }} />}
                <span>Recours{g.ue_num ? ` UE ${g.ue_num}` : ''} du {jourFr(g.cree_le)} — {g.erreur || g.resultat || 'transmis.'}</span>
              </div>))}
          </div>
        </div>)}
    </div>);
}
