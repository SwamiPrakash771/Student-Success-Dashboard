let DATA = [];

const BAND_ORDER = ["1 Early Primary (JrK-2nd)","2 Upper Primary (3rd-5th)","3 Middle (6th-8th)","4 High (9th-12th)"];
const BAND_COLORS = {"1 Early Primary (JrK-2nd)":"var(--band1)","2 Upper Primary (3rd-5th)":"var(--band2)","3 Middle (6th-8th)":"var(--band3)","4 High (9th-12th)":"var(--band4)"};
const BAND_COLORS_HEX_LIGHT = {"1 Early Primary (JrK-2nd)":"#1782C4","2 Upper Primary (3rd-5th)":"#CF5F25","3 Middle (6th-8th)":"#12946E","4 High (9th-12th)":"#8A5FA8"};
const GRADE_ORDER = ["JR Kindergarten","Kindergarten","1st Grade","2nd Grade","3rd Grade","4th Grade","5th Grade","6th Grade","7th Grade","8th Grade","9th Grade","10th Grade","11th Grade","12th Grade"];
const SCHOOL_LEVELS = ["Primary","Middle","High"];
const SCHOOL_NAMES = [];   // filled once the dataset arrives



// ---------------------------------------------------------------------------
// View state lives in the URL. Back and Forward then work the way they do on any
// web page, and a filtered view can be copied out of the address bar and shared.
// ---------------------------------------------------------------------------
function stateToHash() {
  const q = new URLSearchParams();
  DIMS.forEach(dim => {
    if (filters[dim.id].length) q.set(dim.id, filters[dim.id].join("~"));
  });
  if (filters.survey !== "All") q.set("survey", filters.survey);
  if (filters.subject !== "Both") q.set("view", filters.subject);
  if (crossFilter) {
    q.set("pick", crossFilter.key);
    q.set("picklabel", crossFilter.label);
  }
  const s = q.toString();
  return s ? "#" + s : location.pathname + location.search;
}

function readHash() {
  const raw = location.hash.replace(/^#/, "");
  const q = new URLSearchParams(raw);
  DIMS.forEach(dim => {
    const v = q.get(dim.id);
    filters[dim.id] = v ? v.split("~") : [];
  });
  filters.survey = q.get("survey") || "All";
  filters.subject = q.get("view") || "Both";
  const pick = q.get("pick");
  if (pick) {
    const bits = pick.split("|");
    const build = CROSS_TESTS[bits[0]];
    crossFilter = build
      ? { key: pick, label: q.get("picklabel") || "selection", test: build(bits.slice(1)) }
      : null;
  } else {
    crossFilter = null;
  }
  const sv = document.getElementById("fSurvey");
  const sj = document.getElementById("fSubject");
  if (sv) sv.value = filters.survey;
  if (sj) sj.value = filters.subject;
}

// Called after any change the user made themselves.
function commit() {
  const h = stateToHash();
  if (h !== location.hash && !(h.indexOf("#") !== 0 && location.hash === "")) {
    history.pushState(null, "", h);
  }
  render();
}

window.addEventListener("popstate", () => {
  readHash();
  pruneSelections();
  buildFilterBar();
  render();
});

// Escape clears the current selection without reaching for the chip.
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && crossFilter) { crossFilter = null; commit(); }
});

// ---------------------------------------------------------------------------
// Cross-filter. A click on any segment sets a predicate over the student rows;
// everything on the page recomputes through it. Clicking the same segment again
// clears, and the chip above the panels is the visible way out.
// ---------------------------------------------------------------------------
let crossFilter = null;   // { key, label, test }

const CROSS_TESTS = {
  // tier|<subject>|<actual 0|1>|<belief 1|0|u>
  tier: parts => {
    const onKey = parts[0] === "math" ? "mathOn" : "readOn";
    const pKey = parts[0] === "math" ? "mathPerc" : "readPerc";
    const actual = Number(parts[1]);
    const belief = parts[2];
    return d => d[onKey] === actual &&
      (belief === "u" ? d[pKey] == null : d[pKey] === Number(belief));
  },
  // aware|<state>
  aware: parts => d => (d.mathOn === 0 || d.readOn === 0) && awarenessOf(d) === parts[0],
  // xs|<math state>|<reading state>
  xs: parts => d => subjState(d, "mathOn") === parts[0] && subjState(d, "readOn") === parts[1],
  // lvl|<school level>  - donut slice
  lvl: parts => d => d.schoolLevel === parts[0],
  // exam|<subject>|<segment>|<grade>  - one block of the exam-status stack
  exam: parts => {
    const onKey = parts[0] === "math" ? "mathOn" : "readOn";
    const seg = parts[1], grade = parts[2];
    return d => d.grade === grade && (
      seg === "written" ? d[onKey] != null
        : seg === "inButNotWritten" ? (d.inAssessment === "Yes" && d[onKey] == null)
        : d.inAssessment !== "Yes");
  },
  // assess|<grade>|<Yes|No>  - survey participation stack
  assess: parts => d => d.grade === parts[0] && d.inAssessment === parts[1],
  // race|<raw race value>
  race: parts => d => (d.race || "") === parts[0],
  // lang|<bucket>  - the table groups small languages into "Other"
  lang: parts => d => langBucket(d) === parts[0],
  // sped|<Yes|No>
  sped: parts => d => d.sped === parts[0],
  // cov|<math|read>|<step>  - one rung of the coverage funnel
  cov: parts => {
    const pKey = parts[0] === "math" ? "mathPerc" : "readPerc";
    const oKey = parts[0] === "math" ? "mathOn" : "readOn";
    const step = parts[1];
    return d => {
      const answered = d[pKey] != null, wrote = d[oKey] != null;
      switch (step) {
        case "filled": return answered;
        case "notFilled": return !answered;
        case "written": return wrote;
        case "notWritten": return !wrote;
        case "intersection": return answered && wrote;
        case "matching": return answered && wrote && d[pKey] === d[oKey];
        case "notMatching": return answered && wrote && d[pKey] !== d[oKey];
        default: return true;
      }
    };
  },
};

// The Home Language table folds every small language into "Other"; the filter has to
// bucket the same way or clicking that row would match nothing.
function langBucket(d) {
  const raw = d.homeLanguage || "Not Recorded";
  return ["English", "Not Recorded", "Spanish"].indexOf(raw) >= 0 ? raw : "Other";
}

function setCross(key, label) {
  if (crossFilter && crossFilter.key === key) { crossFilter = null; commit(); return; }
  const bits = key.split("|");
  const build = CROSS_TESTS[bits[0]];
  if (!build) return;
  crossFilter = { key, label, test: build(bits.slice(1)) };
  commit();
}

function clearCross() { crossFilter = null; commit(); }

function cfAttr(key, label, title) {
  const sel = crossFilter && crossFilter.key === key ? " cf-on" : "";
  return `data-cf="${key}" data-cf-label="${label.replace(/"/g, "&quot;")}"` +
         `${title ? ` title="${title.replace(/"/g, "&quot;")}"` : ""}` +
         `${sel ? ` class-extra="${sel}"` : ""}`;
}

function renderCrossChip() {
  const host = document.getElementById("crossFilterBar");
  if (!host) return;
  host.innerHTML = crossFilter
    ? `<div class="cf-chip"><span class="cf-chip-lab">Filtered by selection</span>
         <span class="cf-chip-val">${crossFilter.label}</span>
         <button type="button" class="cf-chip-x" id="cfClear" title="Clear (Esc)" aria-label="Clear selection">&times;</button>
       </div>
       <span class="cf-hint">Back undoes this &middot; Esc clears it</span>`
    : "";
  const btn = document.getElementById("cfClear");
  if (btn) btn.addEventListener("click", clearCross);
}

document.addEventListener("click", e => {
  const el = e.target.closest ? e.target.closest("[data-cf]") : null;
  if (!el) return;
  e.stopPropagation();
  setCross(el.getAttribute("data-cf"), el.getAttribute("data-cf-label") || "selection");
});

function matchesSurveyFilter(d, mode) {
  const mathFilled = d.mathPerc != null, readFilled = d.readPerc != null;
  switch (mode) {
    case "Both": return mathFilled && readFilled;
    case "Either": return mathFilled || readFilled;
    case "MathAny": return mathFilled;
    case "ReadAny": return readFilled;
    case "MathOnly": return mathFilled && !readFilled;
    case "ReadOnly": return readFilled && !mathFilled;
    case "Neither": return !mathFilled && !readFilled;
    default: return true; // "All"
  }
}

// Dimension filters hold arrays; an empty array means "All". Order here is the order
// they appear in the bar, and it follows the one strict hierarchy in the data:
// School Type > Grade Band > Grade. School Area is not a hierarchy level - three of
// the five areas span all three school types - but it still narrows, so it cascades
// the same way.
const DIMS = [
  { id: "schoolLevel", el: "msSchool",     label: "School Type",  order: SCHOOL_LEVELS },
  { id: "band",        el: "msBand",       label: "Grade Band",   order: BAND_ORDER },
  { id: "grade",       el: "msGrade",      label: "Grade",        order: GRADE_ORDER },
  { id: "schoolName",  el: "msSchoolName", label: "School Area",  order: SCHOOL_NAMES },
];
const DIM_KEY = { schoolLevel: "schoolLevel", band: "band", grade: "grade", schoolName: "schoolName" };

