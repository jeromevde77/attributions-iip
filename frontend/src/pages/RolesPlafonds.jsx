import { Fragment, useEffect, useState } from 'react';
import { IconLock, IconEye, IconShieldCheck, IconTrash, IconChevronRight, IconChevronDown } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { nomListe } from '../lib/nom.js';
import { MODULES_ACCES, oublierPlafonds } from '../lib/modules.js';
import { COL_PREMIERE, COL_MODULE, HAUTEUR_LIGNE, NIVEAUX_DROIT, VERDICTS, Pastille, CaseDroit,
         EnteteModules, Legende, TitreCarte } from '../components/GrilleAcces.jsx';

/**
 * Plafonds par rôle.
 *
 * Ce qu'un rôle autorise AU MIEUX, module par module. Les cases cochées sur la
 * fiche d'une personne affinent à l'intérieur de ce plafond, sans jamais
 * pouvoir accorder davantage — c'est la charpente du cloisonnement.
 *
 * Ces valeurs étaient codées en dur, ce qui obligeait à intervenir sur le code
 * à chaque changement d'avis. Elles se règlent maintenant ici.
 */
/* L'ordre du cycle au clic ; le dessin vient de GrilleAcces (NIVEAUX_DROIT). */
const NIVEAUX = ['rien', 'lit', 'validation', 'ecrit'].map(val => ({ val, ...NIVEAUX_DROIT[val] }));

const LIBELLE_ROLE = {
  directeur: 'Directeur', directeur_adjoint: 'Directeur adjoint',
  admin: 'Administrateur technique', secretariat: 'Secrétariat',
  editeur: 'Éditeur (ancien nom)', coordination: 'Coordination',
  professeur: 'Professeur', consultation: 'Consultation',
};

const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];


/**
 * CE QUE LE MODE CONSTAT A VU.
 *
 * Le contrôle des modules se déploie d'abord SANS refuser : il laisse passer
 * et note ce qu'il aurait bloqué. Sans cet écran, ce registre resterait une
 * table que personne n'ouvre — et l'on fermerait à l'aveugle, ce que le mode
 * constat existe précisément pour éviter.
 *
 * Chaque ligne est une QUESTION, pas un coupable : « cette personne
 * devrait-elle y avoir accès ? » Si oui, c'est le plafond ci-dessus qu'il faut
 * relever, ou la carte des modules qu'il faut corriger. Une liste vide ne veut
 * pas dire que tout est réglé : elle veut dire que personne n'a encore touché
 * à ce qui lui est fermé.
 */
