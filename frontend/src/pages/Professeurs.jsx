import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAnnee, getUser, nomDoc } from '../lib/api.js';
import ProfFicheModal from './ProfFicheModal.jsx';
import PreviewModal from '../components/PreviewModal.jsx';
import CoursEditModal from '../components/CoursEditModal.jsx';
import { IconMail, IconMapPin, IconFileText, IconEdit, IconDownload, IconRefresh, IconX, IconPrinter, IconPlus, IconTrash, IconKey, IconLock, IconCheck, IconBriefcase, IconChevronDown, IconChevronRight, IconUsers, IconSchool, IconUserPlus, IconBuilding, IconBuildingBank, IconFileDescription } from '@tabler/icons-react';
import { RailLateral } from '../components/ui.jsx';

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
        <td class="c">${a.num_groupe ? esc(a.num_groupe) : ''}</td>
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
      .entete { border-bottom: 2px solid #1F3864; padding-bottom: 8px; margin-bottom: 14px; }
      .titre { font-size: 12px; color: #555; text-transform: uppercase; letter-spacing: 1px; }
      .prof { font-size: 20px; margin-top: 4px; }
      .badge { font-size: 11px; background: #1F3864; color: #fff; padding: 2px 8px; border-radius: 10px; vertical-align: middle; margin-left: 6px; }
      table { width: 100%; border-collapse: collapse; font-size: 12px; }
      th, td { border: 1px solid #ccc; padding: 5px 7px; text-align: left; vertical-align: top; }
      thead th { background: #9CC2E5; font-weight: bold; }
      tfoot td { background: #f0f4f8; font-size: 13px; }
      .c { text-align: center; } .r { text-align: right; }
      .h { color: #777; font-weight: normal; font-size: 11px; }
      .vide { text-align: center; color: #999; font-style: italic; }
      @media print { .page { padding: 12mm; } }
    </style></head><body>${pages}
    <script>window.onload = () => { window.print(); };<\/script>
    </body></html>`;

  const w = window.open('', '_blank');
  if (!w) { alert('Veuillez autoriser les pop-ups pour imprimer.'); return; }
  w.document.write(html);
  w.document.close();
}


// ─── Panneau « Fonctions & missions » (lecture seule) : reflète personnel_mission de la personne ───
function FonctionsPanel({ missions }) {
  if (!missions || missions.length === 0) return null;
  return (
    <div className="mb-4 border border-gray-200 rounded-lg overflow-hidden">
      <div className="flex items-center gap-2 px-4 py-2 bg-gray-50 border-b border-gray-100">
        <IconBriefcase size={16} className="text-iip-blue" />
        <span className="text-sm font-semibold text-iip-blue">Fonctions &amp; missions</span>
      </div>
      <div className="p-4 space-y-2">
        {missions.map((m, i) => (
          <div key={i} className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-gray-800">{m.fonction}</span>
            {(m.etablissement || m.portee === 'etablissement')
              ? <span className="text-xs px-2 py-0.5 rounded-full bg-iip-blue/10 text-iip-blue">Établissement</span>
              : (m.sections || []).map(s => (
                  <span key={s} className="text-xs px-2 py-0.5 rounded-full bg-iip-turquoise/15 text-iip-blue">{s}</span>
                ))}
            {(!m.etablissement && m.portee !== 'etablissement' && (!m.sections || m.sections.length === 0)) &&
              <span className="text-xs text-gray-400">— aucune section</span>}
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── Panneau de permissions granulaires ──────────────────────────────────────
function PermissionsPanel({ userId, permissions, sectionsDispo, annee, onSaved, af }) {
  const [perms, setPerms]           = useState(permissions);
  const [expanded, setExpanded]     = useState({}); // { 'TIM': true, 'TIM-253': true }
  const [uesParSection, setUesParSection] = useState({});
  const [profsParSection, setProfsParSection] = useState({});
  const [loading, setLoading]       = useState({});
  const [saving, setSaving]         = useState(false);
  const [saved, setSaved]           = useState(false);

  // Helpers
  const hasPerm = (type, id) => perms.find(p => p.ressource_type === type && p.ressource_id === String(id));
  const niveauPerm = (type, id) => hasPerm(type, id)?.niveau || null;

  const setPerm = (type, id, niveau) => {
    const idStr = String(id);
    if (niveau === null) {
      setPerms(prev => prev.filter(p => !(p.ressource_type === type && p.ressource_id === idStr)));
    } else {
      setPerms(prev => {
        const sans = prev.filter(p => !(p.ressource_type === type && p.ressource_id === idStr));
        return [...sans, { ressource_type: type, ressource_id: idStr, niveau }];
      });
    }
  };

  // Charger les UE d'une section à la demande
  const chargerUEs = async (section) => {
    if (uesParSection[section]) return;
    setLoading(l => ({ ...l, [section]: true }));
    try {
      const tok = localStorage.getItem('token');
      const res = await fetch(`/api/ref/ue?section=${encodeURIComponent(section)}&annee=${encodeURIComponent(annee)}`,
        { headers: { Authorization: `Bearer ${tok}` } });
      const ues = await res.json();
      setUesParSection(prev => ({ ...prev, [section]: Array.isArray(ues) ? ues : [] }));
    } catch {}
    finally { setLoading(l => ({ ...l, [section]: false })); }
  };

  // Charger les profs d'une section à la demande
  const chargerProfs = async (section) => {
    if (profsParSection[section]) return;
    setLoading(l => ({ ...l, [`profs-${section}`]: true }));
    try {
      const tok = localStorage.getItem('token');
      const res = await fetch(`/api/ref/professeurs?annee=${encodeURIComponent(annee)}`,
        { headers: { Authorization: `Bearer ${tok}` } });
      const tous = await res.json();
      const filtres = (Array.isArray(tous) ? tous : []).filter(p =>
        p.sections_annee && p.sections_annee.split(',').map(s => s.trim()).includes(section)
      );
      setProfsParSection(prev => ({ ...prev, [section]: filtres }));
    } catch {}
    finally { setLoading(l => ({ ...l, [`profs-${section}`]: false })); }
  };

  const toggleExpand = async (key, type, id) => {
    const nv = !expanded[key];
    setExpanded(e => ({ ...e, [key]: nv }));
    if (nv) {
      if (type === 'section-ues') await chargerUEs(id);
      if (type === 'section-profs') await chargerProfs(id);
    }
  };

  const sauvegarder = async () => {
    setSaving(true);
    try {
      await af(`/api/users/${userId}/permissions`, { method: 'PUT', body: JSON.stringify({ permissions: perms }) });
      onSaved(perms);
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { alert(e.message); } finally { setSaving(false); }
  };

  const NiveauToggle = ({ type, id }) => {
    const n = niveauPerm(type, id);
    return (
      <div className="flex items-center gap-1 ml-auto flex-shrink-0">
        <button onClick={() => setPerm(type, id, n === 'lecture' ? null : 'lecture')}
          className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
            n === 'lecture' ? 'bg-iip-blue text-white border-iip-blue' : 'border-gray-300 text-gray-400 hover:border-iip-blue'
          }`}>
          Lecture
        </button>
        <button onClick={() => setPerm(type, id, n === 'modification' ? null : 'modification')}
          className={`text-[10px] px-1.5 py-0.5 rounded border transition ${
            n === 'modification' ? 'bg-iip-turquoise text-white border-iip-turquoise' : 'border-gray-300 text-gray-400 hover:border-iip-turquoise'
          }`}>
          Modif.
        </button>
      </div>
    );
  };

  return (
    <div className="mt-2 border border-gray-200 rounded-lg overflow-hidden text-xs">
      {/* En-tête */}
      <div className="px-3 py-2 bg-gray-50 border-b border-gray-200 flex items-center justify-between">
        <span className="text-gray-500 font-medium">
          Cliquez sur une section pour voir les UE et professeurs
        </span>
        <button onClick={sauvegarder} disabled={saving}
          className="text-[10px] bg-iip-blue text-white px-2.5 py-1 rounded hover:opacity-90 disabled:opacity-50 flex items-center gap-1">
          {saved ? '✓ Sauvegardé' : saving ? 'Sauvegarde…' : '✓ Sauvegarder'}
        </button>
      </div>

      <div className="divide-y divide-gray-100">
        {sectionsDispo.map(s => {
          const secKey = `sec-${s.code}`;
          const uesOpen = expanded[`${s.code}-ues`];
          const profsOpen = expanded[`${s.code}-profs`];
          const ues = uesParSection[s.code] || [];
          const profs = profsParSection[s.code] || [];

          return (
            <div key={s.code}>
              {/* Ligne section */}
              <div className="flex items-center gap-2 px-3 py-2 hover:bg-gray-50">
                <span className="font-semibold text-iip-blue w-20 flex-shrink-0">{s.code}</span>
                {s.libelle && <span className="text-gray-500 truncate flex-1">{s.libelle}</span>}
                <NiveauToggle type="section" id={s.code} />
                <button onClick={() => toggleExpand(`${s.code}-ues`, 'section-ues', s.code)}
                  className="text-gray-400 hover:text-iip-blue ml-1 flex-shrink-0" title="Voir les UE">
                  {loading[s.code] ? '…' : uesOpen ? '▾ UE' : '▸ UE'}
                </button>
                <button onClick={() => toggleExpand(`${s.code}-profs`, 'section-profs', s.code)}
                  className="text-gray-400 hover:text-iip-blue flex-shrink-0" title="Voir les profs">
                  {loading[`profs-${s.code}`] ? '…' : profsOpen ? '▾ Profs' : '▸ Profs'}
                </button>
              </div>

              {/* UE de la section */}
              {uesOpen && ues.map(u => (
                <div key={u.ue_num} className="flex items-center gap-2 px-3 py-1.5 bg-blue-50/40 border-t border-gray-100">
                  <span className="w-4 flex-shrink-0" />
                  <span className="text-[10px] text-gray-400 w-12 flex-shrink-0">UE {u.ue_num}</span>
                  <span className="text-gray-600 truncate flex-1">{u.ue_nom}</span>
                  <NiveauToggle type="ue" id={u.ue_num} />
                </div>
              ))}
              {uesOpen && ues.length === 0 && !loading[s.code] && (
                <div className="px-10 py-1.5 text-gray-400 bg-blue-50/40 border-t border-gray-100">Aucune UE trouvée.</div>
              )}

              {/* Professeurs de la section */}
              {profsOpen && profs.map(p => (
                <div key={p.id} className="flex items-center gap-2 px-3 py-1.5 bg-purple-50/30 border-t border-gray-100">
                  <span className="w-4 flex-shrink-0" />
                  <span className="text-gray-600 truncate flex-1">{p.nom} {p.prenom}</span>
                  <NiveauToggle type="professeur" id={p.id} />
                </div>
              ))}
              {profsOpen && profs.length === 0 && !loading[`profs-${s.code}`] && (
                <div className="px-10 py-1.5 text-gray-400 bg-purple-50/30 border-t border-gray-100">Aucun professeur trouvé.</div>
              )}
            </div>
          );
        })}
      </div>

      {perms.length > 0 && (
        <div className="px-3 py-2 bg-gray-50 border-t border-gray-200 text-gray-500">
          {perms.length} permission{perms.length > 1 ? 's' : ''} définie{perms.length > 1 ? 's' : ''} ·{' '}
          {perms.filter(p => p.niveau === 'modification').length} modification ·{' '}
          {perms.filter(p => p.niveau === 'lecture').length} lecture seule
        </div>
      )}
    </div>
  );
}

// ─── Panneau « Accès Lucie » (admin) : lie un compte utilisateur à un·e membre ───
const ROLES_LUCIE = [
  ['consultation', 'Consultation — lecture uniquement'],
  ['editeur', 'Éditeur — peut modifier'],
  ['admin', 'Administrateur — accès complet'],
];
// Modules accessibles par flag (extensible)
const MODULES_ACCES = [
  { key: 'attributions', label: 'Attributions',   icon: '📋', desc: 'Voir et/ou modifier les attributions' },
  { key: 'personnel',    label: 'Personnel',       icon: '👥', desc: 'Voir et/ou modifier les fiches membres' },
  { key: 'pilotage',     label: 'Pilotage',        icon: '📊', desc: 'Accès au pilotage de la dotation' },
  { key: 'listes',       label: 'Listes',          icon: '📄', desc: 'Accès aux listes et documents' },
  { key: 'procedures',   label: 'Procédures',      icon: '📑', desc: 'Accès aux procédures' },
  { key: 'planification',label: 'Planification',   icon: '📅', desc: 'Accès à la planification' },
  { key: 'recrutement',  label: 'Recrutement',     icon: '💼', desc: 'Accès au module recrutement' },
];

// permissions_json stocke : { attributions: {lire, ecrire, voir_tout}, personnel: {lire, ecrire}, ..., recrutement: {lire, ecrire} }
const PERM_DEFAUT = () => Object.fromEntries(MODULES_ACCES.map(m => [m.key, { lire: false, ecrire: false, voir_tout: false }]));

function AccesLuciePanel({ profId, detail }) {
  const af = (url, opts = {}) => fetch(url, {
    ...opts,
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token')}`, ...(opts.headers || {}) },
  }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || 'Erreur'); return j; });

  const [account, setAccount]   = useState(undefined);
  const [sectionsDispo, setSectionsDispo] = useState([]);
  const [role, setRole]         = useState('editeur');
  const [sections, setSections] = useState([]);
  const [perms, setPerms]       = useState(PERM_DEFAUT());
  const [granulaires, setGranulaires] = useState([]);
  const [showGranulaire, setShowGranulaire] = useState(false);
  const [pwd, setPwd]           = useState(null);
  const [busy, setBusy]         = useState(false);
  const [saved, setSaved]       = useState(false);
  const [err, setErr]           = useState('');

  const norm = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const emailSuggere = `${norm(detail.prenom)}.${norm(detail.nom)}@institut-prigogine.be`;
  const genPwd = () => { const c = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'; return Array.from({ length: 12 }, () => c[Math.floor(Math.random() * c.length)]).join(''); };

  function charger() {
    af('/api/users').then(list => {
      const a = (Array.isArray(list) ? list : []).find(u => u.professeur_id === profId) || null;
      setAccount(a);
      if (a) {
        setRole(a.role);
        setSections(a.sections || []);
        // Lire permissions_json
        const pj = a.permissions_json ? (() => { try { return JSON.parse(a.permissions_json); } catch { return {}; } })() : {};
        const merged = { ...PERM_DEFAUT() };
        for (const k of Object.keys(merged)) {
          if (pj[k]) merged[k] = { ...merged[k], ...pj[k] };
        }
        // Compat ancienne colonne acces_recrutement
        if (a.acces_recrutement && !merged.recrutement.lire) merged.recrutement.lire = true;
        setPerms(merged);
        af(`/api/users/${a.id}/permissions`)
          .then(p => setGranulaires(Array.isArray(p) ? p : []))
          .catch(() => {});
      }
    }).catch(e => { setErr(e.message); setAccount(null); });
  }

  useEffect(() => {
    charger();
    af('/api/ref/sections').then(d => setSectionsDispo(Array.isArray(d) ? d : [])).catch(() => {});
  }, [profId]);

  async function creer() {
    setErr(''); setBusy(true);
    try {
      const p = genPwd();
      await af('/api/users', { method: 'POST', body: JSON.stringify({
        email: emailSuggere, password: p, nom_complet: detail.nom_prenom, role, professeur_id: profId,
        sections: role === 'coordination' ? sections : [],
        permissions_json: JSON.stringify(perms),
      }) });
      setPwd(p); charger();
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
  }

  async function sauvegarder() {
    setErr(''); setBusy(true);
    try {
      await af(`/api/users/${account.id}`, { method: 'PATCH', body: JSON.stringify({
        role, sections: role === 'coordination' ? sections : [],
        permissions_json: JSON.stringify(perms),
        acces_recrutement: perms.recrutement?.lire ? 1 : 0, // compat
      }) });
      setSaved(true); setTimeout(() => setSaved(false), 2000);
    } catch (e) { setErr(e.message); } finally { setBusy(false); }
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
          <span className="text-base w-5 flex-shrink-0">{m.icon}</span>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-semibold text-gray-700">{m.label}</div>
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button onClick={() => togglePerm(m.key, 'lire')}
              className={`text-[10px] px-2 py-0.5 rounded border font-medium transition ${p.lire ? 'bg-iip-blue text-white border-iip-blue' : 'border-gray-300 text-gray-400 hover:border-iip-blue'}`}>
              Lecture</button>
            <button onClick={() => togglePerm(m.key, 'ecrire')}
              className={`text-[10px] px-2 py-0.5 rounded border font-medium transition ${p.ecrire ? 'bg-iip-turquoise text-white border-iip-turquoise' : 'border-gray-300 text-gray-400 hover:border-iip-turquoise'}`}>
              Écriture</button>
            {hasScope && (
              <button onClick={() => togglePerm(m.key, 'voir_tout')}
                className={`text-[10px] px-2 py-0.5 rounded border font-medium transition ${p.voir_tout ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-300 text-gray-400 hover:border-amber-400'}`}
                title="Tout voir = toutes sections">Tout</button>
            )}
            {m.key === 'attributions' && (
              <button onClick={() => togglePerm(m.key, 'valider')}
                className={`text-[10px] px-2 py-0.5 rounded border font-medium transition ${p.valider ? 'bg-green-600 text-white border-green-600' : 'border-gray-300 text-gray-400 hover:border-green-500'}`}
                title="Peut valider les attributions encodées par les coordinations (direction / direction adjointe)">Valider</button>
            )}
          </div>
        </div>
        {hasScope && (p.lire || p.ecrire) && !p.voir_tout && (
          <div className="px-3 pb-2 pt-0 flex flex-wrap gap-1">
            {sectionsDispo.map(s => (
              <button key={s.code} type="button" onClick={() => toggleSec(s.code)}
                className={`text-[10px] px-1.5 py-0.5 rounded-full border transition ${
                  sectionsModule.includes(s.code) ? 'bg-iip-blue text-white border-iip-blue' : 'border-gray-200 text-gray-400 hover:border-iip-blue'
                }`}>{s.code}</button>
            ))}
            {sectionsModule.length === 0 && <span className="text-[10px] text-orange-500 italic">⚠ Aucune section — accès bloqué</span>}
          </div>
        )}
      </div>
    );
  };

  const FormCreer = (
    <>
      <div className="text-xs text-gray-500">Aucun compte Lucie lié à ce membre.</div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">E-mail (suggéré)</div>
          <div className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-gray-50 text-gray-600 truncate">{emailSuggere}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Rôle</div>
          <select value={role} onChange={e => setRole(e.target.value)} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
            {ROLES_LUCIE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-2 font-medium">Permissions</div>
        <div className="space-y-1.5">
          {MODULES_ACCES.map(m => <ModuleRow key={m.key} m={m} />)}
        </div>
      </div>
      <button onClick={creer} disabled={busy}
        className="w-full flex items-center justify-center gap-1.5 bg-green-600 text-white text-sm px-3 py-2 rounded-lg disabled:opacity-40 hover:opacity-90">
        <IconPlus size={15} /> Créer l'accès &amp; générer le mot de passe
      </button>
    </>
  );

  const FormEditer = account && (
    <>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <div className="text-xs text-gray-500 mb-1">E-mail</div>
          <div className="text-sm border border-gray-200 rounded px-2 py-1.5 bg-gray-50 text-gray-700 truncate">{account.email}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500 mb-1">Rôle</div>
          <select value={role} onChange={e => setRole(e.target.value)} disabled={busy} className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm bg-white">
            {ROLES_LUCIE.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </div>
      </div>



      {/* Permissions modules */}
      <div>
        <div className="text-xs text-gray-500 mb-2 font-medium">Permissions par module</div>
        <div className="space-y-1.5">
          {MODULES_ACCES.map(m => <ModuleRow key={m.key} m={m} />)}
        </div>
        <div className="mt-2 text-[10px] text-gray-400 italic">
          "Tout voir" = accès à toutes les sections (sinon : sections autorisées seulement)
        </div>
      </div>

      {/* Permissions granulaires section/UE */}
      <div>
        <button onClick={() => setShowGranulaire(v => !v)}
          className="w-full text-left text-xs font-medium text-gray-600 flex items-center justify-between py-1 border-t border-gray-100 pt-2">
          <span>Restrictions granulaires (sections, UE, professeurs)</span>
          <span className="text-gray-400">{showGranulaire ? '▲' : '▼'} {granulaires.length > 0 ? `${granulaires.length} règle${granulaires.length > 1 ? 's' : ''}` : ''}</span>
        </button>
        {showGranulaire && (
          <PermissionsPanel
            userId={account.id}
            permissions={granulaires}
            sectionsDispo={sectionsDispo}
            annee={localStorage.getItem('annee_active') || '2026-2027'}
            onSaved={nv => setGranulaires(nv)}
            af={af}
          />
        )}
      </div>

      <div className="flex items-center gap-2 pt-1 flex-wrap">
        <button onClick={sauvegarder} disabled={busy}
          className={`flex-1 flex items-center justify-center gap-1.5 text-sm px-3 py-2 rounded-lg font-medium ${saved ? 'bg-green-600 text-white' : 'bg-iip-blue text-white hover:opacity-90'} disabled:opacity-40`}>
          {saved ? '✓ Sauvegardé' : busy ? 'Sauvegarde…' : '✓ Sauvegarder'}
        </button>
        <button onClick={nouveauMdp} disabled={busy} className="flex items-center gap-1.5 text-sm border border-gray-300 text-gray-700 px-3 py-2 rounded-lg hover:bg-gray-50 disabled:opacity-40">
          <IconKey size={14} /> Nouveau mot de passe
        </button>
        <button onClick={() => { if (confirm('Désactiver ce compte ?')) af(`/api/users/${account.id}`, { method: 'PATCH', body: JSON.stringify({ actif: 0 }) }).then(charger).catch(e => setErr(e.message)); }}
          className="flex items-center gap-1.5 text-sm border border-red-300 text-red-600 px-3 py-2 rounded-lg hover:bg-red-50">
          <IconX size={14} /> {account.actif ? 'Désactiver' : 'Réactiver'}
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
          <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-semibold ${account.actif ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
            {account.actif ? 'Actif' : 'Désactivé'}
          </span>
        )}
      </div>
      <div className="p-4 space-y-3">
        {err && <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded px-3 py-2">{err}</div>}
        {pwd && (
          <div className="bg-amber-50 border border-amber-300 rounded px-3 py-2">
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

function DetailModal({ profId, onClose, onEdit, onFiche }) {
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
    api.professeur(profId, getAnnee()).then(setDetail).catch(e => alert(e.message));
  }, [profId]);

  async function nouvelEA12() {
    try {
      const { id } = await api.ea12Create({ professeur_id: profId, annee_scolaire: getAnnee(), variante: 'bis', donnees: {} });
      navigate(`/ea12/${id}`);
    } catch (e) { alert('Erreur : ' + e.message); }
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
      const { html, nom } = await res.json();
      setAperçuContrat({ html, nom });
      setShowContratModal(false);
    } catch (e) { alert('Erreur : ' + e.message); }
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
    } catch (e) { alert('Erreur : ' + e.message); }
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
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setGeneratingPdf(false); }
  }

  // Un clic : génère le PDF (dates/représentant par défaut) et ouvre directement le
  // dialogue d'impression du navigateur (choix PDF ou imprimante), sans étape intermédiaire.
  const [imprimantEnCours, setImprimantEnCours] = useState(false);
  async function imprimerContratDirect() {
    setImprimantEnCours(true);
    try {
      const res = await fetch('/api/contrats/pdf', {
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
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const iframe = document.createElement('iframe');
      iframe.style.cssText = 'position:fixed;left:-9999px;top:0;width:1px;height:1px;border:0;';
      iframe.src = url;
      document.body.appendChild(iframe);
      iframe.onload = () => {
        try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch (e) { console.error(e); }
        // Nettoyage différé : laisser le temps au dialogue d'impression de s'ouvrir avec le PDF chargé.
        setTimeout(() => { try { document.body.removeChild(iframe); } catch {} URL.revokeObjectURL(url); }, 60000);
      };
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setImprimantEnCours(false); }
  }

  if (!detail) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30">
      <div className="bg-white rounded-xl p-8 text-gray-400">Chargement…</div>
    </div>
  );

  const initiales = [(detail.prenom||'')[0], (detail.nom||'')[0]].filter(Boolean).join('').toUpperCase();
  const totalIIP  = (detail.tot_per_annee ?? 0) + (detail.tot_aut_annee ?? 0);

  const badge = tc => tc === 'CT'
    ? <span className="badge badge-ct">CT</span>
    : tc === 'PP' ? <span className="badge badge-pp">PP</span> : null;

  const ONGLETS = [
    { key: 'attributions', label: `Attributions (${detail.attributions?.length || 0})` },
    ...(u?.role === 'admin' ? [
      { key: 'acces',    label: 'Accès Lucie' },
      { key: 'dossiers', label: '🔒 Dossiers RH' },
    ] : []),
    { key: 'actions', label: 'Documents' },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-30"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* ── Barre de titre ── */}
        <div className="flex items-center justify-between px-6 py-3 bg-iip-blue rounded-t-2xl flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
              {initiales}
            </div>
            <div>
              <div className="text-white font-bold text-lg leading-tight">{detail.nom_prenom}</div>
              <div className="text-white/70 text-xs flex items-center gap-3">
                {detail.adresse_mail && <span className="flex items-center gap-1"><IconMail size={11}/>{detail.adresse_mail}</span>}
                {detail.commune && <span className="flex items-center gap-1"><IconMapPin size={11}/>{detail.code_postal} {detail.commune}</span>}
                {detail.capaes === 'x' && <span className="bg-green-400/30 text-green-200 text-[10px] px-1.5 rounded">CAPAES</span>}
                {detail.statut && <span className="bg-white/20 text-white/90 text-[10px] px-1.5 rounded">{detail.statut}</span>}
              </div>
            </div>
          </div>
          <button onClick={onClose} className="text-white/60 hover:text-white ml-4"><IconX size={20}/></button>
        </div>

        {/* ── Layout 2 colonnes ── */}
        <div className="flex flex-1 min-h-0">

          {/* ── Colonne gauche — identité + KPIs + actions ── */}
          <div className="w-64 flex-shrink-0 border-r border-gray-100 flex flex-col bg-gray-50/50 overflow-auto">

            {/* KPIs */}
            <div className="p-4 space-y-2 border-b border-gray-100">
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-3 text-center">
                <div className="text-xs text-gray-500 mb-0.5">Périodes IIP</div>
                <div className="text-2xl font-bold text-iip-blue">{totalIIP}</div>
                <div className="text-[10px] text-gray-400">per. + aut.</div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 text-center">
                  <div className="text-[10px] text-gray-400">HELB</div>
                  <div className="text-base font-bold text-purple-600">{detail.total_hrs_helb ?? 0}h</div>
                </div>
                <div className="bg-white rounded-xl border border-gray-200 px-3 py-2 text-center">
                  <div className="text-[10px] text-gray-400">Anc. PO</div>
                  <div className="text-base font-bold text-gray-700">{detail.anciennete_25_26_po ?? 0}</div>
                </div>
              </div>
            </div>

            {/* Fonctions & missions */}
            {detail.missions?.length > 0 && (
              <div className="p-4 border-b border-gray-100">
                <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Fonctions</div>
                <div className="space-y-1.5">
                  {detail.missions.map((m, i) => (
                    <div key={i} className="text-xs">
                      <div className="font-medium text-gray-700">{m.fonction}</div>
                      {m.section && <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded mt-0.5 inline-block">{m.section}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="p-4 space-y-2 border-b border-gray-100">
              <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">Actions</div>
              <button onClick={() => onEdit(detail)}
                className="w-full flex items-center gap-2 text-xs bg-iip-gold/10 hover:bg-iip-gold/20 text-iip-gold border border-iip-gold/30 rounded-lg px-3 py-2 font-medium transition">
                <IconEdit size={14}/> Modifier la fiche
              </button>
              <button onClick={() => navigate(`/dcpp/${profId}`)}
                className="w-full flex items-center gap-2 text-xs bg-iip-turquoise/10 hover:bg-iip-turquoise/20 text-iip-blue border border-iip-turquoise/30 rounded-lg px-3 py-2 font-medium transition">
                <IconSchool size={14}/> DCPP
              </button>
              {u?.role === 'admin' && (
                <button onClick={nouvelEA12}
                  className="w-full flex items-center gap-2 text-xs bg-purple-50 hover:bg-purple-100 text-purple-700 border border-purple-200 rounded-lg px-3 py-2 font-medium transition">
                  <IconPlus size={14}/> Nouvel EA12
                </button>
              )}
              {u?.role === 'admin' && (
                <div className="space-y-1">
                  <button onClick={imprimerContratDirect} disabled={imprimantEnCours}
                    className="w-full flex items-center gap-2 text-xs bg-green-50 hover:bg-green-100 disabled:opacity-50 text-green-700 border border-green-200 rounded-lg px-3 py-2 font-medium transition">
                    <IconPrinter size={14}/> {imprimantEnCours ? 'Préparation…' : 'Imprimer le contrat'}
                  </button>
                  <button onClick={() => setShowContratModal(true)}
                    className="w-full text-[10px] text-gray-400 hover:text-gray-600 underline text-center">
                    Options avancées (date, représentant, .docx…)
                  </button>
                </div>
              )}
              {/* Fiches PDF */}
              <div className="relative">
                <button onClick={() => setPrintMenu(v => !v)}
                  className="w-full flex items-center gap-2 text-xs bg-white hover:bg-gray-50 text-gray-600 border border-gray-200 rounded-lg px-3 py-2 font-medium transition">
                  <IconPrinter size={14}/> Fiche PDF <IconChevronDown size={12} className="ml-auto"/>
                </button>
                {printMenu && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setPrintMenu(false)}/>
                    <div className="absolute z-50 bottom-full left-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1 w-full">
                      {[['Global','IIP + HELB',null],['IIP','Contrat IIP','IIP'],['HELB','Contrat HELB','HELB']].map(([lbl,sub,filtre]) => (
                        <button key={lbl} onClick={() => { onFiche && onFiche(profId, filtre); setPrintMenu(false); }}
                          className="w-full text-left px-3 py-2 hover:bg-gray-50 text-xs flex items-center gap-2">
                          <span className="font-bold w-10">{lbl}</span>
                          <span className="text-gray-400">{sub}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
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
                        const key = `${a.section}||${a.ue_num}||${a.code_cours || ''}`;
                        if (!map[key]) {
                          map[key] = {
                            ...a,
                            periodes_total: (a.periodes_attribuees || 0) + (a.autonomie_attribuee || 0),
                            nb_groupes: 1,
                            ids: [a.id],
                          };
                          grouped.push(map[key]);
                        } else {
                          map[key].periodes_total += (a.periodes_attribuees || 0) + (a.autonomie_attribuee || 0);
                          map[key].nb_groupes += 1;
                          map[key].ids.push(a.id);
                        }
                      }
                      return (
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-gray-200">
                              <th className="text-left pb-2 text-xs text-gray-400 font-medium">Section</th>
                              <th className="text-left pb-2 text-xs text-gray-400 font-medium">UE</th>
                              <th className="text-left pb-2 text-xs text-gray-400 font-medium">Cours</th>
                              <th className="text-left pb-2 text-xs text-gray-400 font-medium">Activité</th>
                              <th className="text-center pb-2 text-xs text-gray-400 font-medium">Type</th>
                              <th className="text-center pb-2 text-xs text-gray-400 font-medium">Gr.</th>
                              <th className="text-right pb-2 text-xs text-gray-400 font-medium">Total pér.</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-gray-50">
                            {grouped.map((a, idx) => (
                              <tr key={idx} className="hover:bg-gray-50/80 group">
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
                                <td className="py-2 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <div className="flex items-center gap-0.5">
                                    {a.code_cours && (
                                      <button title="Éditer" onClick={() => setEditCours({ section: a.section, code_cours: a.code_cours })}
                                        className="text-iip-gold hover:text-iip-amber p-1 rounded"><IconEdit size={13}/></button>
                                    )}
                                    <button title="Désattribuer tous les groupes" onClick={async () => {
                                        if (!confirm(`Retirer toutes les attributions de ${a.nom_cours} (${a.nb_groupes} groupe${a.nb_groupes>1?'s':''})?`)) return;
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
              {onglet === 'acces' && u?.role === 'admin' && (
                <AccesLuciePanel profId={profId} detail={detail} />
              )}

              {/* ── Dossiers RH ── */}
              {onglet === 'dossiers' && u?.role === 'admin' && (
                <DossiersRH profId={profId} profNom={detail.nom_prenom} />
              )}

              {/* ── Documents ── */}
              {onglet === 'actions' && (
                <div className="space-y-4">
                  <div className="text-sm text-gray-500">Documents générables pour {detail.nom_prenom}</div>
                  <div className="grid grid-cols-2 gap-3">
                    {u?.role === 'admin' && (
                      <button onClick={() => setShowContratModal(true)}
                        className="flex items-center gap-3 p-4 border-2 border-dashed border-green-200 hover:border-green-400 rounded-xl text-left transition">
                        <IconFileText size={24} className="text-green-600 flex-shrink-0"/>
                        <div>
                          <div className="text-sm font-semibold text-gray-700">Contrat de travail</div>
                          <div className="text-xs text-gray-400">CDD — Enseignement pour adultes</div>
                        </div>
                      </button>
                    )}
                    {[['Global','IIP + HELB',null],['IIP','Contrat IIP','IIP'],['HELB','Contrat HELB','HELB']].map(([lbl,sub,filtre]) => (
                      <button key={lbl} onClick={() => onFiche && onFiche(profId, filtre)}
                        className="flex items-center gap-3 p-4 border-2 border-dashed border-gray-200 hover:border-iip-turquoise rounded-xl text-left transition">
                        <IconPrinter size={24} className="text-iip-blue flex-shrink-0"/>
                        <div>
                          <div className="text-sm font-semibold text-gray-700">Fiche {lbl}</div>
                          <div className="text-xs text-gray-400">{sub}</div>
                        </div>
                      </button>
                    ))}
                    {u?.role === 'admin' && (
                      <button onClick={nouvelEA12}
                        className="flex items-center gap-3 p-4 border-2 border-dashed border-purple-200 hover:border-purple-400 rounded-xl text-left transition">
                        <IconPlus size={24} className="text-purple-600 flex-shrink-0"/>
                        <div>
                          <div className="text-sm font-semibold text-gray-700">Nouvel EA12</div>
                          <div className="text-xs text-gray-400">Fiche de nomination</div>
                        </div>
                      </button>
                    )}
                  </div>
                </div>
              )}

            </div>
          </div>
        </div>
      </div>

      {aperçuContrat && (
        <PreviewModal
          html={aperçuContrat.html}
          titre={`Contrat — ${detail.nom_prenom}`}
          sousTitre={`CDD · ${getAnnee()}`}
          nomFichier={aperçuContrat.nom}
          onClose={() => setAperçuContrat(null)}
          actionExtra={
            <>
              <button onClick={telechargerPdf} disabled={generatingPdf}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40">
                <IconDownload size={13}/> {generatingPdf ? '…' : 'Télécharger PDF'}
              </button>
              <button onClick={telechargerDocx} disabled={generatingContrat}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40">
                <IconDownload size={13}/> {generatingContrat ? '…' : 'Télécharger .docx'}
              </button>
            </>
          }
        />
      )}
      {showContratModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-md p-6">
            <h3 className="text-lg font-title text-iip-gold mb-4 flex items-center gap-2">
              <IconFileText size={18}/> Générer le contrat de travail
            </h3>
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
            <div className="flex gap-3 mt-6">
              <button onClick={() => setShowContratModal(false)}
                className="flex-1 border border-gray-300 text-gray-600 py-2 rounded text-sm">Annuler</button>
              <button onClick={genererContrat} disabled={generatingContrat || !dateContrat}
                className="flex-1 bg-green-700 hover:opacity-90 disabled:opacity-40 text-white py-2 rounded text-sm font-semibold">
                {generatingContrat ? 'Génération…' : <span className="inline-flex items-center gap-1.5"><IconDownload size={15}/>Télécharger .docx</span>}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
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
  { val: 'convocation', label: 'Convocation',             color: '#d97706' },
  { val: 'audition',    label: 'Audition',                color: '#7c3aed' },
  { val: 'decision',    label: 'Décision',                color: '#b91c1c' },
  { val: 'appel',       label: 'Recours / Appel',         color: '#0369a1' },
  { val: 'cloture',     label: 'Clôture',                 color: '#15803d' },
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
    if (!confirm('Supprimer définitivement ce dossier ?')) return;
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
          <span>🔒</span> Confidentiel — visible uniquement par les administrateurs
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
              className="text-sm bg-iip-blue text-white px-4 py-1.5 rounded-lg hover:opacity-90 disabled:opacity-50">
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
                <div className={`flex items-center justify-between px-4 py-3 ${isFinContrat ? 'bg-red-50' : 'bg-orange-50'}`}>
                  <div className="flex items-center gap-3">
                    <span className="text-lg">{isFinContrat ? '📋' : '⚠️'}</span>
                    <div>
                      <div className="text-sm font-bold text-gray-800">
                        {isFinContrat ? 'Fin de contrat' : 'Dossier disciplinaire'}
                        {isClos && <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-0.5 rounded-full">Clos</span>}
                      </div>
                      <div className="text-xs text-gray-500 flex items-center gap-2">
                        <span>Ouvert le {new Date(d.date_ouverture).toLocaleDateString('fr-BE')}</span>
                        {motif && <span className="bg-red-100 text-red-700 px-1.5 rounded">{motif.label}</span>}
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
                  <div className="border-t border-orange-200 bg-orange-50/50 px-4 py-3 space-y-2">
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
                        className="text-xs bg-iip-blue text-white px-3 py-1.5 rounded hover:opacity-90 disabled:opacity-50">
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

const LOGO_IIP_FICHE = 'data:image/jpeg;base64,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';

export default function Professeurs() {
  const navigate = useNavigate();
  const [profs, setProfs] = useState([]);
  const [search, setSearch] = useState('');
  const [fContrat, setFContrat] = useState('');   // '' | IIP | HELB | mixte
  const [fCharge, setFCharge]   = useState('');   // '' | avec | sans
  const [fSection, setFSection] = useState('');   // '' | code section
  const [fAnc, setFAnc]         = useState(false); // avec ancienneté
  const [showSansCharge, setShowSansCharge] = useState(false); // volet "à zéro" fermé par défaut
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [editProf, setEditProf] = useState(null);
  const [sortBy, setSortBy] = useState({ key: 'nom_prenom', dir: 'asc' });
  const [deleting, setDeleting] = useState(null);
  const [selection, setSelection] = useState(new Set());
  const [printing, setPrinting] = useState(false);
  const [printSelMenu, setPrintSelMenu] = useState(false);
  const [zipMenu, setZipMenu] = useState(false);
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
  function helbCalc(statut, a) {
    const natLigne = a.helb_nature_ligne;
    const nature = natLigne === 'TP' ? 'TP'
                 : natLigne === 'CT' ? 'COURS'
                 : (a.helb_nature || (a.type_cours === 'PP' ? 'TP' : 'COURS'));
    let div;
    if (statut === 'COORD') div = 1400;
    else if (statut === 'MFP') div = 750;
    else div = nature === 'TP' ? 750 : 480; // MA, PI, ou défaut
    const h = a.heures || 0;
    const charge = div ? h / div : 0;
    return { nature, natureLbl: nature === 'TP' ? 'Trav. P. (TP)' : 'Théorie (TH)', div, h, charge };
  }

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
        .footer-iip .txt{border-top:0.5pt solid #C9A84C;padding-top:2mm;font-size:7px;color:#888;text-align:center;line-height:1.4}
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
                <td style="padding:4px 0;text-align:right;font-size:16px;font-weight:700;color:#7c3aed;border:none">${(Math.round(totCharge*1000)/1000).toFixed(3)}</td>
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
    setFicheHtml({ html, nom: nomDoc('Fiche_HELB', prof.nom, prof.prenom, annee), titre: `${prof.prenom || ''} ${prof.nom || ''}`.trim(), sousTitre: `Fiche HELB · ${annee}` });
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
        .footer-iip .txt{border-top:0.5pt solid #C9A84C;padding-top:2mm;font-size:7px;color:#888;text-align:center;line-height:1.4}
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
                <td colspan="2" style="padding:5px 0;text-align:right;font-size:18px;font-weight:700;color:#00AACC;border:none">${totalGeneral.toFixed(4)}</td>
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
    setFicheHtml({ html, nom: nomDoc('Fiche_globale', prof.nom, prof.prenom, annee), titre: `${prof.prenom || ''} ${prof.nom || ''}`.trim(), sousTitre: `Fiche globale · ${annee}` });
  }

  async function genererFicheAttributions(profId, contratFiltre = null, returnOnly = false) {
    const annee = getAnnee();
    const tok = localStorage.getItem('token');
    const d = await fetch(`/api/ref/professeurs/${profId}/fiche-attributions?annee=${encodeURIComponent(annee)}`,
      { headers: { Authorization: `Bearer ${tok}` } }).then(r => r.json());
    if (d.error) { alert(d.error); return; }

    const { prof, nominations, bilan_nomination, etp } = d;
    let attributions = d.attributions;
    if (contratFiltre) attributions = attributions.filter(a => (a.contrat_mdp || 'IIP') === contratFiltre);
    // Si on demande un type précis et que le prof n'a aucune attribution de ce type, pas de fiche
    if (contratFiltre && attributions.length === 0) {
      if (!returnOnly) alert(`Ce membre du personnel n'a aucune attribution ${contratFiltre} pour ${annee}.`);
      return null;
    }
    if (contratFiltre === 'HELB') { return genererFicheHELB(prof, attributions, annee, returnOnly); }
    if (contratFiltre === null) { return genererFicheGlobale(prof, attributions, nominations, bilan_nomination, annee, returnOnly); }

    // Recalcul des totaux IIP sur les lignes filtrées (ou toutes si global)
    let tot_ct = 0, tot_pp = 0, tot_aut = 0;
    for (const a of attributions) {
      if (a.type_cours === 'CT') { tot_ct += a.per || 0; } else { tot_pp += a.per || 0; }
      tot_aut += a.aut || 0;
    }
    const tot_per = tot_ct + tot_pp;
    const tot_global = tot_per + tot_aut;

    const fmt = n => n != null ? String(n) : '0';
    const S  = 'padding:2px 6px;font-size:11px;';
    const SR = S + 'text-align:right;';

    // Grouper par section
    const sections = {};
    for (const a of attributions) {
      if (!sections[a.section]) sections[a.section] = [];
      sections[a.section].push(a);
    }

    const lignesSections = Object.entries(sections).map(([sec, rows]) => {
      const lignes = rows.map((a, i) => `
        <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
          <td style="${S}color:#6b7280">${a.section}</td>
          <td style="${S}color:#374151"><span style="display:inline-block;min-width:46px">UE ${a.ue_num}</span>${a.ue_niv ? `<span style="background:#1B2B4B;color:white;font-size:9px;padding:1px 4px;border-radius:3px">${a.ue_niv}</span>` : ''}</td>
          <td style="${S}color:#374151">${a.cours_nom || a.code_cours || '—'}${a.activite_nom ? ` <em style="color:#9ca3af">(${a.activite_nom})</em>` : ''}${a.est_rt ? ` <span style="color:#ea580c;border:1px solid #ef4444;border-radius:3px;font-size:8px;padding:0 3px;font-weight:700">RT</span>` : ''}</td>
          <td style="${SR}font-weight:600;color:${a.type_cours==='CT'?'#1B2B4B':'#00AACC'}">${a.type_cours || '—'}</td>
          <td style="${SR}color:#374151">${fmt(a.per)}</td>
          <td style="${SR}color:#6b7280">${fmt(a.aut)}</td>
          <td style="${SR}font-weight:700;border-left:1px solid #e5e7eb">${fmt((a.per||0)+(a.aut||0))}</td>
        </tr>`).join('');
      return lignes;
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
        .footer-iip .txt{border-top:0.5pt solid #C9A84C;padding-top:2mm;font-size:7px;color:#888;text-align:center;line-height:1.4}
      </style></head><body>
      <table class="page-table"><tbody><tr><td>
      <div style="padding:10mm">
        <!-- En-tête -->
        <div style="display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #1B2B4B;padding-bottom:8px;margin-bottom:16px">
          <div>
            <div style="font-size:9px;color:#00AACC;letter-spacing:2px;text-transform:uppercase;margin-bottom:4px">Institut Ilya Prigogine · Fiche d'attributions</div>
            <div style="font-size:20px;font-weight:700;color:#1B2B4B">${prof.prenom} ${prof.nom}</div>
            <div style="font-size:11px;color:#6b7280;margin-top:2px">${prof.fonction || prof.statut || ''}</div>
          </div>
          <div style="text-align:right">
            <div style="font-size:13px;font-weight:600;color:#1B2B4B">${annee}</div>
            <div style="font-size:9px;color:#9ca3af;margin-top:2px">Généré le ${new Date().toLocaleDateString('fr-BE')} · Lucie</div>
          </div>
        </div>

        <!-- Tableau -->
        <table>
          <thead>
            <tr style="background:#1B2B4B;color:white">
              <th style="padding:4px 6px;text-align:left;font-size:10px">Section</th>
              <th style="padding:4px 6px;text-align:left;font-size:10px">UE</th>
              <th style="padding:4px 6px;text-align:left;font-size:10px">Cours</th>
              <th style="padding:4px 6px;text-align:center;font-size:10px">CT/PP</th>
              <th style="padding:4px 6px;text-align:right;font-size:10px">Pér.</th>
              <th style="padding:4px 6px;text-align:right;font-size:10px">Aut.</th>
              <th style="padding:4px 6px;text-align:right;font-size:10px;border-left:1px solid rgba(255,255,255,.3)">Total</th>
            </tr>
          </thead>
          <tbody>${lignesSections}</tbody>
        </table>

        <!-- Totaux -->
        <div style="margin-top:16px;display:flex;gap:24px;justify-content:flex-end">
          <div style="background:#f1f5f9;border-radius:8px;padding:12px 20px;min-width:200px">
            <div style="font-size:10px;color:#6b7280;margin-bottom:8px;text-transform:uppercase;letter-spacing:1px">Récapitulatif</div>
            <table style="width:100%">
              <tr><td style="padding:2px 0;color:#374151;border:none">Charge de cours (CT)</td><td style="padding:2px 0;text-align:right;font-weight:600;color:#1B2B4B;border:none">${fmt(tot_ct)} p.</td></tr>
              <tr><td style="padding:2px 0;color:#374151;border:none">Pratique professionnelle (PP)</td><td style="padding:2px 0;text-align:right;font-weight:600;color:#00AACC;border:none">${fmt(tot_pp)} p.</td></tr>
              <tr><td style="padding:2px 0;color:#374151;border:none">Autonomie</td><td style="padding:2px 0;text-align:right;font-weight:600;color:#6b7280;border:none">${fmt(tot_aut)} p.</td></tr>
              <tr style="border-top:2px solid #1B2B4B">
                <td style="padding:4px 0;font-weight:700;color:#1B2B4B;border:none">Total général</td>
                <td style="padding:4px 0;text-align:right;font-weight:700;color:#1B2B4B;border:none">${fmt(tot_global)} p.</td>
              </tr>
              <tr>
                <td style="padding:2px 0;font-weight:700;color:#1B2B4B;border:none">ETP</td>
                <td style="padding:2px 0;text-align:right;font-size:16px;font-weight:700;color:#00AACC;border:none">${etp}</td>
              </tr>
            </table>
          </div>
        </div>
        ${(nominations && nominations.length) ? `
        <!-- Engagement à titre définitif -->
        <div style="margin-top:20px">
          <div style="font-size:11px;font-weight:700;color:#1B2B4B;text-transform:uppercase;letter-spacing:1px;border-bottom:2px solid #1B2B4B;padding-bottom:3px;margin-bottom:6px">Engagement à titre définitif</div>
          <table style="width:100%">
            <thead>
              <tr style="background:#eef2f7;color:#1B2B4B">
                <th style="padding:3px 6px;text-align:left;font-size:9px">Dossier pédagogique (code FWB)</th>
                <th style="padding:3px 6px;text-align:center;font-size:9px">Type</th>
                <th style="padding:3px 6px;text-align:right;font-size:9px">Nommé (pér.)</th>
                <th style="padding:3px 6px;text-align:right;font-size:9px">ETP</th>
              </tr>
            </thead>
            <tbody>
              ${nominations.map((n,i) => `
                <tr style="background:${i%2===0?'#fff':'#f9fafb'}">
                  <td style="${S}color:#374151">${n.libelle} <span style="color:#9ca3af;font-family:monospace;font-size:9px">${n.code_fwb === 'INCONNU' ? '(code inconnu)' : n.code_fwb}</span></td>
                  <td style="${S}text-align:center;color:#6b7280">${n.type_charge || ''}</td>
                  <td style="${SR}font-weight:600">${fmt(n.periodes)}</td>
                  <td style="${SR}color:#6b7280">${n.etp}</td>
                </tr>`).join('')}
            </tbody>
          </table>
          ${bilan_nomination ? `
          <div style="margin-top:8px;padding:8px 12px;border-radius:8px;background:${bilan_nomination.couvert ? '#f0fdf4' : '#fef2f2'};border:1px solid ${bilan_nomination.couvert ? '#bbf7d0' : '#fecaca'}">
            <table style="width:100%;font-size:11px">
              <tr>
                <td style="border:none;color:#374151">Équivalent ETP nommé</td>
                <td style="border:none;text-align:right;font-weight:600">${bilan_nomination.etp_nomme}</td>
                <td style="border:none;color:#374151;padding-left:20px">Couvert (dont RT ${bilan_nomination.etp_rt})</td>
                <td style="border:none;text-align:right;font-weight:600">${bilan_nomination.etp_couvert}</td>
                <td style="border:none;text-align:right;padding-left:20px;font-weight:700;color:${bilan_nomination.couvert ? '#16a34a' : '#dc2626'}">
                  ${bilan_nomination.couvert ? '✓ couvert' : `manque ${bilan_nomination.etp_manque} ETP (~${Math.round(bilan_nomination.etp_manque*800)} pér. CT)`}
                </td>
              </tr>
            </table>
          </div>` : ''}
        </div>` : ''}
      </div>
      </td></tr></tbody>
      <tfoot><tr><td><div class="footer-iip">${piedHtmlFiche}</div></td></tr></tfoot>
      </table>
      </body></html>`;

    if (returnOnly) return html;
    setFicheHtml({ html, nom: nomDoc('Fiche_attr', prof.nom, prof.prenom, annee), titre: `${prof.prenom || ''} ${prof.nom || ''}`.trim(), sousTitre: `Fiche attributions IIP · ${annee}` });
  }
  const canEdit = me?.role === 'admin' || me?.role === 'editeur';

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
  async function imprimerSelectionFiches(type) {
    if (selection.size === 0) return;
    setPrinting(true);
    try {
      const annee = getAnnee() || '';
      const corps = [];
      for (const profId of selection) {
        let html;
        if (type === 'HELB') html = await genererFicheAttributions(profId, 'HELB', true);
        else if (type === 'GLOBAL') html = await genererFicheAttributions(profId, null, true);
        else html = await genererFicheAttributions(profId, 'IIP', true);
        if (!html) continue;
        // Extraire le corps : du <body> jusqu'à </body>
        const i1 = html.indexOf('<body>');
        const i2 = html.lastIndexOf('</body>');
        const corpsHtml = (i1 >= 0 && i2 > i1) ? html.slice(i1 + 6, i2) : html;
        corps.push(`<div style="page-break-after:always">${corpsHtml}</div>`);
      }
      if (corps.length === 0) { alert('Aucune fiche à imprimer pour ce type.'); setPrinting(false); return; }
      const doc = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
        *{box-sizing:border-box;margin:0;padding:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}
        body{font-family:'Segoe UI',Arial,sans-serif;font-size:11px;color:#111827}
        table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb}
        @media print{@page{size:A4 landscape;margin:10mm}tr{page-break-inside:avoid}thead{display:table-header-group}}
        </style></head><body>${corps.join('')}</body></html>`;
      const label = type === 'GLOBAL' ? 'Globales' : type;
      setFicheHtml({ html: doc, nom: `Fiches_${label}_${annee}_${selection.size}profs` });
    } catch (e) { alert('Erreur : ' + e.message); }
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
    } catch (e) { alert('Erreur ZIP : ' + e.message); }
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
      if (erreurs > 0) alert(`${erreurs} contrat(s) n'ont pas pu être générés (voir la console pour le détail).`);
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setContratsZipEnCours(false); }
  }

  async function imprimerAttributions() {
    if (selection.size === 0) return;
    setPrinting(true);
    try {
      const ids = [...selection].join(',');
      const annee = getAnnee() || '';
      const data = await api.professeursAttributions(ids, annee);
      ouvrirFeuilleImpression(data);
    } catch (e) { alert('Erreur : ' + e.message); }
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
    // Filtre ancienneté
    if (fAnc) arr = arr.filter(p => (Number(p.anciennete_25_26_po) || 0) > 0);

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
  }, [profs, sortBy, search, fContrat, fCharge, fSection, fAnc]);

  // Séparation : profs avec charge (affichés) / sans charge (volet repliable)
  const avecCharge = useMemo(() => filtered.filter(p => charge(p) > 0), [filtered]);
  const sansCharge = useMemo(() => filtered.filter(p => charge(p) === 0), [filtered]);
  // Quand un filtre "sans charge" est actif, on affiche tout dans la liste principale
  const listePrincipale = fCharge === 'sans' ? filtered : avecCharge;

  async function handleDelete(p) {
    if (!confirm(`Supprimer ${p.nom_prenom} ? Cette action est irréversible.`)) return;
    setDeleting(p.id);
    try {
      await api.deleteProfesseur(p.id);
      load();
    } catch (e) { alert('Erreur : ' + e.message); }
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
      <tr key={p.id} className={
        designer ? 'bg-orange-50/40 hover:bg-orange-50' :
        nouveau  ? 'bg-green-50 hover:bg-green-100/70' :
        p.statut === 'EXP' ? 'bg-slate-100/60 hover:bg-slate-200/60' :
        'hover:bg-gray-50'
      }>
        <td className="text-center">
          <input type="checkbox" checked={selection.has(p.id)} onChange={() => toggleSelect(p.id)} />
        </td>
        <td className="font-medium">
          {designer ? (
            <span className="inline-flex items-center gap-2">
              <span className="bg-orange-100 text-orange-700 border border-orange-300 rounded-full px-3 py-0.5 text-xs font-bold">
                À désigner
              </span>
            </span>
          ) : (
            <button onClick={() => setDetailId(p.id)} className="hover:text-iip-gold hover:underline text-left flex items-center gap-2">
              {p.nom_prenom}
              {nouveau && (
                <span className="bg-green-600 text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wide flex-shrink-0">
                  NEW
                </span>
              )}
            </button>
          )}
        </td>
        <td>
          <div className="flex items-center gap-1 flex-wrap">
            {p.missions_libelles && p.missions_libelles.split(',').filter(Boolean).map((f, i) => {
              const label = f.trim().split(' ').map(w => w[0]).join('').slice(0, 3).toUpperCase();
              return <span key={i} title={f.trim()} className="inline-flex items-center justify-center min-w-7 h-7 px-1 rounded text-[10px] font-bold" style={{background:'#00AACC',color:'white'}}>{label}</span>;
            })}
            {(p.contrats_annee || p.statut || '').split(',').filter(c => ['CC','EXP','MDP'].includes(c)).map(c => (
              <span key={c} className={`inline-flex items-center justify-center w-7 h-7 rounded text-[10px] font-bold ${c === 'CC' ? 'badge-iip' : c === 'EXP' ? 'badge-exp' : 'badge-helb'}`}>{c}</span>
            ))}
            {!p.missions_libelles && !p.contrats_annee && !p.statut && (
              <span className="text-gray-300 text-xs">—</span>
            )}
          </div>
        </td>
        <td className="num">{Number(p.total_per_annee ?? p.total_per_iip ?? 0).toLocaleString('fr-BE')}</td>
        <td className="num">{Number(p.total_hrs_helb || 0).toLocaleString('fr-BE')}</td>
        <td className="num">{p.anciennete_25_26_po || 0}</td>
        <td className="text-center">
          <div className="flex items-center justify-center gap-2 relative">
            <button onClick={() => setFicheMenu(ficheMenu === p.id ? null : p.id)}
              className="text-gray-400 hover:text-iip-mauve" title="Fiche d'attributions">
              <IconPrinter size={15} />
            </button>
            {ficheMenu === p.id && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setFicheMenu(null)} />
                <div className="absolute z-50 bottom-full right-0 mb-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1.5 px-1.5 w-40 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
                  <button onClick={() => { genererFicheAttributions(p.id, null); setFicheMenu(null); }}
                    className="text-left px-2 py-1.5 h-9 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-white">Global</span>
                    <span className="text-gray-600 text-xs">IIP + HELB</span>
                  </button>
                  <button onClick={() => { genererFicheAttributions(p.id, 'IIP'); setFicheMenu(null); }}
                    className="text-left px-2 py-1.5 h-9 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-iip-turquoise/10 text-iip-blue">IIP</span>
                    <span className="text-gray-600 text-xs">Contrat IIP</span>
                  </button>
                  <button onClick={() => { genererFicheAttributions(p.id, 'HELB'); setFicheMenu(null); }}
                    className="text-left px-2 py-1.5 h-9 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">HELB</span>
                    <span className="text-gray-600 text-xs">Contrat HELB</span>
                  </button>
                </div>
              </>
            )}
            {canEdit && (
              <button onClick={() => setEditProf(p)}
                className="text-iip-gold hover:text-iip-amber text-sm" title="Modifier"><IconEdit size={15}/></button>
            )}
            {canEdit && (
              <button onClick={() => handleDelete(p)} disabled={deleting === p.id}
                className="text-red-400 hover:text-red-600 text-sm disabled:opacity-30" title="Supprimer"><IconTrash size={15}/></button>
            )}
          </div>
        </td>
      </tr>
    );
  }

  return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral
        icon={IconUsers}
        titre="Personnel"
        sousTitre={`${filtered.length} membre${filtered.length > 1 ? 's' : ''}`}
        extra={canEdit && (
          <button onClick={() => setEditProf({ ...EMPTY })}
            title="Nouveau membre du personnel"
            className="w-full flex items-center gap-2 bg-green-600 hover:opacity-90 text-white text-[13px] font-medium px-3 py-2 rounded-lg transition">
            <IconUserPlus size={16} className="flex-shrink-0" />
            <span className="whitespace-nowrap opacity-0 group-hover/rail:opacity-100 transition-opacity duration-150">Nouveau membre</span>
          </button>
        )}
        sections={[
          { label: 'Contrat', items: [
            { key: 'c-',     label: 'Tous contrats',  icon: IconUsers,        actif: fContrat === '',      onClick: () => setFContrat('') },
            { key: 'c-IIP',  label: 'IIP seul',       icon: IconBuilding,     actif: fContrat === 'IIP',   onClick: () => setFContrat('IIP') },
            { key: 'c-HELB', label: 'HELB seul',      icon: IconBuildingBank, actif: fContrat === 'HELB',  onClick: () => setFContrat('HELB') },
            { key: 'c-mix',  label: 'IIP + HELB',     icon: IconFileDescription, actif: fContrat === 'mixte', onClick: () => setFContrat('mixte') },
          ]},
          { label: 'Charge', items: [
            { key: 'ch-',    label: 'Toutes',         icon: IconUsers, actif: fCharge === '',     onClick: () => setFCharge('') },
            { key: 'ch-av',  label: 'Avec charge',    icon: IconCheck, actif: fCharge === 'avec', onClick: () => setFCharge('avec') },
            { key: 'ch-sa',  label: 'Sans charge',    icon: IconX,     actif: fCharge === 'sans', onClick: () => setFCharge('sans') },
          ]},
          ...((getUser()?.role === 'admin' || getUser()?.acces_recrutement) ? [{ label: 'Module', items: [
            { key: 'nav-recrutement', label: 'Recrutement', icon: IconBriefcase, couleur: '#16a34a', actif: false, onClick: () => navigate('/recrutement') },
          ]}] : []),
        ]}
      />
      <div className="ml-16 p-4 md:p-6">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-title text-iip-gold">
          Membres du personnel <span className="text-base font-normal text-gray-400">({filtered.length})</span>
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
          <label className="inline-flex items-center gap-1.5 text-sm text-gray-600 border border-gray-300 rounded-lg px-2.5 py-1.5 h-9 cursor-pointer hover:bg-gray-50">
            <input type="checkbox" checked={fAnc} onChange={e => setFAnc(e.target.checked)} />
            Avec ancienneté
          </label>
          {(fContrat || fCharge || fSection || fAnc) && (
            <button onClick={() => { setFContrat(''); setFCharge(''); setFSection(''); setFAnc(false); }}
              className="text-xs text-gray-500 hover:text-gray-700 underline">Réinitialiser</button>
          )}
          {selection.size > 0 && (
            <div className="flex items-center gap-2">
              {/* Contrats PDF — un vrai PDF par prof, en ZIP */}
              {u?.role === 'admin' && (
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
                    <div className="absolute z-50 top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1.5 px-1.5 w-44 flex flex-col gap-1">
                      <div className="text-[10px] text-gray-400 uppercase px-2 pt-0.5 pb-1">PDF combiné</div>
                      <button onClick={() => imprimerSelectionFiches('GLOBAL')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-white">Global</span><span className="text-gray-600 text-xs">IIP + HELB</span>
                      </button>
                      <button onClick={() => imprimerSelectionFiches('IIP')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-iip-turquoise/10 text-iip-blue">IIP</span><span className="text-gray-600 text-xs">Contrat IIP</span>
                      </button>
                      <button onClick={() => imprimerSelectionFiches('HELB')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">HELB</span><span className="text-gray-600 text-xs">Contrat HELB</span>
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
                    <div className="absolute z-50 top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1.5 px-1.5 w-48 flex flex-col gap-1">
                      <div className="text-[10px] text-gray-400 uppercase px-2 pt-0.5 pb-1">1 fichier par prof</div>
                      <button onClick={() => exporterZip('GLOBAL')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-gray-700 text-white">Global</span><span className="text-gray-600 text-xs">IIP + HELB</span>
                      </button>
                      <button onClick={() => exporterZip('IIP')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-iip-turquoise/10 text-iip-blue">IIP</span><span className="text-gray-600 text-xs">Contrat IIP</span>
                      </button>
                      <button onClick={() => exporterZip('HELB')} className="text-left px-2 py-1.5 rounded hover:bg-gray-50 text-sm flex items-center gap-2">
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-purple-100 text-purple-700">HELB</span><span className="text-gray-600 text-xs">Contrat HELB</span>
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>

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
                <Th k="total_per_annee" num>Total année</Th>
                <Th k="total_hrs_helb" num>HELB (hrs)</Th>
                <Th k="anciennete_25_26_po" num>Anc. PO</Th>
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

      {detailId && (
        <DetailModal profId={detailId} onClose={() => setDetailId(null)}
          onFiche={genererFicheAttributions}
          onEdit={p => { setDetailId(null); setEditProf(p); }} />
      )}

      {editProf !== null && (
        <ProfFicheModal prof={editProf} onClose={() => setEditProf(null)}
          onSaved={() => { setEditProf(null); load(); }} />
      )}
      {ficheHtml && <PreviewModal html={ficheHtml.html||ficheHtml} titre={ficheHtml.titre || "Fiche d'attributions"} sousTitre={ficheHtml.sousTitre} nomFichier={ficheHtml.nom} onClose={() => setFicheHtml(null)} />}
      </div>
    </div>
  );
}

