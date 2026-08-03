using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddCardCatalogEntries : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "card_catalog_entries",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    CardId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    Image = table.Column<string>(type: "character varying(1024)", maxLength: 1024, nullable: false),
                    OriginalId = table.Column<string>(type: "character varying(64)", maxLength: 64, nullable: false),
                    MainAlternate = table.Column<bool>(type: "boolean", nullable: false),
                    Attribute = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: true),
                    DisplayName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: false),
                    Type = table.Column<int>(type: "integer", nullable: false),
                    Color = table.Column<int>(type: "integer", nullable: false),
                    Description = table.Column<string>(type: "text", nullable: false),
                    Damage = table.Column<int>(type: "integer", nullable: false),
                    Power = table.Column<int>(type: "integer", nullable: false),
                    NameJson = table.Column<string>(type: "jsonb", nullable: false),
                    TraitsJson = table.Column<string>(type: "jsonb", nullable: false),
                    ConditionsJson = table.Column<string>(type: "jsonb", nullable: false),
                    EffectsJson = table.Column<string>(type: "jsonb", nullable: false),
                    Life = table.Column<int>(type: "integer", nullable: true),
                    Health = table.Column<int>(type: "integer", nullable: true),
                    SupportName = table.Column<string>(type: "character varying(256)", maxLength: 256, nullable: true),
                    SupportEffect = table.Column<string>(type: "text", nullable: true),
                    SupportCost = table.Column<int>(type: "integer", nullable: true),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_card_catalog_entries", x => x.Id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_card_catalog_entries_CardId",
                table: "card_catalog_entries",
                column: "CardId",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "card_catalog_entries");
        }
    }
}
