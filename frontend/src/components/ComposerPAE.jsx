import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconLayoutGrid, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

/**
 * COMPOSER LES PAE — voir, revoir, changer, créer, pour un ou pour cent.
 *
 * Demandé par Charles le 21 septembre 2026 : « c'est plus vaste que le passage
 * d'une année à l'autre. Un module qui permet de composer, de manière
 * automatique ou semi-automatique, les PAE ; de donner un PAE de base à des
 * étudiants en un coup ; de supprimer une UE choisie dans une liste. Un outil
 * qui doit permettre de rapidement voir, revoir, changer, modifier et créer un
 * PAE pour un, des étudiants. »
 *
 * Quatre outils existaient, chacun dans son coin — la composition de la
 * section (Organisation), le lot (visible seulement quand on avait coché des
 * étudiants), le passage d'année, la fiche. Ils se rejoignent ici, sur UNE
 * grille : une ligne par étudiant, une colonne par UE de la section.
 *
 * RIEN NE S'ÉCRIT EN COCHANT : chaque geste — une case, un PAE de base, une UE
 * ajoutée ou retirée pour les étudiants cochés — s'ajoute à une liste de
 * changements EN ATTENTE, visibles en couleur. « Vérifier » simule et montre
 * ce qui sera refusé (un résultat encodé, des notes déjà saisies) ;
 * « Enregistrer » écrit, tout ou rien.
 */
