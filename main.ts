import * as Manim from 'manim-web';
import * as monaco from 'monaco-editor';

// Configure Monaco workers for Vite
// @ts-ignore
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker';
// @ts-ignore
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker';
// @ts-ignore
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker';
// @ts-ignore
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker';
// @ts-ignore
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker';

window.MonacoEnvironment = {
  getWorker(_: any, label: string) {
    if (label === 'json') return new jsonWorker();
    if (label === 'css' || label === 'scss' || label === 'less') return new cssWorker();
    if (label === 'html' || label === 'handlebars' || label === 'razor') return new htmlWorker();
    if (label === 'typescript' || label === 'javascript') return new tsWorker();
    return new editorWorker();
  }
};

const editorContainer = document.getElementById('editor-container')!;
const renderContainer = document.getElementById('render-container')!;
const resizer = document.getElementById('resizer')!;
const errorOverlay = document.getElementById('error-overlay')!;
const playPauseBtn = document.getElementById('play-pause-btn')! as HTMLButtonElement;
const loadBtn = document.getElementById('load-btn')! as HTMLButtonElement;
const fileInput = document.getElementById('file-input')! as HTMLInputElement;
const exportBtn = document.getElementById('export-btn')! as HTMLButtonElement;
const toggleEditorBtn = document.getElementById('toggle-editor-btn')! as HTMLButtonElement;
const statusText = document.getElementById('status')!;

// Toggle Editor Logic
let isEditorVisible = true;
let lastWidth = '50%';

toggleEditorBtn.addEventListener('click', () => {
    isEditorVisible = !isEditorVisible;
    
    // Add animation classes only for this interaction
    editorContainer.classList.add('animate-width');
    resizer.classList.add('animate-opacity');

    if (isEditorVisible) {
        editorContainer.classList.remove('collapsed');
        editorContainer.style.width = lastWidth;
        resizer.classList.remove('hidden');
    } else {
        lastWidth = editorContainer.style.width || '50%';
        editorContainer.classList.add('collapsed');
        resizer.classList.add('hidden');
    }

    // Clean up animation classes once finished
    setTimeout(() => {
        editorContainer.classList.remove('animate-width');
        resizer.classList.remove('animate-opacity');
    }, 300);
});

// Resizing Logic
let isResizing = false;

resizer.addEventListener('mousedown', (e) => {
    isResizing = true;
    document.body.style.cursor = 'col-resize';
    resizer.classList.add('dragging');
});

window.addEventListener('mousemove', (e) => {
    if (!isResizing) return;
    
    const containerRect = document.getElementById('main-container')!.getBoundingClientRect();
    const newWidth = ((e.clientX - containerRect.left) / containerRect.width) * 100;
    
    if (newWidth > 10 && newWidth < 90) {
        editorContainer.style.width = `${newWidth}%`;
    }
});

window.addEventListener('mouseup', () => {
    if (isResizing) {
        isResizing = false;
        document.body.style.cursor = 'default';
        resizer.classList.remove('dragging');
        editor.layout();
        
        if (currentScene) {
            const container = document.getElementById('container')!;
            currentScene.resize(container.clientWidth, container.clientHeight);
        } else {
            runCode();
        }
    }
});

const PLAY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>`;
const PAUSE_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>`;
const REPLAY_ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path></svg>`;

const DEFAULT_CODE = `import {
  Scene,
  Circle,
  Square,
  BLUE,
  RED,
  scaleVec,
  RIGHT,
  LEFT,
  Create,
} from 'manim-web';

const scene = new Scene(document.getElementById('container'), {
  backgroundColor: '#000000',
});

// Create a circle
const circle = new Circle({ radius: 1.5, color: BLUE });
const square = new Square({ sideLength: 2, color: RED });

// Move square to the right
square.shift(scaleVec(3, RIGHT));

