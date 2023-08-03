#!/bin/sh

which op  >/dev/null 2>&1
if [[ $? -eq 0 ]]; then
  # Assume we're in a local dev environment
  # If 1Password cli is available, use it to resolve secret references in .env
  rm -rf .env.secrets.run
  op inject -i .env -o .env.secrets.run
else
  # Assume we're in a codespace, secrets will be injected by the devcontainer
  true
fi