export default function ComposerPAE({ onClose, onTermine, onPassage }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [annee, setAnnee] = useState(getAnnee() || '');
  const [grille, setGrille] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [fNiveau, setFNiveau] = useState('');
  const [fSansUE, setFSansUE] = useState(false);
  const [q, setQ] = useState('');
  const [attente, setAttente] = useState(() => new Map());   // `${e}|${u}` → 'ajout' | 'retrait'
  const [coches, setCoches] = useState(() => new Set());
  const [niveauBase, setNiveauBase] = useState('BA1');
  const [ueAjout, setUeAjout] = useState('');
  const [ueRetrait, setUeRetrait] = useState('');
  const [bilan, setBilan] = useState(null);                 // réponse de la simulation
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => {
        const liste = Array.isArray(l) ? l : [];
        setSections(liste);
        if (liste.length === 1) setSection(liste[0].code);
      }).catch(() => {});
  }, []);

  const charger = useCallback(async () => {
    if (!section || !annee) { setGrille(null); return; }
    setErreur(null);
    const r = await fetch(`/api/etudiants/pae-grille?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Lecture refusée.'); setGrille(null); return; }
    setGrille(j); setAttente(new Map()); setCoches(new Set()); setBilan(null);
  }, [section, annee]);
  useEffect(() => { charger(); }, [charger]);

  const lignes = useMemo(() => (grille?.etudiants || []).filter(e =>
    (!fNiveau || (fNiveau === 'aucun' ? !e.niveau : e.niveau === fNiveau))
    && (!fSansUE || !Object.values(e.cases).some(c => c.inscrit))
    && (!q.trim() || `${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase().includes(q.trim().toLowerCase()))),
  [grille, fNiveau, fSansUE, q]);

  const ues = grille?.ues || [];
  const inscritsPar = useMemo(() => {
    const m = {};
    for (const u of ues) m[u.ue_num] = lignes.filter(e => e.cases[u.ue_num]?.inscrit).length;
    return m;
  }, [ues, lignes]);

  // ── Les changements en attente ─────────────────────────────────────────────
  const etat = (e, u) => {
    const c = e.cases[u];
    const k = attente.get(`${e.id}|${u}`);
    return { inscrit: !!c?.inscrit, va: c?.va, resultat: c?.resultat, attente: k };
  };
  const poser = (paires, nature) => setAttente(m0 => {
    const m = new Map(m0);
    for (const [e, u] of paires) {
      const cle = `${e.id}|${u}`;
      const inscrit = !!e.cases[u]?.inscrit;
      if (nature === 'ajout' && !inscrit) m.set(cle, 'ajout');
      if (nature === 'retrait' && inscrit) m.set(cle, 'retrait');
    }
    return m;
  });
  const basculerCase = (e, u) => {
    const x = etat(e, u.ue_num);
    if (x.va) return;
    setAttente(m0 => {
      const m = new Map(m0); const cle = `${e.id}|${u.ue_num}`;
      if (m.has(cle)) m.delete(cle); else m.set(cle, x.inscrit ? 'retrait' : 'ajout');
      return m;
    });
    setBilan(null);
  };
  const choisis = lignes.filter(e => coches.has(e.id));
  const uesPresentes = ues.filter(u => choisis.some(e => e.cases[u.ue_num]?.inscrit));
  const nbAjouts = [...attente.values()].filter(v => v === 'ajout').length;
  const nbRetraits = attente.size - nbAjouts;

  const donnerBase = () => {
    const cibles = ues.filter(u => niveauBase === 'tout' || String(u.ue_niv || '').toUpperCase() === niveauBase);
    poser(choisis.flatMap(e => cibles.map(u => [e, u.ue_num])), 'ajout'); setBilan(null);
  };

  async function envoyer(simulation) {
    setEnCours(true); setErreur(null);
    const ajouts = [], retraits = [];
    for (const [cle, v] of attente) {
      const [etudiant_id, ue_num] = cle.split('|').map(Number);
      (v === 'ajout' ? ajouts : retraits).push({ etudiant_id, ue_num });
    }
    try {
      const r = await fetch('/api/etudiants/pae-modifier', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ annee, ajouts, retraits, simulation }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      if (simulation) setBilan(j);
      else { await charger(); onTermine?.(); setBilan({ ...j, fait: true }); }
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  return (
    <Fenetre icone={IconLayoutGrid} large="grande" onFermer={onClose}
      titre="Composer les PAE"
      sous="Une ligne par étudiant, une colonne par UE de la section — pour un, pour quelques-uns, pour tous"
      pied={<>
        {attente.size > 0 && (
          <>
            {!bilan ? (
              <button className="bouton bouton-fort" disabled={enCours} onClick={() => envoyer(true)}>
                Vérifier {attente.size} changement(s)
              </button>
            ) : !bilan.fait ? (
              <button className="bouton bouton-fort" disabled={enCours} onClick={() => envoyer(false)}>
                Enregistrer — {bilan.ajoutes} ajout(s), {bilan.retires} retrait(s)
              </button>
            ) : null}
            <button className="bouton" onClick={() => { setAttente(new Map()); setBilan(null); }}>
              Annuler les changements
            </button>
          </>
        )}
        <span className="text-[12px] text-slate-500 min-w-0">
          {bilan?.fait ? `Enregistré : ${bilan.ajoutes} ajout(s), ${bilan.retires} retrait(s).`
            : attente.size ? `En attente : ${nbAjouts} ajout(s), ${nbRetraits} retrait(s) — rien n’est encore écrit.`
              : grille ? `${lignes.length} étudiant(s) affiché(s) sur ${grille.etudiants.length} · ${ues.length} UE`
                : 'Choisissez une section.'}
        </span>
        {onPassage && (
          <button className="bouton ml-auto" onClick={onPassage}
            title="Proposer automatiquement le programme de l'année suivante, d'après les résultats">
            Passage à l’année suivante…
          </button>
        )}
        <button className={`bouton ${onPassage ? '' : 'ml-auto'}`} onClick={onClose}>Fermer</button>
      </>}>
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <select value={section} onChange={e => setSection(e.target.value)} className="controle text-[13px]">
            <option value="">— section —</option>
            {sections.map(s0 => <option key={s0.code} value={s0.code}>{s0.libelle || s0.code}</option>)}
          </select>
          <input value={annee} onChange={e => setAnnee(e.target.value)} className="controle text-[13px] w-28"
            title="Année du programme" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Filtrer — nom ou matricule"
            className="controle text-[13px] w-56" />
          <select value={fNiveau} onChange={e => setFNiveau(e.target.value)} className="controle text-[13px]">
            <option value="">Tous les niveaux</option>
            <option value="BA1">BA1</option><option value="BA2">BA2</option><option value="BA3">BA3</option>
            <option value="MIXTE">Parcours mixte</option><option value="aucun">Sans niveau</option>
          </select>
          <label className="flex items-center gap-1.5 text-[13px] text-slate-600">
            <input type="checkbox" checked={fSansUE} onChange={e => setFSansUE(e.target.checked)} />
            Sans aucune UE de la section
          </label>
        </div>

        {grille && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] rounded-carte border border-slate-200 px-3 py-2">
            <b className="text-iip-blue">{choisis.length} étudiant(s) coché(s)</b>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600">PAE de base</span>
            <select value={niveauBase} onChange={e => setNiveauBase(e.target.value)} className="controle text-[13px]">
              <option value="BA1">UE de BA1</option><option value="BA2">UE de BA2</option>
              <option value="BA3">UE de BA3</option><option value="tout">Toute la composition</option>
            </select>
            <button className="bouton" disabled={!choisis.length} onClick={donnerBase}>Donner</button>
            <span className="text-slate-300">|</span>
            <select value={ueAjout} onChange={e => setUeAjout(e.target.value)} className="controle text-[13px]">
              <option value="">Ajouter l’UE…</option>
              {ues.map(u => <option key={u.ue_num} value={u.ue_num}>{u.ue_num} — {u.ue_nom}</option>)}
            </select>
            <button className="bouton" disabled={!choisis.length || !ueAjout}
              onClick={() => { poser(choisis.map(e => [e, Number(ueAjout)]), 'ajout'); setBilan(null); }}>Ajouter</button>
            <span className="text-slate-300">|</span>
            <select value={ueRetrait} onChange={e => setUeRetrait(e.target.value)} className="controle text-[13px]">
              <option value="">Retirer l’UE…</option>
              {uesPresentes.map(u => <option key={u.ue_num} value={u.ue_num}>{u.ue_num} — {u.ue_nom}</option>)}
            </select>
            <button className="bouton" disabled={!choisis.length || !ueRetrait}
              onClick={() => { poser(choisis.map(e => [e, Number(ueRetrait)]), 'retrait'); setBilan(null); }}>Retirer</button>
          </div>
        )}

        {bilan && !bilan.fait && (
          <div className="carte p-2.5 text-[12px]" style={{ borderLeftWidth: 3, borderLeftColor: bilan.proteges.length ? '#B45309' : '#1B2B4B' }}>
            <b>Vérification — rien n’est écrit :</b> {bilan.ajoutes} ajout(s), {bilan.retires} retrait(s)
            {bilan.deja ? `, ${bilan.deja} déjà inscrit(s)` : ''}.
            {bilan.proteges.length > 0 && (
              <div className="mt-1 text-slate-700">
                Non retirés, et c’est voulu : {bilan.proteges.map(p => `${p.etudiant} — UE ${p.ue_num} (${p.pourquoi})`).join(' · ')}
              </div>
            )}
          </div>
        )}

        {erreur && (
          <div className="carte p-3 text-[12px] text-rose-700 flex items-start gap-1.5">
            <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
          </div>
        )}
        {grille?.source === 'referentiel' && (
          <p className="text-[12px] text-[#B45309]">
            Cette section n’a pas de composition déclarée pour {annee} : les colonnes sont les UE rangées sous elle
            au référentiel.
          </p>
        )}

        {grille && (
          <div className="overflow-auto max-h-[62vh] rounded-carte border border-slate-200">
            <table className="text-[12px] border-collapse">
              <thead className="sticky top-0 z-10">
                <tr className="tab-entete">
                  <th className="sticky left-0 z-20 bg-[#EEF1F6] text-left px-3 py-1.5 min-w-[16rem]">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" checked={lignes.length > 0 && lignes.every(e => coches.has(e.id))}
                        onChange={() => setCoches(c => {
                          const tous = lignes.every(e => c.has(e.id)); const n = new Set(c);
                          for (const e of lignes) tous ? n.delete(e.id) : n.add(e.id); return n;
                        })} />
                      Étudiant
                    </label>
                  </th>
                  {ues.map(u => (
                    <th key={u.ue_num} className="px-1.5 py-1.5 text-center align-bottom min-w-[3.4rem]"
                      title={`${u.ue_num} — ${u.ue_nom || ''}`}>
                      <div className="text-[10px] text-slate-500 font-normal">{u.ue_niv || ''}</div>
                      <div>{u.ue_num}</div>
                      <div className="text-[10px] text-slate-400 font-normal tabular-nums">{inscritsPar[u.ue_num]}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map(e => (
                  <tr key={e.id} className="border-t border-slate-100">
                    <td className="sticky left-0 bg-white px-3 py-1 whitespace-nowrap">
                      <input type="checkbox" className="mr-2 align-middle" checked={coches.has(e.id)}
                        onChange={() => setCoches(c => { const n = new Set(c); n.has(e.id) ? n.delete(e.id) : n.add(e.id); return n; })} />
                      <b>{(e.nom || '').toUpperCase()}</b> {e.prenom}
                      <span className="text-slate-400"> · {e.id_ecampus || '—'}</span>
                      {e.niveau && <span className="text-[10px] text-slate-500"> · {e.niveau}</span>}
                    </td>
                    {ues.map(u => {
                      const x = etat(e, u.ue_num);
                      /* L'état se lit d'un coup d'œil : plein = inscrit, vert = réussi,
                         contour turquoise pointillé = ajout en attente, croix brique =
                         retrait en attente. Un clic bascule ; une VA ne se touche pas ici. */
                      return (
                        <td key={u.ue_num} onClick={() => basculerCase(e, u)}
                          className={`text-center px-1 py-1 bg-white border-l border-slate-100 ${x.va ? '' : 'cursor-pointer hover:bg-slate-50'}`}>
                          {x.va ? <span className="text-[10px] text-violet-700 font-semibold" title="Valorisation">VA</span>
                            : x.attente === 'ajout'
                              ? <span title="Ajout en attente" className="inline-block w-3.5 h-3.5 rounded-[3px] border-2 border-dashed border-[#1a9aa0] bg-[#1a9aa0]/20" />
                              : x.attente === 'retrait'
                                ? <span title="Retrait en attente" className="inline-grid place-items-center w-3.5 h-3.5 rounded-[3px] bg-[#9D4A38] text-white text-[10px] leading-none">×</span>
                                : x.inscrit
                                  ? <span title={x.resultat || 'inscrit'} className={`inline-block w-3.5 h-3.5 rounded-[3px] ${x.resultat === 'reussi' ? 'bg-emerald-600' : 'bg-[#1B2B4B]'}`} />
                                  : <span className="inline-block w-3.5 h-3.5 rounded-[3px] border border-slate-300" />}
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {!lignes.length && (
                  <tr><td colSpan={ues.length + 1} className="px-3 py-4 text-slate-500 bg-white">
                    Aucun étudiant ne correspond.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </Fenetre>
  );
}
