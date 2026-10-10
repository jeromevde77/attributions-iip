/**
 * LE CONGÉ-ÉDUCATION PAYÉ SUR LA FICHE DE L'ÉTUDIANT (Charles, 29 septembre
 * 2026 : « il faut une case CEP dans la fiche étudiant »).
 *
 * La case (avec la RÉGION DU LIEU DE TRAVAIL — c'est elle qui décide du
 * régime, pas l'école), le bilan d'assiduité unité par unité, les deux pièces,
 * et les absences à justifier sur pièce. Les présences, elles, se prennent
 * dans Mes cours, séance par séance.
 */
import { useEffect, useState } from 'react';
import { IconFileText, IconAlertTriangle } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { ouvrirApercu } from '../lib/apercu.js';
import { Encadre, TuileEtat } from './ui.jsx';

const h = min => `${String(Math.round((min / 60) * 100) / 100).replace('.', ',')} h`;
const fr = d => (d ? String(d).slice(0, 10).split('-').reverse().join('/') : '—');
const pct = x => `${Math.round(x * 1000) / 10} %`;

export default function OngletCep({ etudId, annee }) {
  const [data, setData] = useState(null);
  const [refs, setRefs] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [message, setMessage] = useState(null);
  const [recharge, setRecharge] = useState(0);
  const [edition, setEdition] = useState(null);   // { region, employeur }

  useEffect(() => {
    fetch('/api/cep/references', { headers: authHeaders() }).then(r => r.json()).then(setRefs).catch(() => {});
  }, []);
  useEffect(() => {
    let vivant = true;
    fetch(`/api/cep/etudiant/${etudId}?annee=${encodeURIComponent(annee)}`, { headers: authHeaders() })
      .then(async r => { const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.error || `Erreur ${r.status}`); return j; })
      .then(j => { if (vivant) { setData(j); setErreur(null); } })
      .catch(e => { if (vivant) setErreur(e.message); });
    return () => { vivant = false; };
  }, [etudId, annee, recharge]);

  const enregistrer = async corps => {
    setMessage(null);
    const r = await fetch(`/api/cep/etudiant/${etudId}`, { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ annee, ...corps }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage({ etat: 'corriger', texte: j.error || `Erreur ${r.status}` }); return; }
    setEdition(null); setRecharge(x => x + 1);
  };
  const piece = async (type, ue = null) => {
    setMessage(null);
    const r = await fetch(`/api/cep/etudiant/${etudId}/piece/${type}?annee=${encodeURIComponent(annee)}${ue ? `&ue=${ue}` : ''}`,
      { headers: authHeaders() });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage({ etat: 'corriger', texte: j.error || `Erreur ${r.status}` }); return; }
    ouvrirApercu({ html: j.html, titre: j.titre, sousTitre: 'Congé-éducation payé', nomFichier: j.nom,
      typeDoc: `cep_${type}`, astuceImpression: 'A4 portrait', destinataire: { type: 'etudiant', id: etudId } });
  };
  const justifier = async (a, motif) => {
    setMessage(null);
    const r = await fetch('/api/cep/presence', { method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ seance_id: a.seance_id, etudiant_id: etudId,
        statut: motif ? 'justifie' : 'absent', motif: motif || null }) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { setMessage({ etat: 'corriger', texte: j.error || `Erreur ${r.status}` }); return; }
    setRecharge(x => x + 1);
  };

  if (erreur) return <Encadre etat="corriger">{erreur}</Encadre>;
  if (!data || !refs) return <p className="text-sm text-slate-400">Chargement…</p>;
  const cep = data.cep;
  const regions = refs.regions || {};

  const formulaire = edition && (
    <div className="carte p-3 space-y-2 max-w-xl">
      <label className="block text-second text-slate-600">Région du lieu de travail — celle du siège où l'étudiant est occupé
        <select className="controle w-full mt-0.5" value={edition.region}
          onChange={e => setEdition({ ...edition, region: e.target.value })}>
          {Object.entries(regions).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
      </label>
      <label className="block text-second text-slate-600">Employeur (facultatif)
        <input className="controle w-full mt-0.5" value={edition.employeur}
          onChange={e => setEdition({ ...edition, employeur: e.target.value })} />
      </label>
      <div className="flex gap-2">
        <button type="button" className="bouton bouton-fort" onClick={() => enregistrer(edition)}>Enregistrer</button>
        <button type="button" className="bouton" onClick={() => setEdition(null)}>Annuler</button>
      </div>
    </div>
  );

  if (!cep) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-slate-600 max-w-2xl">L'étudiant n'est pas marqué « congé-éducation payé » pour {annee}. Le
          congé permet à un travailleur du privé de suivre sa formation en gardant son salaire ; il remet à son
          employeur une attestation d'inscription (au plus tard le 31 octobre), puis une attestation d'assiduité tous
          les trois mois.</p>
        {edition ? formulaire : (
          <button type="button" className="bouton bouton-fort" onClick={() => setEdition({ region: 'bruxelles', employeur: '' })}>
            Il bénéficie du congé-éducation payé en {annee}
          </button>
        )}
        {message && <Encadre etat={message.etat}>{message.texte}</Encadre>}
      </div>
    );
  }

  const flandre = cep.region === 'flandre';
  const ues = data.ues || [];
  const alerte = ues.some(u => (u.periodes || []).some(p => p.commencee && p.taux_injustifie > 0.1));
  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-start gap-3">
        <TuileEtat etat="fort" valeur="CEP" libelle={`Lieu de travail : ${regions[cep.region] || cep.region}`}
          precision={`${cep.employeur ? `${cep.employeur} · ` : ''}posé par ${cep.pose_par || '—'} le ${fr(cep.pose_le)}`} />
        {!flandre && <TuileEtat etat={alerte ? 'corriger' : 'neutre'} valeur={alerte ? 'Plus de 10 %' : '≤ 10 %'}
          libelle="d'absences injustifiées" precision="au-delà, le droit est suspendu six mois" />}
        <div className="flex gap-2 ml-auto">
          <button type="button" className="bouton" onClick={() => setEdition({ region: cep.region, employeur: cep.employeur || '' })}>Modifier</button>
          <button type="button" className="bouton" onClick={() => enregistrer({ cep: false })}>Retirer la case</button>
        </div>
      </div>
      {formulaire}
      {message && <Encadre etat={message.etat}>{message.texte}</Encadre>}

      {flandre ? (
        <Encadre etat="surveiller" titre="Employeur en Flandre — Vlaams opleidingsverlof">
          Ces attestations ne servent pas : en Flandre, l'école encode l'inscription et les présences sur la
          plateforme de l'autorité flamande, et l'employeur les y lit.
        </Encadre>
      ) : (
        <>
          {data.identite?.length > 0 && (
            <Encadre etat="surveiller" titre="Les pièces ne peuvent pas sortir">
              Il manque {data.identite.join(', ')} — onglet Identité.
            </Encadre>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className="bouton bouton-sortir inline-flex items-center gap-1.5"
              onClick={() => piece('inscription')}><IconFileText size={14} /> Attestation d'inscription — toutes les unités</button>
            <button type="button" className="bouton bouton-sortir inline-flex items-center gap-1.5"
              onClick={() => piece('assiduite')}><IconFileText size={14} /> Attestation d'assiduité — toutes les unités</button>
          </div>

          <div className="border border-slate-200 rounded-carte overflow-x-auto">
            <table className="w-full text-second">
              <thead className="tab-entete">
                <tr className="text-left text-xs text-slate-500">
                  <th className="px-3 py-1.5">Unité</th><th className="px-2 py-1.5 text-right">(a) théoriques</th>
                  <th className="px-2 py-1.5 text-right">(b) dispensées</th><th className="px-2 py-1.5 text-right">(d) tardive</th>
                  <th className="px-2 py-1.5">Périodes de trois mois</th><th className="px-2 py-1.5"></th>
                </tr>
              </thead>
              <tbody>
                {ues.map(u => (
                  <tr key={u.ue_num} className="border-t border-slate-100 bg-white align-top">
                    <td className="px-3 py-1.5"><b>UE {u.ue_num}</b> <span className="text-slate-500">{u.ue_nom}</span>
                      {u.exclue && <div className="text-xs text-slate-400">{u.exclue}</div>}
                      {!u.exclue && !u.nb_seances && <div className="text-xs" style={{ color: 'var(--c-surveiller)' }}>
                        Pas d'horaire dans Lucie (Organisation → Horaires)</div>}
                    </td>
                    {u.exclue ? <td colSpan={5} /> : <>
                      <td className="px-2 py-1.5 text-right tabular-nums">{h(u.a)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{h(u.b)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{h(u.d)}</td>
                      <td className="px-2 py-1.5">
                        {(u.periodes || []).filter(p => p.commencee).map(p => (
                          <div key={p.num} className="text-second">
                            <b>{p.num}</b> · {fr(p.du)} – {fr(p.au)}{p.terminee ? '' : ' (en cours)'} ·
                            présent {h(p.presence)} · justifié {h(p.justifiees)} ·{' '}
                            <span style={p.taux_injustifie > 0.1 ? { color: 'var(--c-corriger)', fontWeight: 600 } : {}}>
                              injustifié {h(p.injustifiees)} ({pct(p.taux_injustifie)})</span>
                            {p.non_encodees.length > 0 && (
                              <span className="block text-xs" style={{ color: 'var(--c-surveiller)' }}>
                                <IconAlertTriangle size={11} className="inline -mt-0.5" /> {p.non_encodees.length} séance(s) passée(s)
                                sans présences — Mes cours → Présences</span>
                            )}
                          </div>
                        ))}
                        {!(u.periodes || []).some(p => p.commencee) && <span className="text-slate-400">pas encore commencé</span>}
                      </td>
                      <td className="px-2 py-1.5 whitespace-nowrap text-right">
                        <button type="button" className="bouton bouton-compact" disabled={!u.nb_seances}
                          onClick={() => piece('inscription', u.ue_num)}>Inscription</button>{' '}
                        <button type="button" className="bouton bouton-compact" disabled={!u.nb_seances}
                          onClick={() => piece('assiduite', u.ue_num)}>Assiduité</button>
                      </td>
                    </>}
                  </tr>
                ))}
                {!ues.length && <tr><td colSpan={6} className="px-3 py-2 text-slate-400">Aucune unité inscrite en {annee}.</td></tr>}
              </tbody>
            </table>
          </div>

          <div>
            <div className="text-sm font-semibold mb-1">Absences de l'année</div>
            {!data.absences.length ? <p className="text-slate-400">Aucune absence encodée.</p> : (
              <div className="border border-slate-200 rounded-carte overflow-x-auto">
                <table className="w-full text-second">
                  <thead className="tab-entete"><tr className="text-left text-xs text-slate-500">
                    <th className="px-3 py-1.5">Séance</th><th className="px-2 py-1.5">Cours</th>
                    <th className="px-2 py-1.5">Justification (sur pièce)</th><th className="px-2 py-1.5">Encodé par</th>
                  </tr></thead>
                  <tbody>{data.absences.map(a => (
                    <tr key={a.seance_id} className="border-t border-slate-100 bg-white">
                      <td className="px-3 py-1.5 tabular-nums">{fr(a.date)} · {String(a.heure_debut).slice(0, 5)}–{String(a.heure_fin).slice(0, 5)}</td>
                      <td className="px-2 py-1.5">{a.cours_code || a.matiere}</td>
                      <td className="px-2 py-1.5">
                        <select className="controle h-8 w-full max-w-md" value={a.statut === 'justifie' ? a.motif || '' : ''}
                          onChange={e => justifier(a, e.target.value)}>
                          <option value="">— absence injustifiée —</option>
                          {Object.entries(refs.motifs || {}).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                        </select>
                      </td>
                      <td className="px-2 py-1.5 text-slate-500 text-xs">{a.encode_par} · {fr(a.encode_le)}</td>
                    </tr>))}
                  </tbody>
                </table>
              </div>
            )}
            <p className="text-xs text-slate-400 mt-1">Seuls ces motifs justifient une absence au sens du congé-éducation
              payé. Chaque changement est consigné, avec son auteur.</p>
          </div>
        </>
      )}
    </div>
  );
}
