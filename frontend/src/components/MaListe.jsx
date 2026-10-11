import { useEffect, useRef, useState } from 'react';
import { IconListDetails, IconChevronDown, IconPrinter, IconFileSpreadsheet, IconMail } from '@tabler/icons-react';

/**
 * MA LISTE (3.1.288, Charles, 11 octobre 2026 : « ce n'est pas clair pour les profs ; ça va dans
 * Éditions, mais ils ne savent rien faire, c'est bridé — et pouvoir faire des Excel »). Un bouton
 * nommé, là où l'on travaille, et trois gestes : imprimer la liste (PDF, colonne de signature),
 * la télécharger en Excel, copier les adresses de l'école. Le groupe affiché fait la liste.
 */
export default function MaListe({ etudiants, groupe, cours, onImprimer, occupe }) {
  const [ouvert, setOuvert] = useState(false);
  const [msg, setMsg] = useState('');
  const boite = useRef(null);
  useEffect(() => {
    const f = e => { if (boite.current && !boite.current.contains(e.target)) setOuvert(false); };
    document.addEventListener('mousedown', f); return () => document.removeEventListener('mousedown', f);
  }, []);
  const dire = t => { setMsg(t); setTimeout(() => setMsg(''), 4000); };

  async function excel() {
    setOuvert(false);
    const XLSX = await import('xlsx');
    const lignes = etudiants.map(e => ({
      Nom: String(e.nom || '').toUpperCase(), Prénom: e.prenom || '', Matricule: e.id_ecampus || '',
      Groupe: e.groupe || '', 'Adresse école': e.email_ecole || '',
    }));
    const ws = XLSX.utils.json_to_sheet(lignes);
    ws['!cols'] = [{ wch: 24 }, { wch: 18 }, { wch: 14 }, { wch: 30 }, { wch: 34 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Étudiants');
    XLSX.writeFile(wb, `Liste_${cours}${groupe ? `_groupe_${groupe}` : ''}.xlsx`);
    dire(`✓ ${lignes.length} étudiant(s) dans le fichier Excel.`);
  }
  async function adresses() {
    setOuvert(false);
    const l = etudiants.map(e => e.email_ecole).filter(Boolean);
    try { await navigator.clipboard.writeText(l.join('; ')); dire(`✓ ${l.length} adresse(s) copiée(s) : collez-les dans votre messagerie.`); }
    catch { dire('La copie a été refusée par le navigateur.'); }
  }

  return (
    <div ref={boite} className="relative inline-flex items-center gap-2">
      {msg && <span className="text-second text-slate-500">{msg}</span>}
      <button type="button" className="bouton bouton-sortir inline-flex items-center gap-1.5" disabled={occupe} onClick={() => setOuvert(o => !o)}>
        <IconListDetails size={15} /> Ma liste {groupe ? `(groupe ${groupe})` : ''} <span className="text-slate-400">· {etudiants.length}</span> <IconChevronDown size={14} />
      </button>
      {ouvert && (
        <div className="absolute right-0 top-full mt-1 z-30 w-80 rounded-carte border border-slate-200 shadow-flottant p-1" style={{ background: 'var(--blanc)' }}>
          {[
            [IconPrinter, 'Imprimer la liste (PDF)', 'Avec une colonne de signature ; aperçu d’abord', () => { setOuvert(false); onImprimer(); }],
            [IconFileSpreadsheet, 'Télécharger en Excel', 'Nom, prénom, matricule, groupe, adresse école', excel],
            [IconMail, 'Copier les adresses e-mail', 'Les adresses de l’école, séparées par « ; »', adresses],
          ].map(([Ic, t, d, f]) => (
            <button key={t} type="button" onClick={f} className="w-full text-left px-3 py-2 rounded-champ hover:bg-slate-50 flex gap-2.5">
              <Ic size={18} className="text-slate-500 mt-0.5 flex-none" />
              <span><span className="block text-sm font-medium">{t}</span><span className="block text-second text-slate-500">{d}</span></span>
            </button>))}
        </div>)}
    </div>);
}
