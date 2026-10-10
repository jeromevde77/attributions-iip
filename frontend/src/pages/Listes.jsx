import { useState, useEffect } from 'react';
import { selectionEtudiants } from '../lib/selectionEtudiants.js';
import { peutGeste } from '../lib/droits.js';
import { useNavigate } from 'react-router-dom';
import { api, getAnnee, nomDoc, getUser } from '../lib/api.js';
import PreviewModal from '../components/PreviewModal.jsx';
import ListeDiplomes from '../components/ListeDiplomes.jsx';
import { RailLateral, Fenetre } from '../components/ui.jsx';
import EnvoiMailModal from '../components/EnvoiMailModal.jsx';
import {
  IconUser, IconBooks, IconBook, IconLink, IconSchool, IconScale,
  IconAlertTriangle, IconLayoutGrid, IconFileText, IconFileDescription,
  IconCertificate, IconBolt, IconPrinter, IconFileSpreadsheet, IconDownload, IconSend,
  IconFileExport,
} from '@tabler/icons-react';
import * as XLSX from 'xlsx';
import { ouvrirApercu } from '../lib/apercu.js';
import { informer } from '../lib/dialogue.jsx';
import { chargerIdentite, useIdentite } from '../lib/identite.js';

// Table des composants d'icônes (référencés par nom dans ENTITES.tabler)
/* Les colonnes privées ne se proposent qu'à qui peut les lire — le serveur,
   de toute façon, ne les remplit pas pour les autres (2 octobre 2026). */
function colPermise(c) {
  const role = getUser()?.role;
  if (c.prive) return ['admin', 'directeur', 'directeur_adjoint'].includes(role);
  if (c.mailPrive) return ['admin', 'directeur', 'directeur_adjoint', 'secretariat', 'coordination', 'editeur'].includes(role);
  return true;
}

const TABLER = {
  IconUser, IconBooks, IconBook, IconLink, IconSchool, IconScale,
  IconAlertTriangle, IconLayoutGrid, IconFileText, IconFileDescription,
};

// Export Excel via import dynamique (évite de bloquer le bundle si xlsx pose problème)
async function exportExcel(rows, cols, nom) {
  try {
    const XLSX = await import('xlsx');
    const data = [cols.map(c => c.label), ...rows.map(r => cols.map(c => r[c.key] ?? ''))];
    const ws = XLSX.utils.aoa_to_sheet(data);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Export');
    XLSX.writeFile(wb, `${nom}.xlsx`);
  } catch (e) {
    informer('Export Excel indisponible : ' + e.message);
  }
}

function getToken() { return localStorage.getItem('token'); }

// ─── Fonction fetch authentifiée ────────────────────────────────────────────
function authFetch(url) {
  return fetch(url, { headers: { Authorization: `Bearer ${getToken()}` } }).then(r => {
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    return r.json();
  });
}

// ─── Définition des entités ─────────────────────────────────────────────────
const ENTITES = {
  profs: {
    domaine: 'personnel', label: 'Professeurs', groupe: 'data', icon: '👤', tabler: 'IconUser',
    cols: [
      { key: 'nom',            label: 'Nom',          defaut: true  },
      { key: 'prenom',         label: 'Prénom',       defaut: true  },
      { key: 'statut',         label: 'Statut',       defaut: true  },
      { key: 'adresse_mail',   label: 'E-mail IIP',   defaut: false },
      { key: 'mail_prive',     label: 'E-mail privé', defaut: false },
      { key: 'commune',        label: 'Commune',      defaut: false },
      { key: 'matricule',      label: 'Matricule',    defaut: false },
      { key: 'total_per_iip',  label: 'Pér. IIP',     defaut: true  },
      { key: 'total_hrs_helb', label: 'Hrs HELB',     defaut: false },
      { key: 'anciennete_25_26_po', label: 'Anc. PO', defaut: false },
      { key: 'capaes',         label: 'CAPAES',       defaut: false },
    ],
    fetch: (annee, filtres) => api.professeurs(true),
    filtres: [],
  },
  profs_section: {
    domaine: 'personnel', label: 'Professeurs par section', groupe: 'data', icon: '🧑‍🏫', tabler: 'IconUsersGroup',
    cols: [
      { key: 'section',        label: 'Section',   defaut: true  },
      { key: 'nom',            label: 'Nom',       defaut: true  },
      { key: 'prenom',         label: 'Prénom',    defaut: true  },
      { key: 'statut',         label: 'Statut',    defaut: true  },
      { key: 'nb_ue',          label: 'UE',        defaut: true  },
      { key: 'nb_cours',       label: 'Cours',     defaut: true  },
      { key: 'total_periodes', label: 'Périodes',  defaut: true  },
      { key: 'adresse_mail',   label: 'E-mail IIP', defaut: false },
      { key: 'matricule',      label: 'Matricule', defaut: false },
      { key: 'cours',          label: 'Cours donnés', defaut: false },
    ],
    // Un professeur donnant plusieurs cours dans une même section n'apparaît
    // qu'une fois ; le détail de ses cours peut être déplié en colonnes.
    fetch: (annee, filtres) => {
      let url = `/api/listes/professeurs?annee=${encodeURIComponent(annee)}&par_section=1`;
      url += `&cours=${filtres.detail_cours || 'colonne'}`;
      for (const k of ['section', 'ue_num', 'statut']) {
        if (filtres[k]) url += `&${k}=${encodeURIComponent(filtres[k])}`;
      }
      return authFetch(url).then(d => {
        const rows = d.lignes || [];
        rows._colonnesCours = d.colonnes_cours || 0;
        return rows;
      });
    },
    filtres: ['section', 'ue_num', 'statut', 'detail_cours'],
    colonnesDynamiques: 'cours_',
  },
  ues: {
    domaine: 'organisation', label: 'Unités d\'enseignement', groupe: 'data', icon: '📚', tabler: 'IconBooks',
    cols: [
      { key: 'ue_num',        label: 'N° UE',          defaut: true  },
      { key: 'ue_nom',        label: 'Nom',             defaut: true  },
      { key: '_sectionsLabel',label: 'Section(s)',      defaut: true  },
      { key: 'ue_niv',        label: 'Bloc',            defaut: true  },
      { key: 'ue_niveau',     label: 'Niveau',          defaut: false },
      { key: 'ue_quad',       label: 'Quadri',          defaut: true  },
      { key: 'ects',          label: 'ECTS',            defaut: true  },
      { key: 'ue_aut',         label: 'Autonomie (DP)',          defaut: true  },
      { key: 'ue_per_z',       label: 'Pér. Z (7.3)',            defaut: false },
      { key: 'calc_per_cours', label: 'Pér. cours prof (calc.)', defaut: false },
      { key: 'calc_autonomie', label: 'Autonomie (calc.)',        defaut: false },
      { key: 'calc_per_z',     label: 'Pér. Z (calc.)',          defaut: false },
      { key: 'calc_tot_prof',  label: 'Total prof (calc.)',      defaut: false },
      { key: 'ue_per_etudiants', label: 'Périodes étudiant DP', defaut: true  },
      { key: 'et_ref',        label: 'Réf.',            defaut: false },
      { key: 'ue_code_fwb',   label: 'Code FWB',        defaut: false },
      { key: 'ue_tc',         label: 'TC',              defaut: false },
      { key: 'ue_prerequise', label: 'Prérequis',       defaut: false },
    ],
    fetch: (annee, filtres) => authFetch(`/api/ref/structure?annee=${encodeURIComponent(annee)}`).then(d => {
      // d est un TABLEAU d'objets { section, ues: [...] }
      const map = new Map();
      for (const sg of (Array.isArray(d) ? d : [])) {
        for (const ue of (sg.ues || [])) {
          if (!map.has(ue.ue_num)) {
            map.set(ue.ue_num, { ...ue, _sections: new Set() });
          }
          if (sg.section && sg.section !== '(sans section)') {
            map.get(ue.ue_num)._sections.add(sg.section);
          }
        }
      }
      let rows = [...map.values()].map(ue => ({
        ...ue,
        _sectionsLabel: ue._sections.size ? [...ue._sections].sort().join(', ') : '—'
      }));
      if (filtres.section) rows = rows.filter(u => u._sections.has(filtres.section));
      if (filtres.niveau) rows = rows.filter(u => u.ue_niveau === filtres.niveau);
      return rows.sort((a, b) => (a.ue_num || 0) - (b.ue_num || 0));
    }),
    filtres: ['section', 'niveau'],
  },
  cours: {
    domaine: 'organisation', label: 'Cours', groupe: 'data', icon: '📖', tabler: 'IconBook',
    cols: [
      { key: 'cours_code',         label: 'Code cours',   defaut: true  },
      { key: 'cours_nom',          label: 'Nom du cours', defaut: true  },
      { key: 'ue_num',             label: 'N° UE',        defaut: true  },
      { key: 'section',            label: 'Section',      defaut: true  },
      { key: 'ct_pp',              label: 'Type',         defaut: true  },
      { key: 'cours_per',          label: 'Pér. Prof.',   defaut: true  },
      { key: 'heures',             label: 'Heures',       defaut: false },
      { key: 'cours_autonomie',    label: 'Autonomie',    defaut: false },
      { key: 'dedouble',           label: 'Dédoublé',     defaut: false },
      { key: 'quadrimestre_cours', label: 'Quadri cours', defaut: false },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/ref/cours?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      if (filtres.ue_num)  url += `&ue_num=${encodeURIComponent(filtres.ue_num)}`;
      return authFetch(url);
    },
    filtres: ['section', 'ue_num'],
  },
  profs_par_ue: {
    domaine: 'personnel', label: 'Profs par UE', groupe: 'data', icon: '🔗', tabler: 'IconLink',
    cols: [
      { key: 'professeur',    label: 'Professeur',  defaut: true  },
      { key: 'ue_num',        label: 'N° UE',        defaut: true  },
      { key: 'ue_nom',        label: 'Nom UE',       defaut: true  },
      { key: 'section',       label: 'Section',      defaut: true  },
      { key: 'nom_cours',     label: 'Cours',        defaut: true  },
      { key: 'type_cours',    label: 'Type',         defaut: false },
      { key: 'periodes_attribuees',         label: 'Pér.',   defaut: true  },
      { key: 'autonomie_attribuee',         label: 'Auto.',  defaut: false },
      { key: 'total_attribue_professeur',   label: 'Total',  defaut: true  },
      { key: 'charge_en_heures',            label: 'Heures', defaut: false },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/attributions?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      if (filtres.ue_num)  url += `&ue_num=${encodeURIComponent(filtres.ue_num)}`;
      return authFetch(url).then(d => d.filter(r => !r.is_z && r.professeur_id));
    },
    filtres: ['section', 'ue_num'],
  },
  profs_par_section: {
    domaine: 'personnel', label: 'Profs par section', groupe: 'data', icon: '🏫', tabler: 'IconSchool',
    cols: [
      { key: 'section',       label: 'Section',     defaut: true  },
      { key: 'professeur',    label: 'Professeur',  defaut: true  },
      { key: 'ue_num',        label: 'N° UE',       defaut: false },
      { key: 'ue_nom',        label: 'Nom UE',      defaut: false },
      { key: 'nom_cours',     label: 'Cours',       defaut: true  },
      { key: 'type_cours',    label: 'Type',        defaut: false },
      { key: 'periodes_attribuees',       label: 'Pér.',  defaut: true  },
      { key: 'total_attribue_professeur', label: 'Total', defaut: false },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/attributions?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      return authFetch(url).then(d => d.filter(r => !r.is_z && r.professeur_id));
    },
    filtres: ['section'],
  },
  synthese_charge: {
    domaine: 'personnel', label: 'Synthèse charge / prof', groupe: 'data', icon: '⚖️', tabler: 'IconScale',
    cols: [
      { key: 'professeur',    label: 'Professeur',  defaut: true  },
      { key: 'section',       label: 'Section',     defaut: true  },
      { key: 'nb_cours',      label: 'Nb cours',    defaut: true  },
      { key: 'total_per',     label: 'Total pér.',  defaut: true  },
      { key: 'total_heures',  label: 'Total heures',defaut: true  },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/attributions?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      return authFetch(url).then(d => {
        const map = new Map();
        for (const r of d) {
          if (!r.professeur_id || r.is_z) continue;
          const k = `${r.professeur_id}||${r.section}`;
          if (!map.has(k)) map.set(k, { professeur: r.professeur, section: r.section, nb_cours: 0, total_per: 0, total_heures: 0 });
          const g = map.get(k);
          g.nb_cours++;
          g.total_per += Number(r.total_attribue_professeur) || 0;
          g.total_heures = Math.round((g.total_per * 50 / 60) * 10) / 10;
        }
        return [...map.values()].sort((a, b) => (a.section || '').localeCompare(b.section || '') || (a.professeur || '').localeCompare(b.professeur || ''));
      });
    },
    filtres: ['section'],
  },
  ues_sans_attribution: {
    domaine: 'organisation', label: 'UE sans attribution', groupe: 'data', icon: '⚠️', tabler: 'IconAlertTriangle',
    cols: [
      { key: 'ue_num',  label: 'N° UE',  defaut: true  },
      { key: 'ue_nom',  label: 'Nom',    defaut: true  },
      { key: 'section', label: 'Section',defaut: true  },
      { key: 'ue_quad', label: 'Quadri', defaut: true  },
      { key: 'ects',    label: 'ECTS',   defaut: false },
    ],
    fetch: (annee, filtres) => authFetch(`/api/ref/structure?annee=${encodeURIComponent(annee)}`).then(d => {
      const map = new Map();
      for (const sg of (Array.isArray(d) ? d : [])) {
        for (const ue of (sg.ues || [])) {
          if (!map.has(ue.ue_num)) map.set(ue.ue_num, { ...ue, nb_attributions: ue.nb_attributions || 0 });
        }
      }
      return [...map.values()].filter(u => !u.nb_attributions).sort((a, b) => (a.ue_num || 0) - (b.ue_num || 0));
    }),
    filtres: ['section'],
  },
  'heures-contact': {
    domaine: 'organisation', label: 'Grille de cours', groupe: 'rapport', icon: '🕐', tabler: 'IconClock',
    heuresContact: true, // rendu personnalisé
    cols: [],
    fetch: (annee, filtres) => {
      let url = `/api/ref/heures-contact?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      return authFetch(url);
    },
    filtres: ['section'],
  },
  'grille-section': {
    domaine: 'organisation', label: 'Grille de section', groupe: 'rapport', icon: '📐', tabler: 'IconLayoutGrid',
    grille: true,
    cols: [],
    fetch: (annee, filtres) => authFetch(
      `/api/ref/sections/${encodeURIComponent(filtres.section||'')}/grille?annee=${encodeURIComponent(annee)}`
    ),
    filtres: ['section'],
  },
  'rapport-section': {
    domaine: 'organisation', label: 'Rapport par section', groupe: 'rapport', icon: '📄', tabler: 'IconFileText',
    rapport: true,
    cols: [],
    fetch: (annee, filtres) => {
      // sections multiples : filtres.sections = tableau ; sinon filtres.section (compat) ; vide = toutes
      const liste = Array.isArray(filtres.sections) ? filtres.sections : (filtres.section ? [filtres.section] : []);
      const param = liste.length ? `section=${encodeURIComponent(liste.join(','))}&` : '';
      return authFetch(`/api/attributions/rapport-attributions?${param}annee=${encodeURIComponent(annee)}`);
    },
    filtres: ['section', 'tc'],
  },
  'rapport-ue': {
    domaine: 'organisation', label: 'Rapport par UE', groupe: 'rapport', icon: '📋', tabler: 'IconFileDescription',
    rapport: true,
    cols: [],
    fetch: (annee, filtres) => authFetch(
      `/api/attributions/rapport-attributions?section=${encodeURIComponent(filtres.section||'')}&annee=${encodeURIComponent(annee)}`
    ),
    filtres: ['section', 'ue_num'],
  },

  /* LE PRINCIPE DE JÉRÔME (25 septembre 2026) : l'entité fait les lignes —
     des étudiants —, les critères la réduisent (section, UE, cours, primo,
     niveau), et L'ANNÉE FAIT LA LISTE : 2024-2025 et 2026-2027 ne montrent
     pas les mêmes noms. Sur une liste par UE ou par cours, les DISPENSÉS
     paraissent en dessous, avec leur provenance : report d'une année
     antérieure (avec sa note), ou VA (10/20). */
  etudiants: {
    domaine: 'etudiants', label: 'Étudiants', groupe: 'data', icon: '🎓', tabler: 'IconSchool',
    cols: [
      { key: 'nom',         label: 'Nom',       defaut: true  },
      { key: 'prenom',      label: 'Prénom',    defaut: true  },
      { key: 'matricule',   label: 'Matricule', defaut: true  },
      { key: 'section',     label: 'Section',   defaut: true  },
      { key: 'statut',      label: 'Statut',    defaut: true  },
      { key: 'niveau',      label: 'Niveau',    defaut: false },
      { key: 'primo',       label: 'Primo',     defaut: false },
      { key: 'email_ecole', label: 'E-mail',    defaut: false },
      { key: 'resultat',    label: 'Résultat',  defaut: false },
      { key: 'points',      label: 'Note',      defaut: false },
      { key: 'groupe',      label: 'Groupe',    defaut: false },
      { key: 'ues_inscrites', label: 'UE inscrites', defaut: false },
      { key: 'nb_ues',      label: 'Nombre d’UE', defaut: false },
      // TOUS LES CHAMPS DE LA FICHE (2 octobre 2026), à la carte.
      { key: 'date_naissance', label: 'Né(e) le', defaut: false },
      { key: 'lieu_naissance', label: 'Lieu de naissance', defaut: false },
      { key: 'nationalite',  label: 'Nationalité', defaut: false },
      { key: 'num_national', label: 'N° national', defaut: false , prive: true },
      { key: 'email_perso',  label: 'E-mail privé', defaut: false , mailPrive: true },
      { key: 'gsm',          label: 'GSM',       defaut: false },
      { key: 'adresse',      label: 'Adresse',   defaut: false , prive: true },
      { key: 'cp',           label: 'CP',        defaut: false , prive: true },
      { key: 'localite',     label: 'Localité',  defaut: false , prive: true },
      { key: 'titre',        label: 'Titre d’accès', defaut: false },
      { key: 'matricule_helb', label: 'Matricule HELB', defaut: false },
      { key: 'section_posee', label: 'Section posée', defaut: false },
      { key: 'sle',          label: 'SLE',       defaut: false },
      { key: 'di_exonere',   label: 'DI exonéré', defaut: false },
      { key: 'di_motif',     label: 'Motif DI',  defaut: false },
      { key: 'dis_soumis',   label: 'DIS',       defaut: false },
      { key: 'dis_motif_exemption', label: 'Exemption DIS', defaut: false },
      { key: 'dis_periodes_hebdo', label: 'Pér./sem. (DIS)', defaut: false },
      { key: 'sortie_statut', label: 'Sortie', defaut: false },
      { key: 'sortie_le',    label: 'Sortie le', defaut: false },
      { key: 'sortie_motif', label: 'Motif de sortie', defaut: false },
      { key: 'cree_le',      label: 'Fiche créée le', defaut: false },
      { key: 'id_lucie',     label: 'N° Lucie',  defaut: false },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/listes/etudiants?annee=${encodeURIComponent(annee)}`;
      for (const k of ['section', 'ue_num', 'cours_code', 'niveau_etu']) {
        if (filtres[k]) url += `&${k}=${encodeURIComponent(filtres[k])}`;
      }
      if (filtres.primo === true || filtres.primo === 'primo') url += '&primo=1';
      else if (filtres.primo === 'anciens') url += '&primo=0';
      return authFetch(url).then(d => {
        const toutes = d.lignes || [];
        /* LES GROUPES D'UN COURS (1er octobre 2026, UE 333) : un étudiant peut
           être dans plusieurs (« Org 1 · Gr. A + … ») ; on les liste tous, et
           le filtre garde ceux qui appartiennent au groupe choisi. */
        const groupesDe = r => String(r.groupe || '').split(' + ').map(x => x.trim()).filter(Boolean);
        const dispo = [...new Set(toutes.flatMap(groupesDe))].sort((a, b) => a.localeCompare(b, 'fr', { numeric: true }));
        let l = filtres.groupe ? toutes.filter(r => groupesDe(r).includes(filtres.groupe)) : toutes;
        // SEULEMENT LA SÉLECTION de la liste des étudiants (7 octobre 2026).
        const sel = selectionEtudiants().ids;
        if (filtres.selection && sel.length) { const s = new Set(sel); l = l.filter(r => s.has(Number(r.id_lucie ?? r.id))); }
        l.groupesDispo = dispo;
        return l;
      });
    },
    filtres: ['section', 'ue_num', 'cours_code', 'groupe', 'primo', 'niveau_etu'],
  },

  etudiants_ue: {
    domaine: 'etudiants', label: 'Étudiants par UE', groupe: 'data', icon: '🎓', tabler: 'IconSchool',
    cols: [
      { key: 'ue_num',               label: 'N° UE',              defaut: true  },
      { key: 'ue_nom',               label: 'Nom UE',             defaut: true  },
      { key: '_sectionsLabel',       label: 'Section(s)',          defaut: true  },
      { key: 'ue_niv',               label: 'Bloc',               defaut: true  },
      { key: 'ue_quad',              label: 'Quadri',             defaut: true  },
      { key: 'ue_per_etudiants',     label: 'Pér. étudiant (DP)', defaut: true  },
      { key: 'periodes_contact_etudiant', label: 'Pér. contact',  defaut: false },
      { key: 'heures_reelles_etudiants',  label: 'Heures réelles',defaut: false },
      { key: 'ects',                 label: 'ECTS',               defaut: true  },
      { key: 'et_ref',               label: 'Référent',           defaut: false },
    ],
    fetch: (annee, filtres) => authFetch(`/api/ref/structure?annee=${encodeURIComponent(annee)}`).then(d => {
      const map = new Map();
      for (const sg of (Array.isArray(d) ? d : [])) {
        for (const ue of (sg.ues || [])) {
          if (!map.has(ue.ue_num)) map.set(ue.ue_num, { ...ue, _sections: new Set() });
          if (sg.section && sg.section !== '(sans section)') map.get(ue.ue_num)._sections.add(sg.section);
        }
      }
      let rows = [...map.values()].map(ue => ({ ...ue, _sectionsLabel: ue._sections.size ? [...ue._sections].sort().join(', ') : '—' }));
      if (filtres.section) rows = rows.filter(u => u._sections.has(filtres.section));
      return rows.sort((a, b) => (a.ue_num||0) - (b.ue_num||0));
    }),
    filtres: ['section'],
  },
  encadrement_tfe: {
    domaine: 'personnel', label: 'Encadrement TFE', groupe: 'data', icon: '📝', tabler: 'IconFileText',
    cols: [
      { key: 'professeur',           label: 'Professeur',         defaut: true  },
      { key: 'section',              label: 'Section',            defaut: true  },
      { key: 'ue_num',               label: 'N° UE',              defaut: true  },
      { key: 'ue_nom',               label: 'Nom UE',             defaut: true  },
      { key: 'coordination_encadrement', label: 'Type',           defaut: true  },
      { key: 'periodes_attribuees',  label: 'Périodes',           defaut: true  },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/attributions?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      return authFetch(url).then(d => d.filter(r =>
        r.coordination_encadrement && ['TFE','TFEN','TFEB'].some(t => (r.coordination_encadrement||'').includes(t))
      ).map(r => ({ ...r, professeur: r.professeur || r.prof_nom })));
    },
    filtres: ['section'],
  },
  encadrement_stage: {
    domaine: 'personnel', label: 'Encadrement stage', groupe: 'data', icon: '🏥', tabler: 'IconStethoscope',
    cols: [
      { key: 'professeur',           label: 'Professeur',         defaut: true  },
      { key: 'section',              label: 'Section',            defaut: true  },
      { key: 'ue_num',               label: 'N° UE',              defaut: true  },
      { key: 'ue_nom',               label: 'Nom UE',             defaut: true  },
      { key: 'coordination_encadrement', label: 'Type',           defaut: true  },
      { key: 'nom_cours',            label: 'Cours',              defaut: true  },
      { key: 'periodes_attribuees',  label: 'Périodes',           defaut: true  },
      { key: 'total_attribue_professeur', label: 'Total',         defaut: false },
    ],
    fetch: (annee, filtres) => {
      let url = `/api/attributions?annee=${encodeURIComponent(annee)}`;
      if (filtres.section) url += `&section=${encodeURIComponent(filtres.section)}`;
      return authFetch(url).then(d => d.filter(r =>
        r.coordination_encadrement && ['ES','ST','STAGE'].some(t => (r.coordination_encadrement||'').includes(t))
      ).map(r => ({ ...r, professeur: r.professeur || r.prof_nom })));
    },
    filtres: ['section'],
  },
  'rapport-etp': {
    domaine: 'gestion', label: 'Rapport ETP', groupe: 'rapport', icon: '🎓', tabler: 'IconCertificate',
    rapport: true,
    cols: [],
    fetch: (annee) => authFetch(`/api/pilotage/etp?annee=${encodeURIComponent(annee)}`),
    filtres: ['section'],
  },
};

