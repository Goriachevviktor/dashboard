import ExcelJS from "exceljs";
import { buildRoadmapWorkbookXlsxBuffer } from "../src/utils/roadmapWorkbook.js";

const members = [
  { key: "viktor", name: "Виктор", initials: "ВИ", color: "#6d5bd0" },
  { key: "anna", name: "Анна", initials: "АК", color: "#22b07d" },
];

const roadmap = {
  id: "rm-test",
  title: "Продуктовый роадмап 2026",
  desc: "Ключевые продуктовые инициативы и релизы на год",
  owner: "viktor",
  memberIds: ["anna"],
  tag: "Продукт",
  status: "active",
  period: "Q1 – Q4 2026",
  progress: 38,
  lanes: [
    { id: "platform", name: "Платформа", color: "#3b6fe0" },
    { id: "mobile", name: "Мобильное приложение", color: "#6d5bd0" },
  ],
  bars: [
    { lane: "platform", title: "API v3", status: "progress", progress: 54, startDate: "2026-04-01", endDate: "2026-07-15", owner: "anna", memberIds: [] },
    { lane: "mobile", title: "Push-уведомления", status: "planned", progress: 0, startDate: "2026-05-20", endDate: "2026-06-30", owner: "viktor", memberIds: ["anna"] },
  ],
  milestones: [
    { name: "Публичный запуск", date: "2026-09-10", color: "#6d5bd0" },
  ],
  timeline: {
    startDate: "2026-01-01",
    endDate: "2026-12-31",
    months: [
      { key: "2026-0", year: 2026, month: 0, label: "Янв" },
      { key: "2026-1", year: 2026, month: 1, label: "Фев" },
      { key: "2026-2", year: 2026, month: 2, label: "Мар" },
      { key: "2026-3", year: 2026, month: 3, label: "Апр" },
      { key: "2026-4", year: 2026, month: 4, label: "Май" },
      { key: "2026-5", year: 2026, month: 5, label: "Июн" },
      { key: "2026-6", year: 2026, month: 6, label: "Июл" },
      { key: "2026-7", year: 2026, month: 7, label: "Авг" },
      { key: "2026-8", year: 2026, month: 8, label: "Сен" },
      { key: "2026-9", year: 2026, month: 9, label: "Окт" },
      { key: "2026-10", year: 2026, month: 10, label: "Ноя" },
      { key: "2026-11", year: 2026, month: 11, label: "Дек" },
    ],
    quarters: [
      { key: "2026-q0", label: "Q1 2026", months: [{}, {}, {}] },
      { key: "2026-q1", label: "Q2 2026", months: [{}, {}, {}] },
      { key: "2026-q2", label: "Q3 2026", months: [{}, {}, {}] },
      { key: "2026-q3", label: "Q4 2026", months: [{}, {}, {}] },
    ],
  },
};

const buffer = await buildRoadmapWorkbookXlsxBuffer(roadmap, members);
const size = buffer?.byteLength || buffer?.length || 0;

if ((!ArrayBuffer.isView(buffer) && !(buffer instanceof ArrayBuffer)) || size < 1000) {
  console.error("Workbook buffer is missing or too small.");
  process.exit(1);
}

const workbook = new ExcelJS.Workbook();
await workbook.xlsx.load(Buffer.from(buffer));

const sheetNames = workbook.worksheets.map(sheet => sheet.name);
const timeline = workbook.getWorksheet("Timeline");
const swim = workbook.getWorksheet("Дорожки");
const nnl = workbook.getWorksheet("Now-Next-Later");

if (!timeline || !swim || !nnl) {
  console.error("Missing required worksheet.", { sheetNames });
  process.exit(1);
}

const requiredTexts = [
  timeline.getCell("A1").value,
  swim.getCell("A1").value,
  nnl.getCell("A1").value,
  timeline.getCell("A5").value,
];

if (!String(requiredTexts[0] || "").includes("Продуктовый роадмап 2026")) {
  console.error("Timeline title not found.");
  process.exit(1);
}

if (!String(requiredTexts[3] || "").includes("Направление / задача")) {
  console.error("Timeline header not found.");
  process.exit(1);
}

console.log("Workbook validation passed.", sheetNames);
