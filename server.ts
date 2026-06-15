import express from "express";
import path from "path";
import { GoogleGenAI, Type } from "@google/genai";
import { createServer as createViteServer } from "vite";
import dotenv from "dotenv";

dotenv.config();

const app = express();
const PORT = 3000;

// Set up larger limits to accept high-resolution base64 video frames
app.use(express.json({ limit: "20mb" }));
app.use(express.urlencoded({ limit: "20mb", extended: true }));

// Initialise the GoogleGenAI SDK with a hardcoded user-agent header
const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
  httpOptions: {
    headers: {
      "User-Agent": "aistudio-build",
    },
  },
});

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", time: new Date().toISOString() });
});

// Server-side object and point detection endpoint proxying Gemini 3.5-flash
app.post("/api/detect", async (req: express.Request, res: express.Response) => {
  try {
    const { image, target, detectType } = req.body;

    if (!image) {
      res.status(400).json({ error: "O dado da imagem é obrigatório." });
      return;
    }

    // Strip out base64 header if present
    const base64Data = image.replace(/^data:image\/\w+;base64,/, "");

    const promptText =
      detectType === "Points"
        ? `Task: Point to ${target || "objects"}.
Return a JSON array of objects.
Each object must have:
- "point": [ymin, xmin] (relative coordinates from 0 to 1000 representing vertical and horizontal offsets)
- "label": text label of the object
Example: [{"point": [500, 450], "label": "caneca"}]
Return ONLY raw JSON.`
        : `Task: Identify and locate ${target || "objects"}.
Return a JSON array of objects.
Each object must have:
- "box_2d": [ymin, xmin, ymax, xmax] (each coordinate normalized between 0 and 1000)
- "label": text label of the object
Example: [{"box_2d": [100, 200, 300, 400], "label": "celular"}]
Return ONLY raw JSON, do not add markdown backticks.`;

    // Call Gemini 3.5 Flash server-side keeping key secure
    const apiResponse = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents: [
        {
          inlineData: {
            mimeType: "image/jpeg",
            data: base64Data,
          },
        },
        promptText,
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              box_2d: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description: "Bounding box coordinates as [ymin, xmin, ymax, xmax] normalized from 0 to 1000",
              },
              point: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
                description: "Point coordinates as [ymin, xmin] normalized from 0 to 1000",
              },
              label: {
                type: Type.STRING,
                description: "Label of the recognized object",
              },
            },
          },
        },
      },
    });

    const text = apiResponse.text || "[]";
    res.json({ result: text });
  } catch (error: any) {
    console.error("Erro ao chamar API do Gemini:", error);
    res.status(500).json({
      error: "Falha na detecção de objetos via IA",
      details: error.message,
    });
  }
});

async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    // Mount Vite's dev server middleware
    app.use(vite.middlewares);
  } else {
    // Serve static files in production after build
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
  });
}

startServer();
