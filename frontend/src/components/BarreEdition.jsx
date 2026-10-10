import { useEffect, useRef, useState } from 'react';
import { useEditorState } from '@tiptap/react';
import { BubbleMenu } from '@tiptap/react/menus';
import {
  IconArrowBackUp, IconArrowForwardUp, IconBold, IconItalic, IconUnderline, IconStrikethrough,
  IconSubscript, IconSuperscript, IconTextColor, IconHighlight, IconAlignLeft, IconAlignCenter,
  IconAlignRight, IconAlignJustified, IconList, IconListNumbers, IconListCheck, IconIndentIncrease,
  IconIndentDecrease, IconLink, IconQuote, IconSeparatorHorizontal, IconPageBreak, IconPhoto,
  IconLayoutNavbar, IconLayoutBottombar, IconClearFormatting, IconColumnInsertLeft, IconColumnInsertRight,
  IconRowInsertTop, IconRowInsertBottom, IconColumnRemove, IconRowRemove, IconArrowsJoin, IconArrowsSplit,
  IconTablePlus, IconTableMinus, IconChevronDown, IconPlus, IconBucketDroplet, IconTable,
} from '@tabler/icons-react';
import { saisir, informer } from '../lib/dialogue.jsx';

/**
 * LA BARRE D'ÉDITION — une seule, pour les trois éditeurs de Lucie (modèles
 * libres, modèles de la Galerie, textes de la Documentation).
 *
 * Refaite le 9 octobre 2026 (Charles : « très moche et pas du tout facile ;
 * trop vieux et pas assez performant »). Ce qui change :
 *   · des icônes et des groupes, une seule hauteur ; plus de caractères
 *     bricolés (↩, ⊞, 🖍) ;
 *   · « Insérer » rassemble ce qu'on ajoute (tableau, ligne, lien, saut de
 *     page, logo, en-tête, pied) au lieu d'une rangée de boutons ;
 *   · les couleurs se choisissent dans la PALETTE DE LA CHARTE, pas dans le
 *     nuancier du système : un modèle n'a pas à inventer ses teintes ;
 *   · le tableau a sa propre rangée, qui ne paraît que dans un tableau ;
 *   · une barre FLOTTANTE suit la sélection (gras, italique, lien, couleur) ;
 *   · la barre ne se redessine plus à chaque frappe : elle lit l'état utile
 *     par `useEditorState`, et seulement quand il change.
 */

const PALETTE = [
  ['Encre', '#1B2B4B'], ['Bleu', '#16406A'], ['Logo', '#19537E'], ['Or', '#C9A84C'],
  ['Vert', '#3E7D5E'], ['Ocre', '#B45309'], ['Brique', '#9D4A38'], ['Violet', '#6B46C1'],
  ['Gris', '#64748B'], ['Noir', '#000000'],
];
const SURLIGNAGE = [['Jaune', '#FEF3C7'], ['Vert', '#DCFCE7'], ['Bleu', '#DBEAFE'], ['Rose', '#FCE7F3'], ['Gris', '#F1F5F9']];
const POLICES = [['Police', ''], ['Arial', 'Arial, sans-serif'], ['Calibri', 'Calibri, sans-serif'],
  ['Georgia', 'Georgia, serif'], ['Times New Roman', "'Times New Roman', serif"], ['Verdana', 'Verdana, sans-serif']];
const TAILLES = ['8pt', '9pt', '10pt', '11pt', '12pt', '14pt', '16pt', '18pt', '24pt'];

function B({ onClick, actif, inactif, titre, children, danger }) {
  return (
    <button type="button" title={titre} aria-label={titre} disabled={inactif}
      onMouseDown={e => e.preventDefault()} onClick={onClick}
      className={`h-8 min-w-8 px-1.5 inline-flex items-center justify-center gap-1 rounded-champ text-sm transition
        ${actif ? 'bg-[color-mix(in_srgb,var(--c-disponible)_14%,white)] text-iip-texte' : 'text-slate-600 hover:bg-slate-100'}
        ${danger ? 'hover:!bg-rose-50 hover:!text-rose-700' : ''} disabled:opacity-30 disabled:hover:bg-transparent`}>
      {children}
    </button>
  );
}
const Filet = () => <span className="w-px h-5 bg-slate-200 mx-1 self-center" />;

