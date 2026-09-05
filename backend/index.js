import express from "express";
import cors from "cors";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 4000;
const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

app.use(cors());

app.get("/api/manifest", async (_req, res) => {
  try {
    const content = await fs.readFile(path.join(rootDir, "documentos.json"), "utf8");
    return res.type("json").send(content);
  } catch (error) {
    console.error("Não foi possível ler o manifesto:", error);
    return res.status(500).json({ error: "Erro ao carregar manifesto." });
  }
});

app.listen(PORT, () => {
  console.log(`Backend somente leitura em http://localhost:${PORT}`);
});
