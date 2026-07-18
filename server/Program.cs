var builder = WebApplication.CreateBuilder(args);

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

app.MapGet("/health", () =>
{
    return Results.Ok(new HealthResponse(
        Status: "ok",
        Service: "project-hidden-village-server",
        Timestamp: DateTimeOffset.UtcNow));
})
.WithName("GetHealth")
.WithTags("Health")
.Produces<HealthResponse>(StatusCodes.Status200OK);

if (app.Urls.Count == 0)
{
    app.Urls.Add("http://127.0.0.1:3001");
}

app.Run();

internal sealed record HealthResponse(string Status, string Service, DateTimeOffset Timestamp);
