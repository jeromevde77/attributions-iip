import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

/* Petits composants de saisie */
function Section({ titre, children }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="bg-iip-gold/10 px-4 py-2 border-b border-gray-200">
        <h3 className="text-sm font-semibold text-iip-gold">{titre}</h3>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}
function Check({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-iip-gold" />
      <span>{label}</span>
    </label>
  );
}
function Radio({ name, label, value, current, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm">
      <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)}
        className="w-4 h-4 accent-iip-gold" />
      <span>{label}</span>
    </label>
  );
}
function Txt({ label, value, onChange, placeholder, type = 'text' }) {
  return (
    <label className="block">
      <div className="text-xs text-gray-600 mb-0.5">{label}</div>
      <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)} placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
    </label>
  );
}

const TYPES_EVENEMENT = [
  'Entrée en fonction', 'Rentrée en fonction', 'Maintien d’attributions',
  'Augmentation d’attributions', 'Prolongation d’attributions', 'Réduction d’attributions',
  'Fin de fonctions (dernier jour presté)',
];
const JUSTIFICATIONS = [
  'Nomination ou engagement à titre définitif', 'Extension nomination/engagement à titre définitif',
  'Passerelle / Changement d’affectation / Mutation', 'Création d’emploi', 'Remplacement',
  'Changement d’affectation', 'Modification d’organisation interne', 'Congé / Absence / Disponibilité',
  'Perte partielle de charge', 'DPPR', 'Suppression d’emploi', 'Fin de remplacement',
  'Démission', 'Mise à la retraite', 'Décès', 'Autres',
];

