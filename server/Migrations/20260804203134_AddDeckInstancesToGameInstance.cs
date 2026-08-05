using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddDeckInstancesToGameInstance : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<Guid>(
                name: "Player1DeckInstanceId",
                table: "game_instances",
                type: "uuid",
                nullable: true);

            migrationBuilder.AddColumn<Guid>(
                name: "Player2DeckInstanceId",
                table: "game_instances",
                type: "uuid",
                nullable: true);

            migrationBuilder.CreateTable(
                name: "deck_instances",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    SourceDeckId = table.Column<Guid>(type: "uuid", nullable: false),
                    CreatedAtUtc = table.Column<DateTimeOffset>(type: "timestamp with time zone", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deck_instances", x => x.Id);
                    table.ForeignKey(
                        name: "FK_deck_instances_decks_SourceDeckId",
                        column: x => x.SourceDeckId,
                        principalTable: "decks",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Restrict);
                });

            migrationBuilder.CreateTable(
                name: "deck_instance_cards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    DeckInstanceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CardId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_deck_instance_cards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_deck_instance_cards_deck_instances_DeckInstanceId",
                        column: x => x.DeckInstanceId,
                        principalTable: "deck_instances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.Sql(
                """
                INSERT INTO deck_instances ("Id", "SourceDeckId", "CreatedAtUtc")
                SELECT
                    (
                        substr(md5("Id"::text || ':p1'), 1, 8) || '-' ||
                        substr(md5("Id"::text || ':p1'), 9, 4) || '-' ||
                        substr(md5("Id"::text || ':p1'), 13, 4) || '-' ||
                        substr(md5("Id"::text || ':p1'), 17, 4) || '-' ||
                        substr(md5("Id"::text || ':p1'), 21, 12)
                    )::uuid,
                    "Player1DeckId",
                    NOW()
                FROM game_instances;

                INSERT INTO deck_instances ("Id", "SourceDeckId", "CreatedAtUtc")
                SELECT
                    (
                        substr(md5("Id"::text || ':p2'), 1, 8) || '-' ||
                        substr(md5("Id"::text || ':p2'), 9, 4) || '-' ||
                        substr(md5("Id"::text || ':p2'), 13, 4) || '-' ||
                        substr(md5("Id"::text || ':p2'), 17, 4) || '-' ||
                        substr(md5("Id"::text || ':p2'), 21, 12)
                    )::uuid,
                    "Player2DeckId",
                    NOW()
                FROM game_instances;

                UPDATE game_instances
                SET "Player1DeckInstanceId" = (
                        substr(md5("Id"::text || ':p1'), 1, 8) || '-' ||
                        substr(md5("Id"::text || ':p1'), 9, 4) || '-' ||
                        substr(md5("Id"::text || ':p1'), 13, 4) || '-' ||
                        substr(md5("Id"::text || ':p1'), 17, 4) || '-' ||
                        substr(md5("Id"::text || ':p1'), 21, 12)
                    )::uuid,
                    "Player2DeckInstanceId" = (
                        substr(md5("Id"::text || ':p2'), 1, 8) || '-' ||
                        substr(md5("Id"::text || ':p2'), 9, 4) || '-' ||
                        substr(md5("Id"::text || ':p2'), 13, 4) || '-' ||
                        substr(md5("Id"::text || ':p2'), 17, 4) || '-' ||
                        substr(md5("Id"::text || ':p2'), 21, 12)
                    )::uuid;
                """);

            migrationBuilder.AlterColumn<Guid>(
                name: "Player1DeckInstanceId",
                table: "game_instances",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.AlterColumn<Guid>(
                name: "Player2DeckInstanceId",
                table: "game_instances",
                type: "uuid",
                nullable: false,
                oldClrType: typeof(Guid),
                oldType: "uuid",
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_game_instances_Player1DeckInstanceId",
                table: "game_instances",
                column: "Player1DeckInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_game_instances_Player2DeckInstanceId",
                table: "game_instances",
                column: "Player2DeckInstanceId");

            migrationBuilder.AddCheckConstraint(
                name: "CK_game_instances_player_deck_instances_different",
                table: "game_instances",
                sql: "\"Player1DeckInstanceId\" <> \"Player2DeckInstanceId\"");

            migrationBuilder.CreateIndex(
                name: "IX_deck_instance_cards_DeckInstanceId",
                table: "deck_instance_cards",
                column: "DeckInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_deck_instance_cards_DeckInstanceId_Position",
                table: "deck_instance_cards",
                columns: new[] { "DeckInstanceId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_deck_instances_SourceDeckId",
                table: "deck_instances",
                column: "SourceDeckId");

            migrationBuilder.AddForeignKey(
                name: "FK_game_instances_deck_instances_Player1DeckInstanceId",
                table: "game_instances",
                column: "Player1DeckInstanceId",
                principalTable: "deck_instances",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_game_instances_deck_instances_Player2DeckInstanceId",
                table: "game_instances",
                column: "Player2DeckInstanceId",
                principalTable: "deck_instances",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_game_instances_deck_instances_Player1DeckInstanceId",
                table: "game_instances");

            migrationBuilder.DropForeignKey(
                name: "FK_game_instances_deck_instances_Player2DeckInstanceId",
                table: "game_instances");

            migrationBuilder.DropTable(
                name: "deck_instance_cards");

            migrationBuilder.DropTable(
                name: "deck_instances");

            migrationBuilder.DropIndex(
                name: "IX_game_instances_Player1DeckInstanceId",
                table: "game_instances");

            migrationBuilder.DropIndex(
                name: "IX_game_instances_Player2DeckInstanceId",
                table: "game_instances");

            migrationBuilder.DropCheckConstraint(
                name: "CK_game_instances_player_deck_instances_different",
                table: "game_instances");

            migrationBuilder.DropColumn(
                name: "Player1DeckInstanceId",
                table: "game_instances");

            migrationBuilder.DropColumn(
                name: "Player2DeckInstanceId",
                table: "game_instances");
        }
    }
}
