"use strict";

const app = document.querySelector("#app");
const homeTemplate = document.querySelector("#home-template");
const collator = new Intl.Collator("en", { sensitivity: "base" });
const PAGE_SIZE = 50;

const state = {
  instances: [],
  generalized: [],
  instanceById: new Map(),
  generalizedRulesBySupportingRuleId: new Map(),
  meta: null,
  catalog: {
    type: null,
    query: "",
    letter: "All",
    sort: "az",
    page: 1,
  },
};

const el = (tag, className, text) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
};

function number(value) {
  return new Intl.NumberFormat("en-US").format(value || 0);
}

function setActiveNav(route) {
  document.querySelectorAll(".primary-nav a").forEach((link) => {
    link.classList.toggle("active", link.dataset.route === route);
  });
}

function updateDocumentTitle(title) {
  document.title = title
    ? `${title} · AutoTestSense Knowledge Base`
    : "AutoTestSense Knowledge Base";
}

async function loadData() {
  const [instancesResponse, generalizedResponse, metaResponse] = await Promise.all([
    fetch("./data/instances.json"),
    fetch("./data/generalized.json"),
    fetch("./data/meta.json"),
  ]);
  if (![instancesResponse, generalizedResponse, metaResponse].every((r) => r.ok)) {
    throw new Error("The catalog data could not be loaded.");
  }

  state.instances = await instancesResponse.json();
  state.generalized = await generalizedResponse.json();
  state.meta = await metaResponse.json();
  state.instanceById = new Map(state.instances.map((item) => [item.id, item]));

  for (const rule of state.generalized) {
    for (const supportingRuleId of rule.supporting_instance_level_rule_ids || []) {
      const relatedRules =
        state.generalizedRulesBySupportingRuleId.get(supportingRuleId) || [];
      relatedRules.push(rule.generalized_rule_id);
      state.generalizedRulesBySupportingRuleId.set(
        supportingRuleId,
        relatedRules,
      );
    }
  }
}

function renderHome() {
  setActiveNav(null);
  updateDocumentTitle("");
  const fragment = homeTemplate.content.cloneNode(true);
  fragment.querySelector('[data-stat="generalized"]').textContent = number(
    state.meta.generalized,
  );
  fragment.querySelector('[data-stat="instances"]').textContent = number(
    state.meta.instances,
  );
  fragment.querySelector('[data-stat="issues"]').textContent = number(
    state.meta.issues,
  );
  app.replaceChildren(fragment);
}

function resetCatalogState(type) {
  if (state.catalog.type !== type) {
    state.catalog = { type, query: "", letter: "All", sort: "az", page: 1 };
  }
}

function itemTitle(item, type) {
  return type === "generalized"
    ? item.generalized_commonsense_rule
    : item.violated_commonsense_rule;
}

function itemSubtitle(item, type) {
  return type === "generalized" ? item.situation : item.situation;
}

function initialLetter(item, type) {
  const text = itemTitle(item, type).trim();
  const match = text.match(/[A-Za-z]/u);
  return match ? match[0].toUpperCase() : "#";
}

function filteredCatalog(type) {
  const source = type === "generalized" ? state.generalized : state.instances;
  const query = state.catalog.query.trim().toLocaleLowerCase("en-US");
  let result = source.filter((item) => {
    const matchesQuery = !query || item.search_text.includes(query);
    const matchesLetter =
      state.catalog.letter === "All" ||
      initialLetter(item, type) === state.catalog.letter;
    return matchesQuery && matchesLetter;
  });

  result = [...result].sort((a, b) => {
    if (state.catalog.sort === "id") {
      const aId = type === "generalized" ? a.generalized_rule_id : a.id;
      const bId = type === "generalized" ? b.generalized_rule_id : b.id;
      return collator.compare(aId, bId);
    }
    const direction = state.catalog.sort === "za" ? -1 : 1;
    return direction * collator.compare(itemTitle(a, type), itemTitle(b, type));
  });
  return result;
}

