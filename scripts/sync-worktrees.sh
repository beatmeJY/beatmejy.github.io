#!/bin/bash
# feature worktree를 main과 동일 커밋으로 맞춘다. (에이전트 샌드박스 밖에서 실행)
set -euo pipefail
ROOT="/Users/youl/Projects/beatmejy.github.io"
CURSOR="/Users/youl/Projects/beatmejy-cursor"
CLAUDE="/Users/youl/Projects/beatmejy-claude"

cd "$ROOT"
git fetch origin
git pull --ff-only

for dir in "$CURSOR" "$CLAUDE"; do
  echo "---- sync $dir ----"
  git -C "$dir" merge --ff-only main || git -C "$dir" reset --hard main
  git -C "$dir" status -sb
  git -C "$dir" log -1 --oneline
done

echo "OK. Cursor는 이 폴더를 여세요: $CURSOR"
