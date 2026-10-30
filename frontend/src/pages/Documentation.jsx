import { ICONE_AXE } from '../lib/iconesAxes.js';
import { nomDuCompte } from '../lib/nom.js';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  IconBook, IconFileText, IconCheck, IconAlertTriangle, IconPlus,
  IconHistory, IconUsersGroup, IconHelpCircle, IconScale, IconExternalLink, IconTrash,
  IconWritingSign, IconUpload, IconTemplate, IconSend, IconListNumbers,
} from '@tabler/icons-react';
import { LecteurParties, EditeurParties, manqueParties, pourPublier, nouvellesParties } from '../components/TexteParParties.jsx';
import { useSearchParams } from 'react-router-dom';
import { authHeaders, getUser } from '../lib/api.js';
import { PageHeader, RailLateral, Fenetre } from '../components/ui.jsx';
import Aide from './Aide.jsx';
import EditeurTexte from '../components/EditeurTexte.jsx';
import RegistreConventions, { LIRE_CONVENTIONS } from '../components/RegistreConventions.jsx';

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
 *
 * Une troisième face depuis le 3 octobre 2026 : LES CONVENTIONS — leur
 * registre, leurs modèles (des textes qui vivent dans Lucie, versionnés comme
 * le corpus) et ce qui s'y dépose. Elle ne paraît que pour la direction, le
 * secrétariat et la coordination ; le serveur refuse les autres.
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

/* LES RÔLES À QUI UN TEXTE PEUT S'IMPOSER — une liste, pour le dépôt ET pour
 * la correction. Elle ne vivait que dans le formulaire de dépôt : la fenêtre
 * du texte publié n'avait donc rien pour les modifier. */
const ROLES = [
  ['professeur', 'Enseignants'], ['secretariat', 'Secrétariat'],
  ['coordination', 'Coordinations'], ['directeur_adjoint', 'Direction adjointe'],
  ['editeur', 'Éditeurs'],
  // Les étudiants le lisent et l'accusent dans leur espace (/espace, 3.1.475), un code à l'appui.
  ['etudiant', 'Étudiants'],
];

