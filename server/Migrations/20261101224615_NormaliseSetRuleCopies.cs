using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class NormaliseSetRuleCopies : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000001"),
                column: "MaxCopies",
                value: 2147483647);

            migrationBuilder.UpdateData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000002"),
                column: "MaxCopies",
                value: 2147483647);

            migrationBuilder.UpdateData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000003"),
                column: "MaxCopies",
                value: 2147483647);

            migrationBuilder.UpdateData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000004"),
                column: "MaxCopies",
                value: 2147483647);

            // Rules an admin created before this change also carry a number a set rule can no longer show. They
            // are rewritten to the value their format's pool mode gives them: banned in an open pool, admitted at
            // the format's cap in an allow list.
            migrationBuilder.Sql(
                """
                UPDATE "deck_ruleset_card_restrictions" AS r
                SET "MaxCopies" = CASE WHEN s."CardPoolMode" = 1 THEN 2147483647 ELSE 0 END
                FROM "deck_rulesets" AS s
                WHERE s."Id" = r."DeckRulesetId" AND r."MatchType" = 1;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.UpdateData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000001"),
                column: "MaxCopies",
                value: 3);

            migrationBuilder.UpdateData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000002"),
                column: "MaxCopies",
                value: 3);

            migrationBuilder.UpdateData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000003"),
                column: "MaxCopies",
                value: 3);

            migrationBuilder.UpdateData(
                table: "deck_ruleset_card_restrictions",
                keyColumn: "Id",
                keyValue: new Guid("30000000-0000-0000-0000-000000000004"),
                column: "MaxCopies",
                value: 3);
        }
    }
}
