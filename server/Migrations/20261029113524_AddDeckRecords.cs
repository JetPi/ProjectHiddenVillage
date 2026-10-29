using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddDeckRecords : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "deck_records",
                columns: table => new
                {
                    DeckId = table.Column<Guid>(type: "uuid", nullable: false),
                    UserId = table.Column<Guid>(type: "uuid", nullable: false),
                    Wins = table.Column<int>(type: "integer", nullable: false),
                    Losses = table.Column<int>(type: "integer", nullable: false),
                    Draws = table.Column<int>(type: "integer", nullable: false),
                    UpdatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deck_records", x => new { x.DeckId, x.UserId });
                    table.CheckConstraint("CK_deck_records_counters_non_negative", "\"Wins\" >= 0 AND \"Losses\" >= 0 AND \"Draws\" >= 0");
                    table.ForeignKey(
                        name: "FK_deck_records_decks_DeckId",
                        column: x => x.DeckId,
                        principalTable: "decks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_deck_records_users_UserId",
                        column: x => x.UserId,
                        principalTable: "users",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_deck_records_UserId",
                table: "deck_records",
                column: "UserId");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "deck_records");
        }
    }
}
