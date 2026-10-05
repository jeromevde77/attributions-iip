import { useEffect, useState } from 'react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { informer } from '../lib/dialogue.jsx';
import { Encadre } from './ui.jsx';

/**
 * L'ONGLET « SLE » DE LA FICHE (3.1.60, Charles, 5 octobre 2026 : « compléter
 * les annexes une à une me semble compliqué ; un onglet SLE dans la fiche, qui
 * n'existe QUE si l'étudiant est en SLE ; le motif proposé par Lucie »).
 *
 * Ce que les annexes 1 et 2 de l'Office des Étrangers demandent et que Lucie ne
 * peut pas déduire se saisit ici, une fois par année, et se garde
 * (routes/sle.js). Le lot d'Éditions le lit : les annexes sortent complètes,
 * sans formulaire pièce par pièce. Ce que Lucie sait déjà — grade, crédits,
 * situation proposée — est rappelé, pas ressaisi.
 */
const VIDE = { situation: '', echange_du: '', echange_au: '', date_ultime: '', mobilite: false, mobilite_mois: '',
  raisons: '', conditions: '', motif_a2: '', avis_a2: '' };

export default function OngletSLE({ etudId, annee: anneeDepart }) {
  const [annee, setAnnee] = useState(anneeDepart);
  const [annees, setAnnees] = useState([]);
  const [sle, setSle] = useState(null);
  const [a1, setA1] = useState(null);
  const [a2, setA2] = useState(null);
  const [f, setF] = useState(VIDE);
  const [modifie, setModifie] = useState(false);
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState(null);
  const set = (k, v) => { setF(x => ({ ...x, [k]: v })); setModifie(true); };

  useEffect(() => {
    fetch('/api/annees', { headers: authHeaders() }).then(r => r.json())
      .then(l => setAnnees((Array.isArray(l) ? l : []).map(a => a.code).filter(Boolean))).catch(() => {});
  }, []);
  useEffect(() => {
    let vivant = true;
    setErreur(null); setSle(null);
    const lire = u => fetch(u, { headers: authHeaders() }).then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; });
    Promise.all([lire(`/api/sle/${etudId}?annee=${encodeURIComponent(annee)}`),
      lire(`/api/annexe1/donnees/${etudId}?annee=${encodeURIComponent(annee)}`),
      lire(`/api/annexe2/donnees/${etudId}?annee=${encodeURIComponent(annee)}`)])
      .then(([s, d1, d2]) => {
        if (!vivant) return;
        setSle(s); setA1(d1); setA2(d2);
        const e = s.enregistre || {};
        setF({
          situation: e.situation || d1.situation_proposee || 'definitive',
          echange_du: e.echange_du || '', echange_au: e.echange_au || '', date_ultime: e.date_ultime || '',
          mobilite: !!e.mobilite, mobilite_mois: e.mobilite_mois || '',
          raisons: e.raisons || '', conditions: e.conditions || '',
          motif_a2: e.motif_a2 || s.propositions?.motif_a2 || '', avis_a2: e.avis_a2 || '',
        });
        setModifie(false);
      })
      .catch(e => vivant && setErreur(e.message));
    return () => { vivant = false; };
  }, [etudId, annee]);

  async function enregistrer() {
    setEnCours(true);
    try {
      const r = await fetch(`/api/sle/${etudId}`, { method: 'PUT', headers: authHeaders(), body: JSON.stringify({ annee, ...f }) });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`);
      setSle(s => ({ ...s, enregistre: j.enregistre })); setModifie(false);
    } catch (e) { informer(e.message); } finally { setEnCours(false); }
  }

  async function apercu(n) {
    if (modifie) await enregistrer();
    const r = await fetch(`/api/annexe${n}/document`, { method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ etudiant_id: etudId, annee }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { informer(j.error || 'La pièce n’a pas pu être composée.'); return; }
    const nom = `Annexe${n}_${(a1?.etudiant?.nom || '').toUpperCase()}_${annee}`.replace(/[^A-Za-z0-9_.-]+/g, '_');
    // LE MODÈLE OFFICIEL N'A NI EN-TÊTE NI PIED : le PDF n'en ajoute pas.
    ouvrirApercu({ html: j.html, titre: n === 1 ? 'Visa ou titre de séjour étudiant (annexe 1)' : 'Progrès des études (annexe 2)',
      sousTitre: annee, nomFichier: nom, destinataire: { type: 'etudiant', id: etudId }, typeDoc: `annexe${n}`,
      astuceImpression: null, pdf: { orientation: 'portrait', pied: false } });
  }

  if (erreur) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!sle || !a1) return <p className="text-[13px] text-slate-400">Chargement du dossier SLE…</p>;
  const peut = !!sle.peut_ecrire;
  const def = f.situation === 'definitive';
  const admis = f.situation === 'admis' || f.situation === 'preparatoire_admis';
  const credits = a1.credits_annee;
  const sous54 = def && Number(credits) < 54;
  const manques = [...new Set([...(a1.manques || []), ...(a2?.manques || [])])];
  const lab = 'block text-[12px] text-slate-600';
  const proposition = sle.propositions?.motif_a2 || '';

  return (
    <fieldset disabled={!peut} className={`space-y-4 text-[13px] ${peut ? '' : 'ligne-lecture'}`}>
      <div className="flex flex-wrap items-center gap-2">
        <select className="controle text-[13px]" value={annee} onChange={e => setAnnee(e.target.value)}>
          {(annees.length ? annees : [annee]).map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-[12px] text-slate-500">
          {sle.enregistre ? `Enregistré${sle.enregistre.maj_par ? ` par ${sle.enregistre.maj_par}` : ''} le ${String(sle.enregistre.maj_le || '').slice(0, 10).split('-').reverse().join('/')}` : 'Rien d’enregistré pour cette année : Lucie propose, à vous de confirmer.'}
        </span>
        <span className="flex-1" />
        <button type="button" className="bouton controle" disabled={false} onClick={() => apercu(1)}>Aperçu annexe 1</button>
        <button type="button" className="bouton controle" disabled={false} onClick={() => apercu(2)}>Aperçu annexe 2</button>
        {peut && <button type="button" className="bouton bouton-fort controle" disabled={enCours || !modifie} onClick={enregistrer}>
          {enCours ? 'Enregistrement…' : 'Enregistrer'}</button>}
      </div>

      {manques.length > 0 && (
        <Encadre etat="surveiller">
          <b>Manque encore</b> : {manques.join(' ; ')}. Ces champs resteront en pointillés : la pièce part à une
          administration fédérale, mieux vaut un blanc qu'une valeur inventée. La nationalité et la date de
          naissance se complètent dans l'onglet Identité.
        </Encadre>
      )}

      <div className="text-[12.5px] text-slate-600">
        Ce que Lucie sait déjà : <b>{a1.formation?.grade || 'grade à régler'}</b>
        {a1.formation?.total_ects ? ` · ${a1.formation.total_ects} ECTS pour la formation` : ''}
        {credits != null ? ` · ${credits} crédits au programme ${annee}` : ''}
        {a2?.credits ? ` · ${a2.credits.acquisAnnee} crédits obtenus cette année, ${a2.credits.acquisTotal} au total` : ''}.
      </div>

      {/* LES DEUX ANNEXES CÔTE À CÔTE sur un écran large (5 octobre 2026 :
          « largeur… ») — l'une sous l'autre sur un écran étroit. */}
      <div className="grid gap-4 xl:grid-cols-2 items-start">
      <section className="border border-slate-200 rounded-carte p-3 space-y-2">
        <div className="text-[14px] font-semibold">Annexe 1 — visa ou titre de séjour</div>
        <fieldset className="space-y-1">
          <legend className="text-[12px] font-semibold text-slate-600 mb-1">Situation de l'étudiant</legend>
          {Object.entries(a1.situations || {}).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2">
              <input type="radio" name="sle-situation" checked={f.situation === k} onChange={() => set('situation', k)} /> {l}
              {k === a1.situation_proposee && <span className="text-[11px] text-slate-400">— proposée par Lucie</span>}
            </label>
          ))}
        </fieldset>
        {f.situation === 'echange' && (
          <div className="grid grid-cols-2 gap-2 max-w-md">
            <label className={lab}>Échange du<input type="date" className="controle w-full" value={f.echange_du} onChange={e => set('echange_du', e.target.value)} /></label>
            <label className={lab}>au<input type="date" className="controle w-full" value={f.echange_au} onChange={e => set('echange_au', e.target.value)} /></label>
          </div>
        )}
        {admis && (
          <label className={lab}>Date ultime d'inscription
            <input type="date" className="controle w-56 block" value={f.date_ultime} onChange={e => set('date_ultime', e.target.value)} /></label>
        )}
        <div className="flex flex-wrap items-center gap-4">
          <span className="text-[12px] text-slate-600">Mobilité dans un autre État membre cette année :</span>
          <label className="flex items-center gap-1"><input type="radio" checked={!f.mobilite} onChange={() => set('mobilite', false)} /> Non</label>
          <label className="flex items-center gap-1"><input type="radio" checked={f.mobilite} onChange={() => set('mobilite', true)} /> Oui</label>
          {f.mobilite && <label className="text-[12px] text-slate-600 flex items-center gap-1">durée
            <input className="controle w-16" value={f.mobilite_mois} onChange={e => set('mobilite_mois', e.target.value)} /> mois</label>}
        </div>
        {def && (
          <label className={lab}>Raisons d'un programme sous 54 crédits {sous54 ? `(${credits} crédits : attendues par le formulaire)` : '(sans objet)'}
            <input className="controle w-full" value={f.raisons} placeholder="ex. année diplômante, étudiant en parcours, unités non encore accessibles"
              data-reponses="sle-raisons" onChange={e => set('raisons', e.target.value)} /></label>
        )}
        {admis && (
          <label className={lab}>Conditions d'admission spécifiques
            <textarea className="controle w-full h-16 py-1.5" value={f.conditions} data-reponses="sle-conditions"
              onChange={e => set('conditions', e.target.value)} /></label>
        )}
      </section>

      <section className="border border-slate-200 rounded-carte p-3 space-y-2">
        <div className="text-[14px] font-semibold">Annexe 2 — progrès des études au terme de {annee}</div>
        <label className={lab}>Raisons pour lesquelles l'étudiant(e) n'a pas obtenu ses crédits
          <textarea className="controle w-full h-20 py-1.5" value={f.motif_a2} data-reponses="sle-motif"
            onChange={e => set('motif_a2', e.target.value)} /></label>
        <div className="text-[11.5px] text-slate-500">
          {proposition
            ? <>Proposé par Lucie à partir des résultats de {annee}. {f.motif_a2 !== proposition && peut && (
                <button type="button" className="underline text-iip-blue" onClick={() => set('motif_a2', proposition)}>reprendre la proposition</button>)}</>
            : `Les résultats de ${annee} ne sont pas encore délibérés : Lucie n'a rien à proposer.`}
        </div>
        <label className={lab}>Avis facultatif sur le déroulement des études
          <textarea className="controle w-full h-16 py-1.5" value={f.avis_a2} placeholder="Néant" data-reponses="sle-avis"
            onChange={e => set('avis_a2', e.target.value)} /></label>
      </section>
      </div>
    </fieldset>
  );
}
