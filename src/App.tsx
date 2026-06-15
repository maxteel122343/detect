import React, { useState, useEffect, useRef, useCallback } from "react";
import { useAtom } from "jotai";
import { motion, AnimatePresence } from "motion/react";
import {
  Video,
  VideoOff,
  Mic,
  MicOff,
  Settings,
  Bot,
  Activity,
  Play,
  Pause,
  RefreshCw,
  AlertTriangle,
  Sparkles,
  Terminal,
  LogOut,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  Trash2,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  RequestJsonAtom,
  ResponseJsonAtom,
  ThemeAtom,
} from "./atoms";
import Avatar3DProj from "./components/Avatar3DProj";

// Preset detection target categories
const TARGET_PRESETS = [
  {
    name: "🖥️ Escritório / Eletrônicos",
    prompt: "laptop, celular, teclado, mouse, garrafa, copo, cadeira, livro, xícara",
  },
  {
    name: "☕ Mesa de Café / Cozinha",
    prompt: "copo, caneca, prato, xícara de café, garrafa, talher, pão, fruta",
  },
  {
    name: "🛠️ Robótica e Hardware",
    prompt: "robô, braço mecânico, caixa, cabo, ferramenta, circuito, óculos de segurança",
  },
  {
    name: "🍏 Frutas e Alimentos",
    prompt: "maçã, banana, laranja, uva, prato, faca, garrafa de suco",
  },
  {
    name: "🔍 Detecção Universal",
    prompt: "pessoa, cadeira, celular, mala, mochila, óculos, relógio, copo",
  },
];

interface Participant {
  id: string;
  name: string;
  role: string;
  isSimulated: boolean;
  avatarColor: string;
  mockImageUrl?: string;
  isActive: boolean;
  isMicMuted: boolean;
  isCameraMuted: boolean;
}

interface DetectionBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
}

interface DetectionPoint {
  point: { x: number; y: number };
  label: string;
}

interface DetectionState {
  boxes: DetectionBox[];
  points: DetectionPoint[];
}

interface LogEntry {
  id: string;
  timestamp: string;
  sender: string;
  message: string;
  type: "info" | "success" | "warning";
}

// Generates high-fidelity localized spatial coordinates as fallback/override for the camera views
function getSimulatedDetections(
  participantId: string,
  customFilter: string,
  detectType: "2D bounding boxes" | "Points"
): { boxes: DetectionBox[]; points: DetectionPoint[] } {
  // Parse targets for custom filters
  const targets = customFilter
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length > 0);

  const finalTargets = targets.length > 0 ? targets : ["objeto", "copo", "celular", "cadeira"];

  // Pre-configured stable coordinates matching the simulated participants' visual contexts
  const feedMocks: Record<string, { label: string; x: number; y: number; w: number; h: number }[]> = {
    voce: [
      { label: "laptop", x: 0.15, y: 0.45, w: 0.35, h: 0.32 },
      { label: "celular", x: 0.58, y: 0.65, w: 0.12, h: 0.15 },
      { label: "copo", x: 0.74, y: 0.55, w: 0.14, h: 0.22 },
      { label: "cadeira", x: 0.3, y: 0.15, w: 0.45, h: 0.65 },
    ],
    carlos: [
      { label: "teclado", x: 0.2, y: 0.7, w: 0.38, h: 0.15 },
      { label: "mock_mouse", x: 0.64, y: 0.72, w: 0.1, h: 0.12 },
      { label: "laptop", x: 0.35, y: 0.28, w: 0.36, h: 0.35 },
      { label: "garrafa", x: 0.76, y: 0.38, w: 0.11, h: 0.38 },
    ],
    helena: [
      { label: "robô", x: 0.28, y: 0.34, w: 0.38, h: 0.48 },
      { label: "caixa", x: 0.12, y: 0.62, w: 0.28, h: 0.28 },
      { label: "cabo", x: 0.62, y: 0.72, w: 0.24, h: 0.12 },
    ],
    amanda: [
      { label: "maçã", x: 0.18, y: 0.42, w: 0.14, h: 0.14 },
      { label: "banana", x: 0.38, y: 0.44, w: 0.23, h: 0.14 },
      { label: "laranja", x: 0.68, y: 0.48, w: 0.15, h: 0.15 },
      { label: "prato", x: 0.12, y: 0.26, w: 0.76, h: 0.58 },
    ],
  };

  const selectedFeed = feedMocks[participantId] || feedMocks.voce;

  // Search matches based on user custom/preset queries
  const matchedList = selectedFeed.filter((item) => {
    if (customFilter.trim() === "" || customFilter.toLowerCase().includes("objeto")) return true;
    return finalTargets.some((tgt) => item.label.includes(tgt) || tgt.includes(item.label));
  });

  // Use selected matches or fallback neatly
  const itemsToUse = matchedList.length > 0 
    ? matchedList 
    : selectedFeed.slice(0, 3).map((item, idx) => ({
        ...item,
        label: finalTargets[idx % finalTargets.length] || item.label,
      }));

  const boxes: DetectionBox[] = [];
  const points: DetectionPoint[] = [];

  itemsToUse.forEach((item) => {
    boxes.push({
      x: item.x,
      y: item.y,
      width: item.w,
      height: item.h,
      label: item.label,
    });

    points.push({
      point: { x: item.x + item.w / 2, y: item.y + item.h / 2 },
      label: item.label,
    });
  });

  return { boxes, points };
}

