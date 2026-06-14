import { useEffect, useState } from 'react';
import { api } from '../lib/api.js';

function Champ({ label, value, onChange, placeholder, hint, className = '' }) {
  return (
    <label className={`block ${className}`}>
      <div className="text-xs text-gray-600 mb-0.5">{label}</div>
      <input
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm"
      />
      {hint && <div className="text-[11px] text-gray-400 mt-0.5">{hint}</div>}
    </label>
  );
}

export default function ParametresEtablissement() {
  const [f, setF] = useState({});
  const [mep, setMep] = useState({}); // paramètres mise en page (cle -> '0'/'1')
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    Promise.all([
      api.etablissement().then(d => setF(d || {})).catch(() => {}),
      api.parametres().then(groups => {
        const arr = (groups && groups.mise_en_page) || [];
        const o = {};
        for (const p of arr) o[p.cle] = p.valeur;
        setMep(o);
      }).catch(() => {}),
    ]).finally(() => setLoading(false));
  }, []);

  const set = (k, v) => setF(prev => ({ ...prev, [k]: v }));
  const toggleMep = (cle) => setMep(prev => ({ ...prev, [cle]: prev[cle] === '1' ? '0' : '1' }));

  async function save() {
    setSaving(true); setMsg('');
    try {
      await api.saveEtablissement(f);
      if (Object.keys(mep).length) await api.saveParametres(mep);
      setMsg('Paramètres enregistrés ✓');
      setTimeout(() => setMsg(''), 3000);
    } catch (e) { setMsg('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  if (loading) return <div className="p-8 text-center text-gray-400">Chargement…</div>;

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-semibold text-iip-gold">Paramètres de l'établissement</h2>
        <p className="text-sm text-gray-500 mt-1">
          Ces informations apparaissent sur les documents officiels (EA12…). Saisies une seule fois,
          elles se reportent automatiquement sur tous les documents générés.
        </p>
      </div>

      {/* Identification de l'établissement */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Identification de l'établissement</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Champ label="Nom du Pouvoir Organisateur (PO)" value={f.po_nom} onChange={v => set('po_nom', v)} />
          <Champ label="Nom de l'établissement" value={f.etab_nom} onChange={v => set('etab_nom', v)} />
        </div>
        <Champ label="Adresse complète" value={f.adresse} onChange={v => set('adresse', v)} />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <label className="block">
            <div className="text-xs text-gray-600 mb-0.5">Type de Pouvoir Organisateur</div>
            <select value={f.type_po ?? ''} onChange={e => set('type_po', e.target.value)}
              className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
              <option value="">—</option>
              <option value="WBE">Organisé par WBE (33)</option>
              <option value="FWB">Subventionné par la FWB (22)</option>
            </select>
          </label>
          {f.type_po === 'FWB' && (
            <label className="block">
              <div className="text-xs text-gray-600 mb-0.5">Sous-type (subventionné)</div>
              <select value={f.sous_type ?? ''} onChange={e => set('sous_type', e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
                <option value="">—</option>
                <option value="officiel">Officiel subventionné</option>
                <option value="libre">Libre subventionné</option>
              </select>
            </label>
          )}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Champ label="N° ECOT" value={f.num_ecot} onChange={v => set('num_ecot', v)}
            placeholder="10 derniers chiffres" hint="10 chiffres" />
          <Champ label="N° FASE" value={f.num_fase} onChange={v => set('num_fase', v)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Champ label="N° d'entreprise (BCE)" value={f.num_entreprise} onChange={v => set('num_entreprise', v)}
            placeholder="ex. 458.339.252" hint="Banque-Carrefour des Entreprises" />
          <Champ label="Site web" value={f.site_web} onChange={v => set('site_web', v)}
            placeholder="www.exemple.be" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Champ label="E-mail de contact (secrétariat)" value={f.email_contact} onChange={v => set('email_contact', v)}
            placeholder="secretariat@exemple.be" hint="Adresse générale affichée sur les documents" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Champ label="E-mail officiel (ec)" value={f.email_ec} onChange={v => set('email_ec', v)}
            placeholder="…ec@adm.cfwb.be" />
          <Champ label="E-mail officiel (po)" value={f.email_po} onChange={v => set('email_po', v)}
            placeholder="…po@adm.cfwb.be" />
        </div>
        <label className="block">
          <div className="text-xs text-gray-600 mb-0.5">Nombre de jours de fonctionnement / semaine</div>
          <select value={f.jours_fonctionnement ?? ''} onChange={e => set('jours_fonctionnement', e.target.value ? Number(e.target.value) : null)}
            className="w-full md:w-48 border border-gray-300 rounded px-3 py-1.5 text-sm bg-white">
            <option value="">—</option>
            <option value="4">4 jours</option>
            <option value="5">5 jours</option>
            <option value="6">6 jours</option>
          </select>
          <div className="text-[11px] text-gray-400 mt-0.5">Se reporte automatiquement sur les EA12.</div>
        </label>
      </section>

      {/* Gestionnaire du dossier */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Gestionnaire du dossier
          <span className="font-normal normal-case text-gray-400"> · personne joignable par l'Administration</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Champ label="Nom" value={f.gest_nom} onChange={v => set('gest_nom', v)} />
          <Champ label="Prénom" value={f.gest_prenom} onChange={v => set('gest_prenom', v)} />
          <Champ label="Qualité" value={f.gest_qualite} onChange={v => set('gest_qualite', v)} />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <Champ label="Téléphone direct" value={f.gest_tel} onChange={v => set('gest_tel', v)} />
          <Champ label="E-mail" value={f.gest_email} onChange={v => set('gest_email', v)} />
        </div>
      </section>

      {/* Mise en page des documents */}
      <section className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
          Mise en page des documents
          <span className="font-normal normal-case text-gray-400"> · en-tête et pied de page de tous les documents imprimés</span>
        </div>

        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={mep['miseenpage.entete_logo'] === '1'}
            onChange={() => toggleMep('miseenpage.entete_logo')} className="rounded" />
          <span>Afficher le <strong>logo de l'école</strong> en en-tête</span>
        </label>

        <div className="pt-2">
          <div className="text-xs text-gray-600 mb-1.5">Champs à inclure dans le <strong>pied de page</strong> :</div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1.5">
            {[
              ['miseenpage.pied_etab_nom',       "Nom de l'établissement", f.etab_nom],
              ['miseenpage.pied_po',             'Pouvoir Organisateur',   f.po_nom],
              ['miseenpage.pied_num_entreprise', "N° d'entreprise",        f.num_entreprise],
              ['miseenpage.pied_num_fase',       'N° FASE',                f.num_fase],
              ['miseenpage.pied_adresse',        'Adresse',                f.adresse],
              ['miseenpage.pied_tel',            'Téléphone',              f.gest_tel],
              ['miseenpage.pied_email',          'E-mail de contact',      f.email_contact],
              ['miseenpage.pied_site_web',       'Site web',               f.site_web],
            ].map(([cle, label, val]) => (
              <label key={cle} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={mep[cle] === '1'} onChange={() => toggleMep(cle)} className="rounded" />
                <span className={val ? '' : 'text-gray-400'}>{label}{!val && ' (vide)'}</span>
              </label>
            ))}
          </div>
        </div>

        {/* Aperçu du pied de page */}
        <div className="mt-2 pt-3 border-t border-gray-100">
          <div className="text-[11px] text-gray-400 mb-1">Aperçu du pied de page :</div>
          <div className="text-center text-[11px] text-gray-600 leading-relaxed border border-dashed border-gray-300 rounded p-2 bg-gray-50">
            {(() => {
              const on = (c) => mep[c] === '1';
              const l1 = [
                on('miseenpage.pied_etab_nom') ? f.etab_nom : null,
                on('miseenpage.pied_po') && f.po_nom ? 'PO ' + f.po_nom : null,
                on('miseenpage.pied_num_entreprise') && f.num_entreprise ? 'N° entreprise ' + f.num_entreprise : null,
              ].filter(Boolean).join(' • ');
              const l2 = [
                on('miseenpage.pied_num_fase') && f.num_fase ? 'Fase ' + f.num_fase : null,
                on('miseenpage.pied_adresse') ? f.adresse : null,
                on('miseenpage.pied_tel') && f.gest_tel ? 'T. ' + f.gest_tel : null,
                on('miseenpage.pied_email') ? f.email_contact : null,
                on('miseenpage.pied_site_web') ? f.site_web : null,
              ].filter(Boolean).join(' • ');
              return <>{l1 || <span className="text-gray-300">—</span>}{l2 && <><br/>{l2}</>}</>;
            })()}
          </div>
        </div>
      </section>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 bg-iip-gold text-white rounded-lg text-sm font-medium hover:bg-iip-amber disabled:opacity-50">
          {saving ? 'Enregistrement…' : 'Enregistrer'}
        </button>
        {msg && <span className={`text-sm ${msg.startsWith('Erreur') ? 'text-red-600' : 'text-green-600'}`}>{msg}</span>}
      </div>
    </div>
  );
}
