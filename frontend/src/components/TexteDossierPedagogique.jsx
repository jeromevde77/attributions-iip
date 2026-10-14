/**
 * LE DOSSIER PÉDAGOGIQUE IMPORTÉ, EN TEXTE (Charles, 14 octobre 2026 : « il manque une version en
 * texte de l'import du DP complet — dans l'UE, au niveau de la bibliothèque »). Ce que l'import a lu
 * et rangé (`ue.ue_dp`) : finalités, capacités préalables, acquis, programme — puces et sous-puces
 * comprises. En lecture : on vérifie ce que Lucie a compris du dossier ; on corrige en réimportant.
 */
import { useEffect, useState } from 'react';
import { IconCopy, IconCheck } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

export function arbreDP(texte) {
  const out = []; let pile = []; let k = 0;
  // Les puces « - », deux espaces par niveau : chaque niveau s'accroche au dernier point du niveau au-dessus.
  for (const brut of String(texte || '').split('\n')) {
    const titre = /^##\s+(.*)$/.exec(brut);
    const puce = /^( *)- (.*)$/.exec(brut);
    if (puce) {
      const n = Math.floor(puce[1].length / 2);
      if (!pile.length) { const items = []; out.push({ t: 'ul', items, k: k++ }); pile = [items]; }
      while (pile.length > n + 1) pile.pop();
      while (pile.length < n + 1) { const parent = pile.at(-1); if (!parent.length) parent.push({ txt: '' }); pile.push(parent.at(-1).enfants ||= []); }
      pile.at(-1).push({ txt: puce[2] });
      continue;
    }
    pile = [];
    if (titre) out.push({ t: 'h', txt: titre[1], k: k++ });
    else if (brut.trim()) out.push({ t: 'p', txt: brut.trim(), k: k++ });
  }
  return out;
}

function rendre(texte) {
  const out = arbreDP(texte);
  const liste = (items, n = 0) => <ul className={`${n ? 'list-[circle] mt-0.5' : 'list-disc'} pl-5 space-y-0.5`}>{items.map((x, i) => (
    <li key={i}>{x.txt}{x.enfants?.length ? liste(x.enfants, n + 1) : null}</li>))}</ul>;
  return out.map(b => (b.t === 'h' ? <h4 key={b.k} className="intertitre pt-2">{b.txt}</h4>
    : b.t === 'p' ? <p key={b.k}>{b.txt}</p> : <div key={b.k}>{liste(b.items)}</div>));
}

export default function TexteDossierPedagogique({ ueNum, annee }) {
  const [texte, setTexte] = useState(null);
  const [copie, setCopie] = useState(false);
  useEffect(() => {
    if (!ueNum || !annee) return;
    fetch(`/api/ref/ue/${encodeURIComponent(ueNum)}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(j => setTexte(j?.ue_dp || '')).catch(() => setTexte(''));
  }, [ueNum, annee]);
  if (texte == null) return <p className="text-second text-slate-400">Chargement…</p>;
  if (!texte.trim()) return <p className="text-second text-slate-500">Aucun dossier pédagogique importé pour cette unité en {annee}. Il s’importe depuis « Importer un dossier pédagogique ».</p>;
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-second text-slate-500 flex-1 min-w-0">Ce que Lucie a lu du dossier ({annee}). Pour corriger : réimporter le dossier.</span>
        <button type="button" className="bouton bouton-compact inline-flex items-center gap-1" onClick={async () => {
          try { await navigator.clipboard.writeText(texte.replace(/^##\s+/gm, '')); setCopie(true); setTimeout(() => setCopie(false), 2000); } catch { /* refusé */ }
        }}>{copie ? <IconCheck size={14} /> : <IconCopy size={14} />} {copie ? 'Copié' : 'Copier le texte'}</button>
      </div>
      <div className="text-second text-slate-700 space-y-1.5 max-h-[60vh] overflow-y-auto pr-2 leading-snug">{rendre(texte)}</div>
    </div>);
}