let filters = { schoolLevel: [], band: [], grade: [], schoolName: [], subject: "Both", survey: "All" };

function matchesDims(d, skipId) {
  return DIMS.every(dim => {
    if (dim.id === skipId) return true;
    const sel = filters[dim.id];
    return sel.length === 0 || sel.includes(d[DIM_KEY[dim.id]]);
  });
}

// Which values of this dimension still exist, given every OTHER selection. This is
// what makes the lists relative: choose School Type = Primary and the Grade list
// drops to JR Kindergarten..5th Grade, because no other grade survives the filter.
function availableFor(dim) {
  const counts = new Map();
  DATA.forEach(d => {
    if (!matchesDims(d, dim.id)) return;
    if (!matchesSurveyFilter(d, filters.survey)) return;
    const v = d[DIM_KEY[dim.id]];
    if (v == null) return;
    counts.set(v, (counts.get(v) || 0) + 1);
  });
  return dim.order.filter(v => counts.has(v)).map(v => [v, counts.get(v)]);
}

function summarise(dim, avail) {
  const sel = filters[dim.id];
  if (sel.length === 0) return "All";
  if (sel.length === 1) return sel[0].length > 22 ? sel[0].slice(0, 21) + "\u2026" : sel[0];
  if (sel.length === avail.length) return "All";
  return sel.length + " selected";
}

function buildFilterBar() {
  DIMS.forEach(dim => {
    const host = document.getElementById(dim.el);
    const avail = availableFor(dim);
    const open = host.dataset.open === "1";
    const sel = filters[dim.id];
    const opts = avail.length
      ? avail.map(pair => {
          const [v, n] = pair;
          const checked = sel.includes(v) ? " checked" : "";
          return `<label class="ms-opt"><input type="checkbox" value="${v.replace(/"/g, "&quot;")}"${checked}>
                    <span>${v}</span><span class="ms-n">${n}</span></label>`;
        }).join("")
      : '<div class="ms-empty">No values available under the current filters</div>';
    host.innerHTML = `
      <button type="button" class="ms-btn${sel.length && sel.length < avail.length ? " on" : ""}" aria-expanded="${open}" aria-haspopup="true">
        <span class="ms-lab">${dim.label}</span>
        <span class="ms-val">${summarise(dim, avail)}</span>
        <span class="ms-caret">\u25be</span>
      </button>
      <div class="ms-pop"${open ? "" : " hidden"}>
        <div class="ms-tools">
          <button type="button" data-act="all">Select all</button>
          <button type="button" data-act="none">Clear</button>
        </div>
        ${opts}
      </div>`;

    host.querySelector(".ms-btn").addEventListener("click", e => {
      e.stopPropagation();
      const wasOpen = host.dataset.open === "1";
      DIMS.forEach(o => { document.getElementById(o.el).dataset.open = "0"; });
      host.dataset.open = wasOpen ? "0" : "1";
      buildFilterBar();
    });
    host.querySelectorAll(".ms-tools button").forEach(b => {
      b.addEventListener("click", e => {
        e.stopPropagation();
        filters[dim.id] = b.dataset.act === "all" ? avail.map(p => p[0]) : [];
        pruneSelections(dim.id);
        buildFilterBar();
              });
    });
    host.querySelectorAll(".ms-opt input").forEach(cb => {
      cb.addEventListener("change", e => {
        e.stopPropagation();
        const v = cb.value;
        const cur = filters[dim.id];
        filters[dim.id] = cb.checked ? cur.concat([v]) : cur.filter(x => x !== v);
        pruneSelections(dim.id);
        buildFilterBar();
        commit();
      });
    });
    host.querySelector(".ms-pop").addEventListener("click", e => e.stopPropagation());
  });
}

// A selection can be stranded by a later choice - pick 6th Grade, then School Type =
// Primary, and 6th Grade no longer exists in scope. Drop those rather than leave a
// filter that silently returns nothing.
function pruneSelections(justChanged) {
  let changed = true, guard = 0;
  while (changed && guard++ < 6) {
    changed = false;
    DIMS.forEach(dim => {
      // Never prune the filter the user just touched. Without this the pass is
      // order-dependent and drops the NEW choice instead of the stale one: pick
      // 6th Grade, then School Type = Primary, and School Type gets cleared
      // because 6th Grade made Primary unavailable - exactly backwards.
      if (dim.id === justChanged) return;
      if (!filters[dim.id].length) return;
      const ok = new Set(availableFor(dim).map(p => p[0]));
      const keep = filters[dim.id].filter(v => ok.has(v));
      if (keep.length !== filters[dim.id].length) { filters[dim.id] = keep; changed = true; }
    });
  }
}

document.addEventListener("click", () => {
  let any = false;
  DIMS.forEach(d => {
    const h = document.getElementById(d.el);
    if (h.dataset.open === "1") { h.dataset.open = "0"; any = true; }
  });
  if (any) buildFilterBar();
});
document.addEventListener("keydown", e => {
  if (e.key !== "Escape") return;
  DIMS.forEach(d => { document.getElementById(d.el).dataset.open = "0"; });
  buildFilterBar();
});

function getFiltered() {
  const rows = DATA.filter(d => matchesDims(d, null) && matchesSurveyFilter(d, filters.survey));
  return crossFilter ? rows.filter(crossFilter.test) : rows;
}

function pct(n, d) { return d === 0 ? 0 : (n / d * 100); }
function fmtPct(n, d) { return d === 0 ? "&mdash;" : pct(n, d).toFixed(1) + "%"; }

function subjectStats(data, subjKey) {
  const percKey = subjKey + "Perc", onKey = subjKey + "On";
  const total = data.length;
  const filled = data.filter(d => d[percKey] != null).length;
  const notFilled = total - filled;
  const written = data.filter(d => d[onKey] != null).length;
  const notWritten = total - written;
  const intersection = data.filter(d => d[percKey] != null && d[onKey] != null);
  const matched = intersection.filter(d => d[percKey] === d[onKey]).length;
  const notMatched = intersection.length - matched;

  function breakdown(arr, actual) {
    const n = arr.length;
    return { n, actual, subject: subjKey,
             onTrack: arr.filter(d => d[percKey] === 1).length,
             below: arr.filter(d => d[percKey] === 0).length,
             unsure: arr.filter(d => d[percKey] == null).length };
  }
  return {
    total, filled, notFilled, written, notWritten,
    intersectionN: intersection.length, matched, notMatched,
    belowActual: breakdown(data.filter(d => d[onKey] === 0), 0),
    onActual: breakdown(data.filter(d => d[onKey] === 1), 1),
  };
}

function combinedStats(data) {
  const m = subjectStats(data, "math"), r = subjectStats(data, "read");
  const written = m.written + r.written;
  const matched = m.matched + r.matched;
  const notMatched = m.notMatched + r.notMatched;
  const unsureInWritten = (m.written - m.intersectionN) + (r.written - r.intersectionN);
  return { written, matched, notMatched, unsureInWritten, intersectionN: m.intersectionN + r.intersectionN };
}

