# Family Perception vs. Assessment Performance

An interactive dashboard over 682 family survey responses, matched against MAP, STAAR
and end-of-course assessment results.

**Live:** https://swamiprakash771.github.io/Uplift_Assesment/

## What it shows

Families and the assessment data agree about 56% of the time, and the disagreements run
almost entirely one way: 288 overestimates against 17 underestimates. Among scholars who
are genuinely below grade level, two thirds have a family who believes they are on track.

Every panel is filterable, and clicking any segment, cell or table row filters the rest
of the page to those scholars. The browser's Back button steps back through selections,
and the URL carries the current view, so a particular finding can be linked to directly.

## Running it locally

The dataset is fetched at runtime, so opening `index.html` from the filesystem will not
work - the browser blocks `fetch` under `file://`. Any static server does:

```
cd web
python -m http.server 4173      # http://localhost:4173
```

## Layout

```
web/index.html           markup and panel structure
web/assets/app.css       styles, including the dark-mode palette
web/assets/app.js        filtering, aggregation and rendering
web/data/students.json   682 records, one per survey respondent
```

No build step and no dependencies. The only external request is the Google Fonts
stylesheet.

## Data

One row per respondent. `mathOn` / `readOn` carry the assessment outcome (1 on grade
level, 0 below, `null` where no exam exists); `mathPerc` / `readPerc` carry what the
family said, on the same scale, with `null` meaning unsure.

Records are pseudonymised - identifiers are sequential and hold no personal detail.

"On grade level" follows the district crosswalk: MAP Quintile 5, STAAR and
end-of-course Meets or Masters. Where a scholar has several results in a subject, the
latest course wins.

## Reading the numbers

Two denominators do most of the work:

- **Comparable records (696)** - a definite family answer *and* an exam result for the
  same scholar and subject. Every match rate uses this.
- **Written exams (851)** - an exam result, whether or not the family committed.

244 of the 682 respondents have no assessment on record at all, largely junior
kindergarten, kindergarten and twelfth grade, who sit outside the testing programme.
They appear in the coverage panels and are excluded from every match rate.
