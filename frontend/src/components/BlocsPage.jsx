import { IconEye, IconEyeOff, IconGripVertical, IconColumns1, IconColumns2 } from '@tabler/icons-react';
import { useMiseEnPage, changerMiseEnPage, deplacer, poigneeGlisser } from '../lib/miseEnPage.js';

/**
 * LES BLOCS D'UNE PAGE, RANGÉS PAR L'ADMINISTRATEUR (3.1.256, Charles, 10 octobre
 * 2026 : « paramétrer en glisser-déposer les pages principales — toutes les pages,
 * mais juste l'admin »). Une page déclare ses blocs — une clé, un titre, un rendu —
 * et ce composant les pose dans l'ordre réglé, en pleine largeur ou en demi-largeur,
 * sans ceux qui sont masqués. En mode mise en page, chaque bloc porte sa barre :
 * on le glisse sur un autre pour le ranger avant lui, on le masque, on change sa
 * largeur. Un bloc qu'une page ajoute demain prend sa place à la fin, sans que
 * personne ait à y penser.
 */
export default function BlocsPage({ page, blocs }) {
  const mep = useMiseEnPage();
  const r = mep.conf.pages?.[page] || {};
  const ordre = r.ordre || [];
  const rang = c => { const i = ordre.indexOf(c); return i < 0 ? 1000 + blocs.findIndex(b => b.cle === c) : i; };
  const ranges = [...blocs].sort((a, b) => rang(a.cle) - rang(b.cle));
  const masques = new Set(r.masques || []), demis = new Set(r.demis || []);
  const maj = f => changerMiseEnPage(c => ({ ...c, pages: { ...(c.pages || {}), [page]: f({ ordre: ranges.map(b => b.cle), masques: [...masques], demis: [...demis], ...(c.pages?.[page] || {}) }) } }));
  const basculer = (liste, cle) => maj(p => { const s = new Set(p[liste] || []); s.has(cle) ? s.delete(cle) : s.add(cle); return { ...p, [liste]: [...s] }; });
  const ranger = (de, vers) => maj(p => ({ ...p, ordre: deplacer(ranges.map(b => b.cle), de, vers) }));
  return (
    <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
      {ranges.filter(b => mep.actif || !masques.has(b.cle)).map(b => (
        <div key={b.cle} className={`min-w-0 ${demis.has(b.cle) ? '' : 'lg:col-span-2'} ${mep.actif && masques.has(b.cle) ? 'opacity-40' : ''}`}
          {...poigneeGlisser(mep.actif, `page:${page}`, b.cle, ranger)}>
          {mep.actif && (
            <div className="flex items-center gap-2 mb-1 px-2 py-1 rounded-champ text-xs" style={{ background: 'color-mix(in srgb, var(--c-attente) 14%, transparent)' }}>
              <IconGripVertical size={14} /><b className="flex-1 truncate">{b.titre}</b>
              <button type="button" className="objet-barre objet-barre-icone !h-6 !min-w-6" title={demis.has(b.cle) ? 'Pleine largeur' : 'Demi-largeur'} onClick={() => basculer('demis', b.cle)}>
                {demis.has(b.cle) ? <IconColumns1 size={14} /> : <IconColumns2 size={14} />}</button>
              <button type="button" className="objet-barre objet-barre-icone !h-6 !min-w-6" title={masques.has(b.cle) ? 'Afficher ce bloc' : 'Masquer ce bloc'} onClick={() => basculer('masques', b.cle)}>
                {masques.has(b.cle) ? <IconEyeOff size={14} /> : <IconEye size={14} />}</button>
            </div>)}
          {b.rendu}
        </div>))}
    </div>
  );
}
