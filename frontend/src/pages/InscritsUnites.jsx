/**
 * LES INSCRITS PAR UNITÉ, SECTION PAR SECTION (Charles, 7 octobre 2026 :
 * « d'abord tous les inscrits de la section, puis pour des UE sélectionnées ou
 * une seule UE ; ensuite le détail avec des colonnes cours, et des filtres sur
 * les étudiants : nouveaux, qui recommencent… »).
 *
 * Deux niveaux sous une même barre : la section, une ligne par unité ; puis,
 * pour les unités cochées, l'étudiant × ses cours. Le serveur rend les faits
 * (`GET /api/etudiants/inscrits-unites`), l'écran filtre et compte ; ce qui
 * s'imprime est recomposé par le serveur à partir de la sélection.
 *
 * Les parties sont celles de la pièce « Listes par unité » : A à suivre en
 * entier, B avec dispense / VA / report, C déjà acquise (à retirer).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { IconPrinter } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { TuileEtat } from '../components/ui.jsx';
import { FicheEtudiant, RevuePAE } from './Etudiants.jsx';
import GrilleInscrits from '../components/GrilleInscrits.jsx';

const PARTIES = { A: 'À suivre', B: 'Dispense', C: 'Déjà acquise' };
const CASE = {
  suit: { t: '●', c: 'text-slate-500' },
  R: { t: 'R', c: 'bg-blue-600 text-white', titre: 'report de note' },
  VA: { t: 'VA', c: 'bg-emerald-600 text-white', titre: 'valorisé' },
  D: { t: 'D', c: 'bg-emerald-600 text-white', titre: 'dispense complète' },
  acquis: { t: '—', c: 'text-amber-700', titre: 'unité déjà acquise' },
};

/** Un bouton qu'on allume ou éteint, dans la forme des contrôles de la barre. */
function Bascule({ actif, onClick, children, titre }) {
  return (
    <button type="button" title={titre} onClick={onClick}
      className={`controle text-[12px] ${actif ? 'bg-iip-blue text-white border-iip-blue' : ''}`}>
      {children}
    </button>
  );
}

