/**
 * TOUTES LES ANNEXES DEVIENNENT DES FENÊTRES (3.5.083, Charles : « intégrer TOUS les documents pour qu'ils deviennent des
 * fenêtres, et ensuite imprimer, comme l'EA12 » ; tranché : une seule mécanique pour toutes).
 *
 * Le serveur lit le modèle Word officiel une fois rempli de ce que Lucie sait, et rend les blancs qui restent : pointillés,
 * cases de tableau, grilles de chiffres, cases à cocher, chacun avec son libellé (services/annexesLibres.js). Ils se tapent
 * ici, s'enregistrent au nom de la personne connectée, et la pièce sort en Word ou en PDF avec eux. Les blancs d'un même
 * tableau du modèle se tapent en tableau. Rien n'est obligatoire : un blanc laissé vide reste vide sur la pièce.
 */
import { useEffect, useMemo, useState } from 'react';
import { IconFileCheck, IconFileTypeDocx, IconFileTypePdf } from '@tabler/icons-react';
import { Fenetre, OutilFenetre } from './ui.jsx';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercuPdf } from '../lib/apercu.js';

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];
const champ = 'controle w-full border border-slate-300 rounded-champ bg-white text-sm';

/** Les blancs, rangés : un bloc par champ isolé, un tableau par suite de blancs d'un même tableau du modèle. */
function ranger(champs) {
  const blocs = [];
  for (const c of champs) {
    const der = blocs.at(-1);
    if (c.tableau != null && c.ligne) {
      if (der?.tableau === c.tableau) der.champs.push(c);
      else blocs.push({ tableau: c.tableau, champs: [c] });
    } else if (c.type === 'case' && der?.cases) der.cases.push(c);
    else if (c.type === 'case') blocs.push({ cases: [c] });
    else blocs.push({ seul: c });
  }
  return blocs.map(b => {
    if (b.seul || b.cases) return b;
    // Deux blancs dans la même case (« du … au … », trois dates d'absence) : deux colonnes.
    const vus = new Map();
    b.champs = b.champs.map(c => { const k = `${c.ligne}|${c.colonne}`; const n = (vus.get(k) || 0) + 1; vus.set(k, n); return n > 1 ? { ...c, colonne: `${c.colonne} (${n})` } : c; });
    const colonnes = [...new Set(b.champs.map(c => c.colonne))];
    const lignes = [...new Set(b.champs.map(c => c.ligne))].sort((x, y) => x - y);
    return { ...b, colonnes, lignes };
  });
}

function Saisie({ c, v, maj }) {
  if (c.type === 'case') {
    return <input type="checkbox" checked={c.coche || v === true} disabled={c.coche} onChange={e => maj(c.id, e.target.checked || null)} />;
  }
  return <input value={v ?? ''} onChange={e => maj(c.id, e.target.value)} className={`${champ} ${c.type === 'grille' ? 'font-mono tracking-widest' : ''}`}
    maxLength={c.type === 'grille' ? c.n : 2000} placeholder={c.date ? 'JJ/MM/AAAA' : c.type === 'grille' ? `${c.n} caractères` : ''} />;
}

