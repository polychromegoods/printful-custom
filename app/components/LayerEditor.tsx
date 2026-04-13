/**
 * LayerEditor — Visual drag-and-drop editor for positioning layers
 * within a print area overlaid on a product mockup image.
 *
 * Coordinate system:
 * - Print area: percentage of the mockup image (0-100%)
 * - Layer position: percentage of the print area (0-100%)
 *
 * All mouse interactions convert pixel positions to percentage coordinates.
 */
import { useState, useCallback, useRef, useEffect } from "react";
import {
  BlockStack,
  InlineStack,
  Text,
  Button,
  Card,
  Select,
  TextField,
  Checkbox,
  Badge,
  Box,
  Icon,
  Divider,
  Banner,
} from "@shopify/polaris";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface LayerData {
  layerType: "text" | "image" | "fixed_image";
  label: string;
  customerEditable: boolean;
  positionX: number;
  positionY: number;
  positionWidth: number;
  positionHeight: number;
  maxChars?: number;
  placeholder?: string;
  defaultFont?: string;
  defaultColor?: string;
  fixedImageUrl?: string;
}

export interface PrintArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface FontOption {
  key: string;
  displayName: string;
}

interface LayerEditorProps {
  layers: LayerData[];
  onLayersChange: (layers: LayerData[]) => void;
  printArea: PrintArea;
  onPrintAreaChange: (printArea: PrintArea) => void;
  mockupImageUrl?: string;
  fonts: FontOption[];
  productCategory?: string;
  technique?: string;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const LAYER_COLORS: Record<string, { bg: string; border: string; label: string }> = {
  text: { bg: "rgba(0, 122, 206, 0.15)", border: "#007ace", label: "Text" },
  image: { bg: "rgba(46, 160, 67, 0.15)", border: "#2ea043", label: "Image" },
  fixed_image: { bg: "rgba(163, 113, 247, 0.15)", border: "#a371f7", label: "Fixed" },
};

const HANDLE_SIZE = 8;
const MIN_SIZE_PCT = 5; // Minimum 5% size for any element

type DragMode =
  | null
  | "move-printarea"
  | "resize-printarea-se"
  | "resize-printarea-sw"
  | "resize-printarea-ne"
  | "resize-printarea-nw"
  | "resize-printarea-e"
  | "resize-printarea-w"
  | "resize-printarea-n"
  | "resize-printarea-s"
  | "move-layer"
  | "resize-layer-se"
  | "resize-layer-sw"
  | "resize-layer-ne"
  | "resize-layer-nw"
  | "resize-layer-e"
  | "resize-layer-w"
  | "resize-layer-n"
  | "resize-layer-s";

// ─── Component ───────────────────────────────────────────────────────────────

export function LayerEditor({
  layers,
  onLayersChange,
  printArea,
  onPrintAreaChange,
  mockupImageUrl,
  fonts,
  productCategory,
  technique,
}: LayerEditorProps) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const [selectedLayerIndex, setSelectedLayerIndex] = useState<number | null>(null);
  const [selectedElement, setSelectedElement] = useState<"printarea" | "layer" | null>(null);
  const [dragMode, setDragMode] = useState<DragMode>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragStartValues, setDragStartValues] = useState({ x: 0, y: 0, w: 0, h: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 600, height: 450 });

  // Measure canvas size
  useEffect(() => {
    const measure = () => {
      if (canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setCanvasSize({ width: rect.width, height: rect.height });
      }
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // ─── Coordinate Helpers ──────────────────────────────────────────────────

  /** Convert pixel offset within canvas to percentage of canvas */
  const pxToCanvasPct = useCallback(
    (px: number, axis: "x" | "y") => {
      const dim = axis === "x" ? canvasSize.width : canvasSize.height;
      return dim > 0 ? (px / dim) * 100 : 0;
    },
    [canvasSize]
  );

  /** Convert a layer's position (% of print area) to canvas position (% of canvas) */
  const layerToCanvas = useCallback(
    (layer: LayerData) => ({
      x: printArea.x + (layer.positionX / 100) * printArea.width,
      y: printArea.y + (layer.positionY / 100) * printArea.height,
      w: (layer.positionWidth / 100) * printArea.width,
      h: (layer.positionHeight / 100) * printArea.height,
    }),
    [printArea]
  );

  /** Convert canvas position (% of canvas) to layer position (% of print area) */
  const canvasToLayer = useCallback(
    (canvasX: number, canvasY: number, canvasW: number, canvasH: number) => ({
      positionX: printArea.width > 0 ? ((canvasX - printArea.x) / printArea.width) * 100 : 0,
      positionY: printArea.height > 0 ? ((canvasY - printArea.y) / printArea.height) * 100 : 0,
      positionWidth: printArea.width > 0 ? (canvasW / printArea.width) * 100 : 0,
      positionHeight: printArea.height > 0 ? (canvasH / printArea.height) * 100 : 0,
    }),
    [printArea]
  );

  // ─── Mouse Handlers ─────────────────────────────────────────────────────

  const getMousePctFromEvent = useCallback(
    (e: React.MouseEvent | MouseEvent) => {
      if (!canvasRef.current) return { x: 0, y: 0 };
      const rect = canvasRef.current.getBoundingClientRect();
      return {
        x: ((e.clientX - rect.left) / rect.width) * 100,
        y: ((e.clientY - rect.top) / rect.height) * 100,
      };
    },
    []
  );

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      // Only handle left click on the canvas background (deselect)
      if (e.target === canvasRef.current || (e.target as HTMLElement).dataset.role === "canvas-bg") {
        setSelectedElement(null);
        setSelectedLayerIndex(null);
      }
    },
    []
  );

  const startDrag = useCallback(
    (e: React.MouseEvent, mode: DragMode, startVals: { x: number; y: number; w: number; h: number }) => {
      e.preventDefault();
      e.stopPropagation();
      const pos = getMousePctFromEvent(e);
      setDragMode(mode);
      setDragStart(pos);
      setDragStartValues(startVals);
    },
    [getMousePctFromEvent]
  );

  const handleMouseMove = useCallback(
    (e: MouseEvent) => {
      if (!dragMode) return;
      const pos = getMousePctFromEvent(e);
      const dx = pos.x - dragStart.x;
      const dy = pos.y - dragStart.y;

      if (dragMode === "move-printarea") {
        const newX = Math.max(0, Math.min(100 - dragStartValues.w, dragStartValues.x + dx));
        const newY = Math.max(0, Math.min(100 - dragStartValues.h, dragStartValues.y + dy));
        onPrintAreaChange({ ...printArea, x: Math.round(newX * 10) / 10, y: Math.round(newY * 10) / 10 });
      } else if (dragMode.startsWith("resize-printarea")) {
        const dir = dragMode.replace("resize-printarea-", "");
        let { x, y, w, h } = dragStartValues;

        if (dir.includes("e")) w = Math.max(MIN_SIZE_PCT, w + dx);
        if (dir.includes("w")) { w = Math.max(MIN_SIZE_PCT, w - dx); x = x + (dragStartValues.w - w); }
        if (dir.includes("s")) h = Math.max(MIN_SIZE_PCT, h + dy);
        if (dir.includes("n")) { h = Math.max(MIN_SIZE_PCT, h - dy); y = y + (dragStartValues.h - h); }

        // Clamp to canvas
        x = Math.max(0, x);
        y = Math.max(0, y);
        w = Math.min(100 - x, w);
        h = Math.min(100 - y, h);

        onPrintAreaChange({
          x: Math.round(x * 10) / 10,
          y: Math.round(y * 10) / 10,
          width: Math.round(w * 10) / 10,
          height: Math.round(h * 10) / 10,
        });
      } else if (dragMode === "move-layer" && selectedLayerIndex !== null) {
        // Layer movement in canvas coordinates, then convert back
        const canvasX = Math.max(printArea.x, Math.min(printArea.x + printArea.width - dragStartValues.w, dragStartValues.x + dx));
        const canvasY = Math.max(printArea.y, Math.min(printArea.y + printArea.height - dragStartValues.h, dragStartValues.y + dy));
        const layerPos = canvasToLayer(canvasX, canvasY, dragStartValues.w, dragStartValues.h);

        const updated = [...layers];
        updated[selectedLayerIndex] = {
          ...updated[selectedLayerIndex],
          positionX: Math.round(layerPos.positionX * 10) / 10,
          positionY: Math.round(layerPos.positionY * 10) / 10,
        };
        onLayersChange(updated);
      } else if (dragMode.startsWith("resize-layer") && selectedLayerIndex !== null) {
        const dir = dragMode.replace("resize-layer-", "");
        let { x, y, w, h } = dragStartValues; // canvas coordinates

        if (dir.includes("e")) w = Math.max(MIN_SIZE_PCT * printArea.width / 100, w + dx);
        if (dir.includes("w")) {
          const newW = Math.max(MIN_SIZE_PCT * printArea.width / 100, w - dx);
          x = x + (w - newW);
          w = newW;
        }
        if (dir.includes("s")) h = Math.max(MIN_SIZE_PCT * printArea.height / 100, h + dy);
        if (dir.includes("n")) {
          const newH = Math.max(MIN_SIZE_PCT * printArea.height / 100, h - dy);
          y = y + (h - newH);
          h = newH;
        }

        // Clamp to print area
        x = Math.max(printArea.x, x);
        y = Math.max(printArea.y, y);
        w = Math.min(printArea.x + printArea.width - x, w);
        h = Math.min(printArea.y + printArea.height - y, h);

        const layerPos = canvasToLayer(x, y, w, h);
        const updated = [...layers];
        updated[selectedLayerIndex] = {
          ...updated[selectedLayerIndex],
          positionX: Math.round(Math.max(0, layerPos.positionX) * 10) / 10,
          positionY: Math.round(Math.max(0, layerPos.positionY) * 10) / 10,
          positionWidth: Math.round(Math.min(100, layerPos.positionWidth) * 10) / 10,
          positionHeight: Math.round(Math.min(100, layerPos.positionHeight) * 10) / 10,
        };
        onLayersChange(updated);
      }
    },
    [dragMode, dragStart, dragStartValues, printArea, selectedLayerIndex, layers, getMousePctFromEvent, onPrintAreaChange, onLayersChange, canvasToLayer]
  );

  const handleMouseUp = useCallback(() => {
    setDragMode(null);
  }, []);

  // Global mouse listeners for drag
  useEffect(() => {
    if (dragMode) {
      window.addEventListener("mousemove", handleMouseMove);
      window.addEventListener("mouseup", handleMouseUp);
      return () => {
        window.removeEventListener("mousemove", handleMouseMove);
        window.removeEventListener("mouseup", handleMouseUp);
      };
    }
  }, [dragMode, handleMouseMove, handleMouseUp]);

  // ─── Render Helpers ──────────────────────────────────────────────────────

  const renderResizeHandles = (
    prefix: string,
    bounds: { x: number; y: number; w: number; h: number },
    onStart: (e: React.MouseEvent, mode: DragMode) => void
  ) => {
    const positions = [
      { key: "nw", left: 0, top: 0, cursor: "nw-resize" },
      { key: "ne", left: bounds.w, top: 0, cursor: "ne-resize" },
      { key: "sw", left: 0, top: bounds.h, cursor: "sw-resize" },
      { key: "se", left: bounds.w, top: bounds.h, cursor: "se-resize" },
      { key: "n", left: bounds.w / 2, top: 0, cursor: "n-resize" },
      { key: "s", left: bounds.w / 2, top: bounds.h, cursor: "s-resize" },
      { key: "w", left: 0, top: bounds.h / 2, cursor: "w-resize" },
      { key: "e", left: bounds.w, top: bounds.h / 2, cursor: "e-resize" },
    ];

    return positions.map((pos) => (
      <div
        key={`${prefix}-handle-${pos.key}`}
        onMouseDown={(e) => onStart(e, `${prefix}-${pos.key}` as DragMode)}
        style={{
          position: "absolute",
          left: `calc(${(pos.left / bounds.w) * 100}% - ${HANDLE_SIZE / 2}px)`,
          top: `calc(${(pos.top / bounds.h) * 100}% - ${HANDLE_SIZE / 2}px)`,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
          backgroundColor: "#fff",
          border: "2px solid #007ace",
          borderRadius: 2,
          cursor: pos.cursor,
          zIndex: 100,
        }}
      />
    ));
  };

  // ─── Layer Management ────────────────────────────────────────────────────

  const addLayer = useCallback(
    (type: "text" | "image" | "fixed_image") => {
      const defaults: Record<string, Partial<LayerData>> = {
        text: {
          layerType: "text",
          label: "Custom Text",
          customerEditable: true,
          maxChars: technique === "embroidery" && productCategory === "hat" ? 3 : 20,
          placeholder: technique === "embroidery" && productCategory === "hat" ? "ABC" : "Your Text",
          defaultFont: "script",
          defaultColor: "#000000",
          positionX: 10,
          positionY: 10,
          positionWidth: 80,
          positionHeight: 80,
        },
        image: {
          layerType: "image",
          label: "Upload Image",
          customerEditable: true,
          positionX: 10,
          positionY: 10,
          positionWidth: 80,
          positionHeight: 80,
        },
        fixed_image: {
          layerType: "fixed_image",
          label: "Frame",
          customerEditable: false,
          fixedImageUrl: "",
          positionX: 0,
          positionY: 0,
          positionWidth: 100,
          positionHeight: 100,
        },
      };

      // Offset new layers slightly if there are existing ones
      const offset = layers.length * 5;
      const newLayer: LayerData = {
        ...defaults[type],
        positionX: (defaults[type]?.positionX || 10) + offset,
        positionY: (defaults[type]?.positionY || 10) + offset,
      } as LayerData;

      const updated = [...layers, newLayer];
      onLayersChange(updated);
      setSelectedLayerIndex(updated.length - 1);
      setSelectedElement("layer");
    },
    [layers, onLayersChange, technique, productCategory]
  );

  const removeLayer = useCallback(
    (index: number) => {
      const updated = layers.filter((_, i) => i !== index);
      onLayersChange(updated);
      if (selectedLayerIndex === index) {
        setSelectedLayerIndex(null);
        setSelectedElement(null);
      } else if (selectedLayerIndex !== null && selectedLayerIndex > index) {
        setSelectedLayerIndex(selectedLayerIndex - 1);
      }
    },
    [layers, onLayersChange, selectedLayerIndex]
  );

  const moveLayerOrder = useCallback(
    (index: number, direction: "up" | "down") => {
      const newIndex = direction === "up" ? index - 1 : index + 1;
      if (newIndex < 0 || newIndex >= layers.length) return;
      const updated = [...layers];
      [updated[index], updated[newIndex]] = [updated[newIndex], updated[index]];
      onLayersChange(updated);
      setSelectedLayerIndex(newIndex);
    },
    [layers, onLayersChange]
  );

  const updateLayer = useCallback(
    (index: number, changes: Partial<LayerData>) => {
      const updated = [...layers];
      updated[index] = { ...updated[index], ...changes };
      onLayersChange(updated);
    },
    [layers, onLayersChange]
  );

  // ─── Render ──────────────────────────────────────────────────────────────

  const selectedLayer = selectedLayerIndex !== null ? layers[selectedLayerIndex] : null;

  return (
    <div style={{ display: "flex", gap: 16, minHeight: 500 }}>
      {/* ─── Visual Canvas ─── */}
      <div style={{ flex: "1 1 60%", minWidth: 0 }}>
        <BlockStack gap="200">
          <Text as="p" variant="bodySm" tone="subdued">
            Drag the print area (dashed blue) to position it on the mockup.
            Drag layers (colored rectangles) within the print area.
            Click to select, drag corners to resize.
          </Text>
          <div
            ref={canvasRef}
            data-role="canvas-bg"
            onMouseDown={handleCanvasMouseDown}
            style={{
              position: "relative",
              width: "100%",
              paddingBottom: "75%", // 4:3 aspect ratio
              backgroundColor: "#e8e8e8",
              borderRadius: 8,
              overflow: "hidden",
              cursor: dragMode ? "grabbing" : "default",
              userSelect: "none",
            }}
          >
            {/* Mockup image background */}
            {mockupImageUrl && (
              <img
                src={mockupImageUrl}
                alt="Mockup"
                data-role="canvas-bg"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  pointerEvents: "none",
                }}
              />
            )}

            {/* Grid lines for reference */}
            {!mockupImageUrl && (
              <div
                data-role="canvas-bg"
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: "100%",
                  backgroundImage:
                    "linear-gradient(rgba(0,0,0,0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(0,0,0,0.05) 1px, transparent 1px)",
                  backgroundSize: "10% 10%",
                }}
              />
            )}

            {/* Print Area */}
            <div
              onMouseDown={(e) => {
                e.stopPropagation();
                setSelectedElement("printarea");
                setSelectedLayerIndex(null);
                startDrag(e, "move-printarea", {
                  x: printArea.x,
                  y: printArea.y,
                  w: printArea.width,
                  h: printArea.height,
                });
              }}
              style={{
                position: "absolute",
                left: `${printArea.x}%`,
                top: `${printArea.y}%`,
                width: `${printArea.width}%`,
                height: `${printArea.height}%`,
                border: `2px dashed ${selectedElement === "printarea" ? "#005fcc" : "#007ace"}`,
                backgroundColor: selectedElement === "printarea"
                  ? "rgba(0, 122, 206, 0.08)"
                  : "rgba(0, 122, 206, 0.04)",
                cursor: dragMode === "move-printarea" ? "grabbing" : "move",
                zIndex: 10,
                boxSizing: "border-box",
              }}
            >
              {/* Print area label */}
              <div
                style={{
                  position: "absolute",
                  top: -20,
                  left: 0,
                  fontSize: 10,
                  fontWeight: 600,
                  color: "#007ace",
                  whiteSpace: "nowrap",
                  pointerEvents: "none",
                }}
              >
                Print Area ({Math.round(printArea.width)}% × {Math.round(printArea.height)}%)
              </div>

              {/* Print area resize handles */}
              {selectedElement === "printarea" &&
                renderResizeHandles(
                  "resize-printarea",
                  { x: 0, y: 0, w: 100, h: 100 },
                  (e, mode) =>
                    startDrag(e, mode, {
                      x: printArea.x,
                      y: printArea.y,
                      w: printArea.width,
                      h: printArea.height,
                    })
                )}

              {/* Layers within print area */}
              {layers.map((layer, index) => {
                const colors = LAYER_COLORS[layer.layerType] || LAYER_COLORS.text;
                const isSelected = selectedElement === "layer" && selectedLayerIndex === index;
                const canvasPos = layerToCanvas(layer);

                // Position relative to print area div
                const relLeft = printArea.width > 0 ? (layer.positionX / 100) * 100 : 0;
                const relTop = printArea.height > 0 ? (layer.positionY / 100) * 100 : 0;
                const relWidth = (layer.positionWidth / 100) * 100;
                const relHeight = (layer.positionHeight / 100) * 100;

                return (
                  <div
                    key={index}
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedElement("layer");
                      setSelectedLayerIndex(index);
                      startDrag(e, "move-layer", {
                        x: canvasPos.x,
                        y: canvasPos.y,
                        w: canvasPos.w,
                        h: canvasPos.h,
                      });
                    }}
                    style={{
                      position: "absolute",
                      left: `${relLeft}%`,
                      top: `${relTop}%`,
                      width: `${relWidth}%`,
                      height: `${relHeight}%`,
                      backgroundColor: isSelected ? colors.bg.replace("0.15", "0.25") : colors.bg,
                      border: `2px solid ${colors.border}`,
                      borderRadius: 4,
                      cursor: dragMode === "move-layer" && isSelected ? "grabbing" : "grab",
                      zIndex: 20 + index,
                      display: "flex",
                      flexDirection: "column",
                      alignItems: "center",
                      justifyContent: "center",
                      overflow: "hidden",
                      boxSizing: "border-box",
                    }}
                  >
                    {/* Layer label */}
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        color: colors.border,
                        textAlign: "center",
                        lineHeight: 1.2,
                        padding: "2px 4px",
                        pointerEvents: "none",
                        maxWidth: "100%",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {layer.label}
                    </div>
                    <div
                      style={{
                        fontSize: 8,
                        color: colors.border,
                        opacity: 0.7,
                        pointerEvents: "none",
                      }}
                    >
                      {colors.label} Layer {index + 1}
                    </div>

                    {/* Preview text for text layers */}
                    {layer.layerType === "text" && layer.placeholder && (
                      <div
                        style={{
                          fontSize: 14,
                          fontStyle: "italic",
                          color: layer.defaultColor || "#666",
                          opacity: 0.5,
                          pointerEvents: "none",
                          marginTop: 2,
                        }}
                      >
                        {layer.placeholder}
                      </div>
                    )}

                    {/* Resize handles for selected layer */}
                    {isSelected &&
                      renderResizeHandles(
                        "resize-layer",
                        { x: 0, y: 0, w: 100, h: 100 },
                        (e, mode) =>
                          startDrag(e, mode, {
                            x: canvasPos.x,
                            y: canvasPos.y,
                            w: canvasPos.w,
                            h: canvasPos.h,
                          })
                      )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Add layer buttons */}
          <InlineStack gap="200">
            <Button onClick={() => addLayer("text")} size="slim">
              + Text Layer
            </Button>
            <Button onClick={() => addLayer("image")} size="slim">
              + Image Upload Layer
            </Button>
            <Button onClick={() => addLayer("fixed_image")} size="slim">
              + Fixed Image Layer
            </Button>
          </InlineStack>
        </BlockStack>
      </div>

      {/* ─── Properties Panel ─── */}
      <div style={{ flex: "0 0 280px", minWidth: 280 }}>
        <BlockStack gap="300">
          {/* Layer list */}
          <Card>
            <BlockStack gap="200">
              <Text as="h3" variant="headingSm">
                Layers ({layers.length})
              </Text>
              {layers.length === 0 && (
                <Text as="p" variant="bodySm" tone="subdued">
                  Add a layer using the buttons below the canvas.
                </Text>
              )}
              {layers.map((layer, index) => {
                const colors = LAYER_COLORS[layer.layerType] || LAYER_COLORS.text;
                const isSelected = selectedElement === "layer" && selectedLayerIndex === index;
                return (
                  <div
                    key={index}
                    onClick={() => {
                      setSelectedElement("layer");
                      setSelectedLayerIndex(index);
                    }}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "6px 8px",
                      borderRadius: 6,
                      border: isSelected ? `2px solid ${colors.border}` : "2px solid transparent",
                      backgroundColor: isSelected ? colors.bg : "transparent",
                      cursor: "pointer",
                      transition: "all 0.15s",
                    }}
                  >
                    {/* Color indicator */}
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        backgroundColor: colors.border,
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {layer.label}
                      </div>
                      <div style={{ fontSize: 10, color: "#666" }}>
                        {colors.label}
                      </div>
                    </div>
                    {/* Reorder buttons */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveLayerOrder(index, "up"); }}
                        disabled={index === 0}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: index === 0 ? "default" : "pointer",
                          opacity: index === 0 ? 0.3 : 1,
                          fontSize: 10,
                          padding: "0 2px",
                          lineHeight: 1,
                        }}
                      >
                        ▲
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); moveLayerOrder(index, "down"); }}
                        disabled={index === layers.length - 1}
                        style={{
                          background: "none",
                          border: "none",
                          cursor: index === layers.length - 1 ? "default" : "pointer",
                          opacity: index === layers.length - 1 ? 0.3 : 1,
                          fontSize: 10,
                          padding: "0 2px",
                          lineHeight: 1,
                        }}
                      >
                        ▼
                      </button>
                    </div>
                    {/* Delete button */}
                    <button
                      onClick={(e) => { e.stopPropagation(); removeLayer(index); }}
                      style={{
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        color: "#d72c0d",
                        fontSize: 14,
                        padding: "0 4px",
                        lineHeight: 1,
                      }}
                    >
                      ✕
                    </button>
                  </div>
                );
              })}
            </BlockStack>
          </Card>

          {/* Properties of selected element */}
          {selectedElement === "printarea" && (
            <Card>
              <BlockStack gap="200">
                <Text as="h3" variant="headingSm">Print Area</Text>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <TextField
                    label="X %"
                    type="number"
                    value={String(Math.round(printArea.x))}
                    onChange={(val) => onPrintAreaChange({ ...printArea, x: parseFloat(val) || 0 })}
                    autoComplete="off"
                    size="slim"
                  />
                  <TextField
                    label="Y %"
                    type="number"
                    value={String(Math.round(printArea.y))}
                    onChange={(val) => onPrintAreaChange({ ...printArea, y: parseFloat(val) || 0 })}
                    autoComplete="off"
                    size="slim"
                  />
                  <TextField
                    label="Width %"
                    type="number"
                    value={String(Math.round(printArea.width))}
                    onChange={(val) => onPrintAreaChange({ ...printArea, width: parseFloat(val) || 10 })}
                    autoComplete="off"
                    size="slim"
                  />
                  <TextField
                    label="Height %"
                    type="number"
                    value={String(Math.round(printArea.height))}
                    onChange={(val) => onPrintAreaChange({ ...printArea, height: parseFloat(val) || 10 })}
                    autoComplete="off"
                    size="slim"
                  />
                </div>
              </BlockStack>
            </Card>
          )}

          {selectedElement === "layer" && selectedLayer && selectedLayerIndex !== null && (
            <Card>
              <BlockStack gap="300">
                <Text as="h3" variant="headingSm">
                  Layer Properties
                </Text>

                <Select
                  label="Type"
                  options={[
                    { label: "Text", value: "text" },
                    { label: "Image Upload", value: "image" },
                    { label: "Fixed Image", value: "fixed_image" },
                  ]}
                  value={selectedLayer.layerType}
                  onChange={(val) => updateLayer(selectedLayerIndex, { layerType: val as LayerData["layerType"] })}
                />

                <TextField
                  label="Label"
                  value={selectedLayer.label}
                  onChange={(val) => updateLayer(selectedLayerIndex, { label: val })}
                  autoComplete="off"
                />

                <Checkbox
                  label="Customer can edit"
                  checked={selectedLayer.customerEditable}
                  onChange={(val) => updateLayer(selectedLayerIndex, { customerEditable: val })}
                />

                {/* Position fields */}
                <Text as="p" variant="bodySm" fontWeight="semibold">
                  Position (% of print area)
                </Text>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <TextField
                    label="X"
                    type="number"
                    value={String(Math.round(selectedLayer.positionX))}
                    onChange={(val) => updateLayer(selectedLayerIndex, { positionX: parseFloat(val) || 0 })}
                    autoComplete="off"
                    size="slim"
                  />
                  <TextField
                    label="Y"
                    type="number"
                    value={String(Math.round(selectedLayer.positionY))}
                    onChange={(val) => updateLayer(selectedLayerIndex, { positionY: parseFloat(val) || 0 })}
                    autoComplete="off"
                    size="slim"
                  />
                  <TextField
                    label="Width"
                    type="number"
                    value={String(Math.round(selectedLayer.positionWidth))}
                    onChange={(val) => updateLayer(selectedLayerIndex, { positionWidth: parseFloat(val) || 10 })}
                    autoComplete="off"
                    size="slim"
                  />
                  <TextField
                    label="Height"
                    type="number"
                    value={String(Math.round(selectedLayer.positionHeight))}
                    onChange={(val) => updateLayer(selectedLayerIndex, { positionHeight: parseFloat(val) || 10 })}
                    autoComplete="off"
                    size="slim"
                  />
                </div>

                {/* Text-specific options */}
                {selectedLayer.layerType === "text" && (
                  <>
                    <Divider />
                    <Text as="p" variant="bodySm" fontWeight="semibold">
                      Text Options
                    </Text>
                    <TextField
                      label="Max characters"
                      type="number"
                      value={String(selectedLayer.maxChars || 3)}
                      onChange={(val) => updateLayer(selectedLayerIndex, { maxChars: parseInt(val) || 3 })}
                      autoComplete="off"
                    />
                    <TextField
                      label="Placeholder text"
                      value={selectedLayer.placeholder || ""}
                      onChange={(val) => updateLayer(selectedLayerIndex, { placeholder: val })}
                      autoComplete="off"
                    />
                    <Select
                      label="Default font"
                      options={fonts.map((f) => ({ label: f.displayName, value: f.key }))}
                      value={selectedLayer.defaultFont || "script"}
                      onChange={(val) => updateLayer(selectedLayerIndex, { defaultFont: val })}
                    />
                    <div>
                      <Text as="p" variant="bodySm">Default color</Text>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                        <input
                          type="color"
                          value={selectedLayer.defaultColor || "#000000"}
                          onChange={(e) => updateLayer(selectedLayerIndex, { defaultColor: e.target.value })}
                          style={{ width: 32, height: 32, border: "1px solid #ccc", borderRadius: 4, cursor: "pointer" }}
                        />
                        <span style={{ fontSize: 12, color: "#666" }}>
                          {selectedLayer.defaultColor || "#000000"}
                        </span>
                      </div>
                    </div>
                  </>
                )}

                {/* Fixed image options */}
                {selectedLayer.layerType === "fixed_image" && (
                  <>
                    <Divider />
                    <TextField
                      label="Fixed Image URL"
                      value={selectedLayer.fixedImageUrl || ""}
                      onChange={(val) => updateLayer(selectedLayerIndex, { fixedImageUrl: val })}
                      autoComplete="off"
                      helpText="URL to a fixed overlay image (e.g., frame, logo)"
                    />
                  </>
                )}

                <Divider />
                <Button
                  variant="plain"
                  tone="critical"
                  onClick={() => removeLayer(selectedLayerIndex)}
                >
                  Delete Layer
                </Button>
              </BlockStack>
            </Card>
          )}

          {/* No selection hint */}
          {!selectedElement && layers.length > 0 && (
            <Card>
              <BlockStack gap="200">
                <Text as="p" variant="bodySm" tone="subdued">
                  Click the print area or a layer on the canvas to select and edit it.
                </Text>
              </BlockStack>
            </Card>
          )}
        </BlockStack>
      </div>
    </div>
  );
}
