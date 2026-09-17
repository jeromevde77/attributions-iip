import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconPrinter } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { Fenetre } from './ui.jsx';

/**
 * LA SÉANCE DE VALORISATION DES ACQUIS, ET LES PIÈCES QUI EN DÉCOULENT.
 *
 * Le procès-verbal de valorisation (annexe 4) et les attestations qui en
 * découlent (annexe 15 pour le supérieur, 14 pour le secondaire) existaient
 * côté serveur depuis longtemps, sans qu'aucun écran ne les demande : une
 * pièce que personne ne peut produire n'existe pas.
 *
 * Ce qui se voit ici est ce que le modèle officiel laisse en pointillés — la
 * date de la séance, celle de la communication des résultats, qui a présidé,
 * qui était présent. Tant que ces valeurs manquent, LE SERVEUR REFUSE de
 * produire quoi que ce soit : un procès-verbal sorti à trous se complète à la
 * main, et c'est cette main qu'on ne retrouve plus un an après.
 *
 * Le nombre de pages ne se saisit pas : il se constate. Le serveur compose la
 * pièce, la compte, puis inscrit le nombre trouvé — un procès-verbal qui
 * annonce trois pages quand il en compte quatre est faux.
 *
 * LE PROCÈS-VERBAL EST UNE PIÈCE D'UNITÉ, pas d'étudiant : il porte tous les
 * étudiants valorisés dans cette unité cette année-là. On l'ouvre depuis la
 * fiche d'un étudiant parce que c'est là qu'on travaille — mais ce qui en sort
 * concerne l'unité entière, et l'écran le dit.
 */
