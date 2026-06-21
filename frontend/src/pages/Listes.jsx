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
const LOGO_IIP = 'data:image/jpeg;base64,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';

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
            <td style="padding:5px 8px;text-align:right;font-size:8px;color:#94A3B8">${nPer > 0 ? Math.round(pt/nPer*100) + '%' : ''}</td>
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
              <col style="width:120px">
              <col style="width:36px">
              <col style="width:60px">
              <col style="width:60px">
            </colgroup>
            <thead>
              <tr style="background:${BLEU2};color:#fff">
                <th style="padding:5px 8px;text-align:left;font-size:8.5px">UE</th>
                <th style="padding:5px 8px;text-align:left;font-size:8.5px">Intitulé</th>
                <th style="padding:5px 8px;text-align:center;font-size:8.5px">Contrat</th>
                <th style="padding:5px 8px;text-align:right;font-size:8.5px">Périodes (CT / PP)</th>
                <th style="padding:5px 8px;text-align:right;font-size:8.5px">%</th>
                <th style="padding:5px 8px;text-align:right;font-size:8.5px">Périodes</th>
                <th style="padding:5px 8px;text-align:right;font-size:8.5px">ETP</th>
              </tr>
            </thead>
            <tbody>${lignes}</tbody>
            <tfoot>
              ${nIipEtp > 0 ? `<tr style="background:#eef2fb;color:${BLEU}">
                <td colspan="3" style="padding:4px 8px;text-align:right;font-weight:600">dont IIP</td>
                <td style="padding:4px 8px;text-align:right;font-size:9px;color:#64748B">${nPer > 0 ? Math.round(nIipPer/nPer*100) + '%' : ''}</td>
                <td style="padding:4px 8px;text-align:right;font-weight:600">${fmt(nIipPer)}</td>
                <td style="padding:4px 8px;text-align:right;font-weight:700">${fmtEtp(nIipEtp)}</td>
              </tr>` : ''}
              ${nHelbEtp > 0 ? `<tr style="background:#f5f0fc;color:${VIOLET}">
                <td colspan="3" style="padding:4px 8px;text-align:right;font-weight:600">dont HELB</td>
                <td style="padding:4px 8px;text-align:right;font-size:9px;color:#A78BFA">${nPer > 0 ? Math.round(nHelbPer/nPer*100) + '%' : ''}</td>
                <td style="padding:4px 8px;text-align:right;font-weight:600">${fmt(nHelbPer)}</td>
                <td style="padding:4px 8px;text-align:right;font-weight:700">${fmtEtp(nHelbEtp)}</td>
              </tr>` : ''}
              <tr style="background:${BLEU};color:#fff">
                <td colspan="3" style="padding:6px 8px;text-align:right;font-weight:700">Sous-total ${niv}</td>
                <td style="padding:6px 8px;text-align:right;font-size:9px;opacity:.7">100%</td>
                <td style="padding:6px 8px;text-align:right;font-weight:700">${fmt(nPer)}</td>
                <td style="padding:6px 8px;text-align:right;font-weight:700">${fmtEtp(nEtp)}</td>
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
    const etpSec = sec.etp_secretariat || 0; // secrétariat étudiant proratisé
    const totEtp = sec.etp_total, iipEtp = sec.etp_iip, helbEtp = sec.etp_helb;
    const coordEtp = sec.etp_coord_helb || 0;
    const globalEtp = totEtp + coordEtp; // cours + coordination
    const ratioGlobal = globalEtp > 0 && nbEtus > 0 ? (nbEtus / globalEtp).toFixed(1) : null;
    const ratioCours  = totEtp > 0  && nbEtus > 0 ? (nbEtus / totEtp).toFixed(1)   : null;
    const ratioCoord  = coordEtp > 0 && nbEtus > 0 ? (nbEtus / coordEtp).toFixed(1) : null;
    const ratioSec    = etpSec > 0   && nbEtus > 0 ? (nbEtus / etpSec).toFixed(1)   : null;
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
        <div style="border-bottom:3px solid ${TURQ};padding-bottom:10px;margin-bottom:16px;display:flex;align-items:flex-start;gap:16px">
          <img src="${LOGO_IIP}" style="height:64px;width:auto;flex-shrink:0" alt="Logo IIP" />
          <div>
            <div style="font-size:8px;letter-spacing:3px;text-transform:uppercase;color:${TURQ};font-weight:700">Institut Ilya Prigogine · Enseignement pour adultes</div>
            <div style="font-size:21px;color:${BLEU};margin-top:3px;font-weight:700">Rapport de charge ETP — Section ${sec.section}</div>
            <div style="font-size:11px;color:#555;margin-top:2px">Année académique ${annee}</div>
            <div style="font-size:8px;color:#999;margin-top:6px">Document destiné au Conseil d'administration · Charge enseignante exprimée en équivalents temps plein (ETP)</div>
          </div>
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
