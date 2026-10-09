import { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import { Node, mergeAttributes } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Table } from '@tiptap/extension-table';
import { TableRow } from '@tiptap/extension-table-row';
import { TextAlign } from '@tiptap/extension-text-align';
import { Underline } from '@tiptap/extension-underline';
import { Color, TextStyle } from '@tiptap/extension-text-style';
import { Subscript } from '@tiptap/extension-subscript';
import { Superscript } from '@tiptap/extension-superscript';
import { IconLock, IconAlertTriangle, IconHistory, IconArrowBackUp, IconGripVertical, IconPlus } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Toolbar, CustomTableCell, CustomTableHeader, ChampNode } from '../pages/Editeur.jsx';
import { demander, informer } from '../lib/dialogue.jsx';

/**
 * L'ÉDITEUR D'UN MODÈLE DE PIÈCE (Charles, 9 octobre 2026 : « un petit
 * éditeur — un peu de polices, de contenu, bouger les champs de données »).
 *
 * Il vit DANS la Galerie des pièces : à gauche le texte, à droite la pièce
 * réelle, rendue par la route qui la produit, avec le brouillon. Ce n'est pas
 * un second éditeur : la barre et les cellules sont celles de Configuration →
 * Éditeur, en mode sobre.
 *
 * Deux sortes d'objets dans le texte :
 *   · les CHAMPS (étiquettes bleues) — une donnée de l'étudiant ou de l'unité,
 *     qu'on glisse dans une phrase ;
 *   · les BLOCS (cartouches gris, cadenas) — ce que le calcul produit. On les
 *     déplace, on ne les ouvre pas. Ceux qui sont obligatoires ne peuvent pas
 *     manquer : le serveur refuse le modèle et dit lequel.
 */

/* Un bloc : une ligne grise insécable, déplaçable à la souris. */
const BlocPiece = Node.create({
  name: 'blocPiece', group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes() { return { cle: { default: null } }; },
  parseHTML() { return [{ tag: 'div[data-bloc]', getAttrs: el => ({ cle: el.getAttribute('data-bloc') }) }]; },
  renderHTML({ node }) { return ['div', mergeAttributes({ 'data-bloc': node.attrs.cle }), node.attrs.cle]; },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement('div');
      dom.className = 'bloc-piece';
      dom.setAttribute('data-drag-handle', '');
      dom.contentEditable = 'false';
      dom.textContent = (window.__libellesBlocs?.[node.attrs.cle]) || node.attrs.cle;
      return { dom };
    };
  },
});

const STYLE = `
.texte-modele { font-size: 13px; line-height: 1.55; min-height: 50vh; outline: none; }
.texte-modele p { margin: 6px 0; }
.texte-modele .bloc-piece { margin: 6px 0; padding: 6px 10px 6px 30px; border: 1px dashed #b8c0cc; border-radius: 8px;
  background: #f4f5f7 url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%2364748b' stroke-width='2'><rect x='5' y='11' width='14' height='10' rx='2'/><path d='M8 11V7a4 4 0 0 1 8 0v4'/></svg>") 9px center no-repeat;
  color: #475569; font-size: 12px; cursor: grab; user-select: none; }
.texte-modele .bloc-piece.ProseMirror-selectednode { outline: 2px solid var(--c-disponible); }
.texte-modele .champ-tag { display: inline-block; background: #fff; color: var(--c-texte); border: 1px solid var(--c-disponible);
  border-radius: 4px; padding: 0 5px; font-size: .85em; cursor: default; user-select: none; white-space: nowrap; }
.texte-modele table { border-collapse: collapse; width: 100%; } .texte-modele td, .texte-modele th { border: 1px solid #ccc; padding: 4px 6px; }
`;

