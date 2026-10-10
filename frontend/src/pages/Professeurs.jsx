import { ICONE_AXE } from '../lib/iconesAxes.js';
import FonctionsPanel from '../components/FonctionsPanel.jsx';
import { IconChalkboardTeacher } from '@tabler/icons-react';
import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { calculHELB, estHELB } from '../lib/helb.js';
import { nomPropre, nomDepuisChaine } from '../lib/nom.js';
import { useNavigate } from 'react-router-dom';
import { api, getAnnee, getUser, nomDoc, authHeaders } from '../lib/api.js';
import ProfFicheModal from './ProfFicheModal.jsx';
import PreviewModal from '../components/PreviewModal.jsx';
import CoursEditModal from '../components/CoursEditModal.jsx';
import { IconSend, IconAddressBook, IconMail, IconMapPin, IconFileText, IconEdit, IconDownload, IconRefresh, IconX, IconPrinter, IconPlus, IconTrash, IconKey, IconLock, IconCheck, IconBriefcase, IconTargetArrow, IconChevronDown, IconChevronRight, IconChevronLeft, IconUsers, IconSchool, IconUserPlus, IconBuilding, IconBuildingBank, IconFileDescription, IconFileImport } from '@tabler/icons-react';
import { MODULES_ACCES, ROLES_LUCIE, estDirection } from '../lib/modules.js';
import { RailLateral, OuvrirEditions, Fenetre, Encadre } from '../components/ui.jsx';
import ImportPersonnelFwb from '../components/ImportPersonnelFwb.jsx';
/* LES RUBRIQUES DE L'AXE PERSONNEL SE RENDENT DANS L'AXE, PAS AILLEURS.
   « Besoins & offres » et « Classement & prioritaires » étaient des entrées de
   ce rail qui appelaient navigate() : elles QUITTAIENT l'axe, et le rail —
   porté par l'axe — partait avec. On cliquait sur une rubrique du menu et le
   menu disparaissait. Ce ne sont pourtant pas d'autres territoires : ce sont
   deux faces du travail sur le personnel. Elles se montent donc ici, comme
   les autres. */
const Besoins = lazy(() => import('./Besoins.jsx'));
const Classement = lazy(() => import('./Classement.jsx'));
import CentreImpressionCentral from '../components/CentreImpressionCentral.jsx';

/**
 * Droit de générer un contrat de travail.
 * Doit rester aligné sur les routes backend /api/contrats/*, qui autorisent
 * roleRequired('admin', 'editeur') : le directeur adjoint (éditeur) gère les
 * contrats. Toute modification ici doit être répercutée côté serveur.
 */
function peutGenererContrat(u) {
  // Pas de droit, pas de bouton (3.1.20) : la route ET le plafond du module.
  return passeRole(['admin', 'editeur'], u) && ecritModule('personnel', u);
}

import { DossierAdmin, Absences, Entretiens, Journal } from '../components/DossierPersonnel.jsx';
import CalculateurAnciennete from '../components/CalculateurAnciennete.jsx';
import { ouvrirApercu } from '../lib/apercu.js';
import { demander, informer } from '../lib/dialogue.jsx';
import { useDroits, passeRole, ecritModule, peutGeste } from '../lib/droits.js';
import { chargerIdentite, useIdentite } from '../lib/identite.js';

/** Les champs de la fiche identité qu'on peut filtrer (clés de `champs_vides`). */
const CHAMPS_IDENTITE = [
  ['sexe', 'Sexe'], ['date_naissance', 'Date de naissance'], ['lieu_naissance', 'Lieu de naissance'],
  ['nationalite', 'Nationalité'], ['niss', 'N° de registre national'], ['etat_civil', 'État civil'],
  ['adresse', 'Adresse postale'], ['adresse_mail', 'Courriel de l’école'], ['mail_prive', 'Courriel privé'],
  ['tel_gsm', 'Téléphone'], ['iban', 'IBAN'], ['matricule', 'Matricule'], ['titres', 'Titres et diplômes'],
];

const EMPTY = {
  nom: '', prenom: '', adresse_mail: '', mail_prive: '',
  statut: '', adresse_rue: '', code_postal: '', commune: '',
  capaes: '', anciennete_25_26_po: 0,
  matricule: '', titre1: '', titre2: '', titre3: '', statut_ea12: ''
};

