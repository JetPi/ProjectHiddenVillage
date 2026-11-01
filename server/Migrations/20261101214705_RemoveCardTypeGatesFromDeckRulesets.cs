using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class RemoveCardTypeGatesFromDeckRulesets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            // Chakra and Summon cards are fundamental to the game, so a format can no longer switch them off. The
            // flags were the only thing that read these columns.
            migrationBuilder.DropColumn(
                name: "AllowChakraCards",
                table: "deck_rulesets");

            migrationBuilder.DropColumn(
                name: "AllowSummonCards",
                table: "deck_rulesets");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "AllowChakraCards",
                table: "deck_rulesets",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<bool>(
                name: "AllowSummonCards",
                table: "deck_rulesets",
                type: "boolean",
                nullable: false,
                defaultValue: false);

            migrationBuilder.UpdateData(
                table: "deck_rulesets",
                keyColumn: "Id",
                keyValue: new Guid("20000000-0000-0000-0000-000000000001"),
                columns: new[] { "AllowChakraCards", "AllowSummonCards" },
                values: new object[] { false, false });

            migrationBuilder.UpdateData(
                table: "deck_rulesets",
                keyColumn: "Id",
                keyValue: new Guid("20000000-0000-0000-0000-000000000002"),
                columns: new[] { "AllowChakraCards", "AllowSummonCards" },
                values: new object[] { false, false });

            migrationBuilder.UpdateData(
                table: "deck_rulesets",
                keyColumn: "Id",
                keyValue: new Guid("20000000-0000-0000-0000-000000000003"),
                columns: new[] { "AllowChakraCards", "AllowSummonCards" },
                values: new object[] { true, true });
        }
    }
}
