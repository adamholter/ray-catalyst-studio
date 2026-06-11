import { useState, useMemo, useEffect, useRef, type CSSProperties } from "react";
import grapesjs, { type Editor } from "grapesjs";
import "grapesjs/dist/css/grapes.min.css";
import type { ExtractedAsset, RunRecord } from "@ray-catalyst/core";
import { editRunMockup, saveRunMockup } from "../lib/api";

type MockupEditorProps = {
  run: RunRecord;
  onClose: () => void;
  onRunUpdated: (run: RunRecord) => void;
  initialTab?: "design" | "preview";
};

function cleanEditorHtml(html: string) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(html, "text/html");
  doc.body.querySelectorAll<HTMLElement>(".catalyst-selected-element, .catalyst-inspect-hover").forEach((element) => {
    element.classList.remove("catalyst-selected-element", "catalyst-inspect-hover");
    if (!element.getAttribute("class")) element.removeAttribute("class");
  });
  doc.body.querySelectorAll("[data-temp-selected]").forEach((element) => element.removeAttribute("data-temp-selected"));
  return doc.body.innerHTML;
}

export function MockupEditor({ run, onClose, onRunUpdated, initialTab = "preview" }: MockupEditorProps) {
  const mockup = run.output?.mockup;
  const [activeTab, setActiveTab] = useState<"design" | "preview" | "html" | "css">(initialTab);
  const [activeTool, setActiveTool] = useState<"select" | "edit" | "inspect" | "compare">("select");
  const [editPrompt, setEditPrompt] = useState("");
  const [working, setWorking] = useState(false);
  const [error, setError] = useState("");
  const [copiedAssetId, setCopiedAssetId] = useState<string | null>(null);

  // Editable local copies of HTML/CSS so user can tweak code directly
  const [htmlContent, setHtmlContent] = useState(() => mockup?.html || "");
  const [cssContent, setCssContent] = useState(() => mockup?.css || "");
  const [selectedElement, setSelectedElement] = useState<string | null>(null);
  
  // Element selection index & text states
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [selectedElementTag, setSelectedElementTag] = useState<string | null>(null);
  const [selectedElementText, setSelectedElementText] = useState<string | null>(null);
  const [showExportToast, setShowExportToast] = useState(false);
  const [chatMessages, setChatMessages] = useState<Array<{ role: "assistant" | "user"; text: string }>>([
    { role: "assistant", text: "Ready for layout edits." }
  ]);

  const grapesContainerRef = useRef<HTMLDivElement | null>(null);
  const grapesEditorRef = useRef<Editor | null>(null);
  const grapesSyncRef = useRef<string>("");
  const originalImage = run.output?.images?.[0]?.url || "";

  // Initialize values when run changes
  useEffect(() => {
    if (run.output?.mockup) {
      setHtmlContent(run.output.mockup.html);
      setCssContent(run.output.mockup.css);
      grapesSyncRef.current = "";
    }
  }, [run]);

  // Synchronize tools & selections to active iframe
  useEffect(() => {
    const iframe = document.getElementById("mockup-preview-frame") as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({ type: "catalyst-tool-changed", tool: activeTool }, "*");
    }
  }, [activeTool]);

  useEffect(() => {
    const frame = grapesContainerRef.current?.querySelector<HTMLIFrameElement>("iframe.gjs-frame, iframe");
    if (frame?.contentDocument?.body) frame.contentDocument.body.dataset.catalystTool = activeTool;
  }, [activeTool, activeTab]);

  useEffect(() => {
    if (activeTab !== "design") return;
    const frame = grapesContainerRef.current?.querySelector<HTMLIFrameElement>("iframe.gjs-frame, iframe");
    const frameDocument = frame?.contentDocument;
    if (!frameDocument?.body || frameDocument.body.innerHTML === htmlContent) return;
    const activeElement = frameDocument.activeElement as HTMLElement | null;
    if (activeElement?.isContentEditable) return;
    frameDocument.body.innerHTML = htmlContent || "<main></main>";
    frameDocument.body.dataset.catalystTool = activeTool;
  }, [activeTab, activeTool, htmlContent]);

  useEffect(() => {
    if (selectedIndex === null) return;
    const iframe = document.getElementById("mockup-preview-frame") as HTMLIFrameElement | null;
    if (iframe?.contentWindow) {
      iframe.contentWindow.postMessage({
        type: "catalyst-highlight-element-index",
        index: selectedIndex
      }, "*");
    }
  }, [selectedIndex, htmlContent]);

  // Spacing property nudge helper
  function nudgeStyle(property: string, amount: number) {
    if (selectedIndex === null) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const allElements = Array.from(doc.body.querySelectorAll('*'));
    const target = allElements[selectedIndex] as HTMLElement | null;
    if (!target) return;
    
    const currentStyle = target.style.getPropertyValue(property) || "0px";
    const currentVal = parseInt(currentStyle) || 0;
    const isPadding = property.startsWith("padding");
    const newVal = isPadding ? Math.max(0, currentVal + amount) : currentVal + amount;
    
    target.style.setProperty(property, `${newVal}px`);
    setHtmlContent(cleanEditorHtml(doc.body.innerHTML));
  }

  // Spacing property value getter helper
  function getSelectedElementStyle(property: string): string {
    if (selectedIndex === null) return "0px";
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const allElements = Array.from(doc.body.querySelectorAll('*'));
    const target = allElements[selectedIndex] as HTMLElement | null;
    if (!target) return "0px";
    return target.style.getPropertyValue(property) || "0px";
  }

  // Alignment update helper
  function updateSelectedElementStyle(styles: Record<string, string>) {
    if (selectedIndex === null) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const allElements = Array.from(doc.body.querySelectorAll('*'));
    const target = allElements[selectedIndex] as HTMLElement | null;
    if (!target) return;
    for (const [key, value] of Object.entries(styles)) {
      target.style.setProperty(key, value);
    }
    setHtmlContent(cleanEditorHtml(doc.body.innerHTML));
  }

  // Direct element HTML update helper
  function updateSelectedElementHtml(newHtml: string) {
    if (selectedIndex === null) return;
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(htmlContent, "text/html");
      const allElements = Array.from(doc.body.querySelectorAll('*'));
      const target = allElements[selectedIndex];
      if (!target || !target.parentElement) return;

      const tempDoc = parser.parseFromString(newHtml, "text/html");
      const newEl = tempDoc.body.firstElementChild;
      if (!newEl) return;

      // Swap elements in tree
      target.parentElement.replaceChild(newEl.cloneNode(true), target);
      setHtmlContent(cleanEditorHtml(doc.body.innerHTML));
    } catch (err) {
      console.error("Failed to parse element HTML", err);
    }
  }

  // Direct text update helper
  function updateSelectedElementText(text: string) {
    if (selectedIndex === null) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const allElements = Array.from(doc.body.querySelectorAll('*'));
    const target = allElements[selectedIndex] as HTMLElement | null;
    if (!target) return;
    target.textContent = text;
    setHtmlContent(cleanEditorHtml(doc.body.innerHTML));
    setSelectedElementText(text);
  }

  // Move element up or down sibling tree
  function moveSelectedElement(direction: "up" | "down") {
    if (selectedIndex === null) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const allElementsBefore = Array.from(doc.body.querySelectorAll('*'));
    const target = allElementsBefore[selectedIndex];
    if (!target || !target.parentElement) return;

    const parent = target.parentElement;
    const siblings = Array.from(parent.children);
    const indexInSiblings = siblings.indexOf(target);

    if (direction === "up" && indexInSiblings > 0) {
      parent.insertBefore(target, siblings[indexInSiblings - 1]);
    } else if (direction === "down" && indexInSiblings < siblings.length - 1) {
      const nextSibling = siblings[indexInSiblings + 1];
      parent.insertBefore(target, nextSibling.nextElementSibling);
    }

    // Set temp attribute to track its new pre-order traversal index
    target.setAttribute("data-temp-selected", "true");
    const serializedHtml = doc.body.innerHTML;
    
    const docNew = parser.parseFromString(serializedHtml, "text/html");
    const allElementsAfter = Array.from(docNew.body.querySelectorAll('*'));
    let newIdx = selectedIndex;
    allElementsAfter.forEach((el, index) => {
      if (el.getAttribute("data-temp-selected") === "true") {
        newIdx = index;
        el.removeAttribute("data-temp-selected");
      }
    });

    setHtmlContent(cleanEditorHtml(docNew.body.innerHTML));
    setSelectedIndex(newIdx);
  }

  // Duplicate element
  function duplicateSelectedElement() {
    if (selectedIndex === null) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const allElements = Array.from(doc.body.querySelectorAll('*'));
    const target = allElements[selectedIndex];
    if (!target || !target.parentElement) return;

    const clone = target.cloneNode(true) as HTMLElement;
    target.parentElement.insertBefore(clone, target.nextSibling);

    clone.setAttribute("data-temp-selected", "true");
    const serializedHtml = doc.body.innerHTML;

    const docNew = parser.parseFromString(serializedHtml, "text/html");
    const allElementsAfter = Array.from(docNew.body.querySelectorAll('*'));
    let newIdx = selectedIndex;
    allElementsAfter.forEach((el, index) => {
      if (el.getAttribute("data-temp-selected") === "true") {
        newIdx = index;
        el.removeAttribute("data-temp-selected");
      }
    });

    setHtmlContent(cleanEditorHtml(docNew.body.innerHTML));
    setSelectedIndex(newIdx);
  }

  // Delete element
  function deleteSelectedElement() {
    if (selectedIndex === null) return;
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const allElements = Array.from(doc.body.querySelectorAll('*'));
    const target = allElements[selectedIndex];
    if (!target) return;
    
    target.remove();
    
    setHtmlContent(cleanEditorHtml(doc.body.innerHTML));
    setSelectedIndex(null);
    setSelectedElement(null);
    setSelectedElementTag(null);
    setSelectedElementText(null);
  }

  // Compute selected element outerHTML
  const selectedElementHtml = useMemo(() => {
    if (selectedIndex === null) return "";
    const parser = new DOMParser();
    const doc = parser.parseFromString(htmlContent, "text/html");
    const allElements = Array.from(doc.body.querySelectorAll('*'));
    const target = allElements[selectedIndex];
    return target ? target.outerHTML : "";
  }, [htmlContent, selectedIndex]);

  // Export packaged high-fidelity HTML file
  function handleExportHTML() {
    const frameWidth = mockup?.sourceWidth || 1024;
    const frameHeight = mockup?.sourceHeight || 1536;
    const fullHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Catalyst Mockup Export</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
  <style>
    body {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
      background: #faf9f5;
    }
    .catalyst-container {
      width: 100%;
      max-width: ${frameWidth}px;
      margin: 0 auto;
      min-height: ${frameHeight}px;
      background: #ffffff;
      position: relative;
    }
    ${cssContent}
  </style>
</head>
<body>
  <div class="catalyst-container">
    ${htmlContent}
  </div>
</body>
</html>`;

    // Download standard file
    const blob = new Blob([fullHtml], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `catalyst-mockup-${run.id}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    // Copy packaged file to clipboard
    navigator.clipboard.writeText(fullHtml).catch(() => {});

    // Visual feedback success toast
    setShowExportToast(true);
    setTimeout(() => setShowExportToast(false), 3000);
  }

  // Restore highlighted selection outline on iframe reload
  const handleIframeLoad = () => {
    const iframe = document.getElementById("mockup-preview-frame") as HTMLIFrameElement | null;
    if (iframe?.contentWindow && selectedIndex !== null) {
      iframe.contentWindow.postMessage({
        type: "catalyst-highlight-element-index",
        index: selectedIndex
      }, "*");
    }
  };

  useEffect(() => {
    if (activeTab !== "design" || !grapesContainerRef.current || !mockup) return;
    if (!htmlContent.trim()) return;

    if (!grapesEditorRef.current) {
      grapesEditorRef.current = grapesjs.init({
        container: grapesContainerRef.current,
        height: "100%",
        width: "100%",
        storageManager: false,
        panels: { defaults: [] },
        blockManager: { appendTo: undefined },
        selectorManager: { appendTo: undefined },
        styleManager: { appendTo: undefined },
        layerManager: { appendTo: undefined },
        traitManager: { appendTo: undefined },
        deviceManager: {
          devices: [
            { id: "desktop", name: "Desktop", width: "" },
            { id: "mobile", name: "Mobile", width: "390px" }
          ]
        },
        canvas: {
          styles: [
            "https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif:ital@0;1&display=swap"
          ]
        },
        components: "<main></main>",
        style: ""
      });
      grapesEditorRef.current.render();
    }

    const editor = grapesEditorRef.current;
    const grapesFrame = () => grapesContainerRef.current?.querySelector<HTMLIFrameElement>("iframe.gjs-frame, iframe");
    let observer: MutationObserver | null = null;
    
    const loadIntoEditor = () => {
      const frameDocument = grapesFrame()?.contentDocument;
      if (!frameDocument) return;
      const syncKey = `${mockup.id}:${htmlContent.length}:${cssContent.length}`;
      if (grapesSyncRef.current === syncKey) return;

      frameDocument.head.querySelector("[data-catalyst-css]")?.remove();
      const style = frameDocument.createElement("style");
      style.setAttribute("data-catalyst-css", "true");
      style.textContent = cssContent || "";
      frameDocument.head.appendChild(style);
      frameDocument.body.innerHTML = htmlContent || "<main></main>";
      frameDocument.body.setAttribute("data-catalyst-editable-canvas", "true");
      frameDocument.body.dataset.catalystTool = activeTool;
      
      // Auto-synchronize visual updates (text, styling, alignments, reorders) from Design Canvas
      if (observer) observer.disconnect();
      observer = new MutationObserver(() => {
        const bodyHtml = frameDocument.body.innerHTML;
        if (bodyHtml && bodyHtml !== htmlContent) {
          grapesSyncRef.current = syncKey;
          setHtmlContent(cleanEditorHtml(bodyHtml));
        }
      });
      observer.observe(frameDocument.body, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true
      });

      frameDocument.body.querySelectorAll<HTMLElement>("[contenteditable]").forEach((element) => {
        element.addEventListener("input", () => {
          grapesSyncRef.current = syncKey;
          setHtmlContent(cleanEditorHtml(frameDocument.body.innerHTML));
        });
      });
      const frameWindow = frameDocument.defaultView as (Window & { catalystDesignCleanup?: () => void }) | null;
      frameWindow?.catalystDesignCleanup?.();
      if (frameWindow) {
        let selectedDesignElement: HTMLElement | null = null;
        let dragStart:
          | { element: HTMLElement; x: number; y: number; left: number; top: number; moved: boolean }
          | null = null;
        const selectionStyle = frameDocument.createElement("style");
        selectionStyle.setAttribute("data-catalyst-design-controls", "true");
        selectionStyle.textContent = `
          .catalyst-selected-element {
            outline: 2px solid #4f46e5 !important;
            outline-offset: 2px !important;
            cursor: move !important;
          }
          .catalyst-inspect-hover {
            outline: 1.5px dashed #4f46e5 !important;
            outline-offset: 1px !important;
          }
        `;
        frameDocument.head.querySelector("[data-catalyst-design-controls]")?.remove();
        frameDocument.head.appendChild(selectionStyle);

        const allElements = () => Array.from(frameDocument.body.querySelectorAll<HTMLElement>("*"));
        const indexOf = (element: HTMLElement) => allElements().indexOf(element);
        const labelFor = (element: HTMLElement) => {
          const className = String(element.className || "").trim().split(/\s+/).filter(Boolean).slice(0, 2).join(".");
          return `${element.tagName.toLowerCase()}${className ? `.${className}` : ""}`;
        };
        const selectable = (target: EventTarget | null) => {
          const element = target as Element | null;
          if (!element || typeof element.closest !== "function") return null;
          return element.closest<HTMLElement>("[data-asset-id], article, section, header, nav, h1, h2, h3, p, a, button, strong, span, div");
        };
        const select = (element: HTMLElement | null) => {
          selectedDesignElement?.classList.remove("catalyst-selected-element");
          selectedDesignElement = element && element !== frameDocument.body ? element : null;
          if (!selectedDesignElement) return;
          selectedDesignElement.classList.add("catalyst-selected-element");
          const index = indexOf(selectedDesignElement);
          frameWindow.parent.postMessage(
            {
              type: "catalyst-select-element",
              element: labelFor(selectedDesignElement),
              index,
              tagName: selectedDesignElement.tagName.toLowerCase(),
              text: selectedDesignElement.textContent?.trim().slice(0, 80) || ""
            },
            "*"
          );
        };
        const px = (element: HTMLElement, property: "left" | "top") => {
          const value = Number.parseFloat(element.style[property] || "0");
          return Number.isFinite(value) ? value : 0;
        };
        const syncDesign = () => {
          grapesSyncRef.current = syncKey;
          setHtmlContent(cleanEditorHtml(frameDocument.body.innerHTML));
        };
        const onClick = (event: MouseEvent) => {
          const element = selectable(event.target);
          if (!element) return;
          select(element);
        };
        const onMouseOver = (event: MouseEvent) => {
          if (!["select", "inspect"].includes(frameDocument.body.dataset.catalystTool || "")) return;
          const element = selectable(event.target);
          element?.classList.add("catalyst-inspect-hover");
        };
        const onMouseOut = (event: MouseEvent) => {
          const element = selectable(event.target);
          element?.classList.remove("catalyst-inspect-hover");
        };
        const onMouseDown = (event: MouseEvent) => {
          if (frameDocument.body.dataset.catalystTool !== "select") return;
          const element = selectable(event.target);
          if (!element) return;
          select(element);
          dragStart = { element, x: event.clientX, y: event.clientY, left: px(element, "left"), top: px(element, "top"), moved: false };
        };
        const onMouseMove = (event: MouseEvent) => {
          if (!dragStart) return;
          const dx = event.clientX - dragStart.x;
          const dy = event.clientY - dragStart.y;
          if (Math.abs(dx) + Math.abs(dy) < 3) return;
          dragStart.moved = true;
          dragStart.element.style.position = dragStart.element.style.position || "relative";
          dragStart.element.style.left = `${dragStart.left + dx}px`;
          dragStart.element.style.top = `${dragStart.top + dy}px`;
        };
        const onMouseUp = () => {
          if (dragStart?.moved) syncDesign();
          dragStart = null;
        };
        frameDocument.addEventListener("click", onClick, true);
        frameDocument.addEventListener("mouseover", onMouseOver, true);
        frameDocument.addEventListener("mouseout", onMouseOut, true);
        frameDocument.addEventListener("mousedown", onMouseDown, true);
        frameDocument.addEventListener("mousemove", onMouseMove, true);
        frameDocument.addEventListener("mouseup", onMouseUp, true);
        frameWindow.catalystDesignCleanup = () => {
          frameDocument.removeEventListener("click", onClick, true);
          frameDocument.removeEventListener("mouseover", onMouseOver, true);
          frameDocument.removeEventListener("mouseout", onMouseOut, true);
          frameDocument.removeEventListener("mousedown", onMouseDown, true);
          frameDocument.removeEventListener("mousemove", onMouseMove, true);
          frameDocument.removeEventListener("mouseup", onMouseUp, true);
        };
      }
      grapesSyncRef.current = syncKey;
    };
    editor.onReady(loadIntoEditor);
    const timers = [100, 350, 800].map((delay) => window.setTimeout(loadIntoEditor, delay));
    return () => {
      timers.forEach((timer) => window.clearTimeout(timer));
      if (observer) (observer as MutationObserver).disconnect();
      const frameDocument = grapesFrame()?.contentDocument;
      if (frameDocument?.body?.innerHTML) {
        setHtmlContent(cleanEditorHtml(frameDocument.body.innerHTML));
      }
    };
  }, [activeTab, mockup?.id, mockup?.generatedAt]);

  useEffect(() => {
    return () => {
      grapesEditorRef.current?.destroy();
      grapesEditorRef.current = null;
    };
  }, []);

  // Handle postMessage events from iframe element selector
  useEffect(() => {
    function handleMessage(event: MessageEvent) {
      if (event.data?.type === "catalyst-select-element") {
        setSelectedElement(event.data.element);
        if (event.data.index !== undefined) {
          setSelectedIndex(event.data.index);
        }
        if (event.data.tagName) {
          setSelectedElementTag(event.data.tagName);
        }
        if (event.data.text !== undefined) {
          setSelectedElementText(event.data.text);
        }
      }
    }
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Compile full iframe srcDoc with CSS and live interactive layers injected
  const compiledSrcDoc = useMemo(() => {
    if (!htmlContent) return "";
    const frameWidth = mockup?.sourceWidth || 1024;
    const frameHeight = mockup?.sourceHeight || 1536;

    const activeInspectorCode = `
      <script>
        window.catalystMode = ${JSON.stringify(activeTool)};
        
        // Listen for tool updates dynamically
        window.addEventListener('message', (e) => {
          if (e.data?.type === 'catalyst-tool-changed') {
            window.catalystMode = e.data.tool;
            document.querySelectorAll('.catalyst-inspect-hover').forEach(el => {
              el.classList.remove('catalyst-inspect-hover');
            });
          } else if (e.data?.type === 'catalyst-highlight-element-index') {
            const el = getElementByIndex(e.data.index);
            highlightElement(el);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            }
          }
        });

        const style = document.createElement('style');
        style.textContent = \`
          .catalyst-inspect-hover {
            outline: 1.5px dashed #4f46e5 !important;
            outline-offset: -1.5px !important;
            cursor: crosshair !important;
            opacity: 0.9 !important;
          }
          .catalyst-selected-element {
            outline: 2.5px solid #4f46e5 !important;
            outline-offset: -2.5px !important;
            background-color: rgba(79, 70, 229, 0.04) !important;
          }
        \`;
        document.head.appendChild(style);

        // Helper to get element index
        function getElementIndex(el) {
          const container = document.querySelector('.catalyst-frame-fit') || document.body;
          const allElements = Array.from(container.querySelectorAll('*'));
          return allElements.indexOf(el);
        }

        // Helper to get element by index
        function getElementByIndex(idx) {
          const container = document.querySelector('.catalyst-frame-fit') || document.body;
          const allElements = Array.from(container.querySelectorAll('*'));
          return allElements[idx];
        }

        // Highlight element function
        function highlightElement(el) {
          document.querySelectorAll('.catalyst-selected-element').forEach(item => {
            item.classList.remove('catalyst-selected-element');
          });
          if (el) {
            el.classList.add('catalyst-selected-element');
          }
        }

        document.body.addEventListener('mouseover', (e) => {
          if (window.catalystMode !== 'inspect' && window.catalystMode !== 'select') return;
          e.target.classList.add('catalyst-inspect-hover');
        });

        document.body.addEventListener('mouseout', (e) => {
          e.target.classList.remove('catalyst-inspect-hover');
        });

        document.body.addEventListener('click', (e) => {
          if (window.catalystMode === 'inspect' || window.catalystMode === 'select' || window.catalystMode === 'edit') {
            e.preventDefault();
            e.stopPropagation();
            
            const el = e.target;
            const index = getElementIndex(el);
            
            highlightElement(el);

            const tag = el.tagName.toLowerCase();
            const id = el.id ? '#' + el.id : '';
            const cls = el.className ? '.' + Array.from(el.classList).filter(c => c && !c.startsWith('catalyst')).join('.') : '';
            
            window.parent.postMessage({ 
              type: 'catalyst-select-element', 
              element: tag + id + cls,
              index: index,
              text: el.textContent ? el.textContent.trim().substring(0, 60) : '',
              tagName: tag
            }, '*');
          }
        });
      </script>
    `;

    return `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link rel="preconnect" href="https://fonts.googleapis.com">
        <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,100..1000;1,9..40,100..1000&family=Instrument+Serif:ital@0;1&family=Inter:wght@300;400;500;600;700&family=Playfair+Display:ital,wght@0,400..900;1,400..900&family=Outfit:wght@300;400;500;600;700&display=swap" rel="stylesheet">
        <style>
          /* CSS Resets inside iframe */
          body {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
            --catalyst-frame-scale: min(1, calc(100vw / ${frameWidth}));
            min-height: calc(${frameHeight}px * var(--catalyst-frame-scale));
          }
          .catalyst-frame-fit {
            width: ${frameWidth}px;
            min-height: ${frameHeight}px;
            transform: scale(var(--catalyst-frame-scale));
            transform-origin: top left;
          }
          ${cssContent}
        </style>
      </head>
      <body>
        <div class="catalyst-frame-fit">
          ${htmlContent}
        </div>
        ${activeInspectorCode}
      </body>
      </html>
    `;
  }, [htmlContent, cssContent, activeTool, mockup?.sourceHeight, mockup?.sourceWidth]);

  async function handleApplyPrompt(e: React.FormEvent) {
    e.preventDefault();
    if (!editPrompt.trim()) return;
    setWorking(true);
    setError("");
    setSelectedElement(null);
    setSelectedIndex(null);
    const prompt = editPrompt.trim();
    setChatMessages((current) => [...current, { role: "user", text: prompt }]);

    try {
      const response = await editRunMockup(run.id, prompt, htmlContent, cssContent);
      onRunUpdated(response.run);
      if (response.run.output?.mockup) {
        setHtmlContent(response.run.output.mockup.html);
        setCssContent(response.run.output.mockup.css);
      }
      setChatMessages((current) => [...current, { role: "assistant", text: "Applied the requested HTML/CSS update." }]);
      setEditPrompt("");
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
      setChatMessages((current) => [...current, { role: "assistant", text: message }]);
    } finally {
      setWorking(false);
    }
  }

  async function copyAssetUrl(url: string, assetId: string) {
    await navigator.clipboard.writeText(url);
    setCopiedAssetId(assetId);
    setTimeout(() => setCopiedAssetId(null), 1600);
  }

  async function handleSaveRawCode() {
    setWorking(true);
    setError("");
    try {
      const response = await saveRunMockup(run.id, htmlContent, cssContent);
      onRunUpdated(response.run);
      setWorking(false);
      setActiveTab("preview");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setWorking(false);
    }
  }

  function assetThumbStyle(asset: ExtractedAsset): CSSProperties | undefined {
    if (!asset.source) return undefined;
    const scale = 44 / Math.max(asset.source.crop.width, asset.source.crop.height);
    return {
      backgroundImage: `url("${asset.source.imageUrl}")`,
      backgroundSize: `${asset.source.sourceWidth * scale}px ${asset.source.sourceHeight * scale}px`,
      backgroundPosition: `${-asset.source.crop.x * scale}px ${-asset.source.crop.y * scale}px`
    };
  }

  if (!mockup) {
    return (
      <div className="editor-overlay-fallback">
        <div className="empty-state">
          <div className="spinner">✦</div>
          <p>No mockup found on this run.</p>
          <button className="ghost-button" onClick={onClose}>Close</button>
        </div>
      </div>
    );
  }

  return (
    <div className="mockup-editor-fullscreen" role="dialog" aria-modal="true">
      {/* Top Header Control bar */}
      <header className="editor-top-bar">
        <div className="editor-brand-tag">
          <span className="brand-dot">✦</span>
          <strong>Catalyst Studio</strong>
          <span className="editor-sep">/</span>
          <span className="editor-subtext-light">HTML Canvas Editor</span>
        </div>
        
        <div className="editor-tabs">
          <button 
            className={`editor-tab ${activeTab === "design" ? "active" : ""}`}
            type="button"
            onClick={() => setActiveTab("design")}
          >
            Design Canvas
          </button>
          <button 
            className={`editor-tab ${activeTab === "preview" ? "active" : ""}`}
            type="button" 
            onClick={() => setActiveTab("preview")}
          >
            Preview Canvas
          </button>
          <button 
            className={`editor-tab ${activeTab === "html" ? "active" : ""}`}
            type="button" 
            onClick={() => setActiveTab("html")}
          >
            HTML Source
          </button>
          <button 
            className={`editor-tab ${activeTab === "css" ? "active" : ""}`}
            type="button" 
            onClick={() => setActiveTab("css")}
          >
            CSS Stylesheet
          </button>
        </div>

        <div className="editor-actions-right">
          <button className="ghost-button export-html-btn" type="button" onClick={handleExportHTML} title="Export packed production HTML file">
            Export HTML ⤓
          </button>
          {activeTab !== "preview" && (
            <button className="ghost-button save-code-btn" type="button" onClick={handleSaveRawCode} disabled={working}>
              {working ? "Saving..." : "Apply Code Changes"}
            </button>
          )}
          <button className="modal-close-btn" type="button" onClick={onClose} aria-label="Exit mockup editor">
            Exit Editor ×
          </button>
        </div>
      </header>

      {/* Floating Visual Export Success Toast */}
      {showExportToast && (
        <div className="export-toast animate-slide-in">
          <span className="toast-icon">✓</span>
          <div className="toast-text">
            <strong>Mockup Exported!</strong>
            <span>HTML file downloaded & copied to clipboard</span>
          </div>
        </div>
      )}

      {/* Main Workspace Frame */}
      <div className="editor-stage">
        
        {/* Left Control Sidebar */}
        <aside className="editor-sidebar">
          
          {/* Tool Belt */}
          <div className="sidebar-editor-card">
            <h3 className="sidebar-group-title">Interaction Tools</h3>
            <div className="tool-belt-grid">
              <button 
                className={`tool-btn ${activeTool === "select" ? "active" : ""}`} 
                type="button"
                onClick={() => { setActiveTool("select"); setSelectedElement(null); setSelectedIndex(null); }}
              >
                <span className="tool-icon">⬈</span>
                <span className="tool-lbl">Select Block</span>
              </button>
              <button 
                className={`tool-btn ${activeTool === "edit" ? "active" : ""}`} 
                type="button"
                onClick={() => { setActiveTool("edit"); setSelectedElement(null); setSelectedIndex(null); }}
              >
                <span className="tool-icon">✎</span>
                <span className="tool-lbl">Direct Text</span>
              </button>
              <button 
                className={`tool-btn ${activeTool === "inspect" ? "active" : ""}`} 
                type="button"
                onClick={() => { setActiveTool("inspect"); setSelectedElement(null); setSelectedIndex(null); }}
              >
                <span className="tool-icon">👁</span>
                <span className="tool-lbl">Inspect Assets</span>
              </button>
              <button 
                className={`tool-btn ${activeTool === "compare" ? "active" : ""}`} 
                type="button"
                onClick={() => { setActiveTool("compare"); setSelectedElement(null); setSelectedIndex(null); }}
              >
                <span className="tool-icon">⇄</span>
                <span className="tool-lbl">Compare View</span>
              </button>
            </div>
            
            {selectedElement && (
              <div className="inspected-element-tag animate-slide-in">
                <span>Selected:</span>
                <code>{selectedElement}</code>
              </div>
            )}
          </div>

          {/* Element Editor Visual Control Card */}
          {selectedIndex !== null ? (
            <div className="sidebar-editor-card element-editor-card animate-slide-in">
              <h3 className="sidebar-group-title">Visual Element Controls</h3>
              
              <div className="selected-element-meta">
                <span className="element-tag-badge">{selectedElementTag?.toUpperCase()}</span>
                <code className="element-selector-text">{selectedElement}</code>
              </div>

              {/* Align / Centering */}
              <div className="editor-control-section">
                <span className="control-label">Alignment</span>
                <div className="alignment-button-group">
                  <button 
                    className="align-btn" 
                    type="button" 
                    onClick={() => updateSelectedElementStyle({ "text-align": "left" })}
                  >
                    Left
                  </button>
                  <button 
                    className="align-btn" 
                    type="button" 
                    onClick={() => updateSelectedElementStyle({ "text-align": "center" })}
                  >
                    Center
                  </button>
                  <button 
                    className="align-btn" 
                    type="button" 
                    onClick={() => updateSelectedElementStyle({ "text-align": "right" })}
                  >
                    Right
                  </button>
                </div>
                <button
                  className="block-center-btn"
                  type="button"
                  onClick={() => updateSelectedElementStyle({ "margin-left": "auto", "margin-right": "auto", "display": "block" })}
                >
                  Center Block (margin: 0 auto)
                </button>
              </div>

              {/* Spacing Nudges */}
              <div className="editor-control-section">
                <span className="control-label">Spacing Nudges</span>
                <div className="nudge-control-grid">
                  <div className="nudge-box">
                    <span className="nudge-label">Margin Top</span>
                    <div className="nudge-actions">
                      <button type="button" onClick={() => nudgeStyle("margin-top", -4)}>-</button>
                      <span className="nudge-val">{getSelectedElementStyle("margin-top")}</span>
                      <button type="button" onClick={() => nudgeStyle("margin-top", 4)}>+</button>
                    </div>
                  </div>

                  <div className="nudge-box">
                    <span className="nudge-label">Margin Bottom</span>
                    <div className="nudge-actions">
                      <button type="button" onClick={() => nudgeStyle("margin-bottom", -4)}>-</button>
                      <span className="nudge-val">{getSelectedElementStyle("margin-bottom")}</span>
                      <button type="button" onClick={() => nudgeStyle("margin-bottom", 4)}>+</button>
                    </div>
                  </div>

                  <div className="nudge-box">
                    <span className="nudge-label">Padding Top</span>
                    <div className="nudge-actions">
                      <button type="button" onClick={() => nudgeStyle("padding-top", -4)}>-</button>
                      <span className="nudge-val">{getSelectedElementStyle("padding-top")}</span>
                      <button type="button" onClick={() => nudgeStyle("padding-top", 4)}>+</button>
                    </div>
                  </div>

                  <div className="nudge-box">
                    <span className="nudge-label">Padding Bottom</span>
                    <div className="nudge-actions">
                      <button type="button" onClick={() => nudgeStyle("padding-bottom", -4)}>-</button>
                      <span className="nudge-val">{getSelectedElementStyle("padding-bottom")}</span>
                      <button type="button" onClick={() => nudgeStyle("padding-bottom", 4)}>+</button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Direct Text Editor */}
              <div className="editor-control-section">
                <span className="control-label">Element Text Content</span>
                <textarea
                  className="element-text-area"
                  rows={2}
                  value={selectedElementText || ""}
                  onChange={(e) => updateSelectedElementText(e.target.value)}
                  placeholder="Edit raw element text..."
                />
              </div>

              {/* Direct Surgical HTML Editor */}
              <div className="editor-control-section">
                <span className="control-label">Element HTML Code</span>
                <textarea
                  className="element-code-area"
                  rows={3}
                  value={selectedElementHtml}
                  onChange={(e) => updateSelectedElementHtml(e.target.value)}
                  placeholder="Edit raw HTML code..."
                  spellCheck={false}
                />
              </div>

              {/* Sibling Movement, Duplication & Deletion */}
              <div className="editor-control-section">
                <span className="control-label">Element Actions</span>
                <div className="actions-button-row">
                  <button className="elem-action-btn" type="button" onClick={() => moveSelectedElement("up")} title="Move Up sibling">
                    ↑ Up
                  </button>
                  <button className="elem-action-btn" type="button" onClick={() => moveSelectedElement("down")} title="Move Down sibling">
                    ↓ Down
                  </button>
                  <button className="elem-action-btn duplicate-btn" type="button" onClick={duplicateSelectedElement} title="Duplicate element">
                    Dup
                  </button>
                  <button className="elem-action-btn delete-btn" type="button" onClick={deleteSelectedElement} title="Delete element">
                    Del
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="sidebar-editor-card selection-hint-card">
              <p className="selection-hint-text">No element selected.</p>
            </div>
          )}

          {/* AI Refiner */}
          <div className="sidebar-editor-card">
            <h3 className="sidebar-group-title">AI Refinement Chat</h3>
            <div className="edit-chat-log editor-chat-log">
              {chatMessages.map((message, index) => (
                <div className={`edit-chat-message ${message.role}`} key={`${message.role}-${index}`}>
                  {message.text}
                </div>
              ))}
              {working ? <div className="edit-chat-message assistant">Applying change...</div> : null}
            </div>
            <form onSubmit={handleApplyPrompt}>
              <textarea
                className="ai-prompt-area"
                rows={3}
                placeholder={selectedElement ? `Edit the selected ${selectedElementTag || "element"}...` : "Ask for an HTML or CSS edit..."}
                value={editPrompt}
                onChange={(e) => setEditPrompt(e.target.value)}
                disabled={working}
              />
              <button className="apply-ai-btn" type="submit" disabled={working || !editPrompt.trim()}>
                {working ? (
                  <>
                    <span className="spinner-small">✦</span> Refining Layout...
                  </>
                ) : (
                  "✦ Apply Refinement"
                )}
              </button>
            </form>
            {error && <p className="editor-error-msg">{error}</p>}
          </div>

          {/* Extracted Asset Catalog */}
          <div className="sidebar-editor-card asset-catalog-card">
            <h3 className="sidebar-group-title">Asset Catalog</h3>
            <div className="asset-items-list">
              {mockup.assets.length === 0 ? (
                <p className="no-assets-hint">No extracted graphics identified.</p>
              ) : (
                mockup.assets.map((asset) => (
                  <div className="asset-item-tile" key={asset.id}>
                    <div className="asset-tile-media">
                      {asset.source && asset.url === asset.source.imageUrl ? (
                        <div className="asset-tile-crop" style={assetThumbStyle(asset)} aria-label={asset.name} />
                      ) : (
                        <img src={asset.url} alt={asset.name} />
                      )}
                    </div>
                    <div className="asset-tile-info">
                      <strong className="asset-tile-name">{asset.name}</strong>
                      <span className="asset-tile-meta">
                        {asset.type} {asset.dimensions ? `· ${asset.dimensions}` : ""}
                      </span>
                      {asset.cleanup?.removeText || asset.cleanup?.removeOverlays ? (
                        <span className="asset-tile-cleanup">
                          clean extraction: {[asset.cleanup.removeText ? "text" : "", asset.cleanup.removeOverlays ? "overlays" : ""].filter(Boolean).join(" + ")}
                        </span>
                      ) : null}
                      <button 
                        className="asset-tile-copy" 
                        type="button" 
                        onClick={() => copyAssetUrl(asset.url, asset.id)}
                      >
                        {copiedAssetId === asset.id ? "✓ Copied" : "Copy URL"}
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </aside>

        {/* Central Display Pane */}
        <main className="editor-canvas-container">
          {activeTab === "design" ? (
            <div className="grapes-editor-shell">
              <div className="grapes-editor-toolbar">
                <button type="button" onClick={() => grapesEditorRef.current?.runCommand("core:undo")} title="Undo">↶</button>
                <button type="button" onClick={() => grapesEditorRef.current?.runCommand("core:redo")} title="Redo">↷</button>
                <button type="button" onClick={() => grapesEditorRef.current?.setDevice("Desktop")}>Desktop</button>
                <button type="button" onClick={() => grapesEditorRef.current?.setDevice("Mobile")}>Mobile</button>
              </div>
              <div className="grapes-editor-canvas" ref={grapesContainerRef} />
            </div>
          ) : activeTab === "preview" ? (
            activeTool === "compare" ? (
              /* High-fidelity Comparison View */
              <div className="compare-grid-layout">
                <div className="compare-pane">
                  <div className="compare-pane-header">Original Generated Image</div>
                  <div className="compare-pane-content image-pane">
                    <img src={originalImage} alt="Original mockup output" />
                  </div>
                </div>
                <div className="compare-pane">
                  <div className="compare-pane-header">Rendered Responsive HTML Mockup</div>
                  <div className="compare-pane-content">
                    <iframe 
                      id="mockup-preview-frame"
                      className="canvas-iframe" 
                      srcDoc={compiledSrcDoc} 
                      title="Editable Mockup Live Comparison" 
                      onLoad={handleIframeLoad}
                    />
                  </div>
                </div>
              </div>
            ) : (
              /* Main Single Live Canvas Frame */
              <div className="canvas-frame-outer">
                <iframe 
                  id="mockup-preview-frame"
                  className="canvas-iframe" 
                  srcDoc={compiledSrcDoc} 
                  title="Editable Mockup Live Canvas" 
                  onLoad={handleIframeLoad}
                />
              </div>
            )
          ) : activeTab === "html" ? (
            /* HTML Editor Panel */
            <div className="code-editor-box">
              <div className="code-box-header">
                <span>index.html</span>
                <span className="code-box-hint">Apply code changes to persist them.</span>
              </div>
              <textarea 
                className="code-textarea"
                value={htmlContent}
                onChange={(e) => setHtmlContent(e.target.value)}
                disabled={working}
                spellCheck={false}
              />
            </div>
          ) : (
            /* CSS Editor Panel */
            <div className="code-editor-box">
              <div className="code-box-header">
                <span>styles.css</span>
                <span className="code-box-hint">Apply code changes to persist them.</span>
              </div>
              <textarea 
                className="code-textarea"
                value={cssContent}
                onChange={(e) => setCssContent(e.target.value)}
                disabled={working}
                spellCheck={false}
              />
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
