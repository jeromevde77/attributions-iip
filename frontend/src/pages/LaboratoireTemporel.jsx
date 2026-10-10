import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { api, authHeaders, getAnnee } from '../lib/api.js';
import { choisir, demander, informer, saisir } from '../lib/dialogue.jsx';
import { passeRole } from '../lib/droits.js';
import { teinteCours, styleTuileCours } from '../lib/teinteCours.js';
import { IconeLaboratoire } from '../components/IconeLaboratoire.jsx';
import { RailLateral } from '../components/ui.jsx';
import { IconSitemap, IconPuzzle, IconCalendarWeek, IconTimeline, IconTrash, IconHistory, IconUserCheck, IconCalendarCog, IconWand } from '@tabler/icons-react';
const StructureSection = lazy(() => import('./StructureSection.jsx'));
const GroupesCommuns = lazy(() => import('./GroupesCommuns.jsx'));
const DisponibilitesSection = lazy(() => import('./DisponibilitesSection.jsx'));
const PlanningEcole = lazy(() => import('./PlanningEcole.jsx'));
const CohortesBloc = lazy(() => import('../components/CohortesBloc.jsx'));
const SimulationAnnee = lazy(() => import('./GroupesCommuns.jsx').then(m => ({ default: m.SimulationAnnee })));

/**
 * LE LABORATOIRE TEMPOREL DE LUCIE (Charles, 10 octobre 2026 : « on zoome pour
 * voir le détail de l'unité, on dézoome pour avoir une vision méta » ; « le verre
 * ne se voit qu'au dernier zoom, sinon c'est illisible ; pour le reste ce sont
 * des tuiles »).
 *
 * Trois niveaux, une seule source — la grille d'organisation (`/api/grille`) :
 *   · L'ANNÉE : chaque UE est une tuile posée sur ses semaines ; on la glisse
 *     pour la déplacer, on tire ses bords pour l'allonger. Ses dates sont celles
 *     de Dates des UE (organisation_ue) : rien n'est doublé.
 *   · LES COUCHES : la tuile s'ouvre sur ses cours et leurs activités.
 *   · UNE UE : le VERRE. Chaque cours y occupe la hauteur de ses périodes du
 *     dossier ; on le remplit d'activités par glisser-déposer, une activité en
 *     groupes se coupe en autant de blocs. Ce qui manque se hachure.
 * Les UE qui ont lieu en même temps se rangent l'une sous l'autre.
 *
 * Dans la grille, les périodes d'une activité sont celles de l'ENSEIGNANT, tous
 * groupes confondus ; le verre montre ce que vit l'ÉTUDIANT : periodes / groupes.
 */

const NOMS_MOIS = ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'];
const parEtudiant = a => (Number(a.periodes) || 0) / Math.max(1, Number(a.groupes) || 1);
const sommeEtudiant = c => (c.activites || []).reduce((t, a) => t + parEtudiant(a), 0);
const arrondi = n => Math.round(n * 10) / 10;
const lettre = i => String.fromCharCode(65 + (i % 26));
const estGroupes = lib => /\bTP\b|travaux pratiques|labo|séminaire|seminaire/i.test(lib || '');

