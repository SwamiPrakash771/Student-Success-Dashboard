# Family Perception vs. Assessment Performance

An interactive view of how closely families read their scholar's grade-level standing,
built from 682 family survey responses matched against MAP, STAAR and end-of-course
assessment results.

## The short version

Families and the assessment data agree about 56% of the time. The disagreements run
almost entirely one way: families overestimated 288 times and underestimated 17. Among
scholars who are genuinely below grade level, two thirds have a family who believes
they are on track.

## Running it

Any static file server works. The dataset is fetched at runtime, so opening
`index.html` directly from the filesystem will not work - the browser blocks the
`fetch` under `file://`.

```
npm run dev        # http://localhost:4173
```

or

```
python -m http.server 4173
npx serve .
```

## Layout

```
index.html           markup and panel structure
assets/app.css       styles, including the dark-mode palette
assets/app.js        filtering, aggregation and rendering
data/students.json   682 records, one per survey respondent
```

No build step and no dependencies. `app.js` is plain ES2015+; the only external
request is the Google Fonts stylesheet.

## Deploying

Published with GitHub Pages. The workflow in `.github/workflows/deploy.yml` uploads
this folder on every push to `main`; there is no build step, since the site is plain
HTML, CSS and JSON.

To turn it on once: **Settings > Pages > Source > GitHub Actions**. The site then
serves from a project subpath, which is why every reference in the page is relative.

## Data

One row per respondent. `mathOn` / `readOn` hold the assessment outcome (1 on grade
level, 0 below, `null` where no exam exists) and `mathPerc` / `readPerc` hold what the
family said, on the same scale, with `null` meaning unsure.

Records are pseudonymised: identifiers are sequential and carry no personal detail.

"On grade level" follows the district crosswalk - MAP Quintile 5, STAAR and
end-of-course Meets or Masters. Where a scholar has several results in a subject, the
latest course wins (Algebra I over STAAR over MAP; English II over English I over
STAAR over MAP).

## Reading the numbers

Two denominators do most of the work and are easy to confuse:

- **Comparable records (696)** - a definite family answer *and* an exam result for the
  same scholar and subject. Every match rate uses this.
- **Written exams (851)** - an exam result, whether or not the family committed to an
  answer.

244 of the 682 respondents have no assessment on record at all, largely junior
kindergarten, kindergarten and twelfth grade, who sit outside the testing programme.
They are counted in the coverage panels and excluded from every match rate.
