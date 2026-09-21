import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconBook, IconFileText, IconCheck, IconAlertTriangle, IconPlus,
  IconHistory, IconUsersGroup, IconHelpCircle, IconScale, IconExternalLink,
} from '@tabler/icons-react';
import { useSearchParams } from 'react-router-dom';
import { authHeaders, getUser } from '../lib/api.js';
import { PageHeader, RailLateral, Fenetre } from '../components/ui.jsx';
import Aide from './Aide.jsx';
import EditeurTexte from '../components/EditeurTexte.jsx';

/**
 * DOCUMENTATION — le corpus, et la prise de connaissance qui l'oppose.
 *
 * Demandé par Charles le 20 septembre 2026 : « Une circulaire examens doit être
 * consultée par les MDP en début d'année. Ce sont les règles du jeu, donc elles
 * doivent être maîtrisées. Le professeur DOIT cocher "je confirme avoir pris
 * connaissance du document". Ceci est tracé. »
 *
 * ── POURQUOI L'AIDE EST ABSORBÉE ICI, ET NON POSÉE À CÔTÉ ───────────────────
 *
 * L'écran d'aide existait déjà, et son contenu vivait dans un TABLEAU
 * JAVASCRIPT compilé dans l'application : le modifier demandait un commit, une
 * construction et un déploiement. Au 20 septembre 2026 il ne disait donc pas un
 * mot de la valorisation, de la délibération, des diplômes, de l'échéancier ni
 * du suivi d'équipe — dernière mise à jour le 14, la semaine où Lucie a le plus
 * changé. UN TEXTE QUI COÛTE UN DÉPLOIEMENT NE SE MET JAMAIS À JOUR.
 *
 * Deux portes pour « savoir » en auraient fait une de trop : un enseignant
 * aurait cherché la circulaire examens dans l'une et le mode d'emploi du PAE
 * dans l'autre, sans pouvoir deviner laquelle. Un seul endroit, donc, et deux
 * faces — LES TEXTES qui s'imposent, et LE MODE D'EMPLOI de l'outil.
 */

const NATURES_ORDRE = ['decret', 'circulaire', 'reglement', 'procedure', 'note', 'aide'];

/* LA DIRECTION DÉPOSE, ET PERSONNE D'AUTRE. Cette liste ne sert qu'à CACHER ce
   qui ne servirait à rien d'afficher : le droit se contrôle sur la route — un
   bouton caché n'est pas une protection. */
const PEUT_PUBLIER = ['admin', 'directeur', 'directeur_adjoint'];

/* LE TEXTE BRUT D'AVANT DEVIENT DES PARAGRAPHES quand on le reprend dans
 * l'éditeur : les versions publiées avant 2.12.91 étaient du texte brut, et
 * c'est de là qu'on repart pour la suivante. */
const echapper = t => String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
function texteEnHtml(t) {
  return String(t || '').split(/\n\s*\n/).map(b => b.trim()).filter(Boolean)
    .map(b => `<p>${echapper(b).replace(/\n/g, '<br>')}</p>`).join('');
}
/** Un HTML sans aucun texte dedans est un texte vide. */
const sansTexte = html => !String(html || '').replace(/<[^>]*>/g, '')
  .replace(/&nbsp;/g, ' ').trim();

function frDate(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  return Number.isNaN(+d) ? String(s).slice(0, 10) : d.toLocaleDateString('fr-BE');
}

