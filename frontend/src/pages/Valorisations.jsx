import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconAlertTriangle, IconCertificate, IconCheck, IconChevronDown, IconChevronRight,
  IconListCheck, IconPlus, IconPrinter, IconSearch, IconTable, IconTrash,
  IconRubberStamp, IconUserPlus, IconUsersGroup, IconX,
} from '@tabler/icons-react';
import { authHeaders, getAnnee, getUser } from '../lib/api.js';
import { BulleAide, Fenetre, RailLateral } from '../components/ui.jsx';
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

/**
 * AD VERT, VA BLEU, VAE VIOLET — ÉCRIT UNE FOIS.
 *
 * La table vivait en double, dans la matrice d'introduction et dans l'étape de
 * la demande : deux copies d'une même convention finissent par différer, et
 * c'est l'écran qu'on regarde le moins qui garde l'ancienne teinte. Trois
 * jetons par porte : `t` le texte et le filet de rail, `f` le fond pâle,
 * `b` le contour. Le fond reste pâle — un aplat plein sur quarante lignes
 * ferait un damier, et la couleur se dépense là où elle distingue.
 */
/* QUI DÉFAIT CE QUI A ÉTÉ VALIDÉ — la même liste que `lib/valorisation.js`
   côté serveur. Elle n'est ici que pour CACHER un bouton inutile : le droit se
   contrôle sur la route, jamais à l'écran — un bouton caché n'est pas une
   protection. */
const PEUT_DEVALIDER = ['admin', 'directeur', 'directeur_adjoint'];

