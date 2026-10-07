using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Data;
using StimesErp.Api.Models;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class TripSheetController : ControllerBase
    {
        private readonly TripSheetService _service;

        public TripSheetController(TripSheetService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("list")]
        public IActionResult GetList() => Ok(_service.GetList().ToJsonRows());

        [HttpGet("{code:int}")]
        public IActionResult GetById(int code)
        {
            var hdr = _service.GetById(code);
            if (hdr.Rows.Count == 0) return NotFound();
            return Ok(new
            {
                Header = hdr.ToJsonRows().FirstOrDefault(),
                Legs = _service.GetLegs(code).ToJsonRows()
            });
        }

        [HttpGet("generate-docno")]
        public IActionResult GenerateDocNo() => Ok(new { docNo = _service.GenerateDocNo() });

        [HttpGet("lookups")]
        public IActionResult GetLookups() => Ok(new
        {
            drivers = _service.GetDriverLookup().ToJsonRows(),
            gpsDrivers = _service.GetGpsReportDriverLookup().ToJsonRows(),
            vehicles = _service.GetVehicleLookup().ToJsonRows()
        });

        [HttpGet("gps-snapshot")]
        public IActionResult GetGpsSnapshot([FromQuery] int vehicleCode) =>
            Ok(_service.GetLatestGpsSnapshot(vehicleCode));

        [HttpGet("gps-mapping")]
        public IActionResult GetGpsMapping([FromQuery] int vehicleCode) =>
            Ok(_service.GetGpsMapping(vehicleCode).ToJsonRows().FirstOrDefault());

        [HttpPost("gps-mapping")]
        public IActionResult SaveGpsMapping([FromBody] SaveGpsMappingRequest request)
        {
            _service.SaveGpsMapping(request.VehicleCode, request.GpsDeviceId, request.GpsDeviceName);
            return Ok(new { result = "saved" });
        }

        [HttpGet("report")]
        public IActionResult GetReport([FromQuery] DateTime fromDate, [FromQuery] DateTime toDate) =>
            Ok(_service.GetReport(fromDate, toDate));

        [HttpGet("gps-report")]
        public IActionResult GetGpsTripReport([FromQuery] DateTime fromDate, [FromQuery] DateTime toDate,
            [FromQuery] List<int>? driverCodes, [FromQuery] List<int>? vehicleCodes) =>
            Ok(_service.GetGpsTripReport(fromDate, toDate, driverCodes, vehicleCodes));

        [HttpPost("save")]
        public IActionResult Save([FromBody] TripSheetSaveRequest request) =>
            Ok(new { result = _service.Save(request, CurrentUserCode) });

        [HttpDelete("{code:int}")]
        public IActionResult Delete(int code) =>
            Ok(new { result = _service.Save(new TripSheetSaveRequest { Code = code, Mode = 2 }, CurrentUserCode) });
    }
}
