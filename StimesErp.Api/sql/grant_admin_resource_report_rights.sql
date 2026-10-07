-- Registers the web-only "Resource Report" screen (Purchase > Report) in the same
-- AdminModuleInfo / AdminUserRightsSettings tables the desktop app's own permission system uses,
-- and grants the ADMIN account (UserCode 8) full rights to it. Same pattern as
-- grant_admin_fingerprint_rights.sql - this screen has no exact desktop equivalent (desktop has a
-- different, unrelated "Resource Report" under Stimes.Accounts that only tracks Issued qty), so no
-- rights row for THIS FormClassName has ever existed.
--
-- SystemCode=4 is Purchase, ModuleTypeCode=3 is "Report" - confirmed against the existing
-- "Material Expiry Report" row and every other real Report-group entry under Purchase
-- (Report_PurchaseTransactions, Report_SupplierInfo, etc., all ModuleTypeCode=3).
--
-- ModuleCode/GenCode below are the next free IDs in those two tables as of 2026-10-05 - re-check
-- MAX(ModuleCode)/MAX(GenCode) first if other modules/rights have been added since (including by
-- running grant_admin_fingerprint_rights.sql, which already used ModuleCode 391 / GenCode 21893).

SET NOCOUNT ON;

INSERT INTO AdminModuleInfo (ModuleCode, SystemCode, ModuleTypeCode, FormShortName, FormName)
VALUES (392, 4, 3, 'Stimes.Erp.App.Win.Purchase.Report_ResourceRequestVsIssue', 'RESOURCE REPORT');

INSERT INTO AdminUserRightsSettings (GenCode, UserCode, ModuleCode, AccessYesNo, AddYesNo, EditYesNo, DeleteYesNo, SearchYesNo, ApproveYesNo)
VALUES (21894, 8, 392, 'Y', 'Y', 'Y', 'Y', 'Y', 'Y');

SELECT MM.ModuleCode, MM.SystemCode, MM.ModuleTypeCode, MM.FormShortName,
       US.UserCode, US.AccessYesNo, US.AddYesNo, US.EditYesNo, US.DeleteYesNo
FROM AdminModuleInfo MM
JOIN AdminUserRightsSettings US ON US.ModuleCode = MM.ModuleCode
WHERE MM.FormShortName = 'Stimes.Erp.App.Win.Purchase.Report_ResourceRequestVsIssue';