export default function LaboratoireTemporel() {
  const [annee] = useState(getAnnee());
  const peutEcrire = passeRole(['admin', 'editeur', 'coordination']);
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(() => { try { return localStorage.getItem('lucie.labo.section') || ''; } catch { return ''; } });
  const [bloc, setBloc] = useState('');
  const [data, setData] = useState(null);
  const [types, setTypes] = useState([]);
  const [erreur, setErreur] = useState(null);
  const [zoom, setZoom] = useState('annee');
  /* UN SEUL LABORATOIRE (Charles, 10 octobre 2026 : « réunis tout dans le labo ») :
     quatre faces sur la même section et le même bloc — le temps (l'année, les
     couches, le verre), les groupes (briques, plan des groupes), la semaine
     (simulation, plan enregistré) et le schéma de capitalisation. */
  /* LES FACES SONT DANS LE RAIL (Charles, 10 octobre 2026 : « sous-menu rail »),
     comme les étapes de l'unité : un clic sur l'une d'elles depuis un autre écran
     est noté par l'axe (`lucie.outil`) et ouvre la bonne face. */
  const [face, setFace] = useState(() => {
    try {
      const o = sessionStorage.getItem('lucie.outil');
      if (o?.startsWith('labo-')) { sessionStorage.removeItem('lucie.outil'); return o.slice(5); }
      const q = new URLSearchParams(window.location.search); return q.get('face') || (q.get('onglet') === 'groupes-communs' ? 'groupes' : 'temps');
    } catch { return 'temps'; }
  });
  const [choix, setChoix] = useState(null);           // n° de l'UE choisie
  const [glisse, setGlisse] = useState(null);         // { ue, de, a } pendant un geste
  const [rev, setRev] = useState(0);                  // chaque relecture renouvelle le verre ouvert
  /* LES VERRES CÔTE À CÔTE (Charles, 10 octobre 2026 : « mettre des verres l'un à
     côté de l'autre, en carrousel, les changer d'ordre, comparer des UE »). */
  const [rangee, setRangee] = useState([]);           // n° d'UE, dans l'ordre choisi
  const [debutRangee, setDebutRangee] = useState(0);
  const [cohortes, setCohortes] = useState(false);

  /* REMPLIR LES VERRES DEPUIS LES ATTRIBUTIONS (Charles, 10 octobre 2026) : le
     travail dans l'autre sens — ce qui est déjà attribué remplit les verres.
     Compte rendu d'abord ; un cours déjà découpé n'est remplacé que sur demande. */
  /* LE GRAND NETTOYAGE (Charles, 10 octobre 2026) : sauvegarder, vider, puis
     proposer de réimporter depuis les attributions. Une sauvegarde se restaure. */
  async function grandNettoyage() {
    const corps = { annee_scolaire: annee, section };
    const r0 = await fetch('/api/grille/nettoyer', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...corps, simulation: true }) });
    const a = await r0.json().catch(() => ({}));
    if (!r0.ok) { setErreur(a.error || `Erreur ${r0.status}`); return; }
    const k = a.compte || {};
    const v = await choisir({ titre: `Grand nettoyage du laboratoire — ${section}`, ton: 'alerte',
      message: `Tout le laboratoire de la section ${section} est d’abord SAUVEGARDÉ, puis vidé : ${k.verres} verre(s) de cours, ${k.couches} couche(s), ${k.plan} créneau(x) du plan, ${k.briques} étudiant(s) rangés en briques, les locaux des activités et les cases (stage bloquant, congés, autonomie de côté). La structure reste : les UE, les cours, les plages, les attributions.`,
      choix: [{ valeur: 'garder', libelle: 'Nettoyer, en gardant les dates des UE', aide: `${k.ues_datees} UE ont des dates — Dates des UE et l’échéancier les lisent aussi.` },
        { valeur: 'dates', libelle: 'Nettoyer aussi les dates des UE', aide: 'Toutes les UE repartent « dates à poser ».' }] });
    if (!v) return;
    const r = await fetch('/api/grille/nettoyer', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...corps, dates: v === 'dates', simulation: false }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    setChoix(null); setRangee([]); setZoom('annee');
    await charger();
    if (await demander({ titre: 'Laboratoire nettoyé', message: `✓ Le laboratoire est vide, et sauvegardé avant (sauvegarde n° ${j.sauvegarde_id}, restaurable). Réimporter maintenant les verres depuis les attributions ?`, confirmer: 'Réimporter', annuler: 'Plus tard' })) {
      await remplirDepuisAttributions([...new Set((data?.ues || []).filter(u => !u.stage).map(u => u.ue_num))]);
    }
  }
  async function restaurerSauvegarde() {
    const r0 = await fetch(`/api/grille/sauvegardes?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
    const l = await r0.json().catch(() => []);
    if (!Array.isArray(l) || !l.length) { await informer('Aucune sauvegarde du laboratoire pour cette section et cette année.'); return; }
    const id = await choisir({ titre: `Restaurer le laboratoire — ${section}`, message: 'L’état actuel est sauvegardé avant la restauration : elle se défait.',
      choix: l.map(x => ({ valeur: x.id, libelle: `n° ${x.id} — ${String(x.cree_le).slice(0, 16).replace('T', ' ')}`, aide: `${x.motif || ''}${x.cree_par ? ` · ${x.cree_par}` : ''}` })) });
    if (!id) return;
    const r = await fetch(`/api/grille/sauvegardes/${id}/restaurer`, { method: 'POST', headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    setChoix(null); setRangee([]); await charger();
    await informer(`✓ Laboratoire restauré depuis la sauvegarde n° ${id}.`);
  }
  async function remplirDepuisAttributions(ueNums) {
    const corps = { annee_scolaire: annee, section, ue_nums: ueNums };
    const r0 = await fetch('/api/grille/depuis-attributions', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...corps, simulation: true }) });
    const a = await r0.json().catch(() => ({}));
    if (!r0.ok) { setErreur(a.error || `Erreur ${r0.status}`); return; }
    if (!a.a_ecrire.length && !a.deja.length) { await informer(`Aucune attribution à reprendre${a.sans_attribution.length ? ` (UE ${a.sans_attribution.join(', ')} sans attribution)` : ''}.`); return; }
    const resume = c => `${c.cours_code} : ${c.activites.map(x => `${x.activite_nom} ${x.par_etudiant} p.${x.groupes > 1 ? ` ×${x.groupes}` : ''}`).join(', ')}`;
    let remplacer = false;
    if (a.deja.length) {
      const v = await choisir({ titre: 'Remplir les verres depuis les attributions',
        message: `${a.a_ecrire.length} cours vide(s) à remplir. ${a.deja.length} cours sont déjà découpés dans un verre (${a.deja.map(c => c.cours_code).join(', ')}).`,
        choix: [{ valeur: 'vides', libelle: 'Remplir seulement les cours vides', aide: 'Les verres déjà découpés restent tels quels.' },
          { valeur: 'tout', libelle: 'Remplacer aussi les cours déjà découpés', aide: 'Leur découpage est remplacé par celui des attributions.' }] });
      if (!v) return;
      remplacer = v === 'tout';
      if (!remplacer && !a.a_ecrire.length) return;
    } else if (!(await demander({ titre: 'Remplir les verres depuis les attributions',
      message: `${a.a_ecrire.length} cours à remplir :\n${a.a_ecrire.slice(0, 12).map(resume).join('\n')}${a.a_ecrire.length > 12 ? '\n…' : ''}`, confirmer: 'Remplir' }))) return;
    const r = await fetch('/api/grille/depuis-attributions', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...corps, remplacer, simulation: false }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
    await informer(`✓ ${j.ecrit} cours rempli(s) depuis les attributions.`);
  }

  useEffect(() => { api.sections().then(l => { const ls = Array.isArray(l) ? l : []; setSections(ls); if (!section && ls[0]) setSection(ls[0].code); }).catch(() => {}); }, []); // eslint-disable-line
  const charger = async () => {
    if (!section) return;
    try { localStorage.setItem('lucie.labo.section', section); } catch { /* préférence seulement */ }
    try {
      const r = await fetch(`/api/grille?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`, { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setData(j); setErreur(null); setRev(r => r + 1);
    } catch (e) { setErreur(e.message); }
    fetch(`/api/grille/activites?section=${encodeURIComponent(section)}`, { headers: authHeaders() }).then(r => r.json()).then(l => setTypes(Array.isArray(l) ? l : [])).catch(() => setTypes([]));
  };
  useEffect(() => { setData(null); setChoix(null); charger(); }, [section, annee]); // eslint-disable-line

  const semaines = data?.semaines || [];
  const NB = semaines.length;
  const indexDe = num => semaines.findIndex(s => s.semaine_num === num);
  const blocs = useMemo(() => [...new Set((data?.ues || []).map(u => String(u.ue_niv || '').toUpperCase()).filter(Boolean))].sort(), [data]);
  const ues = useMemo(() => (data?.ues || []).filter(u => !bloc || String(u.ue_niv || '').toUpperCase() === bloc), [data, bloc]);
  // L'étendue d'une UE en colonnes : ses dates, sinon toute l'année de cours (à poser).
  const premiereCours = semaines.findIndex(s => s.type === 'cours'), derniereCours = semaines.map(s => s.type).lastIndexOf('cours');
  const etendue = u => {
    if (glisse && glisse.ue === u.cle) return { de: glisse.de, a: glisse.a, posee: true };
    const de = indexDe(u.sem_debut), a = indexDe(u.sem_fin);
    return de >= 0 && a >= 0 ? { de, a, posee: true } : { de: Math.max(0, premiereCours), a: Math.max(0, derniereCours), posee: false };
  };
  /* LES PISTES NE BOUGENT PAS SOUS LA MAIN (Charles, 10 octobre 2026 : « quand je
     change la taille d'une tuile, elle bascule en bas ; on dirait un bug »). Elles
     se rangeaient dans l'ordre des DATES : raccourcir une UE changeait son rang, et
     la tuile sautait de piste. Elles se rangent désormais dans l'ordre du NUMÉRO
     d'UE — chaque UE prend la première piste où elle ne chevauche personne —, et
     elles se calculent sur les dates ENREGISTRÉES : pendant le geste, rien ne bouge. */
  const etendueEnregistree = u => {
    const de = indexDe(u.sem_debut), a = indexDe(u.sem_fin);
    return de >= 0 && a >= 0 ? { de, a } : { de: Math.max(0, premiereCours), a: Math.max(0, derniereCours) };
  };
  const pistes = useMemo(() => {
    const occupe = [], out = new Map();
    for (const u of [...ues].sort((x, y) => x.ue_num - y.ue_num || (x.num_organisation || 1) - (y.num_organisation || 1))) {
      const e = etendueEnregistree(u);
      let i = occupe.findIndex(l => l.every(x => x.a < e.de || x.de > e.a));
      if (i < 0) { i = occupe.length; occupe.push([]); }
      occupe[i].push(e); out.set(u.cle, i);
    }
    return { n: occupe.length, de: out };
  }, [ues, semaines]); // eslint-disable-line

  async function poserDates(u, de, a) {
    const r = await fetch('/api/grille/ue', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({
      annee_scolaire: annee, section, ue_num: u.ue_num, num_organisation: u.num_organisation || 1, date_debut: semaines[de].date_debut, date_fin: semaines[a].date_fin || semaines[a].date_debut }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
  }
  async function basculerConges(u) {
    const r = await fetch('/api/grille/ue', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee_scolaire: annee, section, ue_num: u.ue_num, num_organisation: u.num_organisation || 1, cours_pendant_conges: !u.cours_pendant_conges }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
  }
  /* DÉDOUBLER UNE UE (Charles, 10 octobre 2026 : AESI, une moitié en stage de
     Toussaint à Noël, l'autre de Carnaval à Pâques ; pendant que l'une est en stage,
     l'autre a des UE). L'organisation suivante paraît comme une tuile à part. */
  /* L'ORGANISATION DE BASE (Charles, 10 octobre 2026 : « tu as le schéma de
     capitalisation, tu sais ce qui dépend de quoi ; donc tu sais faire une
     organisation de base »). Lucie propose, on lit le compte rendu, on retouche. */
  async function organisationDeBase() {
    const corps = { annee_scolaire: annee, section };
    const r0 = await fetch('/api/grille/organisation-de-base', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...corps, simulation: true }) });
    const a = await r0.json().catch(() => ({}));
    if (!r0.ok) { setErreur(a.error || `Erreur ${r0.status}`); return; }
    if (!a.propositions?.length) { await informer('Aucune UE à organiser dans cette section.'); return; }
    const dt = d => d.split('-').reverse().slice(0, 2).join('/');
    const texte = a.propositions.slice(0, 18).map(p => `${p.bloc} · UE ${p.ue_num} : ${dt(p.date_debut)} → ${dt(p.date_fin)} (${p.raison})${p.actuel ? ' — déjà posée' : ''}`).join('\n')
      + (a.propositions.length > 18 ? `\n… et ${a.propositions.length - 18} autre(s)` : '')
      + (a.alertes.length ? `\n\nÀ regarder :\n${a.alertes.join('\n')}` : '')
      + '\n\nSeule l’organisation 1 est proposée : celle d’une UE dédoublée se pose à la main.';
    const choix = [];
    if (a.a_ecrire && a.deja_posees) choix.push({ valeur: 'vides', libelle: `Poser seulement les ${a.a_ecrire} UE sans dates`, aide: 'Les dates déjà posées restent telles quelles.' });
    if (!a.deja_posees) choix.push({ valeur: 'vides', libelle: `Poser les ${a.a_ecrire} UE`, aide: 'Vous les retoucherez ensuite en glissant les tuiles.' });
    if (a.deja_posees) choix.push({ valeur: 'tout', libelle: `Tout remplacer (${a.propositions.length} UE)`, aide: 'Le laboratoire est sauvegardé d’abord : « Sauvegardes » le rétablit.' });
    const v = await choisir({ titre: 'Organisation de base proposée par Lucie', message: texte, choix });
    if (!v) return;
    const r = await fetch('/api/grille/organisation-de-base', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ ...corps, remplacer: v === 'tout', simulation: false }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
    await informer(`✓ ${j.ecrit} UE posée(s) dans l’année.${j.sauvegarde ? ' Le laboratoire avait été sauvegardé avant.' : ''}`);
  }
  async function dedoubler(u) {
    if (!(await demander({ titre: `Dédoubler l’UE ${u.ue_num}`, message: `Une organisation de plus pour l’UE ${u.ue_num}, avec ses propres dates. Son verre reprend celui de l’organisation 1 tant qu’on ne le découpe pas autrement.

Les étudiants se répartissent ensuite entre les organisations (répartition de l’UE, ou cohortes).`, confirmer: 'Dédoubler' }))) return;
    const r = await fetch('/api/grille/organisation', { method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee_scolaire: annee, section, ue_num: u.ue_num }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger(); setChoix(`${u.ue_num}#${j.num_organisation}`);
  }
  async function retirerOrganisation(u) {
    if (!(await demander({ titre: `Retirer l’organisation ${u.num_organisation} de l’UE ${u.ue_num}`, message: 'Ses dates et son verre propre disparaissent. Refusé si une attribution ou un étudiant y est rattaché.', confirmer: 'Retirer' }))) return;
    const r = await fetch('/api/grille/organisation', { method: 'DELETE', headers: authHeaders(), body: JSON.stringify({ annee_scolaire: annee, section, ue_num: u.ue_num, num_organisation: u.num_organisation }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { await informer(`❌ ${j.error || `Erreur ${r.status}`}`); return; }
    setChoix(null); await charger();
  }
  async function changerClasse(u, bloc) {
    const r = await fetch('/api/grille/organisation/bloc', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee_scolaire: annee, section, ue_num: u.ue_num, num_organisation: u.num_organisation || 1, bloc }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
  }
  async function basculerStage(u) {
    const r = await fetch('/api/grille/ue', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee_scolaire: annee, section, ue_num: u.ue_num, num_organisation: u.num_organisation || 1, stage_bloquant: !u.stage_bloquant }) });
    if (!r.ok) { const j = await r.json().catch(() => ({})); setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
  }

  const zone = useRef(null);
  function geste(ev, u, quoi) {
    if (!peutEcrire) { setChoix(u.cle); return; }
    ev.preventDefault(); ev.stopPropagation();
    const larg = (zone.current?.getBoundingClientRect().width || 1) / Math.max(1, NB);
    const e0 = etendue(u), x0 = ev.clientX;
    let courant = null;
    const mv = e => {
      const dc = Math.round((e.clientX - x0) / larg);
      if (!dc && !courant) return;
      let de = e0.de, a = e0.a;
      if (quoi === 'deplacer') { const d = Math.max(-e0.de, Math.min(NB - 1 - e0.a, dc)); de += d; a += d; }
      if (quoi === 'debut') de = Math.max(0, Math.min(e0.a, e0.de + dc));
      if (quoi === 'fin') a = Math.min(NB - 1, Math.max(e0.de, e0.a + dc));
      courant = { ue: u.cle, de, a }; setGlisse(courant);
    };
    const up = async () => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      if (!courant) { setChoix(u.cle); return; }
      setChoix(u.cle);
      await poserDates(u, courant.de, courant.a);
      setGlisse(null);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }

  const ueChoisie = (data?.ues || []).find(u => u.cle === choix) || null;
  const stagesBloquants = ues.filter(u => u.stage && u.stage_bloquant && etendue(u).posee).map(u => ({ ...etendue(u), org: u.nb_organisations > 1 ? u.num_organisation : null }));
  // Seule une UE POSÉE peut tomber pendant le stage : sans dates, on ne sait pas.
  // Un stage d'une organisation ne gêne que la même organisation des UE dédoublées ; une UE commune est gênée par tous.
  const pendantStage = u => !u.stage && etendue(u).posee && stagesBloquants.some(s => (!s.org || u.nb_organisations < 2 || s.org === u.num_organisation) && etendue(u).de <= s.a && etendue(u).a >= s.de);

  /* LES COUCHES DANS LE TEMPS (Charles, 10 octobre 2026 : « le contenu de la tuile
     est le reflet du verre, mais temporellement : l'évaluation à la fin, théorie
     et exercices en suivant ou en parallèle »). Chaque cours est une petite ligne
     du temps de ses activités ; deux activités qui se chevauchent passent l'une
     sous l'autre. Une activité sans dates court sur toute l'unité — l'évaluation,
     elle, se place d'office sur sa dernière semaine de cours. */
  const evalId = data?.evaluation?.activite_id ?? null;
  const [glisseAct, setGlisseAct] = useState(null);       // { ue, cours, k, de, a }
  const idxDate = d => { if (!d) return -1; const i = semaines.findIndex(x => d >= x.date_debut && d <= (x.date_fin || x.date_debut)); if (i >= 0) return i;
    let j = -1; semaines.forEach((x, n) => { if (x.date_debut <= d) j = n; }); return j; };
  const spanAct = (u, c, a, k) => {
    if (glisseAct && glisseAct.ue === u.cle && glisseAct.cours === c.cours_code && glisseAct.k === k) return { de: glisseAct.de, a: glisseAct.a };
    const e = etendue(u);
    const d = idxDate(a.date_debut), f = idxDate(a.date_fin);
    if (d >= 0 && f >= 0) return { de: Math.max(e.de, Math.min(d, e.a)), a: Math.max(e.de, Math.min(f, e.a)) };
    if (evalId != null && Number(a.activite_id) === Number(evalId)) {
      let i = e.a; while (i > e.de && semaines[i]?.type !== 'cours') i--;
      return { de: i, a: i };
    }
    return { de: e.de, a: e.a };
  };
  const couchesDe = u => (u.cours || []).map(c => {
    const lignes = [];
    (c.activites || []).map((act, k) => { const sp = spanAct(u, c, act, k); return { act, k, de: sp.de, fin: sp.a }; })
      .sort((x, y) => x.de - y.de || y.fin - x.fin).forEach(x => {
      let i = lignes.findIndex(l => l.every(y => y.fin < x.de || y.de > x.fin));
      if (i < 0) { i = lignes.length; lignes.push([]); }
      lignes[i].push(x);
    });
    return { c, lignes };
  });
  const hauteurUE = u => (zoom === 'annee' ? 54 : 40 + couchesDe(u).reduce((t, x) => t + 15 + 19 * Math.max(1, x.lignes.length), 0));
  // Une piste fait la hauteur de sa plus haute tuile ; les suivantes s'empilent dessous.
  const hauteursPistes = Array.from({ length: pistes.n }, (_, i) => Math.max(54, ...ues.filter(u => pistes.de.get(u.cle) === i).map(hauteurUE)));
  const hautDePiste = i => hauteursPistes.slice(0, i).reduce((t, h) => t + h + 8, 0);

  async function ecrireActivites(u, c, activites) {
    const r = await fetch('/api/grille/cours', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({
      annee_scolaire: annee, section, ue_num: u.ue_num, num_organisation: u.num_organisation || 1, cours_code: c.cours_code,
      date_debut: c.date_debut || null, date_fin: c.date_fin || null, autonomie_placee: c.autonomie_placee || 0, evaluation_mode: c.evaluation_mode || 'examen',
      activites: activites.map(a => ({ activite_id: a.activite_id, periodes: a.periodes, groupes: a.groupes || 1, vu_etudiant: a.vu_etudiant !== 0,
        date_debut: a.date_debut || null, date_fin: a.date_fin || null })) }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || `Erreur ${r.status}`); return; }
    await charger();
  }
  /* À LA SUITE OU EN PARALLÈLE, D'UN CLIC (Charles, 10 octobre 2026 : « jouer sur
     les juxtapositions et déterminer la temporalité »). À la suite : les activités
     s'enchaînent dans l'ordre du verre, chacune sur une durée proportionnelle à ses
     périodes, l'évaluation sur la dernière semaine. En parallèle : toutes sur toute
     l'unité. On ajuste ensuite barre par barre. */
  /* LES MÉLANGES (Charles, 10 octobre 2026 : « je dois faire des mixes : pouvoir
     cocher et dire ce qui est en parallèle ») : les activités cochées d'un cours
     forment UN bloc en parallèle ; « à la suite » enchaîne les autres avant et
     après, ce bloc prenant la place de la première activité cochée. */
  const [coches, setCoches] = useState({});              // `${ue}#${cours}` → [k…]
  const basculerCoche = (u, c, k) => setCoches(x => { const cle = `${u.cle}#${c.cours_code}`, l = new Set(x[cle] || []); l.has(k) ? l.delete(k) : l.add(k); return { ...x, [cle]: [...l] }; });
  async function arranger(u, c, facon) {
    const e = etendue(u);
    const sem = semaines.map((x, i) => ({ x, i })).filter(({ x, i }) => i >= e.de && i <= e.a && (x.type === 'cours' || (u.cours_pendant_conges && x.type === 'vacances'))).map(({ i }) => i);
    if (!sem.length) return;
    const date = (i, fin) => (fin ? semaines[i].date_fin || semaines[i].date_debut : semaines[i].date_debut);
    let acts;
    if (facon === 'parallele') acts = c.activites.map(a => ({ ...a, date_debut: date(sem[0]), date_fin: date(sem[sem.length - 1], true) }));
    else {
      const estEval = a => evalId != null && Number(a.activite_id) === Number(evalId);
      const evals = c.activites.filter(estEval);
      const dispo = evals.length ? sem.slice(0, -1) : sem;
      // Les étapes : une activité seule, ou le bloc des activités cochées (en parallèle).
      const cochees = new Set(coches[`${u.cle}#${c.cours_code}`] || []);
      const etapes = [];
      c.activites.forEach((a, k) => {
        if (estEval(a)) return;
        if (cochees.has(k)) {
          const bloc = etapes.find(e => e.parallele);
          if (bloc) bloc.membres.push(a); else etapes.push({ parallele: true, membres: [a] });
        } else etapes.push({ membres: [a] });
      });
      // La durée d'une étape suit ses périodes ; un bloc parallèle, celles de sa plus longue activité.
      const poids = e => Math.max(...e.membres.map(parEtudiant));
      const tot = etapes.reduce((t, e) => t + poids(e), 0) || 1;
      let curseur = 0;
      const places = new Map();
      etapes.forEach((e, n) => {
        const part = n === etapes.length - 1 ? dispo.length - curseur : Math.max(1, Math.round(dispo.length * poids(e) / tot));
        const de = Math.min(curseur, dispo.length - 1), fin = Math.min(dispo.length - 1, curseur + part - 1);
        e.membres.forEach(a => places.set(a, { de: dispo[de], fin: dispo[Math.max(de, fin)] })); curseur = fin + 1;
      });
      acts = c.activites.map(a => {
        if (estEval(a)) return { ...a, date_debut: date(sem[sem.length - 1]), date_fin: date(sem[sem.length - 1], true) };
        const p = places.get(a);
        return { ...a, date_debut: date(p.de), date_fin: date(p.fin, true) };
      });
    }
    await ecrireActivites(u, c, acts);
  }
  function gesteAct(ev, u, c, k, quoi) {
    if (!peutEcrire) return;
    ev.preventDefault(); ev.stopPropagation();
    const e = etendue(u), larg = (zone.current?.getBoundingClientRect().width || 1) / Math.max(1, NB);
    const s0 = spanAct(u, c, c.activites[k], k), x0 = ev.clientX;
    let courant = null;
    const mv = m => {
      const dc = Math.round((m.clientX - x0) / larg);
      if (!dc && !courant) return;
      let de = s0.de, a = s0.a;
      if (quoi === 'deplacer') { const d = Math.max(e.de - s0.de, Math.min(e.a - s0.a, dc)); de += d; a += d; }
      if (quoi === 'debut') de = Math.max(e.de, Math.min(s0.a, s0.de + dc));
      if (quoi === 'fin') a = Math.min(e.a, Math.max(s0.de, s0.a + dc));
      courant = { ue: u.cle, cours: c.cours_code, k, de, a }; setGlisseAct(courant);
    };
    const up = async () => {
      document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up);
      if (!courant) return;
      const acts = c.activites.map((a, i) => (i === k ? { ...a, date_debut: semaines[courant.de].date_debut, date_fin: semaines[courant.a].date_fin || semaines[courant.a].date_debut } : a));
      await ecrireActivites(u, c, acts);
      setGlisseAct(null);
    };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
  }

  const molette = e => { if (!e.ctrlKey) return; e.preventDefault(); const z = ['annee', 'couches', 'ue'], i = z.indexOf(zoom) + (e.deltaY < 0 ? 1 : -1); if (z[i] === 'ue' && !ueChoisie) return; if (z[i]) setZoom(z[i]); };

  return (
    <div className="space-y-3">
      {/* LES BOUTONS EN HAUT. */}
      <div className="flex flex-wrap items-center gap-2">
        <IconeLaboratoire size={26} className="text-iip-blue" />
        <b className="text-base text-iip-blue mr-2">Le laboratoire temporel</b>
        <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <select className="controle" value={bloc} onChange={e => setBloc(e.target.value)}>
          <option value="">Tous les blocs</option>
          {blocs.map(b => <option key={b} value={b}>{b}</option>)}
        </select>
        {face === 'temps' && <div className="segments flex h-9">
          {[['annee', 'L’année'], ['couches', 'Les couches'], ['ue', 'Une UE']].map(([k, l]) => (
            <button key={k} disabled={k === 'ue' && !ueChoisie} onClick={() => setZoom(k)}
              className={`px-3 text-second ${zoom === k ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'} disabled:opacity-40`}>{l}</button>))}
        </div>}
        {face === 'temps' && peutEcrire && data && (
          <button className="bouton" onClick={() => remplirDepuisAttributions(zoom === 'ue' && ueChoisie ? [ueChoisie.ue_num] : [...new Set(ues.filter(u => !u.stage).map(u => u.ue_num))])}
            title="Les activités, groupes et périodes déjà attribués remplissent les verres">
            {zoom === 'ue' && ueChoisie ? `Remplir le verre de l’UE ${ueChoisie.ue_num} depuis les attributions` : 'Remplir les verres depuis les attributions'}</button>)}
        {face === 'temps' && data && (() => {
          // LES COHORTES : dès qu'une UE du bloc est dédoublée. Sans bloc choisi, celui des UE dédoublées s'il n'y en a qu'un.
          const bl = [...new Set((data.ues || []).filter(u => u.nb_organisations > 1).map(u => String(u.ue_niv || '').toUpperCase()).filter(Boolean))];
          if (!bl.length) return null;
          const b = bloc || (bl.length === 1 ? bl[0] : '');
          return <button className="bouton" disabled={!b} onClick={() => setCohortes(b)} title={b ? `Placer les étudiants de ${b} dans les organisations de toutes les UE dédoublées` : 'Choisissez un bloc'}>Cohortes{b ? ` ${b}` : ''}</button>;
        })()}
        {face === 'temps' && peutEcrire && data && <>
          <button className="bouton" onClick={organisationDeBase} title="Lucie propose les dates de chaque UE d’après le schéma de capitalisation (prérequis), le quadrimestre et l’épreuve intégrée"><IconWand size={15} />Organisation de base</button>
          <button className="bouton" onClick={restaurerSauvegarde} title="Revenir à une sauvegarde du laboratoire"><IconHistory size={15} />Sauvegardes</button>
          <button className="bouton bouton-detruire" onClick={grandNettoyage} title="Sauvegarder, tout vider (la structure reste), puis réimporter depuis les attributions"><IconTrash size={15} />Grand nettoyage du labo</button>
        </>}
        <span className="text-second text-slate-500">{face !== 'temps' ? '' : zoom === 'ue' ? 'Glisser une activité dans un cours ; tirer le haut d’une couche ; double-clic : revenir à l’année.' : (zoom === 'couches' ? 'Glisser une barre la déplace, ses bords l’allongent ; « à la suite » ou « en parallèle » arrangent un cours d’un clic · double-clic : le verre.' : 'Ctrl + molette ou double-clic pour zoomer · glisser une tuile la déplace dans l’année, ses bords l’allongent.')}</span>
      </div>
      <RailLateral titre="Le laboratoire temporel" sections={[{ items: [['temps', 'Le temps', IconTimeline], ['groupes', 'Les groupes', IconPuzzle], ['planning', 'Le planning', IconCalendarCog], ['semaine', 'La semaine', IconCalendarWeek], ['disponibilites', 'Les disponibilités', IconUserCheck], ['schema', 'Schéma de capitalisation', IconSitemap]]
        .map(([k, l, I]) => ({ key: `labo-${k}`, label: l, icon: I, actif: face === k,
          onClick: () => { setFace(k); if ((k === 'groupes' || k === 'semaine') && !bloc && blocs[0]) setBloc(blocs.includes('BA2') ? 'BA2' : blocs[0]); } })) }]} />
      {erreur && <div className="text-second" style={{ color: 'var(--c-refuse)' }}>{erreur}</div>}
      {!data && !erreur && <div className="text-sm text-slate-400">Chargement…</div>}

      {face === 'groupes' && (bloc ? (
        <Suspense fallback={<div className="text-sm text-slate-400">Chargement…</div>}>
          <GroupesCommuns key={`${section}-${bloc}`} sectionImposee={section} blocImpose={bloc} dansLeLabo />
        </Suspense>) : <p className="text-sm text-slate-500">Choisissez un bloc : les groupes se font bloc par bloc.</p>)}
      {face === 'semaine' && (bloc ? (
        <Suspense fallback={<div className="text-sm text-slate-400">Chargement…</div>}>
          <SimulationAnnee key={`${section}-${bloc}`} section={section} bloc={bloc} annee={annee} peutEcrire={peutEcrire} versPlanning={() => setFace('planning')} />
        </Suspense>) : <p className="text-sm text-slate-500">Choisissez un bloc : la semaine se compose bloc par bloc.</p>)}

      {cohortes && (
        <Suspense fallback={null}>
          <CohortesBloc section={section} bloc={cohortes} annee={annee} peutEcrire={peutEcrire} onFermer={() => setCohortes(false)} />
        </Suspense>)}
      {face === 'planning' && (
        <Suspense fallback={<div className="text-sm text-slate-400">Chargement…</div>}>
          <PlanningEcole key={section} section={section} annee={annee} peutEcrire={peutEcrire} />
        </Suspense>)}
      {face === 'disponibilites' && (
        <Suspense fallback={<div className="text-sm text-slate-400">Chargement…</div>}>
          <DisponibilitesSection key={section} section={section} annee={annee} peutEcrire={peutEcrire} />
        </Suspense>)}
      {face === 'schema' && (
        <Suspense fallback={<div className="text-sm text-slate-400">Chargement…</div>}>
          <StructureSection key={section} annee={annee} sectionInitiale={section} />
        </Suspense>)}

      {face === 'temps' && data && zoom !== 'ue' && (
        <div className="carte p-3 overflow-x-auto" onWheel={molette}>
          <div className="min-w-[980px] relative">
            {/* Les mois, puis les semaines : cours numérotées, évaluations « É ». */}
            <Entete semaines={semaines} />
            <div ref={zone} className="relative" style={{ height: hautDePiste(pistes.n) + 4 }}>
              <div className="absolute inset-0 grid pointer-events-none" style={{ gridTemplateColumns: `repeat(${NB}, minmax(0,1fr))` }}>
                {semaines.map((s, i) => <div key={i} style={{ background: fondSemaine(s.type), boxShadow: stagesBloquants.some(x => i >= x.de && i <= x.a) ? 'inset 0 0 0 999px rgba(71,85,105,.08)' : undefined }} />)}
              </div>
              {ues.map(u => {
                const e = etendue(u), p = pistes.de.get(u.cle) || 0, h = hauteursPistes[p];
                return (
                  <TuileUE key={u.cle} u={u} zoom={zoom} choisie={choix === u.cle} posee={e.posee} pendantStage={pendantStage(u)}
                    style={{ left: `calc(${e.de / NB * 100}% + 1px)`, width: `calc(${(e.a - e.de + 1) / NB * 100}% - 2px)`, top: hautDePiste(p), height: h }}
                    couches={zoom === 'couches' ? couchesDe(u) : null} span={e} semaines={semaines} peutEcrire={peutEcrire}
                    onActivite={(ev, c, k, quoi) => gesteAct(ev, u, c, k, quoi)} onArranger={(c, f) => arranger(u, c, f)}
                    coches={coches} onCocher={(c, k) => basculerCoche(u, c, k)}
                    onDeplacer={ev => geste(ev, u, 'deplacer')} onDebut={ev => geste(ev, u, 'debut')} onFin={ev => geste(ev, u, 'fin')}
                    onOuvrir={() => {
                      /* LE DOUBLE-CLIC ZOOME (Charles, 10 octobre 2026) : l'année → les
                         couches → le verre ; dans le verre, il ramène à l'année. */
                      setChoix(u.cle);
                      setZoom(z => (z === 'annee' ? 'couches' : u.stage ? 'annee' : 'ue'));
                    }} />);
              })}
            </div>
          </div>
        </div>)}

      {/* L'AUTONOMIE DE LA SECTION, POUR L'ANNÉE : ce qui n'est pas encore dépensé, UE
          par UE, et ce qui a été mis de côté (avec son motif). Toute l'autonomie doit
          être dépensée dans la section et dans l'année. */}
      {face === 'temps' && data && zoom !== 'ue' && (() => {
        const lignes = ues.filter(u => !u.stage).map(u => {
          const aut = Number((u.cours || []).find(c => c.ue_autonomie != null)?.ue_autonomie) || 0;
          const prise = (u.cours || []).reduce((t, c) => t + (Number(c.autonomie_placee) || 0), 0);
          return { u, reste: arrondi(aut - prise), reservee: Number(u.autonomie_reservee) || 0 };
        }).filter(x => x.reste > 0);
        if (!lignes.length) return null;
        const total = arrondi(lignes.reduce((t, x) => t + x.reste, 0)), cote = arrondi(lignes.reduce((t, x) => t + Math.min(x.reste, x.reservee), 0));
        return (
          <div className="bloc-etat px-3 py-2 text-second" data-etat="surveiller">
            <b>Autonomie de la section non dépensée : {total} p.</b>{cote > 0 ? ` — dont ${cote} mises de côté volontairement` : ''}. Toute l’autonomie doit être dépensée dans la section et dans l’année.
            <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-slate-600">
              {lignes.map(x => <span key={x.u.cle} title={x.reservee ? `Mise de côté : ${x.u.autonomie_motif || ''}` : 'Pas encore décidée'}>{nomUE(x.u)} : {x.reste} p.{x.reservee ? ' (de côté)' : ''}</span>)}
            </div>
          </div>);
      })()}
      {face === 'temps' && data && zoom !== 'ue' && ueChoisie && (
        <ResumeUE u={ueChoisie} semaines={semaines} peutEcrire={peutEcrire} pendantStage={pendantStage(ueChoisie)}
          onStage={() => basculerStage(ueChoisie)} onConges={() => basculerConges(ueChoisie)} onOuvrir={() => setZoom('ue')}
          onDedoubler={() => dedoubler(ueChoisie)} onRetirerOrg={() => retirerOrganisation(ueChoisie)}
          blocs={blocs} onClasse={b => changerClasse(ueChoisie, b)} />)}

      {face === 'temps' && data && zoom === 'ue' && ueChoisie && (
        <Rangee ues={ues.filter(u => !u.stage)} rangee={rangee.includes(ueChoisie.cle) ? rangee : [...rangee, ueChoisie.cle]}
          setRangee={setRangee} actif={ueChoisie.cle} onChoisir={n => setChoix(n)} debut={debutRangee} setDebut={setDebutRangee} />)}
      {face === 'temps' && data && zoom === 'ue' && ueChoisie && (
        <Verre key={`${ueChoisie.cle}-${rev}`} u={ueChoisie} types={types} annee={annee} section={section}
          peutEcrire={peutEcrire} onRetour={() => setZoom('couches')} onAnnee={() => setZoom('annee')} onEnregistre={charger} />)}

      {face === 'temps' && <div className="flex flex-wrap gap-4 text-second text-slate-500">
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-pastille" style={{ background: fondSemaine('ev1') }} />évaluations</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-pastille border border-slate-200" style={{ background: fondSemaine('vacances') }} />vacances</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-pastille border border-dashed border-slate-400" />dates à poser</span>
        <span className="flex items-center gap-1.5"><i className="inline-block w-4 h-3 rounded-pastille border border-slate-300" style={{ background: HACHURE }} />périodes encore à remplir (le blanc du verre)</span>
      </div>}
    </div>
  );
}

