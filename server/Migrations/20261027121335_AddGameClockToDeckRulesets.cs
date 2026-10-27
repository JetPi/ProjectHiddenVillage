using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddGameClockToDeckRulesets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // The defaults are the standard clock, not zero: every existing ruleset row is backfilled with a valid
            // budget before the positive-range check constraint is added, so a ruleset that predates the clock
            // plays as a timed game instead of failing the migration.
            migrationBuilder.AddColumn<bool>(
                name: "ClockEnabled",
                table: "deck_rulesets",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<int>(
                name: "MainPhaseSeconds",
                table: "deck_rulesets",
                type: "integer",
                nullable: false,
                defaultValue: 60);

            migrationBuilder.AddColumn<int>(
                name: "OtherPhaseSeconds",
                table: "deck_rulesets",
                type: "integer",
                nullable: false,
                defaultValue: 30);

            migrationBuilder.AddColumn<int>(
                name: "PlayerPoolSeconds",
                table: "deck_rulesets",
                type: "integer",
                nullable: false,
                defaultValue: 1800);

            migrationBuilder.AddColumn<int>(
                name: "TimeoutsBeforeForfeit",
                table: "deck_rulesets",
                type: "integer",
                nullable: false,
                defaultValue: 3);

            migrationBuilder.UpdateData(
                table: "deck_rulesets",
                keyColumn: "Id",
                keyValue: new Guid("20000000-0000-0000-0000-000000000001"),
                columns: new[] { "ClockEnabled", "MainPhaseSeconds", "OtherPhaseSeconds", "PlayerPoolSeconds", "TimeoutsBeforeForfeit" },
                values: new object[] { true, 60, 30, 1800, 3 });

            migrationBuilder.UpdateData(
                table: "deck_rulesets",
                keyColumn: "Id",
                keyValue: new Guid("20000000-0000-0000-0000-000000000002"),
                columns: new[] { "ClockEnabled", "MainPhaseSeconds", "OtherPhaseSeconds", "PlayerPoolSeconds", "TimeoutsBeforeForfeit" },
                values: new object[] { true, 60, 30, 1800, 3 });

            migrationBuilder.InsertData(
                table: "deck_rulesets",
                columns: new[] { "Id", "AllowChakraCards", "AllowSummonCards", "ClockEnabled", "CreatedAtUtc", "IsActive", "Key", "LeaderCount", "MainPhaseSeconds", "MaxCopiesPerNonLeaderCard", "Name", "NonLeaderCardCount", "OtherPhaseSeconds", "PlayerPoolSeconds", "RequireLeaderColorMatch", "SortOrder", "TimeoutsBeforeForfeit", "UpdatedAtUtc" },
                values: new object[] { new Guid("20000000-0000-0000-0000-000000000003"), false, false, false, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), true, "time-relaxed", 1, 60, 4, "Time Relaxed", 50, 30, 1800, true, 2, 3, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) });

            migrationBuilder.AddCheckConstraint(
                name: "CK_deck_rulesets_clock_positive",
                table: "deck_rulesets",
                sql: "\"MainPhaseSeconds\" > 0 AND \"OtherPhaseSeconds\" > 0 AND \"PlayerPoolSeconds\" > 0 AND \"TimeoutsBeforeForfeit\" > 0");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropCheckConstraint(
                name: "CK_deck_rulesets_clock_positive",
                table: "deck_rulesets");

            migrationBuilder.DeleteData(
                table: "deck_rulesets",
                keyColumn: "Id",
                keyValue: new Guid("20000000-0000-0000-0000-000000000003"));

            migrationBuilder.DropColumn(
                name: "ClockEnabled",
                table: "deck_rulesets");

            migrationBuilder.DropColumn(
                name: "MainPhaseSeconds",
                table: "deck_rulesets");

            migrationBuilder.DropColumn(
                name: "OtherPhaseSeconds",
                table: "deck_rulesets");

            migrationBuilder.DropColumn(
                name: "PlayerPoolSeconds",
                table: "deck_rulesets");

            migrationBuilder.DropColumn(
                name: "TimeoutsBeforeForfeit",
                table: "deck_rulesets");
        }
    }
}
