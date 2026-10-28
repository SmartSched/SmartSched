#!/bin/sh
# Copies the model service, and the ml/prefs files it imports, into a clone of the Hugging Face Space.
# Anything else in the Space (an older app.py, an ml/ folder) is removed first. Commit and push from there.
#
#   ml/serve/build_space.sh ../smartsched-api
set -e
dest=$1
here=$(cd "$(dirname "$0")" && pwd)
prefs="$here/../prefs"
if [ -z "$dest" ] || [ ! -d "$dest/.git" ]; then
  echo "usage: $0 <path to a git clone of the Space>" >&2
  exit 1
fi
cd "$dest"
git rm -r -q --ignore-unmatch . >/dev/null
git checkout HEAD -- .gitattributes 2>/dev/null || true
cp "$here/app.py" "$here/requirements.txt" "$here/README.md" .
cp "$prefs/llm.py" "$prefs/baseline.py" "$prefs/schema.py" "$prefs/system_prompt.txt" .
git add -A
git status --short