// Génère une feuille d'attributions imprimable (1 page par prof) et lance l'impression.
function ouvrirFeuilleImpression(data) {
  const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const fmt = (n) => Number(n || 0).toLocaleString('fr-BE', { maximumFractionDigits: 1 });
  const annee = esc(data.annee || '');

  const pages = (data.profs || []).map(p => {
    const lignes = (p.attributions || []).map(a => {
      const totLigne = (a.periodes_attribuees || 0) + (a.autonomie_attribuee || 0);
      const totHeures = Math.round(totLigne * 50 / 60 * 10) / 10;
      return `<tr>
        <td>${esc(a.section)}</td>
        <td>${esc(a.ue_num)} — ${esc(a.ue_nom)}</td>
        <td>${esc(a.nom_cours)}</td>
        <td class="c">${esc(a.quadrimestre_attribue || '')}</td>
        <td>${esc(a.activite_nom || '')}</td>
        <td class="c">${a.code && a.code !== 'Ts' ? esc(a.code) : (a.num_groupe ? esc(a.num_groupe) : '')}</td>
        <td class="c">${esc(a.type_cours || '')}</td>
        <td class="r">${fmt(a.periodes_attribuees)}</td>
        <td class="r">${fmt(a.autonomie_attribuee)}</td>
        <td class="r"><b>${fmt(totLigne)}</b> <span class="h">(${fmt(totHeures)} h)</span></td>
      </tr>`;
    }).join('');

    return `<section class="page">
      <div class="entete">
        <div class="titre">Feuille d'attributions ${annee ? '— ' + annee : ''}</div>
        <div class="prof"><b>${esc(p.nom)} ${esc(p.prenom)}</b> ${p.statut ? '<span class="badge">' + esc(p.statut) + '</span>' : ''}</div>
      </div>
      <table>
        <thead><tr>
          <th>Section</th><th>UE</th><th>Cours</th><th>Quad.</th><th>Activité</th>
          <th>Gr.</th><th>Type</th><th>Pér.</th><th>Auto.</th><th>Total (pér. / h)</th>
        </tr></thead>
        <tbody>${lignes || '<tr><td colspan="10" class="vide">Aucune attribution</td></tr>'}</tbody>
        <tfoot><tr>
          <td colspan="9" class="r"><b>TOTAL</b></td>
          <td class="r"><b>${fmt(p.total_global_periodes)} pér.</b> <span class="h">(${fmt(p.total_global_heures)} h)</span></td>
        </tr></tfoot>
      </table>
    </section>`;
  }).join('');

  const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
    <title>Feuilles d'attributions</title>
    <style>
      * { box-sizing: border-box; }
      body { font-family: Arial, sans-serif; margin: 0; color: #1a1a1a; }
      .page { padding: 18mm 14mm; page-break-after: always; }
      .page:last-child { page-break-after: auto; }
      .entete { border-bottom: 2px solid var(--c-principal); padding-bottom: 8px; margin-bottom: 14px; }
      .titre { font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: 1px; }
      .prof { font-size: 20px; margin-top: 4px; }
      .badge { font-size: 11px; background: var(--c-principal); color: #fff; padding: 2px 8px; border-radius: 10px; vertical-align: middle; margin-left: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
      thead th { background: var(--c-disponible); font-weight: bold; }
      tfoot td { background: #f0f4f8; font-size: 13px; }
      .c { text-align: center; } .r { text-align: right; }
      .h { color: #777; font-weight: normal; font-size: 11px; }
      .vide { text-align: center; color: #999; font-style: italic; }
      @media print { .page { padding: 12mm; } }
    </style></head><body>${pages}
    </body></html>`;

  const seul = (data.profs || []).length === 1 ? data.profs[0] : null;
  ouvrirApercu({
    html, titre: "Feuilles d'attributions", sousTitre: data.annee || undefined,
    nomFichier: seul ? `Attributions_${seul.nom}_${seul.prenom}` : `Attributions_${data.annee || ''}`,
    ...(seul?.id
      ? { destinataire: { type: 'professeur', id: seul.id, nom: `${seul.nom} ${seul.prenom}` } }
      : { envoiPossible: false }),
    astuceImpression: 'A4 portrait',
  });
}



// ─── Panneau « Accès Lucie » (admin) : lie un compte utilisateur à un·e membre ───

// permissions_json stocke : { attributions: {lire, ecrire, voir_tout}, personnel: {lire, ecrire}, ..., recrutement: {lire, ecrire} }
const PERM_DEFAUT = () => Object.fromEntries(MODULES_ACCES.map(m => [m.key, { lire: false, ecrire: false, voir_tout: false }]));


function AccesLuciePanel({ profId, detail }) {
  const af = (url, opts = {}) => fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}`, ...(opts.headers || {}) },
  }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erreur'); return j; });

  const [account, setAccount]   = useState(undefined);
  const [sectionsDispo, setSectionsDispo] = useState([]);
  const [profils, setProfils] = useState([]);

  // Appliquer un profil : il pose le rôle et remplit les cases, puis on
  // retouche librement. Aucun héritage — ce qui est coché fait foi.
  // Choisir un rôle coche d'emblée les cases du profil de référence qui lui
  // correspond : on part d'un ensemble cohérent, quitte à retoucher ensuite.
  function changerRole(nouveau) {
    setRole(nouveau);
    const profil = profils.find(p => p.systeme && p.role === nouveau);
    if (!profil) return;
    setPerms(() => {
      const base = PERM_DEFAUT();
      for (const [m, v] of Object.entries(profil.permissions || {})) {
        if (base[m]) base[m] = { ...base[m], ...v };
      }
      return base;
    });
  }

  async function appliquerProfil(p) {
    if (!await demander(
      `Appliquer le profil « ${p.nom} » ?\n\n${p.description || ''}\n\n`
      + `Les cases actuelles seront remplacées. Le périmètre par sections reste inchangé.`)) return;
    setRole(p.role);
    setPerms(() => {
      const base = PERM_DEFAUT();
      for (const [m, v] of Object.entries(p.permissions || {})) {
        if (base[m]) base[m] = { ...base[m], ...v };
      }
      return base;
    });
  }
  const [role, setRole]         = useState('editeur');
  const [sections, setSections] = useState([]);
  // « Toutes les sections » doit POUVOIR SE DIRE : sans ce drapeau, une liste
  // vide signifiait à la fois « tout » et « rien », et c'est « tout » qui
  // l'emportait. Trois états, et l'on peut enfin choisir le troisième.
  const [toutes, setToutes] = useState(1);
  const [perms, setPerms]       = useState(PERM_DEFAUT());
  const [pwd, setPwd]           = useState(null);
  const [busy, setBusy]         = useState(false);
  const [saved, setSaved]       = useState(false);
  const [err, setErr]           = useState('');

  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  /* L'ADRESSE DU COMPTE VIENT DE LA FICHE (Charles, 27 septembre 2026). Elle
     était FABRIQUÉE — prénom.nom@institut-prigogine.be — sans regarder la
     fiche : pour Jérôme, « jerome.vanden-eynde@… », une boîte qui n'existe
     pas, et l'invitation revenait refusée par Microsoft 365. La fiche fait
     foi ; la suggestion ne sert que si elle est vide, et le champ se corrige. */
  const emailSuggere = (detail.adresse_mail || '').trim().toLowerCase()
    || `${norm(detail.prenom)}.${norm(detail.nom)}@institut-prigogine.be`;
  const [emailCompte, setEmailCompte] = useState(emailSuggere);
  useEffect(() => { setEmailCompte(emailSuggere); }, [emailSuggere]);
  const genPwd = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; return Array.from({ length: 12 }, () => c[Math.floor(Math.random() * c.length)]).join(''); };

  function charger() {
    af('/api/users').then(list => {
      const a = (Array.isArray(list) ? list : []).find(u => u.professeur_id === profId) || null;
      setAccount(a);
      if (a) {
        setRole(a.role);
        setEmailCompte(a.email || '');
        setSections(a.sections || []);
        setToutes(a.perimetre_toutes ? 1 : 0);
        // Lire permissions_json
        const pj = a.permissions_json ? (() => { try { return JSON.parse(a.permissions_json); } catch { return {}; } })() : {};
        const merged = { ...PERM_DEFAUT() };
        for (const k of Object.keys(merged)) {
          if (pj[k]) merged[k] = { ...merged[k], ...pj[k] };
        }
        // Compat ancienne colonne acces_recrutement
        if (a.acces_recrutement && !merged.recrutement.lire) merged.recrutement.lire = true;
        setPerms(merged);
      }
    }).catch(e => { setErr(e.message); setAccount(null); });
  }

  useEffect(() => {
    charger();
    af('/api/ref/sections').then(d => setSectionsDispo(Array.isArray(d) ? d : [])).catch(() => {});
    af('/api/profils-acces').then(d => setProfils(Array.isArray(d) ? d : [])).catch(() => {});
  }, [profId]);

  async function creer() {
    setErr(''); setBusy(true);
    try {
      const p = genPwd();
      await af('/api/users', { method: 'POST', body: JSON.stringify({
        email: emailCompte.trim(), password: p, nom_complet: detail.nom_prenom, role, professeur_id: profId,
        // Le périmètre vaut pour tous les rôles, non plus pour la seule
        // coordination : un secrétariat de section, cela existe.
        sections,
        perimetre_toutes: toutes,
        permissions_json: JSON.stringify(perms),
      }) });
      setPwd(p); charger();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function sauvegarder() {
    setErr(''); setBusy(true);
    try {
      await af(`/api/users/${account.id}`, { method: 'PATCH', body: JSON.stringify({
        ...(emailCompte.trim() && emailCompte.trim() !== account.email ? { email: emailCompte.trim() } : {}),
        role, // Le périmètre vaut pour tous les rôles, non plus pour la seule
        // coordination : un secrétariat de section, cela existe.
        sections,
        perimetre_toutes: toutes,
        permissions_json: JSON.stringify(perms),
        acces_recrutement: perms.recrutement?.lire ? 1 : 0, // compat
      }) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  /* LE LIEN, PAS UN MOT DE PASSE AFFICHÉ (5 octobre 2026) : celui qui clique
     ne doit pas connaître le mot de passe d'un autre. Le même lien que
     Configuration → Accès : il fait choisir un mot de passe, il ne connecte pas. */
  const [lienRes, setLienRes] = useState(null);
  async function envoyerLien() {
    setErr(''); setBusy(true); setLienRes(null);
    try { setLienRes(await af(`/api/users/${account.id}/lien-mot-de-passe`, { method: 'POST' })); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }
  async function nouveauMdp() {
    const p = genPwd();
    setErr(''); setBusy(true);
    try { await af(`/api/users/${account.id}`, { method: 'PATCH', body: JSON.stringify({ password: p }) }); setPwd(p); }
    catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  const togglePerm = (mod, champ) => {
    setPerms(prev => ({
      ...prev,
      [mod]: { ...prev[mod], [champ]: !prev[mod][champ] },
    }));
  };

  const ModuleRow = ({ m }) => {
    const p = perms[m.key] || { lire: false, ecrire: false, voir_tout: false };
    const hasScope = ['attributions', 'personnel'].includes(m.key);
    const sectionsModule = perms[`${m.key}_sections`] || [];
    const toggleSec = (code) => setPerms(prev => ({
      ...prev,
      [`${m.key}_sections`]: (prev[`${m.key}_sections`] || []).includes(code)
        ? (prev[`${m.key}_sections`] || []).filter(x => x !== code)
        : [...(prev[`${m.key}_sections`] || []), code],
    }));
    return (
      <div className={`rounded-lg border ${p.lire || p.ecrire ? 'bg-iip-blue/5 border-iip-blue/20' : 'bg-gray-50 border-gray-100'}`}>
        <div className="flex items-center gap-2 px-3 py-2">
          <span className="text-base w-5 flex-shrink-0"><m.Icone size={14} stroke={1.6} className="text-slate-400" /></span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-700">{m.label}</div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => togglePerm(m.key, 'lire')}
              className={`text-mention px-2 py-0.5 rounded border font-medium transition ${p.lire ? 'bg-iip-blue text-white border-iip-blue' : 'border-gray-300 text-gray-400 hover:border-iip-blue'}`}>
              Lecture</button>
            <button onClick={() => togglePerm(m.key, 'ecrire')}
              className={`text-mention px-2 py-0.5 rounded border font-medium transition ${p.ecrire ? 'bg-iip-turquoise text-white border-iip-turquoise' : 'border-gray-300 text-gray-400 hover:border-iip-turquoise'}`}>
              Écriture</button>
            {hasScope && (
              <button onClick={() => togglePerm(m.key, 'voir_tout')}
                className={`text-mention px-2 py-0.5 rounded border font-medium transition ${p.voir_tout ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-300 text-gray-400 hover:border-amber-400'}`}
                title="Tout voir = toutes sections">Tout</button>
            )}
            {m.key === 'attributions' && (
              <button onClick={() => togglePerm(m.key, 'valider')}
                className={`text-mention px-2 py-0.5 rounded border font-medium transition ${p.valider ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-400 hover:border-green-500'}`}
                title="Peut valider les attributions encodées par les coordinations (direction / direction adjointe)">Valider</button>
            )}
          </div>
        </div>
        {/* Le périmètre est commun à tous les modules : il se règle une fois,
            en tête du panneau, plutôt que module par module. */}
      </div>
    );
  };

  /* ÉCRIT UNE FOIS, EMPLOYÉ DEUX FOIS — à la création du compte comme à sa
     modification. Posé dans le seul formulaire de création, le réglage
     n'existait pas là où l'on va réellement : sur un compte qui existe. */
  //
  // L'ACCÈS AUX SECTIONS SE RÈGLE ICI, ET SEULEMENT ICI. La case « Toutes les
  // sections » était cochée dès que la liste était vide : la décocher rendait
  // la même chose, et « aucun accès » n'avait aucun moyen de s'exprimer —
  // alors que c'est devenu le défaut du modèle.
  const BlocPerimetre = (
    <div className="border border-slate-200 rounded-lg p-2.5">
      <div className="text-xs text-gray-500 font-medium mb-1.5">Périmètre</div>

      {[[1, 'Toutes les sections', 'y compris celles à venir'],
        [2, 'Ces sections',        'celles cochées ci-dessous'],
        [0, 'Aucun accès',         'ne voit rien tant que rien n\u2019est donné']]
        .map(([val, titre, aide]) => {
          const actif = toutes ? val === 1 : (sections.length ? val === 2 : val === 0);
          return (
            <button key={val} type="button"
              onClick={() => {
                if (val === 1) { setToutes(1); setSections([]); }
                if (val === 0) { setToutes(0); setSections([]); }
                if (val === 2) setToutes(0);   // on ouvre la liste, on n'enregistre rien encore
              }}
              className={`w-full text-left mb-1 px-2 py-1 rounded-champ border text-second ${
                actif ? 'border-iip-blue bg-slate-50 text-iip-blue'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300'}`}>
              {titre}
              <span className="block text-mention text-slate-400 leading-tight">{aide}</span>
            </button>
          );
        })}

      {!toutes && (
        <div className="mt-1.5 pt-1.5 border-t border-slate-100">
          <div className="flex flex-wrap gap-1">
            {sectionsDispo.map(s => (
              <button key={s.code} type="button"
                onClick={() => setSections(v => v.includes(s.code)
                  ? v.filter(x => x !== s.code) : [...v, s.code])}
                className={`text-xs px-2 py-0.5 rounded-champ border transition ${
                  sections.includes(s.code)
                    ? 'bg-iip-blue text-white border-iip-blue'
                    : 'border-gray-200 text-gray-400 hover:border-iip-blue'}`}>
                {s.code}
              </button>
            ))}
          </div>
          {!sections.length && (
            <div className="mt-1.5 text-mention text-amber-700 leading-tight">
              Aucune section : ce compte ne verra rien.
            </div>
          )}
        </div>
      )}

      <p className="text-xs text-slate-500 mt-1.5">
        Le périmètre vaut pour tous les modules à la fois, et pour TOUS LES
        RÔLES — un secrétariat de section, cela existe. La direction n'est pas
        cloisonnable&nbsp;: c'est elle qui répare les erreurs de paramétrage.
      </p>
    </div>
  );

  const FormCreer = (
    <>
      <div className="text-xs text-gray-500">Aucun compte Lucie lié à ce membre.</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">E-mail de connexion</div>
          <input type="email" value={emailCompte} onChange={e => setEmailCompte(e.target.value)} disabled={busy}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white" />
          {!(detail.adresse_mail || '').trim() && <div className="text-xs text-amber-700 mt-1">La fiche ne porte pas d'adresse : celle-ci est déduite du nom, à vérifier.</div>}
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Rôle</div>
          <select value={role} onChange={e => changerRole(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
            {ROLES_LUCIE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      {profils.length > 0 && (
        <div className="border border-slate-200 rounded-lg p-2.5 bg-slate-50">
          {/* UN SEUL GESTE : LE RÔLE (Charles, 4 octobre 2026 : « pourquoi après
              on applique un rôle ? »). Les boutons « Appliquer un profil »
              répétaient le choix du rôle — chaque profil est celui d'un rôle,
              et choisir le rôle l'applique déjà. Reste ce que la fiche suit. */}
          {/* L'HÉRITAGE (30 septembre 2026) : la fiche suit le profil de
              référence de son rôle ; seules les cases qui en diffèrent sont
              propres à la personne, et elles seules survivent à une
              modification du profil dans Configuration. */}
          {(() => {
            const ref = profils.find(p => p.systeme && p.role === role);
            if (!ref) return <p className="text-xs text-slate-500 mt-1.5">Ce rôle n'a pas de profil de référence : les cases ci-dessous valent telles quelles.</p>;
            const base = ref.permissions || {};
            const ecarts = MODULES_ACCES.filter(m => ['lire', 'ecrire', 'voir_tout', 'valider']
              .some(k => (perms[m.key]?.[k] ?? false) !== (base[m.key]?.[k] ?? false)));
            return (
              <p className="text-xs text-slate-500 mt-1.5">
                Cette fiche suit le profil <b className="text-slate-700">{ref.nom}</b> : modifié dans Configuration, il met ses droits à jour.{' '}
                {ecarts.length
                  ? <>Propre à cette personne : <b className="text-slate-700">{ecarts.map(m => m.label).join(', ')}</b> —
                      ces cases ne suivent pas le profil.{' '}
                      <button type="button" className="underline" onClick={() => changerRole(role)}>Revenir au profil</button> (puis enregistrer).</>
                  : 'Aucune exception : tout vient du profil.'}
                {' '}Le périmètre par sections n'est pas touché.
              </p>
            );
          })()}
        </div>
      )}

      {BlocPerimetre}

      <div>
        <div className="text-xs text-gray-500 mb-2 font-medium">Permissions</div>
        <div className="space-y-1.5">
          {MODULES_ACCES.map(m => <ModuleRow key={m.key} m={m} />)}
        </div>
      </div>
      <button onClick={creer} disabled={busy}
        className="bouton bouton-fort w-full flex items-center justify-center gap-1.5">
        <IconPlus size={15} /> Créer l'accès &amp; générer le mot de passe
      </button>
    </>
  );

  const FormEditer = account && (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">E-mail de connexion</div>
          <input type="email" value={emailCompte} onChange={e => setEmailCompte(e.target.value)} disabled={busy}
            className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white" />
          {(detail.adresse_mail || '').trim() && account.email !== (detail.adresse_mail || '').trim().toLowerCase() && (
            <button type="button" onClick={() => setEmailCompte((detail.adresse_mail || '').trim().toLowerCase())}
              className="text-xs text-amber-700 mt-1 underline text-left">La fiche porte {detail.adresse_mail} — reprendre cette adresse</button>)}
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Rôle</div>
          <select value={role} onChange={e => changerRole(e.target.value)} disabled={busy} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
            {ROLES_LUCIE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>



      {BlocPerimetre}

      {/* Permissions modules */}
      <div>
        <div className="text-xs text-gray-500 mb-2 font-medium">Permissions par module</div>
        <div className="space-y-1.5">
          {MODULES_ACCES.map(m => <ModuleRow key={m.key} m={m} />)}
        </div>
        <div className="mt-2 text-mention text-gray-400 italic">
          "Tout voir" = accès à toutes les sections (sinon : sections autorisées seulement)
        </div>
      </div>

      {/* « RESTRICTIONS GRANULAIRES » A ÉTÉ RETIRÉ, PARCE QU'IL NE RESTREIGNAIT
          RIEN. Il écrivait dans `utilisateur_permission`, une table que quatre
          requêtes touchent — toutes dans cet écran, pour l'afficher et
          l'enregistrer. AUCUNE route métier ne la lit : ni getUserSections, ni
          peut(), ni le garde des modules. On cochait, on sauvegardait, et rien
          ne changeait.

          Quinze lignes y dormaient en production : quelqu'un a cru régler
          quelque chose. Pire, des cases grises s'y lisaient « aucun accès »
          alors qu'elles voulaient dire « aucune restriction » — l'inverse, et
          dans l'écran où l'on vient vérifier qui peut quoi.

          Le périmètre par section se règle au-dessus, et celui-là est branché.
          La TABLE est conservée : elle ne gêne pas, et la supprimer effacerait
          les quinze lignes avant qu'on ait regardé ce que leur auteur voulait. */}

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <button onClick={sauvegarder} disabled={busy}
          className={`flex-1 flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-lg font-medium ${saved ? 'bg-green-600 text-white' : 'bg-iip-blue text-white hover:opacity-90'} disabled:opacity-40`}>
          {saved ? '✓ Sauvegardé' : busy ? 'Sauvegarde…' : '✓ Sauvegarder'}
        </button>
        <button onClick={envoyerLien} disabled={busy} title="Envoyer à cette personne le lien pour choisir son mot de passe"
          className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40">
          <IconMail size={14} /> Envoyer le lien
        </button>
        {/* LE BOUTON DISAIT « RÉACTIVER » ET DÉSACTIVAIT.
            Seul le LIBELLÉ regardait l'état du compte : la question posée et
            la valeur écrite étaient figées — `confirm('Désactiver ce compte ?')`
            puis `actif: 0`, quoi qu'il arrive. Sur un compte déjà désactivé, on
            lisait « Réactiver », on s'entendait demander si l'on voulait
            désactiver, on confirmait, et rien ne changeait. Le seul chemin de
            retour ne ramenait nulle part.

            Trois choses dépendent de l'état, et non une seule : ce qu'on écrit,
            ce qu'on demande, et la couleur — rendre un accès n'est pas une
            action destructrice, elle n'a pas à être en rouge. */}
        <button onClick={async () => {
            const rendre = !account.actif;
            const question = rendre
              ? `Réactiver le compte de ${account.email} ?\n\nCette personne pourra de nouveau se connecter.`
              : `Désactiver le compte de ${account.email} ?\n\nElle ne pourra plus se connecter. Le compte reste listé et se réactive ici même.`;
            if (!await demander(question)) return;
            af(`/api/users/${account.id}`, { method: 'PATCH', body: JSON.stringify({ actif: rendre ? 1 : 0 }) })
              .then(charger).catch(e => setErr(e.message));
          }}
          className={`flex items-center gap-1.5 text-sm px-3 py-2 rounded-lg border ${account.actif
            ? 'border-red-500 text-white hover:bg-red-500'
            : 'border-emerald-500 text-white hover:bg-emerald-500'}`}>
          {account.actif ? <IconX size={14} /> : <IconKey size={14} />}
          {account.actif ? 'Désactiver' : 'Réactiver'}
        </button>
      </div>
    </>
  );

  return (
    <div className="border border-iip-turquoise/40 rounded-xl overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2.5 bg-iip-turquoise/5 border-b border-iip-turquoise/20">
        <IconLock size={16} className="text-iip-turquoise" />
        <span className="text-sm font-semibold text-iip-blue">Accès Lucie</span>
        {account && (
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-champ font-semibold ${account.actif ? 'bg-green-500 text-white' : 'bg-gray-100 text-gray-500'}`}>
            {account.actif ? 'Actif' : 'Désactivé'}
          </span>
        )}
      </div>
      <div className="p-4 space-y-3">
        {err && <div className="text-xs text-white bg-red-500 border border-red-500 rounded px-3 py-2">{err}</div>}
        {lienRes && (
          <div className="text-second text-slate-600">
            {lienRes.envoye ? `Lien envoyé à ${lienRes.email} (valable ${lienRes.duree}).`
              : <>Lien NON envoyé ({lienRes.raison}) — à transmettre : <span className="select-all break-all">{lienRes.lien}</span></>}
          </div>
        )}
        {pwd && (
          <div className="bloc-etat etat-surveiller px-3 py-2">
            <div className="text-xs font-semibold text-amber-800 flex items-center gap-1.5 mb-1"><IconKey size={14} /> Mot de passe — à noter maintenant</div>
            <div className="font-mono text-base bg-white border border-amber-200 rounded px-2 py-1 inline-block select-all mr-2">{pwd}</div>
            <button onClick={() => setPwd(null)} className="text-xs text-amber-700 hover:underline">masquer</button>
          </div>
        )}
        {account === undefined && <div className="text-xs text-gray-400">Chargement…</div>}
        {account === null && FormCreer}
        {account && FormEditer}
      </div>
    </div>
  );
}

function DetailModal({ profId, onClose, onEdit, onFiche, onEditions, restreint = false, onPrec = null, onSuiv = null, position = null }) {
  /* PASSER D'UN MEMBRE À L'AUTRE (Charles, 6 octobre 2026) : les flèches et les
     touches ← → vivent désormais dans le bandeau de la fenêtre (Fenetre,
     `navigation`), comme partout dans Lucie. */
  useDroits();
  const [detail, setDetail] = useState(null);
  const [onglet, setOnglet] = useState('attributions');
  const navigate = useNavigate();
  const u = getUser();
  const [editCours, setEditCours] = useState(null);
  const [printMenu, setPrintMenu] = useState(false);
  const [showContratModal, setShowContratModal] = useState(false);
  const [dateContrat, setDateContrat] = useState(new Date().toISOString().split('T')[0]);
  const [representant, setRepresentant] = useState('Charles Sohet, Directeur');
  const [generatingContrat, setGeneratingContrat] = useState(false);

  useEffect(() => {
    api.professeur(profId, getAnnee()).then(setDetail).catch(e => informer(e.message));
  }, [profId]);

  async function nouvelEA12() {
    try {
      const { id } = await api.ea12Create({ professeur_id: profId, annee_scolaire: getAnnee(), variante: 'bis', donnees: {} });
      navigate(`/ea12/${id}`);
    } catch (e) { informer('Erreur : ' + e.message); }
  }

  const [aperçuContrat, setAperçuContrat] = useState(null); // { html, nom }

  async function genererContrat() {
    setGeneratingContrat(true);
    try {
      // 1. Obtenir la prévisualisation HTML
      const res = await fetch('/api/contrats/apercu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ prof_id: profId, date_contrat: dateContrat, representant, annee: getAnnee() }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur serveur');
      const { html, nom, ecartees_expert } = await res.json();
      /* L'ENGAGEMENT D'EXPERT N'EST PAS CE CONTRAT-CI. Ses lignes en sont
         écartées — elles relèvent d'un autre contrat de travail — et on le
         DIT : une exclusion silencieuse ferait croire que ces périodes sont
         couvertes par la pièce qu'on s'apprête à signer. */
      setAperçuContrat({ html, nom, ecartees: ecartees_expert || [] });
      setShowContratModal(false);
    } catch (e) { informer('Erreur : ' + e.message); }
    finally { setGeneratingContrat(false); }
  }

  async function telechargerDocx() {
    setGeneratingContrat(true);
    try {
      const res = await fetch('/api/contrats/generer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ prof_id: profId, date_contrat: dateContrat, representant }),
      });
      if (!res.ok) throw new Error((await res.json()).error || 'Erreur serveur');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Contrat_${detail.nom}_${detail.prenom}_${dateContrat}.docx`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { informer('Erreur : ' + e.message); }
    finally { setGeneratingContrat(false); }
  }

  const [generatingPdf, setGeneratingPdf] = useState(false);
  async function telechargerPdf() {
    setGeneratingPdf(true);
    try {
      const res = await fetch('/api/contrats/pdf', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ prof_id: profId, date_contrat: dateContrat, representant, annee: getAnnee() }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur serveur');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = `Contrat_${detail.nom}_${detail.prenom}_${dateContrat}.pdf`;
      a.click(); URL.revokeObjectURL(url);
    } catch (e) { informer('Erreur : ' + e.message); }
    finally { setGeneratingPdf(false); }
  }

  // Un clic : génère le PDF (dates/représentant par défaut) et ouvre directement le
  // dialogue d'impression du navigateur (choix PDF ou imprimante), sans étape intermédiaire.
  const [imprimantEnCours, setImprimantEnCours] = useState(false);
  const [contratApercu, setContratApercu] = useState(null);
  async function ouvrirContratApercu() {
    setImprimantEnCours(true);
    try {
      const res = await fetch('/api/contrats/apercu', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({
          prof_id: profId,
          date_contrat: new Date().toISOString().split('T')[0],
          representant: 'Charles Sohet, Directeur',
          annee: getAnnee(),
        }),
      });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Erreur serveur');
      const j = await res.json();
      setContratApercu({ html: j.html, nom: j.nom });
    } catch (e) { informer('Erreur : ' + e.message); }
    finally { setImprimantEnCours(false); }
  }

  if (!detail) return (
    <Fenetre titre="Chargement…" large="petite" onFermer={onClose}>
      <div className="p-4 text-gray-400">Chargement…</div>
    </Fenetre>
  );

  const initiales = [(detail.prenom||'')[0], (detail.nom||'')[0]].filter(Boolean).join('').toUpperCase();
  const totalIIP  = (detail.tot_per_annee ?? 0) + (detail.tot_aut_annee ?? 0);

  // Une période vaut 50 minutes : la conversion en heures aide à se figurer
  // la charge réelle, et à la comparer aux heures HELB.
  const enHeures = per => Math.round((per || 0) * (50 / 60) * 10) / 10;

  // ETP selon la formule IIP : périodes CT ÷ 800 + périodes PP ÷ 1000,
  // autonomie comprise. La charge HELB s'y ajoute telle que calculée.
  const heuresHELB = detail.total_hrs_helb ?? 0;
  // L'ETP vient du serveur, qui l'a calculé sur l'année demandée. Le refaire
  // ici donnait un second chiffre, divergent dès que la liste d'attributions
  // n'était pas celle des totaux — et nul quand elle revenait vide.
  // La charge HELB : la même règle que la fiche globale imprimée (lib/helb.js).
  const chargeHELB = (detail.attributions || []).filter(estHELB)
    .reduce((s, a) => s + calculHELB(detail.statut_helb || null, a).charge, 0);
  const etpTotal = (() => {
    if (detail.etp_annee != null) {
      return Math.round(((detail.etp_annee || 0) + chargeHELB) * 10000) / 10000;
    }
    const attrs = (detail.attributions || []).filter(a => !estHELB(a));
    let ct = 0, pp = 0;
    for (const a of attrs) {
      // Deux routes alimentent cette fiche et ne nomment pas ces champs de la
      // même façon : l'une abrège en per/aut, l'autre garde les noms de la
      // table. Lire un seul jeu donnait un ETP nul sur des charges réelles.
      const per = a.per ?? a.periodes_attribuees ?? 0;
      const aut = a.aut ?? a.autonomie_attribuee ?? 0;
      const total = Number(per) + Number(aut);
      if (a.type_cours === 'PP') pp += total; else ct += total;   // type inconnu → CT, comme au serveur
    }
    return Math.round((ct / 800 + pp / 1000 + chargeHELB) * 10000) / 10000;
  })();

  const badge = tc => tc === 'CT'
    ? <span className="badge badge-ct">CT</span>
    : tc === 'PP' ? <span className="badge badge-pp">PP</span> : null;

  // Journal et entretiens ne font qu'un : une chronologie où l'on ajoute des
  // rendez-vous et où les événements (absence, nomination, pièces) viennent
  // se ranger d'eux-mêmes. Les documents quittent les onglets pour la colonne
  // de gauche, sous forme d'icônes.
  // « Ma fiche » d'un professeur : ses attributions, et rien d'autre.
  const ONGLETS = restreint ? [
    { key: 'attributions', label: `Attributions (${detail.attributions?.length || 0})` },
  ] : [
    { key: 'attributions', label: `Attributions (${detail.attributions?.length || 0})` },
    { key: 'dossier_admin', label: 'Dossier admin.' },
    { key: 'absences',      label: 'Absences' },
    { key: 'journal',       label: 'Journal & entretiens' },
    ...(estDirection(u) ? [
      { key: 'fonctions', label: 'Fonctions' },
      { key: 'acces',    label: 'Accès Lucie' },
      { key: 'dossiers', label: 'Disciplinaire' },
    ] : []),
  ];

  return (
    <>
    <Fenetre large="pleine" hauteurFixe onFermer={onClose}
      /* Les initiales tiennent lieu d'icône : la fenêtre passe ses propriétés
         d'icône, qu'on ignore ici. */
      icone={() => (
        <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-second flex-shrink-0">
          {initiales}
        </div>
      )}
      titre={detail.nom_prenom}
      sous={
        <span className="inline-flex items-center gap-3">
          {detail.adresse_mail && <span className="flex items-center gap-1"><IconMail size={11}/>{detail.adresse_mail}</span>}
          {detail.commune && <span className="flex items-center gap-1"><IconMapPin size={11}/>{detail.code_postal} {detail.commune}</span>}
          {detail.capaes === 'x' && <span className="bg-green-500 text-green-200 text-mention px-1.5 rounded">CAPAES</span>}
          {detail.statut && <span className="bg-white/20 text-white/90 text-mention px-1.5 rounded">{detail.statut}</span>}
        </span>
      }
      navigation={position && (onPrec || onSuiv) ? {
        position: position.i - 1, total: position.n,
        onAller: i => (i < position.i - 1 ? onPrec : onSuiv)?.(),
      } : null}
      /* L'AVION, VERS LES ÉDITIONS (Charles, 27 septembre 2026) : contrats, fiches,
         EA12 et annexes, depuis un seul endroit. */
      editions={onEditions ? () => onEditions(profId) : null}>

        {/* ── Layout 2 colonnes ──
            Chaque colonne défile pour elle-même : le contenu de la fenêtre
            ne s'étire pas, on lui donne donc la hauteur du panneau (88 vh)
            moins l'en-tête, et l'on reprend sa marge intérieure. */}
        <div className="flex -mx-5 -my-4 h-[calc(88vh-4.25rem)]">

          {/* ── Colonne gauche — identité + KPIs + actions ── */}
          <div className="w-64 flex-shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/50 overflow-auto">

            {/* Charge — du plus synthétique au plus détaillé, l'un sous l'autre */}
            <div className="p-4 space-y-2 border-b border-gray-100">
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
                <div className="text-xs text-gray-500 mb-0.5">Charge totale</div>
                <div className="text-2xl font-bold text-iip-turquoise">{etpTotal.toFixed(4)}</div>
                <div className="text-mention text-gray-400">ETP{heuresHELB > 0 ? ' — IIP + HELB' : ''}</div>
              </div>

              {/* Le DÉTAIL par type : les dénominateurs diffèrent — 800
                  périodes pour le cours technique, 1000 pour la pratique
                  professionnelle — et l'ETP ne se lit pas sans eux. Les sommes
                  incluent l'autonomie, qui compte dans la charge. */}
              {detail?.detail_etp && (
                <div className="bg-white rounded-xl border border-gray-200 px-3 py-2.5">
                  <div className="text-xs text-gray-500 mb-1.5 text-center">
                    Détail — autonomie comprise
                  </div>
                  <table className="w-full text-second">
                    <tbody>
                      {[['CT', detail.detail_etp.ct], ['PP', detail.detail_etp.pp]].map(
                        ([lib, d]) => (
                        <tr key={lib}>
                          <td className="text-gray-500">{lib}</td>
                          <td className="text-right font-semibold">{d.periodes}</td>
                          <td className="text-right text-gray-400 text-mention px-1">
                            /{d.diviseur}
                          </td>
                          <td className="text-right font-bold text-iip-blue">
                            {d.etp.toFixed(4)}
                          </td>
                        </tr>
                      ))}
                      <tr className="border-t border-gray-200">
                        <td className="text-gray-600 font-semibold pt-1">Total</td>
                        <td className="text-right font-bold pt-1">
                          {detail.detail_etp.total.periodes}
                        </td>
                        <td />
                        <td className="text-right font-bold text-iip-turquoise pt-1">
                          {detail.detail_etp.total.etp.toFixed(4)}
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 text-center">
                <div className="text-xs text-gray-500 mb-0.5">Périodes IIP</div>
                <div className="text-xl font-bold text-iip-blue">{totalIIP}</div>
                <div className="text-mention text-gray-400">
                  per. + aut. · {enHeures(totalIIP)} h
                </div>
              </div>

              {heuresHELB > 0 && (
                <div className="bg-white rounded-xl border border-gray-200 px-4 py-2.5 text-center">
                  <div className="text-xs text-gray-500 mb-0.5">Heures HELB</div>
                  <div className="text-xl font-bold text-purple-600">{heuresHELB} h</div>
                </div>
              )}

              <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 text-center">
                <div className="text-mention text-gray-400">Ancienneté PO</div>
                <div className="text-base font-bold text-gray-700">{detail.anciennete_25_26_po ?? 0}</div>
              </div>
            </div>

            {/* Fonctions & missions */}
            {detail.missions?.length > 0 && (
              <div className="p-4 border-b border-gray-100">
                <div className="text-mention font-bold text-gray-400 uppercase tracking-widest mb-2">Fonctions</div>
                <div className="space-y-1.5">
                  {detail.missions.map((m, i) => (
                    <div key={i} className="text-xs">
                      <div className="font-medium text-gray-700">{m.fonction}</div>
                      {m.section && <span className="text-mention bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mt-0.5 inline-block">{m.section}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions et documents — à portée de main, sans quitter l'onglet courant */}
            <div className="p-4 border-b border-gray-100 space-y-3">
              {((peutGeste('personnel.fiche') && ecritModule('organisation'))
                || String(getUser()?.professeur_id ?? '') === String(profId)) && (
              <button onClick={() => onEdit(detail)}
                className="w-full flex items-center gap-2 text-xs bg-slate-50 hover:bg-slate-100 text-iip-blue border border-slate-200 rounded-lg px-3 py-2 font-medium transition">
                <IconEdit size={14}/> Modifier la fiche
              </button>
              )}

              {/* Les documents ont quitté la fiche pour les Éditions (l'avion, en
                  haut à droite) : une seule porte pour imprimer et envoyer. */}
            </div>
          </div>

          {/* ── Colonne droite — onglets ── */}
          <div className="flex-1 flex flex-col min-w-0">
            {/* Onglets */}
            <div className="flex border-b border-gray-100 px-4 flex-shrink-0 bg-white">
              {ONGLETS.map(o => (
                <button key={o.key} onClick={() => setOnglet(o.key)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition -mb-px ${
                    onglet === o.key
                      ? 'border-iip-turquoise text-iip-blue'
                      : 'border-transparent text-gray-400 hover:text-gray-600'
                  }`}>
                  {o.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-auto p-4">

              {/* ── Attributions ── */}
              {onglet === 'attributions' && (
                <div>
                  {detail.attributions?.length === 0
                    ? <div className="text-sm text-gray-400 text-center py-12">Aucune attribution pour cette année.</div>
                    : (() => {
                      // Regrouper par (section, ue_num, code_cours) et sommer
                      const grouped = [];
                      const map = {};
                      for (const a of (detail.attributions || [])) {
                        const key = `${a.section}||${a.ue_num}||${a.code_cours || ''}||${estHELB(a) ? 'HELB' : 'IIP'}`;
                        if (!map[key]) {
                          map[key] = {
                            ...a,
                            periodes_total: (a.periodes_attribuees || 0) + (a.autonomie_attribuee || 0),
                            heures_helb: estHELB(a) ? Number(a.heures || 0) : 0,
                            nb_groupes: 1,
                            ids: [a.id],
                          };
                          grouped.push(map[key]);
                        } else {
                          map[key].periodes_total += (a.periodes_attribuees || 0) + (a.autonomie_attribuee || 0);
                          if (estHELB(a)) map[key].heures_helb += Number(a.heures || 0);
                          map[key].nb_groupes += 1;
                          map[key].ids.push(a.id);
                        }
                      }
                      return (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left pb-2 text-xs text-gray-400 font-medium">Contrat</th>
                              <th className="text-left pb-2 text-xs text-gray-400 font-medium">Section</th>
                              <th className="text-left pb-2 text-xs text-gray-400 font-medium">UE</th>
                              <th className="text-left pb-2 text-xs text-gray-400 font-medium">Cours</th>
                              <th className="text-left pb-2 text-xs text-gray-400 font-medium">Activité</th>
                              <th className="text-center pb-2 text-xs text-gray-400 font-medium">Type</th>
                              <th className="text-center pb-2 text-xs text-gray-400 font-medium">Gr.</th>
                              <th className="text-right pb-2 text-xs text-gray-400 font-medium">Total pér.</th>
                              <th className="text-right pb-2 text-xs text-gray-400 font-medium">Heures</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {grouped.map((a, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/80 group">
                                <td className="py-2">
                                  <span className={`inline-flex items-center justify-center px-1.5 h-5 rounded text-mention font-bold ${estHELB(a) ? 'badge-helb' : 'badge-iip'}`}>
                                    {estHELB(a) ? 'HELB' : 'IIP'}
                                  </span>
                                </td>
                                <td className="py-2 text-xs font-medium text-gray-600">{a.section}</td>
                                <td className="py-2 font-mono text-xs text-gray-400">{a.ue_num}</td>
                                <td className="py-2 text-xs max-w-[220px] truncate" title={a.nom_cours}>
                                  {a.code_cours && <span className="font-mono text-gray-400 mr-1.5">{a.code_cours}</span>}
                                  {a.nom_cours}
                                </td>
                                <td className="py-2 text-xs text-gray-400">{a.activite_nom || '—'}</td>
                                <td className="py-2 text-center">{badge(a.type_cours)}</td>
                                <td className="py-2 text-center text-xs text-gray-500">
                                  {a.nb_groupes > 1
                                    ? <span className="bg-gray-100 text-gray-600 rounded px-1.5 py-0.5 font-semibold">{a.nb_groupes}</span>
                                    : a.code || '—'}
                                </td>
                                <td className="py-2 text-right font-bold text-sm">{a.periodes_total}</td>
                                {/* Le HELB se compte en heures réelles, pas en périodes converties. */}
                                <td className={`py-2 text-right text-xs ${estHELB(a) ? 'text-purple-700 font-semibold' : 'text-gray-500'}`}
                                  title={estHELB(a) ? 'Heures HELB attribuées' : 'Périodes de 50 minutes, converties en heures'}>
                                  {estHELB(a) ? Math.round(a.heures_helb * 10) / 10 : enHeures(a.periodes_total)} h
                                </td>
                                <td className="py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="flex items-center gap-0.5">
                                    {a.code_cours && ecritModule('organisation') && passeRole(['admin', 'editeur']) && (
                                      <button title="Éditer" onClick={() => setEditCours({ section: a.section, code_cours: a.code_cours })}
                                        className="text-iip-gold hover:text-iip-amber p-1 rounded"><IconEdit size={13}/></button>
                                    )}
                                    <button title="Désattribuer tous les groupes" onClick={async () => {
                                        if (!await demander(`Retirer toutes les attributions de ${a.nom_cours} (${a.nb_groupes} groupe${a.nb_groupes>1?'s':''})?`)) return;
                                        const tok = localStorage.getItem('token');
                                        for (const id of a.ids) {
                                          await fetch(`/api/attributions/${id}/desattribuer`, { method: 'PATCH', headers: { Authorization: `Bearer ${tok}` } });
                                        }
                                        setDetail(d => ({ ...d, attributions: d.attributions.filter(x => !a.ids.includes(x.id)) }));
                                      }}
                                      className="text-orange-400 hover:text-orange-600 p-1 rounded"><IconRefresh size={13}/></button>
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      );
                    })()
                  }
                  {editCours && (
                    <CoursEditModal
                      section={editCours.section}
                      codeCours={editCours.code_cours}
                      onClose={() => setEditCours(null)}
                      onChanged={() => { setEditCours(null); api.professeur(profId, getAnnee()).then(setDetail).catch(() => {}); }}
                    />
                  )}
                </div>
              )}

              {/* ── Accès Lucie ── */}
              {onglet === 'dossier_admin' && (
                <DossierAdmin profId={profId} peutEcrire={peutGenererContrat(u)} />
              )}

              {onglet === 'absences' && (
                <Absences profId={profId} peutEcrire={peutGenererContrat(u)} />
              )}

              {onglet === 'anciennete' && (
                <CalculateurAnciennete profId={profId}
                  estAdmin={estDirection(u)}
                  peutEcrire={peutGenererContrat(u)}
                  annee={getAnnee()} />
              )}

              {onglet === 'pdcp' && (
                <div className="p-6 space-y-3">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-iip-blue">Plan de développement des compétences professionnelles</span>
                  </div>
                  <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 text-center text-sm text-slate-500">
                    <div className="font-semibold text-slate-600 mb-1">Module PDCP</div>
                    La maquette de ce module a été conçue (auto-analyse, observation en classe, plan de développement).
                    Il sera intégré ici dans un prochain cycle de développement.
                  </div>
                </div>
              )}

              {onglet === 'journal' && (
                <Journal profId={profId} peutEcrire={peutGenererContrat(u)}
                         estAdmin={estDirection(u)} />
              )}

              {onglet === 'fonctions' && estDirection(u) && (
                <FonctionsPanel profId={profId} />
              )}

              {onglet === 'acces' && estDirection(u) && (
                <AccesLuciePanel profId={profId} detail={detail} />
              )}

              {/* ── Disciplinaire ── */}
              {onglet === 'dossiers' && estDirection(u) && (
                <DossiersRH profId={profId} profNom={detail.nom_prenom} />
              )}


            </div>
          </div>
        </div>
    </Fenetre>

      {aperçuContrat && (
        <PreviewModal
          html={aperçuContrat.html}
          titre={`Contrat — ${detail.nom_prenom}`}
          sousTitre={aperçuContrat.ecartees?.length
            ? `CDD · ${getAnnee()} — ${aperçuContrat.ecartees.length} ligne(s) d'expert écartée(s) : `
              + `${aperçuContrat.ecartees.map(l => l.code_cours || l.section).join(', ')}`
              + ' — elles relèvent d\'un contrat distinct, à établir'
            : `CDD · ${getAnnee()}`}
          nomFichier={aperçuContrat.nom}
          onClose={() => setAperçuContrat(null)}
          actionExtra={
            <>
              <button onClick={telechargerPdf} disabled={generatingPdf}
                className="bouton bouton-detruire flex items-center gap-1.5">
                <IconDownload size={13}/> {generatingPdf ? '…' : 'Télécharger PDF'}
              </button>
              <button onClick={telechargerDocx} disabled={generatingContrat}
                className="bouton bouton-fort flex items-center gap-1.5">
                <IconDownload size={13}/> {generatingContrat ? '…' : 'Télécharger .docx'}
              </button>
            </>
          }
        />
      )}
      {showContratModal && (
        <Fenetre icone={IconFileText} titre="Générer le contrat de travail" large="petite"
          onFermer={() => setShowContratModal(false)}
          pied={<>
            <span />
            <button onClick={() => setShowContratModal(false)} className="bouton">Annuler</button>
            <button onClick={genererContrat} disabled={generatingContrat || !dateContrat}
              className="bouton bouton-fort">
              {generatingContrat ? 'Génération…' : <span className="inline-flex items-center gap-1.5"><IconDownload size={15}/>Télécharger .docx</span>}
            </button>
          </>}>
            <p className="text-sm text-gray-600 mb-4">Contrat CDD — <strong>{detail.nom_prenom}</strong></p>
            <div className="space-y-4">
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Date de signature</div>
                <input type="date" value={dateContrat} onChange={e => setDateContrat(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"/>
                {dateContrat && (
                  <p className="text-xs text-gray-400 mt-1">
                    {['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'][new Date(dateContrat+'T12:00').getDay()]} {new Date(dateContrat+'T12:00').toLocaleDateString('fr-BE',{day:'2-digit',month:'long',year:'numeric'})}
                  </p>
                )}
              </label>
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Représentant·e du PO</div>
                <input value={representant} onChange={e => setRepresentant(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm"/>
              </label>
            </div>
        </Fenetre>
      )}
    </>
  );

      {contratApercu && <PreviewModal html={contratApercu.html} titre="Contrat" nomFichier={contratApercu.nom} astuceImpression="Portrait A4 conseillé" onClose={() => setContratApercu(null)} />}
}



/* ══════════════════════ DOSSIERS RH ══════════════════════ */
const MOTIFS_FIN = [
  { val: 'fin_cdd',       label: 'Fin de CDD' },
  { val: 'demission',     label: 'Démission' },
  { val: 'licenciement',  label: 'Licenciement' },
  { val: 'retraite',      label: 'Départ à la retraite' },
  { val: 'mutation',      label: 'Mutation' },
  { val: 'autre',         label: 'Autre' },
];

const ETAPES_DISC = [
  { val: 'ouverture',   label: 'Ouverture du dossier',   color: '#6b7280' },
  { val: 'convocation', label: 'Convocation',             color: 'var(--c-texte)' },
  { val: 'audition',    label: 'Audition',                color: 'var(--c-texte)' },
  { val: 'decision',    label: 'Décision',                color: 'var(--c-texte)' },
  { val: 'appel',       label: 'Recours / Appel',         color: 'var(--c-texte)' },
  { val: 'cloture',     label: 'Clôture',                 color: 'var(--c-texte)' },
];

function DossiersRH({ profId, profNom }) {
  const [dossiers, setDossiers] = useState([]);
  const [loading, setLoading]   = useState(true);
  const [nouveauType, setNouveauType] = useState(null); // 'fin_contrat' | 'disciplinaire'
  const [form, setForm]         = useState({ motif: '', notes: '', date_ouverture: new Date().toISOString().split('T')[0] });
  const [etapeForm, setEtapeForm] = useState(null); // { dossier_id, type_etape, date, auteur, notes }
  const [saving, setSaving]     = useState(false);
  const tok = () => localStorage.getItem('token');

  const charger = async () => {
    setLoading(true);
    try {
      const r = await fetch(`/api/dossiers-rh/${profId}`, { headers: { Authorization: `Bearer ${tok()}` } });
      const d = await r.json();
      setDossiers(Array.isArray(d) ? d : []);
    } catch(e) { setDossiers([]); } finally { setLoading(false); }
  };

  useEffect(() => { charger(); }, [profId]);

  const creerDossier = async () => {
    setSaving(true);
    try {
      await fetch(`/api/dossiers-rh/${profId}`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: nouveauType, ...form }),
      });
      setNouveauType(null);
      setForm({ motif: '', notes: '', date_ouverture: new Date().toISOString().split('T')[0] });
      charger();
    } finally { setSaving(false); }
  };

  const ajouterEtape = async () => {
    if (!etapeForm) return;
    setSaving(true);
    try {
      await fetch(`/api/dossiers-rh/dossier/${etapeForm.dossier_id}/etapes`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${tok()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(etapeForm),
      });
      setEtapeForm(null);
      charger();
    } finally { setSaving(false); }
  };

  const supprimerDossier = async (id) => {
    if (!await demander('Supprimer définitivement ce dossier ?')) return;
    await fetch(`/api/dossiers-rh/dossier/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok()}` } });
    charger();
  };

  const supprimerEtape = async (id) => {
    await fetch(`/api/dossiers-rh/etape/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${tok()}` } });
    charger();
  };

  return (
    <div className="space-y-4">
      {/* En-tête confidentiel */}
      <div className="flex items-center justify-between">
        <div className="text-xs text-gray-400 flex items-center gap-1.5">
          <IconLock size={13} stroke={1.8} className="inline -mt-0.5 text-slate-400" /> Confidentiel — visible uniquement par les administrateurs
        </div>
        <div className="flex gap-2">
          <button onClick={() => setNouveauType('fin_contrat')}
            className="text-xs bg-red-600 text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-90 flex items-center gap-1.5">
            📋 Fin de contrat
          </button>
          <button onClick={() => setNouveauType('disciplinaire')}
            className="text-xs bg-orange-600 text-white px-3 py-1.5 rounded-lg font-medium hover:opacity-90 flex items-center gap-1.5">
            ⚠️ Dossier disciplinaire
          </button>
        </div>
      </div>

      {/* Formulaire nouveau dossier */}
      {nouveauType && (
        <div className="border-2 border-dashed border-gray-300 rounded-xl p-4 bg-gray-50">
          <div className="text-sm font-semibold text-gray-700 mb-3">
            {nouveauType === 'fin_contrat' ? '📋 Nouveau dossier fin de contrat' : '⚠️ Ouverture dossier disciplinaire'} — {profNom}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-gray-500 mb-1">Date d'ouverture</div>
              <input type="date" value={form.date_ouverture}
                onChange={e => setForm(f => ({ ...f, date_ouverture: e.target.value }))}
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5" />
            </div>
            {nouveauType === 'fin_contrat' && (
              <div>
                <div className="text-xs text-gray-500 mb-1">Motif</div>
                <select value={form.motif} onChange={e => setForm(f => ({ ...f, motif: e.target.value }))}
                  className="w-full text-sm border border-gray-300 rounded px-2 py-1.5">
                  <option value="">— choisir —</option>
                  {MOTIFS_FIN.map(m => <option key={m.val} value={m.val}>{m.label}</option>)}
                </select>
              </div>
            )}
            <div className="col-span-2">
              <div className="text-xs text-gray-500 mb-1">Notes internes</div>
              <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                rows={3} placeholder="Contexte, circonstances, remarques…"
                className="w-full text-sm border border-gray-300 rounded px-2 py-1.5 resize-none" />
            </div>
          </div>
          <div className="flex justify-end gap-2 mt-3">
            <button onClick={() => setNouveauType(null)} className="text-sm text-gray-500 px-3 py-1.5">Annuler</button>
            <button onClick={creerDossier} disabled={saving}
              className="bouton bouton-fort">
              {saving ? 'Création…' : 'Ouvrir le dossier'}
            </button>
          </div>
        </div>
      )}

      {/* Liste des dossiers */}
      {loading ? <div className="text-sm text-gray-400">Chargement…</div> :
       dossiers.length === 0 ? (
        <div className="text-sm text-gray-400 text-center py-8 border border-dashed border-gray-200 rounded-xl">
          Aucun dossier RH pour ce membre.
        </div>
      ) : (
        <div className="space-y-4">
          {dossiers.map(d => {
            const isFinContrat = d.type === 'fin_contrat';
            const motif = MOTIFS_FIN.find(m => m.val === d.motif);
            const isClos = d.statut === 'clos';
            return (
              <div key={d.id} className={`border-2 rounded-xl overflow-hidden ${isClos ? 'border-gray-200 opacity-75' : isFinContrat ? 'border-red-200' : 'border-orange-200'}`}>
                {/* En-tête dossier */}
                <div className={`flex items-center justify-between px-4 py-3 ${isFinContrat ? 'bg-red-50 border-l-4 border-l-red-500' : 'bg-orange-50'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{isFinContrat ? '📋' : '⚠️'}</span>
                    <div>
                      <div className="text-sm font-bold text-gray-800">
                        {isFinContrat ? 'Fin de contrat' : 'Dossier disciplinaire'}
                        {isClos && <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-champ">Clos</span>}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span>Ouvert le {new Date(d.date_ouverture).toLocaleDateString('fr-BE')}</span>
                        {motif && <span className="bg-red-500 text-white px-1.5 rounded">{motif.label}</span>}
                        {d.date_cloture && <span>· Clos le {new Date(d.date_cloture).toLocaleDateString('fr-BE')}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!isFinContrat && !isClos && (
                      <button onClick={() => setEtapeForm({ dossier_id: d.id, type_etape: '', date_etape: new Date().toISOString().split('T')[0], auteur: '', notes: '' })}
                        className="text-xs bg-orange-600 text-white px-2.5 py-1 rounded hover:opacity-90">
                        + Étape
                      </button>
                    )}
                    <button onClick={() => supprimerDossier(d.id)} className="text-gray-300 hover:text-red-500 p-1">
                      <IconTrash size={14} />
                    </button>
                  </div>
                </div>

                {/* Notes */}
                {d.notes && (
                  <div className="px-4 py-2 bg-white border-t border-gray-100 text-xs text-gray-600 italic">
                    {d.notes}
                  </div>
                )}

                {/* Étapes (disciplinaire) */}
                {!isFinContrat && d.etapes?.length > 0 && (
                  <div className="border-t border-gray-100">
                    {d.etapes.map((e, idx) => {
                      const etape = ETAPES_DISC.find(x => x.val === e.type_etape);
                      return (
                        <div key={e.id} className="flex items-start gap-3 px-4 py-2.5 border-b border-gray-50 last:border-0 bg-white hover:bg-gray-50 group">
                          <div className="flex-shrink-0 w-2 h-2 rounded-full mt-1.5" style={{ background: etape?.color || '#9ca3af' }} />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-semibold text-gray-700">{etape?.label || e.type_etape}</span>
                              <span className="text-xs text-gray-400">{e.date_etape ? new Date(e.date_etape).toLocaleDateString('fr-BE') : ''}</span>
                              {e.auteur && <span className="text-xs text-gray-400">— {e.auteur}</span>}
                            </div>
                            {e.notes && <div className="text-xs text-gray-500 mt-0.5 italic">{e.notes}</div>}
                          </div>
                          <button onClick={() => supprimerEtape(e.id)}
                            className="opacity-0 group-hover:opacity-100 text-gray-300 hover:text-red-400 flex-shrink-0">
                            <IconX size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Formulaire ajout étape */}
                {etapeForm?.dossier_id === d.id && (
                  <div className="border-t border-orange-200 bg-orange-50/50 px-4 py-3 space-y-2 border-l-4 border-l-orange-500">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Type d'étape</div>
                        <select value={etapeForm.type_etape}
                          onChange={e => setEtapeForm(f => ({ ...f, type_etape: e.target.value }))}
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5">
                          <option value="">— choisir —</option>
                          {ETAPES_DISC.map(e => <option key={e.val} value={e.val}>{e.label}</option>)}
                        </select>
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Date</div>
                        <input type="date" value={etapeForm.date_etape}
                          onChange={e => setEtapeForm(f => ({ ...f, date_etape: e.target.value }))}
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Auteur / Décideur</div>
                        <input value={etapeForm.auteur || ''}
                          onChange={e => setEtapeForm(f => ({ ...f, auteur: e.target.value }))}
                          placeholder="Nom, fonction"
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5" />
                      </div>
                      <div>
                        <div className="text-xs text-gray-500 mb-1">Notes</div>
                        <input value={etapeForm.notes || ''}
                          onChange={e => setEtapeForm(f => ({ ...f, notes: e.target.value }))}
                          placeholder="Résumé, décision…"
                          className="w-full text-xs border border-gray-300 rounded px-2 py-1.5" />
                      </div>
                    </div>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setEtapeForm(null)} className="text-xs text-gray-500 px-3 py-1">Annuler</button>
                      <button onClick={ajouterEtape} disabled={!etapeForm.type_etape || saving}
                        className="bouton bouton-fort">
                        {saving ? 'Ajout…' : 'Ajouter l\'étape'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

let LOGO_IIP_FICHE = ''; // l'image de l'établissement (lib/identite.js, 3.1.253)
chargerIdentite().then(i => { LOGO_IIP_FICHE = i.logo || LOGO_IIP_FICHE; });

/** CC, EXP, MDP : le statut du professeur, puis les contrats de l'année, sans doublon. */
function statutsDe(p) {
  const l = [p.statut, ...String(p.contrats_annee || '').split(',')].map(c => String(c || '').trim())
    .filter(c => ['CC', 'EXP', 'MDP'].includes(c));
  return [...new Set(l)];
}

/* « MA FICHE » : LA PAGE D'UN PROFESSEUR (5 octobre 2026 : « je ne vois
   toujours pas pour les profs leur fiche personnelle, avec leurs infos qu'ils
   peuvent modifier »). La page du Personnel chargeait la liste et des listes
   annexes rangées sous Organisation ; un compte dont la case Organisation est
   décochée était refusé avant même que sa fiche s'ouvre. Un professeur n'a
   qu'une fiche : elle s'ouvre seule, et « Modifier la fiche » envoie sa
   modification en demande, que la direction valide. */
export default function Professeurs(props) {
  const u = getUser();
  if (u?.role === 'professeur') return <MaFiche />;
  return <ProfesseursListe {...props} />;
}

function MaFiche() {
  const navigate = useNavigate();
  const [id, setId] = useState(() => Number(getUser()?.professeur_id) || null);
  const [edition, setEdition] = useState(null);
  const [cle, setCle] = useState(0);
  // La copie locale du compte peut dater d'avant le lien à la fiche : on la relit.
  useEffect(() => {
    if (id) return;
    api.me().then(d => { const p = Number(d?.user?.professeur_id); if (p) setId(p); }).catch(() => {});
  }, [id]);
  if (!id) {
    return (
      <div className="p-6 max-w-xl">
        <Encadre etat="surveiller">Votre compte Lucie n'est pas encore relié à votre fiche du personnel.
          Signalez-le au secrétariat, qui fera le lien.</Encadre>
      </div>
    );
  }
  return (
    <>
      {!edition && (
        <DetailModal key={cle} profId={id} restreint onClose={() => navigate('/accueil')}
          onEdit={p => setEdition(p)} onFiche={() => {}} />
      )}
      {edition && (
        <ProfFicheModal prof={edition} restreint onClose={() => setEdition(null)}
          onSaved={() => { setEdition(null); setCle(c => c + 1); }} />
      )}
    </>
  );
}

function ProfesseursListe({ vue: vueInitiale = 'membres' }) {
  const [editionsMembre, setEditionsMembre] = useState(null);
  const [centreImpression, setCentreImpression] = useState(false);
  const navigate = useNavigate();
  const [profs, setProfs] = useState([]);
  const [search, setSearch] = useState('');
  const [fContrat, setFContrat] = useState('');   // '' | IIP | HELB | mixte
  const [fStatut, setFStatut] = useState('');     // '' | CC | EXP (Nicolas, 27 septembre 2026)
  const [fCharge, setFCharge]   = useState('');   // '' | avec | sans
  const [fSection, setFSection] = useState('');   // '' | code section
  /* LE FILTRE « FONCTION » (3.1.32, Charles, 4 octobre 2026) remplace la page
     Configuration → Fonctions : les fonctions se règlent sur la fiche (onglet
     Fonctions), et se LISENT ici — qui est secrétaire, qui coordonne TIM. */
  const [fFonction, setFFonction] = useState('');
  const [missions, setMissions] = useState(null);   // [{ professeur_id, fonction, section_code }]
  useEffect(() => {
    fetch(`/api/ref/personnel-fonctions-annee?annee=${encodeURIComponent(getAnnee())}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null)).then(d => setMissions(Array.isArray(d) ? d : null)).catch(() => setMissions(null));
  }, []);
  const fonctionsListe = useMemo(() => [...new Set((missions || []).map(m => m.fonction).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'fr')), [missions]);
  const [fAnc, setFAnc]         = useState(false); // avec ancienneté
  /* LA FICHE IDENTITÉ, CHAMP PAR CHAMP (Charles, 7 octobre 2026) : le serveur
     rend `champs_vides` — les noms des champs vides, jamais leurs valeurs. */
  const [fChamp, setFChamp]     = useState('');      // '' | __incomplete | clé d'un champ
  const [fChampMode, setFChampMode] = useState('manquant');   // manquant | present
  const [showSansCharge, setShowSansCharge] = useState(false); // volet "à zéro" fermé par défaut
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);

  const [editProf, setEditProf] = useState(null);
  // La rubrique ouverte dans l'axe Personnel : la liste des membres, ou l'une
  // des deux faces qui s'en détachaient en emportant le rail.
  const [vue, setVue] = useState(vueInitiale);
  const [sortBy, setSortBy] = useState({ key: 'nom_prenom', dir: 'asc' });
  const [deleting, setDeleting] = useState(null);
  const [selection, setSelection] = useState(new Set());
  const [printing, setPrinting] = useState(false);
  const [printSelMenu, setPrintSelMenu] = useState(false);
  const [zipMenu, setZipMenu] = useState(false);
  const [accesLot, setAccesLot] = useState(false);   // ouvrir l'accès à Lucie aux cochés
  const [importFiches, setImportFiches] = useState(false);
  const [ficheHtml, setFicheHtml] = useState(null);
  const [ficheMenu, setFicheMenu] = useState(null);
  const [etabFooter, setEtabFooter] = useState(null);

  useEffect(() => {
    const tok = localStorage.getItem('token');
    fetch('/api/config/attestation_etab', { headers: { Authorization: `Bearer ${tok}` } })
      .then(r => r.json())
      .then(d => { try { setEtabFooter(JSON.parse(d.valeur)); } catch {} })
      .catch(() => {});
  }, []);

  // Pied de page commun aux fiches d'attributions (même identité visuelle que le contrat/attestation) :
  // logo IIP + filet doré + coordonnées, dans un vrai <tfoot> répété sur chaque page imprimée.
  const piedHtmlFiche = (() => {
    const e = etabFooter || {};
    const l1 = [e.nom, e.po ? 'PO ' + e.po : null, e.num_entreprise ? 'N° entreprise ' + e.num_entreprise : null].filter(Boolean).join(' · ');
    const l2 = [e.fase ? 'Fase ' + e.fase : null, e.adresse, e.tel ? 'T. ' + e.tel : null, e.email, e.site].filter(Boolean).join(' · ');
    const texte = e.pied_page || [l1, l2].filter(Boolean).join('<br>') || 'Institut Ilya Prigogine';
    return `<img class="logo" src="${LOGO_IIP_FICHE}" alt="Institut Ilya Prigogine"><div class="txt">${texte}</div>`;
  })();

  const me = JSON.parse(localStorage.getItem('user') || 'null');

  // Fiche HELB : heures par activité, Cours/TP, charge selon diviseurs (statut × nature)
  // Helper partagé : diviseur HELB selon statut + nature, et nature lisible d'une ligne
  const helbCalc = calculHELB;

  function genererFicheHELB(prof, attributions, annee, returnOnly = false) {
    const fmtH = n => n != null ? (Math.round(n * 10) / 10) : 0;
    const S  = 'padding:2px 6px;font-size:11px;';
    const SR = S + 'text-align:right;';
    const statut = prof.statut_helb || null;
    const statutLbl = { MA: 'Maître-Assistant', MFP: 'Maître de Formation Pratique', PI: 'Praticien', COORD: 'Coordination' }[statut] || '—';
    // Diviseur selon statut + nature (Cours/TP)
    const diviseur = (st, nature) => {
      if (st === 'COORD') return 1400;
      if (st === 'MFP') return 750;
      // MA, PI : Cours 480 / TP 750
      return nature === 'TP' ? 750 : 480;
    };

    // Regrouper par section
    const sections = {};
    for (const a of attributions) { (sections[a.section] ||= []).push(a); }

    let totHeures = 0, totCharge = 0;

    // Calcule la charge d'une ligne (heures, diviseur, charge)
    const calcLigne = (a) => {
      const h = a.heures || 0;
      const natLigne = a.helb_nature_ligne;
      const nature = natLigne === 'TP' ? 'TP'
                   : natLigne === 'CT' ? 'COURS'
                   : (a.helb_nature || (a.type_cours === 'PP' ? 'TP' : 'COURS'));
      const natureLbl = nature === 'TP' ? 'Trav. P. (TP)' : 'Théorie (TH)';
      const div = diviseur(statut, nature);
      const charge = div ? Math.round((h / div) * 1000) / 1000 : 0;
      return { h, nature, natureLbl, div, charge };
    };

    const lignes = Object.entries(sections).map(([sec, rows]) => {
      // Regrouper par cours, puis par activité, en préservant l'ordre d'apparition
      const coursOrdre = [];
      const coursMap = {};
      for (const a of rows) {
        const cc = a.code_cours || '—';
        if (!coursMap[cc]) { coursMap[cc] = { cours_nom: a.cours_nom, actsOrdre: [], actsMap: {} }; coursOrdre.push(cc); }
        const actKey = (a.activite_nom || '') + '|' + (a.activite_id ?? '');
        if (!coursMap[cc].actsMap[actKey]) { coursMap[cc].actsMap[actKey] = []; coursMap[cc].actsOrdre.push(actKey); }
        coursMap[cc].actsMap[actKey].push(a);
      }

      let i = 0;
      let html = '';
      for (const cc of coursOrdre) {
        const cours = coursMap[cc];
        let coursCharge = 0;
        const coursNat = {}; // heures par nature : { 'Théorie (TH)': 24, 'Trav. P. (TP)': 80, ... }
        for (const actKey of cours.actsOrdre) {
          const lignesAct = cours.actsMap[actKey];
          let actH = 0, actCharge = 0;
          for (const a of lignesAct) {
            const c = calcLigne(a);
            actH += c.h; actCharge += c.charge;
            totHeures += c.h; totCharge += c.charge;
            coursNat[c.natureLbl] = (coursNat[c.natureLbl] || 0) + c.h;
            html += `
              <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
                <td style="${S}color:#6b7280">${a.section}</td>
                <td style="${S}color:#374151">UE ${a.ue_num}</td>
                <td style="${S}color:#374151">${a.cours_nom || a.code_cours || '—'}${a.activite_nom ? ` <em style="color:#9ca3af">(${a.activite_nom})</em>` : ''}${a.est_rt ? ` <span style="color:#ea580c;border:1px solid #ef4444;border-radius:3px;font-size:8px;padding:0 3px;font-weight:700">RT</span>` : ''}</td>
                <td style="${SR}font-weight:600;color:${c.nature==='TP'?'#00AACC':'#1B2B4B'}">${c.natureLbl}</td>
                <td style="${SR}color:#374151">${fmtH(c.h)} h</td>
                <td style="${SR}color:#6b7280">/${c.div}</td>
                <td style="${SR}font-weight:700;border-left:1px solid #e5e7eb">${c.charge.toFixed(3)}</td>
              </tr>`;
            i++;
          }
          coursCharge += actCharge;
          // Sous-total d'activité : seulement si plusieurs lignes
          if (lignesAct.length > 1) {
            const libAct = lignesAct[0].activite_nom || 'activité';
            html += `
              <tr style="background:#fafafa">
                <td style="${S}"></td><td style="${S}"></td>
                <td style="${S}color:#9ca3af;font-style:italic;padding-left:24px">↳ Sous-total ${libAct}</td>
                <td style="${S}"></td>
                <td style="${SR}color:#6b7280;font-style:italic">${fmtH(actH)} h</td>
                <td style="${S}"></td>
                <td style="${SR}color:#6b7280;font-style:italic;border-left:1px solid #e5e7eb">${actCharge.toFixed(3)}</td>
              </tr>`;
          }
        }
        // Sous-total de cours : heures ventilées par nature (on n'additionne pas TH et TP ensemble)
        const detailNat = Object.entries(coursNat)
          .map(([lbl, h]) => `${lbl.replace(/\s*\(.*\)/,'').trim()} : ${fmtH(h)} h`)
          .join(' · ');
        html += `
          <tr style="background:#eef2ff;border-top:1px solid #c7d2fe">
            <td style="${S}"></td><td style="${S}"></td>
            <td style="${S}font-weight:700;color:#1B2B4B">Sous-total cours ${cc}${cours.cours_nom ? ` — ${cours.cours_nom}` : ''}</td>
            <td colspan="3" style="${SR}font-weight:600;color:#1B2B4B;font-size:10px">${detailNat}</td>
            <td style="${SR}font-weight:700;color:#1B2B4B;border-left:1px solid #c7d2fe">${coursCharge.toFixed(3)}</td>
          </tr>`;
      }
      return html;
    }).join('');

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111827}
        table{width:100%;border-collapse:collapse}
        td,th{border-bottom:1px solid #e5e7eb}
        @media print{@page{size:A4 landscape;margin:10mm}html,body{width:297mm}tr{page-break-inside:avoid}thead{display:table-header-group}}
        .page-table{width:100%;border-collapse:collapse}
        .page-table>tfoot{display:table-footer-group}
        .footer-iip{margin-top:6mm}
        .footer-iip .logo{height:8mm;width:auto;opacity:.9;display:block;margin-bottom:2mm}
        .footer-iip .txt{border-top:0.5pt solid var(--c-attente);padding-top:2mm;font-size:7px;color:#888;text-align:center;line-height:1.4}
      </style></head><body>
      <table class="page-table"><tbody><tr><td>
      <div style="padding:10mm">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #7c3aed;padding-bottom:8px;margin-bottom:16px">
          <div>
            <div style="font-size:9px;color:#7c3aed;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">HELB Ilya Prigogine · Fiche d'attributions (contrat HELB)</div>
            <div style="font-size:20px;font-weight:700;color:#1B2B4B">${prof.prenom} ${prof.nom}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">Statut HELB : <strong>${statutLbl}</strong></div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:600;color:#7c3aed">${annee}</div>
            <div style="font-size:9px;color:#9ca3af;margin-top:2px">Généré le ${new Date().toLocaleDateString('fr-BE')} · Lucie</div>
          </div>
        </div>
        ${!statut ? `<div style="background:#fef2f2;border:1px solid #fecaca;color:#dc2626;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px">⚠ Aucun statut HELB défini pour cette personne (MA / MFP / PI / Coordination). Les diviseurs par défaut (Cours 480 / TP 750) sont appliqués.</div>` : ''}
        <table>
          <thead>
            <tr style="background:#7c3aed;color:white">
              <th style="padding:4px 6px;text-align:left;font-size:10px">Département</th>
              <th style="padding:4px 6px;text-align:left;font-size:10px">UE</th>
              <th style="padding:4px 6px;text-align:left;font-size:10px">Cours / Activité</th>
              <th style="padding:4px 6px;text-align:right;font-size:10px">Nature</th>
              <th style="padding:4px 6px;text-align:right;font-size:10px">Heures</th>
              <th style="padding:4px 6px;text-align:right;font-size:10px">Div.</th>
              <th style="padding:4px 6px;text-align:right;font-size:10px;border-left:1px solid rgba(255,255,255,.3)">Charge</th>
            </tr>
          </thead>
          <tbody>${lignes}</tbody>
        </table>
        <div style="margin-top:16px;display:flex;justify-content:flex-end">
          <div style="background:#f5f3ff;border-radius:8px;padding:12px 20px;min-width:240px">
            <div style="font-size:10px;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Récapitulatif HELB</div>
            <table style="width:100%">
              <tr><td style="padding:2px 0;color:#374151;border:none">Total heures</td><td style="padding:2px 0;text-align:right;font-weight:600;color:#1B2B4B;border:none">${fmtH(totHeures)} h</td></tr>
              <tr style="border-top:2px solid #7c3aed">
                <td style="padding:4px 0;font-weight:700;color:#7c3aed;border:none">Charge totale</td>
                <td style="padding:4px 0;text-align:right;font-weight:700;color:#7c3aed;border:none">${(Math.round(totCharge*1000)/1000).toFixed(3)}</td>
              </tr>
            </table>
          </div>
        </div>
      </div>
      </td></tr></tbody>
      <tfoot><tr><td><div class="footer-iip">${piedHtmlFiche}</div></td></tr></tfoot>
      </table>
      </body></html>`;
    if (returnOnly) return html;
    setFicheHtml({ html, destinataire: { type: 'professeur', id: prof.id, nom: `${prof.nom || ''} ${prof.prenom || ''}`.trim() }, nom: nomDoc('Fiche_HELB', prof.nom, prof.prenom, annee), titre: `${(prof.nom || '').toUpperCase()} ${prof.prenom || ''}`.trim(), sousTitre: `Fiche HELB · ${annee}` });
  }

  // Fiche globale : bloc IIP (périodes) + bloc HELB (heures) + rectangle récap combiné
  function genererFicheGlobale(prof, attributions, nominations, bilan_nomination, annee, returnOnly = false) {
    const fmt = n => n != null ? String(n) : '0';
    const fmtH = n => n != null ? (Math.round(n * 10) / 10) : 0;
    const S  = 'padding:2px 6px;font-size:11px;';
    const SR = S + 'text-align:right;';
    const statut = prof.statut_helb || null;
    const statutLbl = { MA: 'Maître-Assistant', MFP: 'Maître de Formation Pratique', PI: 'Praticien', COORD: 'Coordination' }[statut] || null;

    const iip = attributions.filter(a => (a.contrat_mdp || 'IIP') !== 'HELB');
    const helb = attributions.filter(a => (a.contrat_mdp || 'IIP') === 'HELB');

    // ── Bloc IIP ──
    let tot_ct = 0, tot_pp = 0, tot_aut = 0;
    for (const a of iip) { if (a.type_cours === 'CT') tot_ct += a.per || 0; else tot_pp += a.per || 0; tot_aut += a.aut || 0; }
    const tot_aut_ct = iip.filter(a => a.type_cours === 'CT').reduce((s,a)=>s+(a.aut||0),0);
    const tot_aut_pp = tot_aut - tot_aut_ct;
    const etpIIP = Math.round(((tot_ct + tot_aut_ct) / 800 + (tot_pp + tot_aut_pp) / 1000) * 10000) / 10000;
    const lignesIIP = iip.map((a,i) => `
      <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
        <td style="${S}color:#6b7280">${a.section}</td>
        <td style="${S}color:#374151"><span style="display:inline-block;min-width:46px">UE ${a.ue_num}</span>${a.ue_niv ? `<span style="background:#1B2B4B;color:white;font-size:9px;padding:1px 4px;border-radius:3px">${a.ue_niv}</span>` : ''}</td>
        <td style="${S}color:#374151">${a.cours_nom || a.code_cours || '—'}${a.activite_nom ? ` <em style="color:#9ca3af">(${a.activite_nom})</em>` : ''}${a.est_rt ? ` <span style="color:#ea580c;border:1px solid #ef4444;border-radius:3px;font-size:8px;padding:0 3px;font-weight:700">RT</span>` : ''}</td>
        <td style="${SR}font-weight:600;color:${a.type_cours==='CT'?'#1B2B4B':'#00AACC'}">${a.type_cours || '—'}</td>
        <td style="${SR}color:#374151">${fmt(a.per)}</td>
        <td style="${SR}color:#6b7280">${fmt(a.aut)}</td>
        <td style="${SR}font-weight:700;border-left:1px solid #e5e7eb">${fmt((a.per||0)+(a.aut||0))}</td>
      </tr>`).join('');

    // ── Bloc HELB ──
    let totHeures = 0, totCharge = 0;
    const lignesHELB = helb.map((a,i) => {
      const c = helbCalc(statut, a);
      totHeures += c.h; totCharge += c.charge;
      return `
        <tr style="background:${i%2===0?'#fff':'#faf5ff'}">
          <td style="${S}color:#6b7280">${a.section}</td>
          <td style="${S}color:#374151">UE ${a.ue_num}</td>
          <td style="${S}color:#374151">${a.cours_nom || a.code_cours || '—'}${a.activite_nom ? ` <em style="color:#9ca3af">(${a.activite_nom})</em>` : ''}${a.est_rt ? ` <span style="color:#ea580c;border:1px solid #ef4444;border-radius:3px;font-size:8px;padding:0 3px;font-weight:700">RT</span>` : ''}</td>
          <td style="${SR}font-weight:600;color:${c.nature==='TP'?'#00AACC':'#1B2B4B'}">${c.natureLbl}</td>
          <td style="${SR}color:#374151">${fmtH(c.h)} h</td>
          <td style="${SR}color:#6b7280">/${c.div}</td>
          <td style="${SR}font-weight:700;border-left:1px solid #e5e7eb">${(Math.round(c.charge*1000)/1000).toFixed(3)}</td>
        </tr>`;
    }).join('');
    const chargeHELB = Math.round(totCharge * 10000) / 10000;
    const totalGeneral = Math.round((etpIIP + chargeHELB) * 10000) / 10000;

    const html = `<!DOCTYPE html><html><head><meta charset="utf-8">
      <style>
        *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111827}
        table{width:100%;border-collapse:collapse}
        td,th{border-bottom:1px solid #e5e7eb}
        @media print{@page{size:A4 landscape;margin:10mm}html,body{width:297mm}tr{page-break-inside:avoid}thead{display:table-header-group}}
        .page-table{width:100%;border-collapse:collapse}
        .page-table>tfoot{display:table-footer-group}
        .footer-iip{margin-top:6mm}
        .footer-iip .logo{height:8mm;width:auto;opacity:.9;display:block;margin-bottom:2mm}
        .footer-iip .txt{border-top:0.5pt solid var(--c-attente);padding-top:2mm;font-size:7px;color:#888;text-align:center;line-height:1.4}
      </style></head><body>
      <table class="page-table"><tbody><tr><td>
      <div style="padding:10mm">
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1B2B4B;padding-bottom:8px;margin-bottom:16px">
          <div>
            <div style="font-size:9px;color:#00AACC;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">Institut Ilya Prigogine · Fiche d'attributions (globale)</div>
            <div style="font-size:20px;font-weight:700;color:#1B2B4B">${prof.prenom} ${prof.nom}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">${prof.fonction || prof.statut || ''}${statutLbl ? ` · Statut HELB : ${statutLbl}` : ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:600;color:#1B2B4B">${annee}</div>
            <div style="font-size:9px;color:#9ca3af;margin-top:2px">Généré le ${new Date().toLocaleDateString('fr-BE')} · Lucie</div>
          </div>
        </div>

        ${iip.length ? `
        <div style="font-size:11px;font-weight:700;color:#1B2B4B;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Attributions IIP</div>
        <table style="margin-bottom:18px">
          <thead><tr style="background:#1B2B4B;color:white">
            <th style="padding:4px 6px;text-align:left;font-size:10px">Section</th>
            <th style="padding:4px 6px;text-align:left;font-size:10px">UE</th>
            <th style="padding:4px 6px;text-align:left;font-size:10px">Cours</th>
            <th style="padding:4px 6px;text-align:center;font-size:10px">CT/PP</th>
            <th style="padding:4px 6px;text-align:right;font-size:10px">Pér.</th>
            <th style="padding:4px 6px;text-align:right;font-size:10px">Aut.</th>
            <th style="padding:4px 6px;text-align:right;font-size:10px;border-left:1px solid rgba(255,255,255,.3)">Total</th>
          </tr></thead>
          <tbody>${lignesIIP}</tbody>
        </table>` : '<p style="color:#9ca3af;font-size:11px;margin-bottom:18px">Aucune attribution IIP.</p>'}

        ${helb.length ? `
        <div style="font-size:11px;font-weight:700;color:#7c3aed;text-transform:uppercase;letter-spacing:1px;margin-bottom:4px">Attributions HELB</div>
        <table style="margin-bottom:18px">
          <thead><tr style="background:#7c3aed;color:white">
            <th style="padding:4px 6px;text-align:left;font-size:10px">Département</th>
            <th style="padding:4px 6px;text-align:left;font-size:10px">UE</th>
            <th style="padding:4px 6px;text-align:left;font-size:10px">Cours / Activité</th>
            <th style="padding:4px 6px;text-align:right;font-size:10px">Nature</th>
            <th style="padding:4px 6px;text-align:right;font-size:10px">Heures</th>
            <th style="padding:4px 6px;text-align:right;font-size:10px">Div.</th>
            <th style="padding:4px 6px;text-align:right;font-size:10px;border-left:1px solid rgba(255,255,255,.3)">Charge</th>
          </tr></thead>
          <tbody>${lignesHELB}</tbody>
        </table>` : ''}

        <!-- Rectangle récapitulatif combiné -->
        <div style="margin-top:8px;display:flex;justify-content:flex-end">
          <div style="background:#f1f5f9;border-radius:8px;padding:14px 22px;min-width:300px;border:1px solid #cbd5e1">
            <div style="font-size:10px;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Récapitulatif général</div>
            <table style="width:100%">
              <tr><td style="padding:2px 0;color:#374151;border:none">Total périodes IIP</td><td style="padding:2px 0;text-align:right;font-weight:600;color:#1B2B4B;border:none">${fmt(tot_ct + tot_pp + tot_aut)} pér.</td><td style="padding:2px 0;text-align:right;color:#9ca3af;border:none;font-size:10px">ETP ${etpIIP.toFixed(4)}</td></tr>
              <tr><td style="padding:2px 0;color:#374151;border:none">Total heures HELB</td><td style="padding:2px 0;text-align:right;font-weight:600;color:#7c3aed;border:none">${fmtH(totHeures)} h</td><td style="padding:2px 0;text-align:right;color:#9ca3af;border:none;font-size:10px">charge ${chargeHELB.toFixed(4)}</td></tr>
              <tr style="border-top:2px solid #1B2B4B">
                <td style="padding:5px 0;font-weight:700;color:#1B2B4B;border:none">Total général (ETP)</td>
                <td colspan="2" style="padding:5px 0;text-align:right;font-weight:700;color:#00AACC;border:none">${totalGeneral.toFixed(4)}</td>
              </tr>
            </table>
          </div>
        </div>
      </div>
      </td></tr></tbody>
      <tfoot><tr><td><div class="footer-iip">${piedHtmlFiche}</div></td></tr></tfoot>
      </table>
      </body></html>`;
    if (returnOnly) return html;
    setFicheHtml({ html, destinataire: { type: 'professeur', id: prof.id, nom: `${prof.nom || ''} ${prof.prenom || ''}`.trim() }, nom: nomDoc('Fiche_globale', prof.nom, prof.prenom, annee), titre: `${(prof.nom || '').toUpperCase()} ${prof.prenom || ''}`.trim(), sousTitre: `Fiche globale · ${annee}` });
  }

  async function genererFicheAttributions(profId, contratFiltre = null, returnOnly = false) {
    const annee = getAnnee();
    const tok = localStorage.getItem('token');
    const d = await fetch(`/api/ref/professeurs/${profId}/fiche-attributions?annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());
    if (d.error) { informer(d.error); return; }

    const { prof, nominations, bilan_nomination, etp } = d;
    let attributions = d.attributions;
    if (contratFiltre) attributions = attributions.filter(a => (a.contrat_mdp || 'IIP') === contratFiltre);
    // Si on demande un type précis et que le prof n'a aucune attribution de ce type, pas de fiche
    if (contratFiltre && attributions.length === 0) {
      if (!returnOnly) informer(`Ce membre du personnel n'a aucune attribution ${contratFiltre} pour ${annee}.`);
      return null;
    }
    if (contratFiltre === 'HELB') { return genererFicheHELB(prof, attributions, annee, returnOnly); }
    if (contratFiltre === null) { return genererFicheGlobale(prof, attributions, nominations, bilan_nomination, annee, returnOnly); }

    /* LA FICHE IIP EST COMPOSÉE PAR LE SERVEUR, dans l'enveloppe commune
       (A4 portrait, en-tête de l'établissement, pied sur chaque feuille) :
       l'écran n'en dessine plus une à sa façon. */
    const q = new URLSearchParams({ annee: annee || '', contrat: contratFiltre });
    const rep = await fetch(`/api/ref/professeurs/${profId}/fiche-attributions/document?${q}`,
      { headers: { Authorization: `Bearer ${tok}` } });
    const j = await rep.json().catch(() => ({}));
    if (!rep.ok || !j.html) {
      if (!returnOnly) informer(j.error || 'Composition de la fiche échouée.');
      return null;
    }
    const html = j.html;
    if (returnOnly) return html;
    setFicheHtml({ html, destinataire: { type: 'professeur', id: prof.id, nom: `${prof.nom || ''} ${prof.prenom || ''}`.trim() }, nom: nomDoc('Fiche_attr', prof.nom, prof.prenom, annee), titre: `${(prof.nom || '').toUpperCase()} ${prof.prenom || ''}`.trim(), sousTitre: `Fiche attributions ${contratFiltre} · ${annee}`, astuce: 'A4 portrait' });
  }
  // Les fiches passent par /api/ref (module organisation) et le geste personnel.fiche.
  const droits = useDroits();
  const canEdit = droits.peut('personnel.fiche') && droits.ecrit('organisation');
  const canDelete = droits.peut('personnel.supprimer') && droits.ecrit('organisation');

  async function load() {
    setLoading(true);
    try { setProfs(await api.professeurs(true, getAnnee())); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  // Sections disponibles (dérivées des attributions des profs de l'année)
  const sectionsListe = useMemo(() => {
    const set = new Set();
    for (const p of profs) {
      (p.sections_annee || '').split(',').forEach(s => { const v = s.trim(); if (v) set.add(v); });
    }
    return [...set].sort((a, b) => a.localeCompare(b, 'fr'));
  }, [profs]);

  function toggleSort(key) {
    setSortBy(s => s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' });
  }

  function toggleSelect(id) {
    setSelection(s => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  }
  function toggleSelectAll(ids) {
    setSelection(s => s.size === ids.length ? new Set() : new Set(ids));
  }

  // Impression groupée : toutes les fiches sélectionnées dans un seul document, type au choix
  async function imprimerSelectionFiches(type, ids = null) {
    const lot = ids ? new Set(ids) : selection;
    if (lot.size === 0) return;
    setPrinting(true);
    try {
      const annee = getAnnee() || '';
      const corps = [];
      let teteIip = null;
      for (const profId of lot) {
        let html;
        if (type === 'HELB') html = await genererFicheAttributions(profId, 'HELB', true);
        else if (type === 'GLOBAL') html = await genererFicheAttributions(profId, null, true);
        else html = await genererFicheAttributions(profId, 'IIP', true);
        if (!html) continue;
        if (type !== 'HELB' && type !== 'GLOBAL' && !teteIip) {
          const ib = html.indexOf('<body>');
          if (ib > 0) teteIip = html.slice(0, ib);
        }
        // Extraire le corps : du <body> jusqu'à </body>
        const i1 = html.indexOf('<body>');
        const i2 = html.lastIndexOf('</body>');
        const corpsHtml = (i1 >= 0 && i2 > i1) ? html.slice(i1 + 6, i2) : html;
        corps.push(`<div style="page-break-after:always">${corpsHtml}</div>`);
      }
      if (corps.length === 0) { informer('Aucune fiche à imprimer pour ce type.'); setPrinting(false); return; }
      const label = type === 'GLOBAL' ? 'Globales' : type;
      /* La fiche IIP vient du serveur dans l'enveloppe commune : ses styles
         (page A4 portrait, en-tête, pied) vivent dans son <head>, qu'on
         reprend tel quel au lieu du gabarit paysage des autres fiches. */
      if (type === 'IIP' && teteIip) {
        setFicheHtml({ html: `${teteIip}<body>${corps.join('')}</body></html>`,
          nom: `Fiches_${label}_${annee}_${lot.size}profs`, astuce: 'A4 portrait' });
        return;
      }
      const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111827}
        table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb}
        @media print{@page{size:A4 landscape;margin:10mm}tr{page-break-inside:avoid}thead{display:table-header-group}}
        </style></head><body>${corps.join('')}</body></html>`;
      setFicheHtml({ html: doc, nom: `Fiches_${label}_${annee}_${lot.size}profs` });
    } catch (e) { informer('Erreur : ' + e.message); }
    finally { setPrinting(false); setPrintSelMenu(false); }
  }

  async function exporterZip(type) {
    if (selection.size === 0) return;
    setPrinting(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const annee = getAnnee() || '';
      for (const profId of selection) {
        let html;
        if (type === 'HELB') html = await genererFicheAttributions(profId, 'HELB', true);
        else if (type === 'GLOBAL') html = await genererFicheAttributions(profId, null, true);
        else html = await genererFicheAttributions(profId, 'IIP', true);
        if (!html) continue;
        const prof = profs.find(p => p.id === profId);
        const nom = [prof?.nom, prof?.prenom].filter(Boolean).join('_').replace(/\s+/g,'_') || `prof_${profId}`;
        // Ouvrir dans un iframe caché et capturer en blob PDF
        const iframe = document.createElement('iframe');
        iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:210mm;height:297mm;';
        document.body.appendChild(iframe);
        iframe.contentDocument.open();
        iframe.contentDocument.write(html);
        iframe.contentDocument.close();
        await new Promise(r => setTimeout(r, 300));
        // Utiliser l'API print-to-blob si dispo, sinon stocker le HTML
        zip.file(`Fiche_${type}_${nom}_${annee}.html`, html);
        document.body.removeChild(iframe);
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Fiches_${type}_${annee}_${selection.size}profs.zip`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { informer('Erreur ZIP : ' + e.message); }
    finally { setPrinting(false); setPrintSelMenu(false); }
  }

  // Contrats PDF de la sélection : un vrai PDF par prof (serveur), regroupés dans un ZIP.
  const [contratsZipEnCours, setContratsZipEnCours] = useState(false);
  async function exporterContratsZip() {
    if (selection.size === 0) return;
    setContratsZipEnCours(true);
    try {
      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();
      const annee = getAnnee() || '';
      const dateContrat = new Date().toISOString().split('T')[0];
      const tok = localStorage.getItem('token');
      let erreurs = 0;
      for (const profId of selection) {
        const prof = profs.find(p => p.id === profId);
        const nom = [prof?.nom, prof?.prenom].filter(Boolean).join('_').replace(/\s+/g, '_') || `prof_${profId}`;
        try {
          const res = await fetch('/api/contrats/pdf', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tok}` },
            body: JSON.stringify({ prof_id: profId, date_contrat: dateContrat, representant: 'Charles Sohet, Directeur', annee }),
          });
          if (!res.ok) { erreurs++; continue; }
          const blob = await res.blob();
          zip.file(`Contrat_${nom}_${dateContrat}.pdf`, blob);
        } catch { erreurs++; }
      }
      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Contrats_${dateContrat}_${selection.size}profs.zip`;
      a.click();
      URL.revokeObjectURL(url);
      if (erreurs > 0) informer(`${erreurs} contrat(s) n'ont pas pu être générés (voir la console pour le détail).`);
    } catch (e) { informer('Erreur : ' + e.message); }
    finally { setContratsZipEnCours(false); }
  }

  // La liste imprimable des coordonnées des membres cochés : la pièce vient du
  // serveur — la liste de l'écran ne porte ni GSM ni adresse, et c'est voulu.
  async function imprimerCoordonnees() {
    if (selection.size === 0) return;
    try {
      const rep = await fetch('/api/ref/professeurs/coordonnees', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: JSON.stringify({ ids: [...selection] }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      setFicheHtml({ html: j.html, nom: j.nom, titre: 'Coordonnées du personnel' });
    } catch (e) { informer('Erreur : ' + e.message); }
  }

  async function imprimerAttributions() {
    if (selection.size === 0) return;
    setPrinting(true);
    try {
      const ids = [...selection].join(',');
      const annee = getAnnee() || '';
      const data = await api.professeursAttributions(ids, annee);
      ouvrirFeuilleImpression(data);
    } catch (e) { informer('Erreur : ' + e.message); }
    finally { setPrinting(false); }
  }

  const charge = (p) => Number(p.total_per_annee) || 0;

  function isNew(p) {
    if (!p.date_engagement) return false;
    return (Date.now() - new Date(p.date_engagement).getTime()) < 30 * 24 * 3600 * 1000;
  }

  function isDesigner(p) {
    return `${p.nom||''} ${p.prenom||''}`.toUpperCase().includes('SIGN');
  }

  const filtered = useMemo(() => {
    let arr = [...profs];
    // Filtrage par recherche
    if (search.trim()) {
      const q = search.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      arr = arr.filter(p => {
        const hay = [p.nom_prenom, p.adresse_mail, p.commune, p.missions_libelles, p.statut]
          .filter(Boolean).join(' ').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        return hay.includes(q);
      });
    }
    // Filtre contrat — un prof est retenu dès qu'il a des attributions du type demandé.
    // HELB inclut les MDP mixtes (IIP+HELB) ; IIP idem. 'mixte' = a les deux.
    if (fStatut) arr = arr.filter(p => statutsDe(p).includes(fStatut));
    if (fContrat) {
      arr = arr.filter(p => {
        const contrats = (p.contrats_annee || '').split(',').map(c => c.trim()).filter(Boolean);
        const iip = contrats.includes('IIP');
        const helb = contrats.includes('HELB');
        if (fContrat === 'IIP') return iip;          // tous ceux qui ont de l'IIP (mixtes compris)
        if (fContrat === 'HELB') return helb;        // tous ceux qui ont du HELB (mixtes compris)
        if (fContrat === 'mixte') return iip && helb;
        return true;
      });
    }
    // Filtre charge
    if (fCharge === 'avec') arr = arr.filter(p => charge(p) > 0);
    if (fCharge === 'sans') arr = arr.filter(p => charge(p) === 0);
    // Filtre section : le prof a une attribution dans cette section
    if (fSection) arr = arr.filter(p => (p.sections_annee || '').split(',').map(s=>s.trim()).includes(fSection));
    // Filtre fonction : la personne tient cette fonction cette année (dans la section choisie, s'il y en a une).
    if (fFonction && missions) {
      const ids = new Set(missions.filter(m => m.fonction === fFonction
        && (!fSection || !m.section_code || m.section_code === fSection || m.section_code === '__ETAB__'))
        .map(m => m.professeur_id));
      arr = arr.filter(p => ids.has(p.id));
    }
    // Filtre ancienneté
    if (fAnc) arr = arr.filter(p => (Number(p.anciennete_25_26_po) || 0) > 0);
    if (fChamp) {
      const vides = p => String(p.champs_vides || '').split(',').filter(Boolean);
      arr = arr.filter(p => {
        const manque = fChamp === '__incomplete' ? vides(p).length > 0 : vides(p).includes(fChamp);
        return fChampMode === 'manquant' ? manque : !manque;
      });
    }

    if (sortBy.key) {
      arr = [...arr].sort((a, b) => {
        // Nouveaux toujours en premier
        const newA = isNew(a), newB = isNew(b);
        if (newA && !newB) return -1;
        if (!newA && newB) return 1;

        const va = a[sortBy.key], vb = b[sortBy.key];
        if (va == null && vb == null) return 0;
        if (va == null) return 1; if (vb == null) return -1;
        const na = Number(va), nb = Number(vb);
        const cmp = (!isNaN(na) && !isNaN(nb) && va !== '' && vb !== '')
          ? na - nb
          : String(va).localeCompare(String(vb), 'fr', { numeric: true, sensitivity: 'base' });
        return sortBy.dir === 'asc' ? cmp : -cmp;
      });
    }
    return arr;
  }, [profs, sortBy, search, fContrat, fStatut, fCharge, fSection, fAnc, fFonction, missions, fChamp, fChampMode]);

  // Séparation : profs avec charge (affichés) / sans charge (volet repliable)
  const avecCharge = useMemo(() => filtered.filter(p => charge(p) > 0), [filtered]);
  const sansCharge = useMemo(() => filtered.filter(p => charge(p) === 0), [filtered]);
  // Quand un filtre "sans charge" est actif, on affiche tout dans la liste principale
  const listePrincipale = fCharge === 'sans' ? filtered : avecCharge;

  async function handleDelete(p) {
    if (!await demander(`Supprimer ${p.nom_prenom} ? Cette action est irréversible.`)) return;
    setDeleting(p.id);
    try {
      await api.deleteProfesseur(p.id);
      load();
    } catch (e) { informer('Erreur : ' + e.message); }
    finally { setDeleting(null); }
  }

  function Th({ k, children, num }) {
    const arrow = sortBy.key === k ? (sortBy.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return (
      <th className={`cursor-pointer select-none hover:bg-iip-amber/10 ${num ? 'text-right' : ''}`}
        onClick={() => toggleSort(k)}>
        {children}{arrow}
      </th>
    );
  }

  function renderRow(p) {
    const designer = isDesigner(p);
    const nouveau  = isNew(p);
    return (
      <tr key={p.id} className="bg-white hover:bg-slate-50">
        <td className="text-center">
          <input type="checkbox" checked={selection.has(p.id)} onChange={() => toggleSelect(p.id)} />
        </td>
        <td className="font-medium">
          {designer ? (
            <span className="inline-flex items-center gap-2">
              {/* UN MÊME RAYON POUR TOUT — une pastille pleinement ronde ici,
                  des coins de huit partout ailleurs : c'est le genre d'écart
                  qu'on ne sait pas nommer mais qu'on voit. */}
              <span className="bg-orange-500 text-white border border-orange-500 rounded-champ px-2.5 py-0.5 text-xs font-bold">
                À désigner
              </span>
            </span>
          ) : (
            <button onClick={() => setDetailId(p.id)} className="hover:text-iip-gold hover:underline text-left flex items-center gap-2">
              {nomDepuisChaine(p.nom_prenom)}
              {/* LE PLAFOND DES EXPERTS (A.E. 26-01-1993, art. 2) : au-delà de
                  260 périodes, il faut une dérogation ; au-delà de 360, c'est hors cadre. */}
              {p.plafond_expert && (
                <span title={p.plafond_expert === 'au-dela'
                    ? `${Math.round(p.per_iip_annee)} périodes : au-delà du plafond avec dérogation (${p.plafond_valeurs?.derogation})`
                    : `${Math.round(p.per_iip_annee)} périodes : au-delà de ${p.plafond_valeurs?.plafond}, une dérogation ministérielle est nécessaire`}
                  className={`text-white text-mention font-bold px-1.5 py-0.5 rounded-champ flex-shrink-0 ${p.plafond_expert === 'au-dela' ? 'bg-red-600' : 'bg-amber-600'}`}>
                  {Math.round(p.per_iip_annee)} pér.
                </span>
              )}
              {nouveau && (
                <span className="bg-emerald-600 text-white text-mention font-bold px-1.5 py-0.5 rounded-champ uppercase tracking-wide flex-shrink-0">
                  NEW
                </span>
              )}
            </button>
          )}
        </td>
        {/* LA LISTE DIT QUI, À QUEL TITRE, POUR QUI ET OÙ — ET COMBIEN
            (Charles, 30 septembre 2026 : « nom, prénom, statut, ETP, et c'est
            tout ; si IIP badge IIP, si HELB badge HELB ; les sections où la
            personne donne cours »). Les périodes, les heures HELB et
            l'ancienneté vivent sur la fiche. */}
        <td>
          <div className="flex items-center gap-1.5 flex-wrap text-second">
            {statutsDe(p).filter(c => c !== 'MDP').map(c => (
              <span key={c} className="text-slate-700">{c === 'CC' ? 'Chargé de cours' : 'Expert'}</span>
            ))}
            {p.missions_libelles && p.missions_libelles.split(',').filter(Boolean).map((f, i) => (
              <span key={i} className="text-slate-500 border border-slate-200 rounded-champ px-1.5 py-0.5 text-xs">{f.trim()}</span>
            ))}
            {!statutsDe(p).length && !p.missions_libelles && <span className="text-slate-300">—</span>}
          </div>
        </td>
        <td>
          <div className="flex items-center gap-1">
            {String(p.contrats_annee || '').split(',').map(c => c.trim()).filter(c => c === 'IIP' || c === 'HELB').map(c => (
              <span key={c} className="rounded-champ px-2 py-0.5 text-xs font-bold text-white"
                style={{ background: c === 'HELB' ? 'var(--c-helb)' : 'var(--c-principal)' }}
                title={c === 'HELB' ? 'Attributions sous contrat HELB cette année' : 'Attributions sous contrat IIP cette année'}>{c}</span>
            ))}
          </div>
        </td>
        <td>
          <div className="flex items-center gap-1 flex-wrap">
            {String(p.sections_annee || '').split(',').map(x => x.trim()).filter(Boolean).sort((a, b) => a.localeCompare(b, 'fr')).map(x => (
              <span key={x} className="text-xs text-slate-600 border border-slate-200 rounded-champ px-1.5 py-0.5">{x}</span>
            ))}
          </div>
        </td>
        <td className="num tabular-nums" title={`IIP ${Number(p.etp_iip || 0).toLocaleString('fr-BE')} · HELB ${Number(p.etp_helb || 0).toLocaleString('fr-BE')} — CT/800 + PP/1000, comme Pilotage`}>
          <b>{(Number(p.etp_iip || 0) + Number(p.etp_helb || 0)).toLocaleString('fr-BE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</b>
          {statutsDe(p).includes('EXP') && Number(p.total_per_annee ?? 0) > 260 && (
            <span data-etat={Number(p.total_per_annee) > 360 ? 'corriger' : 'surveiller'} className="pastille-etat ml-1.5 text-mention px-1.5 py-0.5"
              title={`Expert : ${p.total_per_annee} périodes à l'IIP cette année. Plafond de 260 périodes par an (tous établissements), 360 avec la dérogation A28.`}>
              {Number(p.total_per_annee) > 360 ? '> 360 p.' : '> 260 p.'}</span>
          )}
        </td>
        <td className="text-center">
          <div className="flex items-center justify-center gap-2 relative">
            {/* L'AVION MÈNE AU CENTRE D'ÉDITION, sur ce membre (2 octobre 2026). */}
            <OuvrirEditions taille="petit" ongletInitial="personnel" membreInitial={p.id}
              titre="Fiches, contrats, EA12 — centre d'édition, sur ce membre" />
            {ficheMenu === p.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFicheMenu(null)} />
                <div className="absolute z-50 bottom-full right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-dessus py-1.5 px-1.5 w-40 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { genererFicheAttributions(p.id, null); setFicheMenu(null); }}
                    className="text-left px-2 py-1.5 h-9 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                    <span className="text-mention font-bold px-1.5 py-0.5 rounded bg-gray-700 text-white">Global</span>
                    <span className="text-gray-600 text-xs">IIP + HELB</span>
                  </button>
                  <button onClick={() => { genererFicheAttributions(p.id, 'IIP'); setFicheMenu(null); }}
                    className="text-left px-2 py-1.5 h-9 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                    <span className="text-mention font-bold px-1.5 py-0.5 rounded bg-iip-turquoise/10 text-iip-blue">IIP</span>
                    <span className="text-gray-600 text-xs">Contrat IIP</span>
                  </button>
                  <button onClick={() => { genererFicheAttributions(p.id, 'HELB'); setFicheMenu(null); }}
                    className="text-left px-2 py-1.5 h-9 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                    <span className="text-mention font-bold px-1.5 py-0.5 rounded bg-purple-500 text-white">HELB</span>
                    <span className="text-gray-600 text-xs">Contrat HELB</span>
                  </button>
                </div>
              </>
            )}
            {canEdit && (
              <button onClick={() => setEditProf(p)}
                className="text-iip-gold hover:text-iip-amber text-sm" title="Modifier"><IconEdit size={15}/></button>
            )}
            {canDelete && (
              <button onClick={() => handleDelete(p)} disabled={deleting === p.id}
                className="text-red-400 hover:text-red-600 text-sm disabled:opacity-30" title="Supprimer"><IconTrash size={15}/></button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="relative" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral impression="personnel"
        /* « NOUVEAU MEMBRE » ÉTAIT UN BLOC VERT PLEINE LARGEUR, hérité du rail
           qui s'élargissait au survol : replié, son libellé restait là,
           transparent mais présent, et aucun autre écran n'avait son pareil.
           C'est une action de l'écran — elle descend sous le filet, à la même
           place que sur tous les autres. */
        actions={[
          ...(canEdit ? [{ key: 'nouveau', label: 'Nouveau membre', icon: IconUserPlus,
            onClick: () => setEditProf({ ...EMPTY }) }] : []),
          ...(canEdit ? [{ key: 'completer', label: 'Compléter les fiches (fichiers de l’école)', icon: IconFileImport,
            onClick: () => setImportFiches(true) }] : []),
        ]}
        icon={ICONE_AXE.personnel}
        titre="Personnel"
        /* REVENIR À L'AXE, c'est revenir à sa première rubrique — la liste des
           membres, par laquelle on y entre. */
        surAccueil={() => setVue('membres')}
        sousTitre={`${filtered.length} membre${filtered.length > 1 ? 's' : ''}`}
        sections={[
          // LES FILTRES SONT PARTIS DANS LA RANGÉE DES FILTRES (voir plus bas).
          // Le rail ne porte plus que ce qui MÈNE AILLEURS : on ne confond plus
          // « restreindre la liste que je regarde » et « quitter cet écran ».
          ...((estDirection(getUser()) || getUser()?.acces_recrutement) ? [{ label: 'Engagement', items: [
            // Ordre logique : le besoin précède l'offre, qui précède le recrutement.
            { key: 'nav-besoins', label: 'Besoins & offres', icon: IconTargetArrow,
              actif: vue === 'besoins', onClick: () => setVue('besoins') },
            /* Recrutement garde sa route : c'est un écran qui monte SON rail,
               donc il ne perd pas la navigation en s'ouvrant. */
            { key: 'nav-recrutement', label: 'Recrutement', icon: IconBriefcase, actif: false, onClick: () => navigate('/recrutement') },
          ]}] : []),
          ...(estDirection(getUser()) ? [{ label: 'Carrière', items: [
            { key: 'nav-classement', label: 'Classement & prioritaires', icon: IconFileDescription,
              actif: vue === 'classement', onClick: () => setVue('classement') },
          ]}] : []),
        ]}
      />
      <div className="gouttiere-rail p-4 md:p-6">
      {/* UNE RUBRIQUE OUVERTE REMPLACE LE CONTENU, ELLE NE CHANGE PAS D'ÉCRAN.
          C'est toute la différence avec le navigate() d'avant : le rail reste,
          la rubrique ouverte est marquée dedans, et la porte de l'axe ramène à
          la liste. */}
      {vue !== 'membres' ? (
        <Suspense fallback={<div className="p-8 text-slate-400 text-sm">Chargement…</div>}>
          {vue === 'besoins' && <Besoins />}
          {vue === 'classement' && <Classement />}
        </Suspense>
      ) : (<>
      {/* UN SEUL FORMAT DE TITRE, celui de PageHeader : icône turquoise,
          dix-sept pixels, sous-titre sur la même ligne. Personnel écrivait le
          sien en vingt-quatre pixels dorés, Étudiants n'en avait pas, et huit
          autres écrans avaient chacun le leur. Ce n'est pas un détail de
          goût : c'est ce qui fait qu'on doute d'être au même endroit. */}
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="titre-ecran">
          Membres du personnel <span className="compte">· {filtered.length}</span>
        </h1>
        <div className="flex gap-2 items-center flex-wrap">
          <div className="relative">
            <input
              type="text"
              role="searchbox"
              name="recherche-personnel-no-autofill"
              placeholder="Rechercher..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="off"
              spellCheck="false"
              data-1p-ignore="true"
              data-lpignore="true"
              data-form-type="other"
              className="border border-gray-300 rounded-lg pl-3 pr-8 py-1.5 h-9 text-sm focus:outline-none focus:border-iip-gold w-48"
            />
            {search && (
              <button onClick={() => setSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">​<IconX size={13}/></button>
            )}
          </div>
          <select value={fSection} onChange={e => setFSection(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 h-9 text-sm focus:outline-none focus:border-iip-gold">
            <option value="">Toutes sections</option>
            {sectionsListe.map(s => <option key={s} value={s}>{s}</option>)}
          </select>
          {fonctionsListe.length > 0 && (
            <select value={fFonction} onChange={e => setFFonction(e.target.value)}
              title="Qui tient cette fonction cette année — elle se règle sur la fiche, onglet Fonctions"
              className="border border-gray-300 rounded-lg px-2 py-1.5 h-9 text-sm focus:outline-none focus:border-iip-gold">
              <option value="">Toutes fonctions</option>
              {fonctionsListe.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          )}
          {/* UN FILTRE N'EST PAS UNE DESTINATION.
              Le contrat et la charge occupaient sept icônes du rail — sept
              places prises, dans un rail où chaque icône doit se mériter, pour
              restreindre une liste. Ils rejoignent la rangée des filtres, où
              l'on voit d'un coup d'œil ce qui est appliqué et où « Réinitialiser »
              les remet tous à zéro d'un geste. */}
          <select value={fStatut} onChange={e => setFStatut(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 h-9 text-sm focus:outline-none focus:border-iip-gold">
            <option value="">CC et EXP</option>
            <option value="CC">CC seulement</option>
            <option value="EXP">EXP seulement</option>
          </select>
          <select value={fContrat} onChange={e => setFContrat(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 h-9 text-sm focus:outline-none focus:border-iip-gold">
            <option value="">Tous contrats</option>
            <option value="IIP">IIP seul</option>
            <option value="HELB">HELB seul</option>
            <option value="mixte">IIP + HELB</option>
          </select>
          <select value={fCharge} onChange={e => setFCharge(e.target.value)}
            className="border border-gray-300 rounded-lg px-2 py-1.5 h-9 text-sm focus:outline-none focus:border-iip-gold">
            <option value="">Toutes charges</option>
            <option value="avec">Avec charge</option>
            <option value="sans">Sans charge</option>
          </select>
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-2.5 py-1.5 h-9 cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={fAnc} onChange={e => setFAnc(e.target.checked)} />
            Avec ancienneté
          </label>
          <select value={fChamp} onChange={e => setFChamp(e.target.value)} title="Filtrer sur un champ de la fiche identité"
            className="border border-gray-300 rounded-lg px-2 py-1.5 h-9 text-sm focus:outline-none focus:border-iip-gold">
            <option value="">Fiche identité</option>
            <option value="__incomplete">Un champ au moins</option>
            {CHAMPS_IDENTITE.map(([k, lib]) => <option key={k} value={k}>{lib}</option>)}
          </select>
          {fChamp && (
            <select value={fChampMode} onChange={e => setFChampMode(e.target.value)}
              className="border border-gray-300 rounded-lg px-2 py-1.5 h-9 text-sm focus:outline-none focus:border-iip-gold">
              <option value="manquant">manquant</option>
              <option value="present">{fChamp === '__incomplete' ? 'fiche complète' : 'présent'}</option>
            </select>
          )}
          {(fContrat || fStatut || fCharge || fSection || fAnc || fFonction || fChamp) && (
            <button onClick={() => { setFContrat(''); setFStatut(''); setFCharge(''); setFSection(''); setFAnc(false); setFFonction(''); setFChamp(''); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline">Réinitialiser</button>
          )}
          {selection.size > 0 && (
            <div className="flex items-center gap-2">
              {/* Contrats PDF — un vrai PDF par prof, en ZIP.
                  « u » est l'utilisateur de la FICHE, une autre fonction : ici
                  il n'existe pas, et sélectionner une ligne faisait tomber
                  l'écran. C'est l'utilisateur connecté qu'il faut. */}
              {peutGenererContrat(getUser()) && (
                <button onClick={exporterContratsZip} disabled={contratsZipEnCours}
                  className="bg-green-700 hover:opacity-90 disabled:opacity-50 text-white text-sm px-3 py-1.5 h-9 rounded font-medium inline-flex items-center gap-1.5">
                  <IconFileText size={15}/> {contratsZipEnCours ? 'Préparation…' : `Contrats PDF (${selection.size})`}
                </button>
              )}
              {/* Imprimer — un seul PDF combiné */}
              <div className="relative">
                <button onClick={() => setPrintSelMenu(v => !v)} disabled={printing}
                  className="bg-iip-mauve hover:opacity-90 disabled:opacity-50 text-white text-sm px-3 py-1.5 h-9 rounded font-medium inline-flex items-center gap-1.5">
                  <IconPrinter size={15}/>{printing ? 'Préparation…' : `Imprimer (${selection.size})`}
                  <IconChevronDown size={12} />
                </button>
                {printSelMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPrintSelMenu(false)} />
                    <div className="absolute z-50 top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-dessus py-1.5 px-1.5 w-44 flex flex-col gap-1">
                      <div className="text-mention text-gray-400 uppercase px-2 pt-0.5 pb-1">PDF combiné</div>
                      <button onClick={() => imprimerSelectionFiches('GLOBAL')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-mention font-bold px-1.5 py-0.5 rounded bg-gray-700 text-white">Global</span><span className="text-gray-600 text-xs">IIP + HELB</span>
                      </button>
                      <button onClick={() => imprimerSelectionFiches('IIP')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-mention font-bold px-1.5 py-0.5 rounded bg-iip-turquoise/10 text-iip-blue">IIP</span><span className="text-gray-600 text-xs">Contrat IIP</span>
                      </button>
                      <button onClick={() => imprimerSelectionFiches('HELB')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-mention font-bold px-1.5 py-0.5 rounded bg-purple-500 text-white">HELB</span><span className="text-gray-600 text-xs">Contrat HELB</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* ZIP — un fichier HTML par prof */}
              <div className="relative">
                <button onClick={() => setZipMenu(v => !v)} disabled={printing}
                  className="bg-green-700 hover:opacity-90 disabled:opacity-50 text-white text-sm px-3 py-1.5 h-9 rounded font-medium inline-flex items-center gap-1.5">
                  <IconDownload size={15}/> ZIP ({selection.size})
                  <IconChevronDown size={12} />
                </button>
                {zipMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setZipMenu(false)} />
                    <div className="absolute z-50 top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-dessus py-1.5 px-1.5 w-48 flex flex-col gap-1">
                      <div className="text-mention text-gray-400 uppercase px-2 pt-0.5 pb-1">1 fichier par prof</div>
                      <button onClick={() => exporterZip('GLOBAL')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-mention font-bold px-1.5 py-0.5 rounded bg-gray-700 text-white">Global</span><span className="text-gray-600 text-xs">IIP + HELB</span>
                      </button>
                      <button onClick={() => exporterZip('IIP')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-mention font-bold px-1.5 py-0.5 rounded bg-iip-turquoise/10 text-iip-blue">IIP</span><span className="text-gray-600 text-xs">Contrat IIP</span>
                      </button>
                      <button onClick={() => exporterZip('HELB')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-mention font-bold px-1.5 py-0.5 rounded bg-purple-500 text-white">HELB</span><span className="text-gray-600 text-xs">Contrat HELB</span>
                      </button>
                    </div>
                  </>
                )}
              </div>

              {/* OUVRIR L'ACCÈS À LUCIE aux membres cochés (5 octobre 2026) :
                  compte « professeur » et lien d'invitation, simulation d'abord. */}
              {droits.peut('configuration.comptes') && (
                <button onClick={() => setAccesLot(true)}
                  className="bouton controle inline-flex items-center gap-1.5 text-sm">
                  <IconKey size={15}/> Accès Lucie ({selection.size})
                </button>
              )}
              {/* Coordonnées — la liste imprimable des emails, GSM et adresses */}
              <button onClick={imprimerCoordonnees}
                className="bouton bouton-fort inline-flex items-center gap-1.5">
                <IconAddressBook size={15}/> Coordonnées ({selection.size})
              </button>
            </div>
          )}
        </div>
      </div>

      {accesLot && <AccesLot ids={[...selection]} onFermer={() => setAccesLot(false)} />}
      {importFiches && <ImportPersonnelFwb onClose={() => setImportFiches(false)} onTermine={() => load()} />}
      {loading ? <p className="text-gray-400 p-4">Chargement…</p> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-h-[calc(100vh-180px)]">
          <table className="grid-excel-soft w-full">
            <thead>
              <tr>
                <th className="text-center" style={{ width: '32px' }}>
                  <input type="checkbox"
                    checked={filtered.length > 0 && selection.size === filtered.length}
                    onChange={() => toggleSelectAll(filtered.map(p => p.id))} />
                </th>
                <Th k="nom_prenom">Nom et prénom</Th>
                <Th k="statut">Statut</Th>
                <Th k="contrats_annee">Employeur</Th>
                <Th k="sections_annee">Sections</Th>
                <Th k="etp_iip" num>ETP</Th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {listePrincipale.map(renderRow)}
              {fCharge !== 'sans' && sansCharge.length > 0 && (
                <>
                  <tr className="bg-gray-100 cursor-pointer hover:bg-gray-200" onClick={() => setShowSansCharge(v => !v)}>
                    <td colSpan={10} className="py-2 px-3 text-sm text-gray-600 font-medium select-none">
                      <IconChevronRight size={14} className="inline-block transition-transform" style={{ transform: showSansCharge ? 'rotate(90deg)' : 'none' }} />
                      {' '}Sans charge cette année <span className="text-gray-400 font-normal">({sansCharge.length})</span>
                    </td>
                  </tr>
                  {showSansCharge && sansCharge.map(renderRow)}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}

      {detailId && (() => {
        // L'ordre de la liste affichée : les membres chargés, puis les autres.
        const ordre = [...listePrincipale, ...(fCharge === 'sans' ? [] : sansCharge)].map(p => p.id);
        const i = ordre.indexOf(detailId);
        const prec = i > 0 ? () => setDetailId(ordre[i - 1]) : null;
        const suiv = i >= 0 && i < ordre.length - 1 ? () => setDetailId(ordre[i + 1]) : null;
        return (
        <DetailModal key={detailId} profId={detailId} onClose={() => setDetailId(null)}
          onPrec={prec} onSuiv={suiv} position={i >= 0 ? { i: i + 1, n: ordre.length } : null}
          onFiche={genererFicheAttributions}
          onEditions={id => setEditionsMembre(id)}
          onEdit={p => { setDetailId(null); setEditProf(p); }} />
        );
      })()}

      </>)}

      {editProf !== null && (() => {
        // La fiche de saisie suit l'ordre de la liste, comme la fiche de consultation.
        const ordre = [...listePrincipale, ...(fCharge === 'sans' ? [] : sansCharge)];
        const i = editProf?.id ? ordre.findIndex(p => p.id === editProf.id) : -1;
        return (
        <ProfFicheModal key={editProf?.id || 'nouveau'} prof={editProf} onClose={() => setEditProf(null)}
          onPrec={i > 0 ? () => setEditProf(ordre[i - 1]) : null}
          onSuiv={i >= 0 && i < ordre.length - 1 ? () => setEditProf(ordre[i + 1]) : null}
          position={i >= 0 ? { i: i + 1, n: ordre.length } : null}
          onSaved={() => { setEditProf(null); load(); }} onEnregistre={() => load()} />
        );
      })()}
      {editionsMembre && (
        <CentreImpressionCentral ongletInitial="personnel" membreInitial={editionsMembre}
          outilsMembre={{ fiche: (id, filtre) => { setEditionsMembre(null); genererFicheAttributions(id, filtre); },
            fichesLot: (ids, type) => { setEditionsMembre(null); imprimerSelectionFiches(type, ids); } }}
          onClose={() => setEditionsMembre(null)} />
      )}
      {ficheHtml && <PreviewModal html={ficheHtml.html||ficheHtml} titre={ficheHtml.titre || "Fiche d'attributions"} sousTitre={ficheHtml.sousTitre} nomFichier={ficheHtml.nom}
        destinataire={ficheHtml.destinataire || null} typeDoc="fiche_attributions"
        sujetMail={ficheHtml.sousTitre ? `${ficheHtml.sousTitre} — Institut Ilya Prigogine` : null}
        astuceImpression={ficheHtml.astuce ?? undefined}
        onClose={() => setFicheHtml(null)} />}
      </div>
    </div>
  );
}



/* OUVRIR L'ACCÈS À LUCIE EN LOT (3.1.62, Charles, 5 octobre 2026). La
   simulation dit, ligne par ligne, qui reçoit un compte « professeur » et à
   quelle adresse (école, sinon privée), qui en a déjà un — et n'est pas touché —,
   et qui reste de côté faute d'adresse. Puis les comptes se créent et le lien
   part, le même que celui des Comptes : il fait choisir un mot de passe. */
function AccesLot({ ids, onFermer }) {
  const [r, setR] = useState(null);
  const [fait, setFait] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const [renvoyer, setRenvoyer] = useState(false);
  const appeler = async (simulation, renv = renvoyer) => {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch('/api/users/acces-lot', { method: 'POST', headers: authHeaders(),
        body: JSON.stringify({ professeur_ids: ids, simulation, renvoyer_jamais_connectes: renv }) });
      const j = await rep.json().catch(() => ({}));
      if (!rep.ok) throw new Error(j.error || `Erreur ${rep.status}`);
      setR(j); if (!simulation) setFait(true);
    } catch (e) { setErreur(e.message); } finally { setEnCours(false); }
  };
  useEffect(() => { appeler(true); /* eslint-disable-next-line */ }, []);
  const ETAT = { renvoi: 'Déjà un compte, jamais connecté — le lien est renvoyé', nouveau: 'Nouveau compte', deja: 'Déjà un compte — pas touché', sans_adresse: 'Aucune adresse — à compléter dans la fiche', adresse_prise: 'Adresse déjà prise par un autre compte' };
  const n = (r?.resume?.nouveaux || 0) + (r?.resume?.renvois || 0);
  return (
    <Fenetre titre="Ouvrir l'accès à Lucie" large="grande" onFermer={onFermer}
      sous={fait ? 'Fait — les comptes sont créés' : `${ids.length} membre(s) coché(s) — rien n'est écrit avant de confirmer`}
      pied={<>
        <span className="flex-1 min-w-0 text-second text-slate-500">
          {fait ? `${r.resume.envoyes} lien(s) envoyé(s) sur ${n}.`
            : r ? `${r.resume.nouveaux} compte(s) « professeur » à créer${r.resume.renvois ? `, ${r.resume.renvois} lien(s) à renvoyer` : ''} ; chacun recevra le lien pour choisir son mot de passe (valable trois jours).` : ''}
        </span>
        <button className="bouton" onClick={onFermer}>{fait ? 'Fermer' : 'Annuler'}</button>
        {!fait && <button className="bouton bouton-fort" disabled={enCours || !n} onClick={() => appeler(false)}>
          {enCours ? '…' : r?.resume?.nouveaux ? `Créer ${r.resume.nouveaux} compte(s) et envoyer ${n} lien(s)` : `Envoyer ${n} lien(s)`}</button>}
      </>}>
      {erreur && <div data-etat="corriger" className="bloc-etat px-3 py-2 mb-2 text-sm">{erreur}</div>}
      {!r ? <p className="text-sm text-slate-400">Vérification…</p> : (
        <div className="space-y-2 text-sm">
          <div className="text-second text-slate-600">
            {r.resume.nouveaux} nouveau(x) · {r.resume.deja} déjà un compte · {r.resume.sans_adresse} sans adresse
            {r.resume.adresse_prise ? ` · ${r.resume.adresse_prise} adresse déjà prise` : ''}
          </div>
          {/* RENVOYER LE LIEN (5 octobre 2026) : un compte créé dont le premier
              lien s'est perdu — une faute dans l'adresse, un courriel égaré. */}
          {!fait && (r.resume.jamais_connectes > 0 || r.resume.renvois > 0) && (
            <label className="flex items-center gap-2 text-second">
              <input type="checkbox" checked={renvoyer} disabled={enCours}
                onChange={e => { setRenvoyer(e.target.checked); appeler(true, e.target.checked); }} />
              Renvoyer le lien à ceux qui ont déjà un compte mais ne se sont jamais connectés
              ({r.resume.jamais_connectes + r.resume.renvois}) — leur compte n'est pas touché
            </label>
          )}
          <div className="border border-slate-200 rounded-carte overflow-hidden">
            <table className="w-full text-second">
              <thead><tr className="tab-entete text-left text-mention uppercase tracking-[.08em] text-slate-500">
                <th className="px-3 py-1.5">Membre</th><th className="px-3 py-1.5">Adresse</th><th className="px-3 py-1.5">Ce qui se passe</th></tr></thead>
              <tbody>
                {r.lignes.map(l => (
                  <tr key={l.professeur_id} className="border-t border-slate-100 align-top">
                    <td className="px-3 py-1.5 font-semibold">{l.nom}</td>
                    <td className="px-3 py-1.5">{l.email || '—'}{l.prive && <span className="ml-1 text-xs text-slate-500">(privée)</span>}</td>
                    <td className="px-3 py-1.5">
                      {fait && (l.etat === 'nouveau' || l.etat === 'renvoi')
                        ? (l.envoye ? (l.etat === 'renvoi' ? 'Lien renvoyé' : 'Compte créé, lien envoyé') : <span>Compte créé — lien NON envoyé ({l.raison}) : <span className="select-all break-all text-xs text-slate-500">{l.lien}</span></span>)
                        : <span className={l.etat === 'nouveau' || l.etat === 'renvoi' ? '' : 'text-slate-500'}>{ETAT[l.etat]}{l.etat === 'deja' && l.role ? ` (${l.role}${l.actif ? '' : ', désactivé'}${l.jamais_connecte ? ', jamais connecté' : ''})` : ''}{l.etat === 'adresse_prise' && l.par ? ` : ${l.par}` : ''}</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Fenetre>
  );
}
