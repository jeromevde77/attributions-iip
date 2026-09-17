import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertTriangle, IconCertificate, IconChevronDown, IconChevronRight,
  IconPlus, IconPrinter, IconSearch, IconTrash, IconUserPlus, IconX,
} from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import { Fenetre, RailLateral } from '../components/ui.jsx';
import SeanceValorisation from '../components/SeanceValorisation.jsx';

/**
 * LA VALORISATION DES ACQUIS — UN ÉCRAN, PAS UNE FENÊTRE.
 *
 * Elle se saisissait dans une modale ouverte depuis la fiche d'un étudiant :
 * pour encoder dix dossiers, il fallait ouvrir dix fiches, et rien ne se lisait
 * d'ensemble. Or une session de valorisation est un travail de série — on
 * traite les demandes d'une section, l'une après l'autre, en regardant les
 * mêmes unités.
 *
 * L'écran se lit en trois niveaux, et c'est l'ordre dans lequel le travail se
 * fait : l'ÉTUDIANT, l'UNITÉ qu'il demande, puis ce qui lui est dispensé.
 *
 * LA DÉCISION EST AU NIVEAU DE L'UNITÉ, ET ELLE A TROIS BRANCHES :
 *   refusée    la demande pour cette UE est refusée ; rien n'est dispensé,
 *              et le motif est obligatoire — c'est une décision défavorable.
 *   partielle  cours, acquis, OU LES DEUX. Les deux coexistaient déjà en base
 *              sans avoir jamais été présentés comme un choix : l'écran les
 *              donnait exclusifs par un bouton radio, alors que le modèle ne
 *              l'exige pas.
 *   totale     l'unité entière et tous ses acquis, rien à cocher.
 *
 * Les listes viennent de l'UNITÉ — tous ses cours, et tous les acquis de
 * chaque cours —, jamais du programme de l'étudiant : on valorise une unité
 * qu'il AURA, pas une à laquelle il est déjà inscrit.
 */

const DECISIONS = [
  { val: 'totale', label: 'Totale', aide: "L'unité entière et tous ses acquis" },
  { val: 'partielle', label: 'Partielle', aide: 'Des cours, des acquis, ou les deux' },
  { val: 'refusee', label: 'Refusée', aide: 'Rien de dispensé — motif obligatoire' },
];

