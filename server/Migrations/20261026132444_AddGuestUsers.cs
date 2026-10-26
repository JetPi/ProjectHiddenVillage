using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddGuestUsers : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "CreatedAtUtc",
                table: "users",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.AddColumn<bool>(
                name: "IsGuest",
                table: "users",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTimeOffset>(
                name: "LastSeenAtUtc",
                table: "users",
                type: "timestamp with time zone",
                nullable: false,
                defaultValueSql: "now()");

            migrationBuilder.CreateIndex(
                name: "IX_users_guests_last_seen_at_utc",
                table: "users",
                column: "LastSeenAtUtc",
                filter: "\"IsGuest\"");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_users_guests_last_seen_at_utc",
                table: "users");

            migrationBuilder.DropColumn(
                name: "CreatedAtUtc",
                table: "users");

            migrationBuilder.DropColumn(
                name: "IsGuest",
                table: "users");

            migrationBuilder.DropColumn(
                name: "LastSeenAtUtc",
                table: "users");
        }
    }
}
