/**
 * UNE UNITÉ, TROIS FACES (Charles, 8 octobre 2026 : « il faut un onglet qui
 * reprend pondération, DUE et tableau de croisement »).
 *
 * Les trois parlent du même objet et se nourrissent l'une l'autre : le
 * descriptif écrit le programme par cours, le croisement relie ses points aux
 * acquis, et ce croisement propose la pondération et remplit le tableau des
 * critères. Les avoir dans trois entrées du rail obligeait à rechoisir la même
 * unité trois fois et à recoller de tête ce qui va ensemble.
 *
 * L'unité se choisit une fois, ici ; chaque face garde ses droits (la
 * pondération : la direction et le secrétariat ; le descriptif et le
 * croisement : ceux de la DUE).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PastilleEtape, LienEtape } from '../components/graphiques.jsx';
import { IconPercentage, IconTable, IconFileDescription, IconCheck, IconArrowRight, IconArrowLeft, IconLock, IconBook } from '@tabler/icons-react';
import { api, authHeaders, getAnnee, getUser } from '../lib/api.js';
import { informer } from '../lib/dialogue.jsx';
import { Fiche } from './DUE.jsx';
import { UEModal } from './Referentiels.jsx';
import ApercuDossier from '../components/ApercuDossier.jsx';
import { RailLateral, Encadre } from '../components/ui.jsx';
import PonderationsUE from './PonderationsUE.jsx';
import CroisementUE, { proposer } from '../components/CroisementUE.jsx';

/* TROIS ÉTAPES, DANS L'ORDRE DU TRAVAIL (Charles, 8 octobre 2026 : « mets-le sous
   forme d'étapes 1, 2 et 3 — pense la chose de manière globale »). On croise
   d'abord les acquis et le programme ; la pondération en découle ; le descriptif
   s'écrit sur cette base et se valide. */
const FACES = [
  // L'ÉTAPE 0 (3.5.099, Charles : « le dossier pédagogique en étape 0, puis cliquable au besoin ») : lire avant de croiser.
  ['dossier', 'Lire le dossier pédagogique', IconBook, 0],
  ['croisement', 'Croiser les acquis et le programme', IconTable, 1],
  ['ponderation', 'Pondérer', IconPercentage, 2],
  ['descriptif', 'Décrire l’unité (DUE)', IconFileDescription, 3],
];

/* L'AVANCEMENT SE LIT DES TRACES, IL NE SE DÉCLARE PAS — la règle de la frise de
   la valorisation : rien n'est coché à la main. */
function etats(due, liens) {
  const o = {};
  if (due) {
    const cours = (due.cours || []).filter(x => String(x.ct_pp || '').toUpperCase() !== 'Z');
    const cr = due.contenu?.croisement || {};
    const aaCroises = new Set(Object.values(cr).flatMap(pts => Object.values(pts || {}).flat()));
    const coursCroises = cours.filter(x => Object.values(cr[x.cours_code] || {}).some(l => l?.length)).length;
    o.croisement = !aaCroises.size ? { etat: 'a_faire', detail: 'aucune croix' }
      : coursCroises === cours.length && (due.acquis || []).every(a => aaCroises.has(a.aa_code))
        ? { etat: 'fait', detail: `${cours.length} cours, tous les acquis` }
        : { etat: 'en_cours', detail: `${coursCroises} / ${cours.length} cours · ${aaCroises.size} / ${(due.acquis || []).length} acquis` };
    // Le circuit de la DUE (rédaction, soumission, validation) se lit ICI : la fiche n'affiche plus sa frise.
    const circuit = Object.fromEntries((due.etapes || []).map(e => [e.cle, e]));
    o.descriptif = due.statut === 'validee' ? { etat: 'fait', detail: circuit.validation?.detail || 'validée' }
      : due.soumis_le ? { etat: 'en_cours', detail: `${circuit.redaction?.detail || 'soumise'} — à valider par la direction` }
        : Object.keys(due.contenu || {}).length ? { etat: 'en_cours', detail: 'en rédaction' } : { etat: 'a_faire', detail: 'pas commencée' };
    o.ponderation_fixee = circuit.ponderations?.etat === 'fait' ? circuit.ponderations.detail : null;
  }
  /* LA PONDÉRATION DÉCOULE DU CROISEMENT : elle est faite quand les poids
     enregistrés sont ceux que donnent les croix, cours par cours — et non quand
     ils totalisent dix, ce qui ne dit pas d'où ils viennent. */
  if (liens) {
    const ev = (liens.cours || []).filter(c => !c.non_evalue && String(c.ct_pp || '').toUpperCase() !== 'Z');
    const cr = due?.contenu?.croisement || {};
    const aa = (due?.acquis || []).map(a => a.aa_code);
    const conforme = code => {
      const n = Object.fromEntries(aa.map(k => [k, 0]));
      for (const l of Object.values(cr[code] || {})) for (const k of l || []) if (k in n) n[k] += 1;
      const prop = proposer(n);
      if (!Object.keys(prop).length) return false;
      const reel = {};
      for (const l of liens.liens || []) if (l.cours_code === code) reel[l.aa_code] = Number(l.poids) || 0;
      return aa.every(k => (prop[k] || 0) === (reel[k] || 0));
    };
    const ok = ev.filter(c => conforme(c.cours_code)).length;
    o.ponderation = liens.epreuve_integree ? { etat: 'neutre', detail: 'épreuve intégrée : au tracé' }
      : !ev.length ? { etat: 'neutre', detail: 'aucun cours évalué' }
        : o.croisement?.etat === 'a_faire' ? { etat: 'a_faire', detail: 'attend le croisement (étape 1)' }
          : ok === ev.length ? { etat: 'fait', detail: o.ponderation_fixee ? `conforme · ${o.ponderation_fixee}` : `${ev.length} cours conformes — à fixer par la direction` }
            : { etat: ok ? 'en_cours' : 'a_faire', detail: `${ok} / ${ev.length} cours conformes au croisement` };
  }
  return o;
}

