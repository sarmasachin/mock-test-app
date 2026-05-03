import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { createPortal } from 'react-dom';
import ReactQuill from 'react-quill';
import Quill from 'quill';
import TableModule, { rewirteFormats } from 'quill1.3.7-table-module';
import 'react-quill/dist/quill.snow.css';
/* After Snow so toolbar/table overrides win; table module injects footer async — also hide via MutationObserver below. */
import '../styles/quill-table-module-admin.css';
import { useAdminDialog } from '../adminDialog';

const Font = Quill.import('formats/font') as { whitelist: (string | boolean)[] };
Font.whitelist = [false, 'serif', 'monospace'];
Quill.register(Font, true);

const Icons = Quill.import('ui/icons') as Record<string, string>;

const Keyboard = Quill.import('modules/keyboard') as { keys: { BACKSPACE: number } };

/** Quill Snow only paints toolbar buttons when `Icons[name]` is a non-empty SVG string; some bundler paths drop `video`. */
const QUILL_VIDEO_TOOLBAR_SVG =
  '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><rect class="ql-stroke" height="12" width="12" x="3" y="3" fill="none" stroke="currentColor"></rect><rect class="ql-fill" height="12" width="1" x="5" y="3" fill="currentColor"></rect><rect class="ql-fill" height="12" width="1" x="12" y="3" fill="currentColor"></rect><rect class="ql-fill" height="2" width="8" x="5" y="8" fill="currentColor"></rect><rect class="ql-fill" height="1" width="3" x="3" y="5" fill="currentColor"></rect><rect class="ql-fill" height="1" width="3" x="3" y="7" fill="currentColor"></rect><rect class="ql-fill" height="1" width="3" x="3" y="10" fill="currentColor"></rect><rect class="ql-fill" height="1" width="3" x="3" y="12" fill="currentColor"></rect><rect class="ql-fill" height="1" width="3" x="12" y="5" fill="currentColor"></rect><rect class="ql-fill" height="1" width="3" x="12" y="7" fill="currentColor"></rect><rect class="ql-fill" height="1" width="3" x="12" y="10" fill="currentColor"></rect><rect class="ql-fill" height="1" width="3" x="12" y="12" fill="currentColor"></rect></svg>';

function ensureQuillVideoToolbarIcon() {
  const v = Icons.video;
  if (typeof v !== 'string' || !v.toLowerCase().includes('<svg')) {
    Icons.video = QUILL_VIDEO_TOOLBAR_SVG;
  }
}

if (!Icons.undo) {
  Icons.undo =
    '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M7 3.5L2 8l5 4.5V9.2c2.5 0 4.5.3 6.2 2.3 1.1 1.3 1.8 3 2.3 4.7-.5-4.5-2.5-8-8.5-8.2V3.5z"/></svg>';
}
if (!Icons.redo) {
  Icons.redo =
    '<svg viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg"><path fill="currentColor" d="M11 3.5L16 8l-5 4.5V9.2c-6 .2-8 3.7-8.5 8.2.5-1.7 1.2-3.4 2.3-4.7 1.7-2 3.7-2.3 6.2-2.3V3.5z"/></svg>';
}

let articleQuillTableRegistered = false;
function registerArticleQuillTableOnce() {
  if (articleQuillTableRegistered) return;
  articleQuillTableRegistered = true;
  Quill.register({ [`modules/${TableModule.moduleName}`]: TableModule }, true);
  rewirteFormats();
}
registerArticleQuillTableOnce();
ensureQuillVideoToolbarIcon();

type Props = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  readOnly?: boolean;
  /** When set, body HTML is autosaved to localStorage and can be restored from the + panel. */
  persistenceKey?: string;
  /** Upload body images to the server; image toolbar opens a file picker instead of only URL. */
  uploadBodyImage?: (file: File) => Promise<string>;
};

function htmlToPlainText(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html || '<p></p>', 'text/html');
    return doc.body.textContent || '';
  } catch {
    return '';
  }
}

function draftStorageKey(persistenceKey: string) {
  return `article-body-draft:${persistenceKey}`;
}

