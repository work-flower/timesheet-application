---
name: Notebook artifacts must be git-aware
description: All notebook file operations (add/remove/rename artifacts) must be staged in git index. Publish commits everything, discard reverts everything, purge commits the deletion.
type: feedback
---

**GOLDEN RULE:** Every notebook-related file/folder change/remove/addition MUST be git-aware — changes must be in the git index.

- **Upload artifact** → `git add` the new file
- **Delete artifact** → `git rm` the file (fallback to plain delete if untracked)
- **Rename artifact** → `git mv` the file (fallback to rename + `git add` if untracked)
- **Publish** → `git add -A` the folder + `git commit` (already stages everything)
- **Discard** → `git checkout` + `git clean` (already reverts everything)
- **Purge (permanent delete)** → `git rm` folder + `git commit` (must commit, not just stage)

**Why:** Without staging, artifact changes are invisible to git. Push/pull wouldn't propagate them, and discard wouldn't revert them. The bug that surfaced this: purge called `git rm` but never committed, so deletions couldn't be pushed.

**How to apply:** Any new file operation in the notebook folder must include the corresponding git staging command. Publish and discard already use folder-level git commands so they automatically cover staged changes.
