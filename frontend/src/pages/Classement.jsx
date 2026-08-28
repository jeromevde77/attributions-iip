import { useEffect, useState } from 'react';
import {
  IconListNumbers, IconMailOpened, IconWand, IconTrash, IconPlus,
  IconAlertTriangle, IconX, IconScale,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';

const fr = iso => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';

/**
 * Classement d'ancienneté (art. 34 du statut LS) et registre des candidatures
 * prioritaires (art. 34ter). Les bases légales et les bornes des groupes sont
 * affichées à l'écran : ce document doit pouvoir être défendu tel quel.
 */
export default function Classement({ annee: anneeProp }) {
  const [anneeAuto, setAnneeAuto] = useState('');
  const annee = anneeProp || anneeAuto;
  const [onglet, setOnglet] = useState('classement');
  const [fonctions, setFonctions] = useState([]);
  const [fonction, setFonction] = useState('');
  const [data, setData] = useState(null);
  const [prior, setPrior] = useState(null);
  const [message, setMessage] = useState(null);
  const [form, setForm] = useState(null);
  const estAdmin = true; // les routes tranchent ; l'écran reste lisible par tous

  useEffect(() => {
    if (anneeProp) return;
    fetch('/api/annees', { headers: authHeaders() }).then(r => r.json())
      .then(l => {
        const a = (Array.isArray(l) ? l : []).find(x => x.active) || (Array.isArray(l) ? l[0] : null);
        if (a?.code) setAnneeAuto(a.code);
      }).catch(() => {});
  }, [anneeProp]);

  useEffect(() => {
    fetch('/api/classement/fonctions', { headers: authHeaders() })
      .then(r => r.json())
      .then(l => { if (Array.isArray(l)) { setFonctions(l); if (l[0] && !fonction) setFonction(l[0]); } })
      .catch(() => {});
    // eslint-disable-next-line
  }, []);

  async function chargerClassement() {
    if (!fonction) return;
    const rep = await fetch(`/api/classement/?fonction=${encodeURIComponent(fonction)}`,
      { headers: authHeaders() });
    const j = await rep.json();
    if (rep.ok) setData(j); else setMessage({ type: 'err', texte: j.error });
  }
  useEffect(() => { chargerClassement(); /* eslint-disable-next-line */ }, [fonction]);

  async function chargerPrior() {
    if (!annee) return;
    const rep = await fetch(`/api/classement/prioritaires?annee=${encodeURIComponent(annee)}`,
      { headers: authHeaders() });
    const j = await rep.json();
    if (rep.ok) setPrior(j);
  }
  useEffect(() => { chargerPrior(); /* eslint-disable-next-line */ }, [annee]);

  async function preremplir() {
    const rep = await fetch('/api/classement/preremplir', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ fonction }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setMessage({ type: 'ok', texte: `${j.ajoutes} membre(s) inscrit(s) — ancienneté PO comme point de départ, à ajuster par fonction.` });
    await chargerClassement();
  }

  async function majLigne(l, champs) {
    const rep = await fetch('/api/classement/anciennete', {
      method: 'PUT', headers: authHeaders(),
      body: JSON.stringify({ professeur_id: l.professeur_id, fonction, ...champs }),
    });
    if (!rep.ok) { setMessage({ type: 'err', texte: (await rep.json()).error }); return; }
    await chargerClassement();
  }

  async function creerPrioritaire() {
    const rep = await fetch('/api/classement/prioritaires', {
      method: 'POST', headers: authHeaders(),
      body: JSON.stringify({ ...form, annee_scolaire: annee }),
    });
    const j = await rep.json();
    if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
    setForm(null);
    setMessage(j.recevable
      ? { type: 'ok', texte: 'Candidature enregistrée, dans le délai.' }
      : { type: 'err', texte: 'Candidature enregistrée mais HORS DÉLAI (après le 29 mai).' });
    await chargerPrior();
  }

  async function supprimerPrioritaire(id) {
    if (!confirm('Supprimer cette candidature du registre ?')) return;
    await fetch(`/api/classement/prioritaires/${id}`, { method: 'DELETE', headers: authHeaders() });
    await chargerPrior();
  }

  const Groupe = ({ titre, sous, lignes, ton }) => (
    <div className="border border-slate-200 rounded-xl overflow-hidden bg-white mb-3">
      <div className={`px-4 py-2 border-b border-slate-200 flex items-baseline gap-2 ${ton}`}>
        <span className="font-bold text-[13px]">{titre}</span>
        <span className="text-[11px] opacity-70">{sous}</span>
        <span className="ml-auto text-[11px] font-bold">{lignes.length}</span>
      </div>
      {lignes.length ? (
        <table className="w-full text-sm">
          <tbody>
            {lignes.map((l, i) => (
              <tr key={l.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                <td className="px-4 py-2 w-8 text-[11px] text-slate-400 font-bold">{i + 1}</td>
                <td className="px-2 py-2">
                  <span className="font-medium text-slate-800">{l.nom} {l.prenom}</span>
                  {l.exclu_tp && (
                    <span className="ml-2 text-[10px] px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold">
                      définitif TP — demande écrite (15/04) manquante
                    </span>
                  )}
                </td>
                <td className="px-2 py-2 w-28">
                  <input type="number" min="0" defaultValue={l.jours}
                    onBlur={e => Number(e.target.value) !== l.jours
                      && majLigne(l, { jours: Number(e.target.value) })}
                    className="w-24 border border-slate-300 rounded-lg px-2 py-1 text-[12.5px] text-right" />
                  <span className="text-[10px] text-slate-400 ml-1">j</span>
                </td>
                <td className="px-2 py-2 w-32">
                  <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
                    <input type="checkbox" checked={!!l.sur_deux_annees}
                      onChange={e => majLigne(l, { sur_deux_annees: e.target.checked ? 1 : 0 })} />
                    sur 2 années
                  </label>
                </td>
                <td className="px-2 py-2 w-44">
                  <select value={l.statut_mdp || ''}
                    onChange={e => majLigne(l, { statut_mdp: e.target.value || null,
                      demande_tp_le: e.target.value === 'definitif_tp' ? l.demande_tp_le : null })}
                    className="border border-slate-300 rounded-lg px-2 py-1 text-[11.5px] w-full">
                    <option value="">Temporaire</option>
                    <option value="definitif_tp">Définitif temps partiel</option>
                    <option value="definitif">Définitif temps plein</option>
                  </select>
                  {l.statut_mdp === 'definitif_tp' && (
                    <input type="date" value={l.demande_tp_le || ''}
                      title="Date de la demande écrite (avant le 15 avril)"
                      onChange={e => majLigne(l, { statut_mdp: 'definitif_tp', demande_tp_le: e.target.value || null })}
                      className="mt-1 border border-slate-300 rounded-lg px-2 py-0.5 text-[11px] w-full" />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="px-4 py-4 text-[12.5px] text-slate-400">Personne dans ce groupe.</div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue flex items-center gap-2">
            <IconScale size={22} className="text-iip-turquoise" />
            Classement & prioritaires
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Art. 34 (classement au 15 avril) et 34ter (candidatures prioritaires
            au 29 mai) du statut du libre subventionné.
          </p>
        </div>
      </div>

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between gap-3 ${message.type === 'ok'
          ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
          : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)}><IconX size={15} /></button>
        </div>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {[['classement', 'Classement par fonction'], ['prioritaires', `Registre des prioritaires${prior ? ` (${prior.total})` : ''}`]].map(([k, l]) => (
          <button key={k} onClick={() => setOnglet(k)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${onglet === k
              ? 'border-iip-turquoise text-iip-blue font-semibold' : 'border-transparent text-slate-500'}`}>
            {l}
          </button>
        ))}
      </div>

      {onglet === 'classement' && (
        <>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 uppercase tracking-wide mb-1">Fonction</label>
              <select value={fonction} onChange={e => setFonction(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm min-w-[260px]">
                {fonctions.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <button onClick={preremplir}
              className="text-[12px] px-2.5 py-1.5 rounded-lg border border-slate-300 flex items-center gap-1.5">
              <IconWand size={14} /> Pré-remplir depuis l'ancienneté PO
            </button>
          </div>

          {data && (
            <>
              <Groupe titre="Groupe 1" sous="à partir de 721 jours d'ancienneté dans la fonction"
                      lignes={data.groupe1} ton="bg-iip-blue/5 text-iip-blue" />
              <Groupe titre="Groupe 2" sous="360 à 720 jours, répartis sur deux années au moins"
                      lignes={data.groupe2} ton="bg-cyan-50 text-cyan-900" />
              <Groupe titre="Hors groupes" sous="conditions de l'art. 34 § 1er non réunies"
                      lignes={data.hors_groupes} ton="bg-slate-50 text-slate-600" />
              <p className="text-[11px] text-slate-400">
                {data.reference}. L'ancienneté s'entend par fonction au sein du PO ;
                le pré-remplissage propose l'ancienneté PO globale comme point de
                départ, à ajuster. À ancienneté égale, le statut ne fixe pas de
                départage : la décision reste au pouvoir organisateur.
              </p>
            </>
          )}
        </>
      )}

      {onglet === 'prioritaires' && prior && (
        <>
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[12.5px] text-slate-600 flex items-center gap-2">
              <IconMailOpened size={16} className="text-iip-turquoise" />
              Candidatures pour la rentrée {annee} — limite : <b>{fr(prior.date_limite)}</b>
              {prior.hors_delai > 0 && (
                <span className="text-red-700 font-semibold flex items-center gap-1">
                  <IconAlertTriangle size={14} /> {prior.hors_delai} hors délai
                </span>
              )}
            </p>
            {!form && (
              <button onClick={() => setForm({ fonctions: '', voie: 'recommandee',
                date_reception: new Date().toISOString().slice(0, 10) })}
                className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold flex items-center gap-1.5">
                <IconPlus size={15} /> Enregistrer une candidature
              </button>
            )}
          </div>

          {form && (
            <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/60 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Nom</span>
                  <input value={form.nom || ''} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
                <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Prénom</span>
                  <input value={form.prenom || ''} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
                <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Reçue le</span>
                  <input type="date" value={form.date_reception}
                    onChange={e => setForm(f => ({ ...f, date_reception: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
                <label className="text-xs"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Voie</span>
                  <select value={form.voie} onChange={e => setForm(f => ({ ...f, voie: e.target.value }))}
                    className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm">
                    <option value="recommandee">Lettre recommandée</option>
                    <option value="electronique">Voie électronique</option>
                  </select></label>
              </div>
              <label className="text-xs block"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Fonction(s) visée(s)</span>
                <input value={form.fonctions} onChange={e => setForm(f => ({ ...f, fonctions: e.target.value }))}
                  placeholder="ex. Professeur de cours techniques"
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
              <label className="text-xs block"><span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Établissement(s)</span>
                <input value={form.etablissements || ''} onChange={e => setForm(f => ({ ...f, etablissements: e.target.value }))}
                  className="w-full border border-slate-300 rounded-lg px-2 py-1.5 text-sm" /></label>
              <div className="flex gap-2">
                <button onClick={creerPrioritaire} disabled={!form.fonctions || !form.nom}
                  className="text-sm px-3 py-1.5 rounded-lg bg-iip-blue text-white font-semibold disabled:opacity-40">
                  Enregistrer
                </button>
                <button onClick={() => setForm(null)}
                  className="text-sm px-3 py-1.5 rounded-lg border border-slate-300">Annuler</button>
              </div>
            </div>
          )}

          <div className="border border-slate-200 rounded-xl overflow-hidden bg-white">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left w-28">Reçue le</th>
                  <th className="px-3 py-2 text-left">Candidat</th>
                  <th className="px-3 py-2 text-left">Fonction(s)</th>
                  <th className="px-3 py-2 text-left w-32">Voie</th>
                  <th className="px-3 py-2 text-left w-28">Délai</th>
                  <th className="px-3 py-2 w-10"></th>
                </tr>
              </thead>
              <tbody>
                {prior.candidatures.map(c => (
                  <tr key={c.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                    <td className="px-3 py-2 font-medium text-iip-blue">{fr(c.date_reception)}</td>
                    <td className="px-3 py-2 text-slate-800">
                      {c.prof_nom ? `${c.prof_nom} ${c.prof_prenom}` : `${c.nom || ''} ${c.prenom || ''}`}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{c.fonctions}</td>
                    <td className="px-3 py-2 text-slate-600 text-[12px]">
                      {c.voie === 'electronique' ? 'Électronique' : 'Recommandée'}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${c.recevable
                        ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800'}`}>
                        {c.recevable ? 'Recevable' : 'Hors délai'}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => supprimerPrioritaire(c.id)}
                        className="text-slate-300 hover:text-red-600"><IconTrash size={15} /></button>
                    </td>
                  </tr>
                ))}
                {!prior.candidatures.length && (
                  <tr><td colSpan={6} className="px-3 py-6 text-center text-slate-400 text-[12.5px]">
                    Aucune candidature enregistrée pour {annee}.
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[11px] text-slate-400">
            Art. 34ter § 1er : candidature par lettre recommandée ou par voie
            électronique, auprès du président du pouvoir organisateur, copie au
            président de la Commission centrale de gestion des emplois, mentionnant
            la ou les fonctions et les établissements visés.
          </p>
        </>
      )}
    </div>
  );
}
