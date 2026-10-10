import { useState } from 'react';
import { IconArrowBackUp } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { demander, informer, saisir } from '../lib/dialogue.jsx';
import { Fenetre } from './ui.jsx';

/**
 * L'« ANNULER » GÉNÉRAL (3.1.270, Charles, 10 octobre 2026 : « il faut pouvoir revenir en
 * arrière au moins sur 10 changements — les profs font souvent des erreurs »). Dans la
 * barre du haut, pour tous : mes 10 derniers gestes, dits en mots ; on annule le plus
 * récent, ou l'on recule jusqu'à l'un d'eux. La direction voit aussi ceux de l'équipe
 * (annuler le geste d'un autre demande un motif). Le serveur refuse ce qui a changé
 * depuis, et les actes officiels (lib/annulation.js côté serveur).
 */
const heure = s => { const d = new Date(String(s || '').replace(' ', 'T') + 'Z'); return isNaN(d) ? s : d.toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }); };

export default function AnnulerGestes() {
  const [ouvert, setOuvert] = useState(false);
  const [d, setD] = useState(null);
  const [equipe, setEquipe] = useState(false);
  const [enCours, setEnCours] = useState(false);

  async function charger(eq = equipe) {
    setD(null);
    const r = await fetch(`/api/annulation/gestes${eq ? '?equipe=1' : ''}`, { headers: authHeaders() });
    setD(r.ok ? await r.json() : { gestes: [], erreur: true });
  }
  function ouvrir() { setOuvert(true); charger(); }

  /* Reculer jusqu'à un geste : on annule, du plus récent à lui, ceux de la même personne
     qui ne le sont pas encore ; on s'arrête au premier refus, et on le dit. */
  async function reculerJusqua(g) {
    const liste = (d?.gestes || []).filter(x => x.par_id === g.par_id && x.id >= g.id && !x.annule_le && x.annulable);
    let motif = '';
    if (equipe) {
      motif = await saisir({ titre: 'Annuler le geste d’un autre', message: `Geste de ${g.par || '—'}. Le motif est gardé avec l’annulation.`, confirmer: 'Annuler', obligatoire: true });
      if (motif == null) return;
    } else if (!(await demander({ titre: liste.length > 1 ? `Annuler ${liste.length} gestes` : 'Annuler ce geste',
      message: liste.length > 1 ? `Les ${liste.length} gestes, du plus récent jusqu’à celui-ci, sont défaits dans l’ordre.` : g.resume, confirmer: 'Annuler' }))) return;
    setEnCours(true);
    let faits = 0, refus = null;
    for (const x of liste) {
      const r = await fetch(`/api/annulation/gestes/${x.id}`, { method: 'POST', headers: authHeaders(), body: JSON.stringify({ motif }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { refus = j.error || `Erreur ${r.status}`; break; }
      faits++;
    }
    setEnCours(false);
    await informer(refus
      ? `${faits ? `✓ ${faits} geste(s) annulé(s). ` : ''}❌ ${refus}`
      : `✓ ${faits} geste(s) annulé(s). L’écran se recharge pour montrer l’état rétabli.`);
    if (faits) window.location.reload(); else charger();
  }

  return (<>
    <button onClick={ouvrir} aria-label="Annuler mes derniers gestes" title="Annuler — revenir sur mes 10 derniers gestes"
      className="objet-barre objet-barre-icone"><IconArrowBackUp size={16} /></button>
    {ouvert && (
      <Fenetre titre="Annuler mes derniers gestes" sous="Un geste = un enregistrement, un clic. Les 10 derniers de chacun se gardent." large="grande" onFermer={() => setOuvert(false)}
        pied={<><span className="text-second text-slate-500 min-w-0 flex-1">Lucie refuse d’annuler ce que quelqu’un a modifié depuis, et les actes officiels (séance close, décision validée, présences, envois) : ils se reprennent par leur procédure.</span>
          <button className="bouton bouton-fort" onClick={() => setOuvert(false)}>Fermer</button></>}>
        {d?.direction && (
          <div className="segments mb-3" role="group">
            <button type="button" aria-pressed={!equipe} className={!equipe ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'} onClick={() => { setEquipe(false); charger(false); }}>Mes gestes</button>
            <button type="button" aria-pressed={equipe} className={equipe ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'} onClick={() => { setEquipe(true); charger(true); }}>Toute l’équipe</button>
          </div>)}
        {!d ? <div className="text-sm text-slate-400">Chargement…</div>
          : !d.gestes.length ? <p className="text-sm text-slate-500">{d.erreur ? 'Lecture impossible.' : 'Aucun geste gardé pour l’instant : chaque enregistrement à venir s’ajoutera ici.'}</p>
          : <table className="w-full text-second">
              <thead><tr className="tab-entete text-left">
                <th className="px-2 py-1.5">Quand</th>{equipe && <th className="px-2 py-1.5">Qui</th>}<th className="px-2 py-1.5">Ce qui a été fait</th><th className="px-2 py-1.5 w-56" />
              </tr></thead>
              <tbody>
                {d.gestes.map(g => (
                  <tr key={g.id} className="border-t border-slate-100 align-top">
                    <td className="px-2 py-2 whitespace-nowrap tabular-nums text-slate-600">{heure(g.le)}</td>
                    {equipe && <td className="px-2 py-2 whitespace-nowrap">{g.par || '—'}</td>}
                    <td className="px-2 py-2">
                      <div className={g.annule_le ? 'line-through text-slate-400' : ''}>{g.resume}</div>
                      <div className="text-mention text-slate-400">{g.methode} {g.chemin}</div>
                      {!g.annulable && !g.annule_le && <div className="text-mention text-slate-500">{g.pourquoi_pas}</div>}
                    </td>
                    <td className="px-2 py-2 text-right">
                      {g.annule_le
                        ? <span className="text-mention text-slate-500">annulé le {heure(g.annule_le)}{g.annule_par ? ` par ${g.annule_par}` : ''}</span>
                        : g.annulable
                          ? <button className="bouton" disabled={enCours} onClick={() => reculerJusqua(g)}
                              title={equipe ? 'Annuler ce geste (motif demandé)' : 'Annuler ce geste, et ceux qui sont venus après'}>↶ {equipe ? 'Annuler' : 'Revenir avant ce geste'}</button>
                          : <span className="text-mention text-slate-400">ne s’annule pas ici</span>}
                    </td>
                  </tr>))}
              </tbody>
            </table>}
      </Fenetre>)}
  </>);
}
