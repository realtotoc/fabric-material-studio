#!/usr/bin/env bash
# Ubuntu 22.04 / 24.04 / 26.04, with systemd. Run with sudo bash deploy-ubuntu.sh.
set +x
set -Eeuo pipefail
umask 077

REPOSITORY='https://github.com/realtotoc/fabric-material-studio.git'
INSTALL_DIR='/opt/fabric-studio'
APP='fabric-studio'
PROXY='fabric-studio-proxy'
NETWORK='fabric-studio-net'
CADDY_IMAGE='caddy:2-alpine'
WORK_DIR=''
CANDIDATE=''
CADDY_DIR=''
COMMITTED=0
OLD_NAMES=()
BACKUP_NAMES=()
WAS_RUNNING=()
NEW_NAMES=()

say() { printf '\n%s\n' "$*"; }
die() { printf '\n错误：%s\n' "$*" >&2; exit 1; }
valid_port() { [[ "$1" =~ ^[0-9]{1,5}$ ]] && (( 10#$1 >= 1 && 10#$1 <= 65535 )); }
valid_user() { [[ "$1" =~ ^[a-zA-Z0-9_.@-]{1,64}$ ]]; }
valid_domain() {
  local label
  [[ ${#1} -le 253 && "$1" == *.* && "$1" != *..* ]] || return 1
  [[ ! "$1" =~ ^[0-9.]+$ ]] || return 1
  local -a labels
  IFS='.' read -r -a labels <<< "$1"
  for label in "${labels[@]}"; do
    [[ "$label" =~ ^[a-zA-Z0-9]([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$ ]] || return 1
  done
  [[ "$1" != *. ]]
}

# Parse literal KEY=value records. Never source/eval a credentials file.
saved_value() {
  local file="$1" key="$2" line
  [[ -f "$file" ]] || return 0
  while IFS= read -r line || [[ -n "$line" ]]; do
    if [[ "${line%%=*}" == "$key" ]]; then printf '%s' "${line#*=}"; return; fi
  done < "$file"
}
write_runtime_env() {
  printf 'NODE_ENV=production\nHOST=0.0.0.0\nPORT=10000\nAIHUBMIX_API_KEY=%s\nSTUDIO_USER=%s\nSTUDIO_PASSWORD=%s\n' \
    "$API_KEY" "$LOGIN_USER" "$LOGIN_PASSWORD" > "$1"
  chmod 600 "$1"
}
ask() {
  local name="$1" prompt="$2" default="$3" answer
  printf '%s' "$prompt" >&3
  IFS= read -r -u 3 answer || die '输入已结束。'
  printf -v "$name" '%s' "${answer:-$default}"
}
ask_secret() {
  local name="$1" prompt="$2" answer
  printf '%s' "$prompt" >&3
  IFS= read -r -s -u 3 answer || die '输入已结束。'
  printf '\n' >&3
  printf -v "$name" '%s' "$answer"
}
container_exists() { docker container inspect "$1" >/dev/null 2>&1; }
check_owned() {
  local name="$1" owner
  if container_exists "$name"; then
    owner=$(docker inspect --format '{{index .Config.Labels "io.fabric-studio.install-dir"}}' "$name")
    [[ "$owner" == "$INSTALL_DIR" ]] || die "容器 $name 不属于本脚本，停止部署以避免覆盖。"
  fi
}
retire_container() {
  local name="$1" backup="$1-previous-$RUN_ID" running
  if container_exists "$name"; then
    running=$(docker inspect --format '{{.State.Running}}' "$name")
    OLD_NAMES+=("$name"); BACKUP_NAMES+=("$backup"); WAS_RUNNING+=("$running")
    [[ "$running" != true ]] || docker stop --time 20 "$name" >/dev/null
    docker rename "$name" "$backup"
  fi
}
cleanup() {
  local status=$? i name backup
  trap - EXIT ERR
  set +e
  if (( ! COMMITTED )); then
    for name in "${NEW_NAMES[@]}"; do docker rm -f "$name" >/dev/null 2>&1; done
    for ((i=${#OLD_NAMES[@]}-1; i>=0; i--)); do
      name=${OLD_NAMES[$i]}; backup=${BACKUP_NAMES[$i]}
      if container_exists "$backup"; then docker rename "$backup" "$name"; fi
      if [[ "${WAS_RUNNING[$i]}" == true ]]; then
        docker start "$name" >/dev/null || printf '请手动恢复：sudo docker start %s\n' "$name" >&2
      fi
    done
    [[ -z "$CADDY_DIR" ]] || rm -rf -- "$CADDY_DIR"
  fi
  [[ -z "$CANDIDATE" ]] || docker rm -f "$CANDIDATE" >/dev/null 2>&1
  if [[ -n "$WORK_DIR" && "$WORK_DIR" == "$INSTALL_DIR"/.build.* ]]; then rm -rf -- "$WORK_DIR"; fi
  unset API_KEY LOGIN_PASSWORD CONFIRM_PASSWORD
  exit "$status"
}

wait_ready() {
  local name="$1" attempt
  for ((attempt=0; attempt<30; attempt++)); do
    if docker exec "$name" node -e \
      'fetch("http://127.0.0.1:10000/healthz").then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))' \
      >/dev/null 2>&1; then return 0; fi
    sleep 1
  done
  return 1
}
verify_app() {
  docker exec "$1" node --input-type=module -e '
    const base="http://127.0.0.1:10000";
    if ((await fetch(base+"/")).status!==401) throw new Error("Login protection check failed");
    const headers={Authorization:"Basic "+Buffer.from(process.env.STUDIO_USER+":"+process.env.STUDIO_PASSWORD).toString("base64")};
    const r=await fetch(base+"/api/config",{headers});
    if(!r.ok || !(await r.json()).configured) throw new Error("Backend key configuration check failed");
    if((await fetch(base+"/.dev.vars",{headers})).status!==404) throw new Error("Secret-file blocking check failed");
  '
}
run_app() {
  local name="$1"; shift
  docker run --detach --name "$name" --network "$NETWORK" \
    --label "io.fabric-studio.install-dir=$INSTALL_DIR" \
    --env-file "$WORK_DIR/runtime.env" --read-only \
    --tmpfs /tmp:rw,noexec,nosuid,size=64m --cap-drop ALL \
    --security-opt no-new-privileges:true \
    --log-opt max-size=10m --log-opt max-file=3 "$@" "$IMAGE" >/dev/null
}

main() {
  if [[ "${1:-}" == --help ]]; then
    printf '用法：sudo bash deploy-ubuntu.sh\n交互填写后台密钥、访问用户名/密码、可选域名及端口。再次运行可更新。\n'
    return
  fi
  [[ $# -eq 0 ]] || die '不支持该参数。使用 --help 查看用法。'
  [[ $(uname -s) == Linux && -f /etc/os-release ]] || die '请在 Ubuntu 服务器执行。'
  # shellcheck disable=SC1091
  . /etc/os-release
  [[ "$ID" == ubuntu ]] || die '仅支持 Ubuntu。'
  case "$VERSION_ID" in 22.04|24.04|26.04) ;; *) die '支持 Ubuntu 22.04、24.04、26.04 LTS。';; esac
  case "$(dpkg --print-architecture)" in amd64|arm64) ;; *) die '需要 amd64 或 arm64 架构的服务器。';; esac
  [[ "$EUID" -eq 0 ]] || die '请使用 sudo bash deploy-ubuntu.sh 执行。'
  [[ -d /run/systemd/system ]] || die '需要运行 systemd 的 Ubuntu 服务器。'
  exec 3<> /dev/tty || die '需要交互式终端。请先下载脚本，再使用 sudo bash 执行，不要管道到 bash。'
  install -d -m 700 "$INSTALL_DIR" "$INSTALL_DIR/config"
  exec 9> "$INSTALL_DIR/.deploy.lock"
  flock -n 9 || die '另一个部署正在运行。'
  RUN_ID="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  trap cleanup EXIT
  trap 'printf "\n部署在第 %s 行失败（退出码 %s），正在清理并恢复原服务。\n" "$LINENO" "$?" >&2' ERR
  trap 'exit 130' INT
  trap 'exit 143' TERM

  say '织间 Ubuntu 一键部署 · Docker + 可选自动 HTTPS'
  say '密码和 API Key 输入时不回显；再次部署时回车可保留已有值。'
  local old_key old_password old_user old_domain old_port
  old_key=$(saved_value "$INSTALL_DIR/config/runtime.env" AIHUBMIX_API_KEY)
  old_password=$(saved_value "$INSTALL_DIR/config/runtime.env" STUDIO_PASSWORD)
  old_user=$(saved_value "$INSTALL_DIR/config/runtime.env" STUDIO_USER)
  old_domain=$(saved_value "$INSTALL_DIR/config/deployment.env" PUBLIC_DOMAIN)
  old_port=$(saved_value "$INSTALL_DIR/config/deployment.env" PUBLIC_PORT)
  while :; do
    ask LOGIN_USER "网页访问用户名 [${old_user:-admin}]：" "${old_user:-admin}"
    valid_user "$LOGIN_USER" && break
    say '用户名限 1–64 位字母、数字、下划线、点、@ 和连字符。'
  done
  while :; do
    ask_secret LOGIN_PASSWORD '网页访问密码（至少 8 位，已有配置可回车保留）：'
    if [[ -z "$LOGIN_PASSWORD" && -n "$old_password" ]]; then LOGIN_PASSWORD=$old_password; break; fi
    [[ ${#LOGIN_PASSWORD} -ge 8 ]] || { say '密码至少 8 位。'; continue; }
    ask_secret CONFIRM_PASSWORD '再次输入访问密码：'
    [[ "$LOGIN_PASSWORD" == "$CONFIRM_PASSWORD" ]] && break
    say '两次密码不一致，请重新输入。'
  done
  while :; do
    ask_secret API_KEY 'AiHubMix API Key（已有配置可回车保留）：'
    API_KEY=${API_KEY:-$old_key}
    [[ -n "$API_KEY" && ! "$API_KEY" =~ [[:space:]] ]] && break
    say '请填写有效的非空 Key，不包含空格或换行。'
  done
  say '有域名：先把域名 A/AAAA 记录指向此服务器，开放 80/443；脚本用 Caddy 自动申请和续期证书。'
  say '无域名：输入 -，通过 IP:端口使用 HTTP 测试（HTTP 不加密登录信息）。不会修改现有防火墙。'
  while :; do
    ask PUBLIC_DOMAIN "网站域名 [${old_domain:--}；- 表示无域名]：" "${old_domain:--}"
    if [[ "$PUBLIC_DOMAIN" == - ]]; then PUBLIC_DOMAIN=''; break; fi
    valid_domain "$PUBLIC_DOMAIN" && break
    say '只填域名，例如 fabric.example.com；不要填写协议、端口或路径。'
  done
  PUBLIC_PORT=${old_port:-4173}
  if [[ -z "$PUBLIC_DOMAIN" ]]; then
    while :; do
      ask PUBLIC_PORT "对外访问端口 [$PUBLIC_PORT]：" "$PUBLIC_PORT"
      valid_port "$PUBLIC_PORT" && break
      say '请输入 1–65535 之间的端口。'
    done
    PUBLIC_PORT=$((10#$PUBLIC_PORT))
  fi
  unset old_key old_password CONFIRM_PASSWORD

  say '[1/5] 安装依赖并启动 Docker'
  export DEBIAN_FRONTEND=noninteractive
  apt-get update
  apt-get install -y ca-certificates curl git util-linux
  if ! command -v docker >/dev/null 2>&1; then
    apt-get install -y docker.io docker-buildx
  elif ! docker buildx version >/dev/null 2>&1; then
    if dpkg-query -W -f='${Status}' docker.io 2>/dev/null | grep -q 'install ok installed'; then
      apt-get install -y docker-buildx
    elif apt-cache show docker-buildx-plugin >/dev/null 2>&1; then
      apt-get install -y docker-buildx-plugin
    else
      die '已有 Docker 缺少 Buildx，请为当前 Docker 安装 buildx 插件后重试；脚本不会替换已有 Docker。'
    fi
  fi
  docker buildx version >/dev/null
  systemctl enable --now docker
  docker info >/dev/null
  check_owned "$APP"; check_owned "$PROXY"
  WORK_DIR=$(mktemp -d "$INSTALL_DIR/.build.XXXXXXXX")
  write_runtime_env "$WORK_DIR/runtime.env"

  say '[2/5] 下载 main 分支并构建应用（Node.js 已包含在镜像中）'
  git clone --depth 1 --branch main "$REPOSITORY" "$WORK_DIR/source"
  local revision
  revision=$(git -C "$WORK_DIR/source" rev-parse --short HEAD)
  IMAGE="fabric-material-studio:$revision-$RUN_ID"
  docker build --pull --tag "$IMAGE" "$WORK_DIR/source"
  if ! docker network inspect "$NETWORK" >/dev/null 2>&1; then docker network create "$NETWORK" >/dev/null; fi
  if [[ -n "$PUBLIC_DOMAIN" ]]; then
    docker pull "$CADDY_IMAGE"
    CADDY_DIR="$INSTALL_DIR/config/caddy-$RUN_ID"
    install -d -m 755 "$CADDY_DIR"
    printf '%s {\n\tencode zstd gzip\n\treverse_proxy %s:10000\n}\n' "$PUBLIC_DOMAIN" "$APP" > "$CADDY_DIR/Caddyfile"
    chmod 644 "$CADDY_DIR/Caddyfile"
    docker run --rm --volume "$CADDY_DIR:/etc/caddy:ro" "$CADDY_IMAGE" \
      caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
  fi

  say '[3/5] 在临时容器验证健康状态、访问密码及密钥配置（不调用付费 AI）'
  CANDIDATE="$APP-check-$RUN_ID"
  run_app "$CANDIDATE"
  wait_ready "$CANDIDATE" || die '新版本健康检查失败，原服务保持不变。'
  verify_app "$CANDIDATE"
  docker rm -f "$CANDIDATE" >/dev/null
  CANDIDATE=''

  say '[4/5] 切换版本并设置开机自启'
  retire_container "$PROXY"
  retire_container "$APP"
  NEW_NAMES+=("$APP")
  if [[ -n "$PUBLIC_DOMAIN" ]]; then
    run_app "$APP" --restart unless-stopped
  else
    run_app "$APP" --restart unless-stopped --publish "$PUBLIC_PORT:10000"
  fi
  wait_ready "$APP" || die '新版本启动失败，将恢复原容器。'
  verify_app "$APP"
  if [[ -n "$PUBLIC_DOMAIN" ]]; then
    NEW_NAMES+=("$PROXY")
    docker run --detach --name "$PROXY" --restart unless-stopped --network "$NETWORK" \
      --label "io.fabric-studio.install-dir=$INSTALL_DIR" \
      --publish 80:80 --publish 443:443 --publish 443:443/udp \
      --volume "$CADDY_DIR:/etc/caddy:ro" \
      --volume fabric-studio-caddy-data:/data --volume fabric-studio-caddy-config:/config \
      --log-opt max-size=10m --log-opt max-file=3 "$CADDY_IMAGE" >/dev/null
    local proxy_ready=0 attempt response_code
    for ((attempt=0; attempt<30; attempt++)); do
      response_code=$(curl --silent --output /dev/null --write-out '%{http_code}' \
        --max-time 3 --header "Host: $PUBLIC_DOMAIN" http://127.0.0.1/healthz || true)
      if [[ "$response_code" == 308 || "$response_code" == 301 ]]; then proxy_ready=1; break; fi
      sleep 1
    done
    (( proxy_ready )) || die 'HTTPS 反向代理未正常启动，将恢复原服务。'
  else
    curl --fail --silent --show-error "http://127.0.0.1:$PUBLIC_PORT/healthz" >/dev/null
  fi

  say '[5/5] 保存后台配置'
  install -m 600 "$WORK_DIR/runtime.env" "$INSTALL_DIR/config/runtime.env"
  printf 'PUBLIC_DOMAIN=%s\nPUBLIC_PORT=%s\n' "$PUBLIC_DOMAIN" "$PUBLIC_PORT" > "$INSTALL_DIR/config/deployment.env"
  install -m 700 "$WORK_DIR/source/scripts/deploy-ubuntu.sh" "$INSTALL_DIR/deploy-ubuntu.sh"
  COMMITTED=1
  local backup
  for backup in "${BACKUP_NAMES[@]}"; do docker rm "$backup" >/dev/null || true; done
  say "部署完成：版本 $revision；访问用户名：$LOGIN_USER（密码不显示）"
  if [[ -n "$PUBLIC_DOMAIN" ]]; then
    printf '访问：https://%s\n请确认 DNS 指向此服务器，云安全组允许 TCP 80/443（UDP 443 可选）。证书将自动申请。\n' "$PUBLIC_DOMAIN"
  else
    printf '访问：http://服务器公网IP:%s\n请在云安全组放行 TCP %s。\n' "$PUBLIC_PORT" "$PUBLIC_PORT"
  fi
  printf '配置目录：%s/config（仅 root 可读）\n更新或修改用户名/密码：sudo bash %s/deploy-ubuntu.sh\n查看日志：sudo docker logs --tail 100 -f %s\n重启：sudo docker restart %s\n' "$INSTALL_DIR" "$INSTALL_DIR" "$APP" "$APP"
}

if [[ "${BASH_SOURCE[0]}" == "$0" ]]; then main "$@"; fi
