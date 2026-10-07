-- Registers the web-only "Notification Settings" screen (System Admin > Activity) in the same
-- AdminModuleInfo / AdminUserRightsSettings tables the desktop app's own permission system uses,
-- and grants the ADMIN account (UserCode 8) full rights to it. This screen has no desktop
-- equivalent, so no row for it has ever existed - that's why usp_GetUserRightSecurity returns
-- nothing and the web app shows "You do not have permission to view this form." even for ADMIN.
--
-- ModuleTypeCode=2 is "Activity" under Administration - confirmed against the desktop's own
-- Approval Settings screen (ModuleCode 177, FormShortName
-- Stimes.Erp.App.Win.Administrator.ApprovalSettings), which this form was modeled after and is
-- itself registered under ModuleTypeCode=2, not 1 ("Basic", where Fingerprint Login sits - a
-- different kind of screen, a per-device enrollment page rather than an admin routing/behavior
-- config screen like this one).
--
-- ModuleCode 393 and GenCode 21903 are the next free IDs in those two tables as of 2026-10-07 -
-- re-check MAX(ModuleCode)/MAX(GenCode) first if other modules/rights have been added since.

SET NOCOUNT ON;

INSERT INTO AdminModuleInfo (ModuleCode, SystemCode, ModuleTypeCode, FormShortName, FormName)
VALUES (393, 6, 2, 'Stimes.Erp.App.Win.SystemAdmin.NotificationSettings', 'NOTIFICATION SETTINGS');

INSERT INTO AdminUserRightsSettings (GenCode, UserCode, ModuleCode, AccessYesNo, AddYesNo, EditYesNo, DeleteYesNo, SearchYesNo, ApproveYesNo)
VALUES (21903, 8, 393, 'Y', 'Y', 'Y', 'Y', 'Y', 'Y');

SELECT MM.ModuleCode, MM.SystemCode, MM.ModuleTypeCode, MM.FormShortName,
       US.UserCode, US.AccessYesNo, US.AddYesNo, US.EditYesNo, US.DeleteYesNo
FROM AdminModuleInfo MM
JOIN AdminUserRightsSettings US ON US.ModuleCode = MM.ModuleCode
WHERE MM.FormShortName = 'Stimes.Erp.App.Win.SystemAdmin.NotificationSettings';
