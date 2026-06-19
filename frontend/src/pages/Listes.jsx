import { useState, useEffect } from 'react';
import { api, getAnnee, nomDoc } from '../lib/api.js';
import PreviewModal from '../components/PreviewModal.jsx';
import { RailLateral } from '../components/ui.jsx';
import {
  IconUser, IconBooks, IconBook, IconLink, IconSchool, IconScale,
  IconAlertTriangle, IconLayoutGrid, IconFileText, IconFileDescription,
  IconCertificate, IconBolt, IconPrinter, IconFileSpreadsheet, IconDownload,
  IconFileExport,
} from '@tabler/icons-react';
import * as XLSX from 'xlsx';

// Table des composants d'icônes (référencés par nom dans ENTITES.tabler)
const TABLER = {
  IconUser, IconBooks, IconBook, IconLink, IconSchool, IconScale,
  IconAlertTriangle, IconLayoutGrid, IconFileText, IconFileDescription, IconCertificate,
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
    alert('Export Excel indisponible : ' + e.message);
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
    label: 'Professeurs', groupe: 'data', icon: '👤', tabler: 'IconUser',
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
  ues: {
    label: 'Unités d\'enseignement', groupe: 'data', icon: '📚', tabler: 'IconBooks',
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
    label: 'Cours', groupe: 'data', icon: '📖', tabler: 'IconBook',
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
    label: 'Profs par UE', groupe: 'data', icon: '🔗', tabler: 'IconLink',
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
    label: 'Profs par section', groupe: 'data', icon: '🏫', tabler: 'IconSchool',
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
    label: 'Synthèse charge / prof', groupe: 'data', icon: '⚖️', tabler: 'IconScale',
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
    label: 'UE sans attribution', groupe: 'data', icon: '⚠️', tabler: 'IconAlertTriangle',
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
  'grille-section': {
    label: 'Grille de section', groupe: 'rapport', icon: '📐', tabler: 'IconLayoutGrid',
    grille: true,
    cols: [],
    fetch: (annee, filtres) => authFetch(
      `/api/ref/sections/${encodeURIComponent(filtres.section||'')}/grille?annee=${encodeURIComponent(annee)}`
    ),
    filtres: ['section'],
  },
  'rapport-section': {
    label: 'Rapport par section', groupe: 'rapport', icon: '📄', tabler: 'IconFileText',
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
    label: 'Rapport par UE', groupe: 'rapport', icon: '📋', tabler: 'IconFileDescription',
    rapport: true,
    cols: [],
    fetch: (annee, filtres) => authFetch(
      `/api/attributions/rapport-attributions?section=${encodeURIComponent(filtres.section||'')}&annee=${encodeURIComponent(annee)}`
    ),
    filtres: ['section', 'ue_num'],
  },
  'rapport-etp': {
    label: 'Rapport ETP', groupe: 'rapport', icon: '🎓', tabler: 'IconCertificate',
    rapport: true,
    cols: [],
    fetch: (annee) => authFetch(`/api/pilotage/etp?annee=${encodeURIComponent(annee)}`),
    filtres: ['section'],
  },
};

// ─── Exports ─────────────────────────────────────────────────────────────────
function exportCSV(rows, cols, nom) {
  const header = cols.map(c => `"${c.label}"`).join(';');
  const lines = rows.map(r => cols.map(c => `"${String(r[c.key] ?? '').replace(/"/g, '""')}"`).join(';')).join('\n');
  const blob = new Blob(['\uFEFF' + header + '\n' + lines], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = `${nom}.csv`; a.click();
  URL.revokeObjectURL(url);
}


// ─── Composant principal ─────────────────────────────────────────────────────
export default function Listes() {
  const annee = getAnnee() || '2026-2027';
  const [entite, setEntite] = useState('profs');
  const [colsActives, setColsActives] = useState(() => new Set(ENTITES['profs'].cols.filter(c => c.defaut).map(c => c.key)));
  const [filtres, setFiltres] = useState({});
  const [showOptionsRapport, setShowOptionsRapport] = useState(false); // pop-up de critères avant génération
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sections, setSections] = useState([]);
  const [rapportHtml, setRapportHtml] = useState(null);
  const [ueList, setUeList] = useState([]);
  const [orientation, setOrientation] = useState('portrait'); // portrait | landscape (impression)

  useEffect(() => {
    api.sections().then(s => setSections(Array.isArray(s) ? s : [])).catch(() => {});
  }, []);

  // Charger les UE quand section change (pour rapport-ue)
  useEffect(() => {
    if (entite === 'rapport-ue' && filtres.section) {
      authFetch(`/api/ref/ue?section=${encodeURIComponent(filtres.section)}&annee=${encodeURIComponent(annee)}`)
        .then(d => setUeList(Array.isArray(d) ? d : [])).catch(() => {});
    }
  }, [filtres.section, entite]);

  const def = ENTITES[entite];

  function changerEntite(k) {
    setEntite(k);
    setRows(null); setError(''); setFiltres({});
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
    if (d.error) { alert(d.error); return; }
    const NIV_PAL = ['#f97316','#60a5fa','#1e3a8a','#a855f7','#ec4899'];
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
          const pe = (c.per_etudiant !== null && c.per_etudiant !== '' && c.per_etudiant != null) ? Number(c.per_etudiant) : cp;
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
    if (d.error) { alert(d.error); return; }
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
    if (d.error) { alert(d.error); return; }
    const secCode = filtres.section || '';
    const sec = (d.sections || []).find(s => s.section === secCode);
    if (!sec) { alert('Aucune donnée ETP pour cette section. Choisissez une section.'); return; }

    const BLEU = '#1B2B4B', BLEU2 = '#163A6B', TURQ = '#00AACC', CLAIR = '#E1ECF5', GRIS = '#F4F6FA', VIOLET = '#7c3aed';
    const fmt = n => Math.round(n || 0).toLocaleString('fr-BE').replace(/\u202f/g, ' ');
    const fmtEtp = n => (n || 0).toFixed(4).replace('.', ',');
    const fmtEtp2 = n => (n || 0).toFixed(2).replace('.', ',');

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
      if (ct) parts.push(`<span style="white-space:nowrap"><b>CT</b> ${fmt(ct)}</span>`);
      if (pp) parts.push(`<span style="white-space:nowrap"><b>PP</b> ${fmt(pp)}</span>`);
      return parts.join(' · ') || '—';
    };
    const perTot = u => (u.per_ct || 0) + (u.per_pp || 0) + (u.per_ct_helb || 0) + (u.per_pp_helb || 0);
    const badge = c => {
      const col = c === 'IIP' ? BLEU : VIOLET;
      return `<span style="background:${col};color:#fff;font-size:8px;font-weight:700;padding:1px 6px;border-radius:3px">${c}</span>`;
    };

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
      ues.forEach((u, i) => {
        const bg = i % 2 === 0 ? '#fff' : GRIS;
        const c = contratDe(u);
        const pt = perTot(u);
        nPer += pt; nEtp += u.etp_total;
        if (c === 'IIP') { nIipPer += pt; nIipEtp += u.etp_total; } else { nHelbPer += pt; nHelbEtp += u.etp_total; }
        lignes += `
          <tr style="background:${bg}">
            <td style="padding:5px 8px;font-weight:700;color:${BLEU};white-space:nowrap">UE ${u.ue_num}</td>
            <td style="padding:5px 8px;color:#333;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${u.ue_nom || '—'}</td>
            <td style="padding:5px 8px;text-align:center">${badge(c)}</td>
            <td style="padding:5px 8px;font-size:9px;color:#555;text-align:right">${cellPer(u)}</td>
            <td style="padding:5px 8px;text-align:right;color:#333">${fmt(pt)}</td>
            <td style="padding:5px 8px;text-align:right;font-weight:700;color:${BLEU}">${fmtEtp(u.etp_total)}</td>
          </tr>`;
      });
      blocs += `
        <div style="margin-bottom:14px;page-break-inside:avoid">
          <div style="background:${TURQ};color:#fff;font-weight:700;font-size:11px;padding:5px 10px;border-radius:4px 4px 0 0">${NIV_NOM[niv] || niv}</div>
          <table style="width:100%;border-collapse:collapse;font-size:9.5px;table-layout:fixed">
            <colgroup>
              <col style="width:52px">
              <col>
              <col style="width:52px">
              <col style="width:130px">
              <col style="width:64px">
              <col style="width:64px">
            </colgroup>
            <thead>
              <tr style="background:${BLEU2};color:#fff">
                <th style="padding:5px 8px;text-align:left;font-size:8.5px">UE</th>
                <th style="padding:5px 8px;text-align:left;font-size:8.5px">Intitulé</th>
                <th style="padding:5px 8px;text-align:center;font-size:8.5px">Contrat</th>
                <th style="padding:5px 8px;text-align:right;font-size:8.5px">Périodes (CT / PP)</th>
                <th style="padding:5px 8px;text-align:right;font-size:8.5px">Périodes</th>
                <th style="padding:5px 8px;text-align:right;font-size:8.5px">ETP</th>
              </tr>
            </thead>
            <tbody>${lignes}</tbody>
            <tfoot>
              ${nIipEtp > 0 ? `<tr style="background:#eef2fb;color:${BLEU}"><td colspan="4" style="padding:4px 8px;text-align:right;font-weight:600">dont IIP</td><td style="padding:4px 8px;text-align:right;font-weight:600">${fmt(nIipPer)}</td><td style="padding:4px 8px;text-align:right;font-weight:700">${fmtEtp(nIipEtp)}</td></tr>` : ''}
              ${nHelbEtp > 0 ? `<tr style="background:#f5f0fc;color:${VIOLET}"><td colspan="4" style="padding:4px 8px;text-align:right;font-weight:600">dont HELB</td><td style="padding:4px 8px;text-align:right;font-weight:600">${fmt(nHelbPer)}</td><td style="padding:4px 8px;text-align:right;font-weight:700">${fmtEtp(nHelbEtp)}</td></tr>` : ''}
              <tr style="background:${BLEU};color:#fff"><td colspan="4" style="padding:6px 8px;text-align:right;font-weight:700">Sous-total ${niv}</td><td style="padding:6px 8px;text-align:right;font-weight:700">${fmt(nPer)}</td><td style="padding:6px 8px;text-align:right;font-weight:700">${fmtEtp(nEtp)}</td></tr>
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
    const etpSec = sec.etp_secretariat || 0; // secrétariat étudiant proratisé
    const ratioGlobal = globalEtp > 0 && nbEtus > 0 ? (nbEtus / globalEtp).toFixed(1) : null;
    const ratioCours  = totEtp > 0  && nbEtus > 0 ? (nbEtus / totEtp).toFixed(1)   : null;
    const ratioCoord  = coordEtp > 0 && nbEtus > 0 ? (nbEtus / coordEtp).toFixed(1) : null;
    const ratioSec    = etpSec > 0   && nbEtus > 0 ? (nbEtus / etpSec).toFixed(1)   : null;
    const totEtp = sec.etp_total, iipEtp = sec.etp_iip, helbEtp = sec.etp_helb;
    const coordEtp = sec.etp_coord_helb || 0;
    const globalEtp = totEtp + coordEtp; // cours + coordination
    const totPer = sec.ues.reduce((s, u) => s + perTot(u), 0);
    const iipPer = sec.ues.reduce((s, u) => s + (contratDe(u) === 'IIP' ? perTot(u) : 0), 0);
    const helbPer = totPer - iipPer;
    const totCt = sec.ues.reduce((s, u) => s + (u.per_ct || 0) + (u.per_ct_helb || 0), 0);
    const totPp = sec.ues.reduce((s, u) => s + (u.per_pp || 0) + (u.per_pp_helb || 0), 0);
    const iipCt = sec.ues.reduce((s, u) => s + (u.per_ct || 0), 0);
    const iipPp = sec.ues.reduce((s, u) => s + (u.per_pp || 0), 0);
    const helbCt = sec.ues.reduce((s, u) => s + (u.per_ct_helb || 0), 0);
    const helbPp = sec.ues.reduce((s, u) => s + (u.per_pp_helb || 0), 0);
    const pctIip = globalEtp ? Math.round(iipEtp / globalEtp * 100) : 0;
    const pctHelb = globalEtp ? Math.round(helbEtp / globalEtp * 100) : 0;
    const pctCoord = globalEtp ? Math.round(coordEtp / globalEtp * 100) : 0;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        body{font-family:Arial,sans-serif;color:#222;font-size:10px}
        @media print{@page{size:A4;margin:14mm 12mm}tr{page-break-inside:avoid}thead{display:table-header-group}}
      </style></head><body><div style="padding:4mm">
        <div style="border-bottom:3px solid ${TURQ};padding-bottom:10px;margin-bottom:16px">
          <div style="font-size:8px;letter-spacing:3px;text-transform:uppercase;color:${TURQ};font-weight:700">Institut Ilya Prigogine · Enseignement pour adultes</div>
          <div style="font-size:21px;color:${BLEU};margin-top:3px;font-weight:700">Rapport de charge ETP — Section ${sec.section}</div>
          <div style="font-size:11px;color:#555;margin-top:2px">Année académique ${annee}</div>
          <div style="font-size:8px;color:#999;margin-top:6px">Document destiné au Conseil d'administration · Charge enseignante exprimée en équivalents temps plein (ETP)</div>
        </div>

        <!-- Ligne 1 : 3 cartes globales -->
        <div style="display:flex;gap:10px;margin-bottom:10px;align-items:stretch">

          <!-- Carte 1 : Charge globale -->
          <div style="flex:1.2;background:${BLEU};color:#fff;border-radius:8px;padding:14px 18px;display:flex;flex-direction:column;justify-content:center">
            <div style="font-size:8px;text-transform:uppercase;letter-spacing:1.5px;opacity:.75">Charge globale de la section</div>
            <div style="font-size:40px;font-weight:700;line-height:1;margin-top:4px">${fmtEtp2(globalEtp)} <span style="font-size:13px;font-weight:400;opacity:.8">ETP</span></div>
            <div style="font-size:8px;opacity:.7;margin-top:5px">Cours (${fmt(totPer)} pér.) + coordination HELB</div>
            ${nbEtus > 0 ? `
            <div style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,.2)">
              <div style="font-size:8px;opacity:.7;text-transform:uppercase;letter-spacing:1px">Ratios étu./ETP · ${sourceLabel}</div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;margin-top:4px">
                <div style="background:rgba(255,255,255,.12);border-radius:4px;padding:4px 6px">
                  <div style="font-size:7px;opacity:.7;text-transform:uppercase">Global</div>
                  <div style="font-size:15px;font-weight:700">${ratioGlobal || '—'} <span style="font-size:8px;opacity:.7">étu./ETP</span></div>
                </div>
                <div style="background:rgba(255,255,255,.12);border-radius:4px;padding:4px 6px">
                  <div style="font-size:7px;opacity:.7;text-transform:uppercase">Cours</div>
                  <div style="font-size:15px;font-weight:700">${ratioCours || '—'} <span style="font-size:8px;opacity:.7">étu./ETP</span></div>
                </div>
                <div style="background:rgba(255,255,255,.12);border-radius:4px;padding:4px 6px">
                  <div style="font-size:7px;opacity:.7;text-transform:uppercase">Coordination</div>
                  <div style="font-size:15px;font-weight:700">${ratioCoord || '—'} <span style="font-size:8px;opacity:.7">étu./ETP</span></div>
                </div>
                <div style="background:rgba(255,255,255,.12);border-radius:4px;padding:4px 6px">
                  <div style="font-size:7px;opacity:.7;text-transform:uppercase">Secrétariat</div>
                  <div style="font-size:15px;font-weight:700">${ratioSec || '—'} <span style="font-size:8px;opacity:.7">étu./ETP</span></div>
                </div>
              </div>
              <div style="font-size:7px;opacity:.5;margin-top:4px">${nbEtus} étudiants · ${sourceLabel}</div>
            </div>` : ''}
          </div>

          <!-- Carte 2 : dont cours (flèche) -->
          <div style="display:flex;flex-direction:column;justify-content:center;opacity:.6;font-size:16px;color:${BLEU};padding:0 2px">▸</div>
          <div style="flex:1.4;border:1.5px solid #E2E8F0;border-radius:8px;padding:12px 14px;background:#FAFBFC">
            <div style="font-size:8px;text-transform:uppercase;letter-spacing:1px;color:#94A3B8;margin-bottom:8px;font-weight:600">dont cours</div>
            <div style="display:flex;flex-direction:column;gap:5px">
              <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:#EFF6FF;border-radius:5px;border-left:3px solid ${BLEU}">
                <div>
                  <div style="font-size:9px;font-weight:700;color:${BLEU}">Cours IIP</div>
                  <div style="font-size:8px;color:#64748B">CT ${fmt(iipCt)} pér. · PP ${fmt(iipPp)} pér. · ${pctIip}%</div>
                </div>
                <div style="font-size:17px;font-weight:700;color:${BLEU}">${fmtEtp2(iipEtp)}</div>
              </div>
              <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:#F5F3FF;border-radius:5px;border-left:3px solid ${VIOLET}">
                <div>
                  <div style="font-size:9px;font-weight:700;color:${VIOLET}">Cours HELB</div>
                  <div style="font-size:8px;color:#64748B">CT ${fmt(helbCt)} pér. · PP ${fmt(helbPp)} pér. · ${pctHelb}%</div>
                </div>
                <div style="font-size:17px;font-weight:700;color:${VIOLET}">${fmtEtp2(helbEtp)}</div>
              </div>
            </div>
          </div>

          <!-- Carte 3 : dont coordination -->
          <div style="display:flex;flex-direction:column;justify-content:center;opacity:.6;font-size:16px;color:#4C1D95;padding:0 2px">▸</div>
          <div style="flex:1;border:1.5px solid #EDE9FE;border-radius:8px;padding:12px 14px;background:#FAF8FF;${coordEtp > 0 ? '' : 'opacity:.5'}">
            <div style="font-size:8px;text-transform:uppercase;letter-spacing:1px;color:#A78BFA;margin-bottom:8px;font-weight:600">dont coordination</div>
            ${coordEtp > 0 ? `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 8px;background:#EDE9FE;border-radius:5px;border-left:3px solid #7C3AED">
              <div>
                <div style="font-size:9px;font-weight:700;color:#4C1D95">Coordination HELB</div>
                <div style="font-size:8px;color:#64748B">${(sec.coord_helb||[]).length} poste(s) · ${pctCoord}%</div>
              </div>
              <div style="font-size:17px;font-weight:700;color:#4C1D95">${fmtEtp2(coordEtp)}</div>
            </div>
            ` : `<div style="font-size:9px;color:#C4B5FD;font-style:italic">Aucun poste HELB direct</div>`}
          </div>
        </div>

        <!-- Ligne 2 : CT / PP détail -->
        <div style="display:flex;gap:10px;margin:10px 0 6px">
          <div style="flex:1;border:1px solid #e5e5e5;border-top:3px solid ${TURQ};border-radius:6px;padding:10px 12px">
            <div style="font-size:11px;font-weight:700;color:${TURQ}">CT</div>
            <div style="font-size:9px;color:#666;margin-bottom:6px">Cours théoriques (÷ 800)</div>
            <div style="font-size:10px;color:#444">${fmt(totCt)} périodes</div>
            <div style="font-size:22px;font-weight:700;color:${BLEU};margin-top:2px">${fmtEtp(totCt / 800)} <span style="font-size:10px;font-weight:400;color:#999">ETP</span></div>
          </div>
          <div style="flex:1;border:1px solid #e5e5e5;border-top:3px solid ${TURQ};border-radius:6px;padding:10px 12px">
            <div style="font-size:11px;font-weight:700;color:${TURQ}">PP</div>
            <div style="font-size:9px;color:#666;margin-bottom:6px">Pratique professionnelle (÷ 1000)</div>
            <div style="font-size:10px;color:#444">${fmt(totPp)} périodes</div>
            <div style="font-size:22px;font-weight:700;color:${BLEU};margin-top:2px">${fmtEtp(totPp / 1000)} <span style="font-size:10px;font-weight:400;color:#999">ETP</span></div>
          </div>
        </div>

        <div style="font-size:13px;color:${BLEU};font-weight:700;margin:16px 0 8px;padding-bottom:3px;border-bottom:1.5px solid ${CLAIR}">Détail par bloc et par unité d'enseignement</div>
        ${blocs}

        <div style="margin-top:18px;background:${GRIS};border-radius:8px;padding:12px 16px;page-break-inside:avoid">
          <div style="font-size:11px;color:${BLEU};font-weight:700;margin-bottom:6px">Méthodologie de calcul</div>
          <div style="font-size:9px;color:#555;line-height:1.5">La charge enseignante est exprimée en équivalents temps plein (ETP), calculés selon la législation de l'enseignement pour adultes. Le nombre de périodes attribuées est divisé par le volume annuel correspondant à un temps plein selon la nature de l'activité.</div>
          <div style="display:flex;gap:14px;margin-top:8px;font-size:9px">
            <div><b style="color:${BLEU}">Cours théoriques (CT)</b> : périodes ÷ 800</div>
            <div><b style="color:${BLEU}">Pratique professionnelle (PP)</b> : périodes ÷ 1000</div>
            <div><b style="color:${BLEU}">Travail administratif</b> : 36 h / semaine</div>
          </div>
          <div style="font-size:9px;color:#555;line-height:1.5;margin-top:8px">Les périodes intègrent les heures de cours et les heures d'autonomie pédagogique. Le calcul est appliqué de manière identique aux attributions IIP et HELB. </div>
        </div>

        ${(sec.coord_helb && sec.coord_helb.length > 0) ? `
        <!-- Section postes coordination HELB -->
        <div style="margin-top:16px;border:2px solid #7c3aed;border-radius:8px;overflow:hidden">
          <div style="background:#4C1D95;color:white;padding:8px 12px;display:flex;justify-content:space-between;align-items:center">
            <div style="font-weight:700;font-size:12px">Postes de coordination HELB — hors dotation IIP</div>
            <div style="font-size:13px;font-weight:700">${fmtEtp2(sec.etp_coord_helb)} ETP</div>
          </div>
          <table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="background:#F5F3FF">
                <th style="padding:5px 8px;text-align:left;color:#4C1D95;font-weight:600">Personne</th>
                <th style="padding:5px 8px;text-align:left;color:#4C1D95;font-weight:600">Fonction</th>
                <th style="padding:5px 8px;text-align:right;color:#4C1D95;font-weight:600">ETP</th>
                <th style="padding:5px 8px;text-align:right;color:#4C1D95;font-weight:600">≈ pér. (×800)</th>
              </tr>
            </thead>
            <tbody>
              ${sec.coord_helb.map(m => `
              <tr style="border-bottom:1px solid #EDE9FE">
                <td style="padding:5px 8px;color:#1E293B">${m.prof_nom} ${m.prof_prenom}</td>
                <td style="padding:5px 8px;color:#64748B">${m.fonction}</td>
                <td style="padding:5px 8px;text-align:right;font-weight:700;color:#6D28D9">${(m.etp_helb||0).toFixed(2).replace('.',',')}</td>
                <td style="padding:5px 8px;text-align:right;color:#6D28D9">${Math.round((m.etp_helb||0)*800)}</td>
              </tr>`).join('')}
              <tr style="background:#EDE9FE;font-weight:700">
                <td colspan="2" style="padding:5px 8px;color:#4C1D95">Total coordination HELB</td>
                <td style="padding:5px 8px;text-align:right;color:#4C1D95">${fmtEtp2(sec.etp_coord_helb)}</td>
                <td style="padding:5px 8px;text-align:right;color:#4C1D95">${Math.round((sec.etp_coord_helb||0)*800)}</td>
              </tr>
            </tbody>
          </table>
          <div style="padding:6px 12px;background:#F5F3FF;font-size:9px;color:#6D28D9">
            Ces postes sont financés directement par la HELB et ne sont pas prélevés sur la dotation de périodes IIP.
            La conversion ETP × 800 est indicative (base CT).
          </div>
        </div>
        ` : ''}

        <div style="margin-top:12px;padding:10px 12px;background:#F8FAFC;border-radius:6px;border:1px solid #E2E8F0">
          <div style="font-size:11px;color:${BLEU};font-weight:700;margin-bottom:6px">Méthodologie de calcul</div>
          <div style="font-size:9px;color:#555;line-height:1.5">La charge enseignante est exprimée en équivalents temps plein (ETP), calculés selon la législation de l'enseignement pour adultes. Le nombre de périodes attribuées est divisé par le volume annuel correspondant à un temps plein selon la nature de l'activité.</div>
          <div style="display:flex;gap:14px;margin-top:8px;font-size:9px">
            <div><b style="color:${BLEU}">Cours théoriques (CT)</b> : périodes ÷ 800</div>
            <div><b style="color:${BLEU}">Pratique professionnelle (PP)</b> : périodes ÷ 1000</div>
            <div><b style="color:${BLEU}">Travail administratif</b> : 36 h / semaine</div>
          </div>
          <div style="font-size:9px;color:#555;line-height:1.5;margin-top:8px">Les périodes intègrent les heures de cours et les heures d'autonomie pédagogique. Le calcul est appliqué de manière identique aux attributions IIP et HELB. </div>
        </div>
      </div></body></html>`;
    setRapportHtml(html);
  }

  function genererRapportHtml(d, filtres) {
    if (d.error) { alert(d.error); return; }
    const NIV_PAL = ['#f97316','#60a5fa','#1e3a8a','#a855f7','#ec4899'];
    const niveaux = [...new Set(d.ues?.map(u => u.ue_niv).filter(Boolean))].sort((a,b)=>parseInt(a.match(/\d+$/)?.[0]??99)-parseInt(b.match(/\d+$/)?.[0]??99));
    const getNivCol = niv => NIV_PAL[niveaux.indexOf(niv) % NIV_PAL.length] || '#6b7280';
    const fmt = n => (n != null && n !== '') ? String(n) : '0';
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
          <td style="${S}max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.cours_nom||'—'}${c.activite_nom?` <em style="color:#9ca3af">(${c.activite_nom})</em>`:''}</td>
          <td style="${S}white-space:nowrap;color:#6b7280">Gr.${c.groupe_code}</td>
          <td style="${S}white-space:nowrap">${profCell(c.prof_nom)}</td>
          <td style="${SR}color:#374151">${fmt(c.periodes)}</td>
          <td style="${SR}color:#6b7280">${fmt(c.autonomie)}</td>
          <td style="${SR}font-weight:600;border-left:1px solid #e5e7eb">${fmt(c.total)}</td>
        </tr>`).join('');
      return `
        <tr style="background:#f1f5f9;border-left:3px solid ${col}">
          <td colspan="4" style="padding:4px 6px 4px 8px;font-weight:700;font-size:12px;color:#111827;white-space:nowrap">
            <span style="background:${col};color:white;font-size:9px;padding:1px 4px;border-radius:2px;margin-right:5px">${ue.ue_niv||''}</span>UE\u00a0${ue.ue_num} — ${ue.ue_nom||''}
          </td>
          <td style="${SR}"></td><td style="${SR}"></td>
          <td style="${SR}border-left:1px solid #e5e7eb"></td>
        </tr>
        ${lignesCours}
        <tr style="background:#e8edf3;border-left:3px solid ${col}">
          <td colspan="4" style="padding:2px 6px 2px 20px;font-size:10px;color:#6b7280;font-style:italic">Sous-total UE\u00a0${ue.ue_num}</td>
          <td style="${SR}font-weight:700;color:#374151">${fmt(ue.total_per)}</td>
          <td style="${SR}font-weight:600;color:#6b7280">${fmt(ue.total_aut)}</td>
          <td style="${SR}font-weight:700;border-left:1px solid #e5e7eb">${fmt(ue.total_per+ue.total_aut)}</td>
        </tr>`;
    };
    // Regrouper par organisation : orga 1, puis orga 2, etc., chacune avec son sous-total
    // Détecter les sections présentes (chaque UE porte sa propre section en multi-sections)
    const sectionsPresentes = [...new Set(ues.map(u => u.section).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'fr'));
    const plusieursSections = sectionsPresentes.length > 1;

    // Rendu des UE d'un ensemble donné, regroupées par organisation
    const renderUesParOrga = (uesEnsemble) => {
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
              <td style="${SR}font-weight:700;color:#1B2B4B;border-left:1px solid #94a3b8">${fmt(totP+totA)}</td>
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
            <td style="${SR}font-weight:700;color:white;border-left:1px solid rgba(255,255,255,.3)">${fmt(secP+secA)}</td>
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
            <td style="${SR}font-weight:700;color:white;border-left:1px solid rgba(255,255,255,.3)">${fmt(totalPer+totalAut)}</td>
          </tr>
        </tbody></table>
      </div></body></html>`;
    setRapportHtml(html);
  }

  function genererRapportExcel(d, filtres) {
    if (d.error) { alert(d.error); return; }
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

  const colsVisibles = def.cols.filter(c => colsActives.has(c.key));
  const nomFichier = `lucie_${entite}_${annee}`;

  // Injecte l'orientation choisie dans le HTML du rapport au moment de l'aperçu/impression
  function htmlAvecOrientation(html) {
    if (!html) return html;
    const size = orientation === 'landscape' ? 'A4 landscape' : 'A4 portrait';
    // Remplace toute déclaration @page{...size:...} existante, sinon en injecte une
    if (/@page\s*\{[^}]*size\s*:[^;}]*/.test(html)) {
      return html.replace(/(@page\s*\{[^}]*size\s*:\s*)[^;}]*/g, `$1${size}`);
    }
    return html.replace('</style>', `@page{size:${size};margin:12mm}</style>`);
  }

  const apercuHtml = rapportHtml ? htmlAvecOrientation(rapportHtml.html || rapportHtml) : null;
  const estRapport = def.rapport || def.grille;

  const GROUPES_LABEL = { data: 'Listes de données', rapport: 'Rapports' };
  const ordreGroupes = ['data', 'rapport'];

  return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      {/* ── Rail latéral glissant (composant partagé) ── */}
      <RailLateral
        icon={IconFileExport}
        titre="Listes & rapports"
        sections={ordreGroupes.map(grp => ({
          label: GROUPES_LABEL[grp],
          items: Object.entries(ENTITES)
            .filter(([, e]) => (e.groupe || 'data') === grp)
            .map(([k, e]) => ({
              key: k, label: e.label, icon: TABLER[e.tabler] || IconFileText,
              actif: entite === k, onClick: () => changerEntite(k),
            })),
        })).filter(s => s.items.length > 0)}
      />

      {/* ── Colonne droite : filtres + contenu ── */}
      <div className="ml-16 flex flex-col min-w-0">

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
              {entite === 'rapport-ue' && ueList.length > 0
                ? <select value={filtres.ue_num || ''} onChange={e => setFiltres(f => ({ ...f, ue_num: e.target.value }))}
                    className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm bg-white">
                    <option value="">— Toutes les UE —</option>
                    {ueList.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom?.slice(0,35)}</option>)}
                  </select>
                : <input type="number" value={filtres.ue_num || ''} onChange={e => setFiltres(f => ({ ...f, ue_num: e.target.value }))}
                    placeholder="ex: 95" className="border border-slate-300 rounded-lg px-2.5 py-1.5 h-9 text-sm w-24" />
              }
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
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${orientation==='portrait'?'bg-white text-slate-800 shadow-sm font-medium':'text-slate-500'}`}>
              Portrait
            </button>
            <button onClick={() => setOrientation('landscape')}
              className={`px-2.5 py-1 text-xs rounded-md transition-colors ${orientation==='landscape'?'bg-white text-slate-800 shadow-sm font-medium':'text-slate-500'}`}>
              Paysage
            </button>
          </div>
        )}

        {/* Bouton générer */}
        <button onClick={generer} disabled={loading}
          className="bg-iip-blue hover:bg-iip-blue-dark disabled:opacity-40 text-white text-sm font-semibold px-4 py-2 rounded-lg flex items-center gap-2 transition-colors">
          <IconBolt size={16} />
          {loading ? 'Chargement…' : (entite === 'rapport-section' ? 'Paramétrer & générer' : 'Générer')}
        </button>

        {/* Exports */}
        {rows !== null && (estRapport ? (
          <>
            {apercuHtml && (
              <button onClick={() => {
                  const w = window.open('', '_blank');
                  if (!w) { alert('Autorisez les pop-ups pour imprimer.'); return; }
                  w.document.write(apercuHtml); w.document.close();
                  setTimeout(() => { w.focus(); w.print(); }, 350);
                }}
                className="text-sm border border-iip-blue text-iip-blue hover:bg-slate-100 px-3 py-2 rounded-lg font-medium flex items-center gap-1.5">
                <IconPrinter size={16} /> Imprimer / PDF
              </button>
            )}
            <button onClick={async () => {
                const d = await def.fetch(annee, filtres);
                def.grille ? genererGrilleExcel(d) : genererRapportExcel(d, filtres);
              }}
              className="text-sm border border-emerald-500 text-emerald-700 hover:bg-emerald-50 px-3 py-2 rounded-lg font-medium flex items-center gap-1.5">
              <IconFileSpreadsheet size={16} /> Excel
            </button>
          </>
        ) : (
          <>
            <button onClick={() => exportCSV(rows, colsVisibles, nomFichier)} disabled={rows.length === 0}
              className="text-sm border border-slate-300 hover:bg-slate-100 disabled:opacity-40 px-3 py-2 rounded-lg text-slate-600 flex items-center gap-1.5">
              <IconDownload size={16} /> CSV
            </button>
            <button onClick={() => exportExcel(rows, colsVisibles, nomFichier)} disabled={rows.length === 0}
              className="text-sm border border-emerald-500 text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 px-3 py-2 rounded-lg font-medium flex items-center gap-1.5">
              <IconFileSpreadsheet size={16} /> Excel
            </button>
          </>
        ))}
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm p-3 mx-5 mt-3 rounded-lg flex-shrink-0">{error}</div>}

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
            <div className={`bg-white shadow-lg rounded-lg overflow-hidden border border-slate-200 ${orientation==='landscape' ? 'w-full max-w-[1100px]' : 'w-full max-w-[820px]'}`}>
              <iframe title="aperçu" srcDoc={apercuHtml} className="w-full block" style={{ height: '78vh', border: 'none' }} />
            </div>
          </div>
        )}

        {/* Tableau de données */}
        {rows !== null && !estRapport && (
          <div className="px-5 py-3">
            <div className="text-sm text-slate-600 mb-2">
              <b>{rows.length}</b> résultat{rows.length > 1 ? 's' : ''} · {def.label} · {annee}
              {filtres.section && <span className="ml-1 font-medium text-iip-turquoise">· {filtres.section}</span>}
            </div>
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
            {/* Colonnes (repliable sous le tableau) */}
            {def.cols.length > 0 && (
              <details className="mt-3 text-sm">
                <summary className="cursor-pointer text-slate-500 hover:text-slate-700">Colonnes affichées</summary>
                <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
                  {def.cols.map(c => (
                    <label key={c.key} className="flex items-center gap-1.5 cursor-pointer">
                      <input type="checkbox" checked={colsActives.has(c.key)} onChange={() => toggleCol(c.key)} />
                      <span className={colsActives.has(c.key) ? 'text-slate-800' : 'text-slate-400'}>{c.label}</span>
                    </label>
                  ))}
                </div>
              </details>
            )}
          </div>
        )}
      </div>
      </div>

      {showOptionsRapport && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={e=>e.target===e.currentTarget&&setShowOptionsRapport(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 border-t-4 border-iip-gold max-h-[90vh] overflow-y-auto">
            <h2 className="text-lg font-title text-slate-800 mb-1">Paramétrer le rapport</h2>
            <p className="text-sm text-gray-500 mb-4">Choisissez les critères. Laissez « Tous » pour ne pas filtrer.</p>
            <div className="space-y-3">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-medium text-gray-600">Section(s)</label>
                  <div className="flex gap-2 text-[11px]">
                    <button onClick={()=>setFiltres(f=>({...f, sections: sections.map(s=>s.code||s.section||s)}))}
                      className="text-iip-gold hover:underline">Toutes</button>
                    <button onClick={()=>setFiltres(f=>({...f, sections: []}))}
                      className="text-gray-400 hover:underline">Aucune</button>
                  </div>
                </div>
                <div className="border border-gray-200 rounded-lg p-2 max-h-40 overflow-y-auto grid grid-cols-2 gap-1">
                  {sections.map(s => {
                    const code = s.code || s.section || s;
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
                <p className="text-[11px] text-gray-400 mt-1">Aucune cochée = toutes les sections.</p>
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
            <div className="mt-5 flex items-center justify-between">
              <button onClick={()=>{ setFiltres(f=>({ section:f.section, ue_num:f.ue_num })); }}
                className="text-xs text-gray-500 hover:text-gray-700 underline">Réinitialiser les critères</button>
              <div className="flex gap-2">
                <button onClick={()=>setShowOptionsRapport(false)} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
                <button onClick={()=>{ setShowOptionsRapport(false); genererReel(); }}
                  className="bg-iip-gold hover:bg-iip-amber text-white text-sm font-medium px-5 py-2 rounded-lg">Générer le rapport</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


// build final 2.22.1 — 1781701639
