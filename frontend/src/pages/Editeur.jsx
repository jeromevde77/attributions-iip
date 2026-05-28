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
import { useState, useEffect, useCallback } from 'react';
import { api, getAnnee } from '../lib/api.js';

// ─── Champs disponibles ────────────────────────────────────────────────────
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
    { key: 'prof.nom',           label: 'Nom' },
    { key: 'prof.prenom',        label: 'Prénom' },
    { key: 'prof.nom_prenom',    label: 'Nom Prénom' },
    { key: 'prof.matricule',     label: 'Matricule' },
    { key: 'prof.niss',          label: 'NISS' },
    { key: 'prof.iban',          label: 'IBAN' },
    { key: 'prof.bic',           label: 'BIC' },
    { key: 'prof.nationalite',   label: 'Nationalité' },
    { key: 'prof.date_naissance',label: 'Date de naissance' },
    { key: 'prof.lieu_naissance',label: 'Lieu de naissance' },
    { key: 'prof.domicile',      label: 'Domicile' },
    { key: 'prof.tel_gsm',       label: 'Tél./GSM' },
    { key: 'prof.adresse_mail',  label: 'Email IIP' },
    { key: 'prof.statut',        label: 'Statut' },
  ],
  'UE': [
    { key: 'ue.ue_num',          label: 'N° UE' },
    { key: 'ue.ue_nom',          label: "Nom de l'UE" },
    { key: 'ue.ects',            label: 'ECTS' },
    { key: 'ue.ue_per_etudiants',label: 'Pér. étudiant DP' },
    { key: 'ue.ue_aut',          label: 'Autonomie' },
    { key: 'ue.ue_quad',         label: 'Quadrimestre' },
    { key: 'ue.ue_niv',          label: 'Bloc' },
    { key: 'ue.ue_code_fwb',     label: 'Code FWB' },
  ],
  'Système': [
    { key: 'sys.date',           label: 'Date du jour (JJ/MM/AAAA)' },
    { key: 'sys.annee',          label: 'Année scolaire' },
    { key: 'sys.date_iso',       label: 'Date ISO' },
  ],
};

