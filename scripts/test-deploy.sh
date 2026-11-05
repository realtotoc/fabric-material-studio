#!/usr/bin/env bash
set -Eeuo pipefail
SCRIPT_DIR=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
# shellcheck source=deploy-ubuntu.sh
. "$SCRIPT_DIR/deploy-ubuntu.sh"
fixture=$(mktemp -d)
trap 'rm -rf -- "$fixture"' EXIT

for value in 1 80 443 04173 65535; do valid_port "$value" || exit 1; done
for value in 0 65536 99999999999999 -1 '80/tcp' '80;id'; do
  if valid_port "$value"; then printf 'Invalid port accepted\n' >&2; exit 1; fi
done
valid_user 'sales.admin-1@example' || exit 1
# shellcheck disable=SC2016
for value in '' 'name:password' 'two words' '$USER'; do
  if valid_user "$value"; then exit 1; fi
done
for value in fabric.example.com EXAMPLE.COM 'a-b.example.cn'; do valid_domain "$value" || exit 1; done
for value in '' localhost '127.0.0.1' 'https://example.com' 'a..com' 'a.com.' '-a.com' 'a-.com' 'a.com:443' 'a.com { respond hacked }'; do
  if valid_domain "$value"; then printf 'Invalid domain accepted\n' >&2; exit 1; fi
done

API_KEY='test-deploy-key'
LOGIN_USER='sales'
# All punctuation must survive literal Docker env-file parsing, with no evaluation.
LOGIN_PASSWORD=$(cat <<'PASSWORD'
spaces $dollar #hash "double" 'single' `backticks` $(touch SHOULD_NOT_EXIST) % ! \
PASSWORD
)
write_runtime_env "$fixture/runtime.env"
[[ "$(saved_value "$fixture/runtime.env" STUDIO_PASSWORD)" == "$LOGIN_PASSWORD" ]]
[[ "$(saved_value "$fixture/runtime.env" AIHUBMIX_API_KEY)" == "$API_KEY" ]]
[[ ! -e SHOULD_NOT_EXIST ]]
[[ "$(stat -c %a "$fixture/runtime.env")" == 600 ]]
[[ -z "$(saved_value "$fixture/missing" STUDIO_PASSWORD)" ]]

# Simulate a rollout failure after renaming the original container.
events="$fixture/docker-events"
set +e
(
  INSTALL_DIR="$fixture/install"
  WORK_DIR="$INSTALL_DIR/.build.test"
  mkdir -p "$WORK_DIR"
  OLD_NAMES=(fabric-studio)
  BACKUP_NAMES=(fabric-studio-previous-test)
  WAS_RUNNING=(true)
  NEW_NAMES=(fabric-studio)
  COMMITTED=0
  # shellcheck disable=SC2317
  docker() { printf '%s\n' "$*" >> "$events"; return 0; }
  trap cleanup EXIT
  exit 42
)
status=$?
set -e
[[ "$status" == 42 ]]
[[ ! -e "$fixture/install/.build.test" ]]
grep -qx 'rm -f fabric-studio' "$events"
grep -qx 'rename fabric-studio-previous-test fabric-studio' "$events"
grep -qx 'start fabric-studio' "$events"
printf 'Deployment checks passed: validation, literal secret handling, private file permissions and failed-rollout restoration.\n'
