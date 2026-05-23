# Example: From API Movement to Stock Quantity

This example explains how a single stock receipt from the external API becomes an on-hand stock increase, using neutral names and no sensitive details.

## Example Input (sanitized)
A stock movement arrives from the external system:

- Movement type: receive
- Product name: Muffins
- Item SKU: 357
- Warehouse: Main Prep Kitchen
- Quantity: 3
- Purchase unit (unit name): Pc(s)
- Units per pack: 1
- Unit cost: 550
- Timestamp: 2026-05-23 09:59

## Step-by-step Flow

### 1) Normalize the movement
The importer reads the movement and normalizes values:
- Quantity is parsed as a number: 3
- Purchase unit is read from the movement unit name: Pc(s)
- Units per pack is read as 1
- Unit cost is parsed as 550

### 2) Match to the catalog
The importer looks up the product using the SKU or product id:
- Item SKU 357 is found in the catalog
- The item exists, so no new product is created

If the product does not exist:
- A new catalog item is created using the API values
- The purchase unit is set from the API unit name
- The units-per-pack value is saved (defaults to 1 if missing)
- The item is marked as newly created for later period and opening logic

### 3) Storage home and stock period checks
The importer checks:
- The item has a storage home in the target warehouse
- There is an open stock period for that warehouse

If both are present, the movement can be posted. If either is missing, the import is flagged and skipped for review.

If the item is newly created:
- The system checks whether the warehouse has only new items in this import
- If yes and there is no open period, a new stock period is opened automatically

### 4) Compute effective quantity
The quantity is converted to the consumption unit:
- Effective quantity = qty * units per pack = 3 * 1 = 3

### 5) Update purchase unit on the item (if needed)
The importer compares the API unit name (Pc(s)) to the item purchase unit:
- If different, the item purchase unit is updated
- If the same, it stays unchanged

### 6) Record the receipt and stock increase
The importer records a purchase receipt with:
- The item id
- The variant key (base if no variant)
- The effective quantity (3)
- The effective unit cost

This receipt increases the on-hand stock quantity by the effective quantity.

If the item is newly created:
- An opening stock count is inserted for the open period
- The opening count uses the effective quantity
- If an opening already exists for that item+variant, it is not duplicated

## Result Summary
- The movement is marked as imported
- The item on-hand quantity increases by 3
- The purchase unit is updated only if it changed

## Notes
- Periods are only auto-opened when the warehouse contains new items only (no existing items in the same import).
- Opening stock is only created for newly created items, not for existing ones.
- All matching, conversions, and updates happen within the server import process, without manual data entry.
