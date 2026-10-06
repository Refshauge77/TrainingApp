# Sæt appen i drift (POC)

Denne guide sætter appen op hos [Render](https://render.com) med jeres eget domæne, fx `kajak.ditdomæne.dk`.
Render henter koden direkte fra GitHub, bygger den og giver gratis HTTPS-certifikat. Der skal ikke installeres noget på din computer.

Appen gemmer alt i én SQLite-databasefil, så den skal have en **vedvarende disk** – ellers forsvinder alle data ved hver genstart.
Derfor bruges Renders betalte "Starter"-instans (ca. 7 USD/md.) + 1 GB disk (ca. 0,25 USD/md.). Tjek de aktuelle priser hos Render.

## 1. Merge koden til `main`
Render bygger fra `main`-branchen. Merge pull requesten på GitHub (knappen **Merge pull request**).

## 2. Opret tjenesten hos Render
1. Opret en konto på render.com (log gerne ind med GitHub).
2. Vælg **New → Blueprint**, giv Render adgang til repoet `TrainingApp`, og vælg det.
3. Render læser `render.yaml` og viser en webtjeneste `kajakklub` med en disk. Udfyld:
   - **CLUB_INVITE_CODE** – klubkoden testpersonerne skal bruge for at oprette sig, fx `padle2026`. Den kræves også af den første bruger.
   - **VAPID_SUBJECT** – en kontaktadresse til push-tjenesterne, fx `mailto:dig@ditdomæne.dk`.
4. Klik **Apply**. Første build tager et par minutter. Når status er **Live**, kan appen åbnes på adressen `https://kajakklub-xxxx.onrender.com`.

## 3. Opret dig selv som administrator – før du deler adressen
Åbn adressen, vælg **Opret bruger** og brug klubkoden. Den første bruger bliver administrator.
Giv derefter trænerne rollen **Træner** under *Klubben*.

Databasen starter tom – der er ingen testdata i drift (`npm run seed` køres kun lokalt).

## 4. Brug jeres eget domæne
1. I Render: åbn tjenesten → **Settings → Custom Domains → Add**, og skriv fx `kajak.ditdomæne.dk`.
2. Hos den udbyder, hvor domænet er købt (DNS-indstillinger): opret en **CNAME**-post
   - Navn/host: `kajak`
   - Peger på: `kajakklub-xxxx.onrender.com` (den adresse Render viser)
3. Vent på, at Render viser domænet som **Verified** og har udstedt certifikat (typisk minutter, op til et par timer).

Brug et underdomæne som `kajak.` – så påvirkes jeres eksisterende hjemmeside og e-mail ikke.

## 5. Invitér testpersonerne
Send dem adressen og klubkoden, og bed dem:
- oprette en bruger og lægge appen på hjemmeskærmen (iPhone: Safari → Del → *Føj til hjemmeskærm*; Android: Chrome → ⋮ → *Installer app*),
- slå notifikationer til under *Klubben → Notifikationer*.

Glemmer nogen sin adgangskode, kan en administrator give dem en ny under *Klubben* (**Ny kode**).

## Godt at vide
- **Opdateringer:** Hver gang der merges til `main`, bygger og genstarter Render automatisk (ca. et minuts nedetid).
- **Backup:** Render tager løbende snapshots af disken (se *Disks* i tjenesten). Vil du selv have en kopi, kan databasefilen hentes via Render Shell.
- **Skift klubkode:** Ret `CLUB_INVITE_CODE` under *Environment* – appen genstarter med den nye kode.
- **Lukke POC'en ned:** Slet tjenesten i Render (det sletter også disken og alle data) og fjern CNAME-posten.
