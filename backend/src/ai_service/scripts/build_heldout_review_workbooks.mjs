/** Build the two independent, blank 60-row held-out reviewer workbooks. */

import fs from "node:fs/promises";
import path from "node:path";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";
import JSZip from "jszip";

const scriptDir = path.dirname(new URL(import.meta.url).pathname.replace(/^\/(.:)/, "$1"));
const aiServiceDir = path.resolve(scriptDir, "..");
const evaluationDir = path.join(aiServiceDir, "data", "evaluation");

function argValue(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? path.resolve(process.argv[index + 1]) : fallback;
}

const splitPath = argValue(
  "--split",
  path.join(evaluationDir, "frozen_profile_split_seed42.csv"),
);
const placesPath = argValue(
  "--places",
  path.join(aiServiceDir, "data", "verified", "kandy_runtime_verified_v1.csv"),
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
      } else if (char === '"') {
        quoted = false;
      } else {
        field += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(field);
      field = "";
    } else if (char === "\n") {
      row.push(field.replace(/\r$/, ""));
      rows.push(row);
      row = [];
      field = "";
    } else {
      field += char;
    }
  }
  if (field || row.length) {
    row.push(field.replace(/\r$/, ""));
    rows.push(row);
  }
  const [headers, ...data] = rows.filter((item) => item.some((value) => value !== ""));
  return data.map((values) => Object.fromEntries(headers.map((header, i) => [header, values[i] ?? ""])));
}

async function loadCsv(filePath) {
  return parseCsv(await fs.readFile(filePath, "utf8"));
}

function buildHeldoutRows(splitRows, places) {
  const heldoutProfiles = splitRows.filter((row) => row.split === "heldout");
  if (heldoutProfiles.length !== 3 || places.length !== 20) {
    throw new Error(`Expected 3 held-out profiles and 20 POIs; found ${heldoutProfiles.length} and ${places.length}.`);
  }
  const rows = [];
  for (const profile of heldoutProfiles) {
    for (const place of places) {
      rows.push([
        `${profile.profile_id}::${place.Place_ID}`,
        profile.profile_id,
        profile.user_interests,
        place.Place_ID,
        place.Name,
        place.Tags,
        place.Source_Name,
        place.Source_URL,
        null,
        null,
      ]);
    }
  }
  if (rows.length !== 60 || new Set(rows.map((row) => row[0])).size !== 60) {
    throw new Error("Held-out judgement construction must produce 60 unique rows.");
  }
  return rows;
}

const headers = [
  "judgement_id", "profile_id", "user_interests", "place_id", "poi_name",
  "verified_poi_tags", "source_name", "source_url", "relevance_label", "reviewer_notes",
];

const colors = {
  navy: "#17365D",
  blue: "#D9EAF7",
  green: "#E2F0D9",
  amber: "#FFF2CC",
  red: "#FCE4D6",
  border: "#B4C6E7",
  white: "#FFFFFF",
  text: "#1F2937",
};

async function ensureFrozenJudgementHeader(outputPath) {
  // artifact-tool 2.8.6 accepts freezeRows but currently omits the pane record
  // during XLSX serialization. Patch only that OOXML control after authoring.
  const zip = await JSZip.loadAsync(await fs.readFile(outputPath));
  const sheet = zip.file("xl/worksheets/sheet1.xml");
  if (!sheet) throw new Error("Cannot locate the Judgements worksheet XML.");
  let xml = await sheet.async("string");
  if (!xml.includes("<x:pane ")) {
    const selfClosingView = /(<x:sheetView\b[^>]*)\s*\/>/;
    if (!selfClosingView.test(xml)) {
      throw new Error("Cannot locate the Judgements sheetView for freeze-pane correction.");
    }
    xml = xml.replace(
      selfClosingView,
      '$1><x:pane ySplit="5" topLeftCell="A6" activePane="bottomLeft" state="frozen" />' +
        '<x:selection pane="bottomLeft" activeCell="A6" sqref="A6" /></x:sheetView>',
    );
    zip.file("xl/worksheets/sheet1.xml", xml);
    await fs.writeFile(outputPath, await zip.generateAsync({ type: "nodebuffer" }));
  }
}

