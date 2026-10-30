import { useMemo, useState } from 'react';
import {
  IconSparkles, IconChevronRight, IconBan, IconUsers, IconScale, IconSchool, IconSitemap,
  IconBuildingCommunity, IconRoute, IconMapPin, IconBolt, IconArrowRight,
} from '@tabler/icons-react';
import { Fenetre } from './ui.jsx';
import { authHeaders, getUser } from '../lib/api.js';

/**
 * LES NOUVEAUTÉS, SUR LE BUREAU (3.1.283, Charles, 11 octobre 2026 : « comme il y en a
 * beaucoup, une tuile New / info ; quand on clique dessus, les gens tombent sur ce que tu
 * as écrit »). Le guide vit dans Lucie (`backend/assets/nouveautes/<édition>.html`, servi par
 * `GET /api/documentation/nouveautes/<édition>` qui RETIRE ce qui ne concerne pas le rôle de la
 * personne — 3.1.460, « un prof ne doit pas savoir qu'une amélioration qui ne le concerne pas a
 * été faite »).
 *
 * UNE MISE EN PAGE, PAS UN TEXTE (3.1.461, Charles : « pas en mode texte mais vraiment en mode mise
 * en page, avec un sous-menu souligné »). Le fichier reste la source — on l'écrit comme avant, chaque
 * entrée avec son `data-pour` — mais l'écran le LIT en parties : « En bref », chaque public, « Ce qui
 * vient ensuite ». Une partie par onglet souligné ; chaque nouveauté est une carte (titre, chemin
 * « Où », texte, étiquette). « Nouveau » tant que la personne n'a pas ouvert cette révision.
 */
const EDITION = '2026-11';
// Le guide d'une édition s'enrichit : la révision rallume « Nouveau » sans changer de fichier.
const REVISION = `${EDITION}.516`;
const DEPUIS = 'depuis le jeudi 8 octobre';
const cleVu = () => `lucie.nouveautes.vu.${getUser()?.id || 'x'}`;

const ICONES = [
  [/refuse/i, IconBan], [/secr/i, IconUsers], [/d[ée]lib/i, IconScale], [/enseign/i, IconSchool],
  [/coordin/i, IconSitemap], [/direction/i, IconBuildingCommunity],
];
const iconeDe = titre => (ICONES.find(([re]) => re.test(titre)) || [null, IconSparkles])[1];
const PUBLICS = [['tous', 'Tout'], ['ens', 'Enseignants'], ['sec', 'Secrétariat'], ['coo', 'Coordinations'], ['dir', 'Direction']];

/** Le fichier, lu en parties. */
function lireGuide(texte) {
  const d = new DOMParser().parseFromString(texte, 'text/html');
  const g = d.querySelector('.guide');
  if (!g) return null;
  const li = sel => [...g.querySelectorAll(sel)].map(x => ({ html: x.innerHTML, pour: x.dataset.pour || '' }));
  const parties = [];
  for (const el of g.querySelectorAll('main > *')) {
    if (el.tagName === 'H2') parties.push({ titre: el.textContent.trim(), intro: '', cartes: [] });
    else if (el.classList.contains('intro') && parties.length) parties.at(-1).intro = el.innerHTML;
    else if (el.tagName === 'ARTICLE' && parties.length) {
      const c = el.cloneNode(true);
      const titre = c.querySelector('h3')?.textContent.trim() || '';
      const ou = c.querySelector('.ou b')?.textContent.trim() || '';
      const etiquettes = [...c.querySelectorAll('.etiquette')].map(e => ({ texte: e.textContent.trim(), essai: e.classList.contains('dev') }));
      c.querySelectorAll('h3, .ou, .etiquettes').forEach(x => x.remove());
      parties.at(-1).cartes.push({ titre, ou, etiquettes, corps: c.innerHTML, pour: el.dataset.pour || '' });
    }
  }
  return {
    titre: g.querySelector('header h1')?.textContent.trim() || 'Quoi de neuf',
    chapeau: g.querySelector('header > p')?.textContent.trim() || '',
    version: g.querySelector('.versions')?.textContent.trim() || '',
    bref: li('.jours li'), ensuite: li('.avenir li'),
    parties: parties.filter(p => p.cartes.length),
    filtrable: !!g.querySelector('nav.filtres'),
  };
}

