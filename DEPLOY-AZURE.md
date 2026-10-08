# Sæt appen i drift på Azure (POC)

Appen kører på en lille Linux-server (virtuel maskine) i Azure. Et installationsscript sætter alt op:
Docker, automatisk HTTPS-certifikat (Let's Encrypt via Caddy), automatiske sikkerhedsopdateringer og daglig backup.

> **Hvorfor ikke Azure App Service?** Appen gemmer data i en SQLite-databasefil. Microsoft understøtter ikke
> SQLite på App Service' fil-lager (det er et netværksdrev uden fil-låsning). På en virtuel maskine ligger
> filen på serverens egen disk, og det virker fint.

**Pris:** En ny Azure-konto har 12 måneders gratis forbrug af en lille Linux-server (B2ats v2, 750 timer/md.)
med en 64 GB P6 Premium SSD-disk. Den offentlige IP-adresse koster typisk lidt (ca. 25 kr./md.).
Efter 30 dage skal kontoen opgraderes til *Pay-as-you-go* for at fortsætte – de gratis tjenester gælder stadig i 12 måneder.
Tjek de aktuelle vilkår og priser i Azure, og opret en budget-alarm (trin 7).

## 1. Merge koden til `main`
Merge pull requesten på GitHub. Serveren henter koden fra `main`.

## 2. Opret serveren i Azure-portalen
Gå til [portal.azure.com](https://portal.azure.com) → **Create a resource** → **Virtual machine**, og udfyld:

**Basics**
- **Resource group:** *Create new* → `holteroklub`
- **Virtual machine name:** `holteroklub`
- **Region:** en europæisk region, fx *(Europe) Sweden Central*, *North Europe* eller *West Europe*.
  Vises størrelsen nedenfor ikke, så prøv en anden region.
- **Image:** *Ubuntu Server 24.04 LTS – x64 Gen2*
- **Size:** *Standard_B2ats_v2* (markeret "free services eligible")
- **Authentication type:** *SSH public key*, **Username:** `azureuser`, **Key pair name:** `holteroklub_key`
- **Public inbound ports:** *Allow selected ports* → vælg **SSH (22)**, **HTTP (80)** og **HTTPS (443)**

**Disks**
- **OS disk size:** *64 GiB (P6)*, **OS disk type:** *Premium SSD (LRS)* – det er den størrelse, der er gratis.

**Monitoring**
- **Boot diagnostics:** *Disable* (undgår et ekstra lager-forbrug)

Klik **Review + create** → **Create**, og vælg **Download private key and create resource**.
Gem filen `holteroklub_key.pem` – den er din nøgle til serveren.

Når serveren er oprettet: åbn den og notér **Public IP address** på *Overview*-siden.

## 3. Peg domænet på serveren
Hos den udbyder, hvor domænet er købt (DNS-indstillinger), opret en **A-post**:

| Type | Navn / host | Værdi |
|---|---|---|
| A | `app` | serverens offentlige IP-adresse |

Så bliver adressen fx `app.ditdomæne.dk`. Vil du bruge selve domænet (`ditdomæne.dk`), skal A-posten have navnet `@`.
Det kan tage fra minutter til et par timer, før ændringen slår igennem.

## 4. Log ind på serveren
Åbn **PowerShell** på din pc og gå til mappen med nøglen (typisk Overførsler):
```powershell
cd $HOME\Downloads
icacls holteroklub_key.pem /inheritance:r /grant:r "$($env:USERNAME):R"
ssh -i holteroklub_key.pem azureuser@<IP-ADRESSE>
```
(`icacls`-linjen er kun nødvendig første gang – Windows' ssh nægter at bruge en nøglefil, som andre kan læse.)
Svar `yes` til spørgsmålet om "authenticity of host".

## 5. Installér appen
Når du er logget ind på serveren, kør:
```bash
curl -fsSL https://raw.githubusercontent.com/Refshauge77/TrainingApp/main/deploy/setup.sh | sudo bash
```
Scriptet spørger om:
- **Domæne** – fx `app.ditdomæne.dk` (det fra trin 3)
- **Klubkode** – den kode testpersonerne skal bruge for at oprette sig, fx `padle2026`
- **E-mail** – kontaktadresse til push-tjenesterne

Første gang tager det nogle minutter. Når DNS peger på serveren, henter Caddy selv et HTTPS-certifikat.

## 6. Opret dig selv som administrator – før du deler adressen
Åbn `https://app.ditdomæne.dk`, vælg **Opret bruger** og brug klubkoden. Den første bruger bliver administrator.
Giv trænerne rollen **Træner** under *Klubben*. Databasen starter tom – der er ingen testdata.

Send derefter adressen og klubkoden til testpersonerne, og bed dem lægge appen på hjemmeskærmen
og slå notifikationer til (se README).

## 7. Sæt en budget-alarm
Azure-portalen → **Cost Management** → **Budgets** → **Add**: fx 50 kr./md. med e-mail-alarm ved 80 %.
Så opdager du det med det samme, hvis noget koster mere end forventet.

## Drift

| Opgave | Kommando (på serveren) |
|---|---|
| Opdatér til nyeste version fra `main` | `sudo /opt/holteroklub/deploy/update.sh` |
| Se om appen kører | `cd /opt/holteroklub/deploy && sudo docker compose ps` |
| Se appens log | `cd /opt/holteroklub/deploy && sudo docker compose logs --tail 100 app` |
| Genstart | `cd /opt/holteroklub/deploy && sudo docker compose restart` |
| Ændr klubkode m.m. | `sudo nano /opt/holteroklub/deploy/.env` og derefter `sudo docker compose up -d` (i samme mappe) |

**Backup:** Hver nat kl. 03.30 gemmes en kopi af databasen i `/opt/holteroklub/deploy/backups` (de seneste 14).
Der tages også en kopi før hver opdatering. Kopierne ligger på samme server, så hent jævnligt en kopi hjem til din pc:
```powershell
scp -i holteroklub_key.pem "azureuser@<IP-ADRESSE>:/opt/holteroklub/deploy/backups/*" .
```

**Lukke POC'en ned:** Slet ressourcegruppen `holteroklub` i Azure-portalen (det sletter server, disk og IP-adresse)
og fjern A-posten hos domæneudbyderen.