function styleWorkbook(workbook, reviewerName, heldoutRows, places) {
  const judgements = workbook.worksheets.add("Judgements");
  const rubric = workbook.worksheets.add("Rubric");
  const reference = workbook.worksheets.add("POI Reference");
  for (const sheet of [judgements, rubric, reference]) sheet.showGridLines = false;

  judgements.getRange("A1:J1").merge();
  judgements.getRange("A1").values = [[`${reviewerName} — Held-out POI Relevance Review`]];
  judgements.getRange("A1:J1").format = {
    fill: colors.navy,
    font: { bold: true, color: colors.white, size: 16 },
    verticalAlignment: "center",
  };
  judgements.getRange("A2:J2").merge();
  judgements.getRange("A2").values = [[
    "Work independently. Enter only 0, 1, or 2 in relevance_label. Do not alter identity/source fields or share labels with the other reviewer.",
  ]];
  judgements.getRange("A2:J2").format = { fill: colors.blue, font: { color: colors.text }, wrapText: true };
  judgements.getRange("A3:F3").values = [["Required rows", 60, "Completed", null, "Blank", null]];
  judgements.getRange("G3:J3").values = [["Invalid", null, "Status", null]];
  judgements.getRange("D3").formulas = [["=COUNTIF(I6:I65,0)+COUNTIF(I6:I65,1)+COUNTIF(I6:I65,2)"]];
  judgements.getRange("F3").formulas = [["=COUNTBLANK(I6:I65)"]];
  judgements.getRange("H3").formulas = [["=COUNTA(I6:I65)-D3"]];
  judgements.getRange("J3").formulas = [["=IF(AND(D3=60,F3=0,H3=0),\"COMPLETE\",\"INCOMPLETE\")"]];
  judgements.getRange("A3:J3").format = {
    fill: colors.green,
    font: { bold: true, color: colors.text },
    borders: { preset: "outside", style: "thin", color: colors.border },
  };
  judgements.getRange("A5:J65").values = [headers, ...heldoutRows];
  const table = judgements.tables.add("A5:J65", true, "HeldoutJudgements");
  table.style = "TableStyleMedium2";
  table.showFilterButton = true;
  judgements.freezePanes.freezeRows(5);
  judgements.getRange("I6:I65").dataValidation = { rule: { type: "list", values: [0, 1, 2] } };
  judgements.getRange("I6:I65").format = { fill: colors.amber, horizontalAlignment: "center", numberFormat: "0" };
  judgements.getRange("J6:J65").format.wrapText = true;
  judgements.getRange("A5:J65").format.verticalAlignment = "top";
  judgements.getRange("A:A").format.columnWidth = 29;
  judgements.getRange("B:B").format.columnWidth = 10;
  judgements.getRange("C:C").format.columnWidth = 24;
  judgements.getRange("D:D").format.columnWidth = 27;
  judgements.getRange("E:E").format.columnWidth = 31;
  judgements.getRange("F:F").format.columnWidth = 28;
  judgements.getRange("G:G").format.columnWidth = 17;
  judgements.getRange("H:H").format.columnWidth = 42;
  judgements.getRange("I:I").format.columnWidth = 16;
  judgements.getRange("J:J").format.columnWidth = 34;
  judgements.getRange("1:1").format.rowHeight = 28;
  judgements.getRange("2:2").format.rowHeight = 34;

  rubric.getRange("A1:D1").merge();
  rubric.getRange("A1").values = [["Independent Relevance Judgement Rubric"]];
  rubric.getRange("A1:D1").format = { fill: colors.navy, font: { bold: true, color: colors.white, size: 15 } };
  rubric.getRange("A3:B6").values = [
    ["Label", "Definition"],
    [0, "No meaningful match between selected interests and the POI."],
    [1, "Secondary or partial match."],
    [2, "Direct and strong match."],
  ];
  const rubricTable = rubric.tables.add("A3:B6", true, "RelevanceRubric");
  rubricTable.style = "TableStyleMedium2";
  rubric.getRange("A8:D13").values = [
    ["Protocol", null, null, null],
    ["1", "Complete all 60 judgements independently; do not consult the other reviewer.", null, null],
    ["2", "Judge user-interest relevance, not proximity, rating, route quality, or safety.", null, null],
    ["3", "Use only the displayed interests, verified tags, and source evidence.", null, null],
    ["4", "Do not enter model predictions, weak labels, or suggested labels.", null, null],
    ["5", "Reviewer notes are optional; do not change judgement IDs or evidence columns.", null, null],
  ];
  rubric.getRange("A8:D8").merge();
  rubric.getRange("A8:D8").format = { fill: colors.blue, font: { bold: true, color: colors.text } };
  for (let row = 9; row <= 13; row += 1) rubric.getRange(`B${row}:D${row}`).merge();
  rubric.getRange("A9:D13").format = { wrapText: true, verticalAlignment: "top" };
  rubric.getRange("A:A").format.columnWidth = 10;
  rubric.getRange("B:D").format.columnWidth = 29;
  rubric.freezePanes.freezeRows(3);

  const referenceHeaders = ["place_id", "poi_name", "verified_poi_tags", "source_name", "source_url"];
  const referenceRows = places.map((place) => [
    place.Place_ID, place.Name, place.Tags, place.Source_Name, place.Source_URL,
  ]);
  reference.getRange("A1:E1").merge();
  reference.getRange("A1").values = [["Verified Kandy POI Reference"]];
  reference.getRange("A1:E1").format = { fill: colors.navy, font: { bold: true, color: colors.white, size: 15 } };
  reference.getRange("A3:E23").values = [referenceHeaders, ...referenceRows];
  const referenceTable = reference.tables.add("A3:E23", true, "VerifiedPoiReference");
  referenceTable.style = "TableStyleMedium2";
  referenceTable.showFilterButton = true;
  reference.freezePanes.freezeRows(3);
  reference.getRange("A:A").format.columnWidth = 29;
  reference.getRange("B:B").format.columnWidth = 32;
  reference.getRange("C:C").format.columnWidth = 29;
  reference.getRange("D:D").format.columnWidth = 18;
  reference.getRange("E:E").format.columnWidth = 48;
  reference.getRange("A3:E23").format.verticalAlignment = "top";
  return { judgements, rubric, reference };
}