const voit = (pour, pub) => pub === 'tous' || pour.split(/\s+/).includes(pub);

function Chemin({ ou }) {
  const etapes = ou.split('→').map(x => x.trim()).filter(Boolean);
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-second text-slate-600">
      <IconMapPin size={14} className="text-slate-400 flex-none" />
      {etapes.map((x, i) => (
        <span key={i} className="inline-flex items-center gap-1.5">
          {i > 0 && <IconArrowRight size={12} className="text-slate-300" />}
          <span className="px-2 py-0.5 rounded-champ border border-slate-200 bg-white text-iip-texte">{x}</span>
        </span>))}
    </div>
  );
}

function Carte({ c }) {
  const essai = c.etiquettes.some(e => e.essai);
  return (
    <article className="bloc-etat px-4 py-3.5 flex flex-col gap-2.5" data-etat={essai ? 'surveiller' : 'disponible'}>
      {/* Une étiquette longue passe sous le titre plutôt que de l'écraser. */}
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <h3 className="titre-carte flex-1 min-w-[55%]">{c.titre}</h3>
        {c.etiquettes.map((e, i) => (
          <span key={i} className="pastille-etat flex-none" data-etat={e.essai ? 'surveiller' : 'disponible'}>{e.texte}</span>))}
      </div>
      {c.ou && <Chemin ou={c.ou} />}
      <div className="texte-corpus" dangerouslySetInnerHTML={{ __html: c.corps }} />
    </article>
  );
}

function Guide({ g }) {
  const [pub, setPub] = useState('tous');
  const parties = useMemo(() => g.parties
    .map(p => ({ ...p, cartes: p.cartes.filter(c => voit(c.pour, pub)) })).filter(p => p.cartes.length), [g, pub]);
  const bref = g.bref.filter(x => voit(x.pour, pub));
  const ensuite = g.ensuite.filter(x => voit(x.pour, pub));
  const onglets = [
    ...(bref.length ? [{ cle: 'bref', titre: 'En bref', Icone: IconBolt }] : []),
    ...parties.map(p => ({ cle: p.titre, titre: p.titre, Icone: iconeDe(p.titre), n: p.cartes.length })),
    ...(ensuite.length ? [{ cle: 'ensuite', titre: 'Ensuite', Icone: IconRoute }] : []),
  ];
  const [cle, setCle] = useState(onglets[0]?.cle);
  const actif = onglets.find(o => o.cle === cle) ? cle : onglets[0]?.cle;
  const partie = parties.find(p => p.titre === actif);

  return (
    <div className="space-y-4">
      {/* L'EN-TÊTE : ce que le guide couvre, et pour quelle version. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <div className="text-second text-slate-500">{g.chapeau}</div>
          {g.version && <div className="text-mention text-slate-400 mt-0.5">{g.version}</div>}
        </div>
        {g.filtrable && (
          <div className="segments" title="Voir le guide comme le reçoit ce public">
            {PUBLICS.map(([k, l]) => (
              <button key={k} type="button" onClick={() => setPub(k)}
                className={`px-3 py-1.5 text-second ${pub === k ? 'bg-iip-blue text-white font-semibold' : 'text-slate-600'}`}>{l}</button>))}
          </div>)}
      </div>

      {/* LE SOUS-MENU SOULIGNÉ : une partie à la fois. */}
      <div className="flex gap-1 overflow-x-auto border-b border-slate-200 -mx-1 px-1">
        {onglets.map(o => (
          <button key={o.cle} type="button" onClick={() => setCle(o.cle)}
            className={`onglet-page inline-flex items-center gap-1.5 ${actif === o.cle ? 'onglet-page-actif' : ''}`}>
            <o.Icone size={15} /> {o.titre}
            {o.n > 0 && <span className="text-mention text-slate-400 tabular-nums">{o.n}</span>}
          </button>))}
      </div>

      {actif === 'bref' && (
        <div className="grid gap-3 sm:grid-cols-2">
          {bref.map((x, i) => (
            <div key={i} className="bloc-etat px-4 py-3 flex gap-3 items-start" data-etat="neutre">
              <IconSparkles size={18} className="flex-none mt-0.5" style={{ color: 'var(--c-iip_or, #F9B619)' }} />
              <div className="texte-corpus" dangerouslySetInnerHTML={{ __html: x.html }} />
            </div>))}
        </div>)}

      {partie && (
        <div className="space-y-3">
          {partie.intro && <p className="text-second text-slate-500" dangerouslySetInnerHTML={{ __html: partie.intro }} />}
          {/* EN COLONNES, COMME UNE PAGE DE MAGAZINE : deux cartes de hauteurs différentes ne
              laissent pas de trou sous la plus courte. */}
          <div className="lg:columns-2 gap-3">
            {partie.cartes.map((c, i) => <div key={i} className="break-inside-avoid mb-3"><Carte c={c} /></div>)}
          </div>
        </div>)}

      {actif === 'ensuite' && (
        <div className="space-y-2">
          <p className="text-second text-slate-500">Ce qui est en préparation — pas encore dans Lucie.</p>
          {ensuite.map((x, i) => (
            <div key={i} className="bloc-etat px-4 py-2.5 flex gap-3 items-center" data-etat="neutre">
              <IconRoute size={16} className="flex-none text-slate-400" />
              <span className="text-sm" dangerouslySetInnerHTML={{ __html: x.html }} />
            </div>))}
        </div>)}
    </div>
  );
}