/* DE L'UNI COLORÉ, PAS DE HACHURES (Charles, 10 octobre 2026 : « pas de lignes
   zébrées, je préfère de l'uni coloré »). */
// Ce qui reste à remplir est VIDE : pas de couleur (Charles, 10 octobre 2026 : « quand le verre est vide, il n'y a pas de couleur dedans »).
const HACHURE = '#fff';
const FOND_STAGE = 'color-mix(in srgb, #64748B 16%, var(--blanc))';
const fondSemaine = t => (t === 'ev1' || t === 'ev2' ? 'color-mix(in srgb, var(--c-attente, #B45309) 13%, transparent)'
  : t === 'cours' ? 'transparent' : 'color-mix(in srgb, rgb(var(--gris-500)) 9%, transparent)');

function Entete({ semaines }) {
  const NB = semaines.length;
  const mois = [];
  semaines.forEach((s, i) => { const m = String(s.date_debut).slice(0, 7); if (!mois.length || mois[mois.length - 1].m !== m) mois.push({ m, de: i }); });
  let n = 0;
  return (<>
    <div className="grid text-mention text-slate-500" style={{ gridTemplateColumns: `repeat(${NB}, minmax(0,1fr))` }}>
      {mois.map((m, i) => <div key={m.m} className="border-l border-slate-200 pl-1 truncate" style={{ gridColumn: `${m.de + 1} / ${(mois[i + 1]?.de ?? NB) + 1}` }}>{NOMS_MOIS[Number(m.m.slice(5, 7)) - 1]}</div>)}
    </div>
    <div className="grid text-mention text-slate-400 mb-1" style={{ gridTemplateColumns: `repeat(${NB}, minmax(0,1fr))` }}>
      {semaines.map((s, i) => <div key={i} className="text-center tabular-nums" title={s.label || s.type}>{s.type === 'cours' ? ++n : String(s.type).startsWith('ev') ? 'É' : ''}</div>)}
    </div>
  </>);
}

