import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TableCell } from '@tiptap/extension-table-cell';
import { TableHeader } from '@tiptap/extension-table-header';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { Image } from '@tiptap/extension-image';
import { Node, mergeAttributes } from '@tiptap/core';
import { useState, useEffect } from 'react';
import { api, getAnnee } from '../lib/api.js';

// ─── Champs simples ────────────────────────────────────────────────────────
const CHAMPS = {
  'Établissement': [
    { key: 'etab.po_nom',        label: 'Nom du PO' },
    { key: 'etab.etab_nom',      label: "Nom de l'établissement" },
    { key: 'etab.adresse',       label: 'Adresse complète' },
    { key: 'etab.num_ecot',      label: 'N° ECOT' },
    { key: 'etab.num_fase',      label: 'N° FASE' },
    { key: 'etab.gest_nom',      label: 'Gestionnaire — Nom' },
    { key: 'etab.gest_prenom',   label: 'Gestionnaire — Prénom' },
    { key: 'etab.gest_qualite',  label: 'Gestionnaire — Qualité' },
    { key: 'etab.gest_tel',      label: 'Gestionnaire — Tél.' },
    { key: 'etab.gest_email',    label: 'Gestionnaire — Email' },
  ],
  'Professeur': [
    { key: 'prof.nom',            label: 'Nom' },
    { key: 'prof.prenom',         label: 'Prénom' },
    { key: 'prof.nom_prenom',     label: 'Nom Prénom' },
    { key: 'prof.matricule',      label: 'Matricule' },
    { key: 'prof.niss',           label: 'NISS' },
    { key: 'prof.iban',           label: 'IBAN' },
    { key: 'prof.bic',            label: 'BIC' },
    { key: 'prof.nationalite',    label: 'Nationalité' },
    { key: 'prof.date_naissance', label: 'Date de naissance' },
    { key: 'prof.lieu_naissance', label: 'Lieu de naissance' },
    { key: 'prof.domicile',       label: 'Domicile' },
    { key: 'prof.tel_gsm',        label: 'Tél./GSM' },
    { key: 'prof.adresse_mail',   label: 'Email IIP' },
    { key: 'prof.statut',         label: 'Statut' },
  ],
  'UE': [
    { key: 'ue.ue_num',           label: 'N° UE' },
    { key: 'ue.ue_nom',           label: "Nom de l'UE" },
    { key: 'ue.ects',             label: 'ECTS' },
    { key: 'ue.ue_per_etudiants', label: 'Pér. étudiant DP' },
    { key: 'ue.ue_aut',           label: 'Autonomie' },
    { key: 'ue.ue_quad',          label: 'Quadrimestre' },
    { key: 'ue.ue_niv',           label: 'Bloc' },
    { key: 'ue.ue_code_fwb',      label: 'Code FWB' },
  ],
  'Système': [
    { key: 'sys.date',            label: 'Date du jour (JJ/MM/AAAA)' },
    { key: 'sys.annee',           label: 'Année scolaire' },
    { key: 'sys.date_iso',        label: 'Date ISO' },
    { key: 'sys.section',         label: 'Section (choisie à la génération)' },
  ],
  'Contrat': [
    { key: 'contrat.table_attributions', label: '📋 Tableau des attributions (Article 1)' },
    { key: 'prof.date_naissance_fr',     label: 'Date de naissance (JJ/MM/AAAA)' },
    { key: 'prof.nationalite',           label: 'Nationalité' },
    { key: 'prof.niss',                  label: 'Numéro de registre national (NISS)' },
    { key: 'prof.matricule',             label: 'Matricule enseignant' },
    { key: 'etab.gest_nom_prenom',       label: 'Gestionnaire — Nom Prénom' },
    { key: 'etab.num_ecot',              label: 'N° ETNIC (ex-ECOT)' },
  ],
};

