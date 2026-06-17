import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { toPng } from "html-to-image";
import JSZip from "jszip";
import { saveAs } from "file-saver";
import {
  Download,
  FileImage,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  PanelRight,
  Upload,
  Wand2
} from "lucide-react";
import "./styles.css";

type Theme = "reading" | "pro";

type Block =
  | { type: "h1" | "h2" | "h3"; text: string }
  | { type: "p"; text: string }
  | { type: "quote"; text: string }
  | { type: "ul"; items: string[] }
  | { type: "image"; src: string; caption: string }
  | { type: "code"; lang: string; code: string }
  | { type: "pagebreak" };

type PageModel = {
  kind: "cover" | "content";
  blocks: Block[];
};

type UploadedImage = {
  id: string;
  name: string;
  url: string;
};

type CoverImageSettings = {
  frameHeight: number;
  scale: number;
  x: number;
  y: number;
};

type CoverDragState =
  | { type: "image"; startX: number; startY: number; initialX: number; initialY: number; previewScale: number }
  | { type: "frame"; startY: number; initialHeight: number; previewScale: number };

const sampleImageSrc = "sample/claude-fable-cover.png";

const sampleMarkdown = `自从Claude Fable 5被封禁后，用户的狂欢也跟着一泻千里。

但不乏也有大牛跃跃欲试，想把它重新找回来。

于是就有了最近大家看到的相关消息：**Claude Fable 5又“活”了！**

可以说，国外那个家伙太疯了，他直接抓取了Anthropic发布的Fable 5的系统提示词，并将其加载到Opus 4.8之上的Claude code中。紧接着，我们就看到的就有关Claude Fable 5“复活”的帖子信息。

![](${sampleImageSrc})

我的理解，**这是不甘心的力量！**

下面是我整理的一个“复活”大法，已经有很多人开始尝试了，**只需四步**：

\`\`\`Markdown
1. 下载 Fable 5的系统提示词https://github.com/elder-plinius/CL4R1T4S/blob/main/ANTHROPIC/CLAUDE-FABLE-5.md
2. 放到你Claude code 项目文件夹
3. 使用启动命令（claude --dangerously-skip-permissions --system-prompt-file CLAUDE-FABLE-5.md）
4. 模型切换到 opus 4.8 Max
\`\`\`

只需要这4步，你会发现那个熟悉的Fable 5 又回来了！

**原汁原味不要想了，但力气还是在的。**`;

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function inlineMarkdown(text: string) {
  const escaped = text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return escaped
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, "<code>$1</code>");
}

function highlightCode(code: string) {
  return code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .split("\n")
    .map((line) => {
      let html = line
        .replace(/(".*?"|'.*?')/g, '<span class="token-green">$1</span>')
        .replace(/(^|\s)(--[\w-]+)/g, '$1<span class="token-green">$2</span>')
        .replace(/(^|\s)(\/[^\s]+)/g, '$1<span class="token-green">$2</span>')
        .replace(/^(\s*)([A-Za-z_][\w.-]*)(?=\s|$)/, '$1<span class="token-red">$2</span>');
      if (!html.trim()) html = "&nbsp;";
      return `<span class="code-line">${html}</span>`;
    })
    .join("");
}

