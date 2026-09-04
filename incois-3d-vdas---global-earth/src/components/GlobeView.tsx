import React, { useEffect, useRef, useState, useMemo } from 'react';
import * as THREE from 'three';
import { BasinTarget, OpticsSettings, SensorNode, SatelliteTrack } from '../types';

interface GlobeViewProps {
  activeBasin: BasinTarget;
  onSelectBasin: (basin: BasinTarget) => void;
  optics: OpticsSettings;
  sensorNodes: SensorNode[];
  satellites: SatelliteTrack[];
}

export const GlobeView: React.FC<GlobeViewProps> = ({
  activeBasin,
  onSelectBasin,
  optics,
  sensorNodes,
  satellites,
}) => {
  const mountRef = useRef<HTMLDivElement>(null);
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | THREE.OrthographicCamera | null>(null);
  const globeGroupRef = useRef<THREE.Group | null>(null);
  const globeMeshRef = useRef<THREE.Mesh | null>(null);
  const cloudsMeshRef = useRef<THREE.Mesh | null>(null);
  const dirLightRef = useRef<THREE.DirectionalLight | null>(null);
  const ambientLightRef = useRef<THREE.AmbientLight | null>(null);
  const particlesRef = useRef<THREE.Points | null>(null);

  // Dragging state
  const isDraggingRef = useRef(false);
  const previousMousePositionRef = useRef({ x: 0, y: 0 });
  const targetRotationRef = useRef({ x: 0.2, y: -1.35 });
  const currentRotationRef = useRef({ x: 0.2, y: -1.35 });
  const [cameraDistance, setCameraDistance] = useState<number>(4.2);

  // Projected 2D screen positions for sensor nodes
  const [projectedMarkers, setProjectedMarkers] = useState<
    { id: string; name: string; x: number; y: number; visible: boolean; type: string; sst: number }[]
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

  // Convert target basin coordinates to globe rotation
  useEffect(() => {
    if (activeBasin) {
      const targetY = -(activeBasin.lon * (Math.PI / 180)) - Math.PI / 2;
      const targetX = activeBasin.lat * (Math.PI / 180);
      targetRotationRef.current = { x: targetX, y: targetY };
    }
  }, [activeBasin]);

  // Handle zoom adjustment
  useEffect(() => {
    const dist = 4.2 / (optics.opticalMagnification || 1.4);
    setCameraDistance(dist);
    if (cameraRef.current && cameraRef.current instanceof THREE.PerspectiveCamera) {
      cameraRef.current.position.z = dist;
    }
  }, [optics.opticalMagnification]);

  // Handle dynamic bathymetry scale
  useEffect(() => {
    if (globeMeshRef.current) {
      const scale = optics.bathymetryExaggeration
        ? 1 + (optics.bathymetryExaggeration - 1) * 0.04
        : 1;
      globeMeshRef.current.scale.set(scale, scale, scale);
    }
  }, [optics.bathymetryExaggeration]);

  // Build high-definition procedural bathymetric earth texture
  const earthTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 1024;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    // 1. Deep Ocean abyss background
    const oceanGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
    oceanGrad.addColorStop(0, '#041026');
    oceanGrad.addColorStop(0.5, '#020b1c');
    oceanGrad.addColorStop(1, '#041026');
    ctx.fillStyle = oceanGrad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 2. Bathymetric deep ocean trenches and basins gradient rings
    const drawBasinDeep = (cx: number, cy: number, rx: number, ry: number, color: string) => {
      ctx.save();
      const radGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, rx);
      radGrad.addColorStop(0, color);
      radGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = radGrad;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const toPx = (lon: number, lat: number) => ({
      x: ((lon + 180) / 360) * canvas.width,
      y: ((90 - lat) / 180) * canvas.height,
    });

    // Indian Ocean Bathymetric depths
    const bob = toPx(88, 14);
    drawBasinDeep(bob.x, bob.y, 160, 140, '#00f0ff14');
    const as = toPx(65, 15);
    drawBasinDeep(as.x, as.y, 170, 130, '#00e2a014');
    const cio = toPx(75, -10);
    drawBasinDeep(cio.x, cio.y, 240, 200, '#00dbe918');
    const sunda = toPx(95, -5);
    drawBasinDeep(sunda.x, sunda.y, 180, 100, '#00f0ff1a');

    // 3. Bathymetric contour ridge lines
    ctx.strokeStyle = '#00f0ff1f';
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 6; i++) {
      ctx.beginPath();
      ctx.ellipse(cio.x, cio.y, 60 + i * 35, 40 + i * 25, 0.4, 0, Math.PI * 2);
      ctx.stroke();
    }

    // 4. Continents & Landmasses representation (Stylized Oceanic HUD Cartography)
    ctx.fillStyle = '#0a1e38';
    ctx.strokeStyle = '#00f0ff88';
    ctx.lineWidth = 1.8;

    const drawPoly = (coords: [number, number][], fill = true) => {
      if (coords.length === 0) return;
      ctx.beginPath();
      const p0 = toPx(coords[0][0], coords[0][1]);
      ctx.moveTo(p0.x, p0.y);
      for (let i = 1; i < coords.length; i++) {
        const p = toPx(coords[i][0], coords[i][1]);
        ctx.lineTo(p.x, p.y);
      }
      ctx.closePath();
      if (fill) ctx.fill();
      ctx.stroke();
    };

    // Indian Subcontinent
    drawPoly([
      [68, 24], [72, 21], [73, 16], [76, 10], [78, 8], [80, 10], [80, 13], 
      [82, 16], [85, 20], [89, 22], [92, 21], [90, 25], [86, 26], [80, 28], 
      [74, 32], [70, 28], [68, 24]
    ]);

    // Sri Lanka
    drawPoly([[80, 9.8], [81.8, 8.5], [81.5, 6.2], [79.8, 7.5], [80, 9.8]]);

    // Arabian Peninsula
    drawPoly([
      [40, 28], [50, 30], [56, 26], [60, 22], [58, 17], [53, 16], [45, 12], 
      [43, 14], [40, 20], [36, 22], [40, 28]
    ]);

    // Horn of Africa & East Africa
    drawPoly([
      [43, 12], [51, 12], [49, 8], [42, -2], [39, -6], [40, -11], [35, -17], 
      [32, -26], [28, -32], [18, -34], [18, -15], [30, -5], [35, 10], [43, 12]
    ]);

    // Madagascar
    drawPoly([[44, -12], [50, -15], [47, -25], [43, -25], [44, -12]]);

    // Southeast Asia & Indonesian Archipelago
    drawPoly([
      [98, 22], [103, 18], [108, 12], [105, 8], [100, 7], [98, 10], [98, 16], [98, 22]
    ]);
    drawPoly([[95, 5], [100, 0], [105, -5], [103, -7], [97, -2], [95, 5]]); // Sumatra
    drawPoly([[106, -6], [114, -8], [112, -9], [105, -7], [106, -6]]); // Java
    drawPoly([[109, 6], [118, 5], [116, -3], [110, -1], [109, 6]]); // Borneo
    drawPoly([[119, 1], [125, -2], [122, -5], [119, 1]]); // Sulawesi

    // Australia & Western Shelf
    drawPoly([
      [114, -22], [122, -16], [130, -12], [136, -12], [142, -10], [146, -15], 
      [150, -24], [148, -36], [138, -35], [128, -32], [115, -34], [113, -26], [114, -22]
    ]);

    // Eurasia / Northern boundary
    drawPoly([
      [30, 42], [50, 45], [70, 50], [90, 50], [120, 48], [130, 40], [120, 32], 
      [105, 24], [92, 26], [74, 35], [55, 36], [35, 38], [30, 42]
    ]);

    // 5. Glowing coastal shelf fringes
    ctx.strokeStyle = '#00e2a040';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 6. Graticules (Latitude & Longitude grid lines)
    ctx.strokeStyle = '#00f0ff22';
    ctx.lineWidth = 0.8;
    ctx.setLineDash([4, 6]);

    for (let lat = -60; lat <= 60; lat += 30) {
      const y = ((90 - lat) / 180) * canvas.height;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvas.width, y);
      ctx.stroke();
    }
    for (let lon = -180; lon <= 180; lon += 30) {
      const x = ((lon + 180) / 360) * canvas.width;
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvas.height);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    const texture = new THREE.CanvasTexture(canvas);
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.ClampToEdgeWrapping;
    return texture;
  }, []);

  // Clouds texture
  const cloudsTexture = useMemo(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');
    if (!ctx) return new THREE.CanvasTexture(canvas);

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (let i = 0; i < 40; i++) {
      const x = Math.random() * canvas.width;
      const y = (0.2 + Math.random() * 0.6) * canvas.height;
      const rx = 60 + Math.random() * 120;
      const ry = 15 + Math.random() * 30;
      const grad = ctx.createRadialGradient(x, y, 0, x, y, rx);
      grad.addColorStop(0, '#ffffff44');
      grad.addColorStop(0.5, '#7df4ff22');
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

  // Main Three.js setup
  useEffect(() => {
    const container = canvasContainerRef.current;
    if (!container) return;

    const width = container.clientWidth || window.innerWidth || 800;
    const height = container.clientHeight || window.innerHeight || 600;
    const aspect = width / height;

    // 1. Scene
    const scene = new THREE.Scene();
    sceneRef.current = scene;

    // 2. Camera
    let camera: THREE.PerspectiveCamera | THREE.OrthographicCamera;
    if (optics.projection === 'ORTHOGRAPHIC') {
      const frustumSize = 3.6;
      camera = new THREE.OrthographicCamera(
        (frustumSize * aspect) / -2,
        (frustumSize * aspect) / 2,
        frustumSize / 2,
        frustumSize / -2,
        0.1,
        1000
      );
    } else {
      camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    }
    camera.position.z = cameraDistance;
    cameraRef.current = camera;

    // 3. Renderer
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.1;

    // Safely append canvas
    container.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // 4. Globe Root Group
    const globeGroup = new THREE.Group();
    scene.add(globeGroup);
    globeGroupRef.current = globeGroup;

    // 5. Earth Sphere Mesh
    const sphereRadius = 1.25;
    const globeGeo = new THREE.SphereGeometry(sphereRadius, 64, 64);
    const globeMat = new THREE.MeshStandardMaterial({
      map: earthTexture,
      roughness: 0.7,
      metalness: 0.15,
      bumpScale: 0.05,
    });
    const globeMesh = new THREE.Mesh(globeGeo, globeMat);
    const initialExaggeration = optics.bathymetryExaggeration
      ? 1 + (optics.bathymetryExaggeration - 1) * 0.04
      : 1;
    globeMesh.scale.set(initialExaggeration, initialExaggeration, initialExaggeration);
    globeGroup.add(globeMesh);
    globeMeshRef.current = globeMesh;

    // 6. Glowing Atmospheric Shell (Cyan Fresnel)
    const atmosGeo = new THREE.SphereGeometry(sphereRadius * 1.025, 48, 48);
    const atmosMat = new THREE.ShaderMaterial({
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
          float intensity = pow(0.75 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.2);
          gl_FragColor = vec4(0.0, 0.94, 1.0, 1.0) * intensity * 0.55;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const atmosMesh = new THREE.Mesh(atmosGeo, atmosMat);
    scene.add(atmosMesh);

    // 7. Outer Atmospheric Cyan Glow (Soft Halo)
    const haloGeo = new THREE.SphereGeometry(sphereRadius * 1.15, 32, 32);
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
          float intensity = pow(0.55 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 3.0);
          gl_FragColor = vec4(0.0, 0.86, 0.95, 0.3) * intensity;
        }
      `,
      blending: THREE.AdditiveBlending,
      side: THREE.BackSide,
      transparent: true,
    });
    const haloMesh = new THREE.Mesh(haloGeo, haloMat);
    scene.add(haloMesh);

    // 8. Cloud Layer Mesh
    const cloudsGeo = new THREE.SphereGeometry(sphereRadius * 1.015, 48, 48);
    const cloudsMat = new THREE.MeshStandardMaterial({
      map: cloudsTexture,
      transparent: true,
      opacity: optics.cloudCover ? 0.45 : 0.0,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const cloudsMesh = new THREE.Mesh(cloudsGeo, cloudsMat);
    globeGroup.add(cloudsMesh);
    cloudsMeshRef.current = cloudsMesh;

    // 9. Coordinate rings (Equator, 15N, 15S, etc.)
    const createLatRing = (lat: number, color: string, dashSize: number) => {
      const phi = (90 - lat) * (Math.PI / 180);
      const r = sphereRadius * Math.sin(phi) * 1.002;
      const y = sphereRadius * Math.cos(phi) * 1.002;
      const curve = new THREE.EllipseCurve(0, 0, r, r, 0, 2 * Math.PI, false, 0);
      const points = curve.getPoints(80);
      const geometry = new THREE.BufferGeometry().setFromPoints(
        points.map((p) => new THREE.Vector3(p.x, y, p.y))
      );
      const material = new THREE.LineDashedMaterial({
        color: new THREE.Color(color),
        dashSize: dashSize,
        gapSize: dashSize * 0.8,
        transparent: true,
        opacity: 0.35,
      });
      const line = new THREE.Line(geometry, material);
      line.computeLineDistances();
      return line;
    };
    globeGroup.add(createLatRing(0, '#00f0ff', 0.04));
    globeGroup.add(createLatRing(15, '#00f0ff', 0.03));
    globeGroup.add(createLatRing(-15, '#00f0ff', 0.03));
    globeGroup.add(createLatRing(30, '#00e2a0', 0.025));

    // 10. Ocean Currents Streamline Particles (HYCOM 1/12°)
    const particleCount = 650;
    const particleGeo = new THREE.BufferGeometry();
    const particlePos = new Float32Array(particleCount * 3);
    const particleVelocities: { lat: number; lon: number; speed: number }[] = [];

    for (let i = 0; i < particleCount; i++) {
      const lat = Math.random() * 48 - 24;
      const lon = 52 + Math.random() * 50;
      const v = latLonToVector3(lat, lon, sphereRadius * 1.004);
      particlePos[i * 3] = v.x;
      particlePos[i * 3 + 1] = v.y;
      particlePos[i * 3 + 2] = v.z;
      particleVelocities.push({
        lat,
        lon,
        speed: 0.08 + Math.random() * 0.15,
      });
    }
    particleGeo.setAttribute('position', new THREE.BufferAttribute(particlePos, 3));
    const particleMat = new THREE.PointsMaterial({
      color: 0x00f0ff,
      size: 0.022,
      transparent: true,
      opacity: 0.75,
      blending: THREE.AdditiveBlending,
    });
    const particles = new THREE.Points(particleGeo, particleMat);
    globeGroup.add(particles);
    particlesRef.current = particles;

    // 11. Satellite Trajectory Orbits (Oceansat-3 & Sentinel-6)
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
        opacity: 0.65,
      });
      const line = new THREE.Line(geometry, material);
      line.rotation.x = Math.PI / 2.3;
      line.rotation.y = (tiltDeg * Math.PI) / 180;
      line.computeLineDistances();
      return line;
    };

    const oceansatOrbit = createOrbitLine(sphereRadius * 1.35, -28, '#00e2a0');
    scene.add(oceansatOrbit);
    const sentinelOrbit = createOrbitLine(sphereRadius * 1.5, 38, '#00f0ff');
    scene.add(sentinelOrbit);

    const satGeo = new THREE.BoxGeometry(0.04, 0.015, 0.06);
    const sat1Mat = new THREE.MeshBasicMaterial({ color: 0x00e2a0 });
    const sat1Mesh = new THREE.Mesh(satGeo, sat1Mat);
    scene.add(sat1Mesh);

    const sat2Mat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
    const sat2Mesh = new THREE.Mesh(satGeo, sat2Mat);
    scene.add(sat2Mesh);

    // 12. Lights
    const ambientLight = new THREE.AmbientLight(
      optics.dayNightTerminator ? 0x07152b : 0x5b7aa6,
      optics.dayNightTerminator ? 0.7 : 1.4
    );
    scene.add(ambientLight);
    ambientLightRef.current = ambientLight;

    const dirLight = new THREE.DirectionalLight(0xffffff, optics.dayNightTerminator ? 2.4 : 1.2);
    dirLight.position.set(4, 2, 3);
    scene.add(dirLight);
    dirLightRef.current = dirLight;

    const fillLight = new THREE.DirectionalLight(0x00f0ff, 0.4);
    fillLight.position.set(-4, -1, -2);
    scene.add(fillLight);

    // Resize Handler
    const handleResize = () => {
      if (!canvasContainerRef.current || !rendererRef.current || !cameraRef.current) return;
      const w = canvasContainerRef.current.clientWidth || 800;
      const h = canvasContainerRef.current.clientHeight || 600;
      if (w <= 0 || h <= 0) return;
      const asp = w / h;
      if (cameraRef.current instanceof THREE.PerspectiveCamera) {
        cameraRef.current.aspect = asp;
        cameraRef.current.updateProjectionMatrix();
      } else if (cameraRef.current instanceof THREE.OrthographicCamera) {
        const frustum = 3.6;
        cameraRef.current.left = (-frustum * asp) / 2;
        cameraRef.current.right = (frustum * asp) / 2;
        cameraRef.current.top = frustum / 2;
        cameraRef.current.bottom = -frustum / 2;
        cameraRef.current.updateProjectionMatrix();
      }
      rendererRef.current.setSize(w, h);
    };
    window.addEventListener('resize', handleResize);

    // 13. Animation Loop using performance.now() (avoids deprecated THREE.Clock)
    let animationFrameId: number;
    const startTime = performance.now();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const now = performance.now();
      const elapsed = (now - startTime) * 0.001;

      // Smooth camera/globe rotation toward target
      currentRotationRef.current.x += (targetRotationRef.current.x - currentRotationRef.current.x) * 0.08;
      currentRotationRef.current.y += (targetRotationRef.current.y - currentRotationRef.current.y) * 0.08;

      if (globeGroupRef.current) {
        globeGroupRef.current.rotation.x = currentRotationRef.current.x;
        globeGroupRef.current.rotation.y = currentRotationRef.current.y;
      }

      if (cloudsMeshRef.current && optics.cloudCover) {
        cloudsMeshRef.current.rotation.y += 0.0004;
      }

      if (particlesRef.current) {
        const positions = particlesRef.current.geometry.attributes.position.array as Float32Array;
        for (let i = 0; i < particleCount; i++) {
          const p = particleVelocities[i];
          p.lon += p.speed * 0.15;
          if (p.lon > 110) p.lon = 52;
          const v = latLonToVector3(p.lat, p.lon, sphereRadius * 1.004);
          positions[i * 3] = v.x;
          positions[i * 3 + 1] = v.y;
          positions[i * 3 + 2] = v.z;
        }
        particlesRef.current.geometry.attributes.position.needsUpdate = true;
      }

      // Orbit satellites around Earth
      const satAngle1 = elapsed * 0.35;
      const r1 = sphereRadius * 1.35;
      sat1Mesh.position.set(
        Math.cos(satAngle1) * r1,
        Math.sin(satAngle1) * r1 * 0.75,
        Math.sin(satAngle1) * 0.3
      );
      sat1Mesh.rotation.z = satAngle1 + Math.PI / 2;

      const satAngle2 = -elapsed * 0.28 + 2.0;
      const r2 = sphereRadius * 1.5;
      sat2Mesh.position.set(
        Math.cos(satAngle2) * r2 * 0.8,
        Math.sin(satAngle2) * r2,
        Math.cos(satAngle2) * 0.5
      );
      sat2Mesh.rotation.z = satAngle2;

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
  }, [optics.projection, earthTexture, cloudsTexture]);

  // Update dynamic lights & cloud visibility without recreating scene
  useEffect(() => {
    if (cloudsMeshRef.current) {
      cloudsMeshRef.current.visible = optics.cloudCover;
    }
    if (ambientLightRef.current && dirLightRef.current) {
      if (optics.dayNightTerminator) {
        ambientLightRef.current.color.setHex(0x07152b);
        ambientLightRef.current.intensity = 0.7;
        dirLightRef.current.intensity = 2.4;
      } else {
        ambientLightRef.current.color.setHex(0x5b7aa6);
        ambientLightRef.current.intensity = 1.4;
        dirLightRef.current.intensity = 1.2;
      }
    }
  }, [optics.cloudCover, optics.dayNightTerminator]);

  // Mouse / Drag Handlers
  const handleMouseDown = (e: React.MouseEvent) => {
    isDraggingRef.current = true;
    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDraggingRef.current) return;
    const deltaX = e.clientX - previousMousePositionRef.current.x;
    const deltaY = e.clientY - previousMousePositionRef.current.y;

    targetRotationRef.current = {
      x: Math.max(-1.2, Math.min(1.2, targetRotationRef.current.x + deltaY * 0.005)),
      y: targetRotationRef.current.y + deltaX * 0.005,
    };

    previousMousePositionRef.current = { x: e.clientX, y: e.clientY };
  };

  const handleMouseUp = () => {
    isDraggingRef.current = false;
  };

  // Touch Handlers for mobile navigation
  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      isDraggingRef.current = true;
      previousMousePositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDraggingRef.current || e.touches.length !== 1) return;
    const deltaX = e.touches[0].clientX - previousMousePositionRef.current.x;
    const deltaY = e.touches[0].clientY - previousMousePositionRef.current.y;

    targetRotationRef.current = {
      x: Math.max(-1.2, Math.min(1.2, targetRotationRef.current.x + deltaY * 0.005)),
      y: targetRotationRef.current.y + deltaX * 0.005,
    };

    previousMousePositionRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  // 3D Globe Hotspots 2D Screen Positions Projection
  useEffect(() => {
    const updateMarkerPositions = () => {
      if (!cameraRef.current || !globeGroupRef.current || !mountRef.current) return;
      const w = mountRef.current.clientWidth;
      const h = mountRef.current.clientHeight;
      if (w <= 0 || h <= 0) return;

      const radius = 1.25 * (optics.bathymetryExaggeration ? 1 + (optics.bathymetryExaggeration - 1) * 0.04 : 1);

      try {
        const markers = sensorNodes.map((node) => {
          const v = latLonToVector3(node.lat, node.lon, radius);
          v.applyEuler(new THREE.Euler(currentRotationRef.current.x, currentRotationRef.current.y, 0));
          
          const isFacing = v.z > -0.1;
          v.project(cameraRef.current!);
          const x = ((v.x + 1) * w) / 2;
          const y = ((-v.y + 1) * h) / 2;

          return {
            id: node.id,
            name: node.name,
            type: node.type,
            sst: node.sst,
            x,
            y,
            visible: isFacing && !isNaN(x) && !isNaN(y) && x > 0 && x < w && y > 0 && y < h,
          };
        });

        setProjectedMarkers(markers);
      } catch (err) {
        console.warn('Marker projection caught:', err);
      }
    };

    const interval = setInterval(updateMarkerPositions, 60);
    return () => clearInterval(interval);
  }, [sensorNodes, optics.bathymetryExaggeration]);

  return (
    <div
      ref={mountRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleMouseUp}
      className="relative w-full h-full cursor-grab active:cursor-grabbing select-none overflow-hidden touch-none"
    >
      {/* Dedicated canvas mount point */}
      <div ref={canvasContainerRef} className="absolute inset-0 z-0 pointer-events-none" />

      {/* 2D Projected Hotspot Pin Overlay */}
      {projectedMarkers.map((marker) => {
        if (!marker.visible) return null;

        return (
          <div
            key={marker.id}
            style={{
              left: `${marker.x}px`,
              top: `${marker.y}px`,
              transform: 'translate(-50%, -50%)',
            }}
            className="absolute z-20 pointer-events-auto cursor-pointer group"
            onClick={() => {
              if (marker.id === 'BOB-04') onSelectBasin({ ...activeBasin, id: 'target-bob' });
            }}
          >
            <div className="relative flex items-center justify-center">
              <span className="absolute w-6 h-6 rounded-full bg-[#00e2a0]/40 animate-ping"></span>
              <span
                className={`w-2.5 h-2.5 rounded-full ring-2 ring-[#041329] shadow-lg transition-transform group-hover:scale-125 ${
                  marker.type === 'OMNI'
                    ? 'bg-[#43ffbb]'
                    : marker.type === 'BPR'
                    ? 'bg-[#ff4d6d]'
                    : 'bg-[#00f0ff]'
                }`}
              ></span>
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2 font-mono text-[10px] text-[#43ffbb] bg-[#010e24]/90 border border-[#00e2a0]/40 px-1.5 py-0.5 rounded shadow-xl whitespace-nowrap backdrop-blur pointer-events-none flex items-center gap-1">
                <span>{marker.id}</span>
                <span className="text-[#dbfcff] font-bold">[{marker.sst}°C]</span>
              </div>
            </div>
          </div>
        );
      })}

      {/* Floating Tactical Reticle / Target Corners */}
      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
        <div className="w-10 h-10 flex items-center justify-center opacity-30">
          <div className="w-full h-px bg-[#00f0ff]"></div>
          <div className="h-full w-px bg-[#00f0ff] absolute"></div>
        </div>
        <div className="absolute top-6 left-6 w-5 h-5 border-t border-l border-[#00f0ff]/40"></div>
        <div className="absolute top-6 right-6 w-5 h-5 border-t border-r border-[#00f0ff]/40"></div>
        <div className="absolute bottom-6 left-6 w-5 h-5 border-b border-l border-[#00f0ff]/40"></div>
        <div className="absolute bottom-6 right-6 w-5 h-5 border-b border-r border-[#00f0ff]/40"></div>
      </div>
    </div>
  );
};
