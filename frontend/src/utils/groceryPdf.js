// Dependency-free, downloadable PDF for ordinary Latin-script grocery lists.
// The core PDF fonts don't support arbitrary Unicode; unsupported characters
// are replaced with '?' rather than creating a corrupt or unreadable file.
const PAGE_WIDTH = 595;
const PAGE_HEIGHT = 842;
const MARGIN = 46;

function safeText(value) {
  return String(value ?? "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[\u2010-\u2015]/g, "-")
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201c\u201d]/g, '"')
    .replace(/[^\x20-\x7e]/g, "?");
}

function pdfLiteral(value) {
  return safeText(value).replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapText(text, maxCharacters = 50) {
  const words = safeText(text).split(/\s+/);
  const lines = [];
  let line = "";
  for (let word of words) {
    while (word.length > maxCharacters) {
      if (line) { lines.push(line); line = ""; }
      lines.push(word.slice(0, maxCharacters));
      word = word.slice(maxCharacters);
    }
    if (line && (line.length + word.length + 1) > maxCharacters) {
      lines.push(line);
      line = "";
    }
    if (word) line = line ? `${line} ${word}` : word;
  }
  if (line) lines.push(line);
  return lines.length ? lines : [""];
}

function labelDate(date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function printableWeek(weekStart) {
  const [year, month, day] = weekStart.split("-").map(Number);
  const monday = new Date(Date.UTC(year, month - 1, day));
  const sunday = new Date(monday);
  sunday.setUTCDate(sunday.getUTCDate() + 6);
  return `${labelDate(monday)} - ${labelDate(sunday)}`;
}

export function createGroceryListPdf({ weekStart, items, checkedIds = [], onlyUnchecked = false }) {
  const checked = new Set(checkedIds);
  const included = onlyUnchecked ? items.filter((item) => !checked.has(item.id)) : items;
  const pages = [];
  let commands = [];
  let y = PAGE_HEIGHT - 65;

  function printText(text, x, atY, fontSize = 10) {
    commands.push(`BT /F1 ${fontSize} Tf 1 0 0 1 ${x} ${atY} Tm (${pdfLiteral(text)}) Tj ET`);
  }
  function newPage() {
    if (commands.length) pages.push(commands.join("\n"));
    commands = [];
    y = PAGE_HEIGHT - 65;
    printText("CULINARY", MARGIN, y, 19);
    y -= 26;
    printText("Weekly grocery list", MARGIN, y, 13);
    y -= 20;
    printText(printableWeek(weekStart), MARGIN, y, 10);
    y -= 15;
    printText(onlyUnchecked ? "Items remaining to buy" : "Full shopping list", MARGIN, y, 9);
    y -= 30;
  }
  function room(lines = 1) {
    if (y - lines * 15 < 58) newPage();
  }
  newPage();

  let lastCategory = "";
  for (const item of included) {
    if (item.category !== lastCategory) {
      room(3);
      y -= 7;
      printText(item.category || "Other", MARGIN, y, 12);
      y -= 22;
      lastCategory = item.category;
    }
    const prefix = checked.has(item.id) ? "[x]" : "[ ]";
    const lines = wrapText(`${prefix} ${item.name} - ${item.amount}`);
    room(lines.length + 1);
    for (const line of lines) {
      printText(line, MARGIN + 7, y, 10);
      y -= 15;
    }
    y -= 5;
  }
  if (included.length === 0) {
    printText("No items to display.", MARGIN, y, 10);
  }
  pages.push(commands.join("\n"));

  const objects = [null, "", "", "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>"];
  const pageIds = [];
  for (const [index, content] of pages.entries()) {
    const footer = `BT /F1 9 Tf 1 0 0 1 ${MARGIN} 32 Tm (Page ${index + 1} of ${pages.length}) Tj ET`;
    const stream = `${content}\n${footer}`;
    const contentId = objects.length;
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = objects.length;
    objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_WIDTH} ${PAGE_HEIGHT}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }
  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] >>`;
  let output = "%PDF-1.4\n";
  const offsets = [0];
  for (let id = 1; id < objects.length; id++) {
    offsets.push(output.length);
    output += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xref = output.length;
  output += `xref\n0 ${objects.length}\n0000000000 65535 f \n`;
  for (let id = 1; id < offsets.length; id++) {
    output += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  }
  output += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new Blob([output], { type: "application/pdf" });
}

export function downloadGroceryListPdf(options) {
  const pdf = createGroceryListPdf(options);
  const url = URL.createObjectURL(pdf);
  const link = document.createElement("a");
  link.href = url;
  link.download = `Culinary-Groceries-${options.weekStart}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
