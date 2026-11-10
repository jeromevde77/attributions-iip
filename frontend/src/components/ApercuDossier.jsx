/* L'ÉTAPE 0 : LIRE LE DOSSIER PÉDAGOGIQUE AVANT DE CROISER (3.5.099, Charles : « je voudrais qu'il soit en étape 0, puis
 * cliquable au besoin »). Le texte du dossier de l'unité, en lecture : finalités, capacités préalables, acquis et degré de
 * maîtrise, programme par activité. Les mêmes rubriques que la fiche de l'UE (Configuration → Unités et cours), découpées par
 * `rubriquesDuDossier` — une lecture, pas une seconde copie. La fiche complète s'ouvre par le bouton « Dossier pédagogique ».
 *
 * CORRIGER UN DOSSIER MAL IMPORTÉ (3.5.262, Charles, 9 novembre 2026 : « depuis Programme → Unité on peut modifier ; cela
 * n'ira PAS dans le référentiel SAUF si la direction accepte »). La coordination de la section passe en correction, retouche
 * les rubriques et PROPOSE, avec une phrase qui dit ce qu'elle corrige : la proposition part au registre des demandes
 * (Demandes de modification), où la direction l'accepte — le texte entre au référentiel — ou la refuse. Rien ne change
 * avant. La direction, elle, enregistre directement. Serveur : /api/due/:ue/dossier/proposition|proposer. */
import { useCallback, useEffect, useState } from 'react';
import { IconPencil, IconSend, IconDeviceFloppy, IconX } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { rubriquesDuDossier, decouperProgramme, recomposerProgramme } from '../lib/texteDossier.js';
import EditeurRubrique from './EditeurRubrique.jsx';
import { Encadre } from './ui.jsx';

const fr = v => String(v || '').slice(0, 10).split('-').reverse().join('/');