export default function Valorisations() {
  const [annee, setAnnee] = useState(getAnnee());
  const [lignes, setLignes] = useState(null);
  const [deplie, setDeplie] = useState(() => new Set());
  const [ajout, setAjout] = useState(false);
  const [ajoutUE, setAjoutUE] = useState(null);      // { etudiant_id, nom, prenom }
  const [documents, setDocuments] = useState(null);
  const [erreur, setErreur] = useState(null);

  const charger = useCallback(async () => {
    try {
      const rep = await fetch(
        `/api/etudiants/valorisations/registre?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      setLignes(rep.ok ? await rep.json() : []);
    } catch { setLignes([]); }
  }, [annee]);
  useEffect(() => { charger(); }, [charger]);

  /* UNE LIGNE PAR ÉTUDIANT, ses unités dessous. Le registre rend une ligne par
     valorisation ; c'est la bonne maille pour lire, pas pour travailler. */
  const parEtudiant = useMemo(() => {
    const m = new Map();
    for (const l of lignes || []) {
      if (!m.has(l.etudiant_id)) {
        m.set(l.etudiant_id, {
          id: l.etudiant_id, nom: l.nom, prenom: l.prenom,
          section: l.section, vas: [],
        });
      }
      m.get(l.etudiant_id).vas.push(l);
    }
    return [...m.values()];
  }, [lignes]);

  const basculer = id => setDeplie(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  /* Un étudiant choisi mais sans aucune UE n'a pas de ligne en base : il vit
     dans cet état-ci jusqu'à ce qu'on lui en ajoute une. Sans cela, cocher
     quelqu'un ne produirait rien de visible, et on croirait le clic perdu. */
  const [enAttente, setEnAttente] = useState([]);
  const tous = useMemo(() => {
    const dejaLa = new Set(parEtudiant.map(e => e.id));
    return [...parEtudiant,
      ...enAttente.filter(e => !dejaLa.has(e.id)).map(e => ({ ...e, vas: [] }))]
      .sort((a, b) => `${a.nom} ${a.prenom}`.localeCompare(`${b.nom} ${b.prenom}`, 'fr'));
  }, [parEtudiant, enAttente]);

  async function supprimer(vid) {
    if (!confirm('Supprimer cette valorisation ? Ses preuves partent avec elle.')) return;
    await fetch(`/api/etudiants/valorisations/${vid}`,
      { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  const RAIL = [{
    label: 'Valorisation',
    items: [
      { key: 'ajouter', label: 'Ajouter des étudiants', icon: IconUserPlus,
        onClick: () => setAjout(true) },
    ],
  }];

  return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral icon={IconCertificate} titre="Valorisation"
        sousTitre={`${tous.length} étudiant(s)`} sections={RAIL} impression="etudiants" />

      <div className="gouttiere-rail p-5 space-y-3 max-w-none">

        <div className="flex items-center gap-2 flex-wrap">
          <select value={annee} onChange={e => setAnnee(e.target.value)}
            className="controle text-[13px]">
            {anneesProches().map(a => <option key={a} value={a}>{a}</option>)}
          </select>
          <button onClick={() => setAjout(true)} className="controle controle-fort">
            <IconUserPlus size={16} /> Ajouter des étudiants
          </button>
          <span className="ml-auto text-[12px] text-slate-500">
            {(lignes || []).length} valorisation(s) · {annee}
          </span>
        </div>

        {erreur && <div className="text-[12px] text-rose-700">{erreur}</div>}

        {!lignes ? (
          <div className="py-8 text-center text-[13px] text-slate-400">Chargement…</div>
        ) : !tous.length ? (
          <div className="py-10 text-center text-[13px] text-slate-400
                          border-2 border-dashed rounded-carte">
            Aucune valorisation pour {annee}.
            <div className="mt-2">
              <button onClick={() => setAjout(true)} className="bouton">
                <IconUserPlus size={14} /> Commencer par choisir des étudiants
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {tous.map(e => (
              <LigneEtudiant key={e.id} etudiant={e} annee={annee}
                ouvert={deplie.has(e.id)} onBasculer={() => basculer(e.id)}
                onAjouterUE={() => setAjoutUE(e)}
                onSupprimer={supprimer}
                onDocuments={ue => setDocuments(ue)}
                onChange={charger} onErreur={setErreur} />
            ))}
          </div>
        )}
      </div>

      {ajout && (
        <ChoisirEtudiants annee={annee} onClose={() => setAjout(false)}
          onChoisis={liste => {
            setEnAttente(a => [...a, ...liste]);
            setDeplie(s => new Set([...s, ...liste.map(x => x.id)]));
            setAjout(false);
          }} />
      )}

      {ajoutUE && (
        <ChoisirUnite annee={annee} etudiant={ajoutUE} onClose={() => setAjoutUE(null)}
          onCree={async () => { setAjoutUE(null); await charger(); }} />
      )}

      {documents && (
        <SeanceValorisation ueNum={documents.ue_num} ueNom={documents.ue_nom}
          annee={annee} onClose={() => setDocuments(null)} />
      )}
    </div>
  );
}

/** Les années autour de l'année courante — le registre ne remonte pas loin. */
function anneesProches() {
  const a = getAnnee();
  const d = Number(String(a).slice(0, 4)) || new Date().getFullYear();
  return [2, 1, 0, -1].map(k => `${d - k}-${d - k + 1}`);
}

/* ══ UN ÉTUDIANT ET SES UNITÉS ════════════════════════════════════════════ */

function LigneEtudiant({ etudiant, annee, ouvert, onBasculer, onAjouterUE,
                         onSupprimer, onDocuments, onChange, onErreur }) {
  const Fleche = ouvert ? IconChevronDown : IconChevronRight;
  return (
    <div className="carte overflow-hidden">
      <div className="flex items-center gap-2 px-3 py-2">
        <button onClick={onBasculer} className="text-slate-400 hover:text-iip-blue">
          <Fleche size={17} />
        </button>
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-iip-blue text-[14px]">
            {(etudiant.nom || '').toUpperCase()} {etudiant.prenom}
          </span>
          <span className="text-[11px] text-slate-400 ml-2">
            {etudiant.section || 'section à déduire'}
            {etudiant.vas.length
              ? ` · ${etudiant.vas.length} unité(s)`
              : ' · aucune unité demandée'}
          </span>
        </span>
        <button onClick={onAjouterUE} className="bouton text-[12px] px-2.5 py-1"
          title="Ajouter une ou plusieurs unités à valoriser">
          <IconPlus size={14} /> Unités
        </button>
      </div>

      {ouvert && (
        <div className="border-t border-slate-200">
          {!etudiant.vas.length ? (
            <div className="px-4 py-3 text-[12px] text-slate-400">
              Aucune unité. Le bouton <b>Unités</b> en ajoute une ou plusieurs.
            </div>
          ) : etudiant.vas.map(v => (
            <UniteValorisee key={v.id} va={v} annee={annee}
              onSupprimer={() => onSupprimer(v.id)}
              onDocuments={() => onDocuments(v)}
              onChange={onChange} onErreur={onErreur} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ══ UNE UNITÉ, SA DÉCISION, SES LIGNES ═══════════════════════════════════ */

function UniteValorisee({ va, annee, onSupprimer, onDocuments, onChange, onErreur }) {
  const [ouvert, setOuvert] = useState(false);
  const [comp, setComp] = useState(null);
  const [form, setForm] = useState(null);
  const [enCours, setEnCours] = useState(false);

  /* LES COMPOSANTES DE L'UNITÉ — tous ses cours, et tous les acquis de chaque
     cours. Chargées à l'ouverture seulement : trente unités dépliées d'un coup
     feraient trente appels dont vingt-neuf ne serviraient à rien. */
  useEffect(() => {
    if (!ouvert || comp) return;
    fetch(`/api/etudiants/ue/${va.ue_num}/composantes?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { cours: [], aas: [] }))
      .then(setComp)
      .catch(() => setComp({ cours: [], aas: [] }));
  }, [ouvert, comp, va.ue_num, annee]);

  /* L'état d'édition part de ce qui est en base. « Partielle » se lit sur deux
     dimensions indépendantes : des cours dispensés (cible_detail) et des acquis
     reconnus (la table des équivalences). */
  useEffect(() => {
    if (!ouvert || form) return;
    const cours = va.cible === 'cours'
      ? String(va.cible_detail || '').split(',').filter(Boolean) : [];
    setForm({
      decision: va.decision === 'refusee' ? 'refusee'
        : va.type === 'complete' ? 'totale' : 'partielle',
      cours,
      aas: {},                       // rempli par le chargement des équivalences
      motif_refus: va.motif_refus || '',
      commentaire: va.commentaire || '',
      decision_ce_date: va.decision_ce_date || '',
      pourcentage: va.pourcentage,
    });
  }, [ouvert, form, va]);

  /* Les acquis déjà reconnus, avec leur motivation : le registre ne les porte
     pas — il rend une ligne par valorisation, pas son détail. */
  useEffect(() => {
    if (!ouvert || !form || form.__aasCharges) return;
    fetch(`/api/etudiants/${va.etudiant_id}/valorisations`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => {
        const m = (l.find(x => x.id === va.id)?.equivalences || []);
        setForm(f => f && ({ ...f, __aasCharges: true,
          aas: Object.fromEntries(m.map(e => [e.aa_code, e.texte || ''])) }));
      })
      .catch(() => setForm(f => f && ({ ...f, __aasCharges: true })));
  }, [ouvert, form, va.etudiant_id, va.id]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const aasParCours = useMemo(() => {
    const m = {};
    for (const a of comp?.aas || []) (m[a.cours_code || '—'] ||= []).push(a);
    return m;
  }, [comp]);

  /* TOTALE VEUT DIRE TOUT : l'unité et tous ses acquis. On ne demande donc
     rien à cocher — et on n'oublie pas d'écrire ce « tout » en base. */
  const equivalencesAEcrire = () => {
    if (form.decision === 'refusee') return [];
    if (form.decision === 'totale') {
      return (comp?.aas || []).map(a => ({
        aa_code: a.aa_code, texte: form.aas[a.aa_code] || '' }));
    }
    return Object.entries(form.aas).map(([aa_code, texte]) => ({ aa_code, texte }));
  };

  async function enregistrer() {
    setEnCours(true); onErreur?.(null);
    try {
      const refus = form.decision === 'refusee';
      const corps = {
        annee_scolaire: va.annee_scolaire, ue_num: va.ue_num,
        type: form.decision === 'totale' ? 'complete' : 'partielle',
        decision: refus ? 'refusee' : 'accordee',
        motif_refus: form.motif_refus,
        commentaire: form.commentaire,
        decision_ce_date: form.decision_ce_date || null,
        pourcentage: form.pourcentage,
        // Les cours dispensés vivent dans cible_detail ; les acquis reconnus
        // dans leur propre table. Les deux ensemble, c'est « cours ET acquis ».
        cible: form.cours.length ? 'cours' : 'aa',
        cible_detail: form.cours.length ? form.cours.join(',')
          : Object.keys(form.aas).join(','),
        equivalences: equivalencesAEcrire(),
      };
      const rep = await fetch(`/api/etudiants/valorisations/${va.id}`, {
        method: 'PUT', headers: authHeaders(), body: JSON.stringify(corps),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      await onChange?.();
    } catch (e) { onErreur?.(e.message); }
    finally { setEnCours(false); }
  }

  const refuse = va.decision === 'refusee';
  const Fleche = ouvert ? IconChevronDown : IconChevronRight;

  return (
    <div className="border-b border-slate-100 last:border-0">
      <div className={`flex items-center gap-2 px-4 py-2 border-l-[3px]
        ${refuse ? 'border-l-[#9D4A38]' : 'border-l-transparent'}`}>
        <button onClick={() => setOuvert(o => !o)}
          className="text-slate-400 hover:text-iip-blue">
          <Fleche size={15} />
        </button>
        <span className="font-mono text-[11px] text-slate-500 w-10">{va.ue_num}</span>
        <span className="flex-1 min-w-0 text-[13px] truncate">{va.ue_nom || ''}</span>
        <span className={`text-[11px] ${refuse ? 'text-[#9D4A38] font-semibold' : 'text-slate-500'}`}>
          {refuse ? 'Refusée' : va.type === 'complete' ? 'Totale' : 'Partielle'}
        </span>
        <button onClick={onDocuments} title="Procès-verbal et attestations"
          className="bouton bouton-sortir text-[12px] px-2 py-1">
          <IconPrinter size={13} />
        </button>
        <button onClick={onSupprimer} className="text-slate-300 hover:text-red-500">
          <IconTrash size={15} />
        </button>
      </div>

      {ouvert && (
        <div className="px-4 pb-4 pl-11 space-y-3">
          {!form ? null : (<>

            {/* LA DÉCISION — une seule question, trois branches. */}
            <div className="flex flex-wrap gap-2">
              {DECISIONS.map(d => (
                <button key={d.val} onClick={() => set('decision', d.val)}
                  title={d.aide}
                  className={`text-[12px] px-3 py-1.5 rounded-champ border
                    ${form.decision === d.val
                      ? 'border-iip-blue bg-iip-blue/5 font-semibold text-iip-blue'
                      : 'border-slate-300 text-slate-600'}`}>
                  {d.label}
                </button>
              ))}
            </div>

            {form.decision === 'refusee' ? (
              <label className="block text-xs">
                <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Motif du refus <span className="text-[#9D4A38]">— obligatoire</span>
                </span>
                <textarea rows={3} value={form.motif_refus}
                  placeholder="Ce que le Conseil a constaté : pièces insuffisantes, acquis non démontrés…"
                  className="w-full border border-slate-300 rounded-champ px-2 py-1.5 text-[13px]"
                  onChange={e => set('motif_refus', e.target.value)} />
              </label>
            ) : form.decision === 'totale' ? (
              <div className="text-[12px] text-slate-500 border border-slate-200
                              rounded-carte px-3 py-2">
                L'unité entière est acquise, et <b>tous ses acquis</b> avec elle —
                {' '}{(comp?.aas || []).length} au référentiel. Rien à cocher :
                c'est ce que le mot veut dire.
              </div>
            ) : !comp ? (
              <div className="text-[12px] text-slate-400">Chargement des composantes…</div>
            ) : (
              /* PARTIELLE : cours, acquis, OU LES DEUX. Les deux listes sont
                 indépendantes — c'est la question posée, et le modèle la
                 supporte depuis toujours. */
              <div className="space-y-2">
                {(comp.cours || []).length === 0 && (
                  <div className="text-[12px] text-amber-800">
                    Cette unité ne porte aucun cours au référentiel {annee}.
                  </div>
                )}
                {(comp.cours || []).map(c => {
                  const pris = form.cours.includes(c.cours_code);
                  const acquis = aasParCours[c.cours_code] || [];
                  return (
                    <div key={c.cours_code}
                      className="border border-slate-200 rounded-carte overflow-hidden">
                      <label className={`flex items-center gap-2 px-3 py-2 cursor-pointer
                        ${pris ? 'bg-iip-blue/5' : ''}`}>
                        <input type="checkbox" checked={pris}
                          className="w-4 h-4 accent-iip-blue"
                          onChange={() => set('cours', pris
                            ? form.cours.filter(x => x !== c.cours_code)
                            : [...form.cours, c.cours_code])} />
                        <span className="font-mono text-[11px] text-slate-500">
                          {c.cours_code}
                        </span>
                        <span className="flex-1 min-w-0 text-[13px] truncate">
                          {c.cours_nom}
                        </span>
                        <span className="text-[11px] text-slate-400">
                          {acquis.length} acquis
                        </span>
                      </label>

                      {acquis.length > 0 && (
                        <div className="border-t border-slate-100 divide-y divide-slate-50">
                          {acquis.map(a => {
                            const coche = form.aas[a.aa_code] !== undefined;
                            return (
                              <div key={a.aa_code} className={`px-3 py-1.5 pl-8
                                ${coche ? 'bg-iip-blue/5' : ''}`}>
                                <label className="flex items-start gap-2 cursor-pointer">
                                  <input type="checkbox" checked={coche} className="mt-0.5"
                                    onChange={() => setForm(f => {
                                      const aas = { ...f.aas };
                                      if (coche) delete aas[a.aa_code];
                                      else aas[a.aa_code] = comp.texte_equivalence || '';
                                      return { ...f, aas };
                                    })} />
                                  <span className="text-[12px] flex-1 min-w-0">
                                    <span className="font-mono text-[11px] text-slate-500 mr-1.5">
                                      {a.aa_code}
                                    </span>{a.description || ''}
                                  </span>
                                </label>
                                {coche && (
                                  <textarea rows={2} value={form.aas[a.aa_code] || ''}
                                    onChange={e => setForm(f => ({ ...f,
                                      aas: { ...f.aas, [a.aa_code]: e.target.value } }))}
                                    className="mt-1.5 ml-6 w-[calc(100%-1.5rem)]
                                               border border-slate-300 rounded-champ
                                               px-2 py-1 text-[12px]" />
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <label className="block text-xs">
                <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Date de décision du Conseil
                </span>
                <input type="date" value={form.decision_ce_date} className="controle w-full"
                  onChange={e => set('decision_ce_date', e.target.value)} />
              </label>
              <label className="block text-xs">
                <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Remarque du Conseil
                </span>
                <input value={form.commentaire} className="controle w-full"
                  placeholder="Ex. dispensé des heures de stage, doit présenter l'examen"
                  onChange={e => set('commentaire', e.target.value)} />
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button onClick={enregistrer} disabled={enCours
                || (form.decision === 'refusee' && !form.motif_refus.trim())}
                className="bouton bouton-fort disabled:opacity-40">
                {enCours ? 'Enregistrement…' : 'Enregistrer'}
              </button>
              {form.decision === 'refusee' && !form.motif_refus.trim() && (
                <span className="text-[12px] text-amber-800">
                  Un refus se motive : écris ce que le Conseil a constaté.
                </span>
              )}
            </div>
          </>)}
        </div>
      )}
    </div>
  );
}

/* ══ CHOISIR DES ÉTUDIANTS ════════════════════════════════════════════════ */

function ChoisirEtudiants({ annee, onClose, onChoisis }) {
  const [section, setSection] = useState('');
  const [sections, setSections] = useState([]);
  const [q, setQ] = useState('');
  const [liste, setListe] = useState(null);
  const [coches, setCoches] = useState(() => new Set());

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setSections(l || []))
      .catch(() => setSections([]));
  }, []);

  useEffect(() => {
    const p = new URLSearchParams({ annee });
    if (section) p.set('section', section);
    if (q.trim()) p.set('q', q.trim());
    setListe(null);
    const t = setTimeout(() => {
      fetch(`/api/etudiants?${p}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : []))
        .then(l => setListe(Array.isArray(l) ? l : (l?.etudiants || [])))
        .catch(() => setListe([]));
    }, 220);
    return () => clearTimeout(t);
  }, [annee, section, q]);

  const basculer = id => setCoches(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  return (
    /* LE BOUTON NE DÉFILE PAS AVEC LA LISTE.
       Posé au bas du contenu, il descendait sous cinq cents étudiants : pour
       valider trois cases cochées en haut, il fallait dérouler tout le
       fichier. Le pied de la fenêtre est fait pour cela — il existait, et
       personne ne s'en servait. */
    <Fenetre icone={IconUserPlus} large="grande" onFermer={onClose}
      titre="Ajouter des étudiants"
      sous="Ceux dont on va examiner une demande de valorisation"
      pied={<>
        <button disabled={!coches.size} className="bouton bouton-fort disabled:opacity-40"
          onClick={() => onChoisis((liste || []).filter(e => coches.has(e.id))
            .map(e => ({ id: e.id, nom: e.nom, prenom: e.prenom,
                         section: e.section_rattachement || e.section })))}>
          {coches.size > 1 ? `Ajouter ${coches.size} étudiants` : 'Ajouter'}
        </button>
        <span className="text-[12px] text-slate-500">
          {coches.size ? `${coches.size} coché(s)` : 'Aucun coché'}
        </span>
        <button onClick={onClose} className="bouton ml-auto">Annuler</button>
      </>}>
      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-none flex flex-wrap items-center gap-2 px-5 py-3
                        border-b border-slate-200">
          <select value={section} onChange={e => setSection(e.target.value)}
            className="controle text-[13px]">
            <option value="">Toutes les sections</option>
            {sections.map(s => (
              <option key={s.code} value={s.code}>{s.libelle || s.code}</option>
            ))}
          </select>
          <div className="relative">
            <IconSearch size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Un nom…" className="controle pl-8 text-[13px]" />
          </div>
          <span className="ml-auto text-[12px] text-slate-500">
            {coches.size ? `${coches.size} coché(s)` : 'Aucun coché'}
          </span>
          {coches.size > 0 && (
            <button onClick={() => setCoches(new Set())}
              className="text-slate-400 hover:text-iip-blue" title="Tout décocher">
              <IconX size={14} />
            </button>
          )}
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {!liste ? (
            <div className="p-6 text-[13px] text-slate-400">Chargement…</div>
          ) : !liste.length ? (
            <div className="p-6 text-[13px] text-slate-400">
              Personne ne correspond à ce filtre.
            </div>
          ) : liste.map(e => (
            <label key={e.id}
              className={`flex items-center gap-2 px-5 py-1.5 cursor-pointer
                border-b border-slate-50 ${coches.has(e.id) ? 'bg-iip-blue/5' : ''}`}>
              <input type="checkbox" checked={coches.has(e.id)}
                onChange={() => basculer(e.id)} className="w-4 h-4 accent-iip-blue" />
              <span className="flex-1 min-w-0">
                <span className="text-[13px] font-medium">
                  {(e.nom || '').toUpperCase()} {e.prenom}
                </span>
                <span className="block text-[11px] text-slate-500 truncate">
                  {e.section_rattachement || e.section || '—'}
                  {e.email_ecole ? ` · ${e.email_ecole}` : ''}
                </span>
              </span>
            </label>
          ))}
        </div>

      </div>
    </Fenetre>
  );
}

/* ══ CHOISIR L'UNITÉ ══════════════════════════════════════════════════════ */

function ChoisirUnite({ annee, etudiant, onClose, onCree }) {
  const [unites, setUnites] = useState(null);
  const [section, setSection] = useState('');
  const [q, setQ] = useState('');
  const [coches, setCoches] = useState(() => new Set());
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch(`/api/etudiants/${etudiant.id}/valorisations/unites?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { sections: [], unites: [] }))
      .then(j => {
        setUnites(j);
        // La section de rattachement est la bonne par défaut : c'est celle du
        // programme de l'étudiant, donc celle où l'on cherche neuf fois sur dix.
        if (j.section_etudiant) setSection(j.section_etudiant);
      })
      .catch(() => setUnites({ sections: [], unites: [] }));
  }, [etudiant.id, annee]);

  const visibles = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (unites?.unites || []).filter(u =>
      (!section || u.section === section)
      && (!t || String(u.ue_num).includes(t) || (u.ue_nom || '').toLowerCase().includes(t)));
  }, [unites, section, q]);

  const basculer = n => setCoches(s2 => {
    const n2 = new Set(s2);
    if (n2.has(n)) n2.delete(n); else n2.add(n);
    return n2;
  });

  async function creer() {
    if (!coches.size) return;
    setEnCours(true); setErreur(null);
    try {
      /* ELLES NAISSENT « PARTIELLES ET VIDES », et c'est volontaire : la
         décision se prend dans la ligne, sous les yeux des cours et des acquis.
         Naître « totale » par défaut ferait accorder des unités entières d'un
         clic distrait — d'autant plus qu'on en coche maintenant plusieurs. */
      const echecs = [];
      for (const ueNum of coches) {
        const rep = await fetch(`/api/etudiants/${etudiant.id}/valorisations`, {
          method: 'POST', headers: authHeaders(),
          body: JSON.stringify({
            annee_scolaire: annee, ue_num: Number(ueNum),
            type: 'partielle', cible: 'cours', cible_detail: '',
            decision: 'accordee',
          }),
        });
        if (!rep.ok) {
          const j = await rep.json().catch(() => ({}));
          echecs.push(`UE ${ueNum} : ${j.error || 'refusée'}`);
        }
      }
      // ON DIT CE QUI N'EST PAS PASSÉ. Sur dix unités cochées, une seule peut
      // échouer ; un message unique « erreur » ferait croire que rien n'a été
      // créé, et on recommencerait tout — en doublant les neuf autres.
      if (echecs.length) setErreur(echecs.join(' · '));
      await onCree?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  return (
    <Fenetre icone={IconPlus} large="grande" onFermer={onClose}
      titre="Des unités à valoriser"
      sous={`${(etudiant.nom || '').toUpperCase()} ${etudiant.prenom} · ${annee}`}
      pied={<>
        <button onClick={creer} disabled={!coches.size || enCours}
          className="bouton bouton-fort disabled:opacity-40">
          {enCours ? 'Ajout…'
            : coches.size > 1 ? `Ajouter ${coches.size} unités` : "Ajouter l'unité"}
        </button>
        <span className="text-[12px] text-slate-500">
          {coches.size ? `${coches.size} cochée(s)` : 'Aucune cochée'}
        </span>
        {erreur && (
          <span className="flex items-start gap-1.5 text-[12px] text-rose-700">
            <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
          </span>
        )}
        <button onClick={onClose} className="bouton ml-auto">Fermer</button>
      </>}>
      <div className="flex-1 min-h-0 flex flex-col -mx-5 -my-4">

        <div className="flex-none flex flex-wrap items-center gap-2 px-5 py-3
                        border-b border-slate-200">
          {/* ON NE VALORISE QU'UNE UNITÉ DE CHEZ NOUS — le serveur refuse un
              numéro inconnu du référentiel, et l'écran ne le propose même pas. */}
          <select value={section} onChange={e => { setSection(e.target.value); }}
            className="controle text-[13px]">
            <option value="">Toutes les sections</option>
            {(unites?.sections || []).map(sx => (
              <option key={sx.code || sx} value={sx.code || sx}>
                {sx.libelle || sx.code || sx}
              </option>
            ))}
          </select>
          <div className="relative">
            <IconSearch size={14}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)}
              placeholder="Un numéro, un intitulé…" className="controle pl-8 text-[13px]" />
          </div>
          {coches.size > 0 && (
            <button onClick={() => setCoches(new Set())}
              className="text-slate-400 hover:text-iip-blue" title="Tout décocher">
              <IconX size={14} />
            </button>
          )}
          <span className="ml-auto text-[12px] text-slate-400">
            {visibles.length} unité(s)
          </span>
        </div>

        <div className="flex-1 overflow-auto min-h-0">
          {!unites ? (
            <div className="p-6 text-[13px] text-slate-400">Chargement…</div>
          ) : !visibles.length ? (
            <div className="p-6 text-[13px] text-slate-400">
              Aucune unité ne correspond à ce filtre.
            </div>
          ) : visibles.map(u => (
            <label key={u.ue_num}
              className={`flex items-center gap-2 px-5 py-1.5 cursor-pointer
                border-b border-slate-50 ${coches.has(u.ue_num) ? 'bg-iip-blue/5' : ''}`}>
              <input type="checkbox" checked={coches.has(u.ue_num)}
                onChange={() => basculer(u.ue_num)} className="w-4 h-4 accent-iip-blue" />
              <span className="font-mono text-[11px] text-slate-500 w-12 flex-none">
                {u.ue_num}
              </span>
              <span className="flex-1 min-w-0 text-[13px] truncate">{u.ue_nom}</span>
              {/* CELLES DE SON PROGRAMME SE SIGNALENT : ce sont les plus
                  probables, et elles arrivent déjà en tête de la liste. */}
              {u.au_pae && (
                <span className="text-[10px] uppercase tracking-wider text-[#0093B0]
                                 flex-none">à son programme</span>
              )}
              <span className="text-[11px] text-slate-400 flex-none w-24 text-right truncate">
                {u.section || ''}
              </span>
            </label>
          ))}
        </div>
      </div>
    </Fenetre>
  );
}
