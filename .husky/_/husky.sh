#!/usr/bin/env sh
if [ -z "$husky_skip_init" ]; then
  debug() {
    [ "$HUSKY_DEBUG" = "true" ] && echo "husky (debug) - $*"
  }
  readonly hookName="$(basename "$0")"
  debug "starting $hookName..."
  if [ -z "$HUSKY" ]; then
    echo "husky - $hookName hook exited because HUSKY env var is not set" >&2
    exit 0
  fi
  if [ -f ~/.huskyrc ]; then
    echo "husky - ~/.huskyrc is deprecated, use ~/.config/husky instead" >&2
  fi
  export readonly husky_skip_init=1
  sh -e "$(dirname "$0")/husky.sh" "$@"
  exit $?
fi
