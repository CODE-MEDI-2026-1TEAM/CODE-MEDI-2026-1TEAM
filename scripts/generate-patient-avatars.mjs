import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';

const rootDir = resolve(import.meta.dirname, '..');
const outputDir = join(rootDir, 'frontend/public/avatars/patients');
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';

const modelNames = [
  'Baby',
  'Boy',
  'Girl',
  'Man1',
  'Man2',
  'Man4',
  'Man5',
  'Schoolboy',
  'Schoolgirl',
  'Woman1',
  'Woman3',
  'Woman4',
];

const mimeByExtension = {
  '.glb': 'model/gltf-binary',
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.wasm': 'application/wasm',
};

const server = createServer((request, response) => {
  const requestUrl = new URL(request.url ?? '/', 'http://localhost');

  if (requestUrl.pathname === '/') {
    response.writeHead(200, { 'Content-Type': 'text/html' });
    response.end(renderPage());
    return;
  }

  const filePath = join(rootDir, decodeURIComponent(requestUrl.pathname));

  try {
    const file = readFileSync(filePath);
    response.writeHead(200, {
      'Content-Type': mimeByExtension[extname(filePath)] ?? 'application/octet-stream',
    });
    response.end(file);
    return;
  } catch {
    response.writeHead(404);
    response.end('Not found');
  }
});

await mkdir(outputDir, { recursive: true });

await new Promise((resolveListen) => server.listen(0, '127.0.0.1', resolveListen));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;

const browser = await chromium.launch({
  executablePath: chromePath,
  headless: true,
});

try {
  const page = await browser.newPage({ viewport: { width: 256, height: 256 } });
  await page.goto(`http://127.0.0.1:${port}/`);
  await page.waitForFunction(() => typeof window.renderPatientAvatar === 'function');

  for (const modelName of modelNames) {
    const dataUrl = await page.evaluate(
      async (name) => window.renderPatientAvatar(`/frontend/public/models/patients/${name}.glb`),
      modelName,
    );
    const png = Buffer.from(dataUrl.replace(/^data:image\/png;base64,/, ''), 'base64');
    await writeFile(join(outputDir, `${modelName}.png`), png);
    console.log(`generated ${modelName}.png`);
  }
} finally {
  await browser.close();
  server.close();
}

function renderPage() {
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <script type="importmap">
      {
        "imports": {
          "three": "/node_modules/three/build/three.module.js",
          "three/addons/": "/node_modules/three/examples/jsm/"
        }
      }
    </script>
    <style>
      body { margin: 0; background: transparent; }
      canvas { display: block; width: 256px; height: 256px; }
    </style>
  </head>
  <body>
    <script type="module">
      import * as THREE from '/node_modules/three/build/three.module.js';
      import { GLTFLoader } from '/node_modules/three/examples/jsm/loaders/GLTFLoader.js';

      const renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
      });
      renderer.setPixelRatio(2);
      renderer.setSize(256, 256);
      renderer.setClearColor(0x000000, 0);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      document.body.appendChild(renderer.domElement);

      const loader = new GLTFLoader();

      window.renderPatientAvatar = async (modelPath) => {
        const scene = new THREE.Scene();
        scene.add(new THREE.AmbientLight(0xffffff, 2.6));

        const key = new THREE.DirectionalLight(0xffffff, 3.2);
        key.position.set(2.2, 3.8, 3.4);
        scene.add(key);

        const fill = new THREE.DirectionalLight(0xf2fbff, 1.1);
        fill.position.set(-2.5, 2.2, 2.4);
        scene.add(fill);

        const gltf = await loader.loadAsync(modelPath);
        const avatar = gltf.scene;
        avatar.traverse((child) => {
          if (child.isMesh) {
            child.frustumCulled = false;
          }
        });

        const initialBox = new THREE.Box3().setFromObject(avatar);
        const initialCenter = initialBox.getCenter(new THREE.Vector3());
        avatar.position.sub(initialCenter);

        const box = new THREE.Box3().setFromObject(avatar);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const group = new THREE.Group();
        group.add(avatar);

        const modelName = modelPath.split('/').pop().replace('.glb', '');
        group.rotation.y = 0;
        scene.add(group);

        const headY = center.y + size.y * 0.38;
        const camera = new THREE.PerspectiveCamera(22, 1, 0.01, 100);
        const distance = Math.max(size.x, size.y) * 0.98;
        camera.position.set(0, headY, distance);
        camera.lookAt(0, headY, 0);

        if (/Baby/.test(modelName)) {
          const babyHeadY = center.y + size.y * 0.08;
          camera.position.set(0, babyHeadY, distance * 1.75);
          camera.lookAt(0, babyHeadY, 0);
        }

        renderer.render(scene, camera);
        await new Promise((resolve) => requestAnimationFrame(resolve));
        renderer.render(scene, camera);

        return renderer.domElement.toDataURL('image/png');
      };
    </script>
  </body>
</html>`;
}
