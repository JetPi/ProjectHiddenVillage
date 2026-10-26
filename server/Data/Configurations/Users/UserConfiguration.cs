using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> entity)
    {
        entity.ToTable("users");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.Email)
            .IsRequired()
            .HasMaxLength(320);

        entity.Property(record => record.PasswordHash)
            .IsRequired()
            .HasMaxLength(512);

        entity.Property(record => record.IsCardCatalogAdmin)
            .IsRequired()
            .HasDefaultValue(false);

        entity.Property(record => record.IsGuest)
            .IsRequired()
            .HasDefaultValue(false);

        entity.Property(record => record.CreatedAtUtc)
            .IsRequired()
            .HasDefaultValueSql("now()");

        entity.Property(record => record.LastSeenAtUtc)
            .IsRequired()
            .HasDefaultValueSql("now()");

        entity.HasIndex(record => record.Email)
            .IsUnique();

        // The retention sweeper scans exactly this pair: guests ordered by how long they have been idle. A
        // partial index keeps it from growing with the registered users it never looks at.
        entity.HasIndex(record => record.LastSeenAtUtc)
            .HasDatabaseName("IX_users_guests_last_seen_at_utc")
            .HasFilter("\"IsGuest\"");
    }
}