/* LA LIGNE DE PROGRESSION, EN TROIS BOULES (3.1.383, Charles, 15 octobre 2026 : « la ligne de progression en
   3 parties, comme prévu dans notre mise en page, avec les boules ; bloquer l'étape 2 tant que 1 n'est pas
   faite »). Les pastilles et le trait de la maison (graphiques.jsx) ; une étape s'ouvre quand celle d'avant
   est faite — « sans objet » (épreuve intégrée, aucun cours évalué) vaut faite. */
export const etapeFaite = e => e === 'fait' || e === 'neutre';
/* PLUS DE BLOCAGE (3.5.179, Charles, 7 novembre 2026 : « j'ai changé d'avis, on doit pouvoir accéder à toutes les étapes sans
   blocage ») : chaque étape s'ouvre, à tout moment ; la frise dit seulement ce qui est fait. Les règles d'ordre restent écrites
   dessous, inactives, au cas où l'on y reviendrait. */
const ORDRE_IMPOSE = false;
export function verrouDe(k, et) {
  if (!ORDRE_IMPOSE) return null;
  if (k === 'ponderation' && !etapeFaite(et.croisement?.etat)) return "Terminez d'abord l'étape 1 : chaque cours croisé, chaque acquis servi.";
  if (k === 'descriptif' && !etapeFaite(et.croisement?.etat)) return "Terminez d'abord l'étape 1 : le croisement.";
  if (k === 'descriptif' && et.ponderation && !etapeFaite(et.ponderation.etat)) return "Terminez d'abord l'étape 2 : la pondération conforme au croisement.";
  return null;
}
/* LA DIRECTION PASSE (Charles, 15 octobre 2026 : « en tant que directeur, je dois pouvoir sauter les étapes
   sans pour autant les valider — sinon je ne sais pas voir ce qu'il y a partout »). Le cadenas reste
   affiché, l'étape s'ouvre quand même ; rien n'est coché pour autant. */
const passeLesVerrous = () => ['admin', 'directeur', 'directeur_adjoint'].includes(getUser()?.role);
/* LE FILET ENTRE LES ÉTAPES RESTE VISIBLE (3.5.267, Charles : « il disparaît si on clique sur le nombre ») : le bouton d'une étape
   couvrait toute la largeur et prenait un fond au survol et au clic, qui cachait le filet posé dessous. Plus de fond : le survol
   colore le libellé. */