/** Turn common social / host URLs into iframe-safe embed src (Quill video = iframe). */
function normalizeSocialVideoUrl(raw: string): string {
  const url = raw.trim();
  if (!url) return url;
  const lower = url.toLowerCase();
  if (lower.includes('youtube.com/embed/') || lower.includes('youtube-nocookie.com/embed/')) return url;
  if (lower.includes('player.vimeo.com/video/')) return url;

  let m = url.match(/(?:youtube\.com\/watch\?[^#]*v=|youtu\.be\/)([a-zA-Z0-9_-]{6,})/);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;

  m = url.match(/youtube\.com\/shorts\/([a-zA-Z0-9_-]+)/i);
  if (m) return `https://www.youtube.com/embed/${m[1]}`;

  m = url.match(/vimeo\.com\/(?:video\/)?(\d+)/i);
  if (m) return `https://player.vimeo.com/video/${m[1]}`;

  m = url.match(/dailymotion\.com\/(?:embed\/video\/|video\/)([a-zA-Z0-9]+)/i);
  if (m) return `https://www.dailymotion.com/embed/video/${m[1]}`;

  m = url.match(/(?:twitter\.com|x\.com)\/\w+\/status\/(\d+)/i);
  if (m) return `https://platform.twitter.com/embed/Tweet.html?id=${m[1]}`;

  if (/facebook\.com|fb\.watch/i.test(url)) {
    return `https://www.facebook.com/plugins/video.php?href=${encodeURIComponent(url)}&show_text=false&width=560`;
  }

  m = url.match(/instagram\.com\/(p|reel|tv)\/([\w-]+)/i);
  if (m) return `https://www.instagram.com/${m[1].toLowerCase()}/${m[2]}/embed`;

  return url;
}

/** First iframe `src` from embed HTML (YouTube/Vimeo paste, etc.). */
function extractIframeSrcFromHtml(html: string): string | null {
  const t = html.trim();
  if (!t) return null;
  const attr = t.match(/<iframe[^>]+src\s*=\s*["']([^"'>\s]+)["']/i);
  if (attr?.[1]) {
    const s = attr[1].trim();
    if (/^https?:\/\//i.test(s)) return s;
  }
  try {
    const doc = new DOMParser().parseFromString(t, 'text/html');
    const iframe = doc.querySelector('iframe[src]');
    const src = iframe?.getAttribute('src')?.trim();
    if (src && /^https?:\/\//i.test(src)) return src;
  } catch {
    /* ignore */
  }
  return null;
}

function isHttpUrl(s: string) {
  return /^https?:\/\//i.test(s.trim());
}

/** quill1.3.7-table-module instance (typed subset). */
type ArticleTableModule = {
  table?: HTMLTableElement | null;
  tableSelection?: { selectedTds?: unknown[] } | null;
  options?: { selection?: unknown };
  showTableTools?: (table: HTMLTableElement, quill: Quill, selectionOpts?: unknown) => void;
  appendRow?: (isDown?: boolean) => void;
  appendCol?: (isRight?: boolean) => void;
  removeRow?: () => void;
  removeCol?: () => void;
  removeTable?: () => void;
};

function getQlTableFromQuillIndex(quill: Quill, index: number): HTMLTableElement | null {
  try {
    const leaf = quill.getLeaf(index)[0] as { domNode?: Node } | undefined;
    if (!leaf?.domNode) return null;
    let n: Node | null = leaf.domNode;
    while (n && n !== quill.root) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as HTMLElement;
        if (el.tagName === 'TABLE' && el.classList.contains('ql-table')) return el as HTMLTableElement;
      }
      n = n.parentNode;
    }
  } catch {
    return null;
  }
  return null;
}

function getTdFromQuillIndex(quill: Quill, index: number): HTMLTableCellElement | null {
  try {
    const leaf = quill.getLeaf(index)[0] as { domNode?: Node } | undefined;
    if (!leaf?.domNode) return null;
    let n: Node | null = leaf.domNode;
    while (n && n !== quill.root) {
      if (n.nodeType === Node.ELEMENT_NODE) {
        const el = n as HTMLElement;
        if (el.tagName === 'TD' && el.closest('table.ql-table')) return el as HTMLTableCellElement;
      }
      n = n.parentNode;
    }
  } catch {
    return null;
  }
  return null;
}

function getQlTableFromDomSelection(quill: Quill): HTMLTableElement | null {
  if (typeof document === 'undefined') return null;
  const sel = document.getSelection();
  if (!sel?.anchorNode) return null;
  const start =
    sel.anchorNode.nodeType === Node.ELEMENT_NODE ? (sel.anchorNode as Element) : sel.anchorNode.parentElement;
  const table = start?.closest?.('table.ql-table');
  return table && quill.root.contains(table) ? (table as HTMLTableElement) : null;
}

function getTdFromDomSelection(quill: Quill): HTMLTableCellElement | null {
  if (typeof document === 'undefined') return null;
  const sel = document.getSelection();
  if (!sel?.anchorNode) return null;
  const start =
    sel.anchorNode.nodeType === Node.ELEMENT_NODE ? (sel.anchorNode as Element) : sel.anchorNode.parentElement;
  const td = start?.closest?.('td');
  if (!td || !(td instanceof HTMLTableCellElement) || !quill.root.contains(td)) return null;
  return td;
}

function getBlotIndexFromDomNode(editor: Quill, node: Node): number | null {
  try {
    const Parchment = Quill.import('parchment') as { find: (n: Node, bubble?: boolean) => unknown };
    const blot = Parchment.find(node, true);
    if (!blot) return null;
    return editor.getIndex(blot as never);
  } catch {
    return null;
  }
}

/** Ensure table module has selected cells so append/remove row & column APIs work. */
function primeArticleTableSelection(quill: Quill, index: number): ArticleTableModule | null {
  let table = getQlTableFromQuillIndex(quill, index);
  if (!table) table = getQlTableFromDomSelection(quill);
  if (!table) return null;
  const mod = quill.getModule('table') as ArticleTableModule;
  if (!mod?.showTableTools) return null;
  if (mod.table !== table) mod.showTableTools(table, quill, mod.options?.selection);
  let td = getTdFromQuillIndex(quill, index);
  if (!td) td = getTdFromDomSelection(quill);
  const nSel = mod.tableSelection?.selectedTds?.length ?? 0;
  if (nSel === 0 && td) {
    const r = td.getBoundingClientRect();
    const cx = r.left + Math.max(4, r.width / 2);
    const cy = r.top + Math.max(4, r.height / 2);
    td.dispatchEvent(
      new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window, button: 0, clientX: cx, clientY: cy }),
    );
    document.body.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true, view: window, button: 0 }));
  }
  return mod;
}

/** Quill `getBounds` shape (container-relative px). */
type QuillTooltipBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
};

type SnowTooltipInstance = {
  root: HTMLElement;
  boundsContainer: HTMLElement;
  position: (reference: QuillTooltipBounds) => unknown;
};

function patchQuillLinkTooltipAboveSelection(quill: Quill): () => void {
  const theme = (quill as Quill & { theme?: { tooltip?: SnowTooltipInstance } }).theme;
  const tooltip = theme?.tooltip;
  if (!tooltip || typeof tooltip.position !== 'function') {
    return () => {};
  }
  const t = tooltip as SnowTooltipInstance & { __articleLinkTipAbove?: boolean };
  if (t.__articleLinkTipAbove) {
    return () => {};
  }
  const original = tooltip.position.bind(tooltip) as (reference: QuillTooltipBounds) => unknown;
  const GAP = 6;
  t.__articleLinkTipAbove = true;
  tooltip.position = function (reference: QuillTooltipBounds) {
    const above: QuillTooltipBounds = { ...reference, bottom: reference.top - GAP };
    original(above);
    const rootBounds = tooltip.root.getBoundingClientRect();
    const clip = tooltip.boundsContainer.getBoundingClientRect();
    if (rootBounds.top < clip.top + 2) {
      original(reference);
    }
  };
  return () => {
    tooltip.position = original;
    delete t.__articleLinkTipAbove;
  };
}