function parseMarkdown(input: string): Block[] {
  const blocks: Block[] = [];
  const lines = input.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];
  let listItems: string[] = [];
  let codeLines: string[] = [];
  let inCode = false;
  let codeLang = "";

  const flushParagraph = () => {
    if (!paragraph.length) return;
    const text = paragraph.join(" ").trim();
    if (text) blocks.push({ type: "p", text });
    paragraph = [];
  };

  const flushList = () => {
    if (!listItems.length) return;
    blocks.push({ type: "ul", items: listItems });
    listItems = [];
  };

  const flushCode = () => {
    blocks.push({ type: "code", lang: codeLang || "Code", code: codeLines.join("\n") });
    codeLines = [];
    codeLang = "";
    inCode = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    const fence = line.match(/^```([\w.+-]*)\s*$/);
    if (fence) {
      if (inCode) {
        flushCode();
      } else {
        flushParagraph();
        flushList();
        inCode = true;
        codeLang = fence[1];
      }
      continue;
    }

    if (inCode) {
      codeLines.push(rawLine);
      continue;
    }

    if (!line) {
      flushParagraph();
      flushList();
      continue;
    }

    if (line === "---page---" || line === "<!-- page -->" || line === "<!-- pagebreak -->") {
      flushParagraph();
      flushList();
      blocks.push({ type: "pagebreak" });
      continue;
    }

    const image = line.match(/^!\[([^\]]*)\]\(([^)]+)\)$/);
    if (image) {
      flushParagraph();
      flushList();
      blocks.push({ type: "image", caption: image[1], src: image[2] });
      continue;
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/);
    if (heading) {
      flushParagraph();
      flushList();
      blocks.push({ type: `h${heading[1].length}` as "h1" | "h2" | "h3", text: heading[2] });
      continue;
    }

    if (line.startsWith(">")) {
      flushParagraph();
      flushList();
      blocks.push({ type: "quote", text: line.replace(/^>\s?/, "") });
      continue;
    }

    const list = line.match(/^[-*]\s+(.+)$/);
    if (list) {
      flushParagraph();
      listItems.push(list[1]);
      continue;
    }

    paragraph.push(line);
  }

  if (inCode) flushCode();
  flushParagraph();
  flushList();
  return blocks;
}

function blockWeight(block: Block) {
  if (block.type === "pagebreak") return 9999;
  if (block.type === "image") return block.caption ? 5.25 : 4.2;
  if (block.type === "code") return 2.45 + Math.max(1, block.code.split("\n").length) * 1.12;
  if (block.type === "ul") return 1.45 + block.items.length * 1.05;
  if (block.type === "quote") return 2.15;
  if (block.type === "h1") return 3;
  if (block.type === "h2") return 2.65;
  if (block.type === "h3") return 2.25;
  return 1.05 + Math.ceil(block.text.length / 54) * 0.92;
}

function paginate(blocks: Block[]) {
  const pages: PageModel[] = [];
  let current: Block[] = [];
  let weight = 0;
  let endedWithPagebreak = false;
  const maxWeight = 30.5;

  blocks.forEach((block) => {
    if (block.type === "pagebreak") {
      if (current.length) pages.push({ kind: "content", blocks: current });
      current = [];
      weight = 0;
      endedWithPagebreak = true;
      return;
    }

    endedWithPagebreak = false;
    const nextWeight = blockWeight(block);
    if (current.length && weight + nextWeight > maxWeight) {
      pages.push({ kind: "content", blocks: current });
      current = [block];
      weight = nextWeight;
      return;
    }
    current.push(block);
    weight += nextWeight;
  });

  if (current.length) pages.push({ kind: "content", blocks: current });
  if (endedWithPagebreak) pages.push({ kind: "content", blocks: [] });
  return pages;
}

function App() {
  const [theme, setTheme] = useState<Theme>("pro");
  const [coverTitle, setCoverTitle] = useState("**只要一行代码！**\n3秒钟复活最强AI模型\n**Claude Fable 5！**");
  const [author, setAuthor] = useState("作者：AI交付局");
  const [coverUrl, setCoverUrl] = useState<string>(sampleImageSrc);
  const [coverImage, setCoverImage] = useState<CoverImageSettings>({
    frameHeight: 640,
    scale: 1,
    x: 0,
    y: 0
  });
  const [coverDrag, setCoverDrag] = useState<CoverDragState | null>(null);
  const [markdown, setMarkdown] = useState(sampleMarkdown);
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [selectedPage, setSelectedPage] = useState(0);
  const [isExporting, setIsExporting] = useState(false);
  const pageRefs = useRef<(HTMLElement | null)[]>([]);
  const imageInputRef = useRef<HTMLInputElement | null>(null);

  const blocks = useMemo(() => parseMarkdown(markdown), [markdown]);
  const contentPages = useMemo(() => paginate(blocks), [blocks]);
  const pages = useMemo<PageModel[]>(() => [{ kind: "cover", blocks: [] }, ...contentPages], [contentPages]);

  useEffect(() => {
    if (!coverDrag) return;

    const handlePointerMove = (event: PointerEvent) => {
      if (coverDrag.type === "image") {
        setCoverImage((current) => ({
          ...current,
          x: coverDrag.initialX + (event.clientX - coverDrag.startX) / coverDrag.previewScale,
          y: coverDrag.initialY + (event.clientY - coverDrag.startY) / coverDrag.previewScale
        }));
        return;
      }

      const nextHeight = Math.min(760, Math.max(360, coverDrag.initialHeight + (event.clientY - coverDrag.startY) / coverDrag.previewScale));
      setCoverImage((current) => ({
        ...current,
        frameHeight: Math.round(nextHeight)
      }));
    };
    const endDrag = () => setCoverDrag(null);

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
  }, [coverDrag]);

  const insertImages = async (files: FileList | null) => {
    if (!files?.length) return;
    const next = await Promise.all(
      Array.from(files).map(async (file) => ({
        id: crypto.randomUUID(),
        name: file.name,
        url: await fileToDataUrl(file)
      }))
    );
    setImages((current) => [...current, ...next]);
    setMarkdown((current) => `${current.trim()}\n\n${next.map((item) => `![](plog-image:${item.id})`).join("\n\n")}`);
  };

  const exportImages = async () => {
    setIsExporting(true);
    try {
      const zip = new JSZip();
      for (let index = 0; index < pages.length; index += 1) {
        const node = pageRefs.current[index];
        if (!node) continue;
        const dataUrl = await toPng(node, {
          cacheBust: true,
          pixelRatio: 1,
          width: 1080,
          height: 1440,
          style: {
            transform: "none",
            width: "1080px",
            height: "1440px"
          }
        });
        zip.file(`page-${String(index + 1).padStart(2, "0")}.png`, dataUrl.split(",")[1], { base64: true });
      }
      const blob = await zip.generateAsync({ type: "blob" });
      saveAs(blob, `plog-${theme}-${Date.now()}.zip`);
    } finally {
      setIsExporting(false);
    }
  };

  const selected = pages[Math.min(selectedPage, pages.length - 1)];
  const resolveImageSrc = (src: string) => {
    if (!src.startsWith("plog-image:")) return src;
    const id = src.replace("plog-image:", "");
    return images.find((image) => image.id === id)?.url || "";
  };
  const updateCoverImage = (patch: Partial<CoverImageSettings>) => {
    setCoverImage((current) => ({
      ...current,
      ...patch
    }));
  };
  const resetCoverImage = () => {
    setCoverImage({
      frameHeight: 640,
      scale: 1,
      x: 0,
      y: 0
    });
  };

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <LayoutTemplate size={21} />
          <span>AI 交付局图文 PLOG 生成器</span>
        </div>
        <div className="topbar-meta">
          <span>{pages.length} 页</span>
          <span>1080×1440</span>
        </div>
        <span className="style-label">风格</span>
        <div className="segmented" aria-label="风格">
          <button className={theme === "reading" ? "active" : ""} onClick={() => setTheme("reading")}>
            书面阅读感
          </button>
          <button className={theme === "pro" ? "active" : ""} onClick={() => setTheme("pro")}>
            专业黑金
          </button>
        </div>
        <button className="export-button" onClick={exportImages} disabled={isExporting}>
          {isExporting ? <Loader2 className="spin" size={18} /> : <Download size={18} />}
          下载全部
        </button>
      </header>

      <main className="workspace">
        <aside className="panel left-panel">
          <section>
            <div className="panel-title">
              <FileImage size={18} />
              <span>封面设置</span>
            </div>
            <label className="field-label" htmlFor="title">
              标题
            </label>
            <textarea id="title" className="title-input" value={coverTitle} onChange={(event) => setCoverTitle(event.target.value)} />
            <label className="field-label" htmlFor="author">
              作者
            </label>
            <input id="author" value={author} onChange={(event) => setAuthor(event.target.value)} />
            <label className="dropzone">
              <Upload size={19} />
              <span>{coverUrl ? "重新上传封面" : "上传封面"}</span>
              <input
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) fileToDataUrl(file).then(setCoverUrl);
                }}
              />
            </label>
            <div className="cover-controls">
              <div className="control-row">
                <label htmlFor="cover-scale">图片大小</label>
                <input
                  className="control-number"
                  aria-label="图片大小百分比"
                  type="number"
                  min="60"
                  max="220"
                  value={Math.round(coverImage.scale * 100)}
                  onChange={(event) => updateCoverImage({ scale: clampNumber(Number(event.target.value), 60, 220) / 100 })}
                />
              </div>
              <input
                id="cover-scale"
                type="range"
                min="60"
                max="220"
                value={Math.round(coverImage.scale * 100)}
                onChange={(event) => updateCoverImage({ scale: Number(event.target.value) / 100 })}
              />
              <div className="control-row">
                <label htmlFor="cover-height">图片框高度</label>
                <input
                  className="control-number"
                  aria-label="图片框高度数值"
                  type="number"
                  min="360"
                  max="760"
                  value={coverImage.frameHeight}
                  onChange={(event) => updateCoverImage({ frameHeight: clampNumber(Number(event.target.value), 360, 760) })}
                />
              </div>
              <input
                id="cover-height"
                type="range"
                min="360"
                max="760"
                value={coverImage.frameHeight}
                onChange={(event) => updateCoverImage({ frameHeight: Number(event.target.value) })}
              />
              <button className="secondary-button compact" onClick={resetCoverImage}>
                重置封面图
              </button>
            </div>
          </section>

          <section>
            <div className="panel-title">
              <ImagePlus size={18} />
              <span>正文图片</span>
            </div>
            <input ref={imageInputRef} hidden type="file" accept="image/*" multiple onChange={(event) => insertImages(event.target.files)} />
            <button className="secondary-button" onClick={() => imageInputRef.current?.click()}>
              <ImagePlus size={17} />
              插入图片
            </button>
            <div className="image-list">
              {images.length === 0 ? (
                <p>上传后会自动插入 Markdown 图片语法。</p>
              ) : (
                images.map((image) => (
                  <div className="image-row" key={image.id}>
                    <img src={image.url} alt="" />
                    <span>{image.name}</span>
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="export-status">
            <div className="panel-title">
              <Wand2 size={18} />
              <span>导出图片</span>
            </div>
            <p>实时预览会按 3:4 画幅生成页面，点击下载全部会导出 ZIP。</p>
          </section>
        </aside>

        <section className="editor-column">
          <div className="editor-head">
            <div>
              <span className="section-label">正文 Markdown</span>
              <h1>写内容，插图片，右侧自动排版</h1>
            </div>
            <div className="editor-actions">
              <span>字数：{markdown.length}</span>
              <button className="secondary-button compact" onClick={() => setMarkdown(sampleMarkdown)}>
                载入示例
              </button>
            </div>
          </div>
          <div className="markdown-toolbar" aria-label="Markdown 工具栏">
            <button onClick={() => setMarkdown((value) => `${value}**加粗文字**`)}>B</button>
            <button onClick={() => setMarkdown((value) => `${value}\n\n> 引用内容`)}>引用</button>
            <button onClick={() => setMarkdown((value) => `${value}\n\n- 列表项`)}>列表</button>
            <button onClick={() => setMarkdown((value) => `${value}\n\n\`\`\`bash\ncommand --flag value\n\`\`\``)}>代码</button>
            <button onClick={() => setMarkdown((value) => `${value.trim()}\n\n<!-- pagebreak -->\n\n`)}>强制分页</button>
            <button onClick={() => imageInputRef.current?.click()}>插入图片</button>
          </div>
          <textarea
            className="markdown-editor"
            value={markdown}
            onChange={(event) => setMarkdown(event.target.value)}
            spellCheck={false}
          />
        </section>

        <aside className="preview-column">
          <div className="preview-head">
            <div className="panel-title">
              <PanelRight size={18} />
              <span>实时预览</span>
            </div>
            <span>页面 {selectedPage + 1}/{pages.length}</span>
          </div>
          <div className="preview-stage">
            <div className="page-scale">
              <PlogPage
                refCallback={(node) => {
                  pageRefs.current[selectedPage] = node;
                }}
                page={selected}
                index={selectedPage}
                total={pages.length}
                theme={theme}
                coverTitle={coverTitle}
                author={author}
                coverUrl={coverUrl}
                coverImage={coverImage}
                coverDrag={coverDrag}
                setCoverDrag={setCoverDrag}
                setCoverImage={setCoverImage}
                interactiveCover={true}
                resolveImageSrc={resolveImageSrc}
              />
            </div>
          </div>
          <div className="thumbs">
            {pages.map((page, index) => (
              <button key={index} className={selectedPage === index ? "thumb active" : "thumb"} onClick={() => setSelectedPage(index)}>
                <div className="thumb-page">
                  <PlogPage
                    refCallback={(node) => {
                      pageRefs.current[index] = node;
                    }}
                    page={page}
                    index={index}
                    total={pages.length}
                    theme={theme}
                    coverTitle={coverTitle}
                    author={author}
                    coverUrl={coverUrl}
                    coverImage={coverImage}
                    resolveImageSrc={resolveImageSrc}
                  />
                </div>
                <span>{String(index + 1).padStart(2, "0")}</span>
              </button>
            ))}
          </div>
        </aside>
      </main>
    </div>
  );
}

