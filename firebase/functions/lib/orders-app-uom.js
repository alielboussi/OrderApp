"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.resolveOrdersAppUom = resolveOrdersAppUom;
exports.resolveSupervisorUom = resolveSupervisorUom;
exports.formatOrdersAppUomLabel = formatOrdersAppUomLabel;
const uom_codes_1 = require("./uom-codes");
const UOM_LABEL_BY_CODE = {
    pc: "Pc(s)",
    pcs: "Pc(s)",
    each: "Each",
    g: "Gram(s)",
    kg: "Kilogram(s)",
    mg: "Milligram(s)",
    ml: "Millilitre(s)",
    l: "Litre(s)",
    cup: "Cup(s)",
    straw: "Straw(s)",
    "toilet paper": "Toilet Paper(s)",
    case: "Case(s)",
    crate: "Crate(s)",
    bottle: "Bottle(s)",
    "tin can": "Tin Can(s)",
    jar: "Jar(s)",
    block: "Block(s)",
    bucket: "Bucket(s)",
    bag: "Bag(s)",
    tray: "Tray(s)",
    plastic: "Plastic(s)",
    packet: "Packet(s)",
    box: "Box(es)",
    roll: "Roll(s)",
    bundle: "Bundle(s)",
};
const INVARIANT_UOM_CODES = new Set(["g", "kg", "mg", "ml", "l", "toilet paper"]);
function stripLabelSuffix(label) {
    const trimmed = label.trim();
    if (!trimmed)
        return trimmed;
    const esMatch = trimmed.match(/^(.+)\(es\)$/i);
    if (esMatch)
        return esMatch[1].trim();
    const sMatch = trimmed.match(/^(.+)\(s\)$/i);
    if (sMatch)
        return sMatch[1].trim();
    return trimmed;
}
function pluralizeDisplayText(text, qty) {
    const trimmed = text.trim();
    if (!trimmed)
        return trimmed;
    if (qty === 1) {
        if (trimmed.endsWith("ies"))
            return `${trimmed.slice(0, -3)}y`;
        if (trimmed.endsWith("es") && /(ch|sh|x|s)es$/i.test(trimmed))
            return trimmed.slice(0, -2);
        if (trimmed.endsWith("s") && !trimmed.endsWith("ss"))
            return trimmed.slice(0, -1);
        return trimmed;
    }
    const lower = trimmed.toLowerCase();
    if (lower.endsWith("s") || lower.endsWith("es"))
        return trimmed;
    if (lower.endsWith("y") && !/[aeiou]y$/i.test(trimmed))
        return `${trimmed.slice(0, -1)}ies`;
    if (/(ch|sh|x|s)$/i.test(trimmed))
        return `${trimmed}es`;
    return `${trimmed}s`;
}
function resolveOrdersAppUom(data, fallback = "pc") {
    for (const key of ["ordersAppUom", "orders_app_uom"]) {
        const raw = data[key];
        if (typeof raw === "string" && raw.trim())
            return (0, uom_codes_1.normalizeUomCode)(raw, fallback);
    }
    return fallback;
}
function resolveSupervisorUom(data, fallback = "pc") {
    for (const key of ["supervisorUom", "supervisor_uom"]) {
        const raw = data[key];
        if (typeof raw === "string" && raw.trim())
            return (0, uom_codes_1.normalizeUomCode)(raw, fallback);
    }
    return resolveOrdersAppUom(data, fallback);
}
function formatOrdersAppUomLabel(code, qty = 1) {
    const normalized = (0, uom_codes_1.normalizeUomCode)(code, "");
    if (!normalized)
        return qty === 1 ? "Pc" : "Pcs";
    const key = normalized.toLowerCase();
    const mappedLabel = UOM_LABEL_BY_CODE[key];
    if (!mappedLabel)
        return normalized;
    if (INVARIANT_UOM_CODES.has(key))
        return stripLabelSuffix(mappedLabel);
    const esMatch = mappedLabel.match(/^(.+)\(es\)$/i);
    if (esMatch) {
        const base = esMatch[1].trim();
        return qty === 1 ? base : `${base}es`;
    }
    const base = stripLabelSuffix(mappedLabel);
    return pluralizeDisplayText(base, qty);
}
//# sourceMappingURL=orders-app-uom.js.map