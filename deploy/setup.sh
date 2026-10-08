#!/usr/bin/env bash
# Sets up a fresh Ubuntu server (e.g. an Azure VM) to run the club app with HTTPS.
# Run on the server:
#   curl -fsSL https://raw.githubusercontent.com/Refshauge77/TrainingApp/main/deploy/setup.sh | sudo bash
set -euo pipefail

REPO="${REPO:-https://github.com/Refshauge77/TrainingApp.git}"
BRANCH="${BRANCH:-main}"
DIR=/opt/holteroklub

if [ "$(id -u)" -ne 0 ]; then echo "Kør scriptet med sudo"; exit 1; fi

echo "==> Installerer Docker, git og automatiske sikkerhedsopdateringer"
export DEBIAN_FRONTEND=noninteractive
apt-get update -q
apt-get install -y -q docker.io docker-compose-v2 git unattended-upgrades
systemctl enable --now docker
dpkg-reconfigure -f noninteractive unattended-upgrades

# Small servers (1 GB RAM) need swap to build the app.
if ! swapon --show | grep -q .; then
  echo "==> Opretter 2 GB swap"
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Henter appen ($BRANCH)"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" fetch -q origin "$BRANCH" && git -C "$DIR" checkout -q "$BRANCH" && git -C "$DIR" reset -q --hard "origin/$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO" "$DIR"
fi
cd "$DIR/deploy"

if [ ! -f .env ]; then
  echo "==> Indstillinger (kan ændres senere i $DIR/deploy/.env)"
  read -rp "Domæne til appen (fx app.ditdomæne.dk): " DOMAIN </dev/tty
  read -rp "Klubkode som medlemmer skal bruge for at oprette sig: " INVITE </dev/tty
  read -rp "Din e-mail (kontakt til push-tjenester): " EMAIL </dev/tty
  cat > .env <<ENV
DOMAIN=$DOMAIN
CLUB_INVITE_CODE=$INVITE
VAPID_SUBJECT=mailto:$EMAIL
CLUB_TIMEZONE=Europe/Copenhagen
ENV
  chmod 600 .env
fi

# The app runs as the unprivileged "node" user (uid 1000) inside the container.
mkdir -p data backups && chown 1000:1000 data backups

echo "==> Bygger og starter appen (første gang tager nogle minutter)"
docker compose up -d --build

echo "==> Daglig backup kl. 03.30 (de seneste 14 gemmes i $DIR/deploy/backups)"
cat > /etc/cron.d/holteroklub-backup <<CRON
30 3 * * * root cd $DIR/deploy && docker compose exec -T app node --disable-warning=ExperimentalWarning server/backup.js /backups 14 >> /var/log/holteroklub-backup.log 2>&1
CRON

. ./.env
echo
echo "Færdig! Appen svarer på https://$DOMAIN, når DNS peger på denne server."
echo "Opdatér senere med: sudo $DIR/deploy/update.sh"
