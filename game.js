:root {
  --bg: #ecf6ff;
  --panel: rgba(255, 255, 255, 0.88);
  --text: #223047;
  --accent: #0d8ae5;
  --accent-soft: #6ec3ff;
  --line: rgba(15, 40, 80, 0.2);
}

* {
  box-sizing: border-box;
}

html,
body {
  margin: 0;
  min-height: 100%;
  font-family: Inter, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: var(--text);
  background: radial-gradient(circle at 20% 10%, #f8fcff, var(--bg));
}

body {
  display: flex;
  justify-content: center;
  padding: 16px;
}

.app {
  width: min(1120px, 100%);
  display: grid;
  grid-template-columns: 1fr;
  gap: 14px;
}

.hud {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
  backdrop-filter: blur(6px);
}

.hud h1 {
  margin: 0;
  font-size: clamp(1.4rem, 2.2vw, 2rem);
}

.subtitle {
  margin: 4px 0 0;
  color: #4f6482;
}

.game-shell {
  position: relative;
  background: linear-gradient(180deg, #f7fbff 0%, #eaf5ff 60%, #deeeff 100%);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 12px;
  box-shadow: 0 10px 24px rgba(21, 63, 117, 0.12);
}

#gameCanvas {
  width: 100%;
  height: auto;
  border-radius: 10px;
  background: transparent;
  display: block;
}

.controls {
  margin-top: 10px;
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

.btn {
  border: none;
  background: linear-gradient(180deg, #20a2ff, #0884dd);
  color: #fff;
  padding: 9px 14px;
  border-radius: 10px;
  font-weight: 700;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 6px 16px rgba(10, 85, 147, 0.25);
  filter: brightness(1.03);
}

.btn:active {
  transform: translateY(1px);
}

.help {
  background: var(--panel);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px 16px;
}

.help h2 {
  margin: 0 0 8px;
  font-size: 1.1rem;
}

.help ul {
  margin: 0;
  padding-left: 20px;
  display: grid;
  gap: 6px;
}

kbd {
  padding: 2px 6px;
  border: 1px solid #ccd9ea;
  border-bottom-width: 2px;
  background: #fff;
  border-radius: 5px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}

.duck-mobile {
  position: fixed;
  right: 16px;
  bottom: max(16px, env(safe-area-inset-bottom));
  width: 82px;
  height: 82px;
  border-radius: 50%;
  border: none;
  background: radial-gradient(circle at 30% 25%, #7bc8ff, #1879ce);
  color: #fff;
  font-weight: 800;
  font-size: 1rem;
  box-shadow: 0 10px 20px rgba(6, 45, 87, 0.32);
  display: none;
  z-index: 99;
}

.duck-mobile:active {
  transform: scale(0.97);
}

@media (max-width: 840px) {
  body {
    padding: 10px;
  }

  .duck-mobile {
    display: block;
  }
}