function Frise({ faces, ouvertes, face, onFace, et, passe = false }) {
  return (
    <ol className="m-0 p-0 list-none flex items-start w-full max-w-4xl" aria-label="Étapes">
      {faces.map(([k, l, , n], i) => {
        const e = et[k]?.etat; const actif = face === k; const fait = etapeFaite(e);
        const ouverte = ouvertes.includes(k);
        const verrou = verrouDe(k, et);
        const libre = ouverte && (!verrou || passe || passeLesVerrous());
        return (
          <li key={k} className="flex-1 min-w-0 relative">
            {i > 0 && <LienEtape fait={etapeFaite(et[faces[i - 1][0]]?.etat)} className="absolute top-[13px] right-1/2 w-full" />}
            <button type="button" onClick={() => libre && onFace(k)} aria-current={actif ? 'step' : undefined} disabled={!libre}
              title={!ouverte ? 'Réglée par la direction' : verrou || undefined}
              className={`relative z-10 w-full flex flex-col items-center text-center px-2 py-1 bg-transparent focus:outline-none focus-visible:[&>span:first-child]:ring-2 ${libre ? 'cursor-pointer hover:[&>span]:text-iip-blue' : 'cursor-not-allowed opacity-60'}`}>
              <PastilleEtape n={n} etat={fait ? 'fait' : actif ? 'courant' : 'avenir'} choisie={actif} />
              <span className={`mt-1 text-second ${actif ? 'font-semibold text-iip-blue' : 'text-slate-700'}`}>{l}</span>
              <span className="text-mention text-slate-500 leading-tight">
                {verrou && !fait ? <span className="inline-flex items-center gap-1"><IconLock size={11} /> {k === 'descriptif' && etapeFaite(et.croisement?.etat) ? 'après l’étape 2' : 'après l’étape 1'}</span>
                  : et[k]?.detail || (ouverte ? '…' : 'réglée par la direction')}
              </span>
            </button>
          </li>);
      })}
    </ol>);
}

const MEMO = 'lucie.atelierUE';
const lireMemo = () => { try { return JSON.parse(localStorage.getItem(MEMO) || '{}'); } catch { return {}; } };
const ecrireMemo = v => { try { localStorage.setItem(MEMO, JSON.stringify(v)); } catch { /* sans mémoire */ } };

/* `faces` : celles qu'on ouvre ici — Mes cours n'ouvre pas la pondération, que
   l'enseignant ne règle pas. */
/* LES FACES SONT DANS LE RAIL (Charles, 8 octobre 2026 : « tu n'as pas mis le menu
   dans le rail en glissant, comme normal »). Dans un axe, elles s'inscrivent dans
   le tiroir ; dans Mes cours, qui tient son propre rail, l'écran parent les y pose
   (`railPropre = false`, `face` et `onFace` fournis). `faces` : celles qu'on ouvre
   ici — Mes cours n'ouvre pas la pondération, que l'enseignant ne règle pas. */
