using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddCardCatalogIndexes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateIndex(
                name: "IX_card_catalog_entries_Color",
                table: "card_catalog_entries",
                column: "Color");

            migrationBuilder.CreateIndex(
                name: "IX_card_catalog_entries_DisplayName",
                table: "card_catalog_entries",
                column: "DisplayName");

            migrationBuilder.CreateIndex(
                name: "IX_card_catalog_entries_Type",
                table: "card_catalog_entries",
                column: "Type");

            migrationBuilder.CreateIndex(
                name: "IX_card_catalog_entries_UpdatedAtUtc",
                table: "card_catalog_entries",
                column: "UpdatedAtUtc");

            // Hand-written because EF cannot express a covering expression index, so this one is deliberately
            // absent from the model snapshot (see CardCatalogEntryConfiguration).
            //
            // Every card lookup is written as `upper("CardId") = @id`, which a plain index on "CardId" cannot
            // serve: without this, each art request - the most frequent request in the app - scans a table whose
            // rows are wide with jsonb effect specs. Including "Image" and "UpdatedAtUtc" makes that lookup
            // index-only, and the unique constraint turns case-insensitive ids into a database invariant instead
            // of the application-level AnyAsync race in the create path.
            migrationBuilder.Sql(
                """
                CREATE UNIQUE INDEX "IX_card_catalog_entries_CardId_upper"
                    ON card_catalog_entries (upper("CardId"))
                    INCLUDE ("Image", "UpdatedAtUtc");
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_card_catalog_entries_Color",
                table: "card_catalog_entries");

            migrationBuilder.DropIndex(
                name: "IX_card_catalog_entries_DisplayName",
                table: "card_catalog_entries");

            migrationBuilder.DropIndex(
                name: "IX_card_catalog_entries_Type",
                table: "card_catalog_entries");

            migrationBuilder.DropIndex(
                name: "IX_card_catalog_entries_UpdatedAtUtc",
                table: "card_catalog_entries");

            migrationBuilder.Sql("""DROP INDEX IF EXISTS "IX_card_catalog_entries_CardId_upper";""");
        }
    }
}
