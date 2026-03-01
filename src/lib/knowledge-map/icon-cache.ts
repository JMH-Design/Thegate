/**
 * Icon cache for rendering Lucide icons on the canvas.
 * Converts Lucide icon path data to cached HTMLImageElements.
 */

export const ICON_WHITELIST = [
  "Brain",
  "BookOpen",
  "Lightbulb",
  "Cpu",
  "Atom",
  "FlaskConical",
  "Music",
  "Palette",
  "Globe",
  "Calculator",
  "Code",
  "GitBranch",
  "Database",
  "Layers",
  "Target",
  "Zap",
  "Sparkles",
  "GraduationCap",
  "BookMarked",
  "CircleDot",
] as const;

export type IconName = (typeof ICON_WHITELIST)[number];

const DEFAULT_ICON: IconName = "BookMarked";

function pascalToKebab(str: string): string {
  return str
    .replace(/([A-Z])/g, "-$1")
    .toLowerCase()
    .replace(/^-/, "");
}

function buildSvgFromPaths(
  paths: Array<[string, Record<string, unknown>]>
): string {
  const pathElements = paths
    .filter(([tag]) => tag === "path")
    .map(([, attrs]) => {
      const d = attrs.d as string | undefined;
      return d ? `<path d="${d}"/>` : "";
    })
    .filter(Boolean)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${pathElements}</svg>`;
}

const iconCache = new Map<string, HTMLImageElement>();
const loadPromises = new Map<string, Promise<HTMLImageElement>>();

async function loadIconSvg(iconName: string): Promise<HTMLImageElement> {
  const cached = iconCache.get(iconName);
  if (cached) return cached;

  const existing = loadPromises.get(iconName);
  if (existing) return existing;

  const promise = (async () => {
    const kebab = pascalToKebab(iconName);
    try {
      const mod = await import(
        /* webpackMode: "eager" */
        `lucide-react/dist/esm/icons/${kebab}.js`
      );
      const iconNode = (
        mod as { __iconNode?: Array<[string, Record<string, unknown>]> }
      ).__iconNode;
      if (!iconNode) throw new Error(`No path data for ${iconName}`);

      const svg = buildSvgFromPaths(iconNode);
      const dataUrl = `data:image/svg+xml;base64,${btoa(
        unescape(encodeURIComponent(svg))
      )}`;

      return new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => {
          iconCache.set(iconName, img);
          resolve(img);
        };
        img.onerror = reject;
        img.src = dataUrl;
      });
    } catch {
      return loadIconSvg(DEFAULT_ICON);
    }
  })();

  loadPromises.set(iconName, promise);
  return promise;
}

export async function getIconImage(
  iconName: string | null | undefined
): Promise<HTMLImageElement> {
  const name =
    iconName && ICON_WHITELIST.includes(iconName as IconName)
      ? iconName
      : DEFAULT_ICON;
  return loadIconSvg(name);
}

/** Sync getter for cached images. Returns null if not yet loaded. */
export function getCachedIconImage(
  iconName: string | null | undefined
): HTMLImageElement | null {
  const name =
    iconName && ICON_WHITELIST.includes(iconName as IconName)
      ? iconName
      : DEFAULT_ICON;
  return iconCache.get(name) ?? null;
}

export function isValidIconName(name: string): name is IconName {
  return ICON_WHITELIST.includes(name as IconName);
}
