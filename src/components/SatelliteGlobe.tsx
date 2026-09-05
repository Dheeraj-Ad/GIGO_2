import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { BasinTarget, SensorNode } from '../types';
import { BASINS } from '../data/oceanData';
import { Compass, Waves, ArrowUpRight } from 'lucide-react';

interface SatelliteGlobeProps {
  onSelectBasin: (basin: BasinTarget) => void;
  activeBasin: BasinTarget;
  probes: SensorNode[];
  onSelectProbe: (probe: SensorNode) => void;
}

export const SatelliteGlobe: React.FC<SatelliteGlobeProps> = ({
  onSelectBasin,
  activeBasin,
  probes,
  onSelectProbe,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const cloudsMeshRef = useRef<THREE.Mesh | null>(null);
  const earthMeshRef = useRef<THREE.Mesh | null>(null);

  // Region Highlight Mesh refs
  const regionHighlightGroupRef = useRef<THREE.Group | null>(null);

  // Interaction state
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const targetRotationRef = useRef({ x: 0.24, y: -2.95 });
  const currentRotationRef = useRef({ x: 0.24, y: -2.95 });
  const targetZoomRef = useRef(4.2);
  const currentZoomRef = useRef(4.2);
  const isTransitioningRef = useRef(false);

  // Hovered Ocean Basin
  const [hoveredBasinId, setHoveredBasinId] = useState<string | null>(null);
  const [hoveredScreenPos, setHoveredScreenPos] = useState<{ x: number; y: number } | null>(null);
  const hoveredBasin = BASINS.find((b) => b.id === hoveredBasinId) || null;

  // Projected screen positions of hotspots
  const [projectedBasins, setProjectedBasins] = useState<
    { id: string; name: string; x: number; y: number; visible: boolean; sst: number; activeFloats: number }[]
  >([]);
  const [projectedProbes, setProjectedProbes] = useState<
    { probe: SensorNode; x: number; y: number; visible: boolean }[]
  >([]);

  // Convert lat/lon to 3D Cartesian coordinates on sphere radius R
  const latLonToVector3 = (lat: number, lon: number, radius: number) => {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    const x = -(radius * Math.sin(phi) * Math.cos(theta));
    const z = radius * Math.sin(phi) * Math.sin(theta);
    const y = radius * Math.cos(phi);
    return new THREE.Vector3(x, y, z);
  };

  // Helper to build high-detail canvas texture as immediate photorealistic backup
  const fallbackEarthTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // 1. Realistic deep ocean tone matching authentic space photography
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    oceanGrad.addColorStop(0, '#030f24');
    oceanGrad.addColorStop(0.2, '#051838');
    oceanGrad.addColorStop(0.5, '#07224e');
    oceanGrad.addColorStop(0.8, '#051838');
    oceanGrad.addColorStop(1, '#030f24');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const toPx = (lon: number, lat: number) => ({
      x: ((lon + 180) / 360) * canvas.width,
      y: ((90 - lat) / 180) * canvas.height,
    });

    // 2. Continental shelf shallow turquoise waters
    const drawPoly = (
      coords: [number, number][],
      fillColor: string,
      strokeColor?: string,
      lineWidth = 1.5
    ) => {
      if (coords.length === 0) return;
      ctx.beginPath();
      const p0 = toPx(coords[0][0], coords[0][1]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < coords.length; i++) {
        const p = toPx(coords[i][0], coords[i][1]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      ctx.fillStyle = fillColor;
      ctx.fill();
      if (strokeColor) {
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      }
    };

    // Indian Subcontinent (Lush green + Deccan soil)
    drawPoly(
      [
        [68, 24], [72, 21], [73, 16], [76, 10], [78, 8], [80, 10], [80, 13],
        [82, 16], [85, 20], [89, 22], [92, 21], [90, 25], [86, 26], [80, 28],
        [74, 32], [70, 28], [68, 24]
      ],
      '#2a4026',
      '#13566c',
      4
    );

    // Sri Lanka
    drawPoly([[80, 9.8], [81.8, 8.5], [81.5, 6.2], [79.8, 7.5], [80, 9.8]], '#2a4225', '#13566c', 3);

    // Arabian Peninsula (Ochre desert sands)
    drawPoly(
      [
        [40, 28], [50, 30], [56, 26], [60, 22], [58, 17], [53, 16], [45, 12],
        [43, 14], [40, 20], [36, 22], [40, 28]
      ],
      '#87693e',
      '#12485e',
      3
    );

    // Africa (Sahara ochre north, tropical green central, savanna south)
    drawPoly(
      [
        [-17, 15], [-12, 26], [-5, 36], [10, 37], [25, 32], [35, 31],
        [43, 12], [51, 12], [49, 8], [42, -2], [39, -6], [40, -11], [35, -17],
        [32, -26], [28, -34], [18, -34], [12, -18], [9, -5], [3, 4], [-8, 4],
        [-17, 15]
      ],
      '#434123',
      '#11455a',
      4
    );

    // Madagascar
    drawPoly([[44, -12], [50, -15], [47, -25], [43, -25], [44, -12]], '#293e24', '#11455a', 3);

    // Southeast Asia & Sunda Shelf
    drawPoly(
      [[98, 22], [103, 18], [108, 12], [105, 8], [100, 7], [98, 10], [98, 16], [98, 22]],
      '#1e3d22',
      '#16607a',
      4
    );
    drawPoly([[95, 5], [100, 0], [105, -5], [103, -7], [97, -2], [95, 5]], '#1e3d22', '#16607a', 3); // Sumatra
    drawPoly([[106, -6], [114, -8], [112, -9], [105, -7], [106, -6]], '#1e3d22', '#16607a', 3); // Java
    drawPoly([[109, 6], [118, 5], [116, -3], [110, -1], [109, 6]], '#1e3d22', '#16607a', 3); // Borneo

    // Australia (Red outback interior, green coastal fringes)
    drawPoly(
      [
        [114, -22], [122, -16], [130, -12], [136, -12], [142, -10], [146, -15],
        [150, -24], [148, -36], [138, -35], [128, -32], [115, -34], [113, -26], [114, -22]
      ],
      '#6e492e',
      '#16607a',
      4
    );

    // Eurasia / East Asia
    drawPoly(
      [
        [30, 45], [45, 40], [60, 45], [80, 50], [105, 52], [125, 48],
        [122, 30], [110, 22], [100, 26], [85, 28], [75, 36], [50, 42], [30, 45]
      ],
      '#35482e',
      '#12485e',
      4
    );

    // North & South Polar ice caps
    ctx.fillStyle = '#ebf4fa';
    ctx.fillRect(0, 0, canvas.width, canvas.height * 0.08);
    ctx.fillRect(0, canvas.height * 0.90, canvas.width, canvas.height * 0.10);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  }, []);

  // Helper to build high-detail procedural cloud fallback
  const fallbackCloudsTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 60; i++) {
      const x = Math.random() * canvas.width;
      const y = (0.1 + Math.random() * 0.8) * canvas.height;
      const rx = 60 + Math.random() * 120;
      const ry = 18 + Math.random() * 40;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rx);
      grad.addColorStop(0, 'rgba(255, 255, 255, 0.65)');
      grad.addColorStop(0.5, 'rgba(255, 255, 255, 0.22)');
      grad.addColorStop(1, 'transparent');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.ellipse(x, y, rx, ry, Math.random() * 0.4 - 0.2, 0, Math.PI * 2);
      ctx.fill();
    }

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    return texture;
  }, []);

  // Trigger cinematic zoom-in transition to selected ocean
  const handleTransitionToBasin = (basin: BasinTarget) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;

    // Calculate rotation to face basin directly
    const targetY = -(basin.lon * (Math.PI / 180)) - Math.PI / 2;
    const targetX = basin.lat * (Math.PI / 180);
    targetRotationRef.current = { x: targetX, y: targetY };
    targetZoomRef.current = 1.95; // Dive close to ocean

    setTimeout(() => {
      onSelectBasin(basin);
      isTransitioningRef.current = false;
    }, 950);
  };

  const handleTransitionToProbe = (probe: SensorNode) => {
    if (isTransitioningRef.current) return;
    isTransitioningRef.current = true;
    targetRotationRef.current = {
      x: probe.lat * (Math.PI / 180),
      y: -(probe.lon * (Math.PI / 180)) - Math.PI / 2,
    };
    targetZoomRef.current = 1.95;
    setTimeout(() => {
      onSelectProbe(probe);
      isTransitioningRef.current = false;
    }, 950);
  };

  // Main 3D Photorealistic Satellite Earth Setup
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;
    const aspect = width / height;

    // 1. Scene
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x010817);
    sceneRef.current = scene;

    // 2. Camera
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    camera.position.z = currentZoomRef.current;
    cameraRef.current = camera;

    // 3. Renderer with ACES Filmic Tone Mapping for authentic photographic contrast
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.25;

    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Distant Space Starfield (Subtle background stars)
    const starCount = 2200;
    const starGeo = new THREE.BufferGeometry();
    const starPositions = new Float32Array(starCount * 3);
    const starColors = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount; i++) {
      // Sphere distribution around camera
      const theta = 2 * Math.PI * Math.random();
      const phi = Math.acos(2 * Math.random() - 1);
      const r = 80 + Math.random() * 40;

      starPositions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
      starPositions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
      starPositions[i * 3 + 2] = r * Math.cos(phi);

      // Star color temperatures (white, pale blue, warm amber)
      const colorType = Math.random();
      if (colorType > 0.8) {
        starColors[i * 3] = 0.85;
        starColors[i * 3 + 1] = 0.92;
        starColors[i * 3 + 2] = 1.0;
      } else if (colorType < 0.15) {
        starColors[i * 3] = 1.0;
        starColors[i * 3 + 1] = 0.95;
        starColors[i * 3 + 2] = 0.85;
      } else {
        starColors[i * 3] = 0.98;
        starColors[i * 3 + 1] = 0.98;
        starColors[i * 3 + 2] = 1.0;
      }
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(starPositions, 3));
    starGeo.setAttribute('color', new THREE.BufferAttribute(starColors, 3));
    const starMat = new THREE.PointsMaterial({
      size: 0.7,
      vertexColors: true,
      transparent: true,
      opacity: 0.75,
    });
    const starField = new THREE.Points(starGeo, starMat);
    scene.add(starField);

    // 5. Globe Root Group
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    // 6. Photorealistic NASA Blue Marble Earth Sphere Mesh
    const sphereRadius = 1.25;
    const globeGeo = new THREE.SphereGeometry(sphereRadius, 96, 96);

    // Primary Earth Material with specular oceans and topography
    const globeMat = new THREE.MeshPhongMaterial({
      map: fallbackEarthTexture,
      shininess: 32,
      specular: new THREE.Color(0x384a60),
    });
    const globeMesh = new THREE.Mesh(globeGeo, globeMat);
    globeGroup.add(globeMesh);
    earthMeshRef.current = globeMesh;

    // Load authentic NASA Blue Marble satellite textures
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin('anonymous');

    // NASA Blue Marble true-color satellite photography
    textureLoader.load(
      'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-blue-marble.jpg',
      (texture) => {
        texture.colorSpace = THREE.SRGBColorSpace;
        texture.minFilter = THREE.LinearMipmapLinearFilter;
        texture.generateMipmaps = true;
        globeMat.map = texture;
        globeMat.needsUpdate = true;
      },
      undefined,
      (err) => {
        console.warn('Primary satellite texture load warning, retrying with fallback mirror:', err);
        textureLoader.load(
          'https://unpkg.com/three-globe/example/img/earth-blue-marble.jpg',
          (altTexture) => {
            altTexture.colorSpace = THREE.SRGBColorSpace;
            globeMat.map = altTexture;
            globeMat.needsUpdate = true;
          }
        );
      }
    );

    // Topography bump map for mountain ranges, continental slopes, and oceanic trenches
    textureLoader.load(
      'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-topology.png',
      (bumpTex) => {
        globeMat.bumpMap = bumpTex;
        globeMat.bumpScale = 0.035;
        globeMat.needsUpdate = true;
      }
    );

    // Water/specular map (high reflectivity on oceans, matte on continents)
    textureLoader.load(
      'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-water.png',
      (waterTex) => {
        globeMat.specularMap = waterTex;
        globeMat.specular = new THREE.Color(0x405575);
        globeMat.shininess = 36;
        globeMat.needsUpdate = true;
      }
    );

    // Subtle Night lights on dark side
    textureLoader.load(
      'https://cdn.jsdelivr.net/npm/three-globe/example/img/earth-night.jpg',
      (nightTex) => {
        nightTex.colorSpace = THREE.SRGBColorSpace;
        globeMat.emissiveMap = nightTex;
        globeMat.emissive = new THREE.Color(0xfff0c4);
        globeMat.emissiveIntensity = 0.35;
        globeMat.needsUpdate = true;
      }
    );

    // 7. Realistic Satellite Cloud Cover Layer
    const cloudsGeo = new THREE.SphereGeometry(sphereRadius * 1.012, 96, 96);
    const cloudsMat = new THREE.MeshStandardMaterial({
      map: fallbackCloudsTexture,
      transparent: true,
      opacity: 0.85,
      blending: THREE.NormalBlending,
      roughness: 0.95,
      metalness: 0.05,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    globeGroup.add(cloudsMesh);
    cloudsMeshRef.current = cloudsMesh;

    // Load real NASA satellite clouds photography
    textureLoader.load(
      'https://cdn.jsdelivr.net/gh/vasturiano/globe.gl/example/clouds/clouds.png',
      (cloudTex) => {
        cloudTex.colorSpace = THREE.SRGBColorSpace;
        cloudTex.wrapS = THREE.RepeatWrapping;
        cloudsMat.map = cloudTex;
        cloudsMat.needsUpdate = true;
      },
      undefined,
      () => {
        textureLoader.load(
          'https://raw.githubusercontent.com/vasturiano/globe.gl/master/example/clouds/clouds.png',
          (cloudAlt) => {
            cloudsMat.map = cloudAlt;
            cloudsMat.needsUpdate = true;
          }
        );
      }
    );

    // 8. Soft Atmospheric Limb Glow (Rayleigh Scattering Shader)
    // Inner limb layer (Fresnel atmospheric scattering at horizon)
    const atmosGeo = new THREE.SphereGeometry(sphereRadius * 1.018, 64, 64);
    const atmosMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
          gl_Position = projectionMatrix * vec4(vPosition, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        varying vec3 vPosition;
        void main() {
          vec3 viewDir = normalize(-vPosition);
          float rim = 1.0 - max(0.0, dot(vNormal, viewDir));
          float intensity = pow(rim, 3.2);
          vec3 atmosColor = mix(vec3(0.08, 0.45, 0.95), vec3(0.35, 0.85, 1.0), rim);
          gl_FragColor = vec4(atmosColor, intensity * 0.72);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.FrontSide,
      transparent: true,
      depthWrite: false,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosMesh);

    // Outer atmospheric halo (Soft blue Rayleigh scatter visible against deep space)
    const haloGeo = new THREE.SphereGeometry(sphereRadius * 1.14, 48, 48);
    const haloMat = new THREE.ShaderMaterial({
      vertexShader: `
        varying vec3 vNormal;
        void main() {
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        varying vec3 vNormal;
        void main() {
          float intensity = pow(0.62 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.8);
          intensity = clamp(intensity, 0.0, 1.0);
          vec3 haloColor = vec3(0.18, 0.65, 1.0);
          gl_FragColor = vec4(haloColor, intensity * 0.8);
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
      depthWrite: false,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    scene.add(haloMesh);

    // 9. Satellite Orbits with dashed telemetry paths
    const createOrbitLine = (radius: number, tiltDeg: number, color: string) => {
      const curve = new THREE.EllipseCurve(0, 0, radius, radius * 0.94, 0, 2 * Math.PI, false, 0);
      const points = curve.getPoints(100);
      const geometry = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p.x, p.y, 0))
      );
      const material = new THREE.LineDashedMaterial({
        color: new THREE.Color(color),
        dashSize: 0.05,
        gapSize: 0.05,
        transparent: true,
        opacity: 0.45,
      });
      const line = new THREE.Line(geometry, material);
      line.rotation.x = Math.PI / 2.3;
      line.rotation.y = (tiltDeg * Math.PI) / 180;
      line.computeLineDistances();
      return line;
    };
    scene.add(createOrbitLine(sphereRadius * 1.35, -28, '#00e2a0'));
    scene.add(createOrbitLine(sphereRadius * 1.5, 38, '#00f0ff'));

    // 11. Photorealistic Space Lighting
    // Directional Sun Light illuminating Earth with authentic space daylight
    const sunLight = new THREE.DirectionalLight(0xffffff, 2.7);
    sunLight.position.set(6, 3, 5);
    scene.add(sunLight);

    // Deep space ambient fill (subtle navy so shadow side remains legible)
    const spaceAmbientLight = new THREE.AmbientLight(0x0c203d, 0.75);
    scene.add(spaceAmbientLight);

    // Secondary subtle rim light for atmospheric backlighting
    const rimLight = new THREE.DirectionalLight(0x00f0ff, 0.4);
    rimLight.position.set(-6, -2, -4);
    scene.add(rimLight);

    // Resize Handler
    const handleResize = () => {
      if (!container || !rendererRef.current || !cameraRef.current) return;
      const w = container.clientWidth || 800;
      const h = container.clientHeight || 600;
      if (w <= 0 || h <= 0) return;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 12. Animation Loop
    let animationFrameId: number;
    let startTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const elapsed = (now - startTime) * 0.001;

      // Smooth interpolation for rotation & zoom
      currentRotationRef.current.x += (targetRotationRef.current.x - currentRotationRef.current.x) * 0.08;
      currentRotationRef.current.y += (targetRotationRef.current.y - currentRotationRef.current.y) * 0.08;
      currentZoomRef.current += (targetZoomRef.current - currentZoomRef.current) * 0.06;

      if (cameraRef.current) {
        cameraRef.current.position.z = currentZoomRef.current;
      }

      if (globeGroupRef.current) {
        globeGroupRef.current.rotation.x = currentRotationRef.current.x;
        globeGroupRef.current.rotation.y = currentRotationRef.current.y;
      }

      // Realistic differential cloud movement (clouds rotate at natural atmospheric drift speed)
      if (cloudsMeshRef.current) {
        cloudsMeshRef.current.rotation.y += 0.00025;
      }

      // Pulse region highlight rings
      if (regionHighlightGroupRef.current) {
        const pulse = 1 + Math.sin(elapsed * 3) * 0.12;
        regionHighlightGroupRef.current.children.forEach((child) => {
          if (child.name.startsWith('region-ring')) {
            child.scale.set(pulse, pulse, 1);
          }
        });
      }

      renderer.render(scene, camera);
    };

    animate();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      if (container && renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
      renderer.dispose();
    };
  }, [fallbackEarthTexture, fallbackCloudsTexture]);

  // Project Basins 3D to 2D screen positions for click & hover targeting
  useEffect(() => {
    const updateProjectedBasins = () => {
      if (!cameraRef.current || !globeGroupRef.current || !mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      if (w <= 0 || h <= 0) return;

      try {
        const list = BASINS.map((basin) => {
          const v = latLonToVector3(basin.lat, basin.lon, 1.25);
          v.applyEuler(new THREE.Euler(currentRotationRef.current.x, currentRotationRef.current.y, 0));
          const isFacing = v.z > 0.05;
          v.project(cameraRef.current!);
          const x = ((v.x + 1) * w) / 2;
          const y = ((-v.y + 1) * h) / 2;

          return {
            id: basin.id,
            name: basin.name,
            sst: basin.sst,
            activeFloats: basin.activeFloats,
            x,
            y,
            visible: isFacing && x > 40 && x < w - 40 && y > 40 && y < h - 40,
          };
        });

        setProjectedBasins(list);
      } catch (e) {
        console.warn('Basin projection error:', e);
      }
    };

    const interval = setInterval(updateProjectedBasins, 50);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const updateProjectedProbes = () => {
      if (!cameraRef.current || !globeGroupRef.current || !mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      const list = probes.map((probe) => {
        // Keep the HTML marker on the same surface as the 1.25-radius Earth mesh.
        const vector = latLonToVector3(probe.lat, probe.lon, 1.258);
        vector.applyEuler(new THREE.Euler(currentRotationRef.current.x, currentRotationRef.current.y, 0));
        const isFacing = vector.z > 0.05;
        vector.project(cameraRef.current!);
        const x = ((vector.x + 1) * w) / 2;
        const y = ((-vector.y + 1) * h) / 2;
        return { probe, x, y, visible: isFacing && x > 20 && x < w - 20 && y > 20 && y < h - 20 };
      });
      setProjectedProbes(list);
    };
    updateProjectedProbes();
    const interval = setInterval(updateProjectedProbes, 50);
    return () => clearInterval(interval);
  }, [probes]);

  // Mouse drag & zoom controls
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDraggingRef.current) {
      const deltaX = e.clientX - previousMousePositionRef.current.x;
      const deltaY = e.clientY - previousMousePositionRef.current.y;

      targetRotationRef.current = {
        x: Math.max(-1.3, Math.min(1.3, targetRotationRef.current.x + deltaY * 0.005)),
        y: targetRotationRef.current.y + deltaX * 0.005,
      };

      previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
    }
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const newZoom = Math.max(2.4, Math.min(6.5, targetZoomRef.current + e.deltaY * 0.003));
    targetZoomRef.current = newZoom;
  };

  return (
    <div
      ref={mountRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      className="relative w-full h-[calc(100vh-4rem)] overflow-hidden bg-[#010817] cursor-grab active:cursor-grabbing select-none"
    >
      {/* Three.js canvas container */}
      <div ref={canvasContainerRef} className="absolute inset-0 z-0 pointer-events-none" />

      {projectedProbes.map(({ probe, x, y, visible }, index) => visible && (
        <button
          key={probe.id}
          type="button"
          aria-label={`Open ${probe.name}`}
          style={{ left: `${x}px`, top: `${y}px`, transform: 'translate(-50%, -50%)' }}
          onClick={(event) => { event.stopPropagation(); handleTransitionToProbe(probe); }}
          className="absolute z-30 pointer-events-auto cursor-pointer group"
        >
          <span className={`absolute w-10 h-10 -translate-x-1/2 -translate-y-1/2 rounded-full ${probe.type === 'GLIDER' ? 'bg-[#ffb703]/20' : 'bg-[#00e2a0]/20'} animate-pulse`} />
          <span className={`relative block w-4 h-4 rounded-full ring-2 ring-[#041329] shadow-2xl ${probe.type === 'GLIDER' ? 'bg-[#ffb703]' : 'bg-[#00f0ff]'}`} />
          <span className={`pointer-events-none absolute top-1/2 -translate-y-1/2 whitespace-nowrap rounded border px-2 py-1 font-mono text-[10px] font-bold text-[#dbfcff] shadow-xl ${index % 2 === 0 ? 'left-6' : 'right-6'} ${probe.type === 'GLIDER' ? 'border-[#ffb703]/50' : 'border-[#00f0ff]/40'} bg-[#010e24]/95`}>
            {probe.id} · {probe.sst.toFixed(1)}°C
          </span>
        </button>
      ))}

      {/* Top Glassmorphism Datum Bar */}
      <div className="absolute top-4 left-4 right-4 flex items-center justify-between z-20 pointer-events-none">
        <div className="flex items-center gap-3 bg-[#0d1c32]/85 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-[#00f0ff]/20 shadow-xl pointer-events-auto">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-[#43ffbb] animate-pulse"></span>
            <span className="font-mono text-xs font-bold text-[#b9cacb]">SATELLITE GLOBE</span>
          </div>
          <div className="h-3 w-px bg-white/10 hidden sm:block"></div>
          <span className="hidden sm:inline font-mono text-xs text-[#00f0ff]">
            NASA Blue Marble Imagery • Select a probe to inspect live telemetry
          </span>
        </div>

        <div className="flex items-center gap-2 bg-[#0d1c32]/85 backdrop-blur-md px-3.5 py-1.5 rounded-lg border border-[#00f0ff]/20 shadow-xl pointer-events-auto">
          <Compass className="w-4 h-4 text-[#00f0ff]" />
          <span className="font-mono text-xs text-[#dbfcff]">INDIAN OCEAN BASIN</span>
        </div>
      </div>

      {/* 2D Projected Ocean Basin Hotspots with Hover Highlight */}
      {false && projectedBasins.map((basin) => {
        if (!basin.visible) return null;
        const isHovered = hoveredBasinId === basin.id;
        const basinData = BASINS.find((b) => b.id === basin.id);

        return (
          <div
            key={basin.id}
            style={{
              left: `${basin.x}px`,
              top: `${basin.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
            onMouseEnter={() => {
              setHoveredBasinId(basin.id);
              setHoveredScreenPos({ x: basin.x, y: basin.y });
            }}
            onMouseLeave={() => {
              setHoveredBasinId(null);
              setHoveredScreenPos(null);
            }}
            onClick={(e) => {
              e.stopPropagation();
              if (basinData) handleTransitionToBasin(basinData);
            }}
            className="absolute z-20 pointer-events-auto cursor-pointer group"
          >
            {/* Pulsing Beacon */}
            <div className="relative flex items-center justify-center">
              <span
                className={`absolute rounded-full transition-all duration-300 ${
                  isHovered
                    ? 'w-16 h-16 bg-[#00f0ff]/30 ring-2 ring-[#00f0ff] animate-ping'
                    : 'w-10 h-10 bg-[#00e2a0]/20 animate-pulse'
                }`}
              ></span>
              <span
                className={`w-4 h-4 rounded-full ring-2 ring-[#041329] shadow-2xl transition-transform duration-300 ${
                  isHovered ? 'scale-150 bg-[#00f0ff]' : 'bg-[#43ffbb] group-hover:scale-125'
                }`}
              ></span>

              {/* Ocean Label Pill */}
              <div
                className={`absolute left-5 top-1/2 -translate-y-1/2 font-mono text-xs px-2.5 py-1 rounded-md shadow-2xl backdrop-blur-md transition-all duration-300 whitespace-nowrap flex items-center gap-2 border ${
                  isHovered
                    ? 'bg-[#00f0ff] text-[#00363a] font-bold border-[#00f0ff] scale-105 shadow-[#00f0ff]/40'
                    : 'bg-[#010e24]/90 text-[#43ffbb] border-[#00e2a0]/40 hover:border-[#00f0ff]'
                }`}
              >
                <span>{basin.name}</span>
                <span className={`text-[10px] font-bold ${isHovered ? 'text-[#00363a]' : 'text-[#dbfcff]'}`}>
                  {basin.sst}°C
                </span>
                <ArrowUpRight className={`w-3 h-3 ${isHovered ? 'text-[#00363a]' : 'text-[#00f0ff]'}`} />
              </div>
            </div>
          </div>
        );
      })}

      {/* Floating Hover Card for Gentle Highlighted Region */}
      {false && hoveredBasin && hoveredScreenPos && (
        <div
          style={{
            left: `${Math.min(window.innerWidth - 320, Math.max(20, hoveredScreenPos.x - 140))}px`,
            top: `${Math.min(window.innerHeight - 240, Math.max(80, hoveredScreenPos.y + 40))}px`,
          }}
          className="absolute z-30 pointer-events-none w-72 bg-[#0d1c32]/95 backdrop-blur-xl border border-[#00f0ff]/40 rounded-xl p-4 shadow-2xl shadow-[#00f0ff]/20 animate-in fade-in zoom-in-95 duration-200"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-mono text-[10px] font-bold text-[#43ffbb] uppercase tracking-wider">
              {hoveredBasin.zone}
            </span>
            <span className="font-mono text-[10px] bg-[#00f0ff]/15 text-[#00f0ff] px-1.5 py-0.5 rounded font-bold border border-[#00f0ff]/30">
              TARGET BASIN
            </span>
          </div>
          <h3 className="text-base font-bold text-white mb-1 flex items-center gap-1.5">
            <Waves className="w-4 h-4 text-[#00f0ff]" />
            {hoveredBasin.name}
          </h3>
          <p className="text-xs text-[#b9cacb] mb-3 leading-relaxed">
            {hoveredBasin.subtext}
          </p>

          <div className="grid grid-cols-2 gap-2 text-xs font-mono mb-3 bg-[#041329]/80 p-2 rounded-lg border border-white/5">
            <div>
              <div className="text-[10px] text-[#b9cacb]">SST</div>
              <div className="text-[#00f0ff] font-bold">{hoveredBasin.sst}°C</div>
            </div>
            <div>
              <div className="text-[10px] text-[#b9cacb]">SALINITY</div>
              <div className="text-[#43ffbb] font-bold">{hoveredBasin.salinity} PSU</div>
            </div>
            <div>
              <div className="text-[10px] text-[#b9cacb]">CURRENTS</div>
              <div className="text-[#d6e3ff] font-bold">{hoveredBasin.flowVelocity} m/s</div>
            </div>
            <div>
              <div className="text-[10px] text-[#b9cacb]">ACTIVE FLOATS</div>
              <div className="text-[#ffb703] font-bold">{hoveredBasin.activeFloats}</div>
            </div>
          </div>

          <div className="flex items-center justify-center gap-1.5 py-1.5 px-3 bg-[#00f0ff] text-[#00363a] font-mono text-xs font-bold rounded-lg shadow-lg">
            <span>Click to dive into 3D Ocean</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </div>
        </div>
      )}

      {/* Floating Tactical Reticle / Corner Accents */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-8 h-8 flex items-center justify-center opacity-25">
          <div className="w-full h-px bg-[#00f0ff]"></div>
          <div className="h-full w-px bg-[#00f0ff] absolute"></div>
        </div>
        <div className="absolute top-6 left-6 w-5 h-5 border-t border-l border-[#00f0ff]/30"></div>
        <div className="absolute top-6 right-6 w-5 h-5 border-t border-r border-[#00f0ff]/30"></div>
        <div className="absolute bottom-6 left-6 w-5 h-5 border-b border-l border-[#00f0ff]/30"></div>
        <div className="absolute bottom-6 right-6 w-5 h-5 border-b border-r border-[#00f0ff]/30"></div>
      </div>
    </div>
  );
};
