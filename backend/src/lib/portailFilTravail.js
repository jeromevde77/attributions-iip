/* LE SECOND FIL DU PORTAIL (3.5.704) — voir lib/portailFil.js. Il ouvre sa propre connexion à la base (db/index.js), planifie le
   relevé et les dépôts (planifierPortail) et répond aux gestes que Lucie lui transmet. */
import { parentPort } from 'node:worker_threads';
import { planifierPortail, deposerBientot, ouvrirApercu, ouvrirApercuEnseignant } from './portailSync.js';
import { etatCharge, lancerSonde } from './charge.js';

const GESTES = {
  bientot: () => { deposerBientot(); return true; },
  ouvrirApercu: (id, par) => ouvrirApercu(id, par),
  ouvrirApercuEnseignant: (...a) => ouvrirApercuEnseignant(...a),
  etatCharge: () => etatCharge(),
};

parentPort.on('message', async m => {
  const g = GESTES[m?.nom];
  try {
    if (!g) throw new Error(`Geste inconnu : ${m?.nom}`);
    parentPort.postMessage({ id: m.id, valeur: await g(...(m.args || [])) });
  } catch (e) { parentPort.postMessage({ id: m.id, erreur: e.message }); }
});

lancerSonde();
planifierPortail();
