using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class RemoveCardAttributes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "AttributesJson",
                table: "card_catalog_entries");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "AttributesJson",
                table: "card_catalog_entries",
                type: "jsonb",
                nullable: false,
                defaultValue: "[]");
        }
    }
}
