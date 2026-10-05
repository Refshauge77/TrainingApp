# Kajakklubben

En app til planlægning og kommunikation i kajakklubben – som erstatning for de lange WhatsApp-tråde.

| Kalender | Træningspas med program | Chat-tråd |
|---|---|---|
| <img src="docs/kalender.png" width="240"> | <img src="docs/traening.png" width="240"> | <img src="docs/chat.png" width="240"> |

## Funktioner

**Kalender**
- Overblik over alle træninger, løb, sociale arrangementer og øvrige aftaler – som liste eller månedsvisning.
- Filtrér på type eller "Mine tilmeldinger".
- Hver træning har et **program** med punkter (fx opvarmning, hovedsæt, nedpadling), detaljer og varighed. Der er en skabelon at starte fra.
- **Tilmeld / frameld** direkte fra listen eller på aftalen, evt. med en kommentar ("kommer 10 min senere").
- Se hvem der er tilmeldt, frameldt og hvem der ikke har svaret.
- Max. antal deltagere (fx bådpladser) – tilmelding lukker, når der er fuldt.
- **Gentagelser**: opret fx tirsdagstræningen for de næste 10 uger på én gang. Ændringer af titel, program mv. kan rulles ud til resten af serien.
- Aftaler kan aflyses (bliver stående med "AFLYST"), kopieres eller slettes.

**Chat**
- Tråde om emner – fx samkørsel, udstyr, sommerturen – i WhatsApp-stil med bobler, svar på en bestemt besked og sletning af egne beskeder.
- Hver aftale i kalenderen har automatisk sin egen tråd, så snakken om en træning holdes samlet.
- Ulæste beskeder vises med tæller, og nye beskeder dukker op med det samme (live).

**Medlemmer og roller**
- **Administrator**: alt, inkl. at tildele roller. Den første bruger, der oprettes, bliver administrator.
- **Træner**: opretter og redigerer træninger og løb (og alle andre aftaler).
- **Medlem**: tilmelder sig, chatter og kan oprette sociale/øvrige aftaler og redigere sine egne.
- Nye medlemmer opretter sig selv med en **klubkode**, så fremmede ikke kan komme ind.

Appen er en web-app, der virker på mobil og computer. På telefonen kan den lægges på hjemmeskærmen ("Føj til hjemmeskærm"), så den åbner som en almindelig app.

## Kom i gang lokalt

Kræver [Node.js](https://nodejs.org) 22.13 eller nyere.

```sh
npm install
npm run seed     # valgfrit: demo-data (log ind som tina@example.com / kajak1234)
npm run dev      # server på :3000 og frontend med hot reload på http://localhost:5173
```

Test: `npm test`

## Drift

```sh
npm install
npm run build
CLUB_INVITE_CODE=hemmelig-klubkode PORT=3000 npm start
```

Appen er én Node-proces med en SQLite-database (filen `data/kajakklub.db`), så den kan køre på en lille server eller en hosting-tjeneste med en vedvarende disk (fx Fly.io, Railway, Render eller en Raspberry Pi i klubhuset). Den skal køre bag HTTPS, da login-cookien kun sendes over en sikker forbindelse i produktion.

| Miljøvariabel | Betydning |
|---|---|
| `CLUB_INVITE_CODE` | Klubkoden nye medlemmer skal bruge for at oprette sig. Uden den kan alle oprette en bruger. |
| `PORT` | Port (standard `3000`). |
| `DATABASE_FILE` | Placering af databasen (standard `data/kajakklub.db`). Tag backup af denne fil. |
| `INSECURE_COOKIES=1` | Kun til test uden HTTPS. |

## Teknik

- `server/` – Express-API med indbygget SQLite (`node:sqlite`), cookie-baseret login (scrypt-hashede adgangskoder) og Server-Sent Events til live-opdateringer.
- `client/` – React-app bygget med Vite, mobile-first, lys/mørk tilstand og PWA-manifest.
- `server/test/` – API-tests (`node --test`).

## Idéer til næste skridt

- Push-notifikationer ved nye beskeder og ændrede/aflyste træninger.
- Kalender-abonnement (iCal), så træningerne kan ses i telefonens egen kalender.
- Billeder i chatten.
- Hold/grupper (fx ungdom, motion, elite) med egne træninger og tråde.
- Glemt adgangskode via e-mail.
