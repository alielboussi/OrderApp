-- =============================================================================
-- 31 — MintPOS: restore variant GrossPrice / net price from known price list
-- =============================================================================
-- WHERE: SSMS on Quick Corner PC (or Till 1 / Till 2 if needed)
-- WHEN:  Variant prices were zeroed after a catalog push with missing Supabase
--        selling_price values.
--
-- BEFORE RUNNING:
--   1. Stop SCPGT on this till.
--   2. Run 31a on Supabase — if Supabase prices are also 0, run 29b first.
--   3. If you have a fresher export from script 28, replace the INSERT list
--      below with that data (parent_sku = MenuItem.Code, variant_sku = Name2).
--
-- AFTER RUNNING:
--   1. Verify variants_with_gross_price in the summary section.
--   2. Rebuild + redeploy SCPGT with the latest PosCatalogRepository (skips
--      zero/null price overwrites on upsert).
--   3. Start SCPGT again.
-- =============================================================================

USE [MINTPOS];
GO

DECLARE @outlet_label varchar(50) = 'Quick Corner';  -- ← change per PC

IF OBJECT_ID('tempdb..#variant_prices') IS NOT NULL
  DROP TABLE #variant_prices;

CREATE TABLE #variant_prices (
  parent_sku varchar(50) NOT NULL,
  variant_sku varchar(50) NOT NULL,
  gross_price decimal(18, 2) NOT NULL,
  PRIMARY KEY (parent_sku, variant_sku)
);

-- Same variant rows as supabase/scripts/till-reset/29b_supabase_apply_mintpos_gross_prices.sql
INSERT INTO #variant_prices (parent_sku, variant_sku, gross_price) VALUES
  ('177', '39', 140.00),
  ('177', '40', 160.00),
  ('177', '41', 7.00),
  ('177', '42', 70.00),
  ('177', '43', 90.00),
  ('177', '44', 120.00),
  ('177', '45', 140.00),
  ('243', '100', 900.00),
  ('243', '29', 120.00),
  ('243', '30', 220.00),
  ('243', '34', 500.00),
  ('243', '35', 600.00),
  ('243', '95', 220.00),
  ('243', '96', 350.00),
  ('243', '97', 500.00),
  ('243', '98', 600.00),
  ('243', '99', 800.00),
  ('244', '47', 55.00),
  ('244', '49', 45.00),
  ('244', '52', 12.00),
  ('245', '6001108028044', 35.00),
  ('245', '6001108055187', 35.00),
  ('245', '6003326015721', 25.00),
  ('245', '6003326015790', 25.00),
  ('245', '6009801472102', 30.00),
  ('245', '88', 35.00),
  ('255', '23', 45.00),
  ('255', '24', 40.00),
  ('255', '25', 15.00),
  ('255', '26', 40.00),
  ('255', '27', 25.00),
  ('255', '28', 10.00),
  ('255', '98', 10.00),
  ('357', '53', 70.00),
  ('357', '54', 70.00),
  ('357', '55', 70.00),
  ('364', '81', 15.00),
  ('364', '82', 15.00),
  ('364', '89', 6.00),
  ('364', '90', 15.00),
  ('364', '94', 15.00),
  ('364', '95', 15.00),
  ('62', '92', 5.00),
  ('62', '93', 5.00),
  ('66', '71', 15.00),
  ('66', '72', 15.00),
  ('66', '73', 15.00),
  ('66', '74', 15.00),
  ('66', '75', 15.00),
  ('66', '76', 15.00),
  ('66', '77', 15.00),
  ('66', '78', 15.00),
  ('70', '79', 15.00),
  ('70', '80', 15.00),
  ('72', '56', 15.00),
  ('72', '57', 15.00),
  ('72', '58', 15.00),
  ('72', '59', 15.00),
  ('72', '60', 15.00),
  ('72', '61', 15.00),
  ('72', '62', 15.00),
  ('72', '63', 15.00),
  ('72', '64', 15.00),
  ('72', '65', 15.00),
  ('72', '66', 15.00),
  ('72', '67', 15.00),
  ('72', '68', 15.00),
  ('72', '69', 15.00),
  ('72', '70', 15.00),
  ('72', '91', 20.00);

-- Preview: rows that will be updated
SELECT
  @outlet_label AS outlet,
  vp.parent_sku,
  vp.variant_sku,
  vp.gross_price AS new_gross_price,
  CAST(mf.GrossPrice AS decimal(18, 2)) AS current_gross_price,
  CAST(mf.price AS decimal(18, 2)) AS current_net_price
FROM #variant_prices vp
INNER JOIN dbo.MenuItem mi ON LTRIM(RTRIM(mi.Code)) = vp.parent_sku
INNER JOIN dbo.ModifierFlavour mf ON mf.MenuItemId = mi.Id AND LTRIM(RTRIM(mf.Name2)) = vp.variant_sku
ORDER BY vp.parent_sku, vp.variant_sku;

-- Apply
UPDATE mf
SET
  mf.GrossPrice = vp.gross_price,
  mf.price = ROUND(vp.gross_price / 1.16, 2),
  mf.UploadStatus = 'Pending'
FROM dbo.ModifierFlavour mf
INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
INNER JOIN #variant_prices vp
  ON LTRIM(RTRIM(mi.Code)) = vp.parent_sku
 AND LTRIM(RTRIM(mf.Name2)) = vp.variant_sku;

SELECT @@ROWCOUNT AS variants_price_restored;

-- Post-check: variants still at zero
SELECT
  @outlet_label AS outlet,
  COUNT(*) AS active_variants_with_sku,
  SUM(CASE WHEN COALESCE(mf.GrossPrice, 0) > 0 THEN 1 ELSE 0 END) AS variants_with_gross_price,
  SUM(CASE WHEN COALESCE(mf.GrossPrice, 0) <= 0 THEN 1 ELSE 0 END) AS variants_still_zero
FROM dbo.ModifierFlavour mf
INNER JOIN dbo.MenuItem mi ON mi.Id = mf.MenuItemId
WHERE NULLIF(LTRIM(RTRIM(mf.Name2)), '') IS NOT NULL
  AND COALESCE(mf.Status, 'Active') = 'Active'
  AND COALESCE(mi.Status, 'Active') = 'Active';

-- Unmatched price rows (SKU not found on this till)
SELECT
  'unmatched_variant_price' AS check_name,
  vp.parent_sku,
  vp.variant_sku,
  vp.gross_price
FROM #variant_prices vp
WHERE NOT EXISTS (
  SELECT 1
  FROM dbo.MenuItem mi
  INNER JOIN dbo.ModifierFlavour mf ON mf.MenuItemId = mi.Id
  WHERE LTRIM(RTRIM(mi.Code)) = vp.parent_sku
    AND LTRIM(RTRIM(mf.Name2)) = vp.variant_sku
)
ORDER BY vp.parent_sku, vp.variant_sku;

GO
