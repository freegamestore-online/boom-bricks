import { useEffect, useRef } from "react";
import * as LJS from "littlejsengine";
import { Shell } from "./components/Shell";

export default function App() {
  const containerRef = useRef<HTMLDivElement>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    const container = containerRef.current;
    // LittleJS boots once per page (it owns a global engine loop).
    if (!container || startedRef.current) return;
    startedRef.current = true;

    let angle = 0;

    function gameInit() {
      LJS.setCameraPos(LJS.vec2(0, 0));
    }
    function gameUpdate() {
      angle += 0.01;
    }
    function gameRender() {
      // drawRect(pos, size, color, angle) — world-space, camera-relative.
      LJS.drawRect(LJS.vec2(0, 0), LJS.vec2(5, 5), new LJS.Color(0.15, 0.39, 0.92), angle);
    }
    function gameUpdatePost() {}
    function gameRenderPost() {}

    // rootElement keeps the engine's canvas inside the Shell layout.
    void LJS.engineInit(gameInit, gameUpdate, gameUpdatePost, gameRender, gameRenderPost, [], container);
  }, []);

  return (
    <Shell>
      <div ref={containerRef} className="w-full h-full min-h-[400px]" />
    </Shell>
  );
}