export default function AtelierUE({ faceInitiale = 'croisement', faces = FACES.map(f => f[0]),
                                    face: faceDonnee, onFace, railPropre = true }) {
  const ouvertes = FACES.filter(f => faces.includes(f[0]));
  const memo = lireMemo();
  const [liste, setListe] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [section, setSection] = useState(memo.section || '');
  const [ue, setUe] = useState(memo.ue || null);
  const [dp, setDp] = useState(null);   // la fiche du dossier pédagogique ouverte (3.5.098)
  const [faceLocale, setFaceLocale] = useState(ouvertes.some(f => f[0] === faceInitiale) ? faceInitiale : ouvertes[0][0]);
  // Un clic sur une étape du rail quand l'écran n'était pas encore ouvert : l'axe
  // l'a notée (`lucie.outil`), on l'ouvre directement.
  useEffect(() => {
    try {
      const o = sessionStorage.getItem('lucie.outil');
      if (o?.startsWith('face-')) { sessionStorage.removeItem('lucie.outil');
        const k = o.slice(5); if (ouvertes.some(f => f[0] === k)) (onFace || setFaceLocale)(k); }
    } catch { /* sans mémoire de session */ }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const face = faceDonnee || faceLocale;
  const setFace = onFace || setFaceLocale;
  const [numero, setNumero] = useState('');
  const [suivi, setSuivi] = useState({});
  /* QUI NE PEUT PAS ÉCRIRE LIT TOUTES LES ÉTAPES (3.5.144, Charles : « si pas référent ou coordination, elle doit voir toutes les
     étapes en lecture pour avoir l'info ») : les verrous de l'ordre du travail ne gardent que ceux qui rédigent. */
  const [lecture, setLecture] = useState(false);
  const [pourquoi, setPourquoi] = useState(null);
  const [etape3, setEtape3] = useState(false);
  const [redaction, setRedaction] = useState(null);
  async function reglerRedaction(mode) {
    const r = await fetch('/api/due/redaction-section', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ ue_num: ue, mode }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { informer(j.error || 'Réglage refusé'); return; }
    setRedaction(x => ({ ...x, mode }));
  }
  const passe = lecture || passeLesVerrous();
  const lireSuivi = useCallback(async n => {
    if (!n) return;
    const [due, liens] = await Promise.all([
      api.dueLire(n).catch(() => null),
      fetch(`/api/acquis/ue/${n}/liens?annee=${encodeURIComponent(getAnnee())}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setSuivi(etats(due, liens));
    setLecture(!!due && !due?.droits?.ecrire);
    setPourquoi(due?.droits?.pourquoi || null);
    setEtape3(!!due?.droits?.etape3);
    setRedaction(due?.redaction || null);
  }, []);
  // Relu à chaque changement d'unité ou d'étape : ce qu'on vient d'enregistrer se voit.
  useEffect(() => { lireSuivi(ue); }, [ue, face, lireSuivi]);

  useEffect(() => {
    // La liste de la DUE : les unités que la personne a le droit de voir.
    api.dueListe().then(j => {
      setListe(j);
      const s = j.sections || [];
      setSection(x => (s.includes(x) ? x : (s.includes('TIM') ? 'TIM' : s[0] || '')));
    }).catch(e => setErreur(e.message));
  }, []);

  const ues = useMemo(() => (liste?.ues || []).filter(u => !section || u.section === section), [liste, section]);
  useEffect(() => {
    if (!liste) return;
    if (!ues.some(u => u.ue_num === ue)) setUe(ues[0]?.ue_num ?? null);
  }, [ues]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (section || ue) ecrireMemo({ section, ue }); }, [section, ue]);

  // Le n° d'unité tapé : on cherche dans toutes les sections permises.
  const allerA = n => {
    const t = (liste?.ues || []).filter(u => String(u.ue_num) === String(n).trim());
    if (t.length) { setSection(t[0].section); setUe(t[0].ue_num); setNumero(''); }
  };

  if (erreur) return <p className="p-4 text-sm text-red-700">{erreur}</p>;
  if (!liste) return <p className="p-4 text-sm text-slate-400">Chargement…</p>;
  if (!liste.ues.length) return <p className="p-4 text-sm text-slate-500">Aucune unité ne vous est ouverte cette année.</p>;
  const u = (liste.ues || []).find(x => x.ue_num === ue);
  async function ouvrirDP() {
    const an = getAnnee();
    const [j, sections] = await Promise.all([
      fetch(`/api/ref/ue/${ue}?annee=${encodeURIComponent(an)}`, { headers: authHeaders() }).then(r => (r.ok ? r.json() : null)),
      fetch('/api/ref/sections', { headers: authHeaders() }).then(r => (r.ok ? r.json() : [])).catch(() => []),
    ]);
    if (j) setDp({ ue: { ...j, ue_num: ue, annee_scolaire: an, _edit: true }, sections: Array.isArray(sections) ? sections : [] });
  }

  return (
    <div className="p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="titre-carte mr-auto min-w-0 flex-1 truncate" title={u ? `UE ${u.ue_num} — ${u.ue_nom}` : ''}>
          {u ? <>UE {u.ue_num} — {u.ue_nom}</> : 'Unité'}
        </h2>
        {liste.sections.length > 1 && (
          <select className="controle" value={section} onChange={e => setSection(e.target.value)} aria-label="Section">
            {liste.sections.map(s => <option key={s} value={s}>{s}</option>)}
          </select>)}
        <select className="controle max-w-[18rem]" value={ue ?? ''} onChange={e => setUe(Number(e.target.value))} aria-label="Unité">
          {ues.map(x => <option key={x.ue_num} value={x.ue_num}>{x.ue_num} — {x.ue_nom}</option>)}
        </select>
        <input className="controle w-24" inputMode="numeric" placeholder="n° d'UE" value={numero} aria-label="Aller à l'unité n°"
          onChange={e => setNumero(e.target.value.replace(/\D/g, ''))} onKeyDown={e => { if (e.key === 'Enter') allerA(numero); }} />
        {/* LE DOSSIER PÉDAGOGIQUE AVANT DE CROISER (3.5.098, Charles : « il manque un aperçu du DP avant de faire cela ; il n'est
            visible que dans Config ») : la même fiche que Configuration → Unités et cours, ouverte sur son contenu. */}
        {ue && <button type="button" className="bouton controle inline-flex items-center gap-1.5" onClick={ouvrirDP}>
          <IconBook size={15} /> Dossier pédagogique</button>}
      </div>
      {dp && <UEModal ue={dp.ue} sections={dp.sections} ongletInitial="contenu" lecture onClose={() => setDp(null)} onSaved={() => setDp(null)} />}

      <Frise faces={FACES} ouvertes={ouvertes.map(f => f[0])} face={face} onFace={setFace} et={suivi} passe={lecture} />
      {ue && lecture && (etape3
        ? <Encadre etat="neutre">Les étapes 0 à 2 sont rédigées par la coordination de la section : vous les voyez en lecture. À l’étape 3, vous complétez les méthodes d’apprentissage et le contrat pédagogique, les supports de cours, les modalités d’évaluation et le degré de maîtrise.</Encadre>
        : <Encadre etat="neutre">Lecture seule{pourquoi ? ` — ${pourquoi}` : ''} Les enseignants qui donnent cours dans l’unité et la coordination rédigent ; vous voyez chaque étape.</Encadre>)}
      {/* CE QUE LES ENSEIGNANTS RÉDIGENT (3.5.421) : réglé par section, par la direction ou la coordination de la section. */}
      {ue && redaction?.peut_regler && (
        <div className="flex flex-wrap items-center gap-2 text-second text-slate-600">
          <span>En <b>{redaction.section}</b>, les enseignants rédigent :</span>
          <div className="segments" role="radiogroup" aria-label="Ce que les enseignants rédigent">
            {[['etape3', 'l’étape 3 seulement'], ['tout', 'toutes les étapes']].map(([v, l]) => (
              <button key={v} type="button" role="radio" aria-checked={redaction.mode === v} onClick={() => reglerRedaction(v)}
                className={redaction.mode === v ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600 hover:bg-slate-50'}>{l}</button>))}
          </div>
          {redaction.mode === 'etape3' && <span className="text-slate-500">méthodes, supports, modalités d’évaluation, degré de maîtrise ; les étapes 0 à 2 restent à la coordination.</span>}
        </div>)}

      {railPropre && (
        <RailLateral titre="Unité" sections={[{ items: ouvertes.map(([k, l, I, n]) => (
          { key: `face-${k}`, label: `${n}. ${l}${verrouDe(k, suivi) ? ' (verrouillée)' : ''}`, icon: I, actif: face === k, onClick: () => setFace(k) })) }]} />)}

      {ue && !lecture && verrouDe(face, suivi) && (
        <Encadre etat="surveiller">
          <div className="flex items-center gap-2">
            <IconLock size={15} /> {verrouDe(face, suivi)}{passeLesVerrous() ? ' Vous la consultez en tant que direction : rien n’est validé pour autant.' : ''}
            <button type="button" className="bouton ml-auto" onClick={() => setFace('croisement')}>Aller à l'étape 1</button>
          </div>
        </Encadre>)}
      {/* PASSER D'UNE ÉTAPE À L'AUTRE SE VOIT (3.5.253, Charles : « on ne sait pas passer l'étape 2 ni 3… moi je sais, mais Amélie
          ne sait pas, ni les coordinations ni les profs ») : les boules de la frise s'ouvrent au clic, mais rien ne le disait, et
          « Étape suivante » n'apparaissait qu'après un enregistrement. Une barre, en haut et au bas de chaque étape. */}
      {ue && <NavEtapes ouvertes={ouvertes} face={face} setFace={setFace} />}
      {ue && face === 'dossier' && <ApercuDossier key={ue} ueNum={ue} onSuivante={() => setFace('croisement')} />}
      {ue && face === 'croisement' && <CroisementUE key={ue} ueNum={ue} onEnregistre={() => lireSuivi(ue)}
        suivante={ouvertes.find(f => f[3] === 2) ? () => setFace('ponderation') : ouvertes.find(f => f[3] === 3) ? () => setFace('descriptif') : null} />}
      {ue && face === 'ponderation' && faces.includes('ponderation') && (!verrouDe('ponderation', suivi) || passe) && <PonderationsUE key={ue} ueFixe={ue} />}
      {ue && face === 'descriptif' && (!verrouDe('descriptif', suivi) || passe) && <Fiche key={ue} ueNum={ue} integree />}
      {ue && <NavEtapes ouvertes={ouvertes} face={face} setFace={setFace} bas />}
    </div>);
}

function NavEtapes({ ouvertes, face, setFace, bas = false }) {
  const i = ouvertes.findIndex(f => f[0] === face);
  const prec = i > 0 ? ouvertes[i - 1] : null, suiv = i >= 0 && i < ouvertes.length - 1 ? ouvertes[i + 1] : null;
  if (!prec && !suiv) return null;
  const aller = k => { setFace(k); if (bas) window.scrollTo({ top: 0, behavior: 'smooth' }); };
  return (
    <div className={`flex flex-wrap items-center gap-2 ${bas ? 'pt-3 border-t border-slate-200' : ''}`}>
      {prec && <button type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => aller(prec[0])}><IconArrowLeft size={15} /> Étape {prec[3]} : {prec[1]}</button>}
      {suiv && <button type="button" className="bouton bouton-fort inline-flex items-center gap-1.5 ml-auto" onClick={() => aller(suiv[0])}>Étape {suiv[3]} : {suiv[1]} <IconArrowRight size={15} /></button>}
    </div>);
}
