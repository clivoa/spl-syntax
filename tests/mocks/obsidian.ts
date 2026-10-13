export class Plugin {}

export class MarkdownView {}

const prismSingleton = { languages: {} as Record<string, unknown> };

type PrismLoader = () => Promise<typeof prismSingleton>;

const defaultLoader: PrismLoader = async () => prismSingleton;
let loader: PrismLoader = defaultLoader;

// Lets Task 6 simulate Obsidian failing to provide Prism. vitest cannot patch
// an ES module namespace, so the seam lives here instead of in a spy.
export const setPrismLoader = (next: PrismLoader): void => {
  loader = next;
};

export const resetPrismLoader = (): void => {
  loader = defaultLoader;
};

export const loadPrism = (): Promise<typeof prismSingleton> => loader();
