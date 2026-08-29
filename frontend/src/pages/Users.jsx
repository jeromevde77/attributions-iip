import { useEffect, useState } from 'react';
import { getUser } from '../lib/api.js';
import { IconPlus, IconKey, IconTrash, IconAlertTriangle } from '@tabler/icons-react';
import { MODULES_ACCES, PLAFOND_ROLE, droitEffectif, LIBELLE_DROIT } from '../lib/modules.js';

const ROLE_LABEL = {
  admin: 'Administrateur',
  editeur: 'Éditeur',
  coordination: 'Coordination',
  consultation: 'Consultation'
};

function authFetch(path, opts = {}) {
  return fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${localStorage.getItem('token')}`,
      ...opts.headers
    }
  }).then(async r => {
    const d = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(d.error || r.statusText);
    return d;
  });
}

export default function Users({ embedded = false }) {
  const me = getUser();
  const [users, setUsers] = useState([]);
  const [allSections, setAllSections] = useState([]);
  const [profils, setProfils] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ email: '', nom_complet: '', role: 'editeur', password: '', sections: [] });
  const [editingSections, setEditingSections] = useState(null); // {userId, sections} quand on édite le périmètre
  const [error, setError] = useState('');

  async function load() {
    setLoading(true);
    try {
      const [u, s, p] = await Promise.all([
        authFetch('/api/users'),
        authFetch('/api/ref/sections'),
        authFetch('/api/profils-acces'),
      ]);
      setUsers(u); setAllSections(s); setProfils(Array.isArray(p) ? p : []);
    }
    catch (e) { setError(e.message); }
    finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  async function createUser() {
    setError('');
    if (!form.email || !form.password) { setError('Email et mot de passe requis'); return; }
    if (form.role === 'coordination' && form.sections.length === 0) {
      setError('Une coordination doit avoir au moins une section assignée.'); return;
    }
    try {
      await authFetch('/api/users', { method: 'POST', body: JSON.stringify(form) });
      setShowForm(false);
      setForm({ email: '', nom_complet: '', role: 'editeur', password: '', sections: [] });
      load();
    } catch (e) { setError(e.message); }
  }

  async function toggleActif(u) {
    await authFetch(`/api/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ actif: !u.actif }) });
    load();
  }

  async function resetPassword(u) {
    const pwd = prompt(`Nouveau mot de passe pour ${u.email} :`);
    if (!pwd) return;
    await authFetch(`/api/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ password: pwd }) });
    alert('Mot de passe mis à jour.');
  }

  async function changeRole(u, role) {
    await authFetch(`/api/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ role }) });
    load();
  }

  async function saveSections() {
    if (!editingSections) return;
    try {
      await authFetch(`/api/users/${editingSections.userId}`, {
        method: 'PATCH',
        body: JSON.stringify({ sections: editingSections.sections })
      });
      setEditingSections(null);
      load();
    } catch (e) { alert(e.message); }
  }

  function toggleSectionInForm(code) {
    setForm(f => ({
      ...f,
      sections: f.sections.includes(code)
        ? f.sections.filter(s => s !== code)
        : [...f.sections, code]
    }));
  }

  function toggleSectionInEdit(code) {
    setEditingSections(es => ({
      ...es,
      sections: es.sections.includes(code)
        ? es.sections.filter(s => s !== code)
        : [...es.sections, code]
    }));
  }

  async function deleteUser(u) {
    if (!confirm(
      `Retirer l'accès de ${u.email} ?\n\n`
      + `Si ce compte a signé des attributions ou des modifications, il sera désactivé `
      + `plutôt que supprimé : son nom doit rester lisible dans l'historique.`)) return;
    try {
      const j = await authFetch(`/api/users/${u.id}`, { method: 'DELETE' });
      if (j?.message) alert(j.message);
      load();
    } catch (e) { alert(e.message); }
  }

  // Un compte rattaché à un membre du personnel se règle depuis sa fiche.
  // Ne restent ici que les comptes qui n'ont pas de fiche où aller :
  // administrateurs techniques, prestataire extérieur.
  const comptesSansFiche = (users || []).filter(u => !u.professeur_id);

  if (me?.role !== 'admin') {
    return <div className="p-6 max-w-none mx-auto text-center text-gray-500">Accès réservé aux administrateurs.</div>;
  }

  return (
    <div className={embedded ? 'p-4 space-y-4' : 'p-6 space-y-4'}>
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex-1 min-w-[320px]">
          {!embedded && <h1 className="text-2xl font-title text-iip-gold mb-2">Accès à Lucie</h1>}
          <div className="px-3 py-2 rounded-lg bg-sky-50 border border-sky-200 text-[12px] text-sky-900">
            Les accès d'un membre du personnel se règlent depuis sa fiche, onglet « Accès Lucie »,
            ou directement dans le tableau ci-dessous. Le bouton ne sert qu'aux comptes sans
            fiche : administrateur technique, prestataire extérieur.
          </div>
        </div>
        <button onClick={() => setShowForm(true)}
          className="flex-none bg-iip-gold hover:bg-iip-amber text-white text-sm px-4 py-2 rounded-lg font-medium inline-flex items-center gap-1.5">
          <IconPlus size={16} /> Compte sans fiche
        </button>
      </div>

      {error && <div className="bg-red-50 text-red-700 text-sm rounded p-3 mb-3">{error}</div>}


      {showForm && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30" onClick={() => setShowForm(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-title text-iip-gold mb-1">Compte sans fiche de personnel</h2>
            <p className="text-[12px] text-slate-500 mb-4">
              Pour un administrateur technique ou un prestataire extérieur. Pour un membre du
              personnel, créez l'accès depuis sa fiche.
            </p>
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Nom complet</label>
                <input value={form.nom_complet} onChange={e => setForm({...form, nom_complet: e.target.value})}
                       className="w-full border border-gray-300 rounded px-2 py-1.5 h-9 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Email *</label>
                <input type="email" value={form.email} onChange={e => setForm({...form, email: e.target.value})}
                       className="w-full border border-gray-300 rounded px-2 py-1.5 h-9 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Mot de passe initial *</label>
                <input type="text" value={form.password} onChange={e => setForm({...form, password: e.target.value})}
                       className="w-full border border-gray-300 rounded px-2 py-1.5 h-9 text-sm" />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-0.5">Rôle</label>
                <select value={form.role} onChange={e => setForm({...form, role: e.target.value})}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 h-9 text-sm">
                  {Object.entries(ROLE_LABEL).map(([k,l]) => <option key={k} value={k}>{l}</option>)}
                </select>
              </div>
              {form.role === 'coordination' && (
                <div>
                  <label className="block text-xs text-gray-600 mb-1">Sections autorisées *</label>
                  <div className="grid grid-cols-2 gap-1 max-h-48 overflow-auto border border-gray-200 rounded p-2">
                    {allSections.map(s => (
                      <label key={s.code} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 rounded">
                        <input type="checkbox" checked={form.sections.includes(s.code)}
                               onChange={() => toggleSectionInForm(s.code)} />
                        {s.code}
                      </label>
                    ))}
                  </div>
                  <p className="text-xs text-gray-400 mt-1">La coordination ne verra et ne gérera que ces sections.</p>
                </div>
              )}
            </div>
            {error && <div className="text-red-600 text-sm mt-2">{error}</div>}
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setShowForm(false)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
              <button onClick={createUser} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-5 py-2 rounded">Créer</button>
            </div>
          </div>
        </div>
      )}
      <MatriceAcces users={users} sectionsDispo={allSections} profils={profils}
        moiId={me?.id}
        onProfil={async (u, profilId) => {
          if (!profilId) return;
          const p = profils.find(x => String(x.id) === String(profilId));
          if (!p) return;
          if (!window.confirm(
            `Appliquer le profil « ${p.nom} » à ${u.nom_complet || u.email} ?\n\n`
            + `${p.description || ''}\n\nLe périmètre par sections reste inchangé.`)) return;
          try {
            await authFetch(`/api/users/${u.id}`, {
              method: 'PATCH',
              body: JSON.stringify({ role: p.role, permissions_json: JSON.stringify(p.permissions || {}) }),
            });
            load();
          } catch (e) { alert(e.message); }
        }}
        onBasculerActif={toggleActif}
        onMotDePasse={resetPassword}
        onRetirer={deleteUser}
        onModifie={async (id, champs) => {
          try {
            await authFetch(`/api/users/${id}`, { method: 'PATCH', body: JSON.stringify(champs) });
            load();
          } catch (e) { alert(e.message); }
        }} />

      {editingSections && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30" onClick={() => setEditingSections(null)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-title text-iip-gold mb-1">Périmètre — {editingSections.nom}</h2>
            <p className="text-xs text-gray-500 mb-4">Sections que cette coordination peut voir et gérer.</p>
            <div className="grid grid-cols-2 gap-1 max-h-64 overflow-auto border border-gray-200 rounded p-2">
              {allSections.map(s => (
                <label key={s.code} className="flex items-center gap-2 text-sm cursor-pointer hover:bg-gray-50 px-1 rounded">
                  <input type="checkbox" checked={editingSections.sections.includes(s.code)}
                         onChange={() => toggleSectionInEdit(s.code)} />
                  {s.code}
                </label>
              ))}
            </div>
            <div className="flex justify-end gap-2 mt-4">
              <button onClick={() => setEditingSections(null)} className="px-4 py-2 text-sm text-gray-600">Annuler</button>
              <button onClick={saveSections} className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-5 py-2 rounded">Enregistrer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Tableau des accès ──────────────────────────────────────────────────────
// Un seul tableau : les comptes techniques d'abord, puis les membres du
// personnel. Chaque case se modifie d'un clic — le droit tourne entre les
// valeurs que le rôle autorise — et la modification rejoint la fiche de la
// personne, puisque c'est la même donnée.
function MatriceAcces({ users, sectionsDispo, profils, onModifie, onBasculerActif, onMotDePasse, onRetirer, moiId }) {
  // Un profil est appliqué si le rôle correspond ET que les cases sont
  // identiques : sans quoi la personne a dérivé, et on l'affiche comme telle.
  function profilCourant(u) {
    const candidats = (profils || []).filter(p => p.role === u.role);
    let permsU = {};
    try {
      permsU = u.permissions_json
        ? (typeof u.permissions_json === 'string' ? JSON.parse(u.permissions_json) : u.permissions_json)
        : {};
    } catch { /* illisible */ }
    for (const p of candidats) {
      const memes = MODULES_ACCES.every(m => {
        const a = p.permissions?.[m.key] || {};
        const b = permsU[m.key] || {};
        return !!a.lire === !!b.lire && !!a.ecrire === !!b.ecrire;
      });
      if (memes) return String(p.id);
    }
    return '';
  }

  const [enCours, setEnCours] = useState(null);       // "id|module" en cours d'écriture
  const [perimetreOuvert, setPerimetreOuvert] = useState(null);

  const actifs = (users || []).filter(u => u.actif);
  const techniques = actifs.filter(u => !u.professeur_id);
  const personnel = actifs.filter(u => u.professeur_id);
  if (!actifs.length) return null;

  // Le rôle fixe le plafond ; on ne propose que ce qu'il autorise.
  function cycle(u, module) {
    const plafond = (PLAFOND_ROLE[u.role] || PLAFOND_ROLE.consultation)(module);
    if (plafond === 'rien') return null;
    const suite = plafond === 'lit' ? ['rien', 'lit'] : ['rien', 'lit', plafond];
    const actuel = droitEffectif(u, module);
    return suite[(suite.indexOf(actuel) + 1) % suite.length];
  }

  async function basculer(u, module) {
    const suivant = cycle(u, module);
    if (!suivant) return;
    setEnCours(`${u.id}|${module}`);
    try {
      let perms = {};
      try {
        perms = u.permissions_json
          ? (typeof u.permissions_json === 'string' ? JSON.parse(u.permissions_json) : u.permissions_json)
          : {};
      } catch { /* illisible : on repart de zéro pour ce module */ }

      perms[module] = suivant === 'rien' ? { lire: false, ecrire: false }
        : suivant === 'lit' ? { lire: true, ecrire: false }
        : { lire: true, ecrire: true };

      await onModifie(u.id, { permissions_json: JSON.stringify(perms) });
    } finally { setEnCours(null); }
  }

  const Ligne = ({ u }) => (
    <tr className="hover:bg-slate-50/60">
      <td className="sticky left-0 bg-white border-r border-b border-slate-100 px-3 py-1.5">
        <div className="text-[12.5px] text-slate-800 truncate max-w-[180px]">
          {u.nom_complet || u.email}
        </div>
        <div className="text-[10px] text-slate-400 truncate max-w-[180px]" title={u.email}>
          {u.role} · {u.email}
        </div>
      </td>

      {/* Profil : il pose le rôle et les cases d'un coup. Croisé avec le
          périmètre de la colonne suivante, il donne « coordination sur TIM ». */}
      <td className="border-b border-slate-100 px-2 py-1.5">
        <select value={profilCourant(u)} disabled={u.id === moiId}
          onChange={e => onProfil(u, e.target.value)}
          className="w-full border border-slate-200 rounded px-1.5 py-1 text-[11px] bg-white">
          <option value="">— personnalisé —</option>
          {(profils || []).map(p => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
      </td>

      {/* Périmètre, modifiable en regard du nom */}
      <td className="border-b border-slate-100 px-2 py-1.5 relative">
        <button onClick={() => setPerimetreOuvert(perimetreOuvert === u.id ? null : u.id)}
          className="text-[10.5px] text-left hover:text-iip-blue underline decoration-dotted">
          {u.sections?.length
            ? u.sections.join(', ')
            : <span className="text-slate-400">toutes</span>}
        </button>

        {perimetreOuvert === u.id && (
          <div className="absolute z-30 left-2 top-9 bg-white border border-slate-300 rounded-lg shadow-lg p-2 w-56">
            <div className="text-[10px] uppercase tracking-wide text-slate-500 mb-1.5">Sections</div>
            <label className="flex items-center gap-1.5 text-[11.5px] mb-1.5">
              <input type="checkbox" checked={!u.sections?.length}
                onChange={() => onModifie(u.id, { sections: [] })} />
              Toutes les sections
            </label>
            <div className="flex flex-wrap gap-1">
              {(sectionsDispo || []).map(s => {
                const dedans = (u.sections || []).includes(s.code);
                return (
                  <button key={s.code}
                    onClick={() => onModifie(u.id, {
                      sections: dedans
                        ? (u.sections || []).filter(x => x !== s.code)
                        : [...(u.sections || []), s.code],
                    })}
                    className={`text-[10.5px] px-1.5 py-0.5 rounded-full border ${
                      dedans ? 'bg-iip-blue text-white border-iip-blue'
                             : 'border-slate-200 text-slate-400 hover:border-iip-blue'}`}>
                    {s.code}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setPerimetreOuvert(null)}
              className="mt-2 w-full text-[11px] py-1 rounded border border-slate-300 text-slate-600">
              Fermer
            </button>
          </div>
        )}
      </td>

      <td className="border-b border-slate-100 px-2 py-1.5 text-center">
        <button onClick={() => onBasculerActif(u)} disabled={u.id === moiId}
          className={`text-[10px] px-1.5 py-0.5 rounded ${u.actif
            ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'}`}
          title={u.id === moiId ? 'Votre propre compte' : 'Activer ou désactiver'}>
          {u.actif ? 'actif' : 'inactif'}
        </button>
      </td>

      {MODULES_ACCES.map(m => {
        const droit = droitEffectif(u, m.key);
        const d = LIBELLE_DROIT[droit] || LIBELLE_DROIT.rien;
        const modifiable = !!cycle(u, m.key);
        const occupe = enCours === `${u.id}|${m.key}`;
        return (
          <td key={m.key} className="border-b border-slate-100 px-1 py-1.5 text-center">
            <button onClick={() => modifiable && basculer(u, m.key)}
              disabled={!modifiable || occupe}
              title={modifiable
                ? `${m.label} — cliquer pour changer`
                : `${m.label} — le rôle ${u.role} ne le permet pas`}
              className={`text-[9.5px] px-1.5 py-0.5 rounded transition ${d.cls} ${
                modifiable ? 'hover:ring-2 hover:ring-iip-turquoise/40 cursor-pointer' : 'cursor-default'}`}>
              {occupe ? '…' : d.texte}
            </button>
          </td>
        );
      })}

      <td className="border-b border-l border-slate-100 px-2 py-1.5 whitespace-nowrap text-right">
        <button onClick={() => onMotDePasse(u)} title="Réinitialiser le mot de passe"
          className="text-[10.5px] text-iip-blue hover:underline mr-2">MDP</button>
        {u.id !== moiId && (
          <button onClick={() => onRetirer(u)} title="Retirer l'accès"
            className="text-slate-300 hover:text-red-500 align-middle">
            <IconTrash size={13} />
          </button>
        )}
        <div className="text-[9.5px] text-slate-400">
          {u.last_login_at ? u.last_login_at.slice(0, 10) : 'jamais connecté'}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="px-4 pb-4">
      <div className="border border-slate-200 rounded-xl overflow-visible">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200">
          <span className="text-[13px] font-semibold text-iip-blue">
            Accès — {actifs.length} compte(s) actif(s)
          </span>
          <span className="text-[11px] text-slate-500 ml-2">
            cliquez une case pour changer le droit, ou le périmètre en regard du nom
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="text-sm border-collapse w-full">
            <thead>
              <tr className="bg-white">
                <th className="sticky left-0 bg-white border-b border-r border-slate-200 px-3 py-2 text-left min-w-[190px]">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Personne</span>
                </th>
                <th className="border-b border-slate-200 px-2 py-2 w-36">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Profil</span>
                </th>
                <th className="border-b border-slate-200 px-2 py-2 w-28">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Périmètre</span>
                </th>
                <th className="border-b border-slate-200 px-2 py-2 w-16">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">État</span>
                </th>
                {MODULES_ACCES.map(m => (
                  <th key={m.key} className="border-b border-slate-200 px-1 py-2 w-20" title={m.desc}>
                    <div className="flex justify-center text-slate-400"><m.Icone size={14} stroke={1.6} /></div>
                    <div className="text-[9px] text-slate-500 leading-tight">{m.label}</div>
                  </th>
                ))}
                <th className="border-b border-l border-slate-200 px-2 py-2 w-24">
                  <span className="text-[10px] uppercase tracking-wide text-slate-500">Compte</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {techniques.map(u => <Ligne key={u.id} u={u} />)}

              {techniques.length > 0 && personnel.length > 0 && (
                <tr>
                  <td colSpan={5 + MODULES_ACCES.length}
                    className="bg-slate-100 border-y border-slate-300 px-3 py-1 text-[10px] uppercase tracking-wide text-slate-500 font-semibold">
                    Membres du personnel — leurs accès se règlent aussi depuis leur fiche
                  </td>
                </tr>
              )}

              {personnel.map(u => <Ligne key={u.id} u={u} />)}
            </tbody>
          </table>
        </div>

        <div className="px-4 py-2 border-t border-slate-200 bg-slate-50 flex flex-wrap gap-3 text-[10.5px] text-slate-600">
          <span><span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800">écrit</span> modifie directement</span>
          <span><span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">validation</span> encode, la direction tranche</span>
          <span><span className="px-1.5 py-0.5 rounded bg-sky-100 text-sky-800">lit</span> consultation seule</span>
          <span className="text-slate-400">— aucun accès</span>
          <span className="flex-1 text-right italic">
            Une case grisée signale un droit que le rôle interdit : changez le rôle pour l'ouvrir.
          </span>
        </div>
      </div>
    </div>
  );
}
