using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddDeckRulesets : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "deck_rulesets",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    Key = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Name = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    IsActive = table.Column<bool>(type: "boolean", nullable: false),
                    LeaderCount = table.Column<int>(type: "integer", nullable: false),
                    NonLeaderCardCount = table.Column<int>(type: "integer", nullable: false),
                    MaxCopiesPerNonLeaderCard = table.Column<int>(type: "integer", nullable: false),
                    RequireLeaderColorMatch = table.Column<bool>(type: "boolean", nullable: false),
                    AllowChakraCards = table.Column<bool>(type: "boolean", nullable: false),
                    AllowSummonCards = table.Column<bool>(type: "boolean", nullable: false),
                    SortOrder = table.Column<int>(type: "integer", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deck_rulesets", x => x.Id);
                    table.CheckConstraint("CK_deck_rulesets_counts_positive", "\"LeaderCount\" > 0 AND \"NonLeaderCardCount\" > 0 AND \"MaxCopiesPerNonLeaderCard\" > 0");
                });

            migrationBuilder.CreateTable(
                name: "deck_ruleset_card_restrictions",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DeckRulesetId = table.Column<Guid>(type: "uuid", nullable: false),
                    CardCatalogEntryId = table.Column<Guid>(type: "uuid", nullable: false),
                    MaxCopies = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deck_ruleset_card_restrictions", x => x.Id);
                    table.CheckConstraint("CK_deck_ruleset_card_restrictions_max_copies_non_negative", "\"MaxCopies\" >= 0");
                    table.ForeignKey(
                        name: "FK_deck_ruleset_card_restrictions_card_catalog_entries_CardCat~",
                        column: x => x.CardCatalogEntryId,
                        principalTable: "card_catalog_entries",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                    table.ForeignKey(
                        name: "FK_deck_ruleset_card_restrictions_deck_rulesets_DeckRulesetId",
                        column: x => x.DeckRulesetId,
                        principalTable: "deck_rulesets",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.InsertData(
                table: "deck_rulesets",
                columns: new[] { "Id", "AllowChakraCards", "AllowSummonCards", "CreatedAtUtc", "IsActive", "Key", "LeaderCount", "MaxCopiesPerNonLeaderCard", "Name", "NonLeaderCardCount", "RequireLeaderColorMatch", "SortOrder", "UpdatedAtUtc" },
                values: new object[,]
                {
                    { new Guid("20000000-0000-0000-0000-000000000001"), false, false, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), true, "standard", 1, 4, "Standard", 50, true, 0, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) },
                    { new Guid("20000000-0000-0000-0000-000000000002"), false, false, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)), true, "pre-release", 1, 3, "Pre-Release", 30, true, 1, new DateTimeOffset(new DateTime(2026, 1, 1, 0, 0, 0, 0, DateTimeKind.Unspecified), new TimeSpan(0, 0, 0, 0, 0)) }
                });

            migrationBuilder.CreateIndex(
                name: "IX_deck_ruleset_card_restrictions_CardCatalogEntryId",
                table: "deck_ruleset_card_restrictions",
                column: "CardCatalogEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_deck_ruleset_card_restrictions_DeckRulesetId_CardCatalogEnt~",
                table: "deck_ruleset_card_restrictions",
                columns: new[] { "DeckRulesetId", "CardCatalogEntryId" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_deck_rulesets_IsActive_SortOrder",
                table: "deck_rulesets",
                columns: new[] { "IsActive", "SortOrder" });

            migrationBuilder.CreateIndex(
                name: "IX_deck_rulesets_Key",
                table: "deck_rulesets",
                column: "Key",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "deck_ruleset_card_restrictions");

            migrationBuilder.DropTable(
                name: "deck_rulesets");
        }
    }
}
