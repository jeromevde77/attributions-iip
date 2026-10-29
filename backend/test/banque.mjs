/* Banc d'essai des extraits de compte (3.1.444) : communication structurée, CODA, CAMT.053.
   Fonctions pures, aucune base. */
import { communicationStructuree, lireCommunication, chercherCommunication, lireExtrait, ibanValide, chargeEpc, qrSvg } from '../src/lib/banque.js';

let ok = 0, faux = 0;
const voir = (nom, cond) => { if (cond) ok++; else { faux++; console.log('FAUX :', nom); } };

// Communication structurée : 10 chiffres + contrôle modulo 97.
const c = communicationStructuree(123, '2026-2027');
voir('forme +++ddd/dddd/ddddd+++', /^\+\+\+\d{3}\/\d{4}\/\d{5}\+\+\+$/.test(c));
const ch = c.replace(/\D/g, '');
voir('contrôle modulo 97', ((Number(BigInt(ch.slice(0, 10)) % 97n)) || 97) === Number(ch.slice(10)));
voir('se relit', JSON.stringify(lireCommunication(c)) === JSON.stringify({ etudiant_id: 123, annee: '2026-2027', communication: c }));
voir('chiffre faux refusé', lireCommunication(ch.slice(0, 11) + ((Number(ch[11]) + 1) % 10)) === null);
voir('trouvée dans un texte libre', chercherCommunication(`Frais DUPONT ${ch} merci`)?.etudiant_id === 123);
voir('trouvée avec ses barres', chercherCommunication(`com ${c.replace(/\+/g, '')}`)?.etudiant_id === 123);
voir('reste 0 → 97', (() => { for (let i = 1; i < 2000; i++) { const x = communicationStructuree(i, '2026-2027'); if (x.replace(/\D/g, '').slice(10) === '97') return lireCommunication(x)?.etudiant_id === i; } return true; })());
voir('id invalide', communicationStructuree(0, '2026-2027') === null);

// IBAN.
voir('IBAN belge valide', ibanValide('be68539007547034') === 'BE68 5390 0754 7034');
voir('IBAN faux', ibanValide('BE68539007547035') === null);

// CODA : une ligne de 128 caractères par enregistrement, positions de la norme.
const champ = (s, n) => String(s).padEnd(n, ' ').slice(0, n);
const z = (s, n) => String(s).padStart(n, '0');
function r21({ seq, ref, signe, cents, comm, structuree }) {
  let l = '21' + z(seq, 4) + '0000' + champ(ref, 21) + signe + z(cents * 10, 15) + '291026' + '00150000'
    + (structuree ? '1' : '0') + champ(structuree ? '101' + comm : comm, 53) + '291026' + '001' + '0' + '1' + ' ' + '0';
  return champ(l, 128);
}
const r23 = (seq, compte, nom) => champ('23' + z(seq, 4) + '0000' + champ(compte, 37) + champ(nom, 35), 128);
const coda = [
  champ('0000029102672505        00000000IIP                       BBRUBEBB   00000000000 00000                                       2', 128),
  champ('12001 BE68539007547034                  EUR0000000010000000281026INSTITUT ILYA PRIGOGINE                           001', 128),
  r21({ seq: 1, ref: 'REF0001', signe: '0', cents: 15000, comm: ch, structuree: true }), r23(1, 'BE71096123456769', 'DUPONT JEAN'),
  r21({ seq: 2, ref: 'REF0002', signe: '0', cents: 2500, comm: 'frais inscription Marie Martin', structuree: false }), r23(2, 'BE71096123456769', 'MARTIN MARIE'),
  r21({ seq: 3, ref: 'REF0003', signe: '1', cents: 9999, comm: 'loyer', structuree: false }),
  champ('8001BE68539007547034                  EUR0000000010000000291026', 128),
  champ('9               000008000000000099990000000000165000                                                                           2', 128),
].join('\r\n');
const lc = lireExtrait(coda);
voir('CODA reconnu', lc.format === 'CODA');
voir('CODA 3 mouvements', lc.mouvements.length === 3);
voir('CODA montant', lc.mouvements[0].montant === 150);
voir('CODA communication structurée', lc.mouvements[0].structuree && lireCommunication(lc.mouvements[0].communication)?.etudiant_id === 123);
voir('CODA donneur d’ordre', lc.mouvements[0].nom === 'DUPONT JEAN' && lc.mouvements[0].compte_tiers === 'BE71096123456769');
voir('CODA date', lc.mouvements[0].date === '2026-10-29');
voir('CODA texte libre', lc.mouvements[1].communication === 'frais inscription Marie Martin' && lc.mouvements[1].montant === 25);
voir('CODA débit négatif', lc.mouvements[2].montant === -99.99);
voir('CODA références distinctes', new Set(lc.mouvements.map(m => m.ref)).size === 3);

