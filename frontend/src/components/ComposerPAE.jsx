import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { IconLayoutGrid, IconAlertTriangle, IconChecks, IconLock } from '@tabler/icons-react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
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
/* LA CASE DE LA GRILLE — UN SEUL DESSIN POUR LES TROIS MODES (Charles,
   28 septembre 2026). Ce qui est ou a été inscrit l'année composée se
   distingue de ce qui vient d'avant :
     ✓ vert seul          réussie une année antérieure
     case verte ✓         inscrite et réussie cette année
     case à bord bleu, i  inscrite cette année, sans résultat
     case orange clair …  ajournée cette année — la seconde session décidera
     case brique ×        refusée cette année
     coin brique          échouée une année antérieure (refus ou ajournement
                          non repris), et pas réussie depuis
   En composition : + bleu pointillé = ajout en attente, − brique pointillé =
   retrait en attente. `anneau` superpose un contrôle (mode Valider). */
const T_CASE = 16;
const COUL = { vert: '#3E7D5E', bleu: '#2F6FB0', brique: '#9D4A38', orange: '#F2C27E', brun: '#6B3B05' };
const court = a => String(a || '').replace(/^20(\d\d)-20(\d\d)$/, '$1-$2');
export function CasePAE({ x = {}, resultat, attente = null, anneau = null, titre = null, contenu = null }) {
  const res = resultat !== undefined ? resultat : x.resultat;
  const base = { width: T_CASE, height: T_CASE, borderRadius: 4, boxSizing: 'border-box', position: 'relative',
    overflow: 'hidden', display: 'inline-grid', placeItems: 'center', fontSize: 11, lineHeight: 1, fontWeight: 600,
    verticalAlign: 'middle' };
  let style, glyphe = null, dit;
  if (attente === 'ajout') {
    style = { ...base, border: `1.5px dashed ${COUL.bleu}`, color: COUL.bleu }; glyphe = '+'; dit = 'ajout en attente';
  } else if (attente === 'retrait') {
    style = { ...base, border: `1.5px dashed ${COUL.brique}`, color: COUL.brique }; glyphe = '−'; dit = 'retrait en attente';
  } else if (x.acquise && !x.inscrit) {
    return (
      <span title={titre || `Réussie en ${x.acquise.annee}${x.acquise.va ? ' (valorisation)' : x.acquise.note != null ? ` · ${x.acquise.note}/20` : ''}`}
        aria-label={`réussie en ${court(x.acquise.annee)}`}
        style={{ color: COUL.vert, fontSize: 15, fontWeight: 700, lineHeight: 1, display: 'inline-block', width: T_CASE, textAlign: 'center' }}>✓</span>
    );
  } else if (x.inscrit && res === 'reussi') {
    style = { ...base, background: COUL.vert, color: '#fff' }; glyphe = '✓'; dit = 'réussie cette année';
  } else if (x.inscrit && res === 'ajourne') {
    style = { ...base, background: COUL.orange, color: COUL.brun }; glyphe = '…'; dit = 'ajournée cette année — seconde session en attente';
  } else if (x.inscrit && res === 'refuse') {
    style = { ...base, background: COUL.brique, color: '#fff' }; glyphe = '×'; dit = 'refusée cette année';
  } else if (x.inscrit) {
    style = { ...base, border: `1.5px solid ${COUL.bleu}`, background: '#fff', color: COUL.bleu,
      fontFamily: 'Georgia, serif', fontStyle: 'italic', fontWeight: 700 };
    glyphe = 'i'; dit = res === 'absent' ? 'inscrite cette année — absent' : 'inscrite cette année';
  } else {
    style = { ...base, border: '1.5px solid #CBD2DC', background: '#fff' }; dit = 'pas prise';
  }
  if (anneau) style = { ...style, boxShadow: `0 0 0 2px ${anneau}` , overflow: 'visible' };
  const echec = x.echec && !x.acquise ? x.echec : null;
  const dEchec = echec ? ` · ${echec.resultat === 'refuse' ? 'refusée' : 'ajournée'} en ${echec.annee}` : '';
  return (
    <span title={titre || (dit + dEchec)} style={style}>
      {contenu ?? glyphe}
      {echec && <span aria-hidden="true" style={{ position: 'absolute', top: -1.5, left: -1.5, width: 0, height: 0,
        borderTop: `9px solid ${COUL.brique}`, borderRight: '9px solid transparent', borderTopLeftRadius: 4 }} />}
    </span>
  );
}

