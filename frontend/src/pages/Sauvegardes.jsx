import { useEffect, useState } from 'react';
import {
  IconDatabase, IconDownload, IconTrash, IconAlertTriangle, IconCheck, IconClock,
} from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { TableauEntete, Th, Badge } from '../components/ui.jsx';

/**
 * Sauvegardes de la base.
 *
 * L'intérêt d'un écran plutôt que d'un script silencieux tient à un point :
 * une sauvegarde qu'on voit est une sauvegarde qu'on surveille. Un dispositif
 * qui s'arrête sans bruit ne se découvre qu'au moment où l'on en a besoin.
 */
const octets = n => {
  if (!n) return '—';
  if (n < 1024 * 1024) return Math.round(n / 1024) + ' Ko';
  return (n / 1048576).toFixed(1).replace('.', ',') + ' Mo';
};

const quand = iso => {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T') + 'Z');
  return d.toLocaleString('fr-BE', { day: '2-digit', month: '2-digit', year: 'numeric',
                                     hour: '2-digit', minute: '2-digit' });
};

const DECLENCHEUR = { manuel: 'à la demande', planifiee: 'planifiée', deploiement: 'avant déploiement' };

export default function Sauvegardes() {
  const [data, setData] = useState(null);
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);
  const [config, setConfig] = useState(null);

  async function charger() {
    const rep = await fetch('/api/sauvegardes', { headers: authHeaders() });
    if (!rep.ok) { setData({ sauvegardes: [] }); return; }
    const j = await rep.json();
    setData(j); setConfig(j.config);
  }
  useEffect(() => { charger(); }, []);

  async function sauvegarder() {
    setEnCours(true); setMessage(null);
    try {
      const rep = await fetch('/api/sauvegardes/executer', { method: 'POST', headers: authHeaders() });
      const j = await rep.json();
      setMessage(rep.ok
        ? { type: 'ok', texte: `Sauvegarde ${j.fichier} — ${octets(j.taille)}, intégrité ${j.integrite}.` }
        : { type: 'err', texte: j.erreur || 'Échec de la sauvegarde.' });
      await charger();
    } finally { setEnCours(false); }
  }

  async function enregistrerConfig(champs) {
    const rep = await fetch('/api/sauvegardes/config', {
      method: 'PUT', headers: authHeaders(), body: JSON.stringify(champs),
    });
    const j = await rep.json();
    if (rep.ok) { setConfig(j.config); setMessage({ type: 'ok', texte: 'Planification enregistrée.' }); }
  }

  async function supprimer(id) {
    if (!window.confirm('Supprimer définitivement cette sauvegarde ?')) return;
    await fetch(`/api/sauvegardes/${id}`, { method: 'DELETE', headers: authHeaders() });
    await charger();
  }

  function telecharger(s) {
    const a = document.createElement('a');
    a.href = `/api/sauvegardes/${s.id}/telecharger`;
    a.download = s.fichier;
    document.body.appendChild(a); a.click(); a.remove();
  }

  if (!data || !config) return <div className="p-5 text-sm text-slate-400">Chargement…</div>;

  const reussies = data.sauvegardes.filter(s => !s.erreur);
  const precedente = reussies[1];

  return (
    <div className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-xl font-semibold text-iip-blue">Sauvegardes</h2>
          <p className="text-sm text-slate-500">
            Copies cohérentes de la base, contrôlées à chaque exécution.
          </p>
        </div>
        <button onClick={sauvegarder} disabled={enCours}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-iip-blue text-white font-semibold rounded-lg disabled:opacity-50">
          <IconDatabase size={16} /> {enCours ? 'Sauvegarde en cours…' : 'Sauvegarder maintenant'}
        </button>
      </div>

      {data.alerte && (
        <div className="px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[12.5px] text-amber-900 flex items-center gap-2">
          <IconAlertTriangle size={15} className="flex-none" /> {data.alerte}
        </div>
      )}

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between ${
          message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                : 'bg-red-50 text-red-800 border border-red-200'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="ml-3 opacity-60">✕</button>
        </div>
      )}

      {/* Planification */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
          <IconClock size={15} className="text-slate-400" />
          <span className="text-[13px] font-semibold text-iip-blue">Planification</span>
        </div>
        <div className="p-4 flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-[12.5px]">
            <input type="checkbox" checked={config.active}
              onChange={e => enregistrerConfig({ active: e.target.checked })} />
            Sauvegarde quotidienne
          </label>
          <label className="text-xs">
            <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">Heure</span>
            <input type="time" value={config.heure} disabled={!config.active}
              onChange={e => enregistrerConfig({ heure: e.target.value })}
              className="border border-slate-300 rounded-lg px-2 py-1.5 text-sm disabled:bg-slate-50" />
          </label>
          {[['garder_quotidiennes', 'Quotidiennes'],
            ['garder_hebdomadaires', 'Hebdomadaires'],
            ['garder_mensuelles', 'Mensuelles']].map(([k, l]) => (
            <label key={k} className="text-xs">
              <span className="block font-semibold text-slate-500 uppercase tracking-wide mb-1">{l}</span>
              <input type="number" min="0" max="60" value={config[k]}
                onChange={e => setConfig(c => ({ ...c, [k]: Number(e.target.value) }))}
                onBlur={e => enregistrerConfig({ [k]: Number(e.target.value) })}
                className="w-20 border border-slate-300 rounded-lg px-2 py-1.5 text-sm text-right" />
            </label>
          ))}
          <div className="text-[11px] text-slate-500 flex-1 min-w-[240px]">
            La rétention est en cascade : les plus récentes au jour le jour, puis une par semaine,
            puis une par mois. Une erreur découverte le lendemain et une erreur découverte à la
            vérification comptable n'appellent pas la même profondeur.
          </div>
        </div>
      </div>

      {/* Historique */}
      <div className="border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-4 py-2.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <span className="text-[13px] font-semibold text-iip-blue">
            {reussies.length} sauvegarde(s) conservée(s)
          </span>
          <span className="text-[11px] text-slate-400">
            {octets(data.espace_total)} · {data.dossier}
          </span>
        </div>

        {!data.sauvegardes.length ? (
          <div className="py-10 text-center text-sm text-slate-400">
            Aucune sauvegarde. Lancez la première avec le bouton ci-dessus.
          </div>
        ) : (
          <table className="w-full text-sm">
            <TableauEntete>
              <Th>Date</Th>
              <Th largeur="w-36">Déclencheur</Th>
              <Th align="droite" largeur="w-24">Taille</Th>
              <Th largeur="w-28">Intégrité</Th>
              <Th>Contenu</Th>
              <Th largeur="w-24" />
            </TableauEntete>
            <tbody>
              {data.sauvegardes.map(s => (
                <tr key={s.id} className={`border-b border-slate-100 ${s.erreur ? 'bg-red-50/50' : 'hover:bg-slate-50/60'}`}>
                  <td className="px-4 py-2 text-[12.5px] text-slate-800">
                    {quand(s.cree_le)}
                    {s.duree_ms != null && (
                      <span className="block text-[10px] text-slate-400">{s.duree_ms} ms</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11.5px] text-slate-500">
                    {DECLENCHEUR[s.declencheur] || s.declencheur}
                  </td>
                  <td className="px-3 py-2 text-right text-[12px]">{octets(s.taille)}</td>
                  <td className="px-3 py-2">
                    {s.erreur ? (
                      <Badge ton="danger">échec</Badge>
                    ) : s.integrite === 'ok' ? (
                      <span className="text-[11.5px] text-emerald-700 flex items-center gap-1">
                        <IconCheck size={13} /> ok
                      </span>
                    ) : (
                      <span className="text-[11.5px] text-amber-700">{s.integrite}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-[11px] text-slate-500">
                    {s.erreur ? (
                      <span className="text-red-700">{s.erreur}</span>
                    ) : s.comptes ? (
                      Object.entries(s.comptes).map(([t, n]) => {
                        const avant = precedente?.comptes?.[t];
                        const chute = avant != null && n != null && n < avant * 0.9;
                        return (
                          <span key={t} className={`mr-2 ${chute ? 'text-red-600 font-semibold' : ''}`}
                            title={chute ? `Était à ${avant} lors de la sauvegarde précédente` : ''}>
                            {t.replace('etudiant_', 'ét. ').replace('etudiant', 'étudiants')} {n}
                          </span>
                        );
                      })
                    ) : '—'}
                  </td>
                  <td className="px-3 py-2 text-right whitespace-nowrap">
                    {!s.erreur && (
                      <button onClick={() => telecharger(s)} title="Télécharger"
                        className="text-slate-400 hover:text-iip-blue mr-2">
                        <IconDownload size={15} />
                      </button>
                    )}
                    <button onClick={() => supprimer(s.id)} title="Supprimer"
                      className="text-slate-300 hover:text-red-500">
                      <IconTrash size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="text-[11px] text-slate-500 space-y-1">
        <p>
          Chaque copie est produite après un point de contrôle du journal d'écriture, puis
          <b> vérifiée sur la copie elle-même</b> — intégrité et décompte des tables principales.
          Une chute soudaine d'un décompte s'affiche en rouge.
        </p>
        <p>
          <b>La restauration reste manuelle</b>, en ligne de commande sur le serveur : un bouton
          qui écrase la base depuis un navigateur ferait courir plus de risques qu'il n'en écarte.
        </p>
        <p>
          Pour une copie hors du serveur, faites pointer la synchronisation vers le dossier
          ci-dessus. Les données étant nominatives, chiffrez l'archive avant tout envoi vers un
          service tiers.
        </p>
      </div>
    </div>
  );
}