// CAMT.053.
const camt = `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:camt.053.001.02"><BkToCstmrStmt><Stmt>
<Acct><Id><IBAN>BE68539007547034</IBAN></Id></Acct>
<Ntry><Amt Ccy="EUR">150.00</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-10-29</Dt></BookgDt><AcctSvcrRef>A1</AcctSvcrRef>
<NtryDtls><TxDtls><RltdPties><Dbtr><Nm>Jean Dupont</Nm></Dbtr><DbtrAcct><Id><IBAN>BE71096123456769</IBAN></Id></DbtrAcct></RltdPties>
<RmtInf><Strd><CdtrRefInf><Tp><CdOrPrtry><Cd>SCOR</Cd></CdOrPrtry><Issr>BBA</Issr></Tp><Ref>${ch}</Ref></CdtrRefInf></Strd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">40.5</Amt><CdtDbtInd>CRDT</CdtDbtInd><BookgDt><Dt>2026-10-28</Dt></BookgDt><AcctSvcrRef>A2</AcctSvcrRef>
<NtryDtls><TxDtls><RmtInf><Ustrd>Paiement ${c}</Ustrd></RmtInf></TxDtls></NtryDtls></Ntry>
<Ntry><Amt Ccy="EUR">12.00</Amt><CdtDbtInd>DBIT</CdtDbtInd><BookgDt><Dt>2026-10-28</Dt></BookgDt><AcctSvcrRef>A3</AcctSvcrRef></Ntry>
</Stmt></BkToCstmrStmt></Document>`;
const lx = lireExtrait(camt);
voir('CAMT reconnu', lx.format === 'CAMT.053');
voir('CAMT 3 mouvements', lx.mouvements.length === 3);
voir('CAMT structurée', lx.mouvements[0].structuree && lireCommunication(lx.mouvements[0].communication)?.etudiant_id === 123);
voir('CAMT nom', lx.mouvements[0].nom === 'Jean Dupont');
voir('CAMT texte libre', chercherCommunication(lx.mouvements[1].communication)?.etudiant_id === 123 && lx.mouvements[1].montant === 40.5);
voir('CAMT débit', lx.mouvements[2].montant === -12);
voir('CAMT compte', lx.mouvements[0].compte === 'BE68539007547034');
voir('autre fichier refusé', lireExtrait('nom;montant\nx;1').format === null);

// QR code de paiement (EPC).
const epc = chargeEpc({ iban: 'BE68 5390 0754 7034', beneficiaire: 'Institut Ilya Prigogine', montant: 184, communication: c });
voir('EPC lignes', epc.split('\n').length === 11 && epc.startsWith('BCD\n002\n1\nSCT\n\n'));
voir('EPC IBAN sans espaces', epc.includes('\nBE68539007547034\n'));
voir('EPC montant', epc.includes('\nEUR184.00\n'));
voir('EPC communication relue', chercherCommunication(epc)?.etudiant_id === 123);
voir('EPC sans IBAN valide', chargeEpc({ iban: 'BE00', communication: c }) === null);
voir('EPC ≤ 331 octets', Buffer.byteLength(epc) <= 331);
const svg = await qrSvg(epc, 100);
voir('QR en SVG', svg.startsWith('<svg') && svg.includes('<path d="M'));

console.log(`${ok} ok, ${faux} faux`);
process.exit(faux ? 1 : 0);