// Animate
await scene.play(new Create(circle));
await scene.wait(0.5);
await scene.play(new Create(square));
await scene.play(
    circle.animate.shift(scaleVec(2, LEFT)),
    square.animate.rotate(Math.PI / 4)
);
`;

// Initialize Monaco
const editor = monaco.editor.create(editorContainer, {
  value: DEFAULT_CODE,
  language: 'javascript',
  theme: 'vs-dark',
  automaticLayout: false, // Turned off to use ResizeObserver for better performance
  minimap: { enabled: false },
  fontSize: 14,
});

// Use ResizeObserver for smooth, synchronized layout updates
const resizeObserver = new ResizeObserver(() => {
    editor.layout();
    if (currentScene) {
        const container = document.getElementById('container')!;
        currentScene.resize(container.clientWidth, container.clientHeight);
    }
});
resizeObserver.observe(editorContainer);
resizeObserver.observe(renderContainer);

// Load types for IntelliSense
async function setupTypes() {
    try {
        const response = await fetch('/manim-web.d.ts');
        if (response.ok) {
            const dts = await response.text();
            monaco.languages.typescript.javascriptDefaults.addExtraLib(
                dts,
                'file:///node_modules/manim-web/index.d.ts'
            );
        }
    } catch (e) {
        console.warn("Could not load types for IntelliSense", e);
    }
}
setupTypes();

let currentScene: Manim.Scene | null = null;
let timeoutId: number | null = null;
let playbackPollId: number | null = null;

function getPlaybackState(): { isPlaying: boolean; isFinished: boolean } {
    if (!currentScene) {
        return { isPlaying: false, isFinished: false };
    }
    const isPlaying = currentScene.isPlaying;
    const currentTime = currentScene.currentTime;
    const duration = currentScene.getTimelineDuration();
    const isFinished = duration > 0.1 && currentTime >= duration - 0.05 && !isPlaying;
    //console.log({"isPlaying": isPlaying, "isFinished": isFinished});
    return { isPlaying, isFinished };
}

function updatePlayPauseUI() {
    if (!currentScene) {
        playPauseBtn.disabled = true;
        playPauseBtn.innerHTML = PLAY_ICON;
        return;
    }
    
    playPauseBtn.disabled = false;
    const { isPlaying, isFinished } = getPlaybackState();

    if (isPlaying) {
        playPauseBtn.innerHTML = PAUSE_ICON;
        statusText.textContent = 'Playing...';
    } else if (isFinished) {
        playPauseBtn.innerHTML = REPLAY_ICON;
        statusText.textContent = 'Finished';
    } else {
        playPauseBtn.innerHTML = PLAY_ICON;
        statusText.textContent = 'Paused';
    }
}

function startPlaybackPolling() {
    if (playbackPollId) cancelAnimationFrame(playbackPollId);
    
    const poll = () => {
        updatePlayPauseUI();
        playbackPollId = requestAnimationFrame(poll);
    };
    poll();
}
startPlaybackPolling();

async function runCode() {
  if (timeoutId) {
    clearTimeout(timeoutId);
    timeoutId = null;
  }

  const code = editor.getValue();

  // Clear previous errors and reset state
  errorOverlay.style.display = 'none';
  const container = document.getElementById('container')!;

  // We don't clear container.innerHTML here because it causes flicker.
  // The new Scene constructor will handle the canvas.

  if (currentScene) {
    try {
        // @ts-ignore
        if (typeof currentScene.dispose === 'function') currentScene.dispose();
    } catch (e) {
        console.warn("Error disposing scene:", e);
    }
    currentScene = null;
  }

  // Clear container for fresh start
  container.innerHTML = '';

  try {
    statusText.textContent = 'Initializing...';

    // Prepare execution context
    const manimKeys = Object.keys(Manim);
    const manimValues = manimKeys.map(key => {
        const val = (Manim as any)[key];
        // Capture ANY class that looks like a Scene
        if (typeof val === 'function' && val.prototype && (key.endsWith('Scene') || val === Manim.Scene)) {
            return class extends (val as any) {
                constructor(...args: any[]) {
                    const el = args[0] || document.getElementById('container');
                    const options = args[1] || {};
                    
                    if (el instanceof HTMLElement) {
                        // Force the scene to match the container's pixel resolution
                        options.width = options.width || el.clientWidth;
                        options.height = options.height || el.clientHeight;
                    }

                    super(el, options);
                    currentScene = this as any;
                    updatePlayPauseUI();
                }
            };
        }
        return val;
    });

    const strippedCode = code.replace(/import\s+[\s\S]*?from\s+['"]manim-web['"];?/g, (match) => {
        return match.split('\n').map(() => '').join('\n');
    });
    const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;

    const run = new AsyncFunction(...manimKeys, `
        try {
            ${strippedCode}
            return (typeof scene !== 'undefined') ? scene : null;
        } catch (err) {
            throw err;
        }
    `);

    const result = await run(...manimValues);

    if (!currentScene && result instanceof Manim.Scene) {
        currentScene = result;
    }

    if (!currentScene) {
        statusText.textContent = 'Ready (No scene)';
    }
  } catch (err: any) {
    console.error("Execution error:", err);
    errorOverlay.textContent = err.stack || err.message || String(err);
    errorOverlay.style.display = 'block';
    statusText.textContent = 'Error';
  }
}

// Debounce code execution
editor.onDidChangeModelContent(() => {
  if (timeoutId) clearTimeout(timeoutId);
  timeoutId = window.setTimeout(() => {
    runCode();
  }, 800);
});

// Play/Pause/Replay Logic
playPauseBtn.addEventListener('click', () => {
    if (!currentScene) return;

    if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
    }

    try {
        const { isPlaying, isFinished } = getPlaybackState();

        if (isFinished) {
            currentScene.stop();
            runCode();
        } else if (isPlaying) {
            currentScene.pause();
        } else {
            currentScene.resume();
        }
    } catch (err) {
        console.error("Playback control error:", err);
        statusText.textContent = 'Error';
    }

    updatePlayPauseUI();
});

// Load Script Logic
loadBtn.addEventListener('click', () => {
    fileInput.click();
});

fileInput.addEventListener('change', (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
        const content = event.target?.result as string;
        editor.setValue(content);
    };
    reader.readAsText(file);
});

// Export Video Logic
exportBtn.addEventListener('click', async () => {
    if (!currentScene) return;
    
    try {
        statusText.textContent = 'Exporting...';
        exportBtn.disabled = true;
        
        const exporter = new Manim.VideoExporter(currentScene);
        await exporter.exportAndDownload('animation.webm');
        
        statusText.textContent = 'Export Complete';
    } catch (err: any) {
        console.error("Export failed:", err);
        statusText.textContent = 'Export Failed';
    } finally {
        exportBtn.disabled = false;
        setTimeout(() => { if (statusText.textContent === 'Export Complete') statusText.textContent = 'Ready'; }, 3000);
    }
});

// Initial run
runCode();

// Handle resize
window.addEventListener('resize', () => {
    if (currentScene) {
        const container = document.getElementById('container')!;
        currentScene.resize(container.clientWidth, container.clientHeight);
        return;
    }

    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = window.setTimeout(() => {
      runCode();
    }, 500);
});