function renderKPIs(data) {
  const m = subjectStats(data, "math"), r = subjectStats(data, "read");
  const belowAll = m.belowActual.n + r.belowActual.n;
  const belowDefinite = (m.belowActual.n - m.belowActual.unsure) + (r.belowActual.n - r.belowActual.unsure);
  const belowOnTrack = m.belowActual.onTrack + r.belowActual.onTrack;
  const comb = combinedStats(data);
  const optimistic = m.belowActual.onTrack + r.belowActual.onTrack;
  const pessimistic = m.onActual.below + r.onActual.below;
  const ratio = pessimistic === 0 ? (optimistic > 0 ? Infinity : 0) : (optimistic / pessimistic);

  const spedBelow = data.filter(d => (d.mathOn === 0 || d.readOn === 0));
  // approximate combined-subject SPED using math as representative when both exist; use per-subject union of below rows
  let spedRows = [];
  data.forEach(d => {
    if (d.mathOn === 0) spedRows.push({ sped: d.sped, onTrack: d.mathPerc === 1 });
    if (d.readOn === 0) spedRows.push({ sped: d.sped, onTrack: d.readPerc === 1 });
  });
  const nonSped = spedRows.filter(x => x.sped === "No");
  const spedGrp = spedRows.filter(x => x.sped === "Yes");
  const nonSpedRate = nonSped.length ? pct(nonSped.filter(x=>x.onTrack).length, nonSped.length) : null;
  const spedRate = spedGrp.length ? pct(spedGrp.filter(x=>x.onTrack).length, spedGrp.length) : null;
  const gap = (nonSpedRate != null && spedRate != null) ? (nonSpedRate - spedRate) : null;

  const kpis = [
    {
      lbl: "Blind-Spot Rate", hero: true,
      val: belowDefinite ? pct(belowOnTrack, belowDefinite).toFixed(0) + "%" : "&mdash;",
      sub: belowDefinite ? `of scholars actually below grade level have a family who believes they're on track (n=${belowDefinite})` : "No comparable data for this filter combination"
    },
    {
      lbl: "Overall Match Rate", hero: false,
      val: comb.intersectionN ? pct(comb.matched, comb.intersectionN).toFixed(1) + "%" : "&mdash;",
      sub: comb.intersectionN ? `family perception agrees with teacher's assessment data (n=${comb.intersectionN})` : "No comparable data for this filter combination"
    },
    {
      lbl: "Error Direction Ratio", hero: false,
      val: pessimistic > 0 ? ratio.toFixed(1) + "&times;" : (optimistic > 0 ? optimistic + " : 0" : "&mdash;"),
      sub: (optimistic + pessimistic) ? (pessimistic > 0 ? `families overestimate ${optimistic} times vs. underestimate only ${pessimistic} times` : `every error in this filter ran one direction &mdash; ${optimistic} families overestimated, 0 underestimated (ratio undefined, not infinite)`) : "No comparable data for this filter combination"
    },
    {
      lbl: "SPED Awareness Gap", hero: false,
      val: gap != null ? Math.abs(gap).toFixed(1) + "pp" : "&mdash;",
      sub: (nonSped.length && spedGrp.length) ?
        `of scholars actually below grade level, families believe "on track" ${nonSpedRate.toFixed(1)}% (non-SPED) vs. ${spedRate.toFixed(1)}% (SPED) (n=${nonSped.length+spedGrp.length})` :
        "Not enough SPED/non-SPED scholars below grade level in this filter to compare"
    },
  ];

  document.getElementById("kpiRow").innerHTML = kpis.map(k => `
    <div class="kpi ${k.hero ? "hero" : ""}">
      <div class="lbl">${k.lbl}</div>
      <div class="val">${k.val}</div>
      <div class="sub ${k.sub.startsWith("No ") || k.sub.startsWith("Not ") ? "empty" : ""}">${k.sub}</div>
    </div>`).join("");
}


const COV_LABELS = {
  filled: "answered", notFilled: "unsure", written: "sat the exam",
  notWritten: "no exam", intersection: "comparable",
  matching: "family agreed", notMatching: "family disagreed",
};

function covBarsHTML(subjLabel, s, total) {
  const subj = subjLabel === "Math" ? "math" : "read";
  // The two grey reference rows are the whole population, so clicking them would
  // filter to everything - no attribute on those.
  const cf = step => {
    if (!step) return "";
    const key = `cov|${subj}|${step}`;
    const on = crossFilter && crossFilter.key === key ? " cf-on" : "";
    return ` data-cf="${key}" data-cf-label="${subjLabel}: ${COV_LABELS[step]}"${on ? ` data-on="1"` : ""}`;
  };
  const isOn = step => step && crossFilter && crossFilter.key === `cov|${subj}|${step}`;
  const row = (lab, n, denom, color, bold, step) => {
    const w = pct(n, denom);
    return `<div class="cb-row${bold?' total':''}${isOn(step)?' cf-on':''}"${cf(step)}
      title="${lab}: ${n}"><div class="cb-lab">${lab}</div>
      <div class="cb-track"><div class="cb-fill" style="width:${w}%; background:${color}"></div></div>
      <div class="cb-val">${n}</div></div>`;
  };
  const rowPct = (lab, n, denom, color, step) => {
    const w = pct(n, denom);
    return `<div class="cb-row${isOn(step)?' cf-on':''}"${cf(step)}
      title="${lab}: ${n} of ${denom}"><div class="cb-lab">&nbsp;&nbsp;${lab}</div>
      <div class="cb-track"><div class="cb-fill" style="width:${w}%; background:${color}"></div></div>
      <div class="cb-val">${n} <span class="cb-pct">${fmtPct(n,denom)}</span></div></div>`;
  };
  const rowPct2 = (lab, step, n, denom, color) => rowPct(lab, n, denom, color, step);
  return `
    <div class="cov-col">
      <div class="cov-head">${subjLabel}</div>
      <div class="cov-bars">
        ${row("Survey Count", total, total, "var(--rule)", true)}
        ${rowPct2("Filled", "filled", s.filled, total, "var(--navy)")}
        ${rowPct2("Not Filled (Unsure)", "notFilled", s.notFilled, total, "var(--muted)")}
        ${row("Assessment Count", total, total, "var(--rule)", true)}
        ${rowPct2("Written", "written", s.written, total, "var(--navy)")}
        ${rowPct2("Not Written", "notWritten", s.notWritten, total, "var(--muted)")}
        <div class="cb-row intersect${isOn("intersection")?" cf-on":""}"${cf("intersection")}
          title="Intersection: ${s.intersectionN}"><div class="cb-lab"><b>Intersection</b></div>
          <div class="cb-track"><div class="cb-fill" style="width:${pct(s.intersectionN,total)}%; background:var(--accent)"></div></div>
          <div class="cb-val"><b>${s.intersectionN}</b></div></div>
        ${rowPct2("Matching", "matching", s.matched, total, "var(--ok)")}
        ${rowPct2("Not Matching", "notMatching", s.notMatched, total, "var(--warn)")}
      </div>
    </div>`;
}


// One clickable slice of a tier bar. b.subject / b.actual are stamped on the
// breakdown so the segment knows which scholars it stands for.
const BELIEF_CODE = { onTrack: "1", below: "0", unsure: "u" };

function tierSeg(b, field, colour, beliefLabel, label, sub) {
  const v = b[field], w = pct(v, b.n);
  if (b.subject == null || b.actual == null) {
    return `<div class="seg" style="background:${colour}; width:${w}%">${v > 0 ? v : ""}</div>`;
  }
  const key = `tier|${b.subject}|${b.actual}|${BELIEF_CODE[field]}`;
  const name = `${b.subject === "math" ? "Math" : "Reading"}: ${label.toLowerCase()}, ${beliefLabel}`;
  const on = crossFilter && crossFilter.key === key ? " cf-on" : "";
  const txt = field === "below"
    ? (v > 0 ? String(v) : "")
    : (v > 0 ? `${v} &middot; ${w.toFixed(0)}%` : "");
  return `<div class="seg${on}" data-cf="${key}" data-cf-label="${name}"
    title="${name} — ${v} of ${b.n} (${w.toFixed(1)}%)"
    style="background:${colour}; width:${w}%">${txt}</div>`;
}

function tierBarHTML(label, sub, b, colorMode) {
  if (b.n === 0) return `<div class="tier"><div class="tier-lab">${label}<span class="ct">${sub}</span></div><div class="bar"><div class="seg" style="width:100%; background:var(--rule)">no data</div></div></div>`;
  if (colorMode === "believe") {
    return `<div class="tier"><div class="tier-lab">${label}<span class="ct">${sub}</span></div>
      <div class="bar" role="img">
        ${tierSeg(b, "onTrack", "var(--c-ontrack)", "believes on grade level", label, sub)}
        ${tierSeg(b, "below", "var(--c-below)", "believes below grade level", label, sub)}
        ${tierSeg(b, "unsure", "var(--c-unsure)", "unsure", label, sub)}
      </div></div>`;
  }
}

function overallBarHTML(label, sub, matched, notMatched, unsure, total) {
  const parts = [`<div class="seg" style="background:var(--ok); width:${pct(matched,total)}%">${matched} &middot; ${pct(matched,total).toFixed(0)}%</div>`,
                  `<div class="seg" style="background:var(--warn); width:${pct(notMatched,total)}%">${notMatched} &middot; ${pct(notMatched,total).toFixed(0)}%</div>`];
  if (unsure != null) parts.push(`<div class="seg" style="background:var(--muted); width:${pct(unsure,total)}%">${unsure>0?unsure+' &middot; '+pct(unsure,total).toFixed(0)+'%':''}</div>`);
  return `<div class="tier overall"><div class="tier-lab"><b>${label}</b><span class="ct">${sub}</span></div><div class="bar">${parts.join("")}</div></div>`;
}

function renderCoverage(data) {
  const m = subjectStats(data, "math"), r = subjectStats(data, "read");
  let html = "";
  if (filters.subject !== "Reading") html += covBarsHTML("Math", m, data.length);
  if (filters.subject !== "Math") html += covBarsHTML("Reading", r, data.length);
  document.getElementById("covPanel").innerHTML = html;
  document.getElementById("covPanel").style.gridTemplateColumns = filters.subject === "Both" ? "1fr 1fr" : "1fr";
  document.getElementById("covSub").textContent = `Of ${data.length} students in the current filter, three things must be true for a student to count toward the match rate: they answered the survey question, they have a matching exam result, and both exist together`;
}