async function buildOne(reviewerCode, heldoutRows, places) {
  const workbook = Workbook.create();
  styleWorkbook(workbook, `Reviewer ${reviewerCode}`, heldoutRows, places);

  const packetCheck = await workbook.inspect({
    kind: "table",
    range: "Judgements!A5:J65",
    include: "values,formulas",
    tableMaxRows: 8,
    tableMaxCols: 10,
    maxChars: 8000,
  });
  const errorCheck = await workbook.inspect({
    kind: "match",
    searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
    options: { useRegex: true, maxResults: 100 },
    summary: "final formula error scan",
  });
  console.log(packetCheck.ndjson);
  console.log(errorCheck.ndjson);

  if (previewDir) {
    await fs.mkdir(previewDir, { recursive: true });
    for (const [sheetName, range] of [
      ["Judgements", "A1:J18"], ["Rubric", "A1:D13"], ["POI Reference", "A1:E23"],
    ]) {
      const preview = await workbook.render({ sheetName, range, scale: 1, format: "png" });
      const safeSheet = sheetName.toLowerCase().replace(/ /g, "_");
      await fs.writeFile(
        path.join(previewDir, `reviewer_${reviewerCode.toLowerCase()}_${safeSheet}.png`),
        new Uint8Array(await preview.arrayBuffer()),
      );
    }
  }

  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `reviewer_${reviewerCode.toLowerCase()}_heldout_60.xlsx`);
  const output = await SpreadsheetFile.exportXlsx(workbook);
  await output.save(outputPath);
  await ensureFrozenJudgementHeader(outputPath);
  console.log(`Created blank Reviewer ${reviewerCode} packet: ${outputPath}`);
}

const splitRows = await loadCsv(splitPath);
const places = await loadCsv(placesPath);
const heldoutRows = buildHeldoutRows(splitRows, places);
await buildOne("A", heldoutRows, places);
await buildOne("B", heldoutRows, places);
