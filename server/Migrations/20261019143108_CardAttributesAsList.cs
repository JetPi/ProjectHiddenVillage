using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class CardAttributesAsList : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttributesJson",
                table: "card_catalog_entries",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");

            // Preserve the old singular value as a list. The source format has always been a slash-separated
            // string; commas are accepted too so a hand-entered value survives the move.
            migrationBuilder.Sql(
                """
                UPDATE card_catalog_entries
                SET "AttributesJson" = (
                    SELECT COALESCE(jsonb_agg(part ORDER BY ordinality), '[]'::jsonb)
                    FROM (
                        SELECT btrim(attribute_value) AS part, ordinality
                        FROM regexp_split_to_table("Attribute", '\s*[/,]\s*') WITH ORDINALITY AS split(attribute_value, ordinality)
                        WHERE btrim(attribute_value) <> ''
                    ) AS parts
                )
                WHERE "Attribute" IS NOT NULL AND btrim("Attribute") <> '';
                """);

            migrationBuilder.DropColumn(
                name: "Attribute",
                table: "card_catalog_entries");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "Attribute",
                table: "card_catalog_entries",
                type: "character varying(128)",
                maxLength: 128,
                nullable: true);

            migrationBuilder.Sql(
                """
                UPDATE card_catalog_entries
                SET "Attribute" = (
                    SELECT string_agg(attribute_value, '/')
                    FROM jsonb_array_elements_text("AttributesJson") AS parsed(attribute_value)
                )
                WHERE jsonb_array_length("AttributesJson") > 0;
                """);

            migrationBuilder.DropColumn(
                name: "AttributesJson",
                table: "card_catalog_entries");
        }
    }
}
