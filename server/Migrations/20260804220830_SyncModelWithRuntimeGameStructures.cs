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
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF to_regclass('public.game_instances') IS NOT NULL THEN
                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'FK_game_instances_deck_instances_Player1DeckInstanceId'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "FK_game_instances_deck_instances_Player1DeckInstanceId";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'FK_game_instances_deck_instances_Player2DeckInstanceId'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "FK_game_instances_deck_instances_Player2DeckInstanceId";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_game_instances_player_deck_instances_different'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "CK_game_instances_player_deck_instances_different";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player2DeckInstanceId'
                        )
                        AND NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player2UserId'
                        ) THEN
                            ALTER TABLE public.game_instances RENAME COLUMN "Player2DeckInstanceId" TO "Player2UserId";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player1DeckInstanceId'
                        )
                        AND NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player1UserId'
                        ) THEN
                            ALTER TABLE public.game_instances RENAME COLUMN "Player1DeckInstanceId" TO "Player1UserId";
                        END IF;

                        IF to_regclass('public."IX_game_instances_Player2DeckInstanceId"') IS NOT NULL
                           AND to_regclass('public."IX_game_instances_Player2UserId"') IS NULL THEN
                            ALTER INDEX public."IX_game_instances_Player2DeckInstanceId" RENAME TO "IX_game_instances_Player2UserId";
                        END IF;

                        IF to_regclass('public."IX_game_instances_Player1DeckInstanceId"') IS NOT NULL
                           AND to_regclass('public."IX_game_instances_Player1UserId"') IS NULL THEN
                            ALTER INDEX public."IX_game_instances_Player1DeckInstanceId" RENAME TO "IX_game_instances_Player1UserId";
                        END IF;

                        IF to_regclass('public.deck_instance_cards') IS NOT NULL THEN
                            DROP TABLE public.deck_instance_cards;
                        END IF;

                        IF to_regclass('public.deck_instances') IS NOT NULL THEN
                            DROP TABLE public.deck_instances;
                        END IF;
                    ELSE
                        CREATE TABLE public.game_instances
                        (
                            "Id" uuid NOT NULL,
                            "CreatedAtUtc" timestamp with time zone NOT NULL,
                            "Player1DeckId" uuid NOT NULL,
                            "Player2DeckId" uuid NOT NULL,
                            "Player1UserId" uuid NOT NULL,
                            "Player2UserId" uuid NOT NULL,
                            CONSTRAINT "PK_game_instances" PRIMARY KEY ("Id")
                        );
                    END IF;

                    IF to_regclass('public.deck_cards') IS NOT NULL THEN
                        IF to_regclass('public."IX_deck_cards_DeckId_Position"') IS NOT NULL THEN
                            DROP INDEX public."IX_deck_cards_DeckId_Position";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'deck_cards'
                              AND column_name = 'CardId'
                        ) THEN
                            ALTER TABLE public.deck_cards DROP COLUMN "CardId";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'deck_cards'
                              AND column_name = 'Position'
                        )
                        AND NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'deck_cards'
                              AND column_name = 'Quantity'
                        ) THEN
                            ALTER TABLE public.deck_cards RENAME COLUMN "Position" TO "Quantity";
                        END IF;
                    END IF;

                    IF to_regclass('public.game_instances') IS NOT NULL THEN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player1CurrentChakras'
                        ) THEN
                            ALTER TABLE public.game_instances
                                ADD COLUMN "Player1CurrentChakras" boolean[] NOT NULL
                                DEFAULT ARRAY[TRUE, TRUE, TRUE, TRUE, TRUE, TRUE];
                        END IF;

                        IF NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player1SummonCard'
                        ) THEN
                            ALTER TABLE public.game_instances
                                ADD COLUMN "Player1SummonCard" boolean NOT NULL DEFAULT TRUE;
                        END IF;

                        IF NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player2CurrentChakras'
                        ) THEN
                            ALTER TABLE public.game_instances
                                ADD COLUMN "Player2CurrentChakras" boolean[] NOT NULL
                                DEFAULT ARRAY[TRUE, TRUE, TRUE, TRUE, TRUE, TRUE];
                        END IF;

                        IF NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player2SummonCard'
                        ) THEN
                            ALTER TABLE public.game_instances
                                ADD COLUMN "Player2SummonCard" boolean NOT NULL DEFAULT TRUE;
                        END IF;

                        CREATE INDEX IF NOT EXISTS "IX_game_instances_Player1DeckId"
                            ON public.game_instances ("Player1DeckId");

                        CREATE INDEX IF NOT EXISTS "IX_game_instances_Player2DeckId"
                            ON public.game_instances ("Player2DeckId");

                        CREATE INDEX IF NOT EXISTS "IX_game_instances_Player1UserId"
                            ON public.game_instances ("Player1UserId");

                        CREATE INDEX IF NOT EXISTS "IX_game_instances_Player2UserId"
                            ON public.game_instances ("Player2UserId");

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_game_instances_player_users_different'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "CK_game_instances_player_users_different";
                        END IF;

                        ALTER TABLE public.game_instances
                            ADD CONSTRAINT "CK_game_instances_player_users_different"
                            CHECK ("Player1UserId" <> "Player2UserId");

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_game_instances_player1_current_chakras_length'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "CK_game_instances_player1_current_chakras_length";
                        END IF;

                        ALTER TABLE public.game_instances
                            ADD CONSTRAINT "CK_game_instances_player1_current_chakras_length"
                            CHECK (cardinality("Player1CurrentChakras") = 6);

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_game_instances_player2_current_chakras_length'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "CK_game_instances_player2_current_chakras_length";
                        END IF;

                        ALTER TABLE public.game_instances
                            ADD CONSTRAINT "CK_game_instances_player2_current_chakras_length"
                            CHECK (cardinality("Player2CurrentChakras") = 6);

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_game_instances_player_decks_different'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "CK_game_instances_player_decks_different";
                        END IF;

                        ALTER TABLE public.game_instances
                            ADD CONSTRAINT "CK_game_instances_player_decks_different"
                            CHECK ("Player1DeckId" <> "Player2DeckId");
                    END IF;

                    IF to_regclass('public.deck_cards') IS NOT NULL THEN
                        IF to_regclass('public."IX_deck_cards_CardCatalogEntryId"') IS NULL THEN
                            CREATE INDEX "IX_deck_cards_CardCatalogEntryId"
                                ON public.deck_cards ("CardCatalogEntryId");
                        END IF;

                        IF to_regclass('public."IX_deck_cards_DeckId_CardCatalogEntryId"') IS NULL THEN
                            CREATE UNIQUE INDEX "IX_deck_cards_DeckId_CardCatalogEntryId"
                                ON public.deck_cards ("DeckId", "CardCatalogEntryId");
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_deck_cards_quantity_positive'
                              AND conrelid = to_regclass('public.deck_cards')
                        ) THEN
                            ALTER TABLE public.deck_cards DROP CONSTRAINT "CK_deck_cards_quantity_positive";
                        END IF;

                        ALTER TABLE public.deck_cards
                            ADD CONSTRAINT "CK_deck_cards_quantity_positive"
                            CHECK ("Quantity" > 0);
                    END IF;

                    IF to_regclass('public.deck_cards') IS NOT NULL
                       AND to_regclass('public.card_catalog_entries') IS NOT NULL
                       AND EXISTS (
                           SELECT 1
                           FROM information_schema.columns
                           WHERE table_schema = 'public'
                             AND table_name = 'deck_cards'
                             AND column_name = 'CardCatalogEntryId'
                       )
                       AND NOT EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_deck_cards_card_catalog_entries_CardCatalogEntryId'
                             AND conrelid = to_regclass('public.deck_cards')
                       ) THEN
                        ALTER TABLE public.deck_cards
                            ADD CONSTRAINT "FK_deck_cards_card_catalog_entries_CardCatalogEntryId"
                            FOREIGN KEY ("CardCatalogEntryId")
                            REFERENCES public.card_catalog_entries ("Id")
                            ON DELETE RESTRICT;
                    END IF;

                    IF to_regclass('public.game_instances') IS NOT NULL
                       AND to_regclass('public.users') IS NOT NULL
                       AND NOT EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_game_instances_users_Player1UserId'
                             AND conrelid = to_regclass('public.game_instances')
                       ) THEN
                        ALTER TABLE public.game_instances
                            ADD CONSTRAINT "FK_game_instances_users_Player1UserId"
                            FOREIGN KEY ("Player1UserId")
                            REFERENCES public.users ("Id")
                            ON DELETE RESTRICT;
                    END IF;

                    IF to_regclass('public.game_instances') IS NOT NULL
                       AND to_regclass('public.users') IS NOT NULL
                       AND NOT EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_game_instances_users_Player2UserId'
                             AND conrelid = to_regclass('public.game_instances')
                       ) THEN
                        ALTER TABLE public.game_instances
                            ADD CONSTRAINT "FK_game_instances_users_Player2UserId"
                            FOREIGN KEY ("Player2UserId")
                            REFERENCES public.users ("Id")
                            ON DELETE RESTRICT;
                    END IF;
                END
                $$;
                """);

            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF to_regclass('public.deck_cards') IS NOT NULL THEN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'deck_cards'
                              AND column_name = 'CardCatalogEntryId'
                        ) THEN
                            ALTER TABLE public.deck_cards
                                ADD COLUMN "CardCatalogEntryId" uuid NOT NULL
                                DEFAULT '00000000-0000-0000-0000-000000000000';
                        END IF;
                    END IF;
                END
                $$;
                """);

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

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF to_regclass('public.deck_cards') IS NOT NULL
                       AND EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_deck_cards_card_catalog_entries_CardCatalogEntryId'
                             AND conrelid = to_regclass('public.deck_cards')
                       ) THEN
                        ALTER TABLE public.deck_cards DROP CONSTRAINT "FK_deck_cards_card_catalog_entries_CardCatalogEntryId";
                    END IF;

                    IF to_regclass('public.game_instances') IS NOT NULL
                       AND EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_game_instances_users_Player1UserId'
                             AND conrelid = to_regclass('public.game_instances')
                       ) THEN
                        ALTER TABLE public.game_instances DROP CONSTRAINT "FK_game_instances_users_Player1UserId";
                    END IF;

                    IF to_regclass('public.game_instances') IS NOT NULL
                       AND EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_game_instances_users_Player2UserId'
                             AND conrelid = to_regclass('public.game_instances')
                       ) THEN
                        ALTER TABLE public.game_instances DROP CONSTRAINT "FK_game_instances_users_Player2UserId";
                    END IF;

                    DROP TABLE IF EXISTS public.player1_character_field_cards;
                    DROP TABLE IF EXISTS public.player1_runtime_deck_cards;
                    DROP TABLE IF EXISTS public.player1_support_area_cards;
                    DROP TABLE IF EXISTS public.player1_trash_cards;
                    DROP TABLE IF EXISTS public.player2_character_field_cards;
                    DROP TABLE IF EXISTS public.player2_runtime_deck_cards;
                    DROP TABLE IF EXISTS public.player2_support_area_cards;
                    DROP TABLE IF EXISTS public.player2_trash_cards;

                    IF to_regclass('public.game_instances') IS NOT NULL THEN
                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_game_instances_player_users_different'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "CK_game_instances_player_users_different";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_game_instances_player1_current_chakras_length'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "CK_game_instances_player1_current_chakras_length";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_game_instances_player2_current_chakras_length'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "CK_game_instances_player2_current_chakras_length";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player2UserId'
                        )
                        AND NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player2DeckInstanceId'
                        ) THEN
                            ALTER TABLE public.game_instances RENAME COLUMN "Player2UserId" TO "Player2DeckInstanceId";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player1UserId'
                        )
                        AND NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player1DeckInstanceId'
                        ) THEN
                            ALTER TABLE public.game_instances RENAME COLUMN "Player1UserId" TO "Player1DeckInstanceId";
                        END IF;

                        IF to_regclass('public."IX_game_instances_Player2UserId"') IS NOT NULL
                           AND to_regclass('public."IX_game_instances_Player2DeckInstanceId"') IS NULL THEN
                            ALTER INDEX public."IX_game_instances_Player2UserId" RENAME TO "IX_game_instances_Player2DeckInstanceId";
                        END IF;

                        IF to_regclass('public."IX_game_instances_Player1UserId"') IS NOT NULL
                           AND to_regclass('public."IX_game_instances_Player1DeckInstanceId"') IS NULL THEN
                            ALTER INDEX public."IX_game_instances_Player1UserId" RENAME TO "IX_game_instances_Player1DeckInstanceId";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player1CurrentChakras'
                        ) THEN
                            ALTER TABLE public.game_instances DROP COLUMN "Player1CurrentChakras";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player1SummonCard'
                        ) THEN
                            ALTER TABLE public.game_instances DROP COLUMN "Player1SummonCard";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player2CurrentChakras'
                        ) THEN
                            ALTER TABLE public.game_instances DROP COLUMN "Player2CurrentChakras";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'game_instances'
                              AND column_name = 'Player2SummonCard'
                        ) THEN
                            ALTER TABLE public.game_instances DROP COLUMN "Player2SummonCard";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_game_instances_player_deck_instances_different'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "CK_game_instances_player_deck_instances_different";
                        END IF;
                    END IF;

                    IF to_regclass('public.deck_cards') IS NOT NULL THEN
                        IF to_regclass('public."IX_deck_cards_CardCatalogEntryId"') IS NOT NULL THEN
                            DROP INDEX public."IX_deck_cards_CardCatalogEntryId";
                        END IF;

                        IF to_regclass('public."IX_deck_cards_DeckId_CardCatalogEntryId"') IS NOT NULL THEN
                            DROP INDEX public."IX_deck_cards_DeckId_CardCatalogEntryId";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_deck_cards_quantity_positive'
                              AND conrelid = to_regclass('public.deck_cards')
                        ) THEN
                            ALTER TABLE public.deck_cards DROP CONSTRAINT "CK_deck_cards_quantity_positive";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'deck_cards'
                              AND column_name = 'CardCatalogEntryId'
                        ) THEN
                            ALTER TABLE public.deck_cards DROP COLUMN "CardCatalogEntryId";
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'deck_cards'
                              AND column_name = 'Quantity'
                        )
                        AND NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'deck_cards'
                              AND column_name = 'Position'
                        ) THEN
                            ALTER TABLE public.deck_cards RENAME COLUMN "Quantity" TO "Position";
                        END IF;

                        IF NOT EXISTS (
                            SELECT 1
                            FROM information_schema.columns
                            WHERE table_schema = 'public'
                              AND table_name = 'deck_cards'
                              AND column_name = 'CardId'
                        ) THEN
                            ALTER TABLE public.deck_cards
                                ADD COLUMN "CardId" character varying(128) NOT NULL DEFAULT '';
                        END IF;
                    END IF;

                    IF to_regclass('public.deck_instances') IS NULL THEN
                        CREATE TABLE public.deck_instances
                        (
                            "Id" uuid NOT NULL,
                            "SourceDeckId" uuid NOT NULL,
                            "CreatedAtUtc" timestamp with time zone NOT NULL,
                            CONSTRAINT "PK_deck_instances" PRIMARY KEY ("Id")
                        );
                    END IF;

                    IF to_regclass('public.deck_instances') IS NOT NULL
                       AND to_regclass('public.decks') IS NOT NULL
                       AND NOT EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_deck_instances_decks_SourceDeckId'
                             AND conrelid = to_regclass('public.deck_instances')
                       ) THEN
                        ALTER TABLE public.deck_instances
                            ADD CONSTRAINT "FK_deck_instances_decks_SourceDeckId"
                            FOREIGN KEY ("SourceDeckId")
                            REFERENCES public.decks ("Id")
                            ON DELETE RESTRICT;
                    END IF;

                    CREATE INDEX IF NOT EXISTS "IX_deck_instances_SourceDeckId"
                        ON public.deck_instances ("SourceDeckId");

                    IF to_regclass('public.deck_instance_cards') IS NULL THEN
                        CREATE TABLE public.deck_instance_cards
                        (
                            "Id" uuid NOT NULL,
                            "DeckInstanceId" uuid NOT NULL,
                            "CardId" character varying(128) NOT NULL,
                            "Position" integer NOT NULL,
                            CONSTRAINT "PK_deck_instance_cards" PRIMARY KEY ("Id")
                        );
                    END IF;

                    IF to_regclass('public.deck_instance_cards') IS NOT NULL
                       AND to_regclass('public.deck_instances') IS NOT NULL
                       AND NOT EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_deck_instance_cards_deck_instances_DeckInstanceId'
                             AND conrelid = to_regclass('public.deck_instance_cards')
                       ) THEN
                        ALTER TABLE public.deck_instance_cards
                            ADD CONSTRAINT "FK_deck_instance_cards_deck_instances_DeckInstanceId"
                            FOREIGN KEY ("DeckInstanceId")
                            REFERENCES public.deck_instances ("Id")
                            ON DELETE CASCADE;
                    END IF;

                    CREATE INDEX IF NOT EXISTS "IX_deck_instance_cards_DeckInstanceId"
                        ON public.deck_instance_cards ("DeckInstanceId");

                    CREATE UNIQUE INDEX IF NOT EXISTS "IX_deck_instance_cards_DeckInstanceId_Position"
                        ON public.deck_instance_cards ("DeckInstanceId", "Position");

                    IF to_regclass('public.game_instances') IS NOT NULL
                       AND EXISTS (
                           SELECT 1
                           FROM information_schema.columns
                           WHERE table_schema = 'public'
                             AND table_name = 'game_instances'
                             AND column_name = 'Player1DeckInstanceId'
                       )
                       AND EXISTS (
                           SELECT 1
                           FROM information_schema.columns
                           WHERE table_schema = 'public'
                             AND table_name = 'game_instances'
                             AND column_name = 'Player2DeckInstanceId'
                       ) THEN
                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'CK_game_instances_player_deck_instances_different'
                              AND conrelid = to_regclass('public.game_instances')
                        ) THEN
                            ALTER TABLE public.game_instances DROP CONSTRAINT "CK_game_instances_player_deck_instances_different";
                        END IF;

                        ALTER TABLE public.game_instances
                            ADD CONSTRAINT "CK_game_instances_player_deck_instances_different"
                            CHECK ("Player1DeckInstanceId" <> "Player2DeckInstanceId");

                        IF to_regclass('public.deck_instances') IS NOT NULL
                           AND NOT EXISTS (
                               SELECT 1
                               FROM pg_constraint
                               WHERE conname = 'FK_game_instances_deck_instances_Player1DeckInstanceId'
                                 AND conrelid = to_regclass('public.game_instances')
                           ) THEN
                            ALTER TABLE public.game_instances
                                ADD CONSTRAINT "FK_game_instances_deck_instances_Player1DeckInstanceId"
                                FOREIGN KEY ("Player1DeckInstanceId")
                                REFERENCES public.deck_instances ("Id")
                                ON DELETE RESTRICT;
                        END IF;

                        IF to_regclass('public.deck_instances') IS NOT NULL
                           AND NOT EXISTS (
                               SELECT 1
                               FROM pg_constraint
                               WHERE conname = 'FK_game_instances_deck_instances_Player2DeckInstanceId'
                                 AND conrelid = to_regclass('public.game_instances')
                           ) THEN
                            ALTER TABLE public.game_instances
                                ADD CONSTRAINT "FK_game_instances_deck_instances_Player2DeckInstanceId"
                                FOREIGN KEY ("Player2DeckInstanceId")
                                REFERENCES public.deck_instances ("Id")
                                ON DELETE RESTRICT;
                        END IF;
                    END IF;
                END
                $$;
                """);
            migrationBuilder.CreateIndex(
                name: "IX_deck_cards_DeckId_Position",
                table: "deck_cards",
                columns: new[] { "DeckId", "Position" },
                unique: true);
        }
    }
}