function renderTiers(data) {
  const m = subjectStats(data, "math"), r = subjectStats(data, "read");
  let html = "";

  // The Overall bars use a different colour scheme from the tier bars above them
  // (agreement vs. belief), so the key is repeated inline right where it's needed
  // rather than only once at the foot of the panel.
  const overallKey = `
    <div style="display:flex; flex-wrap:wrap; gap:5px 14px; margin:12px 0 2px; padding-top:10px;
                border-top:1px dashed var(--rule); font-size:11px; color:var(--ink-2);">
      <span style="font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; font-size:10px;">Bars below:</span>
      <span style="display:flex; align-items:center; gap:5px;"><span style="width:9px;height:9px;border-radius:2px;background:var(--ok);flex:none;"></span>Matched - family agreed with the data</span>
      <span style="display:flex; align-items:center; gap:5px;"><span style="width:9px;height:9px;border-radius:2px;background:var(--warn);flex:none;"></span>Unmatched - family disagreed</span>
      <span style="display:flex; align-items:center; gap:5px;"><span style="width:9px;height:9px;border-radius:2px;background:var(--muted);flex:none;"></span>Unsure - family couldn't say</span>
    </div>`;

  function subjectBlock(name, s) {
    let h = `<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:14px 0 4px;">${name} &middot; n=${s.written}</div>`;
    h += tierBarHTML("Actually Below Grade Level", `n = ${s.belowActual.n}`, s.belowActual, "believe");
    h += tierBarHTML("Actually On Grade Level", `n = ${s.onActual.n}`, s.onActual, "believe");
    h += overallKey;
    h += overallBarHTML(`Overall, ${name}`, `both rows combined, n = ${s.written}`, s.matched, s.notMatched, s.written - s.intersectionN, s.written);
    if (s.intersectionN > 0) h += overallBarHTML(`Overall, ${name}`, `definite answers only, n = ${s.intersectionN}`, s.matched, s.notMatched, null, s.intersectionN);
    return h;
  }
  if (filters.subject !== "Reading") html += subjectBlock("Math", m);
  if (filters.subject !== "Math") html += subjectBlock("Reading", r);
  if (filters.subject === "Both") {
    const comb = combinedStats(data);
    const combTotal = comb.written;
    html += `<div style="font-size:11px; font-weight:700; text-transform:uppercase; letter-spacing:.06em; color:var(--muted); margin:14px 0 4px;">Math and Reading combined &middot; n=${combTotal}</div>`;
    html += overallKey;
    html += overallBarHTML("Combined", `both subjects, with unsure, n = ${combTotal}`, comb.matched, comb.notMatched, comb.unsureInWritten, combTotal);
    if (comb.intersectionN > 0) html += overallBarHTML("Combined", `both subjects, definite only, n = ${comb.intersectionN}`, comb.matched, comb.notMatched, null, comb.intersectionN);
  }
  document.getElementById("tierPanel").innerHTML = html || '<div class="no-data-msg">No data for this filter combination</div>';
}

function renderComparison(data) {
  const m = subjectStats(data, "math"), r = subjectStats(data, "read");
  let html = "";
  if (filters.subject !== "Reading") html += `<div class="cmp-item${crossFilter && crossFilter.key === "cov|math|intersection" ? " cf-on" : ""}"
    data-cf="cov|math|intersection" data-cf-label="Math: comparable records"
    title="Math comparable records: ${m.intersectionN}"><div class="cmp-name">Math</div>
    <div class="cmp-track"><div class="cmp-fill" style="width:${pct(m.matched,m.intersectionN)}%"></div></div>
    <div class="cmp-val">${m.matched}/${m.intersectionN} &middot; ${fmtPct(m.matched,m.intersectionN)}</div></div>`;
  if (filters.subject !== "Math") html += `<div class="cmp-item${crossFilter && crossFilter.key === "cov|read|intersection" ? " cf-on" : ""}"
    data-cf="cov|read|intersection" data-cf-label="Reading: comparable records"
    title="Reading comparable records: ${r.intersectionN}"><div class="cmp-name">Reading</div>
    <div class="cmp-track"><div class="cmp-fill" style="width:${pct(r.matched,r.intersectionN)}%; background:var(--c-below)"></div></div>
    <div class="cmp-val">${r.matched}/${r.intersectionN} &middot; ${fmtPct(r.matched,r.intersectionN)}</div></div>`;
  document.getElementById("cmpPanel").innerHTML = html || '<div class="no-data-msg">No data for this filter</div>';

  const mOpt = m.belowActual.onTrack, mPess = m.onActual.below;
  const rOpt = r.belowActual.onTrack, rPess = r.onActual.below;
  const mRatio = mPess ? (mOpt/mPess).toFixed(1)+"&times;" : (mOpt ? mOpt+" : 0" : "n/a");
  const rRatio = rPess ? (rOpt/rPess).toFixed(1)+"&times;" : (rOpt ? rOpt+" : 0" : "n/a");
  document.getElementById("cmpRatio").innerHTML =
    `Optimistic to pessimistic errors: <b>${mRatio}</b> in Math, <b>${rRatio}</b> in Reading.`;
}

function getUnderperformingByMarks(data) {
  // A student is "underperforming by marks" if the assessment (not the parent) says
  // below grade level in Math or Reading - independent of what the family believes.
  return data.filter(d => d.mathOn === 0 || d.readOn === 0);
}

function awarenessOf(student) {
  const belowPercs = [];
  if (student.mathOn === 0 && student.mathPerc != null) belowPercs.push(student.mathPerc);
  if (student.readOn === 0 && student.readPerc != null) belowPercs.push(student.readPerc);
  if (belowPercs.length === 0) return "Unsure";
  if (belowPercs.every(p => p === 0)) return "Aware";
  if (belowPercs.every(p => p === 1)) return "Unaware";
  return "Mixed";
}


// What each awareness state means, in the row itself. The rule looks only at the
// subjects a scholar is actually behind in, which is the part that surprises people.
const AWARENESS_DEFS = {
  Unaware: "says on grade level in every subject they are behind in",
  Aware: "says below grade level in every subject they are behind in",
  Unsure: "gave no definite answer for the subjects they are behind in",
  Mixed: "right about one subject, wrong about the other",
};