export default function ApercuDossier({ ueNum, onSuivante }) {
  const [d, setD] = useState(null);
  const [droit, setDroit] = useState({ peut: null, en_attente: [] });
  const [edition, setEdition] = useState(false);
  const [rub, setRub] = useState({});
  const [touchees, setTouchees] = useState({});
  const [motif, setMotif] = useState('');
  const [nomsCours, setNomsCours] = useState({});   // { code: nouveau nom } (3.5.297)
  const [envoi, setEnvoi] = useState(false);
  const [msg, setMsg] = useState(null);
  const charger = useCallback(() => {
    setD(null);
    const annee = encodeURIComponent(getAnnee());
    fetch(`/api/ref/ue/${ueNum}?annee=${annee}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : {})).then(setD).catch(() => setD({}));
    fetch(`/api/due/${ueNum}/dossier/proposition?annee=${annee}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { peut: null, en_attente: [] })).then(setDroit).catch(() => {});
  }, [ueNum]);
  useEffect(() => { charger(); setEdition(false); setMsg(null); }, [charger]);
  if (!d) return <p className="text-sm text-slate-400">Chargement du dossier…</p>;
  if (!d.ue_dp) return <p className="text-sm text-slate-500">Aucun dossier pédagogique importé pour cette unité cette année.</p>;
  const cours = (d.cours || []).filter(c => String(c.ct_pp || '').toUpperCase() !== 'Z');
  const noms = cours.map(c => c.cours_nom).filter(Boolean);
  const R0 = rubriquesDuDossier(d.ue_dp || '', noms);
  const R = edition ? rub : R0;
  const P = decouperProgramme(R['Programme'] || '', noms);
  const poser = (k, v) => { setRub(r => ({ ...r, [k]: v })); setTouchees(t => ({ ...t, [k]: v })); };
  const poserProgramme = (quoi, v) => {
    const p = decouperProgramme(rub['Programme'] || '', noms);
    const t = quoi === null ? recomposerProgramme(v, p.cours) : recomposerProgramme(p.preambule, p.cours.map(x => (x.nom === quoi ? { ...x, texte: v } : x)));
    poser('Programme', t);
  };
  const m = edition ? 'e' : 'l';
  const bloc = (k, titre) => ((R[k] || edition)
    ? <EditeurRubrique key={`${m}-${k}`} titre={titre} texte={R[k] || ''} lecture={!edition} onChange={v => poser(k, v)} /> : null);
  const ouvrir = () => { setRub(R0); setTouchees({}); setNomsCours({}); setMotif(''); setMsg(null); setEdition(true); };
  const direct = droit.peut === 'direct';
  const nb = Object.keys(touchees).length;
  const nomsChanges = Object.fromEntries(Object.entries(nomsCours).filter(([k, v]) => v.trim() && v.trim() !== (cours.find(c => c.cours_code === k)?.cours_nom || '')));
  const nbNoms = Object.keys(nomsChanges).length;
  async function envoyer() {
    setEnvoi(true); setMsg(null);
    try {
      const r = !nb ? { ok: true, json: async () => ({}) } : direct
        ? await fetch(`/api/ref/ue/${ueNum}/dossier`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee: getAnnee(), rubriques: touchees }) })
        : await fetch(`/api/due/${ueNum}/dossier/proposer`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee: getAnnee(), rubriques: touchees, motif }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Refusé.');
      // LE NOM DES COURS (3.5.297), APRÈS les rubriques : il renomme aussi le titre du cours dans le programme du dossier.
      if (nbNoms) {
        const rn = await fetch(`/api/due/${ueNum}/cours-noms`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee: getAnnee(), noms: nomsChanges, motif }) });
        const jn = await rn.json().catch(() => ({}));
        if (!rn.ok) throw new Error(jn.error || 'Nom du cours refusé.');
      }
      setEdition(false);
      setMsg({ etat: 'reussi', t: [nb ? (direct ? 'Le dossier pédagogique est enregistré au référentiel.' : 'Votre correction est transmise à la direction. Le dossier ne change qu’après son accord.') : null,
        nbNoms ? (direct ? 'Le nom du cours est enregistré au référentiel, pour cette année et les suivantes.' : 'Le nouveau nom du cours vaut pour cette année ; il entrera au référentiel quand la direction l’aura accepté.') : null].filter(Boolean).join(' ') });
      charger();
    } catch (e) { setMsg({ etat: 'corriger', t: e.message }); } finally { setEnvoi(false); }
  }
  return (
    <div className="space-y-2">
      {droit.en_attente?.length > 0 && !edition && (
        <Encadre etat="surveiller" titre="Correction proposée, en attente de la direction">
          {droit.en_attente.map(p => <div key={p.id}>{p.auteur_nom || '—'} le {fr(p.cree_le)} : {p.rubriques.join(', ')}{p.motif ? ` — « ${p.motif} »` : ''}</div>)}
          <div className="text-slate-500 mt-1">Le texte ci-dessous est celui du référentiel, tant que la direction n’a pas accepté.</div>
        </Encadre>)}
      {msg && <Encadre etat={msg.etat} titre={msg.etat === 'reussi' ? 'C’est fait' : 'Refusé'}>{msg.t}</Encadre>}
      {droit.peut && !edition && (
        <div className="flex justify-end">
          <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={ouvrir}>
            <IconPencil size={15} /> {direct ? 'Corriger le dossier' : 'Proposer une correction'}</button>
        </div>)}
      {edition && (
        <Encadre etat="disponible" titre={direct ? 'Correction du dossier pédagogique' : 'Proposer une correction du dossier pédagogique'}>
          {direct ? 'Ce que vous corrigez ici entre directement au référentiel.'
            : 'Corrigez les rubriques mal importées. Rien ne change au référentiel : votre proposition part à la direction, qui l’accepte ou la refuse.'}
        </Encadre>)}
      {edition && cours.length > 0 && (
        <section className="carte p-3 space-y-2">
          <div className="intertitre m-0">Nom des cours</div>
          <p className="text-second text-slate-500 m-0">{direct ? 'Le nom corrigé entre au référentiel, pour cette année et les suivantes.'
            : 'Le nom corrigé vaut tout de suite pour cette année ; il entre au référentiel quand la direction l’accepte.'}</p>
          {cours.map(c => (
            <label key={c.cours_code} className="flex items-center gap-2 text-sm">
              <span className="w-16 shrink-0 tabular-nums text-slate-500">{c.cours_code}</span>
              <input className="controle flex-1 min-w-0" data-reponses="non" value={nomsCours[c.cours_code] ?? c.cours_nom ?? ''}
                onChange={e => setNomsCours(n => ({ ...n, [c.cours_code]: e.target.value }))} />
            </label>))}
        </section>)}
      {bloc('Finalités', '1. Finalités de l’unité')}
      {bloc('Capacités préalables', '2. Capacités préalables requises')}
      {bloc("Acquis d'apprentissage", '3. Acquis d’apprentissage')}
      {bloc('Degré de maîtrise', 'Degré de maîtrise')}
      {(P.preambule || P.cours.length > 0) && <div className="intertitre mt-3">4. Programme — par activité d’enseignement</div>}
      {(P.preambule || edition) && <EditeurRubrique key={`${m}-pre`} titre="Introduction commune à tous les cours" texte={P.preambule} lecture={!edition} onChange={v => poserProgramme(null, v)} />}
      {P.cours.map(c => <EditeurRubrique key={`${m}-${c.nom}`} titre={c.nom} texte={c.texte} lecture={!edition} onChange={v => poserProgramme(c.nom, v)} />)}
      {edition ? (
        <div className="carte p-3 space-y-2 sticky bottom-2 bg-white">
          {!direct && <label className="block text-sm"><span className="text-slate-600">Ce que corrige votre proposition (pour la direction)</span>
            <input className="controle w-full mt-1" data-reponses="non" value={motif} onChange={e => setMotif(e.target.value)}
              placeholder="ex. le programme du cours 2 était coupé à l’import" /></label>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-second text-slate-500 mr-auto">{nb || nbNoms ? [nb ? `${nb} rubrique(s) modifiée(s)` : null, nbNoms ? `${nbNoms} nom(s) de cours` : null].filter(Boolean).join(' · ') : 'Rien de modifié'}</span>
            <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => setEdition(false)}><IconX size={15} /> Annuler</button>
            <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5" disabled={envoi || (!nb && !nbNoms) || (!direct && !motif.trim())} onClick={envoyer}>
              {direct ? <><IconDeviceFloppy size={15} /> Enregistrer au référentiel</> : <><IconSend size={15} /> Proposer à la direction</>}</button>
          </div>
        </div>
      ) : onSuivante && <div className="pt-2"><button type="button" className="bouton bouton-fort" onClick={onSuivante}>Étape suivante : croiser les acquis et le programme</button></div>}
    </div>);
}
