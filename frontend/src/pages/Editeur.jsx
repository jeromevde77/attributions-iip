import { useEditor, EditorContent } from '@tiptap/react';
import { BarreEdition, BulleSelection } from '../components/BarreEdition.jsx';
import { nomPropre } from '../lib/nom.js';
import { IconAlignLeft, IconAlignCenter, IconAlignRight, IconAlignJustified, IconX, IconDeviceFloppy, IconPrinter,
  IconPlus, IconTrash, IconFileImport, IconLayout, IconChevronDown, IconEye, IconSearch, IconRepeat } from '@tabler/icons-react';
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
export const CustomTableCell   = TableCell.extend({   addAttributes() { return { ...this.parent?.(), ...cellAttrs }; } });
export const CustomTableHeader = TableHeader.extend({ addAttributes() { return { ...this.parent?.(), ...cellAttrs }; } });

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
import { useState, useEffect, useRef } from 'react';
import { api, getAnnee } from '../lib/api.js';
import PreviewModal from '../components/PreviewModal.jsx';
import mammoth from 'mammoth/mammoth.browser.js';
import { demander, informer, saisir } from '../lib/dialogue.jsx';

// Aplatit une image (data URL) sur fond blanc -> supprime toute transparence.
// Evite le fond noir des PNG transparents a l'impression PDF (notamment Safari,
// dont le moteur aplatit l'alpha sur noir avant meme d'appliquer le fond CSS).
// NB: on utilise window.Image car le symbole Image est deja pris par l'extension TipTap.
function aplatirSurBlanc(src) {
  return new Promise(resolve => {
    try {
      const img = new window.Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          c.width = img.naturalWidth || img.width;
          c.height = img.naturalHeight || img.height;
          const ctx = c.getContext('2d');
          ctx.fillStyle = '#fff';
          ctx.fillRect(0, 0, c.width, c.height);
          ctx.drawImage(img, 0, 0);
          resolve(c.toDataURL('image/png'));
        } catch { resolve(src); }
      };
      img.onerror = () => resolve(src);
      img.src = src;
    } catch { resolve(src); }
  });
}

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
    color: '#eaf2ff', border: 'var(--c-principal)',
    description: 'Génère automatiquement un tableau hiérarchique complet : UE avec leurs cours, périodes prof et étudiant. Sélectionnez une section à la génération.',
    champs: [], // Pas de champs manuels — le backend génère tout
  },
  profs_ue: {
    label: "Pour chaque prof de l'UE",
    color: '#e8f5e9', border: 'var(--c-reussi)',
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
    color: '#FFFFFF', border: 'var(--c-disponible)',
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
    color: '#fce4ec', border: 'var(--c-refuse)',
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
export const ChampNode = Node.create({
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
      dom.style.cssText = 'border:2px solid var(--c-principal);border-radius:6px;margin:8px 0;overflow:hidden;';
      const hd = document.createElement('div');
      hd.contentEditable = 'false';
      hd.style.cssText = 'background:var(--c-principal);color:#fff;padding:3px 10px;font-size:11px;font-weight:bold;user-select:none;';
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
        ${active ? 'bg-iip-gold text-white' : danger ? 'text-white hover:bg-red-500' : 'text-gray-700 hover:bg-gray-100'}
        ${disabled ? 'opacity-30 cursor-not-allowed' : 'cursor-pointer'}`}>
      {children}
    </button>
  );
}
function Sep() { return <div className="w-px h-5 bg-gray-200 mx-0.5 self-center" />; }

// Formats de page supportés : A4 Portrait et A4 Paysage.
const PAGE_FORMATS = {
  A4P: { label: '⬜ Portrait', w: '210mm', h: '297mm', minH: '257mm', rulerCount: 21, marginCm: 2, printSize: 'A4 portrait' },
  A4L: { label: '🔲 Paysage',  w: '297mm', h: '210mm', minH: '170mm', rulerCount: 30, marginCm: 2, printSize: 'A4 landscape' },
};

const DEFAULT_MARGINS = { top: 20, right: 20, bottom: 20, left: 20 };

// Icônes d'alignement (SVG minimaliste, 4 lignes horizontales)
const IcoAlignLeft = () => <IconAlignLeft size={14} stroke={1.8} />;
const IcoAlignCenter = () => <IconAlignCenter size={14} stroke={1.8} />;
const IcoAlignRight = () => <IconAlignRight size={14} stroke={1.8} />;
const IcoAlignJustify = () => <IconAlignJustified size={14} stroke={1.8} />;
// Les zones de marge sont grisées. Les poignées gauche/droite sont glissables.
function Regle({ fmt = 'A4P', margins, onMarginChange }) {
  const { rulerCount } = PAGE_FORMATS[fmt] || PAGE_FORMATS.A4P;
  const pageWidthMm = fmt === 'A4L' ? 297 : 210;
  const rulerRef = useRef(null);
  const cm = Array.from({ length: rulerCount }, (_, i) => i);

  function isGrey(i) {
    const mm = i * 10;
    return mm < margins.left || mm >= pageWidthMm - margins.right;
  }

  function startDrag(side, e) {
    e.preventDefault();
    const rect = rulerRef.current?.getBoundingClientRect();
    if (!rect) return;
    function onMove(mv) {
      const x = Math.max(0, Math.min(1, (mv.clientX - rect.left) / rect.width));
      const mm = Math.round(x * pageWidthMm);
      if (side === 'left')  onMarginChange(m => ({ ...m, left:  Math.max(5, Math.min(50, mm)) }));
      if (side === 'right') onMarginChange(m => ({ ...m, right: Math.max(5, Math.min(50, pageWidthMm - mm)) }));
    }
    function onUp() { window.removeEventListener('pointermove', onMove); window.removeEventListener('pointerup', onUp); }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  const leftPct  = (margins.left / pageWidthMm) * 100;
  const rightPct = ((pageWidthMm - margins.right) / pageWidthMm) * 100;
  const handleStyle = (pct) => ({
    position: 'absolute', left: `${pct}%`, top: 0, height: '100%',
    width: '10px', marginLeft: '-5px', cursor: 'ew-resize', zIndex: 10,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  });
  const lineStyle = { width: '2px', height: '100%', background: 'var(--c-faveur)', pointerEvents: 'none', opacity: 0.8 };
  const arrowStyle = {
    position: 'absolute', bottom: '-5px', width: 0, height: 0,
    borderLeft: '4px solid transparent', borderRight: '4px solid transparent',
    borderTop: '5px solid var(--c-faveur)', pointerEvents: 'none',
  };

  return (
    <div ref={rulerRef} className="editeur-regle" style={{ position: 'relative', overflow: 'visible' }} aria-hidden="true">
      {cm.map(i => (
        <div key={i} className={`regle-cm${isGrey(i) ? ' regle-marge' : ''}`}>
          <span className="regle-num">{i}</span>
        </div>
      ))}
      <div style={handleStyle(leftPct)} onPointerDown={e => startDrag('left', e)} title={`Marge gauche : ${margins.left} mm`}>
        <div style={lineStyle} /><div style={arrowStyle} />
      </div>
      <div style={handleStyle(rightPct)} onPointerDown={e => startDrag('right', e)} title={`Marge droite : ${margins.right} mm`}>
        <div style={lineStyle} /><div style={arrowStyle} />
      </div>
    </div>
  );
}

// ─── Toolbar ───────────────────────────────────────────────────────────────
/* LA BARRE EST EXPORTÉE, ET SERT AUSSI AUX TEXTES DU CORPUS (Documentation).
 * Un second éditeur aurait été le dixième exemplaire d'une chose qui existe.
 * `sobre` masque ce qui n'a de sens que pour un MODÈLE de pièce — logo,
 * en-tête et pied répétés, saut de page — et ce que le serveur retirerait de
 * toute façon d'un texte du corpus (police, taille, interligne, retrait,
 * cases à cocher, code) : un bouton dont l'effet disparaît à l'enregistrement
 * est un bouton qui ment. */
/* LA BARRE D'ÉDITION VIT DÉSORMAIS DANS components/BarreEdition.jsx (refonte du
   9 octobre 2026). Le nom `Toolbar` reste exporté : les autres éditeurs
   l'importent d'ici. */
export function Toolbar({ editor, sobre = false }) {
  return <><BarreEdition editor={editor} sobre={sobre} aplatirLogo={aplatirSurBlanc} /><BulleSelection editor={editor} /></>;
}

// ─── Composant principal ───────────────────────────────────────────────────
export default function Editeur() {
  const annee = getAnnee() || '2025-2026';
  const [templates, setTemplates] = useState([]);
  const [templateId, setTemplateId]   = useState(null);
  const [nom, setNom]                 = useState('Nouveau modèle');
  const [format, setFormat]           = useState('A4P');
  const [margins, setMargins]         = useState({ ...DEFAULT_MARGINS });
  const [showMargins, setShowMargins] = useState(false);
  const [showExemple, setShowExemple] = useState(false);
  const [filtreModeles, setFiltreModeles] = useState('');
  const [saving, setSaving]           = useState(false);
  const [generating, setGenerating]   = useState(false);
  const [previewHtml, setPreviewHtml] = useState(null);
  const [profId, setProfId]           = useState('');
  const [ueNum, setUeNum]             = useState('');
  const [section, setSection]         = useState('');
  const [profs, setProfs]             = useState([]);
  const [sections, setSections]       = useState([]);
  /* UNE UNITÉ SE CHOISIT, ELLE NE SE TAPE PAS. Le champ « N° UE » était libre :
     on tapait 95, l'unité n'était pas de cette section ou de ce millésime, et
     l'aperçu sortait vide sans dire pourquoi. */
  const [uesEd, setUesEd]             = useState([]);
  const [search, setSearch]           = useState('');
  const [panelMode, setPanelMode]     = useState('champs');
  const [boucleActive, setBoucleActive] = useState('profs_ue');

  useEffect(() => {
    chargerTemplates();
    api.professeurs(true).then(setProfs).catch(() => {});
    api.sections().then(setSections).catch(() => {});
  }, []);

  /* Les unités du millésime, restreintes à la section quand elle est choisie :
     la liste suit le filtre au lieu de proposer des unités qui n'y sont pas. */
  useEffect(() => {
    api.ue(section || undefined)
      .then(l => setUesEd(Array.isArray(l) ? l : []))
      .catch(() => setUesEd([]));
  }, [section, annee]);

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

  // ── LE CODE DU MODÈLE, À NU ────────────────────────────────────────────────
  //
  // L'éditeur visuel sait faire beaucoup, mais pas tout : un tableau à colonnes
  // fixes, un style qu'aucun bouton ne pose, une balise que TipTap n'expose
  // pas. Et quand un modèle sort de travers, la seule question utile est
  // « qu'y a-t-il vraiment dedans ? » — à quoi l'éditeur visuel ne répondait
  // pas. On peut donc voir et écrire le HTML directement.
  //
  // UNE MISE EN GARDE HONNÊTE : repasser en visuel fait relire le HTML par
  // TipTap, qui ne garde que ce que son schéma connaît. Une balise exotique
  // écrite à la main survit à l'enregistrement depuis le code, mais pas à un
  // aller-retour par le mode visuel. C'est dit à l'écran, pas caché.
  const [modeCode, setModeCode] = useState(false);
  const [codeHtml, setCodeHtml] = useState('');

  function versCode() {
    setCodeHtml(editor?.getHTML() || '');
    setModeCode(true);
  }
  function versVisuel() {
    editor?.commands.setContent(codeHtml || '<p></p>');
    setModeCode(false);
  }

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
      // Aplatir les images transparentes sur blanc (sinon fond noir a l'impression Safari)
      let htmlImporte = result.value || '<p></p>';
      try {
        const doc = new DOMParser().parseFromString(htmlImporte, 'text/html');
        await Promise.all([...doc.querySelectorAll('img')].map(async el => {
          const s = el.getAttribute('src') || '';
          if (s.startsWith('data:image')) el.setAttribute('src', await aplatirSurBlanc(s));
        }));
        htmlImporte = doc.body.innerHTML || htmlImporte;
      } catch { /* en cas d'echec on garde le HTML d'origine */ }
      editor.commands.setContent(htmlImporte);
      setTemplateId(null); // import = nouveau template (ne pas écraser l'existant)
      setNom(file.name.replace(/\.docx$/i, '') || 'Document importé');
      const warns = (result.messages || []).filter(m => m.type === 'warning').length;
      informer('Word importé ✓' + (warns ? ` (${warns} avertissement(s) de conversion)` : '') + '\n\nVérifie la mise en forme, puis clique « Sauvegarder » pour le conserver.');
    } catch (e) {
      informer('Import impossible : ' + e.message);
    } finally {
      setSaving(false);
    }
  }

  async function sauvegarder() {
    if (!editor) return;
    setSaving(true);
    // EN MODE CODE, C'EST LE CODE QUI FAIT FOI. Prendre editor.getHTML()
    // enregistrerait la version d'avant la frappe, sans rien dire.
    const contenu = modeCode ? codeHtml : editor.getHTML();
    const token = localStorage.getItem('token');
    try {
      if (templateId) {
        await fetch(`/api/templates/${templateId}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ nom, contenu, format, margins }) });
      } else {
        const r = await fetch('/api/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify({ nom, contenu, format, margins }) });
        const d = await r.json();
        setTemplateId(d.id);
      }
      chargerTemplates();
    } catch (e) { informer('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  async function chargerTemplate(t) {
    setTemplateId(t.id); setNom(t.nom);
    const token = localStorage.getItem('token');
    try {
      const r = await fetch(`/api/templates/${t.id}`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`HTTP ${r.status}: ${r.statusText}`);
      const d = await r.json();
      setFormat(d.format || 'A4P');
      setMargins(d.margins ? (typeof d.margins === 'string' ? JSON.parse(d.margins) : d.margins) : { ...DEFAULT_MARGINS });
      let contenu = d.contenu || '';

      // Nettoyer les src d'image relatifs ou invalides pour TipTap 3.x
      contenu = contenu.replace(/<img([^>]*)src="(?!data:|https?:\/\/)[^"]*"([^>]*)>/gi,
        '<span style="background:#fef3c7;padding:2px 6px;border-radius:4px;font-size:11px">🖼 [logo — réinsérer via bouton]</span>');

      console.log('[Éditeur] setContent, longueur:', contenu.length);
      editor?.commands.setContent(contenu);
      // Le code montre CE QUI EST EN BASE, pas ce que TipTap en a fait : c'est
      // tout l'intérêt d'aller y voir quand un modèle sort de travers.
      setCodeHtml(d.contenu || '');
      console.log('[Éditeur] setContent OK');
    } catch (e) {
      console.error('[chargerTemplate] ERREUR :', e);
      informer(`Erreur au chargement du template "${t.nom}" :\n\n${e.message}\n\n(voir console F12 pour le détail)`);
    }
  }

  function nouveauTemplate() {
    setTemplateId(null); setNom('Nouveau modèle'); setFormat('A4P'); setMargins({ ...DEFAULT_MARGINS });
    editor?.commands.setContent('<p>Commencez votre document…</p>');
    setCodeHtml('<p>Commencez votre document…</p>');
  }

  async function generer() {
    if (!editor || !templateId) { informer('Sauvegardez d\'abord le template'); return; }
    setGenerating(true);
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
          @page{size:${PAGE_FORMATS[format]?.printSize || 'A4 portrait'};margin:0}
          body{font-family:Arial,sans-serif;margin:0;padding:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;font-size:11pt;color:#000;box-sizing:border-box}
          img{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact;max-width:100%}
          ${hasHeader ? `body{padding-top:${Math.max(margins.top, 30)}mm}` : ''}
          ${hasFooter ? `body{padding-bottom:${Math.max(margins.bottom, 25)}mm}` : ''}
          table{width:100%;border-collapse:collapse;margin:6px 0}
          td,th{border:1px solid #333;padding:4px 6px;vertical-align:top}
          th{background:#eee;font-weight:bold}
          h1{font-size:16pt}h2{font-size:13pt}h3{font-size:11pt}
          .page-break{break-after:page;page-break-after:always;height:0;border:0;margin:0}
          ul[data-type="taskList"]{list-style:none;padding-left:0}
          ul[data-type="taskList"] li{display:flex;align-items:flex-start;gap:6px}
          a{color:var(--c-texte)}blockquote{border-left:3px solid #ccc;padding-left:12px;color:#555;font-style:italic}
          pre{background:#f5f5f5;padding:8px 10px;border-radius:4px;font-family:monospace}
          p{margin:4px 0}.champ-tag,.entete-block,.pied-block,.boucle-block{display:block}
          .doc-header{border-bottom:1px solid #ccc;padding-bottom:6px;margin-bottom:16px}
          .doc-footer{border-top:1px solid #ccc;padding-top:6px;margin-top:20px;font-size:9pt;color:#666}
          @media screen{
            html{background:#e5e5e5}
            body{max-width:${PAGE_FORMATS[format]?.w || '210mm'};min-height:${PAGE_FORMATS[format]?.h || '297mm'};
                 margin:16px auto;background:#fff;box-shadow:0 2px 14px rgba(0,0,0,.18)}
          }
          @media print{
            button{display:none}
            body{padding:${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm}
            ${hasHeader ? `.doc-header{position:fixed;top:0;left:0;right:0;background:white;padding:4mm ${margins.right}mm;border-bottom:1px solid #ccc;z-index:100}` : ''}
            ${hasFooter ? `.doc-footer{position:fixed;bottom:0;left:0;right:0;background:white;padding:3mm ${margins.right}mm;border-top:1px solid #ccc}` : ''}
          }
        </style></head><body>
        ${hasHeader ? `<div class="doc-header">${headerHtml}</div>` : ''}
        <div class="doc-body">${html}</div>
        ${hasFooter ? `<div class="doc-footer">${footerHtml}</div>` : ''}
        </body></html>`;
      setPreviewHtml(fullHtml);
    } catch (e) {
      informer('Erreur : ' + e.message);
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
      {/* ── Panneau gauche : les modèles ── */}
      <div className="w-60 flex-shrink-0 border-r border-slate-200 flex flex-col overflow-hidden">
        <div className="px-3 pt-3 pb-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">Modèles</span>
            <button onClick={nouveauTemplate} className="bouton text-[12px] h-7 px-2 inline-flex items-center gap-1">
              <IconPlus size={13} /> Nouveau</button>
          </div>
          <input value={filtreModeles} onChange={e => setFiltreModeles(e.target.value)} placeholder="Chercher un modèle…"
            data-reponses="non" className="controle w-full text-[13px]" />
        </div>
        <div className="flex-1 overflow-auto px-1.5 pb-2">
          {templates.filter(t => !filtreModeles || String(t.nom || '').toLowerCase().includes(filtreModeles.toLowerCase())).map(t => (
            <div key={t.id} className={`group flex items-center rounded-champ mb-0.5 ${templateId === t.id ? 'bg-white border border-[var(--c-disponible)]' : 'border border-transparent hover:bg-slate-100'}`}>
              <button onClick={() => chargerTemplate(t)} className="flex-1 text-left px-2.5 py-1.5 min-w-0">
                <div className={`truncate text-[13px] ${templateId === t.id ? 'font-semibold text-iip-texte' : 'text-slate-700'}`}>{t.nom}</div>
                <div className="text-[11px] text-slate-400">modifié le {String(t.modifie_le || '').slice(0, 10).split('-').reverse().join('/')}</div>
              </button>
              <button
                onClick={async e => {
                  e.stopPropagation();
                  if (!(await demander(`Supprimer le modèle « ${t.nom} » ?`))) return;
                  await fetch(`/api/templates/${t.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('token')}` } });
                  if (templateId === t.id) { setTemplateId(null); setNom('Nouveau modèle'); editor?.commands.setContent('<p></p>'); }
                  chargerTemplates();
                }}
                title="Supprimer ce modèle"
                className="opacity-0 group-hover:opacity-100 flex-shrink-0 px-2 text-slate-300 hover:text-rose-600 transition">
                <IconTrash size={15} />
              </button>
            </div>
          ))}
          {templates.length === 0 && <div className="text-[12px] text-slate-400 px-3 py-4">Aucun modèle</div>}
        </div>
      </div>

      {/* ── Zone centrale : éditeur ── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* UNE BARRE D'EN-TÊTE, TROIS GESTES : nommer, régler la page, produire.
            Les données d'exemple vont avec l'aperçu, la mise en page avec la page. */}
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 bg-white flex-shrink-0 flex-wrap">
          <input value={nom} onChange={e => setNom(e.target.value)} data-reponses="non"
            className="flex-1 min-w-[12rem] h-9 px-2 rounded-champ border border-transparent hover:border-slate-200 focus:border-slate-300 text-[15px] font-semibold text-iip-texte outline-none"
            placeholder="Nom du modèle" />
          <label title="Importer un document Word (.docx) comme nouveau modèle"
            className="bouton controle inline-flex items-center gap-1.5 cursor-pointer">
            <IconFileImport size={15} /> Word
            <input type="file" accept=".docx" className="hidden"
              onChange={e => { const f = e.target.files?.[0]; if (f) importerWord(f); e.target.value = ''; }} />
          </label>
          <div className="relative">
            <button onClick={() => setShowMargins(v => !v)} className="bouton controle inline-flex items-center gap-1.5" title="Format et marges">
              <IconLayout size={15} /> Page <IconChevronDown size={12} className="opacity-60" />
            </button>
            {showMargins && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-carte shadow-flottant p-3 z-50 w-64 space-y-3">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Format</div>
                  <div className="segments flex">
                    {Object.entries(PAGE_FORMATS).map(([key, pf]) => (
                      <button key={key} onClick={() => setFormat(key)}
                        className={`flex-1 px-2 py-1.5 text-[12px] ${format === key ? 'bg-iip-blue text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>
                        {pf.label}</button>))}
                  </div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Marges (mm)</div>
                  <div className="grid grid-cols-2 gap-2">
                    {[['top', 'Haut'], ['bottom', 'Bas'], ['left', 'Gauche'], ['right', 'Droite']].map(([side, label]) => (
                      <label key={side} className="flex flex-col gap-0.5">
                        <span className="text-[11px] text-slate-500">{label}</span>
                        <input type="number" min="5" max="60" value={margins[side]}
                          onChange={e => setMargins(m => ({ ...m, [side]: Math.max(5, Math.min(60, Number(e.target.value) || 5)) }))}
                          className="controle w-full" />
                      </label>))}
                  </div>
                  <button onClick={() => setMargins({ ...DEFAULT_MARGINS })} className="mt-2 text-[12px] text-slate-500 hover:text-slate-800">
                    Rétablir 20 mm partout</button>
                </div>
              </div>)}
          </div>
          <div className="segments flex h-9" title="Mode d'édition">
            {[{ k: false, l: 'Visuel', t: 'Édition assistée' }, { k: true, l: 'HTML', t: 'Le HTML du modèle, tel qu’il est enregistré' }].map(x => (
              <button key={String(x.k)} title={x.t} onClick={() => (x.k ? versCode() : versVisuel())}
                className={`px-3 text-[13px] ${modeCode === x.k ? 'bg-iip-blue text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}>{x.l}</button>))}
          </div>
          <div className="relative">
            <div className="flex">
              <button onClick={generer} disabled={generating} className="bouton bouton-sortir controle rounded-r-none inline-flex items-center gap-1.5"
                title="Composer la pièce sur les données d'exemple choisies">
                <IconEye size={15} /> {generating ? 'Composition…' : 'Aperçu'}</button>
              <button onClick={() => setShowExemple(v => !v)} className="bouton bouton-sortir controle rounded-l-none border-l-0 px-2"
                title="Données d'exemple de l'aperçu"><IconChevronDown size={13} /></button>
            </div>
            {showExemple && (
              <div className="absolute top-full right-0 mt-1 bg-white border border-slate-200 rounded-carte shadow-flottant p-3 z-50 w-80 space-y-2">
                <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide">L’aperçu se compose sur…</div>
                <select value={section} onChange={e => setSection(e.target.value)} className="controle w-full">
                  <option value="">Section — aucune</option>
                  {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
                </select>
                <select value={profId} onChange={e => setProfId(e.target.value)} className="controle w-full">
                  <option value="">Membre du personnel — aucun</option>
                  {profs.map(p => <option key={p.id} value={p.id}>{nomPropre(p.nom, p.prenom)}</option>)}
                </select>
                <select value={ueNum} onChange={e => setUeNum(e.target.value)} className="controle w-full">
                  <option value="">Unité — aucune</option>
                  {uesEd.map(u => <option key={u.ue_num} value={u.ue_num}>UE {u.ue_num} — {(u.ue_nom || '').slice(0, 40)}</option>)}
                </select>
              </div>)}
          </div>
          <button onClick={sauvegarder} disabled={saving} className="bouton bouton-fort controle inline-flex items-center gap-1.5">
            <IconDeviceFloppy size={15} /> {saving ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
        {!modeCode && <Toolbar editor={editor} />}
        {modeCode ? (
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50">
            <div className="flex-none px-4 py-2 text-[12px] text-amber-900 bg-amber-50
                            border-b border-amber-200">
              Le HTML du modèle. « Enregistrer » écrit ce que vous voyez ici.
              <b> Repasser en visuel</b> fait relire ce code par l'éditeur, qui ne
              garde que ce qu'il sait représenter : une balise ou un attribut
              inhabituel y survit à l'enregistrement depuis le code, mais pas à
              l'aller-retour. Les champs s'écrivent <code>{'{{prof.nom}}'}</code>,
              les boucles <code>{'{{#profs_ue}}…{{/profs_ue}}'}</code>.
            </div>
            <textarea value={codeHtml} onChange={e => setCodeHtml(e.target.value)}
              spellCheck={false} wrap="off"
              className="flex-1 w-full p-4 font-mono text-[12px] leading-relaxed
                         bg-white text-slate-800 outline-none resize-none" />
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-slate-100 py-6">
            <div className="editeur-doc mx-auto">
              <Regle fmt={format} margins={margins} onMarginChange={setMargins} />
              <div className="editeur-page">
                <EditorContent editor={editor} />
              </div>
            </div>
          </div>
        )}
        {editor && (
          <div className="flex-shrink-0 border-t border-slate-200 bg-white px-4 py-1 text-[11px] text-slate-400 text-right">
            {editor.storage.characterCount.words()} mots · {editor.storage.characterCount.characters()} caractères
          </div>
        )}
      </div>

      {/* ── Panneau droit : ce qu'on insère ── */}
      <div className="w-64 flex-shrink-0 border-l border-slate-200 flex flex-col overflow-hidden">
        <div className="flex px-2 pt-2 gap-3 border-b border-slate-200">
          {[['champs', 'Champs'], ['boucles', 'Listes répétées']].map(([k, l]) => (
            <button key={k} onClick={() => setPanelMode(k)}
              className={panelMode === k ? 'onglet-page onglet-page-actif' : 'onglet-page'}>{l}</button>))}
        </div>

        {panelMode === 'champs' ? (
          <>
            <div className="px-3 pt-2 pb-1 relative">
              <IconSearch size={14} className="absolute left-5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={search} onChange={e => setSearch(e.target.value)} data-reponses="non"
                placeholder="Chercher un champ…" className="controle controle-icone w-full text-[13px]" />
            </div>
            <p className="px-3 pb-1 text-[11px] text-slate-500">Un clic l’insère au curseur ; il se remplit à la production.</p>
            <div className="flex-1 overflow-auto pb-2">
              {Object.entries(champsFiltres).map(([cat, champs]) => (
                <div key={cat}>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide px-3 pt-3 pb-1">{cat}</div>
                  {champs.map(c => (
                    <button key={c.key} onClick={() => insererChamp(c)} title={`{{${c.key}}}`}
                      className="w-full text-left px-3 py-1 text-[13px] text-slate-700 hover:bg-slate-100 flex items-center gap-2">
                      <IconPlus size={13} className="text-slate-400 flex-none" />
                      <span className="truncate">{c.label}</span>
                    </button>))}
                </div>))}
            </div>
          </>
        ) : (
          <div className="flex-1 overflow-auto">
            <p className="px-3 pt-3 pb-2 text-[12px] text-slate-500">Une liste répétée reproduit un bloc pour chaque
              élément — chaque attribution, chaque unité… Insérez-la, mettez en page UNE ligne à l’intérieur, puis
              placez-y les champs de la liste.</p>
            <div className="px-2 space-y-0.5">
              {Object.entries(BOUCLES).map(([type, info]) => (
                <button key={type} onClick={() => setBoucleActive(type)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-champ text-[13px] flex items-center gap-2 ${boucleActive === type ? 'bg-white border border-[var(--c-disponible)] font-semibold text-iip-texte' : 'border border-transparent hover:bg-slate-100 text-slate-700'}`}>
                  <IconRepeat size={14} className="text-slate-400 flex-none" />{info.label}
                </button>))}
            </div>
            <div className="px-3 border-t border-slate-200 mt-3 pt-3">
              <button onClick={() => insererBoucle(boucleActive)} className="bouton bouton-fort w-full mb-3">Insérer cette liste</button>
              {boucleInfo.description && <p className="text-[12px] text-slate-500 mb-3 leading-relaxed">{boucleInfo.description}</p>}
              {boucleInfo.champs.length > 0 ? (
                <>
                  <div className="text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Champs de cette liste</div>
                  {boucleInfo.champs.map(c => (
                    <button key={c.key} onClick={() => insererChamp(c)}
                      className="w-full text-left px-2 py-1 text-[13px] text-slate-700 hover:bg-slate-100 flex items-center gap-2 rounded-champ">
                      <IconPlus size={13} className="text-slate-400 flex-none" /><span className="truncate">{c.label}</span>
                    </button>))}
                </>
              ) : <p className="text-[12px] text-slate-400 italic">Cette liste produit son contenu seule : aucun champ à placer.</p>}
            </div>
          </div>
        )}
      </div>

      <style>{`
        .editeur-doc { width: ${PAGE_FORMATS[format]?.w || '210mm'}; }
        .editeur-regle {
          width: ${PAGE_FORMATS[format]?.w || '210mm'}; height: 20px; display: flex;
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
          width: ${PAGE_FORMATS[format]?.w || '210mm'}; min-height: ${PAGE_FORMATS[format]?.h || '297mm'};
          padding: ${margins.top}mm ${margins.right}mm ${margins.bottom}mm ${margins.left}mm;
          background: #fff; box-sizing: border-box;
          box-shadow: 0 1px 3px rgba(15,23,42,.08), 0 8px 24px rgba(15,23,42,.08); border-radius: 2px;
        }
        .editeur-content { min-height: calc(${PAGE_FORMATS[format]?.h || '297mm'} - ${margins.top}mm - ${margins.bottom}mm); outline: none; }
        .champ-tag {
          display: inline-block;
          background: #FFFFFF; color: var(--c-texte);
          border: 1px solid var(--c-disponible); border-radius: 4px;
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
        .page-break { border-top: 2px dashed var(--c-refuse); margin: 14px 0; height: 0; position: relative; }
        .page-break::after { content: '⤓ Saut de page'; position: absolute; right: 0; top: -8px; font-size: 9px; color: var(--c-texte); background: #fff; padding: 0 4px; }
        .editeur-content ul[data-type="taskList"] { list-style: none; padding-left: 0; }
        .editeur-content ul[data-type="taskList"] li { display: flex; align-items: flex-start; gap: 6px; }
        .editeur-content ul[data-type="taskList"] li > label { margin-top: 2px; }
        .editeur-content ul:not([data-type="taskList"]) { list-style: disc; padding-left: 1.6em; margin: 4px 0; }
        .editeur-content ol { list-style: decimal; padding-left: 1.6em; margin: 4px 0; }
        .editeur-content li { margin: 2px 0; }
        .editeur-content li > p { margin: 0; }
        .editeur-content a { color: var(--c-texte); text-decoration: underline; }
        .editeur-content blockquote { border-left: 3px solid #ccc; padding-left: 12px; color: #555; margin: 8px 0; font-style: italic; }
        .editeur-content pre { background: #f5f5f5; border-radius: 4px; padding: 8px 10px; font-family: monospace; font-size: 0.9em; overflow-x: auto; }
        .editeur-content hr { border: none; border-top: 2px solid #999; margin: 14px 0; }
        .editeur-content hr.ProseMirror-selectednode { border-top-color: var(--c-texte); }
      `}</style>
      {previewHtml && (
        <PreviewModal html={previewHtml} titre={nom || 'Document'} onClose={() => setPreviewHtml(null)} />
      )}
    </div>
  );
}
