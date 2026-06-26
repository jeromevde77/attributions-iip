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
  ['consultation', 'Consultation'],
  ['editeur', 'Éditeur'],
  ['coordination', 'Coordination'],
  ['admin', 'Administrateur'],
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
    const hasVoirTout = ['attributions', 'personnel'].includes(m.key);
    return (
      <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${p.lire || p.ecrire ? 'bg-iip-blue/5 border-iip-blue/20' : 'bg-gray-50 border-gray-100'}`}>
        <span className="text-base w-5 flex-shrink-0">{m.icon}</span>
        <div className="flex-1 min-w-0">
          <div className="text-xs font-semibold text-gray-700">{m.label}</div>
          <div className="text-[10px] text-gray-400">{m.desc}</div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={() => togglePerm(m.key, 'lire')}
            className={`text-[10px] px-2 py-0.5 rounded border font-medium transition ${
              p.lire ? 'bg-iip-blue text-white border-iip-blue' : 'border-gray-300 text-gray-400 hover:border-iip-blue'
            }`}>Lecture</button>
          <button onClick={() => togglePerm(m.key, 'ecrire')}
            className={`text-[10px] px-2 py-0.5 rounded border font-medium transition ${
              p.ecrire ? 'bg-iip-turquoise text-white border-iip-turquoise' : 'border-gray-300 text-gray-400 hover:border-iip-turquoise'
            }`}>Écriture</button>
          {hasVoirTout && (
            <button onClick={() => togglePerm(m.key, 'voir_tout')}
              className={`text-[10px] px-2 py-0.5 rounded border font-medium transition ${
                p.voir_tout ? 'bg-amber-500 text-white border-amber-500' : 'border-gray-300 text-gray-400 hover:border-amber-400'
              }`} title="Voir toutes les sections (sinon : ses sections seulement)">Tout voir</button>
          )}
        </div>
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

      {/* Sections (pour coordination) */}
      {role === 'coordination' && (
        <div>
          <div className="text-xs text-gray-500 mb-1">Sections autorisées</div>
          <div className="flex flex-wrap gap-1.5">
            {sectionsDispo.map(s => (
              <button key={s.code} type="button"
                onClick={() => setSections(prev => prev.includes(s.code) ? prev.filter(x => x !== s.code) : [...prev, s.code])}
                className={`text-xs px-2 py-0.5 rounded-full border ${sections.includes(s.code) ? 'bg-iip-turquoise/15 border-iip-turquoise text-iip-blue' : 'border-gray-300 text-gray-500'}`}>
                {s.code}
              </button>
            ))}
          </div>
        </div>
      )}

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
  const [representant, setRepresentant] = useState('Charles Sohet, Directeur a.i.');
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

  async function genererContrat() {
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
      setShowContratModal(false);
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setGeneratingContrat(false); }
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
                <button onClick={() => setShowContratModal(true)}
                  className="w-full flex items-center gap-2 text-xs bg-green-50 hover:bg-green-100 text-green-700 border border-green-200 rounded-lg px-3 py-2 font-medium transition">
                  <IconFileText size={14}/> Générer contrat
                </button>
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

      {/* ── Modale contrat ── */}
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
      </style></head><body>
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
      </style></head><body>
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
      </style></head><body>
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
        <td className="text-xs text-gray-600">{p.adresse_mail || '—'}</td>
        <td className="text-xs text-gray-600">{p.commune || '—'}</td>
        <td className="text-center">
          {p.capaes === 'x'
            ? <span className="text-green-600 text-xs font-semibold">✓</span>
            : <span className="text-gray-300 text-xs">—</span>}
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
                <div className="absolute z-50 top-full right-0 mt-1 bg-white border border-gray-200 rounded-lg shadow-xl py-1.5 h-9 px-1.5 w-40 flex flex-col gap-1" onClick={e => e.stopPropagation()}>
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
                <Th k="adresse_mail">Email</Th>
                <Th k="commune">Commune</Th>
                <th className="text-center">CAPAES</th>
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

