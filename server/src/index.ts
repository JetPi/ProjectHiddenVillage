import express from "express";
import swaggerUi from "swagger-ui-express";
import { createOpenApiSpec } from "./openapi.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

const openApiSpec = createOpenApiSpec(`http://127.0.0.1:${port}`);

app.get("/docs.json", (_req, res) => {
	res.status(200).json(openApiSpec);
});

app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

app.get("/health", (_req, res) => {
	res.status(200).json({
		status: "ok",
		service: "project-hidden-village-server",
		timestamp: new Date().toISOString()
	});
});

app.listen(port, () => {
	console.log(`Server listening on http://127.0.0.1:${port}`);
});