export default function ComposerPAE({ onClose, onTermine, onPassage, modeInitial = 'composer', preselection = null }) {
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
  // Les étudiants cochés dans la liste arrivent cochés ici — une seule fois, au
  // premier chargement : la liste et la grille ne sont plus deux portes vers
  // deux fenêtres différentes (Charles, 26 septembre 2026).
  const preselRestante = useRef(preselection?.length ? new Set(preselection) : null);
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
  // Des unités d'une AUTRE section que celle du dossier : il faut le vouloir.
  const [autreConfirme, setAutreConfirme] = useState(false);
  const [motifLot, setMotifLot] = useState('');   // motif des dérogations du lot

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
    setGrille(j); setAttente(new Map()); setAttRes(new Map()); setBilan(null);
    if (preselRestante.current) {
      const ids = new Set((j.etudiants || []).map(e => e.id).filter(id => preselRestante.current.has(id)));
      setCoches(ids);
      if (ids.size) preselRestante.current = null;
    } else setCoches(new Set());
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
    return { inscrit: !!c?.inscrit, va: c?.va, resultat: c?.resultat, attente: k, acquise: c?.acquise || null,
      echec: c?.echec || null };
  };
  const poser = (paires, nature) => setAttente(m0 => {
    const m = new Map(m0);
    for (const [e, u] of paires) {
      const cle = `${e.id}|${u}`;
      const inscrit = !!e.cases[u]?.inscrit;
      // Une unité réussie ou valorisée ne revient pas au programme d'un clic
      // collectif : la réinscription se force, une à une.
      if (nature === 'ajout' && !inscrit && !e.cases[u]?.acquise && !e.cases[u]?.va) m.set(cle, 'ajout');
      if (nature === 'retrait' && inscrit) m.set(cle, 'retrait');
    }
    return m;
  });
  const basculerCase = (e, u) => {
    const x = etat(e, u.ue_num);
    if (x.va) return;
    // Déjà réussie : un clic ne la remet pas au programme. La réinscription se
    // FORCE, par la direction ou la coordination (mode Valider), et se trace.
    if (x.acquise && !x.inscrit && !attente.has(`${e.id}|${u.ue_num}`)) return;
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
  /* UNE UE DÉJÀ RÉUSSIE, RÉINSCRITE SANS QUE PERSONNE L'AIT FORCÉ (Charles,
     25 septembre 2026). Ce n'est pas une alerte qu'on lit et qu'on signe :
     le serveur refuse la validation tant qu'elle reste. La direction ou la
     coordination peut la forcer (clic sur la case), sinon elle se retire. */
  const reprises = e => e.controle?.deja_reussies?.length || 0;
  /* LE CADENAS : une UE proposée sous condition d'un prérequis dont le
     résultat de l'an dernier n'est pas tombé (la 262 attend la 261). C'est une
     information, pas une faute. Réinscrire le prérequis lui-même, en revanche,
     est une erreur : sa seconde session n'est pas délibérée. */
  const cadenasDe = (e, ue) => (e.controle?.cadenas || []).find(c => c.ue === ue)?.si || null;
  const enAttente = e => e.controle?.en_attente?.length || 0;
  const peutForcer = ['admin', 'directeur', 'directeur_adjoint', 'coordination', 'editeur']
    .includes(getUser?.()?.role);
  const nbReprises = (grille?.etudiants || []).reduce((n, e) => n + reprises(e), 0);

  async function forcer(e, ue) {
    if (!window.confirm(`${(e.nom || '').toUpperCase()} ${e.prenom} a déjà réussi l'UE ${ue}.\n\n`
      + `Forcer sa réinscription en ${annee} ? Votre nom et l'heure seront enregistrés sur l'inscription.`)) return;
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/etudiants/pae-forcer-reinscription', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ etudiant_id: e.id, annee, ue_num: ue }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      await charger();
    } catch (x) { setErreur(x.message); }
    finally { setEnCours(false); }
  }

  // Rien ne s'écrit sans qu'on ait vu ce qui sera écrit : la liste nominative
  // d'abord, la confirmation ensuite.
  async function nettoyerReussies() {
    setEnCours(true); setErreur(null);
    const appel = simulation => fetch('/api/etudiants/pae-nettoyer-reussies', {
      method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify({ annee, section, simulation }),
    }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Refusé.'); return j; });
    try {
      const sim = await appel(true);
      if (!sim.total.inscriptions) { setErreur('Aucune UE déjà réussie à retirer : celles qui restent portent un résultat, des notes ou un forçage.'); return; }
      const liste = sim.etudiants.slice(0, 25).map(x =>
        `  • ${(x.nom || '').toUpperCase()} ${x.prenom} — UE ${x.ues.join(', ')}${x.pae_valide ? ' (PAE validé : la validation sera retirée)' : ''}`).join('\n');
      if (!window.confirm(`Retirer ${sim.total.inscriptions} inscription(s) ${annee} à des UE déjà réussies, `
        + `pour ${sim.total.etudiants} étudiant(s) ?\n\n${liste}${sim.etudiants.length > 25 ? '\n  • …' : ''}\n\n`
        + 'Ne sont jamais retirées : celles qui portent un résultat, des points, des notes ou un forçage.')) return;
      const j = await appel(false);
      await charger(); onTermine?.();
      setValide({ retirer: false, nettoyage: true, faits: j.retirees, ignores: [], validations: j.validations_retirees });
    } catch (x) { setErreur(x.message); }
    finally { setEnCours(false); }
  }

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
        body: JSON.stringify({ annee, ajouts, retraits, simulation, autre_section_confirmee: autreConfirme, motif: motifLot.trim() || undefined }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Refusé.'); if (j.ecarts) setBilan(b => ({ ...(b || { ajoutes: 0, retires: 0, proteges: [] }), ecarts: j.ecarts })); if (j.autre_section) setBilan(b => ({ ...(b || { ajoutes: 0, retires: 0, proteges: [] }), autre_section: j.autre_section })); return; }
      if (simulation) { setBilan(j); setAutreConfirme(false); }
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
              <button className="bouton bouton-fort" disabled={enCours || ((bilan.ecarts || []).length > 0 && !motifLot.trim())}
                title={(bilan.ecarts || []).length > 0 && !motifLot.trim() ? 'Des ajouts contreviennent aux règles du PAE : un motif est demandé' : undefined}
                onClick={() => envoyer(false)}>
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
          {mode === 'valider' && valide?.nettoyage
            ? `Retiré : ${valide.faits} inscription(s) à des UE déjà réussies${valide.validations ? ` · ${valide.validations} validation(s) retirée(s)` : ''}.`
          : mode === 'valider' && valide
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
                className={`px-2.5 py-1 text-[12px] font-semibold ${!vueNote ? 'bg-[#1B2B4B] text-white' : 'bg-white text-slate-600'}`}>
                Coche
              </button>
              <button onClick={() => setVueNote(true)}
                className={`px-2.5 py-1 text-[12px] font-semibold border-l border-slate-300 ${vueNote ? 'bg-[#1B2B4B] text-white' : 'bg-white text-slate-600'}`}>
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
                    ? 'bg-[#1B2B4B] text-white' : 'bg-white text-slate-600'}`}>
                  {l} ({(grille.etudiants || []).filter(e => v === 'tous' || (v === 'valides'
                    ? !!e.pae_confirme_le : !e.pae_confirme_le && !vide(e))).length})
                </button>
              ))}
            </span>
            <b className="text-iip-blue">{choisis.length} coché(s)</b>
            <button className="bouton" onClick={() => setCoches(new Set(lignes
              .filter(e => !e.pae_confirme_le && !vide(e) && !alertes(e) && !reprises(e) && !enAttente(e)).map(e => e.id)))}
              title="Les programmes que rien ne signale : ils peuvent se valider tels quels">
              Cocher les PAE sans alerte
            </button>
            {nbReprises > 0 && peutForcer && (
              <button className="bouton" disabled={enCours} onClick={nettoyerReussies}
                title="Retirer les inscriptions à des UE déjà réussies que personne n'a forcées — la liste s'affiche avant">
                Retirer les UE déjà réussies ({nbReprises})…
              </button>
            )}
            <span className="text-slate-500">
              Valider signe le programme tel qu'il est : aucune inscription ne change.
              <span className="inline-block w-3 h-3 rounded-[3px] bg-[#1B2B4B] ring-2 ring-amber-400 align-middle mx-1" />
              inscrite sans les prérequis ·
              <span className="inline-block w-3 h-3 rounded-[3px] border-2 border-dashed border-slate-400 align-middle mx-1" />
              ouverte, non prise ·
              <span className="inline-block w-3 h-3 rounded-[3px] bg-[#1B2B4B] ring-2 ring-[#9d4a38] align-middle mx-1" />
              déjà réussie, non forcée{peutForcer ? ' (clic : forcer la réinscription)' : ''} ·
              <span className="inline-grid place-items-center w-3 h-3 rounded-[3px] bg-[#1B2B4B] text-white align-middle mx-1"><IconLock size={8} stroke={2.5} /></span>
              sous cadenas : suivie seulement si son prérequis est réussi
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
            {(bilan.ecarts || []).length > 0 && (
              <div data-etat="surveiller" className="bloc-etat mt-2 px-2.5 py-2 space-y-1">
                <b>{bilan.ecarts.length} ajout(s) contreviennent aux règles du PAE.</b> Ils ne s'écrivent qu'avec un motif,
                tracé sur chacun ; sinon, décochez-les.
                <ul className="text-slate-600 text-[11.5px] max-h-40 overflow-auto">
                  {bilan.ecarts.slice(0, 60).map((x, i) => (
                    <li key={i}>{x.etudiant} — UE {x.ue_num} : {x.regles.map(r0 => r0.libelle + (r0.detail ? ` (${r0.detail})` : '')).join(' ; ')}</li>
                  ))}
                  {bilan.ecarts.length > 60 && <li>… et {bilan.ecarts.length - 60} autre(s)</li>}
                </ul>
                <input className="controle w-full" placeholder="Motif de la dérogation (ex. décision du Conseil des études du …)"
                  value={motifLot} onChange={e => setMotifLot(e.target.value)} />
              </div>
            )}
            {(bilan.autre_section || []).length > 0 && (() => {
              const parEtu = {};
              for (const x of bilan.autre_section) (parEtu[x.etudiant] ||= { dossier: x.section_dossier, ue: x.section_ue, n: 0 }).n++;
              const noms = Object.entries(parEtu);
              return (
                <div data-etat="corriger" className="bloc-etat mt-2 px-2.5 py-2 space-y-1">
                  <b>{noms.length} étudiant(s) recevraient des unités d'une autre section que la leur.</b>
                  <div className="text-slate-600">{noms.slice(0, 12).map(([n, x]) => `${n} (${x.dossier} → ${x.ue})`).join(' · ')}{noms.length > 12 ? ` · et ${noms.length - 12} autres` : ''}</div>
                  <label className="inline-flex items-center gap-1.5">
                    <input type="checkbox" checked={autreConfirme} onChange={e => setAutreConfirme(e.target.checked)} />
                    C'est voulu : ces étudiants suivent aussi cette section
                  </label>
                </div>
              );
            })()}
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
                      {e.primo && <span className="ml-1.5 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-[#2F6FB0]/10 text-[#2F6FB0] align-middle"
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
                      {mode === 'valider' && reprises(e) > 0 && (
                        <span className="ml-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-white border border-[#9d4a38] text-[#9d4a38] align-middle"
                          title={`Déjà réussie${reprises(e) > 1 ? 's' : ''}, réinscrite${reprises(e) > 1 ? 's' : ''} sans forçage : UE ${e.controle.deja_reussies.join(', ')}. La validation est refusée tant qu'elle${reprises(e) > 1 ? 's restent' : ' reste'}.`}>
                          <IconAlertTriangle size={10} className="inline -mt-0.5" /> {reprises(e)} déjà réussie{reprises(e) > 1 ? 's' : ''}
                        </span>
                      )}
                      {mode === 'valider' && enAttente(e) > 0 && (
                        <span className="ml-1 text-[9.5px] font-bold px-1.5 py-0.5 rounded-full bg-white border border-[#9d4a38] text-[#9d4a38] align-middle"
                          title={`Réinscrite alors que la seconde session n'est pas délibérée : UE ${e.controle.en_attente.join(', ')}. Son sort se joue dans l'année où elle a été suivie.`}>
                          <IconAlertTriangle size={10} className="inline -mt-0.5" /> {enAttente(e)} en attente de session
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
                        const reprise = e.controle?.deja_reussies?.includes(u.ue_num);
                        const cadenas = x.inscrit ? cadenasDe(e, u.ue_num) : null;
                        const attente = x.inscrit && e.controle?.en_attente?.includes(u.ue_num);
                        if (cadenas || attente) {
                          return (
                            <td key={u.ue_num} className="text-center px-1 py-1 bg-white border-l border-slate-100">
                              <CasePAE x={x} anneau={attente ? '#9D4A38' : null}
                                contenu={cadenas ? <IconLock size={10} stroke={2.5} /> : undefined}
                                titre={cadenas
                                  ? `Sous cadenas : ne pourra être suivie que si l'UE ${cadenas.join(', ')} est réussie`
                                  : 'Réinscrite alors que sa seconde session n’est pas délibérée'} />
                            </td>
                          );
                        }
                        if (x.inscrit && reprise) {
                          return (
                            <td key={u.ue_num} className="text-center px-1 py-1 bg-white border-l border-slate-100">
                              <button type="button" disabled={!peutForcer || enCours} onClick={() => forcer(e, u.ue_num)}
                                title={peutForcer
                                  ? 'Déjà réussie, réinscrite sans forçage — clic : forcer la réinscription'
                                  : 'Déjà réussie, réinscrite sans forçage — seules la direction et la coordination peuvent la forcer'}
                                className="disabled:cursor-default leading-none">
                                <CasePAE x={x} anneau="#9D4A38" titre="" />
                              </button>
                            </td>
                          );
                        }
                        return (
                          <td key={u.ue_num} className="text-center px-1 py-1 bg-white border-l border-slate-100">
                            {x.va ? <span className="text-[10px] text-slate-600 font-semibold" title="Valorisation">VA</span>
                              : x.inscrit
                                ? <CasePAE x={x} anneau={hors ? '#B45309' : null}
                                    titre={hors ? 'Inscrite sans les prérequis (aucune dérogation posée)' : null} />
                                : manque
                                  ? <span title="Ouverte par les prérequis, non prise"
                                      className="inline-block w-3.5 h-3.5 rounded-[3px] border-2 border-dashed border-slate-400" />
                                  : <CasePAE x={x} />}
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
                              <span className="text-[10px] text-slate-600 font-semibold" title="Valorisation">VA</span>
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
                                  ${rx.attente ? 'ring-2 ring-[#2F6FB0]/40' : ''}`} />
                            </td>
                          );
                        }
                        return (
                          <td key={u.ue_num} onClick={() => cyclerRes(e, u)}
                            className="text-center px-1 py-1 bg-white border-l border-slate-100 cursor-pointer hover:bg-slate-50">
                            <CasePAE x={{ ...x, inscrit: x.inscrit || !!rx.resultat }} resultat={rx.resultat}
                              anneau={rx.attente ? 'rgba(47,111,176,0.45)' : null}
                              titre={rx.resultat ? `${rx.resultat === 'reussi' ? 'réussi' : rx.resultat === 'refuse' ? 'refusé' : rx.resultat}${rx.points != null ? ` · ${rx.points}` : ''}${rx.attente ? ' — à enregistrer' : ''}` : null} />
                          </td>
                        );
                      }
                      /* L'état se lit d'un coup d'œil : plein = inscrit, vert = réussi,
                         + bleu pointillé = ajout en attente, − brique pointillé =
                         retrait en attente (voir CasePAE). Un clic bascule ; une VA ne se touche pas ici. */
                      return (
                        <td key={u.ue_num} onClick={() => basculerCase(e, u)}
                          className={`text-center px-1 py-1 bg-white border-l border-slate-100 ${x.va || (x.acquise && !x.inscrit && !x.attente) ? '' : 'cursor-pointer hover:bg-slate-50'}`}>
                          {x.va ? <span className="text-[10px] text-slate-600 font-semibold" title="Valorisation">VA</span>
                            : <CasePAE x={x} attente={x.attente} />}
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
        {/* LA LÉGENDE (Charles, 26 septembre 2026 : « il n'y a pas de légende,
            on ne sait pas ce qui est quoi »). Elle suit le mode : chaque mode
            dit ce que ses cases veulent dire. */}
        {grille && (() => {
          const L = ({ c, t }) => <span className="inline-flex items-center gap-1.5">{c}{t}</span>;
          return (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 mt-2 text-[11px] text-slate-600">
            <L c={<CasePAE x={{ acquise: { annee: '' } }} titre="" />} t="réussie une année antérieure" />
            <L c={<CasePAE x={{ inscrit: true, resultat: 'reussi' }} titre="" />} t={`inscrite et réussie en ${annee}`} />
            <L c={<CasePAE x={{ inscrit: true }} titre="" />} t={`inscrite en ${annee}`} />
            <L c={<CasePAE x={{ inscrit: true, resultat: 'ajourne' }} titre="" />} t="ajournée — seconde session en attente" />
            <L c={<CasePAE x={{ inscrit: true, resultat: 'refuse' }} titre="" />} t="refusée" />
            <L c={<CasePAE x={{ echec: { annee: '', resultat: 'refuse' } }} titre="" />} t="coin : échouée une année antérieure" />
            <L c={<CasePAE x={{}} titre="" />} t="pas au programme" />
            {mode === 'composer' && <>
              <L c={<CasePAE attente="ajout" titre="" />} t="ajout en attente" />
              <L c={<CasePAE attente="retrait" titre="" />} t="retrait en attente" />
            </>}
            {mode === 'valider' && <>
              <L c={<CasePAE x={{ inscrit: true }} anneau="#9D4A38" titre="" />} t="déjà réussie, réinscrite sans forçage" />
              <L c={<CasePAE x={{ inscrit: true }} anneau="#B45309" titre="" />} t="inscrite sans les prérequis" />
              <L c={<span className="inline-block w-4 h-4 rounded-[4px] border-2 border-dashed border-slate-400" />} t="ouverte par les prérequis, non prise" />
            </>}
            <L c={<b className="text-[10px] text-slate-600">VA</b>} t="valorisation" />
            <span className="text-slate-400">L'année et la décision au survol de chaque case.</span>
          </div>
          );
        })()}
      </div>

      {importHisto && (
        <ImportTableauPlat annee={annee} onClose={() => setImportHisto(false)}
          onFini={() => { setImportHisto(false); charger(); }} />
      )}
    </Fenetre>
  );
}
