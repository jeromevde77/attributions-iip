import { useEffect, useState } from 'react';
import { IconAlertTriangle, IconLock } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { MODULES_ACCES } from '../lib/modules.js';

/**
 * Plafonds par rôle.
 *
 * Ce qu'un rôle autorise AU MIEUX, module par module. Les cases cochées sur la
 * fiche d'une personne affinent à l'intérieur de ce plafond, sans jamais
 * pouvoir accorder davantage — c'est la charpente du cloisonnement.
 *
 * Ces valeurs étaient codées en dur, ce qui obligeait à intervenir sur le code
 * à chaque changement d'avis. Elles se règlent maintenant ici.
 */
const NIVEAUX = [
  { val: 'rien',       label: '—',          aide: 'Aucun accès',
    cls: 'bg-slate-50 text-slate-300 border-slate-200' },
  { val: 'lit',        label: 'lit',        aide: 'Consultation seule',
    cls: 'bg-sky-100 text-sky-800 border-sky-200' },
  { val: 'validation', label: 'validation', aide: 'Encode, la direction tranche',
    cls: 'bg-amber-100 text-amber-800 border-amber-200' },
  { val: 'ecrit',      label: 'écrit',      aide: 'Modifie directement',
    cls: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
];

const LIBELLE_ROLE = {
  directeur: 'Directeur', directeur_adjoint: 'Directeur adjoint',
  admin: 'Administrateur technique', secretariat: 'Secrétariat',
  editeur: 'Éditeur (ancien nom)', coordination: 'Coordination',
  professeur: 'Professeur', consultation: 'Consultation',
};

const DIRECTION = ['admin', 'directeur', 'directeur_adjoint'];

export default function RolesPlafonds() {
  const [data, setData] = useState(null);
  const [message, setMessage] = useState(null);
  const [enCours, setEnCours] = useState(null);

  async function charger() {
    const rep = await fetch('/api/profils-acces/plafonds', { headers: authHeaders() });
    setData(rep.ok ? await rep.json() : null);
  }
  useEffect(() => { charger(); }, []);

  async function basculer(role, module) {
    if (DIRECTION.includes(role)) return;
    const actuel = data.plafonds[role]?.[module] || 'rien';
    const i = NIVEAUX.findIndex(n => n.val === actuel);
    const suivant = NIVEAUX[(i + 1) % NIVEAUX.length].val;

    setEnCours(`${role}|${module}`);
    try {
      const rep = await fetch('/api/profils-acces/plafonds', {
        method: 'PUT', headers: authHeaders(),
        body: JSON.stringify({ role, module, niveau: suivant }),
      });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error }); return; }
      if (j.avertissement) setMessage({ type: 'info', texte: j.avertissement });
      await charger();
    } finally { setEnCours(null); }
  }

  if (!data) return <div className="p-5 text-sm text-slate-400">Chargement…</div>;

  return (
    <div className="p-5 space-y-4">
      <div>
        <h2 className="text-xl font-semibold text-iip-blue">Rôles</h2>
        <p className="text-sm text-slate-500">
          Ce que chaque rôle autorise au mieux. Les cases d'une fiche affinent à l'intérieur.
        </p>
      </div>

      {message && (
        <div className={`px-4 py-2.5 rounded-lg text-[12.5px] flex items-start justify-between gap-3 ${
          message.type === 'err' ? 'bg-red-50 border border-red-200 text-red-800'
                                 : 'bg-amber-50 border border-amber-200 text-amber-900'}`}>
          <span>{message.texte}</span>
          <button onClick={() => setMessage(null)} className="opacity-60">✕</button>
        </div>
      )}

      <div className="border border-slate-200 rounded-xl overflow-x-auto bg-white">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-[10px] uppercase
                           tracking-wide text-slate-500">
              <th className="px-3 py-2 text-left sticky left-0 bg-slate-50 min-w-[190px]">Rôle</th>
              {MODULES_ACCES.map(m => (
                <th key={m.key} className="px-1 py-2 w-24" title={m.desc}>
                  <div className="flex justify-center text-slate-400">
                    <m.Icone size={14} stroke={1.6} />
                  </div>
                  <div className="text-[9px] text-slate-500 leading-tight mt-0.5">{m.label}</div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.roles.map(role => {
              const fige = DIRECTION.includes(role);
              return (
                <tr key={role} className="border-b border-slate-100 hover:bg-slate-50/60">
                  <td className="px-3 py-2 sticky left-0 bg-white border-r border-slate-100">
                    <div className="text-[12.5px] text-slate-800 flex items-center gap-1.5">
                      {LIBELLE_ROLE[role] || role}
                      {fige && <IconLock size={12} className="text-slate-300" />}
                    </div>
                    <div className="text-[10px] text-slate-400">{role}</div>
                  </td>
                  {MODULES_ACCES.map(m => {
                    const niveau = data.plafonds[role]?.[m.key] || 'rien';
                    const n = NIVEAUX.find(x => x.val === niveau) || NIVEAUX[0];
                    const occupe = enCours === `${role}|${m.key}`;
                    return (
                      <td key={m.key} className="px-1 py-2 text-center">
                        <button onClick={() => basculer(role, m.key)} disabled={fige || occupe}
                          title={fige
                            ? "La direction conserve l'écriture partout"
                            : `${n.aide} — cliquer pour changer`}
                          className={`text-[10px] px-1.5 py-1 rounded border w-full ${n.cls}
                            ${fige ? 'cursor-default opacity-70'
                                   : 'hover:ring-2 hover:ring-iip-turquoise/40 cursor-pointer'}`}>
                          {occupe ? '…' : n.label}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap gap-3 text-[10.5px] text-slate-600">
        {NIVEAUX.map(n => (
          <span key={n.val}>
            <span className={`px-1.5 py-0.5 rounded border ${n.cls}`}>{n.label}</span> {n.aide}
          </span>
        ))}
      </div>

      <div className="px-4 py-3 rounded-xl bg-slate-50 border border-slate-200 text-[11.5px]
                      text-slate-600 space-y-1.5">
        <p className="flex items-start gap-1.5">
          <IconAlertTriangle size={14} className="mt-0.5 flex-none text-slate-400" />
          Le plafond est un maximum, non une attribution : une personne n'obtient un droit que si
          la case correspondante est également cochée sur sa fiche. Abaisser un plafond retire le
          droit à tous ceux qui portent ce rôle, immédiatement.
        </p>
        <p>
          <b>La direction reste figée en écriture</b> sur tous les modules : c'est elle qui répare
          les erreurs de paramétrage, et se fermer la porte rendrait toute correction impossible.
        </p>
        <p>
          Le niveau <b>validation</b> suppose que l'écran sache transmettre une demande. Là où ce
          n'est pas encore le cas, la saisie est refusée avec un message explicite plutôt
          qu'appliquée en silence.
        </p>
      </div>
    </div>
  );
}
