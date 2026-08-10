using System.Text.Json;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server;

public sealed partial class GamesService : IGamesService
{
    private static readonly JsonSerializerOptions SerializerOptions = new(JsonSerializerDefaults.Web);

    private readonly InMemoryGameInstanceRegistry registry;
    private readonly ICardMappingService cardMappingService;
    private readonly ApplicationDbContext dbContext;

    public GamesService(
        InMemoryGameInstanceRegistry registry,
        ICardMappingService cardMappingService,
        ApplicationDbContext dbContext)
    {
        this.registry = registry;
        this.cardMappingService = cardMappingService;
        this.dbContext = dbContext;
    }
}