/* UNE TUILE PAR UE — la tuile de Lucie : blanche, liseré de la couleur de l'UE,
   texte à l'encre. Le stage est hachuré ; une UE sans dates, en pointillé. */
function TuileUE({ u, zoom, choisie, posee, pendantStage, style, onDeplacer, onDebut, onFin, onOuvrir, couches, span, semaines = [], peutEcrire, onActivite, onArranger, coches = {}, onCocher }) {
  /* LA TUILE SE COUPE AUX VACANCES (Charles, 10 octobre 2026) : pas de cours ces
     semaines-là, sauf si l'UE a décidé d'en donner (« faites sauter les congés »). */
  const n = span ? span.a - span.de + 1 : 1;
  const coupures = span && !u.cours_pendant_conges && !u.stage
    ? semaines.map((x, i) => ({ x, i })).filter(({ x, i }) => i >= span.de && i <= span.a && x.type !== 'cours' && !String(x.type).startsWith('ev')) : [];
  const teinte = teinteCours(`${u.ue_num}.1`);
  const dossier = (u.cours || []).reduce((t, c) => t + (Number(c.cours_per) || 0), 0);
  const remplies = arrondi((u.cours || []).reduce((t, c) => t + Math.min(Number(c.cours_per) || 0, sommeEtudiant(c)), 0));
  return (
    <div className="absolute rounded-r-tuile bg-white overflow-hidden select-none cursor-grab"
      style={{ ...style, borderLeft: `4px solid ${u.stage ? 'rgb(var(--gris-500))' : teinte}`, border: `1px ${posee ? 'solid' : 'dashed'} ${choisie ? 'var(--c-principal, #16406A)' : 'rgb(var(--gris-200))'}`,
        borderLeftWidth: 4, borderLeftStyle: 'solid', borderLeftColor: u.stage ? 'rgb(var(--gris-500))' : teinte,
        // La tuile est COLORÉE de son UE, pour se lire (Charles, 10 octobre 2026).
        background: u.stage ? FOND_STAGE : `color-mix(in srgb, ${teinte} 16%, var(--blanc))`,
        boxShadow: choisie ? '0 0 0 2px rgba(22,64,106,.25)' : undefined }}
      onPointerDown={onDeplacer} onDoubleClick={onOuvrir}
      title={`UE ${u.ue_num} — ${u.ue_nom}\n${u.nb_etudiants ?? '—'} étudiant(s)\n${dossier} périodes au dossier · ${remplies} posées dans la grille${posee ? '' : '\nDates à poser'}`}>
      {coupures.map(({ i }) => (
        <div key={`v${i}`} className="absolute top-0 bottom-0 z-0 pointer-events-none" title="Vacances : pas de cours"
          style={{ left: `calc(${(i - span.de) / n * 100}% - 4px)`, width: `calc(${100 / n}%)`, background: 'color-mix(in srgb, rgb(var(--gris-500)) 22%, var(--blanc))', borderLeft: '1px solid var(--blanc)', borderRight: '1px solid var(--blanc)' }} />))}
      <div className="absolute left-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-[color:var(--c-principal,_#16406A)]/20" onPointerDown={onDebut} />
      <div className="absolute right-0 top-0 bottom-0 w-2 cursor-ew-resize z-10 hover:bg-[color:var(--c-principal,_#16406A)]/20" onPointerDown={onFin} />
      <div className="relative z-[1] px-2 py-1 text-second leading-tight text-[color:var(--c-principal,_#1B2B4B)]">
        <div className="flex items-center gap-1.5 min-w-0">
          <b className="flex-none">{nomUE(u)}</b>
          <span className="truncate text-slate-600">{u.ue_nom}</span>
          {u.stage && u.stage_bloquant && <span className="flex-none px-1.5 rounded-pastille text-mention font-semibold text-white" style={{ background: 'rgb(var(--gris-600))' }}>bloquant</span>}
          {pendantStage && <span className="flex-none px-1.5 rounded-pastille text-mention font-semibold text-white" style={{ background: 'var(--c-refuse)' }} title="Cette UE a cours pendant un stage bloquant">pendant le stage</span>}
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-0.5">
          <span>{u.ue_niv} · {dossier} p. · {(u.cours || []).length} cours · <b title={u.etudiants_selon === 'groupes' ? 'Compté dans la répartition des groupes' : 'Compté dans les inscriptions'}>{u.nb_etudiants ?? '—'} étudiant{u.nb_etudiants === 1 ? '' : 's'}</b></span>
          {!posee && <span className="px-1.5 rounded-pastille text-mention font-semibold text-white" style={{ background: 'var(--c-attente)' }}>dates à poser</span>}
          {!u.stage && <span className="px-1.5 rounded-pastille text-mention font-semibold text-white" style={{ background: remplies >= dossier && dossier ? 'var(--c-reussi)' : 'var(--c-attente)' }}>
            {remplies >= dossier && dossier ? 'grille complète' : `grille : ${remplies}/${dossier}`}</span>}
        </div>
        {/* LES COUCHES, DANS LE TEMPS : une ligne par cours, ses activités en barres
            posées sur leurs semaines — on les glisse, on tire leurs bords. */}
        {couches && (
          <div className="mt-1">
            {couches.map(({ c, lignes }) => {
              const s = arrondi(sommeEtudiant(c)), dp = Number(c.cours_per) || 0, n = span.a - span.de + 1;
              return (
                <div key={c.cours_code}>
                  <div className="h-[15px] text-mention leading-[15px] flex gap-1.5">
                    <b>{c.cours_code}</b><span className="tabular-nums" style={{ color: s >= dp ? 'var(--c-reussi)' : 'var(--c-attente)' }}>{s}/{dp} p.</span>
                    {!(c.activites || []).length && <span className="text-slate-400">à découper — dans le verre</span>}
                    {peutEcrire && (c.activites || []).length > 1 && <>
                      <button className="ml-1 px-1.5 rounded-pastille border border-slate-300 bg-white text-mention leading-[13px] hover:border-[color:var(--c-principal,_#16406A)]"
                        onPointerDown={ev => ev.stopPropagation()} onDoubleClick={ev => ev.stopPropagation()} onClick={() => onArranger(c, 'suite')}
                        title="Enchaîner les activités dans l’ordre du verre, l’évaluation en dernier ; les activités cochées forment un bloc en parallèle">⇢ à la suite{(coches[`${u.cle}#${c.cours_code}`] || []).length > 1 ? ` (${(coches[`${u.cle}#${c.cours_code}`] || []).length} en parallèle)` : ''}</button>
                      <button className="px-1.5 rounded-pastille border border-slate-300 bg-white text-mention leading-[13px] hover:border-[color:var(--c-principal,_#16406A)]"
                        onPointerDown={ev => ev.stopPropagation()} onDoubleClick={ev => ev.stopPropagation()} onClick={() => onArranger(c, 'parallele')}
                        title="Toutes les activités sur toute la période de l’UE">⇉ en parallèle</button></>}
                  </div>
                  {(lignes.length ? lignes : [[]]).map((l, li) => (
                    <div key={li} className="relative h-[19px] -mx-2">
                      {l.map(x => (
                        <div key={x.k} onPointerDown={ev => onActivite(ev, c, x.k, 'deplacer')} onDoubleClick={ev => ev.stopPropagation()}
                          className={`absolute top-[2px] h-[15px] rounded-pastille px-1.5 text-mention leading-[15px] text-white truncate ${peutEcrire ? 'cursor-grab' : ''}`}
                          style={{ left: `calc(${(x.de - span.de) / n * 100}% + 1px)`, width: `calc(${(x.fin - x.de + 1) / n * 100}% - 2px)`,
                            background: x.act.activite_id && /valuation/i.test(x.act.activite_nom || '') ? 'var(--c-attente, #B45309)' : teinteCours(c.cours_code) }}
                          title={`${c.cours_code} — ${x.act.activite_nom || 'activité'} · ${arrondi(parEtudiant(x.act))} p. par étudiant${x.act.groupes > 1 ? `, ${x.act.groupes} groupes` : ''}\nGlisser : le déplacer ; tirer ses bords : l’allonger`}>
                          {peutEcrire && <span className="absolute left-0 top-0 bottom-0 w-1.5 cursor-ew-resize" onPointerDown={ev => onActivite(ev, c, x.k, 'debut')} />}
                          {peutEcrire && (c.activites || []).length > 1 && (
                            <input type="checkbox" className="align-[-2px] mr-1 w-[11px] h-[11px] accent-white cursor-pointer" title="En parallèle : « à la suite » met les activités cochées ensemble"
                              checked={(coches[`${u.cle}#${c.cours_code}`] || []).includes(x.k)}
                              onPointerDown={ev => ev.stopPropagation()} onDoubleClick={ev => ev.stopPropagation()} onChange={() => onCocher(c, x.k)} />)}
                          {x.act.activite_nom || 'activité'} · {arrondi(parEtudiant(x.act))} p.{x.act.groupes > 1 ? ` ×${x.act.groupes}` : ''}
                          {peutEcrire && <span className="absolute right-0 top-0 bottom-0 w-1.5 cursor-ew-resize" onPointerDown={ev => onActivite(ev, c, x.k, 'fin')} />}
                        </div>))}
                    </div>))}
                </div>);
            })}
          </div>)}
      </div>
    </div>
  );
}

/** Le nom d'une UE à l'écran : « UE 336 », « UE 336 · org 2 » quand elle est dédoublée. */
function nomUE(u) { return `${u.stage ? 'Stage' : 'UE'} ${u.ue_num}${u.nb_organisations > 1 ? ` · org ${u.num_organisation}` : ''}`; }

function ResumeUE({ u, semaines, peutEcrire, pendantStage, onStage, onConges, onOuvrir, onDedoubler, onRetirerOrg, blocs = [], onClasse }) {
  const dt = d => (d ? d.split('-').reverse().slice(0, 2).join('/') : '—');
  return (
    <div className="carte p-3 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <b className="text-sm text-iip-blue">{nomUE(u)} — {u.ue_nom}</b>
        <span className="flex-1" />
        {u.nb_organisations > 1 && (peutEcrire
          ? <label className="text-second text-slate-600 flex items-center gap-1" title="La classe où cette organisation se donne. UE 77 : org 1 en BA1 pour les nouveaux, org 2 en BA2 pour ceux de l'an dernier. La simulation la place dans l'horaire de cette classe.">
              Classe
              <select className="controle" value={u.bloc_propre || ''} onChange={e => onClasse(e.target.value)}>
                <option value="">{u.bloc_ue || '—'} (celle de l’UE)</option>
                {[...new Set([...blocs, 'BA1', 'BA2', 'BA3'])].filter(b => b !== u.bloc_ue).sort().map(b => <option key={b} value={b}>{b}</option>)}
              </select>
            </label>
          : u.bloc_propre && <span className="text-second text-slate-600">Classe {u.bloc_propre}</span>)}
        {peutEcrire && <button className="bouton" onClick={onDedoubler} title="Une organisation de plus, avec ses propres dates (deux demi-promotions)">Dédoubler</button>}
        {peutEcrire && u.nb_organisations > 1 && u.num_organisation === u.nb_organisations && <button className="bouton" onClick={onRetirerOrg}>Retirer l’org {u.num_organisation}</button>}
        {!u.stage && <button className="bouton bouton-fort" onClick={onOuvrir}>Ouvrir le verre de l’{nomUE(u)}</button>}
      </div>
      <div className="text-second text-slate-600">
        {u.planifiee ? `Du ${dt(u.date_debut)} au ${dt(u.date_fin)}` : 'Dates à poser : glissez la tuile, ou tirez ses bords'} · {u.ue_niv} · <b>{u.nb_etudiants ?? '—'} étudiant{u.nb_etudiants === 1 ? '' : 's'}</b> ({u.etudiants_selon === 'groupes' ? 'selon les groupes' : 'selon les inscriptions'}) ·{' '}
        {(u.cours || []).map(c => `${c.cours_code} : ${arrondi(sommeEtudiant(c))}/${c.cours_per}`).join(' · ')}
      </div>
      {u.stage && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!u.stage_bloquant} disabled={!peutEcrire} onChange={onStage} />
          Stage bloquant : aucun cours du bloc pendant ses semaines
        </label>)}
      {!u.stage && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!u.cours_pendant_conges} disabled={!peutEcrire} onChange={onConges} />
          Donner cours pendant les congés — la tuile n’est plus coupée aux vacances, et la simulation peut y placer des séances
        </label>)}
      {pendantStage && <div className="text-second" style={{ color: 'var(--c-refuse)' }}>Cette UE a cours pendant un stage bloquant : la simulation n’y placera rien ces semaines-là.</div>}
    </div>
  );
}

