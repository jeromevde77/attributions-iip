import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import Highlight from '@tiptap/extension-highlight';
import { Link } from '@tiptap/extension-link';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { IconFileImport, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Toolbar, CustomTableCell, CustomTableHeader } from '../pages/Editeur.jsx';

/**
 * ÉCRIRE UN TEXTE DU CORPUS — dans Lucie, et non dans Word.
 *
 * Demandé par Charles le 21 septembre 2026 : « je dépose, tu analyses et tu
 * intègres à Lucie avec mise en page, mais DANS Lucie. Après, je peux corriger
 * année après année dans Lucie. » Le fichier Word ou PDF n'est qu'un point
 * d'entrée : une fois analysé, c'est ce texte-ci qu'on corrige.
 *
 * CE N'EST PAS UN SECOND ÉDITEUR. La barre d'outils et les cellules de tableau
 * sont celles de Configuration → Éditeur, en mode `sobre` : un dixième éditeur
 * aurait été la dixième enveloppe du catalogue des erreurs.
 *
 * L'IMPORT REMPLACE, IL N'AJOUTE PAS — et le demande quand il y a déjà un
 * texte. Coller une circulaire au bout d'une autre ferait un document qu'aucun
 * des deux auteurs n'a écrit.
 */
export default function EditeurTexte({ valeur, onChange, importer = true }) {
  const [analyse, setAnalyse] = useState(null);   // { avertissements, origine, nom }
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const fichier = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3, 4] }, link: false,
                             underline: false, codeBlock: false }),
      Underline, TextStyle, Color, Highlight.configure({ multicolor: true }),
      Link.configure({ openOnClick: false, autolink: true }),
      Subscript, Superscript,
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
      Table.configure({ resizable: false }), TableRow, CustomTableHeader, CustomTableCell,
    ],
    content: valeur || '',
    editorProps: { attributes: { class: 'texte-corpus px-4 py-3' } },
    onUpdate: ({ editor: e }) => onChange?.(e.getHTML()),
  });

  // Un contenu posé de l'extérieur (une version qu'on reprend) remplace celui
  // de l'éditeur ; celui qu'on vient de taper, non — sans quoi chaque frappe
  // ferait sauter le curseur au début.
  useEffect(() => {
    if (editor && valeur !== undefined && valeur !== editor.getHTML()) {
      editor.commands.setContent(valeur || '', { emitUpdate: false });
    }
  }, [valeur, editor]);

  async function analyser(f) {
    if (!f) return;
    if (editor && !editor.isEmpty && !window.confirm(
      `Remplacer le texte actuel par celui de « ${f.name} » ?\n\n`
      + 'Ce que vous avez écrit ou corrigé ici sera perdu.')) return;
    setEnCours(true); setErreur(null);
    try {
      const fd = new FormData();
      fd.append('fichier', f);
      /* SANS `Content-Type` : c'est le navigateur qui doit l'écrire, avec la
       * frontière du multipart. authHeaders() impose `application/json` à
       * toutes les requêtes — le serveur lisait donc le fichier comme du JSON
       * et répondait « Unexpected token ». Invisible en essayant la route à
       * la main : vu en passant par l'écran. */
      const { 'Content-Type': _json, ...entetes } = authHeaders();
      const r = await fetch('/api/documentation/importer',
        { method: 'POST', headers: entetes, body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Analyse impossible.');
      editor?.commands.setContent(j.html || '', { emitUpdate: false });
      onChange?.(editor?.getHTML() || '');
      setAnalyse({ avertissements: j.avertissements || [], origine: j.origine, nom: f.name });
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  return (
    <div className="space-y-2">
      {importer && (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className="bouton" disabled={enCours}
            onClick={() => fichier.current?.click()}>
            <IconFileImport size={15} className="inline -mt-0.5 mr-1" />
            {enCours ? 'Analyse…' : 'Importer un Word ou un PDF'}
          </button>
          <input ref={fichier} type="file" className="hidden"
            accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={e => { analyser(e.target.files?.[0]); e.target.value = ''; }} />
          <span className="text-[12px] text-slate-500">
            {analyse
              ? `« ${analyse.nom} » analysé — relisez et corrigez ci-dessous. Le fichier n’est pas conservé.`
              : 'Lucie en reprend le texte et la mise en forme ; vous corrigez ensuite ici.'}
          </span>
        </div>
      )}

      {erreur && (
        <div className="carte p-2.5 text-[12px] text-rose-700 flex items-start gap-1.5">
          <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
        </div>
      )}
      {analyse?.avertissements?.map((a, i) => (
        <div key={i} className="carte p-2.5 text-[12px] text-slate-700 flex items-start gap-1.5"
          style={{ borderLeftWidth: 3, borderLeftColor: '#B45309' }}>
          <IconAlertTriangle size={14} className="mt-0.5 flex-none text-[#B45309]" />{a}
        </div>
      ))}

      <div className="rounded-champ border border-slate-300 bg-white overflow-hidden">
        <Toolbar editor={editor} sobre />
        <div className="max-h-[55vh] overflow-auto">
          <EditorContent editor={editor} />
        </div>
      </div>
    </div>
  );
}