/** Hover names for Quill Snow toolbar (English labels; shown as native browser tooltip). */
function tooltipForToolbarButton(btn: HTMLButtonElement): string {
  const val = btn.getAttribute('value');
  if (btn.classList.contains('ql-bold')) return 'Bold';
  if (btn.classList.contains('ql-italic')) return 'Italic';
  if (btn.classList.contains('ql-underline')) return 'Underline';
  if (btn.classList.contains('ql-strike')) return 'Strikethrough';
  if (btn.classList.contains('ql-link')) return 'Insert / edit link';
  if (btn.classList.contains('ql-image')) return 'Insert image (upload or URL)';
  if (btn.classList.contains('ql-video')) return 'Insert video / social embed (URL or HTML — preview in dialog)';
  if (btn.classList.contains('ql-table'))
    return 'Insert table — click, then choose size. Table is inserted where the text cursor is (not “in the middle” by mistake). Use + on the table for rows/columns.';
  if (btn.classList.contains('ql-clean')) return 'Remove formatting';
  if (btn.classList.contains('ql-blockquote')) return 'Blockquote';
  if (btn.classList.contains('ql-code-block')) return 'Code block';
  if (btn.classList.contains('ql-undo')) return 'Undo';
  if (btn.classList.contains('ql-redo')) return 'Redo';
  if (btn.classList.contains('ql-list')) {
    if (val === 'ordered') return 'Numbered list';
    if (val === 'bullet') return 'Bullet list';
  }
  if (btn.classList.contains('ql-indent')) {
    if (val === '-1') return 'Decrease indent';
    if (val === '+1') return 'Increase indent';
  }
  if (btn.classList.contains('ql-script')) {
    if (val === 'sub') return 'Subscript';
    if (val === 'super') return 'Superscript';
  }
  if (btn.classList.contains('ql-direction')) {
    if (val === 'rtl') return 'Right‑to‑left (RTL)';
  }
  return '';
}

function tooltipForPicker(picker: Element): string {
  if (picker.classList.contains('ql-table'))
    return 'Insert table — click, choose size. Inserts at the text cursor. + on table: rows/columns.';
  if (picker.classList.contains('ql-header')) return 'Heading level';
  if (picker.classList.contains('ql-color')) return 'Text color';
  if (picker.classList.contains('ql-background')) return 'Highlight / background color';
  if (picker.classList.contains('ql-align')) return 'Text alignment';
  if (picker.classList.contains('ql-font')) return 'Font family';
  if (picker.classList.contains('ql-size')) return 'Font size';
  if (picker.classList.contains('ql-direction')) return 'Text direction';
  return '';
}

/** Table module appends this row async; hide so only the size grid shows. */
function hideTableInsertCustomFooter(root: HTMLElement | null) {
  if (!root) return;
  root.querySelectorAll('.create_select_custom').forEach((node) => {
    const el = node as HTMLElement;
    el.hidden = true;
    el.setAttribute('aria-hidden', 'true');
    el.style.setProperty('display', 'none', 'important');
    el.style.setProperty('height', '0', 'important');
    el.style.setProperty('min-height', '0', 'important');
    el.style.setProperty('overflow', 'hidden', 'important');
    el.style.setProperty('padding', '0', 'important');
    el.style.setProperty('margin', '0', 'important');
    el.style.setProperty('border', '0', 'important');
    el.style.setProperty('font-size', '0', 'important');
    el.style.setProperty('line-height', '0', 'important');
    el.style.setProperty('pointer-events', 'none', 'important');
  });
}

function applyQuillToolbarTooltips(root: HTMLElement) {
  const toolbar = root.querySelector('.ql-toolbar');
  if (!toolbar) return;

  const setHint = (el: Element, text: string) => {
    if (!text) return;
    el.setAttribute('title', text);
    el.setAttribute('aria-label', text);
  };

  toolbar.querySelectorAll('button').forEach((node) => {
    const btn = node as HTMLButtonElement;
    const tip = tooltipForToolbarButton(btn);
    if (tip) setHint(btn, tip);
  });

  toolbar.querySelectorAll('span.ql-picker').forEach((picker) => {
    const tip = tooltipForPicker(picker);
    if (tip) setHint(picker, tip);
  });
}