/* LA RANGÉE DE VERRES : de petits verres à la MÊME échelle, pour comparer ; on en
   ajoute, on en retire, on les glisse pour changer leur ordre, les flèches les
   font défiler ; un clic ouvre le verre en grand, dessous. */
const PAR_ECRAN = 5;
function Rangee({ ues, rangee, setRangee, actif, onChoisir, debut, setDebut }) {
  const [prise, setPrise] = useState(null);
  const liste = rangee.map(n => ues.find(u => u.cle === n)).filter(Boolean);
  const plein = u => (u.cours || []).reduce((t, c) => t + Math.max((Number(c.cours_per) || 0) + (Number(c.autonomie_placee) || 0), sommeEtudiant(c)), 0);
  const max = Math.max(1, ...liste.map(plein));
  const px = 150 / max;
  const d = Math.max(0, Math.min(debut, Math.max(0, liste.length - PAR_ECRAN)));
  const vus = liste.slice(d, d + PAR_ECRAN);
  const deplacer = (de, vers) => { const l = [...rangee]; const [x] = l.splice(de, 1); l.splice(vers, 0, x); setRangee(l); };
  return (
    <div className="carte p-3">
      <div className="flex items-center gap-2 mb-2 flex-wrap">
        <b className="text-sm text-iip-blue">Verres côte à côte</b>
        <span className="text-second text-slate-500">même échelle pour comparer · glisser un verre change l’ordre · clic : l’ouvrir dessous</span>
        <span className="flex-1" />
        <select className="controle !h-8 text-second" value="" onChange={e => { const n = e.target.value; if (n) setRangee([...rangee, n]); }}>
          <option value="">+ Ajouter une UE…</option>
          {ues.filter(u => !rangee.includes(u.cle)).map(u => <option key={u.cle} value={u.cle}>{nomUE(u)} — {String(u.ue_nom || '').slice(0, 40)}</option>)}
        </select>
        <button className="bouton !h-8" onClick={() => setRangee(ues.map(u => u.cle))}>Toutes les UE du bloc</button>
      </div>
      <div className="flex items-end gap-2">
        <button className="bouton !h-8 !px-2 self-center" disabled={d <= 0} onClick={() => setDebut(d - 1)}>◀</button>
        <div className="flex-1 grid gap-3" style={{ gridTemplateColumns: `repeat(${PAR_ECRAN}, minmax(0,1fr))` }}>
          {vus.map((u, i) => {
            const idx = d + i;
            return (
              <div key={u.cle} draggable onDragStart={() => setPrise(idx)} onDragOver={e => e.preventDefault()}
                onDrop={() => { if (prise != null && prise !== idx) deplacer(prise, idx); setPrise(null); }}
                onClick={() => onChoisir(u.cle)}
                className={`relative flex flex-col items-center gap-1 rounded-tuile p-1.5 cursor-pointer ${u.cle === actif ? 'bg-[color:var(--c-principal,_#16406A)]/10 ring-2 ring-[color:var(--c-principal,_#16406A)]/40' : 'hover:bg-slate-50'}`}>
                <button className="absolute right-1 top-0.5 text-slate-400 hover:text-slate-700 text-sm" title="Retirer de la rangée"
                  onClick={ev => { ev.stopPropagation(); setRangee(rangee.filter(n => n !== u.cle)); }}>×</button>
                {/* Les fonds alignés : le verre se pose au bas d'une hauteur commune. */}
                <div className="h-[156px] flex items-end justify-center"><VerreMini u={u} px={px} /></div>
                <b className="text-second">{nomUE(u)}</b>
                <span className="text-mention text-slate-600 tabular-nums">{u.nb_etudiants ?? '—'} étudiant{u.nb_etudiants === 1 ? '' : 's'}</span>
                <span className="text-mention text-slate-500 text-center leading-tight line-clamp-2">{u.ue_nom}</span>
              </div>);
          })}
        </div>
        <button className="bouton !h-8 !px-2 self-center" disabled={d + PAR_ECRAN >= liste.length} onClick={() => setDebut(d + 1)}>▶</button>
      </div>
    </div>
  );
}
function VerreMini({ u, px }) {
  return (
    <div className="w-[96px] flex flex-col-reverse p-[2px] rounded-b-carte border-2 border-t-0" style={{ borderColor: 'var(--c-principal, #16406A)', background: '#EEF3F9' }}>
      {(u.cours || []).map(c => {
        const dp = Number(c.cours_per) || 0, aut = Number(c.autonomie_placee) || 0, s = sommeEtudiant(c), manque = dp + aut - s;
        return (
          <div key={c.cours_code} className="flex flex-col-reverse border-t border-dashed border-slate-400" style={{ height: Math.max(dp + aut, s) * px }} title={`${c.cours_code} : ${arrondi(s)}/${dp} p.`}>
            {(c.activites || []).map((a, k) => (
              <div key={k} className="flex gap-px flex-none border-t border-white" style={{ height: parEtudiant(a) * px }}>
                {Array.from({ length: Math.min(12, a.groupes || 1) }, (_, g) => (
                  <div key={g} className="flex-1" style={{ background: k % 2 ? `color-mix(in srgb, ${teinteCours(c.cours_code)} 72%, var(--blanc))` : teinteCours(c.cours_code) }} />))}
              </div>))}
            {manque > 0 && <div className="flex-none" style={{ height: manque * px, background: HACHURE }} />}
          </div>);
      })}
    </div>
  );
}

