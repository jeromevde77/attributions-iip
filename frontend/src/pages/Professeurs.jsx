import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, getAnnee, getUser } from '../lib/api.js';

const EMPTY = {
  nom: '', prenom: '', adresse_mail: '', mail_prive: '',
  statut: '', adresse_rue: '', code_postal: '', commune: '',
  capaes: '', anciennete_25_26_po: 0,
  matricule: '', titre1: '', titre2: '', titre3: '', statut_ea12: ''
};

function EditModal({ prof, onClose, onSaved }) {
  const isNew = !prof?.id;
  const [form, setForm] = useState(prof ? {
    nom: prof.nom || '', prenom: prof.prenom || '',
    adresse_mail: prof.adresse_mail || '', mail_prive: prof.mail_prive || '',
    statut: prof.statut || '', adresse_rue: prof.adresse_rue || '',
    code_postal: prof.code_postal || '', commune: prof.commune || '',
    capaes: prof.capaes || '', anciennete_25_26_po: prof.anciennete_25_26_po || 0,
    matricule: prof.matricule || '', titre1: prof.titre1 || '', titre2: prof.titre2 || '',
    titre3: prof.titre3 || '', statut_ea12: prof.statut_ea12 || ''
  } : { ...EMPTY });
  const [saving, setSaving] = useState(false);

  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nom.trim() || !form.prenom.trim()) return alert('Nom et prénom requis');
    setSaving(true);
    try {
      if (isNew) {
        await api.createProfesseur(form);
      } else {
        await api.updateProfesseur(prof.id, form);
      }
      onSaved();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  const Field = ({ label, k, type = 'text', options }) => (
    <div>
      <label className="block text-xs text-gray-600 mb-0.5">{label}</label>
      {options ? (
        <select value={form[k]} onChange={e => set(k, e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
          {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
        </select>
      ) : (
        <input type={type} value={form[k]} onChange={e => set(k, e.target.value)}
          className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold" />
      )}
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full border-t-4 border-iip-gold overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
          <h2 className="font-title text-lg text-iip-gold">
            {isNew ? 'Nouveau professeur' : `Modifier — ${prof.nom_prenom || prof.nom + ' ' + prof.prenom}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
        </div>
        <form onSubmit={handleSubmit} className="p-5 space-y-3 overflow-auto max-h-[calc(100vh-180px)]">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nom *" k="nom" />
            <Field label="Prénom *" k="prenom" />
          </div>
          <Field label="Email professionnel" k="adresse_mail" type="email" />
          <Field label="Email privé" k="mail_prive" type="email" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Statut" k="statut" options={[
              ['', '— Non défini —'], ['CC', 'CC — Chargé de cours'], ['EXP', 'EXP — Expert']
            ]} />
            <div>
              <label className="block text-xs text-gray-600 mb-0.5">CAPAES</label>
              <select value={form.capaes} onChange={e => set('capaes', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
                <option value="">—</option>
                <option value="x">Oui</option>
              </select>
            </div>
          </div>
          <Field label="Adresse" k="adresse_rue" />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Code postal" k="code_postal" />
            <Field label="Commune" k="commune" />
          </div>
          <div>
            <label className="block text-xs text-gray-600 mb-0.5">Ancienneté PO 25-26</label>
            <input type="number" min="0" value={form.anciennete_25_26_po}
              onChange={e => set('anciennete_25_26_po', Number(e.target.value))}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold" />
          </div>
          <div className="pt-2 mt-1 border-t border-gray-100">
            <div className="text-xs font-semibold text-iip-gold mb-2">Données EA12 (documents officiels)</div>
            <Field label="Matricule enseignant (11 chiffres)" k="matricule" />
            <div className="mt-2"><Field label="Titre de capacité 1" k="titre1" /></div>
            <div className="mt-2"><Field label="Titre de capacité 2" k="titre2" /></div>
            <div className="mt-2"><Field label="Titre de capacité 3" k="titre3" /></div>
            <div className="mt-2">
              <label className="block text-xs text-gray-600 mb-0.5">Statut EA12</label>
              <select value={form.statut_ea12} onChange={e => set('statut_ea12', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
                <option value="">—</option>
                {['T', 'TPr', 'St', 'D', 'ACS', 'APE', 'PTP'].map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button type="submit" disabled={saving}
              className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
              {saving ? 'Sauvegarde…' : isNew ? 'Créer' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function DetailModal({ profId, onClose, onEdit }) {
  const [detail, setDetail] = useState(null);
  const navigate = useNavigate();
  const u = getUser();
  useEffect(() => {
    api.professeur(profId).then(setDetail).catch(e => alert(e.message));
  }, [profId]);

  async function nouvelEA12() {
    try {
      const { id } = await api.ea12Create({ professeur_id: profId, annee_scolaire: getAnnee(), variante: 'bis', donnees: {} });
      navigate(`/ea12/${id}`);
    } catch (e) { alert('Erreur : ' + e.message); }
  }

  if (!detail) return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-30">
      <div className="bg-white rounded-xl p-8 text-gray-400">Chargement…</div>
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-30"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-5xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-start justify-between px-6 py-4 border-b border-gray-100">
          <div>
            <h2 className="text-xl font-title text-iip-gold">{detail.nom_prenom}</h2>
            <div className="flex items-center gap-3 mt-1 text-sm text-gray-500 flex-wrap">
              {detail.adresse_mail && <span>✉ {detail.adresse_mail}</span>}
              {detail.statut && <span className="badge badge-iip">{detail.statut}</span>}
              {detail.capaes === 'x' && <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">CAPAES</span>}
              {detail.commune && <span>📍 {detail.code_postal} {detail.commune}</span>}
            </div>
          </div>
          <div className="flex gap-2 flex-shrink-0">
            {u?.role === 'admin' && (
              <button onClick={nouvelEA12}
                className="bg-iip-mauve hover:opacity-90 text-white text-sm px-3 py-1.5 rounded">
                + Nouvel EA12
              </button>
            )}
            <button onClick={() => onEdit(detail)}
              className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-3 py-1.5 rounded">
              ✏ Modifier
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none ml-2">×</button>
          </div>
        </div>

        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3 px-6 py-3 border-b border-gray-100">
          <div className="bg-iip-gold/10 rounded p-2.5 text-center">
            <div className="text-xs text-gray-600">Total IIP</div>
            <div className="font-bold text-lg text-iip-gold">{detail.total_per_iip ?? 0} per.</div>
          </div>
          <div className="bg-iip-mauve/10 rounded p-2.5 text-center">
            <div className="text-xs text-gray-600">Total HELB</div>
            <div className="font-bold text-lg text-iip-mauve">{detail.total_hrs_helb ?? 0} hrs</div>
          </div>
          <div className="bg-gray-50 rounded p-2.5 text-center">
            <div className="text-xs text-gray-600">Ancienneté PO</div>
            <div className="font-bold text-lg">{detail.anciennete_25_26_po ?? 0}</div>
          </div>
        </div>

        {/* Attributions */}
        <div className="flex-1 overflow-auto px-6 py-3">
          <h3 className="font-semibold text-sm mb-2 text-gray-700">
            Attributions ({detail.attributions?.length || 0})
          </h3>
          <table className="grid-excel w-full text-sm">
            <thead><tr>
              <th className="text-left">Section</th>
              <th className="text-left">UE</th>
              <th className="text-left">Cours</th>
              <th className="text-left">Activité</th>
              <th>Type</th>
              <th>Gr.</th>
              <th className="text-right">Per.</th>
              <th className="text-right">Aut.</th>
              <th className="text-right">Total</th>
            </tr></thead>
            <tbody>
              {detail.attributions?.length === 0 && (
                <tr><td colSpan="9" className="text-center text-gray-400 py-4">Aucune attribution</td></tr>
              )}
              {detail.attributions?.map(a => (
                <tr key={a.id}>
                  <td>{a.section}</td>
                  <td className="font-mono text-xs">{a.ue_num}</td>
                  <td className="text-xs truncate max-w-[200px]">{a.nom_cours}</td>
                  <td className="text-xs text-gray-500">{a.activite_nom || '—'}</td>
                  <td className="text-center">
                    {a.type_cours && <span className={`badge ${a.type_cours==='CT'?'badge-ct':'badge-pp'}`}>{a.type_cours}</span>}
                  </td>
                  <td className="text-center">{a.code || '—'}</td>
                  <td className="num">{a.periodes_attribuees}</td>
                  <td className="num">{a.autonomie_attribuee}</td>
                  <td className="num font-semibold">{a.total_attribue_professeur}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function Professeurs() {
  const [profs, setProfs] = useState([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [detailId, setDetailId] = useState(null);
  const [editProf, setEditProf] = useState(null);   // null = fermé, {} = nouveau, {...} = existant
  const [sortBy, setSortBy] = useState({ key: 'nom_prenom', dir: 'asc' });
  const [deleting, setDeleting] = useState(null);

  const me = JSON.parse(localStorage.getItem('user') || 'null');
  const canEdit = me?.role === 'admin' || me?.role === 'editeur';

  async function load() {
    setLoading(true);
    try { setProfs(await api.professeurs()); } finally { setLoading(false); }
  }
  useEffect(() => { load(); }, []);

  function toggleSort(key) {
    setSortBy(s => s.key !== key ? { key, dir: 'asc' } : s.dir === 'asc' ? { key, dir: 'desc' } : { key: null, dir: 'asc' });
  }

  const filtered = useMemo(() => {
    let arr = profs.filter(p => !q ||
      p.nom_prenom?.toLowerCase().includes(q.toLowerCase()) ||
      p.adresse_mail?.toLowerCase().includes(q.toLowerCase()) ||
      p.commune?.toLowerCase().includes(q.toLowerCase())
    );
    if (sortBy.key) {
      arr = [...arr].sort((a, b) => {
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
  }, [profs, q, sortBy]);

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

  return (
    <div className="p-4 md:p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
        <h1 className="text-2xl font-title text-iip-gold">
          Corps professoral <span className="text-base font-normal text-gray-400">({filtered.length})</span>
        </h1>
        <div className="flex gap-2 items-center">
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="🔍 Rechercher…"
            className="border border-gray-300 rounded px-3 py-1.5 text-sm w-56" />
          {canEdit && (
            <button onClick={() => setEditProf({ ...EMPTY })}
              className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-3 py-1.5 rounded font-medium">
              ➕ Nouveau prof.
            </button>
          )}
        </div>
      </div>

      {loading ? <p className="text-gray-400 p-4">Chargement…</p> : (
        <div className="bg-white rounded-lg border border-gray-200 overflow-auto max-h-[calc(100vh-180px)]">
          <table className="grid-excel w-full">
            <thead>
              <tr>
                <Th k="nom_prenom">Nom et prénom</Th>
                <Th k="statut">Statut</Th>
                <Th k="adresse_mail">Email</Th>
                <Th k="commune">Commune</Th>
                <th className="text-center">CAPAES</th>
                <Th k="total_per_iip" num>Total IIP</Th>
                <Th k="total_hrs_helb" num>HELB (hrs)</Th>
                <Th k="anciennete_25_26_po" num>Anc. PO</Th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="hover:bg-gray-50">
                  <td className="font-medium">
                    <button onClick={() => setDetailId(p.id)} className="hover:text-iip-gold hover:underline text-left">
                      {p.nom_prenom}
                    </button>
                  </td>
                  <td>
                    {p.statut
                      ? <span className={`badge ${p.statut === 'CC' ? 'badge-iip' : 'badge-helb'}`}>{p.statut}</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="text-xs text-gray-600">{p.adresse_mail || '—'}</td>
                  <td className="text-xs text-gray-600">{p.commune || '—'}</td>
                  <td className="text-center">
                    {p.capaes === 'x'
                      ? <span className="text-green-600 text-xs font-semibold">✓</span>
                      : <span className="text-gray-300 text-xs">—</span>}
                  </td>
                  <td className="num">{Number(p.total_per_iip || 0).toLocaleString('fr-BE')}</td>
                  <td className="num">{Number(p.total_hrs_helb || 0).toLocaleString('fr-BE')}</td>
                  <td className="num">{p.anciennete_25_26_po || 0}</td>
                  <td className="text-center">
                    <div className="flex items-center justify-center gap-2">
                      {canEdit && (
                        <button onClick={() => setEditProf(p)}
                          className="text-iip-gold hover:text-iip-amber text-sm" title="Modifier">✏</button>
                      )}
                      {canEdit && (
                        <button onClick={() => handleDelete(p)} disabled={deleting === p.id}
                          className="text-red-400 hover:text-red-600 text-sm disabled:opacity-30" title="Supprimer">🗑</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailId && (
        <DetailModal profId={detailId} onClose={() => setDetailId(null)}
          onEdit={p => { setDetailId(null); setEditProf(p); }} />
      )}

      {editProf !== null && (
        <EditModal prof={editProf} onClose={() => setEditProf(null)}
          onSaved={() => { setEditProf(null); load(); }} />
      )}
    </div>
  );
}
