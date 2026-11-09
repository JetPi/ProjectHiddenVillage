using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using ProjectHiddenVillage.Server.Data.Entities;

namespace ProjectHiddenVillage.Server.Data.Configurations;

public sealed class PasswordResetTokenConfiguration : IEntityTypeConfiguration<PasswordResetToken>
{
    public void Configure(EntityTypeBuilder<PasswordResetToken> entity)
    {
        entity.ToTable("password_reset_tokens");
        entity.HasKey(record => record.Id);

        entity.Property(record => record.TokenHash)
            .IsRequired()
            .HasMaxLength(64);

        entity.Property(record => record.RequestedFromIp)
            .HasMaxLength(64);

        entity.Property(record => record.CreatedAtUtc)
            .IsRequired()
            .HasDefaultValueSql("now()");

        entity.Property(record => record.ExpiresAtUtc)
            .IsRequired();

        // Every confirm is a lookup by hash, and uniqueness is also what makes "two rows, one token" impossible.
        entity.HasIndex(record => record.TokenHash)
            .IsUnique();

        entity.HasIndex(record => record.UserId);

        // Guests are deleted by the retention sweeper; without the cascade their tokens would outlive the identity
        // they belong to and the reset flow would keep finding rows it can never use.
        entity.HasOne(record => record.User)
            .WithMany(record => record.PasswordResetTokens)
            .HasForeignKey(record => record.UserId)
            .OnDelete(DeleteBehavior.Cascade);
    }
}