// ─── Extension TipTap : nœud Champ ─────────────────────────────────────────
const ChampNode = Node.create({
  name: 'champ',
  group: 'inline',
  inline: true,
  atom: true,
  addAttributes() {
    return {
      key:   { default: null },
      label: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: 'span[data-champ]', getAttrs: el => ({ key: el.getAttribute('data-champ'), label: el.textContent }) }];
  },
  renderHTML({ node }) {
    return ['span', mergeAttributes({ 'data-champ': node.attrs.key, class: 'champ-tag' }), `{{${node.attrs.key}}}`];
  },
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

// ─── Bouton toolbar ─────────────────────────────────────────────────────────
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

// ─── Toolbar ────────────────────────────────────────────────────────────────
function Toolbar({ editor }) {
  if (!editor) return null;
  const addTable = () => editor.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run();
  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 rounded-t-lg sticky top-0 z-10">
      {/* Historique */}
      <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor.can().undo()} title="Annuler">↩</Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor.can().redo()} title="Rétablir">↪</Btn>
      <Sep/>
      {/* Paragraphe / Titres */}
      <select value={editor.isActive('heading',{level:1})?'h1':editor.isActive('heading',{level:2})?'h2':editor.isActive('heading',{level:3})?'h3':'p'}
        onChange={e=>{const v=e.target.value; v==='p'?editor.chain().focus().setParagraph().run():editor.chain().focus().toggleHeading({level:parseInt(v[1])}).run()}}
        className="h-7 border border-gray-300 rounded text-sm px-1 bg-white">
        <option value="p">Normal</option>
        <option value="h1">Titre 1</option>
        <option value="h2">Titre 2</option>
        <option value="h3">Titre 3</option>
      </select>
      <Sep/>
      {/* Formatage */}
      <Btn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive('bold')} title="Gras"><b>G</b></Btn>
      <Btn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive('italic')} title="Italique"><i>I</i></Btn>
      <Btn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive('underline')} title="Souligné"><u>S</u></Btn>
      <Btn onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive('strike')} title="Barré"><s>B</s></Btn>
      <Sep/>
      {/* Alignement */}
      <Btn onClick={() => editor.chain().focus().setTextAlign('left').run()} active={editor.isActive({textAlign:'left'})} title="Gauche">⬅</Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('center').run()} active={editor.isActive({textAlign:'center'})} title="Centre">⬛</Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('right').run()} active={editor.isActive({textAlign:'right'})} title="Droite">➡</Btn>
      <Btn onClick={() => editor.chain().focus().setTextAlign('justify').run()} active={editor.isActive({textAlign:'justify'})} title="Justifié">≡</Btn>
      <Sep/>
      {/* Listes */}
      <Btn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive('bulletList')} title="Liste à puces">•</Btn>
      <Btn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive('orderedList')} title="Liste numérotée">1.</Btn>
      <Sep/>
      {/* Tableau */}
      <Btn onClick={addTable} title="Insérer un tableau">⊞</Btn>
      <Btn onClick={() => editor.chain().focus().addColumnBefore().run()} disabled={!editor.can().addColumnBefore()} title="Colonne avant">◁|</Btn>
      <Btn onClick={() => editor.chain().focus().addColumnAfter().run()} disabled={!editor.can().addColumnAfter()} title="Colonne après">|▷</Btn>
      <Btn onClick={() => editor.chain().focus().addRowBefore().run()} disabled={!editor.can().addRowBefore()} title="Ligne avant">△—</Btn>
      <Btn onClick={() => editor.chain().focus().addRowAfter().run()} disabled={!editor.can().addRowAfter()} title="Ligne après">—▽</Btn>
      <Btn onClick={() => editor.chain().focus().mergeCells().run()} disabled={!editor.can().mergeCells()} title="Fusionner cellules">⊟</Btn>
      <Btn onClick={() => editor.chain().focus().splitCell().run()} disabled={!editor.can().splitCell()} title="Scinder cellule">⊞</Btn>
      <Btn onClick={() => editor.chain().focus().deleteColumn().run()} disabled={!editor.can().deleteColumn()} title="Suppr. colonne" danger>✕col</Btn>
      <Btn onClick={() => editor.chain().focus().deleteRow().run()} disabled={!editor.can().deleteRow()} title="Suppr. ligne" danger>✕lig</Btn>
      <Btn onClick={() => editor.chain().focus().deleteTable().run()} disabled={!editor.can().deleteTable()} title="Suppr. tableau" danger>✕tab</Btn>
      <Sep/>
      {/* Couleur texte */}
      <label title="Couleur du texte" className="flex items-center gap-0.5 h-7 px-1.5 rounded hover:bg-gray-100 cursor-pointer text-sm">
        A <input type="color" className="w-5 h-5 cursor-pointer border-0 p-0 bg-transparent" defaultValue="#000000"
          onChange={e=>editor.chain().focus().setColor(e.target.value).run()} />
      </label>
    </div>
  );
}

