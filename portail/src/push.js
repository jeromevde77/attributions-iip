/* (CS) LES NOTIFICATIONS SUR LE TÉLÉPHONE, DERRIÈRE LE MUR (3.5.768, Charles : « une app Lucie pour avoir les notifs sur
   iPhone » ; tranché : pour tous). Le portail garde les abonnements des téléphones des étudiants et des professeurs, ses
   propres clés (VAPID) et envoie ; Lucie ne fait que lui DÉPOSER quoi annoncer et à qui (POST /interne/push), comme le reste.
   L'envoi suit les RFC 8292 (VAPID) et 8291 (aes128gcm), écrit avec le seul `crypto` — le même que celui de Lucie. */
import crypto from 'crypto';

const b64u = buf => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deB64u = s => Buffer.from(String(s).replace(/-/g, '+').replace(/_/g, '/'), 'base64');
const hmac = (cle, data) => crypto.createHmac('sha256', cle).update(data).digest();

export function monterPush({ db, int }) {
  db.exec(`CREATE TABLE IF NOT EXISTS push_cle (id INTEGER PRIMARY KEY CHECK (id = 1), valeur TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS push_abonnement (id INTEGER PRIMARY KEY AUTOINCREMENT, espace TEXT NOT NULL, personne INTEGER NOT NULL,
      endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, appareil TEXT,
      cree_le TEXT DEFAULT (datetime('now')), dernier_le TEXT, echecs INTEGER DEFAULT 0);`);

  function cles() {
    const l = db.prepare('SELECT valeur FROM push_cle WHERE id = 1').get();
    if (l) return JSON.parse(l.valeur);
    const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'prime256v1' });
    const pub = publicKey.export({ format: 'jwk' });
    const k = { public: b64u(Buffer.concat([Buffer.from([4]), deB64u(pub.x), deB64u(pub.y)])), prive: privateKey.export({ format: 'jwk' }) };
    db.prepare('INSERT INTO push_cle (id, valeur) VALUES (1, ?)').run(JSON.stringify(k));
    return k;
  }
  function jeton(endpoint, k) {
    const e = b64u(JSON.stringify({ typ: 'JWT', alg: 'ES256' }));
    const c = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600,
      sub: process.env.LUCIE_PUSH_SUJET || 'mailto:secretariat@institut-prigogine.be' }));
    const sig = crypto.sign('sha256', Buffer.from(`${e}.${c}`), { key: crypto.createPrivateKey({ key: k.prive, format: 'jwk' }), dsaEncoding: 'ieee-p1363' });
    return `${e}.${c}.${b64u(sig)}`;
  }
  function chiffrer(a, texte) {
    const uaPublic = deB64u(a.p256dh), auth = deB64u(a.auth);
    const ecdh = crypto.createECDH('prime256v1'); const asPublic = ecdh.generateKeys();
    const prkKey = hmac(auth, ecdh.computeSecret(uaPublic));
    const ikm = hmac(prkKey, Buffer.concat([Buffer.from('WebPush: info\0'), uaPublic, asPublic, Buffer.from([1])]));
    const sel = crypto.randomBytes(16); const prk = hmac(sel, ikm);
    const cek = hmac(prk, Buffer.from('Content-Encoding: aes128gcm\0\x01')).subarray(0, 16);
    const nonce = hmac(prk, Buffer.from('Content-Encoding: nonce\0\x01')).subarray(0, 12);
    const ch = crypto.createCipheriv('aes-128-gcm', cek, nonce);
    const corps = Buffer.concat([ch.update(Buffer.concat([Buffer.from(texte, 'utf8'), Buffer.from([2])])), ch.final(), ch.getAuthTag()]);
    const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
    return Buffer.concat([sel, rs, Buffer.from([asPublic.length]), asPublic, corps]);
  }
  async function envoyer(espace, personne, message) {
    const k = cles(); let n = 0;
    for (const a of db.prepare('SELECT * FROM push_abonnement WHERE espace = ? AND personne = ?').all(espace, personne)) {
      try {
        const r = await fetch(a.endpoint, { method: 'POST', body: chiffrer(a, JSON.stringify(message)), signal: AbortSignal.timeout(15000),
          headers: { Authorization: `vapid t=${jeton(a.endpoint, k)}, k=${k.public}`, 'Content-Encoding': 'aes128gcm',
            'Content-Type': 'application/octet-stream', TTL: '86400', Urgency: 'normal' } });
        if (r.status >= 200 && r.status < 300) { n++; db.prepare("UPDATE push_abonnement SET dernier_le = datetime('now'), echecs = 0 WHERE id = ?").run(a.id); }
        else if (r.status === 404 || r.status === 410) db.prepare('DELETE FROM push_abonnement WHERE id = ?').run(a.id);
        else db.prepare('UPDATE push_abonnement SET echecs = echecs + 1 WHERE id = ?').run(a.id);
      } catch (e) { console.error('[push]', e.message); }
    }
    return n;
  }

  /** Les portes d'un espace : clé, s'abonner, se désabonner, essai. `personneDe(req)` = l'étudiant ou le professeur connecté. */
  function routes(pub, prefixe, connecte, espace, personneDe) {
    pub.get(`${prefixe}/push/cle`, connecte, (req, res) => res.json({ cle: cles().public }));
    pub.post(`${prefixe}/push/abonner`, connecte, (req, res) => {
      if (req.apercu) return res.status(403).json({ error: 'Aperçu : rien ne s’enregistre.' });
      const ab = req.body?.abonnement;
      if (!ab?.endpoint || !/^https:\/\//.test(ab.endpoint) || !ab?.keys?.p256dh || !ab?.keys?.auth) return res.status(400).json({ error: 'Abonnement incomplet.' });
      db.prepare(`INSERT INTO push_abonnement (espace, personne, endpoint, p256dh, auth, appareil) VALUES (?,?,?,?,?,?)
        ON CONFLICT(endpoint) DO UPDATE SET espace = excluded.espace, personne = excluded.personne, p256dh = excluded.p256dh,
          auth = excluded.auth, appareil = excluded.appareil, echecs = 0`)
        .run(espace, personneDe(req), ab.endpoint, ab.keys.p256dh, ab.keys.auth, String(req.body?.appareil || '').slice(0, 200));
      res.json({ ok: true });
    });
    pub.post(`${prefixe}/push/desabonner`, connecte, (req, res) => {
      const n = db.prepare('DELETE FROM push_abonnement WHERE espace = ? AND personne = ? AND endpoint = ?').run(espace, personneDe(req), String(req.body?.endpoint || '')).changes;
      res.json({ ok: true, retires: n });
    });
    pub.post(`${prefixe}/push/essai`, connecte, async (req, res) => {
      if (req.apercu) return res.status(403).json({ error: 'Aperçu : rien ne part.' });
      const n = await envoyer(espace, personneDe(req), { titre: 'Lucie', corps: 'Les notifications arrivent bien sur ce téléphone.', lien: '/', tag: 'essai' });
      res.json({ ok: n > 0, telephones: n });
    });
  }

  // Lucie dépose : [{ espace: 'etu'|'ens', personne, titre, corps, lien, tag }].
  int.post('/interne/push', async (req, res) => {
    const l = Array.isArray(req.body?.envois) ? req.body.envois.slice(0, 500) : [];
    let n = 0;
    for (const x of l) {
      if (!['etu', 'ens'].includes(x.espace) || !Number(x.personne)) continue;
      n += await envoyer(x.espace, Number(x.personne), { titre: String(x.titre || 'Lucie').slice(0, 120),
        corps: String(x.corps || '').slice(0, 240), lien: String(x.lien || '/').slice(0, 200), tag: x.tag ? String(x.tag).slice(0, 60) : undefined });
    }
    res.json({ ok: true, telephones: n });
  });
  int.get('/interne/push/abonnes', (req, res) => res.json(db.prepare('SELECT DISTINCT espace, personne FROM push_abonnement').all()));

  return { routes };
}
