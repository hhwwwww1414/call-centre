#!/usr/bin/env bash
# Первичная настройка VPS (ТЗ 8.3). Запускается от root ОДИН раз.
#
#   SSH_PUBKEY="ssh-ed25519 AAAA..." ./harden-vps.sh
#
# Что делает: пользователь deploy с SSH-ключом, запрет входа root и по паролю,
# ufw (22/80/443), fail2ban, Docker, nginx, certbot, logrotate.
set -Eeuo pipefail

log() { printf '\033[0;32m[harden]\033[0m %s\n' "$*"; }
die() { printf '\033[0;31m[harden]\033[0m %s\n' "$*" >&2; exit 1; }

[[ "$EUID" -eq 0 ]] || die 'Запускайте от root'
[[ -n "${SSH_PUBKEY:-}" ]] || die 'Задайте SSH_PUBKEY — иначе после запрета пароля вы потеряете доступ'

DEPLOY_USER="${DEPLOY_USER:-deploy}"

log 'Обновляем пакеты'
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get upgrade -y -qq

log 'Ставим базовые пакеты'
apt-get install -y -qq \
  ca-certificates curl gnupg lsb-release ufw fail2ban \
  nginx certbot python3-certbot-nginx git logrotate unattended-upgrades

log "Создаём пользователя $DEPLOY_USER"
if ! id -u "$DEPLOY_USER" >/dev/null 2>&1; then
  adduser --disabled-password --gecos '' "$DEPLOY_USER"
fi
usermod -aG sudo "$DEPLOY_USER"

install -d -m 700 -o "$DEPLOY_USER" -g "$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh"
echo "$SSH_PUBKEY" > "/home/$DEPLOY_USER/.ssh/authorized_keys"
chmod 600 "/home/$DEPLOY_USER/.ssh/authorized_keys"
chown "$DEPLOY_USER:$DEPLOY_USER" "/home/$DEPLOY_USER/.ssh/authorized_keys"

log 'Ставим Docker'
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg \
    | gpg --dearmor -o /etc/apt/keyrings/docker.gpg
  chmod a+r /etc/apt/keyrings/docker.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
usermod -aG docker "$DEPLOY_USER"
systemctl enable --now docker

log 'Настраиваем ufw: открыты только 22, 80, 443'
ufw --force reset > /dev/null
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp comment 'SSH'
ufw allow 80/tcp comment 'HTTP'
ufw allow 443/tcp comment 'HTTPS'
ufw --force enable

log 'Настраиваем fail2ban'
cat > /etc/fail2ban/jail.local <<'EOF'
[DEFAULT]
bantime  = 1h
findtime = 10m
maxretry = 5
backend  = systemd

[sshd]
enabled = true

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled  = true
filter   = nginx-limit-req
logpath  = /var/log/nginx/*error.log
maxretry = 10
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban

log 'Закрываем вход root и парольную аутентификацию'
# Проверяем, что ключ реально лёг — иначе запрет пароля отрежет доступ
[[ -s "/home/$DEPLOY_USER/.ssh/authorized_keys" ]] || die 'authorized_keys пуст, отменяю харденинг SSH'

# Наличия файла мало: проверяем, что sshd реально пускает по ключу.
# Одноразовую пару генерируем на месте — настоящий приватный ключ на
# сервер класть незачем.
AUTH_KEYS="/home/$DEPLOY_USER/.ssh/authorized_keys"
TMPKEY="$(mktemp -u /tmp/sshcheck-XXXXXX)"
ssh-keygen -q -t ed25519 -f "$TMPKEY" -N '' -C 'ssh-selfcheck'
cat "$TMPKEY.pub" >> "$AUTH_KEYS"

set +e
ssh -i "$TMPKEY" -o BatchMode=yes -o StrictHostKeyChecking=no \
    -o UserKnownHostsFile=/dev/null -o PasswordAuthentication=no \
    -o ConnectTimeout=10 "$DEPLOY_USER@127.0.0.1" 'true' 2>/tmp/sshcheck.err
PUBKEY_CHECK=$?
set -e

grep -v 'ssh-selfcheck' "$AUTH_KEYS" > "$AUTH_KEYS.tmp"
mv "$AUTH_KEYS.tmp" "$AUTH_KEYS"
chown "$DEPLOY_USER:$DEPLOY_USER" "$AUTH_KEYS"
chmod 600 "$AUTH_KEYS"
rm -f "$TMPKEY" "$TMPKEY.pub"

if [[ "$PUBKEY_CHECK" -ne 0 ]]; then
  cat /tmp/sshcheck.err >&2
  die 'sshd не принял вход по ключу — харденинг отменён, иначе доступ был бы потерян'
fi
log 'Вход по ключу проверен'

# Имя файла начинается с 01 не случайно: sshd применяет ПЕРВОЕ встреченное
# значение параметра, а образы Ubuntu кладут /etc/ssh/sshd_config.d/
# 50-cloud-init.conf с `PasswordAuthentication yes`. Файл с префиксом 99
# читался бы после него и молча ничего не менял.
rm -f /etc/ssh/sshd_config.d/99-vin2win.conf
cat > /etc/ssh/sshd_config.d/01-vin2win.conf <<EOF
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
ChallengeResponseAuthentication no
KbdInteractiveAuthentication no
UsePAM yes
X11Forwarding no
MaxAuthTries 3
ClientAliveInterval 300
ClientAliveCountMax 2
AllowUsers $DEPLOY_USER
EOF

sshd -t || die 'Конфиг sshd не проходит проверку — ничего не перезапускаю'
systemctl reload ssh || systemctl reload sshd

# Сверяем, что настройки реально применились: тихо не сработавший запрет
# пароля — худший исход, он оставляет сервер открытым, но выглядит как успех
echo 'Действующие настройки sshd:'
sshd -T | grep -E '^(permitrootlogin|passwordauthentication|pubkeyauthentication|allowusers)'
sshd -T | grep -qx 'passwordauthentication no' \
  || die 'Парольный вход всё ещё разрешён — проверьте другие файлы в /etc/ssh/sshd_config.d/'

log 'Ротация логов приложения'
cat > /etc/logrotate.d/vin2win-crm <<'EOF'
/var/log/nginx/vin2win-crm.*.log {
    daily
    rotate 14
    compress
    delaycompress
    missingok
    notifempty
    create 0640 www-data adm
    sharedscripts
    postrotate
        [ -f /var/run/nginx.pid ] && kill -USR1 "$(cat /var/run/nginx.pid)"
    endscript
}

/var/log/vin2win-backup.log {
    weekly
    rotate 8
    compress
    missingok
    notifempty
}
EOF

log 'Включаем автоматические обновления безопасности'
dpkg-reconfigure -f noninteractive unattended-upgrades

log 'Готово.'
cat <<EOF

Дальше:
  1. Проверьте вход НОВЫМ ключом в отдельном окне: ssh $DEPLOY_USER@<ip>
     Текущую сессию не закрывайте, пока не убедитесь, что вход работает.
  2. Смените пароль пользователя PostgreSQL (gen_user) — он передавался открытым текстом.
  3. Разложите приложение: git clone в /opt/vin2win-crm, заполните .env
  4. Выпустите сертификат: certbot --nginx -d vin2win.online -d www.vin2win.online
  5. Запустите ./deploy/deploy.sh
EOF
