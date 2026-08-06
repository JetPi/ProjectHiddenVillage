using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace ProjectHiddenVillage.Server.Migrations
{
    /// <inheritdoc />
    public partial class AddJoinCodeToGameInstances : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<string>(
                name: "JoinCode",
                table: "game_instances",
                type: "character varying(5)",
                maxLength: 5,
                nullable: true);

            migrationBuilder.Sql(
                """
                WITH ranked AS (
                    SELECT "Id", ROW_NUMBER() OVER (ORDER BY "CreatedAtUtc", "Id") AS rn
                    FROM game_instances
                )
                UPDATE game_instances AS gi
                SET "JoinCode" = 'G' || LPAD(ranked.rn::text, 4, '0')
                FROM ranked
                WHERE gi."Id" = ranked."Id";
                """);

            migrationBuilder.AlterColumn<string>(
                name: "JoinCode",
                table: "game_instances",
                type: "character varying(5)",
                maxLength: 5,
                nullable: false,
                oldClrType: typeof(string),
                oldType: "character varying(5)",
                oldMaxLength: 5,
                oldNullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_game_instances_JoinCode",
                table: "game_instances",
                column: "JoinCode",
                unique: true);

            migrationBuilder.AddCheckConstraint(
                name: "CK_game_instances_join_code_format",
                table: "game_instances",
                sql: "\"JoinCode\" ~ '^[A-Za-z0-9]{5}$'");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropIndex(
                name: "IX_game_instances_JoinCode",
                table: "game_instances");

            migrationBuilder.DropCheckConstraint(
                name: "CK_game_instances_join_code_format",
                table: "game_instances");

            migrationBuilder.DropColumn(
                name: "JoinCode",
                table: "game_instances");
        }
    }
}
