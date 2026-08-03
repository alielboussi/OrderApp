type OrderWhatsAppItem = {
  name: string;
  qty: number;
  receivingUom: string;
  cost: number;
  productId?: string | null;
  variantKey?: string | null;
};

export type AcceptedOrderWhatsAppInput = {
  outletName: string;
  createdAt: string;
  orderNumber: string;
  modifiedBySupervisor: boolean;
  employeeName: string;
  supervisorName: string;
  items: OrderWhatsAppItem[];
};

type WhatsAppProductGroup = {
  productId: string;
  productName: string;
  lines: Array<{
    label: string;
    displayLabel: string;
    showAsVariant: boolean;
    qty: number;
    uom: string;
    cost: number;
    amount: number;
  }>;
};

type ProductEmojiRule = {
  emoji: string;
  keywords: string[];
};

const PRODUCT_EMOJI_RULES: ProductEmojiRule[] = [
  { emoji: "🍺", keywords: ["beer", "lager", "ale", "stout", "castle", "mosi", "chibuku", "eagle", "hunter", "black label", "cider"] },
  { emoji: "🥤", keywords: ["coca", "coke", "cola", "sprite", "fanta", "pepsi", "soft drink", "soda", "mirinda", "schweppes", "disposable"] },
  { emoji: "💧", keywords: ["water", "aqua", "borehole"] },
  { emoji: "🧃", keywords: ["juice", "squash", "cordial", "nectar"] },
  { emoji: "🥙", keywords: ["shawarma", "wrap", "kebab", "gyro"] },
  { emoji: "🍗", keywords: ["chicken", "wings", "drumstick", "poultry"] },
  { emoji: "🍔", keywords: ["burger", "cheeseburger"] },
  { emoji: "🍕", keywords: ["pizza"] },
  { emoji: "🌭", keywords: ["sausage", "hotdog", "frankfurter", "boerewors"] },
  { emoji: "🥩", keywords: ["beef", "steak", "meat", "mutton", "lamb", "pork", "biltong"] },
  { emoji: "🐟", keywords: ["fish", "kapenta", "tilapia", "bream"] },
  { emoji: "🍞", keywords: ["bread", "bun", "roll", "loaf", "bakery"] },
  { emoji: "🍚", keywords: ["rice", "pap", "nshima", "mealie"] },
  { emoji: "🍟", keywords: ["chips", "fries", "potato"] },
  { emoji: "🧀", keywords: ["cheese", "dairy", "milk", "yoghurt", "yogurt", "cream"] },
  { emoji: "🥚", keywords: ["egg"] },
  { emoji: "🍎", keywords: ["apple", "fruit"] },
  { emoji: "🥬", keywords: ["vegetable", "salad", "tomato", "onion", "cabbage", "greens"] },
  { emoji: "🌶️", keywords: ["spice", "chilli", "chili", "pepper", "sauce", "ketchup", "mayo"] },
  { emoji: "🍫", keywords: ["chocolate", "sweet", "candy", "biscuit", "cookie", "snack"] },
  { emoji: "☕", keywords: ["coffee", "tea", "cappuccino", "espresso"] },
  { emoji: "🧊", keywords: ["ice"] },
  { emoji: "🪣", keywords: ["bucket", "drum", "container"] },
  { emoji: "📦", keywords: ["case", "crate", "carton", "pack", "box"] },
  { emoji: "🍱", keywords: ["tray", "platters", "platter"] },
];

function formatReviewDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

function formatReviewTime(date: Date): string {
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  return `${hours}:${minutes}`;
}

export function formatMoney(value: number): string {
  const rounded = Math.round(Number.isFinite(value) ? value : 0);
  return `K ${rounded.toLocaleString("en-US")}`;
}

export function getProductEmoji(productName: string): string {
  const normalized = String(productName ?? "").trim().toLowerCase();
  if (!normalized) return "📦";

  for (const rule of PRODUCT_EMOJI_RULES) {
    if (rule.keywords.some((keyword) => normalized.includes(keyword))) {
      return rule.emoji;
    }
  }

  return "📦";
}

function getUomEmoji(uom: string): string {
  const normalized = String(uom ?? "").trim().toLowerCase();
  if (!normalized) return "🔢";
  if (normalized.includes("tray")) return "🍱";
  if (normalized.includes("case") || normalized.includes("crate") || normalized.includes("carton")) return "📦";
  if (normalized.includes("bottle")) return "🍾";
  if (normalized.includes("can")) return "🥫";
  if (normalized.includes("kg") || normalized.includes("kilo")) return "⚖️";
  if (normalized.includes("litre") || normalized.includes("liter") || normalized.includes("ltr")) return "🧴";
  return "🔢";
}

function productBaseName(name: string): string {
  const trimmed = name.trim();
  const separator = trimmed.indexOf(" - ");
  return separator > 0 ? trimmed.slice(0, separator) : trimmed;
}

