type OpenApiObject = {
	openapi: string;
	info: {
		title: string;
		version: string;
		description: string;
	};
	servers: Array<{ url: string }>;
	tags: Array<{ name: string; description: string }>;
	paths: Record<string, unknown>;
	components: {
		schemas: Record<string, unknown>;
	};
};

export function createOpenApiSpec(baseUrl: string): OpenApiObject {
	return {
		openapi: "3.0.3",
		info: {
			title: "Project Hidden Village API",
			version: "0.1.0",
			description: "Minimal backend API for Project Hidden Village."
		},
		servers: [{ url: baseUrl }],
		tags: [
			{
				name: "Health",
				description: "Service status and diagnostics endpoints."
			},
			{
				name: "Cards",
				description: "Bandai-style card catalog and card metadata endpoints."
			},
			{
				name: "Decks",
				description: "Deck building and validation endpoints."
			},
			{
				name: "Matches",
				description: "Match lifecycle and turn progression endpoints."
			}
		],
		paths: {
			"/health": {
				get: {
					tags: ["Health"],
					summary: "Health check",
					description: "Returns service health and timestamp.",
					responses: {
						"200": {
							description: "Service is healthy",
							content: {
								"application/json": {
									schema: {
										$ref: "#/components/schemas/HealthResponse"
									}
								}
							}
						}
					}
				}
			}
		},
		components: {
			schemas: {
				HealthResponse: {
					type: "object",
					properties: {
						status: { type: "string", example: "ok" },
						service: {
							type: "string",
							example: "project-hidden-village-server"
						},
						timestamp: {
							type: "string",
							format: "date-time"
						}
					},
					required: ["status", "service", "timestamp"]
				},
				Card: {
					type: "object",
					properties: {
						id: { type: "string", example: "card-001" },
						name: { type: "string", example: "Rookie Vanguard" },
						cost: { type: "integer", minimum: 0, example: 3 },
						power: { type: "integer", minimum: 0, example: 5000 },
						color: { type: "string", example: "red" },
						traits: {
							type: "array",
							items: { type: "string" },
							example: ["warrior", "starter"]
						}
					},
					required: ["id", "name", "cost", "power", "color"]
				},
				Deck: {
					type: "object",
					properties: {
						id: { type: "string", example: "deck-001" },
						name: { type: "string", example: "Aggro Red" },
						leaderCardId: { type: "string", example: "leader-001" },
						cardIds: {
							type: "array",
							items: { type: "string" },
							example: ["card-001", "card-002", "card-003"]
						}
					},
					required: ["id", "name", "leaderCardId", "cardIds"]
				},
				Match: {
					type: "object",
					properties: {
						id: { type: "string", example: "match-001" },
						status: {
							type: "string",
							enum: ["pending", "active", "completed"],
							example: "active"
						},
						currentTurnPlayerId: {
							type: "string",
							example: "player-001"
						},
						turnNumber: { type: "integer", minimum: 1, example: 4 }
					},
					required: ["id", "status", "turnNumber"]
				}
			}
		}
	};
}
