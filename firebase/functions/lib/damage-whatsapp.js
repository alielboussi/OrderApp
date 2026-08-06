"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.formatApprovedDamageWhatsAppMessage = formatApprovedDamageWhatsAppMessage;
function formatReviewDate(date) {
    const day = String(date.getDate()).padStart(2, "0");
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
}
function formatReviewTime(date) {
    const hours = String(date.getHours()).padStart(2, "0");
    const minutes = String(date.getMinutes()).padStart(2, "0");
    return `${hours}:${minutes}`;
}
function formatApprovedDamageWhatsAppMessage(input) {
    const reported = new Date(input.reportedAt);
    const safeDate = Number.isFinite(reported.getTime()) ? reported : new Date();
    const totalQty = input.lines.reduce((sum, line) => sum + Number(line.qty ?? 0), 0);
    const lineBlocks = input.lines.length > 0
        ? input.lines.map((line) => `📦 • ${line.name.trim() || "Item"}\n   🔢 ${line.qty} Pc(s)`)
        : ["📦 • No line items"];
    return [
        "⚠️ *Outlet Damage Report Approved*",
        "━━━━━━━━━━━━━━━━━━━━",
        `🏪 *Outlet Name:* ${input.outletName}`,
        `📅 *Date:* ${formatReviewDate(safeDate)}`,
        `🕐 *Time:* ${formatReviewTime(safeDate)}`,
        `🔢 *Report Ref:* ${input.reportNumber}`,
        "✅ *Status:* Accepted by Supervisor",
        "",
        "📸 *Damage Photo:* attached below",
        "",
        "🧾 *Damaged Items:*",
        "",
        ...lineBlocks,
        "",
        "━━━━━━━━━━━━━━━━━━━━",
        `📊 *Total Damaged Qty:* ${totalQty} Pc(s)`,
        "",
        `👤 *Reported By:* ${input.reportedByName}`,
        `✅ *Approved By:* ${input.supervisorName}`,
        "",
        "📋 *Warehouse action:* review photo and process stock write-off",
    ].join("\n");
}
//# sourceMappingURL=damage-whatsapp.js.map