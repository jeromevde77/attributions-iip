import { useState } from 'react';

// ─── Outil d'aide à la décision — Recours (Art. 87-91 RDE/ROI IIP 2026-2027) ──

function addJoursOuvrables(date, n) {
  const d = new Date(date);
  let count = 0;
  while (count < n) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0) count++; // dimanche exclus (fériés non gérés ici)
  }
  return d;
}

function addJoursCalendrier(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function fmt(d) {
  if (!d) return '—';
  if (typeof d === 'string') d = new Date(d);
  return d.toLocaleDateString('fr-BE', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
}

function Badge({ ok, label }) {
  return ok
    ? <span className="inline-flex items-center gap-1 bg-green-100 text-green-800 border border-green-300 rounded-full px-3 py-0.5 text-sm font-semibold">✓ {label}</span>
    : <span className="inline-flex items-center gap-1 bg-red-100 text-red-800 border border-red-300 rounded-full px-3 py-0.5 text-sm font-semibold">✗ {label}</span>;
}

function Ref({ text }) {
  return <span className="text-xs text-blue-700 bg-blue-50 border border-blue-200 rounded px-2 py-0.5 ml-2">⚖ {text}</span>;
}

function Section({ title, color = 'iip-mauve', children }) {
  return (
    <div className={`border-l-4 pl-5 py-4 mb-6 ${color === 'red' ? 'border-red-500 bg-red-50' : color === 'green' ? 'border-green-500 bg-green-50' : color === 'orange' ? 'border-orange-500 bg-orange-50' : 'border-iip-mauve bg-iip-mauve/5'}`}>
      <h3 className="font-bold text-base mb-3">{title}</h3>
      {children}
    </div>
  );
}

function Q({ num, text, value, onChange, ref_ }) {
  return (
    <div className="mb-4">
      <div className="flex items-start gap-3">
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-iip-mauve text-white text-sm font-bold flex items-center justify-center">{num}</span>
        <div className="flex-1">
          <p className="text-sm font-medium text-gray-800 mb-2">{text} {ref_ && <Ref text={ref_} />}</p>
          <div className="flex gap-3">
            {[['oui', '✓ Oui'], ['non', '✗ Non'], ['', '— ?']].map(([v, l]) => (
              <button key={v} onClick={() => onChange(v)}
                className={`px-4 py-1.5 rounded-full text-sm border transition ${value === v ? (v === 'oui' ? 'bg-green-600 text-white border-green-600' : v === 'non' ? 'bg-red-600 text-white border-red-600' : 'bg-gray-400 text-white border-gray-400') : 'bg-white text-gray-600 border-gray-300 hover:bg-gray-50'}`}>
                {l}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── MODULE 1 : Outil recours ─────────────────────────────────────────────────
function OutilRecours() {
  const [step, setStep] = useState(1);
  const [datePubli, setDatePubli] = useState('');
  const [dateRecours, setDateRecours] = useState('');
  const [dateDecisionInterne, setDateDecisionInterne] = useState('');
  const [q, setQ] = useState({
    decisionRefus: '', ecrit: '', delaiRespect: '', porteRefus: '',
    irregulPrecises: '', quorum: '', conflitInteret: '', motivJustif: '',
    dueDelai: '', visiteCopies: '', publiResultats: '',
  });

  function set(k, v) { setQ(prev => ({ ...prev, [k]: v })); }

  // Calculs de délais
  const limiteRecours = datePubli ? addJoursCalendrier(datePubli, 4) : null;
  const limiteDecisionInterne = datePubli ? addJoursCalendrier(datePubli, 7) : null;

  let limiteRecourseExterne = null;
  if (dateDecisionInterne) {
    const j3ouv = addJoursOuvrables(dateDecisionInterne, 3);
    limiteRecourseExterne = addJoursCalendrier(j3ouv, 7);
  }

  const nbJoursDepuisPubli = datePubli && dateRecours
    ? Math.round((new Date(dateRecours) - new Date(datePubli)) / 86400000)
    : null;

  const delaiRespect = nbJoursDepuisPubli !== null ? nbJoursDepuisPubli <= 4 : null;

  // Irrecevabilité immédiate
  const irrecevableType = q.decisionRefus === 'non';

  // Recevabilité formelle
  const conditionsRecevabilite = [
    { ok: q.ecrit === 'oui', label: 'Plainte écrite', ref: 'Art. 88 §3' },
    { ok: delaiRespect === true || q.delaiRespect === 'oui', label: 'Dans le délai de 4 jours', ref: 'Art. 88 §1' },
    { ok: q.porteRefus === 'oui', label: 'Porte sur un refus', ref: 'Art. 88 §3' },
    { ok: q.irregulPrecises === 'oui', label: 'Irrégularités précises mentionnées', ref: 'Art. 88 §3' },
  ];
  const recevable = conditionsRecevabilite.every(c => c.ok);
  const irrecevable = conditionsRecevabilite.some(c => c.ok === false);

  return (
    <div className="max-w-3xl">
      <div className="flex items-center gap-2 mb-6">
        {[1,2,3,4].map(s => (
          <div key={s} className="flex items-center gap-1">
            <button onClick={() => setStep(s)}
              className={`w-8 h-8 rounded-full text-sm font-bold border-2 transition ${step === s ? 'bg-iip-mauve text-white border-iip-mauve' : step > s ? 'bg-green-500 text-white border-green-500' : 'bg-white text-gray-400 border-gray-300'}`}>
              {step > s ? '✓' : s}
            </button>
            {s < 4 && <div className={`h-0.5 w-8 ${step > s ? 'bg-green-500' : 'bg-gray-200'}`} />}
          </div>
        ))}
        <span className="text-sm text-gray-500 ml-2">{['', 'Qualification', 'Recevabilité formelle', 'Analyse au fond', 'Décision & procédure'][step]}</span>
      </div>

      {/* ÉTAPE 1 — Qualification */}
      {step === 1 && (
        <div>
          <Section title="Étape 1 — Qualification de la décision">
            <Q num="1" text="La décision contestée est-elle une DÉCISION DE REFUS ?" value={q.decisionRefus} onChange={v => set('decisionRefus', v)}
              ref_="Art. 87 §1 RDE/ROI" />

            {q.decisionRefus === 'non' && (
              <div className="mt-4 p-4 bg-red-100 border-2 border-red-500 rounded-lg">
                <p className="font-bold text-red-800 text-lg">🚫 IRRECEVABLE DE PLEIN DROIT</p>
                <p className="text-red-700 mt-1 text-sm">Seules les décisions de REFUS sont susceptibles de recours. Les ajournements (1re session), les décisions de VA/VAE et les décisions de délivrance d'un titre ne peuvent pas faire l'objet d'un recours.</p>
                <p className="text-xs text-red-600 mt-2">⚖ Art. 87 §1-2 RDE/ROI · D. 27/10/2006</p>
                <p className="mt-3 font-semibold text-red-800">→ Répondre à l'étudiant en notifiant l'irrecevabilité et son motif précis (Art. 88 §4).</p>
              </div>
            )}

            {q.decisionRefus === 'oui' && (
              <>
                <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded">
                  <p className="text-sm text-blue-800 font-medium">Le recours est a priori possible. Saisir les dates pour calculer les délais :</p>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-4">
                  <label className="block">
                    <div className="text-xs font-semibold text-gray-600 mb-1">Date de publication des résultats</div>
                    <input type="date" value={datePubli} onChange={e => setDatePubli(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                    {datePubli && <p className="text-xs text-gray-500 mt-1">Limite recours interne : <strong>{fmt(limiteRecours)}</strong></p>}
                  </label>
                  <label className="block">
                    <div className="text-xs font-semibold text-gray-600 mb-1">Date de réception/envoi de la plainte</div>
                    <input type="date" value={dateRecours} onChange={e => setDateRecours(e.target.value)}
                      className="w-full border border-gray-300 rounded px-3 py-1.5 text-sm" />
                    {nbJoursDepuisPubli !== null && (
                      <p className={`text-xs mt-1 font-semibold ${delaiRespect ? 'text-green-700' : 'text-red-700'}`}>
                        {nbJoursDepuisPubli} jour{nbJoursDepuisPubli > 1 ? 's' : ''} après publication → {delaiRespect ? '✓ Dans le délai' : '✗ HORS DÉLAI'}
                      </p>
                    )}
                  </label>
                </div>
                {!delaiRespect && delaiRespect !== null && (
                  <div className="mt-3 p-3 bg-red-100 border-2 border-red-500 rounded-lg">
                    <p className="font-bold text-red-800">🚫 IRRECEVABLE — Délai dépassé</p>
                    <p className="text-red-700 text-sm mt-1">La plainte est arrivée {nbJoursDepuisPubli - 4} jour{nbJoursDepuisPubli - 4 > 1 ? 's' : ''} trop tard. Le délai de 4 jours calendrier est une condition de recevabilité impérative.</p>
                    <p className="text-xs text-red-600 mt-1">⚖ Art. 88 §1 et §3 RDE/ROI · D. 27/10/2006</p>
                  </div>
                )}
              </>
            )}
          </Section>

          <div className="flex justify-end mt-4">
            <button onClick={() => setStep(2)} disabled={q.decisionRefus !== 'oui'}
              className="bg-iip-mauve disabled:opacity-40 text-white px-6 py-2 rounded-lg text-sm font-medium">
              Étape suivante →
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 2 — Recevabilité formelle */}
      {step === 2 && (
        <div>
          <Section title="Étape 2 — Recevabilité formelle (Art. 88 §3 RDE/ROI)">
            <p className="text-sm text-gray-600 mb-4">Les 4 conditions sont <strong>cumulatives</strong> — une seule manquante = irrecevable.</p>
            <Q num="1" text="La plainte est-elle ÉCRITE (e-mail, main propre ou recommandé) ?" value={q.ecrit} onChange={v => set('ecrit', v)} ref_="Art. 88 §3" />
            {delaiRespect !== null ? (
              <div className="mb-4 flex items-center gap-3 pl-10">
                <Badge ok={delaiRespect} label={delaiRespect ? `Dans le délai (J+${nbJoursDepuisPubli})` : `Hors délai (J+${nbJoursDepuisPubli})`} />
                <Ref text="Art. 88 §1" />
              </div>
            ) : (
              <Q num="2" text="La plainte est-elle parvenue dans les 4 jours calendrier suivant la publication ?" value={q.delaiRespect} onChange={v => set('delaiRespect', v)} ref_="Art. 88 §1" />
            )}
            <Q num="3" text="La plainte porte-t-elle sur une DÉCISION DE REFUS (pas un ajournement, pas un VA/VAE) ?" value={q.porteRefus} onChange={v => set('porteRefus', v)} ref_="Art. 88 §3" />
            <Q num="4" text="La plainte MENTIONNE-T-ELLE des irrégularités précises (pas seulement 'je ne suis pas d'accord') ?" value={q.irregulPrecises} onChange={v => set('irregulPrecises', v)} ref_="Art. 88 §3" />
          </Section>

          {/* Verdict recevabilité */}
          {q.ecrit && q.porteRefus && q.irregulPrecises && (delaiRespect !== null || q.delaiRespect) && (
            <div className={`p-5 rounded-xl border-2 mb-6 ${recevable ? 'bg-green-50 border-green-500' : 'bg-red-50 border-red-500'}`}>
              {recevable ? (
                <>
                  <p className="font-bold text-green-800 text-lg">✅ RECEVABLE — Procéder à l'instruction</p>
                  <p className="text-green-700 text-sm mt-1">Toutes les conditions de recevabilité sont réunies. Le CDE restreint doit se réunir dans un délai de <strong>7 jours calendrier hors congés scolaires</strong> à compter de la publication des résultats.</p>
                  {limiteDecisionInterne && <p className="text-green-800 font-medium mt-2 text-sm">⏱ Date limite de décision interne : <strong>{fmt(limiteDecisionInterne)}</strong></p>}
                  <p className="text-xs text-green-600 mt-1">⚖ Art. 89 §1 RDE/ROI</p>
                </>
              ) : (
                <>
                  <p className="font-bold text-red-800 text-lg">🚫 IRRECEVABLE</p>
                  <div className="mt-2 space-y-1">
                    {conditionsRecevabilite.filter(c => !c.ok).map(c => (
                      <p key={c.label} className="text-sm text-red-700">✗ <strong>{c.label}</strong> <Ref text={c.ref} /></p>
                    ))}
                  </div>
                  <p className="text-sm text-red-700 mt-2">→ Notifier à l'étudiant le motif précis d'irrecevabilité par écrit (Art. 88 §4).</p>
                </>
              )}
            </div>
          )}

          <div className="flex justify-between mt-4">
            <button onClick={() => setStep(1)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => setStep(3)} disabled={!recevable}
              className="bg-iip-mauve disabled:opacity-40 text-white px-6 py-2 rounded-lg text-sm font-medium">
              Analyser au fond →
            </button>
          </div>
        </div>
      )}

      {/* ÉTAPE 3 — Analyse au fond */}
      {step === 3 && (
        <div>
          <Section title="Étape 3 — Analyse au fond (irrégularités invoquées)">
            <p className="text-sm text-gray-600 mb-4">Le CDE apprécie souverainement la valeur des notes. Seules les irrégularités de <strong>procédure ou de droit</strong> peuvent fonder un recours.</p>

            <div className="mb-4 p-3 bg-gray-50 rounded border text-sm text-gray-600">
              <strong>Rappel :</strong> La Commission de recours peut ANNULER une décision mais ne peut pas substituer sa propre note à celle du CDE.
              <Ref text="Art. 91 RDE/ROI" />
            </div>

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">A. Délibération</p>
            <Q num="1" text="Le quorum était-il atteint lors de la délibération ? (CDE restreint : président + min. 2 membres)" value={q.quorum} onChange={v => set('quorum', v)} ref_="Art. 89 §1 RDE/ROI" />
            <Q num="2" text="Y avait-il un conflit d'intérêt non déclaré parmi les membres du jury ?" value={q.conflitInteret} onChange={v => set('conflitInteret', v)} />
            <Q num="3" text="La justification de l'échec (AA non atteints) a-t-elle bien été encodée et communiquée ?" value={q.motivJustif} onChange={v => set('motivJustif', v)} ref_="Art. 71 RDE/ROI" />

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-4">B. Évaluation</p>
            <Q num="4" text="Les Dossiers d'Unité d'Enseignement (DUE) ont-ils été fournis dans les délais ?" value={q.dueDelai} onChange={v => set('dueDelai', v)} />
            <Q num="5" text="La visite des copies a-t-elle été proposée à l'étudiant dans les délais (J+1 après délibération) ?" value={q.visiteCopies} onChange={v => set('visiteCopies', v)} ref_="Art. 71 §1 RDE/ROI" />

            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3 mt-4">C. Post-délibération</p>
            <Q num="6" text="Les résultats ont-ils été publiés dans les 2 jours ouvrables suivant la délibération ?" value={q.publiResultats} onChange={v => set('publiResultats', v)} ref_="Art. 82 RDE/ROI" />
          </Section>

          {/* Synthèse irrégularités */}
          {Object.values({ quorum: q.quorum, conflitInteret: q.conflitInteret, motivJustif: q.motivJustif,
            dueDelai: q.dueDelai, visiteCopies: q.visiteCopies, publiResultats: q.publiResultats })
            .some(v => v !== '') && (
            <div className="p-4 bg-gray-50 border rounded-lg mb-4">
              <p className="font-semibold text-sm mb-2">Synthèse des irrégularités relevées :</p>
              {[
                { k: 'quorum', n: 'Quorum', oui: '✓ Quorum OK', non: '⚠ QUORUM NON ATTEINT — vice de procédure grave' },
                { k: 'conflitInteret', n: 'Conflit intérêt', oui: '⚠ CONFLIT D\'INTÉRÊT — vice potentiel grave', non: '✓ Pas de conflit d\'intérêt' },
                { k: 'motivJustif', n: 'Justification', oui: '✓ Justification encodée', non: '⚠ JUSTIFICATION MANQUANTE — obligation légale' },
                { k: 'dueDelai', n: 'DUE dans les délais', oui: '✓ DUE fournis dans les délais', non: '⚠ DUE HORS DÉLAI — irrégularité possible' },
                { k: 'visiteCopies', n: 'Visite des copies', oui: '✓ Visite des copies proposée', non: '⚠ VISITE DES COPIES NON PROPOSÉE — droit lésé (Art. 71)' },
                { k: 'publiResultats', n: 'Publication résultats', oui: '✓ Résultats publiés dans les délais', non: '⚠ PUBLICATION TARDIVE — irrégularité (Art. 82)' },
              ].filter(i => q[i.k]).map(i => (
                <p key={i.k} className={`text-sm py-0.5 ${q[i.k] === 'non' && i.k !== 'conflitInteret' ? 'text-red-700 font-medium' : q[i.k] === 'oui' && i.k === 'conflitInteret' ? 'text-red-700 font-medium' : 'text-green-700'}`}>
                  {q[i.k] === 'oui' ? i.oui : i.non}
                </p>
              ))}
            </div>
          )}

          <div className="flex justify-between mt-4">
            <button onClick={() => setStep(2)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => setStep(4)} className="bg-iip-mauve text-white px-6 py-2 rounded-lg text-sm font-medium">Décision & procédure →</button>
          </div>
        </div>
      )}

      {/* ÉTAPE 4 — Décision et procédure */}
      {step === 4 && (
        <div>
          <Section title="Étape 4 — Procédure à suivre">
            <div className="space-y-3">
              {[
                { n: 1, label: 'Accusé de réception', detail: 'Envoyer immédiatement un accusé de réception à l\'étudiant (e-mail ou courrier).' },
                { n: 2, label: 'Convoquer le CDE restreint', detail: 'Président + minimum 2 membres du CDE initial. Délibération à huis clos.' },
                { n: 3, label: 'Instruction', detail: 'Examiner les griefs de l\'étudiant, argument par argument. Consulter les pièces (épreuves, feuilles de délibération, DUE).' },
                { n: 4, label: 'Décision motivée', detail: 'Rédiger une décision formellement motivée : exposer pourquoi chaque grief est accepté ou rejeté.' },
                { n: 5, label: 'Notification par recommandé', detail: `Envoyer la décision par pli recommandé à l'étudiant.${limiteDecisionInterne ? ` Date limite : ${fmt(limiteDecisionInterne)}.` : ''}` },
                { n: 6, label: 'Archivage', detail: 'Classer le dossier complet (plainte + pièces + décision motivée + accusé de réception du recommandé).' },
              ].map(item => (
                <div key={item.n} className="flex gap-3 items-start p-3 bg-white border border-gray-200 rounded-lg">
                  <div className="w-7 h-7 rounded-full bg-iip-mauve text-white text-sm font-bold flex items-center justify-center flex-shrink-0">{item.n}</div>
                  <div>
                    <p className="font-semibold text-sm">{item.label}</p>
                    <p className="text-sm text-gray-600">{item.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </Section>

          {/* Délais de recours externe */}
          <Section title="Délais — Recours externe possible dès :" color="orange">
            <div className="space-y-2">
              <label className="block">
                <div className="text-xs font-semibold text-gray-600 mb-1">Date d'envoi de la décision interne (recommandé)</div>
                <input type="date" value={dateDecisionInterne} onChange={e => setDateDecisionInterne(e.target.value)}
                  className="border border-gray-300 rounded px-3 py-1.5 text-sm" />
              </label>
              {limiteRecourseExterne && (
                <div className="p-3 bg-orange-100 border border-orange-300 rounded mt-2">
                  <p className="text-sm text-orange-800 font-medium">⏱ Date limite pour le recours externe :</p>
                  <p className="text-orange-900 font-bold">{fmt(limiteRecourseExterne)}</p>
                  <p className="text-xs text-orange-700 mt-1">J+3 ouvrables après envoi + 7 jours calendrier · ⚖ Art. 90 §2 RDE/ROI</p>
                  <p className="text-xs text-orange-700 mt-1">Adresse : DG ETLV, rue Adolphe Lavallée 1, 1080 Bruxelles (+ copie direction@institut-prigogine.be)</p>
                </div>
              )}
            </div>
          </Section>

          {/* Ce qu'il est illégal de faire */}
          <Section title="⛔ Ce qu'il est ILLÉGAL de faire lors de l'instruction" color="red">
            <ul className="space-y-1 text-sm text-red-800">
              {[
                'Substituer la note du CDE par la décision du CDE restreint',
                'Refuser à l\'étudiant l\'accès à ses épreuves écrites (Art. 71)',
                'Délibérer sans quorum (Président + min. 2 membres)',
                'Omettre de motiver formellement la décision (argument par argument)',
                'Dépasser le délai de 7 jours calendrier sans informer l\'étudiant',
                'Examiner les copies d\'autres étudiants lors de l\'instruction',
                'Facturer l\'étudiant pour une nouvelle évaluation imposée par la Commission (Art. 91)',
              ].map((item, i) => (
                <li key={i} className="flex gap-2 items-start"><span className="text-red-500 flex-shrink-0">✗</span>{item}</li>
              ))}
            </ul>
          </Section>

          <div className="flex justify-between mt-4">
            <button onClick={() => setStep(3)} className="border border-gray-300 text-gray-600 px-6 py-2 rounded-lg text-sm">← Retour</button>
            <button onClick={() => { setStep(1); setQ({}); setDatePubli(''); setDateRecours(''); setDateDecisionInterne(''); }}
              className="border border-iip-mauve text-iip-mauve px-6 py-2 rounded-lg text-sm font-medium hover:bg-iip-mauve/5">
              ↺ Nouveau recours
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── PAGE PRINCIPALE ──────────────────────────────────────────────────────────
export default function Procedures() {
  const [outil, setOutil] = useState('recours');

  const outils = [
    { id: 'recours', label: '⚖ Recours', desc: 'Aide à la décision — Art. 87-91 RDE/ROI' },
    { id: 'examens', label: '📋 Examens', desc: 'Procédure d\'organisation et surveillance' },
  ];

  return (
    <div className="flex h-full min-h-0 overflow-hidden">
      {/* Sidebar */}
      <div className="w-56 flex-shrink-0 bg-gray-50 border-r border-gray-200 overflow-auto">
        <div className="px-4 py-4 border-b border-gray-200">
          <h2 className="font-title text-iip-mauve font-bold text-sm uppercase tracking-wide">Procédures IIP</h2>
          <p className="text-xs text-gray-500 mt-0.5">Année 2026-2027</p>
        </div>
        <div className="py-2">
          {outils.map(o => (
            <button key={o.id} onClick={() => setOutil(o.id)}
              className={`w-full text-left px-4 py-3 border-b border-gray-100 transition ${outil === o.id ? 'bg-iip-mauve/10 border-l-4 border-l-iip-mauve' : 'hover:bg-gray-100'}`}>
              <p className={`text-sm font-semibold ${outil === o.id ? 'text-iip-mauve' : 'text-gray-700'}`}>{o.label}</p>
              <p className="text-xs text-gray-500 mt-0.5">{o.desc}</p>
            </button>
          ))}
        </div>
      </div>

      {/* Contenu */}
      <div className="flex-1 overflow-auto p-6">
        {outil === 'recours' && (
          <>
            <div className="mb-6">
              <h1 className="text-2xl font-title text-iip-mauve mb-1">Outil d'aide à la décision — Recours</h1>
              <p className="text-sm text-gray-600">Fondé sur les Art. 87-91 du RDE/ROI IIP 2026-2027 et le Décret du 27.10.2006 · À destination de Nicolas (adjoint)</p>
            </div>
            <OutilRecours />
          </>
        )}
        {outil === 'examens' && (
          <div className="text-gray-500 text-sm p-8 text-center">
            <p className="text-3xl mb-3">📋</p>
            <p className="font-medium">Procédure Examens — en cours de développement</p>
            <p className="text-xs mt-1">Uploadez le document de procédure examens pour activer cet outil.</p>
          </div>
        )}
      </div>
    </div>
  );
}
