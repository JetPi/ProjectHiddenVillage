using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddTypeToDecks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF to_regclass('public.decks') IS NULL THEN
                        CREATE TABLE public.decks
                        (
                            "Id" uuid NOT NULL,
                            "Type" character varying(16) NOT NULL DEFAULT 'Public',
                            "UserId" uuid NULL,
                            CONSTRAINT "PK_decks" PRIMARY KEY ("Id")
                        );
                    END IF;

                    IF to_regclass('public."IX_decks_UserId"') IS NULL THEN
                        CREATE INDEX "IX_decks_UserId"
                            ON public.decks ("UserId");
                    END IF;

                    IF to_regclass('public.decks') IS NOT NULL
                       AND NOT EXISTS (
                           SELECT 1
                           FROM information_schema.columns
                           WHERE table_schema = 'public'
                             AND table_name = 'decks'
                             AND column_name = 'Type'
                       ) THEN
                        ALTER TABLE public.decks
                            ADD COLUMN "Type" character varying(16) NOT NULL DEFAULT 'Public';
                    END IF;

                    IF to_regclass('public.decks') IS NOT NULL
                       AND to_regclass('public.users') IS NOT NULL
                       AND NOT EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_decks_users_UserId'
                             AND conrelid = to_regclass('public.decks')
                       ) THEN
                        ALTER TABLE public.decks
                            ADD CONSTRAINT "FK_decks_users_UserId"
                            FOREIGN KEY ("UserId")
                            REFERENCES public.users ("Id")
                            ON DELETE SET NULL;
                    END IF;

                    IF to_regclass('public.deck_cards') IS NULL THEN
                        CREATE TABLE public.deck_cards
                        (
                            "Id" uuid NOT NULL,
                            "DeckId" uuid NOT NULL,
                            "CardCatalogEntryId" uuid NOT NULL,
                            "Quantity" integer NOT NULL,
                            CONSTRAINT "PK_deck_cards" PRIMARY KEY ("Id"),
                            CONSTRAINT "CK_deck_cards_quantity_positive" CHECK ("Quantity" > 0)
                        );
                    END IF;

                    IF to_regclass('public."IX_deck_cards_DeckId"') IS NULL THEN
                        CREATE INDEX "IX_deck_cards_DeckId"
                            ON public.deck_cards ("DeckId");
                    END IF;

                    IF to_regclass('public."IX_deck_cards_CardCatalogEntryId"') IS NULL THEN
                        CREATE INDEX "IX_deck_cards_CardCatalogEntryId"
                            ON public.deck_cards ("CardCatalogEntryId");
                    END IF;

                    IF to_regclass('public."IX_deck_cards_DeckId_CardCatalogEntryId"') IS NULL THEN
                        CREATE UNIQUE INDEX "IX_deck_cards_DeckId_CardCatalogEntryId"
                            ON public.deck_cards ("DeckId", "CardCatalogEntryId");
                    END IF;

                    IF to_regclass('public.deck_cards') IS NOT NULL
                       AND to_regclass('public.decks') IS NOT NULL
                       AND NOT EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_deck_cards_decks_DeckId'
                             AND conrelid = to_regclass('public.deck_cards')
                       ) THEN
                        ALTER TABLE public.deck_cards
                            ADD CONSTRAINT "FK_deck_cards_decks_DeckId"
                            FOREIGN KEY ("DeckId")
                            REFERENCES public.decks ("Id")
                            ON DELETE CASCADE;
                    END IF;

                    IF to_regclass('public.deck_cards') IS NOT NULL
                       AND to_regclass('public.card_catalog_entries') IS NOT NULL
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
                       AND to_regclass('public.decks') IS NOT NULL
                       AND EXISTS (
                           SELECT 1
                           FROM information_schema.columns
                           WHERE table_schema = 'public'
                             AND table_name = 'game_instances'
                             AND column_name = 'Player1DeckId'
                       )
                       AND NOT EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_game_instances_decks_Player1DeckId'
                             AND conrelid = to_regclass('public.game_instances')
                       ) THEN
                        ALTER TABLE public.game_instances
                            ADD CONSTRAINT "FK_game_instances_decks_Player1DeckId"
                            FOREIGN KEY ("Player1DeckId")
                            REFERENCES public.decks ("Id")
                            ON DELETE RESTRICT;
                    END IF;

                    IF to_regclass('public.game_instances') IS NOT NULL
                       AND to_regclass('public.decks') IS NOT NULL
                       AND EXISTS (
                           SELECT 1
                           FROM information_schema.columns
                           WHERE table_schema = 'public'
                             AND table_name = 'game_instances'
                             AND column_name = 'Player2DeckId'
                       )
                       AND NOT EXISTS (
                           SELECT 1
                           FROM pg_constraint
                           WHERE conname = 'FK_game_instances_decks_Player2DeckId'
                             AND conrelid = to_regclass('public.game_instances')
                       ) THEN
                        ALTER TABLE public.game_instances
                            ADD CONSTRAINT "FK_game_instances_decks_Player2DeckId"
                            FOREIGN KEY ("Player2DeckId")
                            REFERENCES public.decks ("Id")
                            ON DELETE RESTRICT;
                    END IF;
                END
                $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                BEGIN
                    IF to_regclass('public.decks') IS NOT NULL
                       AND EXISTS (
                           SELECT 1
                           FROM information_schema.columns
                           WHERE table_schema = 'public'
                             AND table_name = 'decks'
                             AND column_name = 'Type'
                       ) THEN
                        ALTER TABLE public.decks DROP COLUMN "Type";
                    END IF;
                END
                $$;
                """);
        }
    }
}
