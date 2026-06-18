import { useState, useEffect, useMemo } from 'react';
import { getAnnee } from '../lib/api.js';

const TOKEN = () => localStorage.getItem('token');
const authFetch = (url, opts = {}) =>
  fetch(url, { ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${TOKEN()}`, ...opts.headers } }).then(r => r.json());

/**
 * WizardConfigCours — assistant qui guide la coordination pour modéliser
 * le fonctionnement pédagogique d'un cours, et génère les "lignes de blocs"
 * (1 ligne théorie + N lignes TP par sous-groupe, etc.).
 *
 * Props :
 *   cours    : { cours_code, cours_nom, cours_per, ue_num, section }
 *   annee    : année scolaire
 *   onGenerate(lignes) : callback avec les lignes générées
 *   onClose()
 *
 * Format d'une ligne générée :
 *   { type:'theorie'|'tp'|'cours', label, heures, groupe, local_id, sequence }
 */
export default function WizardConfigCours({ cours: coursInit, ueNum, section, annee = getAnnee(), onGenerate, onClose }) {
  const [step, setStep] = useState(coursInit ? 1 : 0);
  const [locaux, setLocaux] = useState([]);
  const [effectif, setEffectif] = useState(null);
  const [coursListe, setCoursListe] = useState([]);
  const [cours, setCours] = useState(coursInit || null);

  // Charger la liste des cours réels de l'UE (on ne peut configurer qu'un cours existant)
  useEffect(() => {
    if (ueNum) {
      authFetch(`/api/ref/ue/${ueNum}?annee=${encodeURIComponent(annee)}`)
        .then(d => setCoursListe(Array.isArray(d?.cours) ? d.cours.filter(c => c.ct_pp !== 'Z') : []))
        .catch(() => setCoursListe([]));
    }
  }, [ueNum, annee]);

  // Réponses du wizard
  const [format, setFormat]         = useState('');        // 'classique' | 'mixte' | 'pratique'
  const [localTheorie, setLocalTheorie] = useState('');    // local_id
  const [heuresTheorie, setHeuresTheorie] = useState('');  // heures partie théorique
  const [heuresTP, setHeuresTP]     = useState('');        // heures de TP (par groupe)
  const [localTP, setLocalTP]       = useState('');        // local_id du TP
  const [capaciteTP, setCapaciteTP] = useState('');        // étudiants max par sous-groupe
  const [nbGroupes, setNbGroupes]   = useState(1);         // nombre de sous-groupes TP
  const [sequence, setSequence]     = useState('bloc');    // 'bloc' | 'alternance' | 'parallele' | 'rotation'
  const [coTitulature, setCoTit]    = useState(false);     // prof théorie ≠ prof TP

  const totalPer = cours?.cours_per || 0;

  useEffect(() => {
    authFetch('/api/locaux').then(d => setLocaux(Array.isArray(d) ? d : [])).catch(() => {});
    if (ueNum) {
      authFetch(`/api/locaux/effectif-ue/${ueNum}?annee=${encodeURIComponent(annee)}`)
        .then(setEffectif).catch(() => {});
    }
  }, [ueNum, annee]);

  // Quand on choisit un local TP, pré-remplir sa capacité
  useEffect(() => {
    if (localTP) {
      const l = locaux.find(x => String(x.id) === String(localTP));
      if (l?.places) setCapaciteTP(String(l.places));
    }
  }, [localTP, locaux]);

  // Calcul auto du nombre de sous-groupes = effectif / capacité (arrondi sup.)
  const nbGroupesSuggere = useMemo(() => {
    const eff = effectif?.total || 0;
    const cap = Number(capaciteTP) || 0;
    if (!eff || !cap) return 1;
    return Math.max(1, Math.ceil(eff / cap));
  }, [effectif, capaciteTP]);

  useEffect(() => { setNbGroupes(nbGroupesSuggere); }, [nbGroupesSuggere]);

  // Validation des heures (théorie + TP doit = total DP pour un cours mixte)
  const heuresOK = useMemo(() => {
    if (format === 'classique') return true;
    if (format === 'pratique') return Number(heuresTP) > 0;
    // mixte : théorie + TP = total (le TP compte une fois côté étudiant)
    const t = Number(heuresTheorie) || 0;
    const tp = Number(heuresTP) || 0;
    return t > 0 && tp > 0;
  }, [format, heuresTheorie, heuresTP]);

  const localNom = id => locaux.find(l => String(l.id) === String(id))?.nom || '—';

  // Génère les lignes de blocs selon les réponses
  function genererLignes() {
    const lignes = [];
    if (format === 'classique') {
      lignes.push({ type: 'theorie', label: 'Cours (auditoire)', heures: totalPer, groupe: 'A', local_id: localTheorie || null, sequence });
    } else {
      const t = Number(heuresTheorie) || 0;
      const tp = Number(heuresTP) || 0;
      if (format === 'mixte' && t > 0) {
        lignes.push({ type: 'theorie', label: 'Théorie (groupe entier)', heures: t, groupe: '—', local_id: localTheorie || null, sequence });
      }
      // N lignes de TP (un par sous-groupe), même nb d'heures
      for (let g = 0; g < nbGroupes; g++) {
        const lettre = String.fromCharCode(65 + g); // A, B, C…
        lignes.push({ type: 'tp', label: `TP groupe ${lettre}`, heures: tp, groupe: lettre, local_id: localTP || null, sequence });
      }
    }
    onGenerate(lignes, {
      format, sequence, nbGroupes, coTitulature,
      heuresTheorie: Number(heuresTheorie) || 0, heuresTP: Number(heuresTP) || 0,
      localTheorie, localTP, capaciteTP: Number(capaciteTP) || 0,
    });
  }

  // Étapes : 0 = choix cours (si non fourni), 1 = format, 2 = heures, 3 = TP, 4 = séquence
  const minStep = coursInit ? 1 : 0;
  const totalSteps = format === 'classique' ? 2 : 4;
  const canNext = () => {
    if (step === 0) return !!cours;
    if (step === 1) return !!format;
    if (step === 2 && format === 'classique') return true;
    if (step === 2) return heuresOK;
    if (step === 3) return format === 'pratique' || true;
    return true;
  };

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-[60] p-4" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col">
        {/* En-tête */}
        <div className="border-b border-gray-200 p-4">
          <div className="flex items-center justify-between">
            <h2 className="font-title text-lg text-iip-gold">⚙ Configuration du cours</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-red-500 text-2xl leading-none">×</button>
          </div>
          <div className="text-sm text-gray-600 mt-1">
            {cours?.cours_code} — {cours?.cours_nom}
            <span className="text-gray-400"> · {totalPer} pér. DP</span>
            {effectif && <span className="text-violet-600 ml-2">· {effectif.total} étudiants inscrits</span>}
          </div>
          {/* Progression */}
          <div className="flex gap-1.5 mt-3">
            {Array.from({ length: totalSteps }).map((_, i) => (
              <div key={i} className={`h-1.5 flex-1 rounded-full ${i < step ? 'bg-iip-gold' : 'bg-gray-200'}`} />
            ))}
          </div>
        </div>

        {/* Corps */}
        <div className="flex-1 overflow-auto p-5">
          {/* ── Étape 0 : choix du cours ── */}
          {step === 0 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Quel cours souhaitez-vous configurer ?</p>
              {coursListe.length === 0 ? (
                <div className="text-sm text-gray-400 py-8 text-center">Aucun cours dans cette UE.</div>
              ) : coursListe.map(c => (
                <button key={c.cours_code} onClick={() => setCours(c)}
                  className={`w-full text-left border rounded-lg p-3 transition ${cours?.cours_code === c.cours_code ? 'border-iip-gold bg-iip-gold/5' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="font-medium text-gray-800">{c.cours_code} — {c.cours_nom}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {c.cours_per} pér. · {c.ct_pp || '—'}{c.dedouble === 'O' ? ' · dédoublé' : ''}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Étape 1 : format ── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Quel est le format de ce cours ?</p>
              {[
                ['classique', '📊 Cours classique', 'Théorie en groupe entier, un seul local (auditoire/classe)'],
                ['mixte', '🔬 Cours mixte', 'Une partie théorique en groupe entier + des TP/labo en sous-groupes'],
                ['pratique', '🧪 Entièrement pratique', 'Que du TP/labo, pas de partie théorique en auditoire'],
              ].map(([val, titre, desc]) => (
                <button key={val} onClick={() => setFormat(val)}
                  className={`w-full text-left border rounded-lg p-3 transition ${format === val ? 'border-iip-gold bg-iip-gold/5' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="font-medium text-gray-800">{titre}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                </button>
              ))}
            </div>
          )}

          {/* ── Étape 2 : heures + local théorie ── */}
          {step === 2 && format === 'classique' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">Local du cours</p>
              <select value={localTheorie} onChange={e => setLocalTheorie(e.target.value)}
                className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                <option value="">— Choisir un local —</option>
                {locaux.map(l => <option key={l.id} value={l.id}>{l.nom} · {l.type}{l.places ? ` (${l.places} pl.)` : ''}</option>)}
              </select>
              <div className="bg-iip-turquoise/5 rounded p-3 text-sm text-iip-blue">
                Le cours occupera <strong>{totalPer} périodes</strong> en groupe entier dans ce local.
              </div>
            </div>
          )}
          {step === 2 && format !== 'classique' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">Répartition des heures</p>
              {format === 'mixte' && (
                <label className="block">
                  <span className="text-xs text-gray-500">Heures de théorie (groupe entier)</span>
                  <input type="number" min="0" value={heuresTheorie} onChange={e => setHeuresTheorie(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="ex. 10" />
                </label>
              )}
              <label className="block">
                <span className="text-xs text-gray-500">Heures de TP/labo (par sous-groupe)</span>
                <input type="number" min="0" value={heuresTP} onChange={e => setHeuresTP(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="ex. 20" />
              </label>
              {format === 'mixte' && (
                <div className={`text-xs rounded p-2 ${(Number(heuresTheorie)+Number(heuresTP)) === totalPer ? 'bg-green-50 text-green-700' : 'bg-amber-50 text-amber-700'}`}>
                  Théorie {Number(heuresTheorie)||0} + TP {Number(heuresTP)||0} = {(Number(heuresTheorie)||0)+(Number(heuresTP)||0)} pér.
                  {(Number(heuresTheorie)+Number(heuresTP)) !== totalPer && ` (DP : ${totalPer} pér.)`}
                </div>
              )}
            </div>
          )}

          {/* ── Étape 3 : sous-groupes TP ── */}
          {step === 3 && format !== 'classique' && (
            <div className="space-y-4">
              <p className="text-sm font-medium text-gray-700">Sous-groupes de TP</p>
              <label className="block">
                <span className="text-xs text-gray-500">Local de pratique</span>
                <select value={localTP} onChange={e => setLocalTP(e.target.value)}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm">
                  <option value="">— Choisir un local —</option>
                  {locaux.map(l => <option key={l.id} value={l.id}>{l.nom} · {l.type}{l.places ? ` (${l.places} pl.)` : ''}</option>)}
                </select>
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-xs text-gray-500">Étudiants max / sous-groupe</span>
                  <input type="number" min="1" value={capaciteTP} onChange={e => setCapaciteTP(e.target.value)}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm" placeholder="capacité" />
                </label>
                <label className="block">
                  <span className="text-xs text-gray-500">Nombre de sous-groupes</span>
                  <input type="number" min="1" value={nbGroupes} onChange={e => setNbGroupes(Math.max(1, Number(e.target.value) || 1))}
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm" />
                </label>
              </div>
              {effectif && Number(capaciteTP) > 0 && (
                <div className="bg-violet-50 rounded p-3 text-sm text-violet-700">
                  {effectif.total} étudiants ÷ {capaciteTP} places = <strong>{nbGroupesSuggere} sous-groupe(s)</strong> suggéré(s)
                  {nbGroupes !== nbGroupesSuggere && <span className="text-amber-600"> · vous avez forcé {nbGroupes}</span>}
                  <div className="text-xs text-violet-500 mt-1">
                    Charge prof TP : {Number(heuresTP)||0}h × {nbGroupes} groupes = <strong>{(Number(heuresTP)||0)*nbGroupes}h</strong>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Étape 4 : séquence ── */}
          {step === (format === 'classique' ? 99 : 4) && (
            <div className="space-y-3">
              <p className="text-sm font-medium text-gray-700">Comment s'enchaînent théorie et TP ?</p>
              {[
                ['bloc', 'Bloc puis bloc', "D'abord toute la théorie, ensuite les TP"],
                ['alternance', 'Alternance', '1 semaine théorie / 1 semaine TP, en alternance'],
                ['parallele', 'En parallèle', 'Théorie et TP sur les mêmes semaines (groupes qui tournent)'],
                ['rotation', 'Rotation des groupes', 'Les sous-groupes TP tournent sur les créneaux'],
              ].map(([val, titre, desc]) => (
                <button key={val} onClick={() => setSequence(val)}
                  className={`w-full text-left border rounded-lg p-3 transition ${sequence === val ? 'border-iip-gold bg-iip-gold/5' : 'border-gray-200 hover:border-gray-300'}`}>
                  <div className="font-medium text-gray-800">{titre}</div>
                  <div className="text-xs text-gray-500 mt-0.5">{desc}</div>
                </button>
              ))}
              <label className="flex items-center gap-2 text-sm text-gray-600 mt-2">
                <input type="checkbox" checked={coTitulature} onChange={e => setCoTit(e.target.checked)} />
                Co-titulature : un prof pour la théorie, un autre pour les TP
              </label>

              {/* Aperçu des lignes générées */}
              <div className="mt-4 border-t border-gray-100 pt-3">
                <p className="text-xs font-semibold text-gray-500 uppercase mb-2">Aperçu des lignes générées</p>
                <div className="space-y-1 text-sm">
                  {format === 'classique' ? (
                    <div className="flex justify-between bg-iip-turquoise/5 rounded px-2 py-1">
                      <span>Cours (auditoire) — {localNom(localTheorie)}</span><span>{totalPer}h</span>
                    </div>
                  ) : (
                    <>
                      {format === 'mixte' && Number(heuresTheorie) > 0 && (
                        <div className="flex justify-between bg-iip-turquoise/5 rounded px-2 py-1">
                          <span>Théorie (groupe entier) — {localNom(localTheorie)}</span><span>{heuresTheorie}h</span>
                        </div>
                      )}
                      {Array.from({ length: nbGroupes }).map((_, g) => (
                        <div key={g} className="flex justify-between bg-amber-50 rounded px-2 py-1">
                          <span>TP groupe {String.fromCharCode(65+g)} — {localNom(localTP)}</span><span>{heuresTP}h</span>
                        </div>
                      ))}
                    </>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Pied : navigation */}
        <div className="border-t border-gray-200 p-4 flex items-center justify-between">
          <button onClick={() => step > minStep ? setStep(step - 1) : onClose()}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-800">
            {step > minStep ? '← Précédent' : 'Annuler'}
          </button>
          {(step === 0 || step < totalSteps) ? (
            <button onClick={() => canNext() && setStep(step + 1)} disabled={!canNext()}
              className="bg-iip-gold hover:bg-iip-amber disabled:opacity-40 text-white text-sm px-5 py-2 rounded font-medium">
              Suivant →
            </button>
          ) : (
            <button onClick={genererLignes}
              className="bg-iip-gold hover:bg-iip-amber text-white text-sm px-5 py-2 rounded font-medium">
              ✓ Générer les lignes
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