function PlogPage({
  page,
  index,
  total,
  theme,
  coverTitle,
  author,
  coverUrl,
  coverImage,
  coverDrag,
  setCoverDrag,
  setCoverImage,
  interactiveCover = false,
  resolveImageSrc,
  refCallback
}: {
  page: PageModel;
  index: number;
  total: number;
  theme: Theme;
  coverTitle: string;
  author: string;
  coverUrl: string;
  coverImage: CoverImageSettings;
  coverDrag?: CoverDragState | null;
  setCoverDrag?: React.Dispatch<React.SetStateAction<CoverDragState | null>>;
  setCoverImage?: React.Dispatch<React.SetStateAction<CoverImageSettings>>;
  interactiveCover?: boolean;
  resolveImageSrc: (src: string) => string;
  refCallback?: (node: HTMLElement | null) => void;
}) {
  const getPreviewScale = (element: HTMLElement) => {
    const pageElement = element.closest(".plog-page");
    const pageWidth = pageElement?.getBoundingClientRect().width || 1080;
    return pageWidth / 1080;
  };
  const startCoverImageDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactiveCover || !coverUrl || !setCoverDrag) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCoverDrag({
      type: "image",
      startX: event.clientX,
      startY: event.clientY,
      initialX: coverImage.x,
      initialY: coverImage.y,
      previewScale: getPreviewScale(event.currentTarget)
    });
  };
  const startCoverFrameDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactiveCover || !setCoverDrag) return;
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    setCoverDrag({
      type: "frame",
      startY: event.clientY,
      initialHeight: coverImage.frameHeight,
      previewScale: getPreviewScale(event.currentTarget)
    });
  };
  const moveCoverDrag = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!interactiveCover || !coverDrag || !setCoverImage) return;
    if (coverDrag.type === "image") {
      setCoverImage((current) => ({
        ...current,
        x: coverDrag.initialX + (event.clientX - coverDrag.startX) / coverDrag.previewScale,
        y: coverDrag.initialY + (event.clientY - coverDrag.startY) / coverDrag.previewScale
      }));
      return;
    }
    const nextHeight = Math.min(760, Math.max(360, coverDrag.initialHeight + (event.clientY - coverDrag.startY) / coverDrag.previewScale));
    setCoverImage((current) => ({
      ...current,
      frameHeight: Math.round(nextHeight)
    }));
  };
  const endCoverDrag = () => {
    if (interactiveCover && setCoverDrag) setCoverDrag(null);
  };

  if (page.kind === "cover") {
    return (
      <section className={`plog-page cover-page theme-${theme}`} ref={refCallback}>
        <div className="cover-rule top" />
        <div className="cover-kicker">AIJIAOFUJU / PLOG</div>
        <h2 dangerouslySetInnerHTML={{ __html: inlineMarkdown(coverTitle).replace(/\n/g, "<br />") }} />
        <div
          className={interactiveCover ? "cover-media cover-media-editable" : "cover-media"}
          style={{ height: `${coverImage.frameHeight}px` }}
          onPointerDown={startCoverImageDrag}
          onPointerMove={moveCoverDrag}
          onPointerUp={endCoverDrag}
          onPointerCancel={endCoverDrag}
        >
          {coverUrl ? (
            <img
              src={coverUrl}
              alt=""
              draggable={false}
              style={{
                transform: `translate(${coverImage.x}px, ${coverImage.y}px) scale(${coverImage.scale})`
              }}
            />
          ) : (
            <div className="cover-placeholder">上传封面后显示在这里</div>
          )}
          {interactiveCover ? (
            <div
              className="cover-frame-handle"
              role="separator"
              aria-label="调整图片框高度"
              onPointerDown={startCoverFrameDrag}
              onPointerMove={moveCoverDrag}
              onPointerUp={endCoverDrag}
              onPointerCancel={endCoverDrag}
            />
          ) : null}
        </div>
        <div className="cover-rule bottom" />
        <div className="plog-author">{author}</div>
      </section>
    );
  }

  return (
    <section className={`plog-page content-page theme-${theme}`} ref={refCallback}>
      <article className="article-window">
        <div className="docbar">page-{String(index + 1).padStart(2, "0")}.md</div>
        <div className={articleContentClass(page.blocks)}>
          {page.blocks.map((block, blockIndex) => renderBlock(block, blockIndex, resolveImageSrc))}
        </div>
      </article>
      <div className="page-count">
        {index + 1}/{total}
      </div>
    </section>
  );
}

