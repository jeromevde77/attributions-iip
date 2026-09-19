import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertTriangle, IconCertificate, IconChevronDown, IconChevronRight,
  IconListCheck, IconPlus, IconPrinter, IconSearch, IconTable, IconTrash,
  IconUserPlus, IconUsersGroup, IconX,
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
  const [serie, setSerie] = useState(false);
  const [dossier, setDossier] = useState(null);   // vid du dossier ouvert
  const [matrice, setMatrice] = useState(false);
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

  /* RETIRER UNE LIGNE ENTIÈRE — ET DIRE CE QU'ON EFFACE AVANT DE L'EFFACER.
     Le nombre d'unités figure dans la question : « retirer Untel » et « retirer
     les quatre demandes d'Untel » n'engagent pas la même chose. */
  async function supprimerLigne(e) {
    const n = (e.vas || []).length;
    if (n && !window.confirm(
      `Retirer ${(e.nom || '').toUpperCase()} ${e.prenom} du registre ${annee} ?\n`
      + `${n} demande(s) seront supprimées. Les décisions déjà prises, elles, `
      + 'ne peuvent pas être effacées.')) return;
    try {
      const r = await fetch(
        `/api/etudiants/valorisations/etudiant/${e.id}?annee=${encodeURIComponent(annee)}`,
        { method: 'DELETE', headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErreur([j.error, ...(j.bloquants || [])].filter(Boolean).join(' · '));
        return;
      }
      setErreur(null);
      // Un étudiant ajouté à l'écran mais sans aucune demande n'existe que là :
      // il s'en va de la liste d'attente, sans rien à supprimer côté serveur.
      setEnAttente(a => a.filter(x => x.id !== e.id));
      await charger();
    } catch (err) { setErreur(err.message); }
  }

  const RAIL = [{
    label: 'Valorisation',
    items: [
      { key: 'introduire', label: 'Introduire des demandes', icon: IconTable,
        onClick: () => setMatrice(true) },
      { key: 'serie', label: 'Valoriser en série', icon: IconUsersGroup,
        onClick: () => setSerie(true) },
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
          {/* L'ACTION PRINCIPALE DE L'ÉCRAN EST LA SÉANCE, PAS LE DOSSIER.
              On encode une valorisation par unité devant un conseil des études,
              pas un étudiant à la fois : c'est celle-là qui porte le ton fort,
              et il n'y en a qu'une. */}
          {/* LA PORTE D'ENTRÉE EST L'ACTION PRINCIPALE : avant de valoriser,
              il faut que les demandes soient entrées. */}
          <button onClick={() => setMatrice(true)} className="controle controle-fort">
            <IconTable size={16} /> Introduire des demandes
          </button>
          <button onClick={() => setSerie(true)} className="controle">
            <IconUsersGroup size={16} /> Valoriser en série
          </button>
          <button onClick={() => setAjout(true)} className="controle">
            <IconUserPlus size={16} /> Ajouter des étudiants
          </button>
          <span className="ml-auto text-[12px] text-slate-500">
            {(lignes || []).length} valorisation(s) · {annee}
          </span>
        </div>

        {erreur && <div className="text-[12px] text-rose-700">{erreur}</div>}

        {/* CE QUI RESTE À FAIRE, AVANT LA LISTE. Un retard ne se voit pas
            dossier par dossier : sans ce bloc, la non-conformité se découvre à
            l'inspection, et il est alors trop tard pour la corriger. */}
        <CeQuiResteAFaire annee={annee} onOuvrir={setDossier} />

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
                onDossier={setDossier}
                onSupprimerLigne={() => supprimerLigne(e)}
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

      {matrice && (
        <MatriceIntroduction annee={annee} onClose={() => setMatrice(false)}
          onCree={charger} />
      )}

      {serie && (
        <ValoriserEnSerie annee={annee} onClose={() => setSerie(false)}
          onCree={async () => { setSerie(false); await charger(); }} />
      )}

      {ajoutUE && (
        <ChoisirUnite annee={annee} etudiant={ajoutUE} onClose={() => setAjoutUE(null)}
          onCree={async () => { setAjoutUE(null); await charger(); }} />
      )}

      {dossier && (
        <FenetreDossier vid={dossier} onClose={() => setDossier(null)}
          onChange={charger} />
      )}

      {documents && (
        <SeanceValorisation ueNum={documents.ue_num} ueNom={documents.ue_nom}
          annee={annee} onClose={() => setDocuments(null)} />
      )}
    </div>
  );
}

/**
 * LA DATE DU JOUR EST LE DÉFAUT, PARTOUT.
 *
 * Un champ de date vide impose un clic, un calendrier et un repérage visuel
 * pour écrire ce que Lucie sait déjà : on est aujourd'hui. Et comme il coûte,
 * il reste vide — si bien que les dates manquent précisément là où elles
 * prouvent quelque chose. Le défaut doit être correct : on propose
 * aujourd'hui, et l'on corrige quand ce n'est pas le bon jour.
 */
export function aujourdHui() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
    + `-${String(d.getDate()).padStart(2, '0')}`;
}

/** Les années autour de l'année courante — le registre ne remonte pas loin. */
function anneesProches() {
  const a = getAnnee();
  const d = Number(String(a).slice(0, 4)) || new Date().getFullYear();
  return [2, 1, 0, -1].map(k => `${d - k}-${d - k + 1}`);
}

/* ══ UN ÉTUDIANT ET SES UNITÉS ════════════════════════════════════════════ */

function LigneEtudiant({ etudiant, annee, ouvert, onBasculer, onAjouterUE,
                         onSupprimer, onSupprimerLigne, onDocuments, onDossier,
                         onChange, onErreur }) {
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
        {/* ON SE TROMPE D'ÉTUDIANT — UN HOMONYME, UNE LIGNE COCHÉE TROP VITE.
            Il fallait déplier et supprimer les unités une à une : donc on ne le
            faisait pas, et le registre gardait des étudiants qui n'ont jamais
            rien demandé. Une erreur qu'on ne peut pas défaire d'un geste est
            une erreur qui reste. */}
        <button onClick={onSupprimerLigne}
          title="Retirer cet étudiant du registre pour cette année"
          className="text-slate-300 hover:text-[#9D4A38]">
          <IconTrash size={16} />
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
              onDossier={() => onDossier(v.id)}
              onChange={onChange} onErreur={onErreur} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ══ UNE UNITÉ, SA DÉCISION, SES LIGNES ═══════════════════════════════════ */

function UniteValorisee({ va, annee, onSupprimer, onDocuments, onDossier, onChange, onErreur }) {
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
      // LA LECTURE SE DÉDUIT DE CE QUI EST ÉCRIT : des cours dispensés, on
      // rouvre par cours ; sinon par acquis — c'est ce qu'on regardait.
      mode: cours.length ? 'cours' : (va.cible === 'aa' ? 'aa' : 'cours'),
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
        {/* LE DOSSIER AVANT LA PIÈCE. On ouvrait directement sur l'impression,
            comme si produire était l'objet du travail ; c'est l'INSTRUCTION qui
            l'est, et la pièce n'en est que la conséquence. */}
        <button onClick={onDossier} title="Le dossier et son circuit"
          className="bouton text-[12px] px-2 py-1">
          <IconListCheck size={13} /> Dossier
        </button>
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
              /* PARTIELLE — DEUX LECTURES DE LA MÊME UNITÉ.
                 PAR ACQUIS : on valorise une COMPÉTENCE, une ou plusieurs.
                 Elles se lisent d'affilée, sans le détour des cours — c'est
                 ainsi que le Conseil raisonne quand la formation antérieure ne
                 se découpe pas comme la nôtre.
                 PAR COURS : on dispense une activité d'enseignement, et les
                 acquis de CE cours restent sous les yeux — on ne dispense pas
                 un cours sans savoir quelles compétences partent avec lui.
                 Les deux écrivent au même endroit : les cours cochés dans
                 `cible_detail`, les acquis reconnus dans leur table. Changer de
                 lecture ne perd donc rien de ce qui est déjà coché. */
              <div className="space-y-2">
                <div className="flex gap-3 text-[13px] items-center">
                  {[['cours', 'Par cours', 'Une activité d’enseignement, et ses acquis'],
                    ['aa', 'Par acquis', 'Une compétence, ou plusieurs']].map(([v, lab, aide]) => (
                    <label key={v} className="flex items-center gap-1.5 cursor-pointer"
                      title={aide}>
                      <input type="radio" checked={(form.mode || 'cours') === v}
                        onChange={() => set('mode', v)} />
                      {lab}
                    </label>
                  ))}
                  <span className="ml-auto text-[11px] text-slate-400">
                    {form.cours.length} cours · {Object.keys(form.aas).length} acquis
                  </span>
                </div>

                {(form.mode || 'cours') === 'aa' ? (
                  /* TOUS LES ACQUIS DE L'UNITÉ, À PLAT. Groupés par cours, ils
                     obligeraient à ouvrir quatre cours pour en cocher deux qui
                     n'ont rien à voir entre eux. Le code du cours reste écrit à
                     droite : on sait d'où vient la compétence sans que le
                     rangement l'impose. */
                  <div className="border border-slate-200 rounded-carte overflow-hidden">
                    {!(comp.aas || []).length ? (
                      <div className="px-3 py-3 text-[12px] text-amber-800">
                        Cette unité ne porte aucun acquis au référentiel.
                      </div>
                    ) : comp.aas.map(a2 => {
                      const coche = form.aas[a2.aa_code] !== undefined;
                      return (
                        <div key={a2.aa_code}
                          className={`px-3 py-1.5 border-b border-slate-50 last:border-0
                            ${coche ? 'bg-iip-blue/5' : ''}`}>
                          <label className="flex items-start gap-2 cursor-pointer">
                            <input type="checkbox" checked={coche} className="mt-0.5"
                              onChange={() => setForm(f => {
                                const aas = { ...f.aas };
                                if (coche) delete aas[a2.aa_code];
                                else aas[a2.aa_code] = comp.texte_equivalence || '';
                                return { ...f, aas };
                              })} />
                            <span className="text-[12px] flex-1 min-w-0">
                              <span className="font-mono text-[11px] text-slate-500 mr-1.5">
                                {a2.aa_code}
                              </span>{a2.description || ''}
                            </span>
                            <span className="text-[11px] text-slate-400 flex-none">
                              {a2.cours_code || ''}
                            </span>
                          </label>
                          {coche && (
                            <textarea rows={2} value={form.aas[a2.aa_code] || ''}
                              onChange={e => setForm(f => ({ ...f,
                                aas: { ...f.aas, [a2.aa_code]: e.target.value } }))}
                              className="mt-1.5 ml-6 w-[calc(100%-1.5rem)] border
                                         border-slate-300 rounded-champ px-2 py-1 text-[12px]" />
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : (<>
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
                </>)}
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

/* ══ VALORISER PLUSIEURS ÉTUDIANTS À LA FOIS ══════════════════════════════ */

/**
 * UNE SÉANCE, UNE UNITÉ, UNE DÉCISION — ET AUTANT D'ÉTUDIANTS QU'ELLE EN
 * CONCERNE.
 *
 * Le conseil des études d'une unité examine les demandes en série : même
 * unité, même séance, même dispense, souvent le même constat d'équivalence —
 * huit dossiers de reprise d'études qui portent le même diplôme antérieur.
 * Lucie faisait naître huit valorisations « partielles et vides », qu'il
 * fallait ensuite ouvrir et remplir huit fois. On écrivait donc huit fois ce
 * que le Conseil a décidé une fois, avec huit occasions de se tromper d'une
 * case.
 *
 * L'ordre de l'écran est celui de la séance :
 *   1. l'UNITÉ — c'est elle qui convoque le conseil des études ;
 *   2. les ÉTUDIANTS qu'elle concerne, cochés dans un tableau ;
 *   3. la DÉCISION, saisie UNE FOIS et portée par tous.
 *
 * TOUS LES ACQUIS, C'EST L'UNITÉ ENTIÈRE. Cocher un à un les acquis d'une
 * unité pour les avoir tous n'est pas une dispense partielle exhaustive :
 * c'est une dispense d'unité, et le procès-verbal doit le dire ainsi — annexe
 * 4 et attestation de réussite. Le choix « toute l'unité » écrit donc une
 * valorisation COMPLÈTE, et non une partielle qui lui ressemblerait.
 */
function ValoriserEnSerie({ annee, onClose, onCree }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [unites, setUnites] = useState([]);
  const [ueNum, setUeNum] = useState('');
  const [candidats, setCandidats] = useState(null);
  const [coches, setCoches] = useState(() => new Set());
  const [composantes, setComposantes] = useState(null);

  /* UNE VALORISATION PRÉCÈDE SOUVENT L'INSCRIPTION. On demande la dispense
     d'une unité qu'on n'a pas encore à son programme — c'est même le cas
     ordinaire d'une reprise d'études. La liste de ceux que l'unité concerne
     est donc un POINT DE DÉPART, jamais une clôture : on va chercher les
     autres dans le fichier, plusieurs à la fois. */
  const [ajoutes, setAjoutes] = useState([]);
  const [chercheOuvert, setChercheOuvert] = useState(false);
  const [q, setQ] = useState('');
  const [sectionRech, setSectionRech] = useState('');
  const [resultats, setResultats] = useState(null);
  const [prisDansRecherche, setPrisDansRecherche] = useState(() => new Set());

  // La décision, saisie une fois.
  const [portee, setPortee] = useState('unite');   // unite | cours | acquis
  const [decision, setDecision] = useState('accordee');
  const [motif, setMotif] = useState('');
  const [coursCoches, setCoursCoches] = useState(() => new Set());
  const [aaCoches, setAaCoches] = useState(() => new Set());
  const [pourcentage, setPourcentage] = useState('50');
  const [dateCE, setDateCE] = useState(aujourdHui());
  const [remarque, setRemarque] = useState('');

  const [erreur, setErreur] = useState(null);
  const [doublons, setDoublons] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setSections(l || []))
      .catch(() => setSections([]));
  }, []);

  /* L'UNITÉ SE CHOISIT, ELLE NE SE TAPE PAS — et quand la liste est vide, on
     l'écrit plutôt que d'ouvrir un champ libre qui inviterait à taper un
     numéro ne menant nulle part. */
  useEffect(() => {
    const p = new URLSearchParams({ annee });
    if (section) p.set('section', section);
    fetch(`/api/ref/ue?${p}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : []))
      .then(l => setUnites(Array.isArray(l) ? l : []))
      .catch(() => setUnites([]));
    setUeNum(''); setCandidats(null); setCoches(new Set());
  }, [annee, section]);

  useEffect(() => {
    if (!ueNum) { setCandidats(null); setComposantes(null); return; }
    setCandidats(null); setCoches(new Set()); setAjoutes([]);
    setCoursCoches(new Set()); setAaCoches(new Set());
    fetch(`/api/etudiants/valorisations/ue/${ueNum}/candidats?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { etudiants: [] }))
      .then(j => setCandidats(j))
      .catch(() => setCandidats({ etudiants: [] }));
    fetch(`/api/etudiants/ue/${ueNum}/composantes?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(j => setComposantes(j))
      .catch(() => setComposantes(null));
  }, [ueNum, annee]);

  /* LA LISTE EST CELLE DE L'UNITÉ, PLUS CEUX QU'ON EST ALLÉ CHERCHER. Un
     étudiant ajouté à la main qui se trouve déjà dans la liste n'y entre pas
     deux fois : c'est le même dossier. */
  const tousCandidats = useMemo(() => {
    const vus = new Map();
    for (const e of (candidats?.etudiants || [])) vus.set(e.id, e);
    for (const a of ajoutes) {
      if (!vus.has(a.id)) vus.set(a.id, { ...a, au_programme: false, valorisation: null, ajoute: true });
    }
    return [...vus.values()].sort((a, b) =>
      (a.nom || '').localeCompare(b.nom || '')
      || (a.prenom || '').localeCompare(b.prenom || ''));
  }, [candidats, ajoutes]);

  /* CELUI QUI PORTE DÉJÀ UNE DÉCISION NE SE COCHE PAS. Le lot est tout ou
     rien : le laisser cocher ferait échouer les autres avec lui. */
  const libres = useMemo(
    () => tousCandidats.filter(e => !e.valorisation), [tousCandidats]);

  /* LA RECHERCHE DANS LE FICHIER — même filtre section, même saisie de nom que
     partout ailleurs. Elle ne s'ouvre qu'à la demande : l'écran n'est pas un
     annuaire, c'est une séance. */
  useEffect(() => {
    if (!chercheOuvert) return;
    const p = new URLSearchParams({ annee });
    if (sectionRech) p.set('section', sectionRech);
    if (q.trim()) p.set('q', q.trim());
    setResultats(null);
    const t = setTimeout(() => {
      fetch(`/api/etudiants?${p}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : []))
        .then(l => setResultats(Array.isArray(l) ? l : (l?.etudiants || [])))
        .catch(() => setResultats([]));
    }, 220);
    return () => clearTimeout(t);
  }, [chercheOuvert, annee, sectionRech, q]);

  const dejaListe = useMemo(
    () => new Set(tousCandidats.map(e => e.id)), [tousCandidats]);

  function ajouterLesPris() {
    const pris = (resultats || []).filter(e => prisDansRecherche.has(e.id));
    if (!pris.length) return;
    setAjoutes(a => [...a, ...pris.map(e => ({
      id: e.id, nom: e.nom, prenom: e.prenom,
      section: e.section_rattachement || e.section || null,
    }))]);
    /* ON LES COCHE : on est allé les chercher exprès. Les proposer décochés
       obligerait à refaire le même geste deux fois. */
    setCoches(s0 => new Set([...s0, ...pris.map(e => e.id)]));
    setPrisDansRecherche(new Set());
    setQ('');
  }

  const basculer = id => setCoches(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toutCocher = () => setCoches(
    coches.size === libres.length ? new Set() : new Set(libres.map(e => e.id)));

  const aasParCours = useMemo(() => {
    const m = new Map();
    for (const a of (composantes?.aas || [])) {
      const c = a.cours_code || '—';
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(a);
    }
    return m;
  }, [composantes]);

  const basculerSet = (setter) => (v) => setter(s => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  });

  // Ce qui manque pour que le bouton s'allume — dit AU MÊME ENDROIT que lui.
  const manque =
    !ueNum ? "Choisis l'unité"
    : !coches.size ? 'Coche au moins un étudiant'
    : decision === 'refusee' && !motif.trim() ? 'Un refus se motive'
    : portee === 'cours' && !coursCoches.size ? 'Coche au moins un cours'
    : portee === 'acquis' && !aaCoches.size ? 'Coche au moins un acquis'
    : null;

  async function enregistrer() {
    if (manque) return;
    setEnCours(true); setErreur(null); setDoublons(null);
    try {
      const refus = decision === 'refusee';
      const corps = {
        etudiant_ids: [...coches],
        annee_scolaire: annee,
        ue_num: Number(ueNum),
        decision,
        motif_refus: refus ? motif.trim() : null,
        decision_ce_date: dateCE || null,
        commentaire: remarque.trim() || null,
      };
      if (refus) {
        // Un refus ne dispense rien : ni type partiel, ni cible, ni pourcentage.
        corps.type = 'complete';
      } else if (portee === 'unite') {
        corps.type = 'complete';
        corps.pourcentage = pourcentage === '' ? null : Number(pourcentage);
      } else {
        corps.type = 'partielle';
        corps.cible = portee === 'cours' ? 'cours' : 'aa';
        corps.cible_detail = portee === 'cours'
          ? [...coursCoches].join(',') : [...aaCoches].join(',');
        corps.pourcentage = pourcentage === '' ? null : Number(pourcentage);
        if (portee === 'acquis') {
          corps.equivalences = [...aaCoches].map(code => ({ aa_code: code }));
        }
      }
      const rep = await fetch('/api/etudiants/valorisations/lot', {
        method: 'POST', headers: authHeaders(), body: JSON.stringify(corps),
      });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) {
        setErreur(j.error || 'Enregistrement refusé.');
        if (Array.isArray(j.doublons)) setDoublons(j.doublons);
        return;
      }
      await onCree?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const uniteChoisie = unites.find(u => String(u.ue_num) === String(ueNum));

  return (
    <Fenetre icone={IconUsersGroup} large="grande" onFermer={onClose}
      titre="Valoriser en série"
      sous="Une unité, un conseil des études, la même décision pour plusieurs étudiants"
      pied={<>
        <button onClick={enregistrer} disabled={!!manque || enCours}
          className="bouton bouton-fort disabled:opacity-40">
          {enCours ? 'Enregistrement…'
            : coches.size > 1
              ? `Enregistrer pour ${coches.size} étudiants`
              : 'Enregistrer la décision'}
        </button>
        {/* CE QUI DIT POURQUOI LE BOUTON EST GRIS VIT À CÔTÉ DU BOUTON. */}
        <span className="text-[12px] text-slate-500">
          {manque || `${coches.size} étudiant(s) · ${annee}`}
        </span>
        {erreur && (
          <span className="flex items-start gap-1.5 text-[12px] text-rose-700">
            <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
          </span>
        )}
        <button onClick={onClose} className="bouton ml-auto">Fermer</button>
      </>}>

      <div className="flex-1 min-h-0 overflow-auto p-5 space-y-4">

        {/* 1 — L'UNITÉ. C'est elle qui convoque le conseil des études. */}
        <section className="carte p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            1 · L'unité
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <select value={section} onChange={e => setSection(e.target.value)}
              className="controle text-[13px]">
              <option value="">Toutes les sections</option>
              {sections.map(s => (
                <option key={s.code} value={s.code}>{s.libelle || s.code}</option>
              ))}
            </select>
            {unites.length ? (
              <select value={ueNum} onChange={e => setUeNum(e.target.value)}
                className="controle text-[13px] min-w-[22rem]">
                <option value="">Choisir une unité…</option>
                {unites.map(u => (
                  <option key={u.ue_num} value={u.ue_num}>
                    {u.ue_num} — {u.ue_nom}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-[12px] text-slate-500">
                Aucune unité au référentiel {annee}
                {section ? ' pour cette section' : ''}.
              </span>
            )}
          </div>
        </section>

        {/* 2 — LES ÉTUDIANTS QUE CETTE UNITÉ CONCERNE. */}
        {ueNum && (
          <section className="carte p-0 overflow-hidden">
            <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200">
              <span className="text-[11px] uppercase tracking-wide text-slate-500">
                2 · Les étudiants
              </span>
              <span className="ml-auto text-[12px] text-slate-500">
                {coches.size ? `${coches.size} coché(s)` : 'Aucun coché'}
              </span>
              {libres.length > 0 && (
                <button onClick={toutCocher} className="bouton text-[12px]">
                  {coches.size === libres.length ? 'Tout décocher' : 'Tout cocher'}
                </button>
              )}
              <button onClick={() => setChercheOuvert(o => !o)}
                className="bouton text-[12px]">
                <IconUserPlus size={14} /> Ajouter depuis le fichier
              </button>
            </div>

            {!candidats ? (
              <div className="p-5 text-[13px] text-slate-400">Chargement…</div>
            ) : !tousCandidats.length ? (
              <div className="p-5 text-[13px] text-slate-400">
                Personne n'a cette unité à son programme en {annee} —
                va chercher les étudiants dans le fichier ci-dessous.
              </div>
            ) : (
              <table className="w-full text-[13px]">
                <thead className="tab-entete">
                  <tr>
                    <th className="w-8 px-3 py-1.5"></th>
                    <th className="text-left px-2 py-1.5 font-medium">Étudiant</th>
                    <th className="text-left px-2 py-1.5 font-medium">Section</th>
                    <th className="text-left px-2 py-1.5 font-medium">Origine</th>
                    <th className="text-left px-2 py-1.5 font-medium">Déjà décidé</th>
                  </tr>
                </thead>
                <tbody>
                  {tousCandidats.map(e => {
                    const pris = !!e.valorisation;
                    return (
                      <tr key={e.id}
                        className={`border-b border-slate-100 ${pris ? 'opacity-50'
                          : coches.has(e.id) ? 'bg-iip-blue/5' : ''}`}>
                        <td className="px-3 py-1.5">
                          <input type="checkbox" disabled={pris}
                            checked={coches.has(e.id)}
                            onChange={() => basculer(e.id)}
                            className="w-4 h-4 accent-iip-blue disabled:opacity-40" />
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="font-medium">
                            {(e.nom || '').toUpperCase()} {e.prenom}
                          </span>
                        </td>
                        <td className="px-2 py-1.5 text-slate-500">{e.section || '—'}</td>
                        <td className="px-2 py-1.5 text-slate-500">
                          {e.au_programme ? 'au programme' : 'ajouté'}
                        </td>
                        <td className="px-2 py-1.5">
                          {pris ? (
                            <span className="text-[12px] text-amber-700">
                              {e.valorisation.decision === 'refusee' ? 'Refus'
                                : e.valorisation.type === 'complete' ? 'Dispense totale'
                                  : 'Dispense partielle'}
                            </span>
                          ) : <span className="text-slate-300">—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}

            {/* CHERCHER DANS LE FICHIER, SANS OUVRIR UNE SECONDE FENÊTRE.
                Une fenêtre ouverte depuis une fenêtre se retrouve enfermée
                dans le voile de la première — et surtout, on perdrait de vue
                le tableau qu'on est en train de composer. Le panneau se
                déplie ICI, sous la liste qu'il alimente. */}
            {chercheOuvert && (
              <div className="border-t border-slate-200 bg-slate-50/60 p-3 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <select value={sectionRech} onChange={e => setSectionRech(e.target.value)}
                    className="controle text-[13px]">
                    <option value="">Toutes les sections</option>
                    {sections.map(sec => (
                      <option key={sec.code} value={sec.code}>{sec.libelle || sec.code}</option>
                    ))}
                  </select>
                  <div className="relative">
                    <IconSearch size={14}
                      className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input value={q} onChange={e => setQ(e.target.value)}
                      placeholder="Un nom…" className="controle pl-8 text-[13px]" />
                  </div>
                  <button onClick={ajouterLesPris}
                    disabled={!prisDansRecherche.size}
                    className="bouton disabled:opacity-40 text-[12px]">
                    {prisDansRecherche.size > 1
                      ? `Ajouter ${prisDansRecherche.size} étudiants`
                      : 'Ajouter'}
                  </button>
                  <button onClick={() => { setChercheOuvert(false); setQ(''); }}
                    className="bouton ml-auto text-[12px]">Fermer</button>
                </div>

                <div className="max-h-56 overflow-auto rounded-champ bg-white
                                border border-slate-200">
                  {!resultats ? (
                    <div className="p-3 text-[12px] text-slate-400">Chargement…</div>
                  ) : !resultats.length ? (
                    <div className="p-3 text-[12px] text-slate-400">
                      Personne ne correspond à ce filtre.
                    </div>
                  ) : resultats.map(e => {
                    /* DÉJÀ DANS LE TABLEAU : on le montre, grisé, plutôt que de
                       le faire disparaître — sinon on le cherche trois fois en
                       croyant s'être trompé de nom. */
                    const dedans = dejaListe.has(e.id);
                    return (
                      <label key={e.id}
                        className={`flex items-center gap-2 px-3 py-1.5 border-b
                          border-slate-50 ${dedans ? 'opacity-45'
                            : 'cursor-pointer hover:bg-slate-50'}`}>
                        <input type="checkbox" disabled={dedans}
                          checked={prisDansRecherche.has(e.id)}
                          onChange={() => setPrisDansRecherche(s0 => {
                            const n = new Set(s0);
                            if (n.has(e.id)) n.delete(e.id); else n.add(e.id);
                            return n;
                          })}
                          className="w-4 h-4 accent-iip-blue disabled:opacity-40" />
                        <span className="flex-1 min-w-0">
                          <span className="text-[13px] font-medium">
                            {(e.nom || '').toUpperCase()} {e.prenom}
                          </span>
                          <span className="block text-[11px] text-slate-500 truncate">
                            {e.section_rattachement || e.section || '—'}
                          </span>
                        </span>
                        {dedans && (
                          <span className="text-[11px] text-slate-400">déjà dans la liste</span>
                        )}
                      </label>
                    );
                  })}
                </div>
              </div>
            )}
          </section>
        )}

        {/* 3 — LA DÉCISION, SAISIE UNE FOIS. */}
        {ueNum && (
          <section className="carte p-3 space-y-3">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              3 · La décision du conseil des études
            </div>

            <div className="flex flex-wrap gap-2">
              {[
                { v: 'accordee', l: 'Accordée' },
                { v: 'refusee', l: 'Refusée' },
              ].map(d => (
                <label key={d.v}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-champ
                    border cursor-pointer text-[13px]
                    ${decision === d.v ? 'border-iip-blue bg-iip-blue/5'
                      : 'border-slate-200'}`}>
                  <input type="radio" checked={decision === d.v}
                    onChange={() => setDecision(d.v)} className="accent-iip-blue" />
                  {d.l}
                </label>
              ))}
            </div>

            {decision === 'refusee' ? (
              /* UN REFUS SE MOTIVE (RDE art. 88 §3), et le même motif vaut pour
                 tout le lot : c'est la même demande, examinée à la même séance. */
              <label className="block">
                <span className="text-[12px] text-slate-600">
                  Motif du refus — il figurera sur le procès-verbal
                </span>
                <textarea value={motif} onChange={e => setMotif(e.target.value)}
                  rows={3} className="controle w-full h-auto text-[13px] mt-1"
                  placeholder="Ce qui fonde le refus, acquis par acquis si nécessaire…" />
              </label>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {[
                    { v: 'unite', l: "Toute l'unité",
                      a: 'Tous les acquis — dispense complète' },
                    { v: 'cours', l: 'Des cours', a: "Les activités d'enseignement cochées" },
                    { v: 'acquis', l: 'Des acquis au choix', a: 'Les acquis cochés' },
                  ].map(p => (
                    <label key={p.v} title={p.a}
                      className={`flex items-center gap-1.5 px-3 py-1.5 rounded-champ
                        border cursor-pointer text-[13px]
                        ${portee === p.v ? 'border-iip-blue bg-iip-blue/5'
                          : 'border-slate-200'}`}>
                      <input type="radio" checked={portee === p.v}
                        onChange={() => setPortee(p.v)} className="accent-iip-blue" />
                      {p.l}
                    </label>
                  ))}
                </div>

                {portee === 'unite' && (
                  <p className="text-[12px] text-slate-500">
                    L'unité entière et tous ses acquis : le procès-verbal sort en
                    dispense complète, avec l'attestation de réussite.
                  </p>
                )}

                {portee === 'cours' && (
                  <div className="space-y-1">
                    {!composantes ? (
                      <div className="text-[12px] text-slate-400">Chargement des cours…</div>
                    ) : !composantes.cours?.length ? (
                      <div className="text-[12px] text-slate-500">
                        Cette unité n'a aucun cours encodé pour {annee}.
                      </div>
                    ) : composantes.cours.map(c => (
                      <label key={c.cours_code}
                        className="flex items-center gap-2 px-2 py-1 rounded-champ
                                   hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={coursCoches.has(c.cours_code)}
                          onChange={() => basculerSet(setCoursCoches)(c.cours_code)}
                          className="w-4 h-4 accent-iip-blue" />
                        <span className="text-[13px]">{c.cours_nom || c.cours_code}</span>
                        <span className="text-[11px] text-slate-400">{c.cours_code}</span>
                      </label>
                    ))}
                  </div>
                )}

                {portee === 'acquis' && (
                  <div className="space-y-2">
                    {!composantes ? (
                      <div className="text-[12px] text-slate-400">Chargement des acquis…</div>
                    ) : !composantes.aas?.length ? (
                      <div className="text-[12px] text-slate-500">
                        Cette unité n'a aucun acquis encodé.
                      </div>
                    ) : [...aasParCours.entries()].map(([code, liste]) => (
                      <div key={code}>
                        <div className="tab-repere px-2 py-1 text-[12px] font-medium">
                          {composantes.cours?.find(c => c.cours_code === code)?.cours_nom
                            || code}
                        </div>
                        {liste.map(a => (
                          <label key={a.aa_code}
                            className="flex items-start gap-2 px-2 py-1 rounded-champ
                                       hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={aaCoches.has(a.aa_code)}
                              onChange={() => basculerSet(setAaCoches)(a.aa_code)}
                              className="w-4 h-4 mt-0.5 accent-iip-blue" />
                            <span className="text-[13px]">
                              {a.description || a.aa_code}
                              <span className="ml-1.5 text-[11px] text-slate-400">
                                {a.aa_code}
                              </span>
                            </span>
                          </label>
                        ))}
                      </div>
                    ))}
                    {/* Le constat d'équivalence est celui que le serveur propose :
                        deux libellés, un affiché et un enregistré, finiraient par
                        diverger. Il se corrige ensuite dossier par dossier. */}
                    <p className="text-[12px] text-slate-500">
                      Chaque acquis coché part avec le constat d'équivalence proposé ;
                      il se corrige ensuite sur la ligne de l'étudiant.
                    </p>
                  </div>
                )}

                <div className="flex flex-wrap items-end gap-3">
                  <label className="block">
                    <span className="text-[12px] text-slate-600">Pourcentage</span>
                    <input value={pourcentage} inputMode="numeric"
                      onChange={e => setPourcentage(e.target.value.replace(/[^\d]/g, ''))}
                      className="controle w-24 text-[13px] mt-1" />
                  </label>
                  <label className="block">
                    <span className="text-[12px] text-slate-600">
                      Date de décision du Conseil
                    </span>
                    <input type="date" value={dateCE}
                      onChange={e => setDateCE(e.target.value)}
                      className="controle text-[13px] mt-1" />
                  </label>
                </div>
              </>
            )}

            <label className="block">
              <span className="text-[12px] text-slate-600">
                Remarque du Conseil — imprimée sur le procès-verbal
              </span>
              <textarea value={remarque} onChange={e => setRemarque(e.target.value)}
                rows={2} className="controle w-full h-auto text-[13px] mt-1"
                placeholder="Ex. : dispensé des heures de stage, mais doit présenter l'examen." />
            </label>

            {uniteChoisie && (
              <p className="text-[11px] text-slate-400">
                Unité {uniteChoisie.ue_num} — {uniteChoisie.ue_nom} · {annee}
              </p>
            )}
          </section>
        )}

        {/* LE LOT EST TOUT OU RIEN, ET ON DIT QUI L'A ARRÊTÉ. */}
        {doublons?.length > 0 && (
          <section className="carte p-3">
            <div className="flex items-center gap-1.5 text-[13px] text-amber-800">
              <IconAlertTriangle size={15} />
              Rien n'a été enregistré : ces étudiants portent déjà une décision
              sur cette unité.
            </div>
            <ul className="mt-2 space-y-0.5">
              {doublons.map(d => (
                <li key={d.etudiant_id} className="text-[12px] text-slate-600">
                  {(d.nom || '').toUpperCase()} {d.prenom} —{' '}
                  {d.decision === 'refusee' ? 'refus'
                    : d.type === 'complete' ? 'dispense totale' : 'dispense partielle'}
                </li>
              ))}
            </ul>
            <p className="mt-2 text-[12px] text-slate-500">
              Décoche-les pour enregistrer les autres, ou corrige leur décision
              sur leur ligne : une décision du Conseil ne s'écrase pas.
            </p>
          </section>
        )}
      </div>
    </Fenetre>
  );
}

/* ══ LE DOSSIER ET SON CIRCUIT ════════════════════════════════════════════ */

/**
 * LE CIRCUIT DE LA PROCÉDURE, DANS L'ORDRE, AVEC QUI A FAIT QUOI.
 *
 * Lucie enregistrait une DÉCISION ; la procédure de l'IIP décrit un DOSSIER qui
 * traverse dix étapes. La différence n'est pas théorique : en septembre 2026,
 * une attestation erronée est sortie d'un dossier que personne n'avait
 * instruit — sans avis du chargé de cours, sans base légale, sans motivation —
 * et elle est partie avec la signature de la direction et le cachet de
 * l'établissement.
 *
 * Cette fenêtre montre donc ce que l'écran cachait : où en est le dossier, ce
 * qui manque pour l'étape suivante, si la demande est hors délai, et le
 * JOURNAL — la suite des gestes, avec le nom de chacun. Une procédure
 * contournée ne se voit jamais dans l'état final : le dossier ressemble à un
 * dossier normal. C'est l'ordre des gestes qui la révèle.
 *
 * Les contrôles ne sont pas ici : ils sont sur le serveur, et cette fenêtre ne
 * fait que les afficher. Un bouton grisé empêche de cliquer, il n'empêche pas
 * d'appeler la route.
 */
function FenetreDossier({ vid, onClose, onChange }) {
  const [d, setD] = useState(null);
  const [ref, setRef] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/etudiants/valorisations/${vid}/dossier`,
        { headers: authHeaders() });
      setD(r.ok ? await r.json() : null);
    } catch { setD(null); }
  }, [vid]);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    fetch('/api/etudiants/valorisations/referentiel', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setRef).catch(() => {});
  }, []);

  async function agir(chemin, corps, methode = 'PUT') {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/etudiants/valorisations/${vid}/${chemin}`, {
        method: methode, headers: authHeaders(), body: JSON.stringify(corps || {}),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return false; }
      await charger(); await onChange?.();
      return true;
    } catch (e) { setErreur(e.message); return false; }
    finally { setEnCours(false); }
  }

  if (!d) {
    return (
      <Fenetre icone={IconCertificate} large="grande" onFermer={onClose}
        titre="Dossier de valorisation" sous="Chargement…">
        <div className="p-6 text-[13px] text-slate-400">Chargement…</div>
      </Fenetre>
    );
  }

  const v = d.dossier;
  const qui = `${(v.nom || '').toUpperCase()} ${v.prenom || ''}`.trim();

  return (
    <Fenetre icone={IconCertificate} large="grande" onFermer={onClose}
      titre={`Dossier — ${qui}`}
      sous={`Unité ${v.ue_num}${d.unite?.ue_nom ? ` · ${d.unite.ue_nom}` : ''} · ${v.annee_scolaire}`}
      pied={<>
        <span className="text-[12px] text-slate-600">
          État : <b>{(ref?.etats || []).find(e => e.val === v.etat)?.label || v.etat}</b>
        </span>
        {erreur && (
          <span className="flex items-start gap-1.5 text-[12px] text-rose-700">
            <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
          </span>
        )}
        <button onClick={onClose} className="bouton ml-auto">Fermer</button>
      </>}>

      <div className="flex-1 min-h-0 overflow-auto p-5 space-y-3">

        {/* CE QUI EMPÊCHE LA PIÈCE DE SORTIR — EN TÊTE, PAS EN BAS.
            Le découvrir au moment d'imprimer, c'est le découvrir devant
            quelqu'un qui attend son attestation. */}
        {!d.piece.ok && (
          <section className="carte p-3 border-l-[3px] border-l-amber-600">
            <div className="text-[13px] font-medium text-slate-800">
              Ce dossier ne peut pas produire d'attestation en l'état
            </div>
            <ul className="mt-1.5 space-y-0.5">
              {d.piece.manques.map((m, i) => (
                <li key={i} className="text-[12px] text-slate-600">· {m}</li>
              ))}
            </ul>
          </section>
        )}

        {!d.unite_valorisable && (
          <section className="carte p-3 border-l-[3px] border-l-rose-700">
            <div className="text-[13px] text-rose-800">{d.unite_motif}</div>
          </section>
        )}

        {/* ÉTAPE 2 — L'INTRODUCTION ET LE DÉLAI. */}
        <EtapeDemande dossier={v} delai={d.delai} onEnregistrer={c => agir('demande', c)}
          enCours={enCours} />

        {/* ÉTAPE 3 — LA RECEVABILITÉ. */}
        <EtapeRecevabilite dossier={v} onEnregistrer={c => agir('recevabilite', c)}
          enCours={enCours} />

        {/* ÉTAPE 4 — L'AVIS DU CHARGÉ DE COURS. */}
        <EtapeAvis dossier={v} onEnregistrer={c => agir('avis', c)} enCours={enCours} />

        {/* ÉTAPE 5 — LE TEST, QUAND LE CONSEIL NE PEUT PAS TRANCHER SUR PIÈCES. */}
        <EtapeTest dossier={v} onEnregistrer={c => agir('test', c)} enCours={enCours} />

        {/* ÉTAPE 6 — LA DÉCISION DU CONSEIL. */}
        <EtapeDecision dossier={v} bases={ref?.bases || []}
          onEnregistrer={c => agir('decision', c)} enCours={enCours} />

        {/* ÉTAPE 6 BIS — LA VALIDATION. C'EST ELLE QUI ENGAGE LA SIGNATURE. */}
        <EtapeValidation dossier={v} peutValider={d.peut_valider}
          peutDevalider={d.peut_devalider} manques={d.manques}
          onValider={() => agir('validation', {})}
          onRetirer={motif => agir('validation', { motif }, 'DELETE')}
          enCours={enCours} />

        {/* ÉTAPES 7, 8, 10 — LES GESTES ADMINISTRATIFS. */}
        <section className="carte p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            7 · 8 · 10 — Notification, encodage, archivage
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              ['notification', 'Notifier à l’étudiant', v.notifie_le, v.notifie_par],
              ['eprom', 'Encodé dans eProm', v.eprom_le, v.eprom_par],
              ['archivage', 'Archivé (4 ans)', v.archive_le, null],
            ].map(([chemin, label, fait, par]) => (
              <button key={chemin} disabled={enCours || !!fait || !v.decision_le}
                onClick={() => agir(chemin, { pae_maj: chemin === 'notification' })}
                className={`bouton disabled:opacity-40 text-[12px]
                  ${fait ? 'border-emerald-600 text-emerald-800' : ''}`}>
                {fait ? `✓ ${label}` : label}
                {fait && par ? ` · ${par}` : ''}
              </button>
            ))}
          </div>
          <p className="text-[11px] text-slate-500">
            L'encodage eProm vaut pour les décisions positives <b>comme</b> négatives :
            une décision non encodée est une décision non conforme
            (AGCF du 13.12.2024, art. 5 al. 3).
          </p>
        </section>

        {/* LE JOURNAL — CE QUI RÉVÈLE UNE PROCÉDURE CONTOURNÉE. */}
        <section className="carte p-0 overflow-hidden">
          <div className="tab-entete px-3 py-1.5 text-[11px] uppercase tracking-wide">
            Journal du dossier — en ajout seul, rien ne s'y efface
          </div>
          {!d.journal.length ? (
            <div className="p-3 text-[12px] text-slate-400">
              Aucun geste enregistré : ce dossier est antérieur au suivi du circuit.
            </div>
          ) : (
            <table className="w-full text-[12px]">
              <tbody>
                {d.journal.map(l => (
                  <tr key={l.id} className="border-b border-slate-100">
                    <td className="px-3 py-1 text-slate-500 whitespace-nowrap">{l.horodatage}</td>
                    <td className="px-2 py-1 font-medium">{l.etape}</td>
                    <td className="px-2 py-1">{l.acteur_nom || '—'}
                      {l.acteur_role ? <span className="text-slate-400"> ({l.acteur_role})</span> : null}
                    </td>
                    <td className="px-2 py-1 text-slate-600">{l.detail || ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </Fenetre>
  );
}

/** Étape 2 — la date d'introduction, et le délai qu'elle permet enfin de contrôler. */
function EtapeDemande({ dossier, delai, onEnregistrer, enCours }) {
  const [dd, setDd] = useState(dossier.date_demande || aujourdHui());
  const [dr, setDr] = useState(dossier.date_reception || aujourdHui());
  const [mode, setMode] = useState(dossier.mode_introduction || '');
  return (
    <section className="carte p-3 space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        2 — L'introduction de la demande
      </div>
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-[12px] text-slate-600">Date du formulaire</span>
          <input type="date" value={dd} onChange={e => setDd(e.target.value)}
            className="controle text-[13px] mt-1" />
        </label>
        <label className="block">
          <span className="text-[12px] text-slate-600">Date d'envoi ou de dépôt</span>
          <input type="date" value={dr} onChange={e => setDr(e.target.value)}
            className="controle text-[13px] mt-1" />
        </label>
        <label className="block">
          <span className="text-[12px] text-slate-600">Mode</span>
          <select value={mode} onChange={e => setMode(e.target.value)}
            className="controle text-[13px] mt-1">
            <option value="">—</option>
            <option value="courriel">Courriel</option>
            <option value="papier">Papier</option>
            <option value="rendez-vous">Rendez-vous (diplôme étranger)</option>
          </select>
        </label>
        <button onClick={() => onEnregistrer({ date_demande: dd, date_reception: dr,
                                               mode_introduction: mode })}
          disabled={enCours} className="bouton disabled:opacity-40">Enregistrer</button>
      </div>
      {/* LA DATE D'ENVOI PRIME SUR CELLE DU FORMULAIRE — sans quoi il suffirait
          d'antidater le formulaire pour rentrer dans les délais. */}
      <p className={`text-[12px] ${delai?.hors_delai ? 'text-rose-700' : 'text-slate-500'}`}>
        {delai?.hors_delai
          ? `⚠ Demande HORS DÉLAI : ${delai.explication}`
          : delai?.explication || ''}
      </p>
    </section>
  );
}

/** Étape 3 — la recevabilité. Un refus de forme n'est pas un refus pédagogique. */
function EtapeRecevabilite({ dossier, onEnregistrer, enCours }) {
  const [motif, setMotif] = useState(dossier.motif_irrecevabilite || '');
  const fait = dossier.recevable != null;
  return (
    <section className="carte p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">
          3 — La recevabilité (coordination, 5 jours ouvrables)
        </span>
        {fait && (
          <span className={`text-[12px] ${dossier.recevable ? 'text-emerald-800' : 'text-rose-700'}`}>
            ✓ {dossier.recevable ? 'Recevable' : 'Irrecevable'}
            {dossier.recevabilite_par ? ` · ${dossier.recevabilite_par}` : ''}
            {dossier.recevabilite_le ? ` · ${dossier.recevabilite_le}` : ''}
          </span>
        )}
      </div>
      {!fait && (
        <>
          <p className="text-[12px] text-slate-500">
            Délai respecté, formulaire complet et signé, pièces officielles numérotées
            et surlignées, originaux présentés. Une demande hors délai ou un dossier
            incomplet est déclaré irrecevable : c'est un refus <b>de forme</b>, distinct
            d'un refus pédagogique, et il se motive.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <button onClick={() => onEnregistrer({ recevable: true })} disabled={enCours}
              className="bouton disabled:opacity-40">Déclarer recevable</button>
            <label className="flex-1 min-w-[16rem]">
              <span className="text-[12px] text-slate-600">Motif de forme</span>
              <input value={motif} onChange={e => setMotif(e.target.value)}
                placeholder="Hors délai · formulaire incomplet · pièces non officielles…"
                className="controle w-full text-[13px] mt-1" />
            </label>
            <button onClick={() => onEnregistrer({ recevable: false, motif_irrecevabilite: motif })}
              disabled={enCours || !motif.trim()}
              className="bouton bouton-detruire disabled:opacity-40">Irrecevable</button>
          </div>
        </>
      )}
      {fait && !dossier.recevable && (
        <p className="text-[12px] text-slate-600">Motif : {dossier.motif_irrecevabilite}</p>
      )}
    </section>
  );
}

/** Étape 4 — l'avis écrit du chargé de cours. C'est la pièce qui manquait. */
function EtapeAvis({ dossier, onEnregistrer, enCours }) {
  const [sens, setSens] = useState(dossier.avis_sens || '');
  const [texte, setTexte] = useState(dossier.avis_texte || '');
  const bloque = dossier.recevable !== 1;
  return (
    <section className="carte p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">
          4 — L'avis du chargé de cours (10 jours ouvrables)
        </span>
        {dossier.avis_le && (
          <span className="text-[12px] text-emerald-800">
            ✓ {dossier.avis_sens}
            {dossier.avis_par ? ` · ${dossier.avis_par}` : ''} · {dossier.avis_le}
          </span>
        )}
      </div>
      {bloque ? (
        <p className="text-[12px] text-slate-500">
          {dossier.recevable === 0
            ? "Le dossier est irrecevable : il ne se transmet pas au chargé de cours."
            : "La recevabilité doit être contrôlée d'abord (étape 3)."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {[['favorable', 'Favorable'], ['partiel', 'Partiel'], ['defavorable', 'Défavorable']]
              .map(([v, l]) => (
                <label key={v}
                  className={`px-3 py-1.5 rounded-champ border cursor-pointer text-[13px]
                    ${sens === v ? 'border-iip-blue bg-iip-blue/5' : 'border-slate-200'}`}>
                  <input type="radio" checked={sens === v} onChange={() => setSens(v)}
                    className="mr-1.5 accent-iip-blue" />{l}
                </label>
              ))}
          </div>
          {/* UN AVIS SANS TEXTE N'EST PAS UN AVIS. Les décisions de VA ne sont
              pas susceptibles de recours : la motivation est tout ce qui reste. */}
          <textarea value={texte} onChange={e => setTexte(e.target.value)} rows={3}
            className="controle w-full h-auto text-[13px]"
            placeholder="Comparaison des preuves au dossier pédagogique : contenus, volume horaire, crédits, résultats obtenus…" />
          <button onClick={() => onEnregistrer({ avis_sens: sens, avis_texte: texte })}
            disabled={enCours || !sens || !texte.trim()}
            className="bouton disabled:opacity-40">
            {dossier.avis_le ? "Corriger l'avis" : "Enregistrer l'avis"}
          </button>
        </>
      )}
    </section>
  );
}

/** Étape 6 — la décision du Conseil, avec sa base. Les 50 % ne se saisissent pas. */
function EtapeDecision({ dossier, bases, onEnregistrer, enCours }) {
  const [type, setType] = useState(dossier.type || 'complete');
  const [decision, setDecision] = useState(dossier.decision || 'accordee');
  const [base, setBase] = useState(dossier.base_code || '');
  const [motif, setMotif] = useState(dossier.motif_refus || '');
  const [dateCE, setDateCE] = useState(dossier.decision_ce_date || aujourdHui());
  const bloque = dossier.recevable !== 1 || !dossier.avis_le;
  const refus = decision === 'refusee';

  /* ON NE RÉCLAME PAS CE QU'ON NE DONNE PAS À SAISIR.
   *
   * La fenêtre proposait « dispense partielle » sans aucun moyen de désigner
   * les activités ou les acquis dispensés : le serveur refusait — à juste
   * titre, c'est la loi — et l'écran ne laissait aucune issue. Un message qui
   * réclame ce qu'aucun champ ne permet d'entrer est un cul-de-sac, pas un
   * garde-fou. Les composantes de l'UNITÉ font foi ici aussi, jamais le
   * programme de l'étudiant. */
  const [composantes, setComposantes] = useState(null);
  const [cible, setCible] = useState(dossier.cible || 'cours');
  const [coches, setCoches] = useState(() => new Set(
    String(dossier.cible_detail || '').split(',').map(x => x.trim()).filter(Boolean)));

  useEffect(() => {
    if (type !== 'partielle' || composantes) return;
    fetch(`/api/etudiants/ue/${dossier.ue_num}/composantes?annee=${encodeURIComponent(dossier.annee_scolaire)}`,
      { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setComposantes).catch(() => {});
  }, [type, composantes, dossier.ue_num, dossier.annee_scolaire]);

  // Changer de cible vide la sélection : des codes de cours laissés dans une
  // liste d'acquis produiraient une dispense qui ne désigne rien.
  const changerCible = c => { setCible(c); setCoches(new Set()); };
  const basculer = v => setCoches(s0 => {
    const n = new Set(s0);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  });

  const aasParCours = useMemo(() => {
    const m = new Map();
    for (const a of (composantes?.aas || [])) {
      const c = a.cours_code || '—';
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(a);
    }
    return m;
  }, [composantes]);

  return (
    <section className="carte p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">
          6 — La décision du Conseil des études
        </span>
        {dossier.decision_le && (
          <span className="text-[12px] text-emerald-800">
            ✓ {dossier.decision === 'refusee' ? 'Refus' : `Accord · ${dossier.base_code || '?'}`}
            {dossier.decision_par ? ` · ${dossier.decision_par}` : ''} · {dossier.decision_le}
          </span>
        )}
      </div>
      {bloque ? (
        <p className="text-[12px] text-slate-500">
          {dossier.recevable !== 1
            ? 'La recevabilité doit être contrôlée (étape 3).'
            : "L'avis écrit du chargé de cours manque (étape 4) : c'est lui qui fonde la décision."}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-2">
            {[['accordee', 'Accord'], ['refusee', 'Refus']].map(([v, l]) => (
              <label key={v}
                className={`px-3 py-1.5 rounded-champ border cursor-pointer text-[13px]
                  ${decision === v ? 'border-iip-blue bg-iip-blue/5' : 'border-slate-200'}`}>
                <input type="radio" checked={decision === v} onChange={() => setDecision(v)}
                  className="mr-1.5 accent-iip-blue" />{l}
              </label>
            ))}
          </div>

          {refus ? (
            <textarea value={motif} onChange={e => setMotif(e.target.value)} rows={3}
              className="controle w-full h-auto text-[13px]"
              placeholder="Ce qui fonde le refus : contenu non comparable, volume horaire insuffisant, formation de plus de 5 ans, pièce non officielle…" />
          ) : (
            <div className="flex flex-wrap items-end gap-3">
              <label className="block">
                <span className="text-[12px] text-slate-600">Finalité</span>
                <select value={type} onChange={e => setType(e.target.value)}
                  className="controle text-[13px] mt-1">
                  <option value="admission">Admission (art. 2)</option>
                  <option value="partielle">Dispense partielle (art. 3)</option>
                  <option value="complete">Dispense complète (art. 4)</option>
                </select>
              </label>
              {/* LA BASE N'EST PAS DÉCORATIVE : c'est elle qui part dans eProm,
                  et sans elle la décision n'est pas conforme. */}
              <label className="block">
                <span className="text-[12px] text-slate-600">Base de la décision</span>
                <select value={base} onChange={e => setBase(e.target.value)}
                  className="controle text-[13px] mt-1 min-w-[22rem]">
                  <option value="">Choisir…</option>
                  {bases.map(b => (
                    <option key={b.code} value={b.code}>
                      {b.famille} {b.code} — {b.libelle}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}

          {/* CE QUI EST DISPENSÉ — obligatoire dès que la dispense est partielle. */}
          {!refus && type === 'partielle' && (
            <div className="space-y-2 border-l-2 border-slate-200 pl-3">
              <div className="flex flex-wrap gap-2">
                {[['cours', "Des activités d'enseignement"], ['aa', 'Des acquis']].map(([v, l]) => (
                  <label key={v}
                    className={`px-3 py-1.5 rounded-champ border cursor-pointer text-[13px]
                      ${cible === v ? 'border-iip-blue bg-iip-blue/5' : 'border-slate-200'}`}>
                    <input type="radio" checked={cible === v} onChange={() => changerCible(v)}
                      className="mr-1.5 accent-iip-blue" />{l}
                  </label>
                ))}
              </div>

              {!composantes ? (
                <div className="text-[12px] text-slate-400">Chargement des composantes de l'unité…</div>
              ) : cible === 'cours' ? (
                !composantes.cours?.length ? (
                  <div className="text-[12px] text-slate-500">
                    Cette unité n'a aucun cours encodé pour {dossier.annee_scolaire}.
                  </div>
                ) : composantes.cours.map(c => (
                  /* DISPENSER UN COURS, C'EST DISPENSER SES ACQUIS — ALORS ON
                     LES MONTRE. Cocher « Théorie des soins » sans voir ce
                     qu'elle couvre, c'est décider à l'aveugle ; et le
                     procès-verbal, lui, devra dire quels acquis restent à
                     évaluer. Ils sont en lecture : ici on dispense le COURS,
                     c'est l'autre cible qui dispense acquis par acquis. */
                  <div key={c.cours_code} className="py-0.5">
                    <label className="flex items-center gap-2 px-2 py-1 rounded-champ
                                      hover:bg-slate-50 cursor-pointer">
                      <input type="checkbox" checked={coches.has(c.cours_code)}
                        onChange={() => basculer(c.cours_code)}
                        className="w-4 h-4 accent-iip-blue" />
                      <span className="text-[13px]">{c.cours_nom || c.cours_code}</span>
                      <span className="text-[11px] text-slate-400">{c.cours_code}</span>
                    </label>
                    <ul className="ml-8 mb-1">
                      {(aasParCours.get(c.cours_code) || []).map(a => (
                        <li key={a.aa_code} className="text-[11px] text-slate-500">
                          · {a.description || a.aa_code}
                          <span className="ml-1 text-slate-400">{a.aa_code}</span>
                        </li>
                      ))}
                      {!(aasParCours.get(c.cours_code) || []).length && (
                        <li className="text-[11px] text-slate-400">
                          Aucun acquis encodé pour ce cours.
                        </li>
                      )}
                    </ul>
                  </div>
                ))
              ) : (
                !composantes.aas?.length ? (
                  <div className="text-[12px] text-slate-500">Cette unité n'a aucun acquis encodé.</div>
                ) : [...aasParCours.entries()].map(([code, liste]) => (
                  <div key={code}>
                    <div className="tab-repere px-2 py-1 text-[12px] font-medium">
                      {composantes.cours?.find(c => c.cours_code === code)?.cours_nom || code}
                    </div>
                    {liste.map(a => (
                      <label key={a.aa_code}
                        className="flex items-start gap-2 px-2 py-1 rounded-champ
                                   hover:bg-slate-50 cursor-pointer">
                        <input type="checkbox" checked={coches.has(a.aa_code)}
                          onChange={() => basculer(a.aa_code)}
                          className="w-4 h-4 mt-0.5 accent-iip-blue" />
                        <span className="text-[13px]">
                          {a.description || a.aa_code}
                          <span className="ml-1.5 text-[11px] text-slate-400">{a.aa_code}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                ))
              )}
              {/* UNE PARTIELLE NE PEUT PAS TOUT COUVRIR (RDE art. 29 §2) : on le
                  dit ici plutôt que de le faire découvrir au refus du serveur. */}
              {cible === 'cours' && composantes?.cours?.length > 0
                && composantes.cours.every(c => coches.has(c.cours_code)) && (
                <p className="text-[12px] text-[#9D4A38]">
                  Toutes les activités sont cochées : une dispense partielle ne peut pas
                  couvrir l'unité entière (RDE art. 29 §2). C'est alors une dispense complète.
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="text-[12px] text-slate-600">Date de la décision</span>
              <input type="date" value={dateCE} onChange={e => setDateCE(e.target.value)}
                className="controle text-[13px] mt-1" />
            </label>
            {!refus && type !== 'admission' && (
              <p className="text-[12px] text-slate-500 pb-2">
                Réussite fixée à <b>50 %</b> — elle ne se saisit pas (RDE art. 29 §3 et 30).
              </p>
            )}
          </div>

          <button
            onClick={() => onEnregistrer({
              type, decision, base_code: base, motif_refus: motif,
              decision_ce_date: dateCE,
              ...(type === 'partielle'
                ? { cible, cible_detail: [...coches].join(','),
                    ...(cible === 'aa'
                      ? { equivalences: [...coches].map(code => ({ aa_code: code })) } : {}) }
                : {}),
            })}
            disabled={enCours || (refus ? !motif.trim()
              : !base || (type === 'partielle' && !coches.size))}
            className="bouton bouton-fort disabled:opacity-40">
            {dossier.decision_le ? 'Corriger la décision' : 'Enregistrer la décision'}
          </button>
          {!refus && !base && (
            <span className="ml-2 text-[12px] text-slate-500">
              La base est obligatoire : elle est encodée dans eProm.
            </span>
          )}
          {!refus && base && type === 'partielle' && !coches.size && (
            <span className="ml-2 text-[12px] text-slate-500">
              Coche ce qui est dispensé : des activités d'enseignement, ou des acquis.
            </span>
          )}
        </>
      )}
    </section>
  );
}

/* ══ CE QUI RESTE À FAIRE ═════════════════════════════════════════════════ */

/**
 * UN RETARD NE SE VOIT PAS DOSSIER PAR DOSSIER, IL SE VOIT EN BLOC.
 *
 * Sans cet écran, la non-conformité se découvre à l'inspection : c'est trop
 * tard, et l'établissement n'a rien à opposer. Les paquets sont ceux des
 * délais de la procédure — et « encodage eProm » y figure parce qu'une
 * décision non encodée est une décision non conforme, positive comme négative.
 */
function CeQuiResteAFaire({ annee, onOuvrir }) {
  const [j, setJ] = useState(null);
  useEffect(() => {
    fetch(`/api/etudiants/valorisations/en-retard?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(setJ).catch(() => setJ(null));
  }, [annee]);

  if (!j) return null;
  const TUILES = [
    ['recevabilite', 'Recevabilité à contrôler', '5 jours ouvrables'],
    ['avis', 'Avis du chargé de cours', '10 jours ouvrables'],
    ['decision', 'Décision du Conseil', "avant le premier dixième de l'UE"],
    ['notification', 'À notifier', '2 jours ouvrables'],
    ['eprom', 'À encoder dans eProm', '5 jours ouvrables — obligatoire'],
    ['sans_base', 'Sans base VAF/VANFI', 'décision non encodable'],
    ['hors_delai', 'Introduites hors délai', 'RDE art. 28'],
    ['sans_preuve', 'Sans aucune preuve', 'archivage 4 ans'],
    ['test_sans_copie', 'Test sans copie au dossier', 'conservation 4 ans'],
  ].filter(([k]) => (j.paquets[k] || []).length);

  if (!TUILES.length) return null;
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      {TUILES.map(([k, titre, aide]) => {
        const liste = j.paquets[k];
        return (
          <div key={k} className="bg-white border border-slate-200 rounded-carte
                                  border-l-[3px] border-l-amber-600 p-2.5">
            <div className="text-[17px] font-semibold text-iip-blue">{liste.length}</div>
            <div className="text-[12px] text-slate-700">{titre}</div>
            <div className="text-[11px] text-slate-400">{aide}</div>
            <div className="mt-1 space-y-0.5">
              {liste.slice(0, 4).map(x => (
                <button key={x.id} onClick={() => onOuvrir(x.id)}
                  className="block text-left text-[11px] text-slate-600 hover:text-iip-blue">
                  {(x.nom || '').toUpperCase()} {x.prenom} · UE {x.ue_num}
                </button>
              ))}
              {liste.length > 4 && (
                <div className="text-[11px] text-slate-400">et {liste.length - 4} autre(s)…</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}


/**
 * ÉTAPE 6 BIS — LA VALIDATION PAR LA DIRECTION OU SON DÉLÉGUÉ.
 *
 * LA COORDINATION INSTRUIT, LA DIRECTION VALIDE. Deux gestes, deux mains :
 * si celui qui instruit valide aussi, la case ne garantit rien de plus
 * qu'avant — c'est la même personne qui décide et qui se relit, et c'est
 * exactement ce qui s'est produit en septembre 2026.
 *
 * Une fois validé, le dossier est GELÉ : plus de correction de la
 * recevabilité, de l'avis ni de la décision. Une pièce signée ne doit pas
 * pouvoir reposer sur un dossier retouché après coup. Pour corriger, la
 * direction retire la validation, et elle motive ce retrait — le journal
 * garde les deux gestes.
 */
function EtapeValidation({ dossier, peutValider, peutDevalider, manques,
                           onValider, onRetirer, enCours }) {
  const [motif, setMotif] = useState('');
  const [retrait, setRetrait] = useState(false);
  // « Ce qui manque » moins la validation elle-même : sinon elle se
  // reprocherait à elle-même de ne pas avoir eu lieu.
  const bloquants = (manques || []).filter(m => !m.startsWith('Le dossier n’a pas été validé'));
  const valide = !!dossier.valide_le;

  return (
    <section className={`carte p-3 space-y-2
      ${valide ? 'border-l-[3px] border-l-emerald-700' : ''}`}>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">
          6 bis — La validation par la direction
        </span>
        {valide && (
          <span className="text-[12px] text-emerald-800">
            ✓ Validé par <b>{dossier.valide_par || '—'}</b>
            {dossier.valide_role ? ` (${dossier.valide_role})` : ''} · {dossier.valide_le}
          </span>
        )}
      </div>

      {valide ? (
        <>
          <p className="text-[12px] text-slate-500">
            Le dossier est gelé : recevabilité, avis et décision ne se modifient plus.
          </p>
          {peutDevalider && (
            retrait ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex-1 min-w-[18rem]">
                  <span className="text-[12px] text-slate-600">
                    Motif du retrait — une pièce a pu partir sur la foi de cette validation
                  </span>
                  <input value={motif} onChange={e => setMotif(e.target.value)}
                    className="controle w-full text-[13px] mt-1" />
                </label>
                <button onClick={() => onRetirer(motif)} disabled={enCours || !motif.trim()}
                  className="bouton bouton-detruire disabled:opacity-40">
                  Retirer la validation
                </button>
                <button onClick={() => setRetrait(false)} className="bouton">Annuler</button>
              </div>
            ) : (
              <button onClick={() => setRetrait(true)} className="bouton text-[12px]">
                Retirer la validation
              </button>
            )
          )}
        </>
      ) : !peutValider ? (
        /* ON DIT QUI PEUT, PLUTÔT QUE DE CACHER LE BOUTON. Un bouton absent
           laisse croire à une panne ; une phrase dit à qui s'adresser. */
        <p className="text-[12px] text-slate-500">
          En attente de validation par la direction ou la direction adjointe —
          c'est ce geste qui engage la signature.
        </p>
      ) : bloquants.length ? (
        <>
          <p className="text-[12px] text-slate-600">
            Ce dossier ne peut pas encore être validé :
          </p>
          <ul className="space-y-0.5">
            {bloquants.map((m, i) => (
              <li key={i} className="text-[12px] text-slate-600">· {m}</li>
            ))}
          </ul>
        </>
      ) : (
        <>
          <p className="text-[12px] text-slate-600">
            Le dossier est complet. En validant, vous engagez la signature de
            l'établissement sur les pièces qui en sortiront — votre nom et
            l'heure sont conservés au journal.
          </p>
          <button onClick={onValider} disabled={enCours}
            className="bouton bouton-fort disabled:opacity-40">
            Valider ce dossier
          </button>
        </>
      )}
    </section>
  );
}


/**
 * ÉTAPE 5 — LE TEST OU L'ÉPREUVE COMPLÉMENTAIRE.
 *
 * Quand le Conseil ne peut pas se prononcer sur pièces, il fixe un test
 * (AGCF du 13.12.2024, art. 2 §3, art. 4 §2 et art. 6). Pour une ADMISSION, ce
 * test porte sur les capacités préalables requises : à l'IIP, le français et
 * les mathématiques. Ces deux résultats vivaient dans la tête de celui qui
 * avait corrigé, ou sur une feuille dans une farde — donc nulle part le jour
 * où l'on demande sur quoi l'admission s'est fondée.
 *
 * La section ne s'ouvre pas d'elle-même sur les dossiers qui n'ont pas de
 * test : un dossier réglé sur pièces n'a pas à porter deux cases vides.
 */
function EtapeTest({ dossier, onEnregistrer, enCours }) {
  const admission = dossier.porte === 'admission' || dossier.type === 'admission';
  const dejaFait = dossier.test_note_francais != null || dossier.test_note_maths != null;
  const [ouvert, setOuvert] = useState(dejaFait);
  const [fr, setFr] = useState(dossier.test_note_francais ?? '');
  const [ma, setMa] = useState(dossier.test_note_maths ?? '');
  const [date, setDate] = useState(dossier.test_date || aujourdHui());

  if (!ouvert) {
    return (
      <section className="carte p-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-[11px] uppercase tracking-wide text-slate-500">
            5 — Le test ou l'épreuve complémentaire
          </span>
          <span className="text-[12px] text-slate-500">
            Le Conseil se prononce sur pièces — pas de test.
          </span>
          <button onClick={() => setOuvert(true)} className="bouton text-[12px] ml-auto">
            Un test a été organisé
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="carte p-3 space-y-2">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[11px] uppercase tracking-wide text-slate-500">
          5 — Le test ou l'épreuve complémentaire
        </span>
        {dejaFait && dossier.test_par && (
          <span className="text-[12px] text-emerald-800">
            ✓ {dossier.test_par}{dossier.test_date ? ` · ${dossier.test_date}` : ''}
          </span>
        )}
      </div>

      {admission ? (
        <p className="text-[12px] text-slate-500">
          Admission : le test porte sur les capacités préalables requises.
        </p>
      ) : (
        <p className="text-[12px] text-slate-500">
          Le résultat fonde la décision : la base devient <b>VANFI E</b>
          {' '}— acquis non formels ou informels, décision après épreuve.
        </p>
      )}

      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-[12px] text-slate-600">Français</span>
          <div className="flex items-baseline gap-1">
            <input value={fr} inputMode="decimal"
              onChange={e => setFr(e.target.value.replace(/[^\d.,]/g, ''))}
              className="controle w-20 text-[13px] mt-1" />
            <span className="text-[12px] text-slate-400">/20</span>
          </div>
        </label>
        <label className="block">
          <span className="text-[12px] text-slate-600">Mathématiques</span>
          <div className="flex items-baseline gap-1">
            <input value={ma} inputMode="decimal"
              onChange={e => setMa(e.target.value.replace(/[^\d.,]/g, ''))}
              className="controle w-20 text-[13px] mt-1" />
            <span className="text-[12px] text-slate-400">/20</span>
          </div>
        </label>
        <label className="block">
          <span className="text-[12px] text-slate-600">Date du test</span>
          <input type="date" value={date} onChange={e => setDate(e.target.value)}
            className="controle text-[13px] mt-1" />
        </label>
        <button
          onClick={() => onEnregistrer({ test_note_francais: fr, test_note_maths: ma,
                                         test_date: date })}
          disabled={enCours} className="bouton disabled:opacity-40">
          Enregistrer le test
        </button>
      </div>

      {/* LA COPIE SE DÉPOSE, ET CE N'EST PAS UNE POLITESSE. Quatre ans de
          conservation, présentable à l'inspection — si elle n'est pas déposée
          le jour même, elle ne le sera jamais. */}
      <p className="text-[12px] text-[#B45309]">
        La copie du test doit être déposée au dossier de l'étudiant, en pièce
        « Copie du test ou de l'épreuve d'admission » : elle se conserve quatre ans
        et se présente aux services d'inspection (AGCF du 13.12.2024, art. 5 al. 2).
        {dossier.nb_preuves_test ? ' ✓ Une copie est déjà au dossier.' : ''}
      </p>
    </section>
  );
}

/* ══ LA MATRICE D'INTRODUCTION ════════════════════════════════════════════ */

/**
 * LA PORTE D'ENTRÉE DE TOUTE LA MACHINE.
 *
 * Les demandes arrivent en septembre par dizaines, et elles arrivaient dans une
 * boîte courriel. Pour les faire entrer dans Lucie il fallait ouvrir un dossier
 * à la fois, chercher l'étudiant parmi cinq cent quatre-vingt-huit, choisir
 * l'unité, remplir une décision qui n'était pas encore prise. Personne ne le
 * faisait — donc rien n'était encodé, donc rien n'était contrôlable.
 *
 * Une section, une année : les ÉTUDIANTS en lignes, les UNITÉS en colonnes, et
 * dans chaque case un mot — AD, VA ou VAE. C'est tout ce qu'on sait quand la
 * demande arrive, et c'est tout ce qu'on demande ici. Le détail — finalité,
 * activités visées, base légale, preuves — se traite ensuite, dossier par
 * dossier. Réclamer tout dès la porte, c'est ne rien encoder du tout.
 *
 * Les unités qu'on ne peut JAMAIS valoriser n'ont pas de colonne : une colonne
 * qu'on ne peut pas remplir n'a rien à faire dans un tableau.
 */
function MatriceIntroduction({ annee, onClose, onCree }) {
  const [sections, setSections] = useState([]);
  const [section, setSection] = useState('');
  const [m, setM] = useState(null);
  const [choix, setChoix] = useState(() => new Map());   // "eid:ue" → porte
  const [ajoutes, setAjoutes] = useState([]);
  const [chercheOuvert, setChercheOuvert] = useState(false);
  const [q, setQ] = useState('');
  const [resultats, setResultats] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [reception, setReception] = useState(aujourdHui());
  const [filtre, setFiltre] = useState('');

  useEffect(() => {
    fetch('/api/ref/sections', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : [])).then(l => setSections(l || []))
      .catch(() => setSections([]));
  }, []);

  const charger = useCallback(async () => {
    if (!section) { setM(null); return; }
    setM(null);
    try {
      const r = await fetch(
        `/api/etudiants/valorisations/matrice?annee=${encodeURIComponent(annee)}`
        + `&section=${encodeURIComponent(section)}`, { headers: authHeaders() });
      setM(r.ok ? await r.json() : null);
    } catch { setM(null); }
    setChoix(new Map());
  }, [annee, section]);
  useEffect(() => { charger(); }, [charger]);

  useEffect(() => {
    if (!chercheOuvert) return;
    const p = new URLSearchParams({ annee });
    if (q.trim()) p.set('q', q.trim());
    setResultats(null);
    const t = setTimeout(() => {
      fetch(`/api/etudiants?${p}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : []))
        .then(l => setResultats(Array.isArray(l) ? l : (l?.etudiants || [])))
        .catch(() => setResultats([]));
    }, 220);
    return () => clearTimeout(t);
  }, [chercheOuvert, annee, q]);

  const toutes = useMemo(() => {
    const vus = new Map();
    for (const e of (m?.etudiants || [])) vus.set(e.id, e);
    for (const a of ajoutes) {
      if (!vus.has(a.id)) vus.set(a.id, { ...a, inscrit: false, cellules: {}, ajoute: true });
    }
    return [...vus.values()].sort((a, b) =>
      (a.nom || '').localeCompare(b.nom || '')
      || (a.prenom || '').localeCompare(b.prenom || ''));
  }, [m, ajoutes]);

  /* RÉDUIRE LA LISTE, PAS LA SÉLECTION.
   *
   * Une section de TIM porte deux cents lignes : on cherche « abd », on pose
   * la case, on cherche le suivant. Les cases déjà posées vivent dans `choix`,
   * qui est indexé par étudiant et unité — filtrer ne les touche donc pas, et
   * ce qu'on a coché sur une ligne masquée part bien à l'enregistrement. Un
   * filtre qui ferait perdre la saisie serait pire que pas de filtre.
   *
   * On compare sans accents ni casse, et sur le DÉBUT du nom ou du prénom :
   * « ben » doit trouver BENALI sans sortir aussi tous les LEBRUN. */
  const sansAccent = t => String(t || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const lignes = useMemo(() => {
    const q0 = sansAccent(filtre).trim();
    if (!q0) return toutes;
    return toutes.filter(e =>
      sansAccent(e.nom).startsWith(q0) || sansAccent(e.prenom).startsWith(q0));
  }, [toutes, filtre]);

  /* UNE CASE TOURNE : rien → AD → VA → VAE → rien. Trois cases à cocher par
     cellule auraient fait un tableau illisible dès dix unités ; un menu
     déroulant demanderait deux clics pour chaque demande. */
  const SUITE = [null, 'admission', 'va', 'vae'];
  const COURT = { admission: 'AD', va: 'VA', vae: 'VAE' };
  /* TROIS PORTES, TROIS COULEURS — ET ELLES NE DISENT QUE ÇA.
   *
   * Sur un tableau de douze colonnes et quarante lignes, « AD » et « VA » en
   * gris se confondent : on lit le tableau case par case au lieu de le voir.
   * La teinte porte la NATURE de la demande, jamais son état — l'état se lit
   * dans le dossier, et mêler les deux rendrait les deux illisibles.
   *
   * Le fond reste pâle et la couleur va au texte et au filet : un aplat plein
   * sur quarante cases ferait un damier, et la règle de la maison veut que la
   * couleur se dépense là où elle distingue, pas partout. */
  const TEINTE = {
    admission: { t: '#15803D', f: '#15803D26', b: '#15803D66' },  // vert
    va:        { t: '#2D4470', f: '#2D447020', b: '#2D447066' },  // bleu
    vae:       { t: '#6D28D9', f: '#8B5CF624', b: '#8B5CF666' },  // violet
  };
  function tourner(eid, ue) {
    const cle = `${eid}:${ue}`;
    setChoix(c => {
      const n = new Map(c);
      const i = SUITE.indexOf(n.get(cle) || null);
      const suivant = SUITE[(i + 1) % SUITE.length];
      if (suivant) n.set(cle, suivant); else n.delete(cle);
      return n;
    });
  }

  async function enregistrer() {
    if (!choix.size) return;
    setEnCours(true); setErreur(null);
    try {
      const cellules = [...choix.entries()].map(([cle, porte]) => {
        const [eid, ue] = cle.split(':');
        return { etudiant_id: Number(eid), ue_num: Number(ue), porte };
      });
      const r = await fetch('/api/etudiants/valorisations/matrice', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ annee, cellules, date_reception: reception || null }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      // ON DIT CE QUI N'EST PAS PASSÉ, plutôt que de laisser croire à un succès
      // entier : une unité exclue refusée se voit ici, pas au moment d'imprimer.
      if (j.refus?.length) {
        setErreur(j.refus.map(x => x.pourquoi).join(' · '));
      }
      await charger(); await onCree?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  return (
    <Fenetre icone={IconTable} large="grande" onFermer={onClose}
      titre="Introduire des demandes"
      sous="Une section, une année — qui demande quoi, et par quelle porte"
      pied={<>
        <button onClick={enregistrer} disabled={!choix.size || enCours}
          className="bouton bouton-fort disabled:opacity-40">
          {enCours ? 'Ouverture…'
            : choix.size > 1 ? `Ouvrir ${choix.size} dossiers` : 'Ouvrir le dossier'}
        </button>
        <span className="text-[12px] text-slate-500">
          {!section ? 'Choisis une section'
            : !choix.size ? 'Clique une case pour poser AD, VA ou VAE'
              : `${choix.size} demande(s)`}
        </span>
        {erreur && (
          <span className="flex items-start gap-1.5 text-[12px] text-rose-700">
            <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
          </span>
        )}
        <button onClick={onClose} className="bouton ml-auto">Fermer</button>
      </>}>

      <div className="flex-1 min-h-0 flex flex-col">
        <div className="flex-none flex flex-wrap items-center gap-2 px-5 py-3
                        border-b border-slate-200">
          <select value={section} onChange={e => setSection(e.target.value)}
            className="controle text-[13px]">
            <option value="">Choisir une section…</option>
            {sections.map(s => (
              <option key={s.code} value={s.code}>{s.libelle || s.code}</option>
            ))}
          </select>
          <label className="flex items-center gap-1.5">
            <span className="text-[12px] text-slate-600">Reçues le</span>
            <input type="date" value={reception} onChange={e => setReception(e.target.value)}
              className="controle text-[13px]" />
          </label>
          {section && (
            <>
              <div className="relative">
                <IconSearch size={14}
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input value={filtre} onChange={e => setFiltre(e.target.value)}
                  placeholder="Début du nom ou du prénom…"
                  className="controle pl-8 text-[13px] w-56" />
              </div>
              {filtre && (
                <span className="text-[11px] text-slate-500">
                  {lignes.length} sur {toutes.length}
                  {choix.size ? ` · ${choix.size} demande(s) conservée(s)` : ''}
                </span>
              )}
              <button onClick={() => setChercheOuvert(o => !o)} className="bouton text-[12px]">
                <IconUserPlus size={14} /> Ajouter un étudiant
              </button>
            </>
          )}
          <span className="ml-auto flex items-center gap-2 text-[11px]">
            {[['admission', 'admission'], ['va', 'acquis formels'],
              ['vae', 'expérience']].map(([k, quoi]) => (
              <span key={k} className="flex items-center gap-1">
                <span className="inline-block px-1.5 py-0.5 rounded-champ font-medium"
                  style={{ color: TEINTE[k].t, background: TEINTE[k].f }}>
                  {COURT[k]}
                </span>
                <span className="text-slate-500">{quoi}</span>
              </span>
            ))}
          </span>
        </div>

        {chercheOuvert && (
          <div className="flex-none border-b border-slate-200 bg-slate-50/60 p-3 space-y-2">
            <div className="relative inline-block">
              <IconSearch size={14}
                className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Un nom…" className="controle pl-8 text-[13px]" />
            </div>
            <div className="max-h-40 overflow-auto rounded-champ bg-white border border-slate-200">
              {!resultats ? (
                <div className="p-2 text-[12px] text-slate-400">Chargement…</div>
              ) : !resultats.length ? (
                <div className="p-2 text-[12px] text-slate-400">Personne ne correspond.</div>
              ) : resultats.map(e => {
                const dedans = lignes.some(l => l.id === e.id);
                return (
                  <button key={e.id} disabled={dedans}
                    onClick={() => { setAjoutes(a => [...a, { id: e.id, nom: e.nom, prenom: e.prenom }]);
                                     setQ(''); }}
                    className={`block w-full text-left px-3 py-1.5 border-b border-slate-50
                      text-[13px] ${dedans ? 'opacity-45' : 'hover:bg-slate-50'}`}>
                    {(e.nom || '').toUpperCase()} {e.prenom}
                    {dedans && <span className="ml-2 text-[11px] text-slate-400">déjà là</span>}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-auto min-h-0">
          {!section ? (
            <div className="p-6 text-[13px] text-slate-400">
              Choisis une section : ses unités deviennent les colonnes, ses étudiants les lignes.
            </div>
          ) : !m ? (
            <div className="p-6 text-[13px] text-slate-400">Chargement…</div>
          ) : filtre && !lignes.length ? (
            <div className="p-6 text-[13px] text-slate-400">
              Personne ne commence par « {filtre} » dans cette section.
            </div>
          ) : !m.unites.length ? (
            <div className="p-6 text-[13px] text-slate-400">
              Aucune unité valorisable au référentiel {annee} pour cette section.
            </div>
          ) : (
            <table className="text-[12px] border-collapse">
              <thead className="tab-entete sticky top-0 z-10">
                <tr>
                  <th className="text-left px-3 py-2 font-medium sticky left-0 bg-inherit
                                 min-w-[14rem]">Étudiant</th>
                  {m.unites.map(u => (
                    /* LE NUMÉRO EN GRAND, LE NOM DESSOUS ET TRONQUÉ : à douze
                       unités, un intitulé complet en colonne rend le tableau
                       illisible, et c'est le numéro qu'on épelle en séance. */
                    <th key={u.ue_num} className="px-2 py-2 font-medium align-bottom
                                                  min-w-[4.5rem] max-w-[7rem]">
                      <div className="text-[13px]">{u.ue_num}</div>
                      <div className="text-[10px] text-slate-500 font-normal truncate"
                        title={u.ue_nom}>{u.ue_nom}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {lignes.map(e => (
                  <tr key={e.id} className="border-b border-slate-100">
                    <td className="px-3 py-1 sticky left-0 bg-white">
                      <span className="text-[13px] font-medium">
                        {(e.nom || '').toUpperCase()} {e.prenom}
                      </span>
                      {!e.inscrit && (
                        <span className="ml-1.5 text-[10px] text-slate-400">hors inscription</span>
                      )}
                    </td>
                    {m.unites.map(u => {
                      const existante = e.cellules?.[u.ue_num];
                      const pose = choix.get(`${e.id}:${u.ue_num}`);
                      if (existante) {
                        /* UNE CASE DÉJÀ OUVERTE NE SE REJOUE PAS : on montre où
                           elle en est, et le détail se règle dans le dossier. */
                        return (
                          <td key={u.ue_num} className="px-1 py-1 text-center align-middle">
                            <span className="inline-block px-1.5 py-0.5 rounded-champ text-[10px]"
                              style={existante.porte ? {
                                color: TEINTE[existante.porte].t,
                                background: TEINTE[existante.porte].f,
                              } : { color: '#64748B', background: '#F1F5F9' }}
                              title={`${existante.porte ? COURT[existante.porte] + ' · ' : ''}${existante.etat}`}>
                              {existante.porte ? COURT[existante.porte] : '•'}
                            </span>
                          </td>
                        );
                      }
                      return (
                        <td key={u.ue_num} className="px-1 py-1 text-center align-middle">
                          <button onClick={() => tourner(e.id, u.ue_num)}
                            className="w-11 h-6 rounded-champ border text-[11px] font-medium
                                       hover:border-slate-400"
                            style={pose ? {
                              color: TEINTE[pose].t, background: TEINTE[pose].f,
                              borderColor: TEINTE[pose].b,
                            } : { color: '#CBD5E1', borderColor: '#E2E8F0' }}>
                            {pose ? COURT[pose] : '—'}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </Fenetre>
  );
}