/* LE VERRE — au dernier zoom seulement. On le remplit par glisser-déposer. */
function Verre({ u, types, annee, section, peutEcrire, onRetour, onAnnee, onEnregistre }) {
  const [cours, setCours] = useState(() => (u.cours || []).map(c => ({ ...c, activites: (c.activites || []).map(a => ({ ...a, groupes: Math.max(1, Number(a.groupes) || 1) })) })));
  const [choix, setChoix] = useState(null);           // { c, k }
  const [modifies, setModifies] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);
  const [cible, setCible] = useState(null);
  /* LA BARRE NE PORTE QUE LES ACTIVITÉS COURANTES : la liste de la maison en
     compte soixante-dix, rôles administratifs compris. Les autres se tirent
     d'un menu et rejoignent la barre le temps du travail. */
  const COURANTES = /^(théorie|exercices|travaux pratiques|laboratoire|stage|séminaire|clinique|atelier)\b/i;
  const [ajoutees, setAjoutees] = useState([]);
  const barre = types.filter(t => (COURANTES.test(t.libelle || '') && !t.section) || ajoutees.includes(String(t.id)))
    .concat(types.filter(t => t.role === 'evaluation').slice(0, 1))
    .filter((t, i, l) => l.findIndex(x => x.id === t.id) === i);
  /* LA BURETTE DE L'UE (Charles, 10 octobre 2026) : l'autonomie que le dossier
     donne à l'unité, pleine au départ, qui se vide quand un cours en prend pour
     contenir ce qui déborde. La capacité d'un cours, c'est ses périodes du
     dossier plus l'autonomie qu'il a prise (grille_cours.autonomie_placee). */
  const autonomieUE = Number((u.cours || []).find(c => c.ue_autonomie != null)?.ue_autonomie) || 0;
  const autonomiePrise = cours.reduce((t, c) => t + (Number(c.autonomie_placee) || 0), 0);
  const autonomieReste = arrondi(autonomieUE - autonomiePrise);
  const capacite = c => (Number(c.cours_per) || 0) + (Number(c.autonomie_placee) || 0);
  const total = cours.reduce((t, c) => t + Math.max(capacite(c), sommeEtudiant(c)), 0);
  const PX = Math.max(2.4, Math.min(5, 560 / Math.max(1, total)));
  /* LA BURETTE SE VIDE TOUTE SEULE (Charles, 10 octobre 2026 : « si on dépasse le
     verre, il faut dire : attention, je dois prendre des heures d'autonomie ; et si
     on augmente, automatiquement la burette se vide »). Après chaque geste, ce qui
     dépasse le dossier se prend dans l'autonomie de l'UE, autant qu'il en reste ;
     quand le cours redescend, la burette se remplit d'autant. */
  const [avis, setAvis] = useState(null);
  // À l'ouverture, un cours qui déborde déjà puise aussitôt dans la burette (et le dit).
  useEffect(() => {
    cours.forEach((c, ci) => {
      const besoin = Math.max(0, arrondi(sommeEtudiant(c) - (Number(c.cours_per) || 0)));
      if (besoin > (Number(c.autonomie_placee) || 0)) changer(ci, x => x);
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const changer = (ci, f) => {
    setCours(cs => {
      const next = cs.map((c, i) => (i === ci ? f(c) : c));
      const c = next[ci], avant = Number(cs[ci]?.autonomie_placee) || 0;
      const autres = next.reduce((t, x, i) => t + (i === ci ? 0 : Number(x.autonomie_placee) || 0), 0);
      const besoin = Math.max(0, arrondi(sommeEtudiant(c) - (Number(c.cours_per) || 0)));
      const prise = arrondi(Math.min(besoin, Math.max(0, autonomieUE - autres)));
      /* QUAND IL N'Y EN A PLUS, IL N'Y EN A PLUS (Charles, 10 octobre 2026) : un
         geste qui ferait déborder le cours au-delà de la burette est refusé. Seul un
         cours qui déborde déjà (enregistré ainsi) reste tel quel, signalé. */
      const avantBesoin = Math.max(0, arrondi(sommeEtudiant(cs[ci]) - (Number(cs[ci].cours_per) || 0)));
      if (besoin > prise && besoin > avantBesoin) {
        const dispo = arrondi(Math.max(0, autonomieUE - autres));
        setAvis(dispo > 0 ? `La burette de l’UE n’a que ${dispo} p. : ${c.cours_code} ne peut pas dépasser ${arrondi((Number(c.cours_per) || 0) + prise)} p.`
          : `La burette de l’UE est vide : ${c.cours_code} ne peut pas dépasser ${arrondi((Number(c.cours_per) || 0) + prise)} p.`);
        return cs;
      }
      next[ci] = { ...c, autonomie_placee: prise };
      if (prise > avant) setAvis(`Attention : ${c.cours_code} dépasse son verre — je prends ${prise} p. d’autonomie dans la burette de l’UE.${besoin > prise ? ` Il en manque encore ${arrondi(besoin - prise)} : la burette est vide.` : ''}`);
      else if (prise < avant) setAvis(`${c.cours_code} redescend : ${arrondi(avant - prise)} p. d’autonomie retournent dans la burette.`);
      else if (besoin > prise) setAvis(`Attention : ${c.cours_code} dépasse son verre de ${arrondi(besoin - prise)} p. et la burette de l’UE est vide.`);
      return next;
    });
    setModifies(m => new Set(m).add(ci));
  };
  const teinteCouche = (c, k) => { const base = teinteCours(c.cours_code); return k % 2 ? `color-mix(in srgb, ${base} 72%, var(--blanc))` : base; };

  /* L'AUTONOMIE NE SE PERD PAS EN SILENCE (Charles, 10 octobre 2026). À
     l'enregistrement, s'il en reste dans la burette, on décide — dans l'UE, à qui
     elle appartient : la répartir sur ses activités, en faire une activité, ou la
     mettre de côté volontairement, avec un motif. Le laboratoire montre ce qui est
     mis de côté au niveau de la section. */
  const recalerAutonomie = liste => {
    let dispo = autonomieUE;
    return liste.map(c => {
      const besoin = Math.max(0, arrondi(sommeEtudiant(c) - (Number(c.cours_per) || 0)));
      const prise = arrondi(Math.min(besoin, Math.max(0, dispo))); dispo -= prise;
      return { ...c, autonomie_placee: prise };
    });
  };
  async function enregistrer() {
    let liste = cours, aEcrire = new Set(modifies), reserve = null;
    if (autonomieReste > 0) {
      const v = await choisir({ titre: `${nomUE(u)} — autonomie non utilisée`,
        message: `Vous n’avez pas utilisé toute l’autonomie de cette UE : il reste ${autonomieReste} p. dans la burette. Toute l’autonomie doit être dépensée. Que fait-on de ce reste ?`,
        choix: [
          { valeur: 'repartir', libelle: 'La répartir sur les activités de l’UE', aide: 'Chaque activité grandit au prorata de ses périodes.' },
          { valeur: 'activite', libelle: 'En faire une activité de l’UE', aide: 'Une remédiation, par exemple, dans le cours de votre choix.' },
          { valeur: 'reserver', libelle: 'La mettre de côté, volontairement', aide: 'Elle reste rattachée à l’UE ; le laboratoire la montre au niveau de la section. Un motif est demandé.' },
        ] });
      if (!v) return;
      if (v === 'repartir') {
        const tot = cours.reduce((t, c) => t + sommeEtudiant(c), 0) || 1;
        let donne = 0, plusGrande = null;
        liste = cours.map((c, ci) => ({ ...c, activites: c.activites.map((a, k) => {
          const p = parEtudiant(a), plus = Math.floor(autonomieReste * p / tot * 2) / 2;
          donne += plus;
          if (!plusGrande || p > plusGrande.p) plusGrande = { ci, k, p };
          return { ...a, periodes: (p + plus) * (a.groupes || 1) };
        }) }));
        // Ce que les arrondis laissent va à la plus grande activité : la burette se vide exactement.
        const solde = arrondi(autonomieReste - donne);
        if (solde > 0 && plusGrande) {
          const a = liste[plusGrande.ci].activites[plusGrande.k];
          liste[plusGrande.ci].activites[plusGrande.k] = { ...a, periodes: (parEtudiant(a) + solde) * (a.groupes || 1) };
        }
        liste = recalerAutonomie(liste);
        cours.forEach((_, i) => aEcrire.add(i));
      } else if (v === 'activite') {
        const ci = cours.length === 1 ? 0 : await choisir({ titre: 'Dans quel cours ?', message: `L’activité prendra ${autonomieReste} p.`,
          choix: cours.map((c, i) => ({ valeur: i, libelle: `${c.cours_code} — ${String(c.cours_nom || '').slice(0, 50)}` })) });
        if (ci == null) return;
        const t = types.find(x => /remédiation|remediation/i.test(x.libelle || '')) || types[0];
        liste = recalerAutonomie(cours.map((c, i) => (i !== Number(ci) ? c : { ...c,
          activites: [...c.activites, { activite_id: t?.id, activite_nom: t?.libelle || 'Remédiation', periodes: autonomieReste, groupes: 1, vu_etudiant: 1 }] })));
        aEcrire.add(Number(ci));
      } else {
        const motif = await saisir({ titre: 'Mettre l’autonomie de côté', message: `Pourquoi met-on ${autonomieReste} p. d’autonomie de côté ?`, obligatoire: true, multiligne: true });
        if (!motif) return;
        reserve = { autonomie_reservee: autonomieReste, autonomie_motif: motif };
      }
      setCours(liste);
    } else if (Number(u.autonomie_reservee) > 0) reserve = { autonomie_reservee: 0 };
    setEnCours(true);
    try {
      if (reserve) {
        const r = await fetch('/api/grille/ue', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee_scolaire: annee, section, ue_num: u.ue_num, num_organisation: u.num_organisation || 1, ...reserve }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      }
      for (const ci of aEcrire) {
        const c = liste[ci];
        const r = await fetch('/api/grille/cours', { method: 'PUT', headers: authHeaders(), body: JSON.stringify({
          annee_scolaire: annee, section, ue_num: u.ue_num, num_organisation: u.num_organisation || 1, cours_code: c.cours_code,
          date_debut: c.date_debut || null, date_fin: c.date_fin || null, autonomie_placee: c.autonomie_placee || 0, evaluation_mode: c.evaluation_mode || 'examen',
          activites: c.activites.map(a => ({ activite_id: a.activite_id, periodes: a.periodes, groupes: a.groupes, vu_etudiant: a.vu_etudiant !== 0,
            date_debut: a.date_debut || null, date_fin: a.date_fin || null })) }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
        if (j.repli?.applique) await informer(`${c.cours_code} : un cours ne s’enregistre pas vide — il revient à son contenu du dossier, ${j.repli.periodes} périodes de matière.`);
      }
      setModifies(new Set());
      await onEnregistre();
    } catch (e) { await informer(`❌ ${e.message}`); } finally { setEnCours(false); }
  }

  /* GLISSER UNE ACTIVITÉ POSE LES QUESTIONS DANS L'ORDRE (Charles, 10 octobre
     2026) : réduit-elle la précédente ? de combien ? sinon, quelle place prend-
     elle ? et si le verre déborde, prend-on de l'autonomie dans l'UE ? combien ? */
  async function deposer(ci, typeId) {
    const t = types.find(x => String(x.id) === String(typeId));
    if (!t) return;
    const c = cours[ci], g = estGroupes(t.libelle) ? 4 : 1;
    const cap = capacite(c), s = sommeEtudiant(c), libre = arrondi(cap - s);
    const prev = c.activites[c.activites.length - 1], pPrev = prev ? arrondi(parEtudiant(prev)) : 0;
    const titre = `${t.libelle} dans ${c.cours_code}`;
    let reduire = false;
    if (prev) {
      reduire = await demander({ titre, message: `Cette activité réduit-elle la place de la précédente (« ${prev.activite_nom || 'activité'} », ${pPrev} p.) ?`,
        confirmer: 'Oui, elle la réduit', annuler: 'Non, elle s’ajoute' });
    }
    const brut = await saisir({ titre, valeur: String(reduire ? Math.max(1, Math.round(pPrev / 2)) : Math.max(1, libre > 0 ? libre : 4)),
      message: reduire ? `Quelle place prend-elle, en périodes par étudiant ? « ${prev.activite_nom || 'activité'} » en a ${pPrev}.`
        : `Combien de périodes par étudiant prend-elle ? ${libre > 0 ? `Il reste ${libre} p. dans le cours.` : 'Le cours est déjà plein.'}` });
    if (brut == null) return;
    const x = arrondi(Number(String(brut).replace(',', '.')));
    if (!(x > 0)) { await informer('Il faut un nombre de périodes plus grand que zéro.'); return; }
    if (reduire && x >= pPrev) { await informer(`« ${prev.activite_nom || 'activité'} » n’a que ${pPrev} p. : la nouvelle activité ne peut pas prendre toute sa place — retirez plutôt la précédente.`); return; }
    changer(ci, cc => ({ ...cc,
      activites: [...cc.activites.map((a, i) => (reduire && i === cc.activites.length - 1 ? { ...a, periodes: (parEtudiant(a) - x) * (a.groupes || 1) } : a)),
        { activite_id: t.id, activite_nom: t.libelle, periodes: x * g, groupes: g, vu_etudiant: 1 }] }));
    setChoix({ c: ci, k: c.activites.length });
  }
  function tirer(ev, ci, k) {
    if (!peutEcrire) return;
    ev.preventDefault(); ev.stopPropagation();
    const a0 = cours[ci].activites[k], y0 = ev.clientY, p0 = parEtudiant(a0);
    const mv = e => { const p = Math.max(1, Math.round(p0 + (y0 - e.clientY) / PX)); changer(ci, c => ({ ...c, activites: c.activites.map((a, i) => (i === k ? { ...a, periodes: p * a.groupes } : a)) })); };
    const up = () => { document.removeEventListener('pointermove', mv); document.removeEventListener('pointerup', up); };
    document.addEventListener('pointermove', mv); document.addEventListener('pointerup', up);
    setChoix({ c: ci, k });
  }
  const act = choix ? cours[choix.c]?.activites[choix.k] : null;
  const regler = f => changer(choix.c, c => ({ ...c, activites: c.activites.map((a, i) => (i === choix.k ? f(a) : a)) }));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="bouton" onClick={onRetour}>← Les couches</button>
        <b className="text-sm text-iip-blue">{nomUE(u)}</b><span className="text-second text-slate-500 truncate">{u.ue_nom}</span>
        <span className="text-second text-slate-600 flex-none"><b>{u.nb_etudiants ?? '—'}</b> étudiant{u.nb_etudiants === 1 ? '' : 's'}</span>
        <span className="flex-1" />
        {peutEcrire && <button className="bouton bouton-fort" disabled={(!modifies.size && !(autonomieReste > 0 && !(Number(u.autonomie_reservee) >= autonomieReste))) || enCours} onClick={enregistrer}>
          {enCours ? 'Enregistrement…' : modifies.size ? `Enregistrer (${modifies.size} cours)` : autonomieReste > 0 && !(Number(u.autonomie_reservee) >= autonomieReste) ? 'Décider de l’autonomie restante' : 'Enregistré'}</button>}
      </div>
      {peutEcrire && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-second text-slate-500 font-semibold">Glisser dans un cours :</span>
          {barre.map(t => (
            <span key={t.id} draggable onDragStart={e => e.dataTransfer.setData('text/plain', String(t.id))}
              className="controle !h-8 inline-flex items-center gap-1.5 cursor-grab bg-white text-second">
              <i className="inline-block w-2.5 h-2.5 rounded-pastille" style={{ background: t.role === 'evaluation' ? 'var(--c-attente, #B45309)' : estGroupes(t.libelle) ? 'var(--c-disponible, #2F6FB0)' : 'var(--c-principal, #16406A)' }} />{t.libelle}</span>))}
          <select className="controle !h-8 text-second max-w-[16rem]" value="" onChange={e => e.target.value && setAjoutees(a => [...a, e.target.value])}>
            <option value="">Autre activité…</option>
            {types.filter(t => !barre.some(x => x.id === t.id)).map(t => <option key={t.id} value={t.id}>{t.libelle}</option>)}
          </select>
        </div>)}
      {/* TOUTE L'AUTONOMIE DOIT ÊTRE DÉPENSÉE DANS L'UE (Charles, 10 octobre 2026). */}
      {autonomieReste > 0 && (
        <div className="bloc-etat px-3 py-2 text-sm" data-etat="surveiller">
          Il reste <b>{autonomieReste} p.</b> d’autonomie dans la burette : toute l’autonomie de l’UE doit être dépensée — agrandissez une activité, ajoutez-en une, ou « Vider la burette dans cette activité ».
        </div>)}
      {avis && (
        <div className="bloc-etat px-3 py-2 text-sm flex items-center gap-2" data-etat={/^Attention/.test(avis) ? 'surveiller' : 'neutre'}>
          <span className="flex-1">{avis}</span><button className="text-slate-400 hover:text-slate-700" onClick={() => setAvis(null)} title="Fermer">×</button>
        </div>)}
      <div className="grid gap-3" style={{ gridTemplateColumns: 'minmax(0,1fr) 300px' }}>
        <div className="carte p-4 overflow-x-auto flex gap-2 items-end" onDoubleClick={onAnnee} title="Double-clic : revenir à l’année">
          {/* LA BURETTE : l'autonomie de l'UE, pleine au départ ; elle se vide quand un cours en prend. */}
          <div className="flex-none flex flex-col items-center gap-1 mr-2" title={`Autonomie de l’UE : ${autonomieUE} p. au dossier, ${arrondi(autonomiePrise)} prise(s), ${autonomieReste} restante(s)`}>
            <span className="text-mention text-slate-500 text-center leading-tight w-[64px]">autonomie<br />de l’UE</span>
            <div className="relative w-[26px] rounded-b-tuile border-2 border-t-0 overflow-hidden" style={{ height: Math.max(40, autonomieUE * PX), borderColor: 'var(--c-principal, #16406A)', background: 'var(--blanc)' }}>
              <div className="absolute left-0 right-0 bottom-0" style={{ height: `${autonomieUE ? Math.max(0, autonomieReste) / autonomieUE * 100 : 0}%`, background: `color-mix(in srgb, ${teinteCours(`${u.ue_num}.1`)} 70%, var(--blanc))` }} />
            </div>
            <b className="text-second tabular-nums" style={{ color: autonomieReste < 0 ? 'var(--c-refuse)' : 'var(--c-principal, #1B2B4B)' }}>{autonomieUE ? `${autonomieReste}/${autonomieUE}` : '0'}</b>
            <span className="text-mention text-slate-400">{autonomieUE ? 'p. restantes' : 'aucune au dossier'}</span>
            {autonomieReste > 0 && <span className="text-mention font-semibold text-center leading-tight w-[70px]" style={{ color: 'var(--c-attente)' }}>à dépenser dans l’UE</span>}
          </div>
          {/* La graduation, tous les 10 périodes. */}
          <div className="relative w-8 flex-none" style={{ height: total * PX + 8 }}>
            {Array.from({ length: Math.floor(total / 10) + 1 }, (_, i) => (
              <span key={i} className="absolute right-1 text-mention text-slate-400 tabular-nums" style={{ bottom: i * 10 * PX + 4, transform: 'translateY(50%)' }}>{i * 10}</span>))}
          </div>
          <div className="flex items-end">
            {/* LE VERRE EST PLEIN JUSQU'AU BORD (Charles, 10 octobre 2026 : « moche ») : son
                contenu épouse le fond arrondi, sans liseré ; les étiquettes vivent à côté. */}
            <div className="relative w-[440px] flex flex-col-reverse overflow-hidden rounded-b-panneau border-[3px] border-t-0" style={{ borderColor: 'var(--c-principal, #16406A)', background: 'var(--blanc)' }}>
              {cours.map((c, ci) => {
                const s = sommeEtudiant(c), dp = Number(c.cours_per) || 0, aut = Number(c.autonomie_placee) || 0, manque = arrondi(dp + aut - s);
                return (
                  <div key={c.cours_code} className="relative flex flex-col-reverse border-t-2 border-dashed border-slate-400"
                    style={{ height: Math.max(dp + aut, s) * PX, outline: cible === ci ? '3px solid #16406A' : undefined, outlineOffset: -3 }}
                    onDragOver={e => { if (peutEcrire) { e.preventDefault(); setCible(ci); } }} onDragLeave={() => setCible(null)}
                    onDrop={e => { e.preventDefault(); setCible(null); deposer(ci, e.dataTransfer.getData('text/plain')); }}>
                    {c.activites.map((a, k) => {
                      const p = parEtudiant(a), col = teinteCouche(c, k), on = choix && choix.c === ci && choix.k === k;
                      return (
                        <div key={k} className="relative flex-none flex gap-px border-t border-white cursor-pointer" style={{ height: p * PX }} onClick={() => setChoix({ c: ci, k })}>
                          {Array.from({ length: a.groupes }, (_, g) => (
                            <div key={g} className="flex-1 min-w-0 flex items-center justify-center gap-1 overflow-hidden whitespace-nowrap text-white text-xs font-semibold"
                              style={{ background: col, boxShadow: on ? 'inset 0 0 0 2px #16406A' : undefined }} title={`${a.activite_nom || 'activité'} — ${arrondi(p)} p. par étudiant${a.groupes > 1 ? ` · groupe ${lettre(g)}` : ''}`}>
                              {a.groupes > 1 ? <span className="bg-white text-[#16253D] rounded-pastille px-1 text-mention">{lettre(g)}</span> : (p * PX > 13 ? `${a.activite_nom || 'activité'} · ${arrondi(p)} p.` : '')}
                            </div>))}
                          {peutEcrire && <div className="absolute left-0 right-0 -top-[3px] h-[7px] cursor-ns-resize z-10 hover:bg-[color:var(--c-principal,_#16406A)]/30" onPointerDown={e => tirer(e, ci, k)} title="Tirer : les périodes" />}
                        </div>);
                    })}
                    {manque > 0 && <div className="flex-none flex items-center justify-center text-xs font-semibold" style={{ height: manque * PX, background: HACHURE, color: 'var(--c-attente)' }}>{manque * PX > 12 ? `à remplir · ${manque} p.` : ''}</div>}
                  </div>);
              })}
            </div>
            {/* Les étiquettes des cours, en face de leur couche. */}
            <div className="flex flex-col-reverse w-[220px] pl-3 self-stretch justify-start">
              {cours.map(c => {
                const s = sommeEtudiant(c), dp = Number(c.cours_per) || 0, aut = Number(c.autonomie_placee) || 0, manque = arrondi(dp + aut - s);
                return (
                  <div key={c.cours_code} className="relative flex-none" style={{ height: Math.max(dp + aut, s) * PX }}>
                    <div className="absolute bottom-0 left-0 text-second leading-tight w-[205px]">
                      <b className="block text-sm">{c.cours_code}</b>
                      <span className="text-slate-600">{String(c.cours_nom || '').slice(0, 60)}</span><br />
                      <span className="font-semibold" style={{ color: manque === 0 ? 'var(--c-reussi)' : manque > 0 ? 'var(--c-attente)' : 'var(--c-refuse)' }}>
                        {arrondi(s)} / {dp} p.{aut ? ` (+${aut} d’autonomie)` : ''}{manque > 0 ? ` — il en manque ${manque}` : manque < 0 ? ` — ${-manque} de trop` : ' — complet'}</span>
                    </div>
                  </div>);
              })}
            </div>
          </div>
        </div>
        <aside className="carte p-3 space-y-2 self-start text-sm">
          {!act ? <p className="text-slate-500">Cliquez une couche du verre pour la régler. Glissez une activité de la barre dans un cours pour en ajouter une.</p> : (<>
            <b className="text-iip-blue">{cours[choix.c].cours_code} — {act.activite_nom || 'activité'}</b>
            <label className="grid gap-1 text-second text-slate-500">Activité
              <select className="controle w-full min-w-0" disabled={!peutEcrire} value={act.activite_id || ''} onChange={e => { const t = types.find(x => String(x.id) === e.target.value); regler(a => ({ ...a, activite_id: t?.id, activite_nom: t?.libelle })); }}>
                {types.map(t => <option key={t.id} value={t.id}>{t.libelle}</option>)}
              </select></label>
            <label className="grid gap-1 text-second text-slate-500">Périodes par étudiant
              <input type="number" min="1" className="controle" disabled={!peutEcrire} value={arrondi(parEtudiant(act))}
                onChange={e => { const p = Math.max(1, Number(e.target.value) || 1); regler(a => ({ ...a, periodes: p * a.groupes })); }} /></label>
            <div className="text-second text-slate-500">Groupes
              <div className="flex items-center gap-2 mt-1">
                <button className="bouton !h-8" disabled={!peutEcrire || act.groupes <= 1} onClick={() => regler(a => ({ ...a, periodes: parEtudiant(a) * (a.groupes - 1), groupes: a.groupes - 1 }))}>−</button>
                <b className="text-sm text-[color:var(--c-principal,_#1B2B4B)] tabular-nums">{act.groupes}</b>
                <button className="bouton !h-8" disabled={!peutEcrire || act.groupes >= 30} onClick={() => regler(a => ({ ...a, periodes: parEtudiant(a) * (a.groupes + 1), groupes: a.groupes + 1 }))}>+</button>
                <span>{act.groupes > 1 ? `blocs ${Array.from({ length: act.groupes }, (_, g) => lettre(g)).join(', ')}` : 'tout le bloc ensemble'}</span>
              </div></div>
            <div className="text-second text-slate-500">Côté enseignant : {arrondi(Number(act.periodes) || 0)} période(s), tous groupes confondus.</div>
            {(() => {
              const c = cours[choix.c], reste = arrondi(capacite(c) - sommeEtudiant(c));
              return peutEcrire && (<div className="flex flex-wrap gap-2">
                <button className="bouton" disabled={reste <= 0} title="L’activité prend toute la place restante du cours"
                  onClick={() => regler(a => ({ ...a, periodes: (parEtudiant(a) + reste) * (a.groupes || 1) }))}>Tout remplir{reste > 0 ? ` (+${reste} p.)` : ''}</button>
                <button className="bouton" disabled={autonomieReste <= 0} title="L’activité prend tout ce qui reste d’autonomie dans la burette de l’UE"
                  onClick={() => regler(a => ({ ...a, periodes: (parEtudiant(a) + Math.max(0, reste) + autonomieReste) * (a.groupes || 1) }))}>
                  Vider la burette dans cette activité{autonomieReste > 0 ? ` (+${autonomieReste} p.)` : ''}</button>

              </div>);
            })()}
            {peutEcrire && <button className="bouton bouton-detruire" onClick={() => { changer(choix.c, c => ({ ...c, activites: c.activites.filter((_, i) => i !== choix.k) })); setChoix(null); }}>Retirer cette couche</button>}
          </>)}
          <div className="text-xs text-slate-400 pt-1 border-t border-slate-100">Les disponibilités des enseignants se saisissent dans la face « Les disponibilités » du laboratoire ; la simulation en tient compte.</div>
        </aside>
      </div>
    </div>
  );
}
