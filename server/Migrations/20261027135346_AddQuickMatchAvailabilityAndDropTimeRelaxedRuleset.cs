using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddQuickMatchAvailabilityAndDropTimeRelaxedRuleset : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DeleteData(
                table: "deck_rulesets",
                keyColumn: "Id",
                keyValue: new Guid("20000000-0000-0000-0000-000000000003"));

            // Every ruleset that already exists stays quick-matchable: defaulting this to false would silently pull
            // admin-created formats out of the queue on deploy.
            migrationBuilder.AddColumn<bool>(
                name: "AvailableInQuickMatch",
                table: "deck_rulesets",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.CreateIndex(
                name: "IX_deck_rulesets_IsActive_AvailableInQuickMatch",
                table: "deck_rulesets",
                columns: new[] { "IsActive", "AvailableInQuickMatch" });
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_deck_rulesets_IsActive_AvailableInQuickMatch",
                table: "deck_rulesets");

            migrationBuilder.DropColumn(
                name: "AvailableInQuickMatch",
                table: "deck_rulesets");

            migrationBuilder.InsertData(
                table: "deck_rulesets",
                columns: new[] { "Id", "AllowChakraCards", "AllowSummonCards", "ClockEnabled", "CreatedAtUtc", "IsActive", "Key", "LeaderCount", "MainPhaseSeconds", "MaxCopiesPerNonLeaderCard", "Name", "NonLeaderCardCount", "OtherPhaseSeconds", "PlayerPoolSeconds", "RequireLeaderColorMatch", "SortOrder", "TimeoutsBeforeForfeit", "UpdatedAtUtc" },
                values: new object[] { new Guid("20000000-0000-0000-0000-000000000003"), false, false, false, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), true, "time-relaxed", 1, 60, 4, "Time Relaxed", 50, 30, 1800, true, 2, 3, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) });
        }
    }
}