export default function FenetreAnnexe({ annexe, membre, annee, moisInitial, onFermer }) {
  const [mois, setMois] = useState(moisInitial || new Date().getMonth() + 1);
  const [d, setD] = useState(null);
  const [v, setV] = useState({});
  const [erreur, setErreur] = useState(null);
  const [busy, setBusy] = useState(null);
  const [sale, setSale] = useState(false);
  const q = () => new URLSearchParams({ professeur_id: membre.id, annee, ...(annexe.mois ? { mois } : {}) });

  useEffect(() => {
    setD(null); setErreur(null);
    fetch(`/api/formulaires/${annexe.cle}/libres?${q()}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(j => { setD(j); setV(j.valeurs || {}); setSale(false); })
      .catch(e => setErreur(e.message));
    // eslint-disable-next-line
  }, [annexe.cle, membre.id, annee, mois]);

  const blocs = useMemo(() => ranger(d?.champs || []), [d]);
  const maj = (id, val) => { setV(x => ({ ...x, [id]: val })); setSale(true); };
  const enregistrer = async () => {
    setBusy('save'); setErreur(null);
    try {
      const r = await fetch(`/api/formulaires/${annexe.cle}/libres`, { method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ professeur_id: membre.id, annee, mois, valeurs: v }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setD(x => ({ ...x, enregistre: j.enregistre })); setSale(false);
      return true;
    } catch (e) { setErreur(e.message); return false; } finally { setBusy(null); }
  };
  const produire = async format => {
    if (sale && !(await enregistrer())) return;
    setBusy(format); setErreur(null);
    try {
      const r = await fetch(`/api/formulaires/${annexe.cle}?${q()}${format === 'pdf' ? '&format=pdf' : ''}`, { headers: authHeaders() });
      if (!r.ok) { const j = await r.json().catch(() => ({})); throw new Error(j.error || `Erreur ${r.status}`); }
      const cd = r.headers.get('Content-Disposition') || '';
      const nom = decodeURIComponent((/filename\*=UTF-8''([^;]+)/.exec(cd) || [])[1] || `${annexe.cle}.${format === 'pdf' ? 'pdf' : 'docx'}`);
      if (format === 'pdf') { ouvrirApercuPdf({ blob: await r.blob(), titre: annexe.titre, nomFichier: nom }); return; }
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement('a'); a.href = url; a.download = nom; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e) { setErreur(e.message); } finally { setBusy(null); }
  };

  const remplis = Object.values(v).filter(x => x === true || (x != null && String(x).trim())).length;
  const pied = (
    <div className="flex items-center gap-3 w-full">
      <div className="flex-1 min-w-0 text-second text-slate-500">
        {sale ? 'Modifications non enregistrées.'
          : d?.enregistre ? `Enregistrée par ${d.enregistre.par || '—'} le ${String(d.enregistre.le || '').slice(0, 10).split('-').reverse().join('/')} · ${remplis} blanc${remplis > 1 ? 's' : ''} rempli${remplis > 1 ? 's' : ''}.`
          : d ? 'Ce que Lucie sait est déjà dans la pièce ; tapez le reste, puis enregistrez.' : ''}
      </div>
      <button type="button" className="bouton" disabled={!d || busy || !sale} onClick={enregistrer}>{busy === 'save' ? '…' : 'Enregistrer'}</button>
    </div>
  );
  const outils = (<>
    <OutilFenetre Icone={IconFileTypeDocx} titre={busy === 'docx' ? 'Word…' : 'Word'} disabled={!d || !!busy} onClick={() => produire('docx')} />
    <OutilFenetre Icone={IconFileTypePdf} titre={busy === 'pdf' ? 'Aperçu PDF…' : 'Aperçu PDF'} disabled={!d || !!busy} onClick={() => produire('pdf')} />
  </>);

  return (
    <Fenetre icone={IconFileCheck} titre={annexe.titre} sous={`${membre.nom} · ${annee}`} large="grande" pied={pied} outils={outils} onFermer={onFermer}>
      <div className="space-y-4">
        {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2 text-second">{erreur}</div>}
        {annexe.mois && (
          <label className="inline-flex items-center gap-2 text-sm">Mois
            <select value={mois} onChange={e => setMois(Number(e.target.value))} className="controle border border-slate-300 rounded-champ bg-white text-sm">
              {MOIS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
          </label>)}
        {!d ? (!erreur && <p className="text-sm text-slate-400">Lecture du modèle…</p>)
          : !d.champs.length ? <p className="text-sm text-slate-600">Ce modèle n’a plus de blanc : Lucie l’a rempli entièrement. Produisez-le depuis le bandeau.</p>
          : blocs.map((b, i) => b.cases ? (
            <div key={`c${i}`} className="flex flex-wrap gap-x-5 gap-y-1.5 text-sm">
              {b.cases.map(c => <label key={c.id} className="inline-flex items-center gap-1.5"><Saisie c={c} v={v[c.id]} maj={maj} />{c.label}</label>)}
            </div>
          ) : b.seul ? (
            <div key={b.seul.id} className={b.seul.type === 'case' ? 'flex items-start gap-2 text-sm' : 'grid gap-1 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:items-center text-sm'}>
              {b.seul.type === 'case' ? <>
                <Saisie c={b.seul} v={v[b.seul.id]} maj={maj} /><span className="min-w-0">{b.seul.label}</span></>
                : <>
                  <span className="min-w-0 text-slate-700" title={b.seul.contexte || b.seul.label}>{b.seul.label}</span>
                  <Saisie c={b.seul} v={v[b.seul.id]} maj={maj} /></>}
            </div>
          ) : (
            <div key={`t${i}`} className="overflow-x-auto border rounded-champ" style={{ borderColor: 'var(--menu-bord)' }}>
              <table className="w-full text-sm">
                <thead><tr><th className="px-2 py-1 w-8">#</th>{b.colonnes.map(c => <th key={c} className="px-2 py-1 text-left font-semibold">{c}</th>)}</tr></thead>
                <tbody>
                  {b.lignes.map(l => (
                    <tr key={l}>
                      <td className="px-2 py-1 text-slate-500 tabular-nums">{l}</td>
                      {b.colonnes.map(col => {
                        const c = b.champs.find(z => z.ligne === l && z.colonne === col);
                        return <td key={col} className="px-1 py-1 min-w-[8rem]">{c ? <Saisie c={c} v={v[c.id]} maj={maj} /> : null}</td>;
                      })}
                    </tr>))}
                </tbody>
              </table>
            </div>))}
      </div>
    </Fenetre>
  );
}
