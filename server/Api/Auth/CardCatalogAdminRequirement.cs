using Microsoft.AspNetCore.Authorization;

namespace ProjectHiddenVillage.Server;

/// <summary>
/// Asks the pipeline to confirm, against the database, that the caller is still a catalogue administrator.
///
/// The policy keeps its <c>card_catalog_admin</c> claim check as the cheap first rejection; this requirement is
/// the authoritative second one, so a token minted while the account was an admin cannot keep writing after the
/// account is demoted or removed. <see cref="CardCatalogAdminAuthorizationHandler"/> answers it.
/// </summary>
public sealed class CardCatalogAdminRequirement : IAuthorizationRequirement
{
}