export default function InscritsUnites() {
  const [annee] = useState(getAnnee());
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState(() => { try { return localStorage.getItem('iu.section') || ''; } catch { return ''; } });
  const [data, setData] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [choix, setChoix] = useState(() => new Set());     // unités cochées
  const [f, setF] = useState({ profil: new Set(), bloc: new Set(), partie: new Set(), sle: false });
  const [fiche, setFiche] = useState(null);
  const [revue, setRevue] = useState(null);   // l'étudiant dont on ouvre la revue du PAE
  const [recharge, setRecharge] = useState(0);
  const derniereLecture = useRef('');
  const [impression, setImpression] = useState(false);
  // DEUX LECTURES : la GRILLE (un étudiant par ligne, une unité par colonne) et
  // la vue PAR UNITÉ (une ligne par unité, puis ses étudiants).
  const [vue, setVue] = useState(() => { try { return localStorage.getItem('iu.vue') || 'grille'; } catch { return 'grille'; } });
  useEffect(() => { try { localStorage.setItem('iu.vue', vue); } catch { /* */ } }, [vue]);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => {
        setSections(l || []);
        if (!section && l?.length === 1) setSection(l[0].code);
      }).catch(() => setSections([]));
  }, []);   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    try { localStorage.setItem('iu.section', section); } catch { /* */ }
    // Relire après une revue garde l'écran tel quel (tri, colonnes) ; changer de
    // section ou d'année repart de zéro.
    const cleLecture = `${annee}|${section}`;
    if (derniereLecture.current !== cleLecture) { setData(null); setChoix(new Set()); }
    derniereLecture.current = cleLecture;
    setErreur(null);
    if (!section) return;
    let vivant = true;
    fetch(`/api/etudiants/inscrits-unites?annee=${encodeURIComponent(annee)}&section=${encodeURIComponent(section)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(j => { if (vivant) setData(j); })
      .catch(e => { if (vivant) setErreur(e.message); });
    return () => { vivant = false; };
  }, [annee, section, recharge]);

  const E = data?.etudiants || {};
  const blocs = useMemo(() => [...new Set(Object.values(E).map(e => e.bloc).filter(Boolean))].sort(), [data]);   // eslint-disable-line react-hooks/exhaustive-deps

  // UNE LIGNE PASSE LES FILTRES : dans un même groupe, l'un OU l'autre ;
  // entre les groupes, l'un ET l'autre.
  const passe = l => {
    const e = E[l.id] || {};
    if (f.profil.size && !((f.profil.has('nouveau') && e.nouveau) || (f.profil.has('reprise') && l.reprise))) return false;
    if (f.bloc.size && !f.bloc.has(e.bloc)) return false;
    if (f.partie.size && !f.partie.has(l.partie)) return false;
    if (f.sle && !e.sle) return false;
    return true;
  };
  const unites = useMemo(() => (data?.unites || []).map(u => ({ ...u, vues: u.lignes.filter(l => l.inscrit !== false).filter(passe) })),
    [data, f]);   // eslint-disable-line react-hooks/exhaustive-deps
  const distincts = l => new Set(l.flatMap(u => u.vues.map(x => x.id)));
  const tous = distincts(unites);
  const choisies = unites.filter(u => choix.has(u.ue_num));
  const dansChoix = distincts(choisies);
  const nNouveaux = s => [...s].filter(id => E[id]?.nouveau).length;
  const nReprises = l => new Set(l.flatMap(u => u.vues.filter(x => x.reprise).map(x => x.id))).size;

  const basculer = (groupe, v) => setF(x => {
    const s = new Set(x[groupe]); s.has(v) ? s.delete(v) : s.add(v); return { ...x, [groupe]: s };
  });
  const cocher = n => setChoix(c => { const s = new Set(c); s.has(n) ? s.delete(n) : s.add(n); return s; });
  const filtresActifs = [
    ...[...f.profil].map(p => (p === 'nouveau' ? 'nouveaux' : 'reprises')),
    ...f.bloc, ...[...f.partie].map(p => `${p} ${PARTIES[p].toLowerCase()}`), ...(f.sle ? ['SLE'] : []),
  ];

  async function imprimer() {
    setImpression(true);
    try {
      const sel = choisies.length ? choisies : unites;
      const r = await fetch('/api/rapports/inscrits-unites', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, section, ues: sel.map(u => u.ue_num),
          ids: [...distincts(sel)], filtres: filtresActifs.join(', '), detail: choisies.length > 0 }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      const pdf = await fetch('/api/impression/pdf', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ html: j.html, nom: j.nom, orientation: j.orientation, pagination: 'si-plusieurs' }),
      });
      if (pdf.ok) {
        const url = URL.createObjectURL(await pdf.blob());
        window.open(url, '_blank');
        setTimeout(() => URL.revokeObjectURL(url), 60000);
      } else {
        ouvrirApercu({ html: j.html, titre: 'Inscrits par unité', nomFichier: j.nom, envoiPossible: false });
      }
    } catch (e) { setErreur(e.message); }
    setImpression(false);
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select className="controle" value={section} onChange={e => setSection(e.target.value)}>
          <option value="">Choisir une section</option>
          {sections.map(s => <option key={s.code} value={s.code}>{s.libelle || s.code}</option>)}
        </select>
        <div className="segments">
          {[['grille', 'Grille'], ['unites', 'Par unité']].map(([k, lib]) => (
            <button key={k} type="button" onClick={() => setVue(k)}
              className={vue === k ? 'bg-iip-blue text-white' : 'text-slate-600 hover:bg-slate-50'}>{lib}</button>))}
        </div>
        <span className="text-[11px] text-slate-500 ml-2">Étudiants :</span>
        <Bascule actif={f.profil.has('nouveau')} onClick={() => basculer('profil', 'nouveau')}
          titre="Aucune inscription ni valorisation avant cette année">Nouveaux</Bascule>
        <Bascule actif={f.profil.has('reprise')} onClick={() => basculer('profil', 'reprise')}
          titre="Déjà inscrit à cette unité une année précédente, sans l'avoir réussie">Reprises</Bascule>
        {blocs.map(b => <Bascule key={b} actif={f.bloc.has(b)} onClick={() => basculer('bloc', b)}>{b}</Bascule>)}
        {vue === 'unites' && Object.entries(PARTIES).map(([k, lib]) => (
          <Bascule key={k} actif={f.partie.has(k)} onClick={() => basculer('partie', k)}>{k} · {lib}</Bascule>))}
        <Bascule actif={f.sle} onClick={() => setF(x => ({ ...x, sle: !x.sle }))} titre="Séjour limité aux études">SLE</Bascule>
        {filtresActifs.length > 0 && (
          <button type="button" className="text-[12px] text-slate-500 underline"
            onClick={() => setF({ profil: new Set(), bloc: new Set(), partie: new Set(), sle: false })}>effacer les filtres</button>)}
        <div className="flex-1" />
        {data && vue === 'unites' && (
          <button type="button" className="bouton-sortir controle flex items-center gap-1.5" disabled={impression} onClick={imprimer}
            title={choisies.length ? 'La synthèse des unités cochées, puis une page par unité avec ses cours' : 'La synthèse de toutes les unités de la section'}>
            <IconPrinter size={16} /> {impression ? 'Préparation…' : choisies.length ? `Imprimer la sélection (${choisies.length})` : 'Imprimer la section'}
          </button>)}
      </div>

      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2 text-[13px]">{erreur}</div>}
      {!section && <p className="text-[13px] text-slate-500">Choisissez une section.</p>}
      {section && !data && !erreur && <p className="text-[13px] text-slate-400">Chargement…</p>}

      {data && vue === 'grille' && (
        <GrilleInscrits data={data} passe={passe} annee={annee} section={section} onFiche={setFiche} onRevue={setRevue} onChange={() => setRecharge(x => x + 1)} />)}

      {data && vue === 'unites' && (<>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 max-w-4xl">
          <TuileEtat etat="fort" valeur={tous.size} libelle={`Étudiants — ${section}`} precision={`${annee}${filtresActifs.length ? ' · filtré' : ''}`} />
          <TuileEtat etat="neutre" valeur={nNouveaux(tous)} libelle="Nouveaux" precision="première année à l'IIP" />
          <TuileEtat etat="neutre" valeur={nReprises(unites)} libelle="Reprennent une unité" />
          <TuileEtat etat={choisies.length ? 'disponible' : 'neutre'} valeur={choisies.length ? dansChoix.size : '—'}
            libelle="Dans la sélection" precision={choisies.length ? `${choisies.length} unité(s) cochée(s)` : 'cochez des unités'} />
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-[13px] tabular-nums">
            <thead className="tab-entete"><tr>
              <th className="w-8 px-2 py-1.5">
                <input type="checkbox" checked={unites.length > 0 && choix.size === unites.length}
                  onChange={e => setChoix(e.target.checked ? new Set(unites.map(u => u.ue_num)) : new Set())} />
              </th>
              <th className="text-left px-2">Unité</th>
              <th className="text-right px-2">Inscrits</th><th className="text-right px-2">Nouveaux</th><th className="text-right px-2">Reprises</th>
              <th className="text-right px-2">A · à suivre</th><th className="text-right px-2">B · dispense</th><th className="text-right px-2">C · déjà acquise</th>
            </tr></thead>
            <tbody>
              {unites.map(u => {
                const n = p => u.vues.filter(p).length;
                return (
                  <tr key={u.ue_num} className={`border-b border-slate-200 ${choix.has(u.ue_num) ? 'bg-blue-50' : ''}`}>
                    <td className="px-2 py-1.5 text-center"><input type="checkbox" checked={choix.has(u.ue_num)} onChange={() => cocher(u.ue_num)} /></td>
                    <td className="px-2">
                      <button type="button" className="text-left hover:underline" title="Voir le détail de cette seule unité"
                        onClick={() => setChoix(new Set([u.ue_num]))}>
                        UE {u.ue_num} — {u.ue_nom}{u.hors_cursus && <span className="text-slate-400"> (hors cursus)</span>}
                      </button>
                    </td>
                    <td className="px-2 text-right font-medium">{u.vues.length}</td>
                    <td className="px-2 text-right">{n(l => E[l.id]?.nouveau) || ''}</td>
                    <td className="px-2 text-right">{n(l => l.reprise) || ''}</td>
                    <td className="px-2 text-right">{n(l => l.partie === 'A') || ''}</td>
                    <td className="px-2 text-right">{n(l => l.partie === 'B') || ''}</td>
                    <td className={`px-2 text-right ${n(l => l.partie === 'C') ? 'text-amber-700 font-medium' : ''}`}>{n(l => l.partie === 'C') || ''}</td>
                  </tr>);
              })}
            </tbody>
            <tfoot className="font-medium">
              <tr className="tab-repere"><td /><td className="px-2 py-1.5">Section — étudiants distincts</td>
                <td className="px-2 text-right">{tous.size}</td><td className="px-2 text-right">{nNouveaux(tous)}</td>
                <td className="px-2 text-right">{nReprises(unites)}</td><td colSpan={3} /></tr>
              {choisies.length > 0 && (
                <tr className="tab-repere"><td /><td className="px-2 py-1.5">Sélection ({choisies.map(u => u.ue_num).join(', ')}) — étudiants distincts</td>
                  <td className="px-2 text-right">{dansChoix.size}</td><td className="px-2 text-right">{nNouveaux(dansChoix)}</td>
                  <td className="px-2 text-right">{nReprises(choisies)}</td>
                  <td className="px-2 text-right">{new Set(choisies.flatMap(u => u.vues.filter(l => l.partie === 'A').map(l => l.id))).size}</td>
                  <td className="px-2 text-right">{new Set(choisies.flatMap(u => u.vues.filter(l => l.partie === 'B').map(l => l.id))).size}</td>
                  <td className="px-2 text-right">{new Set(choisies.flatMap(u => u.vues.filter(l => l.partie === 'C').map(l => l.id))).size}</td></tr>)}
            </tfoot>
          </table>
        </div>
        <p className="text-[11px] text-slate-500">Un étudiant inscrit dans plusieurs unités compte une fois dans les totaux « étudiants distincts ».
          Reprise : déjà inscrit à cette unité une année précédente, sans l'avoir réussie.</p>

        {choisies.map(u => (
          <div key={u.ue_num} className="space-y-1">
            <h3 className="text-[15px] font-medium text-iip-blue">UE {u.ue_num} — {u.ue_nom}
              <span className="text-[12px] text-slate-500 font-normal"> · {u.vues.length} étudiant(s)</span></h3>
            <div className="overflow-x-auto">
              <table className="text-[13px] tabular-nums">
                <thead className="tab-entete"><tr>
                  <th className="text-left px-2 py-1.5 min-w-[14rem]">Étudiant</th><th className="px-2">Bloc</th>
                  <th className="text-left px-2">Profil</th><th className="px-2">Partie</th>
                  {u.cours.map(c => <th key={c.code} className="px-2 text-center max-w-[7rem]" title={c.nom}>
                    <div className="font-medium">{c.code}</div><div className="text-[10px] font-normal text-slate-500 truncate">{c.nom}</div></th>)}
                  <th className="text-left px-2">Mention</th>
                </tr></thead>
                <tbody>
                  {u.vues.map(l => { const e = E[l.id] || {}; return (
                    <tr key={l.id} className="border-b border-slate-200">
                      <td className="px-2 py-1"><button type="button" className="text-left hover:underline" onClick={() => setFiche(l.id)}>{e.nom}</button>
                        <span className="text-[11px] text-slate-400"> {e.matricule}</span></td>
                      <td className="px-2 text-center">{e.bloc || ''}</td>
                      <td className="px-2 text-[12px]">{[e.nouveau && 'nouveau', l.reprise && 'reprise', e.sle && 'SLE'].filter(Boolean).join(', ')}</td>
                      <td className={`px-2 text-center ${l.partie === 'C' ? 'text-amber-700 font-medium' : ''}`}>{l.partie}</td>
                      {u.cours.map(c => { const k = CASE[l.cours[c.code]]; return (
                        <td key={c.code} className="px-2 text-center">{k && <span title={k.titre} className={`inline-block min-w-[1.5rem] px-1 rounded text-[11px] ${k.c}`}>{k.t}</span>}</td>); })}
                      <td className="px-2 text-[12px] text-slate-600">{l.detail.join(' · ')}</td>
                    </tr>); })}
                </tbody>
                <tfoot className="font-medium"><tr className="tab-repere">
                  <td className="px-2 py-1.5" colSpan={4}>À suivre par cours</td>
                  {u.cours.map(c => <td key={c.code} className="px-2 text-center">{u.vues.filter(l => l.cours[c.code] === 'suit').length}</td>)}
                  <td /></tr></tfoot>
              </table>
            </div>
          </div>
        ))}
        {choisies.length > 0 && (
          <p className="text-[11px] text-slate-500">● suit le cours · R report de note (dispensé, note reprise) · VA valorisé · D dispense complète · — unité déjà acquise, inscription à retirer.</p>)}
      </>)}

      {fiche && <FicheEtudiant id={fiche} annee={annee} onClose={() => setFiche(null)} />}
      {/* LE REPORT DE NOTE MÈNE À LA REVUE DU PAE (7 octobre 2026 : « pour aller
          voir et éventuellement corriger ») ; la grille se relit en sortant. */}
      {revue && data?.etudiants?.[revue] && (
        <RevuePAE liste={[{ id: revue, nom: data.etudiants[revue].nom_famille, prenom: data.etudiants[revue].prenom, section, niveau: null }]}
          annee={annee} onClose={() => { setRevue(null); setRecharge(x => x + 1); }} />)}
    </div>
  );
}