function renderUnderperforming(data) {
  const under = getUnderperformingByMarks(data);
  const n = under.length;

  if (n === 0) {
    document.getElementById("awarenessPanel").innerHTML = '<div class="no-data-msg">No underperforming students in this filter</div>';
    document.getElementById("raceBreakdownPanel").innerHTML = '';
    document.getElementById("homeLangBreakdownPanel").innerHTML = '';
    document.getElementById("areaBreakdownPanel").innerHTML = '';
    document.getElementById("underperformNote").innerHTML = "No data for this filter combination.";
    return;
  }

  const withAwareness = under.map(d => ({ ...d, awareness: awarenessOf(d) }));
  const counts = { Aware: 0, Unaware: 0, Unsure: 0, Mixed: 0 };
  withAwareness.forEach(d => counts[d.awareness]++);

  const colors = { Aware: "var(--ok)", Unaware: "var(--warn)", Unsure: "var(--muted)", Mixed: "#8A5FA8" };
  let awareHtml = `<div style="font-size:12px; color:var(--ink-2); margin-bottom:8px;">n = ${n} underperforming scholars</div>`;
  ["Unaware", "Aware", "Unsure", "Mixed"].forEach(k => {
    if (counts[k] === 0 && k === "Mixed") return;
    const awKey = `aware|${k}`;
    const awOn = crossFilter && crossFilter.key === awKey ? " cf-on" : "";
    awareHtml += `<div class="aware-row${awOn}" data-cf="${awKey}" data-cf-label="Family ${k.toLowerCase()}"
      title="${k} — ${counts[k]} of ${n} (${pct(counts[k],n).toFixed(1)}%)">
      <div class="aware-lab">${k}<span class="ct">${AWARENESS_DEFS[k] || ""}</span></div>
      <div class="aware-track"><div class="aware-fill" style="width:${pct(counts[k],n)}%; background:${colors[k]}"></div></div>
      <div class="aware-val">${counts[k]} &middot; ${pct(counts[k],n).toFixed(1)}%</div></div>`;
  });
  document.getElementById("awarenessPanel").innerHTML = awareHtml;

  // Race x EL / SPED / EconDis - one table, three metric columns, scoped to underperforming-by-marks
  const RACE_ORDER = ["HISPANIC","BLACK OR AFRICAN AMERICAN","WHITE","TWOORMORERACES","ASIAN",
                      "AMERICAN INDIAN OR ALASKAN NATIVE","NATIVE HAWAIIAN/PACIFIC ISLANDER"];
  const RACE_LABEL = {"HISPANIC":"Hispanic","BLACK OR AFRICAN AMERICAN":"Black/African American",
    "WHITE":"White","TWOORMORERACES":"Two or More Races","ASIAN":"Asian",
    "AMERICAN INDIAN OR ALASKAN NATIVE":"Amer. Indian/Alaskan Native",
    "NATIVE HAWAIIAN/PACIFIC ISLANDER":"Native Hawaiian/Pacific Isl."};
  const hasExam = data.filter(d => d.mathOn != null || d.readOn != null);
  // Show every race category, even ones with zero students in the current filter -
  // a 0 row (e.g. Native Hawaiian/Pacific Islander, absent from this survey entirely)
  // is real information, not something to hide by omission.
  let raceRows = "";
  RACE_ORDER.forEach(race => {
    const totalGrp = hasExam.filter(d => d.race === race);
    const total = totalGrp.length;
    const inFilterAtAll = data.some(d => d.race === race);
    if (!inFilterAtAll) return; // truly 0 in the whole 682 dataset for this race - still handled below if ever present
    const grp = under.filter(d => d.race === race);
    const n2 = grp.length;
    if (total === 0) {
      raceRows += `<tr><td>${RACE_LABEL[race]||race}</td><td>0</td><td class="small-n">0 &mdash;</td>
        <td class="small-n">&mdash;</td><td class="small-n">&mdash;</td><td class="small-n">&mdash;</td></tr>`;
      return;
    }
    const underPct = pct(n2, total);
    const smallN = n2 < 10 ? ' class="small-n"' : '';
    const elPct = n2 ? pct(grp.filter(d=>d.el==="Yes").length, n2) : null;
    const spedPct = n2 ? pct(grp.filter(d=>d.sped==="Yes").length, n2) : null;
    const econPct = n2 ? pct(grp.filter(d=>d.econDis==="Yes").length, n2) : null;
    const rKey = `race|${race}`, rLab = RACE_LABEL[race] || race;
    const rOn = crossFilter && crossFilter.key === rKey ? " cf-on" : "";
    raceRows += `<tr class="${rOn}" data-cf="${rKey}" data-cf-label="Race: ${rLab}"
      title="${rLab} — ${total} assessed, ${n2} underperforming"><td>${rLab}</td><td>${total}</td>
      <td${smallN}>${n2} <span style="color:var(--muted); font-size:9.5px;">(${underPct.toFixed(0)}%)</span></td>
      <td${smallN}>${elPct==null?'&mdash;':elPct.toFixed(0)+'%'}</td>
      <td${smallN}>${spedPct==null?'&mdash;':spedPct.toFixed(0)+'%'}</td>
      <td${smallN}>${econPct==null?'&mdash;':econPct.toFixed(0)+'%'}</td></tr>`;
  });
  // Races that never appear anywhere in the 682-student dataset (e.g. Native Hawaiian/
  // Pacific Islander) still get an explicit 0 row, once, regardless of filter.
  RACE_ORDER.forEach(race => {
    if (!data.some(d => d.race === race)) {
      raceRows += `<tr><td>${RACE_LABEL[race]||race}</td><td>0</td><td class="small-n">0 &mdash;</td>
        <td class="small-n">&mdash;</td><td class="small-n">&mdash;</td><td class="small-n">&mdash;</td></tr>`;
    }
  });
  document.getElementById("raceBreakdownPanel").innerHTML = raceRows ? `
    <table class="race-table">
      <thead><tr>
        <th>Race</th>
        <th>Total<span class="denom">assessed</span></th>
        <th>Underperf.<span class="denom">% of Total</span></th>
        <th>% EL<span class="denom">% of Underperf.</span></th>
        <th>% SPED<span class="denom">% of Underperf.</span></th>
        <th>% EconDis<span class="denom">% of Underperf.</span></th>
      </tr></thead>
      <tbody>${raceRows}</tbody>
    </table>
    <div style="font-size:10px; color:var(--muted); margin-top:6px; font-style:italic;">"Total" = all students of that race with any exam result on file, good performers included. "Underperf." is a % of Total. The last three columns are each a % of the Underperf. count in that row, not of Total. Italic cells: underperforming n&lt;10.</div>`
    : '<div class="no-data-msg">No data for this filter</div>';

  // Home Language x EL / SPED / EconDis - same shape as the Race table above.
  // "Not Recorded" and "Other" are real, deliberate buckets (not omissions):
  // Home Language is blank for 208 of 682 students district-wide (30%), concentrated
  // among Hispanic (47% blank) and EL-flagged (59% blank) students, so "Not Recorded"
  // must be shown, not silently dropped. "Other" combines Burmese/Arabic/Vietnamese/
  // Sinhalese/Other-languages (8 students total) since each is individually too small
  // (1-3 students) to read as its own row.
  const HOME_LANG_ORDER = ["English", "Not Recorded", "Spanish", "Other"];
  let langRows = "";
  HOME_LANG_ORDER.forEach(lang => {
    const totalGrp = hasExam.filter(d => (d.homeLanguage || "Not Recorded") === lang);
    const total = totalGrp.length;
    const grp = under.filter(d => (d.homeLanguage || "Not Recorded") === lang);
    const n2 = grp.length;
    if (total === 0) {
      langRows += `<tr><td>${lang}</td><td>0</td><td class="small-n">0 &mdash;</td>
        <td class="small-n">&mdash;</td><td class="small-n">&mdash;</td><td class="small-n">&mdash;</td></tr>`;
      return;
    }
    const underPct = pct(n2, total);
    const smallN = n2 < 10 ? ' class="small-n"' : '';
    const elPct = n2 ? pct(grp.filter(d=>d.el==="Yes").length, n2) : null;
    const spedPct = n2 ? pct(grp.filter(d=>d.sped==="Yes").length, n2) : null;
    const econPct = n2 ? pct(grp.filter(d=>d.econDis==="Yes").length, n2) : null;
    const lKey = `lang|${lang}`;
    const lOn = crossFilter && crossFilter.key === lKey ? " cf-on" : "";
    langRows += `<tr class="${lOn}" data-cf="${lKey}" data-cf-label="Home language: ${lang}"
      title="${lang} — ${total} assessed, ${n2} underperforming"><td>${lang}</td><td>${total}</td>
      <td${smallN}>${n2} <span style="color:var(--muted); font-size:9.5px;">(${underPct.toFixed(0)}%)</span></td>
      <td${smallN}>${elPct==null?'&mdash;':elPct.toFixed(0)+'%'}</td>
      <td${smallN}>${spedPct==null?'&mdash;':spedPct.toFixed(0)+'%'}</td>
      <td${smallN}>${econPct==null?'&mdash;':econPct.toFixed(0)+'%'}</td></tr>`;
  });
  document.getElementById("homeLangBreakdownPanel").innerHTML = langRows ? `
    <table class="race-table">
      <thead><tr>
        <th>Language</th>
        <th>Total<span class="denom">assessed</span></th>
        <th>Underperf.<span class="denom">% of Total</span></th>
        <th>% EL<span class="denom">% of Underperf.</span></th>
        <th>% SPED<span class="denom">% of Underperf.</span></th>
        <th>% EconDis<span class="denom">% of Underperf.</span></th>
      </tr></thead>
      <tbody>${langRows}</tbody>
    </table>
    <div style="font-size:10px; color:var(--muted); margin-top:6px; font-style:italic;">"Not Recorded" = Home Language blank in the source roster (208 of 682, 30%, concentrated among Hispanic and EL-flagged students). "Other" combines Burmese, Arabic, Vietnamese, Sinhalese and other languages (8 students). "Total" = students of that group with any exam result on file. "Underperf." is a % of Total; the last three columns are each a % of the Underperf. count in that row, not of Total. Italic cells: underperforming n&lt;10.</div>`
    : '<div class="no-data-msg">No data for this filter</div>';

  // 4 KPI-style tiles, split by subject. Math and Reading are counted separately because a
  // scholar can be on grade level in one subject and below in the other - a single combined
  // figure hides exactly those cases (87 of them district-wide) and confuses comparison
  // against the per-subject charts elsewhere on this page.
  const totalStudents = data.length;
  const writtenCount = hasExam.length;

  const mathWritten = data.filter(d => d.mathOn != null).length;
  const mathPerf    = data.filter(d => d.mathOn === 1).length;
  const mathUnder   = data.filter(d => d.mathOn === 0).length;
  const readWritten = data.filter(d => d.readOn != null).length;
  const readPerf    = data.filter(d => d.readOn === 1).length;
  const readUnder   = data.filter(d => d.readOn === 0).length;

  const twoLine = (mVal, mPct, rVal, rPct) => `
    <div style="display:flex; flex-direction:column; gap:4px;">
      <div style="display:flex; align-items:baseline; gap:8px;">
        <span style="font-size:10px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; min-width:38px;">Math</span>
        <span style="font-size:22px; font-weight:700; letter-spacing:-.02em; font-variant-numeric:tabular-nums; line-height:1;">${mVal}</span>
        <span style="font-size:11.5px; color:var(--muted); font-variant-numeric:tabular-nums;">${mPct}</span>
      </div>
      <div style="display:flex; align-items:baseline; gap:8px;">
        <span style="font-size:10px; font-weight:600; color:var(--muted); text-transform:uppercase; letter-spacing:.05em; min-width:38px;">Read</span>
        <span style="font-size:22px; font-weight:700; letter-spacing:-.02em; font-variant-numeric:tabular-nums; line-height:1;">${rVal}</span>
        <span style="font-size:11.5px; color:var(--muted); font-variant-numeric:tabular-nums;">${rPct}</span>
      </div>
    </div>`;

  const areaKpis = [
    { lbl: "Student Count", val: `${totalStudents}`,
      sub: "all students in the current filter, regardless of survey or exam status" },
    { lbl: "Written Assessment",
      val: twoLine(mathWritten, `${pct(mathWritten,totalStudents).toFixed(1)}%`,
                   readWritten, `${pct(readWritten,totalStudents).toFixed(1)}%`),
      sub: "sat an exam in that subject &mdash; regardless of whether the survey was filled" },
    { lbl: "Performed", ok: true,
      val: twoLine(mathPerf, `${pct(mathPerf,mathWritten).toFixed(1)}%`,
                   readPerf, `${pct(readPerf,readWritten).toFixed(1)}%`),
      sub: "on grade level, as a % of that subject's own Written count" },
    { lbl: "Underperformed", warn: true,
      val: twoLine(mathUnder, `${pct(mathUnder,mathWritten).toFixed(1)}%`,
                   readUnder, `${pct(readUnder,readWritten).toFixed(1)}%`),
      sub: "below grade level, as a % of that subject's own Written count" },
  ];
  document.getElementById("areaBreakdownPanel").innerHTML = writtenCount > 0 ? areaKpis.map(k => `
    <div class="kpi">
      <div class="lbl">${k.lbl}</div>
      <div class="val" style="${k.ok?'color:var(--ok);':k.warn?'color:var(--warn);':''}">${k.val}</div>
      <div class="sub">${k.sub}</div>
    </div>`).join("") : '<div class="no-data-msg">No data for this filter</div>';

  const unawarePct = pct(counts.Unaware, n);
  document.getElementById("underperformNote").innerHTML =
    `<b>${counts.Unaware} of ${n} underperforming scholars (${unawarePct.toFixed(1)}%)</b> have a family who believes they're on track.`;
}

