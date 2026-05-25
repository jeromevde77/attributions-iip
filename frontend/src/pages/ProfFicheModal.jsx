import { useState, useEffect } from 'react';
import { api } from '../lib/api.js';

/* ════════════════════════════════════════════════════════════════════════
   Fiche signalétique du membre du personnel (MDP) — annexe 3 FWB
   Encodage complet à l'engagement, dans l'ordre du document officiel.
   ════════════════════════════════════════════════════════════════════════ */

const ETAT_CIVIL = [
  ['', '— Non défini —'],
  ['celibataire', 'Célibataire'],
  ['marie', 'Marié(e)'],
  ['veuf', 'Veuf(ve)'],
  ['divorce', 'Divorcé(e)'],
  ['cohab_legal', 'Cohabitant(e) légal(e)'],
  ['cohabitant', 'Cohabitant(e)'],
  ['separe_corps', 'Séparé(e) de corps'],
  ['separe_fait', 'Séparé(e) de fait'],
];

const REVENUS_CONJOINT = [
  ['pro', 'Revenus professionnels propres (salarié/indépendant) — pas de réduction PrP'],
  ['pension', 'Pensions, rentes ou assimilés ≤ 565 €/mois — réduction supplémentaire PrP'],
  ['faibles', 'Faibles revenus (≤ 283 €/mois) — réduction supplémentaire PrP'],
  ['aucun', 'Pas de revenus professionnels propres — réduction supplémentaire PrP'],
];

/* Section repliable */
function Section({ titre, sous, ouvert, onToggle, children, complet }) {
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <button type="button" onClick={onToggle}
        className="w-full flex items-center justify-between px-4 py-2.5 bg-iip-gold/5 hover:bg-iip-gold/10 transition text-left">
        <div className="flex items-center gap-2">
          <span className={`text-iip-gold text-sm transition-transform ${ouvert ? 'rotate-90' : ''}`}>▶</span>
          <span className="font-semibold text-iip-gold text-sm">{titre}</span>
          {sous && <span className="text-xs text-gray-400">· {sous}</span>}
        </div>
        {complet && <span className="text-green-600 text-xs">✓</span>}
      </button>
      {ouvert && <div className="px-4 py-3 space-y-3">{children}</div>}
    </div>
  );
}

/* Champs stables (définis au niveau module → jamais démontés, focus préservé) */
const FIELD_CLS = "w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold";

function Labelled({ label, children }) {
  return (
    <div>
      <label className="block text-xs text-gray-600 mb-0.5">{label}</label>
      {children}
    </div>
  );
}

function TextField({ label, value, onChange, type = 'text', placeholder }) {
  return (
    <Labelled label={label}>
      <input type={type} value={value ?? ''} placeholder={placeholder}
        autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}
        name={`field_${label?.replace(/[^a-zA-Z]/g, '') || 'x'}_${Math.random().toString(36).slice(2, 8)}`}
        onChange={e => onChange(e.target.value)} className={FIELD_CLS} />
    </Labelled>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <Labelled label={label}>
      <select value={value ?? ''} onChange={e => onChange(e.target.value)} className={FIELD_CLS}>
        {options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
    </Labelled>
  );
}

function OuiNon({ label, value, onChange }) {
  return (
    <SelectField label={label} value={value} onChange={onChange}
      options={[['non', 'Non'], ['oui', 'Oui']]} />
  );
}

