using Microsoft.EntityFrameworkCore;
using ProjectHiddenVillage.Server.Api.Interfaces.Auth;
using ProjectHiddenVillage.Server.Data;

namespace ProjectHiddenVillage.Server;

public sealed class ActorCapabilityResolver(ApplicationDbContext dbContext) : IActorCapabilityResolver
{
    public async Task<bool> IsCardCatalogAdminAsync(Guid userId, CancellationToken cancellationToken = default)
    {
        // Guid.Empty is what an unparsable claim turns into; it can never be a stored account.
        if (userId == Guid.Empty)
        {
            return false;
        }

        // One primary-key lookup of one boolean. Admin traffic is a handful of requests per session, so a cache
        // would only reintroduce the staleness this read exists to remove.
        return await dbContext.Users
            .AsNoTracking()
            .Where(record => record.Id == userId && !record.IsGuest)
            .Select(record => record.IsCardCatalogAdmin)
            .SingleOrDefaultAsync(cancellationToken);
    }
}