function renderDemo(data) {
  let spedRows = [];
  data.forEach(d => {
    if (d.mathOn === 0) spedRows.push({ sped: d.sped, onTrack: d.mathPerc === 1 });
    if (d.readOn === 0) spedRows.push({ sped: d.sped, onTrack: d.readPerc === 1 });
  });
  const nonSped = spedRows.filter(x => x.sped === "No");
  const spedGrp = spedRows.filter(x => x.sped === "Yes");
  const nonRate = nonSped.length ? pct(nonSped.filter(x=>x.onTrack).length, nonSped.length) : 0;
  const spedRate = spedGrp.length ? pct(spedGrp.filter(x=>x.onTrack).length, spedGrp.length) : 0;

  document.getElementById("demoPanel").innerHTML = `
    <div class="demo-row${crossFilter && crossFilter.key === "sped|No" ? " cf-on" : ""}"
      data-cf="sped|No" data-cf-label="Not receiving SPED services"
      title="Non-SPED — ${nonSped.filter(x=>x.onTrack).length} of ${nonSped.length} believed on track"><div class="demo-label">Non-SPED</div>
      <div class="demo-track"><div class="demo-fill" style="width:${nonRate}%; background:var(--c-below)"></div></div>
      <div class="demo-val">${nonSped.filter(x=>x.onTrack).length}/${nonSped.length} &middot; ${nonRate.toFixed(1)}%</div></div>
    <div class="demo-row${crossFilter && crossFilter.key === "sped|Yes" ? " cf-on" : ""}"
      data-cf="sped|Yes" data-cf-label="Receiving SPED services"
      title="SPED — ${spedGrp.filter(x=>x.onTrack).length} of ${spedGrp.length} believed on track"><div class="demo-label">SPED</div>
      <div class="demo-track"><div class="demo-fill" style="width:${spedRate}%; background:var(--ok)"></div></div>
      <div class="demo-val">${spedGrp.filter(x=>x.onTrack).length}/${spedGrp.length} &middot; ${spedRate.toFixed(1)}%</div></div>`;

  document.getElementById("demoNote").innerHTML = (nonSped.length >= 10 && spedGrp.length >= 10) ?
    `Below-grade rows, by SPED status. n=${nonSped.length+spedGrp.length}.` :
    `Sample too small in this filter (n=${nonSped.length+spedGrp.length}). Widen the filter.`;
}

function countBy(data, keyFn) {
  const map = new Map();
  data.forEach(d => { const k = keyFn(d); map.set(k, (map.get(k)||0)+1); });
  return map;
}

function drawGroupedBarChart(svgId, data, groupKey, gradesInScope) {
  const svg = document.getElementById(svgId);
  const W = 380, H = 260, padL = 28, padB = 46, padT = 8, padR = 6;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  if (gradesInScope.length === 0) {
    svg.innerHTML = `<text x="${W/2}" y="${H/2}" text-anchor="middle" class="axis-txt" style="font-size:12px;">No data for this filter</text>`;
    return;
  }
  const grades = gradesInScope;
  const groups = groupKey === "band" ? BAND_ORDER : ["Yes","No"];
  const colors = groupKey === "band" ? BAND_COLORS_HEX_LIGHT : {"Yes":"#1782C4","No":"#61757F"};

  const counts = {};
  grades.forEach(g => { counts[g] = {}; groups.forEach(gr => counts[g][gr]=0); });
  data.forEach(d => {
    const g = d.grade, gr = groupKey === "band" ? d.band : d.inAssessment;
    if (counts[g] && counts[g][gr] !== undefined) counts[g][gr]++;
  });

  const maxTotal = Math.max(1, ...grades.map(g => groups.reduce((s,gr)=>s+counts[g][gr],0)));
  const barW = plotW / grades.length * 0.7;
  const gap = plotW / grades.length * 0.3;

  let bars = "";
  grades.forEach((g, i) => {
    const x = padL + i*(barW+gap) + gap/2;
    let yCursor = padT + plotH;
    let total = 0;
    groups.forEach(gr => {
      const v = counts[g][gr];
      total += v;
      const h = (v / maxTotal) * plotH;
      yCursor -= h;
      if (v > 0) bars += `<rect x="${x.toFixed(1)}" y="${yCursor.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${colors[gr]}"${
        groupKey === "assess"
          ? svgCf(`assess|${g}|${gr}`, `${g}, in assessment file: ${gr}`, `${g} — in assessment file: ${gr} (${v})`)
          : ""}/>`;
    });
    if (total > 0) bars += `<text x="${(x+barW/2).toFixed(1)}" y="${(padT+plotH-total/maxTotal*plotH-3).toFixed(1)}" class="bar-val-txt" text-anchor="middle">${total}</text>`;
    bars += `<text x="${(x+barW/2).toFixed(1)}" y="${H-padB+12}" class="axis-txt" text-anchor="end" transform="rotate(-45 ${(x+barW/2).toFixed(1)} ${H-padB+12})">${g.replace(' Grade','').replace('JR Kindergarten','JrK').replace('Kindergarten','K')}</text>`;
  });

  let gridlines = "";
  for (let i=0;i<=4;i++){
    const y = padT + plotH - (i/4)*plotH;
    gridlines += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--rule-soft)" stroke-width="1"/>`;
    gridlines += `<text x="${padL-4}" y="${(y+3).toFixed(1)}" class="axis-txt" text-anchor="end">${Math.round(maxTotal*i/4)}</text>`;
  }

  svg.innerHTML = grades.some(g=>groups.reduce((s,gr)=>s+counts[g][gr],0)>0) ?
    gridlines + bars :
    `<text x="${W/2}" y="${H/2}" text-anchor="middle" class="axis-txt" style="font-size:12px;">No data for this filter</text>`;
}

