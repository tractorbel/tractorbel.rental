import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { Octokit } from "@octokit/rest";
import admin from "firebase-admin";

dotenv.config();

const {
  GITHUB_TOKEN,
  GITHUB_OWNER,
  GITHUB_REPO,
  GITHUB_BRANCH = "main",
  FIREBASE_PROJECT_ID,
  FIREBASE_CLIENT_EMAIL,
  FIREBASE_PRIVATE_KEY,
  PORT = 4000
} = process.env;

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  throw new Error("Missing GitHub configuration in environment variables.");
}

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  throw new Error("Missing Firebase service account configuration in environment variables.");
}

const octokit = new Octokit({ auth: GITHUB_TOKEN });

admin.initializeApp({
  credential: admin.credential.cert({
    projectId: FIREBASE_PROJECT_ID,
    clientEmail: FIREBASE_CLIENT_EMAIL,
    privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
  })
});

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
app.use(cors());
app.use(express.json({ limit: "30mb" }));

const MANIFEST_PATH = "documentos.json";

async function getRepoContent(path) {
  try {
    const response = await octokit.repos.getContent({
      owner: GITHUB_OWNER,
      repo: GITHUB_REPO,
      path,
      ref: GITHUB_BRANCH
    });
    return response.data;
  } catch (error) {
    if (error.status === 404) return null;
    throw error;
  }
}

async function getFileSha(path) {
  const file = await getRepoContent(path);
  return file ? file.sha : null;
}

async function saveRepoFile(path, contentBuffer, message) {
  const content = contentBuffer.toString("base64");
  const sha = await getFileSha(path);
  return octokit.repos.createOrUpdateFileContents({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path,
    message,
    content,
    sha: sha ?? undefined,
    branch: GITHUB_BRANCH
  });
}

async function deleteRepoFile(path, message) {
  const sha = await getFileSha(path);
  if (!sha) return null;
  return octokit.repos.deleteFile({
    owner: GITHUB_OWNER,
    repo: GITHUB_REPO,
    path,
    message,
    sha,
    branch: GITHUB_BRANCH
  });
}

async function loadManifest() {
  const file = await getRepoContent(MANIFEST_PATH);
  if (!file) return [];
  const decoded = Buffer.from(file.content, "base64").toString("utf8");
  return JSON.parse(decoded);
}

async function saveManifest(manifest) {
  const content = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  await saveRepoFile(MANIFEST_PATH, content, "Atualiza manifesto de documentos");
}

async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido." });
  }
  const idToken = authHeader.replace("Bearer ", "");
  try {
    const decoded = await admin.auth().verifyIdToken(idToken);
    req.user = decoded;
    next();
  } catch (err) {
    return res.status(401).json({ error: "Token inválido." });
  }
}

function safePath(name) {
  return name.replace(/[^a-zA-Z0-9._-]/g, "-");
}

function buildRepoFilePath(folder, originalName) {
  const cleaned = safePath(originalName);
  return `${folder}/${Date.now()}-${cleaned}`;
}

app.get("/api/manifest", async (req, res) => {
  try {
    const manifest = await loadManifest();
    return res.json(manifest);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao carregar manifest." });
  }
});

app.post("/api/documents", verifyFirebaseToken, upload.fields([{ name: "document", maxCount: 1 }, { name: "icon", maxCount: 1 }]), async (req, res) => {
  try {
    const manifest = await loadManifest();
    const { title, notes, iconSelection } = req.body;
    const documentFile = req.files?.document?.[0];
    const iconFile = req.files?.icon?.[0];

    if (!title || !documentFile) {
      return res.status(400).json({ error: "Título e arquivo do documento são obrigatórios." });
    }

    const docPath = buildRepoFilePath("pdf", documentFile.originalname);
    await saveRepoFile(docPath, documentFile.buffer, `Adiciona documento ${documentFile.originalname}`);

    let iconPath = null;
    if (iconFile) {
      iconPath = buildRepoFilePath("png", iconFile.originalname);
      await saveRepoFile(iconPath, iconFile.buffer, `Adiciona ícone ${iconFile.originalname}`);
    } else if (iconSelection) {
      iconPath = `png/${safePath(iconSelection)}`;
    }

    const entry = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      title,
      filePath: docPath,
      fileName: documentFile.originalname,
      iconPath,
      notes: notes || "",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    manifest.push(entry);
    await saveManifest(manifest);
    return res.status(201).json(entry);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao criar documento." });
  }
});