function articleContentClass(blocks: Block[]) {
  const hasImage = blocks.some((block) => block.type === "image");
  const nonImageBlocks = blocks.filter((block) => block.type !== "image");
  return [
    "article-content",
    hasImage ? "has-image" : "",
    hasImage && nonImageBlocks.length === 0 ? "image-only" : "",
    hasImage && nonImageBlocks.length > 0 ? "mixed-image" : ""
  ]
    .filter(Boolean)
    .join(" ");
}

function renderBlock(block: Block, index: number, resolveImageSrc: (src: string) => string) {
  if (block.type === "h1" || block.type === "h2" || block.type === "h3") {
    const Tag = block.type;
    return <Tag key={index} dangerouslySetInnerHTML={{ __html: inlineMarkdown(block.text) }} />;
  }
  if (block.type === "p") return <p key={index} dangerouslySetInnerHTML={{ __html: inlineMarkdown(block.text) }} />;
  if (block.type === "quote") return <blockquote key={index} dangerouslySetInnerHTML={{ __html: inlineMarkdown(block.text) }} />;
  if (block.type === "ul") {
    return (
      <ul key={index}>
        {block.items.map((item, itemIndex) => (
          <li key={itemIndex} dangerouslySetInnerHTML={{ __html: inlineMarkdown(item) }} />
        ))}
      </ul>
    );
  }
  if (block.type === "image") {
    const src = resolveImageSrc(block.src);
    return (
      <figure key={index}>
        {src ? <img src={src} alt={block.caption} /> : null}
        {block.caption ? <figcaption>{block.caption}</figcaption> : null}
      </figure>
    );
  }
  if (block.type === "code") {
    return (
      <pre className="plog-code" key={index}>
        <span className="code-title">{block.lang || "Code"}</span>
        <code dangerouslySetInnerHTML={{ __html: highlightCode(block.code) }} />
      </pre>
    );
  }
  return null;
}

type RootContainer = HTMLElement & {
  _plogRoot?: ReturnType<typeof createRoot>;
};

const rootContainer = document.getElementById("root")! as RootContainer;
rootContainer._plogRoot ??= createRoot(rootContainer);
rootContainer._plogRoot.render(<App />);