function drawSubjectExamChart(svgId, data, gradesInScope) {
  const svg = document.getElementById(svgId);
  const W = 900, H = 300, padL = 34, padB = 50, padT = 10, padR = 10;
  const plotW = W - padL - padR, plotH = H - padT - padB;
  if (gradesInScope.length === 0) {
    svg.innerHTML = `<text x="${W/2}" y="${H/2}" text-anchor="middle" class="axis-txt" style="font-size:12px;">No data for this filter</text>`;
    return;
  }
  const grades = gradesInScope;
  const COL_NOT_IN = "#61757F", COL_NOT_WRITTEN = "#A8431C", COL_MATH = "#1782C4", COL_READ = "#CF5F25";

  function subjectStack(rows, onKey) {
    const notIn = rows.filter(d => d.inAssessment === "No").length;
    const inButNotWritten = rows.filter(d => d.inAssessment === "Yes" && d[onKey] == null).length;
    const written = rows.filter(d => d[onKey] != null).length;
    return { notIn, inButNotWritten, written, total: rows.length };
  }
  const stacks = grades.map(g => {
    const rows = data.filter(d => d.grade === g);
    return { grade: g, math: subjectStack(rows, "mathOn"), read: subjectStack(rows, "readOn") };
  });

  const maxTotal = Math.max(1, ...stacks.map(s => s.math.total));
  const groupW = plotW / grades.length;
  const barW = groupW * 0.32, barGap = groupW * 0.06;
  const groupPad = (groupW - 2*barW - barGap) / 2;

  let bars = "", labels = "";
  stacks.forEach((s, i) => {
    const groupX = padL + i * groupW;
    [["math", s.math, COL_MATH, 0], ["read", s.read, COL_READ, 1]].forEach(([key, stack, color, idx]) => {
      const x = groupX + groupPad + idx * (barW + barGap);
      let y = padT + plotH;
      [["written", color], ["inButNotWritten", COL_NOT_WRITTEN], ["notIn", COL_NOT_IN]].forEach(([segKey, segColor]) => {
        const v = stack[segKey];
        const h = (v / maxTotal) * plotH;
        y -= h;
        if (v > 0) {
          const segName = segKey === "written" ? "wrote this subject"
            : segKey === "inButNotWritten" ? "in file, not written" : "not in assessment file";
          const subjName = key === "math" ? "Math" : "Reading";
          bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${segColor}"${svgCf(`exam|${key}|${segKey}|${s.grade}`, `${s.grade}, ${subjName}: ${segName}`, `${s.grade} ${subjName} — ${segName}: ${v}`)}/>`;
        }
      });
      if (stack.total > 0) bars += `<text x="${(x+barW/2).toFixed(1)}" y="${(padT+plotH-stack.total/maxTotal*plotH-4).toFixed(1)}" class="bar-val-txt" text-anchor="middle" style="font-size:9px;">${stack.total}</text>`;
    });
    const labelX = groupX + groupW/2;
    labels += `<text x="${labelX.toFixed(1)}" y="${H-padB+14}" class="axis-txt" text-anchor="end" transform="rotate(-45 ${labelX.toFixed(1)} ${H-padB+14})" style="font-size:10px;">${s.grade.replace(' Grade','').replace('JR Kindergarten','JrK').replace('Kindergarten','K')}</text>`;
  });

  let gridlines = "";
  for (let i=0;i<=4;i++){
    const y = padT + plotH - (i/4)*plotH;
    gridlines += `<line x1="${padL}" y1="${y.toFixed(1)}" x2="${W-padR}" y2="${y.toFixed(1)}" stroke="var(--rule-soft)" stroke-width="1"/>`;
    gridlines += `<text x="${padL-4}" y="${(y+3).toFixed(1)}" class="axis-txt" text-anchor="end" style="font-size:10px;">${Math.round(maxTotal*i/4)}</text>`;
  }
  svg.innerHTML = gridlines + bars + labels;
}


