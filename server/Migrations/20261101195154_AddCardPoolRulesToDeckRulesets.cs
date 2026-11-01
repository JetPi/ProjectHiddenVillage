using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddCardPoolRulesToDeckRulesets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "CardPoolMode",
                table: "deck_rulesets",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<string>(
                name: "Code",
                table: "deck_ruleset_card_restrictions",
                type: "character varying(32)",
                maxLength: 32,
                nullable: false,
                defaultValue: "");

            migrationBuilder.AddColumn<int>(
                name: "MatchType",
                table: "deck_ruleset_card_restrictions",
                type: "integer",
                nullable: false,
                defaultValue: 0);

            // A restriction stops pointing at a catalogue row and starts naming a code. Every existing row becomes
            // a whole-card rule named by the card it used to reference; a row whose card no longer exists is
            // dropped rather than migrated into a rule with an empty code, which would collide on the new unique
            // index and silently apply to nothing.
            migrationBuilder.Sql(
                """
                DELETE FROM "deck_ruleset_card_restrictions" AS r
                WHERE NOT EXISTS (
                    SELECT 1 FROM "card_catalog_entries" AS c WHERE c."Id" = r."CardCatalogEntryId");

                UPDATE "deck_ruleset_card_restrictions" AS r
                SET "MatchType" = 0, "Code" = UPPER(c."CardId")
                FROM "card_catalog_entries" AS c
                WHERE c."Id" = r."CardCatalogEntryId";
                """);

            migrationBuilder.DropForeignKey(
                name: "FK_deck_ruleset_card_restrictions_card_catalog_entries_CardCat~",
                table: "deck_ruleset_card_restrictions");

            migrationBuilder.DropIndex(
                name: "IX_deck_ruleset_card_restrictions_CardCatalogEntryId",
                table: "deck_ruleset_card_restrictions");

            migrationBuilder.DropIndex(
                name: "IX_deck_ruleset_card_restrictions_DeckRulesetId_CardCatalogEnt~",
                table: "deck_ruleset_card_restrictions");

            migrationBuilder.DropColumn(
                name: "CardCatalogEntryId",
                table: "deck_ruleset_card_restrictions");

            migrationBuilder.UpdateData(
                table: "deck_rulesets",
                keyColumn: "Id",
                keyValue: new Guid("20000000-0000-0000-0000-000000000001"),
                column: "CardPoolMode",
                value: 0);

            migrationBuilder.UpdateData(
                table: "deck_rulesets",
                keyColumn: "Id",
                keyValue: new Guid("20000000-0000-0000-0000-000000000002"),
                column: "CardPoolMode",
                value: 1);

            migrationBuilder.InsertData(
                table: "deck_rulesets",
                columns: new[] { "Id", "AllowChakraCards", "AllowSummonCards", "AvailableInQuickMatch", "CardPoolMode", "ClockEnabled", "CreatedAtUtc", "IsActive", "Key", "LeaderCount", "MainPhaseSeconds", "MaxCopiesPerNonLeaderCard", "Name", "NonLeaderCardCount", "OtherPhaseSeconds", "PlayerPoolSeconds", "RequireLeaderColorMatch", "SortOrder", "TimeoutsBeforeForfeit", "UpdatedAtUtc" },
                values: new object[] { new Guid("20000000-0000-0000-0000-000000000003"), true, true, false, 0, true, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), true, "unrestricted", 1, 60, 4, "Unrestricted", 50, 30, 1800, true, 2, 3, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) });

            migrationBuilder.InsertData(
                table: "deck_ruleset_card_restrictions",
                columns: new[] { "Id", "Code", "DeckRulesetId", "MatchType", "MaxCopies" },
                values: new object[,]
                {
                    { new Guid("30000000-0000-0000-0000-000000000001"), "N", new Guid("20000000-0000-0000-0000-000000000002"), 1, 3 },
                    { new Guid("30000000-0000-0000-0000-000000000002"), "C", new Guid("20000000-0000-0000-0000-000000000002"), 1, 3 },
                    { new Guid("30000000-0000-0000-0000-000000000003"), "CP", new Guid("20000000-0000-0000-0000-000000000002"), 1, 3 },
                    { new Guid("30000000-0000-0000-0000-000000000004"), "S", new Guid("20000000-0000-0000-0000-000000000002"), 1, 3 }
                });

            migrationBuilder.CreateIndex(
                name: "IX_deck_ruleset_card_restrictions_DeckRulesetId_MatchType_Code",
                table: "deck_ruleset_card_restrictions",
                columns: new[] { "DeckRulesetId", "MatchType", "Code" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_deck_ruleset_card_restrictions_DeckRulesetId_MatchType_Code",
                table: "deck_ruleset_card_restrictions");

            migrationBuilder.DeleteData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000001"));

            migrationBuilder.DeleteData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000002"));

            migrationBuilder.DeleteData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000003"));

            migrationBuilder.DeleteData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000004"));

            migrationBuilder.DeleteData(
                table: "deck_rulesets",
                keyColumn: "Id",
                keyValue: new Guid("20000000-0000-0000-0000-000000000003"));

            migrationBuilder.DropColumn(
                name: "CardPoolMode",
                table: "deck_rulesets");

            // The old shape cannot express a set rule or a code with no catalogue row, so those rules cannot be
            // rolled back and are dropped instead of being written back as a dangling foreign key.
            migrationBuilder.Sql(
                """
                DELETE FROM "deck_ruleset_card_restrictions" AS r
                WHERE r."MatchType" <> 0
                    OR NOT EXISTS (
                        SELECT 1 FROM "card_catalog_entries" AS c WHERE UPPER(c."CardId") = r."Code");
                """);

            migrationBuilder.AddColumn<Guid>(
                name: "CardCatalogEntryId",
                table: "deck_ruleset_card_restrictions",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.Sql(
                """
                UPDATE "deck_ruleset_card_restrictions" AS r
                SET "CardCatalogEntryId" = c."Id"
                FROM "card_catalog_entries" AS c
                WHERE UPPER(c."CardId") = r."Code";
                """);

            migrationBuilder.DropColumn(
                name: "Code",
                table: "deck_ruleset_card_restrictions");

            migrationBuilder.DropColumn(
                name: "MatchType",
                table: "deck_ruleset_card_restrictions");

            migrationBuilder.CreateIndex(
                name: "IX_deck_ruleset_card_restrictions_CardCatalogEntryId",
                table: "deck_ruleset_card_restrictions",
                column: "CardCatalogEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_deck_ruleset_card_restrictions_DeckRulesetId_CardCatalogEnt~",
                table: "deck_ruleset_card_restrictions",
                columns: new[] { "DeckRulesetId", "CardCatalogEntryId" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_deck_ruleset_card_restrictions_card_catalog_entries_CardCat~",
                table: "deck_ruleset_card_restrictions",
                column: "CardCatalogEntryId",
                principalTable: "card_catalog_entries",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }
    }
}
