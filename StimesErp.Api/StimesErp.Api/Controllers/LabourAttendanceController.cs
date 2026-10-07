using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.StaticFiles;
using StimesErp.Api.Data;
using StimesErp.Api.Models;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    [ApiController]
    [Route("[controller]")]
    [Authorize]
    public class LabourAttendanceController : ControllerBase
    {
        private readonly LabourAttendanceService _service;

        public LabourAttendanceController(LabourAttendanceService service)
        {
            _service = service;
        }

        private int CurrentUserCode =>
            int.Parse(User.FindFirstValue(ClaimTypes.NameIdentifier) ?? "0");

        [HttpGet("employees")]
        public IActionResult GetEmployees() => Ok(_service.GetEmployees().ToJsonRows());

        [HttpGet("sales-orders")]
        public IActionResult GetSalesOrders() => Ok(_service.GetSalesOrders().ToJsonRows());

        [HttpGet("employees-with-photo")]
        public IActionResult GetEmployeesWithPhoto() => Ok(_service.GetEmployeesWithPhoto());

        // Streams the employee's existing ERP photo (payrollEmployeeInfo.EmpPhoto) so the
        // browser can load it in an <img> - the stored path is a UNC/local filesystem path on
        // the ERP file server, which a browser can never load directly, only this API server can.
        [HttpGet("employee-photo/{employeeCode:int}")]
        public IActionResult GetEmployeePhoto(int employeeCode)
        {
            var path = _service.GetEmployeePhotoPath(employeeCode);
            if (string.IsNullOrWhiteSpace(path)) return NotFound();

            try
            {
                if (!System.IO.File.Exists(path)) return NotFound(new { message = "Photo file not found or share not reachable from this server." });

                var provider = new FileExtensionContentTypeProvider();
                if (!provider.TryGetContentType(path, out var contentType)) contentType = "image/jpeg";

                var stream = System.IO.File.OpenRead(path);
                return File(stream, contentType);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "Could not read photo: " + ex.Message });
            }
        }

        [HttpGet("face-descriptors")]
        public IActionResult GetAllDescriptors() => Ok(_service.GetAllDescriptors());

        [HttpPost("enroll")]
        public IActionResult Enroll([FromBody] FaceEnrollRequest request)
        {
            _service.SaveDescriptorSet(request.EmployeeCode, request.Captures, CurrentUserCode);
            return Ok(new { result = "enrolled" });
        }

        [HttpPost("record")]
        public IActionResult Record([FromBody] RecordAttendanceRequest request) =>
            Ok(_service.RecordAttendance(request.EmployeeCode, request.MatchConfidence, request.JobCode,
                request.Latitude, request.Longitude, CurrentUserCode));

        [HttpGet("list")]
        public IActionResult GetList([FromQuery] DateTime? date) =>
            Ok(_service.GetList(date ?? DateTime.Today).ToJsonRows());

        [HttpGet("report")]
        public IActionResult GetReport([FromQuery] DateTime fromDate, [FromQuery] DateTime toDate,
            [FromQuery] int? jobCode, [FromQuery] int? employeeCode) =>
            Ok(_service.GetReport(fromDate, toDate, jobCode, employeeCode));
    }
}