// SVG shapes take the same data-cf contract as the HTML segments; Element.closest
// works on SVG elements, so the one delegated click handler covers both.
function svgCf(key, label, title) {
  const esc = s => String(s).replace(/"/g, "&quot;");
  const on = crossFilter && crossFilter.key === key ? ' class="cf-on"' : "";
  return ` data-cf="${key}" data-cf-label="${esc(label)}" aria-label="${esc(title)}"${on}`;
}

function drawDonut(svgId, data) {
  const svg = document.getElementById(svgId);
  // H is taller than the grouped bar chart's viewBox on purpose: with 3 fixed legend rows
  // below the ring (cy + r + 30 + i*18), the old H=260/cy=118 put the 3rd row's bottom
  // edge past the viewBox boundary, so "High" was silently clipped off every render,
  // at every screen width - verified by screenshotting the rendered SVG, not just reading
  // the math. cy=110/H=300 leaves real margin below the last legend row.
  const W=380,H=300,cx=W/2,cy=110,r=76,rInner=42;
  const counts = countBy(data, d=>d.schoolLevel);
  const total = data.length;
  const order = ["Primary","Middle","High"];
  const colors = {"Primary":"#1782C4","Middle":"#CF5F25","High":"#12946E"};
  if (total===0) { svg.innerHTML = `<text x="${W/2}" y="${H/2}" text-anchor="middle" class="axis-txt" style="font-size:12px;">No data for this filter</text>`; return; }
  const nonZero = order.filter(k => (counts.get(k)||0) > 0);
  let angle = -Math.PI/2, paths="", labels="";
  if (nonZero.length === 1) {
    // A single 100% slice degenerates to a full-circle SVG arc (start point == end point,
    // so the browser renders nothing) - draw two semicircle arcs instead, which is the
    // standard workaround for a one-category donut.
    const k = nonZero[0], v = counts.get(k);
    paths = `<path ${svgCf(`lvl|${k}`, `${k} campuses`, `${k} — ${v} scholars`)} d="M${cx-r},${cy} A${r},${r} 0 1 1 ${cx+r},${cy} A${r},${r} 0 1 1 ${cx-r},${cy}
              M${cx-rInner},${cy} A${rInner},${rInner} 0 1 0 ${cx+rInner},${cy} A${rInner},${rInner} 0 1 0 ${cx-rInner},${cy} Z"
              fill="${colors[k]}" fill-rule="evenodd"/>`;
    labels = `<text x="${cx}" y="${cy}" text-anchor="middle" class="bar-val-txt" style="font-size:11px;">${v} (100%)</text>`;
  } else {
    order.forEach(k => {
      const v = counts.get(k)||0;
      if (v===0) return;
      const frac = v/total, theta = frac*2*Math.PI;
      const x1=cx+r*Math.cos(angle), y1=cy+r*Math.sin(angle);
      const x2=cx+r*Math.cos(angle+theta), y2=cy+r*Math.sin(angle+theta);
      const xi1=cx+rInner*Math.cos(angle), yi1=cy+rInner*Math.sin(angle);
      const xi2=cx+rInner*Math.cos(angle+theta), yi2=cy+rInner*Math.sin(angle+theta);
      const large = theta > Math.PI ? 1 : 0;
      paths += `<path d="M${x1.toFixed(1)},${y1.toFixed(1)} A${r},${r} 0 ${large} 1 ${x2.toFixed(1)},${y2.toFixed(1)} L${xi2.toFixed(1)},${yi2.toFixed(1)} A${rInner},${rInner} 0 ${large} 0 ${xi1.toFixed(1)},${yi1.toFixed(1)} Z" fill="${colors[k]}"${svgCf(`lvl|${k}`, `${k} campuses`, `${k} — ${v} scholars`)}/>`;
      const midA = angle+theta/2, lx=cx+(r+16)*Math.cos(midA), ly=cy+(r+16)*Math.sin(midA);
      if (frac > 0.03) labels += `<text x="${lx.toFixed(1)}" y="${ly.toFixed(1)}" text-anchor="middle" class="bar-val-txt" style="font-size:10px;">${v} (${(frac*100).toFixed(0)}%)</text>`;
      angle += theta;
    });
  }
  let legend = "";
  order.forEach((k,i) => {
    const v = counts.get(k)||0;
    legend += `<rect x="${cx-60}" y="${cy+r+30+i*18}" width="10" height="10" fill="${colors[k]}"/>
      <text x="${cx-46}" y="${cy+r+39+i*18}" class="axis-txt" style="font-size:11px;">${k} (${v})</text>`;
  });
  svg.innerHTML = paths + labels + legend;
}


// ---------------------------------------------------------------------------
// Cross-subject profile. The rest of the page treats Math and Reading as two
// parallel columns; this is the only place that asks what happened to the SAME
// scholar in both. Three states per subject, so every respondent lands in
// exactly one of nine cells and nobody is silently dropped.
// ---------------------------------------------------------------------------
const XS_ORDER = ["On grade", "Below", "Not written"];

function subjState(d, key) {
  const v = d[key];
  return (v === null || v === undefined) ? "Not written" : (v === 1 ? "On grade" : "Below");
}

function crossTab(data) {
  const cell = {};
  XS_ORDER.forEach(m => XS_ORDER.forEach(r => { cell[m + "|" + r] = 0; }));
  data.forEach(d => { cell[subjState(d, "mathOn") + "|" + subjState(d, "readOn")]++; });
  return cell;
}

// Does a strength in one subject hide the weakness in the other? Compares the
// blind-spot rate on a below-grade subject when the scholar is on grade level
// elsewhere, against when they are behind in both.
function maskingStat(data) {
  let maskOn = 0, maskDef = 0, bothOn = 0, bothDef = 0;
  data.forEach(d => {
    if (d.mathOn == null || d.readOn == null) return;
    [["mathOn", "mathPerc", "readOn"], ["readOn", "readPerc", "mathOn"]].forEach(k => {
      const [onK, pK, otherK] = k;
      if (d[onK] !== 0 || d[pK] == null) return;
      if (d[otherK] === 1) { maskDef++; if (d[pK] === 1) maskOn++; }
      else { bothDef++; if (d[pK] === 1) bothOn++; }
    });
  });
  return { maskOn, maskDef, bothOn, bothDef };
}

function renderCrossSubject(data) {
  const cell = crossTab(data), N = data.length;
  const g = (m, r) => cell[m + "|" + r];
  const colTot = r => XS_ORDER.reduce((a, m) => a + g(m, r), 0);
  const rowTot = m => XS_ORDER.reduce((a, r) => a + g(m, r), 0);

  let head = '<tr><th class="rowhdr">Math \\ Reading</th>' +
    XS_ORDER.map(r => `<th>Reading<br>${r.toLowerCase()}</th>`).join("") +
    "<th>Total</th></tr>";
  let body = XS_ORDER.map(m => {
    const cells = XS_ORDER.map(r => {
      const v = g(m, r);
      const cls = v === 0 ? "zero"
        : (m === r ? "diag"
          : ((m === "On grade" && r === "Below") || (m === "Below" && r === "On grade")) ? "split" : "");
      const xk = `xs|${m}|${r}`;
      const xon = crossFilter && crossFilter.key === xk ? " cf-on" : "";
      const xlab = `Math ${m.toLowerCase()} + Reading ${r.toLowerCase()}`;
      return v === 0
        ? `<td class="${cls}">${v}</td>`
        : `<td class="${cls}${xon}" data-cf="${xk}" data-cf-label="${xlab}"
             title="${xlab} — ${v} scholars">${v}</td>`;
    }).join("");
    return `<tr><td>Math ${m.toLowerCase()}</td>${cells}<td><b>${rowTot(m)}</b></td></tr>`;
  }).join("");
  const totals = `<tr class="total"><th class="rowhdr">Total</th>` +
    XS_ORDER.map(r => `<td>${colTot(r)}</td>`).join("") + `<td>${N}</td></tr>`;
  document.getElementById("xsubMatrix").innerHTML =
    `<table class="xtab"><thead>${head}</thead><tbody>${body}${totals}</tbody></table>`;

  // Every cell named individually and ordered by size. Nothing is collapsed: being
  // strong in maths and behind in reading is a different problem from the reverse,
  // and they are not the same size, so merging them into one "split" row would hide
  // the asymmetry that matters.
  const LABELS = [
    [["Not written", "Not written"], "Neither subject tested", false],
    [["Below", "Below"], "Below in both", false],
    [["On grade", "On grade"], "On grade in both", false],
    [["On grade", "Below"], "Math on grade + Reading below", true],
    [["Below", "On grade"], "Math below + Reading on grade", true],
    [["Not written", "Below"], "Math not written + Reading below", false],
    [["Not written", "On grade"], "Math not written + Reading on grade", false],
    [["Below", "Not written"], "Math below + Reading not written", false],
    [["On grade", "Not written"], "Math on grade + Reading not written", false],
  ];
  const rows = LABELS
    .map(x => [x[1], g(x[0][0], x[0][1]), x[2], `xs|${x[0][0]}|${x[0][1]}`])
    .filter(r => r[1] > 0)
    .sort((a, b) => b[1] - a[1]);
  document.getElementById("xsubGroups").innerHTML = rows.length
    ? `<div class="grp-row" style="border-bottom:1px solid var(--rule); padding-bottom:7px;">
         <div class="grp-lab" style="font-weight:600; color:var(--ink);">Combination</div>
         <div class="grp-n" style="color:var(--muted); font-weight:400;">count</div>
         <div class="grp-pct">% of ${N}</div></div>` +
      rows.map(r =>
        `<div class="grp-row${r[2] ? " hi" : ""}${crossFilter && crossFilter.key === r[3] ? " cf-on" : ""}"
           data-cf="${r[3]}" data-cf-label="${r[0]}" title="${r[0]} — ${r[1]} scholars">
           <div class="grp-lab">${r[0]}</div>
           <div class="grp-n">${r[1]}</div>
           <div class="grp-pct">${(r[1] / N * 100).toFixed(1)}%</div></div>`).join("")
    : '<div class="ms-empty">No students in this filter</div>';

  const mathOn = rowTot("On grade"), readOn = colTot("On grade");
  document.getElementById("xsubSub").innerHTML = N
    ? `Of ${N} respondents in this filter, ${g("On grade", "On grade") + g("On grade", "Below") + g("Below", "On grade") + g("Below", "Below")} have both subjects on record. `
      + (mathOn ? `Of those on grade level in Math, <b>${(g("On grade", "Below") / mathOn * 100).toFixed(1)}%</b> are below in Reading.` : "")
    : "No students in this filter.";

  const ms = maskingStat(data);
  const el = document.getElementById("xsubNote");
  if (ms.maskDef === 0 || ms.bothDef === 0) {
    el.innerHTML = "Not enough comparable scholars in this filter for this comparison.";
    return;
  }
  const mr = ms.maskOn / ms.maskDef * 100, br = ms.bothOn / ms.bothDef * 100;
  el.innerHTML = `Blind-spot rate on a below-grade subject, by whether the scholar is on
    grade level in the other one: <b>${mr.toFixed(1)}%</b> (${ms.maskOn}/${ms.maskDef})
    when strong elsewhere, <b>${br.toFixed(1)}%</b> (${ms.bothOn}/${ms.bothDef}) when
    below in both.`;
}

// ---------------------------------------------------------------------------
// How much of the family opinion can never be checked against an exam at all.
// The high-school coverage analysis that used to sit here has moved to the written
// findings report - it is a structural explanation, not a live metric.
// ---------------------------------------------------------------------------
function renderUnverifiable(data) {
  let def = 0, checkable = 0, claimOn = 0;
  data.forEach(d => {
    [["mathPerc", "mathOn"], ["readPerc", "readOn"]].forEach(k => {
      if (d[k[0]] == null) return;
      def++;
      if (d[k[1]] != null) checkable++; else if (d[k[0]] === 1) claimOn++;
    });
  });
  const lost = def - checkable;
  document.getElementById("unverifiablePanel").innerHTML = def === 0
    ? '<div class="no-data-msg">No definite answers in this filter</div>'
    : `<div class="grp-row"><div class="grp-lab">Definite yes/no answers given</div>
         <div class="grp-n">${def}</div><div class="grp-pct">100%</div></div>
       <div class="grp-row"><div class="grp-lab">Checkable against an exam</div>
         <div class="grp-n">${checkable}</div><div class="grp-pct">${(checkable / def * 100).toFixed(0)}%</div></div>
       <div class="grp-row hi"><div class="grp-lab">No exam exists to check them</div>
         <div class="grp-n">${lost}</div><div class="grp-pct">${(lost / def * 100).toFixed(0)}%</div></div>
       <div style="font-size:11.5px; color:var(--ink-2); margin-top:10px; background:var(--accent-soft);
                   border-left:2px solid var(--accent); padding:8px 10px; border-radius:5px;">
         ${lost ? `Of the ${lost} answers with no exam behind them, <b>${(claimOn / lost * 100).toFixed(1)}%</b>
         say &ldquo;on track&rdquo;.` : "Every definite answer in this filter can be checked."}</div>`;
}

function render() {
  renderCrossChip();
  const data = getFiltered();
  document.getElementById("subheadline").textContent = `${data.length} students in current filter (of 682 total)`;
  renderKPIs(data);
  renderCoverage(data);
  renderTiers(data);
  renderUnderperforming(data);
  renderCrossSubject(data);
  renderUnverifiable(data);
  renderComparison(data);
  renderDemo(data);
  const grades = [...new Set(data.map(d=>d.grade))].sort((a,b)=>GRADE_ORDER.indexOf(a)-GRADE_ORDER.indexOf(b));
  drawSubjectExamChart("chartSubjectExam", data, grades);
  drawGroupedBarChart("chartGradeAssess", data, "assess", grades);
  drawDonut("chartSchoolLevel", data);
}

document.getElementById("fSubject").addEventListener("change", e => { filters.subject = e.target.value; commit(); });
document.getElementById("fSurvey").addEventListener("change", e => {
  filters.survey = e.target.value; pruneSelections(); buildFilterBar(); commit();
});
document.getElementById("resetBtn").addEventListener("click", () => {
  filters = { schoolLevel: [], band: [], grade: [], schoolName: [], subject: "Both", survey: "All" };
  crossFilter = null;
  document.getElementById("fSubject").value = "Both";
  document.getElementById("fSurvey").value = "All";
  buildFilterBar();
  commit();
});



fetch("data/students.json")
  .then(r => {
    if (!r.ok) throw new Error("students.json " + r.status);
    return r.json();
  })
  .then(rows => {
    DATA = rows;
    SCHOOL_NAMES.push(...[...new Set(rows.map(d => d.schoolName).filter(Boolean))].sort());
    readHash();
    pruneSelections();
    buildFilterBar();
    render();
  })
  .catch(err => {
    document.getElementById("kpiRow").innerHTML =
      '<div class="no-data-msg">Could not load the dataset: ' + err.message + "</div>";
  });