app.put("/api/documents/:id", verifyFirebaseToken, upload.fields([{ name: "document", maxCount: 1 }, { name: "icon", maxCount: 1 }]), async (req, res) => {
  try {
    const manifest = await loadManifest();
    const documentId = req.params.id;
    const item = manifest.find((doc) => doc.id === documentId);
    if (!item) {
      return res.status(404).json({ error: "Documento não encontrado." });
    }

    const { title, notes, iconSelection, replaceDocument } = req.body;
    const documentFile = req.files?.document?.[0];
    const iconFile = req.files?.icon?.[0];

    if (title) item.title = title;
    item.notes = notes || item.notes;

    if (documentFile) {
      const newPath = buildRepoFilePath("pdf", documentFile.originalname);
      await saveRepoFile(newPath, documentFile.buffer, `Substitui documento ${documentFile.originalname}`);
      if (item.filePath) {
        await deleteRepoFile(item.filePath, `Remove versão antiga de ${item.fileName}`);
      }
      item.filePath = newPath;
      item.fileName = documentFile.originalname;
    }

    if (iconFile) {
      const newIconPath = buildRepoFilePath("png", iconFile.originalname);
      await saveRepoFile(newIconPath, iconFile.buffer, `Substitui ícone ${iconFile.originalname}`);
      if (item.iconPath && item.iconPath.startsWith("png/")) {
        await deleteRepoFile(item.iconPath, `Remove ícone antigo de ${item.title}`);
      }
      item.iconPath = newIconPath;
    } else if (iconSelection) {
      item.iconPath = `png/${safePath(iconSelection)}`;
    }

    item.updatedAt = new Date().toISOString();
    await saveManifest(manifest);
    return res.json(item);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao atualizar documento." });
  }
});

app.delete("/api/documents/:id", verifyFirebaseToken, async (req, res) => {
  try {
    const manifest = await loadManifest();
    const documentId = req.params.id;
    const index = manifest.findIndex((doc) => doc.id === documentId);
    if (index === -1) {
      return res.status(404).json({ error: "Documento não encontrado." });
    }

    const item = manifest[index];
    manifest.splice(index, 1);
    await saveManifest(manifest);

    if (item.filePath) {
      await deleteRepoFile(item.filePath, `Remove documento ${item.fileName}`);
    }
    if (item.iconPath && item.iconPath.startsWith("png/")) {
      await deleteRepoFile(item.iconPath, `Remove ícone do documento ${item.title}`);
    }

    return res.json({ success: true });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: "Erro ao excluir documento." });
  }
});

app.listen(PORT, () => {
  console.log(`Backend rodando em http://localhost:${PORT}`);
});

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { Octokit } from "@octokit/rest";

// ====================================
// Config
// ====================================

dotenv.config();

const app = express();

app.use(cors());

app.use(express.json({
  limit: "50mb"
}));

app.use(express.urlencoded({
  extended: true,
  limit: "50mb"
}));

const PORT = process.env.PORT || 3000;

// ====================================
// __dirname ES MODULE
// ====================================

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====================================
// Upload folder
// ====================================

const uploadDir = path.join(__dirname, "uploads");

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// ====================================
// Multer
// ====================================

const storage = multer.diskStorage({

  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },

  filename: (req, file, cb) => {

    const uniqueName =
      Date.now() +
      "-" +
      file.originalname.replace(/\s+/g, "-");

    cb(null, uniqueName);
  }
});

const upload = multer({
  storage
});

