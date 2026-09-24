import { useCallback, useEffect, useMemo, useState } from 'react';
import { IconLayoutGrid, IconAlertTriangle, IconChecks } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import ImportTableauPlat from './ImportTableauPlat.jsx';
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
export default function ComposerPAE({ onClose, onTermine, onPassage, modeInitial = 'composer' }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [annee, setAnnee] = useState(getAnnee() || '');
  const [grille, setGrille] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [fNiveau, setFNiveau] = useState('');
  const [fSansUE, setFSansUE] = useState(false);
  const [q, setQ] = useState('');
  const [annees, setAnnees] = useState([]);
  const [attente, setAttente] = useState(() => new Map());   // `${e}|${u}` → 'ajout' | 'retrait'
  const [coches, setCoches] = useState(() => new Set());
  const [niveauBase, setNiveauBase] = useState('BA1');
  const [ueAjout, setUeAjout] = useState('');
  const [ueRetrait, setUeRetrait] = useState('');
  const [bilan, setBilan] = useState(null);                 // réponse de la simulation
  const [enCours, setEnCours] = useState(false);
  /* L'HISTORIQUE S'ENCODE ICI AUSSI (25 septembre 2026). Deux modes : composer
     le programme (les cases inscrit/retrait), ou encoder les résultats de
     l'année choisie — en COCHE (réussi vert / refusé rouge) ou en NOTE
     (>= 10 → réussi, sinon refusé). L'année du sélecteur fait foi : échoué en
     2024-2025 puis réussi en 2025-2026, c'est deux passages dans la grille. */
  const [mode, setMode] = useState(modeInitial);   // 'composer' | 'resultats' | 'valider'
  /* VALIDER LES PAE (Jérôme, 24 septembre 2026 : « tu les crées mais ils ne
     sont pas validés »). La promotion inscrit ; valider, c'est signer le
     programme tel qu'il est — par section, pour les étudiants cochés. */
  const [fStatut, setFStatut] = useState('a_valider'); // 'a_valider' | 'valides' | 'tous'
  const [valide, setValide] = useState(null);           // compte rendu de la dernière validation
  const [vueNote, setVueNote] = useState(false);
  const [fPrimo, setFPrimo] = useState(false);    // nouveaux inscrits seulement
  const [attRes, setAttRes] = useState(new Map()); // `${id}|${ue}` → { resultat, points }
  const [importHisto, setImportHisto] = useState(false);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code || a).sort()))
      .catch(() => {});
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => {
        const liste = Array.isArray(l) ? l : [];
        setSections(liste);
        if (liste.length === 1) setSection(liste[0].code);
      }).catch(() => {});
  }, []);

  const controle = mode === 'valider';
  const charger = useCallback(async () => {
    if (!section || !annee) { setGrille(null); return; }
    setErreur(null);
    // Le contrôle relit chaque programme : on ne le paie qu'en mode Valider.
    const r = await fetch(`/api/etudiants/pae-grille?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}${controle ? '&controle=1' : ''}`,
      { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Lecture refusée.'); setGrille(null); return; }
    setGrille(j); setAttente(new Map()); setAttRes(new Map()); setCoches(new Set()); setBilan(null);
  }, [section, annee, controle]);
  useEffect(() => { charger(); }, [charger]);

  const lignes = useMemo(() => (grille?.etudiants || []).filter(e =>
    (!fNiveau || (fNiveau === 'aucun' ? !e.niveau : e.niveau === fNiveau))
    && (!fSansUE || !Object.values(e.cases).some(c => c.inscrit))
    && (!fPrimo || e.primo)
    && (mode !== 'valider' || fStatut === 'tous'
      || (fStatut === 'valides' ? !!e.pae_confirme_le
        : !e.pae_confirme_le && Object.values(e.cases).some(c => c.inscrit)))
    && (!q.trim() || `${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase().includes(q.trim().toLowerCase()))),
  [grille, fNiveau, fSansUE, fPrimo, q, mode, fStatut]);

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

  // ── L'encodage des résultats de l'année choisie ────────────────────────────
  const etatRes = (e, u) => {
    const k = attRes.get(`${e.id}|${u}`);
    if (k) return { ...k, attente: true };
    const c = e.cases[u];
    return { resultat: c?.resultat || null, points: c?.points ?? null, attente: false };
  };
  const poserRes = (e, u, valeur) => {
    setAttRes(m0 => {
      const m = new Map(m0); const k = `${e.id}|${u}`;
      const c = e.cases[u];
      const identique = valeur.resultat === (c?.resultat || null)
        && (valeur.points ?? null) === (c?.points ?? null);
      if (identique) m.delete(k); else m.set(k, valeur);
      return m;
    });
  };
  // La coche cycle : rien → réussi → refusé → effacé.
  const cyclerRes = (e, u) => {
    const x = etatRes(e, u.ue_num);
    const suivant = x.resultat === null ? 'reussi' : x.resultat === 'reussi' ? 'refuse' : null;
    poserRes(e, u.ue_num, { resultat: suivant, points: null });
  };
  // La note décide : >= 10 réussi, sinon refusé ; vidée, elle efface tout.
  const noterRes = (e, u, brut) => {
    const t = String(brut).replace(',', '.').trim();
    if (t === '') { poserRes(e, u, { resultat: null, points: null }); return; }
    const n = Number(t);
    if (!Number.isFinite(n) || n < 0 || n > 20) return;
    poserRes(e, u, { resultat: n >= 10 ? 'reussi' : 'refuse', points: n });
  };

  async function envoyerResultats() {
    if (!attRes.size) return;
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/etudiants/pae-resultats', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          annee,
          resultats: [...attRes].map(([k, v]) => {
            const [etudiant_id, ue_num] = k.split('|').map(Number);
            return { etudiant_id, ue_num, resultat: v.resultat, points: v.points };
          }),
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      await charger(); onTermine?.();
      setBilan({ fait: true, resultats: true, ecrits: j.ecrits, effaces: j.effaces });
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  // UNE SEULE ALERTE : une UE inscrite que les prérequis n'ouvrent pas. Une UE
  // ouverte mais non prise n'en est pas une — en enseignement pour adultes,
  // beaucoup suivent moins que ce qui leur est ouvert, et c'est voulu. Elle s'affiche, elle ne retient pas la validation.
  const alertes = e => e.controle?.hors_proposition?.length || 0;
  const possibles = e => e.controle?.manquantes?.length || 0;
  const vide = e => !Object.values(e.cases).some(c => c.inscrit);

  async function valider(retirer = false) {
    const ids = choisis.map(e => e.id);
    if (!ids.length) return;
    if (retirer && !window.confirm(`Retirer la validation de ${ids.length} PAE ? Les inscriptions ne changent pas.`)) return;
    setEnCours(true); setErreur(null); setValide(null);
    try {
      const r = await fetch('/api/etudiants/pae-valider-lot', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ section, annee, etudiants: ids, retirer }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      await charger(); onTermine?.();
      setValide({ retirer, faits: j.faits, ignores: j.ignores || [] });
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

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
      titre={mode === 'valider' ? 'Valider les PAE' : 'Composer les PAE'}
      sous={mode === 'valider'
        ? 'Par section : chaque programme, ses alertes, et sa validation — pour un, pour quelques-uns, pour tous'
        : 'Une ligne par étudiant, une colonne par UE de la section — pour un, pour quelques-uns, pour tous'}
      pied={<>
        {mode === 'resultats' && attRes.size > 0 && (
          <>
            <button className="bouton bouton-fort" disabled={enCours} onClick={envoyerResultats}>
              Enregistrer {attRes.size} résultat(s) — {annee}
            </button>
            <button className="bouton" onClick={() => setAttRes(new Map())}>Annuler</button>
          </>
        )}
        {mode === 'composer' && attente.size > 0 && (
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
        {mode === 'valider' && (
          <>
            <button className="bouton bouton-fort" disabled={enCours || !choisis.length} onClick={() => valider(false)}>
              <IconChecks size={14} /> Valider {choisis.length || ''} PAE
            </button>
            <button className="bouton" disabled={enCours || !choisis.some(e => e.pae_confirme_le)}
              onClick={() => valider(true)}>
              Retirer la validation
            </button>
          </>
        )}
        <span className="text-[12px] text-slate-500 min-w-0">
          {mode === 'valider' && valide
            ? `${valide.retirer ? 'Validation retirée' : 'Validé'} : ${valide.faits} PAE${valide.ignores.length
              ? ` · ${valide.ignores.length} ignoré(s) (${[...new Set(valide.ignores.map(x => x.raison))].join(', ')})` : ''}.`
          : bilan?.fait && bilan.resultats
            ? `Enregistré pour ${annee} : ${bilan.ecrits} résultat(s)${bilan.effaces ? `, ${bilan.effaces} effacé(s)` : ''}.`
          : bilan?.fait ? `Enregistré : ${bilan.ajoutes} ajout(s), ${bilan.retires} retrait(s).`
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
          <select value={annee} onChange={e => setAnnee(e.target.value)} className="controle text-[13px]"
            title="Année du programme">
            {[...new Set([...annees, annee])].filter(Boolean).sort().map(a => <option key={a} value={a}>{a}</option>)}
          </select>
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
          <label className="flex items-center gap-1.5 text-[13px] text-slate-600"
            title="Aucune inscription ni valorisation dans une année antérieure">
            <input type="checkbox" checked={fPrimo} onChange={e => setFPrimo(e.target.checked)} />
            Nouveaux inscrits
          </label>
          <span className="ml-auto inline-flex rounded-champ border border-slate-300 overflow-hidden">
            <button onClick={() => setMode('composer')}
              className={`px-3 py-1.5 text-[12.5px] font-semibold ${mode === 'composer'
                ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>
              Composer
            </button>
            <button onClick={() => setMode('resultats')}
              title="Encoder les résultats de l'année choisie : réussi/refusé ou note"
              className={`px-3 py-1.5 text-[12.5px] font-semibold border-l border-slate-300 ${mode === 'resultats'
                ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>
              Encoder l'historique
            </button>
            <button onClick={() => { setMode('valider'); setCoches(new Set()); }}
              title="Relire et valider les programmes composés"
              className={`px-3 py-1.5 text-[12.5px] font-semibold border-l border-slate-300 ${mode === 'valider'
                ? 'bg-iip-blue text-white' : 'bg-white text-slate-600'}`}>
              Valider
            </button>
          </span>
        </div>

        {grille && mode === 'resultats' && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] rounded-carte border border-slate-200 px-3 py-2">
            <b className="text-iip-blue">Résultats de {annee}</b>
            <span className="inline-flex rounded-champ border border-slate-300 overflow-hidden">
              <button onClick={() => setVueNote(false)}
                className={`px-2.5 py-1 text-[12px] font-semibold ${!vueNote ? 'bg-iip-turquoise text-white' : 'bg-white text-slate-600'}`}>
                Coche
              </button>
              <button onClick={() => setVueNote(true)}
                className={`px-2.5 py-1 text-[12px] font-semibold border-l border-slate-300 ${vueNote ? 'bg-iip-turquoise text-white' : 'bg-white text-slate-600'}`}>
                Note
              </button>
            </span>
            <span className="text-slate-500">
              {vueNote
                ? 'Une note ≥ 10 pose la réussite, < 10 le refus ; vidée, elle efface.'
                : 'Un clic : réussi (vert) → refusé (rouge) → effacé. Sur une case vide, il inscrit aussi.'}
            </span>
            <button className="bouton ml-auto" onClick={() => setImportHisto(true)}
              title="Reprendre un tableau Excel — une ligne par étudiant, unité et décision — pour cette année">
              Importer un historique (Excel)…
            </button>
          </div>
        )}

        {grille && mode === 'valider' && (
          <div className="flex flex-wrap items-center gap-2 text-[13px] rounded-carte border border-slate-200 px-3 py-2">
            <span className="inline-flex rounded-champ border border-slate-300 overflow-hidden">
              {[['a_valider', 'À valider'], ['valides', 'Validés'], ['tous', 'Tous']].map(([v, l], i) => (
                <button key={v} onClick={() => { setFStatut(v); setCoches(new Set()); }}
                  className={`px-2.5 py-1 text-[12px] font-semibold ${i ? 'border-l border-slate-300' : ''} ${fStatut === v
                    ? 'bg-iip-turquoise text-white' : 'bg-white text-slate-600'}`}>
                  {l} ({(grille.etudiants || []).filter(e => v === 'tous' || (v === 'valides'
                    ? !!e.pae_confirme_le : !e.pae_confirme_le && !vide(e))).length})
                </button>
              ))}
            </span>
            <b className="text-iip-blue">{choisis.length} coché(s)</b>
            <button className="bouton" onClick={() => setCoches(new Set(lignes
              .filter(e => !e.pae_confirme_le && !vide(e) && !alertes(e)).map(e => e.id)))}
              title="Les programmes que rien ne signale : ils peuvent se valider tels quels">
              Cocher les PAE sans alerte
            </button>
            <span className="text-slate-500">
              Valider signe le programme tel qu'il est : aucune inscription ne change.
              <span className="inline-block w-3 h-3 rounded-[3px] bg-[#1B2B4B] ring-2 ring-amber-400 align-middle mx-1" />
              inscrite sans les prérequis ·
              <span className="inline-block w-3 h-3 rounded-[3px] border-2 border-dashed border-slate-400 align-middle mx-1" />
              ouverte, non prise
            </span>
          </div>
        )}

        {grille && mode === 'composer' && (
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
        {grille?.source === 'referentiel-autre-annee' && (
          <p className="text-[12px] text-[#B45309]">
            Le référentiel ne couvre pas {annee} : les colonnes viennent des autres années — c’est
            ce qui permet d’y encoder un historique.
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
                      {e.primo && <span className="ml-1.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-iip-turquoise/10 text-iip-turquoise-dark align-middle"
                        title="Nouvel inscrit : aucune trace dans une année antérieure">primo</span>}
                      {mode === 'valider' && (e.pae_confirme_le ? (
                        <span className="ml-1.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 align-middle"
                          title={`Validé le ${e.pae_confirme_le}${e.pae_confirme_par ? ` par ${e.pae_confirme_par}` : ''}`}>
                          validé {e.pae_confirme_le.slice(8, 10)}/{e.pae_confirme_le.slice(5, 7)}
                        </span>
                      ) : vide(e) ? (
                        <span className="ml-1.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-slate-100 text-slate-500 align-middle">
                          aucune UE
                        </span>
                      ) : (
                        <span className="ml-1.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-800 align-middle">
                          à valider
                        </span>
                      ))}
                      {mode === 'valider' && alertes(e) > 0 && (
                        <span className="ml-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-amber-50 border border-amber-300 text-amber-800 align-middle"
                          title={`Inscrit sans les prérequis : UE ${e.controle.hors_proposition.join(', ')}`}>
                          <IconAlertTriangle size={10} className="inline -mt-0.5" /> {alertes(e)} sans prérequis
                        </span>
                      )}
                      {mode === 'valider' && possibles(e) > 0 && (
                        <span className="ml-1 text-[9.5px] px-1.5 py-0.5 rounded-full bg-slate-50 border border-slate-200 text-slate-500 align-middle"
                          title={`Ouvertes par les prérequis, non prises : UE ${e.controle.manquantes.join(', ')}`}>
                          +{possibles(e)} possible{possibles(e) > 1 ? 's' : ''}
                        </span>
                      )}
                    </td>
                    {ues.map(u => {
                      const x = etat(e, u.ue_num);
                      if (mode === 'valider') {
                        // Lecture seule : on signe ce qui est, on ne le change pas ici.
                        const hors = e.controle?.hors_proposition?.includes(u.ue_num);
                        const manque = e.controle?.manquantes?.includes(u.ue_num);
                        return (
                          <td key={u.ue_num} className="text-center px-1 py-1 bg-white border-l border-slate-100">
                            {x.va ? <span className="text-[10px] text-violet-700 font-semibold" title="Valorisation">VA</span>
                              : x.inscrit
                                ? <span title={hors ? 'Inscrit sans les prérequis (aucune dérogation posée)' : (x.resultat || 'inscrit')}
                                    className={`inline-block w-3.5 h-3.5 rounded-[3px] ${x.resultat === 'reussi' ? 'bg-emerald-600' : 'bg-[#1B2B4B]'} ${hors ? 'ring-2 ring-amber-400' : ''}`} />
                                : manque
                                  ? <span title="Ouverte par les prérequis, non prise"
                                      className="inline-block w-3.5 h-3.5 rounded-[3px] border-2 border-dashed border-slate-400" />
                                  : <span className="inline-block w-3.5 h-3.5 rounded-[3px] border border-slate-200" />}
                          </td>
                        );
                      }
                      if (mode === 'resultats') {
                        /* Les résultats de L'ANNÉE CHOISIE : coche qui cycle
                           (réussi → refusé → effacé) ou note qui décide. Une
                           VA ne se touche pas ici non plus. */
                        if (x.va) {
                          return (
                            <td key={u.ue_num} className="text-center px-1 py-1 bg-white border-l border-slate-100">
                              <span className="text-[10px] text-violet-700 font-semibold" title="Valorisation">VA</span>
                            </td>
                          );
                        }
                        const rx = etatRes(e, u.ue_num);
                        if (vueNote) {
                          return (
                            <td key={u.ue_num} className="text-center px-0.5 py-0.5 bg-white border-l border-slate-100">
                              <input value={rx.points ?? ''} inputMode="decimal"
                                onChange={ev => noterRes(e, u.ue_num, ev.target.value)}
                                placeholder={x.inscrit ? '·' : ''}
                                className={`w-10 text-center text-[12px] border rounded px-0.5 py-0.5 tabular-nums
                                  ${rx.resultat === 'reussi' ? 'border-emerald-400 text-emerald-700'
                                    : rx.resultat === 'refuse' ? 'border-rose-400 text-rose-700'
                                    : 'border-slate-200 text-slate-600'}
                                  ${rx.attente ? 'ring-2 ring-iip-turquoise/30' : ''}`} />
                            </td>
                          );
                        }
                        return (
                          <td key={u.ue_num} onClick={() => cyclerRes(e, u)}
                            className="text-center px-1 py-1 bg-white border-l border-slate-100 cursor-pointer hover:bg-slate-50">
                            {rx.resultat === 'reussi'
                              ? <span title={`réussi${rx.points != null ? ` · ${rx.points}` : ''}`}
                                  className={`inline-grid place-items-center w-3.5 h-3.5 rounded-[3px] bg-emerald-600 text-white text-[10px] leading-none ${rx.attente ? 'ring-2 ring-iip-turquoise/30' : ''}`}>✓</span>
                              : rx.resultat === 'refuse'
                                ? <span title={`refusé${rx.points != null ? ` · ${rx.points}` : ''}`}
                                    className={`inline-grid place-items-center w-3.5 h-3.5 rounded-[3px] bg-rose-600 text-white text-[10px] leading-none ${rx.attente ? 'ring-2 ring-iip-turquoise/30' : ''}`}>✗</span>
                                : x.inscrit
                                  ? <span title="inscrit — sans résultat" className={`inline-block w-3.5 h-3.5 rounded-[3px] bg-[#1B2B4B]/30 ${rx.attente ? 'ring-2 ring-iip-turquoise/30' : ''}`} />
                                  : <span className={`inline-block w-3.5 h-3.5 rounded-[3px] border border-dashed border-slate-300 ${rx.attente ? 'ring-2 ring-iip-turquoise/30' : ''}`} />}
                          </td>
                        );
                      }
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

      {importHisto && (
        <ImportTableauPlat annee={annee} onClose={() => setImportHisto(false)}
          onFini={() => { setImportHisto(false); charger(); }} />
      )}
    </Fenetre>
  );
}