/** Rich HTML editor for article body (stored as HTML string; app renders with HtmlCompat). */
export function ArticleBodyEditor({
  value,
  onChange,
  placeholder,
  readOnly,
  persistenceKey,
  uploadBodyImage,
}: Props) {
  const { confirm: adminConfirm, prompt: adminPrompt } = useAdminDialog();
  const wrapRef = useRef<HTMLDivElement>(null);
  const advPanelRef = useRef<HTMLDivElement>(null);
  const quillRef = useRef<ReactQuill | null>(null);
  const uploadRef = useRef(uploadBodyImage);
  uploadRef.current = uploadBodyImage;

  const initialValueRef = useRef(value);
  const boundsDomId = useId().replace(/:/g, '');
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [bodyImageUploading, setBodyImageUploading] = useState(false);
  const [videoEmbedOpen, setVideoEmbedOpen] = useState(false);
  const [videoEmbedMode, setVideoEmbedMode] = useState<'url' | 'html'>('url');
  const [videoUrlDraft, setVideoUrlDraft] = useState('');
  const [videoHtmlDraft, setVideoHtmlDraft] = useState('');
  const [videoEmbedMsg, setVideoEmbedMsg] = useState('');
  const embedTargetQuillRef = useRef<Quill | null>(null);
  const videoModalUrlInputRef = useRef<HTMLInputElement | null>(null);
  const videoModalHtmlRef = useRef<HTMLTextAreaElement | null>(null);
  const tableToolsWrapRef = useRef<HTMLDivElement | null>(null);
  const [tableToolsFab, setTableToolsFab] = useState<{ top: number; left: number } | null>(null);
  const [tableToolsMenuOpen, setTableToolsMenuOpen] = useState(false);
  const openVideoModalHandlerRef = useRef<(quill: Quill) => void>(() => {});
  openVideoModalHandlerRef.current = (quill: Quill) => {
    embedTargetQuillRef.current = quill;
    setVideoUrlDraft('');
    setVideoHtmlDraft('');
    setVideoEmbedMsg('');
    setVideoEmbedMode('url');
    setVideoEmbedOpen(true);
  };

  const plain = useMemo(() => htmlToPlainText(value), [value]);
  const wordCount = useMemo(() => {
    const t = plain.trim();
    if (!t) return 0;
    return t.split(/\s+/).length;
  }, [plain]);
  const charCount = plain.length;

  const runTableToolLayout = useCallback(() => {
    if (readOnly) {
      setTableToolsFab(null);
      setTableToolsMenuOpen(false);
      return;
    }
    const editor = quillRef.current?.getEditor?.() as Quill | undefined;
    if (!editor?.root) {
      setTableToolsFab(null);
      return;
    }
    const range = editor.getSelection();
    let tableEl: HTMLTableElement | null = null;
    if (range) {
      tableEl = getQlTableFromQuillIndex(editor, range.index);
    }
    if (!tableEl) {
      tableEl = getQlTableFromDomSelection(editor);
    }
    if (!tableEl || !editor.root.contains(tableEl)) {
      setTableToolsFab(null);
      setTableToolsMenuOpen(false);
      return;
    }
    const tableWrap = tableEl.closest('.ql-table-wrapper') as HTMLElement | null;
    const anchorEl = tableWrap ?? tableEl;
    const rect = anchorEl.getBoundingClientRect();
    const gap = 8;
    setTableToolsFab({
      top: rect.bottom + gap,
      left: rect.left + rect.width / 2,
    });
  }, [readOnly]);

  const runTableStructureOp = useCallback(
    (fn: (m: ArticleTableModule) => void) => {
      const editor = quillRef.current?.getEditor?.() as Quill | undefined;
      if (!editor) return;
      const range = editor.getSelection(true) ?? editor.getSelection();
      let index = range?.index ?? null;
      if (index == null) {
        const td = getTdFromDomSelection(editor);
        if (td) {
          const resolved = getBlotIndexFromDomNode(editor, td);
          if (resolved != null) index = resolved;
        }
      }
      if (index == null) return;
      const mod = primeArticleTableSelection(editor, index);
      if (!mod) return;
      if (!(mod.tableSelection?.selectedTds?.length ?? 0)) return;
      try {
        fn(mod);
      } catch {
        /* quill-table-module */
      }
      requestAnimationFrame(() => {
        editor.focus();
        runTableToolLayout();
      });
    },
    [runTableToolLayout],
  );

  const insertImageAtSelection = useCallback((quill: Quill, url: string) => {
    const range = quill.getSelection(true);
    const idx = range ? range.index : Math.max(0, quill.getLength() - 1);
    quill.insertEmbed(idx, 'image', url, 'user');
    quill.setSelection(idx + 1, 0, 'silent');
  }, []);

  const insertVideoAtSelection = useCallback((quill: Quill, embedSrc: string) => {
    const range = quill.getSelection(true);
    const idx = range ? range.index : Math.max(0, quill.getLength() - 1);
    quill.insertEmbed(idx, 'video', embedSrc, 'user');
    quill.setSelection(idx + 1, 0, 'silent');
  }, []);

  const urlPreviewSrc = useMemo(() => {
    const u = videoUrlDraft.trim();
    if (!u) return '';
    if (!isHttpUrl(u)) return '';
    try {
      return normalizeSocialVideoUrl(u);
    } catch {
      return u;
    }
  }, [videoUrlDraft]);

  const htmlPreviewInfo = useMemo(() => {
    const h = videoHtmlDraft.trim();
    if (!h) return { kind: 'empty' as const };
    const iframeSrc = extractIframeSrcFromHtml(h);
    if (iframeSrc) {
      try {
        return { kind: 'video' as const, src: normalizeSocialVideoUrl(iframeSrc) };
      } catch {
        return { kind: 'video' as const, src: iframeSrc };
      }
    }
    return { kind: 'raw' as const, html: h };
  }, [videoHtmlDraft]);

  const insertHtmlAtSelection = useCallback((quill: Quill, html: string) => {
    const range = quill.getSelection(true);
    const idx = range ? range.index : Math.max(0, quill.getLength() - 1);
    const lenBefore = quill.getLength();
    const clip = quill.clipboard as { dangerouslyPasteHTML: (index: number, deltaHtml: string, source?: string) => void };
    clip.dangerouslyPasteHTML(idx, html, 'user');
    const inserted = Math.max(1, quill.getLength() - lenBefore);
    const next = Math.min(idx + inserted, Math.max(0, quill.getLength() - 1));
    quill.setSelection(next, 0, 'silent');
  }, []);

  const commitVideoEmbed = useCallback(() => {
    const quill = embedTargetQuillRef.current;
    if (!quill) {
      setVideoEmbedMsg('Editor not ready. Try again.');
      return;
    }
    if (videoEmbedMode === 'url') {
      const u = videoUrlDraft.trim();
      if (!u) {
        setVideoEmbedMsg('Paste a video or post URL.');
        return;
      }
      if (!isHttpUrl(u)) {
        setVideoEmbedMsg('URL must start with http:// or https://');
        return;
      }
      insertVideoAtSelection(quill, normalizeSocialVideoUrl(u));
    } else {
      const html = videoHtmlDraft.trim();
      if (!html) {
        setVideoEmbedMsg('Paste the embed HTML from YouTube / Instagram / etc.');
        return;
      }
      const iframeSrc = extractIframeSrcFromHtml(html);
      if (iframeSrc) {
        insertVideoAtSelection(quill, normalizeSocialVideoUrl(iframeSrc));
      } else if (isHttpUrl(html) && !/<[a-z]/i.test(html)) {
        insertVideoAtSelection(quill, normalizeSocialVideoUrl(html.trim()));
      } else {
        insertHtmlAtSelection(quill, html);
      }
    }
    setVideoEmbedOpen(false);
    setVideoEmbedMsg('');
  }, [insertHtmlAtSelection, insertVideoAtSelection, videoEmbedMode, videoHtmlDraft, videoUrlDraft]);

  const modules = useMemo(
    () => ({
      toolbar: {
        container: [
          [{ font: [false, 'serif', 'monospace'] }],
          [{ size: ['small', false, 'large', 'huge'] }],
          [{ header: [1, 2, 3, false] }],
          ['bold', 'italic', 'underline', 'strike'],
          [{ color: [] }, { background: [] }],
          [{ script: 'sub' }, { script: 'super' }],
          [{ list: 'ordered' }, { list: 'bullet' }],
          [{ indent: '-1' }, { indent: '+1' }],
          [{ align: [] }],
          [{ direction: 'rtl' }],
          ['blockquote', 'code-block'],
          ['link', 'image', 'video', 'table'],
          ['clean'],
          ['undo', 'redo'],
        ],
        handlers: {
          link(this: { quill: Quill }, value: boolean) {
            if (value) {
              const range = this.quill.getSelection();
              if (range == null || range.length === 0) return;
              const theme = (this.quill as Quill & { theme?: { tooltip?: { edit: (mode: string, preview?: string | null) => void } } })
                .theme;
              theme?.tooltip?.edit('link', '');
            } else {
              this.quill.format('link', false, 'user');
            }
          },
          undo(this: { quill: Quill }) {
            (this.quill as Quill & { history: { undo: () => void } }).history.undo();
          },
          redo(this: { quill: Quill }) {
            (this.quill as Quill & { history: { redo: () => void } }).history.redo();
          },
          image(this: { quill: Quill }) {
            const quill = this.quill;
            const upl = uploadRef.current;
            if (upl) {
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'image/jpeg,image/png,image/webp';
              input.onchange = async () => {
                const f = input.files?.[0];
                input.value = '';
                if (!f) return;
                try {
                  setBodyImageUploading(true);
                  const url = await upl(f);
                  insertImageAtSelection(quill, url);
                } catch {
                  /* toast handled in parent */
                } finally {
                  setBodyImageUploading(false);
                }
              };
              input.click();
              return;
            }
            void adminPrompt({
              title: 'Image URL',
              description: 'Paste a direct HTTPS link to an image file.',
              defaultValue: 'https://',
              placeholder: 'https://…',
              confirmLabel: 'Insert',
              cancelLabel: 'Cancel',
            }).then((url) => {
              if (url?.trim()) insertImageAtSelection(quill, url.trim());
            });
          },
          video(this: { quill: Quill }) {
            openVideoModalHandlerRef.current(this.quill);
          },
        },
      },
      history: { delay: 500, maxStack: 200, userOnly: true },
      keyboard: {
        bindings: {
          /** Empty blockquote line + Backspace: Quill default `handleBackspace` can no-op at doc start and still swallow the key. */
          'blockquote backspace': {
            key: Keyboard.keys.BACKSPACE,
            metaKey: null,
            ctrlKey: null,
            altKey: null,
            shiftKey: null,
            collapsed: true,
            format: ['blockquote'],
            offset: 0,
            empty: true,
            handler(this: { quill: Quill }) {
              this.quill.format('blockquote', false, 'user');
              return false;
            },
          },
        },
      },
      clipboard: { matchVisual: false },
      [TableModule.moduleName]: {
        fullWidth: false,
        dragResize: true,
      },
    }),
    [insertImageAtSelection, adminPrompt],
  );

  const formats = [
    'font',
    'size',
    'header',
    'bold',
    'italic',
    'underline',
    'strike',
    'color',
    'background',
    'script',
    'list',
    'bullet',
    'indent',
    'align',
    'direction',
    'blockquote',
    'code-block',
    'link',
    'image',
    'video',
    'contain',
    'tableWrapper',
    'table',
    'colgroup',
    'col',
    'tbody',
    'tr',
    'td',
    'tableCellInner',
  ];

  useLayoutEffect(() => {
    if (readOnly) return;
    const root = wrapRef.current;
    if (!root) return;

    let cancelled = false;
    const run = () => {
      if (cancelled || !wrapRef.current) return;
      const tb = wrapRef.current.querySelector('.ql-toolbar');
      if (!tb) {
        requestAnimationFrame(run);
        return;
      }
      applyQuillToolbarTooltips(wrapRef.current);
      hideTableInsertCustomFooter(wrapRef.current);
      ensureQuillVideoToolbarIcon();
      const videoBtn = wrapRef.current.querySelector('button.ql-video') as HTMLButtonElement | null;
      if (videoBtn && !videoBtn.innerHTML.trim()) {
        videoBtn.innerHTML = QUILL_VIDEO_TOOLBAR_SVG;
      }
    };

    requestAnimationFrame(run);
    const t = window.setTimeout(run, 0);
    const t2 = window.setTimeout(run, 400);

    const mo = new MutationObserver(() => {
      if (!cancelled) hideTableInsertCustomFooter(wrapRef.current);
    });
    mo.observe(root, { childList: true, subtree: true });
    hideTableInsertCustomFooter(root);

    return () => {
      cancelled = true;
      window.clearTimeout(t);
      window.clearTimeout(t2);
      mo.disconnect();
    };
  }, [readOnly]);

  useEffect(() => {
    if (!persistenceKey || readOnly) return;
    const handle = window.setTimeout(() => {
      try {
        localStorage.setItem(draftStorageKey(persistenceKey), value);
      } catch {
        /* quota */
      }
    }, 800);
    return () => window.clearTimeout(handle);
  }, [value, persistenceKey, readOnly]);

  useEffect(() => {
    if (readOnly) return;
    const dirty = value !== initialValueRef.current;
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [value, readOnly]);

  useEffect(() => {
    if (!fullscreen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setFullscreen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [fullscreen]);

  useEffect(() => {
    if (!videoEmbedOpen || readOnly) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const raf = window.requestAnimationFrame(() => {
      if (videoEmbedMode === 'url') {
        videoModalUrlInputRef.current?.focus();
      } else {
        videoModalHtmlRef.current?.focus();
      }
    });
    return () => {
      document.body.style.overflow = prevOverflow;
      window.cancelAnimationFrame(raf);
    };
  }, [videoEmbedOpen, readOnly, videoEmbedMode]);

  useEffect(() => {
    if (!videoEmbedOpen || readOnly) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setVideoEmbedOpen(false);
      setVideoEmbedMsg('');
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [videoEmbedOpen, readOnly]);

  useEffect(() => {
    if (readOnly) {
      setTableToolsFab(null);
      setTableToolsMenuOpen(false);
      return;
    }
    let cancelled = false;
    let detach: (() => void) | undefined;
    let spinRaf = 0;
    const spin = () => {
      if (cancelled) return;
      const editor = quillRef.current?.getEditor?.() as Quill | undefined;
      if (!editor?.root) {
        spinRaf = requestAnimationFrame(spin);
        return;
      }
      const onLayout = () => {
        if (!cancelled) requestAnimationFrame(() => runTableToolLayout());
      };
      editor.on('selection-change', onLayout);
      editor.on('text-change', onLayout);
      editor.root.addEventListener('mouseup', onLayout, true);
      const scrollHost = editor.root.closest('.ql-container') as HTMLElement | null;
      scrollHost?.addEventListener('scroll', onLayout, { passive: true });
      window.addEventListener('scroll', onLayout, true);
      onLayout();
      detach = () => {
        editor.off('selection-change', onLayout);
        editor.off('text-change', onLayout);
        editor.root.removeEventListener('mouseup', onLayout, true);
        scrollHost?.removeEventListener('scroll', onLayout);
        window.removeEventListener('scroll', onLayout, true);
      };
    };
    spinRaf = requestAnimationFrame(spin);
    return () => {
      cancelled = true;
      cancelAnimationFrame(spinRaf);
      detach?.();
    };
  }, [readOnly, runTableToolLayout, value, fullscreen]);

  useEffect(() => {
    if (!readOnly) requestAnimationFrame(() => runTableToolLayout());
  }, [fullscreen, readOnly, runTableToolLayout]);

  useEffect(() => {
    if (!tableToolsMenuOpen) return;
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (tableToolsWrapRef.current?.contains(t)) return;
      setTableToolsMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc, true);
    return () => document.removeEventListener('mousedown', onDoc, true);
  }, [tableToolsMenuOpen]);

  useEffect(() => {
    if (!tableToolsMenuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      e.stopPropagation();
      setTableToolsMenuOpen(false);
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tableToolsMenuOpen]);

  useEffect(() => {
    if (readOnly) return;
    let cancelled = false;
    let raf = 0;
    let undoTooltipPatch: (() => void) | undefined;
    const tableUiCleanups: Array<() => void> = [];
    const tryAttach = () => {
      if (cancelled) return;
      const inst = quillRef.current;
      const editor = inst?.getEditor?.() as Quill | undefined;
      if (!editor) {
        raf = requestAnimationFrame(tryAttach);
        return;
      }
      if (cancelled) return;
      const clipboard = editor.getModule('clipboard') as {
        addMatcher: (selector: number, cb: (node: Node, delta: unknown) => unknown) => void;
      };
      const Delta = Quill.import('delta') as new () => { insert: (a: unknown) => unknown };
      clipboard.addMatcher(Node.ELEMENT_NODE, (node, delta) => {
        const name = (node as HTMLElement).nodeName;
        if (name === 'META' || name === 'SCRIPT' || name === 'STYLE') {
          return new Delta();
        }
        return delta;
      });
      undoTooltipPatch = patchQuillLinkTooltipAboveSelection(editor);

      const toolbarEl = wrapRef.current?.querySelector('.ql-toolbar') as HTMLElement | null;
      /** Quill uses `button.ql-table` for the toolbar string "table" (not .ql-picker). */
      const tableCtrl =
        (toolbarEl?.querySelector('button.ql-table') as HTMLElement | null) ??
        (toolbarEl?.querySelector('.ql-picker.ql-table') as HTMLElement | null);

      const tableMod = editor.getModule('table') as { closeSelecte?: () => void } | undefined;

      const stripStaleTableGridInline = () => {
        const root = wrapRef.current;
        if (!root) return;
        for (const sel of ['button.ql-table .ql-custom-select', '.ql-picker.ql-table .ql-picker-options'] as const) {
          const el = root.querySelector(sel) as HTMLElement | null;
          if (!el) continue;
          ['position', 'top', 'left', 'right', 'bottom', 'z-index', 'max-width'].forEach((p) => el.style.removeProperty(p));
        }
      };

      const closeTableInsertUi = () => {
        tableMod?.closeSelecte?.();
        tableCtrl?.classList.remove('ql-expanded');
        tableCtrl?.removeAttribute('data-active');
        stripStaleTableGridInline();
      };

      closeTableInsertUi();

      const onDocPointerDown = (e: MouseEvent) => {
        const n = e.target as Node;
        if (tableCtrl?.contains(n)) return;
        closeTableInsertUi();
      };
      document.addEventListener('mousedown', onDocPointerDown, true);
      tableUiCleanups.push(() => document.removeEventListener('mousedown', onDocPointerDown, true));

      const onEditorPointerDown = () => {
        closeTableInsertUi();
      };
      editor.root.addEventListener('mousedown', onEditorPointerDown, true);
      tableUiCleanups.push(() => editor.root.removeEventListener('mousedown', onEditorPointerDown, true));

      const onDocKeyDown = (e: KeyboardEvent) => {
        if (e.key === 'Escape') closeTableInsertUi();
      };
      document.addEventListener('keydown', onDocKeyDown, true);
      tableUiCleanups.push(() => document.removeEventListener('keydown', onDocKeyDown, true));
    };
    raf = requestAnimationFrame(tryAttach);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
      undoTooltipPatch?.();
      tableUiCleanups.forEach((fn) => fn());
    };
  }, [readOnly]);

  const toggleAdvanced = useCallback(() => {
    setAdvancedOpen((o) => {
      const next = !o;
      if (next) {
        requestAnimationFrame(() => {
          advPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
        });
      }
      return next;
    });
  }, []);

  const loadDraft = useCallback(() => {
    if (!persistenceKey) return;
    let stored = '';
    try {
      stored = localStorage.getItem(draftStorageKey(persistenceKey)) || '';
    } catch {
      return;
    }
    if (!stored) return;
    void adminConfirm({
      title: 'Load saved draft?',
      message: 'Replace current editor content with the saved draft from this browser?',
      confirmLabel: 'Replace',
      cancelLabel: 'Cancel',
      variant: 'danger',
    }).then((ok) => {
      if (ok) onChange(stored);
    });
  }, [adminConfirm, onChange, persistenceKey]);

  const clearDraft = useCallback(() => {
    if (!persistenceKey) return;
    try {
      localStorage.removeItem(draftStorageKey(persistenceKey));
    } catch {
      /* ignore */
    }
  }, [persistenceKey]);

  const removeLinkFromSelection = useCallback(() => {
    const q = quillRef.current?.getEditor?.() as Quill | undefined;
    if (!q) return;
    const range = q.getSelection();
    if (!range) return;
    q.format('link', false, 'user');
  }, []);

  const videoEmbedModal =
    videoEmbedOpen && !readOnly ? (
      <div
        className="article-video-embed-overlay"
        role="presentation"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) {
            setVideoEmbedOpen(false);
            setVideoEmbedMsg('');
          }
        }}
      >
        <div
          className="article-video-embed-card"
          role="dialog"
          aria-modal="true"
          aria-labelledby="article-video-embed-title"
          onMouseDown={(e) => e.stopPropagation()}
        >
          <h2 id="article-video-embed-title" className="article-video-embed-title">
            Video / social embed
          </h2>
          <p className="article-video-embed-sub">
            Paste a public URL, or the site&apos;s embed HTML. Preview updates as you type; Insert adds it at the cursor.
          </p>
          <div className="article-video-embed-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={videoEmbedMode === 'url'}
              className={videoEmbedMode === 'url' ? 'article-video-embed-tab is-active' : 'article-video-embed-tab'}
              onClick={() => {
                setVideoEmbedMode('url');
                setVideoEmbedMsg('');
              }}
            >
              URL
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={videoEmbedMode === 'html'}
              className={videoEmbedMode === 'html' ? 'article-video-embed-tab is-active' : 'article-video-embed-tab'}
              onClick={() => {
                setVideoEmbedMode('html');
                setVideoEmbedMsg('');
              }}
            >
              HTML
            </button>
          </div>
          {videoEmbedMode === 'url' ? (
            <label className="article-video-embed-field">
              <span className="article-video-embed-label">Video or post URL</span>
              <input
                ref={videoModalUrlInputRef}
                type="url"
                autoComplete="off"
                placeholder="https://www.youtube.com/watch?v=…"
                value={videoUrlDraft}
                onChange={(e) => {
                  setVideoUrlDraft(e.target.value);
                  setVideoEmbedMsg('');
                }}
              />
            </label>
          ) : (
            <label className="article-video-embed-field">
              <span className="article-video-embed-label">Embed HTML (iframe blockquote, etc.)</span>
              <textarea
                ref={videoModalHtmlRef}
                rows={7}
                spellCheck={false}
                placeholder={'<iframe src="https://www.youtube.com/embed/…" …></iframe>'}
                value={videoHtmlDraft}
                onChange={(e) => {
                  setVideoHtmlDraft(e.target.value);
                  setVideoEmbedMsg('');
                }}
              />
            </label>
          )}
          <div className="article-video-embed-preview">
            <div className="article-video-embed-preview-head">Preview</div>
            <div className="article-video-embed-preview-frame">
              {videoEmbedMode === 'url' ? (
                urlPreviewSrc ? (
                  <iframe
                    title="Embed preview (URL)"
                    className="article-video-embed-iframe"
                    src={urlPreviewSrc}
                    sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                ) : (
                  <div className="article-video-embed-preview-placeholder">
                    Enter an <code>http://</code> or <code>https://</code> URL to see a live preview.
                  </div>
                )
              ) : htmlPreviewInfo.kind === 'empty' ? (
                <div className="article-video-embed-preview-placeholder">Paste embed HTML to preview.</div>
              ) : htmlPreviewInfo.kind === 'video' ? (
                <iframe
                  title="Embed preview (iframe src)"
                  className="article-video-embed-iframe"
                  src={htmlPreviewInfo.src}
                  sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox allow-presentation"
                  referrerPolicy="strict-origin-when-cross-origin"
                />
              ) : (
                <>
                  <iframe
                    title="HTML snippet preview"
                    className="article-video-embed-iframe article-video-embed-iframe-sandbox"
                    sandbox=""
                    srcDoc={htmlPreviewInfo.html}
                    referrerPolicy="no-referrer"
                  />
                  <p className="article-video-embed-preview-note">
                    Scripts are disabled in this preview for safety. The published article may look different if the embed
                    relies on JavaScript.
                  </p>
                </>
              )}
            </div>
          </div>
          {videoEmbedMsg ? <div className="article-video-embed-msg">{videoEmbedMsg}</div> : null}
          <div className="article-video-embed-actions">
            <button
              type="button"
              className="ghost"
              onClick={() => {
                setVideoEmbedOpen(false);
                setVideoEmbedMsg('');
              }}
            >
              Cancel
            </button>
            <button type="button" className="primary" onClick={commitVideoEmbed}>
              Insert
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const tableStructureTools =
    !readOnly && tableToolsFab ? (
      <div
        ref={tableToolsWrapRef}
        className="article-table-tools-wrap"
        style={{ top: tableToolsFab.top, left: tableToolsFab.left }}
      >
        <button
          type="button"
          className="article-table-tools-fab"
          title="Add or remove rows / columns"
          aria-label="Table rows and columns"
          aria-expanded={tableToolsMenuOpen}
          onMouseDown={(e) => e.preventDefault()}
          onClick={(e) => {
            e.stopPropagation();
            setTableToolsMenuOpen((o) => {
              const next = !o;
              if (next) {
                const editor = quillRef.current?.getEditor?.() as Quill | undefined;
                if (editor) {
                  const range = editor.getSelection(true) ?? editor.getSelection();
                  let idx = range?.index ?? null;
                  if (idx == null) {
                    const td = getTdFromDomSelection(editor);
                    if (td) {
                      const resolved = getBlotIndexFromDomNode(editor, td);
                      if (resolved != null) idx = resolved;
                    }
                  }
                  if (idx != null) primeArticleTableSelection(editor, idx);
                }
              }
              return next;
            });
          }}
        >
          +
        </button>
        {tableToolsMenuOpen ? (
          <div className="article-table-tools-menu" role="menu" onMouseDown={(e) => e.preventDefault()}>
            <div className="article-table-tools-menu-hint">Applies to the cell where the cursor is</div>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                runTableStructureOp((m) => m.appendRow?.());
                setTableToolsMenuOpen(false);
              }}
            >
              Insert row above
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                runTableStructureOp((m) => m.appendRow?.(true));
                setTableToolsMenuOpen(false);
              }}
            >
              Insert row below
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                runTableStructureOp((m) => m.appendCol?.());
                setTableToolsMenuOpen(false);
              }}
            >
              Insert column left
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                runTableStructureOp((m) => m.appendCol?.(true));
                setTableToolsMenuOpen(false);
              }}
            >
              Insert column right
            </button>
            <div className="article-table-tools-menu-div" />
            <button
              type="button"
              role="menuitem"
              className="article-table-tools-menu-danger"
              onClick={() => {
                runTableStructureOp((m) => m.removeRow?.());
                setTableToolsMenuOpen(false);
              }}
            >
              Delete row
            </button>
            <button
              type="button"
              role="menuitem"
              className="article-table-tools-menu-danger"
              onClick={() => {
                runTableStructureOp((m) => m.removeCol?.());
                setTableToolsMenuOpen(false);
              }}
            >
              Delete column
            </button>
            <button
              type="button"
              role="menuitem"
              className="article-table-tools-menu-danger"
              onClick={() => {
                void adminConfirm({
                  title: 'Remove entire table?',
                  message: 'This removes the table from the article body.',
                  confirmLabel: 'Remove table',
                  cancelLabel: 'Cancel',
                  variant: 'danger',
                }).then((ok) => {
                  if (!ok) return;
                  runTableStructureOp((m) => m.removeTable?.());
                  setTableToolsMenuOpen(false);
                });
              }}
            >
              Delete whole table
            </button>
          </div>
        ) : null}
      </div>
    ) : null;

  return (
    <>
    <div
      ref={wrapRef}
      className={`article-rich-stack${fullscreen ? ' article-rich-fullscreen' : ''}${readOnly ? ' article-rich-stack-readonly' : ''}`}
    >
      <div id={boundsDomId} className="article-rich-editor-scroll">
        <div
          className={`article-rich-editor-root${readOnly ? ' article-rich-editor-root-readonly' : ''}`}
        >
          <ReactQuill
            ref={quillRef}
            theme="snow"
            bounds={`#${boundsDomId}`}
            value={value}
            onChange={onChange}
            modules={modules}
            formats={formats}
            placeholder={placeholder}
            readOnly={readOnly}
          />
        </div>
        {!readOnly ? (
          <button
            type="button"
            className="article-rich-expand-fab"
            title="More tools"
            aria-label="More tools"
            aria-expanded={advancedOpen}
            onClick={toggleAdvanced}
          >
            +
          </button>
        ) : null}
      </div>

      {!readOnly && advancedOpen ? (
        <div ref={advPanelRef} className="article-rich-advanced">
          <div className="article-rich-advanced-row">
            <span className="article-rich-counts">
              Words: <strong>{wordCount}</strong> · Characters: <strong>{charCount}</strong>
              {bodyImageUploading ? <span className="muted"> · Uploading image…</span> : null}
            </span>
            <div className="article-rich-advanced-actions">
              <button type="button" className="ghost" onClick={() => setFullscreen((f) => !f)}>
                {fullscreen ? 'Exit focus mode' : 'Focus mode (fullscreen)'}
              </button>
              <button type="button" className="ghost" onClick={() => setShowPreview((p) => !p)}>
                {showPreview ? 'Hide HTML preview' : 'HTML preview'}
              </button>
              <button type="button" className="ghost" onClick={removeLinkFromSelection}>
                Clear link
              </button>
              {persistenceKey ? (
                <>
                  <button type="button" className="ghost" onClick={loadDraft}>
                    Load saved draft
                  </button>
                  <button type="button" className="ghost" onClick={clearDraft}>
                    Clear saved draft
                  </button>
                </>
              ) : null}
            </div>
          </div>
          {showPreview ? (
            <div
              className="article-rich-html-preview"
              dangerouslySetInnerHTML={{ __html: value || '<p class="muted">(empty)</p>' }}
            />
          ) : null}
        </div>
      ) : null}
    </div>
    {videoEmbedModal ? createPortal(videoEmbedModal, document.body) : null}
    {tableStructureTools ? createPortal(tableStructureTools, document.body) : null}
    </>
  );
}
