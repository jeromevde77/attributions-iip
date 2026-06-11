import { useState, useEffect } from 'react';
import { api, getAnnee, nomDoc } from '../lib/api.js';
import PreviewModal from '../components/PreviewModal.jsx';
import * as XLSX from 'xlsx';

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
    label: 'Professeurs', icon: '👤',
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
    label: 'Unités d\'enseignement', icon: '📚',
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
    label: 'Cours', icon: '📖',
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
    label: 'Profs par UE', icon: '🔗',
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
    label: 'Profs par section', icon: '🏫',
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
    label: 'Synthèse charge / prof', icon: '⚖️',
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
    label: 'UE sans attribution', icon: '⚠️',
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
    label: 'Grille de section', icon: '📐',
    grille: true,
    cols: [],
    fetch: (annee, filtres) => authFetch(
      `/api/ref/sections/${encodeURIComponent(filtres.section||'')}/grille?annee=${encodeURIComponent(annee)}`
    ),
    filtres: ['section'],
  },
  'rapport-section': {
    label: 'Rapport par section', icon: '📄',
    rapport: true,
    cols: [],
    fetch: (annee, filtres) => authFetch(
      `/api/attributions/rapport-attributions?section=${encodeURIComponent(filtres.section||'')}&annee=${encodeURIComponent(annee)}`
    ),
    filtres: ['section'],
  },
  'rapport-ue': {
    label: 'Rapport par UE', icon: '📋',
    rapport: true,
    cols: [],
    fetch: (annee, filtres) => authFetch(
      `/api/attributions/rapport-attributions?section=${encodeURIComponent(filtres.section||'')}&annee=${encodeURIComponent(annee)}`
    ),
    filtres: ['section', 'ue_num'],
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
  const [rows, setRows] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sections, setSections] = useState([]);
  const [rapportHtml, setRapportHtml] = useState(null);
  const [ueList, setUeList] = useState([]);

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
    setLoading(true); setError('');
    try {
      const data = await def.fetch(annee, filtres);
      if (def.rapport) {
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
        const lignesCours = u.cours.map((c, i) => `
          <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
            <td style="${S}padding-left:20px;color:#6b7280;font-family:monospace">${c.cours_code}</td>
            <td style="${S}">${c.cours_nom || '—'}</td>
            <td style="${S}text-align:center;font-weight:600;color:${c.ct_pp==='CT'?'#1B2B4B':'#00AACC'}">${c.ct_pp||'—'}</td>
            <td style="${SR}color:#374151">${c.cours_per||0}</td>
            <td style="${SR}color:#7c3aed">${c.heures||'—'}</td>
            <td style="${SR}color:#7c3aed">${c.periodes_contact||'—'}</td>
            <td style="${SR}color:#6b7280">—</td>
            <td style="${SR}font-weight:600">${(c.cours_per||0)}</td>
          </tr>`).join('');
        // Ligne autonomie séparée (une seule par UE, après tous les cours)
        const autUE = u.cours.find(c => (c.ue_autonomie||0) > 0)?.ue_autonomie || 0;
        const ligneAut = autUE > 0 ? `
          <tr style="background:#fff8e1">
            <td style="${S}padding-left:20px;color:#6b7280;font-family:monospace"></td>
            <td style="${S}font-style:italic;color:#6b7280">Autonomie</td>
            <td style="${S}text-align:center;color:#6b7280">Auto</td>
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
            <td style="${SR}"></td><td style="${SR}"></td><td style="${SR}"></td>
          </tr>
          ${lignesCours}
          ${ligneAut}
          <tr style="background:#e8edf3;border-left:3px solid ${col}">
            <td colspan="2" style="padding:2px 6px 2px 20px;font-size:9px;color:#6b7280;font-style:italic">Sous-total UE\u00a0${u.ue_num}</td>
            <td style="${S}text-align:center"></td>
             <td style="${SR}font-weight:700;color:#374151">${u.tot_per}</td>
             <td style="${SR}color:#9ca3af">—</td>
             <td style="${SR}color:#9ca3af">—</td>
             <td style="${SR}font-weight:600;color:#f59e0b">${u.tot_aut}</td>
             <td style="${SR}font-weight:700">${u.tot_per+u.tot_aut}</td>
           </tr>`;
      }).join('');

      return `
        <tr style="background:${col}20">
          <td colspan="6" style="padding:5px 8px;font-weight:800;font-size:12px;color:${col};border-bottom:2px solid ${col}">
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
            <th style="padding:3px 5px;text-align:right;font-size:10px">H. étud.</th>
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
            <td style="${SR}color:rgba(255,255,255,.7)">—</td>
            <td style="${SR}color:rgba(255,255,255,.7)">—</td>
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

  function genererRapportHtml(d, filtres) {
    if (d.error) { alert(d.error); return; }
    const NIV_PAL = ['#f97316','#60a5fa','#1e3a8a','#a855f7','#ec4899'];
    const niveaux = [...new Set(d.ues?.map(u => u.ue_niv).filter(Boolean))].sort((a,b)=>parseInt(a.match(/\d+$/)?.[0]??99)-parseInt(b.match(/\d+$/)?.[0]??99));
    const getNivCol = niv => NIV_PAL[niveaux.indexOf(niv) % NIV_PAL.length] || '#6b7280';
    const fmt = n => (n != null && n !== '') ? String(n) : '0';
    const S = 'padding:1px 5px;font-size:10px;line-height:1.2;';
    const SR = S + 'text-align:right;';

    // Filtrer par UE si mode rapport-ue
    let ues = d.ues || [];
    if (entite === 'rapport-ue' && filtres.ue_num) {
      ues = ues.filter(u => String(u.ue_num) === String(filtres.ue_num));
    }

    const renderUErap = (ue) => {
      const col = getNivCol(ue.ue_niv);
      const lignesCours = ue.cours.map((c,i) => `
        <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
          <td style="${S}padding-left:20px">${c.code_cours||'—'}</td>
          <td style="${S}max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.cours_nom||'—'}${c.activite_nom?` <em style="color:#9ca3af">(${c.activite_nom})</em>`:''}</td>
          <td style="${S}white-space:nowrap;color:#6b7280">Gr.${c.groupe_code}</td>
          <td style="${S}white-space:nowrap">${c.prof_nom}</td>
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
    const orgas = [...new Set(ues.map(u => u.num_organisation || 1))].sort((a,b) => a - b);
    const plusieursOrgas = orgas.length > 1;
    const lignesUE = orgas.map(org => {
      const uesOrg = ues.filter(u => (u.num_organisation || 1) === org);
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

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* En-tête */}
      <div className="px-6 pt-6 pb-4 border-b border-gray-100 flex-shrink-0">
        <h1 className="text-2xl font-title text-iip-gold mb-1">Listes &amp; Extractions</h1>
        <p className="text-sm text-gray-500">Générez, filtrez et exportez n'importe quelle liste — CSV ou Excel.</p>
      </div>

      <div className="flex flex-1 min-h-0 overflow-hidden">
        {/* ── Panneau gauche ── */}
        <div className="w-64 flex-shrink-0 bg-gray-50 border-r border-gray-200 overflow-auto p-4 space-y-5">

          {/* Type de liste */}
          <div>
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Type de liste</div>
            {Object.entries(ENTITES).map(([k, e]) => (
              <button key={k} onClick={() => changerEntite(k)}
                className={`w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-1 transition
                  ${entite === k ? 'bg-iip-gold text-white font-semibold' : 'hover:bg-gray-100 text-gray-700'}`}>
                <span>{e.icon}</span><span>{e.label}</span>
              </button>
            ))}
          </div>

          {/* Filtres */}
          {def.filtres.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filtres</div>
              {def.filtres.includes('section') && (
                <label className="block mb-2">
                  <div className="text-xs text-gray-600 mb-0.5">Section</div>
                  <select value={filtres.section || ''} onChange={e => setFiltres(f => ({ ...f, section: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                    <option value="">— Toutes —</option>
                    {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
                  </select>
                </label>
              )}
              {def.filtres.includes('ue_num') && (
                <label className="block mb-2">
                  <div className="text-xs text-gray-600 mb-0.5">UE</div>
                  {entite === 'rapport-ue' && ueList.length > 0
                    ? <select value={filtres.ue_num || ''} onChange={e => setFiltres(f => ({ ...f, ue_num: e.target.value }))}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                        <option value="">— Toutes les UE —</option>
                        {ueList.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {u.ue_nom?.slice(0,35)}</option>)}
                      </select>
                    : <input type="number" value={filtres.ue_num || ''} onChange={e => setFiltres(f => ({ ...f, ue_num: e.target.value }))}
                        placeholder="ex: 95" className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm" />
                  }
                </label>
              )}
              {def.filtres.includes('niveau') && (
                <label className="block mb-2">
                  <div className="text-xs text-gray-600 mb-0.5">Niveau</div>
                  <select value={filtres.niveau || ''} onChange={e => setFiltres(f => ({ ...f, niveau: e.target.value }))}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
                    <option value="">— Tous —</option>
                    <option value="SUP">SUP</option><option value="DS">DS</option>
                  </select>
                </label>
              )}
            </div>
          )}

          {/* Colonnes */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Colonnes</div>
              <button onClick={() => setColsActives(new Set(def.cols.map(c => c.key)))}
                className="text-xs text-iip-gold hover:underline">tout</button>
            </div>
            {def.cols.map(c => (
              <label key={c.key} className="flex items-center gap-2 py-0.5 text-sm cursor-pointer">
                <input type="checkbox" checked={colsActives.has(c.key)} onChange={() => toggleCol(c.key)} />
                <span className={colsActives.has(c.key) ? 'text-gray-800' : 'text-gray-400'}>{c.label}</span>
              </label>
            ))}
          </div>

          {/* Bouton */}
          <button onClick={generer} disabled={loading}
            className="w-full bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm font-semibold py-2.5 rounded-lg transition">
            {loading ? 'Chargement…' : '⚡ Générer'}
          </button>
        </div>

        {/* ── Zone résultats ── */}
        <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {rows === null ? (
            <div className="flex-1 flex flex-col items-center justify-center text-gray-400 gap-3">
              <span className="text-5xl">📋</span>
              <p className="text-sm">Choisissez un type, configurez vos colonnes, cliquez <b>Générer</b>.</p>
            </div>
          ) : (
            <>
              {/* Barre d'actions */}
              <div className="flex items-center justify-between px-4 py-2 border-b border-gray-100 bg-white flex-shrink-0">
                <span className="text-sm text-gray-600">
                  {def.rapport ? <span className="font-medium text-iip-gold">{def.label} · {annee}{filtres.section ? ` · ${filtres.section}` : ''}{filtres.ue_num ? ` · UE ${filtres.ue_num}` : ''}</span>
                  : <><b>{rows.length}</b> résultat{rows.length > 1 ? 's' : ''} · {def.label} · {annee}
                    {filtres.section && <span className="ml-2 font-medium text-iip-gold">· {filtres.section}</span>}</>}
                </span>
                <div className="flex gap-2">
                  {def.rapport || def.grille ? (<>
                    <button onClick={() => rapportHtml && setRapportHtml(rapportHtml)}
                      disabled={!rapportHtml}
                      className="text-xs border border-iip-mauve text-iip-mauve hover:bg-iip-mauve/5 disabled:opacity-40 px-3 py-1.5 rounded font-medium">
                      📄 Voir HTML
                    </button>
                    <button onClick={async () => {
                        const d = await def.fetch(annee, filtres);
                        def.grille ? genererGrilleExcel(d) : genererRapportExcel(d, filtres);
                      }}
                      className="text-xs border border-green-500 text-green-700 hover:bg-green-50 px-3 py-1.5 rounded font-medium">
                      📊 Excel
                    </button>
                  </>) : (<>
                    <button onClick={() => exportCSV(rows, colsVisibles, nomFichier)}
                      disabled={rows.length === 0}
                      className="text-xs border border-gray-300 hover:bg-gray-50 disabled:opacity-40 px-3 py-1.5 rounded text-gray-600">
                      ⬇ CSV
                    </button>
                    <button onClick={() => exportExcel(rows, colsVisibles, nomFichier)}
                      disabled={rows.length === 0}
                      className="text-xs border border-green-500 text-green-700 hover:bg-green-50 disabled:opacity-40 px-3 py-1.5 rounded font-medium">
                      ⬇ Excel
                    </button>
                  </>)}
                </div>
              </div>
              {error && <div className="bg-red-50 text-red-700 text-sm p-3 mx-4 mt-2 rounded">{error}</div>}
              {/* Tableau */}
              <div className="flex-1 overflow-auto">
                <table className="w-full text-sm border-collapse">
                  <thead className="sticky top-0 bg-gray-50 z-10">
                    <tr>
                      {colsVisibles.map(c => (
                        <th key={c.key} className="text-left px-3 py-2 text-xs font-semibold text-gray-600 border-b border-gray-200 whitespace-nowrap">
                          {c.label}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, i) => (
                      <tr key={i} className={i % 2 ? 'bg-gray-50/50' : ''}>
                        {colsVisibles.map(c => (
                          <td key={c.key} className="px-3 py-1.5 border-b border-gray-100 text-gray-800 max-w-xs truncate" title={String(row[c.key] ?? '')}>
                            {row[c.key] ?? '—'}
                          </td>
                        ))}
                      </tr>
                    ))}
                    {rows.length === 0 && (
                      <tr><td colSpan={colsVisibles.length || 1} className="text-center text-gray-400 py-8">Aucun résultat</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
      {rapportHtml && <PreviewModal html={rapportHtml.html||rapportHtml} titre={rapportHtml.nom||"Rapport"} nomFichier={rapportHtml.nom} onClose={() => setRapportHtml(null)} />}
    </div>
  );
}

