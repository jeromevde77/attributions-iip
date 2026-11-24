import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { IconCamera, IconFileTypePdf, IconPhoto, IconX } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirOngletAttente } from '../lib/ongletAttente.js';
import { Fenetre } from './ui.jsx';

/**
 * LES CAPTURES JOINTES À UNE IDÉE (3.5.669, idée #31 de Thomas GUIOT : « permettre l'upload d'images ou docs
 * dans l'outil de proposition d'amélioration » — il voulait montrer le défaut plutôt que le décrire).
 *
 * Trois pièces au plus, 5 Mo chacune : images (PNG, JPEG, GIF, WebP) et PDF. Le serveur les reconnaît à
 * leurs premiers octets et les range sur le disque, jamais en base. Une capture d'écran se COLLE dans la
 * zone de texte (Cmd/Ctrl + V) : c'est le geste de celui qui vient de buter sur quelque chose.
 */
export const MAX_PIECES = 3;
const MAX_TAILLE = 5 * 1024 * 1024;
const TYPES = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'application/pdf'];
const estImage = type => /^image\//.test(type || '');

function lireFichier(f) {
  return new Promise((ok, ko) => {
    const r = new FileReader();
    r.onload = () => ok(r.result);
    r.onerror = () => ko(new Error(`« ${f.name} » : fichier illisible.`));
    r.readAsDataURL(f);
  });
}

/** Ajoute des fichiers à la liste en préparation ; rend un message d'erreur, ou null. */
async function ajouter(fichiers, pieces, setPieces) {
  const l = [...pieces];
  for (const f of fichiers) {
    if (l.length >= MAX_PIECES) return 'Trois pièces jointes au plus.';
    if (!TYPES.includes(f.type)) return `« ${f.name} » : seules les images (PNG, JPEG, GIF, WebP) et les PDF se joignent.`;
    if (f.size > MAX_TAILLE) return `« ${f.name} » dépasse 5 Mo.`;
    const contenu = await lireFichier(f);
    const nom = f.name && f.name !== 'image.png' ? f.name
      : `capture-${new Date().toISOString().slice(0, 19).replace(/[T:]/g, '-')}.${(f.type.split('/')[1] || 'png').replace('jpeg', 'jpg')}`;
    l.push({ cle: `${Date.now()}-${Math.random()}`, nom, type: f.type, taille: f.size, contenu });
  }
  setPieces(l);
  return null;
}

/** Le gestionnaire de `paste` d'une zone de texte : une image collée devient une pièce, le texte se colle comme avant. */
export function surCollage(pieces, setPieces, setErreur) {
  return async e => {
    const fichiers = [...(e.clipboardData?.files || [])].filter(f => estImage(f.type));
    if (!fichiers.length) return;
    e.preventDefault();
    setErreur?.(await ajouter(fichiers, pieces, setPieces));
  };
}

/** Le corps à envoyer au serveur. */
export const piecesAEnvoyer = pieces => pieces.map(p => ({ nom: p.nom, contenu: p.contenu }));

/** « Joindre une capture » et les vignettes de ce qui partira, chacune avec sa croix. */
export function ChoixPieces({ pieces, setPieces, erreur, setErreur }) {
  const champ = useRef(null);
  async function choisis(e) {
    const fichiers = [...(e.target.files || [])];
    e.target.value = '';
    setErreur?.(await ajouter(fichiers, pieces, setPieces));
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input ref={champ} type="file" multiple accept={TYPES.join(',')} className="hidden" onChange={choisis} />
      <button type="button" className="bouton inline-flex items-center gap-1.5"
        disabled={pieces.length >= MAX_PIECES} onClick={() => champ.current?.click()}
        title="Une image ou un PDF, 5 Mo au plus — une capture d'écran se colle aussi dans le texte">
        <IconCamera size={15} /> Joindre une capture
      </button>
      {pieces.map(p => (
        <span key={p.cle} className="relative inline-flex items-center gap-1.5 border border-slate-200 rounded-champ bg-white pr-6 overflow-hidden">
          {estImage(p.type)
            ? <img src={p.contenu} alt={p.nom} className="h-10 w-14 object-cover" />
            : <IconFileTypePdf size={20} className="ml-2 text-slate-500" />}
          <span className="text-second text-slate-600 max-w-[10rem] truncate" title={p.nom}>{p.nom}</span>
          <button type="button" className="absolute right-1 top-1/2 -translate-y-1/2 text-slate-400 hover:text-[color:var(--c-refuse)]"
            title="Retirer" onClick={() => setPieces(pieces.filter(x => x.cle !== p.cle))}><IconX size={14} /></button>
        </span>))}
      {!pieces.length && <span className="text-xs text-slate-400">ou collez une capture d'écran dans le texte</span>}
      {erreur && <span className="text-second text-[color:var(--c-refuse)]">{erreur}</span>}
    </div>
  );
}

/** Le fichier d'une pièce, lu avec la session (la route l'exige) et rendu en adresse locale. */
function useBlob(suggestionId, piece) {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    let u = null, vivant = true;
    fetch(`/api/suggestions/${suggestionId}/piece/${piece.id}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.blob() : null))
      .then(b => { if (b && vivant) { u = URL.createObjectURL(new Blob([b], { type: piece.type })); setUrl(u); } })
      .catch(() => {});
    return () => { vivant = false; if (u) URL.revokeObjectURL(u); };
  }, [suggestionId, piece.id, piece.type]);
  return url;
}

function Vignette({ suggestionId, piece, onOuvrir }) {
  const url = useBlob(suggestionId, piece);
  return (
    <button type="button" onClick={() => onOuvrir(url)} title={`${piece.nom} — agrandir`}
      className="h-16 w-24 border border-slate-200 rounded-champ overflow-hidden bg-white grid place-items-center hover:border-[color:var(--c-principal)]">
      {url ? <img src={url} alt={piece.nom} className="h-full w-full object-cover" />
        : <IconPhoto size={18} className="text-slate-300" />}
    </button>
  );
}

/** Les pièces d'une idée ou d'un message, en vignettes : une image s'ouvre en grand, un PDF dans un onglet. */
export function PiecesIdee({ suggestionId, pieces }) {
  const [grande, setGrande] = useState(null);   // { url, nom }
  const l = pieces || [];
  if (!l.length) return null;
  async function ouvrirPdf(p) {
    const fen = ouvrirOngletAttente('Ouverture du document…');
    const r = await fetch(`/api/suggestions/${suggestionId}/piece/${p.id}`, { headers: authHeaders() }).catch(() => null);
    if (!r?.ok) { fen?.close(); return; }
    const url = URL.createObjectURL(new Blob([await r.blob()], { type: p.type }));
    if (fen) fen.location = url;
    else { const a = document.createElement('a'); a.href = url; a.download = p.nom; a.click(); }
  }
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-2">
      {l.map(p => (estImage(p.type)
        ? <Vignette key={p.id} suggestionId={suggestionId} piece={p} onOuvrir={url => url && setGrande({ url, nom: p.nom })} />
        : (
          <button key={p.id} type="button" className="bouton inline-flex items-center gap-1.5" onClick={() => ouvrirPdf(p)}
            title="Ouvrir dans un nouvel onglet">
            <IconFileTypePdf size={15} /> <span className="max-w-[12rem] truncate">{p.nom}</span>
          </button>)))}
      {grande && createPortal(
        <Fenetre icone={IconPhoto} titre={grande.nom} large="pleine" onFermer={() => setGrande(null)}>
          <img src={grande.url} alt={grande.nom} className="max-w-full max-h-[75vh] mx-auto" />
        </Fenetre>, document.body)}
    </div>
  );
}
