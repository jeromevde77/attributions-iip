import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconChartBar } from '@tabler/icons-react';
import { authHeaders, getAnnee } from '../lib/api.js';
import {
  nb, pc, tonTaux, couleurTaux, BarreDecisions, Tuile, Etendue, forme,
} from './statsUi.jsx';

/**
 * LA DISTRIBUTION, ET PAS SEULEMENT LA MOYENNE.
 *
 * Une moyenne seule ment par omission. Deux unités à 12 de moyenne peuvent
 * n'avoir rien en commun : l'une serrée autour de 12, l'autre faite de 6 et de
 * 18. La première décrit un groupe homogène, la seconde un groupe coupé en
 * deux — et ce n'est pas la même conversation à tenir avec l'équipe.
 *
 * On montre donc les trois ensemble. La MÉDIANE dit où se trouve celui du
 * milieu, et ne bouge pas quand un seul zéro s'ajoute. Le MODE dit la note
 * qu'on a le plus souvent mise : l'écart entre le mode et la moyenne en dit
 * long sur la forme du groupe. Et l'ÉTENDUE — du plus bas au plus haut — dit
 * s'il y a lieu de regarder plus loin.
 *
 * QUATRE CHOSES QUI N'ONT RIEN À VOIR ENTRE ELLES, et qu'il faut donc séparer
 * franchement : les cotes d'unité (ce qui fait foi), les cotes de cours (ce que
 * les professeurs ont encodé), les effectifs (la taille des groupes) et le
 * nombre d'unités portées par étudiant. Les mêler sur un même écran
 * produirait des moyennes de choux et de carottes.
 *
 * CE QUI MANQUE SE DIT. Une section qui délibère sans encoder les acquis n'a
 * pas de cotes de cours : elle n'apparaît pas dans cet onglet, et c'est un fait
 * à lire, pas un oubli à corriger. De même, un filtre par catégorie ignore les
 * sections dont le niveau n'est pas renseigné — l'écran les nomme plutôt que
 * de laisser croire le filtre exhaustif.
 */

const CATEGORIES = [
  ['tout', 'Toutes catégories'],
  ['bachelier', 'Bachelier'],
  ['bes', 'BES'],
  ['master', 'Master'],
  ['continue', 'Formations continues'],
  ['non_qualifiee', 'Niveau non renseigné'],
];

/* Les quatre familles, et ce qu'on montre de chacune. */
const FAMILLES = [
  { cle: 'cotes_ue', titre: 'Cotes d’unité',
    aide: 'Les points arrêtés par le Conseil — ce qui fait foi.',
    unite: '/20', vues: [
      ['par_section', 'Par section'],
      ['par_ue', 'Par unité'],
    ] },
  { cle: 'cotes_cours', titre: 'Cotes de cours',
    aide: 'Les notes encodées acquis par acquis. N’existent que là où les acquis ont été saisis.',
    unite: '/20', vues: [
      ['par_section', 'Par section'],
      ['par_ue', 'Par unité'],
      ['par_cours', 'Par cours'],
    ] },
  { cle: 'effectifs', titre: 'Effectifs par unité',
    aide: 'La taille des groupes. La médiane y est plus parlante que la moyenne, qu’une seule grosse unité suffit à tirer vers le haut.',
    unite: 'étudiants', vues: [
      ['par_section', 'Par section'],
    ] },
  { cle: 'ue_par_etudiant', titre: 'Unités par étudiant',
    aide: 'Combien d’unités chacun porte dans son programme annuel.',
    unite: 'unités', vues: [
      ['par_section', 'Par section'],
    ] },
];

/** Le mode peut être multiple — ou ne pas exister. Les deux se disent. */
const modeTexte = (m, effectif) => {
  if (!m || !m.length) return '—';
  const v = m.map(x => nb(x)).join(' et ');
  return effectif ? `${v} (×${effectif})` : v;
};

/* Tuile, Etendue, BarreDecisions et les teintes de taux vivent dans
   statsUi.jsx : cet écran et « Résultats » parlent désormais la même langue. */

/**
 * LES DÉCISIONS, EN COULEUR — la langue de l'écran « Résultats », ramenée ici.
 *
 * La distribution dit la forme des cotes ; elle ne dit pas ce que le Conseil en
 * a fait. Or c'est la première question qu'on se pose devant une unité dont la
 * médiane est basse : combien sont passés ? La barre répond sans qu'on ait à
 * lire un chiffre, et le taux porte la même teinte que dans « Résultats ».
 */
