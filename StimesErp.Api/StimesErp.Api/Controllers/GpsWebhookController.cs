using Microsoft.AspNetCore.Mvc;
using StimesErp.Api.Models;
using StimesErp.Api.Services;

namespace StimesErp.Api.Controllers
{
    // No [Authorize] here on purpose - BON Tracker PRO's server calls this directly and has no
    // ERP login token. Reachable at /gps/webhook once deployed (e.g. https://erp.petrocoat.com/api/gps/webhook).
    [ApiController]
    [Route("gps")]
    public class GpsWebhookController : ControllerBase
    {
        private readonly GpsWebhookService _service;

        public GpsWebhookController(GpsWebhookService service)
        {
            _service = service;
        }

        [HttpPost("webhook")]
        public async Task<IActionResult> Webhook()
        {
            Request.EnableBuffering();
            using var reader = new StreamReader(Request.Body, leaveOpen: true);
            var rawJson = await reader.ReadToEndAsync();
            Request.Body.Position = 0;

            GpsWebhookPayload? payload;
            try
            {
                payload = System.Text.Json.JsonSerializer.Deserialize<GpsWebhookPayload>(rawJson,
                    new System.Text.Json.JsonSerializerOptions { PropertyNameCaseInsensitive = true });
            }
            catch
            {
                // Still store the raw body even if it doesn't match our known shape, so nothing is
                // lost while we're confirming the vendor's exact format - see it in GpsWebhookEvent.RawPayload.
                payload = null;
            }

            _service.StoreEvent(payload ?? new GpsWebhookPayload(), rawJson);
            return Ok(new { received = true });
        }
    }
}
