using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using System.Net;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using ProjectHiddenVillage.Server;
using ProjectHiddenVillage.Server.Data;
using ProjectHiddenVillage.Server.Data.Seeding.Development;
using ProjectHiddenVillage.Server.Data.Entities;

var builder = WebApplication.CreateBuilder(args);

builder.Configuration.AddUserSecrets<Program>(optional: true);

var configurationRoot = (IConfigurationRoot)builder.Configuration;
var jwtKeyProvider = configurationRoot.Providers
    .Reverse()
    .FirstOrDefault(provider =>
        provider.TryGet("Jwt:Key", out var value) &&
        !string.IsNullOrWhiteSpace(value));

builder.Services.AddDbContext<ApplicationDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

builder.Services.AddSingleton<GameInstanceFactory>();
builder.Services.AddSingleton<ProjectHiddenVillage.Server.Engine.GamePhaseService>();
builder.Services.AddSingleton<InMemoryGameInstanceRegistry>();
builder.Services.AddScoped<GamesService>();
builder.Services.AddScoped<CardMappingService>();
builder.Services.AddScoped<UserService>();
builder.Services.AddScoped<DeckService>();
builder.Services.AddScoped<DevelopmentDeckSeeder>();
builder.Services.AddSingleton<AuthTokenService>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services.AddControllers();
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<CreateGameInstanceRequestValidator>();

var configuredCorsOrigins = builder.Configuration
    .GetSection("Cors:AllowedOrigins")
    .Get<string[]>()
    ?.Where(origin => !string.IsNullOrWhiteSpace(origin))
    .Select(origin => origin.Trim())
    .Distinct(StringComparer.OrdinalIgnoreCase)
    .ToArray()
    ?? Array.Empty<string>();

var configuredCorsOriginSet = new HashSet<string>(configuredCorsOrigins, StringComparer.OrdinalIgnoreCase);

builder.Services.AddCors(options =>
{
    options.AddPolicy("ClientDev", policy =>
    {
        policy
            .SetIsOriginAllowed(origin => IsAllowedClientOrigin(origin, configuredCorsOriginSet))
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));

var jwtOptions = builder.Configuration.GetSection(JwtOptions.SectionName).Get<JwtOptions>()
    ?? throw new InvalidOperationException("JWT configuration is missing.");

if (string.IsNullOrWhiteSpace(jwtOptions.Key))
{
    throw new InvalidOperationException("JWT signing key is missing.");
}

builder.Services
    .AddAuthentication(JwtBearerDefaults.AuthenticationScheme)
    .AddJwtBearer(options =>
    {
        options.TokenValidationParameters = new TokenValidationParameters
        {
            ValidateIssuer = true,
            ValidateAudience = true,
            ValidateIssuerSigningKey = true,
            ValidateLifetime = true,
            ValidIssuer = jwtOptions.Issuer,
            ValidAudience = jwtOptions.Audience,
            IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtOptions.Key)),
            ClockSkew = TimeSpan.FromSeconds(30)
        };
    });

builder.Services.AddAuthorization();

builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(options =>
{
    options.SwaggerDoc("v1", new Microsoft.OpenApi.OpenApiInfo
    {
        Title = "Project Hidden Village API",
        Version = "v1",
        Description = "Minimal ASP.NET Core backend for Project Hidden Village."
    });
});

var app = builder.Build();
var startupLogger = app.Services.GetRequiredService<ILoggerFactory>().CreateLogger("Startup");

var isAppSettingsSource = jwtKeyProvider is FileConfigurationProvider fileConfigurationProvider &&
    fileConfigurationProvider.Source.Path is string providerPath &&
    providerPath.StartsWith("appsettings", StringComparison.OrdinalIgnoreCase);

if (isAppSettingsSource)
{
    startupLogger.LogWarning("JWT signing key is loaded from appsettings JSON. Prefer user-secrets or environment variables for secret storage.");
}

startupLogger.LogInformation(
    "CORS policy 'ClientDev' allows configured origins [{ConfiguredOrigins}] plus localhost/127.0.0.1 on any port for local development.",
    configuredCorsOrigins.Length == 0 ? "none" : string.Join(", ", configuredCorsOrigins));

if (app.Environment.IsDevelopment())
{
    using var scope = app.Services.CreateScope();
    var deckSeeder = scope.ServiceProvider.GetRequiredService<DevelopmentDeckSeeder>();
    await deckSeeder.SeedAsync();
}

app.UseSwagger(options =>
{
    options.RouteTemplate = "docs/{documentName}.json";
});

app.UseSwaggerUI(options =>
{
    options.RoutePrefix = "docs";
    options.SwaggerEndpoint("/docs/v1.json", "Project Hidden Village API v1");
});

app.MapGet("/docs.json", () => Results.Redirect("/docs/v1.json"));
app.UseCors("ClientDev");
app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

app.Run();

static bool IsAllowedClientOrigin(string origin, HashSet<string> configuredOrigins)
{
    if (configuredOrigins.Contains(origin))
    {
        return true;
    }

    if (!Uri.TryCreate(origin, UriKind.Absolute, out var parsedOrigin))
    {
        return false;
    }

    if (parsedOrigin.Scheme != Uri.UriSchemeHttp && parsedOrigin.Scheme != Uri.UriSchemeHttps)
    {
        return false;
    }

    if (string.Equals(parsedOrigin.Host, "localhost", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(parsedOrigin.Host, "127.0.0.1", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(parsedOrigin.Host, "::1", StringComparison.OrdinalIgnoreCase))
    {
        return true;
    }

    if (parsedOrigin.IsLoopback)
    {
        return true;
    }

    return IPAddress.TryParse(parsedOrigin.Host, out var address) && IPAddress.IsLoopback(address);
}
