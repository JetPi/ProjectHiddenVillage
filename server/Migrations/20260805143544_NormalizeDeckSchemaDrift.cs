using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class NormalizeDeckSchemaDrift : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.Sql(
                """
                DO $$
                DECLARE
                    candidate_index_name text;
                    has_invalid_uuid boolean;
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

                    IF to_regclass('public.deck_cards') IS NULL THEN
                        CREATE TABLE public.deck_cards
                        (
                            "Id" uuid NOT NULL,
                            "DeckId" uuid NOT NULL,
                            "CardCatalogEntryId" uuid NOT NULL,
                            "Quantity" integer NOT NULL,
                            CONSTRAINT "PK_deck_cards" PRIMARY KEY ("Id")
                        );
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'id'
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'Id'
                    ) THEN
                        ALTER TABLE public.decks RENAME COLUMN id TO "Id";
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'userid'
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'UserId'
                    ) THEN
                        ALTER TABLE public.decks RENAME COLUMN userid TO "UserId";
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'type'
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'Type'
                    ) THEN
                        ALTER TABLE public.decks RENAME COLUMN type TO "Type";
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'id'
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'Id'
                    ) THEN
                        ALTER TABLE public.deck_cards RENAME COLUMN id TO "Id";
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'deckid'
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'DeckId'
                    ) THEN
                        ALTER TABLE public.deck_cards RENAME COLUMN deckid TO "DeckId";
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'cardcatalogentryid'
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'CardCatalogEntryId'
                    ) THEN
                        ALTER TABLE public.deck_cards RENAME COLUMN cardcatalogentryid TO "CardCatalogEntryId";
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'quantity'
                    )
                    AND NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'Quantity'
                    ) THEN
                        ALTER TABLE public.deck_cards RENAME COLUMN quantity TO "Quantity";
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'Type'
                    ) THEN
                        ALTER TABLE public.decks
                            ADD COLUMN "Type" character varying(16) NOT NULL DEFAULT 'Public';
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'UserId'
                    ) THEN
                        ALTER TABLE public.decks ADD COLUMN "UserId" uuid NULL;
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'DeckId'
                    ) THEN
                        ALTER TABLE public.deck_cards
                            ADD COLUMN "DeckId" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'CardCatalogEntryId'
                    ) THEN
                        ALTER TABLE public.deck_cards
                            ADD COLUMN "CardCatalogEntryId" uuid NOT NULL DEFAULT '00000000-0000-0000-0000-000000000000';
                    END IF;

                    IF NOT EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'Quantity'
                    ) THEN
                        ALTER TABLE public.deck_cards
                            ADD COLUMN "Quantity" integer NOT NULL DEFAULT 1;
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'Id'
                          AND udt_name <> 'uuid'
                    ) THEN
                        SELECT EXISTS (
                            SELECT 1
                            FROM public.decks
                            WHERE "Id" IS NULL
                               OR "Id"::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        ) INTO has_invalid_uuid;

                        IF NOT has_invalid_uuid THEN
                            ALTER TABLE public.decks
                                ALTER COLUMN "Id" TYPE uuid USING "Id"::uuid;
                        ELSE
                            RAISE NOTICE 'Skipped decks.Id uuid conversion due to non-castable values.';
                        END IF;
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'UserId'
                          AND udt_name <> 'uuid'
                    ) THEN
                        SELECT EXISTS (
                            SELECT 1
                            FROM public.decks
                            WHERE "UserId" IS NOT NULL
                              AND "UserId"::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        ) INTO has_invalid_uuid;

                        IF NOT has_invalid_uuid THEN
                            ALTER TABLE public.decks
                                ALTER COLUMN "UserId" TYPE uuid USING NULLIF("UserId"::text, '')::uuid;
                        ELSE
                            RAISE NOTICE 'Skipped decks.UserId uuid conversion due to non-castable values.';
                        END IF;
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'Id'
                          AND udt_name <> 'uuid'
                    ) THEN
                        SELECT EXISTS (
                            SELECT 1
                            FROM public.deck_cards
                            WHERE "Id" IS NULL
                               OR "Id"::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        ) INTO has_invalid_uuid;

                        IF NOT has_invalid_uuid THEN
                            ALTER TABLE public.deck_cards
                                ALTER COLUMN "Id" TYPE uuid USING "Id"::uuid;
                        ELSE
                            RAISE NOTICE 'Skipped deck_cards.Id uuid conversion due to non-castable values.';
                        END IF;
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'DeckId'
                          AND udt_name <> 'uuid'
                    ) THEN
                        SELECT EXISTS (
                            SELECT 1
                            FROM public.deck_cards
                            WHERE "DeckId" IS NULL
                               OR "DeckId"::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        ) INTO has_invalid_uuid;

                        IF NOT has_invalid_uuid THEN
                            ALTER TABLE public.deck_cards
                                ALTER COLUMN "DeckId" TYPE uuid USING "DeckId"::uuid;
                        ELSE
                            RAISE NOTICE 'Skipped deck_cards.DeckId uuid conversion due to non-castable values.';
                        END IF;
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'CardCatalogEntryId'
                          AND udt_name <> 'uuid'
                    ) THEN
                        SELECT EXISTS (
                            SELECT 1
                            FROM public.deck_cards
                            WHERE "CardCatalogEntryId" IS NULL
                               OR "CardCatalogEntryId"::text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                        ) INTO has_invalid_uuid;

                        IF NOT has_invalid_uuid THEN
                            ALTER TABLE public.deck_cards
                                ALTER COLUMN "CardCatalogEntryId" TYPE uuid USING "CardCatalogEntryId"::uuid;
                        ELSE
                            RAISE NOTICE 'Skipped deck_cards.CardCatalogEntryId uuid conversion due to non-castable values.';
                        END IF;
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'deck_cards'
                          AND column_name = 'Quantity'
                          AND udt_name <> 'int4'
                    ) THEN
                        IF NOT EXISTS (
                            SELECT 1
                            FROM public.deck_cards
                            WHERE "Quantity" IS NULL
                               OR "Quantity"::text !~ '^-?[0-9]+$'
                        ) THEN
                            ALTER TABLE public.deck_cards
                                ALTER COLUMN "Quantity" TYPE integer USING "Quantity"::integer;
                        ELSE
                            RAISE NOTICE 'Skipped deck_cards.Quantity integer conversion due to non-castable values.';
                        END IF;
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'Type'
                          AND udt_name = 'int4'
                    ) THEN
                        UPDATE public.decks
                        SET "Type" = CASE
                            WHEN "Type"::integer = 1 THEN 'User'
                            ELSE 'Public'
                        END;

                        ALTER TABLE public.decks
                            ALTER COLUMN "Type" TYPE character varying(16)
                            USING CASE
                                WHEN "Type"::text = '1' THEN 'User'
                                WHEN "Type"::text = 'User' THEN 'User'
                                ELSE 'Public'
                            END;
                    ELSIF EXISTS (
                        SELECT 1
                        FROM information_schema.columns
                        WHERE table_schema = 'public'
                          AND table_name = 'decks'
                          AND column_name = 'Type'
                          AND udt_name <> 'varchar'
                    ) THEN
                        ALTER TABLE public.decks
                            ALTER COLUMN "Type" TYPE character varying(16)
                            USING LEFT(COALESCE("Type"::text, 'Public'), 16);
                    END IF;

                    UPDATE public.decks
                    SET "Type" = 'Public'
                    WHERE "Type" IS NULL OR BTRIM("Type") = '';

                    ALTER TABLE public.decks
                        ALTER COLUMN "Type" TYPE character varying(16)
                        USING LEFT(COALESCE("Type", 'Public'), 16);

                    ALTER TABLE public.decks
                        ALTER COLUMN "Type" SET DEFAULT 'Public';

                    ALTER TABLE public.decks
                        ALTER COLUMN "Type" SET NOT NULL;

                    IF EXISTS (SELECT 1 FROM public.decks WHERE "Id" IS NULL) THEN
                        RAISE NOTICE 'Skipped decks.Id NOT NULL due to null data.';
                    ELSE
                        ALTER TABLE public.decks ALTER COLUMN "Id" SET NOT NULL;
                    END IF;

                    IF EXISTS (SELECT 1 FROM public.deck_cards WHERE "Id" IS NULL) THEN
                        RAISE NOTICE 'Skipped deck_cards.Id NOT NULL due to null data.';
                    ELSE
                        ALTER TABLE public.deck_cards ALTER COLUMN "Id" SET NOT NULL;
                    END IF;

                    IF EXISTS (SELECT 1 FROM public.deck_cards WHERE "DeckId" IS NULL) THEN
                        RAISE NOTICE 'Skipped deck_cards.DeckId NOT NULL due to null data.';
                    ELSE
                        ALTER TABLE public.deck_cards ALTER COLUMN "DeckId" SET NOT NULL;
                    END IF;

                    IF EXISTS (SELECT 1 FROM public.deck_cards WHERE "CardCatalogEntryId" IS NULL) THEN
                        RAISE NOTICE 'Skipped deck_cards.CardCatalogEntryId NOT NULL due to null data.';
                    ELSE
                        ALTER TABLE public.deck_cards ALTER COLUMN "CardCatalogEntryId" SET NOT NULL;
                    END IF;

                    IF EXISTS (SELECT 1 FROM public.deck_cards WHERE "Quantity" IS NULL) THEN
                        RAISE NOTICE 'Skipped deck_cards.Quantity NOT NULL due to null data.';
                    ELSE
                        ALTER TABLE public.deck_cards ALTER COLUMN "Quantity" SET NOT NULL;
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'PK_decks'
                          AND conrelid = to_regclass('public.decks')
                    ) THEN
                        NULL;
                    ELSIF EXISTS (
                        SELECT 1
                        FROM public.decks
                        GROUP BY "Id"
                        HAVING COUNT(*) > 1
                    ) THEN
                        RAISE NOTICE 'Skipped PK_decks creation due to duplicate decks.Id values.';
                    ELSE
                        ALTER TABLE public.decks ADD CONSTRAINT "PK_decks" PRIMARY KEY ("Id");
                    END IF;

                    IF EXISTS (
                        SELECT 1
                        FROM pg_constraint
                        WHERE conname = 'PK_deck_cards'
                          AND conrelid = to_regclass('public.deck_cards')
                    ) THEN
                        NULL;
                    ELSIF EXISTS (
                        SELECT 1
                        FROM public.deck_cards
                        GROUP BY "Id"
                        HAVING COUNT(*) > 1
                    ) THEN
                        RAISE NOTICE 'Skipped PK_deck_cards creation due to duplicate deck_cards.Id values.';
                    ELSE
                        ALTER TABLE public.deck_cards ADD CONSTRAINT "PK_deck_cards" PRIMARY KEY ("Id");
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
                        FROM public.deck_cards
                        WHERE "Quantity" <= 0
                    ) THEN
                        RAISE NOTICE 'Skipped CK_deck_cards_quantity_positive because non-positive quantities exist.';
                    ELSE
                        ALTER TABLE public.deck_cards
                            ADD CONSTRAINT "CK_deck_cards_quantity_positive"
                            CHECK ("Quantity" > 0);
                    END IF;

                    IF to_regclass('public.users') IS NOT NULL THEN
                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'FK_decks_users_UserId'
                              AND conrelid = to_regclass('public.decks')
                              AND contype = 'f'
                              AND confdeltype <> 'n'
                        ) THEN
                            ALTER TABLE public.decks DROP CONSTRAINT "FK_decks_users_UserId";
                        END IF;

                        IF NOT EXISTS (
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
                    END IF;

                    IF to_regclass('public."IX_decks_UserId"') IS NULL THEN
                        SELECT pi.indexname
                        INTO candidate_index_name
                        FROM pg_indexes pi
                        WHERE pi.schemaname = 'public'
                          AND pi.tablename = 'decks'
                          AND pi.indexname <> 'IX_decks_UserId'
                          AND pi.indexdef ILIKE 'CREATE INDEX%'
                          AND pi.indexdef ILIKE '%("UserId")%'
                        LIMIT 1;

                        IF candidate_index_name IS NOT NULL THEN
                            EXECUTE FORMAT('ALTER INDEX public.%I RENAME TO "IX_decks_UserId";', candidate_index_name);
                        ELSE
                            CREATE INDEX "IX_decks_UserId" ON public.decks ("UserId");
                        END IF;
                    END IF;

                    IF to_regclass('public."IX_deck_cards_DeckId"') IS NULL THEN
                        SELECT pi.indexname
                        INTO candidate_index_name
                        FROM pg_indexes pi
                        WHERE pi.schemaname = 'public'
                          AND pi.tablename = 'deck_cards'
                          AND pi.indexname <> 'IX_deck_cards_DeckId'
                          AND pi.indexdef ILIKE 'CREATE INDEX%'
                          AND pi.indexdef ILIKE '%("DeckId")%'
                          AND pi.indexdef NOT ILIKE '%("DeckId",%'
                        LIMIT 1;

                        IF candidate_index_name IS NOT NULL THEN
                            EXECUTE FORMAT('ALTER INDEX public.%I RENAME TO "IX_deck_cards_DeckId";', candidate_index_name);
                        ELSE
                            CREATE INDEX "IX_deck_cards_DeckId" ON public.deck_cards ("DeckId");
                        END IF;
                    END IF;

                    IF to_regclass('public."IX_deck_cards_CardCatalogEntryId"') IS NULL THEN
                        SELECT pi.indexname
                        INTO candidate_index_name
                        FROM pg_indexes pi
                        WHERE pi.schemaname = 'public'
                          AND pi.tablename = 'deck_cards'
                          AND pi.indexname <> 'IX_deck_cards_CardCatalogEntryId'
                          AND pi.indexdef ILIKE 'CREATE INDEX%'
                          AND pi.indexdef ILIKE '%("CardCatalogEntryId")%'
                          AND pi.indexdef NOT ILIKE '%("DeckId", "CardCatalogEntryId")%'
                        LIMIT 1;

                        IF candidate_index_name IS NOT NULL THEN
                            EXECUTE FORMAT('ALTER INDEX public.%I RENAME TO "IX_deck_cards_CardCatalogEntryId";', candidate_index_name);
                        ELSE
                            CREATE INDEX "IX_deck_cards_CardCatalogEntryId" ON public.deck_cards ("CardCatalogEntryId");
                        END IF;
                    END IF;

                    IF to_regclass('public."IX_deck_cards_DeckId_CardCatalogEntryId"') IS NULL THEN
                        SELECT pi.indexname
                        INTO candidate_index_name
                        FROM pg_indexes pi
                        WHERE pi.schemaname = 'public'
                          AND pi.tablename = 'deck_cards'
                          AND pi.indexname <> 'IX_deck_cards_DeckId_CardCatalogEntryId'
                          AND pi.indexdef ILIKE 'CREATE UNIQUE INDEX%'
                          AND pi.indexdef ILIKE '%("DeckId", "CardCatalogEntryId")%'
                        LIMIT 1;

                        IF candidate_index_name IS NOT NULL THEN
                            EXECUTE FORMAT('ALTER INDEX public.%I RENAME TO "IX_deck_cards_DeckId_CardCatalogEntryId";', candidate_index_name);
                        ELSIF EXISTS (
                            SELECT 1
                            FROM public.deck_cards
                            GROUP BY "DeckId", "CardCatalogEntryId"
                            HAVING COUNT(*) > 1
                        ) THEN
                            RAISE NOTICE 'Skipped unique IX_deck_cards_DeckId_CardCatalogEntryId due to duplicate pairs.';
                        ELSE
                            CREATE UNIQUE INDEX "IX_deck_cards_DeckId_CardCatalogEntryId"
                                ON public.deck_cards ("DeckId", "CardCatalogEntryId");
                        END IF;
                    END IF;

                    IF to_regclass('public.decks') IS NOT NULL THEN
                        SELECT conname
                        INTO candidate_index_name
                        FROM pg_constraint
                        WHERE conrelid = to_regclass('public.deck_cards')
                          AND contype = 'f'
                          AND pg_get_constraintdef(oid) ILIKE '%FOREIGN KEY ("DeckId") REFERENCES public.decks("Id")%'
                        LIMIT 1;

                        IF candidate_index_name IS NOT NULL
                           AND candidate_index_name <> 'FK_deck_cards_decks_DeckId'
                           AND NOT EXISTS (
                               SELECT 1
                               FROM pg_constraint
                               WHERE conname = 'FK_deck_cards_decks_DeckId'
                                 AND conrelid = to_regclass('public.deck_cards')
                           ) THEN
                            EXECUTE FORMAT(
                                'ALTER TABLE public.deck_cards RENAME CONSTRAINT %I TO "FK_deck_cards_decks_DeckId";',
                                candidate_index_name
                            );
                        END IF;

                        IF EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'FK_deck_cards_decks_DeckId'
                              AND conrelid = to_regclass('public.deck_cards')
                              AND confdeltype <> 'c'
                        ) THEN
                            ALTER TABLE public.deck_cards DROP CONSTRAINT "FK_deck_cards_decks_DeckId";
                        END IF;

                        IF NOT EXISTS (
                            SELECT 1
                            FROM pg_constraint
                            WHERE conname = 'FK_deck_cards_decks_DeckId'
                              AND conrelid = to_regclass('public.deck_cards')
                        ) THEN
                            IF EXISTS (
                                SELECT 1
                                FROM public.deck_cards dc
                                LEFT JOIN public.decks d ON d."Id" = dc."DeckId"
                                WHERE d."Id" IS NULL
                            ) THEN
                                RAISE NOTICE 'Skipped FK_deck_cards_decks_DeckId creation due to orphan deck_cards rows.';
                            ELSE
                                ALTER TABLE public.deck_cards
                                    ADD CONSTRAINT "FK_deck_cards_decks_DeckId"
                                    FOREIGN KEY ("DeckId")
                                    REFERENCES public.decks ("Id")
                                    ON DELETE CASCADE;
                            END IF;
                        END IF;
                    END IF;
                END
                $$;
                """);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            // This migration is a schema hardening pass; rollback is intentionally a no-op.
        }
    }
}
