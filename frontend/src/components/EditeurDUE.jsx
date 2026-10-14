/**
 * L'ÉDITEUR DE LA DUE — PEU DE CHOIX, LE STYLE LUCIE (Charles, 8 octobre 2026 :
 * « il ne faut pas donner trop de choix au niveau mise en page »).
 *
 * La police et la taille sont imposées. Cinq couleurs, celles de la maison :
 * bleu IIP, bleu clair IIP, or IIP, vert et fraise. Gras, italique, souligné ;
 * des puces rondes ; un cadre pour isoler un passage ; une ligne de séparation.
 * Rien d'autre — le serveur filtre d'ailleurs ce qui dépasserait
 * (routes/due.js, assainirDUE).
 */
import { memo, useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { IconArrowBackUp, IconArrowForwardUp, IconBold, IconItalic, IconUnderline, IconList,
  IconSquare, IconSeparatorHorizontal, IconDropletOff, IconIndentIncrease, IconIndentDecrease } from '@tabler/icons-react';

/* EN VALEURS FIXES : le filtre du serveur (assainirDUE) n'admet que ces cinq teintes écrites
   ainsi ; une couleur notée « var(--…) » y était retirée sans bruit à l'enregistrement. */
export const COULEURS_DUE = [
  ['#19537E', 'Bleu IIP'], ['#05B7E6', 'Bleu clair IIP'], ['#F9B619', 'Or IIP'],
  ['#3E7D5E', 'Vert'], ['#D2335C', 'Fraise'],
];

function Bouton({ actif, onClick, titre, children }) {
  return (
    <button type="button" title={titre} aria-label={titre} onMouseDown={e => e.preventDefault()} onClick={onClick}
      className={`w-8 h-8 grid place-items-center rounded-md ${actif ? 'bg-iip-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
      {children}
    </button>);
}

function EditeurDUE({ valeur, onChange }) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false, codeBlock: false, code: false, strike: false,
        orderedList: false, link: false }),
      TextStyle, Color,
    ],
    content: valeur || '',
    editorProps: { attributes: { class: 'texte-due px-4 py-3 min-h-[6rem] outline-none' } },
    onUpdate: ({ editor: e }) => onChange?.(e.getHTML()),
  });
  /* « » ET « <p></p> » SONT LE MÊME TEXTE VIDE (Charles, 11 octobre 2026 : « dès que je mets une
     lettre dans le titre, elle passe dans le corps du texte »). Les confondre rechargeait
     l'éditeur à chaque rendu de la page — chaque lettre tapée ailleurs — et il prenait le curseur. */
  useEffect(() => {
    if (!editor || valeur === undefined) return;
    const vide = h => !h || h === '<p></p>';
    if (vide(valeur) && editor.isEmpty) return;
    if (valeur !== editor.getHTML()) editor.commands.setContent(valeur || '', { emitUpdate: false });
  }, [valeur, editor]);
  if (!editor) return null;
  /* LA CHAÎNE SE CRÉE AU CLIC, PAS À L'AFFICHAGE : créée à chaque rendu, elle portait déjà
     « focus » et l'éditeur reprenait le curseur dès que la page se redessinait — chaque lettre
     tapée dans un autre champ (le titre d'un message) partait dans le corps. */
  const chaine = () => editor.chain().focus();
  const c = new Proxy({}, { get: (_, k) => (...a) => chaine()[k](...a) });
  return (
    <div>
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-slate-200 bg-slate-50">
        <Bouton titre="Annuler" onClick={() => c.undo().run()}><IconArrowBackUp size={16} /></Bouton>
        <Bouton titre="Rétablir" onClick={() => c.redo().run()}><IconArrowForwardUp size={16} /></Bouton>
        <span className="w-px h-5 bg-slate-200 mx-1" />
        <Bouton titre="Gras" actif={editor.isActive('bold')} onClick={() => c.toggleBold().run()}><IconBold size={16} /></Bouton>
        <Bouton titre="Italique" actif={editor.isActive('italic')} onClick={() => c.toggleItalic().run()}><IconItalic size={16} /></Bouton>
        <Bouton titre="Souligné" actif={editor.isActive('underline')} onClick={() => c.toggleUnderline().run()}><IconUnderline size={16} /></Bouton>
        <span className="w-px h-5 bg-slate-200 mx-1" />
        <Bouton titre="Puces" actif={editor.isActive('bulletList')} onClick={() => c.toggleBulletList().run()}><IconList size={16} /></Bouton>
        {/* LES SOUS-PUCES (Charles, 14 octobre 2026) : décaler une puce d'un cran à droite en fait
            une sous-puce du point au-dessus ; à gauche, elle remonte. Tab et Maj+Tab font de même. */}
        <Bouton titre="Sous-puce — décaler à droite (Tab)" onClick={() => c.sinkListItem('listItem').run()}><IconIndentIncrease size={16} /></Bouton>
        <Bouton titre="Remonter d'un niveau — décaler à gauche (Maj+Tab)" onClick={() => c.liftListItem('listItem').run()}><IconIndentDecrease size={16} /></Bouton>
        <Bouton titre="Cadre" actif={editor.isActive('blockquote')} onClick={() => c.toggleBlockquote().run()}><IconSquare size={16} /></Bouton>
        <Bouton titre="Ligne de séparation" onClick={() => c.setHorizontalRule().run()}><IconSeparatorHorizontal size={16} /></Bouton>
        <span className="w-px h-5 bg-slate-200 mx-1" />
        {COULEURS_DUE.map(([hex, nom]) => (
          <button key={hex} type="button" title={nom} aria-label={nom} onMouseDown={e => e.preventDefault()}
            onClick={() => c.setColor(hex).run()}
            className={`w-6 h-6 m-0.5 rounded-full border-2 ${editor.isActive('textStyle', { color: hex }) ? 'border-slate-700' : 'border-white'}`}
            style={{ background: hex }} />))}
        <Bouton titre="Couleur du texte normal" onClick={() => c.unsetColor().run()}><IconDropletOff size={16} /></Bouton>
      </div>
      <EditorContent editor={editor} />
    </div>);
}

/* Mémorisé : un écran qui se redessine (une lettre tapée ailleurs) ne redessine pas l'éditeur. */
export default memo(EditeurDUE);
