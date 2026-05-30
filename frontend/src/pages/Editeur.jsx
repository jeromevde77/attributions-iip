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
import { Node, Extension, mergeAttributes } from '@tiptap/core';
import Highlight from '@tiptap/extension-highlight';
import { Link } from '@tiptap/extension-link';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { TaskList } from '@tiptap/extension-task-list';
import { TaskItem } from '@tiptap/extension-task-item';
import { CharacterCount } from '@tiptap/extension-character-count';
import { Typography } from '@tiptap/extension-typography';

// ── Tableau type Word : fond de cellule + couleur de bordure (par cellule) ────
const cellAttrs = {
  backgroundColor: {
    default: null,
    parseHTML: el => el.style.backgroundColor || null,
    renderHTML: a => a.backgroundColor ? { style: `background-color:${a.backgroundColor}` } : {},
  },
  borderColor: {
    default: null,
    parseHTML: el => el.style.borderColor || null,
    renderHTML: a => a.borderColor ? { style: `border-color:${a.borderColor}` } : {},
  },
};
const CustomTableCell   = TableCell.extend({   addAttributes() { return { ...this.parent?.(), ...cellAttrs }; } });
const CustomTableHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellAttrs }; } });

// ── Police & taille de police (attributs sur textStyle, façon Word) ───────────
const TextFormat = Extension.create({
  name: 'textFormat',
  addOptions() { return { types: ['textStyle'] }; },
  addGlobalAttributes() {
    return [{
      types: this.options.types,
      attributes: {
        fontSize: {
          default: null,
          parseHTML: el => el.style.fontSize || null,
          renderHTML: a => a.fontSize ? { style: `font-size:${a.fontSize}` } : {},
        },
        fontFamily: {
          default: null,
          parseHTML: el => el.style.fontFamily?.replace(/["']/g, '') || null,
          renderHTML: a => a.fontFamily ? { style: `font-family:${a.fontFamily}` } : {},
        },
      },
    }];
  },
  addCommands() {
    return {
      setFontSize:   size   => ({ chain }) => chain().setMark('textStyle', { fontSize: size }).run(),
      setFontFamily: family => ({ chain }) => chain().setMark('textStyle', { fontFamily: family }).run(),
    };
  },
});

// ── Saut de page manuel (marqueur visible dans l'éditeur, coupure réelle au PDF) ──
const PageBreak = Node.create({
  name: 'pageBreak',
  group: 'block',
  atom: true,
  selectable: true,
  parseHTML() { return [{ tag: 'div[data-page-break]' }]; },
  renderHTML() { return ['div', { 'data-page-break': 'true', class: 'page-break' }]; },
  addCommands() { return { setPageBreak: () => ({ chain }) => chain().insertContent({ type: this.name }).run() }; },
});

// ── Interligne (sur paragraphes et titres) ────────────────────────────────────
const LineHeight = Extension.create({
  name: 'lineHeight',
  addOptions() { return { types: ['paragraph', 'heading'] }; },
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: {
      lineHeight: {
        default: null,
        parseHTML: el => el.style.lineHeight || null,
        renderHTML: a => a.lineHeight ? { style: `line-height:${a.lineHeight}` } : {},
      },
    }}];
  },
  addCommands() {
    return {
      setLineHeight: lh => ({ chain }) => {
        let c = chain();
        this.options.types.forEach(t => { c = c.updateAttributes(t, { lineHeight: lh }); });
        return c.run();
      },
    };
  },
});

// ── Retrait de paragraphe (marge gauche par paliers) ──────────────────────────
const Indent = Extension.create({
  name: 'indent',
  addOptions() { return { types: ['paragraph', 'heading'], step: 24, max: 240 }; },
  addGlobalAttributes() {
    return [{ types: this.options.types, attributes: {
      indent: {
        default: 0,
        parseHTML: el => parseInt(el.style.marginLeft, 10) || 0,
        renderHTML: a => a.indent ? { style: `margin-left:${a.indent}px` } : {},
      },
    }}];
  },
  addCommands() {
    const apply = delta => ({ chain, editor }) => {
      let c = chain();
      this.options.types.forEach(t => {
        const cur = editor.getAttributes(t).indent || 0;
        const next = Math.max(0, Math.min(this.options.max, cur + delta));
        c = c.updateAttributes(t, { indent: next });
      });
      return c.run();
    };
    return { indent: () => apply(this.options.step), outdent: () => apply(-this.options.step) };
  },
});
import { useState, useEffect } from 'react';
import { api, getAnnee } from '../lib/api.js';
import mammoth from 'mammoth/mammoth.browser.js';

