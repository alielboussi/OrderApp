const UOM_FORMS: Record<string, readonly [singular: string, plural: string]> = {
  pc: ["pc", "pcs"],
  pcs: ["pc", "pcs"],
  each: ["pc", "pcs"],
  piece: ["piece", "pieces"],
  pieces: ["piece", "pieces"],
  g: ["g", "g"],
  kg: ["kg", "kg"],
  mg: ["mg", "mg"],
  ml: ["ml", "ml"],
  l: ["l", "l"],
  cup: ["cup", "cups"],
  straw: ["straw", "straws"],
  "toilet paper": ["toilet paper", "toilet paper"],
  case: ["case", "cases"],
  crate: ["crate", "crates"],
  bottle: ["bottle", "bottles"],
  "tin can": ["Tin Can", "Tin Cans"],
  jar: ["Jar", "Jars"],
  block: ["Block", "Blocks"],
  bucket: ["Bucket", "Buckets"],
  bag: ["Bag", "Bags"],
  tray: ["Tray", "Trays"],
  plastic: ["plastic", "plastics"],
  packet: ["Packet", "Packets"],
  box: ["Box", "Boxes"],
  roll: ["Roll", "Rolls"],
  bundle: ["Bundle", "Bundles"],
};

const INVARIANT_UOMS = new Set(["g", "kg", "mg", "ml", "l", "toilet paper"]);

function toPluralForm(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("s") || lower.endsWith("es")) return trimmed;
  if (lower.endsWith("y") && !/[aeiou]y$/i.test(trimmed)) {
    return `${trimmed.slice(0, -1)}ies`;
  }
  if (/(ch|sh|x|s)$/i.test(trimmed)) return `${trimmed}es`;
  return `${trimmed}s`;
}

function toSingularForm(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return trimmed;
  const lower = trimmed.toLowerCase();
  if (lower.endsWith("ies")) return `${trimmed.slice(0, -3)}y`;
  if (lower.endsWith("es") && /(ch|sh|x|s)es$/i.test(trimmed)) return trimmed.slice(0, -2);
  if (lower.endsWith("s") && !lower.endsWith("ss")) return trimmed.slice(0, -1);
  return trimmed;
}

export function formatOrdersAppUom(uom: string, qty: number): string {
  const trimmed = uom.trim();
  if (!trimmed) return qty === 1 ? "pc" : "pcs";

  const key = trimmed.toLowerCase();
  const mapped = UOM_FORMS[key];
  if (mapped) return qty === 1 ? mapped[0] : mapped[1];
  if (INVARIANT_UOMS.has(key)) return trimmed;

  return qty === 1 ? toSingularForm(trimmed) : toPluralForm(trimmed);
}
