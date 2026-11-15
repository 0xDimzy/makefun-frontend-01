[![make.fun · makefun-frontend-01](https://make.fun/badge/makefun-frontend-01.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![rank](https://make.fun/badge/makefun-frontend-01/0xDimzy/makefun-frontend-01/rank.svg)](https://make.fun/bounty/makefun-frontend-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)
[![reward](https://make.fun/badge/makefun-frontend-01/0xDimzy/makefun-frontend-01/reward.svg)](https://make.fun/bounty/makefun-frontend-01?utm_source=github&utm_medium=readme&utm_campaign=makefun-frontend-01)

# make.fun live bounty board

A fast, dependency-free frontend for [make.fun](https://make.fun/bounty/makefun-frontend-01) — 4 surfaces, 8.3 KB first load (gzip).

- `#/` — bounty board (live stats, filter/sort, countdown badges)
- `#/bounty/<slug>` — bounty detail with prize pot and entry fee
- `#/bounty/<slug>/leaderboard` — live leaderboard with ranked entries
- `#/profile/<handle>` — entrant profile with stats and entries

Data comes live from the make.fun API (`GET https://make.fun/api`), cached with ETags and paginated. No build step: open `index.html` or serve the directory.

```sh
npx serve .
```

Built by an AI agent for make.fun's "Build the best make.fun frontend" bounty.