// ─── Exports ─────────────────────────────────────────────────────────────────
/**
 * IMPRIMER UNE LISTE, C'EST LA FAIRE HABILLER PAR LE SERVEUR.
 *
 * Onze des seize listes n'avaient AUCUNE impression — CSV et Excel, rien
 * d'autre. Les cinq autres ouvraient un onglet et laissaient le navigateur
 * imprimer : ni A4 imposé, ni en-tête IIP, ni pied, ni numérotation. On
 * emportait donc en réunion une page dont le format dépendait de la boîte
 * d'impression de celui qui avait cliqué.
 *
 * La liste part maintenant au serveur — les colonnes COCHÉES et les lignes
 * affichées, telles qu'on les voit —, revient habillée de l'enveloppe commune,
 * et sort en PDF A4 avec son pied sur chaque feuille. L'impression du
 * navigateur reste le repli quand le serveur ne sait pas produire de PDF : le
 * même repli que partout ailleurs.
 */
async function mettreEnPage(rows, cols, titre, annee, mention, parGroupe = false) {
  /* ON ENVOIE LA CLÉ AVEC LE LIBELLÉ.
   *
   * Seuls les libellés partaient — « UE », « Périodes » —, si bien que le
   * serveur ne pouvait plus distinguer un NUMÉRO d'une QUANTITÉ et totalisait
   * les deux : le pied d'une liste annonçait la somme des numéros d'unité. La
   * clé, elle, dit ce qu'est la colonne ; elle voyage désormais avec. */
  const entetes = cols.map(c => ({ label: c.label, cle: c.key }));
  const lignes = rows.map(r => cols.map(c => {
    const v = r[c.key];
    return v === null || v === undefined ? '' : v;
  }));
  const mise = await fetch('/api/rapports/mise-en-page', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}` },
    body: JSON.stringify({ titre, annee, mention, colonnes: entetes,
      ...(parGroupe ? { pages: pagesParGroupe(rows, cols) } : { lignes }) }),
  });
  const j = await mise.json();
  if (!mise.ok) throw new Error(j.error || 'Mise en page impossible');
  return j.html;
}

/** UNE PAGE PAR GROUPE : un étudiant de deux groupes paraît sur les deux feuilles. */
function pagesParGroupe(rows, cols) {
  const paquets = new Map();
  for (const r of rows) {
    const gs = String(r.groupe || '').split(' + ').map(x => x.trim()).filter(Boolean);
    for (const g of (gs.length ? gs : ['Sans groupe'])) {
      if (!paquets.has(g)) paquets.set(g, []);
      paquets.get(g).push(cols.map(c => { const v = c.key === 'groupe' ? g : r[c.key]; return v == null ? '' : v; }));
    }
  }
  return [...paquets.entries()].sort((a, b) => a[0].localeCompare(b[0], 'fr', { numeric: true }))
    .map(([titre, lignes]) => ({ titre, lignes }));
}

/** Imprimer : le PDF du serveur d'abord, le navigateur en repli annoncé. */
async function imprimerListe(rows, cols, titre, annee, mention, parGroupe = false) {
  const html = await mettreEnPage(rows, cols, titre, annee, mention, parGroupe);
  const pdf = await fetch('/api/impression/pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}` },
    body: JSON.stringify({ html, nom: titre, pagination: 'si-plusieurs' }),
  });
  if (pdf.ok) {
    const blob = await pdf.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    return;
  }
  // REPLI ANNONCÉ, PAS SILENCIEUX : la pièce sort quand même, par le
  // navigateur, et l'on sait pourquoi le format n'est plus garanti.
  ouvrirApercu({ html, titre, sousTitre: annee, nomFichier: titre, envoiPossible: false });
}

