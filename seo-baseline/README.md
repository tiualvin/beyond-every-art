# Search baseline

Frozen exports of what the site ranked for and where its traffic came from
before the Ghost cutover. The capture procedure — click paths, what to record,
and what genuinely does and does not survive the flip — is in
[`docs/SEO_BASELINE_CAPTURE.md`](../docs/SEO_BASELINE_CAPTURE.md).

## The data files are not committed

Everything in this directory except this README is ignored by git. Two reasons:

- **This repository is public.** Committing the exports would publish the
  site's query data, traffic figures and page-level performance to anyone who
  clones it.
- **It is the convention here.** Exported material is never committed — see the
  `ghost-export/` block in `.gitignore`, which reasons about why "untracked"
  is a weaker guarantee than "ignored".

So this directory is a **local** working location. It is not a backup. Put a
copy somewhere durable — the same place the `BACKUP_ENCRYPTION_KEY` passphrase
lives is a reasonable choice, since it is already somewhere that is neither
this repository nor the VPS.

## What lands here

Name files `<source>-<what>-<YYYYMMDD>.csv`, dated the day of the export:

```
search-console-queries-20260901.csv
search-console-pages-20260901.csv
search-console-dates-20260901.csv
ga4-landing-pages-20260901.csv
ga4-traffic-acquisition-20260901.csv
SUMMARY.md
```

`SUMMARY.md` is the part worth writing by hand: the headline numbers, the
Search Console property and its verification method, the GA4 measurement ID,
and the exact window covered. A template is at the end of the capture
procedure. The CSVs are the detail; the summary is what anyone actually reads
when they are trying to work out whether traffic moved.
