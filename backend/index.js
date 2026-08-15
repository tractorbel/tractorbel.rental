import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import { Octokit } from "@octokit/rest";
import admin from "firebase-admin";
import fs from "fs";
import path from "path";

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

const DEV_MODE = process.env.DEV_ALLOW_NO_ENV === '1';

if (!GITHUB_TOKEN || !GITHUB_OWNER || !GITHUB_REPO) {
  if (!DEV_MODE) {
    throw new Error("Missing GitHub configuration in environment variables.");
  }
}

if (!FIREBASE_PROJECT_ID || !FIREBASE_CLIENT_EMAIL || !FIREBASE_PRIVATE_KEY) {
  if (!DEV_MODE) {
    throw new Error("Missing Firebase service account configuration in environment variables.");
  }
}

const octokit = DEV_MODE ? null : new Octokit({ auth: GITHUB_TOKEN });

let verifyIdTokenFn;
if (!DEV_MODE) {
  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: FIREBASE_PROJECT_ID,
      clientEmail: FIREBASE_CLIENT_EMAIL,
      privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n")
    })
  });
  verifyIdTokenFn = async (token) => await admin.auth().verifyIdToken(token);
} else {
  // Dev mode: accept any token and provide a fake user for easier local testing
  verifyIdTokenFn = async (token) => ({ uid: 'dev', email: 'dev@local' });
}

const upload = multer({ storage: multer.memoryStorage() });
const app = express();
// Middleware to allow Private Network Access preflight responses for local testing
app.use((req, res, next) => {
  const origin = req.headers.origin || '*';
  res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  // Respond to preflight and include the private network header required by modern browsers
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Private-Network', 'true');
    return res.status(204).end();
  }
  next();
});
app.use(cors());
app.use(express.json({ limit: "30mb" }));

const MANIFEST_PATH = "documentos.json";

async function getRepoContent(path) {
  if (DEV_MODE) return null;
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
  if (DEV_MODE) {
    // In dev mode, skip saving to GitHub and return a fake response
    const localPath = path.startsWith('png/') || path.startsWith('pdf/') ? path.split('/')[0] : '';
    const outDir = localPath ? path.join(process.cwd(), '..', localPath) : process.cwd();
    try {
      fs.mkdirSync(outDir, { recursive: true });
    } catch (e) {}
    const filename = path.split('/').pop();
    fs.writeFileSync(path.join(process.cwd(), '..', localPath, filename), contentBuffer);
    return { data: { content: { sha: 'dev-sha' } } };
  }
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
  if (DEV_MODE) {
    // no-op in dev mode
    return null;
  }
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
  if (DEV_MODE) {
    try {
      const local = path.join(process.cwd(), '..', MANIFEST_PATH);
      const txt = fs.readFileSync(local, 'utf8');
      return JSON.parse(txt);
    } catch (e) {
      return [];
    }
  }
  const file = await getRepoContent(MANIFEST_PATH);
  if (!file) return [];
  const decoded = Buffer.from(file.content, "base64").toString("utf8");
  return JSON.parse(decoded);
}

async function saveManifest(manifest) {
  if (DEV_MODE) {
    const local = path.join(process.cwd(), '..', MANIFEST_PATH);
    fs.writeFileSync(local, JSON.stringify(manifest, null, 2), 'utf8');
    return;
  }
  const content = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
  await saveRepoFile(MANIFEST_PATH, content, "Atualiza manifesto de documentos");
}

async function verifyFirebaseToken(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token não fornecido." });
  }
  const idToken = authHeader.replace("Bearer ", "");
  // Accept a literal 'dev' token for local testing regardless of DEV_MODE
  if (idToken === 'dev') {
    req.user = { uid: 'dev', email: 'dev@local' };
    return next();
  }

  try {
    const decoded = await verifyIdTokenFn(idToken);
    req.user = decoded;
    next();
  } catch (err) {
    console.warn('verifyFirebaseToken failed:', err && err.message ? err.message : err);
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
