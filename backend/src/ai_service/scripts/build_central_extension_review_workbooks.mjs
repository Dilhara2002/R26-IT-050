/** Build two blind, independently ordered Central Province extension packets. */

import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const aiServiceDir = path.resolve(scriptDir, "..");
const evaluationDir = path.join(aiServiceDir, "data", "evaluation");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? path.resolve(process.argv[index + 1]) : fallback;
}

const evaluationPath = argValue(
  "--evaluation",
  path.join(evaluationDir, "central_province_evaluation_grid_v2.csv"),
);
const placesPath = argValue(
  "--places",
  path.join(aiServiceDir, "data", "verified", "central_province_runtime_verified_v1.csv"),
);
const outputDir = argValue("--output-dir", evaluationDir);
const previewDir = argValue("--preview-dir", null);

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let quoted = false;
  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    if (quoted) {
      if (char === '"' && text[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (char === '"') quoted = false;
      else field += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else field += char;
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers, ...data] = rows.filter((values) => values.some((value) => value !== ""));
  return data.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])));
}

async function loadCsv(filePath) {
  return parseCsv(await fs.readFile(filePath, "utf8"));
}

function seededRank(value, seed) {
  let hash = 2166136261;
  for (const char of `${seed}:${value}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

const headers = [
  "judgement_id", "profile_id", "user_interests", "place_id", "poi_name", "district",
  "latitude", "longitude", "verified_poi_tags", "source_name", "source_url",
  "relevance_label", "reviewer_notes",
];

const colors = {
  navy: "#17365D", blue: "#D9EAF7", green: "#E2F0D9", amber: "#FFF2CC",
  border: "#B4C6E7", white: "#FFFFFF", text: "#1F2937",
};

function canonicalRows(evaluation, places) {
  const placeById = new Map(places.map((place) => [place.Place_ID, place]));
  const extension = evaluation.filter(
    (row) => row.evaluation_partition === "blinded_cross_district_extension_v2",
  );
  if (extension.length !== 60) throw new Error(`Expected 60 extension rows; found ${extension.length}.`);
  const rows = extension.map((row) => {
    const place = placeById.get(row.place_id);
    if (!place || place.District === "Kandy") throw new Error(`Invalid extension POI ${row.place_id}.`);
    return [
      row.judgement_id, row.profile_id, row.user_interests, row.place_id, row.poi_name,
      row.district, Number(place.Latitude), Number(place.Longitude), row.verified_poi_tags,
      row.source_name, row.source_url, null, null,
    ];
  });
  if (new Set(rows.map((row) => row[0])).size !== 60) throw new Error("Duplicate extension judgement IDs.");
  return rows;
}

function styleWorkbook(workbook, orderedRows, newPlaces) {
  const judgements = workbook.worksheets.add("Judgements");
  const rubric = workbook.worksheets.add("Rubric");
  const reference = workbook.worksheets.add("POI Reference");
  for (const sheet of [judgements, rubric, reference]) sheet.showGridLines = false;

  judgements.getRange("A1:M1").merge();
  judgements.getRange("A1").values = [["Central Province Extension — Independent POI Relevance Review"]];
  judgements.getRange("A1:M1").format = {
    fill: colors.navy, font: { bold: true, color: colors.white, size: 16 },
    verticalAlignment: "center",
  };
  judgements.getRange("A2:M2").merge();
  judgements.getRange("A2").values = [[
    "Enter only 0, 1, or 2 in relevance_label. Work independently; use only the displayed interests, verified tags, district, coordinates, and source evidence.",
  ]];
  judgements.getRange("A2:M2").format = { fill: colors.blue, wrapText: true, font: { color: colors.text } };
  judgements.getRange("A3:F3").values = [["Required rows", 60, "Completed", null, "Blank", null]];
  judgements.getRange("G3:J3").values = [["Invalid", null, "Status", null]];
  judgements.getRange("D3").formulas = [["=COUNTIF(L6:L65,0)+COUNTIF(L6:L65,1)+COUNTIF(L6:L65,2)"]];
  judgements.getRange("F3").formulas = [["=COUNTBLANK(L6:L65)"]];
  judgements.getRange("H3").formulas = [["=COUNTA(L6:L65)-D3"]];
  judgements.getRange("J3").formulas = [["=IF(AND(D3=60,F3=0,H3=0),\"COMPLETE\",\"INCOMPLETE\")"]];
  judgements.getRange("A3:J3").format = {
    fill: colors.green, font: { bold: true, color: colors.text },
    borders: { preset: "outside", style: "thin", color: colors.border },
  };
  judgements.getRange("A5:M65").values = [headers, ...orderedRows];
  const table = judgements.tables.add("A5:M65", true, "CentralExtensionJudgements");
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  judgements.freezePanes.freezeRows(5);
  judgements.getRange("L6:L65").dataValidation = { rule: { type: "list", values: [0, 1, 2] } };
  judgements.getRange("L6:L65").format = { fill: colors.amber, horizontalAlignment: "center", numberFormat: "0" };
  judgements.getRange("A5:M65").format.verticalAlignment = "top";
  judgements.getRange("M6:M65").format.wrapText = true;
  const widths = [31, 10, 25, 29, 31, 16, 13, 13, 29, 17, 48, 16, 34];
  widths.forEach((width, index) => judgements.getRangeByIndexes(0, index, 65, 1).format.columnWidth = width);
  judgements.getRange("1:1").format.rowHeight = 28;
  judgements.getRange("2:2").format.rowHeight = 36;

  rubric.getRange("A1:D1").merge();
  rubric.getRange("A1").values = [["Independent Relevance Judgement Rubric"]];
  rubric.getRange("A1:D1").format = { fill: colors.navy, font: { bold: true, color: colors.white, size: 15 } };
  rubric.getRange("A3:B6").values = [
    ["Label", "Definition"],
    [0, "No meaningful match between selected interests and the POI."],
    [1, "Secondary or partial match."],
    [2, "Direct and strong match."],
  ];
  const rubricTable = rubric.tables.add("A3:B6", true, "CentralRelevanceRubric");
  rubricTable.style = "TableStyleMedium2";
  rubric.getRange("A8:D13").values = [
    ["Protocol", null, null, null],
    ["1", "Complete all 60 judgements independently; do not consult another reviewer.", null, null],
    ["2", "Judge interest relevance, not proximity, rating, route quality, popularity, or safety.", null, null],
    ["3", "Use only evidence shown in this packet and the direct source URL.", null, null],
    ["4", "No weak labels, model predictions, previous results, or suggested labels are included.", null, null],
    ["5", "Notes are optional; never alter identity or evidence columns.", null, null],
  ];
  rubric.getRange("A8:D8").merge();
  rubric.getRange("A8:D8").format = { fill: colors.blue, font: { bold: true, color: colors.text } };
  for (let row = 9; row <= 13; row += 1) rubric.getRange(`B${row}:D${row}`).merge();
  rubric.getRange("A9:D13").format = { wrapText: true, verticalAlignment: "top" };
  rubric.getRange("A:A").format.columnWidth = 10;
  rubric.getRange("B:D").format.columnWidth = 30;

  const referenceHeaders = ["place_id", "poi_name", "district", "latitude", "longitude", "verified_poi_tags", "source_name", "source_url"];
  const referenceRows = newPlaces.map((place) => [
    place.Place_ID, place.Name, place.District, Number(place.Latitude), Number(place.Longitude),
    place.Tags, place.Source_Name, place.Source_URL,
  ]);
  reference.getRange("A1:H1").merge();
  reference.getRange("A1").values = [["Verified Matale and Nuwara Eliya POI Reference"]];
  reference.getRange("A1:H1").format = { fill: colors.navy, font: { bold: true, color: colors.white, size: 15 } };
  reference.getRange("A3:H23").values = [referenceHeaders, ...referenceRows];
  const referenceTable = reference.tables.add("A3:H23", true, "CentralExtensionPoiReference");
  referenceTable.style = "TableStyleMedium2";
  reference.freezePanes.freezeRows(3);
  [29, 31, 16, 13, 13, 29, 17, 48].forEach(
    (width, index) => reference.getRangeByIndexes(0, index, 23, 1).format.columnWidth = width,
  );
  return { judgements, rubric, reference };
}

async function buildOne(code, rows, places) {
  const ordered = [...rows].sort(
    (left, right) => seededRank(left[0], `central-extension-${code}-v1`) - seededRank(right[0], `central-extension-${code}-v1`),
  );
  const workbook = Workbook.create();
  styleWorkbook(workbook, ordered, places);
  const tableCheck = await workbook.inspect({
    kind: "table", range: "Judgements!A5:M65", include: "values,formulas",
    tableMaxRows: 7, tableMaxCols: 13, maxChars: 6000,
  });
  const errorCheck = await workbook.inspect({
    kind: "match", searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 }, summary: "formula error scan",
  });
  console.log(tableCheck.ndjson);
  console.log(errorCheck.ndjson);
  if (previewDir) {
    await fs.mkdir(previewDir, { recursive: true });
    for (const [sheetName, range] of [["Judgements", "A1:M16"], ["Rubric", "A1:D13"], ["POI Reference", "A1:H14"]]) {
      const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
      await fs.writeFile(
        path.join(previewDir, `central_extension_${code.toLowerCase()}_${sheetName.toLowerCase().replace(/ /g, "_")}.png`),
        new Uint8Array(await preview.arrayBuffer()),
      );
    }
  }
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `reviewer_${code.toLowerCase()}_central_extension_60_v1.xlsx`);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
  console.log(`Created blank packet ${code}: ${outputPath}`);
}

const evaluation = await loadCsv(evaluationPath);
const places = await loadCsv(placesPath);
const newPlaces = places.filter((place) => place.District !== "Kandy");
if (newPlaces.length !== 20) throw new Error(`Expected 20 new district POIs; found ${newPlaces.length}.`);
const rows = canonicalRows(evaluation, places);
await buildOne("A", rows, newPlaces);
await buildOne("B", rows, newPlaces);
