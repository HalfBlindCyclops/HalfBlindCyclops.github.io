import { useLayoutEffect, useRef } from "react";
import type { WebGLRenderer } from "three";

export type CanvasScreenRect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

/**
 * Syncs the WebGL canvas element’s screen rect via ResizeObserver + resize.
 * Shared by pointer NDC math and connector screen projection to avoid getBoundingClientRect per move/frame.
 */
export function useCanvasScreenRect(gl: WebGLRenderer) {
  const rectRef = useRef<CanvasScreenRect | null>(null);

  useLayoutEffect(() => {
    const el = gl.domElement;
    const sync = () => {
      const r = el.getBoundingClientRect();
      rectRef.current = {
        left: r.left,
        top: r.top,
        width: r.width,
        height: r.height,
      };
    };
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    window.addEventListener("resize", sync);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", sync);
    };
  }, [gl]);

  return rectRef;
}
