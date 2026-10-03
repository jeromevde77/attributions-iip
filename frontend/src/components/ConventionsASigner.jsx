import { useCallback, useEffect, useState } from 'react';
import { IconSignature, IconFileText } from '@tabler/icons-react';
import { authHeaders } from '../lib/api.js';
import { frDate, nomEcran, ouvrirConvention } from './ConventionStage.jsx';

/**
 * À SIGNER — les conventions que la coordination ou le secrétariat a
 * préparées, et qui n'attendent plus que la griffe (Charles, 3 octobre 2026 :
 * « un clic sur une case vaudrait mon accord »).
 *
 * Le bloc ne paraît QUE pour le signataire de l'établissement : le serveur
 * rend une liste vide à tout autre compte, direction adjointe comprise —
 * la griffe engage une personne, pas un rôle. Pas de window.confirm : la
 * phrase qui dit ce que le clic engage est écrite dans la page, sous la liste,
 * au même endroit que le bouton.
 */
export default function ConventionsASigner() {
  const [liste, setListe] = useState([]);
  const [coches, setCoches] = useState(() => new Set());
  const [enCours, setEnCours] = useState(false);
  const [message, setMessage] = useState(null);
  const [directeur, setDirecteur] = useState('');

  const charger = useCallback(() => {
    fetch('/api/conventions/a-signer', { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : null))
      .then(j => {
        const l = j?.signataire && Array.isArray(j.conventions) ? j.conventions : [];
        setListe(l);
        setDirecteur(j?.directeur || '');
        setCoches(c => new Set([...c].filter(id => l.some(x => x.id === id))));
      })
      .catch(() => {});
  }, []);
  useEffect(() => { charger(); }, [charger]);

  if (!liste.length && !message) return null;

  const tout = liste.length > 0 && coches.size === liste.length;
  const basculer = id => setCoches(c => { const n = new Set(c); n.has(id) ? n.delete(id) : n.add(id); return n; });

  async function signer() {
    setEnCours(true); setMessage(null);
    const rep = await fetch('/api/conventions/signer', {
      method: 'POST', headers: authHeaders(), body: JSON.stringify({ ids: [...coches] }),
    });
    const j = await rep.json().catch(() => ({}));
    setEnCours(false);
    if (!rep.ok) { setMessage({ ok: false, texte: j.error || 'Signature refusée.' }); return; }
    setMessage({ ok: true, texte: `${j.signees} convention${j.signees > 1 ? 's' : ''} signée${j.signees > 1 ? 's' : ''} — `
      + 'le fac-similé protégé est apposé, la date de convention est portée aux stages qui n\u2019en avaient pas encore.' });
    setCoches(new Set());
    charger();
  }

  async function apercu(id) {
    const err = await ouvrirConvention(id, 'original');
    if (err) setMessage({ ok: false, texte: err });
  }

  const n = coches.size;
  return (
    <div className="mb-5">
      <div className="flex items-baseline gap-2 mb-1.5">
        <h2 className="text-[13px] font-semibold text-iip-blue">À signer</h2>
        <span className="text-[11px] text-slate-400">
          {liste.length ? `${liste.length} convention${liste.length > 1 ? 's' : ''} préparée${liste.length > 1 ? 's' : ''} — votre accord est attendu` : ''}
        </span>
      </div>

      {liste.length > 0 && (
        <div className="carte overflow-hidden">
          <label className="tab-entete flex items-center gap-3 px-3 py-1.5 text-[11px] text-slate-500 cursor-pointer">
            <input type="checkbox" checked={tout}
              onChange={() => setCoches(tout ? new Set() : new Set(liste.map(c => c.id)))} />
            <span>Tout cocher</span>
          </label>
          {liste.map(c => (
            <div key={c.id} className="flex items-center gap-3 px-3 py-2 border-t border-slate-100 hover:bg-slate-100">
              <input type="checkbox" checked={coches.has(c.id)} onChange={() => basculer(c.id)}
                aria-label={`Signer la convention ${c.id}`} />
              <button type="button" onClick={() => basculer(c.id)} className="flex-1 min-w-0 text-left">
                <div className="text-[13px] text-slate-800 truncate">
                  <span className="font-semibold">{c.etud_nom ? nomEcran(c.etud_nom, c.etud_prenom)
                    : (c.origine === 'iip' && c.famille !== 'partenaire' ? `${({ cadre_stage: 'Convention-cadre de stage', partenariat: 'Convention de partenariat', etablissements: 'Convention entre établissements' })[c.famille] || 'Convention'} (modèle IIP)` : (c.objet || 'Convention'))}</span>
                  {c.lieu_nom ? <> · {c.lieu_nom}{c.lieu_localite ? ` (${c.lieu_localite})` : ''}</>
                    : c.partenaire_nom ? <> · {c.partenaire_nom}</> : null}
                </div>
                <div className="text-[11px] text-slate-400 truncate">
                  {[c.date_debut && `${frDate(c.date_debut)} → ${frDate(c.date_fin)}`,
                    c.section, c.annee_scolaire,
                    `déposée par ${c.depose_par_nom || '—'} le ${frDate(c.depose_le)}`].filter(Boolean).join(' · ')}
                </div>
              </button>
              <button type="button" className="text-[12px] text-iip-blue font-semibold flex items-center gap-1 flex-none"
                onClick={() => apercu(c.id)} title={c.fichier_nom}>
                <IconFileText size={14} /> Aperçu
              </button>
            </div>
          ))}
          <div className="flex items-center gap-3 px-3 py-2.5 border-t border-slate-200">
            <p className="flex-1 min-w-0 text-[12px] text-slate-600">
              {n
                ? <>Signer apposera votre fac-similé protégé{directeur ? ` (${directeur})` : ''} en bas de la dernière page
                    de {n > 1 ? `ces ${n} conventions` : 'cette convention'}, et enregistrera votre accord en votre nom,
                    daté d'aujourd'hui. L'original reçu reste conservé tel quel.</>
                : 'Cochez les conventions que vous approuvez — ouvrez l’aperçu au besoin.'}
            </p>
            <button type="button" className="bouton bouton-fort flex-none" disabled={!n || enCours} onClick={signer}>
              <IconSignature size={15} />
              {enCours ? 'Signature…' : (n > 1 ? `Signer les ${n} conventions cochées` : n ? 'Signer la convention cochée' : 'Signer')}
            </button>
          </div>
        </div>
      )}

      {message && (
        <div className={`mt-1.5 text-[12px] ${message.ok ? 'text-emerald-700' : 'text-red-700'}`}>{message.texte}</div>
      )}
    </div>
  );
}
