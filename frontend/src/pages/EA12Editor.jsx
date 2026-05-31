import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../lib/api.js';

/* ─── Micro-composants Lucie ──────────────────────────────────────────────── */
function Section({ titre, children, color = 'gold' }) {
  const hdr = color === 'mauve'
    ? 'bg-iip-mauve/10 border-b border-iip-mauve/20'
    : 'bg-iip-gold/10 border-b border-gray-200';
  const ttl = color === 'mauve' ? 'text-iip-mauve' : 'text-iip-gold';
  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className={`${hdr} px-4 py-2`}>
        <h3 className={`text-sm font-semibold ${ttl}`}>{titre}</h3>
      </div>
      <div className="p-4 space-y-3">{children}</div>
    </div>
  );
}
function Chk({ label, checked, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
      <input type="checkbox" checked={!!checked} onChange={e => onChange(e.target.checked)}
        className="w-4 h-4 accent-iip-gold rounded" />
      <span>{label}</span>
    </label>
  );
}
function Radio({ name, label, value, current, onChange }) {
  return (
    <label className="flex items-center gap-2 cursor-pointer text-sm select-none">
      <input type="radio" name={name} checked={current === value} onChange={() => onChange(value)}
        className="w-4 h-4 accent-iip-gold" />
      <span>{label}</span>
    </label>
  );
}
function Txt({ label, value, onChange, placeholder, type = 'text', className = '' }) {
  return (
    <label className={`block ${className}`}>
      {label && <div className="text-xs text-gray-600 mb-0.5">{label}</div>}
      <input type={type} value={value ?? ''} onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:ring-1 focus:ring-iip-gold focus:outline-none" />
    </label>
  );
}
function Sel({ label, value, onChange, options }) {
  return (
    <label className="block">
      {label && <div className="text-xs text-gray-600 mb-0.5">{label}</div>}
      <select value={value ?? ''} onChange={e => onChange(e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white focus:ring-1 focus:ring-iip-gold focus:outline-none">
        <option value="">— choisir —</option>
        {options.map(o => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}
function Info({ label, value }) {
  return (
    <div className="text-sm">
      <span className="text-gray-500 text-xs">{label} : </span>
      <span className="font-medium">{value || <span className="text-gray-400 italic">non renseigné</span>}</span>
    </div>
  );
}

/* ─── Constantes FWB ──────────────────────────────────────────────────────── */
const STATUTS = ['T', 'TPr', 'St', 'D', 'ACS', 'APE', 'PTP'];
const MOUVEMENTS = [
  "Entrée en fonction", "Rentrée en fonction", "Maintien d\u2019attributions",
  "Augmentation d\u2019attributions", "Prolongation d\u2019attributions",
  "Réduction d\u2019attributions", "Fin de fonctions (dernier jour presté)",
  "Nomination ou engagement à titre définitif",
  "Extension nomination/engagement à titre définitif",
  "Passerelle / Changement d\u2019affectation / Mutation",
  "Autres",
];
const JUSTIFICATIONS = [
  "Création d\u2019emploi", "Remplacement", "Changement d\u2019affectation",
  "Modification d\u2019organisation interne", "Congé / Absence / Disponibilité",
  "Perte partielle de charge", "DPPR", "Suppression d\u2019emploi",
  "Fin de remplacement", "Démission", "Mise à la retraite", "Décès", "Autres",
];
const TYPE_ABSENCE = ["Absence d\u2019un jour", "Début absence de plus d\u20191 jour", "Reprise après absence de plus d\u20191 jour"];
const TCTL_OPTS = ['TC', 'TL'];
const CLA_OPTS = ['CT', 'PP', 'TP', 'PT'];

const ATTR_VIDE = { ue: '', f: 'D', denomination: '', cla: 'CT', periode_occ: '', tctl: 'TC', nb_periodes: '', titre: '', sit_adm: '', di: '', oe: '' };
const OE_VIDE  = { num_mat: '', nom_prenom: '', motif: '', date_debut: '', date_fin: '', type: '' };

/* ─── Composant principal ─────────────────────────────────────────────────── */
export default function EA12Editor() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [ea12, setEa12] = useState(null);
  const [apercu, setApercu] = useState(null);
  const [d, setD] = useState({});
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    (async () => {
      const row = await api.ea12Get(id);
      setEa12(row);
      const dd = { ...row.donnees };
      if (!dd.date_evenement) dd.date_evenement = new Date().toISOString().slice(0, 10);
      if (!dd.justifs) dd.justifs = dd.justif ? [dd.justif] : [];
      if (!dd.oe_slots)  dd.oe_slots  = [OE_VIDE, OE_VIDE, OE_VIDE, OE_VIDE];
      setD(dd);
      const ap = await api.ea12Apercu(id);
      setApercu(ap);
      // Pré-remplir les attributions éditables si pas encore overridées
      if (!dd.attributions_override && ap.attributions?.length) {
        setD(prev => ({ ...prev, attributions_override: ap.attributions.map(a => ({ ...a })) }));
      }
    })().catch(e => setMsg('Erreur : ' + e.message));
  }, [id]);

  const set = (k, v) => setD(prev => ({ ...prev, [k]: v }));

  /* Justifications (cases à cocher multiples) */
  const toggleJustif = (j) => {
    const list = d.justifs || [];
    set('justifs', list.includes(j) ? list.filter(x => x !== j) : [...list, j]);
  };

  /* Attributions éditables */
  const setAttrRow = (i, field, val) => {
    const rows = [...(d.attributions_override || [])];
    rows[i] = { ...rows[i], [field]: val };
    set('attributions_override', rows);
  };
  const addAttrRow = () => set('attributions_override', [...(d.attributions_override || []), { ...ATTR_VIDE }]);
  const delAttrRow = (i) => set('attributions_override', (d.attributions_override || []).filter((_, idx) => idx !== i));
  const resetAttrs = () => set('attributions_override', apercu?.attributions?.map(a => ({ ...a })) || []);

  /* OE slots */
  const setOE = (i, field, val) => {
    const slots = [...(d.oe_slots || [OE_VIDE, OE_VIDE, OE_VIDE, OE_VIDE])];
    slots[i] = { ...slots[i], [field]: val };
    set('oe_slots', slots);
  };

  async function save() {
    setSaving(true); setMsg('');
    try { await api.ea12Update(id, { donnees: d }); setMsg('Enregistré ✓'); setTimeout(() => setMsg(''), 2500); }
    catch (e) { setMsg('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  async function imprimer() {
    setSaving(true); setMsg('');
    const w = window.open('', '_blank');
    if (!w) { alert('Veuillez autoriser les pop-ups pour ce site.'); setSaving(false); return; }
    w.document.write('<html><head><meta charset="utf-8"></head><body style="font-family:Arial,sans-serif;padding:30px;color:#666;font-size:14px">G\u00e9n\u00e9ration en cours\u2026</body></html>');
    try {
      await api.ea12Update(id, { donnees: d });
      const token = localStorage.getItem('token');
      const r = await fetch(`/api/ea12/${id}/imprimer`, { headers: { Authorization: `Bearer ${token}` } });
      if (!r.ok) throw new Error(`Erreur ${r.status}`);
      const html = await r.text();
      w.document.open(); w.document.write(html); w.document.close();
    } catch (e) { w.close(); setMsg('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  if (msg.startsWith('Erreur') && !ea12)
    return <div className="p-8 text-center text-red-600">{msg}<div className="mt-2"><button onClick={() => navigate(-1)} className="text-sm underline text-gray-500">← Retour</button></div></div>;
  if (!ea12 || !apercu) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  const oeslots = d.oe_slots || [OE_VIDE, OE_VIDE, OE_VIDE, OE_VIDE];
  const attrs   = d.attributions_override || [];

  return (
    <div className="max-w-5xl mx-auto p-4 space-y-4 pb-12">
      {/* ─── En-tête page ─────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <button onClick={() => navigate(-1)} className="text-sm text-gray-500 hover:text-gray-700 mb-1">← Retour</button>
          <h1 className="text-xl font-title text-iip-gold">
            EA12 bis (Supérieur) — {apercu.prof_nom} {apercu.prof_prenom}
          </h1>
          <p className="text-xs text-gray-500">Année {ea12.annee_scolaire} · Doc n° {ea12.num_doc}</p>
        </div>
        <div className="flex gap-2">
          <button onClick={save} disabled={saving} className="px-4 py-2 text-sm border border-iip-gold text-iip-gold rounded-lg hover:bg-iip-gold/5 disabled:opacity-50">
            💾 Enregistrer
          </button>
          <button onClick={imprimer} disabled={saving} className="px-4 py-2 text-sm bg-iip-mauve text-white rounded-lg hover:opacity-90 disabled:opacity-50">
            {saving ? 'Génération…' : '🖨 Imprimer / PDF'}
          </button>
        </div>
      </div>
      {msg && <div className={`text-sm px-3 py-1.5 rounded ${msg.startsWith('Erreur') ? 'bg-red-50 text-red-600' : 'bg-green-50 text-green-700'}`}>{msg}</div>}

      {/* ─── 1. En-tête document ──────────────────────────────────────────── */}
      <Section titre="1 · En-tête du document">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-xs text-gray-600 mb-0.5">Document n° (attribué automatiquement)</div>
            <div className="px-3 py-1.5 text-sm bg-gray-50 border border-gray-200 rounded text-gray-600">{ea12.num_doc || '—'}</div>
          </div>
          <Txt label="Dernier Doc12 transmis le" value={d.dernier_doc12} onChange={v => set('dernier_doc12', v)} type="date" />
        </div>
      </Section>

      {/* ─── 2. Identification MDP ────────────────────────────────────────── */}
      <Section titre="2 · Identification du membre du personnel (MDP)">
        <p className="text-xs text-gray-400">Les données en gris sont issues de la fiche professeur. Vous pouvez les remplacer pour cet EA12 uniquement.</p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <Info label="Matricule" value={apercu.matricule} />
            <div className="text-xs text-gray-400 mt-0.5">Modifier sur la fiche prof</div>
          </div>
          <Info label="NOM" value={apercu.prof_nom} />
          <Info label="Prénom" value={apercu.prof_prenom} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Txt label="Titre de capacité 1 (override)" value={d.titre1_override ?? apercu.titre1} onChange={v => set('titre1_override', v)} placeholder={apercu.titre1 || 'ex. Licence en...'} />
          <Txt label="Titre de capacité 2 (override)" value={d.titre2_override ?? apercu.titre2} onChange={v => set('titre2_override', v)} placeholder={apercu.titre2 || ''} />
        </div>
        <Chk label="Dérogation de titre (AR du 22/4/1969, art. 17§4 de la Loi du 7/7/1970)" checked={d.derogation_titre} onChange={v => set('derogation_titre', v)} />
        <div>
          <div className="text-xs text-gray-600 mb-1">Statut (override — actuellement : <b>{apercu.statut || '—'}</b>)</div>
          <div className="flex flex-wrap gap-3">
            {STATUTS.map(s => (
              <label key={s} className="flex items-center gap-1.5 cursor-pointer text-sm select-none">
                <input type="radio" name="statut_ov" checked={(d.statut_override ?? apercu.statut) === s} onChange={() => set('statut_override', s)}
                  className="w-4 h-4 accent-iip-gold" />
                <span className="font-medium">{s}</span>
              </label>
            ))}
          </div>
        </div>
      </Section>

      {/* ─── 3. Cumul / Prestations ───────────────────────────────────────── */}
      <Section titre="3 · Cumul / Prestations / Transmission">
        <div className="grid grid-cols-2 gap-6">
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Cumul</div>
            <Chk label="Pas de cumul interne" checked={d.pas_cumul} onChange={v => set('pas_cumul', v)} />
            <div className="text-xs text-gray-500 mt-1">Prestations dans cet établissement :</div>
            <div className="pl-2 space-y-1">
              <Chk label="Secondaire" checked={d.prest_sec} onChange={v => set('prest_sec', v)} />
              <Chk label="Supérieur" checked={d.prest_sup ?? true} onChange={v => set('prest_sup', v)} />
              <Chk label="Expert" checked={d.prest_exp} onChange={v => set('prest_exp', v)} />
              <Chk label="ACS / APE / PTP" checked={d.prest_acs} onChange={v => set('prest_acs', v)} />
            </div>
            <Chk label="Cumul interne A2 (autre établ. FWB)" checked={d.cumul_a2} onChange={v => set('cumul_a2', v)} />
          </div>
          <div className="space-y-2">
            <div className="text-xs font-medium text-gray-600 uppercase tracking-wide">Transmission tardive</div>
            <Chk label="Transmission tardive du document par la faute du MDP (Circ. 6930)" checked={d.transmission_tardive} onChange={v => set('transmission_tardive', v)} />
            <div className="mt-3">
              <div className="text-xs text-gray-600 mb-1">Nombre de jours de fonctionnement/semaine</div>
              <div className="flex gap-4">
                {[4, 5, 6].map(n => (
                  <label key={n} className="flex items-center gap-1.5 cursor-pointer text-sm select-none">
                    <input type="radio" name="jours_fonct" checked={(d.jours ?? apercu.jours) == n} onChange={() => set('jours', n)}
                      className="w-4 h-4 accent-iip-gold" />
                    <span className="font-medium">{n}</span>
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>
      </Section>

      {/* ─── 4. Événement ─────────────────────────────────────────────────── */}
      <Section titre="4 · Événement">
        <div className="grid grid-cols-2 gap-3">
          <Txt label="Date de l'événement" value={d.date_evenement} onChange={v => set('date_evenement', v)} type="date" />
          <Txt label="Semaines de fonctionnement" value={d.semaines} onChange={v => set('semaines', v)} placeholder="ex. 36" />
        </div>
        <div className="grid grid-cols-2 gap-6 mt-2">
          {/* Mouvement */}
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">Type d'événement — Mouvement</div>
            <div className="space-y-1">
              {MOUVEMENTS.filter(m => m !== 'Autres').map(t => (
                <Radio key={t} name="type_ev" label={t} value={t} current={d.type_evenement} onChange={v => set('type_evenement', v)} />
              ))}
              <Radio name="type_ev" label="Autres (à préciser)" value="Autres" current={d.type_evenement} onChange={v => set('type_evenement', v)} />
            </div>
            {d.type_evenement === 'Autres' && (
              <Txt className="mt-1" value={d.type_evenement_autres} onChange={v => set('type_evenement_autres', v)} placeholder="Préciser…" />
            )}
          </div>
          {/* Justifications */}
          <div>
            <div className="text-xs font-medium text-gray-600 mb-1 uppercase tracking-wide">Justification(s) — plusieurs possibles</div>
            <div className="space-y-1 max-h-64 overflow-auto pr-1">
              {JUSTIFICATIONS.filter(j => j !== 'Autres').map(j => (
                <Chk key={j} label={j} checked={(d.justifs || []).includes(j)} onChange={() => toggleJustif(j)} />
              ))}
              <Chk label="Autres (à préciser)" checked={(d.justifs || []).includes('Autres')} onChange={() => toggleJustif('Autres')} />
            </div>
            {(d.justifs || []).includes('Autres') && (
              <Txt className="mt-1" value={d.justif_autres} onChange={v => set('justif_autres', v)} placeholder="Préciser…" />
            )}
          </div>
        </div>
      </Section>

      {/* ─── 5. Absence ──────────────────────────────────────────────────── */}
      <Section titre="5 · Absence (si applicable)">
        <div className="space-y-1">
          {TYPE_ABSENCE.map(t => (
            <Radio key={t} name="type_abs" label={t} value={t} current={d.type_absence} onChange={v => set('type_absence', v)} />
          ))}
          <Radio name="type_abs" label="Pas d'absence" value="" current={d.type_absence || ''} onChange={v => set('type_absence', v)} />
        </div>
        {d.type_absence && (
          <div className="mt-2 space-y-2">
            <Txt label="Motif de l'absence (intitulé CAD + Code DI)" value={d.motif_absence} onChange={v => set('motif_absence', v)} placeholder="ex. Maladie ordinaire — DI 10" />
            <div className="grid grid-cols-2 gap-3">
              <Txt label="Date de début" value={d.date_debut_absence} onChange={v => set('date_debut_absence', v)} type="date" />
              <Txt label="Date de fin" value={d.date_fin_absence} onChange={v => set('date_fin_absence', v)} type="date" />
            </div>
          </div>
        )}
      </Section>

      {/* ─── 6. Observations ─────────────────────────────────────────────── */}
      <Section titre="6 · Situation ancienne-nouvelle / Observations">
        <textarea value={d.observations || ''} onChange={e => set('observations', e.target.value)} rows={3}
          className="w-full border border-gray-300 rounded px-3 py-2 text-sm focus:ring-1 focus:ring-iip-gold focus:outline-none"
          placeholder="ex. Maintien d'attributions pour l'année 2026-2027" />
      </Section>

      {/* ─── 7. Attributions ─────────────────────────────────────────────── */}
      <Section titre={`7 · Attributions (${attrs.length} ligne${attrs.length > 1 ? 's' : ''})`} color="mauve">
        <div className="flex justify-between items-center mb-1">
          <p className="text-xs text-gray-500">Modifiez le tableau ci-dessous. Les données proviennent de l'application.</p>
          <div className="flex gap-2">
            <button onClick={resetAttrs} className="text-xs text-gray-500 border border-gray-300 px-2 py-0.5 rounded hover:bg-gray-50">↺ Réinitialiser depuis la base</button>
            <button onClick={addAttrRow} className="text-xs text-iip-mauve border border-iip-mauve/40 px-2 py-0.5 rounded hover:bg-iip-mauve/5">+ Ajouter une ligne</button>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs border-collapse">
            <thead>
              <tr className="bg-iip-mauve/10 text-gray-600">
                {['U.E.','F','Dénomination','CLA','Pér. occ.','TC/TL','Nb pér.','Titre','Sit.adm.','DI','N°OE',''].map(h => (
                  <th key={h} className="border border-gray-200 px-1.5 py-1 text-left font-medium whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {attrs.map((a, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  {[
                    ['ue', ''],
                    ['f', ''],
                    ['denomination', ''],
                    ['cla', 'sel:CT/PP/TP/PT'],
                    ['periode_occ', ''],
                    ['tctl', 'sel:TC/TL'],
                    ['nb_periodes', ''],
                    ['titre', ''],
                    ['sit_adm', ''],
                    ['di', ''],
                    ['oe', ''],
                  ].map(([field, hint]) => (
                    <td key={field} className="border border-gray-200 p-0.5">
                      {hint.startsWith('sel:') ? (
                        <select value={a[field] || ''} onChange={e => setAttrRow(i, field, e.target.value)}
                          className="w-full bg-transparent text-xs px-1 py-0.5 focus:outline-none focus:bg-white rounded">
                          {hint.slice(4).split('/').map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : (
                        <input value={a[field] || ''} onChange={e => setAttrRow(i, field, e.target.value)}
                          className="w-full bg-transparent text-xs px-1 py-0.5 focus:outline-none focus:bg-white rounded min-w-0"
                          style={{minWidth: field==='denomination'?'120px':field==='ue'?'80px':'40px'}} />
                      )}
                    </td>
                  ))}
                  <td className="border border-gray-200 p-0.5 text-center">
                    <button onClick={() => delAttrRow(i)} className="text-red-400 hover:text-red-600 px-1">✕</button>
                  </td>
                </tr>
              ))}
              {attrs.length === 0 && (
                <tr><td colSpan={12} className="text-center text-gray-400 py-3 text-xs">Aucune attribution — cliquez « Ajouter » ou « Réinitialiser »</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>

      {/* ─── 8. Origine de l'événement (OE) ──────────────────────────────── */}
      <Section titre="8 · Origine de l'événement (OE) — si remplacement" color="mauve">
        <p className="text-xs text-gray-500">À remplir uniquement si « Remplacement » est coché dans les justifications.</p>
        {oeslots.map((slot, i) => (
          <div key={i} className="border border-gray-100 rounded p-3 bg-gray-50 space-y-2">
            <div className="text-xs font-semibold text-gray-600">Remplacé n° {i + 1}</div>
            <div className="grid grid-cols-2 gap-2">
              <Txt label="N° Matricule" value={slot.num_mat} onChange={v => setOE(i, 'num_mat', v)} placeholder="ex. 12345678901" />
              <Txt label="Nom, Prénom" value={slot.nom_prenom} onChange={v => setOE(i, 'nom_prenom', v)} placeholder="NOM, Prénom" />
            </div>
            <Txt label="Motif de remplacement" value={slot.motif} onChange={v => setOE(i, 'motif', v)} placeholder="ex. Congé de maternité" />
            <div className="grid grid-cols-3 gap-2">
              <Txt label="Période — Du" value={slot.date_debut} onChange={v => setOE(i, 'date_debut', v)} type="date" />
              <Txt label="Au" value={slot.date_fin} onChange={v => setOE(i, 'date_fin', v)} type="date" />
              <div>
                <div className="text-xs text-gray-600 mb-0.5">Type</div>
                <div className="flex gap-3 mt-1.5">
                  {['D', 'T'].map(t => (
                    <label key={t} className="flex items-center gap-1.5 cursor-pointer text-sm select-none">
                      <input type="radio" name={`oe_type_${i}`} checked={slot.type === t} onChange={() => setOE(i, 'type', t)}
                        className="w-4 h-4 accent-iip-mauve" />
                      <span className="font-medium">{t}</span>
                    </label>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
      </Section>

      {/* ─── Boutons bas ────────────────────────────────────────────────── */}
      <div className="flex justify-end gap-2">
        <button onClick={save} disabled={saving} className="px-5 py-2 text-sm border border-iip-gold text-iip-gold rounded-lg hover:bg-iip-gold/5 disabled:opacity-50">💾 Enregistrer</button>
        <button onClick={imprimer} disabled={saving} className="px-5 py-2 text-sm bg-iip-mauve text-white rounded-lg hover:opacity-90 disabled:opacity-50">{saving ? 'Génération…' : '🖨 Imprimer / PDF'}</button>
      </div>
    </div>
  );
}