function exportCSV(rows, cols, nom) {
  const header = cols.map(c => `"${c.label}"`).join(';');
  const lines = rows.map(r => cols.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + header + '\n' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${nom}.csv`; a.click();
  URL.revokeObjectURL(url);
}


let LOGO_IIP = ''; // l'image de l'établissement (lib/identite.js, 3.1.253)
chargerIdentite().then(i => { LOGO_IIP = i.logo || LOGO_IIP; });

// ─── Composant principal ─────────────────────────────────────────────────────
/**
 * LE GÉNÉRATEUR DE LISTES VIT DANS ÉDITIONS, PAS À CÔTÉ.
 *
 * Il était un écran à part — et sa route n'était référencée NULLE PART : on n'y
 * arrivait qu'en tapant l'adresse. L'axe Communication, qui le portait, a
 * disparu ; le commentaire qui acte sa disparition promet que « ses listes sont
 * dans le centre d'impression », et la promesse n'a jamais été tenue. Seize
 * listes sont restées injoignables.
 *
 * Le catalogue d'Éditions offre des pièces écrites d'avance ; ce générateur
 * sert quand aucune ne convient — on coche ses colonnes, on filtre, et la
 * mise en page est la même enveloppe. Ce sont deux faces d'une même question,
 * « qu'est-ce que j'emporte ? », et elles vivent donc au même endroit.
 *
 * `integre` retire la coquille d'écran : le rail latéral devient la colonne de
 * gauche de la fenêtre, et la hauteur vient de la fenêtre au lieu de l'écran.
 */
/**
 * `domaine` RANGE CHAQUE LISTE DANS SON AXE — et c'est ce qui manquait.
 *
 * Le centre d'éditions offrait « Construire une liste » ET les mêmes listes
 * une seconde fois dans Étudiants, Personnel, Organisation : on apprenait deux
 * chemins pour une même pièce, et l'on ne savait plus lequel faisait foi. La
 * proposition validée disait pourtant l'inverse — chaque liste vit dans SON
 * axe, et le générateur reste « à part, en tête », parce qu'il n'est pas un
 * axe mais un OUTIL : celui où l'on choisit ses colonnes.
 *
 * Passé un `domaine`, l'écran ne montre que les listes de cet axe. Sans
 * `domaine`, il les montre toutes — c'est l'écran plein, hors du centre.
 */
export default function Listes({ integre = false, domaine = null, rapports = null, renduRapport = null }) {
  // Un rapport du catalogue choisi dans la colonne (« Listes et rapports »).
  const [rapportVu, setRapportVu] = useState(null);
  const navigate = useNavigate();
  const annee = getAnnee() || '2026-2027';
  const [diplomes, setDiplomes] = useState(false);
  /* L'ENTITÉ DE DÉPART APPARTIENT À L'AXE OUVERT. « profs » en dur affichait,
     dans l'onglet Étudiants, une liste de professeurs — et la colonne de
     gauche, elle, n'en proposait pas : on ouvrait sur une pièce qui n'était
     nulle part dans le menu. */
  const [entite, setEntite] = useState(() => {
    if (!domaine) return 'profs';
    const premier = Object.entries(ENTITES).find(([, e]) => e.domaine === domaine);
    return premier ? premier[0] : 'profs';
  });
  const [colsActives, setColsActives] = useState(() => new Set(ENTITES['profs'].cols.filter(c => c.defaut).map(c => c.key)));
  // Une sélection faite dans la liste des étudiants s'applique d'office (on la décoche au besoin).
  const [filtres, setFiltres] = useState(() => (selectionEtudiants().ids.length ? { selection: true } : {}));
  const [showOptionsRapport, setShowOptionsRapport] = useState(false); // pop-up de critères avant génération
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // La liste prête à partir par courriel : une pièce, sans destinataire connu.
  // Une liste ne nomme personne — c'est celui qui l'envoie qui décide à qui.
  const [envoi, setEnvoi] = useState(null);
  const [sections, setSections] = useState([]);
  const [rapportHtml, setRapportHtml] = useState(null);
  const [ueList, setUeList] = useState([]);
  const [orientation, setOrientation] = useState('portrait'); // portrait | landscape (impression)

  useEffect(() => {
    api.sections().then(s => setSections(Array.isArray(s) ? s : [])).catch(() => {});
  }, []);

  /* UNE UNITÉ SE CHOISIT, ELLE NE SE TAPE PAS — ET LA LISTE SE CHARGE POUR
     TOUTES LES LISTES QUI FILTRENT PAR UNITÉ, pas pour une seule.
     Le chargement était conditionné à `entite === 'rapport-ue'` : partout
     ailleurs la liste restait vide, donc le champ retombait sur une saisie
     libre « ex: 95 ». Or une UE libre n'existe pas — on tape 95, l'unité 95
     n'est pas de cette section ou de cette année, et la liste sort vide sans
     rien dire. C'est la leçon déjà tirée pour la valorisation en 2.11.8 : le
     numéro d'unité ne se tape plus, il se choisit dans le catalogue.
     Sans section choisie, on charge les unités de l'année : « toutes
     sections » est un filtre légitime, et le choix reste dans une liste. */
  useEffect(() => {
    if (!def?.filtres?.includes('ue_num')) return;
    const p = new URLSearchParams({ annee });
    if (filtres.section) p.set('section', filtres.section);
    authFetch(`/api/ref/ue?${p.toString()}`)
      .then(d => setUeList(Array.isArray(d) ? d : [])).catch(() => setUeList([]));
  }, [filtres.section, entite, annee]);

  // Les cours de l'unité choisie, pour le critère « par cours ».
  const [coursList, setCoursList] = useState([]);
  useEffect(() => {
    if (!def?.filtres?.includes('cours_code') || !filtres.ue_num) { setCoursList([]); return; }
    authFetch(`/api/ref/cours?ue_num=${encodeURIComponent(filtres.ue_num)}&annee=${encodeURIComponent(annee)}`)
      .then(d => setCoursList(Array.isArray(d) ? d : [])).catch(() => setCoursList([]));
  }, [filtres.ue_num, entite, annee]);

  const def = ENTITES[entite];

  function changerEntite(k) {
    setEntite(k);
    setRows(null); setError(''); setFiltres(selectionEtudiants().ids.length ? { selection: true } : {});
    setColsActives(new Set(ENTITES[k].cols.filter(c => c.defaut).map(c => c.key)));
  }

  function toggleCol(key) {
    setColsActives(s => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  }

  async function generer() {
    // Pour le rapport par section : ouvrir le pop-up de critères d'abord
    if (entite === 'rapport-section') { setShowOptionsRapport(true); return; }
    await genererReel();
  }

  async function genererReel() {
    setLoading(true); setError('');
    try {
      const data = await def.fetch(annee, filtres);
      if (entite === 'rapport-etp') {
        genererRapportEtpHtml(data, filtres);
        setRows([]);
      } else if (def.rapport) {
        genererRapportHtml(data, filtres);
        setRows([]);
      } else if (def.grille) {
        genererGrilleHtml(data);
        setRows([]);
      } else {
        setRows(Array.isArray(data) ? data : []);
      }
    } catch (e) { setError(e.message); setRows([]); }
    finally { setLoading(false); }
  }

  function genererGrilleHtml(d) {
    if (d.error) { informer(d.error); return; }
    const NIV_PAL = ['var(--c-attente)','var(--c-disponible)','var(--c-texte)','var(--c-faveur)','var(--c-helb)'];
    const niveaux = [...new Set(d.ues.map(u => u.ue_niv).filter(Boolean))];
    const nivColor = niv => NIV_PAL[niveaux.indexOf(niv) % NIV_PAL.length] || '#6b7280';
    const S = 'padding:1px 5px;font-size:10px;';
    const SR = S + 'text-align:right;';

    const lignesNiv = {};
    for (const u of d.ues) {
      const niv = u.ue_niv || '—';
      if (!lignesNiv[niv]) lignesNiv[niv] = [];
      lignesNiv[niv].push(u);
    }

    const sections = Object.entries(lignesNiv).map(([niv, ues]) => {
      const col = nivColor(niv);
      const lignesUE = ues.map(u => {
        const badge = (ct) => {
          if (ct === 'CT') return `<span style="display:inline-block;background:#1B2B4B;color:#fff;font-size:8px;font-weight:700;padding:1px 6px;border-radius:3px">CT</span>`;
          if (ct === 'PP') return `<span style="display:inline-block;background:#00AACC;color:#fff;font-size:8px;font-weight:700;padding:1px 6px;border-radius:3px">PP</span>`;
          if (ct === 'Z')  return `<span style="display:inline-block;background:#9ca3af;color:#fff;font-size:8px;font-weight:700;padding:1px 6px;border-radius:3px">Z</span>`;
          return '—';
        };
        const lignesCours = u.cours.map((c, i) => {
          const estZ = c.ct_pp === 'Z';
          const cp = Number(c.cours_per) || 0;
          // Périodes ÉTUDIANT, dans l'ordre de priorité du modèle :
          //   1. per_etudiant, saisi explicitement (activités Z, 7.3) ;
          //   2. sinon les HEURES converties — schema.sql : « heures réelles
          //      étudiant (×60 min) → converti en périodes ×1.2 » ;
          //   3. à défaut, les périodes de cours.
          // `heures` était ignoré : un stage encodé à 400 h comptait pour 60.
          const vide = v => v === null || v === undefined || v === '';
          const pe = !vide(c.per_etudiant) ? Number(c.per_etudiant)
            : !vide(c.heures) ? Math.round(Number(c.heures) * 1.2)
            : cp;
          return `
          <tr style="background:${estZ?'#f3f4f6':(i%2===0?'#fff':'#f9fafb')}">
            <td style="${S}padding-left:20px;color:#6b7280;font-family:monospace">${c.cours_code}</td>
            <td style="${S}${estZ?'font-style:italic;color:#6b7280':''}">${c.cours_nom || '—'}${estZ?' <span style="font-size:8px;color:#9ca3af">(cours étudiant)</span>':''}</td>
            <td style="${S}text-align:center">${badge(c.ct_pp)}</td>
            <td style="${SR}color:#374151">${estZ?'—':(cp||'—')}</td>
            <td style="${SR}color:#7c3aed;font-weight:${estZ?'700':'400'}">${pe||'—'}</td>
            <td style="${SR}color:#6b7280"></td>
            <td style="${SR}font-weight:600">${pe||'—'}</td>
          </tr>`;
        }).join('');
        // Ligne autonomie séparée (une seule par UE, après tous les cours)
        const autUE = u.cours.find(c => (c.ue_autonomie||0) > 0)?.ue_autonomie || 0;
        const ligneAut = autUE > 0 ? `
          <tr style="background:#fff8e1">
            <td style="${S}padding-left:20px;color:#6b7280;font-family:monospace"></td>
            <td style="${S}font-style:italic;color:#6b7280">Autonomie</td>
            <td style="${S}text-align:center;color:#6b7280">Auto</td>
            <td style="${SR}color:#6b7280">—</td>
            <td style="${SR}color:#6b7280">—</td>
            <td style="${SR}color:#f59e0b;font-weight:600">${autUE}</td>
            <td style="${SR}font-weight:600">${autUE}</td>
          </tr>` : '';
        return `
          <tr style="background:#f1f5f9;border-left:3px solid ${col}">
            <td colspan="2" style="padding:4px 6px 4px 8px;font-weight:700;font-size:11px;color:#111827">
              <span style="background:${col};color:white;font-size:9px;padding:1px 4px;border-radius:2px;margin-right:4px">${u.ue_niv||''}</span>
              UE\u00a0${u.ue_num} — ${u.ue_nom||''}
              ${u.ue_quad?`<span style="color:#6b7280;font-weight:400;font-size:9px;margin-left:6px">${u.ue_quad}</span>`:''}
            </td>
            <td style="${S}text-align:center;color:#6b7280;font-size:9px">${u.ue_niveau||''}</td>
            <td style="${SR}"></td><td style="${SR}"></td><td style="${SR}"></td><td style="${SR}"></td>
          </tr>
          ${lignesCours}
          ${ligneAut}
          <tr style="background:#e8edf3;border-left:3px solid ${col}">
            <td colspan="2" style="padding:2px 6px 2px 20px;font-size:9px;color:#6b7280;font-style:italic">Sous-total UE\u00a0${u.ue_num}</td>
            <td style="${S}text-align:center"></td>
             <td style="${SR}font-weight:700;color:#374151">${u.tot_per}</td>
             <td style="${SR}color:#7c3aed;font-weight:600">${u.tot_per_etud||'—'}</td>
             <td style="${SR}font-weight:600;color:#f59e0b">${u.tot_aut}</td>
             <td style="${SR}font-weight:700">${u.tot_per+u.tot_aut}</td>
           </tr>`;
      }).join('');

      return `
        <tr style="background:${col}20">
          <td colspan="7" style="padding:5px 8px;font-weight:800;font-size:12px;color:${col};border-bottom:2px solid ${col}">
            ▌ ${niv}
          </td>
        </tr>
        ${lignesUE}`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb}@media print{@page{margin:10mm;size:A4 landscape}tr{page-break-inside:avoid}thead{display:table-header-group}}</style>
      </head><body><div style="padding:10mm">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1B2B4B;padding-bottom:6px;margin-bottom:10px">
          <div>
            <div style="font-size:16px;font-weight:700;color:#1B2B4B">Grille de section — ${d.section}</div>
            <div style="font-size:11px;color:#6b7280">Année scolaire ${d.annee} · Structure référentiel</div>
          </div>
          <div style="font-size:9px;color:#9ca3af">Généré le ${new Date().toLocaleDateString('fr-BE')} · Lucie · IIP</div>
        </div>
        <table><thead>
          <tr style="background:#1B2B4B;color:white">
            <th style="padding:3px 5px;text-align:left;font-size:10px">Code</th>
            <th style="padding:3px 5px;text-align:left;font-size:10px">Cours / UE</th>
            <th style="padding:3px 5px;text-align:center;font-size:10px">CT/PP</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Pér. prof.</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Pér. étud.</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Aut.</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Total</th>
          </tr>
        </thead><tbody>
          ${sections}
          <tr style="background:#1B2B4B;color:white">
            <td colspan="2" style="padding:4px 6px;font-weight:700;font-size:12px">TOTAL — ${d.section}</td>
            <td style="${S}text-align:center"></td>
            <td style="${SR}font-weight:700;color:white">${d.grand_ct+d.grand_pp}</td>
            <td style="${SR}color:rgba(255,255,255,.85)">${d.grand_per_etud||'—'}</td>
            <td style="${SR}color:rgba(255,255,255,.7)">${d.grand_aut}</td>
            <td style="${SR}font-weight:700;color:white">${d.grand_ct+d.grand_pp+d.grand_aut}</td>
          </tr>
        </tbody></table>
        <div style="margin-top:8px;font-size:9px;color:#6b7280">CT : ${d.grand_ct} pér. · PP : ${d.grand_pp} pér. · Autonomie : ${d.grand_aut} pér.</div>
      </div></body></html>`;
    setRapportHtml({ html, nom: nomDoc('Grille', d.section, d.annee) });
  }

  function genererGrilleExcel(d) {
    if (d.error) { informer(d.error); return; }
    const BLEU = '1B2B4B', GRIS = 'F1F5F9', SOUS = 'E8EDF3', ZEBRE = 'F9FAFB';
    const NIV_PAL = ['F97316','60A5FA','1E3A8A','A855F7','EC4899'];
    const niveaux = [...new Set(d.ues.map(u => u.ue_niv).filter(Boolean))];
    const nivColor = niv => NIV_PAL[niveaux.indexOf(niv) % NIV_PAL.length] || '6B7280';
    const h = (v, bg, fg='FFFFFF', bold=false, align='left') => ({
      v, s:{font:{name:'Calibri',sz:9,bold,color:{rgb:fg}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:align,vertical:'center'}}
    });

    const rows = [
      [{v:`Grille de section — ${d.section}`, s:{font:{name:'Calibri',sz:14,bold:true,color:{rgb:BLEU}}}}],
      [{v:`Année scolaire ${d.annee} · Structure référentiel`, s:{font:{name:'Calibri',sz:10,color:{rgb:'6B7280'}}}}],
      [],
      [h('Code',BLEU,'FFFFFF',true), h('Cours / UE',BLEU,'FFFFFF',true), h('CT/PP',BLEU,'FFFFFF',true,'center'),
       {...h('Pér.',BLEU,'FFFFFF',true), s:{...h('Pér.',BLEU,'FFFFFF',true).s,alignment:{horizontal:'right'}}},
       {...h('Aut.',BLEU,'FFFFFF',true), s:{...h('Aut.',BLEU,'FFFFFF',true).s,alignment:{horizontal:'right'}}},
       {...h('Total',BLEU,'FFFFFF',true), s:{...h('Total',BLEU,'FFFFFF',true).s,alignment:{horizontal:'right'}}}],
    ];

    const niveauxGroupes = {};
    for (const u of d.ues) { const niv = u.ue_niv||'—'; if (!niveauxGroupes[niv]) niveauxGroupes[niv] = []; niveauxGroupes[niv].push(u); }

    for (const [niv, ues] of Object.entries(niveauxGroupes)) {
      const col = nivColor(niv);
      rows.push([{v:`▌ ${niv}`, s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:col}},fill:{fgColor:{rgb:col+'20'},patternType:'solid'}}},'','','','','']);
      for (const u of ues) {
        rows.push([
          {v:`UE ${u.ue_num}`, s:{font:{name:'Calibri',sz:10,bold:true,color:{rgb:BLEU}},fill:{fgColor:{rgb:GRIS},patternType:'solid'}}},
          {v:`${u.ue_nom||''}${u.ue_quad?' · '+u.ue_quad:''}`, s:{font:{name:'Calibri',sz:10,bold:true,color:{rgb:BLEU}},fill:{fgColor:{rgb:GRIS},patternType:'solid'}}},
          {v:u.ue_niveau||'', s:{font:{name:'Calibri',sz:9,color:{rgb:'6B7280'}},fill:{fgColor:{rgb:GRIS},patternType:'solid'},alignment:{horizontal:'center'}}},
          '','','',
        ]);
        u.cours.forEach((c,i) => {
          const bg = i%2===0?'FFFFFF':ZEBRE;
          rows.push([
            {v:c.cours_code||'', s:{font:{name:'Calibri',sz:9,color:{rgb:'6B7280'},italic:true},fill:{fgColor:{rgb:bg},patternType:'solid'}}},
            {v:c.cours_nom||'', s:{font:{name:'Calibri',sz:9,color:{rgb:'374151'}},fill:{fgColor:{rgb:bg},patternType:'solid'}}},
            {v:c.ct_pp||'', s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:c.ct_pp==='CT'?BLEU:'00AACC'}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'center'}}},
            {v:c.cours_per||0, s:{font:{name:'Calibri',sz:9},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'right'}}},
            {v:'—', s:{font:{name:'Calibri',sz:9,color:{rgb:'9CA3AF'}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'right'}}},
            {v:c.cours_per||0, s:{font:{name:'Calibri',sz:9,bold:true},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'right'}}},
          ]);
        });
        // Ligne autonomie séparée (une par UE)
        const autUE = u.cours.find(c => (c.ue_autonomie||0) > 0)?.ue_autonomie || 0;
        if (autUE > 0) {
          rows.push([
            {v:'', s:{font:{name:'Calibri',sz:9},fill:{fgColor:{rgb:'FFFDE7'},patternType:'solid'}}},
            {v:'Autonomie', s:{font:{name:'Calibri',sz:9,italic:true,color:{rgb:'6B7280'}},fill:{fgColor:{rgb:'FFFDE7'},patternType:'solid'}}},
            {v:'Auto', s:{font:{name:'Calibri',sz:9,color:{rgb:'6B7280'}},fill:{fgColor:{rgb:'FFFDE7'},patternType:'solid'},alignment:{horizontal:'center'}}},
            {v:'—', s:{font:{name:'Calibri',sz:9,color:{rgb:'9CA3AF'}},fill:{fgColor:{rgb:'FFFDE7'},patternType:'solid'},alignment:{horizontal:'right'}}},
            {v:autUE, s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:'D97706'}},fill:{fgColor:{rgb:'FFFDE7'},patternType:'solid'},alignment:{horizontal:'right'}}},
            {v:autUE, s:{font:{name:'Calibri',sz:9,bold:true},fill:{fgColor:{rgb:'FFFDE7'},patternType:'solid'},alignment:{horizontal:'right'}}},
          ]);
        }
        rows.push([
          {v:`Sous-total UE ${u.ue_num}`, s:{font:{name:'Calibri',sz:9,italic:true,color:{rgb:'6B7280'}},fill:{fgColor:{rgb:SOUS},patternType:'solid'},alignment:{horizontal:'right'}}},
          '','',
          {v:u.tot_per, s:{font:{name:'Calibri',sz:9,bold:true},fill:{fgColor:{rgb:SOUS},patternType:'solid'},alignment:{horizontal:'right'}}},
          {v:u.tot_aut, s:{font:{name:'Calibri',sz:9,color:{rgb:'6B7280'}},fill:{fgColor:{rgb:SOUS},patternType:'solid'},alignment:{horizontal:'right'}}},
          {v:u.tot_per+u.tot_aut, s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:BLEU}},fill:{fgColor:{rgb:SOUS},patternType:'solid'},alignment:{horizontal:'right'}}},
        ]);
        rows.push([]);
      }
    }
    rows.push([
      {v:`TOTAL — ${d.section}`, s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU},patternType:'solid'}}},
      '','',
      {v:d.grand_ct+d.grand_pp, s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU},patternType:'solid'},alignment:{horizontal:'right'}}},
      {v:d.grand_aut, s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU},patternType:'solid'},alignment:{horizontal:'right'}}},
      {v:d.grand_ct+d.grand_pp+d.grand_aut, s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU},patternType:'solid'},alignment:{horizontal:'right'}}},
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:14},{wch:48},{wch:7},{wch:8},{wch:8},{wch:8}];
    XLSX.utils.book_append_sheet(wb, ws, d.section.slice(0,31));
    XLSX.writeFile(wb, `Grille_${d.section}_${d.annee}.xlsx`);
  }

  function genererRapportEtpHtml(d, filtres) {
    if (d.error) { informer(d.error); return; }
    const secCode = filtres.section || '';
    const sec = (d.sections || []).find(s => s.section === secCode);
    if (!sec) { informer('Aucune donnée ETP pour cette section. Choisissez une section.'); return; }

    /* LA PIÈCE IMPRIMÉE GARDE LA CHARTE EN HEXADÉCIMAL (CLAUDE.md §6) : elle
       vit dans un cadre d'aperçu et part en PDF, où `var(--c-…)` ne s'évalue
       pas. Gabarit B — le rapport : une rangée de tuiles (le bloc signalé, à
       ses mesures de papier), puis le détail. Aucun fond teinté, aucune
       couleur sur le texte ; le violet ne dit que la faveur, il sort d'ici. */
    const MARINE = '#1B2B4B', OR = '#C9A84C', HELB = '#D14F8A';
    const BANDE_BLOC = { BA1: ['#E8890C', '#FFFFFF'], BA2: ['#7FB3D5', '#123047'],
      BA3: ['#1B2B4B', '#FFFFFF'], Autres: ['#2D4470', '#FFFFFF'] };
    const fmt = n => Math.round(n || 0).toLocaleString('fr-BE').replace(/ /g, ' ');
    const fmtEtp = n => (n || 0).toFixed(4).replace('.', ',');
    const fmtEtp2 = n => (n || 0).toFixed(2).replace('.', ',');
    const fmtRatio = v => (v == null ? '—' : String(v).replace('.', ','));

    // Niveau d'une UE (BA1/BA2/BA3) ; fallback "Autres"
    const nivDe = u => {
      const m = String(u.ue_niv || '').match(/\d+/);
      return m ? `BA${m[0]}` : (u.ue_niv || 'Autres');
    };
    const contratDe = u => (u.etp_helb > 0 && u.etp_iip <= 0) ? 'HELB' : 'IIP';
    const cellPer = u => {
      const ct = (u.per_ct || 0) + (u.per_ct_helb || 0);
      const pp = (u.per_pp || 0) + (u.per_pp_helb || 0);
      const parts = [];
      if (ct) parts.push(`<span class="nw"><b>CT</b> ${fmt(ct)}</span>`);
      if (pp) parts.push(`<span class="nw"><b>PP</b> ${fmt(pp)}</span>`);
      return parts.join(' · ') || '—';
    };
    const perTot = u => (u.per_ct || 0) + (u.per_pp || 0) + (u.per_ct_helb || 0) + (u.per_pp_helb || 0);
    // HELB garde sa couleur de contrat (le rose de l'écran) en pastille pleine ;
    // IIP, le cas courant, reste une étiquette au trait.
    const badge = c => c === 'IIP'
      ? '<span class="etiq">IIP</span>'
      : `<span class="marque" style="background:${HELB}">${c}</span>`;

    /** Une tuile : la valeur d'abord, le libellé dessous, la précision en gris. */
    const tuile = ({ valeur, unite = '', libelle, precision = '', fort = false }) => `
      <div class="tuile${fort ? ' fort' : ''}">
        <div class="t-val">${valeur}${unite ? `<span class="t-u">${unite}</span>` : ''}</div>
        <div class="t-lib">${libelle}</div>
        ${precision ? `<div class="t-fin">${precision}</div>` : ''}
      </div>`;

    // Regrouper les UE par niveau
    const ordreNiv = ['BA1', 'BA2', 'BA3', 'Autres'];
    const parNiv = {};
    for (const u of sec.ues) { (parNiv[nivDe(u)] ||= []).push(u); }
    const niveaux = Object.keys(parNiv).sort((a, b) => {
      const ia = ordreNiv.indexOf(a), ib = ordreNiv.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });

    const NIV_NOM = { BA1: 'Bloc 1 (BA1)', BA2: 'Bloc 2 (BA2)', BA3: 'Bloc 3 (BA3)', Autres: 'Autres' };

    let blocs = '';
    for (const niv of niveaux) {
      const ues = parNiv[niv].sort((a, b) => String(a.ue_num).localeCompare(String(b.ue_num), 'fr', { numeric: true }));
      let nPer = 0, nEtp = 0, nIipPer = 0, nIipEtp = 0, nHelbPer = 0, nHelbEtp = 0;
      let lignes = '';
      // La part de chaque UE se rapporte au TOTAL du bloc, connu d'avance — le
      // total courant faisait afficher 100 % à la première UE (3 octobre 2026).
      const totalBloc = ues.reduce((t, x) => t + perTot(x), 0);
      ues.forEach((u) => {
        const c = contratDe(u);
        const pt = perTot(u);
        nPer += pt; nEtp += u.etp_total;
        if (c === 'IIP') { nIipPer += pt; nIipEtp += u.etp_total; } else { nHelbPer += pt; nHelbEtp += u.etp_total; }
        lignes += `
          <tr>
            <td class="ue">UE ${u.ue_num}</td>
            <td class="lib">${u.ue_nom || '—'}${u.ects ? ` <span class="etiq">${u.ects} ECTS</span>` : ''}</td>
            <td class="c">${badge(c)}</td>
            <td class="n">${u.nb_inscrits != null ? fmt(u.nb_inscrits) : '—'}</td>
            <td class="n">${cellPer(u)}</td>
            <td class="n gris">${totalBloc > 0 ? Math.round(pt/totalBloc*100) + '%' : ''}</td>
            <td class="n">${fmt(pt)}</td>
            <td class="n g">${fmtEtp(u.etp_total)}</td>
          </tr>`;
      });
      const [fond, encre] = BANDE_BLOC[niv] || BANDE_BLOC.Autres;
      blocs += `
        <div class="bloc">
          <div class="bande" style="background:${fond};color:${encre}">${NIV_NOM[niv] || niv}</div>
          <table class="detail">
            <colgroup>
              <col style="width:15mm"><col><col style="width:15mm"><col style="width:15mm"><col style="width:30mm">
              <col style="width:10mm"><col style="width:18mm"><col style="width:18mm">
            </colgroup>
            <thead>
              <tr>
                <th>UE</th><th>Intitulé</th><th class="c">Contrat</th>
                <th class="n" title="Étudiants inscrits à l'unité cette année, rattachés à la section">Inscrits</th>
                <th class="n">Périodes (CT / PP)</th><th class="n">%</th>
                <th class="n">Périodes</th><th class="n">ETP</th>
              </tr>
            </thead>
            <tbody>${lignes}</tbody>
            <tfoot>
              ${nIipEtp > 0 ? `<tr class="dont">
                <td colspan="5">dont IIP</td>
                <td class="n">${nPer > 0 ? Math.round(nIipPer/nPer*100) + '%' : ''}</td>
                <td class="n">${fmt(nIipPer)}</td>
                <td class="n">${fmtEtp(nIipEtp)}</td>
              </tr>` : ''}
              ${nHelbEtp > 0 ? `<tr class="dont">
                <td colspan="5">dont HELB</td>
                <td class="n">${nPer > 0 ? Math.round(nHelbPer/nPer*100) + '%' : ''}</td>
                <td class="n">${fmt(nHelbPer)}</td>
                <td class="n">${fmtEtp(nHelbEtp)}</td>
              </tr>` : ''}
              <tr class="repere">
                <td colspan="5" class="r">Sous-total ${niv}</td>
                <td class="n gris">100%</td>
                <td class="n">${fmt(nPer)}</td>
                <td class="n">${fmtEtp(nEtp)}</td>
              </tr>
            </tfoot>
          </table>
        </div>`;
    }

    // Totaux section
    const sourceEtu = filtres.source_etudiants || 'auto';
    const nbEtus = sourceEtu === 'auto'
      ? (sec.nb_etudiants || 0)
      : (parseInt(filtres.nb_etudiants_estimes) || 0);
    const sourceLabel = sourceEtu === 'auto'
      ? (sec.nb_etudiants > 0 ? `données Lucie ${annee}` : 'aucune donnée Lucie')
      : 'estimation manuelle';
    const totEtp = sec.etp_total, iipEtp = sec.etp_iip, helbEtp = sec.etp_helb;
    const coordEtp = sec.etp_coord_helb || 0;
    const globalEtp = totEtp + coordEtp; // cours + coordination
    const ratioGlobal = globalEtp > 0 && nbEtus > 0 ? (nbEtus / globalEtp).toFixed(1) : null;
    const ratioCours  = totEtp > 0  && nbEtus > 0 ? (nbEtus / totEtp).toFixed(1)   : null;
    const ratioCoord  = coordEtp > 0 && nbEtus > 0 ? (nbEtus / coordEtp).toFixed(1) : null;
    const totPer = sec.ues.reduce((s, u) => s + perTot(u), 0);
    const totCt = sec.ues.reduce((s, u) => s + (u.per_ct || 0) + (u.per_ct_helb || 0), 0);
    const totPp = sec.ues.reduce((s, u) => s + (u.per_pp || 0) + (u.per_pp_helb || 0), 0);
    const iipCt = sec.ues.reduce((s, u) => s + (u.per_ct || 0), 0);
    const iipPp = sec.ues.reduce((s, u) => s + (u.per_pp || 0), 0);
    const helbCt = sec.ues.reduce((s, u) => s + (u.per_ct_helb || 0), 0);
    const helbPp = sec.ues.reduce((s, u) => s + (u.per_pp_helb || 0), 0);
    const pctIip = globalEtp ? Math.round(iipEtp / globalEtp * 100) : 0;
    const pctHelb = globalEtp ? Math.round(helbEtp / globalEtp * 100) : 0;
    const pctCoord = globalEtp ? Math.round(coordEtp / globalEtp * 100) : 0;

    const tuilesCharge = [
      tuile({ valeur: fmtEtp2(globalEtp), unite: 'ETP', libelle: 'Charge globale', fort: true,
        precision: `Cours (${fmt(totPer)} pér.) + coordination HELB` }),
      tuile({ valeur: fmtEtp2(iipEtp), unite: 'ETP', libelle: 'Cours IIP',
        precision: `CT ${fmt(iipCt)} · PP ${fmt(iipPp)} pér. · ${pctIip} %` }),
      tuile({ valeur: fmtEtp2(helbEtp), unite: 'ETP', libelle: 'Cours HELB',
        precision: `CT ${fmt(helbCt)} · PP ${fmt(helbPp)} pér. · ${pctHelb} %` }),
      coordEtp > 0 ? tuile({ valeur: fmtEtp2(coordEtp), unite: 'ETP', libelle: 'Coordination HELB',
        precision: `${(sec.coord_helb || []).length} poste(s) · ${pctCoord} %` }) : '',
    ].join('');
    const tuilesNature = [
      tuile({ valeur: fmtEtp2(totCt / 800), unite: 'ETP', libelle: 'CT — cours théoriques',
        precision: `÷800 · ${fmt(totCt)} pér.` }),
      tuile({ valeur: fmtEtp2(totPp / 1000), unite: 'ETP', libelle: 'PP — pratique professionnelle',
        precision: `÷1000 · ${fmt(totPp)} pér.` }),
    ].join('');
    const tuilesRatios = [
      tuile({ valeur: nbEtus > 0 ? fmt(nbEtus) : '—', unite: nbEtus > 0 ? 'étu.' : '',
        libelle: 'Étudiants', precision: sourceLabel }),
      ...(nbEtus > 0 ? [
        tuile({ valeur: fmtRatio(ratioGlobal), unite: 'étu./ETP', libelle: 'Ratio global' }),
        tuile({ valeur: fmtRatio(ratioCours), unite: 'étu./ETP', libelle: 'Ratio cours' }),
        tuile({ valeur: fmtRatio(ratioCoord), unite: 'étu./ETP', libelle: 'Ratio coordination' }),
      ] : []),
    ].join('');

    const methodologie = `
        <div class="methodo">
          <div class="h">Méthodologie de calcul</div>
          <p>La charge enseignante est exprimée en équivalents temps plein (ETP), calculés selon la législation de l'enseignement pour adultes. Le nombre de périodes attribuées est divisé par le volume annuel correspondant à un temps plein selon la nature de l'activité.</p>
          <div class="regles">
            <div><b>Cours théoriques (CT)</b> : périodes ÷ 800</div>
            <div><b>Pratique professionnelle (PP)</b> : périodes ÷ 1000</div>
            <div><b>Travail administratif</b> : 36 h / semaine</div>
          </div>
          <p>Les périodes intègrent les heures de cours et les heures d'autonomie pédagogique. Le calcul est appliqué de manière identique aux attributions IIP et HELB.</p>
        </div>`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        body{font-family:Arial,sans-serif;color:${MARINE};font-size:9pt;background:#fff}
        @media print{@page{size:A4;margin:18mm 18mm 18mm}tr{page-break-inside:avoid}thead{display:table-header-group}}
        .nw{white-space:nowrap}
        .entete{border-bottom:0.3mm solid ${OR};padding-bottom:3mm;margin-bottom:5mm;display:flex;align-items:center;gap:4mm}
        .entete img{height:14mm;width:auto;flex-shrink:0}
        .surtitre{font-size:7pt;letter-spacing:.25em;text-transform:uppercase;color:#64748B;font-weight:700}
        .titre{font-size:14pt;font-weight:700;margin-top:.6mm}
        .annee{font-size:9pt;color:#475569;margin-top:.4mm}
        .mention{font-size:7.5pt;color:#64748B;margin-top:1mm;line-height:1.35}
        /* LE BLOC SIGNALÉ, À SES MESURES DE PAPIER : celles de la tuile de
           l'écran (Configuration → Thèmes), plus rondes et plus fines (Charles,
           3 octobre 2026) — rail 1 mm qui porte l'état, contour 0,3 mm, rayon
           2,6 mm côté droit, droit côté rail, fond blanc, valeur
           d'abord, libellé dessous, précision en gris. */
        .rangee-titre{font-size:7.5pt;color:#64748B;margin:0 0 1.5mm;font-weight:600}
        .tuiles{display:grid;grid-template-columns:repeat(4,1fr);gap:3mm;margin:0 0 4mm}
        .tuile{background:#fff;border:0.25mm solid #D8DCE4;border-left:0.8mm solid ${MARINE};
               border-radius:0 2.6mm 2.6mm 0;padding:1.8mm 2.8mm 2mm;break-inside:avoid;page-break-inside:avoid}
        .t-val{font-size:12.5pt;font-weight:700;line-height:1.15;font-variant-numeric:tabular-nums}
        .tuile.fort .t-val{font-size:14pt}
        .t-u{font-size:7.5pt;font-weight:400;color:#64748B;margin-left:.8mm}
        .t-lib{font-size:8.5pt;font-weight:600;margin-top:.6mm;color:#33415C}
        .t-fin{font-size:7.2pt;color:#7A879E;margin-top:.3mm}
        h2{font-size:10pt;font-weight:700;margin:6mm 0 2.5mm;padding-bottom:1mm;border-bottom:0.3mm solid ${OR}}
        /* LE TABLEAU N'A QUE DEUX TONS : l'en-tête et la ligne de regroupement
           sur le même ton, la donnée blanche. La bande PORTE la couleur du bloc. */
        .bloc{margin-bottom:5mm;page-break-inside:avoid}
        .bande{font-weight:700;font-size:9pt;padding:1.6mm 3mm;border-radius:1.5mm 1.5mm 0 0}
        table{width:100%;border-collapse:collapse;table-layout:fixed}
        th,td{padding:1.4mm 2mm;font-size:8.5pt;border-bottom:0.25mm solid #C4CDD9;vertical-align:middle}
        th{background:#FAFAFB;color:#64748B;font-size:7.5pt;font-weight:600;text-align:left;border-bottom:0.4mm solid #94A3B8}
        td{background:#fff;font-variant-numeric:tabular-nums}
        .n{text-align:right;white-space:nowrap}
        .c{text-align:center}
        .r{text-align:right}
        .ue,.g{font-weight:700;white-space:nowrap}
        .lib{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
        .gris{color:#64748B}
        tr.dont td{color:#64748B;font-size:8pt;border-bottom:0}
        tr.dont td:first-child{text-align:right}
        tr.repere td{background:#EDF2F8;font-weight:700;border-bottom:0.3pt solid #D6E0EC}
        .etiq{display:inline-block;font-size:6.5pt;font-weight:700;color:#475569;border:0.25mm solid #94A3B8;
              border-radius:1mm;padding:0 1mm;margin-left:1mm;letter-spacing:.2pt;vertical-align:1px}
        .marque{display:inline-block;color:#fff;font-size:6.5pt;font-weight:700;padding:.3mm 1.2mm;border-radius:1mm;letter-spacing:.3pt}
        .coord .fin{font-size:7.5pt;color:#64748B;margin-top:1.5mm;line-height:1.4}
        .methodo{margin-top:6mm;padding:3mm 4mm;background:#FAFAFB;border:0.3mm solid #D8DCE4;border-radius:1.5mm;page-break-inside:avoid}
        .methodo .h{font-size:9pt;font-weight:700;margin-bottom:1.5mm}
        .methodo p{font-size:8pt;color:#475569;line-height:1.45}
        .methodo p + .regles,.methodo .regles + p{margin-top:2mm}
        .regles{display:flex;gap:5mm;font-size:8pt}
      </style></head><body><div>
        <div class="entete">
          <img src="${LOGO_IIP}" alt="Logo IIP" />
          <div>
            <div class="surtitre">Institut Ilya Prigogine · Enseignement pour adultes</div>
            <div class="titre">Rapport de charge ETP — Section ${sec.section}</div>
            <div class="annee">Année académique ${annee}</div>
            <div class="mention">Document destiné au COPIL ou Conseil d'administration basé sur les projections en cours pour l'année académique prochaine sur base des prévisions d'inscriptions${nbEtus > 0 ? ` (simulation sur ${nbEtus} étudiants)` : ''}. Charge enseignante exprimée en équivalents temps plein (ETP).</div>
          </div>
        </div>

        <div class="rangee-titre">Charge globale et détail de la charge</div>
        <div class="tuiles">${tuilesCharge}</div>
        <div class="rangee-titre">Nature des périodes</div>
        <div class="tuiles">${tuilesNature}</div>
        <div class="rangee-titre">Ratios étudiants / ETP${nbEtus > 0 ? ` · ${nbEtus} étudiants (${sourceLabel})` : ''}</div>
        <div class="tuiles">${tuilesRatios}</div>

        <h2>Détail par bloc et par unité d'enseignement</h2>
        ${blocs}

        ${(sec.coord_helb && sec.coord_helb.length > 0) ? `
        <div class="bloc coord">
          <div class="bande" style="background:#2D4470;color:#fff;display:flex;justify-content:space-between">
            <span>Postes de coordination HELB — hors dotation IIP</span>
            <span>${fmtEtp2(sec.etp_coord_helb)} ETP</span>
          </div>
          <table>
            <colgroup><col><col><col style="width:20mm"><col style="width:24mm"></colgroup>
            <thead>
              <tr><th>Personne</th><th>Fonction</th><th class="n">ETP</th><th class="n">≈ pér. (×800)</th></tr>
            </thead>
            <tbody>
              ${sec.coord_helb.map(m => `
              <tr>
                <td>${m.prof_nom} ${m.prof_prenom}</td>
                <td class="gris">${m.fonction}</td>
                <td class="n g">${(m.etp_helb||0).toFixed(2).replace('.',',')}</td>
                <td class="n">${Math.round((m.etp_helb||0)*800)}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr class="repere">
                <td colspan="2">Total coordination HELB</td>
                <td class="n">${fmtEtp2(sec.etp_coord_helb)}</td>
                <td class="n">${Math.round((sec.etp_coord_helb||0)*800)}</td>
              </tr>
            </tfoot>
          </table>
          <div class="fin">
            Ces postes sont financés directement par la HELB et ne sont pas prélevés sur la dotation de périodes IIP.
            La conversion ETP × 800 est indicative (base CT).
          </div>
        </div>
        ` : ''}
${methodologie}
      </div></body></html>`;
    setRapportHtml({ html, nom: nomDoc('Rapport_ETP', sec.section, annee) });
  }

  function genererRapportHtml(d, filtres) {
    if (d.error) { informer(d.error); return; }
    const NIV_PAL = ['var(--c-attente)','var(--c-disponible)','var(--c-texte)','var(--c-faveur)','var(--c-helb)'];
    const niveaux = [...new Set(d.ues?.map(u => u.ue_niv).filter(Boolean))].sort((a,b)=>parseInt(a.match(/\d+$/)?.[0]??99)-parseInt(b.match(/\d+$/)?.[0]??99));
    const getNivCol = niv => NIV_PAL[niveaux.indexOf(niv) % NIV_PAL.length] || '#6b7280';
    const fmt = n => (n != null && n !== '') ? String(n) : '0';
    // Total périodes (pér.+aut.) suivi de l'équivalent heures (1 période = 50 min) entre parenthèses, gris clair
    const fmtTot = (per) => {
      const p = per || 0;
      const h = Math.round(p * 50 / 60);
      return `${fmt(p)} <span style="color:#6b7280;font-weight:400">(${h}h)</span>`;
    };
    // Variante pour fonds foncés (texte total en blanc)
    const fmtTotDark = (per) => {
      const p = per || 0;
      const h = Math.round(p * 50 / 60);
      return `${fmt(p)} <span style="color:rgba(255,255,255,.55);font-weight:400">(${h}h)</span>`;
    };
    const S = 'padding:1px 5px;font-size:10px;line-height:1.2;';
    const SR = S + 'text-align:right;';
    // Affichage du professeur : badge orange si "à désigner" ou non attribué
    const profCell = (nom) => {
      const v = (nom || '').trim();
      const aDesigner = !v || /à\s*d[ée]signer/i.test(v);
      return aDesigner
        ? `<span style="display:inline-block;background:#fff7ed;color:#ea580c;font-weight:700;font-size:9px;padding:2px 8px;border:1px solid #fdba74;border-radius:3px;white-space:nowrap">À désigner</span>`
        : v;
    };
    // Badge du contrat (IIP marine / HELB violet) en regard du nom du MDP
    const contratBadge = (ct) => {
      const c = ct || 'IIP';
      if (c === 'HELB') return `<span style="display:inline-block;background:#8B5CF6;color:#fff;font-size:7.5px;font-weight:700;padding:1px 5px;border-radius:3px;margin-right:5px;vertical-align:middle">HELB</span>`;
      return `<span style="display:inline-block;background:#1B2B4B;color:#fff;font-size:7.5px;font-weight:700;padding:1px 5px;border-radius:3px;margin-right:5px;vertical-align:middle">IIP</span>`;
    };

    // Filtrer par UE si mode rapport-ue
    let ues = d.ues || [];
    if (entite === 'rapport-ue' && filtres.ue_num) {
      ues = ues.filter(u => String(u.ue_num) === String(filtres.ue_num));
    }
    // Filtre tronc commun : 'tc' = uniquement TC, 'hors' = uniquement hors TC
    if (filtres.tc === 'tc')   ues = ues.filter(u => u.ue_tc === 'x');
    if (filtres.tc === 'hors') ues = ues.filter(u => u.ue_tc !== 'x');
    // Filtres niveau / quadrimestre (au niveau UE)
    if (filtres.niveau) ues = ues.filter(u => u.ue_niv === filtres.niveau);
    if (filtres.quad)   ues = ues.filter(u => (u.ue_quad || '').includes(filtres.quad));
    // Filtres au niveau des COURS (contrat, type, nature TH/TP) : on filtre les lignes
    // de chaque UE, et on retire les UE qui n'ont plus aucun cours après filtrage.
    const filtreCours = (c) => {
      if (filtres.contrat && (c.contrat || 'IIP') !== filtres.contrat) return false;
      if (filtres.type_cours && (c.type_cours || '') !== filtres.type_cours) return false;
      if (filtres.helb_nature && (c.helb_nature || '') !== filtres.helb_nature) return false;
      return true;
    };
    if (filtres.contrat || filtres.type_cours || filtres.helb_nature) {
      ues = ues.map(u => {
        const cours = (u.cours || []).filter(filtreCours);
        const total_per = cours.reduce((s,c) => s + (c.periodes||0), 0);
        const total_aut = cours.reduce((s,c) => s + (c.autonomie||0), 0);
        return { ...u, cours, total_per, total_aut };
      }).filter(u => u.cours.length > 0);
    }

    const renderUErap = (ue) => {
      const col = getNivCol(ue.ue_niv);
      const lignesCours = ue.cours.map((c,i) => `
        <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
          <td style="${S}padding-left:20px">${c.code_cours||'—'}</td>
          <td style="${S}max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.cours_nom||'—'}${c.activite_nom?` <em style="color:#6b7280">(${c.activite_nom})</em>`:''}</td>
          <td style="${S}white-space:nowrap;color:#6b7280">Gr.${c.groupe_code}</td>
          <td style="${S}white-space:nowrap">${contratBadge(c.contrat)}${profCell(c.prof_nom)}</td>
          <td style="${SR}color:#374151">${fmt(c.periodes)}</td>
          <td style="${SR}color:#6b7280">${fmt(c.autonomie)}</td>
          <td style="${SR}font-weight:600;border-left:1px solid #e5e7eb">${fmtTot(c.total)}</td>
        </tr>`).join('');
      return `
        <tr style="background:#f1f5f9;border-left:3px solid ${col}">
          <td colspan="4" style="padding:4px 6px 4px 8px;font-weight:700;font-size:12px;color:#111827;white-space:nowrap">
            <span style="background:${col};color:white;font-size:9px;padding:1px 4px;border-radius:2px;margin-right:5px">${ue.ue_niv||''}</span>UE\u00a0${ue.ue_num} — ${ue.ue_nom||''}${ue.ects?` <span style="background:#e0f2fe;color:#0369a1;font-size:8px;font-weight:700;padding:1px 6px;border-radius:3px;margin-left:5px;vertical-align:middle">${ue.ects} ECTS</span>`:''}
          </td>
          <td style="${SR}"></td><td style="${SR}"></td>
          <td style="${SR}border-left:1px solid #e5e7eb"></td>
        </tr>
        ${lignesCours}
        <tr style="background:#e8edf3;border-left:3px solid ${col}">
          <td colspan="4" style="padding:2px 6px 2px 20px;font-size:10px;color:#6b7280;font-style:italic">Sous-total UE\u00a0${ue.ue_num}</td>
          <td style="${SR}font-weight:700;color:#374151">${fmt(ue.total_per)}</td>
          <td style="${SR}font-weight:600;color:#6b7280">${fmt(ue.total_aut)}</td>
          <td style="${SR}font-weight:700;border-left:1px solid #e5e7eb">${fmtTot(ue.total_per+ue.total_aut)}</td>
        </tr>`;
    };
    // Regrouper par organisation : orga 1, puis orga 2, etc., chacune avec son sous-total
    // Détecter les sections présentes (chaque UE porte sa propre section en multi-sections)
    const sectionsPresentes = [...new Set(ues.map(u => u.section).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
    const plusieursSections = sectionsPresentes.length > 1;

    // Vue coordination : fusionne les organisations d'une même UE (par section + ue_num),
    // concatène leurs cours et somme les totaux. Les coordinations voient ainsi tous les
    // cours donnés, sans la mécanique des organisations.
    const fusionnerParUe = (arr) => {
      const m = new Map();
      for (const u of arr) {
        const k = (u.section || '') + '#' + u.ue_num;
        if (!m.has(k)) m.set(k, { ...u, num_organisation: null, cours: [...(u.cours || [])], total_per: u.total_per || 0, total_aut: u.total_aut || 0 });
        else { const e = m.get(k); e.cours.push(...(u.cours || [])); e.total_per += u.total_per || 0; e.total_aut += u.total_aut || 0; }
      }
      const out = [...m.values()];
      out.forEach(u => u.cours.sort((a, b) => (a.code_cours || '').localeCompare(b.code_cours || '', 'fr', { numeric: true })));
      return out;
    };

    // Rendu des UE d'un ensemble donné, regroupées par organisation
    const renderUesParOrga = (uesEnsemble) => {
      // Mode coordination fusionnée : une seule liste d'UE, sans en-têtes d'organisation
      if (filtres.vue === 'fusion') return fusionnerParUe(uesEnsemble).map(renderUErap).join('');
      const orgas = [...new Set(uesEnsemble.map(u => u.num_organisation || 1))].sort((a,b) => a - b);
      const plusieursOrgas = orgas.length > 1;
      return orgas.map(org => {
        const uesOrg = uesEnsemble.filter(u => (u.num_organisation || 1) === org);
        const totP = uesOrg.reduce((s,u) => s + (u.total_per||0), 0);
        const totA = uesOrg.reduce((s,u) => s + (u.total_aut||0), 0);
        const enTete = plusieursOrgas
          ? `<tr style="background:#1B2B4B"><td colspan="7" style="padding:5px 8px"><span style="background:${org>1?'#7c3aed':'#475569'};color:white;font-size:10px;padding:2px 8px;border-radius:3px">Organisation ${org}</span></td></tr>`
          : '';
        const sousTotalOrg = plusieursOrgas
          ? `<tr style="background:#cbd5e1;border-top:2px solid #475569">
              <td colspan="4" style="padding:3px 8px;font-weight:700;font-size:11px;color:#1B2B4B">Sous-total Organisation ${org}</td>
              <td style="${SR}font-weight:700;color:#1B2B4B">${fmt(totP)}</td>
              <td style="${SR}font-weight:700;color:#1B2B4B">${fmt(totA)}</td>
              <td style="${SR}font-weight:700;color:#1B2B4B;border-left:1px solid #94a3b8">${fmtTot(totP+totA)}</td>
            </tr>`
          : '';
        return enTete + uesOrg.map(renderUErap).join('') + sousTotalOrg;
      }).join('');
    };

    let lignesUE;
    if (plusieursSections) {
      // Un bloc par section, avec en-tête de section et sous-total de section
      lignesUE = sectionsPresentes.map(sec => {
        const uesSec = ues.filter(u => u.section === sec);
        const secP = uesSec.reduce((s,u)=>s+(u.total_per||0),0);
        const secA = uesSec.reduce((s,u)=>s+(u.total_aut||0),0);
        const enTeteSec = `<tr style="background:#C9A84C"><td colspan="7" style="padding:6px 8px;font-weight:700;font-size:13px;color:#1B2B4B;letter-spacing:.5px">${sec}</td></tr>`;
        const sousTotalSec = `<tr style="background:#1B2B4B;color:white;border-top:2px solid #C9A84C">
            <td colspan="4" style="padding:4px 8px;font-weight:700;font-size:11px">Sous-total ${sec}</td>
            <td style="${SR}font-weight:700;color:white">${fmt(secP)}</td>
            <td style="${SR}font-weight:700;color:white">${fmt(secA)}</td>
            <td style="${SR}font-weight:700;color:white;border-left:1px solid rgba(255,255,255,.3)">${fmtTotDark(secP+secA)}</td>
          </tr>`;
        return enTeteSec + renderUesParOrga(uesSec) + sousTotalSec;
      }).join('');
    } else {
      lignesUE = renderUesParOrga(ues);
    }
    const totalPer = ues.reduce((s,u)=>s+u.total_per,0);
    const totalAut = ues.reduce((s,u)=>s+u.total_aut,0);
    const titre = entite === 'rapport-ue' && filtres.ue_num
      ? `UE ${filtres.ue_num} — ${d.section}`
      : `${d.section}`;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb}@media print{@page{margin:10mm;size:A4 landscape}tr{page-break-inside:avoid}thead{display:table-header-group}}</style>
      </head><body><div style="padding:10mm">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #1B2B4B;padding-bottom:6px;margin-bottom:10px">
          <div>
            <div style="font-size:16px;font-weight:700;color:#1B2B4B">Attributions — ${titre}</div>
            <div style="font-size:11px;color:#6b7280">Année scolaire ${annee}</div>
          </div>
          <div style="font-size:9px;color:#9ca3af">Généré le ${new Date().toLocaleDateString('fr-BE')} · Lucie · IIP</div>
        </div>
        <table><thead>
          <tr style="background:#1B2B4B;color:white">
            <th style="padding:3px 5px;text-align:left;font-size:10px">Code</th>
            <th style="padding:3px 5px;text-align:left;font-size:10px">Cours</th>
            <th style="padding:3px 5px;text-align:left;font-size:10px">Gr.</th>
            <th style="padding:3px 5px;text-align:left;font-size:10px">Professeur</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Pér.</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px">Aut.</th>
            <th style="padding:3px 5px;text-align:right;font-size:10px;border-left:1px solid rgba(255,255,255,.3)">Total</th>
          </tr>
        </thead><tbody>
          ${lignesUE}
          <tr style="background:#1B2B4B;color:white">
            <td colspan="4" style="padding:4px 6px;font-weight:700;font-size:12px">TOTAL — ${titre}</td>
            <td style="${SR}font-weight:700;color:white">${fmt(totalPer)}</td>
            <td style="${SR}font-weight:700;color:white">${fmt(totalAut)}</td>
            <td style="${SR}font-weight:700;color:white;border-left:1px solid rgba(255,255,255,.3)">${fmtTotDark(totalPer+totalAut)}</td>
          </tr>
        </tbody></table>
      </div></body></html>`;
    const nomRapport = entite === 'rapport-ue'
      ? nomDoc('Rapport_UE', filtres.ue_num ? `UE${filtres.ue_num}` : '', filtres.section, annee)
      : nomDoc('Rapport_Section', filtres.section, annee);
    setRapportHtml({ html, nom: nomRapport });
  }

  /** Le rapport ETP en tableur : les mêmes lignes que la pièce, des NOMBRES
      (et non du texte mis en forme) pour que la HELB et le CA puissent compter. */
  function genererRapportEtpExcel(d, filtres) {
    if (d.error) { informer(d.error); return; }
    const sec = (d.sections || []).find(s => s.section === (filtres.section || ''));
    if (!sec) { informer('Aucune donnée ETP pour cette section. Choisissez une section.'); return; }
    const nivDe = u => { const m = String(u.ue_niv || '').match(/\d+/); return m ? `BA${m[0]}` : (u.ue_niv || 'Autres'); };
    const contratDe = u => (u.etp_helb > 0 && u.etp_iip <= 0) ? 'HELB' : 'IIP';
    const ct = u => (u.per_ct || 0) + (u.per_ct_helb || 0);
    const pp = u => (u.per_pp || 0) + (u.per_pp_helb || 0);
    const arr = (n, k = 4) => Math.round((n || 0) * 10 ** k) / 10 ** k;
    const ordre = ['BA1', 'BA2', 'BA3', 'Autres'];
    const parNiv = {};
    for (const u of sec.ues) (parNiv[nivDe(u)] ||= []).push(u);
    const niveaux = Object.keys(parNiv).sort((a, b) => ((ordre.indexOf(a) + 1) || 99) - ((ordre.indexOf(b) + 1) || 99));

    const rows = [
      [`Rapport de charge ETP — Section ${sec.section}`],
      [`Année académique ${annee}`],
      [],
      ['Bloc', 'UE', 'Intitulé', 'ECTS', 'Contrat', 'Inscrits', 'Périodes CT', 'Périodes PP', 'Périodes', '% du bloc', 'ETP'],
    ];
    for (const niv of niveaux) {
      const ues = parNiv[niv].sort((a, b) => String(a.ue_num).localeCompare(String(b.ue_num), 'fr', { numeric: true }));
      const totalBloc = ues.reduce((t, u) => t + ct(u) + pp(u), 0);
      let nEtp = 0;
      for (const u of ues) {
        const pt = ct(u) + pp(u);
        nEtp += u.etp_total || 0;
        rows.push([niv, u.ue_num, u.ue_nom || '', u.ects || '', contratDe(u),
          u.nb_inscrits ?? '', ct(u), pp(u), pt, totalBloc > 0 ? Math.round(pt / totalBloc * 100) / 100 : '', arr(u.etp_total)]);
      }
      rows.push(['', '', `Sous-total ${niv}`, '', '', '', ues.reduce((t, u) => t + ct(u), 0), ues.reduce((t, u) => t + pp(u), 0), totalBloc, 1, arr(nEtp)]);
      rows.push([]);
    }
    const coord = sec.etp_coord_helb || 0;
    const nbEtus = (filtres.source_etudiants || 'auto') === 'auto' ? (sec.nb_etudiants || 0) : (parseInt(filtres.nb_etudiants_estimes) || 0);
    const glob = (sec.etp_total || 0) + coord;
    rows.push(['Synthèse']);
    rows.push(['', '', 'Cours IIP (ETP)', '', '', '', '', '', '', '', arr(sec.etp_iip)]);
    rows.push(['', '', 'Cours HELB (ETP)', '', '', '', '', '', '', '', arr(sec.etp_helb)]);
    if (coord > 0) rows.push(['', '', 'Coordination HELB (ETP)', '', '', '', '', '', '', '', arr(coord)]);
    rows.push(['', '', 'Charge globale (ETP)', '', '', '', '', '', '', '', arr(glob)]);
    rows.push(['', '', 'Étudiants', '', '', '', '', '', '', '', nbEtus || '']);
    if (nbEtus > 0 && glob > 0) rows.push(['', '', 'Ratio global (étu./ETP)', '', '', '', '', '', '', '', arr(nbEtus / glob, 1)]);
    rows.push([]);
    rows.push(['CT : périodes ÷ 800 · PP : périodes ÷ 1000']);

    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 7 }, { wch: 6 }, { wch: 48 }, { wch: 6 }, { wch: 8 }, { wch: 9 }, { wch: 11 }, { wch: 11 }, { wch: 10 }, { wch: 9 }, { wch: 10 }];
    // Formats : la part du bloc en pourcentage, l'ETP à quatre décimales.
    const plage = XLSX.utils.decode_range(ws['!ref']);
    for (let r = 4; r <= plage.e.r; r++) {
      const p = ws[XLSX.utils.encode_cell({ r, c: 9 })]; if (p && typeof p.v === 'number') p.z = '0%';
      const lib = String(ws[XLSX.utils.encode_cell({ r, c: 2 })]?.v || '');
      const e = ws[XLSX.utils.encode_cell({ r, c: 10 })];
      if (e && typeof e.v === 'number') e.z = /^(Étudiants|Ratio)/.test(lib) ? '0.0' : '0.0000';
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `ETP ${sec.section}`.slice(0, 31));
    XLSX.writeFile(wb, `${nomDoc('Rapport_ETP', sec.section, annee)}.xlsx`);
  }

  function genererRapportExcel(d, filtres) {
    if (d.error) { informer(d.error); return; }
    const BLEU = '1B2B4B', TURQ = '00AACC', GRIS = 'F1F5F9', SOUS = 'E8EDF3', ZEBRE = 'F9FAFB';
    const NIV_PAL = ['F97316','60A5FA','1E3A8A','A855F7','EC4899'];
    const niveaux = [...new Set(d.ues?.map(u => u.ue_niv).filter(Boolean))].sort((a,b)=>parseInt(a.match(/\d+$/)?.[0]??99)-parseInt(b.match(/\d+$/)?.[0]??99));
    const getNivCol = niv => NIV_PAL[niveaux.indexOf(niv) % NIV_PAL.length] || '6b7280';
    const fmt = n => n||0;
    const hdr = (v, bg, fg='FFFFFF', bold=false) => ({ v, s:{font:{name:'Calibri',sz:9,bold,color:{rgb:fg}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'left',vertical:'center'}}});

    let ues = d.ues || [];
    if (entite === 'rapport-ue' && filtres.ue_num) ues = ues.filter(u => String(u.ue_num) === String(filtres.ue_num));
    if (filtres.tc === 'tc')   ues = ues.filter(u => u.ue_tc === 'x');
    if (filtres.tc === 'hors') ues = ues.filter(u => u.ue_tc !== 'x');
    if (filtres.niveau) ues = ues.filter(u => u.ue_niv === filtres.niveau);
    if (filtres.quad)   ues = ues.filter(u => (u.ue_quad || '').includes(filtres.quad));
    if (filtres.contrat || filtres.type_cours || filtres.helb_nature) {
      const fc = (c) => {
        if (filtres.contrat && (c.contrat || 'IIP') !== filtres.contrat) return false;
        if (filtres.type_cours && (c.type_cours || '') !== filtres.type_cours) return false;
        if (filtres.helb_nature && (c.helb_nature || '') !== filtres.helb_nature) return false;
        return true;
      };
      ues = ues.map(u => {
        const cours = (u.cours || []).filter(fc);
        return { ...u, cours, total_per: cours.reduce((s,c)=>s+(c.periodes||0),0), total_aut: cours.reduce((s,c)=>s+(c.autonomie||0),0) };
      }).filter(u => u.cours.length > 0);
    }

    const rows = [
      [{ v:`Attributions — ${d.section}`, s:{font:{name:'Calibri',sz:14,bold:true,color:{rgb:BLEU}}}}],
      [{ v:`Année scolaire ${annee}`, s:{font:{name:'Calibri',sz:10,color:{rgb:'6B7280'}}}}],
      [],
      [hdr('Code',BLEU,'FFFFFF',true), hdr('Cours',BLEU,'FFFFFF',true), hdr('Gr.',BLEU,'FFFFFF',true), hdr('Professeur',BLEU,'FFFFFF',true),
       {...hdr('Pér.',BLEU,'FFFFFF',true), s:{...hdr('Pér.',BLEU,'FFFFFF',true).s, alignment:{horizontal:'right',vertical:'center'}}},
       {...hdr('Aut.',BLEU,'FFFFFF',true), s:{...hdr('Aut.',BLEU,'FFFFFF',true).s, alignment:{horizontal:'right',vertical:'center'}}},
       {...hdr('Total',BLEU,'FFFFFF',true), s:{...hdr('Total',BLEU,'FFFFFF',true).s, alignment:{horizontal:'right',vertical:'center'}}}],
    ];

    for (const ue of ues) {
      const col = getNivCol(ue.ue_niv);
      rows.push([{ v:`UE ${ue.ue_num}${ue.ue_niv?' ['+ue.ue_niv+']':''} — ${ue.ue_nom}`, s:{font:{name:'Calibri',sz:10,bold:true,color:{rgb:BLEU}},fill:{fgColor:{rgb:GRIS},patternType:'solid'}}},'','','','','','']);
      ue.cours.forEach((c,i) => {
        const bg = i%2===0?'FFFFFF':ZEBRE;
        rows.push([
          {v:c.code_cours||'',s:{font:{name:'Calibri',sz:9,color:{rgb:'374151'}},fill:{fgColor:{rgb:bg},patternType:'solid'}}},
          {v:c.cours_nom||'',s:{font:{name:'Calibri',sz:9,color:{rgb:'374151'}},fill:{fgColor:{rgb:bg},patternType:'solid'}}},
          {v:`Gr.${c.groupe_code}`,s:{font:{name:'Calibri',sz:9,color:{rgb:'6B7280'}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'center'}}},
          {v:c.prof_nom||'—',s:{font:{name:'Calibri',sz:9,color:{rgb:'374151'}},fill:{fgColor:{rgb:bg},patternType:'solid'}}},
          {v:fmt(c.periodes),s:{font:{name:'Calibri',sz:9,color:{rgb:'374151'}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'right'}}},
          {v:fmt(c.autonomie),s:{font:{name:'Calibri',sz:9,color:{rgb:'6B7280'}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'right'}}},
          {v:fmt(c.total),s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:BLEU}},fill:{fgColor:{rgb:bg},patternType:'solid'},alignment:{horizontal:'right'}}},
        ]);
      });
      rows.push([
        {v:`Sous-total UE ${ue.ue_num}`,s:{font:{name:'Calibri',sz:9,italic:true,color:{rgb:'6B7280'}},fill:{fgColor:{rgb:SOUS},patternType:'solid'},alignment:{horizontal:'right'}}},'','','',
        {v:fmt(ue.total_per),s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:'374151'}},fill:{fgColor:{rgb:SOUS},patternType:'solid'},alignment:{horizontal:'right'}}},
        {v:fmt(ue.total_aut),s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:'6B7280'}},fill:{fgColor:{rgb:SOUS},patternType:'solid'},alignment:{horizontal:'right'}}},
        {v:fmt(ue.total_per+ue.total_aut),s:{font:{name:'Calibri',sz:9,bold:true,color:{rgb:BLEU}},fill:{fgColor:{rgb:SOUS},patternType:'solid'},alignment:{horizontal:'right'}}},
      ]);
      rows.push([]);
    }
    const totalPer = ues.reduce((s,u)=>s+u.total_per,0);
    const totalAut = ues.reduce((s,u)=>s+u.total_aut,0);
    rows.push([
      {v:`TOTAL — ${d.section}`,s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU},patternType:'solid'}}},'','','',
      {v:totalPer,s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU},patternType:'solid'},alignment:{horizontal:'right'}}},
      {v:totalAut,s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU},patternType:'solid'},alignment:{horizontal:'right'}}},
      {v:totalPer+totalAut,s:{font:{name:'Calibri',sz:11,bold:true,color:{rgb:'FFFFFF'}},fill:{fgColor:{rgb:BLEU},patternType:'solid'},alignment:{horizontal:'right'}}},
    ]);

    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{wch:10},{wch:44},{wch:7},{wch:20},{wch:8},{wch:8},{wch:8}];
    XLSX.utils.book_append_sheet(wb, ws, d.section.slice(0,31));
    XLSX.writeFile(wb, `Attributions_${d.section}_${annee}.xlsx`);
  }

  // Colonnes générées à la volée : autant que le professeur le plus chargé
  const colsDyn = (def.colonnesDynamiques && rows?._colonnesCours)
    ? Array.from({ length: rows._colonnesCours }, (_, i) => ({
        key: `${def.colonnesDynamiques}${i + 1}`, label: `Cours ${i + 1}`, defaut: true,
      }))
    : [];
  const colsVisibles = [...def.cols.filter(c => colsActives.has(c.key)), ...colsDyn];
  const parGroupe = !!(def?.filtres?.includes('groupe') && filtres.cours_code && filtres.par_groupe && !filtres.groupe);
  const nomFichier = `lucie_${entite}_${annee}`;

  // Injecte l'orientation choisie + le titre du document dans le HTML du rapport
  function htmlAvecOrientation(html, nom) {
    if (!html) return html;
    const size = orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait';
    // Titre du document (nom du PDF à l'impression) — remplace l'underscore par espace pour lisibilité
    let out = html;
    if (nom && !/<title>/.test(out)) {
      const titre = String(nom).replace(/_/g, ' ');
      out = out.replace('<head>', `<head><title>${titre}</title>`);
    }
    // Remplace toute déclaration @page{...size:...} existante, sinon en injecte une
    if (/@page\s*\{[^}]*size\s*:[^;}]*/.test(out)) {
      return out.replace(/(@page\s*\{[^}]*size\s*:\s*)[^;}]*/g, `$1${size}`);
    }
    return out.replace('</style>', `@page{size:${size};margin:12mm}</style>`);
  }

  const apercuHtml = rapportHtml ? htmlAvecOrientation(rapportHtml.html || rapportHtml, rapportHtml.nom) : null;
  /* UNE PIÈCE QUI COMPOSE SON PROPRE CORPS N'A PAS DE COLONNES À COCHER.
     « Grille de cours » se déclare par `heuresContact`, et ni `rapport` ni
     `grille` : elle tombait donc du côté des listes de données, où l'on met en
     page des colonnes — elle n'en a aucune, et le serveur répondait « Aucune
     colonne à mettre en page » sous une barre de boutons qui ne pouvaient pas
     marcher. Un bouton qui ne peut rien faire est pire qu'un bouton absent. */
  const estRapport = def.rapport || def.grille || def.heuresContact;

  const GROUPES_LABEL = { data: 'À composer — colonnes au choix', rapport: 'Mis en page' };
  const ordreGroupes = ['data', 'rapport'];

  /* LA LISTE DES TYPES : rail de l'écran, ou colonne de la fenêtre.
     Le même contenu, rendu là où il a un sens — un rail flottant n'a rien à
     faire à l'intérieur d'une fenêtre, et une colonne perdue au milieu d'un
     écran non plus. */
  // « ÉTUDIANTS PAR UE » N'EST QUE LA LISTE DES ÉTUDIANTS AVEC UNE UE CHOISIE
  // (2 octobre 2026) : elle ne se propose plus à part.
  const deLAxe = ([k, e]) => (!domaine || e.domaine === domaine) && k !== 'etudiants_ue';
  const groupesTypes = [
    ...(rapports && rapports.length ? [{ label: 'Prêts à imprimer', items: rapports.map(r => ({
      key: `r-${r.id}`, label: r.libelle, icon: IconFileText, actif: rapportVu?.id === r.id,
      onClick: () => setRapportVu(r) })) }] : []),
    ...ordreGroupes.map(grp => ({
    label: GROUPES_LABEL[grp],
    items: Object.entries(ENTITES)
      .filter(deLAxe)
      .filter(([, e]) => (e.groupe || 'data') === grp)
      .map(([k, e]) => ({ key: k, label: e.label,
        icon: TABLER[e.tabler] || IconFileText,
        actif: !rapportVu && entite === k, onClick: () => { setRapportVu(null); changerEntite(k); } })),
  })).filter(g => g.items.length > 0)];

  return (
    <div className={integre ? 'flex min-h-0 flex-1' : 'relative bg-slate-50'}
      style={integre ? undefined : { minHeight: 'calc(100vh - 64px)' }}>

      {/* LA LISTE DES TYPES : colonne de la fenêtre quand on est intégré, rail
          flottant quand l'écran est à soi. Un rail n'a rien à faire dans une
          fenêtre, et une colonne perdue au milieu d'un écran non plus. */}
      {integre ? (
        <div className="w-[240px] border-r border-slate-200 overflow-auto p-2 space-y-3 flex-shrink-0">
          {groupesTypes.map(g => (
            <div key={g.label}>
              <div className="intertitre px-2 pb-1">
                {g.label}
              </div>
              {g.items.map(it => (
                <button key={it.key} onClick={it.onClick}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg text-sm
                    flex items-center gap-2 border
                    ${it.actif ? 'border-iip-blue bg-iip-blue/5 font-medium'
                               : 'border-transparent hover:bg-slate-50'}`}>
                  <it.icon size={15} className="text-slate-400 flex-shrink-0" />
                  <span className="truncate">{it.label}</span>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : (
      <RailLateral
        icon={IconFileExport}
        titre="Listes & rapports"
        sections={[
          { label: 'Documents', items: [
            // La liste réclamée par la Fédération en fin de cycle : elle se
            // tapait à la main dans un Word recopié d'année en année.
            { key: 'diplomes', label: 'Étudiants diplômés', icon: IconCertificate, actif: false,
              onClick: () => setDiplomes(true) },
          ]},
          ...ordreGroupes.map(grp => ({
          label: GROUPES_LABEL[grp],
          items: Object.entries(ENTITES)
            .filter(([, e]) => (e.groupe || 'data') === grp)
            .map(([k, e]) => ({
              key: k, label: e.label, icon: TABLER[e.tabler] || IconFileText,
              actif: entite === k, onClick: () => changerEntite(k),
            })),
        })).filter(s => s.items.length > 0)]}
      />
      )}

      {diplomes && (
        <ListeDiplomes annee={annee} onClose={() => setDiplomes(false)} />
      )}

      {rapportVu && renduRapport && <div className="flex-1 flex min-w-0 min-h-0">{renduRapport(rapportVu)}</div>}
      {/* ── Colonne droite : filtres + contenu ── */}
      <div className={`${integre ? 'flex-1 flex flex-col min-w-0 min-h-0'
                              : 'gouttiere-rail flex flex-col min-w-0'} ${rapportVu && renduRapport ? 'hidden' : ''}`}>

      {/* ── Barre de filtres + actions ── */}
      <div className="flex-shrink-0 bg-white border-b border-slate-200 px-5 py-2.5 flex items-center gap-3 flex-wrap">
        {/* Filtres rapides (sauf rapport-section : pop-up) */}
        {def.filtres.length > 0 && entite !== 'rapport-section' && (<>
          {def.filtres.includes('section') && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Section</span>
              <select value={filtres.section || ''} onChange={e => setFiltres(f => ({ ...f, section: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white min-w-[120px]">
                <option value="">{entite === 'rapport-etp' ? '— Choisir —' : '— Toutes —'}</option>
                {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
              </select>
            </label>
          )}
          {entite === 'rapport-etp' && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Étudiants</span>
              <select value={filtres.source_etudiants || 'auto'}
                onChange={e => setFiltres(f => ({ ...f, source_etudiants: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white">
                <option value="auto">Depuis Lucie (auto)</option>
                <option value="manuel">Saisie manuelle</option>
              </select>
              {(filtres.source_etudiants || 'auto') === 'manuel' && (
                <input type="number" min="0" step="1"
                  value={filtres.nb_etudiants_estimes || ''}
                  onChange={e => setFiltres(f => ({ ...f, nb_etudiants_estimes: e.target.value }))}
                  placeholder="ex: 120"
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm w-24" />
              )}
            </label>
          )}
          {def.filtres.includes('ue_num') && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">UE</span>
              {/* PAS DE REPLI EN SAISIE LIBRE. Quand la liste est vide, c'est
                  qu'il n'y a rien à choisir — un champ ouvert ne ferait
                  qu'inviter à taper un numéro qui ne mène nulle part. On le
                  dit, au lieu de laisser croire. */}
              {ueList.length > 0
                ? <select value={filtres.ue_num || ''} onChange={e => setFiltres(f => ({ ...f, ue_num: e.target.value }))}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white">
                    <option value="">— Toutes les UE —</option>
                    {ueList.map(u => (
                      <option key={u.ue_num} value={u.ue_num}>
                        UE {u.ue_num} — {(u.ue_nom || '').slice(0, 45)}
                      </option>
                    ))}
                  </select>
                : <span className="text-second text-slate-400 italic">
                    aucune unité pour cette année{filtres.section ? ' et cette section' : ''}
                  </span>
              }
            </label>
          )}
          {def.filtres.includes('cours_code') && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Cours</span>
              {filtres.ue_num
                ? <select value={filtres.cours_code || ''}
                    onChange={e => setFiltres(f => ({ ...f, cours_code: e.target.value, groupe: '', par_groupe: false }))}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white">
                    <option value="">— Toute l'unité —</option>
                    {coursList.map(c => (
                      <option key={c.cours_code} value={c.cours_code}>
                        {c.cours_code} — {(c.cours_nom || '').slice(0, 40)}
                      </option>
                    ))}
                  </select>
                : <span className="text-second text-slate-400 italic">choisissez d'abord une UE</span>}
            </label>
          )}
          {def.filtres.includes('groupe') && filtres.cours_code && (
            <>
              <label className="flex items-center gap-2">
                <span className="text-xs text-slate-500">Groupe</span>
                <select value={filtres.groupe || ''}
                  onChange={e => setFiltres(f => ({ ...f, groupe: e.target.value }))}
                  className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white">
                  <option value="">— Tous les groupes —</option>
                  {(rows?.groupesDispo || []).map(g => <option key={g} value={g}>{g}</option>)}
                </select>
              </label>
              {(rows?.groupesDispo || []).length > 1 && !filtres.groupe && (
                <label className="flex items-center gap-2 text-sm text-slate-600"
                  title="À l'impression et à l'envoi : chaque groupe sur sa feuille, sous son nom">
                  <input type="checkbox" checked={!!filtres.par_groupe}
                    onChange={e => setFiltres(f => ({ ...f, par_groupe: e.target.checked }))} />
                  Une page par groupe
                </label>
              )}
            </>
          )}
          {def.filtres.includes('primo') && selectionEtudiants().ids.length > 0 && (
            <label className="flex items-center gap-1.5 text-sm" title="Les étudiants cochés dans la liste des étudiants">
              <input type="checkbox" checked={!!filtres.selection} onChange={e => setFiltres(f => ({ ...f, selection: e.target.checked }))} />
              Seulement les {selectionEtudiants().ids.length} étudiant(s) sélectionné(s)
            </label>
          )}
          {def.filtres.includes('primo') && (
            /* PRIMO OU LES AUTRES (2 octobre 2026) : l'inverse exact se choisit aussi. */
            <select value={filtres.primo === true ? 'primo' : (filtres.primo || '')}
              onChange={e => setFiltres(f => ({ ...f, primo: e.target.value }))}
              title="Primo-arrivé : aucune inscription ni valorisation avant l'année choisie"
              className="controle text-sm">
              <option value="">Primo et déjà inscrits</option>
              <option value="primo">Primo-arrivés</option>
              <option value="anciens">Déjà inscrits avant (non primo)</option>
            </select>
          )}
          {def.filtres.includes('niveau_etu') && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Niveau</span>
              <select value={filtres.niveau_etu || ''}
                onChange={e => setFiltres(f => ({ ...f, niveau_etu: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white">
                <option value="">— Tous —</option>
                <option value="BA1">BA1</option><option value="BA2">BA2</option>
                <option value="BA3">BA3 / diplômant</option>
                <option value="MIXTE">Parcours mixte</option>
                <option value="aucun">Sans niveau</option>
              </select>
            </label>
          )}
          {def.filtres.includes('statut') && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Statut</span>
              <select value={filtres.statut || ''} onChange={e => setFiltres(f => ({ ...f, statut: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white">
                <option value="">— Tous —</option>
                <option value="MDP">MDP</option><option value="EXP">Expert</option><option value="CC">CC</option>
              </select>
            </label>
          )}
          {def.filtres.includes('detail_cours') && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Cours donnés</span>
              <select value={filtres.detail_cours || 'colonne'}
                onChange={e => setFiltres(f => ({ ...f, detail_cours: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white">
                <option value="aucun">Ne pas afficher</option>
                <option value="colonne">Dans une colonne</option>
                <option value="colonnes">Une colonne par cours</option>
              </select>
            </label>
          )}
          {def.filtres.includes('niveau') && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Niveau</span>
              <select value={filtres.niveau || ''} onChange={e => setFiltres(f => ({ ...f, niveau: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white">
                <option value="">— Tous —</option><option value="SUP">SUP</option><option value="DS">DS</option>
              </select>
            </label>
          )}
          {def.filtres.includes('tc') && (
            <label className="flex items-center gap-2">
              <span className="text-xs text-slate-500">Tronc commun</span>
              <select value={filtres.tc || ''} onChange={e => setFiltres(f => ({ ...f, tc: e.target.value }))}
                className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white">
                <option value="">— L'ensemble —</option><option value="tc">TC uniquement</option><option value="hors">Hors TC</option>
              </select>
            </label>
          )}
        </>)}

        {entite === 'rapport-section' && (
          <span className="text-xs text-slate-500 flex items-center gap-1.5">
            <IconFileText size={15} className="text-iip-turquoise" />
            Les critères se choisissent à la génération.
          </span>
        )}

        <span className="flex-1" />

        {/* Sélecteur d'orientation (rapports uniquement) */}
        {estRapport && (
          <div className="flex items-center gap-1 bg-slate-100 rounded-lg p-0.5">
            <button onClick={() => setOrientation('portrait')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${orientation==='portrait'?'bg-white text-slate-800 shadow-pose font-medium':'text-slate-500'}`}>
              Portrait
            </button>
            <button onClick={() => setOrientation('landscape')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${orientation==='landscape'?'bg-white text-slate-800 shadow-pose font-medium':'text-slate-500'}`}>
              Paysage
            </button>
          </div>
        )}

        {/* Bouton générer */}
        <button onClick={generer} disabled={loading}
          className="bouton bouton-fort flex items-center gap-2">
          <IconBolt size={16} />
          {loading ? 'Chargement…' : (entite === 'rapport-section' ? 'Paramétrer & générer' : 'Générer')}
        </button>

        {/* Exports */}
        {rows !== null && (estRapport ? (
          <>
            {/* LE MÊME CHEMIN QUE LES AUTRES LISTES : le serveur produit le
                PDF — A4, pied sur chaque feuille, numérotation au-delà d'une
                page —, et l'impression du navigateur n'est plus que le repli.
                Ces cinq-là composent leur propre corps ; il part donc tel
                quel, déjà enveloppé, sans repasser par la mise en page. */}
            {apercuHtml && (
              <button onClick={async () => {
                  try {
                    const pdf = await fetch('/api/impression/pdf', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json',
                        Authorization: `Bearer ${localStorage.getItem('token')}` },
                      body: JSON.stringify({ html: apercuHtml, nom: def.label,
                                             pagination: 'si-plusieurs' }),
                    });
                    if (pdf.ok) {
                      const url = URL.createObjectURL(await pdf.blob());
                      window.open(url, '_blank');
                      setTimeout(() => URL.revokeObjectURL(url), 60000);
                      return;
                    }
                    ouvrirApercu({ html: apercuHtml, titre: def.label, nomFichier: def.label,
                                   envoiPossible: false });
                  } catch (e) { setError(e.message); }
                }}
                className="text-sm border border-iip-blue text-iip-blue hover:bg-slate-100 px-3 py-2 rounded-lg font-medium flex items-center gap-1.5">
                <IconPrinter size={16} /> Imprimer / PDF
              </button>
            )}
            {/* LES QUATRE SORTIES SONT LES MÊMES PARTOUT. Envoyer n'existait
                que pour les listes de colonnes : une pièce composée partait
                donc par un autre chemin, ou pas du tout. */}
            {apercuHtml && peutGeste('envois.envoyer') && (
              <button onClick={() => setEnvoi([{ html: apercuHtml, nom_fichier: `${nomFichier}.pdf` }])}
                className="text-sm border border-iip-turquoise text-iip-turquoise hover:bg-cyan-50 px-3 py-2 rounded-lg font-medium flex items-center gap-1.5">
                <IconSend size={16} /> Envoyer
              </button>
            )}
            <button onClick={async () => {
                const d = await def.fetch(annee, filtres);
                if (entite === 'rapport-etp') genererRapportEtpExcel(d, filtres);
                else def.grille ? genererGrilleExcel(d) : genererRapportExcel(d, filtres);
              }}
              className="bloc-etat etat-reussi text-sm border-emerald-500 text-emerald-700 hover:bg-emerald-50 px-3 py-2 font-medium flex items-center gap-1.5">
              <IconFileSpreadsheet size={16} /> Excel
            </button>
          </>
        ) : (
          <>
            {/* IMPRIMER EST LA PREMIÈRE ACTION, ici comme dans tous les rails :
                on imprime tous les jours, on exporte quelques fois par an. */}
            <button onClick={async () => {
                try {
                  await imprimerListe(rows, colsVisibles, def.label, annee, def.aide || null, parGroupe);
                } catch (e) { setError(e.message); }
              }}
              disabled={rows.length === 0}
              className="text-sm border border-iip-blue text-iip-blue hover:bg-slate-100 disabled:opacity-40 px-3 py-2 rounded-lg font-medium flex items-center gap-1.5">
              <IconPrinter size={16} /> Imprimer / PDF
            </button>
            {/* ENVOYER EST UNE SORTIE COMME LES AUTRES. La liste part en PDF,
                habillée de la même enveloppe que si on l'imprimait : deux
                chemins qui produiraient deux mises en page finiraient par
                diverger, et c'est celle qu'on n'a pas relue qui partirait. */}
            {peutGeste('envois.envoyer') && <button onClick={async () => {
                try {
                  const html = await mettreEnPage(rows, colsVisibles, def.label, annee, def.aide || null, parGroupe);
                  setEnvoi([{ html, nom_fichier: `${nomFichier}.pdf` }]);
                } catch (e) { setError(e.message); }
              }}
              disabled={rows.length === 0}
              className="text-sm border border-iip-turquoise text-iip-turquoise hover:bg-cyan-50 disabled:opacity-40 px-3 py-2 rounded-lg font-medium flex items-center gap-1.5">
              <IconSend size={16} /> Envoyer
            </button>}
            <button onClick={() => exportCSV(rows, colsVisibles, nomFichier)} disabled={rows.length === 0}
              className="text-sm border border-slate-300 hover:bg-slate-100 disabled:opacity-40 px-3 py-2 rounded-lg text-slate-600 flex items-center gap-1.5">
              <IconDownload size={16} /> CSV
            </button>
            <button onClick={() => exportExcel(rows, colsVisibles, nomFichier)} disabled={rows.length === 0}
              className="bloc-etat etat-reussi text-sm border-emerald-500 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 px-3 py-2 font-medium flex items-center gap-1.5">
              <IconFileSpreadsheet size={16} /> Excel
            </button>
          </>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 mx-5 mt-3 rounded-lg flex-shrink-0 border-l-4 border-l-red-500">{error}</div>}

      {/* ── Zone de contenu ── */}
      <div className="flex-1 min-h-0 overflow-auto">
        {/* État vide */}
        {rows === null && (
          <div className="h-full flex flex-col items-center justify-center text-slate-400 gap-3">
            {(() => { const Ic = TABLER[def.tabler] || IconFileText; return <Ic size={48} stroke={1.2} className="text-slate-300" />; })()}
            <p className="text-sm">Configurez vos filtres puis cliquez sur <b className="text-slate-600">Générer</b>.</p>
          </div>
        )}

        {/* Aperçu rapport (en ligne, comme une feuille) */}
        {rows !== null && estRapport && apercuHtml && (
          <div className="p-5 flex justify-center">
            <div className={`bg-white shadow-flottant rounded-lg overflow-hidden border border-slate-200 ${orientation==='landscape' ? 'w-full max-w-[1100px]' : 'w-full max-w-[820px]'}`}>
              <iframe aria-label="Aperçu" srcDoc={apercuHtml} className="w-full block" style={{ height: '78vh', border: 'none' }} />
            </div>
          </div>
        )}

        {/* Grille de cours — rendu arborescent Section → UE → Cours */}
        {rows !== null && def.heuresContact && (
          <div className="px-5 py-3">
            <HeuresContactView sections={rows} annee={annee} />
          </div>
        )}

        {/* Tableau de données */}
        {rows !== null && !estRapport && !def.heuresContact && (
          <div className="px-5 py-3">
            <div className="text-sm text-slate-600 mb-2">
              <b>{rows.length}</b> résultat{rows.length > 1 ? 's' : ''} · {def.label} · {annee}
              {filtres.section && <span className="ml-1 font-medium text-iip-turquoise">· {filtres.section}</span>}
            </div>
            {/* LES COLONNES, AU-DESSUS DU TABLEAU ET SUR UNE LIGNE (Charles,
                2 octobre 2026 : « mettre cette barre au-dessus… plus simple »). */}
            {def.cols.length > 0 && (
              <div className="flex flex-wrap items-center gap-1 mb-2">
                <span className="text-xs font-semibold text-slate-500 mr-1">Colonnes</span>
                {def.cols.filter(colPermise).map(c => (
                  <button key={c.key} onClick={() => toggleCol(c.key)}
                    className={`text-xs px-2 py-0.5 rounded border transition ${
                      colsActives.has(c.key)
                        ? 'bg-iip-blue text-white border-iip-blue font-semibold'
                        : 'border-slate-300 text-slate-500 hover:border-iip-blue hover:text-iip-blue'
                    }`}>
                    {c.label}
                  </button>
                ))}
                <button onClick={() => setColsActives(new Set(def.cols.filter(colPermise).map(c => c.key)))}
                  className="text-xs text-slate-500 underline ml-1">tout</button>
                <button onClick={() => setColsActives(new Set(def.cols.filter(c => c.defaut).map(c => c.key)))}
                  className="text-xs text-slate-500 underline">par défaut</button>
              </div>
            )}
            <div className="bg-white rounded-lg border border-slate-200 overflow-auto">
              <table className="w-full text-sm border-collapse">
                <thead className="sticky top-0 bg-slate-50 z-10">
                  <tr>
                    {colsVisibles.map(c => (
                      <th key={c.key} className="text-left px-3 py-2 text-xs font-semibold text-slate-600 border-b border-slate-200 whitespace-nowrap">{c.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, i) => (
                    <tr key={i} className={i % 2 ? 'bg-slate-50/50' : ''}>
                      {colsVisibles.map(c => (
                        <td key={c.key} className="px-3 py-1.5 h-9 border-b border-slate-100 text-slate-800 max-w-xs truncate" title={String(row[c.key] ?? '')}>
                          {row[c.key] ?? '—'}
                        </td>
                      ))}
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={colsVisibles.length || 1} className="text-center text-slate-400 py-8">Aucun résultat</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
      </div>

      {envoi && (
        <EnvoiMailModal pieces={envoi} typeDoc="liste"
          sujet={`${def.label} — ${annee}`}
          onClose={() => setEnvoi(null)} />
      )}

      {showOptionsRapport && (
        <Fenetre titre="Paramétrer le rapport" large="petite"
          onFermer={()=>setShowOptionsRapport(false)}
          pied={<>
            <button onClick={()=>{ setFiltres(f=>({ section:f.section, ue_num:f.ue_num })); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline">Réinitialiser les critères</button>
            <span />
            <button onClick={()=>setShowOptionsRapport(false)} className="bouton">Annuler</button>
            <button onClick={()=>{ setShowOptionsRapport(false); genererReel(); }}
              className="bouton bouton-fort">Générer le rapport</button>
          </>}>
            <p className="text-sm text-gray-500 mb-4">Choisissez les critères. Laissez « Tous » pour ne pas filtrer.</p>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">Section(s)</label>
                  <div className="flex gap-2 text-xs">
                    <button onClick={()=>setFiltres(f=>({...f, sections: sections.map(s=> typeof s === 'string' ? s : (s.code ?? s.section ?? '')).filter(Boolean)}))}
                      className="text-iip-gold hover:underline">Toutes</button>
                    <button onClick={()=>setFiltres(f=>({...f, sections: []}))}
                      className="text-gray-400 hover:underline">Aucune</button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto grid grid-cols-2 gap-1">
                  {sections.map(s => {
                    const code = typeof s === 'string' ? s : (s.code ?? s.section ?? '');
                    if (!code) return null;
                    const sel = Array.isArray(filtres.sections) && filtres.sections.includes(code);
                    return (
                      <label key={code} className="inline-flex items-center gap-1.5 text-sm cursor-pointer hover:bg-gray-50 rounded px-1 py-0.5">
                        <input type="checkbox" checked={sel} onChange={()=>setFiltres(f=>{
                          const cur = Array.isArray(f.sections) ? f.sections : [];
                          return { ...f, sections: sel ? cur.filter(x=>x!==code) : [...cur, code] };
                        })} />
                        {code}
                      </label>
                    );
                  })}
                </div>
                <p className="text-xs text-gray-400 mt-1">Aucune cochée = toutes les sections.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contrat</label>
                <select value={filtres.contrat||''} onChange={e=>setFiltres(f=>({...f, contrat:e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Tous</option>
                  <option value="IIP">IIP uniquement</option>
                  <option value="HELB">HELB uniquement</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tronc commun</label>
                <select value={filtres.tc||''} onChange={e=>setFiltres(f=>({...f, tc:e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">L'ensemble</option>
                  <option value="tc">TC uniquement</option>
                  <option value="hors">Hors TC</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Vue</label>
                <select value={filtres.vue||''} onChange={e=>setFiltres(f=>({...f, vue:e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Par organisation <span>— détail des dédoublements</span></option>
                  <option value="fusion">Coordination (fusionnée) — organisations regroupées</option>
                </select>
                <p className="text-xs text-gray-400 mt-1">La vue coordination regroupe les organisations d'une UE : simplement les cours donnés, sans la mécanique de gestion.</p>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Niveau</label>
                <select value={filtres.niveau||''} onChange={e=>setFiltres(f=>({...f, niveau:e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Tous</option>
                  <option value="BA1">BA1</option>
                  <option value="BA2">BA2</option>
                  <option value="BA3">BA3</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Quadrimestre</label>
                <select value={filtres.quad||''} onChange={e=>setFiltres(f=>({...f, quad:e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Tous</option>
                  <option value="Q1">Q1</option>
                  <option value="Q2">Q2</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Type de cours</label>
                <select value={filtres.type_cours||''} onChange={e=>setFiltres(f=>({...f, type_cours:e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Tous</option>
                  <option value="CT">CT (cours généraux)</option>
                  <option value="PP">PP (pratique professionnelle)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Nature HELB (TH/TP)</label>
                <select value={filtres.helb_nature||''} onChange={e=>setFiltres(f=>({...f, helb_nature:e.target.value}))}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm">
                  <option value="">Toutes</option>
                  <option value="CT">TH (théorie)</option>
                  <option value="TP">TP (travaux pratiques)</option>
                </select>
              </div>
            </div>
        </Fenetre>
      )}
    </div>
  );
}


// build final 2.22.1 — 1781701639

/* ══════════════════════ HEURES CONTACT VIEW ══════════════════════ */
function HeuresContactView({ sections, annee }) {
  const [expanded, setExpanded] = useState(() =>
    Object.fromEntries((sections || []).map(s => [s.section, true]))
  );
  const toggle = k => setExpanded(e => ({ ...e, [k]: !e[k] }));

  const ORDRE_BLOC = ['BA1','BA2','BA3','BA4','Autres'];
  const BLOC_LABEL = { BA1:'Bloc 1 (BA1)', BA2:'Bloc 2 (BA2)', BA3:'Bloc 3 (BA3)', BA4:'Bloc 4 (BA4)', Autres:'Autres' };
  const BLOC_COLOR = { BA1:'var(--c-attente)', BA2:'var(--c-disponible)', BA3:'var(--c-texte)', BA4:'var(--c-faveur)', Autres:'#6b7280' };

  const parBloc = (ues) => {
    const map = {};
    for (const u of ues) { const b = u.bloc || 'Autres'; if (!map[b]) map[b] = []; map[b].push(u); }
    return ORDRE_BLOC.filter(b => map[b]).map(b => ({ bloc: b, ues: map[b] }));
  };

  const BLEU = 'var(--c-principal)', TURQ = 'var(--c-accent)', GRIS = '#F4F6FA';

  const imprimer = () => {
    const BCOL = { BA1:'var(--c-attente)', BA2:'var(--c-disponible)', BA3:'var(--c-texte)', BA4:'var(--c-faveur)', Autres:'#6b7280' };
    const BLAB = { BA1:'Bloc 1 (BA1)', BA2:'Bloc 2 (BA2)', BA3:'Bloc 3 (BA3)', BA4:'Bloc 4 (BA4)', Autres:'Autres' };
    const ordrB = ['BA1','BA2','BA3','BA4','Autres'];
    const getBl = ues => { const m={}; for(const u of ues){const b=u.bloc||'Autres';if(!m[b])m[b]=[];m[b].push(u);} return ordrB.filter(b=>m[b]).map(b=>({bloc:b,ues:m[b]})); };

    const sectionHtml = sections.map(s => {
      const blocs = getBl(s.ues);
      const blocsHtml = blocs.map(({bloc, ues}) => {
        const totalH = ues.reduce((a,u)=>a+u.total_heures_ue,0);
        const lignes = ues.map(u => {
          const ueRow = `<tr style="background:#e8edf5;border-top:2px solid ${TURQ}"><td colspan="4" style="padding:3px 6px;font-weight:700;color:${BLEU};font-size:8.5pt">UE ${u.ue_num} — ${u.ue_nom||''}${u.quadrimestre?' · '+u.quadrimestre:''}${u.ects?' · '+u.ects+' ECTS':''}</td></tr>`;
          const coursRows = u.cours.map((c,i)=>`<tr style="background:${i%2===0?'white':GRIS}"><td style="padding:3px 6px;font-family:monospace;color:#6b7280;font-size:8pt">${c.cours_code||''}</td><td style="padding:3px 6px;color:#1a1a2e">${c.cours_nom||''}</td><td style="padding:3px 6px;text-align:center;font-weight:700;color:${c.ct_pp==='CT'?'#1d4ed8':c.ct_pp==='PP'?'#15803d':'#6b7280'}">${c.ct_pp||''}</td><td style="padding:3px 6px;text-align:right;font-weight:700;color:${BLEU}">${c.heures!=null?c.heures+'h':'—'}</td></tr>`).join('');
          const totRow = u.total_heures_ue > 0 ? `<tr style="background:#dbeafe"><td colspan="3" style="padding:2px 6px;text-align:right;color:#374151;font-style:italic;font-size:8pt">Sous-total UE ${u.ue_num}</td><td style="padding:2px 6px;text-align:right;font-weight:600;color:#374151;font-size:8pt">${u.total_heures_ue}h</td></tr>` : '';
          return ueRow + coursRows + totRow;
        }).join('');
        return `<div style="margin-bottom:5mm;page-break-inside:avoid"><div style="background:${BCOL[bloc]||'#6b7280'};color:white;font-weight:700;font-size:10pt;padding:4px 8px;border-radius:3px 3px 0 0">${BLAB[bloc]||bloc}</div><table style="width:100%;border-collapse:collapse;font-size:8.5pt;table-layout:fixed"><colgroup><col style="width:11%"><col style="width:57%"><col style="width:8%"><col style="width:24%"></colgroup><thead><tr style="background:#163A6B;color:white"><th style="padding:4px 6px;text-align:left">Code</th><th style="padding:4px 6px;text-align:left">Cours</th><th style="padding:4px 6px;text-align:center">Type</th><th style="padding:4px 6px;text-align:right;font-weight:700">Hrs cours</th></tr></thead><tbody>${lignes}<tr style="background:${BLEU};color:white"><td colspan="3" style="padding:4px 6px;text-align:right;font-weight:700">Total ${BLAB[bloc]||bloc}</td><td style="padding:4px 6px;text-align:right;font-weight:700">${totalH}h</td></tr></tbody></table></div>`;
      }).join('');
      return `<div style="margin-bottom:8mm"><div style="background:${BLEU};color:white;font-size:11pt;font-weight:700;padding:5px 10px;border-radius:4px 4px 0 0;display:flex;justify-content:space-between;margin-bottom:3mm"><span>${s.section}</span><span style="font-weight:400;font-size:9pt;opacity:.8">${s.ues.length} UE · ${s.total_heures}h</span></div>${blocsHtml}<div style="text-align:right;font-size:8pt;color:#6b7280;padding:2px 4px;border-top:1px solid #d1d5db">Total ${s.section} : <strong>${s.total_heures}h</strong></div></div>`;
    }).join('');

    const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>Grille de cours — ${annee}</title><style>*{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Arial,sans-serif;color:#1a1a2e;font-size:9pt;background:white}@media print{@page{size:A4 portrait;margin:12mm}tr{page-break-inside:avoid}thead{display:table-header-group}}</style></head><body><div style="padding:6mm"><div style="border-bottom:3px solid ${TURQ};padding-bottom:6px;margin-bottom:6mm;display:flex;justify-content:space-between;align-items:flex-end"><div><div style="font-size:7pt;letter-spacing:3px;text-transform:uppercase;color:${TURQ};font-weight:700">Institut Ilya Prigogine · Enseignement pour adultes</div><div style="font-size:16pt;color:${BLEU};font-weight:700;margin-top:2px">Grille de cours</div><div style="font-size:9pt;color:#555;margin-top:1px">Année académique ${annee}</div></div><div style="text-align:right;font-size:8pt;color:#999">Document horaire<br>${new Date().toLocaleDateString('fr-BE',{day:'2-digit',month:'long',year:'numeric'})}</div></div>${sectionHtml}<div style="background:${BLEU};color:white;padding:5px 10px;border-radius:3px;display:flex;justify-content:space-between;font-size:9.5pt"><span>Total général — ${sections.length} section${sections.length>1?'s':''}</span><span style="font-weight:700">${sections.reduce((a,s)=>a+s.total_heures,0)}h</span></div></div></body></html>`;

    ouvrirApercu({ html, titre: 'Grille de cours', sousTitre: annee, nomFichier: `Grille_cours_${annee}`,
                   envoiPossible: false, astuceImpression: 'A4 portrait' });
  };

  if (!sections || sections.length === 0)
    return <div className="text-sm text-gray-400 text-center py-12">Aucune donnée.</div>;

  const totalH = sections.reduce((s, x) => s + x.total_heures, 0);

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <div>
          <div className="text-sm font-semibold text-iip-blue">Grille de cours — {annee}</div>
          <div className="text-xs text-gray-400 mt-0.5">
            {sections.length} section{sections.length > 1 ? 's' : ''} · {totalH}h
          </div>
        </div>
        <button onClick={imprimer}
          className="text-sm border border-iip-blue text-iip-blue hover:bg-slate-100 px-3 py-1.5 rounded-lg flex items-center gap-1.5">
          🖨 Imprimer / PDF
        </button>
      </div>

      <div className="space-y-4">
        {sections.map(s => (
          <div key={s.section} className="border border-gray-200 rounded-xl overflow-hidden">
            <button onClick={() => toggle(s.section)}
              className="w-full flex items-center justify-between px-4 py-2.5 bg-iip-blue text-white hover:opacity-90 transition">
              <span className="font-semibold">{s.section}</span>
              <div className="flex items-center gap-3 text-sm">
                <span className="opacity-80">{s.ues.length} UE</span>
                <span className="font-bold">{s.total_heures}h</span>
                <span>{expanded[s.section] ? '▲' : '▼'}</span>
              </div>
            </button>

            {expanded[s.section] && (
              <div className="p-3 space-y-3">
                {parBloc(s.ues).map(({ bloc, ues }) => {
                  const coulBloc = BLOC_COLOR[bloc] || '#6b7280';
                  const totalBlocH = ues.reduce((a, u) => a + u.total_heures_ue, 0);
                  return (
                    <div key={bloc}>
                      <div className="text-sm font-bold text-white px-3 py-1.5 rounded-t"
                        style={{ background: coulBloc }}>
                        {BLOC_LABEL[bloc] || bloc}
                      </div>
                      <table className="w-full text-xs border-collapse">
                        <thead>
                          <tr style={{ background: 'var(--c-principal)' }}>
                            <th className="text-left px-2 py-1.5 text-white font-medium w-20">Code</th>
                            <th className="text-left px-2 py-1.5 text-white font-medium">Cours</th>
                            <th className="text-center px-2 py-1.5 text-white font-medium w-12">Type</th>
                            <th className="text-right px-2 py-1.5 text-white font-bold w-20">Hrs cours</th>
                          </tr>
                        </thead>
                        <tbody>
                          {ues.map((u) => [
                            <tr key={`ue-${u.ue_num}`} style={{ background: '#e8edf5', borderTop: '2px solid #00AACC4D' }}>
                              <td colSpan={4} className="px-2 py-1 text-xs font-semibold text-iip-blue">
                                <span className="mr-2">UE {u.ue_num}</span>
                                <span className="font-normal text-gray-600">{u.ue_nom}</span>
                                {u.quadrimestre && <span className="ml-2 text-gray-400 font-normal">{u.quadrimestre}</span>}
                                {u.ects > 0 && <span className="ml-2 text-gray-400 font-normal">{u.ects} ECTS</span>}
                              </td>
                            </tr>,
                            ...u.cours.map((c, i) => (
                              <tr key={c.cours_code} className={i % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                                <td className="px-2 py-1 font-mono text-gray-400 text-mention">{c.cours_code}</td>
                                <td className="px-2 py-1 text-gray-700">{c.cours_nom}</td>
                                <td className="px-2 py-1 text-center">
                                  {c.ct_pp && (
                                    <span className={`text-mention font-bold px-1.5 py-0.5 rounded ${c.ct_pp === 'CT' ? 'bg-blue-500 text-white' : 'bg-green-500 text-white'}`}>{c.ct_pp}</span>
                                  )}
                                </td>
                                <td className="px-2 py-1 text-right font-bold text-gray-800">
                                  {c.heures != null ? `${c.heures}h` : '—'}
                                </td>
                              </tr>
                            )),
                            u.total_heures_ue > 0 && (
                              <tr key={`tot-${u.ue_num}`} className="bg-blue-50">
                                <td colSpan={3} className="px-2 py-0.5 text-right text-gray-400 italic text-mention">
                                  Sous-total UE {u.ue_num}
                                </td>
                                <td className="px-2 py-0.5 text-right text-gray-600 font-semibold text-mention">
                                  {u.total_heures_ue}h
                                </td>
                              </tr>
                            ),
                          ])}
                          <tr style={{ background: BLEU }}>
                            <td colSpan={3} className="px-2 py-1.5 text-right text-white font-bold text-xs">
                              Total {BLOC_LABEL[bloc] || bloc}
                            </td>
                            <td className="px-2 py-1.5 text-right text-white font-bold text-xs">
                              {totalBlocH}h
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