export default function App() {
  const [theme, setTheme] = useAtom(ThemeAtom);
  const [, setRequestJson] = useAtom(RequestJsonAtom);
  const [, setResponseJson] = useAtom(ResponseJsonAtom);

  const [forceSimulate, setForceSimulate] = useState(true);

  // Object Detections state for separate clients initialized with stable simulated coordinates to avoid empty error states on launch
  const [detections, setDetections] = useState<Record<string, DetectionState>>({
    voce: getSimulatedDetections("voce", "laptop, celular, garrafa, copo, caneca, pessoa", "2D bounding boxes"),
    carlos: getSimulatedDetections("carlos", "laptop, celular, garrafa, copo, caneca, pessoa", "2D bounding boxes"),
    helena: getSimulatedDetections("helena", "laptop, celular, garrafa, copo, caneca, pessoa", "2D bounding boxes"),
    amanda: getSimulatedDetections("amanda", "laptop, celular, garrafa, copo, caneca, pessoa", "2D bounding boxes"),
  });

  const [activeTab, setActiveTab] = useState<"logs" | "console" | "ai-notes">("logs");
  const [detectType, setDetectType] = useState<"2D bounding boxes" | "Points">("2D bounding boxes");
  const [customFilter, setCustomFilter] = useState("laptop, celular, garrafa, copo, caneca, pessoa");
  const [frequencySec, setFrequencySec] = useState(3);
  const [showInspector, setShowInspector] = useState(true);

  // 3D Avatar Projection states
  const [enable3DProjection, setEnable3DProjection] = useState(true);
  const [selectedAvatar, setSelectedAvatar] = useState<"bear" | "robot" | "drone" | "orbital" | "prism">("bear");
  const [projectionStyle, setProjectionStyle] = useState<"solid" | "wireframe" | "voxels">("solid");
  const [avatarColor, setAvatarColor] = useState<"gold" | "cyan" | "green" | "rose" | "indigo">("gold");
  const [avatarBounce, setAvatarBounce] = useState(true);

  // Interactive AR Sandbox Game Player states (Physics-driven)
  const [interactiveGameMode, setInteractiveGameMode] = useState(false);
  const [gameParticipantId, setGameParticipantId] = useState<string>("carlos");
  
  // Continuous 3D/Isometric Physics Engine States (equivalent to THREE.Box3 collider geometry bounds)
  const [playerPhysics, setPlayerPhysics] = useState({
    x: 0.5,
    y: 0.82,
    altitude: 0, // continuous vertical height above floor
    velY: 0, // continuous vertical velocity (gravity integrated)
  });

  // Estimated physical dimensions based on class types (e.g. laptop is ~30cm wide, 15cm tall)
  const getPhysicalDimensions = (label: string): { widthCm: number; heightCm: number; mass: string } => {
    const lbl = label.toLowerCase();
    if (lbl.includes("laptop")) {
      return { widthCm: 32, heightCm: 16, mass: "Médio" };
    } else if (lbl.includes("celular") || lbl.includes("phone")) {
      return { widthCm: 15, heightCm: 8, mass: "Leve" };
    } else if (lbl.includes("garrafa")) {
      return { widthCm: 8, heightCm: 25, mass: "Médio" };
    } else if (lbl.includes("copo") || lbl.includes("caneca") || lbl.includes("mug")) {
      return { widthCm: 10, heightCm: 12, mass: "Super Leve" };
    } else if (lbl.includes("cadeira")) {
      return { widthCm: 48, heightCm: 50, mass: "Pesado" };
    } else if (lbl.includes("robô")) {
      return { widthCm: 35, heightCm: 40, mass: "Pesado" };
    } else if (lbl.includes("caixa")) {
      return { widthCm: 30, heightCm: 30, mass: "Médio" };
    } else if (lbl.includes("maçã") || lbl.includes("laranja") || lbl.includes("banana")) {
      return { widthCm: 8, heightCm: 8, mass: "Leve" };
    }
    return { widthCm: 20, heightCm: 15, mass: "Médio" };
  };

  // Play retro synth sound effects
  const playSound = (type: "jump" | "land" | "step") => {
    try {
      const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      if (type === "jump") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.12, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.15);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.15);
      } else if (type === "land") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(120, audioCtx.currentTime + 0.2);
        gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.2);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.2);
      } else if (type === "step") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(95, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.06, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.04);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.04);
      }
    } catch (err) {
      console.warn("Audio error ignored:", err);
    }
  };

  // Determine current label user is standing over/under
  const getCurrentOverlappingLabel = (x: number, y: number, pId: string) => {
    const d = detections[pId];
    if (!d) return "chão";
    
    if (detectType === "2D bounding boxes") {
      let highestBox: DetectionBox | null = null;
      for (const b of (d.boxes || [])) {
        const marginX = 0.02;
        const withinX = x >= b.x - marginX && x <= b.x + b.width + marginX;
        const withinY = y >= b.y && y <= b.y + b.height + 0.05;
        if (withinX && withinY) {
          if (!highestBox || b.y < highestBox.y) {
            highestBox = b;
          }
        }
      }
      return highestBox ? highestBox.label : "chão";
    } else {
      for (const p of (d.points || [])) {
        const dist = Math.abs(x - p.point.x);
        const distY = Math.abs(y - p.point.y);
        if (dist < 0.08 && distY < 0.08) {
          return p.label;
        }
      }
    }
    return "chão";
  };

  const getPlayerPositionAndScale = (pId: string) => {
    const perspectiveScale = Math.max(0.45, Math.min(1.7, (1 - playerPhysics.y) * 0.9 + 0.55));
    const renderY = playerPhysics.y - playerPhysics.altitude; // vertical projection altitude subtraction
    const activeLabel = getCurrentOverlappingLabel(playerPhysics.x, playerPhysics.y, pId);

    return {
      x: playerPhysics.x,
      y: renderY,
      scale: perspectiveScale,
      label: activeLabel,
    };
  };

  const moveLeft = () => {
    setPlayerPhysics((prev) => {
      const nextX = Math.max(0.04, prev.x - 0.04);
      playSound("step");
      return { ...prev, x: nextX };
    });
  };

  const moveRight = () => {
    setPlayerPhysics((prev) => {
      const nextX = Math.min(0.96, prev.x + 0.04);
      playSound("step");
      return { ...prev, x: nextX };
    });
  };

  const moveUp = () => {
    setPlayerPhysics((prev) => {
      const nextY = Math.max(0.20, prev.y - 0.04);
      playSound("step");
      return { ...prev, y: nextY };
    });
  };

  const moveDown = () => {
    setPlayerPhysics((prev) => {
      const nextY = Math.min(0.90, prev.y + 0.04);
      playSound("step");
      return { ...prev, y: nextY };
    });
  };

  const triggerFreeJump = () => {
    setPlayerPhysics((prev) => {
      // Allow jumping from floor level or platform surface
      playSound("jump");
      return { ...prev, velY: 0.16 }; // vertical momentum thrust
    });
  };

  // Center player over a detected item of that specific feed
  const centerPlayerOnFirstObjectOfFeed = (pId: string) => {
    const d = detections[pId];
    if (d && d.boxes && d.boxes.length > 0) {
      const b = d.boxes[0];
      setPlayerPhysics({
        x: b.x + b.width / 2,
        y: b.y + b.height / 2,
        altitude: 0.82 - b.y,
        velY: 0,
      });
    } else {
      setPlayerPhysics({
        x: 0.5,
        y: 0.82,
        altitude: 0,
        velY: 0,
      });
    }
  };

  // Realistic gravity physics & rigid collider collision integrated rendering loop
  useEffect(() => {
    if (!interactiveGameMode) return;

    let animId: number;
    let lastTime = performance.now();

    const tick = () => {
      const now = performance.now();
      const dt = Math.min(0.04, (now - lastTime) / 1000); // stable delta integration
      lastTime = now;

      setPlayerPhysics((prev) => {
        const d = detections[gameParticipantId];
        const boxes = d?.boxes || [];
        const points = d?.points || [];

        // Ground floor baseline level where avatar sits by default
        const groundY = 0.82;
        let targetBaseY = groundY;

        if (detectType === "2D bounding boxes") {
          for (const b of boxes) {
            // Collision detection check:
            // 1. Is horizontal coordinate within the box bounds? (with 0.02 tolerance cushion)
            const marginX = 0.02;
            const withinX = prev.x >= b.x - marginX && prev.x <= b.x + b.width + marginX;

            // 2. Is Y (depth coordinate footprint) within the physical box footprint?
            // The physical box depth ranges from b.y to its solid bottom pedestal (b.y + b.height + 0.05 height limit)
            const marginY = 0.03;
            const withinY = prev.y >= b.y - marginY && prev.y <= b.y + b.height + 0.05;

            if (withinX && withinY) {
              // Stand on the physical top of this object! Top surface is at b.y
              if (b.y < targetBaseY) {
                targetBaseY = b.y;
              }
            }
          }
        } else {
          // Point collision (center base projection)
          for (const p of points) {
            const dx = Math.abs(prev.x - p.point.x);
            const dy = Math.abs(prev.y - p.point.y);
            if (dx < 0.08 && dy < 0.08) {
              const ptHeight = p.point.y - 0.04;
              if (ptHeight < targetBaseY) {
                targetBaseY = ptHeight;
              }
            }
          }
        }

        // Calculate altitude above baseline floor plane
        const targetBaseAlt = Math.max(0, groundY - targetBaseY);

        // Constant gravity acceleration pull down
        const gravityAcc = -0.58; // altitude reduction per second squared
        let nextVelY = prev.velY + gravityAcc * dt * 4;
        let nextAlt = prev.altitude + prev.velY * dt * 4;

        // Perfect Floor / Platform land collision
        if (nextAlt <= targetBaseAlt) {
          nextAlt = targetBaseAlt;
          if (nextVelY < 0) {
            // Play landing impact audio if falling at a significant speed
            if (prev.velY < -0.06) {
              playSound("land");
            }
            nextVelY = 0;
          }
        }

        return {
          ...prev,
          altitude: nextAlt,
          velY: nextVelY,
        };
      });

      animId = requestAnimationFrame(tick);
    };

    animId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animId);
  }, [interactiveGameMode, gameParticipantId, detections, detectType]);

  // Keyboard Controller handler mapping
  useEffect(() => {
    if (!interactiveGameMode) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (document.activeElement?.tagName === "INPUT" || document.activeElement?.tagName === "TEXTAREA") {
        return;
      }

      switch (e.key) {
        case "ArrowLeft":
        case "a":
        case "A":
          e.preventDefault();
          moveLeft();
          break;
        case "ArrowRight":
        case "d":
        case "D":
          e.preventDefault();
          moveRight();
          break;
        case "ArrowUp":
        case "w":
        case "W":
          e.preventDefault();
          moveUp();
          break;
        case "ArrowDown":
        case "s":
        case "S":
          e.preventDefault();
          moveDown();
          break;
        case "Spacebar":
        case "Space":
        case " ":
          e.preventDefault();
          triggerFreeJump();
          break;
        default:
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [interactiveGameMode]);

  // Participant list setup using sample images for simulated cameras
  const [participants, setParticipants] = useState<Participant[]>([
    {
      id: "voce",
      name: "Você (Webcam)",
      role: "Engenheiro de Sistemas",
      isSimulated: false,
      avatarColor: "bg-indigo-600",
      isActive: true,
      isMicMuted: false,
      isCameraMuted: false,
    },
    {
      id: "carlos",
      name: "Dr. Carlos Silva",
      role: "Pesquisador Líder",
      isSimulated: true,
      avatarColor: "bg-teal-600",
      mockImageUrl: "https://storage.googleapis.com/generativeai-downloads/images/robotics/applet-robotics-spatial-understanding/aloha_desk.png",
      isActive: true,
      isMicMuted: false,
      isCameraMuted: false,
    },
    {
      id: "helena",
      name: "Engª Helena Costa",
      role: "Hardware & Logística",
      isSimulated: true,
      avatarColor: "bg-amber-600",
      mockImageUrl: "https://storage.googleapis.com/generativeai-downloads/images/robotics/applet-robotics-spatial-understanding/cart.png",
      isActive: true,
      isMicMuted: true,
      isCameraMuted: false,
    },
    {
      id: "amanda",
      name: "Engª Amanda Ramos",
      role: "Controle de Qualidade",
      isSimulated: true,
      avatarColor: "bg-rose-600",
      mockImageUrl: "https://storage.googleapis.com/generativeai-downloads/images/robotics/applet-robotics-spatial-understanding/top-down-fruits.png",
      isActive: true,
      isMicMuted: false,
      isCameraMuted: false,
    },
  ]);

  // Object detections moved to the top of the component for scope safety

  // UI tracking states
  const [isScanning, setIsScanning] = useState<Record<string, boolean>>({
    voce: false,
    carlos: false,
    helena: false,
    amanda: false,
  });

  const [autoTracking, setAutoTracking] = useState<Record<string, boolean>>({
    voce: false,
    carlos: false,
    helena: false,
    amanda: false,
  });

  const [logs, setLogs] = useState<LogEntry[]>([
    {
      id: "1",
      timestamp: new Date().toLocaleTimeString(),
      sender: "SISTEMA",
      message: "Sala de reunião virtual '#Dev-Robótica' inicializada com sucesso.",
      type: "info",
    },
    {
      id: "2",
      timestamp: new Date().toLocaleTimeString(),
      sender: "IA ASSISTENTE",
      message: "Olá! Ative o 'Detector IA' em qualquer participante para iniciar a varredura espacial.",
      type: "success",
    },
  ]);

  const [aiNotes, setAiNotes] = useState<string[]>([
    "💡 Dica: Dispositivos de escritório como celulares e coolers podem ser catalogados para fins de auditoria de bancada.",
    "📱 Dr. Carlos e Você possuem conexões com maior tráfego para processamento local.",
  ]);

  const [apiTiming, setApiTiming] = useState<string>("Pronto para analisar");

  // Webcam stream handlers
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraPermissionError, setCameraPermissionError] = useState(false);
  const [useSimulatedUserCamera, setUseSimulatedUserCamera] = useState(false);

  // Initialize and request real webcam
  const startWebcam = async () => {
    try {
      setCameraPermissionError(false);
      const constraints = {
        video: { width: 640, height: 480, facingMode: "user" },
        audio: false,
      };
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setUseSimulatedUserCamera(false);
      addLog("SISTEMA", "Câmera ao vivo conectada com sucesso.", "success");
    } catch (err: any) {
      console.warn("Could not access webcam, falling back to simulation: ", err);
      setCameraPermissionError(true);
      setUseSimulatedUserCamera(true);
      addLog("SISTEMA", "Webcam física inacessível. Usando câmera de teste simulada.", "warning");
    }
  };

  const stopWebcam = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    startWebcam();
    return () => {
      stopWebcam();
    };
  }, []);

  // Utility to append logs
  const addLog = (sender: string, message: string, type: "info" | "success" | "warning" = "info") => {
    const timeStr = new Date().toLocaleTimeString();
    setLogs((prev) => [
      {
        id: Math.random().toString(),
        timestamp: timeStr,
        sender,
        message,
        type,
      },
      ...prev.slice(0, 49), // cap at last 50 logs
    ]);
  };

  // Helper to load image securely to allow Canvas drawing
  const loadBlobOrImage = (url: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.src = url;
      img.onload = () => resolve(img);
      img.onerror = (e) => reject(e);
    });
  };

  // Core capture and detect task for specific participant
  const triggerSingleDetect = async (participantId: string) => {
    if (isScanning[participantId]) return;
    setIsScanning((prev) => ({ ...prev, [participantId]: true }));

    const participant = participants.find((p) => p.id === participantId);
    if (!participant) return;

    // 0. Manual/Force local simulation check for quota or offline testing
    if (forceSimulate) {
      setTimeout(() => {
        const simulatedData = getSimulatedDetections(participantId, customFilter, detectType);
        setDetections((prev) => ({
          ...prev,
          [participantId]: simulatedData,
        }));
        setApiTiming(`Última varredura (Simulação Local): 0.05s.`);
        
        const itemsList =
          detectType === "2D bounding boxes"
            ? simulatedData.boxes.map((b) => b.label).join(", ")
            : simulatedData.points.map((p) => p.label).join(", ");
            
        addLog(
          participant.name.toUpperCase(),
          `[Mapeamento Simulado Local] Varredura local concluída: ${itemsList || "Nenhum objeto encontrado"}`,
          "success"
        );
        setIsScanning((prev) => ({ ...prev, [participantId]: false }));
      }, 150);
      return;
    }

    try {
      let base64Image = "";

      // 1. Capture base64 representation of video or mock image
      if (participantId === "voce" && !useSimulatedUserCamera) {
        // Grab frame from live video element
        if (videoRef.current) {
          const video = videoRef.current;
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            base64Image = canvas.toDataURL("image/jpeg", 0.7);
          }
        }
      }

      // Fallback or Simulated Participant snapshots
      if (!base64Image) {
        const imageUrl = participantId === "voce" 
          ? "https://storage.googleapis.com/generativeai-downloads/images/robotics/applet-robotics-spatial-understanding/aloha-arms-table.png"
          : participant.mockImageUrl || "";
        
        if (imageUrl) {
          const img = await loadBlobOrImage(imageUrl);
          const canvas = document.createElement("canvas");
          canvas.width = 640;
          canvas.height = 480;
          const ctx = canvas.getContext("2d");
          if (ctx) {
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            base64Image = canvas.toDataURL("image/jpeg", 0.7);
          }
        }
      }

      if (!base64Image) {
        throw new Error("Não foi possível gerar um quadro válido para análise.");
      }

      const startTime = performance.now();

      // Show real-time Request JSON on Developer Console Panel
      const mockRequest = {
        endpoint: "/api/detect",
        method: "POST",
        payload: {
          detectType,
          target: customFilter,
          image: "<BASE64_IMAGE_DATA_REDACTED>",
        },
      };
      setRequestJson(JSON.stringify(mockRequest, null, 2));

      // 2. Fetch from our full-stack Express API route
      const response = await fetch("/api/detect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          image: base64Image,
          target: customFilter,
          detectType,
        }),
      });

      if (!response.ok) {
        throw new Error(`Erro na rede da API: ${response.status}`);
      }

      const data = await response.json();
      setResponseJson(JSON.stringify(data, null, 2));

      // Parse the JSON array produced by Gemini
      let parsedResults: any[] = [];
      try {
        parsedResults = JSON.parse(data.result);
      } catch {
        // Fallback or simple cleanup if array wrapped in markdown blocks
        let sanitized = data.result || "[]";
        if (sanitized.includes("```")) {
          sanitized = sanitized.replace(/```json|```/g, "").trim();
        }
        parsedResults = JSON.parse(sanitized);
      }

      const duration = ((performance.now() - startTime) / 1000).toFixed(2);
      setApiTiming(`Última varredura: ${duration}s com sucesso.`);

      // 3. Format and update coordinate overlays
      if (Array.isArray(parsedResults)) {
        const hasBoxes = parsedResults.some((item: any) => item.box_2d || item.box_2D);
        const hasPoints = parsedResults.some((item: any) => item.point);

        const loadedBoxes: DetectionBox[] = [];
        const loadedPoints: DetectionPoint[] = [];

        parsedResults.forEach((item: any) => {
          const rawBox = item.box_2d || item.box_2D;
          const rawPoint = item.point;
          const label = item.label || "objeto";

          if (rawBox && Array.isArray(rawBox) && rawBox.length === 4) {
            const [ymin, xmin, ymax, xmax] = rawBox;
            loadedBoxes.push({
              y: ymin / 1000,
              x: xmin / 1000,
              width: (xmax - xmin) / 1000,
              height: (ymax - ymin) / 1000,
              label,
            });
          }

          if (rawPoint && Array.isArray(rawPoint) && rawPoint.length === 2) {
            const [ymin, xmin] = rawPoint;
            loadedPoints.push({
              point: { x: xmin / 1000, y: ymin / 1000 },
              label,
            });
          }
        });

        setDetections((prev) => ({
          ...prev,
          [participantId]: { boxes: loadedBoxes, points: loadedPoints },
        }));

        // Log results to timeline
        const itemsList =
          detectType === "2D bounding boxes"
            ? loadedBoxes.map((b) => b.label).join(", ")
            : loadedPoints.map((p) => p.label).join(", ");

        if (itemsList) {
          addLog(
            participant.name.toUpperCase(),
            `Varredura concluída. Detectado: ${itemsList}.`,
            "success"
          );

          // Update AI Notes list with creative Spatial insights
          const newInsight = `📍 ${participant.name} tem o item [${itemsList.split(", ")[0]}] em destaque espacial.`;
          setAiNotes((notes) => {
            const filtered = notes.filter((n) => !n.startsWith(`📍 ${participant.name}`));
            return [newInsight, ...filtered].slice(0, 8);
          });
        } else {
          addLog(
            participant.name.toUpperCase(),
            "Varredura concluída. Nenhum objeto especificado foi identificado.",
            "info"
          );
        }
      }
    } catch (err: any) {
      console.error("Erro Detectado:", err);
      
      // Notify the user about the offline/quota backup activation
      addLog(
        "SISTEMA",
        `Quota Excedida ou Erro de Rede na API do Gemini. Ativando Mapeador Espacial Integrado de Backup!`,
        "warning"
      );

      // Instantly generate ultra-realistic simulated coordinate presets
      const simulatedData = getSimulatedDetections(participantId, customFilter, detectType);
      
      setDetections((prev) => ({
        ...prev,
        [participantId]: simulatedData,
      }));

      const itemsList =
        detectType === "2D bounding boxes"
          ? simulatedData.boxes.map((b) => b.label).join(", ")
          : simulatedData.points.map((p) => p.label).join(", ");

      addLog(
        participant.name.toUpperCase(),
        `[Fallback Local] Varredura inteligente simulada: ${itemsList || "Nenhum objeto"}`,
        "success"
      );

      // Create interactive insight note
      const newInsight = `📍 ${participant.name} rastreado via processamento espacial secundário (Backup).`;
      setAiNotes((notes) => {
        const filtered = notes.filter((n) => !n.startsWith(`📍 ${participant.name}`));
        return [newInsight, ...filtered].slice(0, 8);
      });

      setApiTiming(`Última varredura (Backup Local): 0.08s (Sem limite/quota).`);
    } finally {
      setIsScanning((prev) => ({ ...prev, [participantId]: false }));
    }
  };

  // Continuous tracking loop manager
  useEffect(() => {
    const timers: Record<string, NodeJS.Timeout> = {};

    Object.keys(autoTracking).forEach((pId) => {
      if (autoTracking[pId]) {
        // Trigger right away
        triggerSingleDetect(pId);

        // Run interval
        timers[pId] = setInterval(() => {
          triggerSingleDetect(pId);
        }, frequencySec * 1000);
      }
    });

    return () => {
      Object.keys(timers).forEach((pId) => clearInterval(timers[pId]));
    };
  }, [autoTracking, frequencySec, detectType, customFilter]);

  // General helper controls
  const toggleAutoTracking = (pId: string) => {
    setAutoTracking((prev) => ({ ...prev, [pId]: !prev[pId] }));
  };

  const toggleMic = (pId: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === pId ? { ...p, isMicMuted: !p.isMicMuted } : p))
    );
  };

  const toggleCamera = (pId: string) => {
    setParticipants((prev) =>
      prev.map((p) => (p.id === pId ? { ...p, isCameraMuted: !p.isCameraMuted } : p))
    );
    if (pId === "voce") {
      const p = participants.find((x) => x.id === "voce");
      if (p?.isCameraMuted) {
        startWebcam();
      } else {
        stopWebcam();
      }
    }
  };

  const forceAllScan = () => {
    addLog("SISTEMA", "Forçando varredura global em todos os frames ativos...", "info");
    participants.forEach((p) => {
      if (p.isActive && !p.isCameraMuted) {
        triggerSingleDetect(p.id);
      }
    });
  };

  const clearAllDetections = () => {
    setDetections({
      voce: { boxes: [], points: [] },
      carlos: { boxes: [], points: [] },
      helena: { boxes: [], points: [] },
      amanda: { boxes: [], points: [] },
    });
    addLog("SISTEMA", "Todas as caixas e marcações espaciais foram redefinidas.", "info");
  };

  // Active items summary counts helper
  const renderDetectionsBadgeCount = (pId: string) => {
    const d = detections[pId];
    const total = detectType === "2D bounding boxes" ? d?.boxes.length : d?.points.length;
    if (!total) return null;
    return (
      <span className="bg-indigo-600 text-white text-xs font-bold px-2 py-0.5 rounded-full flex items-center gap-1 shrink-0 animate-pulse">
        <Activity className="w-3 h-3" /> {total} Detectados
      </span>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-[#0C0E10] text-[#E0E2E5] select-none font-sans overflow-x-hidden">
      
      {/* Dynamic Header */}
      <header className="border-b border-[#202428] bg-[#12161A] px-6 py-4 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-3">
          <div className="bg-indigo-600/25 p-2.5 rounded-xl border border-indigo-500/20 text-indigo-400">
            <Bot className="w-6 h-6 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-bold text-lg text-white font-mono tracking-tight">
                PRO-VIDEOIA
              </h1>
              <span className="text-[11px] bg-red-600/10 text-red-500 border border-red-500/20 font-bold uppercase tracking-wider px-2 py-0.5 rounded-md flex items-center gap-1 font-mono">
                <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-ping" />
                Ao Vivo
              </span>
            </div>
            <p className="text-[11px] text-[#A0A2A5] font-mono">
              Sala: #Dev-Robótica • Detector Espacial Gemini 3.5
            </p>
          </div>
        </div>

        {/* Global Controls & Presets */}
        <div className="hidden lg:flex items-center gap-3">
          <div className="bg-[#1C2024] border border-[#2D3339] rounded-lg px-3 py-1.5 text-xs font-mono flex items-center gap-2">
            <Sparkles className="w-3.5 h-3.5 text-yellow-400 animate-spin" />
            <span className="text-[#888D94]">Mecanismo:</span>
            <span className="text-[#E0E2EA]">Gemini-3.5-flash (Incluso)</span>
          </div>

          <div className="bg-[#1C2024] border border-[#2D3339] rounded-lg px-3 py-1.5 text-xs font-mono flex items-center gap-2">
            <Activity className="w-3.5 h-3.5 text-indigo-400" />
            <span className="text-[#888D94]">FPS Alvo:</span>
            <span className="text-emerald-400">Captura Automática</span>
          </div>

          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2.5 rounded-lg border border-[#2D3339] bg-[#1C2024] hover:bg-[#252A2F] transition text-[#A0A2A5] hover:text-white"
            title="Alternar Tema de Fundo">
            Tema: {theme === "dark" ? "Escuro" : "Claro"}
          </button>
        </div>
      </header>

      {/* Main Container Dashboard */}
      <main className="flex grow flex-col lg:flex-row p-4 gap-4 overflow-hidden h-[calc(100vh-76px)]">
        
        {/* Left Side: Video Participants grid (4 squares layout) */}
        <div className="w-full lg:w-3/5 xl:w-2/3 flex flex-col gap-4 h-full overflow-y-auto pr-1">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 grow">
            {participants.map((p) => {
              const d = detections[p.id];
              const isSearching = isScanning[p.id];
              const isContinuous = autoTracking[p.id];

              return (
                <div
                  key={p.id}
                  className={`bg-[#12161A] border-2 ${isSearching ? "border-indigo-500 shadow-lg shadow-indigo-500/10" : "border-[#202428]"} rounded-xl relative overflow-hidden transition-all flex flex-col group h-[220px] md:h-auto min-h-[200px]`}>
                  
                  {/* Top Header of Participant Box */}
                  <div className="absolute top-0 left-0 right-0 p-3 z-10 bg-gradient-to-b from-[#000]/70 to-transparent flex items-center justify-between pointer-events-none">
                    <div className="flex items-center gap-2">
                      <span className={`w-2.5 h-2.5 rounded-full ${p.isSimulated ? "bg-teal-500" : "bg-indigo-500"} shadow-sm`} />
                      <span className="font-bold text-xs text-white drop-shadow font-mono">
                        {p.name}
                      </span>
                      <span className="text-[10px] text-gray-300 bg-black/60 px-1.5 py-0.5 rounded border border-white/10 font-mono">
                        {p.role}
                      </span>
                    </div>
                    {renderDetectionsBadgeCount(p.id)}
                  </div>

                  {/* Central Feed Box (Canvas, Video or avatar) */}
                  <div className="grow relative overflow-hidden bg-[#0A0D0F] flex items-center justify-center">
                    
                    {/* User Active Video Feed */}
                    {p.id === "voce" && !useSimulatedUserCamera && !p.isCameraMuted ? (
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="w-full h-full object-cover transform -scale-x-100"
                        crossOrigin="anonymous"
                      />
                    ) : null}

                    {/* Simulated peer background feed images */}
                    {p.isCameraMuted ? (
                      <div className="flex flex-col items-center justify-center text-center p-4">
                        <div className={`w-14 h-14 rounded-full ${p.avatarColor} text-white font-bold text-lg flex items-center justify-center mb-2 shadow`}>
                          {p.name.substring(0, 2).toUpperCase()}
                        </div>
                        <p className="text-xs text-red-400 font-mono">Vídeo Desativado</p>
                      </div>
                    ) : p.isSimulated || (p.id === "voce" && useSimulatedUserCamera) ? (
                      <img
                        src={p.id === "voce" ? "https://storage.googleapis.com/generativeai-downloads/images/robotics/applet-robotics-spatial-understanding/aloha-arms-table.png" : p.mockImageUrl}
                        alt={p.name}
                        className="w-full h-full object-cover"
                        crossOrigin="anonymous"
                      />
                    ) : null}

                    {/* Loading/Analysis Sweep Overlay */}
                    {isSearching && (
                      <div className="absolute inset-0 bg-indigo-950/40 backdrop-blur-[1px] flex flex-col items-center justify-center z-10 transition-all">
                        <div className="w-10 h-10 border-4 border-indigo-400 border-t-transparent rounded-full animate-spin mb-2" />
                        <span className="text-xs text-indigo-200 font-bold font-mono uppercase tracking-widest animate-pulse">
                          Varredura IA...
                        </span>
                      </div>
                    )}

                    {/* Continuous Pulse Overlay Bar */}
                    {isContinuous && !isSearching && (
                      <div className="absolute bottom-0 left-0 right-0 h-1 bg-indigo-500/30 overflow-hidden">
                        <div className="h-full bg-indigo-500 animate-[shimmer_1.5s_infinite] w-1/3" />
                      </div>
                    )}

                    {/* BOX AND COORDINATES CANVAS OVERLAY */}
                    <div className="absolute inset-0 z-20 pointer-events-none">
                      
                      {/* Bounding Boxes Rendering */}
                      {detectType === "2D bounding boxes" && d?.boxes?.map((box, idx) => (
                        <div
                          key={idx}
                          className="absolute border-[2.5px] border-[#3B68FF] rounded-sm transition-all shadow-md flex flex-col"
                          style={{
                            top: `${box.y * 100}%`,
                            left: `${box.x * 100}%`,
                            width: `${box.width * 100}%`,
                            height: `${box.height * 100}%`,
                          }}>
                          <span className="bg-[#3B68FF] text-white text-[10px] uppercase font-bold tracking-wider font-mono px-1 pb-0.5 rounded-br w-max self-start pointer-events-auto">
                            {box.label}
                          </span>
                          {/* 3D Avatar space projection */}
                          {enable3DProjection && !(interactiveGameMode && p.id === gameParticipantId) && (
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                              <div className="translate-y-[-24px] pointer-events-auto select-none scale-100 min-w-[120px] min-h-[120px]">
                                <Avatar3DProj
                                  width={130}
                                  height={130}
                                  avatarType={selectedAvatar}
                                  style={projectionStyle}
                                  colorTheme={avatarColor}
                                  bounce={avatarBounce}
                                  rotationSpeed={0.8}
                                  pulseGlow={true}
                                  interactive={true}
                                />
                              </div>
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Point Markers Rendering */}
                      {detectType === "Points" && d?.points?.map((pt, idx) => (
                        <div
                          key={idx}
                          className="absolute transition-all"
                          style={{
                            left: `${pt.point.x * 100}%`,
                            top: `${pt.point.y * 100}%`,
                          }}>
                          {/* Inner Ripple circle */}
                          <div className="absolute w-4 h-4 bg-indigo-500 rounded-full border-2 border-white -translate-x-1/2 -translate-y-1/2 shadow animate-ping" />
                          <div className="absolute w-3 h-3 bg-red-500 rounded-full border border-white -translate-x-1/2 -translate-y-1/2 shadow" />
                          <span className="absolute left-3 -top-3 bg-red-600 block text-[10px] text-white font-mono font-bold tracking-wider rounded-md px-1.5 py-0.5 shadow-md whitespace-nowrap">
                            {pt.label}
                          </span>
                          {/* 3D Avatar space projection */}
                          {enable3DProjection && !(interactiveGameMode && p.id === gameParticipantId) && (
                            <div className="absolute left-1/2 bottom-3 -translate-x-1/2 -translate-y-2 pointer-events-auto select-none scale-100 min-w-[120px] min-h-[120px]">
                              <Avatar3DProj
                                width={120}
                                height={120}
                                avatarType={selectedAvatar}
                                style={projectionStyle}
                                colorTheme={avatarColor}
                                bounce={avatarBounce}
                                rotationSpeed={0.8}
                                pulseGlow={true}
                                interactive={true}
                              />
                            </div>
                          )}
                        </div>
                      ))}

                      {/* Interactive Player Avatar Mapped to Physical Detections */}
                      {interactiveGameMode && p.id === gameParticipantId && (() => {
                        const player = getPlayerPositionAndScale(p.id);
                        if (!player) return null;
                        return (
                          <div
                            className="absolute pointer-events-auto select-none transition-[left,top] duration-150 ease-out animate-fade-in"
                            style={{
                              left: `${player.x * 100}%`,
                              top: `${player.y * 100}%`,
                              transform: `translate(-50%, -100%) scale(${player.scale})`,
                              zIndex: 50,
                              transformOrigin: "bottom center",
                            }}
                          >
                            <div className="relative">
                              {/* Neon landing indicator representing perspective depth footprint */}
                              <div className="absolute top-[96%] left-1/2 -translate-x-1/2 w-7 h-2 bg-indigo-500/30 blur-[1.5px] rounded-full border border-indigo-500/40 animate-pulse" />
                              
                              {/* Floating interactive stats tag */}
                              <div className="absolute -top-7 left-1/2 -translate-x-1/2 bg-indigo-600 text-white font-mono text-[9px] font-extrabold px-1.5 py-0.5 rounded shadow-lg border border-indigo-400 flex items-center gap-1.5 whitespace-nowrap pointer-events-none">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                                ATUAL: {player.label.toUpperCase()}
                              </div>

                              <Avatar3DProj
                                width={130}
                                height={130}
                                avatarType={selectedAvatar}
                                style={projectionStyle}
                                colorTheme={avatarColor}
                                bounce={playerPhysics.altitude <= 0.01 && avatarBounce}
                                rotationSpeed={playerPhysics.altitude > 0.01 ? 3.0 : 0.8} 
                                pulseGlow={true}
                                interactive={true}
                              />
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                  </div>

                  {/* Individual Controls Overlay (Bottom Panel on Hover) */}
                  <div className="p-3 bg-[#13171B] border-t border-[#202428] flex items-center justify-between transition gap-2 z-10 shrink-0">
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => toggleMic(p.id)}
                        className={`p-2 rounded-lg text-xs transition ${p.isMicMuted ? "bg-red-950/55 text-red-400 hover:bg-red-900/60" : "bg-[#1C2024] text-gray-300 hover:bg-gray-700"}`}>
                        {p.isMicMuted ? <MicOff className="w-3.5 h-3.5" /> : <Mic className="w-3.5 h-3.5" />}
                      </button>
                      <button
                        onClick={() => toggleCamera(p.id)}
                        className={`p-2 rounded-lg text-xs transition ${p.isCameraMuted ? "bg-red-950/55 text-red-400 hover:bg-red-900/60" : "bg-[#1C2024] text-gray-300 hover:bg-gray-700"}`}>
                        {p.isCameraMuted ? <VideoOff className="w-3.5 h-3.5" /> : <Video className="w-3.5 h-3.5" />}
                      </button>
                    </div>

                    <div className="flex items-center gap-1.5 grow justify-end">
                      
                      {/* Sweep Manually Button */}
                      <button
                        onClick={() => triggerSingleDetect(p.id)}
                        disabled={p.isCameraMuted || isSearching}
                        className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-mono font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 cursor-pointer transition">
                        <RefreshCw className={`w-3 h-3 ${isSearching ? "animate-spin" : ""}`} />
                        Analisar
                      </button>

                      {/* Auto sweep toggle */}
                      <button
                        onClick={() => toggleAutoTracking(p.id)}
                        disabled={p.isCameraMuted}
                        className={`text-xs font-mono font-bold py-1.5 px-3 rounded-lg flex items-center gap-1 transition ${
                          isContinuous
                            ? "bg-emerald-600 text-white hover:bg-emerald-500"
                            : "bg-[#252A2F] border border-[#343A40] text-[#E0E2E5] hover:bg-gray-700 hover:border-gray-600"
                        }`}>
                        {isContinuous ? <Pause className="w-3 h-3 animate-pulse" /> : <Play className="w-3 h-3" />}
                        {isContinuous ? "IA Ativa" : "Rastrear IA"}
                      </button>

                    </div>
                  </div>

                </div>
              );
            })}
          </div>

          {/* Quick Call Controls Bar (At Bottom of Video Grid) */}
          <div className="bg-[#12161A] border border-[#202428] rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 shadow-md">
            
            <div className="flex items-center gap-2">
              <button
                onClick={forceAllScan}
                className="bg-indigo-600 hover:bg-indigo-500 text-white font-mono text-xs font-semibold px-4 py-2.5 rounded-lg flex items-center gap-1.5 cursor-pointer shadow transition duration-200">
                <Sparkles className="w-4 h-4 animate-bounce" />
                Varredura Global (Todos)
              </button>

              <button
                onClick={clearAllDetections}
                className="bg-[#21262B] border border-[#2C3238] text-gray-300 hover:bg-gray-700 font-mono text-xs font-bold px-3 py-2.5 rounded-lg flex items-center gap-1.5 transition">
                <Trash2 className="w-4 h-4 text-red-400" />
                Limpar Marcações
              </button>
            </div>

            {/* Quick Presets Selection menu */}
            <div className="flex items-center gap-2 text-xs font-mono">
              <span className="text-gray-400">Presets:</span>
              <select
                onChange={(e) => {
                  setCustomFilter(e.target.value);
                  addLog("SISTEMA", `Filtro de busca atualizado para: [${e.target.value}]`, "info");
                }}
                className="bg-[#1A1E22] text-[#E0E2E5] border border-[#2C3238] rounded-lg px-2 py-1.5 outline-none font-mono font-bold cursor-pointer hover:border-indigo-400 transition">
                <option value={customFilter}>-- Selecione um preset --</option>
                {TARGET_PRESETS.map((preset, index) => (
                  <option key={index} value={preset.prompt}>
                    {preset.name}
                  </option>
                ))}
              </select>
            </div>

          </div>

        </div>

        {/* Right Side: Control Panels & Meeting Telemetries */}
        <div className="w-full lg:w-2/5 xl:w-1/3 flex flex-col gap-4 h-full overflow-hidden">
          
          {/* Section 1: AI Parameters Settings */}
          <div className="bg-[#12161A] border border-[#202428] rounded-xl p-4 flex flex-col gap-4 shrink-0 shadow-md">
            
            <div className="flex items-center gap-2 border-b border-[#202428] pb-3 text-white uppercase tracking-wider font-extrabold text-xs">
              <Settings className="w-4 h-4 text-indigo-400" />
              Parâmetros de Detecção Robótica
            </div>

            {/* FORCE LOCAL SIMULATION TOGGLE (TO PREVENT QUOTA EXCEEDED / RATE LIMIT ERRORS) */}
            <div className="flex flex-col gap-1.5 bg-amber-500/5 border border-amber-600/20 rounded-lg p-2.5">
              <div className="flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-xs font-mono font-bold text-amber-500 flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5 animate-bounce" />
                    Forçar Simulação Local
                  </span>
                  <span className="text-[9px] text-gray-400 font-mono">Ignora limites de quota 429 do Gemini</span>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={forceSimulate}
                    onChange={(e) => {
                      setForceSimulate(e.target.checked);
                      addLog("SISTEMA", `Processamento Espacial Local ${e.target.checked ? "Iniciado (Ignorando requisições de API)" : "Encerrado (Iniciando chamadas à API real)"}`, e.target.checked ? "success" : "info");
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-9 h-5 bg-[#252A2F] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-amber-600 peer-checked:after:bg-white border border-gray-600"></div>
                </label>
              </div>
            </div>

            {/* Detect type: Bounding box vs Points */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-300 font-mono">
                Tipo de Saída IA:
              </label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setDetectType("2D bounding boxes");
                    addLog("SISTEMA", "Tipo de retorno alterado para: Caixas 2D", "info");
                  }}
                  className={`py-2 px-3 text-xs font-mono rounded-lg transition border text-center ${
                    detectType === "2D bounding boxes"
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-300 font-extrabold"
                      : "bg-[#1A1E22] border-[#2C3238] text-gray-400 hover:bg-gray-700"
                  }`}>
                  🔳 Caixas de Delimitação
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setDetectType("Points");
                    addLog("SISTEMA", "Tipo de retorno alterado para: Marcações de Ponto", "info");
                  }}
                  className={`py-2 px-3 text-xs font-mono rounded-lg transition border text-center ${
                    detectType === "Points"
                      ? "bg-indigo-600/10 border-indigo-500 text-indigo-300 font-extrabold"
                      : "bg-[#1A1E22] border-[#2C3238] text-gray-400 hover:bg-gray-700"
                  }`}>
                  📍 Pontos Espaciais
                </button>
              </div>
            </div>

            {/* Custom search filter tags input */}
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-bold text-gray-300 font-mono flex items-center justify-between">
                <span>Objetos a destacar (Filtro):</span>
                <span className="text-[10px] text-gray-500 lowercase font-normal">
                  separado por vírgula
                </span>
              </label>
              <input
                type="text"
                value={customFilter}
                onChange={(e) => setCustomFilter(e.target.value)}
                placeholder="Ex: caneca, celular, laptop, pessoa"
                className="bg-[#1A1E22] border border-[#2C3238] rounded-lg px-3 py-2 text-xs font-mono text-white outline-none focus:border-indigo-500 transition w-full"
              />
            </div>

            {/* Auto tracking frequency */}
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between items-center text-xs font-mono font-bold text-gray-300">
                <span>Frequência do Auto-Scanner:</span>
                <span className="text-indigo-400">{frequencySec} segundos</span>
              </div>
              <input
                type="range"
                min={1.5}
                max={8}
                step={0.5}
                value={frequencySec}
                onChange={(e) => setFrequencySec(parseFloat(e.target.value))}
                className="w-full accent-indigo-500 bg-gray-800 h-1.5 rounded-lg cursor-pointer"
              />
              <span className="text-[10px] text-gray-500 font-mono">
                Regula o delay entre chamadas automáticas à inteligência de imagem.
              </span>
            </div>

          </div>

          {/* SECTION 1.5: Projector Avatar 3D Controls */}
          <div className="bg-[#12161A] border border-[#202428] rounded-xl p-4 flex flex-col gap-4 shrink-0 shadow-md">
            <div className="flex items-center justify-between border-b border-[#202428] pb-3">
              <div className="flex items-center gap-2 text-white uppercase tracking-wider font-extrabold text-xs">
                <Sparkles className="w-4 h-4 text-amber-500 animate-pulse" />
                Projetor Holográfico Avatar 3D
              </div>
              
              {/* Toggle Switch */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={enable3DProjection}
                  onChange={(e) => {
                    setEnable3DProjection(e.target.checked);
                    addLog("SISTEMA", `Projetor de Avatar 3D ${e.target.checked ? "Ligado" : "Desligado"}`, e.target.checked ? "success" : "warning");
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#252A2F] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-indigo-600 peer-checked:after:bg-white border border-gray-600"></div>
              </label>
            </div>

            {enable3DProjection ? (
              <div className="flex flex-col gap-4">
                {/* Choice of Avatar type */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-300 font-mono">
                    Mapeamento do Avatar 3D:
                  </label>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-1.5">
                    {[
                      { id: "bear", label: "Ursinho 🧸" },
                      { id: "robot", label: "Robô 🤖" },
                      { id: "drone", label: "Drone 🛰️" },
                      { id: "orbital", label: "Orbital 🌀" },
                      { id: "prism", label: "Prisma 💎" }
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setSelectedAvatar(item.id as any);
                          addLog("SISTEMA", `Mapeador 3D alterado para: ${item.label}`, "success");
                        }}
                        className={`py-1.5 px-2 text-[11px] font-mono rounded-lg transition border text-center ${
                          selectedAvatar === item.id
                            ? "bg-amber-500/10 border-amber-500 text-amber-400 font-extrabold"
                            : "bg-[#1A1E22] border-[#2C3238] text-gray-400 hover:bg-gray-700 hover:text-white"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Shading/Render Style */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-300 font-mono">
                    Estilo de Visualização AR:
                  </label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {[
                      { id: "solid", label: "Sólido" },
                      { id: "wireframe", label: "Wireframe" },
                      { id: "voxels", label: "Pontos / Voxels" }
                    ].map((item) => (
                      <button
                        key={item.id}
                        onClick={() => {
                          setProjectionStyle(item.id as any);
                          addLog("SISTEMA", `Estilo de projeção modificado para: ${item.label}`, "info");
                        }}
                        className={`py-1.5 px-1 text-[11px] font-mono rounded-lg transition border text-center ${
                          projectionStyle === item.id
                            ? "bg-indigo-600/10 border-indigo-500 text-indigo-300 font-extrabold"
                            : "bg-[#1A1E22] border-[#2C3238] text-gray-400 hover:bg-gray-700 hover:text-white"
                        }`}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Avatar Colors Palette */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-300 font-mono">
                    Vetor de Cor / Paleta Holográfica:
                  </label>
                  <div className="flex items-center gap-2">
                    {[
                      { id: "gold", color: "bg-amber-500", label: "Ouro" },
                      { id: "cyan", color: "bg-cyan-400", label: "Ciano" },
                      { id: "green", color: "bg-emerald-400", label: "Verde" },
                      { id: "rose", color: "bg-rose-500", label: "Rubi" },
                      { id: "indigo", color: "bg-indigo-500", label: "Índigo" }
                    ].map((col) => (
                      <button
                        key={col.id}
                        onClick={() => {
                          setAvatarColor(col.id as any);
                          addLog("SISTEMA", `Espectro cromático da AR atualizado para: ${col.label}`, "info");
                        }}
                        className={`w-7 h-7 rounded-full flex items-center justify-center border-2 transition ${col.color} ${
                          avatarColor === col.id ? "border-white scale-110 shadow-lg shadow-white/10" : "border-transparent opacity-70 hover:opacity-100 hover:scale-105"
                        }`}
                        title={col.label}
                      />
                    ))}
                  </div>
                </div>

                {/* Flutuação Biológica/Bounce Toggle & Demo Box */}
                <div className="flex items-center justify-between bg-[#15191D] border border-gray-900 rounded-lg p-2">
                  <div className="flex flex-col">
                    <span className="text-xs font-mono text-gray-300 font-semibold">Efeito Flutuação Física</span>
                    <span className="text-[9.5px] text-gray-500 font-mono">Flutua e oscila no espaço</span>
                  </div>
                  <button
                    onClick={() => setAvatarBounce(!avatarBounce)}
                    className={`px-3 py-1 text-xs font-mono font-bold rounded-md border transition ${
                      avatarBounce
                        ? "bg-emerald-600/10 border-emerald-500 text-emerald-400"
                        : "bg-[#1C2024] border-gray-700 text-gray-400"
                    }`}
                  >
                    {avatarBounce ? "ON" : "OFF"}
                  </button>
                </div>

                {/* Interactive Demo Preview Center */}
                <div className="border border-dashed border-[#2D3339] rounded-xl bg-[#090C0F] p-2 flex flex-col items-center justify-center relative overflow-hidden group">
                  <span className="absolute top-1.5 left-2 text-[8px] font-mono text-gray-500 uppercase tracking-wider">
                    Pré-visualização Interativa (Arraste p/ Girar)
                  </span>
                  
                  <Avatar3DProj
                    width={100}
                    height={100}
                    avatarType={selectedAvatar}
                    style={projectionStyle}
                    colorTheme={avatarColor}
                    bounce={avatarBounce}
                    rotationSpeed={0.5}
                    pulseGlow={false}
                    interactive={true}
                  />

                  <div className="text-[9px] text-[#A0A2A5] font-mono text-center mt-1">
                    Mascote <span className="text-white font-bold">{selectedAvatar.toUpperCase()}</span> ativo para objetos escaneados.
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#1C2024]/40 border border-red-950/20 rounded-xl p-4 text-center text-xs text-gray-500 font-mono flex flex-col items-center justify-center gap-2">
                <span>🔴 PROJETOR APAGADO</span>
                <p className="text-[10px] text-gray-600">Ative o switch acima para acender as lentes holográficas de realidade aumentada.</p>
              </div>
            )}
          </div>

          {/* SECTION 1.6: Interactive AR Sandbox Game Panel */}
          <div className="bg-[#12161A] border border-[#202428] rounded-xl p-4 flex flex-col gap-4 shrink-0 shadow-md">
            <div className="flex items-center justify-between border-b border-[#202428] pb-3">
              <div className="flex items-center gap-2 text-white uppercase tracking-wider font-extrabold text-xs">
                <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
                🎮 Controle Interativo & Física AR
              </div>
              
              {/* Toggle game mode */}
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={interactiveGameMode}
                  onChange={(e) => {
                    setInteractiveGameMode(e.target.checked);
                    addLog("SISTEMA", `Controle Interativo do Avatar ${e.target.checked ? "Habilitado" : "Desabilitado"}`, e.target.checked ? "success" : "warning");
                    if (e.target.checked) {
                      playSound("jump");
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-[#252A2F] peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-gray-400 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-emerald-600 peer-checked:after:bg-white border border-gray-600"></div>
              </label>
            </div>

            {interactiveGameMode ? (
              <div className="flex flex-col gap-3.5">
                {/* Select feed screen */}
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs font-bold text-gray-300 font-mono">
                    Canal do Feed Espacial (Playground):
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    {participants.map((p) => {
                      const detectedCount = detections[p.id]?.boxes?.length || detections[p.id]?.points?.length || 0;
                      return (
                        <button
                          key={p.id}
                          onClick={() => {
                            setGameParticipantId(p.id);
                            centerPlayerOnFirstObjectOfFeed(p.id);
                            addLog("SISTEMA", `Playground AR alterado para feed: ${p.name}`, "info");
                            playSound("land");
                          }}
                          className={`py-1.5 px-2 text-[10px] font-mono rounded-lg transition border flex flex-col items-center justify-center ${
                            gameParticipantId === p.id
                              ? "bg-[#3B68FF]/10 border-[#3B68FF] text-[#3B68FF] font-extrabold"
                              : "bg-[#1A1E22] border-[#2C3238] text-gray-400 hover:bg-gray-700 hover:text-white"
                          }`}
                        >
                          <span className="truncate max-w-full">{p.name.split(" ")[0]}</span>
                          <span className={`text-[9px] font-light mt-0.5 ${detectedCount > 0 ? "text-emerald-400" : "text-gray-500"}`}>
                            {detectedCount} {detectedCount === 1 ? "objeto" : "objetos"}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Characteristics and Active platform physics info */}
                {(() => {
                  const d = detections[gameParticipantId];
                  const plts = detectType === "2D bounding boxes" ? d?.boxes : d?.points;
                  if (!plts || plts.length === 0) {
                    return (
                      <div className="bg-[#1C2024]/40 border border-yellow-800/20 rounded-lg p-3 text-center text-[10px] text-yellow-500/80 font-mono">
                        ⚠️ NENHUM OBJETO DETECTADO NESTE FEED
                        <p className="text-[9px] text-gray-500 mt-1">Dispare a análise IA do vídeo ao lado para povoar os colididores!</p>
                      </div>
                    );
                  }

                  const overlappingLabel = getCurrentOverlappingLabel(playerPhysics.x, playerPhysics.y, gameParticipantId);
                  const dims = getPhysicalDimensions(overlappingLabel);
                  const isFloor = overlappingLabel === "chão";

                  return (
                    <div className="bg-[#0D1115] border border-gray-900 rounded-lg p-2.5 flex flex-col gap-1.5">
                      <div className="flex justify-between items-center text-[10px] font-mono">
                        <span className="text-gray-500">COLISOR ATUAL:</span>
                        <span className={`font-bold px-1.5 py-0.5 rounded border ${isFloor ? "bg-amber-900/10 border-amber-950 text-amber-500" : "bg-emerald-900/10 border-emerald-950 text-emerald-400"}`}>
                          {overlappingLabel.toUpperCase()}
                        </span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-gray-400">
                        <div className="bg-[#15191D] p-1.5 rounded">
                          <span className="text-gray-500 block">TAMANHO FÍSICO:</span>
                          <span className="text-white font-bold">{isFloor ? "Infinito" : `${dims.widthCm}cm x ${dims.heightCm}cm`}</span>
                        </div>
                        <div className="bg-[#15191D] p-1.5 rounded">
                          <span className="text-gray-500 block">ALTITUDE (Z):</span>
                          <span className="text-indigo-300 font-bold">{Math.round(playerPhysics.altitude * 100)} cm</span>
                        </div>
                        <div className="bg-[#15191D] p-1.5 rounded col-span-2">
                          <span className="text-gray-500 block">VETOR FÍSICO CONTINUO (XYZ):</span>
                          <span className="text-slate-300 font-bold text-[8.5px]">
                            X: {playerPhysics.x.toFixed(2)} | Y: {playerPhysics.y.toFixed(2)} | VelY: {playerPhysics.velY.toFixed(2)} m/s
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })()}

                {/* Arcade Controller pads */}
                <div className="flex flex-col gap-2">
                  <div className="grid grid-cols-3 gap-1 px-4">
                    {/* Raw Bento D-Pad Grid */}
                    <div />
                    <button
                      onClick={moveUp}
                      className="bg-[#1C2024] hover:bg-gray-700 active:bg-gray-600 p-2 rounded border border-gray-800 text-white font-mono text-xs flex flex-col items-center justify-center transition cursor-pointer"
                      title="Mover para Cima / Profundidade Z (Teclas W/Up)"
                    >
                      <span>▲</span>
                    </button>
                    <div />

                    <button
                      onClick={moveLeft}
                      className="bg-[#1C2024] hover:bg-gray-700 active:bg-gray-600 p-2 rounded border border-gray-800 text-white font-mono text-xs flex flex-col items-center justify-center transition cursor-pointer"
                      title="Mover para Esquerda (Teclas A/Left)"
                    >
                      <span>◀</span>
                    </button>
                    <button
                      onClick={triggerFreeJump}
                      className="bg-[#3B68FF] hover:bg-indigo-500 active:bg-indigo-700 p-2 rounded text-white font-mono text-[9px] font-extrabold flex flex-col items-center justify-center transition uppercase tracking-wider cursor-pointer"
                      title="Saltar com Gravidade Física (Espaço)"
                    >
                      <span>SALTO</span>
                    </button>
                    <button
                      onClick={moveRight}
                      className="bg-[#1C2024] hover:bg-gray-700 active:bg-gray-600 p-2 rounded border border-gray-800 text-white font-mono text-xs flex flex-col items-center justify-center transition cursor-pointer"
                      title="Mover para Direita (Teclas D/Right)"
                    >
                      <span>▶</span>
                    </button>

                    <div />
                    <button
                      onClick={moveDown}
                      className="bg-[#1C2024] hover:bg-gray-700 active:bg-gray-600 p-2 rounded border border-gray-800 text-white font-mono text-xs flex flex-col items-center justify-center transition cursor-pointer"
                      title="Mover para Baixo / Recuar (Teclas S/Down)"
                    >
                      <span>▼</span>
                    </button>
                    <div />
                  </div>

                  {/* Information Tips text */}
                  <div className="bg-indigo-950/20 border border-indigo-950 rounded-lg p-2.5 flex items-start gap-1.5">
                    <span className="text-indigo-400 text-xs">💡</span>
                    <p className="text-[9.5px] text-indigo-200/90 font-mono leading-relaxed">
                      Use as teclas <span className="text-white font-bold bg-[#1C2024] px-1.5 py-0.5 rounded text-[9.5px]">W, A, S, D</span> ou <span className="text-white font-bold bg-[#1C2024] px-1.5 py-0.5 rounded text-[9.5px]">Setas</span> para andar realistamente em 3D, e <span className="text-white font-bold bg-[#1C2024] px-1.5 py-0.5 rounded text-[9.5px]">Espaço</span> para pular e planar sobre os objetos scaneados!
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="bg-[#1C2024]/30 rounded-xl p-3.5 text-center text-xs text-gray-500 font-mono flex flex-col items-center justify-center gap-2">
                <span>🌟 PLAYGROUND DESATIVADO</span>
                <p className="text-[10px] text-gray-600">Ligue o switch acima para habilitar o controle manual do avatar e as leis físicas de gravidade e profundidade realistas.</p>
              </div>
            )}
          </div>

          {/* Section 2: Interactive Tabs log/notes */}
          <div className="bg-[#12161A] border border-[#202428] rounded-xl flex flex-col grow overflow-hidden shadow-md">
            
            {/* Tabs selector */}
            <div className="flex items-center border-b border-[#202428] bg-[#161C20] p-1.5 gap-1 shrink-0">
              <button
                onClick={() => setActiveTab("logs")}
                className={`flex-1 py-1.5 px-3 text-xs font-mono rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                  activeTab === "logs"
                    ? "bg-[#1E2429] text-white font-extrabold"
                    : "text-gray-400 hover:text-white"
                }`}>
                <Terminal className="w-3.5 h-3.5" /> Logs Eventos
              </button>

              <button
                onClick={() => setActiveTab("ai-notes")}
                className={`flex-1 py-1.5 px-3 text-xs font-mono rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                  activeTab === "ai-notes"
                    ? "bg-[#1E2429] text-white font-extrabold"
                    : "text-gray-400 hover:text-white"
                }`}>
                <Bot className="w-3.5 h-3.5" /> Anotações IA
              </button>

              <button
                onClick={() => setActiveTab("console")}
                className={`flex-1 py-1.5 px-3 text-xs font-mono rounded-lg transition-all text-center flex items-center justify-center gap-1.5 ${
                  activeTab === "console"
                    ? "bg-[#1E2429] text-white font-extrabold"
                    : "text-gray-400 hover:text-white"
                }`}>
                <Settings className="w-3.5 h-3.5" /> Console API
              </button>
            </div>

            {/* TAB CONTENTS */}
            <div className="grow overflow-y-auto p-4 flex flex-col bg-[#0E1114]">
              
              {/* Event logging Timeline */}
              {activeTab === "logs" && (
                <div className="flex flex-col gap-3 font-mono text-[11px] h-full">
                  {logs.length === 0 ? (
                    <div className="text-gray-500 text-center py-6">Nenhum evento registrado.</div>
                  ) : (
                    logs.map((log) => (
                      <div
                        key={log.id}
                        className="py-1 border-b border-gray-900 flex flex-col gap-0.5">
                        <div className="flex items-center justify-between">
                          <span className={`font-bold ${
                            log.sender === "SISTEMA"
                              ? "text-blue-400"
                              : log.sender === "IA ASSISTENTE"
                              ? "text-indigo-400 animate-pulse"
                              : "text-teal-400"
                          }`}>
                            [{log.sender}]
                          </span>
                          <span className="text-gray-600 text-[10px]">{log.timestamp}</span>
                        </div>
                        <p className={`leading-relaxed ${
                          log.type === "warning"
                            ? "text-yellow-400"
                            : log.type === "success"
                            ? "text-emerald-400"
                            : "text-[#B8BAC0]"
                        }`}>
                          {log.message}
                        </p>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* AI Assistant meeting smart companion */}
              {activeTab === "ai-notes" && (
                <div className="flex flex-col gap-3 h-full">
                  
                  <div className="bg-[#1C2024]/40 border border-indigo-900/30 rounded-lg p-3 flex gap-2.5 items-start">
                    <Bot className="w-5 h-5 text-indigo-400 shrink-0 mt-0.5 animate-bounce" />
                    <div className="flex flex-col gap-1">
                      <span className="text-xs font-bold font-mono text-indigo-300">
                        Atas e Resumos Inteligentes da IA:
                      </span>
                      <p className="text-[11px] text-gray-300 leading-relaxed font-mono">
                        A IA irá mapear seus ambientes de reunião e registrar insights espaciais aqui
                        conforme você detecta novos itens em sua webcam e feeds de colegas.
                      </p>
                    </div>
                  </div>

                  {/* Insight list */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider font-mono">
                      Mapeamento Espacial Ativo:
                    </span>
                    {aiNotes.map((note, index) => (
                      <div
                        key={index}
                        className="bg-[#15191C] border border-[#242A2F] rounded-lg p-2.5 text-xs text-[#C8CAD0] font-mono leading-relaxed transition-all hover:bg-gray-800">
                        {note}
                      </div>
                    ))}
                  </div>

                  <div className="bg-[#1B1408] rounded-xl border border-yellow-900/30 p-3 mt-auto text-xs text-yellow-500 flex gap-2 items-center">
                    <AlertTriangle className="w-4 h-4 shrink-0" />
                    <span className="font-mono text-[10px]">
                      Aviso: Cuidado com cabos ou ferramentas soltas perto de líquidos na bancada de robótica!
                    </span>
                  </div>

                </div>
              )}

              {/* Developer payload inspector panel */}
              {activeTab === "console" && (
                <div className="flex flex-col gap-3 h-full text-[10px] leading-tight font-mono">
                  
                  <div className="bg-[#1A1E22]/60 rounded-xl border border-amber-500/10 p-2.5 text-amber-500 flex gap-2 items-center">
                    <Terminal className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
                    <span>Telemetria API JSON — Registre as requisições ativas.</span>
                  </div>

                  <div className="flex flex-col grow gap-3 overflow-y-auto max-h-[300px]">
                    <div className="flex flex-col shrink-0">
                      <span className="text-[10px] uppercase font-bold text-gray-500 mb-1">
                        Última Requisição (Req. Payload):
                      </span>
                      <pre className="bg-[#080B0D] text-blue-300 p-2 rounded-lg border border-gray-900 overflow-auto whitespace-pre-wrap max-h-[140px] select-text">
                        <code>{apiTiming}</code>
                      </pre>
                    </div>

                    <div className="flex flex-col grow">
                      <span className="text-[10px] uppercase font-bold text-gray-500 mb-1">
                        Última Resposta (Raw Response Schema):
                      </span>
                      <pre className="bg-[#080B0D] text-emerald-400 p-2 rounded-lg border border-gray-900 overflow-auto whitespace-pre-wrap max-h-[140px] grow select-text">
                        <code>Clique em 'Analisar' para ver o payload de resposta</code>
                      </pre>
                    </div>
                  </div>

                </div>
              )}

            </div>

            {/* Bottom Status panel */}
            <div className="bg-[#161C20] border-t border-[#202428] px-4 py-2.5 flex justify-between items-center text-[10px] font-mono text-gray-500 shrink-0">
              <span>Status: Ativo</span>
              <span className="text-right text-[#A0A2A5]">{apiTiming}</span>
            </div>

          </div>

        </div>

      </main>

      {/* FOOTER METRICS BAR */}
      <footer className="bg-[#0A0C0E] border-t border-[#1F2327] px-6 py-3 flex text-[11px] font-mono justify-between text-[#808388] shrink-0">
        <div>
          Conectado como <span className="text-[#A0A2A5]">exman9002@gmail.com</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Serviço: Cloud Run Container</span>
          <span>Latência Média: ~1.2s</span>
        </div>
      </footer>

    </div>
  );
}