/** Un petit menu ancré sous son bouton ; se ferme au clic extérieur. */
function Menu({ bouton, titre, children, large = false }) {
  const [ouvert, setOuvert] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!ouvert) return undefined;
    const f = e => { if (!ref.current?.contains(e.target)) setOuvert(false); };
    document.addEventListener('mousedown', f);
    return () => document.removeEventListener('mousedown', f);
  }, [ouvert]);
  return (
    <span ref={ref} className="relative inline-flex">
      <B titre={titre} actif={ouvert} onClick={() => setOuvert(o => !o)}>{bouton}<IconChevronDown size={12} className="opacity-60" /></B>
      {ouvert && (
        <div className={`absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-carte shadow-flottant p-1.5 ${large ? 'w-64' : 'w-auto'}`}
          onMouseDown={e => e.preventDefault()} onClick={() => setOuvert(false)}>
          {children}
        </div>)}
    </span>
  );
}
const Ligne = ({ icone: I, children, onClick, danger }) => (
  <button type="button" onClick={onClick}
    className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-champ text-sm text-left ${danger ? 'text-rose-700 hover:bg-rose-50' : 'text-slate-700 hover:bg-slate-100'}`}>
    {I && <I size={15} className="text-slate-500 flex-none" />}<span>{children}</span>
  </button>
);
function Pastilles({ couleurs, onChoisir, onRetirer, libelleRetirer }) {
  return (
    <div className="p-1">
      <div className="grid grid-cols-5 gap-1.5">
        {couleurs.map(([n, c]) => (
          <button key={c} type="button" title={n} onClick={() => onChoisir(c)}
            className="w-6 h-6 rounded-full border border-slate-300" style={{ background: c }} />))}
      </div>
      <button type="button" onClick={onRetirer} className="mt-1.5 w-full text-second text-slate-500 hover:text-slate-800 text-left px-0.5">{libelleRetirer}</button>
    </div>
  );
}

async function demanderLien(editor) {
  const url = await saisir({ message: 'Adresse du lien (vide pour retirer) :', valeur: editor.getAttributes('link').href || '' });
  if (url === null) return;
  const c = editor.chain().focus().extendMarkRange('link');
  (url ? c.setLink({ href: url }) : c.unsetLink()).run();
}

export function BarreEdition({ editor, sobre = false, aplatirLogo = null }) {
  const e = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? {
      bold: ed.isActive('bold'), italic: ed.isActive('italic'), underline: ed.isActive('underline'),
      strike: ed.isActive('strike'), sub: ed.isActive('subscript'), sup: ed.isActive('superscript'),
      link: ed.isActive('link'), bullet: ed.isActive('bulletList'), ordered: ed.isActive('orderedList'),
      task: ed.isActive('taskList'), quote: ed.isActive('blockquote'), table: ed.isActive('table'),
      align: ['left', 'center', 'right', 'justify'].find(a => ed.isActive({ textAlign: a })) || 'left',
      niveau: [1, 2, 3, 4].find(n => ed.isActive('heading', { level: n })) || 0,
      undo: ed.can().undo(), redo: ed.can().redo(),
      merge: ed.can().mergeCells?.() || false, split: ed.can().splitCell?.() || false,
      police: ed.getAttributes('textStyle')?.fontFamily || '', taille: ed.getAttributes('textStyle')?.fontSize || '',
    } : null),
  });
  if (!editor || !e) return null;
  const c = () => editor.chain().focus();

  async function logo() {
    try {
      const blob = await (await fetch('/api/logo-iip')).blob();
      let src = await new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); });
      if (aplatirLogo) src = await aplatirLogo(src);
      c().setImage({ src, alt: 'Institut Ilya Prigogine' }).run();
    } catch { informer('Impossible de charger le logo.'); }
  }

  return (
    <div className="sticky top-0 z-10 bg-white border-b border-slate-200">
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1">
        <B titre="Annuler (⌘Z)" inactif={!e.undo} onClick={() => c().undo().run()}><IconArrowBackUp size={16} /></B>
        <B titre="Rétablir (⇧⌘Z)" inactif={!e.redo} onClick={() => c().redo().run()}><IconArrowForwardUp size={16} /></B>
        <Filet />
        <select title="Style du paragraphe" value={e.niveau}
          onChange={ev => { const n = Number(ev.target.value); n ? c().toggleHeading({ level: n }).run() : c().setParagraph().run(); }}
          className="h-8 rounded-champ border border-slate-200 bg-white text-sm px-2 text-slate-700">
          <option value={0}>Texte</option><option value={1}>Titre 1</option><option value={2}>Titre 2</option>
          <option value={3}>Titre 3</option>{!sobre && <option value={4}>Titre 4</option>}
        </select>
        {!sobre && <>
          <select title="Police" value={e.police} onChange={ev => c().setMark('textStyle', { fontFamily: ev.target.value || null }).run()}
            className="h-8 rounded-champ border border-slate-200 bg-white text-sm px-2 text-slate-700 max-w-[8.5rem] ml-1">
            {POLICES.map(([l, v]) => <option key={l} value={v}>{l}</option>)}
          </select>
          <select title="Taille" value={e.taille} onChange={ev => c().setMark('textStyle', { fontSize: ev.target.value || null }).run()}
            className="h-8 rounded-champ border border-slate-200 bg-white text-sm px-1.5 text-slate-700 ml-1">
            <option value="">Taille</option>{TAILLES.map(t => <option key={t} value={t}>{t.replace('pt', '')}</option>)}
          </select>
        </>}
        <Filet />
        <B titre="Gras (⌘B)" actif={e.bold} onClick={() => c().toggleBold().run()}><IconBold size={16} /></B>
        <B titre="Italique (⌘I)" actif={e.italic} onClick={() => c().toggleItalic().run()}><IconItalic size={16} /></B>
        <B titre="Souligné (⌘U)" actif={e.underline} onClick={() => c().toggleUnderline().run()}><IconUnderline size={16} /></B>
        <B titre="Barré" actif={e.strike} onClick={() => c().toggleStrike().run()}><IconStrikethrough size={16} /></B>
        <Menu titre="Couleur du texte" bouton={<IconTextColor size={16} />}>
          <Pastilles couleurs={PALETTE} onChoisir={v => c().setColor(v).run()} onRetirer={() => c().unsetColor().run()} libelleRetirer="Couleur par défaut" />
        </Menu>
        <Menu titre="Surligner" bouton={<IconHighlight size={16} />}>
          <Pastilles couleurs={SURLIGNAGE} onChoisir={v => c().toggleHighlight({ color: v }).run()} onRetirer={() => c().unsetHighlight().run()} libelleRetirer="Sans surlignage" />
        </Menu>
        <Filet />
        <B titre="Aligner à gauche" actif={e.align === 'left'} onClick={() => c().setTextAlign('left').run()}><IconAlignLeft size={16} /></B>
        <B titre="Centrer" actif={e.align === 'center'} onClick={() => c().setTextAlign('center').run()}><IconAlignCenter size={16} /></B>
        <B titre="Aligner à droite" actif={e.align === 'right'} onClick={() => c().setTextAlign('right').run()}><IconAlignRight size={16} /></B>
        <B titre="Justifier" actif={e.align === 'justify'} onClick={() => c().setTextAlign('justify').run()}><IconAlignJustified size={16} /></B>
        <Filet />
        <B titre="Liste à puces" actif={e.bullet} onClick={() => c().toggleBulletList().run()}><IconList size={16} /></B>
        <B titre="Liste numérotée" actif={e.ordered} onClick={() => c().toggleOrderedList().run()}><IconListNumbers size={16} /></B>
        {!sobre && <>
          <B titre="Liste à cocher" actif={e.task} onClick={() => c().toggleTaskList().run()}><IconListCheck size={16} /></B>
          <B titre="Diminuer le retrait" onClick={() => c().outdent().run()}><IconIndentDecrease size={16} /></B>
          <B titre="Augmenter le retrait" onClick={() => c().indent().run()}><IconIndentIncrease size={16} /></B>
        </>}
        <Filet />
        <Menu titre="Insérer" large bouton={<><IconPlus size={16} /><span className="text-sm">Insérer</span></>}>
          <Ligne icone={IconTablePlus} onClick={() => c().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>Tableau (3 × 3)</Ligne>
          <Ligne icone={IconLink} onClick={() => demanderLien(editor)}>Lien</Ligne>
          <Ligne icone={IconQuote} onClick={() => c().toggleBlockquote().run()}>Citation</Ligne>
          <Ligne icone={IconSeparatorHorizontal} onClick={() => c().setHorizontalRule().run()}>Ligne de séparation</Ligne>
          <Ligne icone={IconSubscript} onClick={() => c().toggleSubscript().run()}>Indice</Ligne>
          <Ligne icone={IconSuperscript} onClick={() => c().toggleSuperscript().run()}>Exposant</Ligne>
          {!sobre && <>
            <div className="h-px bg-slate-100 my-1" />
            <Ligne icone={IconPageBreak} onClick={() => c().setPageBreak().run()}>Saut de page</Ligne>
            <Ligne icone={IconPhoto} onClick={logo}>Logo de l’Institut</Ligne>
            <Ligne icone={IconLayoutNavbar} onClick={() => c().insertContent({ type: 'enTeteBlock', content: [{ type: 'paragraph' }] }).run()}>En-tête répété sur chaque page</Ligne>
            <Ligne icone={IconLayoutBottombar} onClick={() => c().insertContent({ type: 'piedDePageBlock', content: [{ type: 'paragraph' }] }).run()}>Pied répété sur chaque page</Ligne>
            <div className="h-px bg-slate-100 my-1" />
            <div className="px-2 py-1 text-xs uppercase tracking-wide text-slate-400">Interligne</div>
            <div className="flex gap-1 px-2 pb-1">
              {['1', '1.15', '1.5', '2'].map(v => (
                <button key={v} type="button" onClick={() => c().setLineHeight(v).run()}
                  className="flex-1 h-7 rounded-champ border border-slate-200 text-second hover:bg-slate-100">{v}</button>))}
            </div>
          </>}
        </Menu>
        <B titre="Effacer la mise en forme" onClick={() => c().unsetAllMarks().clearNodes().run()}><IconClearFormatting size={16} /></B>
      </div>

      {e.table && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-t border-slate-100 bg-slate-50/60">
          <span className="inline-flex items-center gap-1 text-second text-slate-500 mr-1"><IconTable size={14} />Tableau</span>
          <B titre="Colonne à gauche" onClick={() => c().addColumnBefore().run()}><IconColumnInsertLeft size={16} /></B>
          <B titre="Colonne à droite" onClick={() => c().addColumnAfter().run()}><IconColumnInsertRight size={16} /></B>
          <B titre="Ligne au-dessus" onClick={() => c().addRowBefore().run()}><IconRowInsertTop size={16} /></B>
          <B titre="Ligne en dessous" onClick={() => c().addRowAfter().run()}><IconRowInsertBottom size={16} /></B>
          <Filet />
          <B titre="Fusionner les cellules" inactif={!e.merge} onClick={() => c().mergeCells().run()}><IconArrowsJoin size={16} /></B>
          <B titre="Scinder la cellule" inactif={!e.split} onClick={() => c().splitCell().run()}><IconArrowsSplit size={16} /></B>
          <B titre="Ligne d’en-tête" onClick={() => c().toggleHeaderRow().run()}><span className="text-second">En-tête</span></B>
          <Menu titre="Fond de la cellule" bouton={<IconBucketDroplet size={16} />}>
            <Pastilles couleurs={[...SURLIGNAGE, ['Blanc', '#FFFFFF']]} onChoisir={v => c().setCellAttribute('backgroundColor', v).run()}
              onRetirer={() => c().setCellAttribute('backgroundColor', null).run()} libelleRetirer="Sans fond" />
          </Menu>
          <Filet />
          <B titre="Supprimer la colonne" danger onClick={() => c().deleteColumn().run()}><IconColumnRemove size={16} /></B>
          <B titre="Supprimer la ligne" danger onClick={() => c().deleteRow().run()}><IconRowRemove size={16} /></B>
          <B titre="Supprimer le tableau" danger onClick={() => c().deleteTable().run()}><IconTableMinus size={16} /></B>
        </div>)}
    </div>
  );
}

/** La barre flottante : elle suit la sélection de texte. */
export function BulleSelection({ editor }) {
  const e = useEditorState({
    editor,
    selector: ({ editor: ed }) => (ed ? { bold: ed.isActive('bold'), italic: ed.isActive('italic'),
      underline: ed.isActive('underline'), link: ed.isActive('link') } : null),
  });
  if (!editor || !e) return null;
  const c = () => editor.chain().focus();
  return (
    <BubbleMenu editor={editor} options={{ placement: 'top' }}
      shouldShow={({ editor: ed, from, to }) => from !== to && !ed.isActive('champ') && !ed.isActive('blocPiece')}>
      <div className="flex items-center gap-0.5 bg-white border border-slate-200 rounded-carte shadow-flottant px-1 py-0.5">
        <B titre="Gras" actif={e.bold} onClick={() => c().toggleBold().run()}><IconBold size={15} /></B>
        <B titre="Italique" actif={e.italic} onClick={() => c().toggleItalic().run()}><IconItalic size={15} /></B>
        <B titre="Souligné" actif={e.underline} onClick={() => c().toggleUnderline().run()}><IconUnderline size={15} /></B>
        <B titre="Lien" actif={e.link} onClick={() => demanderLien(editor)}><IconLink size={15} /></B>
        <Menu titre="Couleur" bouton={<IconTextColor size={15} />}>
          <Pastilles couleurs={PALETTE} onChoisir={v => c().setColor(v).run()} onRetirer={() => c().unsetColor().run()} libelleRetirer="Couleur par défaut" />
        </Menu>
      </div>
    </BubbleMenu>
  );
}
