-- Registers the web-only "Fingerprint Login" screen (System Admin > Basic) in the same
-- AdminModuleInfo / AdminUserRightsSettings tables the desktop app's own permission system
-- uses, and grants the ADMIN account (UserCode 8) full rights to it. This screen has no desktop
-- equivalent, so no row for it has ever existed - that's why usp_GetUserRightSecurity returns
-- nothing and the web app shows "You do not have permission to view this form." even for ADMIN.
--
-- ModuleTypeCode=1 is "Basic" and ModuleTypeCode=2 is "Activity" under Administration (confirmed
-- against the existing rows: BRANCH/CURRENCY/RELIGION/FORMS are all ModuleTypeCode=1, while
-- CATEGORY/USER ACCOUNT/SYSTEM RIGHTS/MODULE RIGHTS/Approval Request are all ModuleTypeCode=2) -
-- Fingerprint Login needs 1 so it lands under Administration > Basic, matching the web sidebar.
--
-- ModuleCode 391 and GenCode 21893 are the next free IDs in those two tables as of 2026-10-05 -
-- re-check MAX(ModuleCode)/MAX(GenCode) first if other modules/rights have been added since.
--
-- After this runs, "FINGERPRINT LOGIN" will also appear as a 5th row in the desktop's own
-- Administration > Module Right Settings > Basic grid (alongside Branch/Currency/Religion/Forms) -
-- that screen can then be used directly to grant the same access to any other user, instead of
-- editing this table by hand again.

SET NOCOUNT ON;

INSERT INTO AdminModuleInfo (ModuleCode, SystemCode, ModuleTypeCode, FormShortName, FormName)
VALUES (391, 6, 1, 'Stimes.Erp.App.Win.SystemAdmin.FingerprintLogin', 'FINGERPRINT LOGIN');

INSERT INTO AdminUserRightsSettings (GenCode, UserCode, ModuleCode, AccessYesNo, AddYesNo, EditYesNo, DeleteYesNo, SearchYesNo, ApproveYesNo)
VALUES (21893, 8, 391, 'Y', 'Y', 'Y', 'Y', 'Y', 'Y');

SELECT MM.ModuleCode, MM.SystemCode, MM.ModuleTypeCode, MM.FormShortName,
       US.UserCode, US.AccessYesNo, US.AddYesNo, US.EditYesNo, US.DeleteYesNo
FROM AdminModuleInfo MM
JOIN AdminUserRightsSettings US ON US.ModuleCode = MM.ModuleCode
WHERE MM.FormShortName = 'Stimes.Erp.App.Win.SystemAdmin.FingerprintLogin';
