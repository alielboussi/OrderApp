# Coldrooms Scanner App (Android)

Goal: Build a Kotlin Android app that mirrors the Beverages Storeroom App UI/flow, but for Coldrooms.

## Auth
- Use Supabase table `public.stocktake_app_users` (same schema as provided).
- Only users in this table can sign in.
- Login screen matches Beverages Storeroom App layout, but header text is **Coldrooms**.

## Dashboard
- Same grid card layout as Beverages Storeroom App.
- Show only: Transfers, Purchases, Damages.
- Do NOT show Homes.

## Transfers flow
- Show popup 1: **From warehouse** selection (single selection).
- Show popup 2: **To warehouse** selection (single selection).
- Use 2-column grid buttons for both popups.
- Warehouses list (same for both popups):
  - d4ad6512-6d0b-448f-b407-e74b0eb80edb
  - 89e4a592-1385-4b40-9685-2178f124a9da
  - 94f86655-bed8-404c-8614-007a846f89f2
  - 647ca589-f688-4c9a-b137-78efedd5dbf5
  - 32ad8045-1526-4aaa-85d9-e762b9ec8bcc
  - 99547ec7-3220-40c8-859b-29d26ca5a4ca
  - 9a55ecbd-aa45-4f02-9e16-f567b8779674
  - 9885ad87-66e0-46ec-8872-ce58c524b739
  - 6c488b69-e793-45e0-a744-441924f5f4bb
  - d829d739-7311-4647-af91-cad33c21280e
  - 9d0a3a83-1fea-45a8-8771-25cc1db9f07e

### Products page (Transfers)
- Show search field + barcode scanner on the products page.
- Grid layout 2 columns (same as Beverages).
- If base item only: tap item -> qty popup.
- If variants exist: tap base item -> variants page.
- Variants page shows 2-column grid; tap variant -> qty popup.
- Qty popup:
  - Show label: **How its consumed**
  - Show UOM with pluralization (same logic as Beverages)

### Transfer summary
- Show: From warehouse, To warehouse, Username, Date & Time.
- Date format: `dd/MM/yyyy` and time with timezone text `UTC +2;00`.
- Provide PDF download button and upload to **Transfers** bucket.
- Button: **Complete Transfer** (process transfer).

## Purchases flow
- Popup 1: select **To warehouse** (single selection) from the same warehouse list above.
- Popup 2: select **Supplier** (single selection) from:
  - 52d80bde-82e5-4c0c-b65f-38e21f4162fa
  - 6f63a8f4-204c-4e38-a8bb-2bfa73584151
  - a24fb040-307f-41f5-9751-768daf52e96b
  - c7fd97d7-ef1a-4cc0-9125-836e15bb4ba4
- After supplier selection, show invoice number input.
- Then go to products page (same layout/logic as Transfers).

### Purchase summary
- Show: To warehouse, Supplier, Username, Date & Time.
- Date format: `dd/MM/yyyy` and time with timezone text `UTC +2;00`.
- PDF download button and upload to **Purchases** bucket.
- Button: **Process Purchase**.

## Damages flow
- Popup: select **Warehouse** from same warehouse list (single selection).
- Products page: same search + barcode + grid + variants flow as Transfers.

### Damages summary
- Same layout/behavior as Beverages Storeroom App damages summary.
- PDF download button and upload to **Damages** bucket.
- Button: **Confirm Damage**.

## Global UI/UX
- Use same theme, fonts, colors, and spacing as Beverages Storeroom App.
- Use same barcode scanner behavior on all products pages.
- Keep flows and wording aligned to Beverages where applicable.
