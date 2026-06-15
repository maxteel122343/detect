import React, { useRef, useEffect, useState } from "react";

export type AvatarType = "bear" | "robot" | "drone" | "prism" | "orbital";
export type ModelStyle = "solid" | "wireframe" | "voxels";

interface Avatar3DProjProps {
  width?: number;
  height?: number;
  avatarType: AvatarType;
  style: ModelStyle;
  colorTheme: "cyan" | "gold" | "green" | "rose" | "indigo";
  rotationSpeed?: number;
  bounce?: boolean;
  pulseGlow?: boolean;
  interactive?: boolean;
}

// 3D Point vector
interface Point3D {
  x: number;
  y: number;
  z: number;
}

// 3D Polygon face connecting vertices indices
interface Face {
  indices: number[];
  colorOffset?: number; // to create shading variance
  isLineOnly?: boolean;
}

export default function Avatar3DProj({
  width = 150,
  height = 150,
  avatarType = "bear",
  style = "solid",
  colorTheme = "gold",
  rotationSpeed = 1,
  bounce = true,
  pulseGlow = true,
  interactive = true,
}: Avatar3DProjProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // 3D Rotation angles (in radians)
  const angleXRef = useRef<number>(0);
  const angleYRef = useRef<number>(0);
  const angleZRef = useRef<number>(0);

  // Interactive interaction states
  const [isDragging, setIsDragging] = useState(false);
  const lastMousePos = useRef({ x: 0, y: 0 });

  // Theme colors definition
  const getThemeColors = () => {
    switch (colorTheme) {
      case "cyan":
        return { primary: "#06b6d4", secondary: "#22d3ee", glow: "rgba(6, 182, 212, 0.4)", base: "#0891b2" };
      case "green":
        return { primary: "#10b981", secondary: "#34d399", glow: "rgba(16, 185, 129, 0.4)", base: "#059669" };
      case "rose":
        return { primary: "#f43f5e", secondary: "#fb7185", glow: "rgba(244, 63, 94, 0.4)", base: "#e11d48" };
      case "indigo":
        return { primary: "#6366f1", secondary: "#818cf8", glow: "rgba(99, 102, 241, 0.4)", base: "#4f46e5" };
      case "gold":
      default:
        // Exquisite golden-beige matching the cute bear image
        return { primary: "#d97706", secondary: "#fbbf24", glow: "rgba(245, 158, 11, 0.4)", base: "#b45309", fur: "#eab308", cream: "#fef08a" };
    }
  };

  // Helper generators to build 3D geometry
  const buildGeometry = (): { vertices: Point3D[]; faces: Face[] } => {
    const vertices: Point3D[] = [];
    const faces: Face[] = [];

    const addSphere = (
      cx: number,
      cy: number,
      cz: number,
      radius: number,
      rings = 8,
      segments = 8,
      colorOffset = 0
    ) => {
      const startIdx = vertices.length;

      for (let ring = 0; ring <= rings; ring++) {
        const theta = (ring * Math.PI) / rings;
        const sinTheta = Math.sin(theta);
        const cosTheta = Math.cos(theta);

        for (let seg = 0; seg < segments; seg++) {
          const phi = (seg * 2 * Math.PI) / segments;
          const sinPhi = Math.sin(phi);
          const cosPhi = Math.cos(phi);

          vertices.push({
            x: cx + radius * sinTheta * cosPhi,
            y: cy + radius * cosTheta,
            z: cz + radius * sinTheta * sinPhi,
          });
        }
      }

      // Build sphere faces
      for (let ring = 0; ring < rings; ring++) {
        for (let seg = 0; seg < segments; seg++) {
          const nextSeg = (seg + 1) % segments;
          const currRingOffset = ring * segments;
          const nextRingOffset = (ring + 1) * segments;

          const p1 = startIdx + currRingOffset + seg;
          const p2 = startIdx + currRingOffset + nextSeg;
          const p3 = startIdx + nextRingOffset + nextSeg;
          const p4 = startIdx + nextRingOffset + seg;

          faces.push({ indices: [p1, p2, p3, p4], colorOffset });
        }
      }
    };

    const addCylinder = (
      cx: number,
      cy: number,
      cz: number,
      radius: number,
      height: number,
      segments = 8,
      colorOffset = 0
    ) => {
      const startIdx = vertices.length;
      const hHalf = height / 2;

      // Bottom ring
      for (let seg = 0; seg < segments; seg++) {
        const phi = (seg * 2 * Math.PI) / segments;
        vertices.push({
          x: cx + radius * Math.cos(phi),
          y: cy - hHalf,
          z: cz + radius * Math.sin(phi),
        });
      }

      // Top ring
      for (let seg = 0; seg < segments; seg++) {
        const phi = (seg * 2 * Math.PI) / segments;
        vertices.push({
          x: cx + radius * Math.cos(phi),
          y: cy + hHalf,
          z: cz + radius * Math.sin(phi),
        });
      }

      // Cap Centers
      const bottomCenterIdx = vertices.length;
      vertices.push({ x: cx, y: cy - hHalf, z: cz });
      const topCenterIdx = vertices.length;
      vertices.push({ x: cx, y: cy + hHalf, z: cz });

      // Side Faces
      for (let seg = 0; seg < segments; seg++) {
        const nextSeg = (seg + 1) % segments;
        const p1 = startIdx + seg;
        const p2 = startIdx + nextSeg;
        const p3 = startIdx + segments + nextSeg;
        const p4 = startIdx + segments + seg;

        faces.push({ indices: [p1, p2, p3, p4], colorOffset });

        // Bottom cap face
        faces.push({ indices: [bottomCenterIdx, p2, p1], colorOffset: colorOffset - 10 });
        // Top cap face
        faces.push({ indices: [topCenterIdx, p3, p4], colorOffset: colorOffset + 10 });
      }
    };

    const addBox = (cx: number, cy: number, cz: number, w: number, h: number, d: number, colorOffset = 0) => {
      const startIdx = vertices.length;
      const wH = w / 2, hH = h / 2, dH = d / 2;

      const corners = [
        { x: cx - wH, y: cy - hH, z: cz - dH },
        { x: cx + wH, y: cy - hH, z: cz - dH },
        { x: cx + wH, y: cy + hH, z: cz - dH },
        { x: cx - wH, y: cy + hH, z: cz - dH },
        { x: cx - wH, y: cy - hH, z: cz + dH },
        { x: cx + wH, y: cy - hH, z: cz + dH },
        { x: cx + wH, y: cy + hH, z: cz + dH },
        { x: cx - wH, y: cy + hH, z: cz + dH },
      ];

      vertices.push(...corners);

      const cubeFaces = [
        [0, 3, 2, 1], // Front
        [1, 2, 6, 5], // Right
        [5, 6, 7, 4], // Back
        [4, 7, 3, 0], // Left
        [3, 7, 6, 2], // Top
        [0, 1, 5, 4], // Bottom
      ];

      cubeFaces.forEach((fIndices, idx) => {
        faces.push({
          indices: fIndices.map((i) => startIdx + i),
          colorOffset: colorOffset + idx * 5,
        });
      });
    };

    // Design according to requested type
    if (avatarType === "bear") {
      // 1. Teddy Bear 🧸 modeling
      // Cylindrical Body
      addCylinder(0, -10, 0, 18, 28, 8, 10);
      // Head
      addSphere(0, 16, 0, 17, 7, 8, 20);
      // Ears (Spheres)
      addSphere(-12, 28, 2, 6, 5, 6, 30); // Left
      addSphere(12, 28, 2, 6, 5, 6, 30);  // Right
      // Muzzle (Protruding front sphere)
      addSphere(0, 13, -13, 5, 5, 6, 40);
      // Paw Arms
      addSphere(-16, -2, -3, 5, 4, 5, 15); // Left Arm
      addSphere(16, -2, -3, 5, 4, 5, 15);  // Right Arm
      // Leg Paw feet
      addSphere(-10, -25, -5, 6, 5, 5, 5); // Left Foot
      addSphere(10, -25, -5, 6, 5, 5, 5);  // Right Foot

    } else if (avatarType === "robot") {
      // 2. Robot Mascot 🤖
      // TORSO (Box)
      addBox(0, -6, 0, 24, 22, 18, 10);
      // NECK Joint
      addCylinder(0, 7, 0, 4, 3, 6, 5);
      // HEAD (Dome/Box shape)
      addBox(0, 16, 0, 20, 14, 16, 20);
      // Head Antennas
      addCylinder(0, 25, 0, 1.5, 6, 5, 30);
      addSphere(0, 29, 0, 3, 4, 4, 35); // blinking tip
      // Arm joints / Shoulders
      addSphere(-15, -4, 0, 4, 4, 4, 15);
      addSphere(15, -4, 0, 4, 4, 4, 15);
      // Arm bars
      addCylinder(-16, -11, 0, 2.5, 10, 5, 12);
      addCylinder(16, -11, 0, 2.5, 10, 5, 12);

    } else if (avatarType === "drone") {
      // 3. Sci-Fi Floating Drone 🛰️
      // Main Core Sphere
      addSphere(0, 5, 0, 14, 8, 8, 15);
      // Horizontal sweeping wing ring segment
      addBox(0, 5, 0, 38, 2.5, 8, 25);
      // Left Thruster thruster
      addCylinder(-19, 5, 0, 4, 10, 6, 30);
      // Right Thruster
      addCylinder(19, 5, 0, 4, 10, 6, 30);
      // Center visor/sensor eye
      addBox(0, 5, -12, 8, 4, 4, 45);

    } else if (avatarType === "orbital") {
      // 4. Energetic Orbiting Sphere
      // Central energy core
      addSphere(0, 0, 0, 10, 6, 6, 30);

      // We'll add circles that act as orbital rings using line faces
      const addRingX = (radius: number, ringCount = 12) => {
        const startIdx = vertices.length;
        for (let i = 0; i < ringCount; i++) {
          const phi = (i * 2 * Math.PI) / ringCount;
          vertices.push({
            x: 0,
            y: radius * Math.cos(phi),
            z: radius * Math.sin(phi),
          });
        }
        const indices = [];
        for (let i = 0; i < ringCount; i++) {
          indices.push(startIdx + i);
        }
        faces.push({ indices, isLineOnly: true, colorOffset: 50 });
      };

      const addRingY = (radius: number, ringCount = 12) => {
        const startIdx = vertices.length;
        for (let i = 0; i < ringCount; i++) {
          const phi = (i * 2 * Math.PI) / ringCount;
          vertices.push({
            x: radius * Math.cos(phi),
            y: 0,
            z: radius * Math.sin(phi),
          });
        }
        const indices = [];
        for (let i = 0; i < ringCount; i++) {
          indices.push(startIdx + i);
        }
        faces.push({ indices, isLineOnly: true, colorOffset: 70 });
      };

      addRingY(22);
      addRingX(20);

    } else {
      // 5. Hologram Sci-Fi Prism / Octahedron 💎
      // Diamond top & bottom vertices
      const pts = [
        { x: 0, y: 24, z: 0 },   // Top tip
        { x: -18, y: 0, z: -18 }, // Middle front-left
        { x: 18, y: 0, z: -18 },  // Middle front-right
        { x: 18, y: 0, z: 18 },   // Middle back-right
        { x: -18, y: 0, z: 18 },  // Middle back-left
        { x: 0, y: -24, z: 0 },  // Bottom tip
      ];
      vertices.push(...pts);

      // Connected triangles faces
      const diamondFaces = [
        [0, 1, 2], [0, 2, 3], [0, 3, 4], [0, 4, 1], // Top pyramid
        [5, 2, 1], [5, 3, 2], [5, 4, 3], [5, 1, 4], // Bottom pyramid
      ];
      diamondFaces.forEach((f, idx) => {
        faces.push({ indices: f, colorOffset: idx * 10 });
      });
    }

    return { vertices, faces };
  };

  // Build model geometry
  const geom = buildGeometry();

  // Mouse Interaction handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    if (!interactive) return;
    setIsDragging(true);
    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging || !interactive) return;
    const dx = e.clientX - lastMousePos.current.x;
    const dy = e.clientY - lastMousePos.current.y;

    // Adjust rotation rates based on drag scale
    angleYRef.current += dx * 0.01;
    angleXRef.current += dy * 0.01;

    lastMousePos.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUpOrLeave = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    let animationId: number;
    let localTime = 0;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scaleFactor = 1.3; // projection scale multipliers

    const tick = () => {
      localTime += 0.05;

      // Automatically rotate over time unless dragging
      if (!isDragging) {
        angleYRef.current += 0.015 * rotationSpeed;
        angleXRef.current = Math.sin(localTime * 0.2) * 0.2; // nice dynamic nodding
        angleZRef.current = Math.cos(localTime * 0.1) * 0.1;
      }

      ctx.clearRect(0, 0, width, height);

      // Define coordinates variables
      const cx = width / 2;
      const cy = height / 2;

      // Optional bouncing translation over space
      const bounceOffset = bounce ? Math.sin(localTime * 1.5) * 6 - 5 : -5;

      const themeColors = getThemeColors();

      // 3D Rotations formulas applied
      const radX = angleXRef.current;
      const radY = angleYRef.current;
      const radZ = angleZRef.current;

      const cosX = Math.cos(radX), sinX = Math.sin(radX);
      const cosY = Math.cos(radY), sinY = Math.sin(radY);
      const cosZ = Math.cos(radZ), sinZ = Math.sin(radZ);

      // Project vertices to screen coordinates
      const projected = geom.vertices.map((v) => {
        // Rotate in Y
        let x1 = v.x * cosY - v.z * sinY;
        let z1 = v.x * sinY + v.z * cosY;

        // Rotate in X
        let y2 = v.y * cosX - z1 * sinX;
        let z2 = v.y * sinX + z1 * cosX;

        // Rotate in Z
        let x3 = x1 * cosZ - y2 * sinZ;
        let y3 = x1 * sinZ + y2 * cosZ;

        // Apply bouncing translation
        y3 += bounceOffset;

        // Camera perspective projection
        const dCamera = 150; // Camera focal point distance
        const scaleProj = (dCamera / (dCamera + z2)) * scaleFactor;

        return {
          px: cx + x3 * scaleProj,
          py: cy - y3 * scaleProj, // invert y for standard viewports
          depth: z2, // relative depth coordinate for sorting faces
        };
      });

      // Render Hologram bottom projection grid or spotlight beam
      if (pulseGlow) {
        ctx.save();
        ctx.shadowBlur = 12;
        ctx.shadowColor = themeColors.primary;
        ctx.strokeStyle = themeColors.glow;
        ctx.lineWidth = 1;

        // Base hologram pedestal circle
        ctx.beginPath();
        const pedestalY = height - 12;
        const widthPedestal = Math.min(width * 0.45, 45);
        ctx.ellipse(cx, pedestalY, widthPedestal, widthPedestal * 0.25, 0, 0, 2 * Math.PI);
        ctx.stroke();

        ctx.fillStyle = themeColors.glow;
        ctx.beginPath();
        ctx.moveTo(cx, cy + bounceOffset + 15);
        ctx.lineTo(cx - widthPedestal, pedestalY);
        ctx.lineTo(cx + widthPedestal, pedestalY);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
      }

      // 3D Depth Sorting: Painter's Algorithm for Polygons
      const sortedFaces = geom.faces
        .map((face) => {
          // Average face depth
          const faceDepth =
            face.indices.reduce((sum, idx) => sum + projected[idx].depth, 0) /
            face.indices.length;

          return { face, depth: faceDepth };
        })
        .sort((a, b) => b.depth - a.depth); // draw back-to-front

      // Draw each face according to style
      sortedFaces.forEach(({ face, depth }) => {
        const pIndices = face.indices;
        if (pIndices.length < 2) return;

        ctx.beginPath();
        ctx.moveTo(projected[pIndices[0]].px, projected[pIndices[0]].py);
        for (let i = 1; i < pIndices.length; i++) {
          ctx.lineTo(projected[pIndices[i]].px, projected[pIndices[i]].py);
        }
        if (!face.isLineOnly) {
          ctx.closePath();
        }

        const colorOffset = face.colorOffset || 0;

        // solid / voxel shading options
        if (style === "solid" && !face.isLineOnly) {
          // calculate lighting scale base by depth coordinate
          const brightnessFactor = Math.max(0.4, Math.min(1.1, 1 - depth / 80));
          
          // Use bear texture colours specifically if we're rendering Bear and selected theme is gold
          let colorString = themeColors.primary;
          
          if (avatarType === "bear" && colorTheme === "gold") {
            if (colorOffset > 35) {
              // snout/muzzle
              colorString = "#fef08a"; // cream white
            } else if (colorOffset > 25) {
              // ears
              colorString = "#c27803"; // darker gold fur
            } else {
              colorString = "#f59e0b"; // main golden fur
            }
          }

          // Compute raw RGBA parsing or use native ctx shadow
          ctx.fillStyle = colorString;
          ctx.fill();

          // Overlay fine darker edges to pop 3D dimensions
          ctx.strokeStyle = "rgba(0,0,0,0.12)";
          ctx.lineWidth = 0.5;
          ctx.stroke();
        } else if (style === "wireframe" || face.isLineOnly) {
          ctx.strokeStyle = themeColors.primary;
          ctx.lineWidth = 1.2;
          ctx.stroke();
        } else if (style === "voxels") {
          // draw nice dots at vertices intersections instead
          ctx.fillStyle = themeColors.secondary;
          pIndices.forEach((idx) => {
            ctx.beginPath();
            ctx.arc(projected[idx].px, projected[idx].py, 2, 0, 2 * Math.PI);
            ctx.fill();
          });
        }
      });

      // Special overlay details (like glowing robot/bear eyes)
      if (avatarType === "bear") {
        // Find front-most head vertices or draw projected eye points at front
        // Let's draw real-time projected little black eyes and a cute nose relative to the head
        const headPivot = projected[2]; // head approximate center
        if (headPivot) {
          ctx.fillStyle = "#1e1b4b"; // deep black nose and eyes
          
          // Draw a small nose over muzzle (which is located at snout sphere)
          const muzzlePivot = projected[21]; // center of snout
          if (muzzlePivot) {
            ctx.beginPath();
            ctx.arc(muzzlePivot.px, muzzlePivot.py - 1, 2, 0, 2 * Math.PI);
            ctx.fill();

            // cute cheeks
            ctx.fillStyle = "rgba(239, 68, 68, 0.4)"; // blush rose cheeks
            ctx.beginPath();
            ctx.arc(muzzlePivot.px - 7, muzzlePivot.py + 1, 2.5, 0, 2 * Math.PI);
            ctx.arc(muzzlePivot.px + 7, muzzlePivot.py + 1, 2.5, 0, 2 * Math.PI);
            ctx.fill();
          }

          // Little dark bead eyes relative to the head rotation
          const lEyeIdx = 8;
          const rEyeIdx = 12;
          const lEye = projected[lEyeIdx];
          const rEye = projected[rEyeIdx];

          if (lEye && rEye) {
            ctx.fillStyle = "#111827";
            ctx.beginPath();
            // Offset eyes coordinates beautifully
            ctx.arc(headPivot.px - 5, headPivot.py - 1, 1.8, 0, 2 * Math.PI);
            ctx.arc(headPivot.px + 5, headPivot.py - 1, 1.8, 0, 2 * Math.PI);
            ctx.fill();
          }
        }
      } else if (avatarType === "robot") {
        // Glowing laser scanner strip eye for Robot
        const headPivot = projected[17];
        if (headPivot) {
          ctx.save();
          ctx.shadowBlur = 8;
          ctx.shadowColor = themeColors.secondary;
          ctx.strokeStyle = themeColors.secondary;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(headPivot.px - 6, headPivot.py);
          ctx.lineTo(headPivot.px + 6, headPivot.py);
          ctx.stroke();
          ctx.restore();
        }
      }

      animationId = requestAnimationFrame(tick);
    };

    tick();

    return () => {
      cancelAnimationFrame(animationId);
    };
  }, [avatarType, style, colorTheme, rotationSpeed, bounce, pulseGlow, geom, isDragging]);

  return (
    <div
      className="relative flex items-center justify-center cursor-grab active:cursor-grabbing select-none"
      style={{ width, height }}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUpOrLeave}
      onMouseLeave={handleMouseUpOrLeave}
    >
      <canvas
        ref={canvasRef}
        width={width}
        height={height}
        className="pointer-events-auto filter drop-shadow-[0_4px_12px_rgba(0,0,0,0.5)]"
      />
      {pulseGlow && (
        <span className="absolute bottom-1 text-[8.5px] uppercase font-mono font-bold tracking-wider text-gray-400 pointer-events-none opacity-40 bg-black/35 px-1.5 py-0.5 rounded border border-white/5">
          Projeção 3D
        </span>
      )}
    </div>
  );
}