export default function ProfFicheModal({ prof, onClose, onSaved }) {
  const isNew = !prof?.id;

  // Champs simples (colonne professeur)
  const [form, setForm] = useState({
    // Identité
    nom: '', prenom: '', sexe: '', niss: '', nationalite: '',
    date_naissance: '', lieu_naissance_ville: '', lieu_naissance_pays: '',
    // Coordonnées
    adresse_rue: '', code_postal: '', commune: '',
    adresse_mail: '', mail_prive: '', tel_gsm: '',
    iban: '', bic: '', compte_titulaire: '',
    // Administratif IIP
    statut: '', capaes: '', anciennete_25_26_po: 0,
    matricule: '', statut_ea12: '',
    // Situation fiscale
    etat_civil: '', handicap: 'non',
    conjoint_nom: '', conjoint_prenom: '', conjoint_handicap: 'non',
    conjoint_alloc_foyer: 'non', conjoint_revenus: 'pro',
    // CE 883/2004
    ce883_actif: 'non', ce883_date_debut: '', ce883_caisse: '', ce883_num_inscription: '',
  });

  // Listes dynamiques
  const [titres, setTitres] = useState([]);     // {date_obtention, intitule, delivre_par}
  const [charges, setCharges] = useState([]);   // {categorie, date_naissance, handicap}

  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(!isNew);
  const [open, setOpen] = useState({ identite: true }); // sections ouvertes

  function toggle(k) { setOpen(o => ({ ...o, [k]: !o[k] })); }
  function set(k, v) { setForm(f => ({ ...f, [k]: v })); }

  // Charger les données complètes du prof (avec titres + charges)
  useEffect(() => {
    if (isNew) return;
    api.professeur(prof.id).then(p => {
      setForm(f => {
        const next = { ...f };
        Object.keys(f).forEach(k => { if (p[k] !== undefined && p[k] !== null) next[k] = p[k]; });
        if (!next.handicap) next.handicap = 'non';
        if (!next.conjoint_handicap) next.conjoint_handicap = 'non';
        if (!next.conjoint_alloc_foyer) next.conjoint_alloc_foyer = 'non';
        if (!next.conjoint_revenus) next.conjoint_revenus = 'pro';
        if (!next.ce883_actif) next.ce883_actif = 'non';
        return next;
      });
      setTitres((p.titres || []).map(t => ({
        date_obtention: t.date_obtention || '', intitule: t.intitule || '', delivre_par: t.delivre_par || ''
      })));
      setCharges((p.charges || []).map(c => ({
        categorie: c.categorie || 'enfant', date_naissance: c.date_naissance || '', handicap: c.handicap || 'non'
      })));
    }).catch(e => alert('Erreur de chargement : ' + e.message))
      .finally(() => setLoading(false));
  }, [prof, isNew]);

  // ── Titres ──
  function addTitre() { setTitres(t => [...t, { date_obtention: '', intitule: '', delivre_par: '' }]); }
  function setTitre(i, k, v) { setTitres(t => t.map((x, j) => j === i ? { ...x, [k]: v } : x)); }
  function delTitre(i) { setTitres(t => t.filter((_, j) => j !== i)); }

  // ── Charges ──
  function addCharge(cat) { setCharges(c => [...c, { categorie: cat, date_naissance: '', handicap: 'non' }]); }
  function setCharge(i, k, v) { setCharges(c => c.map((x, j) => j === i ? { ...x, [k]: v } : x)); }
  function delCharge(i) { setCharges(c => c.filter((_, j) => j !== i)); }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.nom.trim() || !form.prenom.trim()) return alert('Nom et prénom sont obligatoires');
    setSaving(true);
    try {
      let id = prof?.id;
      if (isNew) {
        const r = await api.createProfesseur(form);
        id = r.id;
        // Puis appliquer les champs étendus via PATCH
        await api.updateProfesseur(id, form);
      } else {
        await api.updateProfesseur(id, form);
      }
      // Sauver titres + charges
      await api.saveProfTitres(id, titres);
      await api.saveProfCharges(id, charges);
      onSaved();
    } catch (e) { alert('Erreur : ' + e.message); }
    finally { setSaving(false); }
  }

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40">
        <div className="bg-white rounded-xl shadow-2xl px-8 py-6 text-gray-400">Chargement…</div>
      </div>
    );
  }

  const charByCat = (cat) => charges.map((c, i) => ({ c, i })).filter(x => x.c.categorie === cat);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-40"
      onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl max-w-3xl w-full border-t-4 border-iip-gold overflow-hidden flex flex-col max-h-[92vh]">
        <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 flex-shrink-0">
          <h2 className="font-title text-lg text-iip-gold">
            {isNew ? 'Nouveau membre du personnel' : `Fiche — ${prof.nom_prenom || prof.nom + ' ' + prof.prenom}`}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-5 space-y-3 overflow-auto">

          {/* 1. Identité civile */}
          <Section titre="1 · Identité civile" ouvert={open.identite} onToggle={() => toggle('identite')}>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Nom *" value={form.nom} onChange={v => set('nom', v)} />
              <TextField label="Prénom *" value={form.prenom} onChange={v => set('prenom', v)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <SelectField label="Sexe" value={form.sexe} onChange={v => set('sexe', v)}
                options={[['', '—'], ['F', 'F'], ['M', 'M']]} />
              <TextField label="Date de naissance" type="date" value={form.date_naissance} onChange={v => set('date_naissance', v)} />
              <TextField label="Nationalité" value={form.nationalite} onChange={v => set('nationalite', v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="NISS / NISS bis" placeholder="00.00.00-000.00" value={form.niss} onChange={v => set('niss', v)} />
              <TextField label="Matricule enseignant" placeholder="11 chiffres" value={form.matricule} onChange={v => set('matricule', v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Lieu de naissance — ville" value={form.lieu_naissance_ville} onChange={v => set('lieu_naissance_ville', v)} />
              <TextField label="Lieu de naissance — pays" value={form.lieu_naissance_pays} onChange={v => set('lieu_naissance_pays', v)} />
            </div>
          </Section>

          {/* 2. Coordonnées */}
          <Section titre="2 · Coordonnées & compte bancaire" ouvert={open.coord} onToggle={() => toggle('coord')}>
            <TextField label="Adresse (rue + n°)" value={form.adresse_rue} onChange={v => set('adresse_rue', v)} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="Code postal" value={form.code_postal} onChange={v => set('code_postal', v)} />
              <TextField label="Localité" value={form.commune} onChange={v => set('commune', v)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <TextField label="E-mail" type="email" value={form.adresse_mail} onChange={v => set('adresse_mail', v)} />
              <TextField label="Tél. / GSM" value={form.tel_gsm} onChange={v => set('tel_gsm', v)} />
            </div>
            <TextField label="E-mail privé" type="email" value={form.mail_prive} onChange={v => set('mail_prive', v)} />
            <div className="grid grid-cols-2 gap-3">
              <TextField label="N° compte IBAN" placeholder="BE00 0000 0000 0000" value={form.iban} onChange={v => set('iban', v)} />
              <TextField label="BIC (si compte étranger)" value={form.bic} onChange={v => set('bic', v)} />
            </div>
            <TextField label="Compte au nom de" placeholder="si différent du MDP" value={form.compte_titulaire} onChange={v => set('compte_titulaire', v)} />
          </Section>

          {/* 3. Titres de capacité */}
          <Section titre="3 · Titres de capacité" sous={`${titres.length} titre(s)`}
            ouvert={open.titres} onToggle={() => toggle('titres')}>
            <p className="text-xs text-gray-500">Diplômes, brevets, certificats, attestations, reconnaissance d'expérience utile…</p>
            {titres.map((t, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end border-b border-gray-100 pb-2">
                <div className="col-span-3">
                  <TextField label="Date" type="date" value={t.date_obtention} onChange={v => setTitre(i, 'date_obtention', v)} />
                </div>
                <div className="col-span-5">
                  <TextField label="Intitulé — spécificité — niveau" value={t.intitule} onChange={v => setTitre(i, 'intitule', v)} />
                </div>
                <div className="col-span-3">
                  <TextField label="Délivré par" value={t.delivre_par} onChange={v => setTitre(i, 'delivre_par', v)} />
                </div>
                <div className="col-span-1 text-right">
                  <button type="button" onClick={() => delTitre(i)} className="text-red-400 hover:text-red-600 text-sm" title="Retirer">🗑</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addTitre} className="text-iip-gold hover:text-iip-amber text-sm font-medium">＋ Ajouter un titre</button>
          </Section>

          {/* 4. Situation fiscale */}
          <Section titre="4 · Situation fiscale" ouvert={open.fiscal} onToggle={() => toggle('fiscal')}>
            <div className="grid grid-cols-2 gap-3">
              <SelectField label="État civil" value={form.etat_civil} onChange={v => set('etat_civil', v)} options={ETAT_CIVIL} />
              <OuiNon label="Personne porteuse d'un handicap" value={form.handicap} onChange={v => set('handicap', v)} />
            </div>
            {['marie', 'cohab_legal'].includes(form.etat_civil) && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-3 border border-gray-100">
                <div className="text-xs font-semibold text-gray-600">Situation du conjoint / cohabitant légal</div>
                <div className="grid grid-cols-2 gap-3">
                  <TextField label="Nom" value={form.conjoint_nom} onChange={v => set('conjoint_nom', v)} />
                  <TextField label="Prénom" value={form.conjoint_prenom} onChange={v => set('conjoint_prenom', v)} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <OuiNon label="Conjoint handicapé" value={form.conjoint_handicap} onChange={v => set('conjoint_handicap', v)} />
                  <OuiNon label="Bénéficiaire allocation de foyer" value={form.conjoint_alloc_foyer} onChange={v => set('conjoint_alloc_foyer', v)} />
                </div>
                <SelectField label="Revenus du conjoint" value={form.conjoint_revenus} onChange={v => set('conjoint_revenus', v)} options={REVENUS_CONJOINT} />
              </div>
            )}
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠️ Marié(e)/cohabitant(e) légal(e) : joindre la déclaration de précompte professionnel,
              sans laquelle les enfants ne seront pas renseignés à charge.
            </p>
          </Section>

          {/* 5. Personnes à charge */}
          <Section titre="5 · Personnes fiscalement à charge" sous={`${charges.length} personne(s)`}
            ouvert={open.charges} onToggle={() => toggle('charges')}>
            {[
              ['enfant', 'Enfant(s) à charge'],
              ['autre_65', 'Personne(s) de +65 ans à charge'],
              ['autre', 'Autre(s) personne(s) à charge'],
            ].map(([cat, titre]) => (
              <div key={cat} className="space-y-2">
                <div className="text-xs font-semibold text-gray-600">{titre}</div>
                {charByCat(cat).map(({ c, i }) => (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end">
                    <div className="col-span-5">
                      <TextField label="Date de naissance" type="date" value={c.date_naissance} onChange={v => setCharge(i, 'date_naissance', v)} />
                    </div>
                    <div className="col-span-5">
                      <OuiNon label="Handicap" value={c.handicap} onChange={v => setCharge(i, 'handicap', v)} />
                    </div>
                    <div className="col-span-2 text-right">
                      <button type="button" onClick={() => delCharge(i)} className="text-red-400 hover:text-red-600 text-sm" title="Retirer">🗑</button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => addCharge(cat)} className="text-iip-gold hover:text-iip-amber text-xs font-medium">＋ Ajouter</button>
              </div>
            ))}
          </Section>

          {/* 6. Données internes IIP */}
          <Section titre="6 · Données internes IIP" ouvert={open.iip} onToggle={() => toggle('iip')}>
            <div className="grid grid-cols-3 gap-3">
              <SelectField label="Statut" value={form.statut} onChange={v => set('statut', v)}
                options={[['', '—'], ['CC', 'CC — Chargé de cours'], ['EXP', 'EXP — Expert']]} />
              <SelectField label="CAPAES" value={form.capaes} onChange={v => set('capaes', v)}
                options={[['', '—'], ['x', 'Oui']]} />
              <SelectField label="Statut EA12" value={form.statut_ea12} onChange={v => set('statut_ea12', v)}
                options={[['', '—'], ['T', 'T'], ['TPr', 'TPr'], ['St', 'St'], ['D', 'D'], ['ACS', 'ACS'], ['APE', 'APE'], ['PTP', 'PTP']]} />
            </div>
            <Labelled label="Ancienneté PO 25-26">
              <input type="number" min="0" value={form.anciennete_25_26_po}
                onChange={e => set('anciennete_25_26_po', Number(e.target.value))} className={FIELD_CLS} />
            </Labelled>
          </Section>

          {/* 7. Règlement CE 883/2004 */}
          <Section titre="7 · Règlement CE 883/2004" sous="résident d'un autre État UE"
            ouvert={open.ce883} onToggle={() => toggle('ce883')}>
            <OuiNon label="Concerné (réside dans un autre État UE + activité rémunérée)" value={form.ce883_actif} onChange={v => set('ce883_actif', v)} />
            {form.ce883_actif === 'oui' && (
              <>
                <TextField label="Date de début de l'activité dans le pays de résidence" type="date" value={form.ce883_date_debut} onChange={v => set('ce883_date_debut', v)} />
                <TextField label="Dénomination + adresse de la caisse de sécurité sociale" value={form.ce883_caisse} onChange={v => set('ce883_caisse', v)} />
                <TextField label="Numéro d'inscription" value={form.ce883_num_inscription} onChange={v => set('ce883_num_inscription', v)} />
              </>
            )}
          </Section>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-2 border-t border-gray-100 sticky bottom-0 bg-white">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">Annuler</button>
            <button type="submit" disabled={saving}
              className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
              {saving ? 'Sauvegarde…' : isNew ? 'Créer la fiche' : 'Enregistrer'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
