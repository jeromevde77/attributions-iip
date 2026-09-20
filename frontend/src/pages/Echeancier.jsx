import { useEffect, useMemo, useState } from 'react';
import {
  IconCalendarStats, IconCheck, IconRefresh,
  IconScale, IconFilter, IconX, IconBooks, IconPlayerPlay,
} from '@tabler/icons-react';
import { PageHeader, Tabs, Btn, KpiCard, RailLateral } from '../components/ui.jsx';
import { authHeaders } from '../lib/api.js';

const MOIS = ['janvier','février','mars','avril','mai','juin',
              'juillet','août','septembre','octobre','novembre','décembre'];

const ZONES = {
  personnel:     'Personnel',
  documents:     'Documents',
  ue:            'Travail administratif UE',
  etablissement: 'Établissement',
  // LES ACTIONS DE RÉUNION SONT UNE ZONE COMME UNE AUTRE — un seul registre,
  // deux lentilles : ce que la circulaire impose, et ce qu'une séance a décidé.
  equipe:        'Suivi d’équipe',
};

const fr = (iso) => iso ? iso.slice(0, 10).split('-').reverse().join('/') : '—';
const jourMois = (iso) => iso ? iso.slice(8, 10) + '/' + iso.slice(5, 7) : '';

/** Jours restants (négatif = en retard). */
function resteJours(iso) {
  const j = new Date(iso + 'T00:00:00Z');
  const a = new Date();
  const auj = new Date(Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()));
  return Math.round((j - auj) / 86400000);
}

function Pastille({ echeance }) {
  const { statut, date_due } = echeance;
  if (statut === 'fait')       return <span className="px-2 py-0.5 rounded-champ text-[11px] font-bold bg-emerald-100 text-emerald-800">Fait</span>;
  if (statut === 'sans_objet') return <span className="px-2 py-0.5 rounded-champ text-[11px] font-bold bg-slate-100 text-slate-500">Sans objet</span>;
  if (statut === 'annule')     return <span className="px-2 py-0.5 rounded-champ text-[11px] font-bold bg-slate-100 text-slate-500">Annulé</span>;
  const n = resteJours(date_due);
  if (n < 0)   return <span className="px-2 py-0.5 rounded-champ text-[11px] font-bold bg-red-100 text-red-800">En retard ({-n} j)</span>;
  if (n === 0) return <span className="px-2 py-0.5 rounded-champ text-[11px] font-bold bg-amber-100 text-amber-900">Aujourd'hui</span>;
  if (n <= 7)  return <span className="px-2 py-0.5 rounded-champ text-[11px] font-bold bg-amber-100 text-amber-900">J-{n}</span>;
  return <span className="px-2 py-0.5 rounded-champ text-[11px] font-bold bg-slate-100 text-slate-600">J-{n}</span>;
}

