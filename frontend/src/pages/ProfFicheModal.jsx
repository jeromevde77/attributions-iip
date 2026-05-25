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

  // Helpers de rendu (fonctions, pas composants — pour ne pas perdre le focus)
  function input(k, props = {}) {
    return (
      <input value={form[k] ?? ''} onChange={e => set(k, e.target.value)} {...props}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold" />
    );
  }
  function labelled(label, node) {
    return (
      <div>
        <label className="block text-xs text-gray-600 mb-0.5">{label}</label>
        {node}
      </div>
    );
  }
  function ouinon(k, label) {
    return labelled(label, (
      <select value={form[k]} onChange={e => set(k, e.target.value)}
        className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
        <option value="non">Non</option>
        <option value="oui">Oui</option>
      </select>
    ));
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

        <form onSubmit={handleSubmit} className="p-5 space-y-3 overflow-auto">

          {/* ───── 1. Identité civile ───── */}
          <Section titre="1 · Identité civile" ouvert={open.identite} onToggle={() => toggle('identite')}>
            <div className="grid grid-cols-2 gap-3">
              {labelled('Nom *', input('nom'))}
              {labelled('Prénom *', input('prenom'))}
            </div>
            <div className="grid grid-cols-3 gap-3">
              {labelled('Sexe', (
                <select value={form.sexe} onChange={e => set('sexe', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
                  <option value="">—</option><option value="F">F</option><option value="M">M</option>
                </select>
              ))}
              {labelled('Date de naissance', input('date_naissance', { type: 'date' }))}
              {labelled('Nationalité', input('nationalite'))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {labelled('NISS / NISS bis', input('niss', { placeholder: '00.00.00-000.00' }))}
              {labelled('Matricule enseignant', input('matricule', { placeholder: '11 chiffres' }))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {labelled('Lieu de naissance — ville', input('lieu_naissance_ville'))}
              {labelled('Lieu de naissance — pays', input('lieu_naissance_pays'))}
            </div>
          </Section>

          {/* ───── 2. Coordonnées ───── */}
          <Section titre="2 · Coordonnées & compte bancaire" ouvert={open.coord} onToggle={() => toggle('coord')}>
            {labelled('Adresse (rue + n°)', input('adresse_rue'))}
            <div className="grid grid-cols-2 gap-3">
              {labelled('Code postal', input('code_postal'))}
              {labelled('Localité', input('commune'))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {labelled('E-mail', input('adresse_mail', { type: 'email' }))}
              {labelled('Tél. / GSM', input('tel_gsm'))}
            </div>
            {labelled('E-mail privé', input('mail_prive', { type: 'email' }))}
            <div className="grid grid-cols-2 gap-3">
              {labelled('N° compte IBAN', input('iban', { placeholder: 'BE00 0000 0000 0000' }))}
              {labelled('BIC (si compte étranger)', input('bic'))}
            </div>
            {labelled('Compte au nom de', input('compte_titulaire', { placeholder: 'si différent du MDP' }))}
          </Section>

          {/* ───── 3. Titres de capacité ───── */}
          <Section titre="3 · Titres de capacité" sous={`${titres.length} titre(s)`}
            ouvert={open.titres} onToggle={() => toggle('titres')}>
            <p className="text-xs text-gray-500">Diplômes, brevets, certificats, attestations, reconnaissance d'expérience utile…</p>
            {titres.map((t, i) => (
              <div key={i} className="grid grid-cols-12 gap-2 items-end border-b border-gray-100 pb-2">
                <div className="col-span-3">{labelled('Date', (
                  <input type="date" value={t.date_obtention} onChange={e => setTitre(i, 'date_obtention', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold" />
                ))}</div>
                <div className="col-span-5">{labelled('Intitulé — spécificité — niveau', (
                  <input value={t.intitule} onChange={e => setTitre(i, 'intitule', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold" />
                ))}</div>
                <div className="col-span-3">{labelled('Délivré par', (
                  <input value={t.delivre_par} onChange={e => setTitre(i, 'delivre_par', e.target.value)}
                    className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold" />
                ))}</div>
                <div className="col-span-1 text-right">
                  <button type="button" onClick={() => delTitre(i)}
                    className="text-red-400 hover:text-red-600 text-sm" title="Retirer">🗑</button>
                </div>
              </div>
            ))}
            <button type="button" onClick={addTitre}
              className="text-iip-gold hover:text-iip-amber text-sm font-medium">＋ Ajouter un titre</button>
          </Section>

          {/* ───── 4. Situation fiscale ───── */}
          <Section titre="4 · Situation fiscale" ouvert={open.fiscal} onToggle={() => toggle('fiscal')}>
            <div className="grid grid-cols-2 gap-3">
              {labelled('État civil', (
                <select value={form.etat_civil} onChange={e => set('etat_civil', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
                  {ETAT_CIVIL.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              ))}
              {ouinon('handicap', 'Personne porteuse d\'un handicap')}
            </div>

            {/* Conjoint — affiché si marié/cohabitant légal */}
            {['marie', 'cohab_legal'].includes(form.etat_civil) && (
              <div className="bg-gray-50 rounded-lg p-3 space-y-3 border border-gray-100">
                <div className="text-xs font-semibold text-gray-600">Situation du conjoint / cohabitant légal</div>
                <div className="grid grid-cols-2 gap-3">
                  {labelled('Nom', input('conjoint_nom'))}
                  {labelled('Prénom', input('conjoint_prenom'))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {ouinon('conjoint_handicap', 'Conjoint handicapé')}
                  {ouinon('conjoint_alloc_foyer', 'Bénéficiaire allocation de foyer')}
                </div>
                {labelled('Revenus du conjoint', (
                  <select value={form.conjoint_revenus} onChange={e => set('conjoint_revenus', e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
                    {REVENUS_CONJOINT.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </select>
                ))}
              </div>
            )}
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded px-3 py-2">
              ⚠️ Marié(e)/cohabitant(e) légal(e) : joindre la déclaration de précompte professionnel,
              sans laquelle les enfants ne seront pas renseignés à charge.
            </p>
          </Section>

          {/* ───── 5. Personnes à charge ───── */}
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
                    <div className="col-span-5">{labelled('Date de naissance', (
                      <input type="date" value={c.date_naissance} onChange={e => setCharge(i, 'date_naissance', e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold" />
                    ))}</div>
                    <div className="col-span-5">{labelled('Handicap', (
                      <select value={c.handicap} onChange={e => setCharge(i, 'handicap', e.target.value)}
                        className="w-full border border-gray-300 rounded px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
                        <option value="non">Non</option><option value="oui">Oui</option>
                      </select>
                    ))}</div>
                    <div className="col-span-2 text-right">
                      <button type="button" onClick={() => delCharge(i)}
                        className="text-red-400 hover:text-red-600 text-sm" title="Retirer">🗑</button>
                    </div>
                  </div>
                ))}
                <button type="button" onClick={() => addCharge(cat)}
                  className="text-iip-gold hover:text-iip-amber text-xs font-medium">＋ Ajouter</button>
              </div>
            ))}
          </Section>

          {/* ───── 6. Données IIP (interne) ───── */}
          <Section titre="6 · Données internes IIP" ouvert={open.iip} onToggle={() => toggle('iip')}>
            <div className="grid grid-cols-3 gap-3">
              {labelled('Statut', (
                <select value={form.statut} onChange={e => set('statut', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
                  <option value="">—</option><option value="CC">CC — Chargé de cours</option><option value="EXP">EXP — Expert</option>
                </select>
              ))}
              {labelled('CAPAES', (
                <select value={form.capaes} onChange={e => set('capaes', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
                  <option value="">—</option><option value="x">Oui</option>
                </select>
              ))}
              {labelled('Statut EA12', (
                <select value={form.statut_ea12} onChange={e => set('statut_ea12', e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold">
                  <option value="">—</option>
                  {['T', 'TPr', 'St', 'D', 'ACS', 'APE', 'PTP'].map(s => <option key={s} value={s}>{s}</option>)}
                </select>
              ))}
            </div>
            {labelled('Ancienneté PO 25-26', (
              <input type="number" min="0" value={form.anciennete_25_26_po}
                onChange={e => set('anciennete_25_26_po', Number(e.target.value))}
                className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-iip-gold" />
            ))}
          </Section>

          {/* ───── 7. Règlement CE 883/2004 (optionnel) ───── */}
          <Section titre="7 · Règlement CE 883/2004" sous="résident d'un autre État UE"
            ouvert={open.ce883} onToggle={() => toggle('ce883')}>
            {ouinon('ce883_actif', 'Concerné (réside dans un autre État UE + activité rémunérée)')}
            {form.ce883_actif === 'oui' && (
              <>
                {labelled('Date de début de l\'activité dans le pays de résidence', input('ce883_date_debut', { type: 'date' }))}
                {labelled('Dénomination + adresse de la caisse de sécurité sociale', input('ce883_caisse'))}
                {labelled('Numéro d\'inscription', input('ce883_num_inscription'))}
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