function Decisions({ stats, section, categorie }) {
  const [vue, setVue] = useState('par_section');
  if (!stats) return null;
  const lignes = (vue === 'par_section' ? stats.par_section : stats.par_ue) || [];
  const f = forme(lignes.filter(l => l.s1.decides > 0).map(l => l.s1.taux_reussite));
  const t = stats.total;

  return (
    <div className="carte p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[15px] font-semibold text-iip-blue">Décisions du Conseil</div>
          <p className="text-[12px] text-slate-500">
            Ce que le Conseil a décidé, en regard des cotes. Le taux se calcule sur les
            dossiers décidés — un dossier sans décision n’est pas un échec.
          </p>
        </div>
        <div className="flex gap-1 flex-none">
          {[['par_section', 'Par section'], ['par_ue', 'Par unité']].map(([k, lib]) => (
            <button key={k} onClick={() => setVue(k)}
              className={`px-2 py-1 text-[12px] rounded-lg border
                ${vue === k ? 'border-iip-blue text-iip-blue font-semibold bg-iip-blue/5'
                            : 'border-slate-300 text-slate-600'}`}>
              {lib}
            </button>
          ))}
        </div>
      </div>

      {/* CE BLOC NE SUIT PAS LE FILTRE DE CATÉGORIE, et il faut le dire :
          un chiffre qui ignore un filtre affiché est un chiffre faux. */}
      {categorie !== 'tout' && (
        <div className="text-[11px] text-[color:var(--c-attente,#B45309)]">
          Les décisions ne se filtrent pas par catégorie : ce bloc porte
          {section ? ` la section ${section}` : ' toutes les sections'}.
        </div>
      )}

      <div className="flex gap-2 flex-wrap">
        <Tuile libelle="Décisions prises" valeur={t.s1.decides} />
        <Tuile libelle="Réussite en 1re session" valeur={pc(t.s1.taux_reussite)}
          couleur={couleurTaux(t.s1.taux_reussite)} />
        <Tuile libelle="Réussite après les 2 sessions" valeur={pc(t.final.taux_reussite)}
          couleur={couleurTaux(t.final.taux_reussite)} />
        <Tuile libelle="Dossiers à finir" valeur={stats.dossiers_ouverts}
          ton={stats.dossiers_ouverts ? 'alerte' : null}
          precision={stats.dossiers_ouverts ? 'hors de tous les taux' : null} />
      </div>

      {f && f.n > 2 && (
        <div className="space-y-1">
          <div className="text-[11px] text-slate-500 tabular-nums">
            Dispersion des taux sur {f.n} {vue === 'par_ue' ? 'unité(s)' : 'section(s)'} :
            de {nb(f.min)} % à {nb(f.max)} % · médiane <b className="text-iip-blue">
              {nb(f.mediane)} %</b> · moyenne {nb(f.moyenne)} %
          </div>
          <Etendue d={f} max={100} />
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-[12px]">
          <thead className="tab-entete">
            <tr>
              <th className="text-left px-2 py-1.5">Libellé</th>
              <th className="text-right px-2 py-1.5 w-16">Décidés</th>
              <th className="px-2 py-1.5 w-32">Répartition</th>
              <th className="text-right px-2 py-1.5 w-20">Réussis</th>
              <th className="text-right px-2 py-1.5 w-20">Ajournés</th>
              <th className="text-right px-2 py-1.5 w-20">Refusés</th>
              <th className="text-right px-2 py-1.5 w-24">Réussite S1</th>
              <th className="text-right px-2 py-1.5 w-24">Réussite finale</th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(l => (
              <tr key={l.cle} className="border-t border-slate-100">
                <td className="px-2 py-1.5 text-slate-700">{l.libelle}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                  {l.s1.decides}
                </td>
                <td className="px-2 py-1.5">
                  <BarreDecisions reussi={l.s1.reussi} ajourne={l.s1.ajourne}
                    refuse={l.s1.refuse + l.s1.absent} largeur="w-32" />
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.s1.reussi}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{l.s1.ajourne}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">
                  {l.s1.refuse + l.s1.absent}
                </td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-semibold
                  ${tonTaux(l.s1.taux_reussite)}`}>{pc(l.s1.taux_reussite)}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-semibold
                  ${tonTaux(l.final.taux_reussite)}`}>{pc(l.final.taux_reussite)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Le tableau d'une vue : une ligne par section, unité ou cours. */
function Table({ lignes, max }) {
  if (!lignes?.length) {
    return (
      <div className="text-[12px] text-slate-400 py-6 text-center">
        Rien à montrer pour ce filtre.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-[12px]">
        <thead className="tab-entete">
          <tr>
            <th className="text-left px-2 py-1.5">Libellé</th>
            <th className="text-right px-2 py-1.5 w-16">Effectif</th>
            <th className="text-right px-2 py-1.5 w-20">Moyenne</th>
            <th className="text-right px-2 py-1.5 w-20">Médiane</th>
            <th className="text-right px-2 py-1.5 w-24">Mode</th>
            <th className="text-right px-2 py-1.5 w-24">Étendue</th>
            <th className="px-2 py-1.5 w-40">Forme</th>
          </tr>
        </thead>
        <tbody>
          {lignes.map(l => {
            // L'ÉCART QUI MÉRITE UN REGARD. Au-delà d'un point entre moyenne et
            // médiane, la distribution est tirée par un bout : on le signale
            // plutôt que de laisser l'utilisateur comparer deux colonnes.
            const ecart = (l.moyenne != null && l.mediane != null)
              ? Math.abs(l.moyenne - l.mediane) : 0;
            return (
              <tr key={l.cle} className="border-t border-slate-100">
                <td className="px-2 py-1.5 text-slate-700">{l.libelle}</td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">{l.n}</td>
                <td className={`px-2 py-1.5 text-right tabular-nums font-semibold
                  ${ecart > 1 ? 'text-[color:var(--c-attente,#B45309)]' : 'text-iip-blue'}`}>
                  {nb(l.moyenne)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-iip-blue font-semibold">
                  {nb(l.mediane)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-600">
                  {modeTexte(l.mode, l.mode_effectif)}
                </td>
                <td className="px-2 py-1.5 text-right tabular-nums text-slate-500">
                  {nb(l.min)} – {nb(l.max)}
                </td>
                <td className="px-2 py-1.5"><Etendue d={l} max={max} /></td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Famille({ famille, donnees }) {
  const [vue, setVue] = useState(famille.vues[0][0]);
  const d = donnees?.[famille.cle];
  const ens = d?.ensemble;
  const lignes = d?.[vue] || [];
  // L'échelle de la barre : sur vingt pour une cote, sur le maximum observé
  // pour un effectif — sans quoi tout se tasserait à gauche.
  const max = famille.unite === '/20'
    ? 20
    : Math.max(1, ...lignes.map(l => l.max || 0), ens?.max || 0);

  if (!ens || !ens.n) {
    return (
      <div className="carte p-4">
        <div className="text-[15px] font-semibold text-iip-blue">{famille.titre}</div>
        <p className="text-[12px] text-slate-500 mt-1">{famille.aide}</p>
        <div className="text-[12px] text-slate-400 mt-3">
          Aucune donnée pour cette année et ce filtre.
        </div>
      </div>
    );
  }

  const ecart = (ens.moyenne != null && ens.mediane != null)
    ? Math.abs(ens.moyenne - ens.mediane) : 0;

  return (
    <div className="carte p-4 space-y-3">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[15px] font-semibold text-iip-blue">{famille.titre}</div>
          <p className="text-[12px] text-slate-500">{famille.aide}</p>
        </div>
        {famille.vues.length > 1 && (
          <div className="flex gap-1 flex-none">
            {famille.vues.map(([k, lib]) => (
              <button key={k} onClick={() => setVue(k)}
                className={`px-2 py-1 text-[12px] rounded-lg border
                  ${vue === k ? 'border-iip-blue text-iip-blue font-semibold bg-iip-blue/5'
                              : 'border-slate-300 text-slate-600'}`}>
                {lib}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        <Tuile libelle="Moyenne" valeur={nb(ens.moyenne)} unite={famille.unite}
          ton={ecart > 1 ? 'alerte' : 'fort'}
          precision={ecart > 1 ? `${nb(ecart)} d’écart avec la médiane` : null} />
        <Tuile libelle="Médiane" valeur={nb(ens.mediane)} unite={famille.unite} ton="fort" />
        <Tuile libelle={ens.mode?.length > 1 ? 'Modes' : 'Mode'}
          valeur={modeTexte(ens.mode)} unite={ens.mode?.length ? famille.unite : null}
          precision={ens.mode_effectif ? `${ens.mode_effectif} fois` : 'aucune valeur répétée'} />
        <Tuile libelle="Étendue" valeur={`${nb(ens.min)} – ${nb(ens.max)}`} />
        <Tuile libelle="Observations" valeur={ens.n.toLocaleString('fr-BE')} />
      </div>

      <Table lignes={lignes} max={max} />
    </div>
  );
}

export default function Distributions() {
  const [annee, setAnnee] = useState(getAnnee());
  const [annees, setAnnees] = useState([]);
  const [categorie, setCategorie] = useState('tout');
  const [section, setSection] = useState('');
  const [sections, setSections] = useState([]);
  const [donnees, setDonnees] = useState(null);
  // LES DÉCISIONS VIENNENT DE LEUR PROPRE SOURCE — celle de l'écran
  // « Résultats ». On ne recalcule pas des taux ici : on les lit là où ils sont
  // déjà établis, avec leurs trois précautions.
  const [stats, setStats] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code).filter(Boolean)))
      .catch(() => setAnnees([annee]));
    // eslint-disable-next-line
  }, []);

  useEffect(() => {
    fetch(`/api/reunions/perimetre?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() })
      .then(r => r.json()).then(j => setSections(j.sections || []))
      .catch(() => setSections([]));
  }, [annee]);

  useEffect(() => {
    setEnCours(true); setErreur(null);
    const q = new URLSearchParams({ annee, categorie });
    if (section) q.set('section', section);
    fetch(`/api/stats-deliberation/distributions?${q}`, { headers: authHeaders() })
      .then(async r => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || 'échec');
        return j;
      })
      .then(setDonnees)
      .catch(e => { setErreur(e.message); setDonnees(null); })
      .finally(() => setEnCours(false));
  }, [annee, categorie, section]);

  useEffect(() => {
    const q = new URLSearchParams({ annee });
    if (section) q.set('section', section);
    fetch(`/api/stats-deliberation?${q}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(j => setStats(j && j.total ? j : null))
      .catch(() => setStats(null));
  }, [annee, section]);

  const nonQualifiees = donnees?.sections_non_qualifiees || [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <select value={annee} onChange={e => setAnnee(e.target.value)}
          className="px-2 py-1 text-[12px] border border-slate-300 rounded bg-white">
          {(annees.length ? annees : [annee]).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={categorie} onChange={e => setCategorie(e.target.value)}
          className="px-2 py-1 text-[12px] border border-slate-300 rounded bg-white"
          title="Le niveau vient du référentiel de la section">
          {CATEGORIES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={section} onChange={e => setSection(e.target.value)}
          className="px-2 py-1 text-[12px] border border-slate-300 rounded bg-white">
          <option value="">Toutes les sections</option>
          {sections.map(s => <option key={s} value={s}>{s}</option>)}
        </select>
        {enCours && <span className="text-[12px] text-slate-400">Calcul…</span>}
        <span className="flex-1" />
        {donnees?.ue_par_etudiant?.etudiants > 0 && (
          <span className="text-[12px] text-slate-500">
            {donnees.ue_par_etudiant.etudiants.toLocaleString('fr-BE')} étudiant(s) dans le périmètre
          </span>
        )}
      </div>

      {erreur && (
        <div className="carte p-3 text-[13px] text-[color:var(--c-refuse,#9D4A38)]">{erreur}</div>
      )}

      {/* CE QUE LE FILTRE NE VOIT PAS. Un « bachelier » qui ignore en silence
          trois sections dont le niveau n'est pas renseigné donne un chiffre
          faux sans le dire. */}
      {categorie !== 'tout' && categorie !== 'non_qualifiee' && !!nonQualifiees.length && (
        <div className="carte p-3 flex items-start gap-2">
          <IconAlertTriangle size={16}
            className="text-[color:var(--c-attente,#B45309)] flex-none mt-0.5" />
          <div className="text-[12px] text-slate-600">
            {nonQualifiees.length} section(s) n’ont pas de niveau au référentiel et ne sont
            donc comptées dans aucune catégorie : <b>{nonQualifiees.join(', ')}</b>.
            Renseignez leur niveau dans Configuration pour qu’elles entrent dans ce filtre.
          </div>
        </div>
      )}

      {!donnees && !enCours && !erreur && (
        <div className="carte p-8 text-center text-[13px] text-slate-400">
          <IconChartBar size={28} className="mx-auto mb-2 opacity-40" />
          Aucune donnée.
        </div>
      )}

      {/* LES DÉCISIONS D'ABORD : c'est la question qu'on se pose en arrivant, et
          les distributions expliquent ensuite ce qui les a produites. */}
      <Decisions stats={stats} section={section} categorie={categorie} />

      {donnees && FAMILLES.map(f => (
        <Famille key={f.cle} famille={f} donnees={donnees} />
      ))}

      {donnees && (
        <p className="text-[11px] text-slate-400">
          Moyenne, médiane et mode se lisent ensemble : une moyenne seule ne dit pas si le
          groupe est homogène. Le trait marine marque la médiane, le trait ocre la moyenne ;
          quand ils s’écartent, la distribution est tirée par un bout. Un mode n’existe que
          si une valeur revient au moins deux fois.
        </p>
      )}
    </div>
  );
}