export default function Echeancier() {
  const [tab, setTab] = useState('timeline');
  const [data, setData] = useState(null);
  const [types, setTypes] = useState([]);
  const [chargement, setChargement] = useState(true);
  const [filtres, setFiltres] = useState({ zone: '', statut: '', responsable: '', mien: false });
  const [message, setMessage] = useState(null);
  const [detail, setDetail] = useState(null);

  async function charger() {
    setChargement(true);
    try {
      const p = new URLSearchParams();
      if (filtres.zone) p.set('zone', filtres.zone);
      if (filtres.statut) p.set('statut', filtres.statut);
      if (filtres.responsable) p.set('responsable', filtres.responsable);
      if (filtres.mien) p.set('mien', '1');
      const rep = await fetch(`/api/echeancier?${p}`, { headers: authHeaders() });
      const j = await rep.json();
      if (!rep.ok) { setMessage({ type: 'err', texte: j.error || `Erreur ${rep.status}` }); return; }
      setData(j);
    } finally { setChargement(false); }
  }

  async function chargerTypes() {
    const rep = await fetch('/api/echeancier/types', { headers: authHeaders() });
    const j = await rep.json();
    if (!rep.ok || !Array.isArray(j)) {
      setMessage({ type: 'err', texte: j?.error || `Référentiel indisponible (${rep.status})` });
      setTypes([]);
      return;
    }
    setTypes(j);
  }

  useEffect(() => { charger(); /* eslint-disable-next-line */ }, [filtres]);
  useEffect(() => { if (tab === 'referentiel') chargerTypes(); }, [tab]);
  // L'onglet « Mes tâches » filtre côté serveur (responsable = moi ou mon rôle)
  useEffect(() => {
    setFiltres(f => f.mien === (tab === 'mien') ? f : { ...f, mien: tab === 'mien' });
  }, [tab]);

  async function basculer(e) {
    const nouveau = e.statut === 'fait' ? 'a_faire' : 'fait';
    // DEUX REGISTRES, DEUX PORTES. Une action de réunion vit dans sa table :
    // la cocher ici doit s'adresser à celle-là, sinon on modifie l'échéance
    // légale qui porte par hasard le même numéro.
    const rep = e.origine === 'tache'
      ? await fetch(`/api/reunions/taches/${e.id}`, {
          method: 'PUT',
          headers: { ...authHeaders(), 'Content-Type': 'application/json' },
          body: JSON.stringify({ statut: nouveau }),
        })
      : await fetch(`/api/echeancier/${e.id}`, {
          method: 'PATCH', headers: authHeaders(),
          body: JSON.stringify({ statut: nouveau }),
        });
    if (!rep.ok) {
      const j = await rep.json().catch(() => ({}));
      setMessage({ type: 'err', texte: j.error || 'modification refusée' });
      return;
    }
    await charger();
  }

  async function regenerer() {
    setMessage({ type: 'ok', texte: 'Régénération en cours…' });
    const rep = await fetch('/api/echeancier/instancier', {
      method: 'POST', headers: authHeaders(), body: '{}',
    });
    const j = await rep.json();
    setMessage(rep.ok
      ? { type: 'ok', texte: `${j.crees} échéance(s) ajoutée(s), ${j.en_retard} en retard, ${j.envoyes} rappel(s) émis.` }
      : { type: 'err', texte: j.error });
    await charger();
  }

  const lignes = data?.lignes || [];
  const c = data?.compteurs || {};

  // Regroupement par mois pour la timeline
  const parMois = useMemo(() => {
    const g = new Map();
    for (const l of lignes) {
      const cle = l.date_due.slice(0, 7);
      if (!g.has(cle)) g.set(cle, []);
      g.get(cle).push(l);
    }
    return [...g.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [lignes]);

  /* LE RAIL N'EST PAS UN PANNEAU DE FILTRES — ET C'EST CE QU'IL ÉTAIT DEVENU.
   *
   * Il portait les zones, les trois statuts et jusqu'à HUIT responsables : onze
   * entrées, dont sept partageant `IconChevronRight` faute d'avoir un dessin à
   * elles. Rail replié — c'est-à-dire presque toujours —, cela donnait une
   * colonne de flèches identiques qui ne menaient nulle part de reconnaissable.
   * « Trop d'icônes, personne ne trouve », et c'est exact : une icône répétée
   * sept fois n'est plus une icône, c'est du bruit.
   *
   * La règle de la maison le disait déjà — « une icône se mérite ; ce qui ne
   * tient pas dans une colonne d'icônes va dans une fenêtre, pas dans le
   * menu ». Et surtout : FILTRER N'EST PAS NAVIGUER. Le rail dit où l'on est ;
   * réduire une liste est un geste de l'écran, qui se fait dans sa barre
   * d'outils, avec des menus qui portent des MOTS.
   *
   * Le rail ne garde donc que ce qu'il sait nommer d'un dessin : rien ici. Les
   * trois filtres sont passés en listes déroulantes au-dessus de la liste.
   */
  const sections = [];

  return (
    <div className="relative bg-slate-50" style={{ minHeight: 'calc(100vh - 64px)' }}>
      <RailLateral icon={IconCalendarStats} titre="Échéancier"
        sousTitre={data?.annee} sections={sections} />

      <div className="gouttiere-rail px-3 md:px-6 py-4 space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <PageHeader icon={IconCalendarStats} titre="Échéancier"
            sous="Obligations réglementaires et jalons de l'année — circulaire 9760, décret du 16/04/1991, RGE, statut du 01/02/1993" />
          <div className="flex gap-2">
            <Btn variant="secondary" icon={IconRefresh} onClick={charger}>Actualiser</Btn>
            <Btn variant="accent" icon={IconPlayerPlay} onClick={regenerer}>Régénérer</Btn>
          </div>
        </div>

        {message && (
          <div className={`px-4 py-2.5 rounded-lg text-sm flex items-center justify-between gap-3
            ${message.type === 'ok' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                                    : 'bg-red-50 text-red-800 border border-red-200'}`}>
            <span>{message.texte}</span>
            <button onClick={() => setMessage(null)}><IconX size={15} /></button>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiCard label="En retard"        valeur={c.en_retard ?? 0} ton={c.en_retard ? 'bad' : 'neutral'} />
          <KpiCard label="Dans 7 jours"     valeur={c.semaine ?? 0}   ton={c.semaine ? 'warn' : 'neutral'} />
          <KpiCard label="Dans 30 jours"    valeur={c.mois ?? 0} />
          <KpiCard label="Faites"           valeur={c.faites ?? 0}    ton="good" />
          <KpiCard label="Total de l'année" valeur={c.total ?? 0} />
        </div>

        <Tabs value={tab} onChange={setTab} items={[
          { key: 'timeline',    label: 'Timeline' },
          { key: 'liste',       label: 'Liste' },
          { key: 'mien',        label: 'Mes tâches' },
          { key: 'referentiel', label: 'Référentiel' },
        ]} />

        {/* LES FILTRES, EN MOTS, LÀ OÙ L'ON REGARDE LA LISTE.
            Ils vivaient dans le rail sous forme d'icônes — onze entrées dont
            sept flèches identiques. Trois menus qui se lisent valent mieux que
            onze dessins qu'il faut survoler un à un pour savoir ce qu'ils
            sont. Le compte reste affiché : c'est lui qui dit s'il vaut la
            peine d'ouvrir le filtre. */}
        <div className="flex flex-wrap items-center gap-2">
          <select value={filtres.zone}
            onChange={e => setFiltres(f => ({ ...f, zone: e.target.value }))}
            className="controle text-[13px]">
            <option value="">Toutes les zones ({c.total ?? 0})</option>
            {(data?.zones || []).filter(z => z.zone).map(z => (
              <option key={z.zone} value={z.zone}>
                {ZONES[z.zone] || z.zone} ({z.n})
              </option>
            ))}
          </select>
          <select value={filtres.statut}
            onChange={e => setFiltres(f => ({ ...f, statut: e.target.value }))}
            className="controle text-[13px]">
            <option value="">Tous les statuts</option>
            <option value="en_retard">En retard ({c.en_retard ?? 0})</option>
            <option value="a_faire">À faire</option>
            <option value="fait">Faites ({c.faites ?? 0})</option>
          </select>
          <select value={filtres.responsable}
            onChange={e => setFiltres(f => ({ ...f, responsable: e.target.value }))}
            className="controle text-[13px] max-w-[16rem]">
            {/* LA LISTE N'EST PLUS TRONQUÉE À HUIT. Le rail ne pouvait pas en
                porter davantage ; un menu, si — et le neuvième responsable
                était invisible sans que rien ne le dise. */}
            <option value="">Tous les responsables</option>
            {(data?.responsables || []).map(rp => (
              <option key={rp.nom} value={rp.nom}>{rp.nom} ({rp.n})</option>
            ))}
          </select>
          {(filtres.zone || filtres.statut || filtres.responsable) && (
            <button className="bouton text-[12px] px-2.5 py-1"
              onClick={() => setFiltres(f => ({
                ...f, zone: '', statut: '', responsable: '' }))}>
              Tout afficher
            </button>
          )}
        </div>

        {chargement && <div className="text-slate-400 text-sm py-8 text-center">Chargement…</div>}

        {/* ── TIMELINE ── */}
        {!chargement && tab === 'timeline' && (
          <div className="space-y-5">
            {!parMois.length && (
              <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">
                Aucune échéance. Vérifiez que les dates des UE sont encodées
                (Configuration → Paramétrage annuel → Dates des UE), puis cliquez sur « Régénérer ».
              </div>
            )}
            {parMois.map(([cle, items]) => (
              <div key={cle}>
                <div className="text-[11px] font-bold text-iip-blue uppercase tracking-widest mb-2">
                  {MOIS[Number(cle.slice(5, 7)) - 1]} {cle.slice(0, 4)}
                </div>
                <div className="space-y-1.5">
                  {items.map(e => {
                    const n = resteJours(e.date_due);
                    const bord = e.statut === 'fait' ? 'border-l-emerald-500'
                      : e.statut === 'en_retard' || n < 0 ? 'border-l-red-500'
                      : n <= 7 ? 'border-l-amber-500' : 'border-l-slate-200';
                    return (
                      /* DEUX TABLES, DEUX NUMÉROTATIONS : l'échéance 12 et la
                         tâche 12 existent toutes les deux. Sans préfixe, React
                         les confond et recycle la mauvaise ligne. */
                      <div key={`${e.origine || 'ech'}-${e.id}`}
                        className={`bg-white border border-slate-200 border-l-[3px] ${bord} rounded-lg
                          px-3.5 py-2.5 flex items-center gap-3 ${e.statut === 'fait' ? 'opacity-60' : ''}`}>
                        <div className="text-[13px] font-bold text-iip-blue w-12 flex-none">{jourMois(e.date_due)}</div>
                        <button onClick={() => setDetail(e)} className="flex-1 text-left min-w-0">
                          <div className="text-[13px] font-medium text-slate-800 truncate">
                            {e.libelle}{e.libelle_override ? ` — ${e.libelle_override}` : ''}
                          </div>
                          <div className="text-[11px] text-slate-500 truncate">
                            {ZONES[e.zone] || e.zone}
                            {e.responsable_nom || e.responsable_role ? ` · ${e.responsable_nom || e.responsable_role}` : ''}
                            {e.base_legale ? ` · ${e.base_legale}` : ''}
                          </div>
                        </button>
                        {e.origine === 'tache' && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold flex-none"
                                title={e.reunion_titre ? `Décidé en séance : ${e.reunion_titre}` : 'Action de suivi'}>
                            suivi
                          </span>
                        )}
                        {e.genere_auto === 1 && (
                          <span className="text-[10px] px-1.5 py-0.5 rounded bg-iip-turquoise/12 text-iip-blue font-semibold flex-none">auto</span>
                        )}
                        <Pastille echeance={e} />
                        <button onClick={() => basculer(e)} title={e.statut === 'fait' ? 'Marquer à faire' : 'Marquer fait'}
                          className={`w-[18px] h-[18px] rounded border flex-none flex items-center justify-center
                            ${e.statut === 'fait' ? 'bg-emerald-500 border-emerald-500 text-white'
                                                  : 'border-slate-300 hover:border-iip-turquoise'}`}>
                          {e.statut === 'fait' && <IconCheck size={13} stroke={3} />}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* ── LISTE ── */}
        {!chargement && (tab === 'liste' || tab === 'mien') && (
          <ListeEcheances
            lignes={tab === 'mien' ? lignes.filter(l => l.statut !== 'fait') : lignes}
            onBasculer={basculer} onDetail={setDetail} mien={tab === 'mien'}
          />
        )}

        {/* ── RÉFÉRENTIEL ── */}
        {tab === 'referentiel' && (
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center gap-2">
              <IconBooks size={16} className="text-iip-turquoise" />
              <span className="text-[12px] font-bold text-iip-blue uppercase tracking-wide">
                Référentiel légal des échéances
              </span>
              <span className="text-[11px] text-slate-500 ml-2">
                {types.length} types — modifiable par l'administrateur à la lecture d'une circulaire
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-slate-50/60 border-b border-slate-200 text-[11px] uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 text-left">Échéance</th>
                    <th className="px-3 py-2 text-left w-40">Zone</th>
                    <th className="px-3 py-2 text-left w-52">Règle de date</th>
                    <th className="px-3 py-2 text-left w-28">Responsable</th>
                    <th className="px-3 py-2 text-left w-56">Base légale</th>
                    <th className="px-3 py-2 text-left w-20">Instances</th>
                  </tr>
                </thead>
                <tbody>
                  {types.map(t => (
                    <tr key={t.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50/60">
                      <td className="px-3 py-2">
                        <div className="font-medium text-slate-800">{t.libelle}</div>
                        {t.description && (
                          <div className="text-[11px] text-slate-500 mt-0.5 line-clamp-2 max-w-xl">{t.description}</div>
                        )}
                      </td>
                      <td className="px-3 py-2 text-slate-600">{ZONES[t.zone] || t.zone || '—'}</td>
                      <td className="px-3 py-2">
                        <code className="text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-700">{t.regle_date}</code>
                      </td>
                      <td className="px-3 py-2 text-slate-600">{t.responsable_defaut || '—'}</td>
                      <td className="px-3 py-2 text-[11px] text-slate-500">{t.base_legale || '—'}</td>
                      <td className="px-3 py-2 text-slate-600">{t.nb_instances}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Détail */}
      {detail && (
        <div className="fixed inset-0 bg-[rgba(11,21,45,.32)] backdrop-blur-[3px] flex items-center justify-center z-50 p-4"
             onClick={() => setDetail(null)}>
          <div className="bg-white rounded-xl max-w-xl w-full" onClick={e => e.stopPropagation()}>
            <div className="px-5 py-3.5 border-b border-slate-200 flex items-start justify-between gap-3">
              <div>
                <h3 className="font-semibold text-iip-blue">{detail.libelle}</h3>
                {detail.libelle_override && (
                  <p className="text-sm text-slate-600 mt-0.5">{detail.libelle_override}</p>
                )}
              </div>
              <button onClick={() => setDetail(null)} className="text-slate-400 hover:text-slate-700">
                <IconX size={20} />
              </button>
            </div>
            <div className="p-5 space-y-3 text-sm">
              {detail.description && <p className="text-slate-700 leading-relaxed">{detail.description}</p>}
              <div className="grid grid-cols-2 gap-3 pt-1">
                <Info label="Échéance" valeur={fr(detail.date_due)} />
                <Info label="Statut" valeur={<Pastille echeance={detail} />} />
                <Info label="Zone" valeur={ZONES[detail.zone] || detail.zone || '—'} />
                <Info label="Responsable" valeur={detail.responsable_nom || detail.responsable_role || '—'} />
                {detail.origine === 'tache' && detail.reunion_titre && (
                  <Info label="Décidé en séance" valeur={detail.reunion_titre} />
                )}
                {detail.fait_le && <Info label="Fait le" valeur={`${fr(detail.fait_le)} par ${detail.fait_par}`} />}
              </div>
              {detail.base_legale && (
                <div className="flex items-start gap-2 bg-slate-50 rounded-lg px-3 py-2.5">
                  <IconScale size={15} className="text-iip-turquoise mt-0.5 flex-none" />
                  <span className="text-[12px] text-slate-600">{detail.base_legale}</span>
                </div>
              )}
              <div className="flex gap-2 pt-1">
                <Btn variant={detail.statut === 'fait' ? 'secondary' : 'primary'} icon={IconCheck}
                     onClick={async () => { await basculer(detail); setDetail(null); }}>
                  {detail.statut === 'fait' ? 'Marquer à faire' : 'Marquer fait'}
                </Btn>
                {detail.lien_interne && (
                  <Btn variant="secondary" onClick={() => { window.location.href = detail.lien_interne; }}>
                    Ouvrir la page concernée
                  </Btn>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, valeur }) {
  return (
    <div>
      <div className="text-[10px] text-slate-400 uppercase tracking-wider">{label}</div>
      <div className="text-slate-800 mt-0.5">{valeur}</div>
    </div>
  );
}

function ListeEcheances({ lignes, onBasculer, onDetail, mien }) {
  if (!lignes.length) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center text-slate-500 text-sm">
        {mien ? "Rien à traiter pour vous." : 'Aucune échéance pour ces critères.'}
      </div>
    );
  }
  return (
    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="tab-entete">
              <th className="px-3 py-2 text-left w-24">Date</th>
              <th className="px-3 py-2 text-left">Échéance</th>
              <th className="px-3 py-2 text-left w-40">Zone</th>
              <th className="px-3 py-2 text-left w-32">Responsable</th>
              <th className="px-3 py-2 text-left w-32">Statut</th>
              <th className="px-3 py-2 w-10"></th>
            </tr>
          </thead>
          <tbody>
            {lignes.map(e => (
              <tr key={`${e.origine || 'ech'}-${e.id}`} className={`border-b border-slate-100 last:border-0 hover:bg-slate-50/60
                ${e.statut === 'fait' ? 'opacity-60' : ''}`}>
                <td className="px-3 py-2 font-medium text-iip-blue whitespace-nowrap">{fr(e.date_due)}</td>
                <td className="px-3 py-2">
                  <button onClick={() => onDetail(e)} className="text-left">
                    <div className="text-slate-800">
                      {e.libelle}
                      {e.origine === 'tache' && (
                        <span className="text-[10px] ml-2 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 font-semibold">suivi</span>
                      )}
                    </div>
                    {e.libelle_override && <div className="text-[11px] text-slate-500">{e.libelle_override}</div>}
                  </button>
                </td>
                <td className="px-3 py-2 text-slate-600">{ZONES[e.zone] || e.zone || '—'}</td>
                <td className="px-3 py-2 text-slate-600">{e.responsable_nom || e.responsable_role || '—'}</td>
                <td className="px-3 py-2"><Pastille echeance={e} /></td>
                <td className="px-3 py-2">
                  <button onClick={() => onBasculer(e)}
                    className={`w-[18px] h-[18px] rounded border flex items-center justify-center
                      ${e.statut === 'fait' ? 'bg-emerald-500 border-emerald-500 text-white'
                                            : 'border-slate-300 hover:border-iip-turquoise'}`}>
                    {e.statut === 'fait' && <IconCheck size={13} stroke={3} />}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