export default function TuileNouveautes() {
  const [vu, setVu] = useState(() => { try { return localStorage.getItem(cleVu()) === REVISION; } catch { return false; } });
  const [ouvert, setOuvert] = useState(false);
  const [guide, setGuide] = useState(null);   // null : pas encore lu ; false : introuvable

  async function ouvrir() {
    setOuvert(true);
    try { localStorage.setItem(cleVu(), REVISION); } catch { /* navigateur privé */ }
    setVu(true);
    if (guide == null) {
      const t = await fetch(`/api/documentation/nouveautes/${EDITION}`, { headers: authHeaders() })
        .then(r => (r.ok ? r.text() : '')).catch(() => '');
      setGuide(lireGuide(t) || false);
    }
  }

  return (<>
    <button type="button" onClick={ouvrir} data-etat={vu ? 'neutre' : 'disponible'}
      className="bloc-etat w-full text-left px-4 py-3 flex items-center gap-3 hover:brightness-[.98]">
      <IconSparkles size={22} style={{ color: 'var(--c-iip_or, #F9B619)' }} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <b className="text-sm">Quoi de neuf dans Lucie ?</b>
          {!vu && <span className="pastille-etat" data-etat="disponible">Nouveau</span>}
        </span>
        <span className="block text-second text-slate-500">Les nouveautés {DEPUIS} : où les trouver, comment s’en servir.</span>
      </span>
      <IconChevronRight size={16} className="text-slate-400" />
    </button>
    {ouvert && (
      <Fenetre icone={IconSparkles} titre="Quoi de neuf dans Lucie ?" sous={`Les nouveautés ${DEPUIS}`} large="grande"
        onFermer={() => setOuvert(false)}
        pied={<button className="bouton bouton-fort ml-auto" onClick={() => setOuvert(false)}>Fermer</button>}>
        {guide == null ? <div className="text-sm text-slate-400">Chargement…</div>
          : guide === false ? <div className="text-sm text-slate-500">Le guide n’a pas pu être chargé.</div>
            : <Guide g={guide} />}
      </Fenetre>)}
  </>);
}
