import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(scriptDir, "..");
const defaultPackageRoot = path.resolve(webRoot, "..", "commonsense", "package");
const packageRoot = path.resolve(process.argv[2] || defaultPackageRoot);
const dataRoot = path.join(packageRoot, "data");
const outputDir = path.join(webRoot, "data");

const instanceSources = [
  ["extract", "gemini_v1_2_extract.json"],
  ["github", "gemini_v1_2_github.json"],
  ["negative", "gemini_v1_2_negative.json"],
];

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function makeSearchText(values) {
  return values
    .flat(Infinity)
    .filter((value) => value !== null && value !== undefined)
    .join(" ")
    .toLocaleLowerCase("en-US");
}

function alignGeneralizationTerminology(text) {
  return (text || "")
    .replace(/\bFamily members\b/gu, "Supporting instance-level rules")
    .replace(/\bfamily members\b/gu, "supporting instance-level rules")
    .replace(/\bFamily units\b/gu, "Supporting instance-level rules")
    .replace(/\bfamily units\b/gu, "supporting instance-level rules")
    .replace(/\bFamily's\b/gu, "Generalized rule's")
    .replace(/\bfamily's\b/gu, "generalized rule's")
    .replace(/\bFamilies\b/gu, "Generalized rules")
    .replace(/\bfamilies\b/gu, "generalized rules")
    .replace(/\bFamily\b/gu, "Generalized rule")
    .replace(/\bfamily\b/gu, "generalized rule")
    .replace(/\bVariant deltas\b/gu, "Context-specific refinements")
    .replace(/\bvariant deltas\b/gu, "context-specific refinements")
    .replace(/\bVariant delta\b/gu, "Context-specific refinement")
    .replace(/\bvariant delta\b/gu, "context-specific refinement")
    .replace(/\bVariants\b/gu, "Context-specific refinements")
    .replace(/\bvariants\b/gu, "context-specific refinements")
    .replace(/\bVariant\b/gu, "Context-specific refinement")
    .replace(/\bvariant\b/gu, "context-specific refinement")
    .replace(/\bMember-specific\b/gu, "Supporting-rule-specific")
    .replace(/\bmember-specific\b/gu, "supporting-rule-specific")
    .replace(/\bMembers\b/gu, "Supporting instance-level rules")
    .replace(/\bmembers\b/gu, "supporting instance-level rules")
    .replace(/\bMember\b/gu, "Supporting instance-level rule")
    .replace(/\bmember\b/gu, "supporting instance-level rule")
    .replace(/\bUnits\b/gu, "Instance-level rules")
    .replace(/\bunits\b/gu, "instance-level rules")
    .replace(/\bUnit\b/gu, "Instance-level rule")
    .replace(/\bunit\b/gu, "instance-level rule")
    .replace(/\bDeltas\b/gu, "Context-specific refinements")
    .replace(/\bdeltas\b/gu, "context-specific refinements")
    .replace(/\bDelta\b/gu, "Context-specific refinement")
    .replace(/\bdelta\b/gu, "context-specific refinement");
}

function alignRefinementTerminology(text) {
  return (text || "")
    .replace(/^This variant concerns\b/u, "This context-specific refinement concerns")
    .replace(/^The variant concerns\b/u, "The context-specific refinement concerns");
}

function alignRuleStateOrigin(value) {
  return (value || "").replace(/FAMILY/gu, "GENERALIZATION");
}

const manifestPath = path.join(dataRoot, "input", "issue_manifest.jsonl");
const manifestLines = (await readFile(manifestPath, "utf8"))
  .replace(/^\uFEFF/u, "")
  .split(/\r?\n/u)
  .filter(Boolean);
const manifestById = new Map(
  manifestLines.map((line) => {
    const item = JSON.parse(line);
    return [item.id, item];
  }),
);

const instances = [];
for (const [source, filename] of instanceSources) {
  const filePath = path.join(
    dataRoot,
    "checkpoints",
    "instance_level_commonsense",
    filename,
  );
  const records = await readJson(filePath);
  for (const record of records) {
    const issue = manifestById.get(record.id) || null;
    instances.push({
      ...record,
      source,
      bug_report_url: issue?.url || null,
      search_text: makeSearchText([
        record.id,
        record.domain,
        record.target_population,
        record.situation,
        record.violated_commonsense_rule,
        record.applicability_conditions,
        record.contextual_explanation,
        source,
        issue?.url,
      ]),
    });
  }
}

const generalizationPath = path.join(
  dataRoot,
  "reference",
  "commonsense_library",
  "final_commonsense_generalization_records.json",
);
const generalizationCatalog = await readJson(generalizationPath);
const stateByGeneralizedRuleId = new Map(
  generalizationCatalog.family_states.map((state) => [state.family_id, state]),
);
const generalized = generalizationCatalog.rule_families.map((sourceRule) => {
  const sourceState = stateByGeneralizedRuleId.get(sourceRule.family_id) || null;
  const alignedRationale = alignGeneralizationTerminology(
    sourceRule.family_rationale,
  );
  const contextSpecificRefinements = (sourceRule.variant_groups || []).map(
    (group) => ({
      supporting_instance_level_rule_ids: group.member_ids || [],
      situation_differences: (group.delta?.situation_differences || []).map(
        alignRefinementTerminology,
      ),
      commonsense_rule_differences: (
        group.delta?.commonsense_rule_differences || []
      ).map(alignRefinementTerminology),
    }),
  );
  const provenance = sourceRule.provenance
    ? {
        initial_generalized_rule_id:
          sourceRule.provenance.initial_family_id || null,
        generalization_batch_ids:
          sourceRule.provenance.induction_batch_ids || [],
        model: sourceRule.provenance.model,
        prompt_sha256: sourceRule.provenance.prompt_sha256,
      }
    : null;
  const ruleState = sourceState
    ? {
        generalized_rule_id: sourceState.family_id,
        version: sourceState.version,
        state_origin: alignRuleStateOrigin(sourceState.state_origin),
        newly_integrated_supporting_rule_ids:
          sourceState.newly_integrated_member_ids || [],
        content_changed_from_base_catalog:
          sourceState.content_changed_from_base_catalog,
        semantic_content_sha256: sourceState.semantic_content_sha256,
        content_sha256: sourceState.content_sha256,
        base_representation_origin: sourceState.base_representation_origin,
      }
    : null;

  return {
    generalized_rule_id: sourceRule.family_id,
    construction_origin: sourceRule.family_origin,
    situation: sourceRule.base_unit?.situation,
    generalized_commonsense_rule: sourceRule.base_unit?.commonsense_rule,
    equivalent_supporting_rule_ids: sourceRule.equivalent_member_ids || [],
    context_specific_refinements: contextSpecificRefinements,
    generalization_rationale: alignedRationale,
    rule_origin: sourceRule.base_origin,
    supporting_rule_count: sourceRule.member_count,
    supporting_instance_level_rule_ids: sourceRule.member_ids || [],
    provenance,
    rule_state: ruleState,
    search_text: makeSearchText([
      sourceRule.family_id,
      sourceRule.family_origin,
      sourceRule.base_unit?.situation,
      sourceRule.base_unit?.commonsense_rule,
      alignedRationale,
      sourceRule.member_ids,
      contextSpecificRefinements,
    ]),
  };
});

instances.sort((a, b) =>
  a.violated_commonsense_rule.localeCompare(b.violated_commonsense_rule, "en"),
);
generalized.sort((a, b) =>
  a.generalized_commonsense_rule.localeCompare(
    b.generalized_commonsense_rule,
    "en",
  ),
);

const linkedMemberIds = new Set(
  generalized.flatMap((rule) => rule.supporting_instance_level_rule_ids || []),
);
const metadata = {
  generated_at: new Date().toISOString(),
  instances: instances.length,
  generalized: generalized.length,
  issues: manifestById.size,
  linked_instances: linkedMemberIds.size,
  catalog: {
    schema_version: generalizationCatalog.schema_version,
    catalog_role: generalizationCatalog.catalog_role,
    catalog_version: generalizationCatalog.catalog_version,
    generalized_rule_count: generalizationCatalog.family_count,
    covered_unit_count: generalizationCatalog.covered_unit_count,
  },
};

await mkdir(outputDir, { recursive: true });
await Promise.all([
  writeFile(path.join(outputDir, "instances.json"), JSON.stringify(instances)),
  writeFile(path.join(outputDir, "generalized.json"), JSON.stringify(generalized)),
  writeFile(path.join(outputDir, "meta.json"), JSON.stringify(metadata, null, 2)),
]);

console.log(
  `Built ${instances.length} instance-level rules and ${generalized.length} generalized rules.`,
);