function CasesRoles({ roles, onBasculer }) {
  return (
    <div className="flex flex-wrap gap-2">
      {ROLES.map(([cle, lib]) => (
        <label key={cle}
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded-champ border
            cursor-pointer text-second ${roles.has(cle)
              ? 'border-iip-blue bg-iip-blue/5' : 'border-slate-200 text-slate-600'}`}>
          <input type="checkbox" checked={roles.has(cle)}
            onChange={() => onBasculer(cle)} className="w-3.5 h-3.5" />
          {lib}
        </label>
      ))}
    </div>
  );
}
const basculerDans = (set, cle) => { const n = new Set(set); n.has(cle) ? n.delete(cle) : n.add(cle); return n; };

function frDate(s) {
  if (!s) return '';
  const d = new Date(String(s).replace(' ', 'T'));
  return Number.isNaN(+d) ? String(s).slice(0, 10) : d.toLocaleDateString('fr-BE');
}

export default function Documentation() {
  const u = getUser();
  const publie = PEUT_PUBLIER.includes(u?.role);
  const [params, setParams] = useSearchParams();
  const voitConventions = LIRE_CONVENTIONS.includes(u?.role);
  const [vue, setVue] = useState(() => (params.get('vue') === 'conventions' && voitConventions ? 'conventions'
    : params.get('vue') === 'aide' ? 'aide' : 'textes'));     // textes | aide | conventions
  const [actionConv, setActionConv] = useState(null);       // nouvelle | deposer | modeles
  const [docs, setDocs] = useState(null);
  const [natures, setNatures] = useState([]);
  const [parParties, setParParties] = useState([]);   // les natures qui s'écrivent par parties (serveur)
  const [fNature, setFNature] = useState('');
  const [erreur, setErreur] = useState(null);
  /* LE DOCUMENT OUVERT VIT DANS L'ADRESSE (`?doc=<clé>`).
     L'Accueil annonce « ce texte attend votre confirmation » : s'il menait à
     la liste, il faudrait y retrouver à la main ce qu'on vient de nous
     désigner. Le lien ouvre donc le texte lui-même — et le serveur pose
     `ouvert_le` en le servant, comme pour un clic dans la liste. */
  const ouvert = params.get('doc');
  const setOuvert = (cle) => setParams(p => {
    const n = new URLSearchParams(p);
    if (cle) n.set('doc', cle); else n.delete('doc');
    return n;
  });
  const [depot, setDepot] = useState(false);
  const [conversion, setConversion] = useState(false);
  const [registre, setRegistre] = useState(null);
  const [retirerOuvert, setRetirerOuvert] = useState(false);

  const charger = useCallback(async () => {
    try {
      const r = await fetch('/api/documentation', { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error || 'Lecture refusée.'); return; }
      setDocs(j.documents || []);
      setNatures(j.natures || []);
      setParParties(j.par_parties || []);
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
        icon={ICONE_AXE.documentation} titre="Documentation"
        sousTitre={aLire ? `${aLire} à confirmer` : 'tout est confirmé'}
        sections={[
          { label: 'Vue', items: [
            { key: 'textes', label: 'Textes et procédures', icon: IconScale,
              actif: vue === 'textes', onClick: () => setVue('textes') },
            { key: 'aide', label: 'Mode d’emploi de Lucie', icon: IconHelpCircle,
              actif: vue === 'aide', onClick: () => setVue('aide') },
            ...(voitConventions ? [{ key: 'conventions', label: 'Conventions', icon: IconWritingSign,
              actif: vue === 'conventions', onClick: () => setVue('conventions') }] : []),
          ]},
          ...(vue === 'conventions' ? [{ label: 'Conventions', items: [
            { key: 'conv-nouvelle', label: 'Nouvelle convention', icon: IconPlus,
              couleur: 'var(--menu-accent)', onClick: () => setActionConv('nouvelle') },
            { key: 'conv-deposer', label: 'Déposer un document du partenaire', icon: IconUpload,
              onClick: () => setActionConv('deposer') },
            { key: 'conv-modeles', label: 'Modèles de convention', icon: IconTemplate,
              onClick: () => setActionConv('modeles') },
          ]}] : publie ? [{ label: 'Actions', items: [
            { key: 'deposer', label: 'Écrire un texte', icon: IconPlus,
              couleur: 'var(--menu-accent)', onClick: () => setDepot(true) },
            { key: 'convertir', label: 'Convertir les textes de l’IIP par parties', icon: IconListNumbers,
              onClick: () => setConversion(true) },
          ]}] : []),
        ]}
      />

      <div className="gouttiere-rail p-4 md:p-8 space-y-4">
        {vue === 'conventions' ? (
          <RegistreConventions action={actionConv} onActionFin={() => setActionConv(null)} />
        ) : vue === 'aide' ? <Aide integre /> : (
          <>
            <PageHeader titre="Textes et procédures"
              sous="Les règles du jeu — décrets, circulaires, règlements et procédures de l’Institut" />

            {erreur && (
              <div className="carte p-3 text-sm text-rose-700">{erreur}</div>
            )}

            {/* CE QUI M'ATTEND, EN TÊTE ET NOMMÉ.
                « Vous avez trois documents à lire » sans dire lesquels oblige à
                parcourir la liste pour les retrouver : on ne le fait pas. */}
            {aLire > 0 && (
              <div className="carte p-3 flex items-start gap-2"
                style={{ borderLeftWidth: 3, borderLeftColor: 'var(--c-attente)' }}>
                <IconAlertTriangle size={16} className="flex-none mt-0.5 text-iip-texte" />
                <div className="text-sm">
                  <b>La direction a publié {aLire === 1 ? 'un document'
                    : `${aLire} documents`} : veuillez en prendre connaissance.</b>
                  <div className="text-second text-slate-600 mt-0.5">
                    {(docs || []).filter(d => d.a_confirmer).map(d => d.titre).join(' · ')}
                  </div>
                </div>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <select value={fNature} onChange={e => setFNature(e.target.value)}
                className="controle text-sm">
                <option value="">Toutes les natures</option>
                {natures.map(n => (
                  <option key={n.cle} value={n.cle}>{n.libelle}</option>
                ))}
              </select>
              <span className="text-second text-slate-500">
                {vus.length} texte(s)
              </span>
              <span className="ml-auto flex items-center gap-3 text-xs text-slate-500">
                {[['var(--c-refuse)', 'à confirmer'], ['var(--c-reussi)', 'lu'], ['var(--c-disponible)', 'pour information']].map(([c, t]) => (
                  <span key={t} className="flex items-center gap-1.5"><span className="w-1 h-3.5 rounded-sm" style={{ background: c }} />{t}</span>))}
              </span>
            </div>

            {docs && !vus.length && (
              <p className="text-sm text-slate-400">
                Aucun texte déposé{fNature ? ' de cette nature' : ''}.
                {publie && ' Le bouton « Écrire un texte » en ajoute un.'}
              </p>
            )}

            {/* UNE LISTE, PAS DES TUILES (Charles, 30 octobre 2026 : « pas de tuiles différentes pour chaque
                ligne ; cliquer dessus doit lire ou ouvrir le lien ; obligatoire rouge, lu vert, pour info bleu »).
                Le liseré gauche porte l'état ; toute la ligne ouvre le texte (ou le texte officiel en ligne
                quand aucune version n'est publiée). */}
            {vus.length > 0 && (
              <div className="carte overflow-hidden">
                {vus.map(d => {
                  const lu = !!d.confirme_le || (!d.a_confirmer && !!d.ouvert_le);
                  const couleur = d.a_confirmer ? 'var(--c-refuse)' : lu ? 'var(--c-reussi)' : 'var(--c-disponible)';
                  const lien = !d.version && d.source_url;
                  const ouvrir = () => (lien ? window.open(d.source_url, '_blank', 'noopener') : setOuvert(d.cle));
                  return (
                    <div key={d.cle} role="button" tabIndex={0} onClick={ouvrir}
                      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ouvrir(); } }}
                      className="ligne-maison last:border-b-0 flex items-center gap-3 pl-4 pr-2 py-2.5 cursor-pointer"
                      style={{ boxShadow: `inset 4px 0 0 ${couleur}` }}>
                      <span className="flex-1 min-w-0">
                        <span className="text-sm font-semibold text-iip-texte flex items-center gap-1.5">
                          <span className="truncate">{d.titre}</span>
                          {lien && <IconExternalLink size={13} className="flex-none text-slate-400" />}
                        </span>
                        <span className="block text-xs text-slate-500 truncate">
                          {libelleNature.get(d.nature) || d.nature}
                          {d.version ? ` · version ${d.version.numero} du ${frDate(d.version.publiee_le)}` : ' · aucune version publiée'}
                          {d.retire_le ? ' · RETIRÉ' : ''}
                        </span>
                      </span>

                      {/* L'ÉTAT PERSONNEL, ET IL NE DIT QU'UNE CHOSE À LA FOIS. */}
                      <span className="text-xs text-slate-500 flex-none hidden sm:flex items-center gap-1">
                        {d.confirme_le ? <><IconCheck size={14} /> confirmé le {frDate(d.confirme_le)}</>
                          : d.a_confirmer ? 'à confirmer'
                          : lu ? <><IconCheck size={14} /> lu</> : 'pour information'}
                      </span>

                      {publie && (
                        <button className="p-1.5 rounded-champ text-slate-500 hover:bg-slate-100 flex-none"
                          title="Qui a confirmé, qui pas" aria-label="Qui a confirmé, qui pas"
                          onClick={e => { e.stopPropagation(); setRegistre(d.cle); }}>
                          <IconUsersGroup size={16} />
                        </button>
                      )}
                      {/* RETIRER SE VOIT SUR LA LIGNE (Charles, 27 septembre 2026 : « je ne sais toujours pas
                          supprimer ») : il ouvre le texte sur la confirmation. */}
                      {publie && !d.retire_le && (
                        <button className="p-1.5 rounded-champ text-slate-500 hover:bg-slate-100 flex-none"
                          title="Retirer ce texte" aria-label="Retirer ce texte"
                          onClick={e => { e.stopPropagation(); setRetirerOuvert(true); setOuvert(d.cle); }}>
                          <IconTrash size={16} />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      {ouvert && (
        <LireTexte cle={ouvert} publie={publie} natures={natures} parParties={parParties} retirer={retirerOuvert}
          onClose={() => { setOuvert(null); setRetirerOuvert(false); }} onChange={charger} />
      )}
      {depot && <DeposerTexte natures={natures} parParties={parParties}
        onClose={() => setDepot(false)} onCree={charger} />}
      {registre && <Registre cle={registre} onClose={() => setRegistre(null)} />}
      {conversion && <ConvertirTextes onClose={() => setConversion(false)} onFait={charger} />}
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
function LireTexte({ cle, publie, natures, parParties = [], onClose, onChange, retirer: retirerDemande = false }) {
  const [d, setD] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [coche, setCoche] = useState(false);
  const [nouvelle, setNouvelle] = useState(null);   // { contenu, resume }
  const [roles, setRoles] = useState(null);         // Set en cours de modification
  const [renomme, setRenomme] = useState(null);     // { titre, nature } en cours d'édition

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

  /* RETIRER N'EST PAS SUPPRIMER (et la route existait sans bouton — Charles,
     27 septembre 2026 : « je ne sais pas supprimer un document »). Le texte
     cesse de s'imposer et sort des listes ; il reste lisible, avec les
     confirmations posées dessus. */
  const [retrait, setRetrait] = useState(retirerDemande);
  async function retirer() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/documentation/${encodeURIComponent(cle)}/retirer`,
        { method: 'POST', headers: authHeaders() });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      setRetrait(false); await onChange?.(); onClose?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  /* Renommer ne touche ni aux versions ni aux confirmations : le titre est
     une métadonnée, la clé du document ne bouge pas. */
  async function renommer() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/documentation/${encodeURIComponent(cle)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ titre: renomme.titre, nature: renomme.nature }),
      });
      const j = await r.json();
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      setRenomme(null);
      await charger(); await onChange?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  async function publier() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/documentation/${encodeURIComponent(cle)}/versions`, {
        method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ contenu: nouvelle.parties ? pourPublier(nouvelle.parties) : nouvelle.contenu,
                               format: nouvelle.parties ? 'parties' : 'html',
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

  /* IMPRIMER (3.1.489, Charles : « Lucie, l'endroit aussi pour les imprimer »). La pièce vient du serveur, dans
     l'enveloppe commune ; le PDF serveur d'abord, l'impression du navigateur si le serveur ne sait pas en faire. */
  async function imprimer() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/documentation/${encodeURIComponent(cle)}/document${d?.version?.numero ? `?version=${d.version.numero}` : ''}`,
        { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'La pièce n’a pas pu être composée.');
      const rp = await fetch('/api/impression/pdf', { method: 'POST', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ html: j.html, nom: j.nom, pagination: 'auto' }) });
      if (rp.ok) {
        const url = URL.createObjectURL(await rp.blob());
        const lien = document.createElement('a'); lien.href = url; lien.download = `${j.nom}.pdf`;
        document.body.appendChild(lien); lien.click(); lien.remove();
        setTimeout(() => URL.revokeObjectURL(url), 30000);
      } else {
        const w = window.open('', '_blank');
        if (!w) throw new Error('Le navigateur a bloqué la fenêtre d’impression.');
        w.document.write(j.html); w.document.close(); w.focus(); setTimeout(() => w.print(), 400);
      }
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  /* PASSER UN TEXTE EN PARTIES : le serveur le découpe à ses titres ; rien n'est publié avant relecture. */
  async function decouper() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/documentation/${encodeURIComponent(cle)}/decouper`, { headers: authHeaders() });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Découpage refusé.');
      setNouvelle({ parties: j.parties?.length ? j.parties : nouvellesParties(),
        resume: 'Texte réécrit par parties dans Lucie.', reconfirmer: false, source: d?.source_url || '' });
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }

  /* MODIFIER À QUI LE TEXTE S'IMPOSE, APRÈS PUBLICATION.
     Ajouter un rôle rend le texte opposable à ces personnes, qui le verront
     « à confirmer » sur leur Accueil ; en retirer un cesse de le leur
     imposer — leurs confirmations déjà posées restent au registre. Le texte,
     lui, ne change pas : ce n'est pas une nouvelle version. */
  async function enregistrerRoles() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch(`/api/documentation/${encodeURIComponent(cle)}/destinataires`, {
        method: 'PUT', headers: { ...authHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ roles: [...roles] }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) { setErreur(j.error || 'Refusé.'); return; }
      setRoles(null); await charger(); await onChange?.();
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }
  const libelleRoles = l => (l || []).map(c => ROLES.find(r => r[0] === c)?.[1] || c).join(', ');

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
            <label className="flex items-center gap-2 text-sm">
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
          <span className="text-second text-emerald-700 flex items-center gap-1">
            <IconCheck size={14} /> Vous avez confirmé le {frDate(d.confirme_le)}
            {/* LA VERSION QU'ON A ACCEPTÉE EST DITE, quand ce n'est pas celle
                qu'on lit : la direction a publié depuis une correction qui ne
                demandait pas de relire, et la personne doit pouvoir le savoir. */}
            {d.version_confirmee && d.version_confirmee !== d.version?.numero
              ? ` (version ${d.version_confirmee} — les corrections suivantes ne demandaient pas de relire).`
              : '.'}
          </span>
        ) : (
          <span className="text-second text-slate-500">
            Ce document ne vous est pas opposé : il est là pour information.
          </span>
        )}
        <button className="bouton bouton-sortir ml-auto" disabled={enCours || !d?.version} onClick={imprimer}>
          <IconSend size={15} /> Imprimer
        </button>
        <button className="bouton" onClick={onClose}>Fermer</button>
      </>}>

      {erreur && (
        <div className="carte p-3 text-second text-rose-700 mb-3 flex items-start gap-1.5">
          <IconAlertTriangle size={14} className="mt-0.5 flex-none" />{erreur}
        </div>
      )}

      {d?.version?.resume_changement && (
        <div className="carte p-3 mb-3 text-sm"
          style={{ borderLeftWidth: 3, borderLeftColor: 'var(--c-attente)' }}>
          <b>Ce qui a changé dans cette version :</b> {d.version.resume_changement}
        </div>
      )}

      {d?.source_url && (
        <a href={d.source_url} target="_blank" rel="noopener noreferrer"
          className="inline-flex items-center gap-1 text-second text-iip-blue underline mb-2">
          <IconExternalLink size={13} /> Texte officiel en ligne
        </a>
      )}

      {/* LE TEXTE, TEL QU'IL A ÉTÉ PUBLIÉ.
          Mis en forme (format 'html') : il a été filtré PAR LE SERVEUR à
          l'écriture — seule une liste fermée de balises y est entrée —, on
          peut donc l'afficher tel quel. Texte brut (les versions d'avant
          2.12.91) : `pre-wrap`, on respecte les retours à la ligne. */}
      {d?.version?.format === 'parties' ? (
        <LecteurParties parties={(() => { try { return JSON.parse(d.version.contenu).parties || []; } catch { return []; } })()} />
      ) : d?.version?.format === 'html' ? (
        <div className="carte p-4 texte-corpus-cadre">
          <div className="texte-corpus"
            dangerouslySetInnerHTML={{ __html: d.version.contenu }} />
        </div>
      ) : (
        <div className="carte p-4 text-sm leading-relaxed whitespace-pre-wrap">
          {d?.version?.contenu || (erreur ? '' : 'Chargement…')}
        </div>
      )}

      {/* L'HISTORIQUE — parce qu'une personne s'est engagée sur UNE version, et
          qu'elle doit pouvoir retrouver celle qu'elle a acceptée. */}
      {d?.versions?.length > 1 && (
        <div className="mt-3 text-second text-slate-500">
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

      {publie && d && (
        <div className="mt-4 carte p-3 space-y-2">
          <div className="flex items-baseline gap-2">
            <span className="intertitre">À qui ce texte s’impose</span>
            {!roles && (
              <button className="text-second text-iip-blue underline ml-auto"
                onClick={() => setRoles(new Set(d.destinataires || []))}>Modifier</button>
            )}
          </div>
          {!roles ? (
            <div className="text-sm">
              {d.destinataires?.length ? libelleRoles(d.destinataires)
                : <span className="text-slate-500">Personne : consultable, mais pas opposable.</span>}
            </div>
          ) : (
            <>
              <CasesRoles roles={roles} onBasculer={c => setRoles(s0 => basculerDans(s0, c))} />
              <p className="text-second text-slate-500">
                Un rôle ajouté verra ce texte « à confirmer » sur son Accueil. Un rôle
                retiré n’y est plus tenu ; les confirmations déjà données restent au
                registre. Le texte ne change pas.
              </p>
              <div className="flex gap-2">
                <button className="bouton bouton-fort" disabled={enCours} onClick={enregistrerRoles}>
                  Enregistrer les destinataires
                </button>
                <button className="bouton" onClick={() => setRoles(null)}>Annuler</button>
              </div>
            </>
          )}
        </div>
      )}

      {publie && d && (
        <div className="mt-4">
          {retrait && (
            <div data-etat="corriger" className="bloc-etat px-3 py-2.5 mb-2 flex items-center gap-3 flex-wrap text-sm">
              <span className="flex-1 min-w-0">Retirer « {d.titre} » ? Il cesse de s'imposer et sort des listes. Il reste lisible, avec les confirmations déjà données.</span>
              <button className="bouton bouton-detruire" disabled={enCours} onClick={retirer}>Retirer</button>
              <button className="bouton" onClick={() => setRetrait(false)}>Annuler</button>
            </div>
          )}
          {!renomme ? (
            <div className="flex gap-2 mb-2">
              <button className="bouton text-second"
                onClick={() => setRenomme({ titre: d.titre || '', nature: d.nature || 'procedure' })}>
                Renommer
              </button>
              {!d.retire_le && !retrait && (
                <button className="bouton text-second ml-auto" onClick={() => setRetrait(true)}>
                  Retirer ce texte
                </button>
              )}
            </div>
          ) : (
            <div className="carte p-3 space-y-2 mb-2">
              <div className="intertitre">
                Renommer — le texte, les versions et les confirmations ne changent pas
              </div>
              <input value={renomme.titre}
                onChange={e => setRenomme(r0 => ({ ...r0, titre: e.target.value }))}
                placeholder="Titre du document"
                className="controle text-sm w-full" />
              <select value={renomme.nature}
                onChange={e => setRenomme(r0 => ({ ...r0, nature: e.target.value }))}
                className="controle text-sm">
                {(natures || []).map(n => (
                  <option key={n.cle} value={n.cle}>{n.libelle}</option>
                ))}
              </select>
              <div className="flex gap-2">
                <button className="bouton bouton-fort disabled:opacity-40"
                  disabled={enCours || !renomme.titre.trim()} onClick={renommer}>
                  Enregistrer
                </button>
                <button className="bouton" onClick={() => setRenomme(null)}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      )}

      {publie && (
        <div className="mt-4">
          {!nouvelle ? (
            <div className="flex flex-wrap gap-2">
              <button className="bouton text-second"
                onClick={() => setNouvelle(d?.version?.format === 'parties'
                  ? { parties: JSON.parse(d.version.contenu).parties || [], resume: '', reconfirmer: false, source: d?.source_url || '' }
                  : { contenu: d?.version?.format === 'html'
                    ? d.version.contenu : texteEnHtml(d?.version?.contenu),
                  resume: '', reconfirmer: false, source: d?.source_url || '' })}>
                Corriger — publier une nouvelle version
              </button>
              {d?.version?.format !== 'parties' && parParties.includes(d?.nature) && (
                <button className="bouton text-second" disabled={enCours} onClick={decouper}>
                  <IconListNumbers size={14} /> Réécrire par parties
                </button>)}
            </div>
          ) : (
            <div className="carte p-3 space-y-2">
              {/* UNE VERSION PUBLIÉE NE SE MODIFIE PLUS — on en publie une
                  autre, qu'on part de la précédente pour corriger. Le résumé
                  n'est pas une politesse : la version reste au dossier. */}
              <div className="intertitre">
                Version {(d?.version?.numero || 0) + 1} — partie de la version {d?.version?.numero}
              </div>
              {nouvelle.parties ? (
                <EditeurParties parties={nouvelle.parties} onChange={parties => setNouvelle(n => ({ ...n, parties }))} />
              ) : (
                <EditeurTexte valeur={nouvelle.contenu}
                  onChange={html => setNouvelle(n => ({ ...n, contenu: html }))} />)}
              <input value={nouvelle.resume}
                onChange={e => setNouvelle(n => ({ ...n, resume: e.target.value }))}
                placeholder="Ce qui change, en une phrase — obligatoire"
                className="controle text-sm w-full" />
              <input value={nouvelle.source}
                onChange={e => setNouvelle(n => ({ ...n, source: e.target.value }))}
                placeholder="Lien vers le texte officiel en ligne (facultatif) — https://…"
                className="controle text-sm w-full" />
              {/* LA CASE DE CHARLES (21 septembre 2026) : c'est celui qui
                  publie qui dit si le personnel doit relire. Décochée par
                  défaut — une date ou une adresse corrigée ne remet pas
                  quarante personnes au travail —, mais le serveur exige qu'on
                  ait répondu, et la version garde la réponse. */}
              <label className="flex items-start gap-2 text-sm p-2 rounded-champ border border-slate-200 bg-white">
                <input type="checkbox" checked={nouvelle.reconfirmer}
                  onChange={e => setNouvelle(n => ({ ...n, reconfirmer: e.target.checked }))}
                  className="w-4 h-4 mt-0.5" />
                <span>
                  <b>Les membres du personnel doivent relire et confirmer à nouveau</b>
                  <span className="block text-second text-slate-500">
                    {nouvelle.reconfirmer
                      ? 'Chaque destinataire verra ce texte réapparaître « à confirmer » sur son Accueil.'
                      : 'Correction sans nouvelle confirmation : les confirmations déjà données restent valables. La version et ce qui change restent au dossier.'}
                  </span>
                </span>
              </label>
              <div className="flex gap-2">
                <button className="bouton bouton-fort disabled:opacity-40"
                  disabled={enCours || (nouvelle.parties ? !!manqueParties(nouvelle.parties) : sansTexte(nouvelle.contenu)) || !nouvelle.resume.trim()}
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

/* ══ CONVERTIR LES TEXTES DE L'IIP PAR PARTIES, EN UN GESTE (3.1.492) ══════════
   La liste de ce qui n'est pas encore par parties, le découpage proposé pour chacun (ouvrir pour voir les parties et
   leurs points), puis une seule publication : la version suivante de chaque texte coché, sans reconfirmation. */
function ConvertirTextes({ onClose, onFait }) {
  const [textes, setTextes] = useState(null);
  const [coches, setCoches] = useState(() => new Set());
  const [ouvert, setOuvert] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [fait, setFait] = useState(null);
  useEffect(() => {
    fetch('/api/documentation/conversion', { headers: authHeaders() })
      .then(async r => { const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Lecture refusée.'); return j; })
      .then(j => { setTextes(j.textes || []); setCoches(new Set((j.textes || []).filter(t => !t.sans_titres).map(t => t.cle))); })
      .catch(e => setErreur(e.message));
  }, []);
  async function convertir() {
    setEnCours(true); setErreur(null);
    try {
      const r = await fetch('/api/documentation/conversion', { method: 'POST',
        headers: { ...authHeaders(), 'Content-Type': 'application/json' }, body: JSON.stringify({ cles: [...coches] }) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Conversion refusée.');
      setFait(j.convertis || []); await onFait?.();
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  }
  const nat = { procedure: 'Procédure', reglement: 'Règlement', note: 'Note de service' };
  return (
    <Fenetre icone={IconListNumbers} large="grande" onFermer={onClose} titre="Convertir les textes de l’IIP par parties"
      sous="Chaque texte coché est publié en version suivante, découpé à ses titres ; personne ne doit reconfirmer"
      pied={<>
        {!fait && <button className="bouton bouton-fort disabled:opacity-40" disabled={enCours || !coches.size} onClick={convertir}>
          {enCours ? 'Conversion…' : `Convertir ${coches.size} texte${coches.size > 1 ? 's' : ''}`}</button>}
        <span className="text-second text-slate-500 min-w-0">
          {fait ? `${fait.length} texte(s) convertis.` : 'Ouvrez une ligne pour voir les parties proposées.'}</span>
        <button className="bouton ml-auto" onClick={onClose}>Fermer</button>
      </>}>
      {erreur && <div className="carte p-3 text-second text-rose-700 mb-3">{erreur}</div>}
      {fait ? (
        <div className="space-y-1 text-sm">{fait.map(f => (
          <div key={f.cle} className="flex items-center gap-1.5"><IconCheck size={14} className="text-emerald-700" /> {f.titre} — version {f.version}</div>))}</div>
      ) : !textes ? <div className="text-sm text-slate-500">Lecture…</div>
        : !textes.length ? <div className="text-sm text-slate-500">Tous les textes de l’IIP sont déjà écrits par parties.</div> : (
        <div className="space-y-2">
          {textes.map(t => (
            <div key={t.cle} className="carte p-3">
              <div className="flex items-center gap-2">
                <input type="checkbox" className="w-4 h-4" checked={coches.has(t.cle)}
                  onChange={() => setCoches(c => basculerDans(c, t.cle))} />
                <button type="button" className="flex-1 min-w-0 text-left" onClick={() => setOuvert(o => (o === t.cle ? null : t.cle))}>
                  <span className="text-sm font-semibold text-iip-texte">{t.titre}</span>
                  <span className="text-second text-slate-500"> · {nat[t.nature] || t.nature}{t.refaire ? ' · déjà converti, à redécouper' : ''} · version {t.version} → {t.version + 1} · {t.parties.length} partie{t.parties.length > 1 ? 's' : ''}, {(n => `${n} point${n > 1 ? 's' : ''}`)(t.parties.reduce((n, p) => n + p.points.length, 0))}</span>
                </button>
              </div>
              {t.sans_titres && <div className="text-second mt-1" style={{ color: 'var(--c-attente)' }}>
                Aucun titre trouvé : le texte passerait en une seule partie. Mieux vaut l’ouvrir et le découper à la main (« Réécrire par parties »).</div>}
              {ouvert === t.cle && (
                <ol className="mt-2 mb-0 pl-6 text-second text-slate-600 space-y-1">
                  {t.parties.map((p, i) => (
                    <li key={i}><b className="text-iip-texte">{p.titre}</b>{p.points.filter(Boolean).length ? ` — ${p.points.filter(Boolean).join(' · ')}` : ''}</li>))}
                </ol>)}
            </div>))}
        </div>)}
    </Fenetre>
  );
}

/* ══ DÉPOSER UN TEXTE ═════════════════════════════════════════════════════ */

function DeposerTexte({ natures, parParties = [], onClose, onCree }) {
  const [titre, setTitre] = useState('');
  const [nature, setNature] = useState('procedure');
  const [contenu, setContenu] = useState('');
  const [parties, setParties] = useState(nouvellesParties);
  // UN TEXTE DE L'IIP S'ÉCRIT PAR PARTIES, DANS LUCIE (3.1.489) ; un décret, une circulaire se recopient tels quels.
  const enParties = parParties.includes(nature);
  const [source, setSource] = useState('');
  const [roles, setRoles] = useState(() => new Set());
  const [erreur, setErreur] = useState(null);
  const [enCours, setEnCours] = useState(false);

  /* À QUI LE TEXTE S'IMPOSE — PAR RÔLE, JAMAIS PAR PERSONNE. Nommer les gens un
     à un, c'est oublier celui qui arrive en octobre. Un texte sans destinataire
     reste consultable : il n'est simplement pas opposable, et c'est un choix —
     un mode d'emploi n'a pas à être accusé réception. */

  const manque = !titre.trim() ? 'Donne un titre au texte.'
    : enParties ? manqueParties(parties)
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
        body: JSON.stringify(enParties ? { contenu: pourPublier(parties), format: 'parties' } : { contenu, format: 'html' }),
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
      titre={enParties ? 'Écrire un texte' : 'Déposer un texte'}
      sous={enParties ? 'Partie par partie, dans Lucie ; publié en version 1, opposable aux rôles que vous cochez'
        : 'Il sera publié en version 1, et opposable aux rôles que vous cochez'}
      pied={<>
        <button className="bouton bouton-fort disabled:opacity-40"
          disabled={!!manque || enCours} onClick={creer}>
          {enCours ? 'Publication…' : 'Déposer et publier'}
        </button>
        <span className="text-second text-slate-500">
          {manque || (roles.size
            ? `Opposable à ${roles.size} rôle(s) — chacun devra en accuser réception.`
            : 'Aucun rôle coché : le texte sera consultable, mais pas opposable.')}
        </span>
        <button className="bouton ml-auto" onClick={onClose}>Annuler</button>
      </>}>

      {erreur && (
        <div className="carte p-3 text-second text-rose-700 mb-3">{erreur}</div>
      )}

      <div className="space-y-3">
        <div className="flex flex-wrap gap-2">
          <input value={titre} onChange={e => setTitre(e.target.value)}
            placeholder="Titre du texte — « Circulaire examens 2026-2027 »"
            className="controle text-sm flex-1 min-w-[18rem]" />
          <select value={nature} onChange={e => setNature(e.target.value)}
            className="controle text-sm">
            {natures.map(n => <option key={n.cle} value={n.cle}>{n.libelle}</option>)}
          </select>
        </div>

        <input value={source} onChange={e => setSource(e.target.value)}
          placeholder="Lien vers le texte officiel en ligne (facultatif, utile pour un décret) — https://…"
          className="controle text-sm w-full" />

        {enParties
          ? <EditeurParties parties={parties} onChange={setParties} />
          : <EditeurTexte valeur={contenu} onChange={setContenu} />}

        <div className="carte p-3 space-y-2">
          <div className="intertitre">
            À qui ce texte s’impose
          </div>
          <CasesRoles roles={roles} onBasculer={cle => setRoles(s0 => basculerDans(s0, cle))} />
          <p className="text-second text-slate-500">
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
        <span className="text-second text-slate-500">
          {r?.version ? `Version ${r.version.numero} · ${ok} sur ${nb} ont confirmé`
            : 'Aucune version publiée.'}
        </span>
        <button className="bouton ml-auto" onClick={onClose}>Fermer</button>
      </>}>

      {erreur && <div className="carte p-3 text-second text-rose-700">{erreur}</div>}

      {r?.sans_destinataire && (
        <p className="text-sm text-slate-500">
          Ce texte n’est opposé à personne : il est consultable, mais aucune
          confirmation n’est attendue.
        </p>
      )}

      <div className="space-y-1">
        {(r?.lignes || []).map(l => (
          <div key={l.id} className="carte px-3 py-1.5 flex items-center gap-3 text-sm"
            style={l.confirme_le ? undefined
              : { borderLeftWidth: 3, borderLeftColor: 'var(--c-attente)' }}>
            <span className="flex-1 min-w-0">
              {nomDuCompte(l.nom_complet, l.email)}
              <span className="text-xs text-slate-400 ml-2">{l.role}</span>
            </span>
            {/* LES DEUX TRACES SE LISENT SÉPARÉMENT : « on le lui a servi » et
                « il a confirmé » ne disent pas la même chose. */}
            <span className="text-xs text-slate-500 flex-none">
              {l.ouvert_le ? `ouvert le ${frDate(l.ouvert_le)}` : 'jamais ouvert'}
            </span>
            <span className={`text-xs flex-none ${l.confirme_le
              ? 'text-emerald-700' : 'text-iip-texte font-semibold'}`}>
              {l.confirme_le ? `confirmé le ${frDate(l.confirme_le)}` : 'non confirmé'}
            </span>
          </div>
        ))}
      </div>
    </Fenetre>
  );
}
