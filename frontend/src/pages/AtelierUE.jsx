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
import { PastilleEtape } from '../components/graphiques.jsx';
import { IconPercentage, IconTable, IconFileDescription, IconCheck, IconArrowRight } from '@tabler/icons-react';
import { api, authHeaders, getAnnee } from '../lib/api.js';
import { Fiche } from './DUE.jsx';
import { RailLateral } from '../components/ui.jsx';
import PonderationsUE from './PonderationsUE.jsx';
import CroisementUE, { proposer } from '../components/CroisementUE.jsx';

/* TROIS ÉTAPES, DANS L'ORDRE DU TRAVAIL (Charles, 8 octobre 2026 : « mets-le sous
   forme d'étapes 1, 2 et 3 — pense la chose de manière globale »). On croise
   d'abord les acquis et le programme ; la pondération en découle ; le descriptif
   s'écrit sur cette base et se valide. */
const FACES = [
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
    o.descriptif = due.statut === 'validee' ? { etat: 'fait', detail: `validé${due.valide_le ? ` le ${due.valide_le}` : ''}` }
      : Object.keys(due.contenu || {}).length ? { etat: 'en_cours', detail: 'en préparation' } : { etat: 'a_faire', detail: 'pas commencé' };
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
          : ok === ev.length ? { etat: 'fait', detail: `${ev.length} cours, conformes au croisement` }
            : { etat: ok ? 'en_cours' : 'a_faire', detail: `${ok} / ${ev.length} cours conformes au croisement` };
  }
  return o;
}

function Frise({ faces, ouvertes, face, onFace, et }) {
  return (
    <ol className="m-0 p-0 list-none flex flex-wrap items-stretch gap-2" aria-label="Étapes">
      {faces.map(([k, l, , n], i) => {
        const e = et[k]?.etat; const actif = face === k; const fait = e === 'fait';
        // Une étape que cet écran n'ouvre pas reste dans la frise : le circuit se lit en entier.
        const ouverte = ouvertes.includes(k);
        return (
          <li key={k} className="flex items-center gap-2 min-w-0">
            <button type="button" onClick={() => onFace(k)} aria-current={actif ? 'step' : undefined} disabled={!ouverte}
              title={ouverte ? undefined : 'Réglée par la direction ou le secrétariat'}
              className={`flex items-center gap-2.5 rounded-carte border px-3 py-2 text-left min-w-0 bg-white
                ${actif ? 'border-iip-blue shadow-pose' : ouverte ? 'border-slate-200 hover:border-slate-400' : 'border-slate-200 opacity-60 cursor-default'}`}>
              <PastilleEtape n={n} etat={fait ? 'fait' : actif ? 'courant' : 'avenir'} />
              <span className="min-w-0">
                <span className={`block text-sm ${actif ? 'font-semibold text-iip-blue' : 'text-slate-700'}`}>{l}</span>
                <span className="block text-xs text-slate-500 truncate">{et[k]?.detail || (ouverte ? '…' : 'réglée par la direction')}</span>
              </span>
            </button>
            {i < faces.length - 1 && <IconArrowRight size={16} className="text-slate-300 flex-none" />}
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
  const lireSuivi = useCallback(async n => {
    if (!n) return;
    const [due, liens] = await Promise.all([
      api.dueLire(n).catch(() => null),
      fetch(`/api/acquis/ue/${n}/liens?annee=${encodeURIComponent(getAnnee())}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : null)).catch(() => null),
    ]);
    setSuivi(etats(due, liens));
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
      </div>

      <Frise faces={FACES} ouvertes={ouvertes.map(f => f[0])} face={face} onFace={setFace} et={suivi} />

      {railPropre && (
        <RailLateral titre="Unité" sections={[{ items: ouvertes.map(([k, l, I, n]) => (
          { key: `face-${k}`, label: `${n}. ${l}`, icon: I, actif: face === k, onClick: () => setFace(k) })) }]} />)}

      {ue && face === 'croisement' && <CroisementUE key={ue} ueNum={ue} onEnregistre={() => lireSuivi(ue)}
        suivante={ouvertes.find(f => f[3] === 2) ? () => setFace('ponderation') : ouvertes.find(f => f[3] === 3) ? () => setFace('descriptif') : null} />}
      {ue && face === 'ponderation' && faces.includes('ponderation') && <PonderationsUE key={ue} ueFixe={ue} />}
      {ue && face === 'descriptif' && <Fiche key={ue} ueNum={ue} integree />}
    </div>);
}