function Constat() {
  const [d, setD] = useState(null);
  const [ouvert, setOuvert] = useState(false);

  async function charger() {
    const rep = await fetch('/api/profils-acces/constat', { headers: authHeaders() });
    setD(rep.ok ? await rep.json() : { lignes: [], par_personne: [], mode: '?' });
  }
  useEffect(() => { charger(); }, []);

  async function vider() {
    if (!confirm('Vider le registre ?\n\nÀ faire après avoir corrigé un plafond, pour repartir '
               + 'd’une page blanche et mesurer l’effet du changement.')) return;
    await fetch('/api/profils-acces/constat', { method: 'DELETE', headers: authHeaders() });
    charger();
  }

  if (!d) return null;
  const strict = d.mode === 'strict';

  return (
    <div className="carte">
      <TitreCarte titre="Ce que le contrôle a vu"
        droite={<>
          {strict ? <IconShieldCheck size={15} className="text-slate-400" />
                  : <IconEye size={15} className="text-slate-400" />}
          <span className="pastille-etat" data-etat={strict ? 'reussi' : 'surveiller'}>
            {strict ? 'mode strict — les refus s’appliquent' : 'mode constat — rien n’est refusé'}
          </span>
          {!!d.lignes.length && (
            <button onClick={vider}
              className="text-[11px] text-slate-500 hover:text-red-700 flex items-center gap-1">
              <IconTrash size={13} /> Vider
            </button>
          )}
        </>} />

      {!d.lignes.length ? (
        <div className="px-4 py-3 text-[12px] text-slate-500">
          Rien à signaler : personne n’a encore touché à ce qui lui est fermé.
          {!strict && ' Laissez tourner quelques jours avant de passer en mode strict.'}
        </div>
      ) : (
        <>
          {/* QUI PERDRAIT QUOI — c’est la seule question qui décide. Le détail
              sert à comprendre ; ce résumé sert à trancher. */}
          <div className="px-4 py-3 border-b border-slate-100 space-y-1.5">
            {d.par_personne.map(p => (
              <div key={p.email} className="text-[12px] flex items-baseline gap-2 flex-wrap">
                <span className="font-medium">{p.email}</span>
                <span className="text-slate-400 text-[11px]">{p.role}</span>
                <span className="text-slate-600">perdrait : {p.modules.join(', ')}</span>
                <span className="text-slate-400 text-[11px]">({p.total} accès)</span>
              </div>
            ))}
          </div>

          <button onClick={() => setOuvert(!ouvert)}
            className="w-full px-4 py-1.5 text-[11px] text-slate-500 hover:text-iip-blue text-left">
            {ouvert ? '▾' : '▸'} Le détail, ligne à ligne ({d.lignes.length})
          </button>

          {ouvert && (
            <table className="w-full text-[11px]">
              <thead className="tab-entete">
                <tr>
                  <th className="text-left px-3 py-1.5">Personne</th>
                  <th className="text-left px-2 py-1.5">Module</th>
                  <th className="text-left px-2 py-1.5">Action</th>
                  <th className="text-left px-2 py-1.5">Route</th>
                  <th className="text-right px-3 py-1.5">Fois</th>
                  <th className="text-left px-2 py-1.5">Dernière</th>
                </tr>
              </thead>
              <tbody>
                {d.lignes.map((l, i) => (
                  <tr key={i} className="border-b border-slate-100 bg-white">
                    <td className="px-3 py-1">{l.email}</td>
                    <td className="px-2 py-1">{l.module}</td>
                    <td className="px-2 py-1">
                      <span className={l.action === 'ecrire' ? 'text-amber-700' : 'text-slate-500'}>
                        {l.action}
                      </span>
                    </td>
                    <td className="px-2 py-1 text-slate-500">
                      <span className="text-slate-400">{l.methode}</span> {l.chemin}
                    </td>
                    <td className="px-3 py-1 text-right">{l.occurrences}</td>
                    <td className="px-2 py-1 text-slate-400">{(l.derniere_le || '').slice(0, 16)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}

      <div className="px-4 py-2.5 text-[11px] text-slate-500 border-t border-slate-100">
        Chaque ligne est une question, pas une faute : <b>cette personne devrait-elle y avoir
        accès ?</b> Si oui, relevez son plafond ci-dessus. Si non, le contrôle fera son
        office dès le passage en mode strict.
      </div>
    </div>
  );
}

const nomRole = (data, code) => data?.libelles?.[code] || LIBELLE_ROLE[code] || code;

/**
 * LES GESTES — qui peut faire quoi, au-delà du module (Charles, 3 octobre
 * 2026 : « il faut les gestes », puis « je ne sais pas changer les
 * autorisations de gestes alors que je suis le directeur »). Le serveur rend
 * le catalogue (backend/src/lib/gestes.js) : pour chaque case, le défaut du
 * code, le réglage de la direction, ce qui s'applique, et le verrou. C'est ce
 * catalogue que lisent les portes des routes : régler une case ici change ce
 * que le serveur accepte.
 *
 * Deux bornes, tenues par le serveur et seulement montrées ici : la direction
 * ne se retire jamais un geste de configuration, de validation ou de décision
 * (cadenas) ; chaque changement est inscrit au journal, en ajout seul.
 */
const MOT_VERDICT = { oui: 'oui', non: 'non', demande: 'par demande' };
const direVerdict = v => {
  const m = /^défaut:(.*)$/.exec(v || '');
  return m ? `défaut (${MOT_VERDICT[m[1]] || m[1]})` : (MOT_VERDICT[v] || v);
};

function Gestes({ plafonds, onMessage }) {
  const [g, setG] = useState(null);
  const [journal, setJournal] = useState(null);
  const [ouverts, setOuverts] = useState(() => new Set());
  const [enCours, setEnCours] = useState(null);

  async function charger() {
    const [rg, rj] = await Promise.all([
      fetch('/api/profils-acces/gestes', { headers: authHeaders() }),
      fetch('/api/profils-acces/gestes-journal', { headers: authHeaders() }),
    ]);
    setG(rg.ok ? await rg.json() : null);
    setJournal(rj.ok ? (await rj.json()).lignes : null);
  }
  useEffect(() => { charger().catch(() => setG(null)); }, []);
  if (!g) return null;

  const basculer = cle => setOuverts(o => {
    const n = new Set(o);
    if (n.has(cle)) n.delete(cle); else n.add(cle);
    return n;
  });
  const tousOuverts = ouverts.size === g.groupes.length;

  /* Le clic fait tourner : défaut → les autres verdicts → défaut. « Par
     demande » n'existe que pour la coordination ; régler une case sur son
     défaut, c'est y revenir. */
  async function regler(x, r) {
    const c = x.verdicts[r];
    const suite = [null, ...['oui', 'non', ...(r === 'coordination' ? ['demande'] : [])]
      .filter(v => v !== c.defaut)];
    const i = suite.indexOf(c.reglage ?? null);
    const suivant = suite[(i + 1) % suite.length];
    setEnCours(`${x.id}|${r}`);
    try {
      const url = `/api/profils-acces/gestes/${encodeURIComponent(x.id)}/${encodeURIComponent(r)}`;
      const rep = suivant == null
        ? await fetch(url, { method: 'DELETE', headers: authHeaders() })
        : await fetch(url, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ verdict: suivant }) });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) { onMessage?.({ type: 'err', texte: j.error || 'Réglage refusé.' }); return; }
      await charger();
    } finally { setEnCours(null); }
  }

  const titreCase = (x, r, c, def) => {
    const lignes = [`${nomRole(g, r)} — ${def.aide}${c.note ? ` : ${c.note}` : ''}`];
    if (c.verrouille) lignes.push('Réservé à la direction — ne se retire pas.');
    else if (!c.reglable) lignes.push('Sans porte de rôle : dépend du cours ou du périmètre, ne se règle pas.');
    else {
      lignes.push(c.reglage != null
        ? `Réglé par la direction : ${direVerdict(c.reglage)} — défaut du code : ${direVerdict(c.defaut)}.`
        : `Défaut du code : ${direVerdict(c.defaut)}.`);
      if (g.peut_regler) lignes.push('Cliquer pour changer.');
    }
    lignes.push(x.source);
    return lignes.join('\n');
  };

  return (
    <>
    <div className="carte overflow-hidden">
      <TitreCarte titre="Les gestes"
        droite={
          <button className="bouton controle text-[12px]"
            onClick={() => setOuverts(tousOuverts ? new Set() : new Set(g.groupes.map(x => x.cle)))}>
            {tousOuverts ? 'Tout replier' : 'Tout déplier'}
          </button>
        }>
        Chaque case part du défaut écrit dans le code ; la direction peut l’ajuster, rôle par
        rôle — un clic fait tourner oui, non{' '}(par demande pour la coordination), puis revient
        au défaut. Les cases au cadenas restent à la direction : configuration, validation et
        décision ne se retirent pas. Les conditions (périmètre, case de fiche, personne de
        référence) restent contrôlées par la route. La grille des modules s’y ajoute en amont
        {g.mode_modules === 'constat' ? ' (en mode constat, elle ne refuse encore rien)' : ''}.
      </TitreCarte>

      <div className="overflow-x-auto">
        <table className="w-full table-fixed border-collapse text-[13px]">
          <thead>
            <tr className="tab-entete">
              <th className="w-[230px] min-w-[230px] px-3 py-1.5 text-left sticky left-0 z-10"
                style={{ background: 'var(--tab-repere)' }}>Module · geste</th>
              {g.roles.map(r => (
                <th key={r} className="w-[80px] min-w-[80px] px-1 py-1.5 align-bottom font-normal">
                  <div className="text-[10px] leading-tight normal-case tracking-normal">{nomRole(g, r)}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.groupes.map(gr => {
              const lignes = g.gestes.filter(x => x.module === gr.cle);
              if (!lignes.length) return null;
              const ouvert = ouverts.has(gr.cle);
              const Chevron = ouvert ? IconChevronDown : IconChevronRight;
              const regles = lignes.reduce((n, x) => n + g.roles.filter(r => x.verdicts[r]?.reglage != null).length, 0);
              return (
                <Fragment key={gr.cle}>
                  <tr className={`tab-repere ${HAUTEUR_LIGNE} cursor-pointer`} onClick={() => basculer(gr.cle)}>
                    <td className="px-3 sticky left-0 z-10" style={{ background: 'var(--tab-repere)' }}>
                      <span className="inline-flex items-center gap-1.5 font-semibold">
                        <Chevron size={14} className="text-slate-400" />
                        {gr.label}
                        <span className="text-[11px] font-normal text-slate-500">
                          {lignes.length} geste(s){regles ? ` · ${regles} réglé(s)` : ''}
                        </span>
                      </span>
                    </td>
                    {g.roles.map(r => {
                      const niveau = gr.plafond ? (plafonds?.[r]?.[gr.plafond] || 'rien') : null;
                      return (
                        <td key={r} className="px-1.5 text-center"
                          title={gr.plafond ? `Plafond du module : ${(NIVEAUX_DROIT[niveau] || {}).aide}` : 'Hors grille des modules'}>
                          {niveau && <Pastille def={NIVEAUX_DROIT[niveau]} />}
                        </td>
                      );
                    })}
                  </tr>
                  {ouvert && lignes.map(x => (
                    <tr key={x.id} className={`${HAUTEUR_LIGNE} bg-white border-b border-slate-100`}>
                      <td className="pl-9 pr-3 sticky left-0 bg-white z-10" title={x.source}>
                        <div className="truncate">{x.label}</div>
                      </td>
                      {g.roles.map(r => {
                        const c = x.verdicts[r] || { v: 'non' };
                        const def = VERDICTS[c.v] || VERDICTS.non;
                        const cle = `${x.id}|${r}`;
                        const cliquable = g.peut_regler && c.reglable && enCours == null;
                        return (
                          <td key={r} className="px-1.5 text-center" title={titreCase(x, r, c, def)}>
                            <button type="button" disabled={!cliquable} onClick={() => regler(x, r)}
                              className={`block w-full ${cliquable ? 'cursor-pointer hover:opacity-80' : 'cursor-default'}`}>
                              <Pastille def={def} occupe={enCours === cle} />
                              <span aria-hidden="true"
                                className="flex items-center justify-center gap-1 h-[10px] mt-0.5 text-[9px] leading-none">
                                {c.verrouille && <IconLock size={9} className="text-slate-400" />}
                                {c.reglage != null && (
                                  <>
                                    <span className="inline-block w-[5px] h-[5px] rounded-full"
                                      style={{ background: 'var(--c-texte)' }} />
                                    <span style={{ color: 'var(--c-texte)' }}>réglé</span>
                                  </>
                                )}
                              </span>
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      <Legende defs={VERDICTS}>
        <span className="inline-flex items-center gap-1">
          <span className="inline-block w-[5px] h-[5px] rounded-full" style={{ background: 'var(--c-texte)' }} />
          réglé ·
          <IconLock size={11} className="text-slate-400" /> réservé à la direction
        </span>
      </Legende>
    </div>

    <JournalGestes lignes={journal} g={g} />
    </>
  );
}

/** LE JOURNAL DES RÉGLAGES — qui a changé quel geste, pour quel rôle, quand,
 *  et d'où vers où. En ajout seul : le serveur n'offre aucune route pour le
 *  modifier, et la base le refuse. */
function JournalGestes({ lignes, g }) {
  if (!lignes) return null;
  const libelleGeste = cle => {
    const x = g.gestes.find(y => y.id === cle);
    const gr = x && g.groupes.find(y => y.cle === x.module);
    return x ? `${gr?.label || x.module} · ${x.label}` : cle;
  };
  return (
    <div className="carte overflow-hidden">
      <TitreCarte titre="Journal des réglages">
        Chaque changement de geste, avec son auteur et l’heure. Le journal ne se corrige ni ne
        s’efface : revenir au défaut s’y inscrit comme le reste.
      </TitreCarte>
      {!lignes.length ? (
        <div className="px-4 py-3 text-[12px] text-slate-500">
          Aucun réglage : tous les gestes suivent le défaut du code.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-[12px]">
            <thead className="tab-entete">
              <tr>
                <th className="text-left px-3 py-1.5 w-[130px]">Date</th>
                <th className="text-left px-2 py-1.5 w-[170px]">Par</th>
                <th className="text-left px-2 py-1.5">Geste</th>
                <th className="text-left px-2 py-1.5 w-[140px]">Rôle</th>
                <th className="text-left px-3 py-1.5 w-[220px]">Avant → après</th>
              </tr>
            </thead>
            <tbody>
              {lignes.map(l => (
                <tr key={l.id} className="border-b border-slate-100 bg-white">
                  <td className="px-3 py-1 text-slate-500 whitespace-nowrap">
                    {(l.horodatage || '').slice(0, 16).replace('T', ' ')}
                  </td>
                  <td className="px-2 py-1">{nomListe(l.acteur_nom) || '—'}</td>
                  <td className="px-2 py-1">{libelleGeste(l.geste_cle)}</td>
                  <td className="px-2 py-1">{nomRole(g, l.role)}</td>
                  <td className="px-3 py-1 whitespace-nowrap">
                    <span className="text-slate-500">{direVerdict(l.avant)}</span>
                    {' → '}
                    <span className="font-semibold">{direVerdict(l.apres)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export default function RolesPlafonds() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(null);
  const [nouveau, setNouveau] = useState(null);   // { libelle, modele } en cours de création

  async function charger() {
    const rep = await fetch('/api/profils-acces/plafonds', { headers: authHeaders() });
    setData(rep.ok ? await rep.json() : null);
  }
  useEffect(() => { charger(); }, []);

  /* Un rôle défini naît fermé (ou copie un rôle modèle) : la direction ouvre
     ensuite, écran par écran, dans la grille ci-dessous. */
  async function creerRole() {
    setEnCours('nouveau');
    try {
      const rep = await fetch('/api/profils-acces/roles', {
        method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ libelle: nouveau.libelle, modele: nouveau.modele || null }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      setNouveau(null);
      oublierPlafonds();
      await charger();
    } finally { setEnCours(null); }
  }

  async function supprimerRole(code) {
    const lib = nomRole(data, code);
    if (!confirm(`Supprimer le rôle « ${lib} » ?\n\nRefusé si des comptes le portent encore.`)) return;
    const rep = await fetch(`/api/profils-acces/roles/${encodeURIComponent(code)}`, {
      method: 'DELETE', headers: authHeaders() });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    oublierPlafonds();
    await charger();
  }

  async function basculer(role, module) {
    if (DIRECTION.includes(role)) return;
    const actuel = data.plafonds[role]?.[module] || 'rien';
    const i = NIVEAUX.findIndex(n => n.val === actuel);
    const suivant = NIVEAUX[(i + 1) % NIVEAUX.length].val;

    setEnCours(`${role}|${module}`);
    try {
      const rep = await fetch('/api/profils-acces/plafonds', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ role, module, niveau: suivant }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      if (j.avertissement) setMessage({ type: 'info', texte: j.avertissement });
      oublierPlafonds();   // le rail et les onglets suivent, sans rechargement
      await charger();
    } finally { setEnCours(null); }
  }

  if (!data) return <div className="text-sm text-slate-400">Chargement…</div>;

  return (
    <div className="space-y-4">
      {message && (
        <div className="bloc-etat px-4 py-2.5 text-[13px] flex items-start justify-between gap-3"
          data-etat={message.type === 'err' ? 'corriger' : 'surveiller'}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="text-slate-400">✕</button>
        </div>
      )}

      <div className="carte overflow-hidden">
        <TitreCarte titre="Plafonds par rôle"
          droite={!nouveau && (
            <button className="bouton controle text-[12px]"
              onClick={() => setNouveau({ libelle: '', modele: '' })}>
              + Nouveau rôle
            </button>
          )}>
          Ce que chaque rôle autorise au mieux, module par module ; les cases d’une fiche affinent
          à l’intérieur. Cliquer une case fait tourner le niveau.
        </TitreCarte>

        {nouveau && (
          <div className="px-4 py-3 border-b border-slate-200 flex flex-wrap items-end gap-2">
            <div>
              <label className="block text-[11px] text-slate-500 mb-0.5">Libellé du rôle</label>
              <input value={nouveau.libelle} autoFocus
                onChange={e => setNouveau(n0 => ({ ...n0, libelle: e.target.value }))}
                placeholder="ex : Conseiller numérique"
                className="controle min-w-[240px]" />
            </div>
            <div>
              <label className="block text-[11px] text-slate-500 mb-0.5">Partir des plafonds de</label>
              <select value={nouveau.modele}
                onChange={e => setNouveau(n0 => ({ ...n0, modele: e.target.value }))}
                className="controle">
                <option value="">— rien (tout fermé) —</option>
                {data.roles.filter(r0 => !DIRECTION.includes(r0)).map(r0 => (
                  <option key={r0} value={r0}>{nomRole(data, r0)}</option>
                ))}
              </select>
            </div>
            <button className="bouton bouton-fort controle disabled:opacity-40"
              disabled={enCours === 'nouveau' || !nouveau.libelle.trim()} onClick={creerRole}>
              Créer
            </button>
            <button className="bouton controle" onClick={() => setNouveau(null)}>Annuler</button>
            <p className="w-full text-[11px] text-slate-500 m-0">
              Le rôle naît avec ces plafonds ; réglez-les ensuite écran par écran dans la grille.
              Le périmètre de sections se pose sur la fiche de chaque personne.
            </p>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full table-fixed border-collapse text-[13px]">
            <thead>
              <tr className="tab-entete">
                <th className={`${COL_PREMIERE} px-3 py-1.5 text-left align-bottom sticky left-0 z-10`}
                  style={{ background: 'var(--tab-repere)' }}>Rôle</th>
                <EnteteModules />
                <th aria-hidden="true" />
              </tr>
            </thead>
            <tbody>
              {data.roles.map(role => {
                const fige = DIRECTION.includes(role);
                return (
                  <tr key={role} className={`${HAUTEUR_LIGNE} bg-white border-b border-slate-100`}>
                    <td className={`${COL_PREMIERE} px-3 sticky left-0 bg-white z-10 border-r border-slate-100`}>
                      <div className="flex items-center gap-1.5 truncate" style={{ color: 'var(--c-texte)' }}>
                        <span className="truncate">{nomRole(data, role)}</span>
                        {fige && <IconLock size={12} className="text-slate-300 flex-none" />}
                        {data.personnalises?.includes(role) && (
                          <button onClick={() => supprimerRole(role)}
                            title="Supprimer ce rôle (refusé si des comptes le portent)"
                            className="text-slate-300 hover:text-red-600 flex-none">
                            <IconTrash size={12} />
                          </button>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-400 truncate">{role}</div>
                    </td>
                    {MODULES_ACCES.map(m => {
                      const niveau = data.plafonds[role]?.[m.key] || 'rien';
                      const n = NIVEAUX_DROIT[niveau] || NIVEAUX_DROIT.rien;
                      return (
                        <td key={m.key} className={`${COL_MODULE} px-1.5 text-center`}>
                          <CaseDroit niveau={niveau} occupe={enCours === `${role}|${m.key}`}
                            disabled={fige || enCours === `${role}|${m.key}`}
                            onClick={() => basculer(role, m.key)}
                            title={fige ? "La direction conserve l'écriture partout"
                                        : `${m.label} — ${n.aide} — cliquer pour changer`} />
                        </td>
                      );
                    })}
                    <td aria-hidden="true" />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Legende defs={NIVEAUX_DROIT}>
          <span title={"Le plafond est un maximum, non une attribution : une personne n'obtient un droit que si la case "
            + "correspondante est aussi cochée sur sa fiche. Abaisser un plafond retire le droit à tous ceux qui "
            + "portent ce rôle, immédiatement. Le niveau « validation » suppose que l'écran sache transmettre une "
            + "demande ; ailleurs, la saisie est refusée avec un message explicite."}>
            <IconLock size={11} className="inline -mt-0.5" /> la direction reste en écriture partout : c’est elle
            qui répare les erreurs de paramétrage.
          </span>
        </Legende>
      </div>

      <Gestes plafonds={data.plafonds} onMessage={setMessage} />

      <Constat />
    </div>
  );
}
