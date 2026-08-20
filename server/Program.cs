using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Identity;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using System.Net;
using FluentValidation;
using FluentValidation.AspNetCore;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using ProjectHiddenVillage.Server;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;
using ProjectHiddenVillage.Server.Api.Interfaces.Card;
using ProjectHiddenVillage.Server.Api.Interfaces.Deck;
using ProjectHiddenVillage.Server.Api.Hubs;
using ProjectHiddenVillage.Server.Api.Interfaces.Game;
using ProjectHiddenVillage.Server.Api.Services.Games;
using ProjectHiddenVillage.Server.Api.Interfaces.User;
using ProjectHiddenVillage.Server.Api.Serialization;
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

builder.Services.AddSingleton(_ => new GameInstanceFactory());
builder.Services.AddSingleton<ProjectHiddenVillage.Server.Engine.Interfaces.IGamePhaseStateService, ProjectHiddenVillage.Server.Engine.GamePhaseStateService>();
builder.Services.AddSingleton<ProjectHiddenVillage.Server.Engine.GamePhaseService>();
builder.Services.AddSingleton<InMemoryGameInstanceRegistry>();
builder.Services.AddScoped<IGameEffectContextConditionEvaluator, EffectContextConditionEvaluator>();
builder.Services.AddScoped<IGameEffectTargetResolver, EffectTargetResolver>();
builder.Services.AddScoped<IGameRuntimeEffectSpecResolver, GameRuntimeEffectSpecResolver>();
builder.Services.AddScoped<IGameEffectCanExecuteEvaluator, GameEffectCanExecuteEvaluator>();
builder.Services.AddScoped<IGameValidTargetResultFactory, GameValidTargetResultFactory>();
builder.Services.AddScoped<IGameEffectConditionDiagnostics, GameEffectConditionDiagnostics>();
builder.Services.AddScoped<IGamePassiveEffectService, GamePassiveEffectService>();
builder.Services.AddScoped<IGameEffectChainResolver, GameEffectChainResolver>();
builder.Services.AddScoped<IGameReactiveEffectOrchestrator, GameReactiveEffectOrchestrator>();
builder.Services.AddScoped<IGameSequentialEffectExecutor, GameSequentialEffectExecutor>();
builder.Services.AddScoped<IGameEffectHandlingService, GameEffectHandlingService>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameCardEffect, ProjectHiddenVillage.Server.Api.Services.Games.NoopGameCardEffect>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameCardEffect, ProjectHiddenVillage.Server.Api.Services.Games.DestroyCardEffect>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameCardEffect, ProjectHiddenVillage.Server.Api.Services.Games.NegateCardEffect>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameCardEffect, ProjectHiddenVillage.Server.Api.Services.Games.SummonCardEffect>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameCardEffect, ProjectHiddenVillage.Server.Api.Services.Games.TributeSummonCardEffect>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameCardEffect, ProjectHiddenVillage.Server.Api.Services.Games.ModifyAttributeEffect>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameCardEffect, ProjectHiddenVillage.Server.Api.Services.Games.GainKeywordEffect>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameCardEffect, ProjectHiddenVillage.Server.Api.Services.Games.AlterResourcesEffect>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameEffectTargetSpecification, ProjectHiddenVillage.Server.Api.Services.Games.AllowAllTargetsSpecification>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameCardEffectRegistry, ProjectHiddenVillage.Server.Api.Services.Games.GameCardEffectRegistry>();
builder.Services.AddScoped<ProjectHiddenVillage.Server.Api.Interfaces.Game.IGameEffectTargetSpecificationRegistry, ProjectHiddenVillage.Server.Api.Services.Games.GameEffectTargetSpecificationRegistry>();
builder.Services.AddScoped<IGameRuntimeDeckService, GameRuntimeDeckService>();
builder.Services.AddScoped<IGamePhaseHandlingService, GamePhaseHandlingService>();
builder.Services.AddScoped<IGameInstanceService, GameInstanceService>();
builder.Services.AddScoped<IGameReadService, GamesReadService>();
builder.Services.AddScoped<ICardMappingService, CardMappingService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<IDeckService, DeckService>();
builder.Services.AddScoped<DevelopmentDeckSeeder>();
builder.Services.AddScoped<DevelopmentUserSeeder>();
builder.Services.AddScoped<DevelopmentGameInstanceSeeder>();
builder.Services.AddScoped<DevelopmentRuntimeGameSeeder>();
builder.Services.AddSingleton<IAuthTokenService, AuthTokenService>();
builder.Services.AddScoped<IPasswordHasher<User>, PasswordHasher<User>>();
builder.Services
    .AddControllers()
    .AddJsonOptions(options =>
    {
        options.JsonSerializerOptions.Converters.Add(new FlexibleEnumJsonConverterFactory());
    });
