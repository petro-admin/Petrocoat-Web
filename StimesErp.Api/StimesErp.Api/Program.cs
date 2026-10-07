using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using StimesErp.Api.Data;
using StimesErp.Api.Json;
using StimesErp.Api.Services;

var builder = WebApplication.CreateBuilder(args);

// --- Services ---
builder.Services.AddControllers().AddJsonOptions(opts =>
{
    opts.JsonSerializerOptions.Converters.Add(new FlexibleDateTimeConverterFactory());
    opts.JsonSerializerOptions.Converters.Add(new FlexibleStringConverter());
    opts.JsonSerializerOptions.Converters.Add(new FlexibleIntConverter());
    opts.JsonSerializerOptions.Converters.Add(new FlexibleNullableIntConverter());
    opts.JsonSerializerOptions.Converters.Add(new FlexibleDecimalConverter());
    opts.JsonSerializerOptions.NumberHandling = System.Text.Json.Serialization.JsonNumberHandling.AllowReadingFromString;
});

builder.Services.AddHttpContextAccessor();
builder.Services.AddMemoryCache();
builder.Services.AddScoped<SqlHelper>();
builder.Services.AddScoped<WebAuditService>();
builder.Services.AddScoped<JwtTokenService>();
builder.Services.AddScoped<FaceLoginService>();
builder.Services.AddDbContext<MaterialExpiryDbContext>(opt =>
    opt.UseSqlServer(builder.Configuration.GetConnectionString("ErpDb")));
builder.Services.AddScoped<AuthService>();
builder.Services.AddScoped<DailySiteService>();
builder.Services.AddScoped<SettingsService>();
builder.Services.AddScoped<StoreIndentService>();
builder.Services.AddScoped<ManpowerScheduleService>();
builder.Services.AddScoped<ResourceReportService>();
builder.Services.AddScoped<ApprovalService>();
builder.Services.AddScoped<UserRightsService>();
builder.Services.AddScoped<DashboardService>();
builder.Services.AddScoped<VehicleServiceRepairService>();
builder.Services.AddScoped<GpsWebhookService>();
builder.Services.AddScoped<NotificationSettingsService>();
builder.Services.AddScoped<NotificationService>();
builder.Services.AddScoped<TripSheetService>();
builder.Services.AddScoped<LabourAttendanceService>();
builder.Services.AddScoped<StaffAttendanceService>();
builder.Services.AddScoped<LeaveApplicationService>();
builder.Services.AddScoped<ResourceReturnService>();
builder.Services.AddScoped<AccidentReportService>();
builder.Services.AddScoped<AccountService>();
builder.Services.AddScoped<VehicleHandoverService>();
builder.Services.AddScoped<DSRTimeSheetService>();
builder.Services.AddScoped<AuditLogService>();
builder.Services.AddScoped<MaterialExpiryReportService>();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>() ?? new[] { "http://localhost:4200" };
builder.Services.AddCors(options =>
{
    options.AddPolicy("AngularDev", policy =>
    {
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod();
    });
});

var jwtSection = builder.Configuration.GetSection("Jwt");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateLifetime = true,
            ValidateIssuerSigningKey = true,
            ValidIssuer = jwtSection["Issuer"],
            ValidAudience = jwtSection["Audience"],
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSection["Key"]!))
        };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseHttpsRedirection();
app.UseCors("AngularDev");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();