export default function Documentation() {
  const u = getUser();
  const publie = PEUT_PUBLIER.includes(u?.role);
  const [vue, setVue] = useState('textes');          // textes | aide
  const [docs, setDocs] = useState(null);
  const [natures, setNatures] = useState([]);
  const [fNature, setFNature] = useState('');
  const [erreur, setErreur] = useState(null);
  /* LE DOCUMENT OUVERT VIT DANS L'ADRESSE (`?doc=<clé>`).
     L'Accueil annonce « ce texte attend votre confirmation » : s'il menait à
     la liste, il faudrait y retrouver à la main ce qu'on vient de nous
     désigner. Le lien ouvre donc le texte lui-même — et le serveur pose
     `ouvert_le` en le servant, comme pour un clic dans la liste. */
  const [params, setParams] = useSearchParams();
  const ouvert = params.get('doc');
  const setOuvert = (cle) => setParams(p => {
    const n = new URLSearchParams(p);
    if (cle) n.set('doc', cle); else n.delete('doc');
    return n;
  });
  const [depot, setDepot] = useState(false);
  const [registre, setRegistre] = useState(null);

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/documentation', { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error || 'Lecture refusée.'); return; }
      setDocs(j.documents || []);
      setNatures(j.natures || []);
    } catch (e) { setErreur(e.message); }
  }, []);
  useEffect(() => { charger(); }, [charger]);

  const libelleNature = useMemo(() => {
    const m = new Map();
    for (const n of natures) m.set(n.cle, n.libelle);
    return m;
  }, [natures]);

  const vus = useMemo(() => (docs || [])
    .filter(d => !fNature || d.nature === fNature)
    .sort((a, b) => {
      /* CE QUI M'ATTEND PASSE DEVANT. Un corpus rangé par nature est un
         classement d'archiviste : il répond à « où est ce texte ? » et cache
         « qu'est-ce que je dois lire ? », qui est la seule question que se pose
         quelqu'un en ouvrant cet écran. */
      if (a.a_confirmer !== b.a_confirmer) return a.a_confirmer ? -1 : 1;
      const na = NATURES_ORDRE.indexOf(a.nature), nb = NATURES_ORDRE.indexOf(b.nature);
      if (na !== nb) return na - nb;
      return (a.titre || '').localeCompare(b.titre || '', 'fr');
    }), [docs, fNature]);

  const aLire = (docs || []).filter(d => d.a_confirmer).length;

  return (
    <div className="relative">
      <RailLateral
        icon={IconBook} titre="Documentation"
        sousTitre={aLire ? `${aLire} à confirmer` : 'tout est confirmé'}
        sections={[
          { label: 'Vue', items: [
            { key: 'textes', label: 'Textes et procédures', icon: IconScale,
              actif: vue === 'textes', onClick: () => setVue('textes') },
            { key: 'aide', label: 'Mode d’emploi de Lucie', icon: IconHelpCircle,
              actif: vue === 'aide', onClick: () => setVue('aide') },
          ]},
          ...(publie ? [{ label: 'Actions', items: [
            { key: 'deposer', label: 'Déposer un texte', icon: IconPlus,
              couleur: 'var(--menu-accent)', onClick: () => setDepot(true) },
          ]}] : []),
        ]}
      />

      <div className="gouttiere-rail p-4 md:p-8 space-y-4">
        {vue === 'aide' ? <Aide integre /> : (
          <>
            <PageHeader titre="Textes et procédures"
              sous="Les règles du jeu — décrets, circulaires, règlements et procédures de l’Institut" />

            {erreur && (
              <div className="carte p-3 text-[13px] text-rose-700">{erreur}</div>
            )}

            {/* CE QUI M'ATTEND, EN TÊTE ET NOMMÉ.
                « Vous avez trois documents à lire » sans dire lesquels oblige à
                parcourir la liste pour les retrouver : on ne le fait pas. */}
            {aLire > 0 && (
              <div className="carte p-3 flex items-start gap-2"
                style={{ borderLeftWidth: 3, borderLeftColor: '#B45309' }}>
                <IconAlertTriangle size={16} className="flex-none mt-0.5 text-[#B45309]" />
                <div className="text-[13px]">
                  <b>La direction a publié {aLire === 1 ? 'un document'
                    : `${aLire} documents`} : veuillez en prendre connaissance.</b>
                  <div className="text-[12px] text-slate-600 mt-0.5">
                    {(docs || []).filter(d => d.a_confirmer).map(d => d.titre).join(' · ')}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <select value={fNature} onChange={e => setFNature(e.target.value)}
                className="controle text-[13px]">
                <option value="">Toutes les natures</option>
                {natures.map(n => (
                  <option key={n.cle} value={n.cle}>{n.libelle}</option>
                ))}
              </select>
              <span className="text-[12px] text-slate-500">
                {vus.length} texte(s)
              </span>
            </div>

            {docs && !vus.length && (
              <p className="text-[13px] text-slate-400">
                Aucun texte déposé{fNature ? ' de cette nature' : ''}.
                {publie && ' Le bouton « Déposer un texte » en ajoute un.'}
              </p>
            )}

            <div className="space-y-1.5">
              {vus.map(d => (
                <div key={d.cle} className="carte px-3 py-2 flex items-center gap-3"
                  style={d.a_confirmer
                    ? { borderLeftWidth: 3, borderLeftColor: '#B45309' } : undefined}>
                  <span className="flex-1 min-w-0">
                    <span className="text-[13px] font-semibold text-iip-blue">{d.titre}</span>
                    <span className="block text-[11px] text-slate-500">
                      {libelleNature.get(d.nature) || d.nature}
                      {d.version ? ` · version ${d.version.numero} du ${frDate(d.version.publiee_le)}` : ' · aucune version publiée'}
                      {d.retire_le ? ' · RETIRÉ' : ''}
                    </span>
                  </span>

                  {/* L'ÉTAT PERSONNEL, ET IL NE DIT QU'UNE CHOSE À LA FOIS. */}
                  {d.confirme_le ? (
                    <span className="text-[11px] text-emerald-700 flex items-center gap-1 flex-none">
                      <IconCheck size={14} /> confirmé le {frDate(d.confirme_le)}
                    </span>
                  ) : d.a_confirmer ? (
                    <span className="text-[11px] text-[#B45309] flex-none">à confirmer</span>
                  ) : d.me_concerne ? null : (
                    <span className="text-[11px] text-slate-400 flex-none">pour information</span>
                  )}

                  <button className="bouton text-[12px] px-2.5 py-1 flex-none"
                    onClick={() => setOuvert(d.cle)}>
                    <IconFileText size={14} /> Lire
                  </button>
                  {publie && (
                    <button className="bouton text-[12px] px-2.5 py-1 flex-none"
                      title="Qui a confirmé, qui pas"
                      onClick={() => setRegistre(d.cle)}>
                      <IconUsersGroup size={14} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {ouvert && (
        <LireTexte cle={ouvert} publie={publie}
          onClose={() => setOuvert(null)} onChange={charger} />
      )}
      {depot && <DeposerTexte natures={natures}
        onClose={() => setDepot(false)} onCree={charger} />}
      {registre && <Registre cle={registre} onClose={() => setRegistre(null)} />}
    </div>
  );
}

/* ══ LIRE UN TEXTE — ET C'EST CETTE OUVERTURE QUI FAIT LA PREUVE ══════════ */

/**
 * LA CASE NE S'ACTIVE QUE QUAND LE SERVEUR A SERVI LE TEXTE.
 *
 * Ce qui s'oppose à quelqu'un n'est pas qu'il ait coché : c'est que le document
 * LUI AIT ÉTÉ PRÉSENTÉ et qu'il en ait accusé réception. Si le texte n'a pas
 * chargé et que la personne coche quand même, l'accusé ne vaut rien devant qui
 * le contestera. La trace `ouvert_le` est posée PAR LA ROUTE qui rend le
 * contenu — jamais par un clic de l'écran, qui pourrait prétendre avoir
 * affiché ce qu'il n'a pas reçu.
 *
 * Cela ne prétend pas prouver la LECTURE, et Charles l'a dit lui-même : coché
 * sans lire, c'est le problème de celui qui a coché.
 */
function LireTexte({ cle, publie, onClose, onChange }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [coche, setCoche] = useState(false);
  const [nouvelle, setNouvelle] = useState(null);   // { contenu, resume }

  const charger = useCallback(async () => {
    try {
      const r = await fetch(`/api/documentation/${encodeURIComponent(cle)}`,
        { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error || 'Lecture refusée.'); return; }
      setD(j);
    } catch (e) { setErreur(e.message); }
  }, [cle]);
  useEffect(() => { charger(); }, [charger]);

  async function confirmer() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/documentation/${encodeURIComponent(cle)}/confirmer`,
        { method: 'POST', headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      await charger(); await onChange?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function publier() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/documentation/${encodeURIComponent(cle)}/versions`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu: nouvelle.contenu, format: 'html',
                               resume_changement: nouvelle.resume,
                               reconfirmer: nouvelle.reconfirmer,
                               source_url: nouvelle.source }),
      });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      setNouvelle(null); await charger(); await onChange?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const doitConfirmer = d?.me_concerne && !d?.confirme_le;

  return (
    <Fenetre icone={IconFileText} large="grande" onFermer={onClose}
      titre={d?.titre || 'Document'}
      sous={d?.version ? `Version ${d.version.numero} du ${frDate(d.version.publiee_le)}`
        + `${d.version.publiee_par ? ` · publiée par ${d.version.publiee_par}` : ''}`
        : 'Chargement…'}
      pied={<>
        {doitConfirmer ? (
          <>
            <label className="flex items-center gap-2 text-[13px]">
              <input type="checkbox" checked={coche} disabled={!d?.ouvert_le}
                onChange={e => setCoche(e.target.checked)} className="w-4 h-4" />
              Je confirme avoir pris connaissance de ce document
            </label>
            <button className="bouton bouton-fort disabled:opacity-40"
              disabled={!coche || enCours || !d?.ouvert_le} onClick={confirmer}>
              {enCours ? 'Enregistrement…' : 'Confirmer'}
            </button>
          </>
        ) : d?.confirme_le ? (
          <span className="text-[12px] text-emerald-700 flex items-center gap-1">
            <IconCheck size={14} /> Vous avez confirmé le {frDate(d.confirme_le)}
            {/* LA VERSION QU'ON A ACCEPTÉE EST DITE, quand ce n'est pas celle
                qu'on lit : la direction a publié depuis une correction qui ne
                demandait pas de relire, et la personne doit pouvoir le savoir. */}
            {d.version_confirmee && d.version_confirmee !== d.version?.numero
              ? ` (version ${d.version_confirmee} — les corrections suivantes ne demandaient pas de relire).`
              : '.'}
          </span>
        ) : (
          <span className="text-[12px] text-slate-500">
            Ce document ne vous est pas opposé : il est là pour information.
          </span>
        )}
        <button className="bouton ml-auto" onClick={onClose}>Fermer</button>
      </>}>

      {erreur && (
        <div className="carte p-3 text-[12px] text-rose-700 mb-3 flex items-start gap-1.5">
          <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
        </div>
      )}

      {d?.version?.resume_changement && (
        <div className="carte p-3 mb-3 text-[13px]"
          style={{ borderLeftWidth: 3, borderLeftColor: '#B45309' }}>
          <b>Ce qui a changé dans cette version :</b> {d.version.resume_changement}
        </div>
      )}

      {d?.source_url && (
        <a href={d.source_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-[12px] text-iip-blue underline mb-2">
          <IconExternalLink size={13} /> Texte officiel en ligne
        </a>
      )}

      {/* LE TEXTE, TEL QU'IL A ÉTÉ PUBLIÉ.
          Mis en forme (format 'html') : il a été filtré PAR LE SERVEUR à
          l'écriture — seule une liste fermée de balises y est entrée —, on
          peut donc l'afficher tel quel. Texte brut (les versions d'avant
          2.12.91) : `pre-wrap`, on respecte les retours à la ligne. */}
      {d?.version?.format === 'html' ? (
        <div className="carte p-4 texte-corpus-cadre">
          <div className="texte-corpus"
            dangerouslySetInnerHTML={{ __html: d.version.contenu }} />
        </div>
      ) : (
        <div className="carte p-4 text-[13px] leading-relaxed whitespace-pre-wrap">
          {d?.version?.contenu || (erreur ? '' : 'Chargement…')}
        </div>
      )}

      {/* L'HISTORIQUE — parce qu'une personne s'est engagée sur UNE version, et
          qu'elle doit pouvoir retrouver celle qu'elle a acceptée. */}
      {d?.versions?.length > 1 && (
        <div className="mt-3 text-[12px] text-slate-500">
          <div className="flex items-center gap-1.5 mb-1">
            <IconHistory size={14} /> Versions précédentes
          </div>
          {d.versions.slice(1).map(v => (
            <div key={v.numero} className="pl-5">
              Version {v.numero} du {frDate(v.publiee_le)}
              {v.publiee_par ? ` · ${v.publiee_par}` : ''}
              {v.resume_changement ? ` — ${v.resume_changement}` : ''}
              {v.numero > 1 && !v.reconfirmer ? ' · sans nouvelle confirmation' : ''}
            </div>
          ))}
        </div>
      )}

      {publie && (
        <div className="mt-4">
          {!nouvelle ? (
            <button className="bouton text-[12px]"
              onClick={() => setNouvelle({
                contenu: d?.version?.format === 'html'
                  ? d.version.contenu : texteEnHtml(d?.version?.contenu),
                resume: '', reconfirmer: false, source: d?.source_url || '' })}>
              Corriger — publier une nouvelle version
            </button>
          ) : (
            <div className="carte p-3 space-y-2">
              {/* UNE VERSION PUBLIÉE NE SE MODIFIE PLUS — on en publie une
                  autre, qu'on part de la précédente pour corriger. Le résumé
                  n'est pas une politesse : la version reste au dossier. */}
              <div className="text-[11px] uppercase tracking-wide text-slate-500">
                Version {(d?.version?.numero || 0) + 1} — partie de la version {d?.version?.numero}
              </div>
              <EditeurTexte valeur={nouvelle.contenu}
                onChange={html => setNouvelle(n => ({ ...n, contenu: html }))} />
              <input value={nouvelle.resume}
                onChange={e => setNouvelle(n => ({ ...n, resume: e.target.value }))}
                placeholder="Ce qui change, en une phrase — obligatoire"
                className="controle text-[13px] w-full" />
              <input value={nouvelle.source}
                onChange={e => setNouvelle(n => ({ ...n, source: e.target.value }))}
                placeholder="Lien vers le texte officiel en ligne (facultatif) — https://…"
                className="controle text-[13px] w-full" />
              {/* LA CASE DE CHARLES (21 septembre 2026) : c'est celui qui
                  publie qui dit si le personnel doit relire. Décochée par
                  défaut — une date ou une adresse corrigée ne remet pas
                  quarante personnes au travail —, mais le serveur exige qu'on
                  ait répondu, et la version garde la réponse. */}
              <label className="flex items-start gap-2 text-[13px] p-2 rounded-champ border border-slate-200 bg-white">
                <input type="checkbox" checked={nouvelle.reconfirmer}
                  onChange={e => setNouvelle(n => ({ ...n, reconfirmer: e.target.checked }))}
                  className="w-4 h-4 mt-0.5" />
                <span>
                  <b>Les membres du personnel doivent relire et confirmer à nouveau</b>
                  <span className="block text-[12px] text-slate-500">
                    {nouvelle.reconfirmer
                      ? 'Chaque destinataire verra ce texte réapparaître « à confirmer » sur son Accueil.'
                      : 'Correction sans nouvelle confirmation : les confirmations déjà données restent valables. La version et ce qui change restent au dossier.'}
                  </span>
                </span>
              </label>
              <div className="flex gap-2">
                <button className="bouton bouton-fort disabled:opacity-40"
                  disabled={enCours || sansTexte(nouvelle.contenu) || !nouvelle.resume.trim()}
                  onClick={publier}>
                  Publier la version {(d?.version?.numero || 0) + 1}
                </button>
                <button className="bouton" onClick={() => setNouvelle(null)}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      )}
    </Fenetre>
  );
}

/* ══ DÉPOSER UN TEXTE ═════════════════════════════════════════════════════ */

function DeposerTexte({ natures, onClose, onCree }) {
  const [titre, setTitre] = useState('');
  const [nature, setNature] = useState('procedure');
  const [contenu, setContenu] = useState('');
  const [source, setSource] = useState('');
  const [roles, setRoles] = useState(() => new Set());
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  /* À QUI LE TEXTE S'IMPOSE — PAR RÔLE, JAMAIS PAR PERSONNE. Nommer les gens un
     à un, c'est oublier celui qui arrive en octobre. Un texte sans destinataire
     reste consultable : il n'est simplement pas opposable, et c'est un choix —
     un mode d'emploi n'a pas à être accusé réception. */
  const ROLES = [
    ['professeur', 'Enseignants'], ['secretariat', 'Secrétariat'],
    ['coordination', 'Coordinations'], ['directeur_adjoint', 'Direction adjointe'],
    ['editeur', 'Éditeurs'],
  ];

  const manque = !titre.trim() ? 'Donne un titre au texte.'
    : sansTexte(contenu) ? 'Importez un fichier ou écrivez le texte : il est vide.'
      : null;

  async function creer() {
    if (manque) return;
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/documentation', {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ titre: titre.trim(), nature, source_url: source.trim() }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Refusé.');

      const v = await fetch(`/api/documentation/${j.cle}/versions`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu, format: 'html' }),
      });
      const jv = await v.json();
      if (!v.ok) throw new Error(jv.error || 'La version n’a pas pu être publiée.');

      if (roles.size) {
        await fetch(`/api/documentation/${j.cle}/destinataires`, {
          method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ roles: [...roles] }),
        });
      }
      await onCree?.(); onClose();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  return (
    <Fenetre icone={IconPlus} large="grande" onFermer={onClose}
      titre="Déposer un texte"
      sous="Il sera publié en version 1, et opposable aux rôles que vous cochez"
      pied={<>
        <button className="bouton bouton-fort disabled:opacity-40"
          disabled={!!manque || enCours} onClick={creer}>
          {enCours ? 'Publication…' : 'Déposer et publier'}
        </button>
        <span className="text-[12px] text-slate-500">
          {manque || (roles.size
            ? `Opposable à ${roles.size} rôle(s) — chacun devra en accuser réception.`
            : 'Aucun rôle coché : le texte sera consultable, mais pas opposable.')}
        </span>
        <button className="bouton ml-auto" onClick={onClose}>Annuler</button>
      </>}>

      {erreur && (
        <div className="carte p-3 text-[12px] text-rose-700 mb-3">{erreur}</div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <input value={titre} onChange={e => setTitre(e.target.value)}
            placeholder="Titre du texte — « Circulaire examens 2026-2027 »"
            className="controle text-[13px] flex-1 min-w-[18rem]" />
          <select value={nature} onChange={e => setNature(e.target.value)}
            className="controle text-[13px]">
            {natures.map(n => <option key={n.cle} value={n.cle}>{n.libelle}</option>)}
          </select>
        </div>

        <input value={source} onChange={e => setSource(e.target.value)}
          placeholder="Lien vers le texte officiel en ligne (facultatif, utile pour un décret) — https://…"
          className="controle text-[13px] w-full" />

        <EditeurTexte valeur={contenu} onChange={setContenu} />

        <div className="carte p-3 space-y-2">
          <div className="text-[11px] uppercase tracking-wide text-slate-500">
            À qui ce texte s’impose
          </div>
          <div className="flex flex-wrap gap-2">
            {ROLES.map(([cle, lib]) => (
              <label key={cle}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-champ border
                  cursor-pointer text-[12px] ${roles.has(cle)
                    ? 'border-iip-blue bg-iip-blue/5' : 'border-slate-200 text-slate-600'}`}>
                <input type="checkbox" checked={roles.has(cle)}
                  onChange={() => setRoles(s => {
                    const n = new Set(s); n.has(cle) ? n.delete(cle) : n.add(cle); return n;
                  })} className="w-3.5 h-3.5" />
                {lib}
              </label>
            ))}
          </div>
          <p className="text-[12px] text-slate-500">
            Par RÔLE, jamais par personne : nommer les gens un à un, c’est
            oublier celui qui arrive en octobre.
          </p>
        </div>
      </div>
    </Fenetre>
  );
}

/* ══ LE REGISTRE — QUI A CONFIRMÉ, ET SURTOUT QUI PAS ═════════════════════ */

/**
 * « 9 des 12 personnes concernées ont confirmé » ne sert à rien : ce sont les
 * TROIS AUTRES qu'il faut pouvoir nommer, puisque c'est à elles qu'on ira
 * parler. Un compteur sans noms est un compteur qu'on regarde et qu'on oublie.
 */
function Registre({ cle, onClose }) {
  const [r, setR] = useState(null);
  const [erreur, setErreur] = useState(null);

  useEffect(() => {
    fetch(`/api/documentation/${encodeURIComponent(cle)}/registre`, { headers: authHeaders() })
      .then(async res => {
        const j = await res.json();
        if (!res.ok) throw new Error(j.error || 'Lecture refusée.');
        setR(j);
      })
      .catch(e => setErreur(e.message));
  }, [cle]);

  const nb = (r?.lignes || []).length;
  const ok = (r?.lignes || []).filter(l => l.confirme_le).length;

  return (
    <Fenetre icone={IconUsersGroup} large="moyenne" onFermer={onClose}
      titre="Prise de connaissance"
      sous={r?.document?.titre || ''}
      pied={<>
        <span className="text-[12px] text-slate-500">
          {r?.version ? `Version ${r.version.numero} · ${ok} sur ${nb} ont confirmé`
            : 'Aucune version publiée.'}
        </span>
        <button className="bouton ml-auto" onClick={onClose}>Fermer</button>
      </>}>

      {erreur && <div className="carte p-3 text-[12px] text-rose-700">{erreur}</div>}

      {r?.sans_destinataire && (
        <p className="text-[13px] text-slate-500">
          Ce texte n’est opposé à personne : il est consultable, mais aucune
          confirmation n’est attendue.
        </p>
      )}

      <div className="space-y-1">
        {(r?.lignes || []).map(l => (
          <div key={l.id} className="carte px-3 py-1.5 flex items-center gap-3 text-[13px]"
            style={l.confirme_le ? undefined
              : { borderLeftWidth: 3, borderLeftColor: '#B45309' }}>
            <span className="flex-1 min-w-0">
              {l.nom_complet || l.email}
              <span className="text-[11px] text-slate-400 ml-2">{l.role}</span>
            </span>
            {/* LES DEUX TRACES SE LISENT SÉPARÉMENT : « on le lui a servi » et
                « il a confirmé » ne disent pas la même chose. */}
            <span className="text-[11px] text-slate-500 flex-none">
              {l.ouvert_le ? `ouvert le ${frDate(l.ouvert_le)}` : 'jamais ouvert'}
            </span>
            <span className={`text-[11px] flex-none ${l.confirme_le
              ? 'text-emerald-700' : 'text-[#B45309] font-semibold'}`}>
              {l.confirme_le ? `confirmé le ${frDate(l.confirme_le)}` : 'non confirmé'}
            </span>
          </div>
        ))}
      </div>
    </Fenetre>
  );
}