// ─── Types de boucles disponibles ─────────────────────────────────────────
const BOUCLES = {
  resume_section: {
    label: 'Tableau synthèse UE + Cours (par section)',
    color: '#eaf2ff', border: '#1a5276',
    description: 'Génère automatiquement un tableau hiérarchique complet : UE avec leurs cours, périodes prof et étudiant. Sélectionnez une section à la génération.',
    champs: [], // Pas de champs manuels — le backend génère tout
  },
  profs_ue: {
    label: "Pour chaque prof de l'UE",
    color: '#e8f5e9', border: '#43a047',
    description: 'Répète le contenu du bloc pour chaque professeur attribué à l\'UE. Indiquez le N° UE à la génération.',
    champs: [
      { key: 'item.professeur',               label: 'Professeur (nom complet)' },
      { key: 'item.nom',                      label: 'Prof — Nom' },
      { key: 'item.prenom',                   label: 'Prof — Prénom' },
      { key: 'item.code_cours',               label: 'Code du cours' },
      { key: 'item.cours_nom',                label: 'Nom du cours' },
      { key: 'item.type_cours',               label: 'Type (CT/PP/CG)' },
      { key: 'item.periodes_attribuees',       label: 'Périodes attribuées' },
      { key: 'item.autonomie_attribuee',       label: 'Autonomie attribuée' },
      { key: 'item.total_attribue_professeur', label: 'Total périodes' },
      { key: 'item.section',                  label: 'Section' },
    ],
  },
  cours_ue: {
    label: "Pour chaque cours de l'UE",
    color: '#e3f2fd', border: '#1e88e5',
    description: 'Répète le contenu pour chaque cours de l\'UE. Indiquez le N° UE à la génération.',
    champs: [
      { key: 'item.cours_code',        label: 'Code cours' },
      { key: 'item.cours_nom',         label: 'Nom du cours' },
      { key: 'item.ct_pp',             label: 'Type (CT/PP/CG)' },
      { key: 'item.cours_per',         label: 'Périodes Prof.' },
      { key: 'item.cours_autonomie',   label: 'Autonomie' },
      { key: 'item.quadrimestre_cours',label: 'Quadrimestre' },
      { key: 'item.heures',            label: 'Heures' },
    ],
  },
  attributions_prof: {
    label: 'Pour chaque cours attribué au prof',
    color: '#fce4ec', border: '#e53935',
    description: 'Répète le contenu pour chaque cours attribué au professeur sélectionné.',
    champs: [
      { key: 'item.ue_num',                   label: 'N° UE' },
      { key: 'item.ue_nom',                   label: "Nom de l'UE" },
      { key: 'item.nom_cours',                label: 'Cours' },
      { key: 'item.type_cours',               label: 'Type' },
      { key: 'item.periodes_attribuees',       label: 'Périodes' },
      { key: 'item.total_attribue_professeur', label: 'Total' },
      { key: 'item.section',                  label: 'Section' },
      { key: 'item.quadrimestre_attribue',    label: 'Quadri' },
    ],
  },
};

// ─── TipTap : nœud ChampField (badge bleu) ────────────────────────────────
const ChampNode = Node.create({
  name: 'champ', group: 'inline', inline: true, atom: true,
  addAttributes() { return { key: { default: null }, label: { default: null } }; },
  parseHTML() { return [{ tag: 'span[data-champ]', getAttrs: el => ({ key: el.getAttribute('data-champ'), label: el.textContent }) }]; },
  renderHTML({ node }) { return ['span', mergeAttributes({ 'data-champ': node.attrs.key, class: 'champ-tag' }), `{{${node.attrs.key}}}`]; },
  renderText({ node }) { return `{{${node.attrs.key}}}`; },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('span');
      dom.className = 'champ-tag';
      dom.setAttribute('data-champ', node.attrs.key);
      dom.contentEditable = 'false';
      dom.title = node.attrs.key;
      dom.textContent = node.attrs.label || node.attrs.key;
      return { dom };
    };
  },
});

