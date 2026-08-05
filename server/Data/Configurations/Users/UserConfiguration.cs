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

        entity.HasIndex(record => record.Email)
            .IsUnique();
    }
}