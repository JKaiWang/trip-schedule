# trip-schedule

首爾・釜山行程表 — <https://seanachan.github.io/trip-schedule/>

Split out of [`seanachan.github.io`](https://github.com/Seanachan/seanachan.github.io) so the
portfolio site and this tool build and deploy independently. The repo is named `trip-schedule`
on purpose: a GitHub Pages project site is served at `/<repo>/`, so the public URL is unchanged
from when this page was a route in the portfolio.

## The Obsidian note is the single source of truth

The site only renders it. Vault location:

```
~/Library/Mobile Documents/iCloud~md~obsidian/Documents/Obsidian Vault/Travel/20260830_首爾+釜山/
```

Because the vault sits in iCloud outside the repo, CI cannot read it — that is why the `.md` files
are committed to `src/content/trip/`.

Don't hardcode that folder name anywhere else: it has been renamed once already. If it moves,
`trip-sync.mjs` re-finds it by scanning `Travel/*/` for the note containing `## 每日行程` (the same
marker the parser uses) and says so. `TRIP_VAULT_DIR` overrides both.

Workflow: edit in Obsidian → `yarn trip:pull` → commit. Edited the repo copy instead (e.g. while
restyling the page)? → `yarn trip:push` back to the vault. `yarn trip:status` shows which side
drifted before you pick a direction. A sha256 baseline in `scripts/.trip-sync.json` (gitignored)
blocks a sync that would clobber the other side's edits; `--force` overrides.

## Note format

One `### Day N · YYYY-MM-DD（週）· 城市 — 主題` heading per day, each followed by a 9-column table:

```
| ✓ | 時間 | 實際 | 類型 | 項目 | 地點 | 花費 | 備註 | 紀錄 |
```

- `✓` non-empty → `done`; `實際` → `actualTime`; `紀錄` → `log` (the during-trip record, rendered
  separately from planned `notes`)
- `地點` is `名稱 @lat,lng` — **split on the last `@`**, since item titles can contain one
  (`⚾ 看棒球…@ 社稷棒球場`). Coords are optional: without them the map link falls back to a name search
- `備註` leading `訂位：…｜` becomes `booking`; inline `[label](url)` become `links[]` and collapse to
  their label. Note text itself may contain `｜`, so only that first bar is a delimiter
- Cells escape `|` as `\|` and newlines as `<br>`
- **Long prose belongs in a footnote, not in the cell.** A cell carries a one-line summary plus
  `[^label]`; the prose lives in a single-line `[^label]: …` definition under `## 註解` at the
  bottom. Obsidian shows it on hover; the parser splices it back into `notes` (after the `｜`
  booking split, so the prose may contain `｜`; before the link scan, so `[label](url)` inside a
  definition still reaches `links[]`). An undefined label is left visible rather than silently
  dropped. Introduced 2026-08-09 — three cells had grown to 486/569/1236 chars and made the whole
  day unreadable in Obsidian
- `## 🗓️ 行程總覽` is a human-facing summary, **not** parsed as data. `checkOverviewConsistency()`
  reports drift against the Day headings; it never rewrites the note

`src/data/tripSchedule.ts` finds the itinerary file by its `## 每日行程` marker, not by filename
(the filenames contain spaces and full-width parens).

## Commands

| | |
|---|---|
| `yarn dev` | dev server |
| `yarn build` | `tsc -b && vite build` |
| `yarn lint` · `yarn test` | gates that CI enforces before deploying |
| `yarn trip:pull` / `trip:push` / `trip:status` | Obsidian vault ↔ repo sync |

## Layout

| File | Role |
|---|---|
| `src/pages/TripSchedulePage.tsx` | The whole UI. Stateful styles are inline; only class helpers live in CSS |
| `src/data/tripSchedule.ts` | Parses the `.md` into `TRIP` / `TRIP_DAYS` / `PRACTICAL` (hand-rolled, no markdown lib) |
| `src/content/trip/*.md` | Synced copies of the Obsidian notes. Byte-identical to the vault |
| `scripts/trip-sync.mjs` | Two-way vault ↔ repo sync |
| `src/index.css` | Design tokens inherited from the portfolio. This page consumes the dark `--space-*` / `--purdue-*` set |

## Pitfalls

1. **Obsidian's table editor silently deletes an all-empty leading column.** Caught 2026-08-09: it
   rewrote Day 1's itinerary table from 9 columns to 8, dropping `✓`, and padded the rest to align.
   `parseDayItemRow` reads columns *positionally*, so that shifts the whole day by one (時間 lands
   in `done`). `✓` / `實際` / `紀錄` are empty until the trip starts, so all three are exposed. Edit
   these tables as raw text; if `trip:status` reports `both-changed`, diff the column counts per day
   before choosing a direction.
2. The trip data used to come from a Notion export in which **every time ran one hour late** — naive
   Notion times were authored as UTC+8 but exported as UTC+9. The migration subtracted an hour from
   all 74 items. The current note is already correct, so **do not shift it again**.
3. This page keeps the legacy `--purdue-*` / `--space-*` dark palette and rounded corners it had as
   a route in the portfolio repo, which is *not* that site's Tainan vernacular. That was deliberate
   then and stays deliberate now that it stands alone.
4. The 💰 分帳計算機 link under the flight rows points at a **different repo's** Pages project site
   (`/trip-debt-calculator`). It is a plain `<a href>`, not a router link — this app has no router.