export default function EA12Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ea12, setEa12] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [d, setD] = useState({});         // données de situation (saisies)
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const row = await api.ea12Get(id);
      setEa12(row);
      const dd = row.donnees || {};
      // Date de l'événement par défaut = aujourd'hui (si pas encore définie)
      if (!dd.date_evenement) dd.date_evenement = new Date().toISOString().slice(0, 10);
      setD(dd);
      const ap = await api.ea12Apercu(id);
      setApercu(ap);
    })().catch(e => setMsg('Erreur : ' + e.message));
  }, [id]);

  const set = (k, v) => setD(prev => ({ ...prev, [k]: v }));

  async function save() {
    setSaving(true); setMsg('');
    try { await api.ea12Update(id, { donnees: d }); setMsg('Enregistré ✓'); setTimeout(() => setMsg(''), 2500); }
    catch (e) { setMsg('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }
  async function generer() {
    setSaving(true); setMsg('');
    try {
      await api.ea12Update(id, { donnees: d });
      const fn = `EA12_${apercu?.prof_nom || ''}_${apercu?.prof_prenom || ''}_${ea12?.annee_scolaire || ''}.docx`.replace(/\s+/g, '_');
      await api.ea12Document(id, fn);
      setMsg('Document généré ✓');
    } catch (e) { setMsg('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }
  async function imprimer() {
    setSaving(true); setMsg('');
    const w = window.open('', '_blank');
    if (!w) { alert('Veuillez autoriser les pop-ups pour ce site.'); setSaving(false); return; }
    // Placeholder synchrone immédiat — nécessaire pour Safari (sinon impression = page blanche)
    w.document.write('<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;padding:30px;color:#666;font-size:14px">G\u00e9n\u00e9ration en cours\u2026</body></html>');
    try {
      await api.ea12Update(id, { donnees: d });
      const token = localStorage.getItem('token');
      const r = await fetch(`/api/ea12/${id}/imprimer`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      const html = await r.text();
      w.document.open();
      w.document.write(html);
      w.document.close();
    } catch (e) { w.close(); setMsg('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  if (msg.startsWith('Erreur') && (!ea12 || !apercu))
    return <div className="p-8 text-center text-red-600">{msg}<div className="mt-2"><button onClick={() => navigate(-1)} className="text-sm text-gray-500 underline">← Retour</button></div></div>;
  if (!ea12 || !apercu) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700 mb-1">← Retour</button>
          <h1 className="text-xl font-title text-iip-gold">
            EA12 {ea12.variante === 'bis' ? 'bis (Supérieur)' : ea12.variante} — {apercu.prof_nom} {apercu.prof_prenom}
          </h1>
          <p className="text-xs text-gray-500">Année {ea12.annee_scolaire} · {ea12.statut_doc === 'genere' ? 'Document généré' : 'Brouillon'}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm border border-iip-gold text-iip-gold rounded-lg hover:bg-iip-gold/5 disabled:opacity-50">Enregistrer</button>
          <button onClick={imprimer} disabled={saving} className="px-4 py-2 text-sm bg-iip-mauve text-white rounded-lg hover:opacity-90 disabled:opacity-50">{saving ? 'Génération…' : '🖨 Imprimer / PDF'}</button>
        </div>
      </div>
      {msg && <div className={`text-sm ${msg.startsWith('Erreur') ? 'text-red-600' : 'text-green-600'}`}>{msg}</div>}

      {/* En-tête */}
      <Section titre="En-tête du document">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-600 mb-0.5">Document n° (automatique)</div>
            <div className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded text-gray-700">
              {ea12.num_doc || '—'} <span className="text-xs text-gray-400">· attribué à la création, par professeur et par année</span>
            </div>
          </div>
          <Txt label="Dernier Doc12 transmis le" value={d.dernier_doc12} onChange={v => set('dernier_doc12', v)} type="date" />
        </div>
      </Section>

      {/* Identité (rappel, lecture seule) */}
      <Section titre="Identification du membre du personnel">
        <p className="text-xs text-gray-500">Repris de la fiche du professeur (matricule, titres de capacité et statut se modifient sur sa fiche).</p>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div><span className="text-gray-500">Matricule : </span><span className="font-medium">{apercu.matricule || '— à compléter sur la fiche prof —'}</span></div>
          <div><span className="text-gray-500">Nom : </span><span className="font-medium">{apercu.prof_nom} {apercu.prof_prenom}</span></div>
          <div><span className="text-gray-500">Statut : </span><span className="font-medium">{apercu.statut || '—'}</span></div>
        </div>
        <div className="text-xs text-gray-500">
          Titres : {[apercu.titre1, apercu.titre2, apercu.titre3].filter(Boolean).join(' · ') || '— à compléter sur la fiche prof —'}
        </div>
      </Section>

      {/* Cumul */}
      <Section titre="Cumul / Prestations">
        <Check label="Pas de cumul interne" checked={d.pas_cumul} onChange={v => set('pas_cumul', v)} />
        <div className="text-xs text-gray-600">Prestations dans cet établissement :</div>
        <div className="flex gap-4 flex-wrap">
          <Check label="Secondaire" checked={d.prest_sec} onChange={v => set('prest_sec', v)} />
          <Check label="Supérieur" checked={d.prest_sup ?? true} onChange={v => set('prest_sup', v)} />
          <Check label="Expert" checked={d.prest_exp} onChange={v => set('prest_exp', v)} />
        </div>
        <p className="text-[11px] text-gray-400">Le nombre de jours de fonctionnement/semaine est défini dans Configuration → Établissement.</p>
      </Section>

      {/* Événement */}
      <Section titre="Événement">
        <div className="grid grid-cols-2 gap-3">
          <Txt label="Date de l’événement" value={d.date_evenement} onChange={v => set('date_evenement', v)} type="date" />
          <Txt label="Semaines de fonctionnement" value={d.semaines} onChange={v => set('semaines', v)} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="text-xs text-gray-600 mb-1 font-medium">Type d’événement</div>
            <div className="space-y-1">
              {TYPES_EVENEMENT.map(t => <Radio key={t} name="type_ev" label={t} value={t} current={d.type_evenement} onChange={v => set('type_evenement', v)} />)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-600 mb-1 font-medium">Justification</div>
            <div className="space-y-1 max-h-56 overflow-auto pr-1">
              {JUSTIFICATIONS.map(j => <Radio key={j} name="justif" label={j} value={j} current={d.justif} onChange={v => set('justif', v)} />)}
            </div>
          </div>
        </div>
      </Section>

      {/* Observations */}
      <Section titre="Situation ancienne-nouvelle / Observations">
        <textarea value={d.observations || ''} onChange={e => set('observations', e.target.value)} rows={2}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="ex. Nomination à titre définitif pour 36h/36h" />
      </Section>

      {/* Aperçu des attributions (lecture seule) */}
      <Section titre={`Attributions (${apercu.attributions?.length || 0})`}>
        <p className="text-xs text-gray-500">Reprises automatiquement de l’application. Le tableau complet figurera dans le document généré.</p>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead><tr className="text-left text-gray-500 border-b">
              <th className="py-1 pr-2">U.E.</th><th className="pr-2">Cours</th><th className="pr-2">CLA</th><th className="pr-2">TC/TL</th><th className="pr-2">Périodes</th>
            </tr></thead>
            <tbody>
              {apercu.attributions?.map((a, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-1 pr-2 font-mono">{a.ue}</td><td className="pr-2">{a.denomination}</td>
                  <td className="pr-2">{a.cla}</td><td className="pr-2">{a.tctl}</td><td className="pr-2">{a.nb_periodes}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Section>

      <div className="flex justify-end gap-2 pb-8">
        <button onClick={save} disabled={saving} className="px-4 py-2 text-sm border border-iip-gold text-iip-gold rounded-lg hover:bg-iip-gold/5 disabled:opacity-50">Enregistrer</button>
        <button onClick={imprimer} disabled={saving} className="px-4 py-2 text-sm bg-iip-mauve text-white rounded-lg hover:opacity-90 disabled:opacity-50">{saving ? 'Génération…' : '🖨 Imprimer / PDF'}</button>
      </div>
    </div>
  );
}
