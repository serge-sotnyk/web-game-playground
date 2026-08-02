import { clamp } from './constants';

export const RENDER_DPR = clamp(
  typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1,
  1,
  4,
);

export interface DisplayElements {
  root: HTMLElement;
  host: HTMLElement;
}

export const measureLogicalViewport = (root: HTMLElement): { width: number; height: number } => {
  const bounds = root.getBoundingClientRect();
  return {
    width: Math.max(1, Math.round(bounds.width)),
    height: Math.max(1, Math.round(bounds.height)),
  };
};

export const sizeHighDpiHost = ({ root, host }: DisplayElements): { width: number; height: number } => {
  const logical = measureLogicalViewport(root);
  host.style.width = `${Math.round(logical.width * RENDER_DPR)}px`;
  host.style.height = `${Math.round(logical.height * RENDER_DPR)}px`;
  return logical;
};

export const sizeCanvasCss = (
  canvas: HTMLCanvasElement,
  logical: { width: number; height: number },
): void => {
  canvas.style.width = `${logical.width}px`;
  canvas.style.height = `${logical.height}px`;
};
