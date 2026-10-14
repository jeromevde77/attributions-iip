/**
 * UNE RUBRIQUE DU DOSSIER PÉDAGOGIQUE, ÉDITABLE ET DÉJÀ MISE EN PAGE (3.1.356, fiche d'UE en quatre
 * onglets — proposition B). Le texte vit en marques simples (lib/texteDossier.js) ; l'éditeur le
 * montre structuré — intertitres (l'intitulé d'un cours, « Finalités générales »), puces et
 * sous-puces — et le rend en marques à chaque frappe. Une rubrique qui diffère de la version lue à
 * l'import se dit « modifiée dans Lucie », et cette version se relit d'un clic.
 */
import { memo, useEffect, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { IconBold, IconItalic, IconList, IconIndentIncrease, IconIndentDecrease, IconHeading,
  IconArrowBackUp, IconArrowForwardUp } from '@tabler/icons-react';
import { texteVersHtml, htmlVersTexte } from '../lib/texteDossier.js';

function Bouton({ actif, onClick, titre, children, inactif }) {
  return (
    <button type="button" title={titre} aria-label={titre} disabled={inactif} onMouseDown={e => e.preventDefault()} onClick={onClick}
      className={`w-8 h-8 grid place-items-center rounded-md disabled:opacity-40 ${actif ? 'bg-iip-blue text-white' : 'text-slate-600 hover:bg-slate-100'}`}>
      {children}
    </button>);
}

function EditeurRubrique({ titre, texte, origine, onChange, lecture = false }) {
  const [voirOrigine, setVoirOrigine] = useState(false);
  const editor = useEditor({
    extensions: [StarterKit.configure({ heading: { levels: [4] }, codeBlock: false, code: false, strike: false,
      orderedList: false, blockquote: false, horizontalRule: false })],
    content: texteVersHtml(texte),
    editable: !lecture,
    editorProps: { attributes: { class: 'texte-dossier px-4 py-3 min-h-[4rem] outline-none' } },
    onUpdate: ({ editor: e }) => onChange?.(htmlVersTexte(e.getHTML())),
  });
  // Le texte reçu change d'ailleurs (réimport, autre UE) : on recharge, sans voler le curseur.
  useEffect(() => {
    if (!editor) return;
    if (htmlVersTexte(editor.getHTML()) !== String(texte || '').trim()) editor.commands.setContent(texteVersHtml(texte), { emitUpdate: false });
  }, [texte, editor]);
  const modifiee = origine != null && String(origine).trim() !== String(texte || '').trim();
  const vide = !String(texte || '').trim();
  if (!editor) return null;
  const c = () => editor.chain().focus();
  return (
    <div className="border border-slate-200 rounded-carte overflow-hidden mb-3 bg-white">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 border-b border-slate-200">
        <span className="font-semibold text-iip-texte flex-1 min-w-0">{titre}</span>
        {modifiee
          ? <button type="button" className="text-mention px-2 py-0.5 rounded-pastille text-white" style={{ background: 'var(--c-attente)' }}
              onClick={() => setVoirOrigine(v => !v)} title="Voir la version lue du dossier">modifiée dans Lucie</button>
          : <span className="text-mention px-2 py-0.5 rounded-pastille border border-slate-300 text-slate-500">{vide ? 'vide' : 'importée du dossier'}</span>}
      </div>
      {!lecture && (
        <div className="flex flex-wrap items-center gap-0.5 px-2 py-1 border-b border-slate-100">
          <Bouton titre="Annuler" onClick={() => c().undo().run()}><IconArrowBackUp size={16} /></Bouton>
          <Bouton titre="Rétablir" onClick={() => c().redo().run()}><IconArrowForwardUp size={16} /></Bouton>
          <span className="w-px h-5 bg-slate-200 mx-1" />
          <Bouton titre="Intertitre (intitulé d'un cours…)" actif={editor.isActive('heading', { level: 4 })} onClick={() => c().toggleHeading({ level: 4 }).run()}><IconHeading size={16} /></Bouton>
          <Bouton titre="Gras" actif={editor.isActive('bold')} onClick={() => c().toggleBold().run()}><IconBold size={16} /></Bouton>
          <Bouton titre="Italique" actif={editor.isActive('italic')} onClick={() => c().toggleItalic().run()}><IconItalic size={16} /></Bouton>
          <span className="w-px h-5 bg-slate-200 mx-1" />
          <Bouton titre="Puces" actif={editor.isActive('bulletList')} onClick={() => c().toggleBulletList().run()}><IconList size={16} /></Bouton>
          <Bouton titre="Sous-puce — décaler à droite (Tab)" onClick={() => c().sinkListItem('listItem').run()}><IconIndentIncrease size={16} /></Bouton>
          <Bouton titre="Remonter — décaler à gauche (Maj+Tab)" onClick={() => c().liftListItem('listItem').run()}><IconIndentDecrease size={16} /></Bouton>
        </div>)}
      <EditorContent editor={editor} />
      {voirOrigine && modifiee && (
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-2">
          <div className="text-mention text-slate-500 mb-1">Version lue du dossier pédagogique</div>
          <div className="texte-dossier text-slate-600" dangerouslySetInnerHTML={{ __html: texteVersHtml(origine) }} />
        </div>)}
    </div>);
}

export default memo(EditeurRubrique);