// ─── Champs simples ────────────────────────────────────────────────────────
const CHAMPS = {
  'Établissement': [
    { key: 'etab.logo',           label: '🖼 Logo IIP couleurs (grand)' },
    { key: 'etab.logo_sm',        label: '🖼 Logo IIP couleurs (petit)' },
    { key: 'etab.logo_blanc',     label: '🖼 Logo IIP blanc transp. (grand)' },
    { key: 'etab.logo_blanc_sm',  label: '🖼 Logo IIP blanc transp. (petit)' },
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
  'Personnel établissement': [
    { key: 'directeur.nom_prenom',      label: 'Directeur — Nom Prénom' },
    { key: 'directeur.qualite',          label: 'Directeur — Qualité/Fonction' },
    { key: 'directeur.email',            label: 'Directeur — E-mail' },
    { key: 'dir_adjoint.nom_prenom',    label: 'Directeur adjoint — Nom Prénom' },
    { key: 'dir_adjoint.qualite',        label: 'Directeur adjoint — Qualité' },
    { key: 'secretaire.nom_prenom',     label: 'Secrétaire — Nom Prénom' },
    { key: 'coordinatrice.nom_prenom',  label: 'Coordinatrice — Nom Prénom' },
  ],
  'Contrat': [
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

// ─── TipTap : nœud EnTeteBlock ────────────────────────────────────────────────
const EnTeteBlock = Node.create({
  name: 'enTeteBlock', group: 'block', content: 'block+',
  defining: true, isolating: true,
  parseHTML() { return [{ tag: 'div[data-entete]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-entete': '1', class: 'entete-block' }), 0];
  },
  addNodeView() {
    return () => {
      const dom = document.createElement('div');
      dom.className = 'entete-block';
      dom.setAttribute('data-entete', '1');
      dom.style.cssText = 'border:2px solid #1F3864;border-radius:6px;margin:8px 0;overflow:hidden;';
      const hd = document.createElement('div');
      hd.contentEditable = 'false';
      hd.style.cssText = 'background:#1F3864;color:#fff;padding:3px 10px;font-size:11px;font-weight:bold;user-select:none;';
      hd.textContent = '⬆ En-tête (répété sur chaque page à l\'impression)';
      const contentDOM = document.createElement('div');
      contentDOM.style.cssText = 'padding:8px 10px;background:#eef2ff;min-height:36px;';
      dom.appendChild(hd); dom.appendChild(contentDOM);
      return { dom, contentDOM };
    };
  },
});

// ─── TipTap : nœud PiedDePageBlock ───────────────────────────────────────────
const PiedDePageBlock = Node.create({
  name: 'piedDePageBlock', group: 'block', content: 'block+',
  defining: true, isolating: true,
  parseHTML() { return [{ tag: 'div[data-pied]' }]; },
  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-pied': '1', class: 'pied-block' }), 0];
  },
  addNodeView() {
    return () => {
      const dom = document.createElement('div');
      dom.className = 'pied-block';
      dom.setAttribute('data-pied', '1');
      dom.style.cssText = 'border:2px solid #555;border-radius:6px;margin:8px 0;overflow:hidden;';
      const hd = document.createElement('div');
      hd.contentEditable = 'false';
      hd.style.cssText = 'background:#555;color:#fff;padding:3px 10px;font-size:11px;font-weight:bold;user-select:none;';
      hd.textContent = '⬇ Bas de page (répété sur chaque page à l\'impression)';
      const contentDOM = document.createElement('div');
      contentDOM.style.cssText = 'padding:8px 10px;background:#f5f5f5;min-height:36px;';
      dom.appendChild(hd); dom.appendChild(contentDOM);
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

// Règle horizontale graduée en cm, alignée sur la largeur A4 (210 mm = 21 cm).
// Les 2 cm de chaque bord (marges 20 mm) sont grisés.
function Regle() {
  const cm = Array.from({ length: 21 }, (_, i) => i);
  return (
    <div className="editeur-regle" aria-hidden="true">
      {cm.map(i => (
        <div key={i} className={`regle-cm${i < 2 || i >= 19 ? ' regle-marge' : ''}`}>
          <span className="regle-num">{i}</span>
        </div>
      ))}
    </div>
  );
}

// ─── Toolbar ───────────────────────────────────────────────────────────────
function Toolbar({ editor }) {
  // Force le re-rendu de la barre à chaque transaction (déplacement du curseur,
  // entrée/sortie de tableau…) pour que isActive() et les groupes conditionnels suivent.
  const [, forceUpdate] = useState(0);
  useEffect(() => {
    if (!editor) return;
    const rerender = () => forceUpdate(n => n + 1);
    editor.on('transaction', rerender);
    return () => { editor.off('transaction', rerender); };
  }, [editor]);
  // Insère le logo en base64 (auto-contenu, pas d'URL relative rejetée par TipTap)
  async function insertLogo(url, alt) {
    try {
      const resp = await fetch(url);
      const blob = await resp.blob();
      const b64 = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      editor.chain().focus().setImage({ src: b64, alt }).run();
    } catch { alert('Impossible de charger le logo.'); }
  }
  if (!editor) return null;
  return (
    <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-gray-200 bg-gray-50 sticky top-0 z-10">
      <Btn onClick={() => editor.chain().focus().undo().run()} disabled={!editor?.can()?.undo?.()} title="Annuler">↩</Btn>
      <Btn onClick={() => editor.chain().focus().redo().run()} disabled={!editor?.can()?.redo?.()} title="Rétablir">↪</Btn>
      <Sep/>
      <select value={(()=>{const l=[1,2,3,4,5,6].find(n=>editor.isActive('heading',{level:n}));return l?'h'+l:'p';})()}
        onChange={e=>{const v=e.target.value; v==='p'?editor.chain().focus().setParagraph().run():editor.chain().focus().toggleHeading({level:parseInt(v[1])}).run()}}
        className="h-7 border border-gray-300 rounded text-sm px-1 bg-white">
        <option value="p">Normal</option>
        {[1,2,3,4,5,6].map(n=><option key={n} value={'h'+n}>Titre {n}</option>)}
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
      <Btn onClick={() => editor.chain().focus().toggleTaskList().run()} active={editor.isActive('taskList')} title="Liste de tâches (cases à cocher)">☑</Btn>
      <Sep/>
      <Btn onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive('subscript')} title="Indice (X₂)">X₂</Btn>
      <Btn onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive('superscript')} title="Exposant (X²)">X²</Btn>
      <Btn onClick={() => { const url = window.prompt('URL du lien (vide pour retirer) :', editor.getAttributes('link').href || ''); if (url === null) return; const c = editor.chain().focus().extendMarkRange('link'); (url ? c.setLink({ href: url }) : c.unsetLink()).run(); }} active={editor.isActive('link')} title="Lien hypertexte">🔗</Btn>
      <Btn onClick={() => editor.chain().focus().toggleBlockquote().run()} active={editor.isActive('blockquote')} title="Citation">❝</Btn>
      <Btn onClick={() => editor.chain().focus().toggleCodeBlock().run()} active={editor.isActive('codeBlock')} title="Bloc de code">&lt;/&gt;</Btn>
      <Btn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Ligne horizontale">―</Btn>
      <Sep/>
      <Btn onClick={() => editor.chain().focus().outdent().run()} title="Diminuer le retrait">⇤</Btn>
      <Btn onClick={() => editor.chain().focus().indent().run()} title="Augmenter le retrait">⇥</Btn>
      <select title="Interligne" value="" onChange={e=>{ if(e.target.value) editor.chain().focus().setLineHeight(e.target.value).run(); }}
        className="h-7 border border-gray-300 rounded text-sm px-1 bg-white">
        <option value="">Interligne</option>
        <option value="1">1.0</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="2">2.0</option>
      </select>
      <Btn onClick={() => editor.chain().focus().setPageBreak().run()} title="Insérer un saut de page">⤓ Saut</Btn>
      <Sep/>
      <Btn onClick={() => editor.chain().focus().insertTable({ rows:3, cols:3, withHeaderRow:true }).run()} title="Insérer un tableau 3×3">⊞ Tableau</Btn>
      {editor.isActive('table') && <>
        <Btn onClick={() => editor.chain().focus().addColumnBefore().run()} title="Insérer une colonne à gauche">+Col ←</Btn>
        <Btn onClick={() => editor.chain().focus().addColumnAfter().run()} title="Insérer une colonne à droite">+Col →</Btn>
        <Btn onClick={() => editor.chain().focus().addRowBefore().run()} title="Insérer une ligne au-dessus">+Lig ↑</Btn>
        <Btn onClick={() => editor.chain().focus().addRowAfter().run()} title="Insérer une ligne en dessous">+Lig ↓</Btn>
        <Btn onClick={() => editor.chain().focus().mergeCells().run()} disabled={!editor?.can()?.mergeCells?.()} title="Fusionner les cellules sélectionnées">Fusionner</Btn>
        <Btn onClick={() => editor.chain().focus().splitCell().run()} disabled={!editor?.can()?.splitCell?.()} title="Scinder la cellule">Scinder</Btn>
        <Btn onClick={() => editor.chain().focus().toggleHeaderRow().run()} title="Basculer la ligne d'en-tête">En-tête</Btn>
        <label title="Couleur de fond de la cellule" className="flex items-center gap-0.5 h-7 px-1.5 rounded hover:bg-gray-100 cursor-pointer text-sm">
          Fond <input type="color" className="w-5 h-5 cursor-pointer border-0 p-0 bg-transparent" defaultValue="#fff3cd"
            onChange={e=>editor.chain().focus().setCellAttribute('backgroundColor', e.target.value).run()} />
        </label>
        <label title="Couleur de bordure de la cellule" className="flex items-center gap-0.5 h-7 px-1.5 rounded hover:bg-gray-100 cursor-pointer text-sm">
          Bordure <input type="color" className="w-5 h-5 cursor-pointer border-0 p-0 bg-transparent" defaultValue="#333333"
            onChange={e=>editor.chain().focus().setCellAttribute('borderColor', e.target.value).run()} />
        </label>
        <Btn onClick={() => editor.chain().focus().deleteColumn().run()} title="Supprimer la colonne" danger>− Col</Btn>
        <Btn onClick={() => editor.chain().focus().deleteRow().run()} title="Supprimer la ligne" danger>− Lig</Btn>
        <Btn onClick={() => editor.chain().focus().deleteTable().run()} title="Supprimer le tableau" danger>− Tableau</Btn>
      </>}
      <Sep/>
      <Btn onClick={() => insertLogo('/api/logo-iip', 'Institut Ilya Prigogine')} title="Insérer le logo IIP couleurs">🖼 Logo</Btn>
      <Btn onClick={() => editor.chain().focus().insertContent({ type: 'enTeteBlock', content: [{ type: 'paragraph' }] }).run()} title="Insérer un en-tête (répété sur chaque page)">⬆ En-tête</Btn>
      <Btn onClick={() => editor.chain().focus().insertContent({ type: 'piedDePageBlock', content: [{ type: 'paragraph' }] }).run()} title="Insérer un bas de page (répété sur chaque page)">⬇ Pied</Btn>
      <Sep/>
      <label title="Couleur du texte" className="flex items-center gap-0.5 h-7 px-1.5 rounded hover:bg-gray-100 cursor-pointer text-sm">
        A <input type="color" className="w-5 h-5 cursor-pointer border-0 p-0 bg-transparent" defaultValue="#000000"
          onChange={e=>editor.chain().focus().setColor(e.target.value).run()} />
      </label>
      <label title="Surligner" className="flex items-center gap-0.5 h-7 px-1.5 rounded hover:bg-gray-100 cursor-pointer text-sm">
        🖍 <input type="color" className="w-5 h-5 cursor-pointer border-0 p-0 bg-transparent" defaultValue="#ffff00"
          onChange={e=>editor.chain().focus().toggleHighlight({ color: e.target.value }).run()} />
      </label>
      <Sep/>
      <select title="Police" value="" onChange={e=>{ if(e.target.value) editor.chain().focus().setFontFamily(e.target.value).run(); }}
        className="h-7 border border-gray-300 rounded text-sm px-1 bg-white max-w-[6.5rem]">
        <option value="">Police</option>
        <option value="Arial, sans-serif">Arial</option>
        <option value="'Times New Roman', serif">Times New Roman</option>
        <option value="Calibri, sans-serif">Calibri</option>
        <option value="Georgia, serif">Georgia</option>
        <option value="Verdana, sans-serif">Verdana</option>
        <option value="'Courier New', monospace">Courier New</option>
      </select>
      <select title="Taille (pt)" value="" onChange={e=>{ if(e.target.value) editor.chain().focus().setFontSize(e.target.value).run(); }}
        className="h-7 border border-gray-300 rounded text-sm px-1 bg-white">
        <option value="">Taille</option>
        {['8pt','9pt','10pt','11pt','12pt','14pt','16pt','18pt','20pt','24pt','28pt','36pt'].map(s=>(
          <option key={s} value={s}>{s.replace('pt','')}</option>
        ))}
      </select>
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
  const [panelMode, setPanelMode]     = useState('champs');
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
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4, 5, 6] }, link: false, underline: false }),
      Underline, TextStyle, Color, TextFormat,
      Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Subscript, Superscript,
      TaskList, TaskItem.configure({ nested: true }),
      CharacterCount, Typography,
      PageBreak, LineHeight, Indent,
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
      Table.configure({ resizable: true }), TableRow, CustomTableHeader, CustomTableCell, Image,
      ChampNode, BoucleBlock, EnTeteBlock, PiedDePageBlock,
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

  // Importer un .docx (Word) → HTML (Mammoth) → chargé dans l'éditeur comme NOUVEAU template.
  // Conversion sémantique (titres, paragraphes, gras/italique, listes, tableaux, images) ;
  // la mise en page exacte de Word (polices/espacements précis) n'est pas reproduite.
  async function importerWord(file) {
    if (!editor || !file) return;
    setSaving(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const result = await mammoth.convertToHtml({ arrayBuffer }, {
        convertImage: mammoth.images.imgElement(async image => {
          const b64 = await image.readAsBase64String();
          return { src: `data:${image.contentType};base64,${b64}` };
        }),
      });
      editor.commands.setContent(result.value || '<p></p>');
      setTemplateId(null); // import = nouveau template (ne pas écraser l'existant)
      setNom(file.name.replace(/\.docx$/i, '') || 'Document importé');
      const warns = (result.messages || []).filter(m => m.type === 'warning').length;
      alert('Word importé ✓' + (warns ? ` (${warns} avertissement(s) de conversion)` : '') + '\n\nVérifie la mise en forme, puis clique « Sauvegarder » pour le conserver.');
    } catch (e) {
      alert('Import impossible : ' + e.message);
    } finally {
      setSaving(false);
    }
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
    try {
      const r = await fetch(`/api/templates/${t.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      const d = await r.json();
      let contenu = d.contenu || '';

      // Nettoyer les src d'image relatifs ou invalides pour TipTap 3.x
      contenu = contenu.replace(/<img([^>]*)src="(?!data:|https?:\/\/)[^"]*"([^>]*)>/gi,
        '<span style="background:#fef3c7;padding:2px 6px;border-radius:4px;font-size:11px">🖼 [logo — réinsérer via bouton]</span>');

      console.log('[Éditeur] setContent, longueur:', contenu.length);
      editor?.commands.setContent(contenu);
      console.log('[Éditeur] setContent OK');
    } catch (e) {
      console.error('[chargerTemplate] ERREUR :', e);
      alert(`Erreur au chargement du template "${t.nom}" :\n\n${e.message}\n\n(voir console F12 pour le détail)`);
    }
  }

  function nouveauTemplate() {
    setTemplateId(null); setNom('Nouveau template');
    editor?.commands.setContent('<p>Commencez votre document…</p>');
  }

  async function generer() {
    if (!editor || !templateId) { alert('Sauvegardez d\'abord le template'); return; }
    setGenerating(true);
    // Ouvrir la fenêtre AVANT l'await — nécessaire pour Safari (popup synchrone)
    const w = window.open('about:blank', '_blank');
    if (!w) { alert('Autorisez les pop-ups pour ce site'); setGenerating(false); return; }
    const token = localStorage.getItem('token');
    try {
      const r = await fetch(`/api/templates/${templateId}/generer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ prof_id: profId || undefined, ue_num: ueNum || undefined, section: section || undefined, annee }),
      });
      const { html, headerHtml, footerHtml, nom: tnom } = await r.json();
      const hasHeader = headerHtml && headerHtml.trim();
      const hasFooter = footerHtml && footerHtml.trim();
      const fullHtml = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><title>${tnom}</title>
        <style>
          @page{size:A4;margin:0}
          body{font-family:Arial,sans-serif;margin:0;padding:20mm 15mm;font-size:11pt;color:#000;box-sizing:border-box}
          ${hasHeader ? 'body{padding-top:30mm}' : ''}
          ${hasFooter ? 'body{padding-bottom:25mm}' : ''}
          table{width:100%;border-collapse:collapse;margin:6px 0}
          td,th{border:1px solid #333;padding:4px 6px;vertical-align:top}
          th{background:#eee;font-weight:bold}
          h1{font-size:16pt}h2{font-size:13pt}h3{font-size:11pt}
          .page-break{break-after:page;page-break-after:always;height:0;border:0;margin:0}
          ul[data-type="taskList"]{list-style:none;padding-left:0}
          ul[data-type="taskList"] li{display:flex;align-items:flex-start;gap:6px}
          a{color:#1565c0}blockquote{border-left:3px solid #ccc;padding-left:12px;color:#555;font-style:italic}
          pre{background:#f5f5f5;padding:8px 10px;border-radius:4px;font-family:monospace}
          p{margin:4px 0}.champ-tag,.entete-block,.pied-block,.boucle-block{display:block}
          .doc-header{border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:16px}
          .doc-footer{border-top:1px solid #ccc;padding-top:6px;margin-top:20px;font-size:9pt;color:#666}
          @media print{
            button{display:none}
            body{padding:10mm 15mm ${hasFooter?'22mm':'10mm'} 15mm}
            ${hasHeader ? `.doc-header{position:fixed;top:0;left:0;right:0;background:white;padding:4mm 15mm;border-bottom:1px solid #ccc;z-index:100}` : ''}
            ${hasFooter ? `.doc-footer{position:fixed;bottom:0;left:0;right:0;background:white;padding:3mm 15mm;border-top:1px solid #ccc}` : ''}
          }
        </style></head><body>
        <div style="text-align:right;margin-bottom:10px">
          <button onclick="window.print()" style="padding:6px 16px;background:#1a5276;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:13px">🖨 Imprimer / PDF</button>
        </div>
        ${hasHeader ? `<div class="doc-header">${headerHtml}</div>` : ''}
        <div class="doc-body">${html}</div>
        ${hasFooter ? `<div class="doc-footer">${footerHtml}</div>` : ''}
        </body></html>`;
      // Blob URL : compatible Safari (pas de document.write)
      const blob = new Blob([fullHtml], { type: 'text/html;charset=utf-8' });
      const url  = URL.createObjectURL(blob);
      w.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (e) {
      w.close();
      alert('Erreur : ' + e.message);
    }
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
            <div key={t.id} className={`group flex items-start border-b border-gray-100 hover:bg-white transition ${templateId === t.id ? 'bg-white' : ''}`}>
              <button onClick={() => chargerTemplate(t)} className="flex-1 text-left px-3 py-2 text-sm min-w-0">
                <div className={`truncate ${templateId === t.id ? 'font-semibold text-iip-gold' : 'text-gray-700'}`}>{t.nom}</div>
                <div className="text-xs text-gray-400">{t.modifie_le?.slice(0,10)}</div>
              </button>
              <button
                onClick={async e => {
                  e.stopPropagation();
                  if (!confirm(`Supprimer le template « ${t.nom} » ?`)) return;
                  await fetch(`/api/templates/${t.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
                  if (templateId === t.id) { setTemplateId(null); setNom('Nouveau template'); editor?.commands.setContent('<p></p>'); }
                  chargerTemplates();
                }}
                title="Supprimer ce template"
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 px-2 py-2 text-gray-300 hover:text-red-500 transition text-base">
                ✕
              </button>
            </div>
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
          <label title="Importer un document Word (.docx) et l'éditer" className="bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 text-sm px-3 py-1.5 rounded font-medium whitespace-nowrap cursor-pointer">
            📄 Importer Word
            <input type="file" accept=".docx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importerWord(f); e.target.value = ''; }} />
          </label>
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
        <div className="flex-1 overflow-auto bg-gray-200 py-6">
          <div className="editeur-doc mx-auto">
            <Regle />
            <div className="editeur-page">
              <EditorContent editor={editor} />
            </div>
          </div>
        </div>
        {editor && (
          <div className="flex-shrink-0 border-t border-gray-200 bg-white px-4 py-1 text-xs text-gray-400 text-right">
            {editor.storage.characterCount.words()} mots · {editor.storage.characterCount.characters()} caractères
          </div>
        )}
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
        .editeur-doc { width: 210mm; }
        .editeur-regle {
          width: 210mm; height: 20px; display: flex;
          background: #fbfbfb; border: 1px solid #ddd; border-bottom: none;
          box-sizing: border-box; user-select: none;
        }
        .regle-cm {
          width: 10mm; border-left: 1px solid #c8c8c8;
          position: relative; box-sizing: border-box;
        }
        .regle-cm:last-child { border-right: 1px solid #c8c8c8; }
        .regle-marge { background: #ececec; }
        .regle-num {
          position: absolute; left: 2px; top: 3px;
          font-size: 8px; color: #999; line-height: 1;
        }
        .editeur-page {
          width: 210mm; min-height: 297mm; padding: 20mm;
          background: #fff; box-sizing: border-box;
          box-shadow: 0 2px 12px rgba(0,0,0,0.15);
        }
        .editeur-content { min-height: 257mm; outline: none; }
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
        .page-break { border-top: 2px dashed #c0392b; margin: 14px 0; height: 0; position: relative; }
        .page-break::after { content: '⤓ Saut de page'; position: absolute; right: 0; top: -8px; font-size: 9px; color: #c0392b; background: #fff; padding: 0 4px; }
        .editeur-content ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        .editeur-content ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 6px; }
        .editeur-content ul[data-type="taskList"] li > label { margin-top: 2px; }
        .editeur-content ul:not([data-type="taskList"]) { list-style: disc; padding-left: 1.6em; margin: 4px 0; }
        .editeur-content ol { list-style: decimal; padding-left: 1.6em; margin: 4px 0; }
        .editeur-content li { margin: 2px 0; }
        .editeur-content li > p { margin: 0; }
        .editeur-content a { color: #1565c0; text-decoration: underline; }
        .editeur-content blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: 8px 0; font-style: italic; }
        .editeur-content pre { background: #f5f5f5; border-radius: 4px; padding: 8px 10px; font-family: monospace; font-size: 0.9em; overflow-x: auto; }
        .editeur-content hr { border: none; border-top: 2px solid #999; margin: 14px 0; }
        .editeur-content hr.ProseMirror-selectednode { border-top-color: #1a5276; }
      `}</style>
    </div>
  );
}