// ─── TipTap : nœud BoucleBlock (bloc de boucle) ───────────────────────────
const BoucleBlock = Node.create({
  name: 'boucleBlock', group: 'block', content: 'block+',
  defining: true, isolating: true,
  addAttributes() {
    return {
      boucleType: {
        default: 'profs_ue',
        parseHTML: el => el.getAttribute('data-boucle'),
        renderHTML: attrs => ({ 'data-boucle': attrs.boucleType }),
      },
    };
  },
  parseHTML() { return [{ tag: 'div[data-boucle]' }]; },
  renderHTML({ node, HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-boucle': node.attrs.boucleType, class: 'boucle-block' }), 0];
  },
  addNodeView() {
    return ({ node }) => {
      const info = BOUCLES[node.attrs.boucleType] || BOUCLES.profs_ue;
      const dom = document.createElement('div');
      dom.className = 'boucle-block';
      dom.setAttribute('data-boucle', node.attrs.boucleType);
      dom.style.cssText = `border: 2px solid ${info.border}; border-radius:6px; margin:12px 0; overflow:hidden;`;

      const header = document.createElement('div');
      header.contentEditable = 'false';
      header.style.cssText = `background:${info.border};color:#fff;padding:4px 10px;font-size:12px;font-weight:bold;user-select:none;`;
      header.textContent = `🔄 ${info.label}`;

      const contentDOM = document.createElement('div');
      contentDOM.style.cssText = `padding:8px 10px;background:${info.color};min-height:40px;`;

      const footer = document.createElement('div');
      footer.contentEditable = 'false';
      footer.style.cssText = `background:${info.border};color:#fff;padding:2px 10px;font-size:10px;user-select:none;`;
      footer.textContent = '↑ (fin de boucle — une ligne par enregistrement)';

      dom.appendChild(header); dom.appendChild(contentDOM); dom.appendChild(footer);
      return { dom, contentDOM };
    };
  },
});

// ─── Bouton toolbar ────────────────────────────────────────────────────────
function Btn({ onClick, active, disabled, title, children, danger }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title}
      className={`h-7 px-1.5 rounded text-sm flex items-center justify-center transition min-w-[26px]
        ${active ? 'bg-iip-gold text-white' : danger ? 'text-red-500 hover:bg-red-50' : 'text-gray-700 hover:bg-gray-100'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}>
      {children}
    </button>
  );
}
function Sep() { return <div className="w-px h-5 bg-gray-200 mx-0.5 self-center" />; }

// ─── Toolbar ───────────────────────────────────────────────────────────────
function Toolbar({ editor }) {
  if (!editor) return null;
  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
      <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Annuler">↩</Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Rétablir">↪</Btn>
      <Sep/>
      <select value={editor.isActive('heading',{level:1})?'h1':editor.isActive('heading',{level:2})?'h2':editor.isActive('heading',{level:3})?'h3':'p'}
        onChange={e=>{const v=e.target.value; v==='p'?editor.chain().focus().setParagraph().run():editor.chain().focus().toggleHeading({level:parseInt(v[1])}).run()}}
        className="h-7 border border-gray-300 rounded text-sm px-1 bg-white">
        <option value="p">Normal</option>
        <option value="h1">Titre 1</option><option value="h2">Titre 2</option><option value="h3">Titre 3</option>
      </select>
      <Sep/>
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Gras"><b>G</b></Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italique"><i>I</i></Btn>
      <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Souligné"><u>S</u></Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Barré"><s>B</s></Btn>
      <Sep/>
      <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({textAlign:'left'})} title="Gauche">⬅</Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({textAlign:'center'})} title="Centre">⬛</Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({textAlign:'right'})} title="Droite">➡</Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({textAlign:'justify'})} title="Justifié">≡</Btn>
      <Sep/>
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Liste à puces">•</Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Liste numérotée">1.</Btn>
      <Sep/>
      <Btn onClick={() => editor.chain().focus().insertTable({ rows:3, cols:3, withHeaderRow:true }).run()} title="Insérer tableau">⊞</Btn>
      <Btn onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!editor.can().addColumnBefore()} title="Col. avant">◁|</Btn>
      <Btn onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.can().addColumnAfter()} title="Col. après">|▷</Btn>
      <Btn onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!editor.can().addRowBefore()} title="Ligne avant">△—</Btn>
      <Btn onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.can().addRowAfter()} title="Ligne après">—▽</Btn>
      <Btn onClick={() => editor.chain().focus().mergeCells().run()} disabled={!editor.can().mergeCells()} title="Fusionner cellules">⊟</Btn>
      <Btn onClick={() => editor.chain().focus().splitCell().run()} disabled={!editor.can().splitCell()} title="Scinder cellule">⊞</Btn>
      <Btn onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!editor.can().deleteColumn()} title="Suppr. colonne" danger>✕col</Btn>
      <Btn onClick={() => editor.chain().focus().deleteRow().run()} disabled={!editor.can().deleteRow()} title="Suppr. ligne" danger>✕lig</Btn>
      <Btn onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.can().deleteTable()} title="Suppr. tableau" danger>✕tab</Btn>
      <Sep/>
      <label title="Couleur du texte" className="flex items-center gap-0.5 h-7 px-1.5 rounded hover:bg-gray-100 cursor-pointer text-sm">
        A <input type="color" className="w-5 h-5 cursor-pointer border-0 p-0 bg-transparent" defaultValue="#000000"
          onChange={e=>editor.chain().focus().setColor(e.target.value).run()} />
      </label>
    </div>
  );
}

// ─── Composant principal ───────────────────────────────────────────────────
export default function Editeur() {
  const annee = getAnnee() || '2025-2026';
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId]   = useState(null);
  const [nom, setNom]                 = useState('Nouveau template');
  const [saving, setSaving]           = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [profId, setProfId]           = useState('');
  const [ueNum, setUeNum]             = useState('');
  const [section, setSection]         = useState('');
  const [profs, setProfs]             = useState([]);
  const [sections, setSections]       = useState([]);
  const [search, setSearch]           = useState('');
  const [panelMode, setPanelMode]     = useState('champs'); // 'champs' | 'boucles'
  const [boucleActive, setBoucleActive] = useState('profs_ue');

  useEffect(() => {
    chargerTemplates();
    api.professeurs().then(setProfs).catch(() => {});
    api.sections().then(setSections).catch(() => {});
  }, []);

  function chargerTemplates() {
    fetch('/api/templates', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(d => setTemplates(Array.isArray(d) ? d : [])).catch(() => {});
  }

  const editor = useEditor({
    extensions: [
      StarterKit, Underline, TextStyle, Color,
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
      Table.configure({ resizable: true }), TableRow, TableHeader, TableCell, Image,
      ChampNode, BoucleBlock,
    ],
    content: '<p>Commencez votre document…</p>',
    editorProps: { attributes: { class: 'editeur-content focus:outline-none' } },
  });

  function insererChamp(champ) {
    editor?.chain().focus().insertContent({ type: 'champ', attrs: { key: champ.key, label: champ.label } }).run();
  }

  function insererBoucle(type) {
    const info = BOUCLES[type];
    // Marqueurs texte simples : pas de TipTap node complexe, pas de problème de focus.
    // Le curseur se place dans la ligne vide centrale pour insérer les champs.
    editor?.chain().focus().insertContent([
      { type: 'paragraph', content: [
          { type: 'text', marks:[{type:'bold'}], text: '{{#' + type + '}}' },
          { type: 'text', text: '  ← ' + info.label },
        ]
      },
      { type: 'paragraph', content: [] },
      { type: 'paragraph', content: [
          { type: 'text', marks:[{type:'bold'}], text: '{{/' + type + '}}' },
          { type: 'text', text: '  ← fin de boucle' },
        ]
      },
    ]).run();
  }

  async function sauvegarder() {
    if (!editor) return;
    setSaving(true);
    const contenu = editor.getHTML();
    const token = localStorage.getItem('token');
    try {
      if (templateId) {
        await fetch(`/api/templates/${templateId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ nom, contenu }) });
      } else {
        const r = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ nom, contenu }) });
        const d = await r.json();
        setTemplateId(d.id);
      }
      chargerTemplates();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  async function chargerTemplate(t) {
    setTemplateId(t.id); setNom(t.nom);
    const token = localStorage.getItem('token');
    const r = await fetch(`/api/templates/${t.id}`, { headers: { Authorization: `Bearer ${token}` } });
    const d = await r.json();
    editor?.commands.setContent(d.contenu || '');
  }

  function nouveauTemplate() {
    setTemplateId(null); setNom('Nouveau template');
    editor?.commands.setContent('<p>Commencez votre document…</p>');
  }

  async function generer() {
    if (!editor || !templateId) { alert('Sauvegardez d\'abord le template'); return; }
    setGenerating(true);
    const token = localStorage.getItem('token');
    try {
      const r = await fetch(`/api/templates/${templateId}/generer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prof_id: profId || undefined, ue_num: ueNum || undefined, section: section || undefined, annee }),
      });
      const { html, nom: tnom } = await r.json();
      const w = window.open('', '_blank');
      if (!w) { alert('Autorisez les pop-ups pour ce site'); return; }
      w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${tnom}</title>
        <style>
          body{font-family:Arial,sans-serif;margin:0;padding:20mm 15mm;font-size:11pt;color:#000}
          table{width:100%;border-collapse:collapse;margin:6px 0}
          td,th{border:1px solid #333;padding:4px 6px;vertical-align:top}
          th{background:#eee;font-weight:bold}
          h1{font-size:16pt}h2{font-size:13pt}h3{font-size:11pt}
          p{margin:4px 0}
          .champ-tag{background:transparent}
          .boucle-block{display:block}
          @media print{body{padding:10mm 10mm}button{display:none}}
        </style></head><body>
        <div style="text-align:right;margin-bottom:10px;print:none">
          <button onclick="window.print()" style="padding:6px 16px;background:#1a5276;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px">🖨 Imprimer / Enregistrer en PDF</button>
        </div>
        ${html}</body></html>`);
      w.document.close();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setGenerating(false); }
  }

  // Filtrage champs simples
  const champsFiltres = Object.entries(CHAMPS).reduce((acc, [cat, champs]) => {
    const f = champs.filter(c => !search || c.label.toLowerCase().includes(search.toLowerCase()) || c.key.includes(search.toLowerCase()));
    if (f.length) acc[cat] = f;
    return acc;
  }, {});

  const boucleInfo = BOUCLES[boucleActive];

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── Panneau gauche : liste des templates ── */}
      <div className="w-52 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
        <div className="px-3 py-3 border-b border-gray-200">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Templates</div>
          <button onClick={nouveauTemplate} className="w-full text-left text-xs bg-iip-gold text-white rounded px-2 py-1.5 hover:bg-iip-amber">+ Nouveau</button>
        </div>
        <div className="flex-1 overflow-auto py-1">
          {templates.map(t => (
            <button key={t.id} onClick={() => chargerTemplate(t)}
              className={`w-full text-left px-3 py-2 text-sm border-b border-gray-100 hover:bg-white transition ${templateId === t.id ? 'bg-white font-semibold text-iip-gold' : 'text-gray-700'}`}>
              <div className="truncate">{t.nom}</div>
              <div className="text-xs text-gray-400">{t.modifie_le?.slice(0,10)}</div>
            </button>
          ))}
          {templates.length === 0 && <div className="text-xs text-gray-400 px-3 py-4">Aucun template</div>}
        </div>
      </div>

      {/* ── Zone centrale : éditeur ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Barre du haut */}
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0 flex-wrap">
          <input value={nom} onChange={e => setNom(e.target.value)}
            className="flex-1 min-w-32 border border-gray-300 rounded px-3 py-1.5 text-sm font-medium" placeholder="Nom du template" />
          <button onClick={sauvegarder} disabled={saving}
            className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded font-medium whitespace-nowrap">
            {saving ? '…' : '💾 Sauvegarder'}
          </button>
          <select value={section} onChange={e => setSection(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
            <option value="">— Section —</option>
            {sections.map(s => <option key={s.code} value={s.code}>{s.code}</option>)}
          </select>
          <select value={profId} onChange={e => setProfId(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
            <option value="">— Prof —</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>)}
          </select>
          <input type="number" value={ueNum} onChange={e => setUeNum(e.target.value)}
            placeholder="N° UE" className="w-20 border border-gray-300 rounded px-2 py-1.5 text-sm" />
          <button onClick={generer} disabled={generating}
            className="bg-iip-mauve hover:opacity-90 disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded font-medium whitespace-nowrap">
            {generating ? '…' : '🖨 Générer PDF'}
          </button>
        </div>
        <Toolbar editor={editor} />
        <div className="flex-1 overflow-auto bg-white">
          <div className="max-w-4xl mx-auto p-8">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* ── Panneau droit : champs + boucles ── */}
      <div className="w-60 flex-shrink-0 border-l border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
        {/* Onglets Champs / Boucles */}
        <div className="flex border-b border-gray-200">
          <button onClick={() => setPanelMode('champs')}
            className={`flex-1 py-2 text-xs font-semibold transition ${panelMode === 'champs' ? 'bg-white text-iip-gold border-b-2 border-iip-gold' : 'text-gray-500 hover:bg-gray-100'}`}>
            Champs
          </button>
          <button onClick={() => setPanelMode('boucles')}
            className={`flex-1 py-2 text-xs font-semibold transition ${panelMode === 'boucles' ? 'bg-white text-iip-mauve border-b-2 border-iip-mauve' : 'text-gray-500 hover:bg-gray-100'}`}>
            🔄 Boucles
          </button>
        </div>

        {panelMode === 'champs' ? (
          /* ── Panneau Champs ── */
          <>
            <div className="px-3 pt-2 pb-1">
              <input value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Rechercher…" className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
            </div>
            <div className="flex-1 overflow-auto py-1">
              {Object.entries(champsFiltres).map(([cat, champs]) => (
                <div key={cat}>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide px-3 pt-3 pb-1">{cat}</div>
                  {champs.map(c => (
                    <button key={c.key} onClick={() => insererChamp(c)}
                      className="w-full text-left px-3 py-1.5 text-xs hover:bg-iip-gold/10 hover:text-iip-gold flex items-center gap-1 group">
                      <span className="text-gray-400 group-hover:text-iip-gold">⊕</span>
                      <span className="truncate">{c.label}</span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </>
        ) : (
          /* ── Panneau Boucles ── */
          <div className="flex-1 overflow-auto">
            <div className="px-3 pt-3 pb-2">
              <p className="text-xs text-gray-500 mb-3">Une boucle répète automatiquement un bloc pour chaque enregistrement. Insérez le bloc, mettez en page une ligne à l'intérieur, puis insérez les champs <code className="bg-gray-200 px-1 rounded">item.xxx</code>.</p>
              {/* Sélecteur de type de boucle */}
              {Object.entries(BOUCLES).map(([type, info]) => (
                <button key={type} onClick={() => setBoucleActive(type)}
                  className={`w-full text-left px-3 py-2 rounded mb-1 text-sm transition ${boucleActive === type ? 'font-semibold text-white' : 'hover:bg-gray-100 text-gray-700'}`}
                  style={boucleActive === type ? { background: info.border } : {}}>
                  🔄 {info.label}
                </button>
              ))}
            </div>

            {/* Bouton insérer + champs de la boucle active */}
              <div className="px-3 border-t border-gray-200 pt-3">
              <button onClick={() => insererBoucle(boucleActive)}
                className="w-full text-white text-sm font-semibold py-2 rounded mb-3 transition"
                style={{ background: boucleInfo.border }}>
                ⊕ Insérer ce bloc dans le document
              </button>
              {boucleInfo.description && (
                <p className="text-xs text-gray-500 mb-3 leading-relaxed">{boucleInfo.description}</p>
              )}
              {boucleInfo.champs.length > 0 ? (
                <>
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Champs disponibles dans ce bloc</div>
                  {boucleInfo.champs.map(c => (
                    <button key={c.key} onClick={() => insererChamp(c)}
                      className="w-full text-left px-2 py-1.5 text-xs hover:bg-gray-100 flex items-center gap-1 group rounded">
                      <span className="text-gray-400 group-hover:text-iip-gold">⊕</span>
                      <span className="truncate">{c.label}</span>
                    </button>
                  ))}
                </>
              ) : (
                <p className="text-xs text-gray-400 italic">Ce bloc génère automatiquement son contenu — pas besoin de champs supplémentaires.</p>
              )}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .editeur-content { min-height: 500px; }
        .champ-tag {
          display: inline-block;
          background: #e3f2fd; color: #1565c0;
          border: 1px solid #90caf9; border-radius: 4px;
          padding: 0 5px; font-size: 0.8em;
          font-family: monospace; cursor: default;
          user-select: none; white-space: nowrap;
        }
        .editeur-content table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .editeur-content td, .editeur-content th {
          border: 1px solid #ccc; padding: 6px 8px;
          position: relative; vertical-align: top; min-width: 40px;
        }
        .editeur-content th { background: #f5f5f5; font-weight: bold; }
        .editeur-content .selectedCell:after {
          content: ''; position: absolute; inset: 0;
          background: rgba(200,220,255,0.4); pointer-events: none;
        }
        .editeur-content .column-resize-handle {
          position: absolute; right: -2px; top: 0; bottom: 0;
          width: 4px; background: #adf; cursor: col-resize; z-index: 20;
        }
        .tableWrapper { overflow-x: auto; }
        .boucle-block p { margin: 2px 0; }
      `}</style>
    </div>
  );
}
