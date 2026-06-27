# Clone-count badge

The README shows a **total git-clone count** badge. GitHub's traffic API only
retains the last **14 days** of clone data, so a scheduled job
([`.github/workflows/clone-count.yml`](../../.github/workflows/clone-count.yml))
runs daily, fetches the current window, and merges it into a running total kept
in a public Gist. [shields.io](https://shields.io) renders the badge from that
Gist.

> **What "total" means.** The counter accumulates **from the first run onward**.
> Clones from before you set this up are not exposed by GitHub and cannot be
> back-filled. The number therefore grows over time; it is *not* an all-time
> figure since repository creation.

This is adapted from
[MShawon/github-clone-count-badge](https://github.com/MShawon/github-clone-count-badge),
hardened for this repo: the accumulation script is **vendored**
([`.github/scripts/accumulate_clones.py`](../../.github/scripts/accumulate_clones.py))
rather than `curl`-piped into `python3` at runtime, the workflow runs with
read-only permissions, the action is pinned, and nothing is committed back to
the repository.

## One-time setup

1. **Create a public Gist.** At <https://gist.github.com> create a *public*
   gist with a single file named `clone.json`:

   ```json
   { "count": 0, "uniques": 0, "clones": [] }
   ```

   Copy its id — the hash in the URL
   `https://gist.github.com/<user>/<THIS_IS_THE_ID>`.

2. **Create a token.** Generate a *classic* Personal Access Token with the
   **`repo`** scope (the traffic API requires push access) and the **`gist`**
   scope (to update the gist). Add it under
   **Settings → Secrets and variables → Actions → Secrets** as `SECRET_TOKEN`.

3. **Add the gist id as a variable.** Under
   **Settings → Secrets and variables → Actions → Variables**, add
   `GIST_ID` = the id from step 1. (The id is public — it appears in the badge
   URL — so it is a *variable*, not a secret.)

4. **Point the badge at the gist.** In [`README.md`](../../README.md) replace
   `__GIST_ID__` in the clone badge URL with the same id.

5. **Bootstrap.** Trigger the workflow once via
   **Actions → "Clone count badge" → Run workflow**. After it succeeds the gist
   holds the first window and the badge renders.

If the gist owner is not `ucekmez`, also update `GIST_USER` in the workflow and
the username in the README badge URL.

## How it works

| Step | What happens |
|------|--------------|
| Fetch | `GET /repos/{owner}/{repo}/traffic/clones` → `clone.json` (last 14 days) |
| Load total | Download `clone.json` from the gist → `clone_before.json` |
| Merge | `accumulate_clones.py` overwrites overlapping days and appends new ones, then re-sums `count` / `uniques` |
| Persist | `PATCH /gists/{id}` writes the merged total back |
| Render | shields.io reads `count` from the gist's raw `clone.json` |

Older history is compacted into monthly buckets once it exceeds ~100 daily rows,
keeping the gist payload small.

## Rotating the token

`SECRET_TOKEN` is a classic PAT and will expire. When clone numbers stop
increasing, regenerate the PAT (same `repo` + `gist` scopes) and update the
`SECRET_TOKEN` secret. No code change is needed.