function resolveVariantDisplayLabel(baseName: string, fullName: string): string {
  const base = baseName.trim();
  const full = fullName.trim();
  if (!full) return "";
  if (!base) return full;
  if (full.toLowerCase() === base.toLowerCase()) return full;

  const dashPrefix = `${base} - `;
  if (full.startsWith(dashPrefix)) return full.slice(dashPrefix.length).trim();

  if (full.toLowerCase().startsWith(base.toLowerCase())) {
    const remainder = full.slice(base.length).trim();
    if (remainder) return remainder;
  }

  return full;
}

function groupWhatsAppItems(items: OrderWhatsAppItem[]): WhatsAppProductGroup[] {
  const groups = new Map<string, WhatsAppProductGroup>();

  for (const item of items) {
    const label = String(item.name ?? "").trim() || "Item";
    const key = String(item.productId ?? "").trim() || label;
    const baseProductName = productBaseName(label);
    const qty = Number(item.qty ?? 0);
    const cost = Number(item.cost ?? 0);
    const amount = qty * cost;
    const uom = String(item.receivingUom ?? "each").trim() || "each";
    const variantKey = String(item.variantKey ?? "").trim();
    const showAsVariant = Boolean(variantKey) || label.toLowerCase() !== baseProductName.toLowerCase();

    const group =
      groups.get(key) ??
      ({
        productId: key,
        productName: baseProductName || label,
        lines: [],
      } satisfies WhatsAppProductGroup);

    if (baseProductName) group.productName = baseProductName;

    group.lines.push({
      label,
      displayLabel: resolveVariantDisplayLabel(group.productName, label),
      showAsVariant,
      qty,
      uom,
      cost,
      amount,
    });
    groups.set(key, group);
  }

  return [...groups.values()]
    .map((group) => {
      const productName = group.productName.trim() || group.lines[0]?.label || "Item";
      return {
        ...group,
        productName,
        lines: [...group.lines].sort((left, right) =>
          left.label.localeCompare(right.label, undefined, { sensitivity: "base" }),
        ),
      };
    })
    .sort((left, right) =>
      left.productName.localeCompare(right.productName, undefined, { sensitivity: "base" }),
    );
}

function formatWhatsAppLineItem(line: WhatsAppProductGroup["lines"][number]): string {
  const uomEmoji = getUomEmoji(line.uom);
  const lineEmoji = getProductEmoji(line.displayLabel || line.label);
  const label = line.showAsVariant ? `(-) ${line.displayLabel}` : line.displayLabel;
  return `${lineEmoji} • ${label}\n   ${uomEmoji} ${line.qty} ${line.uom} × ${formatMoney(line.cost)} = ${formatMoney(line.amount)}`;
}

function formatWhatsAppProductGroup(group: WhatsAppProductGroup): string[] {
  const headerEmoji = getProductEmoji(group.productName);
  const lines = [
    `${headerEmoji} *${group.productName}*`,
    "────────────",
    ...group.lines.map((line) => formatWhatsAppLineItem(line)),
  ];
  return lines;
}

export function formatAcceptedOrderWhatsAppMessage(input: AcceptedOrderWhatsAppInput): string {
  const created = new Date(input.createdAt);
  const safeDate = Number.isFinite(created.getTime()) ? created : new Date();
  const productGroups = groupWhatsAppItems(input.items);
  const productSections = productGroups.flatMap((group, index) => {
    const block = formatWhatsAppProductGroup(group);
    return index === 0 ? block : ["", ...block];
  });
  const total = input.items.reduce(
    (sum, item) => sum + Number(item.qty ?? 0) * Number(item.cost ?? 0),
    0,
  );
  const approvalLine = input.modifiedBySupervisor
    ? `✏️ *Edited & Approved By Supervisor Name:* ${input.supervisorName}`
    : `✅ *Approved By Supervisor Name:* ${input.supervisorName}`;

  return [
    "🔔 *New Outlet Order*",
    "━━━━━━━━━━━━━━━━━━━━",
    `🏪 *Outlet Name:* ${input.outletName}`,
    `📅 *Date:* ${formatReviewDate(safeDate)}`,
    `🕐 *Time:* ${formatReviewTime(safeDate)}`,
    `🔢 *Order Number:* ${input.orderNumber}`,
    "✅ *Status:* Order Accepted",
    "",
    "🛒 *Products Ordered:*",
    "",
    ...(productSections.length ? productSections : ["📦 *No items*"]),
    "",
    "━━━━━━━━━━━━━━━━━━━━",
    `💰 *Total Amount:* ${formatMoney(total)}`,
    "",
    `👤 *Ordered By Outlet Employee Name:* ${input.employeeName}`,
    approvalLine,
    "",
    "🚚 *Ready for driver handover*",
  ].join("\n");
}