function makeSearchIcon() {
  const wrapper = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  wrapper.setAttribute("viewBox", "0 0 24 24");
  wrapper.setAttribute("fill", "none");
  wrapper.setAttribute("stroke", "currentColor");
  wrapper.setAttribute("stroke-width", "2");
  wrapper.setAttribute("aria-hidden", "true");
  const circle = document.createElementNS("http://www.w3.org/2000/svg", "circle");
  circle.setAttribute("cx", "11");
  circle.setAttribute("cy", "11");
  circle.setAttribute("r", "7");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", "m20 20-3.5-3.5");
  wrapper.append(circle, path);
  return wrapper;
}

function renderCatalog(type) {
  resetCatalogState(type);
  setActiveNav(type === "generalized" ? "generalized" : "instances");
  updateDocumentTitle(type === "generalized" ? "Generalized" : "Instance-level");

  const page = el("section", "catalog-page page-shell");
  const heading = el("div", "catalog-heading");
  const headingText = el("div");
  headingText.append(
    el(
      "div",
      "eyebrow",
      type === "generalized" ? "Reusable behavioral knowledge" : "Report-grounded rules",
    ),
    el(
      "h1",
      "",
      type === "generalized"
        ? "Generalized commonsense rules"
        : "Instance-level commonsense rules",
    ),
    el(
      "p",
      "",
      type === "generalized"
        ? "Browse reusable behavioral expectations and trace each generalized rule to its supporting instance-level rules."
        : "Browse structured behavioral expectations extracted from individual bug reports and follow each rule to its source.",
    ),
  );
  const total = type === "generalized" ? state.generalized.length : state.instances.length;
  heading.append(headingText, el("div", "catalog-count", `${number(total)} records`));

  const controls = el("div", "search-panel");
  const field = el("label", "search-field");
  field.append(makeSearchIcon());
  const input = el("input");
  input.type = "search";
  input.placeholder = "Search rules, situations, domains, IDs…";
  input.value = state.catalog.query;
  input.setAttribute("aria-label", "Search catalog");
  field.append(input);
  const sort = el("select");
  sort.setAttribute("aria-label", "Sort results");
  [
    ["az", "Description A–Z"],
    ["za", "Description Z–A"],
    ["id", "Record ID"],
  ].forEach(([value, label]) => {
    const option = el("option", "", label);
    option.value = value;
    option.selected = state.catalog.sort === value;
    sort.append(option);
  });
  controls.append(field, sort);

  const alphabet = el("div", "alphabet");
  alphabet.setAttribute("aria-label", "Filter by first letter");
  ["All", ..."ABCDEFGHIJKLMNOPQRSTUVWXYZ"].forEach((letter) => {
    const button = el("button", state.catalog.letter === letter ? "active" : "", letter);
    button.type = "button";
    button.addEventListener("click", () => {
      state.catalog.letter = letter;
      state.catalog.page = 1;
      renderCatalog(type);
    });
    alphabet.append(button);
  });

  const results = el("div");
  const refreshResults = () => {
    const filtered = filteredCatalog(type);
    const maxPage = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    state.catalog.page = Math.min(state.catalog.page, maxPage);
    const start = (state.catalog.page - 1) * PAGE_SIZE;
    const visible = filtered.slice(start, start + PAGE_SIZE);

    const meta = el("div", "results-meta");
    meta.append(
      el("span", "", `${number(filtered.length)} matches`),
      el(
        "span",
        "",
        filtered.length
          ? `${number(start + 1)}–${number(Math.min(start + PAGE_SIZE, filtered.length))}`
          : "0 results",
      ),
    );

    const list = el("div", "catalog-list");
    if (!visible.length) {
      const empty = el("div", "empty-state");
      empty.append(el("h2", "", "No matching commonsense found"));
      empty.append(el("p", "", "Try a broader keyword or reset the letter filter."));
      list.append(empty);
    } else {
      visible.forEach((item, index) => {
        const id = type === "generalized" ? item.generalized_rule_id : item.id;
        const link = el("a", "catalog-item");
        link.href = `#/${type === "generalized" ? "generalized" : "instance"}/${encodeURIComponent(id)}`;
        link.style.setProperty("--item-index", String(Math.min(index, 12)));
        const body = el("div");
        body.append(
          el("span", "item-field-label", "Commonsense Rule"),
          el("h2", "item-title", itemTitle(item, type)),
          el("span", "item-field-label item-situation-label", "Situation"),
          el("p", "item-situation", itemSubtitle(item, type)),
        );
        const itemMeta = el("div", "item-meta");
        itemMeta.append(
          el(
            "span",
            "pill",
            type === "generalized"
              ? `${item.supporting_rule_count} supporting rules`
              : item.domain || item.source,
          ),
          el("span", "", "View details →"),
        );
        link.append(el("span", "item-id", id), body, itemMeta);
        list.append(link);
      });
    }

    const pagination = el("div", "pagination");
    const previous = el("button", "", "← Previous");
    previous.disabled = state.catalog.page <= 1;
    previous.addEventListener("click", () => {
      state.catalog.page -= 1;
      renderCatalog(type);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    const next = el("button", "", "Next →");
    next.disabled = state.catalog.page >= maxPage;
    next.addEventListener("click", () => {
      state.catalog.page += 1;
      renderCatalog(type);
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    pagination.append(
      previous,
      el("span", "", `Page ${state.catalog.page} of ${maxPage}`),
      next,
    );
    results.replaceChildren(meta, list, pagination);
  };

  input.addEventListener("input", () => {
    state.catalog.query = input.value;
    state.catalog.page = 1;
    refreshResults();
  });
  sort.addEventListener("change", () => {
    state.catalog.sort = sort.value;
    state.catalog.page = 1;
    refreshResults();
  });

  page.append(heading, controls, alphabet, results);
  app.replaceChildren(page);
  refreshResults();
  input.focus({ preventScroll: true });
}

function infoCard(title, content) {
  const card = el("section", "info-card");
  card.append(el("h2", "", title), content);
  return card;
}

function textBlock(text) {
  return el("p", "", text || "Not provided");
}

function listBlock(items) {
  if (!items?.length) return textBlock("Not provided");
  const list = el("ul");
  items.forEach((item) => list.append(el("li", "", item)));
  return list;
}

function rawJsonCard(record) {
  const { search_text: _searchText, ...displayRecord } = record;
  const details = el("details", "info-card raw-json");
  details.append(el("summary", "", "View complete JSON record"));
  details.append(el("pre", "", JSON.stringify(displayRecord, null, 2)));
  return details;
}

function makeFacts(entries) {
  const facts = el("dl", "fact-list");
  entries.forEach(([term, value]) => {
    const row = el("div");
    row.append(el("dt", "", term), el("dd", "", value ?? "Not provided"));
    facts.append(row);
  });
  return facts;
}

function coreField(label, value, className, tagName = "p") {
  const field = el("section", `core-field ${className}`);
  field.dataset.coreField =
    label === "Situation" ? "situation" : "commonsense-rule";
  field.append(
    el("span", "core-field-label", label),
    el(tagName, "core-field-value", value || "Not provided"),
  );
  return field;
}

function renderInstanceDetail(id) {
  const item = state.instanceById.get(id);
  if (!item) return renderNotFound("Instance not found");
  setActiveNav("instances");
  updateDocumentTitle(item.id);

  const page = el("article", "detail-page");
  const back = el("a", "back-link", "← Back to instance-level catalog");
  back.href = "#/instances";

  const hero = el("header", "detail-hero");
  const kicker = el("div", "detail-kicker");
  kicker.append(el("span", "pill", item.id), el("span", "pill", item.domain));
  hero.append(
    kicker,
    el("h1", "detail-type-title", "Instance-Level Commonsense Rule"),
    coreField("Situation", item.situation, "core-situation"),
    coreField(
      "Commonsense Rule",
      item.violated_commonsense_rule,
      "core-rule",
      "p",
    ),
  );

  const grid = el("div", "detail-grid");
  const main = el("div", "detail-main");
  main.append(
    infoCard("Contextual explanation", textBlock(item.contextual_explanation)),
    infoCard("Applicability conditions", listBlock(item.applicability_conditions)),
  );

  const generalizedRuleIds =
    state.generalizedRulesBySupportingRuleId.get(item.id) || [];
  if (generalizedRuleIds.length) {
    const members = el("div", "member-list");
    generalizedRuleIds.forEach((generalizedRuleId) => {
      const generalizedRule = state.generalized.find(
        (entry) => entry.generalized_rule_id === generalizedRuleId,
      );
      const link = el("a", "member-card");
      link.href = `#/generalized/${encodeURIComponent(generalizedRuleId)}`;
      link.append(
        el("strong", "", generalizedRuleId),
        el(
          "span",
          "",
          generalizedRule?.generalized_commonsense_rule ||
            "Generalized commonsense rule",
        ),
      );
      members.append(link);
    });
    main.append(infoCard("Related generalized commonsense rules", members));
  }
  main.append(rawJsonCard(item));

  const aside = el("aside", "detail-aside");
  aside.append(
    infoCard(
      "Record facts",
      makeFacts([
        ["Record ID", item.id],
        ["Source set", item.source],
        ["Domain", item.domain],
        ["Target population", item.target_population],
        ["Confidence", String(item.confidence_score)],
      ]),
    ),
  );
  if (item.bug_report_url) {
    const link = el("a", "external-link");
    link.href = item.bug_report_url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.append(el("span", "", "Open original bug report"), el("span", "", "↗"));
    aside.append(link);
  }

  grid.append(main, aside);
  page.append(back, hero, grid);
  app.replaceChildren(page);
  window.scrollTo(0, 0);
}

function renderGeneralizedDetail(id) {
  const item = state.generalized.find(
    (entry) => entry.generalized_rule_id === id,
  );
  if (!item) return renderNotFound("Generalized commonsense rule not found");
  setActiveNav("generalized");
  updateDocumentTitle(item.generalized_rule_id);

  const page = el("article", "detail-page");
  const back = el("a", "back-link", "← Back to generalized catalog");
  back.href = "#/generalized";

  const hero = el("header", "detail-hero");
  const kicker = el("div", "detail-kicker");
  kicker.append(
    el("span", "pill", item.generalized_rule_id),
    el(
      "span",
      "pill",
      `${item.supporting_rule_count} supporting instance-level rules`,
    ),
  );
  hero.append(
    kicker,
    el("h1", "detail-type-title", "Generalized Commonsense Rule"),
    coreField("Situation", item.situation, "core-situation"),
    coreField(
      "Commonsense Rule",
      item.generalized_commonsense_rule,
      "core-rule",
      "p",
    ),
  );

  const grid = el("div", "detail-grid");
  const main = el("div", "detail-main");
  main.append(
    infoCard(
      "Generalization rationale",
      textBlock(item.generalization_rationale),
    ),
  );

  const members = el("div", "member-list");
  (item.supporting_instance_level_rule_ids || []).forEach((supportingRuleId) => {
    const member = state.instanceById.get(supportingRuleId);
    const link = el("a", "member-card");
    link.href = `#/instance/${encodeURIComponent(supportingRuleId)}`;
    link.append(
      el("strong", "", supportingRuleId),
      el(
        "span",
        "",
        member?.violated_commonsense_rule || "Instance record unavailable",
      ),
    );
    members.append(link);
  });
  main.append(infoCard("Supporting instance-level rules", members));

  if (item.context_specific_refinements?.length) {
    const refinements = el("div");
    item.context_specific_refinements.forEach((refinement, index) => {
      const block = el("div");
      if (index) block.style.marginTop = "18px";
      block.append(
        el(
          "strong",
          "",
          `Refinement ${index + 1}: ${refinement.supporting_instance_level_rule_ids.join(", ")}`,
        ),
      );
      if (refinement.situation_differences?.length) {
        block.append(listBlock(refinement.situation_differences));
      }
      refinements.append(block);
    });
    main.append(infoCard("Context-specific refinements", refinements));
  }
  main.append(rawJsonCard(item));

  const aside = el("aside", "detail-aside");
  aside.append(
    infoCard(
      "Generalized rule details",
      makeFacts([
        ["Generalized rule ID", item.generalized_rule_id],
        ["Construction origin", item.construction_origin],
        ["Rule origin", item.rule_origin],
        ["Supporting rules", String(item.supporting_rule_count)],
        ["Model", item.provenance?.model],
        ["Knowledge-base state", item.rule_state?.state_origin],
      ]),
    ),
  );

  grid.append(main, aside);
  page.append(back, hero, grid);
  app.replaceChildren(page);
  window.scrollTo(0, 0);
}

function renderAbout() {
  setActiveNav("about");
  updateDocumentTitle("About");
  const page = el("section", "about-page");
  page.append(
    el("div", "eyebrow", "Dataset guide"),
    el("h1", "", "From observed failures to reusable expectations."),
    el(
      "p",
      "about-lead",
      "This explorer presents two connected views of commonsense knowledge extracted from software bug reports. It is a static research artifact: all filtering happens locally in your browser, and no query is sent to a server.",
    ),
  );

  const grid = el("div", "about-grid");
  grid.append(
    infoCard(
      "Instance-level commonsense rules",
      textBlock(
        `${number(state.meta.instances)} report-grounded rules preserve the situation, violated commonsense rule, applicability conditions, contextual explanation, confidence, and source bug report URL.`,
      ),
    ),
    infoCard(
      "Generalized commonsense rules",
      textBlock(
        `${number(state.meta.generalized)} reusable rules capture shared behavioral expectations while retaining direct links to their supporting instance-level rules and context-specific refinements.`,
      ),
    ),
    infoCard(
      "Search behavior",
      textBlock(
        "Keyword search covers rule descriptions, situations, domains, explanations, conditions, IDs, and provenance fields. The alphabetical filter follows the first letter of each rule description.",
      ),
    ),
    infoCard(
      "Bug reports",
      textBlock(
        "Instance records link to the original public issue URL when present. The report body is not duplicated in this static catalog.",
      ),
    ),
  );
  page.append(grid);
  app.replaceChildren(page);
  window.scrollTo(0, 0);
}

function renderNotFound(message = "Page not found") {
  setActiveNav(null);
  updateDocumentTitle("Not found");
  const section = el("section", "error-state");
  section.append(el("h1", "", message));
  const link = el("a", "", "Return to the catalog home");
  link.href = "#/";
  section.append(link);
  app.replaceChildren(section);
}

function route() {
  const parts = location.hash.replace(/^#\/?/u, "").split("/").filter(Boolean);
  const [routeName, encodedId] = parts;
  const id = encodedId ? decodeURIComponent(encodedId) : null;

  if (!routeName) return renderHome();
  if (routeName === "generalized" && id) return renderGeneralizedDetail(id);
  if (routeName === "generalized") return renderCatalog("generalized");
  if (routeName === "instances") return renderCatalog("instances");
  if (routeName === "instance" && id) return renderInstanceDetail(id);
  if (routeName === "about") return renderAbout();
  return renderNotFound();
}

window.addEventListener("hashchange", route);

loadData()
  .then(route)
  .catch((error) => {
    const section = el("section", "error-state");
    section.append(el("h1", "", "Catalog unavailable"));
    section.append(el("p", "", error.message));
    app.replaceChildren(section);
  });

