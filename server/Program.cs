using ProjectHiddenVillage.Server;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<GameInstanceFactory>();
builder.Services.AddSingleton<ProjectHiddenVillage.Server.Engine.GamePhaseService>();
builder.Services.AddSingleton<InMemoryGameInstanceRegistry>();
builder.Services.AddControllers();

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
app.MapControllers();

if (app.Urls.Count == 0)
{
    app.Urls.Add("http://127.0.0.1:3001");
}

app.Run();
