import { useEffect, useState } from 'react';
import { nomPropre } from '../lib/nom.js';
import {
  IconListNumbers, IconMailOpened, IconWand, IconTrash, IconPlus,
  IconAlertTriangle, IconX, IconScale,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { EnteteCarte, Encadre, PastilleEtat, Tableau, TableauEntete, Th, Td, Tr, TableauVide } from '../components/ui.jsx';
import { demander } from '../lib/dialogue.jsx';

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
    if (!(await demander('Supprimer cette candidature du registre ?'))) return;
    await fetch(`/api/classement/prioritaires/${id}`, { method: 'DELETE', headers: authHeaders() });
    await chargerPrior();
  }

  const Groupe = ({ titre, sous, lignes }) => (
    <div className="carte overflow-hidden mb-3">
      <EnteteCarte titre={titre} sous={sous}>
        <span className="text-xs font-bold">{lignes.length}</span>
      </EnteteCarte>
      {lignes.length ? (
        <Tableau className="!border-0 !rounded-none">
          <tbody>
            {lignes.map((l, i) => (
              <Tr key={l.id}>
                <Td className="w-8 text-xs text-slate-400 font-bold">{i + 1}</Td>
                <Td>
                  <span className="font-medium text-slate-800">{nomPropre(l.nom, l.prenom)}</span>
                  {l.exclu_tp && (
                    <PastilleEtat etat="surveiller" className="ml-2">
                      définitif TP — demande écrite (15/04) manquante
                    </PastilleEtat>
                  )}
                </Td>
                <Td className="w-28">
                  <input type="number" min="0" defaultValue={l.jours}
                    onBlur={e => Number(e.target.value) !== l.jours
                      && majLigne(l, { jours: Number(e.target.value) })}
                    className="controle !h-8 w-24 text-sm text-right" />
                  <span className="text-mention text-slate-400 ml-1">j</span>
                </Td>
                <Td className="w-32">
                  <label className="flex items-center gap-1.5 text-xs text-slate-600">
                    <input type="checkbox" checked={!!l.sur_deux_annees}
                      onChange={e => majLigne(l, { sur_deux_annees: e.target.checked ? 1 : 0 })} />
                    sur 2 années
                  </label>
                </Td>
                <Td className="w-44">
                  <select value={l.statut_mdp || ''}
                    onChange={e => majLigne(l, { statut_mdp: e.target.value || null,
                      demande_tp_le: e.target.value === 'definitif_tp' ? l.demande_tp_le : null })}
                    className="controle !h-8 text-second w-full">
                    <option value="">Temporaire</option>
                    <option value="definitif_tp">Définitif temps partiel</option>
                    <option value="definitif">Définitif temps plein</option>
                  </select>
                  {l.statut_mdp === 'definitif_tp' && (
                    <input type="date" value={l.demande_tp_le || ''}
                      title="Date de la demande écrite (avant le 15 avril)"
                      onChange={e => majLigne(l, { statut_mdp: 'definitif_tp', demande_tp_le: e.target.value || null })}
                      className="controle !h-7 mt-1 text-xs w-full" />
                  )}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Tableau>
      ) : (
        <div className="px-4 py-4 text-sm text-slate-400">Personne dans ce groupe.</div>
      )}
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="titre-ecran mb-0">
                        Classement & prioritaires
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            Art. 34 (classement au 15 avril) et 34ter (candidatures prioritaires
            au 29 mai) du statut du libre subventionné.
          </p>
        </div>
      </div>

      {message && (
        <Encadre etat={message.type === 'ok' ? 'reussi' : 'corriger'}>
          <div className="flex items-center justify-between gap-3">
            <span>{message.texte}</span>
            <button onClick={() => setMessage(null)} className="text-slate-400 hover:text-slate-600" title="Fermer"><IconX size={15} /></button>
          </div>
        </Encadre>
      )}

      <div className="flex gap-1 border-b border-slate-200">
        {[['classement', 'Classement par fonction'], ['prioritaires', `Registre des prioritaires${prior ? ` (${prior.total})` : ''}`]].map(([k, l]) => (
          <button key={k} onClick={() => setOnglet(k)}
            className={onglet === k ? 'onglet-page onglet-page-actif' : 'onglet-page'}>
            {l}
          </button>
        ))}
      </div>

      {onglet === 'classement' && (
        <>
          <div className="flex items-end gap-3 flex-wrap">
            <div>
              <label className="intertitre block mb-1">Fonction</label>
              <select value={fonction} onChange={e => setFonction(e.target.value)}
                className="controle text-sm min-w-[260px]">
                {fonctions.map(f => <option key={f} value={f}>{f}</option>)}
              </select>
            </div>
            <button onClick={preremplir}
              className="bouton flex items-center gap-1.5">
              <IconWand size={14} /> Pré-remplir depuis l'ancienneté PO
            </button>
          </div>

          {data && (
            <>
              <Groupe titre="Groupe 1" sous="à partir de 721 jours d'ancienneté dans la fonction"
                      lignes={data.groupe1} />
              <Groupe titre="Groupe 2" sous="360 à 720 jours, répartis sur deux années au moins"
                      lignes={data.groupe2} />
              <Groupe titre="Hors groupes" sous="conditions de l'art. 34 § 1er non réunies"
                      lignes={data.hors_groupes} />
              <p className="text-xs text-slate-400">
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
            <p className="text-sm text-slate-600 flex items-center gap-2">
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
                className="bouton bouton-fort flex items-center gap-1.5">
                <IconPlus size={15} /> Enregistrer une candidature
              </button>
            )}
          </div>

          {form && (
            <div className="carte p-4 space-y-3">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <label className="text-xs"><span className="intertitre block mb-1">Nom</span>
                  <input value={form.nom || ''} onChange={e => setForm(f => ({ ...f, nom: e.target.value }))}
                    className="controle w-full text-sm" /></label>
                <label className="text-xs"><span className="intertitre block mb-1">Prénom</span>
                  <input value={form.prenom || ''} onChange={e => setForm(f => ({ ...f, prenom: e.target.value }))}
                    className="controle w-full text-sm" /></label>
                <label className="text-xs"><span className="intertitre block mb-1">Reçue le</span>
                  <input type="date" value={form.date_reception}
                    onChange={e => setForm(f => ({ ...f, date_reception: e.target.value }))}
                    className="controle w-full text-sm" /></label>
                <label className="text-xs"><span className="intertitre block mb-1">Voie</span>
                  <select value={form.voie} onChange={e => setForm(f => ({ ...f, voie: e.target.value }))}
                    className="controle w-full text-sm">
                    <option value="recommandee">Lettre recommandée</option>
                    <option value="electronique">Voie électronique</option>
                  </select></label>
              </div>
              <label className="text-xs block"><span className="intertitre block mb-1">Fonction(s) visée(s)</span>
                <input value={form.fonctions} onChange={e => setForm(f => ({ ...f, fonctions: e.target.value }))}
                  placeholder="ex. Professeur de cours techniques"
                  className="controle w-full text-sm" /></label>
              <label className="text-xs block"><span className="intertitre block mb-1">Établissement(s)</span>
                <input value={form.etablissements || ''} onChange={e => setForm(f => ({ ...f, etablissements: e.target.value }))}
                  className="controle w-full text-sm" /></label>
              <div className="flex gap-2">
                <button onClick={creerPrioritaire} disabled={!form.fonctions || !form.nom}
                  className="bouton bouton-fort">
                  Enregistrer
                </button>
                <button onClick={() => setForm(null)}
                  className="bouton">Annuler</button>
              </div>
            </div>
          )}

          <div className="carte overflow-hidden">
            <Tableau className="!border-0 !rounded-none">
              <TableauEntete>
                  <Th largeur="w-28">Reçue le</Th>
                  <Th>Candidat</Th>
                  <Th>Fonction(s)</Th>
                  <Th largeur="w-32">Voie</Th>
                  <Th largeur="w-28">Délai</Th>
                  <Th largeur="w-10"></Th>
              </TableauEntete>
              <tbody>
                {prior.candidatures.map(c => (
                  <Tr key={c.id}>
                    <Td className="font-medium text-iip-blue">{fr(c.date_reception)}</Td>
                    <Td>
                      {c.prof_nom ? `${c.prof_nom} ${c.prof_prenom}` : `${c.nom || ''} ${c.prenom || ''}`}
                    </Td>
                    <Td className="text-slate-600">{c.fonctions}</Td>
                    <Td ton="secondaire">
                      {c.voie === 'electronique' ? 'Électronique' : 'Recommandée'}
                    </Td>
                    <Td>
                      <PastilleEtat etat={c.recevable ? 'reussi' : 'corriger'}>
                        {c.recevable ? 'Recevable' : 'Hors délai'}
                      </PastilleEtat>
                    </Td>
                    <Td>
                      <button onClick={() => supprimerPrioritaire(c.id)}
                        className="text-slate-300 hover:text-red-600" title="Supprimer"><IconTrash size={15} /></button>
                    </Td>
                  </Tr>
                ))}
                {!prior.candidatures.length && (
                  <TableauVide colonnes={6}>
                    Aucune candidature enregistrée pour {annee}.
                  </TableauVide>
                )}
              </tbody>
            </Tableau>
          </div>
          <p className="text-xs text-slate-400">
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
