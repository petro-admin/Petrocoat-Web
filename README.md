# Stimes ERP Web — Daily Site + Login (Angular + .NET 8 + your existing MSSQL DB)

Two projects, talking to the **same database and same stored procedures** your
desktop app already uses:

- `StimesErp.Api` — ASP.NET Core 8 Web API (no EF, raw ADO.NET calling your existing SPs)
- `stimes-erp-web` — Angular 18 standalone app (Login + Daily Site list/detail)

## 1. Before you run anything — fill in 3 things

1. **Connection string** — `StimesErp.Api/appsettings.json` → `ConnectionStrings:ErpDb`.
   Point it at the same SQL Server your WPF app uses.
2. **Login SP + password encryption** — `StimesErp.Api/Services/AuthService.cs` has two `TODO`s:
   - The real stored procedure name used to authenticate (I used a placeholder
     `usp_AuthenticateUser` — find the actual one inside your `Authentication` class
     in `Stimes.Erp.Library`).
   - `ZCrypto.EncryptData()` currently throws `NotImplementedException`. Copy the
     real body of `ClsZCrypto.EncryptData()` from your Library project into it — if
     this doesn't match exactly what the desktop app uses, logins will fail even
     with correct credentials.
3. **JWT secret** — `appsettings.json` → `Jwt:Key`. Replace with a long random string
   (32+ chars). Don't commit the real one to source control.

## 2. Run the API locally

Requires .NET 8 SDK.

```bash
cd StimesErp.Api
dotnet restore
dotnet run
```

This starts the API at `https://localhost:7001` (Swagger UI opens automatically at
`https://localhost:7001/swagger` so you can test `/api/auth/login` and
`/api/dailysite/list` directly before wiring up Angular).

## 3. Run the Angular app locally

Requires Node.js 20+ and npm.

```bash
cd stimes-erp-web
npm install
npm start
```

This starts the app at `http://localhost:4200`. It's already configured
(`src/environments/environment.ts`) to call the API at `https://localhost:7001/api`
and CORS is already open for `http://localhost:4200` in `Program.cs`.

## 4. Opening in your editors

- **Backend in Visual Studio**: open `StimesErp.Api/StimesErp.Api.sln`. Visual Studio
  will restore NuGet packages on load. Press F5 to run — Swagger opens automatically.
- **Frontend in VS Code**: open the `stimes-erp-web` folder directly (`code stimes-erp-web`).
  A `.vscode/launch.json` is included — run "ng serve" from the Run panel, or just
  use the terminal commands below. The Angular Language Service extension is
  recommended (VS Code will prompt you via `.vscode/extensions.json`).

## 4b. What's wired up vs. what's a starting skeleton

**Fully wired to your real SPs:**
- Login → maintenance-mode check → `usp_TrackLoginUsers` (once you fill in the two
  TODOs above)
- Daily Site grid list → `usp_GetDailySiteHdr(0, Month, Year)`
- Daily Site detail load → `usp_GetDailySiteHdr(Code, 0, 0)` +
  `usp_GetDailySiteScopeOfWork` / `usp_GetDailySiteMaterial` /
  `usp_GetDailySiteConsumablesOrMachineries` / `usp_GetDailySiteMachineries` /
  `usp_GetDailySiteBranchHrs`
- Save/Delete → `usp_ManageDailySite` (all 42 parameters mapped)
- Doc number generation → `usp_GenerateDailySiteNo`

**Fully wired now (this update):**
- Daily Site detail page has all 4 tabs from the WPF form: **Basic Details**,
  **Scope of Work**, **Material**, **Consumables**, **Machineries** — each grid
  is a proper Angular `FormArray` you can add/remove rows on, matching the exact
  columns I read off `gvScopeOfWork` / `gvMaterial` / `gvConsumbales` /
  `gvMachineries` in your `DailySite.xaml`.
- Backend `DailySiteSaveRequest` now has strongly-typed `ScopeOfWorkRow`,
  `MaterialRow`, `ConsumableMachineryRow` classes (not generic dictionaries)
  whose property names match those same WPF bindings, and
  `DailySiteService.Save()` builds each table-valued parameter via reflection
  over those classes.

**Still worth doing before this is production-ready:**
- **Verify UDT columns in SSMS.** I built the row classes from the WPF grid's
  `DataMemberBinding` names, which is a strong signal but not a guarantee they
  match the SQL Server user-defined table types byte-for-byte. Open
  Database → Programmability → Types → User-Defined Table Types for
  `ERP_UDT_DailySiteScopeOfWork`, `ERP_UDT_DailySiteMaterial`, and
  `ERP_UDT_DailySiteConsumablesAndMachineriesNew` and compare column
  name/order/type against `Models/DailySiteModels.cs`. Fix any mismatches there.
- **Sales Order / Customer lookups.** The WPF form's "Sales Order No" and
  "Customer" fields are autocomplete boxes backed by SPs (`txtJobNo`,
  `txtCustomer` in the XAML) — right now they're plain text inputs and
  `jobCode` is hardcoded to `0` in the Save payload. Add a
  `GET /api/lookups/salesorders?search=` style endpoint (there will be an
  existing SP behind that WPF autocomplete — check `ClsSalesOrder.cs`) and
  wire it to an Angular typeahead.
- **Dropdown lookups** for Supervisor/Engineer/Materials Received By and the
  combo-box columns inside the grids (Description of Works, Item Description,
  Consumables, Machineries) are plain text inputs right now — the WPF version
  uses `RadComboBox`/`GridViewComboBoxColumn` bound to lookup tables. Add
  `GET /api/lookups/...` endpoints for each and swap the `<input>` for a
  `<select>` once you confirm the lookup SPs.
- **Auto-calculated columns** (Balance to Complete, Achieved Rate, Balance at
  Site, etc.) are marked `readonly` in the grids because the WPF code computes
  them via `CellEditEnded` handlers — port that calculation logic into the
  Angular component (`(input)` handlers recalculating the row) if you want the
  same live math instead of relying only on what the SP returns after save.
- Branch/Period context (`branchCode`, `periodId` in the Save call) is
  hardcoded to `1` right now — replace with whatever your login response
  should carry (mirrors `StaticClass.BranchCode` / `StaticClass.PeriodId` in
  the desktop app). Consider adding these as JWT claims in
  `AuthController.GenerateJwt()`.
- Grid column names in `daily-site-list.component.html` (`DocNo`, `DocDate`,
  `JobDesc`, `Project`, `BranchName`) are my best read of the WPF column
  bindings — double check them against the actual result set of
  `usp_GetDailySiteHdr` and adjust if any differ.
- **Lock/Approve** buttons and the printable Report tab from the WPF form
  aren't built yet — say the word and I'll add those next (report needs the
  RDLC→PDF approach discussed earlier).

## 5. Once this runs on localhost

Come back and I'll walk through hosting it on your server/domain (IIS site +
SSL for the API, IIS site or reverse proxy for the Angular build, DNS records,
and locking down the SQL login to least-privilege).