export default function EditeurModelePiece({ cles, onBrouillon, onFermer }) {
  const [cle, setCle] = useState(cles[0]);
  const [m, setM] = useState(null);                 // le modèle tel que le serveur le rend
  const [contenu, setContenu] = useState('');
  const [police, setPolice] = useState('');
  const [taille, setTaille] = useState('');
  const [commentaire, setCommentaire] = useState('');
  const [remp, setRemp] = useState([]);              // phrases fixes réécrites (modèles communs)
  const [manques, setManques] = useState([]);
  const [histo, setHisto] = useState(false);
  const [modifie, setModifie] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const minuterie = useRef(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [2, 3, 4] }, link: false, underline: false, codeBlock: false, blockquote: false }),
      Underline, TextStyle, Color, Subscript, Superscript,
      TextAlign.configure({ types: ['heading', 'paragraph', 'tableCell', 'tableHeader'] }),
      Table.configure({ resizable: false }), TableRow, CustomTableHeader, CustomTableCell,
      ChampNode, BlocPiece,
    ],
    content: '',
    editorProps: { attributes: { class: 'texte-modele px-4 py-3' } },
    onUpdate: ({ editor: e }) => { setContenu(e.getHTML()); setModifie(true); },
  });

  async function charger(c = cle) {
    const r = await fetch(`/api/documentation/modeles/${c}`, { headers: authHeaders() });
    const j = await r.json();
    if (!r.ok) { informer(j.error || 'Modèle introuvable.'); return; }
    window.__libellesBlocs = j.blocs;
    setM(j); setPolice(j.police || ''); setTaille(j.taille || ''); setCommentaire(''); setModifie(false);
    setRemp(j.remplacements || []);
    editor?.commands.setContent(j.contenu, { emitUpdate: false });
    setContenu(editor?.getHTML() || j.contenu);
  }
  useEffect(() => { if (editor) charger(cle); }, [editor, cle]);   // eslint-disable-line react-hooks/exhaustive-deps

  // LE BROUILLON PART À L'APERÇU, sans rien écrire : la pièce de droite se
  // recompose avec lui, par la route qui la produit.
  useEffect(() => {
    if (!m) return;
    clearTimeout(minuterie.current);
    minuterie.current = setTimeout(async () => {
      try {
        const r = await fetch(`/api/documentation/modeles/${cle}/brouillon`, { method: 'POST', headers: authHeaders(),
          body: JSON.stringify({ contenu, police: police || null, taille: taille || null, remplacements: remp }) });
        const j = await r.json();
        if (r.ok) { onBrouillon(j.id); setManques(j.manques || []); }
      } catch { /* l'aperçu garde la version précédente */ }
    }, 600);
    return () => clearTimeout(minuterie.current);
  }, [contenu, police, taille, remp, m]);   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => onBrouillon(null), []);   // eslint-disable-line react-hooks/exhaustive-deps

  const present = new Set([...contenu.matchAll(/data-bloc="([a-z0-9_]+)"/g)].map(x => x[1]));
  const inserer = node => editor?.chain().focus().insertContent(node).run();

  async function enregistrer() {
    setEnCours(true);
    try {
      const r = await fetch(`/api/documentation/modeles/${cle}`, { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ contenu, police: police || null, taille: taille || null, remplacements: remp, commentaire }) });
      const j = await r.json();
      if (!r.ok) { setManques(j.manques || []); informer(j.error || 'Enregistrement refusé.'); return; }
      informer(`✓ Version ${j.version} enregistrée : c'est elle que portent désormais les pièces qui sortent.`);
      await charger();
    } finally { setEnCours(false); }
  }
  async function origine() {
    if (!(await demander('Revenir au modèle d’origine ?\n\nLes versions modifiées restent dans l’historique.'))) return;
    const r = await fetch(`/api/documentation/modeles/${cle}/origine`, { method: 'POST', headers: authHeaders() });
    const j = await r.json();
    if (!r.ok) { informer(j.error); return; }
    await charger();
  }
  async function reprendre(version) {
    const r = await fetch(`/api/documentation/modeles/${cle}/versions/${version}`, { headers: authHeaders() });
    const j = await r.json();
    if (!r.ok) { informer(j.error); return; }
    editor?.commands.setContent(j.contenu, { emitUpdate: true });
    setPolice(j.police || ''); setTaille(j.taille || ''); setRemp(j.remplacements || []); setHisto(false); setModifie(true);
  }
  async function changerDePiece(c) {
    if (modifie && !(await demander('Abandonner les modifications non enregistrées ?'))) return;
    setCle(c);
  }

  if (!m) return <div className="p-4 text-[13px] text-slate-500">Chargement du modèle…</div>;

  return (
    <div className="flex flex-col h-full min-h-0">
      <style>{STYLE}</style>
      <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
        {cles.length > 1 ? (
          <select value={cle} onChange={e => changerDePiece(e.target.value)} className="controle" title="Modèle">
            {cles.map(c => <option key={c} value={c}>{c === cle ? m.libelle : c.replace(/_/g, ' ')}</option>)}
          </select>
        ) : <span className="text-[13px] font-semibold text-iip-texte">{m.libelle}</span>}
        <span className="text-[12px] text-slate-500">
          {m.version ? `version ${m.version}${m.d_origine ? ' (origine)' : ''}` : 'modèle d’origine'}
        </span>
        <span className="flex-1" />
        <button className="bouton controle inline-flex items-center gap-1" onClick={() => setHisto(h => !h)}>
          <IconHistory size={14} /> Historique
        </button>
        <button className="bouton controle" onClick={onFermer}>Fermer l’éditeur</button>
      </div>

      <div className="px-3 py-2 border-b border-slate-200 flex flex-wrap items-center gap-2">
        <select value={police} onChange={e => { setPolice(e.target.value); setModifie(true); }} className="controle" title="Police du texte">
          <option value="">Police de la charte</option>
          {m.polices.map(p => <option key={p} style={{ fontFamily: p }}>{p}</option>)}
        </select>
        <select value={taille} onChange={e => { setTaille(e.target.value); setModifie(true); }} className="controle" title="Taille du texte">
          <option value="">Taille de la charte (9 pt)</option>
          {m.tailles.map(t => <option key={t} value={t}>{t.replace('pt', ' pt')}</option>)}
        </select>
        <span className="text-[11px] text-slate-500">La police et la taille valent pour le texte ; les blocs gardent celles de la charte.</span>
      </div>

      {histo && (
        <div className="px-3 py-2 border-b border-slate-200 max-h-48 overflow-auto text-[12px]">
          {!m.historique.length && <div className="text-slate-500">Aucune modification : le modèle d’origine est en vigueur.</div>}
          {m.historique.map(h => (
            <div key={h.version} className="flex items-center gap-2 py-0.5">
              <span className="w-10 font-semibold">v{h.version}</span>
              <span className="w-32 text-slate-500">{String(h.cree_le || '').slice(0, 16).replace('T', ' ')}</span>
              <span className="w-40 truncate">{h.cree_par}</span>
              <span className="flex-1 truncate text-slate-600">{h.origine ? 'Retour au modèle d’origine' : (h.commentaire || '—')}</span>
              <button className="bouton text-[11px] py-0.5" onClick={() => reprendre(h.version)}>Reprendre</button>
            </div>))}
        </div>)}

      <div className="flex flex-1 min-h-0">
        <div className="flex-1 min-w-0 flex flex-col">
          <Toolbar editor={editor} sobre />
          <div className="flex-1 overflow-auto bg-white"><EditorContent editor={editor} /></div>
        </div>
        <div className="w-[200px] border-l border-slate-200 overflow-auto p-2 text-[12px] space-y-3">
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Champs</div>
            <p className="text-[11px] text-slate-500 mb-1">Cliquez pour l’insérer au curseur.</p>
            {Object.entries(m.champs).map(([k, l]) => (
              <button key={k} onClick={() => inserer({ type: 'champ', attrs: { key: k, label: l } })}
                className="block w-full text-left px-1.5 py-1 rounded-champ hover:bg-slate-50" title={`{{${k}}}`}>
                <span className="champ-tag text-[11px] border border-[var(--c-disponible)] rounded px-1">{l}</span>
              </button>))}
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-wide text-slate-500 mb-1">Blocs</div>
            <p className="text-[11px] text-slate-500 mb-1">
              <IconGripVertical size={11} className="inline -mt-0.5" /> Glissez un bloc pour le déplacer. Son contenu vient du calcul.</p>
            {Object.entries(m.blocs).map(([k, l]) => {
              const oblig = m.obligatoires.blocs.includes(k);
              const la = present.has(k);
              return (
                <div key={k} className="flex items-start gap-1 py-0.5">
                  <IconLock size={12} className={`mt-0.5 flex-none ${oblig ? 'text-slate-600' : 'text-slate-300'}`} />
                  <span className={`flex-1 ${la ? '' : 'text-slate-400'}`}>{l}{oblig ? '' : ' (facultatif)'}</span>
                  {!la && <button title="Insérer au curseur" onClick={() => inserer({ type: 'blocPiece', attrs: { cle: k } })}
                    className="text-iip-blue"><IconPlus size={13} /></button>}
                </div>);
            })}
          </div>
        </div>
      </div>

      {m.generique && (
        <div className="px-3 py-2 border-t border-slate-200 max-h-56 overflow-auto">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">Phrases à réécrire</span>
            <span className="text-[11px] text-slate-500">— une phrase fixe de la pièce, telle qu’elle s’affiche, et ce qu’elle devient.</span>
            <span className="flex-1" />
            <button className="bouton text-[11px] py-0.5 inline-flex items-center gap-1"
              onClick={() => { setRemp(l => [...l, { avant: '', apres: '' }]); setModifie(true); }}><IconPlus size={12} /> Ajouter</button>
          </div>
          {!remp.length && <div className="text-[12px] text-slate-500">Aucune. Exemple : « Programme retenu » → « Votre programme de l’année ».</div>}
          {remp.map((r, i) => (
            <div key={i} className="flex items-center gap-1.5 py-0.5">
              <input value={r.avant} data-reponses="non" placeholder="Texte de la pièce" className="controle flex-1 min-w-0"
                onChange={e => { const v = e.target.value; setRemp(l => l.map((x, k) => (k === i ? { ...x, avant: v } : x))); setModifie(true); }} />
              <span className="text-slate-400">→</span>
              <input value={r.apres} data-reponses="non" placeholder="Nouveau texte (vide = effacer)" className="controle flex-1 min-w-0"
                onChange={e => { const v = e.target.value; setRemp(l => l.map((x, k) => (k === i ? { ...x, apres: v } : x))); setModifie(true); }} />
              <button className="text-slate-400 hover:text-slate-700 px-1" title="Retirer"
                onClick={() => { setRemp(l => l.filter((_, k) => k !== i)); setModifie(true); }}>×</button>
            </div>))}
        </div>)}
      <div className="px-3 py-2 border-t border-slate-200 space-y-2">
        {!!manques.length && (
          <div className="text-[12px] flex items-start gap-1.5" style={{ color: 'var(--c-refuse)' }}>
            <IconAlertTriangle size={14} className="flex-none mt-0.5" />
            <span>Ce modèle ne peut pas être enregistré : il manque {manques.join(', ')}.</span>
          </div>)}
        <div className="flex flex-wrap items-center gap-2">
          <input value={commentaire} onChange={e => setCommentaire(e.target.value)} data-reponses="non"
            placeholder="Ce qui change (pour l’historique)" className="controle flex-1 min-w-[12rem]" />
          {!m.d_origine && (
            <button className="bouton controle inline-flex items-center gap-1" onClick={origine}>
              <IconArrowBackUp size={14} /> Modèle d’origine
            </button>)}
          <button className="bouton bouton-fort controle" disabled={enCours || !!manques.length || !modifie} onClick={enregistrer}>
            Enregistrer la version
          </button>
        </div>
      </div>
    </div>
  );
}
