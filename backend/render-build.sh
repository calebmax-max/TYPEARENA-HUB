#!/usr/bin/env bash
set -euo pipefail

# LibreOffice is required to render PowerPoint/Word/Excel previews accurately.
apt-get update
apt-get install -y --no-install-recommends libreoffice
rm -rf /var/lib/apt/lists/*

pip install -r requirements.txt
