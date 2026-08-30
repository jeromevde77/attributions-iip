import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconPlus, IconTrash, IconShieldCheck } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Tableau, TableauEntete, Th, Td, Tr, Badge } from './ui.jsx';

/**
 * Aménagements raisonnables — décret du 30 juin 2016.
 *
 * L'écran suit la procédure : la demande, la pièce produite, la décision
 * motivée du Conseil des études, la notification par la direction, et le
 * recours éventuel. Les mesures accordées sont listées à part, car ce sont
 * elles qui devront être communiquées aux chargés de cours — sans que la
 * nature du handicap ait à circuler, le secret professionnel s'appliquant.
 */
const STATUTS = {
  demande:     { libelle: 'Demande introduite', ton: 'info' },
  instruction: { libelle: 'En instruction',     ton: 'alerte' },
  accepte:     { libelle: 'Accordé',            ton: 'succes' },
  partiel:     { libelle: 'Partiellement accordé', ton: 'alerte' },
  refuse:      { libelle: 'Refusé',             ton: 'danger' },
  recours:     { libelle: 'En recours',         ton: 'accent' },
};

const PORTEES = {
  toutes: 'Toutes activités', cours: 'Cours', epreuves: 'Épreuves', stage: 'Stage',
};

export default function Amenagements({ etudId, annee }) {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [ajout, setAjout] = useState(null);

  async function charger() {
    const rep = await fetch(`/api/amenagements/etudiant/${etudId}?annee=${annee}`,
      { headers: authHeaders() });
    setData(rep.ok ? await rep.json() : { dossiers: [], catalogue: [] });
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [etudId, annee]);

  async function creerDossier() {
    const rep = await fetch('/api/amenagements/dossier', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ etudiant_id: etudId, annee_scolaire: annee }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    await charger();
  }

  async function majDossier(champs) {
    const rep = await fetch(`/api/amenagements/dossier/${data.courant.id}`, {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(champs),
    });
    const j = await rep.json();
    if (j.rappel) setMessage({ type: 'rappel', texte: j.rappel });
    await charger();
  }

  async function ajouterMesure(m) {
    await fetch(`/api/amenagements/dossier/${data.courant.id}/mesure`, {
      method: 'POST', headers: authHeaders(), body: JSON.stringify(m),
    });
    setAjout(null);
    await charger();
  }

  async function supprimerMesure(id) {
    if (!window.confirm('Retirer cette mesure du dossier ?')) return;
    await fetch(`/api/amenagements/mesure/${id}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  if (!data) return <div className="py-8 text-center text-sm text-slate-400">Chargement…</div>;

  const d = data.courant;
  const champ = (nom, libelle, type = 'text') => (
    <label className="text-xs block">
      <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">{libelle}</span>
      <input type={type} defaultValue={d[nom] || ''}
        onBlur={e => e.target.value !== (d[nom] || '') && majDossier({ [nom]: e.target.value })}
        className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
    </label>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="text-[15px] font-semibold text-iip-blue">Aménagements raisonnables</h3>
          <p className="text-[12px] text-slate-500">
            Décret du 30 juin 2016 · année {annee}
          </p>
        </div>
        {!d && (
          <button onClick={creerDossier}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-iip-blue text-white font-semibold rounded-lg">
            <IconPlus size={15} /> Ouvrir un dossier
          </button>
        )}
      </div>

      {message && (
        <div className={`px-3 py-2 rounded-lg text-[12.5px] flex items-start justify-between gap-2 ${
          message.type === 'rappel' ? 'bg-amber-50 border border-amber-200 text-amber-900'
          : message.type === 'err' ? 'bg-red-50 border border-red-200 text-red-800'
          : 'bg-emerald-50 border border-emerald-200 text-emerald-800'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="opacity-60">✕</button>
        </div>
      )}

      {/* La pièce vaut au-delà de l'année : la rappeler évite de la redemander. */}
      {data.piece_valide && (
        <div className={`px-3 py-2 rounded-lg text-[12px] flex items-start gap-2 ${
          data.piece_valide.perime ? 'bg-amber-50 border border-amber-200 text-amber-900'
                                   : 'bg-sky-50 border border-sky-200 text-sky-900'}`}>
          <IconShieldCheck size={15} className="mt-0.5 flex-none" />
          <span>
            Pièce au dossier ({data.piece_valide.annee_scolaire}) : {data.piece_valide.note}
          </span>
        </div>
      )}

      {!d ? (
        <div className="py-8 text-center text-[13px] text-slate-400 border-2 border-dashed rounded-xl">
          Aucun dossier pour {annee}.
          {data.dossiers.length > 0 && ` ${data.dossiers.length} dossier(s) les années précédentes.`}
        </div>
      ) : (
        <>
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="flex items-center gap-3 flex-wrap">
              <select value={d.statut} onChange={e => majDossier({ statut: e.target.value })}
                className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                {Object.entries(STATUTS).map(([k, s]) => (
                  <option key={k} value={k}>{s.libelle}</option>
                ))}
              </select>
              <Badge ton={STATUTS[d.statut]?.ton || 'neutre'}>{STATUTS[d.statut]?.libelle}</Badge>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {champ('date_demande', 'Date de la demande', 'date')}
              {champ('personne_reference', 'Personne de référence')}
              <label className="text-xs block">
                <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Pièce produite
                </span>
                <select value={d.piece_type || ''}
                  onChange={e => majDossier({ piece_type: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">— à recevoir</option>
                  <option value="probant">Document probant (art. 7 § 2, 1°)</option>
                  <option value="rapport_specialiste">Rapport de spécialiste (art. 7 § 2, 2°)</option>
                </select>
              </label>
              {champ('piece_date', 'Date de la pièce', 'date')}
              {champ('piece_auteur', 'Auteur de la pièce')}
              {champ('piece_reference', 'Référence')}
            </div>

            <label className="text-xs block">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Difficultés entravant le parcours
              </span>
              <textarea defaultValue={d.besoins || ''} rows={2}
                onBlur={e => e.target.value !== (d.besoins || '') && majDossier({ besoins: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
          </div>

          {/* Décision du Conseil des études — elle doit être MOTIVÉE */}
          <div className="border border-slate-200 rounded-xl p-4 space-y-3">
            <div className="text-[13px] font-semibold text-iip-blue">
              Décision du Conseil des études
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {champ('cde_date', 'Date de la décision', 'date')}
              {champ('delai_mise_oeuvre', 'Délai de mise en œuvre')}
              {champ('conditions_particulieres', 'Conditions particulières')}
            </div>
            <label className="text-xs block">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                Motivation — obligatoire, art. 6 § 2
              </span>
              <textarea defaultValue={d.cde_motivation || ''} rows={3}
                onBlur={e => e.target.value !== (d.cde_motivation || '')
                  && majDossier({ cde_motivation: e.target.value })}
                className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
            </label>
            {['accepte', 'partiel', 'refuse'].includes(d.statut) && !d.cde_motivation && (
              <div className="text-[11.5px] text-amber-800 flex items-center gap-1.5">
                <IconAlertTriangle size={14} />
                Une décision doit être formellement motivée, quel qu'en soit le sens.
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-1 border-t border-slate-100">
              {champ('notifie_le', 'Notifiée le', 'date')}
              <label className="text-xs block">
                <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">
                  Mode de notification
                </span>
                <select value={d.notifie_par || ''}
                  onChange={e => majDossier({ notifie_par: e.target.value })}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                  <option value="">—</option>
                  <option value="recommande">Lettre recommandée</option>
                  <option value="courriel">Courriel</option>
                  <option value="main_propre">Remise en mains propres contre accusé</option>
                </select>
              </label>
            </div>
            {d.cde_date && !d.notifie_le && (
              <div className="text-[11.5px] text-amber-800 flex items-center gap-1.5">
                <IconAlertTriangle size={14} />
                La direction adresse la décision au demandeur et en communique copie à la
                personne de référence.
              </div>
            )}
          </div>

          {/* Mesures */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[13px] font-semibold text-iip-blue">
                Mesures ({d.mesures?.length || 0})
              </span>
              <button onClick={() => setAjout({ nature: 'pedagogique', portee: 'toutes' })}
                className="flex items-center gap-1.5 text-[12px] px-2.5 py-1 border border-slate-300 rounded-lg hover:bg-slate-50">
                <IconPlus size={14} /> Ajouter
              </button>
            </div>

            {ajout && (
              <div className="border border-iip-turquoise/40 rounded-xl p-3 bg-iip-turquoise/5 mb-2 space-y-2">
                <select onChange={e => {
                    const c = data.catalogue.find(x => x.code === e.target.value);
                    setAjout(a => ({ ...a, code: c?.code, libelle: c?.libelle, nature: c?.nature || a.nature }));
                  }}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                  <option value="">— choisir un aménagement —</option>
                  {data.catalogue.map(c => (
                    <option key={c.code} value={c.code}>
                      {c.nature === 'materiel' ? 'Matériel' : 'Pédagogique'} · {c.libelle}
                    </option>
                  ))}
                </select>
                <input placeholder="Précisions — modalités concrètes"
                  onChange={e => setAjout(a => ({ ...a, precisions: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" />
                <div className="flex gap-2 items-center">
                  <select value={ajout.portee}
                    onChange={e => setAjout(a => ({ ...a, portee: e.target.value }))}
                    className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm bg-white">
                    {Object.entries(PORTEES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                  <div className="flex-1" />
                  <button onClick={() => setAjout(null)}
                    className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
                  <button onClick={() => ajouterMesure(ajout)} disabled={!ajout.libelle}
                    className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40">
                    Ajouter
                  </button>
                </div>
              </div>
            )}

            {!d.mesures?.length ? (
              <div className="py-6 text-center text-[12.5px] text-slate-400 border-2 border-dashed rounded-xl">
                Aucune mesure. Un aménagement porte sur la manière d'accéder aux acquis
                d'apprentissage et de les évaluer, jamais sur les acquis eux-mêmes.
              </div>
            ) : (
              <Tableau dense>
                <TableauEntete>
                  <Th>Aménagement</Th>
                  <Th largeur="w-24">Nature</Th>
                  <Th largeur="w-32">Portée</Th>
                  <Th largeur="w-20" />
                </TableauEntete>
                <tbody>
                  {d.mesures.map(m => (
                    <Tr key={m.id}>
                      <Td>
                        {m.libelle}
                        {m.precisions && (
                          <span className="block text-[11px] text-slate-500">{m.precisions}</span>
                        )}
                      </Td>
                      <Td>
                        <Badge ton={m.nature === 'materiel' ? 'info' : 'accent'}>
                          {m.nature === 'materiel' ? 'Matériel' : 'Pédagogique'}
                        </Badge>
                      </Td>
                      <Td ton="secondaire">{PORTEES[m.portee] || m.portee}</Td>
                      <Td align="droite">
                        <button onClick={() => supprimerMesure(m.id)}
                          className="text-slate-300 hover:text-red-500">
                          <IconTrash size={13} />
                        </button>
                      </Td>
                    </Tr>
                  ))}
                </tbody>
              </Tableau>
            )}
          </div>

          <p className="text-[11px] text-slate-500">
            Les échanges relatifs à la situation de l'étudiant sont couverts par le secret
            professionnel. Seules les mesures retenues sont communiquées aux chargés de cours,
            à l'exclusion de la nature du handicap.
          </p>
        </>
      )}
    </div>
  );
}