// ─── Composant principal ─────────────────────────────────────────────────────
export default function Editeur() {
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId] = useState(null);
  const [nom, setNom] = useState('Nouveau template');
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [profId, setProfId] = useState('');
  const [profs, setProfs] = useState([]);
  const [champSearch, setChampSearch] = useState('');

  useEffect(() => {
    chargerTemplates();
    api.professeurs().then(setProfs).catch(()=>{});
  }, []);

  function chargerTemplates() {
    fetch('/api/templates', { headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } })
      .then(r => r.json()).then(setTemplates).catch(() => {});
  }

  const editor = useEditor({
    extensions: [
      StarterKit,
      Underline,
      TextStyle,
      Color,
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
      Table.configure({ resizable: true }),
      TableRow,
      TableHeader,
      TableCell,
      Image,
      ChampNode,
    ],
    content: '<p>Commencez à écrire votre document…</p>',
    editorProps: {
      attributes: { class: 'editeur-content focus:outline-none' },
    },
  });

  function insererChamp(champ) {
    if (!editor) return;
    editor.chain().focus().insertContent({
      type: 'champ',
      attrs: { key: champ.key, label: champ.label },
    }).run();
  }

  async function sauvegarder() {
    if (!editor) return;
    setSaving(true);
    const contenu = editor.getHTML();
    const body = { nom, contenu, entites: [] };
    try {
      const token = localStorage.getItem('token');
      if (templateId) {
        await fetch(`/api/templates/${templateId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
      } else {
        const r = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(body) });
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
    editor?.commands.setContent('<p>Commencez à écrire votre document…</p>');
  }

  async function generer() {
    if (!editor || !templateId) { alert('Sauvegardez d\'abord le template'); return; }
    setGenerating(true);
    try {
      const token = localStorage.getItem('token');
      const r = await fetch(`/api/templates/${templateId}/generer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prof_id: profId || undefined, annee: getAnnee() }),
      });
      const { html, nom: tnom } = await r.json();
      const w = window.open('', '_blank');
      if (!w) { alert('Autorisez les pop-ups'); return; }
      w.document.write(`<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
        <title>${tnom}</title>
        <style>
          body{font-family:Arial,sans-serif;margin:0;padding:20mm 15mm;font-size:11pt;color:#000}
          table{width:100%;border-collapse:collapse}
          td,th{border:1px solid #333;padding:4px 6px;vertical-align:top}
          th{background:#eee;font-weight:bold}
          h1{font-size:16pt}h2{font-size:13pt}h3{font-size:11pt}
          .champ-tag{background:#e3f2fd;padding:0 2px;border-radius:2px}
          @media print{body{padding:10mm 10mm}}
        </style></head><body>${html}
        <script>window.onload=()=>window.print()<\/script>
      </body></html>`);
      w.document.close();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setGenerating(false); }
  }

  // Filtrer les champs
  const champsFiltrés = Object.entries(CHAMPS).reduce((acc, [cat, champs]) => {
    const f = champs.filter(c => !champSearch || c.label.toLowerCase().includes(champSearch.toLowerCase()) || c.key.includes(champSearch.toLowerCase()));
    if (f.length) acc[cat] = f;
    return acc;
  }, {});

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* ── Panneau gauche : templates ── */}
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
        <div className="flex items-center gap-2 px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
          <input value={nom} onChange={e => setNom(e.target.value)}
            className="flex-1 border border-gray-300 rounded px-3 py-1.5 text-sm font-medium" placeholder="Nom du template" />
          <button onClick={sauvegarder} disabled={saving}
            className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded font-medium">
            {saving ? '…' : '💾 Sauvegarder'}
          </button>
          <select value={profId} onChange={e => setProfId(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
            <option value="">— Prof (optionnel) —</option>
            {profs.map(p => <option key={p.id} value={p.id}>{p.nom} {p.prenom}</option>)}
          </select>
          <button onClick={generer} disabled={generating}
            className="bg-iip-mauve hover:opacity-90 disabled:opacity-40 text-white text-sm px-4 py-1.5 rounded font-medium">
            {generating ? '…' : '🖨 Générer PDF'}
          </button>
        </div>
        {/* Toolbar TipTap */}
        <Toolbar editor={editor} />
        {/* Zone d'édition */}
        <div className="flex-1 overflow-auto bg-white">
          <div className="max-w-4xl mx-auto p-8">
            <EditorContent editor={editor} />
          </div>
        </div>
      </div>

      {/* ── Panneau droit : champs ── */}
      <div className="w-56 flex-shrink-0 border-l border-gray-200 bg-gray-50 flex flex-col overflow-hidden">
        <div className="px-3 py-3 border-b border-gray-200">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Champs</div>
          <input value={champSearch} onChange={e=>setChampSearch(e.target.value)}
            placeholder="Rechercher…" className="w-full border border-gray-300 rounded px-2 py-1 text-xs" />
        </div>
        <div className="flex-1 overflow-auto py-1">
          {Object.entries(champsFiltrés).map(([cat, champs]) => (
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
      </div>
      <style>{`
        .editeur-content { min-height: 600px; }
        .champ-tag {
          display: inline-block;
          background: #e3f2fd;
          color: #1565c0;
          border: 1px solid #90caf9;
          border-radius: 4px;
          padding: 0 6px;
          font-size: 0.8em;
          font-family: monospace;
          cursor: default;
          user-select: none;
          white-space: nowrap;
        }
        .editeur-content table { border-collapse: collapse; width: 100%; margin: 8px 0; }
        .editeur-content td, .editeur-content th {
          border: 1px solid #ccc;
          padding: 6px 8px;
          position: relative;
          vertical-align: top;
          min-width: 40px;
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
      `}</style>
    </div>
  );
}