export const TEINTE_PORTE = {
  admission: { t: '#15803D', f: '#15803D26', b: '#15803D66' },  // vert
  va:        { t: '#2D4470', f: '#2D447020', b: '#2D447066' },  // bleu
  vae:       { t: '#6D28D9', f: '#8B5CF624', b: '#8B5CF666' },  // violet
};

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
  const [analyse, setAnalyse] = useState(false);
  const [deciderEtudiant, setDeciderEtudiant] = useState(false);
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

  /* UN REFUS S'AFFICHE LÀ OÙ L'ON A CLIQUÉ, PAS EN HAUT DE PAGE.
   *
   * Le message du serveur était porté par un bandeau posé AU-DESSUS du tableau
   * de bord et de toute la liste. On clique sur une corbeille au bas de
   * quarante lignes, le serveur refuse — à juste titre —, et l'explication
   * s'affiche hors du champ de vision : la ligne reste là, sans un mot, et
   * l'on recommence en croyant que le bouton est cassé.
   *
   * C'est la même faute que le bouton de pied qui défilait avec le contenu, et
   * elle a la même réponse : CE QUI RÉPOND À UN GESTE VIT À CÔTÉ DU GESTE.
   * Un refus est une réponse à une action délibérée : il s'affiche dans une
   * fenêtre, qu'on ne peut pas manquer, et qui porte la sortie quand il y en
   * a une. */
  const [refus, setRefus] = useState(null);   // { vid, message, devalidable }

  /* UN REFUS QU'ON N'AFFICHE PAS RESSEMBLE À UNE PANNE.
   *
   * On cliquait « OK », le serveur refusait en 409 — à juste titre —, et
   * l'écran ne disait rien : la ligne restait là, sans un mot, et l'on
   * recommençait en croyant que le bouton était cassé. La réponse du serveur
   * est portée à l'écran, et quand elle réclame un motif, on le demande au
   * lieu de laisser deviner. */
  async function supprimer(vid, motif = null) {
    if (!motif && !confirm('Supprimer cette valorisation ? Ses preuves partent avec elle.')) return;
    try {
      const r = await fetch(`/api/etudiants/valorisations/${vid}`, {
        method: 'DELETE', headers: authHeaders(),
        body: JSON.stringify({ motif: motif || undefined }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        // Le serveur demande un motif : on le demande à son tour, une fois.
        if (j.motif_requis && !j.reserve_direction && !motif) {
          const m = window.prompt(`${j.error}\n\nMotif de la suppression :`, '');
          if (m && m.trim()) return supprimer(vid, m.trim());
          return;
        }
        /* LE DOSSIER EST VALIDÉ : ce n'est pas une impasse, c'est un ordre.
         * La direction retire la validation, puis le Conseil corrige. La
         * fenêtre porte donc ce chemin quand la personne a le droit de
         * l'emprunter — on ne se contente pas de nommer la sortie. */
        setRefus({
          vid,
          message: j.error || 'Suppression refusée.',
          // Le SERVEUR nomme le cas — on ne devine pas en lisant sa phrase.
          devalidable: !!j.devalidation_possible,
        });
        return;
      }
      setErreur(null);
      await charger();
    } catch (e) { setErreur(e.message); }
  }

  /* RETIRER UNE VALIDATION — direction seule, motif écrit obligatoire.
     Une pièce a pu partir sur la foi de cette validation : le motif n'est pas
     une formalité, c'est ce qui explique un an après pourquoi elle a été
     défaite. Le journal garde les deux gestes. */
  async function devalider(vid) {
    const motif = window.prompt(
      'Retirer la validation de ce dossier.\n\n'
      + 'Une pièce a pu partir sur la foi de cette validation : le motif reste '
      + 'au journal.\n\nMotif :', '');
    if (!motif || !motif.trim()) return;
    try {
      const r = await fetch(`/api/etudiants/valorisations/${vid}/validation`, {
        method: 'DELETE', headers: authHeaders(),
        body: JSON.stringify({ motif: motif.trim() }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setRefus(f => ({ ...f, message: j.error || 'Refusé.' })); return; }
      setRefus(null);
      await charger();
    } catch (e) { setRefus(f => ({ ...f, message: e.message })); }
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
      const envoyer = motif => fetch(
        `/api/etudiants/valorisations/etudiant/${e.id}?annee=${encodeURIComponent(annee)}`,
        { method: 'DELETE', headers: authHeaders(),
          body: JSON.stringify({ motif: motif || undefined }) });
      let r = await envoyer(null);
      let j = await r.json().catch(() => ({}));
      if (!r.ok && j.motif_requis && !j.reserve_direction) {
        const m = window.prompt(
          `${j.error}\n${(j.bloquants || []).join('\n')}\n\nMotif de la suppression :`, '');
        if (!m || !m.trim()) return;
        r = await envoyer(m.trim());
        j = await r.json().catch(() => ({}));
      }
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
      /* « VALORISER EN SÉRIE » NE DISAIT PAS CE QU'IL FAISAIT — et trois
         entrées se ressemblaient au point qu'on ne pouvait plus les
         distinguer : « Introduire des demandes », « Valoriser en série »,
         « Analyser les demandes en série ». Même longueur, même structure.
         Chacune fait pourtant autre chose : la matrice OUVRE des dossiers
         vides (AD/VA/VAE), celle-ci les ouvre DÉJÀ PORTEURS du détail de la
         dispense — mêmes cours, mêmes acquis, même remarque pour toute une
         cohorte —, et la troisième INSTRUIT ce qui existe. Le libellé dit
         désormais ce qui la distingue : la dispense identique. */
      { key: 'serie', label: 'Créer avec la même dispense', icon: IconUsersGroup,
        onClick: () => setSerie(true) },
      { key: 'analyse', label: 'Analyser les demandes en série', icon: IconListCheck,
        onClick: () => setAnalyse(true) },
      /* UN ÉTUDIANT, TOUTES SES UNITÉS : le dossier tel qu'il arrive. Le
         TAMPON dit la décision puis l'acceptation, et n'appartient qu'à cette
         entrée : la personne cochée est à « Présences », le marteau à
         « Procédures », qui vit dans ce même rail. */
      { key: 'par-etudiant', label: 'Décider par étudiant', icon: IconRubberStamp,
        onClick: () => setDeciderEtudiant(true) },
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
          <button onClick={() => setAnalyse(true)} className="controle">
            <IconListCheck size={16} /> Analyser en série
          </button>
          <button onClick={() => setSerie(true)} className="controle">
            <IconUsersGroup size={16} /> Créer avec la même dispense
          </button>
          <button onClick={() => setAjout(true)} className="controle">
            <IconUserPlus size={16} /> Ajouter des étudiants
          </button>
          <span className="ml-auto text-[12px] text-slate-500">
            {(lignes || []).length} valorisation(s) · {annee}
          </span>
        </div>

        {erreur && <div className="text-[12px] text-rose-700">{erreur}</div>}

      {/* LE REFUS, DANS UNE FENÊTRE — parce qu'il répond à un clic délibéré et
          qu'il doit être lu. Il porte les mots du SERVEUR, pas une reformulation
          de l'écran : deux libellés pour un même refus finissent par dire deux
          choses différentes. */}
      {refus && (
        <Fenetre icone={IconAlertTriangle} large="petite" ton="alerte"
          titre="Suppression refusée"
          sous="Ce dossier est protégé par le circuit"
          onFermer={() => setRefus(null)}
          pied={<>
            {refus.devalidable && PEUT_DEVALIDER.includes(getUser()?.role) && (
              <button className="bouton bouton-detruire"
                onClick={() => devalider(refus.vid)}>
                Retirer la validation
              </button>
            )}
            <span className="text-[12px] text-slate-500">
              {refus.devalidable && !PEUT_DEVALIDER.includes(getUser()?.role)
                ? 'Seule la direction peut retirer une validation.'
                : 'Le journal garde le geste et son motif.'}
            </span>
            <button className="bouton ml-auto"
              onClick={() => setRefus(null)}>Fermer</button>
          </>}>
          <p className="text-[13px] text-slate-700">{refus.message}</p>
        </Fenetre>
      )}

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

      {analyse && (
        <AnalyserEnSerie annee={annee} onClose={() => setAnalyse(false)}
          onChange={charger} />
      )}

      {deciderEtudiant && (
        <DeciderParEtudiant annee={annee} onClose={() => setDeciderEtudiant(false)}
          onChange={charger} />
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
        {/* LE NOM NE SUFFIT PAS — ET « 1 unité(s) » NE DIT RIEN.
            La ligne repliée annonçait un compte : elle disait qu'il y avait
            quelque chose, jamais QUOI ni OÙ ÇA EN EST. Il fallait déplier, puis
            ouvrir l'unité, pour apprendre qu'un dossier attendait un avis
            depuis six semaines — autant dire qu'on ne l'apprenait pas. Chaque
            unité demandée se nomme donc ici, avec sa frise de circuit. */}
        <span className="flex-1 min-w-0">
          <span className="font-semibold text-iip-blue text-[14px]">
            {(etudiant.nom || '').toUpperCase()} {etudiant.prenom}
          </span>
          <span className="text-[11px] text-slate-400 ml-2">
            {etudiant.section || 'section à déduire'}
          </span>
          {!etudiant.vas.length ? (
            <span className="block text-[11px] text-slate-400 mt-0.5">
              aucune unité demandée
            </span>
          ) : (
            <span className="block mt-1 space-y-0.5">
              {etudiant.vas.map(v => (
                <span key={v.id} className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  {/* LA PORTE GARDE SA TEINTE : AD vert, VA bleu, VAE violet. */}
                  <span className="text-[12px] font-medium"
                    style={{ color: TEINTE_PORTE[v.porte]?.t || '#2D4470' }}>
                    {v.ue_num === 0 ? 'Admission' : `UE ${v.ue_num}`}
                  </span>
                  <span className="text-[12px] text-slate-500 truncate max-w-[22rem]">
                    {v.ue_nom || ''}
                  </span>
                  <FriseCircuit dossier={v} compact />
                </span>
              ))}
            </span>
          )}
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
              placeholder="Un nom…" className="controle controle-icone text-[13px]" />
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
              placeholder="Un numéro, un intitulé…" className="controle controle-icone text-[13px]" />
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
      titre="Créer avec la même dispense"
      sous="Ouvrir plusieurs dossiers portant déjà les mêmes cours ou acquis dispensés"
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

      {/* PAS DE SECOND ASCENSEUR NI DE SECONDE MARGE : la fenêtre porte
          déjà son défilement et son padding. Ce conteneur en ajoutait un
          « flex-1 min-h-0 overflow-auto p-5 » — mais son parent n'est pas
          une boîte flex, si bien que flex-1 ne faisait rien, les marges se
          cumulaient à 36 px et deux ascenseurs se chevauchaient au pied de
          la fenêtre. */}
      <div className="space-y-4">

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
            {m?.unites_de_base?.length > 0 && (
          /* CE QUE L'ADMISSION OUVRE, ÉCRIT NOIR SUR BLANC. Elle se reporte sur
             les unités SANS PRÉREQUIS : les nommer évite d'avoir à le croire
             sur parole, et de découvrir en janvier qu'on n'y avait pas pensé. */
          <div className="flex-none px-5 py-2 border-b border-slate-200 text-[11px]
                          text-slate-500">
            <b style={{ color: TEINTE.admission.t }}>AD</b> ouvre les unités de base
            de la section (sans prérequis) :{' '}
            {m.unites_de_base.map(u => u.ue_num).join(' · ')}
          </div>
        )}

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
                      placeholder="Un nom…" className="controle controle-icone text-[13px]" />
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

      {/* PAS DE SECOND ASCENSEUR NI DE SECONDE MARGE : la fenêtre porte
          déjà son défilement et son padding. Ce conteneur en ajoutait un
          « flex-1 min-h-0 overflow-auto p-5 » — mais son parent n'est pas
          une boîte flex, si bien que flex-1 ne faisait rien, les marges se
          cumulaient à 36 px et deux ascenseurs se chevauchaient au pied de
          la fenêtre. */}
      <div className="space-y-3">

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

/**
 * Étape 2 — CE QUI EST DEMANDÉ, et quand la demande est arrivée.
 *
 * La nature — AD, VA ou VAE — se posait à la matrice et ne se changeait plus
 * nulle part : un étudiant introduit en VA alors qu'il apporte une expérience
 * professionnelle y restait pour toujours. Et la finalité demandée ne se
 * touchait qu'à l'étape de décision, donc après la recevabilité et l'avis : on
 * ne pouvait pas enregistrer la demande telle qu'elle est arrivée.
 *
 * Ce qui est DEMANDÉ ici et ce que le Conseil ACCORDE à l'étape 6 restent deux
 * choses distinctes. Rien n'oblige les deux à coïncider — c'est même tout
 * l'objet d'un accord partiel.
 */
function EtapeDemande({ dossier, delai, onEnregistrer, enCours }) {
  const [dd, setDd] = useState(dossier.date_demande || aujourdHui());
  const [dr, setDr] = useState(dossier.date_reception || aujourdHui());
  const [mode, setMode] = useState(dossier.mode_introduction || '');
  const [porte, setPorte] = useState(dossier.porte || 'va');
  const [type, setType] = useState(dossier.type || 'partielle');

  // L'admission emporte sa finalité : c'est la seule des trois portes qui la
  // dise. Laisser les deux diverger donnerait un dossier qui demande une
  // admission et accorde une dispense.
  const admission = porte === 'admission';

  return (
    <section className="carte p-3 space-y-2">
      <div className="text-[11px] uppercase tracking-wide text-slate-500">
        2 — La demande : ce qui est demandé, et quand
      </div>

      {/* LA NATURE DE LA DEMANDE — les mêmes trois portes que la matrice, et
          les mêmes couleurs : on ne réapprend pas un code d'un écran à l'autre. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-slate-600 w-28">Nature</span>
        {[['admission', 'AD — admission'], ['va', 'VA — acquis formels'],
          ['vae', "VAE — expérience"]].map(([v, l]) => (
          <label key={v}
            className="px-3 py-1.5 rounded-champ border cursor-pointer text-[13px]"
            style={porte === v
              ? { color: TEINTE_PORTE[v].t, background: TEINTE_PORTE[v].f,
                  borderColor: TEINTE_PORTE[v].b }
              : { borderColor: '#E2E8F0' }}>
            <input type="radio" checked={porte === v}
              onChange={() => { setPorte(v); if (v === 'admission') setType('admission');
                                else if (type === 'admission') setType('partielle'); }}
              className="mr-1.5 accent-iip-blue" />{l}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-[12px] text-slate-600 w-28">Ce qui est demandé</span>
        {admission ? (
          <span className="text-[12px] text-slate-500">
            L'admission dans la section — l'étudiant suivra l'unité et en présentera
            les évaluations (AGCF art. 2).
          </span>
        ) : (
          [['partielle', "Dispense partielle"], ['complete', 'Dispense complète']]
            .map(([v, l]) => (
              <label key={v}
                className={`px-3 py-1.5 rounded-champ border cursor-pointer text-[13px]
                  ${type === v ? 'border-iip-blue bg-iip-blue/5' : 'border-slate-200'}`}>
                <input type="radio" checked={type === v} onChange={() => setType(v)}
                  className="mr-1.5 accent-iip-blue" />{l}
              </label>
            ))
        )}
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
                                               mode_introduction: mode, porte, type })}
          disabled={enCours} className="bouton disabled:opacity-40">
          Enregistrer la demande
        </button>
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
/**
 * ANALYSER LES DEMANDES EN SÉRIE — LE TABLEAU, ET CE QU'ON Y POSE.
 *
 * Le tableau de ce qui reste à faire nommait le retard — « 17 recevabilités à
 * contrôler » — sans donner nulle part où le traiter : il fallait déplier
 * dix-sept lignes et ouvrir dix-sept fenêtres pour poser dix-sept fois le même
 * geste. Un constat sans porte est un constat qu'on relit chaque matin.
 *
 * UNE LIGNE PAR DEMANDE, À PLAT, TOUTE L'ANNÉE. C'est ainsi qu'on lit : on
 * cherche « ce qui attend un avis », pas « les dossiers de Untel ». Les
 * filtres réduisent, les cases cochent, et les trois gestes du bas écrivent.
 *
 * MAIS L'ÉCRITURE, ELLE, SE BORNE :
 *   · LA RECEVABILITÉ traverse les unités. C'est un contrôle de FORME — délai,
 *     pièces officielles, dossier complet — et aucun conseil des études n'est
 *     convoqué. La borner à une unité serait une contrainte sans raison
 *     derrière, et ce sont celles-là qu'on finit par contourner.
 *   · LA DÉCISION ET LA VALIDATION ne mêlent pas deux conseils des études :
 *     une séance de valorisation se tient PAR UNITÉ. Le serveur refuse un lot
 *     qui traverse ; l'écran le dit avant qu'on clique, plutôt que de laisser
 *     découvrir le refus après coup.
 *
 * ET LA DÉCISION N'EST PAS COMPLÈTE ICI, VOLONTAIREMENT : totale ou refusée,
 * et rien d'autre. Une dispense PARTIELLE demande de désigner les cours ou les
 * acquis dispensés ; ce tableau n'a pas où les cocher, donc il ne la propose
 * pas — on ne réclame pas ce qu'on ne donne pas à saisir. Elle se pose dans
 * *Créer avec la même dispense*, qui porte les listes de cours et d'acquis.
 */
/* LES CINQ ÉTAPES DU CIRCUIT, DANS L'ORDRE OÙ ELLES SE POSENT.
 *
 * Hors du composant, parce que l'AVANCEMENT se calcule contre cette liste bien
 * avant que les boutons ne soient rendus : une table déclarée au milieu du
 * corps ne sert qu'à l'affichage, et l'on finit par en écrire une seconde pour
 * le calcul — deux sources pour un même ordre.
 *
 * `franchie` dit si UN dossier a passé l'étape. Elle se LIT DES TRACES, comme
 * l'état : une étape qu'on déclarerait franchie serait une étape qu'on peut
 * déclarer franchie à tort, et c'est la faute même que le circuit empêche.
 */
const ETAPES = [
  { cle: 'demande', label: 'Dates de la demande', court: 'Demande',
    aide: 'Une liasse reçue le même jour — la date décide du délai',
    franchie: d => !!(d.date_demande || d.date_reception) },
  { cle: 'recevabilite', label: 'Recevabilité', court: 'Recevabilité',
    aide: 'Contrôle de forme — traverse les unités',
    franchie: d => d.recevable != null },
  { cle: 'avis', label: 'Avis du chargé de cours', court: 'Avis',
    aide: 'Un avis, un auteur nommé, une cohorte homogène',
    franchie: d => !!d.avis_le },
  { cle: 'decision', label: 'Décision du Conseil', court: 'Décision',
    aide: 'Une séance, une unité',
    franchie: d => !!d.decision_le },
  { cle: 'validation', label: 'Validation direction', court: 'Validation',
    aide: 'Réservée à la direction et à la direction adjointe',
    franchie: d => !!d.valide_le },
];

/* ══ LA FRISE DU CIRCUIT — UN DOSSIER, CINQ ÉTAPES ════════════════════════
 *
 * « Où en est-on ? » est la question qu'on pose devant le registre, et le
 * registre n'y répondait pas : il montrait un nom, une section et « 1 unité(s) ».
 * Pour l'apprendre il fallait déplier, puis ouvrir — donc on ne l'apprenait pas,
 * et l'on découvrait à l'inspection qu'un dossier dormait depuis six semaines.
 *
 * Cinq segments, un par étape, dans l'ordre du circuit. La couleur ne dit
 * qu'une chose et ne la dit qu'une fois :
 *   vert   — l'étape est franchie ;
 *   brique — elle s'est fermée sur un refus (irrecevable, décision refusée) ;
 *   gris   — elle attend.
 * L'étape COURANTE — la première qui attend — porte un liseré : sans lui, une
 * suite de gris ne dit pas laquelle est le tour de qui.
 *
 * ELLE SE LIT DES TRACES, elle ne se déclare pas — même règle que l'état.
 * `ETAPES` est la seule table, partagée avec « Analyser en série » : deux
 * frises pour un même circuit finiraient par compter différemment.
 */
const VERT = '#15803D', BRIQUE = '#9D4A38', GRIS = '#CBD5E1';

function etatEtape(d, cle) {
  if (cle === 'recevabilite' && d.recevable === 0) return 'refus';
  if (cle === 'decision' && d.decision_le && d.decision === 'refusee') return 'refus';
  return ETAPES.find(e => e.cle === cle)?.franchie(d) ? 'fait' : 'attente';
}

export function FriseCircuit({ dossier, compact = false }) {
  const etats = ETAPES.map(e => ({ ...e, etat: etatEtape(dossier, e.cle) }));
  /* LE TOUR DE QUI : la première étape qui attend. Une fois le circuit
     parcouru — ou fermé par un refus — il n'y en a plus, et c'est juste :
     personne n'attend plus rien. */
  const arret = etats.findIndex(e => e.etat === 'refus');
  const courante = arret >= 0 ? -1 : etats.findIndex(e => e.etat === 'attente');
  const libelle = arret >= 0
    ? (arret === 1 ? 'Irrecevable — refus de forme' : 'Refusée par le Conseil')
    : courante < 0 ? 'Circuit parcouru'
      : `En attente : ${etats[courante].court.toLowerCase()}`;

  return (
    <span className="inline-flex items-center gap-1.5 align-middle"
      title={etats.map((e, i) => `${i + 1}. ${e.court} — ${
        { fait: 'fait', refus: 'refus', attente: 'en attente' }[e.etat]}`).join('\n')}>
      <span className="inline-flex items-center gap-[2px]" aria-hidden="true">
        {etats.map((e, i) => (
          <span key={e.cle}
            className={`rounded-full ${compact ? 'h-[5px] w-4' : 'h-[6px] w-5'}`}
            style={{
              background: e.etat === 'fait' ? VERT
                : e.etat === 'refus' ? BRIQUE : GRIS,
              /* Le liseré désigne le tour de qui. Il ne s'ajoute qu'à UNE
                 étape : deux repères ne repèrent plus rien. */
              boxShadow: i === courante ? `0 0 0 1.5px ${VERT}55` : 'none',
            }} />
        ))}
      </span>
      <span className={`${compact ? 'text-[10px]' : 'text-[11px]'} ${
        arret >= 0 ? 'text-[#9D4A38]'
          : courante < 0 ? 'text-[#15803D]' : 'text-slate-500'}`}>
        {libelle}
      </span>
    </span>
  );
}

function AnalyserEnSerie({ annee, onClose, onChange }) {
  const [donnees, setDonnees] = useState(null);
  const [bases, setBases] = useState([]);
  const [coches, setCoches] = useState(() => new Set());
  const [erreur, setErreur] = useState(null);
  const [bloquants, setBloquants] = useState(null);
  const [enCours, setEnCours] = useState(false);

  // Les filtres — ils réduisent la vue, ils ne décident de rien.
  const [q, setQ] = useState('');
  const [fSection, setFSection] = useState('');
  const [fUe, setFUe] = useState('');
  const [fEtat, setFEtat] = useState('');

  // Le geste qu'on s'apprête à poser.
  const [geste, setGeste] = useState('recevabilite');   // recevabilite | decision | validation
  const [recevable, setRecevable] = useState(true);
  const [motifForme, setMotifForme] = useState('');
  // `branche` a remplacé le couple decision+portee : une seule question.
  const [base, setBase] = useState('');
  const [motifRefus, setMotifRefus] = useState('');
  const [dateCE, setDateCE] = useState(aujourdHui());
  /* UNE SEULE QUESTION AU NIVEAU DE LA DÉCISION : totale, partielle, refusée.
     C'est la branche ; `portee` n'en est plus que le détail, et seulement
     quand elle vaut « partielle » — un ou des cours, ou un ou des acquis. */
  const [branche, setBranche] = useState('totale');
  const [portee, setPortee] = useState('cours');
  const [coursCoches, setCoursCoches] = useState(() => new Set());
  const [aaCoches, setAaCoches] = useState(() => new Set());
  const [composantes, setComposantes] = useState(null);
  /* LA MÊME RAISON POUR TOUT LE LOT. La remarque du Conseil — « dispensé des
     heures de stage, mais doit présenter l'examen » — se saisissait dossier par
     dossier alors que le Conseil l'a formulée une fois. */
  const [remarque, setRemarque] = useState('');
  // L'avis en série : un sens, un texte, un auteur nommé.
  const [avisSens, setAvisSens] = useState('favorable');
  const [avisTexte, setAvisTexte] = useState('');
  const [avisPar, setAvisPar] = useState('');
  // Les dates de la demande, posées pour toute la liasse.
  const [dateDemande, setDateDemande] = useState(aujourdHui());
  const [dateReception, setDateReception] = useState('');

  const charger = useCallback(async () => {
    try {
      const rep = await fetch(
        `/api/etudiants/valorisations/analyse?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) { setErreur(j.error || 'Lecture refusée.'); return; }
      setDonnees(j);
      // Un dossier qui n'est plus dans la liste ne reste pas coché.
      const vivants = new Set((j.dossiers || []).map(d => d.id));
      setCoches(c => new Set([...c].filter(id => vivants.has(id))));
    } catch (e) { setErreur(e.message); }
  }, [annee]);

  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    fetch('/api/etudiants/valorisations/referentiel', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(j => setBases(j?.bases || []))
      .catch(() => setBases([]));
  }, []);

  const tous = donnees?.dossiers || [];

  const sections = useMemo(
    () => [...new Set(tous.map(d => d.section).filter(Boolean))].sort(), [tous]);
  const unites = useMemo(() => {
    const m = new Map();
    for (const d of tous) if (!m.has(d.ue_num)) m.set(d.ue_num, d.ue_nom || '');
    return [...m.entries()].sort((a, b) => a[0] - b[0]);
  }, [tous]);

  const vues = useMemo(() => {
    const t = q.trim().toLowerCase();
    return tous.filter(d => {
      if (fSection && d.section !== fSection) return false;
      if (fUe !== '' && String(d.ue_num) !== String(fUe)) return false;
      if (fEtat && d.etat !== fEtat) return false;
      if (!t) return true;
      return `${d.nom} ${d.prenom}`.toLowerCase().includes(t)
        || String(d.id_ecampus || '').toLowerCase().includes(t);
    });
  }, [tous, q, fSection, fUe, fEtat]);

  /* CE QUE LE GESTE CHOISI PEUT RECEVOIR. On ne coche pas ce qui ne peut pas
     l'accepter : une case cochable sur un dossier que le serveur refusera
     donne une fausse promesse, et le refus arrive après coup. */
  /* UN DOSSIER DÉCIDÉ HORS CIRCUIT SE RÉGULARISE. Sa décision existe mais
     n'a jamais été instruite : le serveur laisse poser ce qui manque, et
     l'écran doit donc le rendre cochable — sans quoi on retombe dans le
     blocage où les trois gestes se refusaient l'un l'autre. */
  function eligible(d) {
    if (geste === 'demande') return !d.valide_le;
    if (geste === 'recevabilite') return !d.valide_le && (!d.decision_le || d.hors_circuit);
    if (geste === 'avis') return !d.valide_le && d.recevable === 1;
    if (geste === 'decision') return !d.valide_le && d.recevable === 1 && !!d.avis_le;
    return d.pret_a_valider;
  }
  function pourquoiPas(d) {
    if (geste === 'demande') {
      if (d.valide_le) return 'validé — le dévalider d’abord';
    } else if (geste === 'recevabilite') {
      if (d.valide_le) return 'validé — le dévalider d’abord';
      if (d.decision_le && !d.hors_circuit) return 'décision déjà instruite';
    } else if (geste === 'avis') {
      if (d.valide_le) return 'validé — le dévalider d’abord';
      if (d.recevable == null) return 'recevabilité non contrôlée — l’analyse vient après';
      if (d.recevable === 0) return 'irrecevable — ne se transmet pas au chargé de cours';
    } else if (geste === 'decision') {
      if (d.valide_le) return 'validé — le dévalider d’abord';
      if (d.recevable !== 1) return 'recevabilité non contrôlée';
      if (!d.avis_le) return 'avis du chargé de cours manquant';
    } else {
      if (d.valide_le) return `validé le ${(d.valide_le || '').slice(0, 10)}`;
      return d.manques?.[0] || 'dossier incomplet';
    }
    return null;
  }

  const cochables = vues.filter(eligible);
  const retenus = tous.filter(d => coches.has(d.id));

  /* OÙ EN EST-ON DANS LE CIRCUIT — la question que l'écran ne répondait pas.
   *
   * Les cinq gestes s'alignaient comme cinq boutons indifférents : rien ne
   * disait lequel avait déjà été posé, lequel venait ensuite, ni qu'ils
   * formaient une PROCÉDURE. On reprenait donc de mémoire, chaque matin, ce
   * qu'on avait fait la veille — et c'est ainsi qu'une étape se saute.
   *
   * L'avancement se lit sur les dossiers CONCERNÉS : ceux qu'on a cochés s'il
   * y en a, sinon ceux que les filtres laissent voir. Une frise calculée sur
   * les 588 dossiers de l'année ne dirait rien de la liasse qu'on a en main.
   *
   * Trois états par étape, et ils se DÉDUISENT : franchie par tous, en cours
   * (certains l'ont passée, d'autres pas), à venir. Aucun n'interdit le clic —
   * on revient en arrière pour corriger, c'est précisément ce que la
   * régularisation demande ; ce qui bloque, c'est le serveur, et il le dit
   * dossier par dossier. */
  const reference = retenus.length ? retenus : vues;
  const avancement = ETAPES.map(e => {
    if (!reference.length) return { ...e, etat: 'vide', nb: 0, sur: 0 };
    const nb = reference.filter(e.franchie).length;
    return { ...e, nb, sur: reference.length,
      etat: nb === reference.length ? 'franchie' : nb ? 'partielle' : 'avenir' };
  });
  /* LA PROCHAINE ÉTAPE À POSER : la première que tous n'ont pas franchie.
     C'est elle qu'on met en avant quand on ouvre la fenêtre, et c'est vers
     elle qu'on avance après avoir posé un geste. */
  const prochaine = avancement.find(a => a.etat !== 'franchie')?.cle || null;

  /* LE BORNAGE SE VOIT AVANT LE CLIC. Le serveur refuse un lot qui mêle deux
     unités sur la décision et la validation ; le dire ici évite de composer un
     lot entier pour apprendre ensuite qu'il ne passe pas. */
  const unitesRetenues = [...new Set(retenus.map(d => d.ue_num))];
  const melangeSeance = geste !== 'recevabilite' && unitesRetenues.length > 1;

  /* L'UNITÉ DU LOT — connue dès que les dossiers cochés n'en portent qu'une,
     ce que le bornage garantit. C'est elle qui donne les cours et les acquis
     à cocher : on ne désigne pas des activités dans le vide. */
  const ueDuLot = unitesRetenues.length === 1 ? unitesRetenues[0] : null;

  useEffect(() => {
    if (!ueDuLot || geste !== 'decision') { setComposantes(null); return; }
    let vivant = true;
    fetch(`/api/etudiants/ue/${ueDuLot}/composantes?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(j => { if (vivant) setComposantes(j); })
      .catch(() => { if (vivant) setComposantes(null); });
    return () => { vivant = false; };
  }, [ueDuLot, geste, annee]);

  // Changer d'unité ou de geste invalide ce qui avait été coché pour la précédente.
  useEffect(() => { setCoursCoches(new Set()); setAaCoches(new Set()); }, [ueDuLot]);

  /* CHANGER D'ÉTAPE ÉLAGUE LA SÉLECTION, IL NE L'EFFACE PAS.
   *
   * Elle s'effaçait : on cochait dix-sept dossiers pour poser les dates, puis
   * il fallait les recocher pour la recevabilité, et encore pour l'avis — cinq
   * fois la même liasse, alors que c'est précisément ce que le lot devait
   * épargner. Mais la garder telle quelle rendrait cochés des dossiers que la
   * nouvelle étape refuse, ce qui est la fausse promesse qu'on s'interdit. On
   * garde donc ce qui reste ÉLIGIBLE, et le compteur du pied dit combien. */
  useEffect(() => {
    setCoches(c => {
      if (!c.size) return c;
      const gardes = tous.filter(d => c.has(d.id) && eligible(d)).map(d => d.id);
      return gardes.length === c.size ? c : new Set(gardes);
    });
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [geste, donnees]);

  const aasParCoursLot = useMemo(() => {
    const m = new Map();
    for (const a of (composantes?.aas || [])) {
      const c = a.cours_code || '—';
      if (!m.has(c)) m.set(c, []);
      m.get(c).push(a);
    }
    return m;
  }, [composantes]);

  const basculerDans = (setter) => (v) => setter(s => {
    const n = new Set(s);
    if (n.has(v)) n.delete(v); else n.add(v);
    return n;
  });

  const manque = !retenus.length ? 'Coche au moins un dossier.'
    : melangeSeance
      ? `Le lot mêle ${unitesRetenues.length} unités : une séance du conseil `
        + 'des études se tient par unité.'
      : geste === 'recevabilite' && !recevable && !motifForme.trim()
        ? 'Une irrecevabilité se motive — c’est un refus de forme, notifié à l’étudiant.'
        : geste === 'demande' && !dateDemande && !dateReception
          ? 'Pose au moins une des deux dates.'
          : geste === 'avis' && !avisTexte.trim()
            ? 'Un avis se motive par écrit : il fonde la décision, et il n’y a pas de recours ensuite.'
            : geste === 'avis' && !avisPar.trim()
              ? 'Nomme le chargé de cours qui rend l’avis : c’est lui qui en répond.'
              : geste === 'decision' && branche !== 'refusee' && !base
          ? 'La base légale de la décision est obligatoire : elle part dans eProm.'
          : geste === 'decision' && branche === 'refusee' && !motifRefus.trim()
            ? 'Un refus se motive (RDE art. 88 §3).'
            : geste === 'decision' && branche === 'partielle'
              && portee === 'cours' && !coursCoches.size
              ? 'Une dispense partielle par cours désigne au moins un cours.'
              : geste === 'decision' && branche === 'partielle'
                && portee === 'acquis' && !aaCoches.size
                ? 'Une dispense partielle par acquis désigne au moins un acquis.'
                : null;

  /* CHANGER DE BRANCHE EFFACE CE QUE LA PRÉCÉDENTE AVAIT LAISSÉ. Passer de
     partielle à totale en gardant des cours cochés enverrait une dispense
     complète traînant la cible d'une partielle — et le serveur, lui, les
     ignorerait sans le dire. */
  function poserBranche(v) {
    setBranche(v);
    setErreur(null); setBloquants(null);
    if (v !== 'partielle') { setCoursCoches(new Set()); setAaCoches(new Set()); }
    if (v !== 'refusee') setMotifRefus('');
  }

  function basculer(id) {
    setCoches(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }
  function toutCocher() {
    const ids = cochables.map(d => d.id);
    setCoches(c => (ids.every(i => c.has(i)) ? new Set() : new Set(ids)));
  }

  /* LE TYPE EST « complete », PAS « totale » — ET CE POINT A ÉTÉ LIVRÉ FAUX.
   *
   * La première version de cette fenêtre envoyait `type: 'totale'`, le mot de
   * l'écran. Le serveur, lui, ne connaît que `complete`, `partielle` et
   * `admission` — c'est écrit dans la contrainte de la table ET dans le
   * contrôle. Toute dispense totale posée en série était donc refusée en bloc.
   * Les essais n'avaient rien vu : ils appelaient la ROUTE avec la bonne
   * valeur, jamais l'écran. On vérifie ce que l'utilisateur fait, pas ce qu'on
   * a écrit.
   *
   * Un refus ne dispense rien : ni portée, ni cible, ni pourcentage — il porte
   * `complete` comme *Créer avec la même dispense*, et c'est `decision` qui dit le
   * refus.
   */
  function corpsDecision(ids) {
    const refus = branche === 'refusee';
    const corps = {
      ids, decision: refus ? 'refusee' : 'accordee',
      decision_ce_date: dateCE || undefined,
      commentaire: remarque.trim() || undefined,
    };
    if (refus) {
      corps.type = 'complete';
      corps.motif_refus = motifRefus.trim();
      return corps;
    }
    corps.base_code = base;
    if (branche === 'totale') {
      corps.type = 'complete';
    } else {
      corps.type = 'partielle';
      corps.cible = portee === 'cours' ? 'cours' : 'aa';
      corps.cible_detail = portee === 'cours'
        ? [...coursCoches].join(',') : [...aaCoches].join(',');
      if (portee === 'acquis') {
        corps.equivalences = [...aaCoches].map(code => ({ aa_code: code }));
      }
    }
    return corps;
  }

  async function poser() {
    if (manque) return;
    setEnCours(true); setErreur(null); setBloquants(null);
    const ids = retenus.map(d => d.id);
    // La clé du geste EST le nom de la route : une table de correspondance de
    // plus finirait par mentir le jour où l'on ajoute une étape.
    const route = geste;
    const corps = geste === 'demande'
      ? { ids, date_demande: dateDemande || undefined,
          date_reception: dateReception || undefined }
      : geste === 'recevabilite'
        ? { ids, recevable, motif_irrecevabilite: recevable ? undefined : motifForme.trim() }
        : geste === 'avis'
          ? { ids, avis_sens: avisSens, avis_texte: avisTexte.trim(),
              avis_par: avisPar.trim() }
          : geste === 'decision'
            ? corpsDecision(ids)
            : { ids };
    try {
      const rep = await fetch(`/api/etudiants/valorisations/lot/${route}`, {
        method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify(corps),
      });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) {
        setErreur(j.error || 'Enregistrement refusé.');
        if (Array.isArray(j.bloquants)) setBloquants(j.bloquants);
        return;
      }
      /* ON AVANCE DANS LE CIRCUIT, ON NE REVIENT PAS À LA CASE DÉPART.
       * La sélection reste : c'est la même liasse qui passe l'étape suivante, et
       * la recomposer cinq fois était le travail que le lot devait supprimer.
       * L'élagage ci-dessus retirera ceux que l'étape suivante refuse. */
      const rang = ETAPES.findIndex(e => e.cle === geste);
      setMotifForme(''); setMotifRefus('');
      if (rang >= 0 && rang < ETAPES.length - 1) setGeste(ETAPES[rang + 1].cle);
      else setCoches(new Set());   // la validation close le circuit
      await charger();
      await onChange?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  return (
    <Fenetre icone={IconListCheck} large="grande" onFermer={onClose}
      titre="Analyser les demandes en série"
      sous="Une ligne par demande — on filtre, on coche, on pose le geste"
      pied={<>
        <button onClick={poser} disabled={!!manque || enCours
            || (geste === 'validation' && !donnees?.peut_valider)}
          className="bouton bouton-fort disabled:opacity-40">
          {enCours ? 'Enregistrement…'
            : geste === 'demande'
              ? `Poser les dates${retenus.length > 1 ? ` (${retenus.length})` : ''}`
            : geste === 'avis'
              ? `Enregistrer l'avis${retenus.length > 1 ? ` (${retenus.length})` : ''}`
            : geste === 'recevabilite'
              ? `${recevable ? 'Déclarer recevable' : 'Déclarer irrecevable'}`
                + (retenus.length > 1 ? ` (${retenus.length})` : '')
              : geste === 'decision'
                /* LE BOUTON DIT CE QU'IL POSE. « Enregistrer la décision » ne
                   distingue pas une dispense totale d'un refus — deux gestes
                   dont l'un ferme un dossier et l'autre ouvre une attestation. */
                ? `${branche === 'refusee' ? 'Refuser'
                    : branche === 'partielle' ? 'Accorder la dispense partielle'
                    : 'Accorder la dispense totale'}`
                  + (retenus.length > 1 ? ` (${retenus.length})` : '')
                : `Valider${retenus.length > 1 ? ` (${retenus.length})` : ''}`}
        </button>
        {/* CE QUI DIT POURQUOI LE BOUTON EST GRIS VIT À CÔTÉ DU BOUTON. */}
        <span className="text-[12px] text-slate-500">
          {geste === 'validation' && !donnees?.peut_valider
            ? 'La validation appartient à la direction : la coordination instruit, elle ne valide pas.'
            : manque || `${retenus.length} dossier(s) coché(s) · ${annee}`}
        </span>
        <button onClick={onClose} className="bouton ml-auto">Fermer</button>
      </>}>

      {/* PAS DE SECOND ASCENSEUR NI DE SECONDE MARGE : la fenêtre porte
          déjà son défilement et son padding. Ce conteneur en ajoutait un
          « flex-1 min-h-0 overflow-auto p-5 » — mais son parent n'est pas
          une boîte flex, si bien que flex-1 ne faisait rien, les marges se
          cumulaient à 36 px et deux ascenseurs se chevauchaient au pied de
          la fenêtre. */}
      <div className="space-y-3">

        {erreur && (
          <div className="carte p-3 text-[12px] text-rose-700 space-y-1">
            <div className="flex items-start gap-1.5">
              <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
            </div>
            {/* LES DOSSIERS QUI BLOQUENT SONT NOMMÉS : on les décoche, on ne
                devine pas lesquels. */}
            {bloquants?.map(b => (
              <div key={b.id} className="pl-5 text-slate-600">
                {b.qui} — {b.pourquoi}
              </div>
            ))}
          </div>
        )}

        {/* 1 — LE GESTE, ET OÙ L'ON EN EST.
            Cinq boutons indifférents ne disent pas qu'ils forment une
            procédure : on doit VOIR qu'on avance. L'étape franchie s'efface et
            porte sa coche — elle reste cliquable, car on revient en arrière
            pour corriger —, l'étape courante est mise en valeur, et la suivante
            attend. La flèche entre deux étapes dit le sens de lecture. */}
        <section className="carte p-3 space-y-2">
          <div className="flex items-center gap-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-500">
              1 · L'étape du circuit
            </div>
            {reference.length > 0 && (
              <div className="text-[11px] text-slate-400">
                sur {retenus.length ? `les ${reference.length} dossier(s) cochés`
                  : `les ${reference.length} dossier(s) visibles`}
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1">
            {avancement.map((a, i) => (
              <Fragment key={a.cle}>
                {i > 0 && (
                  <IconChevronRight size={14} aria-hidden="true"
                    className="flex-none text-slate-300" />
                )}
                <button title={a.aide}
                  onClick={() => { setGeste(a.cle); setErreur(null); setBloquants(null); }}
                  className={`controle text-[13px] flex items-center gap-1.5 ${
                    geste === a.cle
                      ? 'border-slate-800 text-slate-900 font-semibold shadow-pose'
                      : a.etat === 'franchie'
                        ? 'text-slate-400 border-transparent'
                        : 'text-slate-600'}`}>
                  {/* LE NUMÉRO DIT L'ORDRE, LA COCHE DIT QUE C'EST FAIT. */}
                  {a.etat === 'franchie'
                    ? <IconCheck size={14} className="flex-none text-emerald-600" />
                    : <span className={`flex-none w-4 h-4 grid place-items-center rounded-full
                        text-[10px] font-semibold ${geste === a.cle
                          ? 'bg-slate-800 text-white' : 'bg-slate-200 text-slate-600'}`}>
                        {i + 1}
                      </span>}
                  {a.court}
                  {a.etat === 'partielle' && (
                    <span className="text-[11px] font-normal text-amber-700">
                      {a.nb}/{a.sur}
                    </span>
                  )}
                </button>
              </Fragment>
            ))}
          </div>
          <div className="flex flex-wrap items-baseline gap-2 text-[12px]">
            <span className="text-slate-600">
              {ETAPES.find(g => g.cle === geste)?.aide}
            </span>
            {/* CE QUI RESTE À POSER, DIT SANS DÉTOUR. Sans cette phrase, la
                frise montre l'état mais ne dit pas quoi faire ensuite. */}
            {prochaine && prochaine !== geste && (
              <button className="text-[12px] underline text-slate-500"
                onClick={() => { setGeste(prochaine); setErreur(null); setBloquants(null); }}>
                Prochaine étape à poser : {ETAPES.find(g => g.cle === prochaine)?.court}
              </button>
            )}
            {!prochaine && reference.length > 0 && (
              <span className="text-[12px] text-emerald-700">
                Circuit parcouru pour ces dossiers.
              </span>
            )}
          </div>

          {geste === 'demande' && (
            <div className="flex flex-wrap items-center gap-3 pt-1">
              <label className="flex items-center gap-1.5 text-[13px]">
                Date de la demande
                <input type="date" value={dateDemande}
                  onChange={e => setDateDemande(e.target.value)}
                  className="controle text-[13px]" />
              </label>
              <label className="flex items-center gap-1.5 text-[13px]">
                Date de réception
                <input type="date" value={dateReception}
                  onChange={e => setDateReception(e.target.value)}
                  className="controle text-[13px]" />
              </label>
              <BulleAide titre="Pourquoi deux dates">
                Celle du formulaire, et celle à laquelle l'Institut l'a reçu.
                C'est la PLUS TARDIVE des deux qui compte pour le délai — sans
                quoi il suffirait d'antidater un formulaire pour rentrer dans
                les temps.
                {'\n\n'}Le délai lui-même (RDE art. 28) : avant le premier jour
                de cours de l'unité si sa date d'ouverture est encodée, sinon au
                plus tard le quinzième jour suivant le début de l'année.
              </BulleAide>
            </div>
          )}

          {geste === 'avis' && (
            <div className="space-y-2 pt-1">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-[12px] text-slate-500">Sens de l'avis</span>
                {[['favorable', 'Favorable'], ['partiel', 'Partiel'],
                  ['defavorable', 'Défavorable']].map(([v, l]) => (
                  <label key={v} className="flex items-center gap-1.5 text-[13px]">
                    <input type="radio" checked={avisSens === v}
                      onChange={() => setAvisSens(v)} /> {l}
                  </label>
                ))}
                {/* QUI REND L'AVIS N'EST PAS QUI LE SAISIT. */}
                <input value={avisPar} onChange={e => setAvisPar(e.target.value)}
                  placeholder="Chargé de cours qui rend l'avis — NOM Prénom"
                  className="controle text-[13px] min-w-[18rem]" />
              </div>
              <textarea value={avisTexte} onChange={e => setAvisTexte(e.target.value)}
                rows={3}
                placeholder="Le constat pédagogique : ce qui a été comparé au dossier pédagogique, et ce qu'on en conclut"
                className="controle text-[13px] w-full h-auto py-1.5" />
              <div className="flex items-start gap-2">
                <div className="text-[12px] text-slate-500 flex-1">
                  Cet avis sera écrit <strong>à l'identique sur tous les dossiers
                  cochés</strong>, au nom de la personne nommée ci-dessus.
                </div>
                <BulleAide titre="Un avis rendu en série">
                  Il n'a de sens que sur une cohorte homogène : même unité, même
                  diplôme antérieur, même analyse. Huit étudiants d'une reprise
                  d'études qui présentent le même titre reçoivent le même
                  constat — le Conseil ne l'a formulé qu'une fois.
                  {'\n\n'}Si l'analyse diffère d'un étudiant à l'autre, ce n'est
                  plus un lot : il faut ouvrir les dossiers un à un.
                  {'\n\n'}L'avis est ce qui fonde la décision, et les décisions
                  de valorisation ne sont pas susceptibles de recours : la
                  motivation est tout ce qui restera pour la défendre.
                </BulleAide>
              </div>
            </div>
          )}

          {geste === 'recevabilite' && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <label className="flex items-center gap-1.5 text-[13px]">
                <input type="radio" checked={recevable}
                  onChange={() => setRecevable(true)} /> Recevable
              </label>
              <label className="flex items-center gap-1.5 text-[13px]">
                <input type="radio" checked={!recevable}
                  onChange={() => setRecevable(false)} /> Irrecevable
              </label>
              {!recevable && (
                <input value={motifForme} onChange={e => setMotifForme(e.target.value)}
                  placeholder="Motif de forme — hors délai, pièces non officielles…"
                  className="controle text-[13px] flex-1 min-w-[20rem]" />
              )}
            </div>
          )}

          {geste === 'decision' && (
            <div className="space-y-2 pt-1">
              {/* TROIS BRANCHES, ET C'EST LE VOCABULAIRE DE LA MAISON.
                  L'écran posait d'abord « accordée / refusée », puis une portée
                  par-dessus : deux questions là où le Conseil n'en tranche
                  qu'une. Charles l'a dit dans ses mots — « dispense totale,
                  c'est VA/VAE totale ; sinon c'est une dispense partielle, et
                  là ce sera un ou des cours, ou un ou des AA ». C'est aussi la
                  constante DECISIONS du fichier, qui disait déjà totale ·
                  partielle · refusée. On ne garde qu'un niveau. */}
              <div className="flex flex-wrap items-center gap-3">
                {[['totale', 'Dispense totale', "L'unité entière et tous ses acquis"],
                  ['partielle', 'Dispense partielle', 'Des cours ou des acquis'],
                  ['refusee', 'Refusée', 'Rien de dispensé — motif obligatoire']]
                  .map(([v, l, aide]) => (
                  <label key={v} title={aide}
                    className="flex items-center gap-1.5 text-[13px]">
                    <input type="radio" checked={branche === v}
                      onChange={() => poserBranche(v)} /> {l}
                  </label>
                ))}
                <span className="text-[12px] text-slate-500">Séance du</span>
                <input type="date" value={dateCE} onChange={e => setDateCE(e.target.value)}
                  className="controle text-[13px]" />
              </div>
              {branche !== 'refusee' ? (
                <div className="space-y-1.5">
                  <div className="flex flex-wrap items-center gap-2">
                    {/* LE CODE NE DIT RIEN, LE LIBELLÉ DIT TOUT — et il
                        manquait : la liste s'écrivait « V1 — », « V2 — »,
                        parce que le champ s'appelle `libelle` et non `label`.
                        Six lignes à choisir sans savoir ce qu'elles sont, sur
                        une valeur qui part dans eProm. */}
                    <select value={base} onChange={e => setBase(e.target.value)}
                      className="controle text-[13px] min-w-[30rem]">
                      <option value="">Sur quoi la dispense se fonde-t-elle ?…</option>
                      {bases.map(b => (
                        <option key={b.code} value={b.code}>
                          {b.famille} {b.code} — {b.libelle}
                        </option>
                      ))}
                    </select>
                    <BulleAide titre="La base légale de la décision">
                      C'est le fondement juridique de la dispense : ce qui, dans
                      le dossier de l'étudiant, autorise le Conseil à la lui
                      accorder. Elle part telle quelle dans eProm, et c'est elle
                      que le vérificateur lit pour savoir pourquoi la dispense
                      tient. Une décision accordée sans base n'est pas encodable,
                      donc pas conforme — et c'est exactement ce qui s'est
                      produit en septembre 2026.
                      {'\n\n'}Deux familles, et elles ne se choisissent pas au
                      hasard : VAF pour des acquis FORMELS — un titre, une
                      attestation d'enseignement —, VANFI pour des acquis tirés
                      de l'EXPÉRIENCE. Une demande VA attend une VAF, une demande
                      VAE attend une VANFI.
                    </BulleAide>
                  </div>
                  {/* CE QUE LA BASE CHOISIE VEUT DIRE, SOUS LA LISTE. Une liste
                      déroulante se referme : ce qu'on vient de choisir doit
                      rester lisible au moment où l'on clique sur Enregistrer. */}
                  {base && (
                    <div className="text-[12px] text-slate-600">
                      {(() => {
                        const b = bases.find(x => x.code === base);
                        if (!b) return null;
                        return <>
                          <strong>{b.famille} {b.code}</strong> — {b.libelle}
                        </>;
                      })()}
                    </div>
                  )}
                  <div className="text-[12px] text-slate-500">
                    Elle part dans eProm : une décision non encodée est une
                    décision non conforme.
                  </div>
                </div>
              ) : (
                <input value={motifRefus} onChange={e => setMotifRefus(e.target.value)}
                  placeholder="Motivation du refus — elle est tout ce qui reste, la décision n’est pas susceptible de recours"
                  className="controle text-[13px] w-full" />
              )}
              {/* CE QUE LA PARTIELLE DISPENSE — et elle seule le demande.
                  La totale n'a rien à cocher : c'est l'unité entière, c'est ce
                  que le mot veut dire. Le Conseil arrête une fois ce qu'il
                  dispense ; le porter dossier par dossier, c'est autant
                  d'occasions de se tromper d'une case. */}
              {branche === 'totale' && (
                <div className="text-[12px] text-slate-500">
                  L'unité entière et tous ses acquis — rien à cocher.
                  L'attestation « Valorisation » devient possible, et
                  l'étudiant cesse d'y être compté comme élève régulier.
                </div>
              )}
              {branche === 'partielle' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="text-[12px] text-slate-500">Ce qui est dispensé</span>
                    {[['cours', 'Un ou des cours'],
                      ['acquis', 'Un ou des acquis']].map(([v, l]) => (
                      <label key={v} className="flex items-center gap-1.5 text-[13px]">
                        <input type="radio" checked={portee === v}
                          onChange={() => setPortee(v)} /> {l}
                      </label>
                    ))}
                  </div>

                  {!ueDuLot ? (
                    <div className="text-[12px] text-slate-500">
                      Coche d'abord les dossiers : les cours et les acquis
                      viennent de leur unité.
                    </div>
                  ) : !composantes ? (
                    <div className="text-[12px] text-slate-400">Chargement…</div>
                  ) : portee === 'cours' ? (
                    !composantes.cours?.length ? (
                      <div className="text-[12px] text-slate-500">
                        L'unité {ueDuLot} n'a aucun cours encodé pour {annee}.
                      </div>
                    ) : (
                      <div className="carte-plate p-1 max-h-48 overflow-auto">
                        {composantes.cours.map(c => (
                          <label key={c.cours_code}
                            className="flex items-center gap-2 px-2 py-1 rounded-champ
                                       hover:bg-slate-50 cursor-pointer">
                            <input type="checkbox" checked={coursCoches.has(c.cours_code)}
                              onChange={() => basculerDans(setCoursCoches)(c.cours_code)} />
                            <span className="text-[13px]">{c.cours_nom || c.cours_code}</span>
                            <span className="text-[11px] text-slate-400">{c.cours_code}</span>
                          </label>
                        ))}
                      </div>
                    )
                  ) : (
                    !composantes.aas?.length ? (
                      <div className="text-[12px] text-slate-500">
                        L'unité {ueDuLot} n'a aucun acquis encodé.
                      </div>
                    ) : (
                      <div className="carte-plate p-1 max-h-48 overflow-auto">
                        {[...aasParCoursLot.entries()].map(([code, liste]) => (
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
                                  onChange={() => basculerDans(setAaCoches)(a.aa_code)}
                                  className="mt-0.5" />
                                <span className="text-[13px]">{a.aa_code}</span>
                                <span className="text-[12px] text-slate-500">
                                  {a.description}
                                </span>
                              </label>
                            ))}
                          </div>
                        ))}
                      </div>
                    )
                  )}

                  <div className="text-[12px] text-slate-500">
                    Une dispense partielle ne peut pas couvrir toutes les
                    activités de l'unité : ce serait une dispense complète
                    déguisée, et le serveur la refuse.
                  </div>
                </div>
              )}

              {/* LA MÊME RAISON POUR TOUT LE LOT. C'est là qu'on écrit
                  « dispensé des heures de stage, mais doit présenter
                  l'examen » — une condition que le PV tait n'a jamais été
                  posée. */}
              <input value={remarque} onChange={e => setRemarque(e.target.value)}
                placeholder="Remarque du Conseil, appliquée à tout le lot (facultative) — elle s'imprime sur le PV"
                className="controle text-[13px] w-full" />
            </div>
          )}
        </section>

        {/* 2 — LES FILTRES ET LA LISTE. */}
        <section className="carte p-0 overflow-hidden">
          <div className="flex flex-wrap items-center gap-2 px-3 py-2
                          border-b border-slate-200">
            <span className="text-[11px] uppercase tracking-wide text-slate-500">
              2 · Les demandes
            </span>
            <div className="relative">
              <IconSearch size={14} className="absolute left-2 top-1/2 -translate-y-1/2
                                               text-slate-400 pointer-events-none" />
              <input value={q} onChange={e => setQ(e.target.value)}
                placeholder="Nom ou prénom…"
                className="controle controle-icone text-[13px] w-52" />
            </div>
            <select value={fSection} onChange={e => setFSection(e.target.value)}
              className="controle text-[13px]">
              <option value="">Toutes les sections</option>
              {sections.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={fUe} onChange={e => setFUe(e.target.value)}
              className="controle text-[13px] max-w-[20rem]">
              <option value="">Toutes les unités</option>
              {unites.map(([n, nom]) => (
                <option key={n} value={n}>
                  {n === 0 ? 'Admission de section' : `${n} — ${nom}`}
                </option>
              ))}
            </select>
            <select value={fEtat} onChange={e => setFEtat(e.target.value)}
              className="controle text-[13px]">
              <option value="">Tous les états</option>
              {(donnees?.etats || []).map(e => (
                <option key={e.val || e} value={e.val || e}>{e.label || e}</option>
              ))}
            </select>
            <span className="ml-auto text-[12px] text-slate-500">
              {vues.length} affichée(s) · {cochables.length} cochable(s)
            </span>
            {cochables.length > 0 && (
              <button onClick={toutCocher} className="bouton text-[12px]">
                {cochables.every(d => coches.has(d.id)) ? 'Tout décocher' : 'Tout cocher'}
              </button>
            )}
          </div>

          {!donnees ? (
            <div className="p-5 text-[13px] text-slate-400">Chargement…</div>
          ) : !vues.length ? (
            <div className="p-5 text-[13px] text-slate-400">
              Aucune demande ne répond à ces filtres en {annee}.
            </div>
          ) : (
            <table className="w-full text-[13px]">
              <thead className="tab-entete">
                <tr>
                  <th className="w-8 px-3 py-1.5"></th>
                  <th className="text-left px-2 py-1.5 font-medium">Étudiant</th>
                  <th className="text-left px-2 py-1.5 font-medium">Unité</th>
                  <th className="text-left px-2 py-1.5 font-medium">Nature</th>
                  <th className="text-left px-2 py-1.5 font-medium">État</th>
                  <th className="text-left px-2 py-1.5 font-medium">Preuves</th>
                  <th className="text-left px-2 py-1.5 font-medium">Ce qui manque</th>
                </tr>
              </thead>
              <tbody>
                {vues.map(d => {
                  const ok = eligible(d);
                  const teinte = TEINTE_PORTE[d.porte] || TEINTE_PORTE.va;
                  const empeche = pourquoiPas(d);
                  return (
                    <tr key={d.id}
                      className={`border-t border-slate-100 ${ok ? '' : 'opacity-60'}`}>
                      <td className="px-3 py-1.5 align-top">
                        <input type="checkbox" checked={coches.has(d.id)}
                          disabled={!ok} onChange={() => basculer(d.id)} />
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <span className="font-medium">{(d.nom || '').toUpperCase()}</span>
                        {' '}{d.prenom}
                        {d.section && (
                          <span className="text-[11px] text-slate-500"> · {d.section}</span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        {d.ue_num === 0 ? 'Admission de section'
                          : <>{d.ue_num}<span className="text-slate-500"> — {d.ue_nom}</span></>}
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        <span className="px-1.5 py-0.5 rounded-champ border text-[11px]"
                          style={{ color: teinte.t, background: teinte.f,
                                   borderColor: teinte.b }}>
                          {d.porte === 'admission' ? 'AD' : d.porte === 'vae' ? 'VAE' : 'VA'}
                        </span>
                        {d.type && (
                          <span className="ml-1 text-[11px] text-slate-500">
                            {d.type === 'totale' ? 'Totale'
                              : d.type === 'partielle' ? 'Partielle' : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-2 py-1.5 align-top">
                        {(donnees.etats || []).find(e => (e.val || e) === d.etat)?.label
                          || d.etat}
                        {d.valide_le && (
                          <div className="text-[11px] text-emerald-700">
                            validé{d.valide_par ? ` par ${d.valide_par}` : ''}
                          </div>
                        )}
                      </td>
                      <td className={`px-2 py-1.5 align-top ${d.nb_preuves ? ''
                        : 'text-amber-700'}`}>
                        {d.nb_preuves || 'aucune'}
                      </td>
                      <td className="px-2 py-1.5 align-top text-[12px] text-slate-500">
                        {empeche || d.manques?.[0] || '—'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
      </div>
    </Fenetre>
  );
}

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
  const [adCoches, setAdCoches] = useState(() => new Set());   // étudiants admis

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
    setChoix(new Map()); setAdCoches(new Set());
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
  /* L'ADMISSION N'EST PAS UNE CASE DE LA GRILLE.
   *
   * Elle se décide PAR SECTION — on n'est pas admis « à l'UE 95 », on est
   * admis dans le cursus après vérification des capacités préalables requises,
   * et cela se reporte ensuite sur les unités de base. La proposer case par
   * case, comme une VA, c'était faire croire qu'on l'accorde unité par unité.
   * Elle a donc sa colonne, une seule, à gauche du tableau. */
  const SUITE = [null, 'va', 'vae'];
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
  const TEINTE = TEINTE_PORTE;
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
    if (!choix.size && !adCoches.size) return;
    setEnCours(true); setErreur(null);
    try {
      const cellules = [...choix.entries()].map(([cle, porte]) => {
        const [eid, ue] = cle.split(':');
        return { etudiant_id: Number(eid), ue_num: Number(ue), porte };
      });
      // L'admission part avec la SECTION, sans unité : c'est là qu'elle porte.
      for (const eid of adCoches) {
        cellules.push({ etudiant_id: eid, ue_num: 0, porte: 'admission', section });
      }
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
        <button onClick={enregistrer} disabled={(!choix.size && !adCoches.size) || enCours}
          className="bouton bouton-fort disabled:opacity-40">
          {enCours ? 'Ouverture…'
            : (choix.size + adCoches.size) > 1
              ? `Ouvrir ${choix.size + adCoches.size} dossiers` : 'Ouvrir le dossier'}
        </button>
        <span className="text-[12px] text-slate-500">
          {!section ? 'Choisis une section'
            : !choix.size && !adCoches.size
              ? 'Coche une admission, ou clique une case pour poser VA ou VAE'
              : `${choix.size + adCoches.size} demande(s)`}
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
                  className="controle controle-icone text-[13px] w-56" />
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
            {[['admission', 'admission dans la section'], ['va', 'acquis formels'],
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
                placeholder="Un nom…" className="controle controle-icone text-[13px]" />
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
                  {/* UNE COLONNE, PAS UNE CASE PAR UNITÉ : l'admission vaut
                      pour la section entière. */}
                  <th className="px-2 py-2 font-medium align-bottom min-w-[5rem]"
                    title="Admission dans la section — se reporte sur les unités de base">
                    <div className="text-[13px]" style={{ color: TEINTE.admission.t }}>AD</div>
                    <div className="text-[10px] text-slate-500 font-normal">section</div>
                  </th>
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
                    <td className="px-1 py-1 text-center align-middle">
                      {e.admission ? (
                        <span className="inline-block px-1.5 py-0.5 rounded-champ text-[10px]"
                          style={{ color: TEINTE.admission.t, background: TEINTE.admission.f }}
                          title={`Admission · ${e.admission.etat}`}>AD</span>
                      ) : (
                        <button
                          onClick={() => setAdCoches(s0 => {
                            const n = new Set(s0);
                            if (n.has(e.id)) n.delete(e.id); else n.add(e.id);
                            return n;
                          })}
                          className="w-11 h-6 rounded-champ border text-[11px] font-medium
                                     hover:border-slate-400"
                          style={adCoches.has(e.id) ? {
                            color: TEINTE.admission.t, background: TEINTE.admission.f,
                            borderColor: TEINTE.admission.b,
                          } : { color: '#CBD5E1', borderColor: '#E2E8F0' }}>
                          {adCoches.has(e.id) ? 'AD' : '—'}
                        </button>
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

/* ══ DÉCIDER PAR ÉTUDIANT ═════════════════════════════════════════════════
 *
 * Demandé par Charles le 21 septembre 2026 : « on reçoit parfois un dossier
 * pour un étudiant et plusieurs UE. On traite toutes les UE de tout le monde en
 * même temps. On sort le PV quand tout est fait. Il me faut la possibilité
 * d'encoder et accepter les VA pour un étudiant. »
 *
 * UN ÉTUDIANT, UNE LIGNE PAR UNITÉ, UNE DÉCISION PAR LIGNE — totale, partielle
 * avec SES cours ou SES acquis, refusée avec son motif — et un seul
 * enregistrement, pour une séance datée. Puis, pour la direction, la
 * validation des mêmes dossiers d'un clic.
 *
 * Ce qui ne se décide pas ici se VOIT ici, avec sa raison : un dossier non
 * recevable, sans avis, déjà validé. Une case cochable sur un dossier que le
 * serveur refusera est une fausse promesse.
 */
const MOTS_ETAT_BLOQUANT = d => (
  d.ue_num === 0 || d.type === 'admission' ? 'Admission — se décide dans son dossier'
    : d.valide_le ? `Validé le ${String(d.valide_le).slice(0, 10)} — ne se modifie plus`
      : d.recevable == null ? 'Recevabilité à contrôler d’abord'
        : d.recevable === 0 ? 'Irrecevable'
          : !d.avis_le ? 'Avis du chargé de cours manquant'
            : null);

function choixInitial(d) {
  // C'est `decision_le` qui dit qu'une décision a été POSÉE : la colonne
  // `decision` vaut « accordee » par défaut en base, et la lire seule
  // présentait comme « totale » chaque unité encore à décider.
  if (!d.decision_le) return { branche: '', cible: 'cours', coches: [], motif: '' };
  if (d.decision === 'refusee') return { branche: 'refusee', cible: 'cours', coches: [], motif: d.motif_refus || '' };
  if (d.type === 'partielle') {
    return { branche: 'partielle', cible: d.cible === 'aa' ? 'acquis' : 'cours',
      coches: String(d.cible_detail || '').split(',').map(x => x.trim()).filter(Boolean),
      motif: '' };
  }
  return { branche: 'totale', cible: 'cours', coches: [], motif: '' };
}

function DeciderParEtudiant({ annee, onClose, onChange }) {
  const [dossiers, setDossiers] = useState(null);
  const [peutValider, setPeutValider] = useState(false);
  const [bases, setBases] = useState([]);
  const [q, setQ] = useState('');
  const [etudId, setEtudId] = useState(null);
  const [choix, setChoix] = useState({});          // id → { branche, cible, coches[], motif, base }
  const [composantes, setComposantes] = useState({}); // ue_num → { cours, aas }
  const [dateCE, setDateCE] = useState(aujourdHui());
  const [baseCommune, setBaseCommune] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [bloquants, setBloquants] = useState(null);
  const [fait, setFait] = useState(null);          // { ids, valides? }

  const charger = useCallback(async () => {
    const r = await fetch(`/api/etudiants/valorisations/analyse?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setErreur(j.error || 'Lecture refusée.'); return; }
    setDossiers(j.dossiers || []);
    setPeutValider(!!j.peut_valider);
  }, [annee]);
  useEffect(() => { charger(); }, [charger]);
  useEffect(() => {
    fetch('/api/etudiants/valorisations/referentiel', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(j => setBases(j?.bases || [])).catch(() => {});
  }, []);

  // Les étudiants qui ont au moins un dossier, avec ce qui reste à décider.
  const etudiants = useMemo(() => {
    const m = new Map();
    for (const d of dossiers || []) {
      if (!m.has(d.etudiant_id)) {
        m.set(d.etudiant_id, { id: d.etudiant_id, nom: d.nom, prenom: d.prenom,
          id_ecampus: d.id_ecampus, section: d.section, n: 0, aDecider: 0 });
      }
      const e = m.get(d.etudiant_id);
      e.n += 1;
      if (!MOTS_ETAT_BLOQUANT(d) && !d.decision_le) e.aDecider += 1;
    }
    const t = q.trim().toLowerCase();
    return [...m.values()]
      .filter(e => !t || `${e.nom} ${e.prenom} ${e.id_ecampus || ''}`.toLowerCase().includes(t))
      .sort((a, b) => (b.aDecider - a.aDecider) || `${a.nom}`.localeCompare(`${b.nom}`, 'fr'));
  }, [dossiers, q]);

  const lignes = useMemo(() => (dossiers || [])
    .filter(d => d.etudiant_id === etudId)
    .sort((a, b) => a.ue_num - b.ue_num), [dossiers, etudId]);

  // Changer d'étudiant efface le message et le « c'est fait » ; RECHARGER après
  // un enregistrement, non — sans quoi le bouton « Valider ces dossiers »
  // disparaissait à l'instant même où il devenait utile.
  useEffect(() => { setErreur(null); setBloquants(null); setFait(null); }, [etudId]);

  // Choisir un étudiant repart de ce qui est déjà décidé pour lui.
  useEffect(() => {
    const init = {};
    for (const d of lignes) init[d.id] = { ...choixInitial(d), base: d.base_code || '' };
    setChoix(init);
    const b = lignes.map(d => d.base_code).find(Boolean);
    if (b) setBaseCommune(b);
    const dt = lignes.map(d => d.decision_ce_date).find(Boolean);
    if (dt) setDateCE(String(dt).slice(0, 10));
  }, [lignes]);

  // Les cours et acquis d'une unité, chargés à la demande (partielle seulement).
  useEffect(() => {
    for (const d of lignes) {
      if (choix[d.id]?.branche !== 'partielle' || composantes[d.ue_num]) continue;
      fetch(`/api/etudiants/ue/${d.ue_num}/composantes?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() })
        .then(r => (r.ok ? r.json() : null))
        .then(j => j && setComposantes(c => ({ ...c, [d.ue_num]: j })))
        .catch(() => {});
    }
  }, [choix, lignes, composantes, annee]);

  const poser = (id, patch) => setChoix(c => ({ ...c, [id]: { ...c[id], ...patch } }));
  const decidables = lignes.filter(d => !MOTS_ETAT_BLOQUANT(d));
  /* SEULES LES LIGNES MODIFIÉES PARTENT. Une unité déjà décidée, laissée
     telle quelle, n'est pas réécrite : la renvoyer referait une ligne de
     journal pour rien, et — pour un étudiant inscrit dans DEUX sections —
     décider plus tard l'unité de l'autre section la mêlerait à celles-ci, et
     le serveur refuserait le lot. */
  const signature = c => JSON.stringify([c?.branche || '', c?.cible || '',
    [...(c?.coches || [])].sort(), (c?.motif || '').trim(), c?.base || '']);
  const modifiee = d => {
    const c = choix[d.id];
    if (!c?.branche) return false;
    if (!d.decision_le) return true;
    const avant = { ...choixInitial(d), base: d.base_code || '' };
    return signature(c) !== signature(avant)
      // La base commune ne compte que pour un ACCORD : un refus n'en a pas.
      || (c.branche !== 'refusee' && !c.base && baseCommune
          && baseCommune !== (d.base_code || ''))
      || (d.decision_ce_date && String(d.decision_ce_date).slice(0, 10) !== dateCE);
  };
  const retenues = decidables.filter(modifiee);

  /* TOUT COCHER — la demande de Charles, au sens le plus courant : tout
     accorder entièrement. Ce qui est déjà réglé autrement (une partielle, un
     refus) n'est pas écrasé : on ne défait pas d'un clic ce qu'on a désigné. */
  const toutEnTotale = () => setChoix(c => {
    const n = { ...c };
    for (const d of decidables) if (!n[d.id]?.branche) n[d.id] = { ...n[d.id], branche: 'totale' };
    return n;
  });

  const manqueLigne = d => {
    const c = choix[d.id] || {};
    if (c.branche === 'refusee' && !c.motif?.trim()) return `UE ${d.ue_num} : motif du refus manquant`;
    if (c.branche === 'partielle' && !c.coches?.length) {
      return `UE ${d.ue_num} : cochez les ${c.cible === 'acquis' ? 'acquis' : 'cours'} dispensés`;
    }
    if ((c.branche === 'totale' || c.branche === 'partielle') && !(c.base || baseCommune)) {
      return `UE ${d.ue_num} : base de la décision manquante`;
    }
    return null;
  };
  const manque = !etudId ? 'Choisissez un étudiant.'
    : !retenues.length ? (decidables.some(d => d.decision_le)
      ? 'Rien n’a changé depuis le dernier enregistrement.'
      : 'Posez au moins une décision.')
      : !/^\d{4}-\d{2}-\d{2}$/.test(dateCE) ? 'Date de la séance manquante.'
        : retenues.map(manqueLigne).find(Boolean) || null;

  async function enregistrer() {
    if (manque) return;
    setEnCours(true); setErreur(null); setBloquants(null);
    const corpsLignes = retenues.map(d => {
      const c = choix[d.id];
      if (c.branche === 'refusee') {
        return { id: d.id, decision: 'refusee', motif_refus: c.motif.trim() };
      }
      const l = { id: d.id, decision: 'accordee', base_code: c.base || baseCommune };
      if (c.branche === 'totale') return { ...l, type: 'complete' };
      return { ...l, type: 'partielle',
        cible: c.cible === 'acquis' ? 'aa' : 'cours',
        cible_detail: c.coches.join(','),
        ...(c.cible === 'acquis' ? { equivalences: c.coches.map(code => ({ aa_code: code })) } : {}) };
    });
    try {
      const r = await fetch('/api/etudiants/valorisations/lot/decisions', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision_ce_date: dateCE, lignes: corpsLignes }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErreur(j.error || 'Enregistrement refusé.');
        if (Array.isArray(j.bloquants)) setBloquants(j.bloquants);
        return;
      }
      setFait({ ids: j.ids || [] });
      await charger(); await onChange?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /* ACCEPTER — la validation, geste de la direction. Mêmes dossiers, même
     séance ; le serveur refuse ce qui n'est pas complet et le nomme. */
  /* CE QUI SE VALIDE : ce qu'on vient d'enregistrer, ou — en rouvrant la
     fenêtre le lendemain — les dossiers de l'étudiant que le serveur dit
     prêts. La validation ne se proposait qu'à la seconde qui suivait
     l'enregistrement : le lendemain, on ne pouvait plus accepter. */
  const aValider = fait?.ids?.length ? fait.ids
    : lignes.filter(d => d.pret_a_valider).map(d => d.id);

  async function valider() {
    setEnCours(true); setErreur(null); setBloquants(null);
    try {
      const r = await fetch('/api/etudiants/valorisations/lot/validation', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: aValider }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) {
        setErreur(j.error || 'Validation refusée.');
        if (Array.isArray(j.bloquants)) setBloquants(j.bloquants);
        return;
      }
      setFait({ ids: aValider, valides: j.valides });
      await charger(); await onChange?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const etud = etudiants.find(e => e.id === etudId)
    || (dossiers || []).filter(d => d.etudiant_id === etudId)
      .map(d => ({ nom: d.nom, prenom: d.prenom, id_ecampus: d.id_ecampus }))[0];

  return (
    <Fenetre icone={IconRubberStamp} large="grande" onFermer={onClose}
      titre="Décider par étudiant"
      sous={etud ? `${(etud.nom || '').toUpperCase()} ${etud.prenom || ''} — une décision par unité, une séance`
        : 'Toutes les unités d’un même dossier, dans une même séance'}
      pied={<>
        {peutValider && !retenues.length && aValider.length > 0 && !fait?.valides ? (
          <button className="bouton bouton-fort disabled:opacity-40" disabled={enCours}
            onClick={valider}>
            {enCours ? 'Validation…' : `Valider ${aValider.length} dossier(s)`}
          </button>
        ) : (
          <button className="bouton bouton-fort disabled:opacity-40" disabled={!!manque || enCours}
            onClick={enregistrer}>
            {enCours ? 'Enregistrement…' : `Enregistrer ${retenues.length || ''} décision(s)`}
          </button>
        )}
        <span className="text-[12px] text-slate-500 min-w-0">
          {fait?.valides ? `${fait.valides} dossier(s) validé(s).`
            : fait ? `${fait.ids.length} décision(s) enregistrée(s), séance du ${dateCE}.`
              + (peutValider ? ' Vous pouvez les valider.' : ' La validation revient à la direction.')
              : manque}
        </span>
        <button className="bouton ml-auto" onClick={onClose}>Fermer</button>
      </>}>

      {erreur && (
        <div className="carte p-3 text-[12px] text-rose-700 mb-3">
          <div className="flex items-start gap-1.5"><IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}</div>
          {bloquants?.length > 0 && (
            <ul className="mt-1.5 pl-5 list-disc text-slate-700">
              {bloquants.map(b => <li key={b.id}><b>{b.qui}</b> — {b.pourquoi}</li>)}
            </ul>
          )}
        </div>
      )}

      {!etudId ? (
        <div className="space-y-2">
          <div className="relative">
            <IconSearch size={15} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value)} autoFocus
              placeholder="Un nom, un prénom ou un matricule…"
              className="controle controle-icone w-full text-[13px]" />
          </div>
          {!dossiers ? <div className="text-[13px] text-slate-400">Chargement…</div>
            : !etudiants.length ? <div className="text-[13px] text-slate-500">Aucun étudiant n’a de demande de valorisation en {annee}.</div>
              : (
                <div className="carte divide-y divide-slate-100 max-h-[55vh] overflow-auto">
                  {etudiants.map(e => (
                    <button key={e.id} onClick={() => setEtudId(e.id)}
                      className="w-full text-left px-3 py-2 flex items-center gap-3 hover:bg-slate-100">
                      <span className="flex-1 min-w-0 text-[13px] truncate">
                        <b>{(e.nom || '').toUpperCase()}</b> {e.prenom}
                        <span className="text-slate-400"> · {e.id_ecampus}{e.section ? ` · ${e.section}` : ''}</span>
                      </span>
                      <span className="text-[11px] text-slate-500 tabular-nums flex-none">
                        {e.n} unité(s){e.aDecider ? ` · ${e.aDecider} à décider` : ''}
                      </span>
                      <IconChevronRight size={14} className="text-slate-300 flex-none" />
                    </button>
                  ))}
                </div>
              )}
        </div>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-end gap-3">
            <button className="bouton" onClick={() => setEtudId(null)}>← Autre étudiant</button>
            <label className="text-[12px] text-slate-600">
              <span className="block mb-0.5">Date de la séance du Conseil</span>
              <input type="date" value={dateCE} onChange={e => setDateCE(e.target.value)}
                className="controle text-[13px]" />
            </label>
            <label className="text-[12px] text-slate-600 min-w-0 flex-1">
              <span className="block mb-0.5">Base de la décision (accords) <BulleAide titre="Base de la décision">La base légale qui part dans eProm : VAF V1 à V4 ou VANFI. Elle vaut pour toutes les unités accordées, sauf si une ligne en porte une autre.</BulleAide></span>
              <select value={baseCommune} onChange={e => setBaseCommune(e.target.value)}
                className="controle text-[13px] w-full">
                <option value="">— choisir —</option>
                {bases.map(b => <option key={b.code} value={b.code}>{b.code} — {b.libelle}</option>)}
              </select>
            </label>
            <button className="bouton" disabled={!decidables.length} onClick={toutEnTotale}
              title="Pose « totale » sur toutes les unités encore sans décision">
              <IconCheck size={14} className="inline -mt-0.5 mr-1" />Tout accorder en totale
            </button>
          </div>

          <table className="w-full text-[13px] border-collapse">
            <thead>
              <tr className="tab-entete text-left">
                <th className="px-2 py-1.5 w-[34%]">Unité</th>
                <th className="px-2 py-1.5">Décision du Conseil</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(d => {
                const bloque = MOTS_ETAT_BLOQUANT(d);
                const c = choix[d.id] || {};
                const comp = composantes[d.ue_num];
                const items = c.cible === 'acquis'
                  ? (comp?.aas || []).map(a => [a.aa_code, `${a.aa_code} — ${a.description || ''}`])
                  : (comp?.cours || []).map(k => [k.cours_code, `${k.cours_code} — ${k.cours_nom || ''}`]);
                return (
                  <tr key={d.id} className="border-t border-slate-200 align-top">
                    <td className="px-2 py-2 bg-white">
                      <div className="font-semibold">UE {d.ue_num}</div>
                      <div className="text-[12px] text-slate-500">{d.ue_nom || ''}</div>
                      {/* LA SECTION SE LIT SUR LA LIGNE : un lot ne mêle pas
                          deux conseils, et c'est ici qu'on voit pourquoi. */}
                      <div className="text-[11px] text-slate-400">{d.section || ''}
                        {d.decision_le ? ` · décidée le ${String(d.decision_ce_date || d.decision_le).slice(0, 10)}` : ''}
                        {modifiee(d) && d.decision_le ? ' · modifiée' : ''}</div>
                    </td>
                    <td className="px-2 py-2 bg-white">
                      {bloque ? (
                        <span className="text-[12px] text-slate-500">{bloque}</span>
                      ) : (
                        <div className="space-y-1.5">
                          <div className="segments inline-flex">
                            {[['', '—'], ['totale', 'Totale'], ['partielle', 'Partielle'], ['refusee', 'Refusée']]
                              .map(([v, lib]) => (
                                <button key={v || 'aucune'} type="button"
                                  onClick={() => poser(d.id, { branche: v,
                                    ...(v !== 'partielle' ? { coches: [] } : {}),
                                    ...(v !== 'refusee' ? { motif: '' } : {}) })}
                                  className={`px-2.5 py-1 text-[12px] ${c.branche === v
                                    ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>
                                  {lib}
                                </button>
                              ))}
                          </div>
                          {c.branche === 'refusee' && (
                            <textarea rows={2} value={c.motif || ''} placeholder="Motif du refus — obligatoire"
                              onChange={e => poser(d.id, { motif: e.target.value })}
                              className="controle w-full h-auto py-1.5 text-[13px]" />
                          )}
                          {c.branche === 'partielle' && (
                            <div className="rounded-champ border border-slate-200 p-2 space-y-1.5">
                              <div className="flex gap-3 text-[12px]">
                                {[['cours', 'Des cours'], ['acquis', 'Des acquis']].map(([v, lib]) => (
                                  <label key={v} className="flex items-center gap-1">
                                    <input type="radio" checked={c.cible === v}
                                      onChange={() => poser(d.id, { cible: v, coches: [] })} />{lib}
                                  </label>
                                ))}
                              </div>
                              {!comp ? <div className="text-[12px] text-slate-400">Chargement de l’unité…</div>
                                : !items.length ? <div className="text-[12px] text-slate-500">Aucun élément connu pour cette unité en {annee}.</div>
                                  : items.map(([code, lib]) => (
                                    <label key={code} className="flex items-start gap-1.5 text-[12px]">
                                      <input type="checkbox" className="mt-0.5" checked={(c.coches || []).includes(code)}
                                        onChange={() => poser(d.id, { coches: (c.coches || []).includes(code)
                                          ? c.coches.filter(x => x !== code) : [...(c.coches || []), code] })} />
                                      <span>{lib}</span>
                                    </label>
                                  ))}
                            </div>
                          )}
                          {(c.branche === 'totale' || c.branche === 'partielle') && (
                            <select value={c.base || ''} onChange={e => poser(d.id, { base: e.target.value })}
                              className="controle text-[12px]">
                              <option value="">Base : {baseCommune || 'celle du haut'}</option>
                              {bases.map(b => <option key={b.code} value={b.code}>Base : {b.code} (propre à cette unité)</option>)}
                            </select>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="text-[12px] text-slate-500">
            Chaque unité garde son procès-verbal d’annexe 4, daté de cette séance. Une unité
            sans décision (« — ») n’est pas touchée.
          </p>
        </div>
      )}
    </Fenetre>
  );
}
