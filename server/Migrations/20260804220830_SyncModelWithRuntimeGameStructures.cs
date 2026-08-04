using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class SyncModelWithRuntimeGameStructures : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
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

            migrationBuilder.DropCheckConstraint(
                name: "CK_game_instances_player_deck_instances_different",
                table: "game_instances");

            migrationBuilder.DropIndex(
                name: "IX_deck_cards_DeckId_Position",
                table: "deck_cards");

            migrationBuilder.DropColumn(
                name: "CardId",
                table: "deck_cards");

            migrationBuilder.RenameColumn(
                name: "Player2DeckInstanceId",
                table: "game_instances",
                newName: "Player2UserId");

            migrationBuilder.RenameColumn(
                name: "Player1DeckInstanceId",
                table: "game_instances",
                newName: "Player1UserId");

            migrationBuilder.RenameIndex(
                name: "IX_game_instances_Player2DeckInstanceId",
                table: "game_instances",
                newName: "IX_game_instances_Player2UserId");

            migrationBuilder.RenameIndex(
                name: "IX_game_instances_Player1DeckInstanceId",
                table: "game_instances",
                newName: "IX_game_instances_Player1UserId");

            migrationBuilder.RenameColumn(
                name: "Position",
                table: "deck_cards",
                newName: "Quantity");

            migrationBuilder.AddColumn<bool[]>(
                name: "Player1CurrentChakras",
                table: "game_instances",
                type: "boolean[]",
                nullable: false,
                defaultValueSql: "ARRAY[TRUE, TRUE, TRUE, TRUE, TRUE, TRUE]");

            migrationBuilder.AddColumn<bool>(
                name: "Player1SummonCard",
                table: "game_instances",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool[]>(
                name: "Player2CurrentChakras",
                table: "game_instances",
                type: "boolean[]",
                nullable: false,
                defaultValueSql: "ARRAY[TRUE, TRUE, TRUE, TRUE, TRUE, TRUE]");

            migrationBuilder.AddColumn<bool>(
                name: "Player2SummonCard",
                table: "game_instances",
                type: "boolean",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<Guid>(
                name: "CardCatalogEntryId",
                table: "deck_cards",
                type: "uuid",
                nullable: false,
                defaultValue: new Guid("00000000-0000-0000-0000-000000000000"));

            migrationBuilder.CreateTable(
                name: "player1_character_field_cards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameInstanceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CardId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player1_character_field_cards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_player1_character_field_cards_game_instances_GameInstanceId",
                        column: x => x.GameInstanceId,
                        principalTable: "game_instances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "player1_runtime_deck_cards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameInstanceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CardId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player1_runtime_deck_cards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_player1_runtime_deck_cards_game_instances_GameInstanceId",
                        column: x => x.GameInstanceId,
                        principalTable: "game_instances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "player1_support_area_cards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameInstanceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CardId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player1_support_area_cards", x => x.Id);
                    table.CheckConstraint("CK_player1_support_area_cards_position_range", "\"Position\" >= 1 AND \"Position\" <= 5");
                    table.ForeignKey(
                        name: "FK_player1_support_area_cards_game_instances_GameInstanceId",
                        column: x => x.GameInstanceId,
                        principalTable: "game_instances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "player1_trash_cards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameInstanceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CardId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player1_trash_cards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_player1_trash_cards_game_instances_GameInstanceId",
                        column: x => x.GameInstanceId,
                        principalTable: "game_instances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "player2_character_field_cards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameInstanceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CardId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player2_character_field_cards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_player2_character_field_cards_game_instances_GameInstanceId",
                        column: x => x.GameInstanceId,
                        principalTable: "game_instances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "player2_runtime_deck_cards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameInstanceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CardId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player2_runtime_deck_cards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_player2_runtime_deck_cards_game_instances_GameInstanceId",
                        column: x => x.GameInstanceId,
                        principalTable: "game_instances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "player2_support_area_cards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameInstanceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CardId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player2_support_area_cards", x => x.Id);
                    table.CheckConstraint("CK_player2_support_area_cards_position_range", "\"Position\" >= 1 AND \"Position\" <= 5");
                    table.ForeignKey(
                        name: "FK_player2_support_area_cards_game_instances_GameInstanceId",
                        column: x => x.GameInstanceId,
                        principalTable: "game_instances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "player2_trash_cards",
                columns: table => new
                {
                    Id = table.Column<Guid>(type: "uuid", nullable: false),
                    GameInstanceId = table.Column<Guid>(type: "uuid", nullable: false),
                    CardId = table.Column<string>(type: "character varying(128)", maxLength: 128, nullable: false),
                    Position = table.Column<int>(type: "integer", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_player2_trash_cards", x => x.Id);
                    table.ForeignKey(
                        name: "FK_player2_trash_cards_game_instances_GameInstanceId",
                        column: x => x.GameInstanceId,
                        principalTable: "game_instances",
                        principalColumn: "Id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.AddCheckConstraint(
                name: "CK_game_instances_player_users_different",
                table: "game_instances",
                sql: "\"Player1UserId\" <> \"Player2UserId\"");

            migrationBuilder.AddCheckConstraint(
                name: "CK_game_instances_player1_current_chakras_length",
                table: "game_instances",
                sql: "cardinality(\"Player1CurrentChakras\") = 6");

            migrationBuilder.AddCheckConstraint(
                name: "CK_game_instances_player2_current_chakras_length",
                table: "game_instances",
                sql: "cardinality(\"Player2CurrentChakras\") = 6");

            migrationBuilder.CreateIndex(
                name: "IX_deck_cards_CardCatalogEntryId",
                table: "deck_cards",
                column: "CardCatalogEntryId");

            migrationBuilder.CreateIndex(
                name: "IX_deck_cards_DeckId_CardCatalogEntryId",
                table: "deck_cards",
                columns: new[] { "DeckId", "CardCatalogEntryId" },
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_deck_cards_quantity_positive",
                table: "deck_cards",
                sql: "\"Quantity\" > 0");

            migrationBuilder.CreateIndex(
                name: "IX_player1_character_field_cards_GameInstanceId",
                table: "player1_character_field_cards",
                column: "GameInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_player1_character_field_cards_GameInstanceId_Position",
                table: "player1_character_field_cards",
                columns: new[] { "GameInstanceId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_player1_runtime_deck_cards_GameInstanceId",
                table: "player1_runtime_deck_cards",
                column: "GameInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_player1_runtime_deck_cards_GameInstanceId_Position",
                table: "player1_runtime_deck_cards",
                columns: new[] { "GameInstanceId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_player1_support_area_cards_GameInstanceId",
                table: "player1_support_area_cards",
                column: "GameInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_player1_support_area_cards_GameInstanceId_Position",
                table: "player1_support_area_cards",
                columns: new[] { "GameInstanceId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_player1_trash_cards_GameInstanceId",
                table: "player1_trash_cards",
                column: "GameInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_player1_trash_cards_GameInstanceId_Position",
                table: "player1_trash_cards",
                columns: new[] { "GameInstanceId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_player2_character_field_cards_GameInstanceId",
                table: "player2_character_field_cards",
                column: "GameInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_player2_character_field_cards_GameInstanceId_Position",
                table: "player2_character_field_cards",
                columns: new[] { "GameInstanceId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_player2_runtime_deck_cards_GameInstanceId",
                table: "player2_runtime_deck_cards",
                column: "GameInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_player2_runtime_deck_cards_GameInstanceId_Position",
                table: "player2_runtime_deck_cards",
                columns: new[] { "GameInstanceId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_player2_support_area_cards_GameInstanceId",
                table: "player2_support_area_cards",
                column: "GameInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_player2_support_area_cards_GameInstanceId_Position",
                table: "player2_support_area_cards",
                columns: new[] { "GameInstanceId", "Position" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_player2_trash_cards_GameInstanceId",
                table: "player2_trash_cards",
                column: "GameInstanceId");

            migrationBuilder.CreateIndex(
                name: "IX_player2_trash_cards_GameInstanceId_Position",
                table: "player2_trash_cards",
                columns: new[] { "GameInstanceId", "Position" },
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_deck_cards_card_catalog_entries_CardCatalogEntryId",
                table: "deck_cards",
                column: "CardCatalogEntryId",
                principalTable: "card_catalog_entries",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_game_instances_users_Player1UserId",
                table: "game_instances",
                column: "Player1UserId",
                principalTable: "users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);

            migrationBuilder.AddForeignKey(
                name: "FK_game_instances_users_Player2UserId",
                table: "game_instances",
                column: "Player2UserId",
                principalTable: "users",
                principalColumn: "Id",
                onDelete: ReferentialAction.Restrict);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_deck_cards_card_catalog_entries_CardCatalogEntryId",
                table: "deck_cards");

            migrationBuilder.DropForeignKey(
                name: "FK_game_instances_users_Player1UserId",
                table: "game_instances");

            migrationBuilder.DropForeignKey(
                name: "FK_game_instances_users_Player2UserId",
                table: "game_instances");

            migrationBuilder.DropTable(
                name: "player1_character_field_cards");

            migrationBuilder.DropTable(
                name: "player1_runtime_deck_cards");

            migrationBuilder.DropTable(
                name: "player1_support_area_cards");

            migrationBuilder.DropTable(
                name: "player1_trash_cards");

            migrationBuilder.DropTable(
                name: "player2_character_field_cards");

            migrationBuilder.DropTable(
                name: "player2_runtime_deck_cards");

            migrationBuilder.DropTable(
                name: "player2_support_area_cards");

            migrationBuilder.DropTable(
                name: "player2_trash_cards");

            migrationBuilder.DropCheckConstraint(
                name: "CK_game_instances_player_users_different",
                table: "game_instances");

            migrationBuilder.DropCheckConstraint(
                name: "CK_game_instances_player1_current_chakras_length",
                table: "game_instances");

            migrationBuilder.DropCheckConstraint(
                name: "CK_game_instances_player2_current_chakras_length",
                table: "game_instances");

            migrationBuilder.DropIndex(
                name: "IX_deck_cards_CardCatalogEntryId",
                table: "deck_cards");

            migrationBuilder.DropIndex(
                name: "IX_deck_cards_DeckId_CardCatalogEntryId",
                table: "deck_cards");

            migrationBuilder.DropCheckConstraint(
                name: "CK_deck_cards_quantity_positive",
                table: "deck_cards");

            migrationBuilder.DropColumn(
                name: "Player1CurrentChakras",
                table: "game_instances");

            migrationBuilder.DropColumn(
                name: "Player1SummonCard",
                table: "game_instances");

            migrationBuilder.DropColumn(
                name: "Player2CurrentChakras",
                table: "game_instances");

            migrationBuilder.DropColumn(
                name: "Player2SummonCard",
                table: "game_instances");

            migrationBuilder.DropColumn(
                name: "CardCatalogEntryId",
                table: "deck_cards");

            migrationBuilder.RenameColumn(
                name: "Player2UserId",
                table: "game_instances",
                newName: "Player2DeckInstanceId");

            migrationBuilder.RenameColumn(
                name: "Player1UserId",
                table: "game_instances",
                newName: "Player1DeckInstanceId");

            migrationBuilder.RenameIndex(
                name: "IX_game_instances_Player2UserId",
                table: "game_instances",
                newName: "IX_game_instances_Player2DeckInstanceId");

            migrationBuilder.RenameIndex(
                name: "IX_game_instances_Player1UserId",
                table: "game_instances",
                newName: "IX_game_instances_Player1DeckInstanceId");

            migrationBuilder.RenameColumn(
                name: "Quantity",
                table: "deck_cards",
                newName: "Position");

            migrationBuilder.AddColumn<string>(
                name: "CardId",
                table: "deck_cards",
                type: "character varying(128)",
                maxLength: 128,
                nullable: false,
                defaultValue: "");

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

            migrationBuilder.AddCheckConstraint(
                name: "CK_game_instances_player_deck_instances_different",
                table: "game_instances",
                sql: "\"Player1DeckInstanceId\" <> \"Player2DeckInstanceId\"");

            migrationBuilder.CreateIndex(
                name: "IX_deck_cards_DeckId_Position",
                table: "deck_cards",
                columns: new[] { "DeckId", "Position" },
                unique: true);

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
    }
}