export default function SeanceValorisation({ ueNum, ueNom, annee, onClose }) {
  const [etat, setEtat] = useState(null);
  const [erreur, setErreur] = useState(null);
  const [manques, setManques] = useState([]);
  const [info, setInfo] = useState(null);
  const [enCours, setEnCours] = useState(false);

  async function charger() {
    setErreur(null);
    try {
      const rep = await fetch(
        `/api/attestations/valorisation/ue/${ueNum}/seance?annee=${encodeURIComponent(annee)}`,
        { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      // Le président proposé n'est qu'une proposition : il ne s'écrit que si
      // rien n'a encore été saisi pour cette séance.
      const s = j.seance || {};
      setEtat({ ...j, champs: {
        date_seance: s.date_seance || '',
        communication_date: s.communication_date || '',
        president_nom: s.president_nom || j.president_propose || '',
        president_titre: s.president_titre || 'le Directeur',
      } });
      setManques(j.manques || []);
    } catch (e) { setErreur(e.message); }
  }
  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [ueNum, annee]);

  const set = (k, v) => setEtat(e => ({ ...e, champs: { ...e.champs, [k]: v } }));
  const basculer = cle => setEtat(e => ({ ...e,
    membres: e.membres.map(m => (m.cle === cle ? { ...m, present: !m.present } : m)) }));

  async function enregistrer() {
    setEnCours(true); setErreur(null);
    try {
      const rep = await fetch(`/api/attestations/valorisation/ue/${ueNum}/seance`, {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ annee, ...etat.champs, membres: etat.membres }),
      });
      const j = await rep.json();
      if (!rep.ok) throw new Error(j.error || 'Erreur');
      setEtat(e => ({ ...e, seance: j.seance, membres: j.membres, quorum: j.quorum }));
      setManques(j.manques || []);
      return j.manques || [];
    } catch (e) { setErreur(e.message); return null; }
    finally { setEnCours(false); }
  }

  /**
   * On enregistre AVANT de produire, toujours : demander la pièce sans avoir
   * enregistré la séance ferait sortir un document qui ne correspond pas à
   * l'écran qu'on a sous les yeux.
   */
  async function produire() {
    const reste = await enregistrer();
    if (reste === null) return;
    if (reste.length) return;                 // le serveur redira non de toute façon
    setEnCours(true); setErreur(null); setInfo(null);
    try {
      const rep = await fetch(`/api/attestations/valorisation/ue/${ueNum}/documents`, {
        method: 'POST', headers: authHeaders(), body: JSON.stringify({ annee }),
      });
      const j = await rep.json();
      if (!rep.ok) {
        setManques(j.manques || []);
        throw new Error(j.error || 'Erreur');
      }
      // UN SEUL ONGLET, ET C'EST VOLONTAIRE. En ouvrir un par pièce revenait
      // à n'en ouvrir qu'un : le navigateur bloque les suivants, et
      // l'attestation ne sortait jamais. Le document porte le procès-verbal
      // puis chaque attestation, chacune sur sa page.
      const f = window.open('', '_blank');
      if (!f) { setErreur('Le navigateur a bloqué la fenêtre d’impression.'); return; }
      f.document.write(j.html); f.document.close();
      setInfo(`Procès-verbal (${j.pages || '?'} page(s))`
        + ` + ${(j.attestations || []).length} attestation(s) `
        + `— annexe ${(j.attestations || [])[0]?.annexe || 15}.`);
    } catch (e) { setErreur(e.message); }
    finally { setEnCours(false); }
  }

  const q = etat?.quorum;

  return (
    <Fenetre icone={IconPrinter} large="moyenne" onFermer={onClose}
      titre={`Valorisation des acquis — UE ${ueNum}`}
      sous={`${ueNom || etat?.ue?.ue_nom || ''} · ${annee}`}>
      {!etat ? (
        <div className="p-6 text-sm text-slate-400">Chargement…</div>
      ) : (
        <div className="p-5 space-y-4">
          <p className="text-[12px] text-slate-500">
            Procès-verbal de délibération de valorisation des acquis (annexe 4) et
            attestations de réussite par valorisation. <b>{etat.nb}</b> valorisation(s)
            enregistrée(s) pour cette unité — le procès-verbal les porte toutes,
            et chaque dispense <b>complète</b> donne en outre son attestation de
            réussite (annexe 15 en supérieur, 14 en secondaire).
          </p>

          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs"><span className="block font-semibold text-slate-500
              uppercase tracking-wide mb-1">Date de la séance</span>
              <input type="date" value={etat.champs.date_seance} className="controle w-full"
                onChange={e => set('date_seance', e.target.value)} /></label>
            <label className="text-xs"><span className="block font-semibold text-slate-500
              uppercase tracking-wide mb-1">Communication des résultats</span>
              <input type="date" value={etat.champs.communication_date} className="controle w-full"
                onChange={e => set('communication_date', e.target.value)} /></label>
            <label className="text-xs"><span className="block font-semibold text-slate-500
              uppercase tracking-wide mb-1">Président de séance</span>
              <input value={etat.champs.president_nom} className="controle w-full"
                onChange={e => set('president_nom', e.target.value)} /></label>
            <label className="text-xs"><span className="block font-semibold text-slate-500
              uppercase tracking-wide mb-1">Qualité du président</span>
              <input value={etat.champs.president_titre} className="controle w-full"
                onChange={e => set('president_titre', e.target.value)} /></label>
          </div>

          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                Conseil des études — présences
              </span>
              {q && (
                <span className={`text-[11px] ${q.atteint ? 'text-emerald-700' : 'text-rose-700'}`}>
                  quorum {q.presents}/{q.membres} · {q.requis} requis
                </span>
              )}
            </div>
            <div className="carte divide-y divide-slate-100">
              {etat.membres.map(m => (
                <label key={m.cle} className="flex items-center gap-2.5 px-3 py-1.5 cursor-pointer">
                  <input type="checkbox" checked={!!m.present} onChange={() => basculer(m.cle)} />
                  <span className="text-[13px] text-iip-blue flex-1">{m.nom}</span>
                  <span className="text-[11px] text-slate-400">
                    {m.qualite}{(m.voix || 'deliberative') === 'consultative' ? ' · consultative' : ''}
                  </span>
                </label>
              ))}
            </div>
          </div>

          {!!manques.length && (
            <div className="carte border-amber-300 bg-amber-50/60 px-3 py-2">
              <div className="flex items-center gap-1.5 text-[12px] font-semibold text-amber-800">
                <IconAlertTriangle size={14} /> À encoder avant impression
              </div>
              <ul className="mt-1 text-[11px] text-amber-900 list-disc pl-5 space-y-0.5">
                {manques.map((m, i) => <li key={i}>{m}</li>)}
              </ul>
            </div>
          )}
          {info && <div className="text-[12px] text-emerald-700">{info}</div>}
          {erreur && <div className="text-[12px] text-rose-700">{erreur}</div>}

          <div className="flex gap-2">
            <button onClick={produire} disabled={enCours}
              className="bouton bouton-sortir disabled:opacity-50">
              <IconPrinter size={15} /> Produire le PV et les attestations
            </button>
            <button onClick={enregistrer} disabled={enCours} className="bouton">
              Enregistrer la séance
            </button>
            <button onClick={onClose} className="bouton ml-auto">Fermer</button>
          </div>
        </div>
      )}
    </Fenetre>
  );
}