builder.Services.AddSignalR();
builder.Services.AddFluentValidationAutoValidation();
builder.Services.AddValidatorsFromAssemblyContaining<CreateGameForUserRequestValidator>();

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
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.Configure<JwtOptions>(builder.Configuration.GetSection(JwtOptions.SectionName));

if (builder.Environment.IsDevelopment())
{
    builder.Services
        .AddAuthentication(options =>
        {
            options.DefaultAuthenticateScheme = DevelopmentAuthenticationHandler.SchemeName;
            options.DefaultChallengeScheme = DevelopmentAuthenticationHandler.SchemeName;
        })
        .AddScheme<AuthenticationSchemeOptions, DevelopmentAuthenticationHandler>(
            DevelopmentAuthenticationHandler.SchemeName,
            _ => { });
}
else
{
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
            options.Events = new JwtBearerEvents
            {
                OnMessageReceived = context =>
                {
                    var accessToken = context.Request.Query["access_token"];
                    var requestPath = context.HttpContext.Request.Path;

                    if (!string.IsNullOrWhiteSpace(accessToken) && requestPath.StartsWithSegments("/hubs/games"))
                    {
                        context.Token = accessToken;
                    }

                    return Task.CompletedTask;
                },
                OnChallenge = async context =>
                {
                    context.HandleResponse();
                    context.Response.StatusCode = StatusCodes.Status401Unauthorized;
                    context.Response.ContentType = "application/json";

                    var details = string.IsNullOrWhiteSpace(context.ErrorDescription)
                        ? "Authentication is required to access this endpoint."
                        : context.ErrorDescription;

                    await context.Response.WriteAsJsonAsync(new
                    {
                        error = "unauthorized",
                        message = details,
                    });
                },
                OnForbidden = async context =>
                {
                    context.Response.StatusCode = StatusCodes.Status403Forbidden;
                    context.Response.ContentType = "application/json";
                    await context.Response.WriteAsJsonAsync(new
                    {
                        error = "forbidden",
                        message = "You are authenticated but do not have permission to access this endpoint.",
                    });
                }
            };

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
}

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(AuthorizationPolicies.CardCatalogAdmin, policy =>
    {
        policy.RequireAuthenticatedUser();
        policy.RequireClaim(
            AuthorizationPolicies.CardCatalogAdminClaimType,
            AuthorizationPolicies.CardCatalogAdminClaimValue);
    });
});

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
    var userSeeder = scope.ServiceProvider.GetRequiredService<DevelopmentUserSeeder>();
    var gameInstanceSeeder = scope.ServiceProvider.GetRequiredService<DevelopmentGameInstanceSeeder>();
    var runtimeGameSeeder = scope.ServiceProvider.GetRequiredService<DevelopmentRuntimeGameSeeder>();

    await deckSeeder.SeedAsync();
    await userSeeder.SeedAsync();
    await gameInstanceSeeder.SeedAsync();
    await runtimeGameSeeder.SeedAsync();
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
app.MapHub<GamesHub>("/hubs/games");

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