// ====================================
// GitHub
// ====================================

const octokit = new Octokit({
  auth: process.env.GITHUB_TOKEN
});

const OWNER = process.env.GITHUB_OWNER;
const REPO = process.env.GITHUB_REPO;
const BRANCH = process.env.GITHUB_BRANCH || "main";

// ====================================
// Health Check
// ====================================

app.get("/", (req, res) => {

  res.json({
    success: true,
    message: "Backend online"
  });

});

// ====================================
// Upload Documento
// ====================================

app.post("/upload", upload.single("file"), async (req, res) => {

  try {

    if (!req.file) {

      return res.status(400).json({
        success: false,
        message: "Nenhum arquivo enviado"
      });

    }

    const localFilePath = req.file.path;

    const fileContent = fs.readFileSync(localFilePath, {
      encoding: "base64"
    });

    const githubFilePath =
      `documentos/${req.file.originalname}`;

    await octokit.repos.createOrUpdateFileContents({

      owner: OWNER,
      repo: REPO,
      path: githubFilePath,

      message: `Upload ${req.file.originalname}`,

      content: fileContent,

      branch: BRANCH

    });

    // remove arquivo local
    fs.unlinkSync(localFilePath);

    return res.json({

      success: true,
      message: "Arquivo enviado com sucesso",

      file: {
        name: req.file.originalname,
        path: githubFilePath
      }

    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({

      success: false,
      error: error.message

    });

  }

});

// ====================================
// Listar documentos
// ====================================

app.get("/documents", async (req, res) => {

  try {

    const response = await octokit.repos.getContent({

      owner: OWNER,
      repo: REPO,
      path: "documentos"

    });

    const files = response.data.map((file) => ({

      name: file.name,
      size: file.size,
      url: file.download_url,
      html_url: file.html_url

    }));

    return res.json({

      success: true,
      total: files.length,
      files

    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({

      success: false,
      error: error.message

    });

  }

});

// ====================================
// Excluir documento
// ====================================

app.delete("/documents/:name", async (req, res) => {

  try {

    const fileName = req.params.name;

    const githubPath = `documentos/${fileName}`;

    const fileData = await octokit.repos.getContent({

      owner: OWNER,
      repo: REPO,
      path: githubPath

    });

    await octokit.repos.deleteFile({

      owner: OWNER,
      repo: REPO,
      path: githubPath,

      message: `Delete ${fileName}`,

      sha: fileData.data.sha,

      branch: BRANCH

    });

    return res.json({

      success: true,
      message: "Arquivo excluído"

    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({

      success: false,
      error: error.message

    });

  }

});

// ====================================
// Renomear documento
// ====================================

app.put("/documents/rename", async (req, res) => {

  try {

    const { oldName, newName } = req.body;

    if (!oldName || !newName) {

      return res.status(400).json({

        success: false,
        message: "oldName e newName são obrigatórios"

      });

    }

    const oldPath = `documentos/${oldName}`;
    const newPath = `documentos/${newName}`;

    // pega arquivo antigo
    const oldFile = await octokit.repos.getContent({

      owner: OWNER,
      repo: REPO,
      path: oldPath

    });

    // cria novo arquivo
    await octokit.repos.createOrUpdateFileContents({

      owner: OWNER,
      repo: REPO,
      path: newPath,

      message: `Rename ${oldName} to ${newName}`,

      content: oldFile.data.content,

      branch: BRANCH

    });

    // remove antigo
    await octokit.repos.deleteFile({

      owner: OWNER,
      repo: REPO,
      path: oldPath,

      message: `Delete old file ${oldName}`,

      sha: oldFile.data.sha,

      branch: BRANCH

    });

    return res.json({

      success: true,
      message: "Arquivo renomeado"

    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({

      success: false,
      error: error.message

    });

  }

});

// ====================================
// Start Server
// ====================================

app.listen(PORT, () => {

  console.log(`
====================================
Servidor online
Porta: ${PORT}
====================================
`);

});