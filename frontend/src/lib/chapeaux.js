import { useEffect, useState } from 'react';
import { authHeaders } from './api.js';

/**
 * LES CHAPEAUX DES ACQUIS.
 *
 * Le dossier pédagogique n'énonce pas ses acquis à plat : une phrase les
 * introduit — la situation, les moyens, les conditions (« face à une situation
 * clinique simulée, en disposant de…, de : ») —, et certains dossiers en ont
 * plusieurs, chacune au-dessus de son groupe. Sans elle, « rédiger un
 * rapport » ne dit ni où, ni avec quoi : c'est pourtant ce que le professeur
 * évalue.
 *
 * Le chapeau est porté par le PREMIER acquis du groupe qu'il ouvre (colonne
 * `aa.chapeau`) ; les suivants en héritent jusqu'au prochain. C'est cette
 * règle, et elle seule, qui dit à quel groupe appartient un acquis — écrite
 * ici une fois pour tous les écrans.
 */
export function chapeauxParAcquis(acquis) {
  const ordre = [...(acquis || [])].sort((a, b) =>
    (a.aa_num ?? 1e9) - (b.aa_num ?? 1e9) || String(a.aa_code).localeCompare(String(b.aa_code)));
  const m = {};
  let courant = null;
  for (const a of ordre) {
    if (a.chapeau) courant = a.chapeau;
    m[a.aa_code] = courant;
  }
  return m;
}

const cache = new Map();   // ue_num → Promise<{ aa_code: chapeau }>

/** Les chapeaux d'une unité, demandés une fois par chargement de page. */
export function chargerChapeaux(ueNum, force = false) {
  if (!ueNum) return Promise.resolve({});
  if (force) cache.delete(ueNum);
  if (!cache.has(ueNum)) {
    cache.set(ueNum, fetch(`/api/aa/ue/${ueNum}`, { headers: authHeaders() })
      .then(r => (r.ok ? r.json() : { acquis: [] }))
      .then(j => chapeauxParAcquis(j.acquis))
      .catch(() => ({})));
  }
  return cache.get(ueNum);
}

export function useChapeaux(ueNum) {
  const [m, setM] = useState({});
  useEffect(() => {
    let ok = true;
    chargerChapeaux(ueNum).then(x => ok && setM(x));
    return () => { ok = false; };
  }, [ueNum]);
  return m;
}
