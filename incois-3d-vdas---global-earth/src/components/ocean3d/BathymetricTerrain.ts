import * as THREE from 'three';

// Fast coherent hash-based 2D value noise with cubic Hermite interpolation
function hash2d(x: number, y: number): number {
  const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, y: number): number {
  const i = Math.floor(x);
  const j = Math.floor(y);
  const fx = x - i;
  const fy = y - j;

  // Cubic Hermite curve
  const u = fx * fx * (3.0 - 2.0 * fx);
  const v = fy * fy * (3.0 - 2.0 * fy);

  const a = hash2d(i, j);
  const b = hash2d(i + 1.0, j);
  const c = hash2d(i, j + 1.0);
  const d = hash2d(i + 1.0, j + 1.0);

  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

// Fractal Brownian Motion (fBm) with 5 octaves
function fbm(x: number, y: number, octaves = 5): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let totalAmp = 0;

  for (let i = 0; i < octaves; i++) {
    value += smoothNoise(x * frequency, y * frequency) * amplitude;
    totalAmp += amplitude;
    frequency *= 2.02;
    amplitude *= 0.5;
  }
  return value / totalAmp;
}

// Sharp Ridge Noise for tectonic scarps and mid-ocean ridges
function ridgeNoise(x: number, y: number, octaves = 4): number {
  let value = 0;
  let amplitude = 0.5;
  let frequency = 1.0;
  let prev = 1.0;

  for (let i = 0; i < octaves; i++) {
    let n = smoothNoise(x * frequency, y * frequency);
    n = 1.0 - Math.abs(2.0 * n - 1.0); // sharp inverted crest
    n = n * n; // sharpen ridges
    value += n * amplitude * prev;
    prev = n;
    frequency *= 2.04;
    amplitude *= 0.5;
  }
  return value;
}

/**
 * Calculates authentic bathymetric seafloor displacement in normalized [-0.5, 0.5] space.
 * Models realistic geological features:
 * - Continental shelf & slope (coastal margin)
 * - Tectonic Mid-Ocean Ridges (Ninety East Ridge, Carlsberg Ridge, Central Indian Ridge)
 * - Deep Subduction Trenches (Sunda/Java Trench)
 * - Submarine Canyons & Abyssal Channels (Swatch of No Ground / Bengal Fan)
 * - Volcanic Seamounts, Guyots, and Abyssal Hills
 */
export function getBathymetricElevation(
  u: number, // [-0.5, 0.5]
  v: number, // [-0.5, 0.5]
  basinId = 'target-bob'
): number {
  // Clamp boundaries safely
  const cu = Math.max(-0.5, Math.min(0.5, u));
  const cv = Math.max(-0.5, Math.min(0.5, v));

  let macroElevation = 0;

  if (basinId.includes('bob')) {
    // 1. Bay of Bengal Bathymetry:
    // - North: Ganges-Brahmaputra continental shelf break and slope
    // - East (u around 0.3 to 0.42): Ninety East Ridge (high linear volcanic ridge)
    // - Southeast (u > 0.35, v > 0.25): Sunda Trench (plunging deep trench)
    // - Northwest: Continental slope of the Indian East Coast (Krishna-Godavari slope)
    // - Central: Bengal Deep-Sea Fan channel levees

    // Northern continental shelf (v < -0.32)
    const shelfNorth = Math.max(0, -cv - 0.2) * 1.8;
    // Submarine canyon (Swatch of No Ground cutting into northern shelf)
    const canyonDist = Math.abs(cu - 0.04) + Math.max(0, -cv - 0.35) * 0.5;
    const canyon = Math.exp(-canyonDist * canyonDist * 160) * 0.42;

    // Ninety East Ridge (linear ridge running north-south near u = 0.36)
    const ridgeDist = Math.abs(cu - 0.36);
    const ninetyEastRidge = Math.exp(-ridgeDist * ridgeDist * 120) * 0.48;

    // Sunda / Java Subduction Trench in Southeast
    const trenchDist = Math.hypot(cu - 0.44, cv - 0.42);
    const sundaTrench = Math.exp(-trenchDist * trenchDist * 40) * -0.55;

    // Western continental margin (India coast)
    const westSlope = Math.max(0, -cu - 0.28) * 0.95;

    // Seamount knolls
    const seamount1 = Math.exp(-(Math.pow(cu + 0.12, 2) + Math.pow(cv - 0.08, 2)) * 140) * 0.32;
    const seamount2 = Math.exp(-(Math.pow(cu - 0.15, 2) + Math.pow(cv + 0.18, 2)) * 180) * 0.26;

    macroElevation = shelfNorth - canyon + ninetyEastRidge + sundaTrench + westSlope + seamount1 + seamount2;
  } else if (basinId.includes('as')) {
    // 2. Arabian Sea Bathymetry:
    // - Southwest to Central: Carlsberg Mid-Ocean Ridge running diagonally
    // - Northwest: Murray Ridge & Owen Fracture Zone
    // - East: Western Ghats / Konkan continental shelf
    // - Central Arabian Basin: abyssal plain with seamounts

    // Diagonal Carlsberg Ridge
    const ridgeAxis = Math.abs((cu * 0.8 + cv * 0.6) - 0.05);
    const carlsbergRidge = Math.exp(-ridgeAxis * ridgeAxis * 75) * 0.46;

    // Eastern Indian continental shelf
    const eastShelf = Math.max(0, cu - 0.26) * 1.1;

    // Owen fracture trench
    const fractureZone = Math.exp(-Math.pow(cu + 0.38 - cv * 0.4, 2) * 110) * -0.42;

    // Seamounts
    const seamount1 = Math.exp(-(Math.pow(cu - 0.05, 2) + Math.pow(cv + 0.22, 2)) * 160) * 0.34;

    macroElevation = carlsbergRidge + eastShelf + fractureZone + seamount1;
  } else {
    // 3. Equatorial & Central Indian Ocean Bathymetry:
    // - Central Indian Ridge, Chagos-Laccadive Ridge, Afanasy Nikitin Seamount
    // - Wharton Basin and Diamantina fracture depressions

    const chagosRidge = Math.exp(-Math.pow(cu + 0.18, 2) * 90) * 0.52;
    const afanasySeamount = Math.exp(-(Math.pow(cu - 0.22, 2) + Math.pow(cv - 0.15, 2)) * 130) * 0.45;
    const centralRidge = Math.exp(-Math.pow(cu * 0.6 - cv * 0.8 + 0.1, 2) * 80) * 0.38;
    const deepAbyss = Math.exp(-(Math.pow(cu - 0.35, 2) + Math.pow(cv + 0.32, 2)) * 60) * -0.48;

    macroElevation = chagosRidge + afanasySeamount + centralRidge + deepAbyss;
  }

  // Multi-frequency fractal noise for realistic abyssal hills, basalt crags, and sedimentary ripples
  const noiseScale1 = fbm(cu * 4.8 + 12.3, cv * 4.8 + 8.7, 4) * 0.26 - 0.13;
  const noiseScale2 = fbm(cu * 11.2 + 45.1, cv * 11.2 + 23.4, 3) * 0.10 - 0.05;
  const rockyCrags = ridgeNoise(cu * 8.5 + 7.1, cv * 8.5 + 3.2, 3) * 0.14 - 0.07;

  // Gentle basin center depression for realistic abyssal plain
  const basinBowl = (cu * cu + cv * cv) * 0.12;

  // Final balanced elevation (-0.5 to +0.6)
  const total = macroElevation + noiseScale1 + noiseScale2 + rockyCrags - basinBowl;
  return total;
}

/**
 * Returns the exact 3D World Y coordinate of the bathymetric seabed at world (px, pz)
 */
export function getSeafloorWorldY(
  px: number,
  pz: number,
  slabWidth: number,
  slabDepth: number,
  totalBoxHeight: number,
  verticalExaggeration: number,
  basinId = 'target-bob'
): number {
  const normU = px / slabWidth;
  const normV = -pz / slabDepth; // In Three.js, positive Z is South/forward
  const elevation = getBathymetricElevation(normU, normV, basinId);
  const exagFactor = Math.max(1.0, verticalExaggeration / 2.0);

  // Seafloor base sits at -totalBoxHeight.
  // Terrain hills and ridges rise upward into the water column, trenches sink down.
  // We scale displacement so peaks can rise up to ~40-50% of the box height at high exaggeration.
  const worldDisplacement = elevation * (totalBoxHeight * 0.42 * (exagFactor / 1.5));
  return -totalBoxHeight + worldDisplacement;
}

/**
 * Generates a photorealistic PBR seafloor diffuse texture with:
 * - Depth-dependent sediment and rock color grading
 * - Exposed basaltic oceanic crust along ridge crests
 * - Pelagic abyssal clay and manganese crusts in deep plains
 * - Submarine canyon scouring and shelf sands
 */
export function generateSeafloorTexture(basinId: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 1024;
  const ctx = canvas.getContext('2d');

  if (!ctx) {
    return new THREE.CanvasTexture(canvas);
  }

  const imgData = ctx.createImageData(canvas.width, canvas.height);
  const data = imgData.data;

  for (let y = 0; y < canvas.height; y++) {
    const v = (y / canvas.height) - 0.5;
    for (let x = 0; x < canvas.width; x++) {
      const u = (x / canvas.width) - 0.5;

      const elev = getBathymetricElevation(u, v, basinId);
      // Normalized height 0 (trench/abyss) to 1 (high ridge/shelf)
      const hNorm = Math.max(0, Math.min(1, (elev + 0.45) / 1.05));

      // Multi-scale procedural noise for reef biomes, coralline algae patches, and sand ripples
      const reefPatch = smoothNoise((u + 0.5) * 18, (v + 0.5) * 18);
      const algaeNoise = smoothNoise((u + 0.5) * 35, (v + 0.5) * 35);
      const sandRipple = Math.sin((u * 140 + v * 95) + Math.cos(u * 70) * 3.5) * 7;
      const microDetail = (hash2d(x * 0.85, y * 0.85) - 0.5) * 12;

      let r = 0;
      let g = 0;
      let b = 0;

      if (hNorm < 0.22) {
        // Hadal / Deep Trench (Abyssal oceanic obsidian navy with deep violet mineral veins)
        const t = hNorm / 0.22;
        r = 3 + t * 8;
        g = 10 + t * 15;
        b = 26 + t * 30;
      } else if (hNorm < 0.45) {
        // Deep Abyssal & Continental Rise (Pelagic silt with bioluminescent cyan & soft emerald moss patches)
        const t = (hNorm - 0.22) / 0.23;
        const bioSpore = algaeNoise > 0.65 ? 25 : 0;
        r = 8 + t * 14 + (algaeNoise > 0.6 ? 8 : 0);
        g = 26 + t * 32 + bioSpore;
        b = 52 + t * 35 + (bioSpore * 1.3);
      } else if (hNorm < 0.68) {
        // Sub-photic Reef Slopes & Seamounts (Sponges, gorgonian purples, and deep-sea coral formations)
        const t = (hNorm - 0.45) / 0.23;
        if (reefPatch > 0.55) {
          // Rich purple/magenta gorgonian and sponge colonies
          r = 45 + t * 45;
          g = 28 + t * 25;
          b = 75 + t * 40;
        } else {
          // Deep reef basalt with living emerald turf algae
          r = 18 + t * 25;
          g = 52 + t * 50;
          b = 68 + t * 30;
        }
      } else {
        // Shallow Continental Shelf, Bank, & Reef Crest (Vibrant living coral reef, turquoise sands, rose coralline algae)
        const t = (hNorm - 0.68) / 0.32;
        if (reefPatch > 0.60) {
          // Coralline algae rose pink and living coral mantle
          r = 150 + t * 65;
          g = 68 + t * 45;
          b = 105 + t * 35;
        } else if (reefPatch > 0.35) {
          // Lush emerald seagrass and macroalgae meadow
          r = 30 + t * 35;
          g = 135 + t * 65;
          b = 85 + t * 45;
        } else {
          // Warm tropical reef aragonite sand & turquoise shallows
          r = 85 + t * 85;
          g = 155 + t * 65;
          b = 168 + t * 45;
        }
      }

      // Add natural ripple texture and micro grain
      r = Math.max(0, Math.min(255, Math.floor(r + microDetail + sandRipple * 0.35)));
      g = Math.max(0, Math.min(255, Math.floor(g + microDetail + sandRipple * 0.40)));
      b = Math.max(0, Math.min(255, Math.floor(b + microDetail + sandRipple * 0.45)));

      const idx = (y * canvas.width + x) * 4;
      data[idx] = r;
      data[idx + 1] = g;
      data[idx + 2] = b;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

/**
 * Generates an authentic bump map texture to give rocky ridges and micro-relief
 */
export function generateSeafloorBumpMap(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 512;
  const ctx = canvas.getContext('2d');

  if (!ctx) return new THREE.CanvasTexture(canvas);

  const imgData = ctx.createImageData(canvas.width, canvas.height);
  const data = imgData.data;

  for (let y = 0; y < canvas.height; y++) {
    for (let x = 0; x < canvas.width; x++) {
      const u = x / canvas.width;
      const v = y / canvas.height;

      const n1 = smoothNoise(u * 28, v * 28) * 160;
      const n2 = smoothNoise(u * 75, v * 75) * 65;
      const grain = (hash2d(x, y) - 0.5) * 30;

      const val = Math.max(0, Math.min(255, Math.floor(n1 + n2 + grain)));
      const idx = (y * canvas.width + x) * 4;
      data[idx] = val;
      data[idx + 1] = val;
      data[idx + 2] = val;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);

  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(4, 4);
  return texture;
}

export interface BathymetryMeshBundle {
  rootGroup: THREE.Group;
  terrainMesh: THREE.Mesh;
  skirtMesh: THREE.Mesh;
  contourMesh: THREE.LineSegments;
  updateHeightAndExaggeration: (totalHeight: number, verticalExaggeration: number) => void;
  setContoursVisible: (visible: boolean) => void;
  setTerrainVisible: (visible: boolean) => void;
}

/**
 * Constructs the complete 3D Bathymetric Seafloor system:
 * - High-resolution displaced terrain mesh with realistic hills, ridges, valleys, and trenches
 * - Solid geological lithosphere skirt side-walls (geological core block cross-section)
 * - Optional subtle hydrographic isobath contour lines and acoustic sonar grid overlay
 */
export function createRealisticBathymetry(
  slabWidth: number,
  slabDepth: number,
  initialTotalHeight: number,
  initialExaggeration: number,
  basinId: string
): BathymetryMeshBundle {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'bathymetry-root';

  // High-resolution grid for accurate terrain displacement (128 x 128 = 16,384 vertices)
  const segments = 128;
  const terrainGeo = new THREE.PlaneGeometry(slabWidth, slabDepth, segments, segments);
  terrainGeo.rotateX(-Math.PI / 2); // Lay flat in XZ plane

  // Diffuse and Bump textures
  const diffuseTexture = generateSeafloorTexture(basinId);
  const bumpTexture = generateSeafloorBumpMap();

  // Premium PBR Material for living oceanic seabed, corals, bedrock, and sediment
  const terrainMat = new THREE.MeshStandardMaterial({
    map: diffuseTexture,
    bumpMap: bumpTexture,
    bumpScale: 0.035,
    roughness: 0.68,
    metalness: 0.16,
    emissive: new THREE.Color(0x04192b),
    side: THREE.FrontSide,
  });

  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.name = 'bathymetry-terrain-mesh';
  terrainMesh.receiveShadow = true;
  rootGroup.add(terrainMesh);

  // 2. Geological Lithosphere Skirt Walls (Side slabs)
  // These drop from the undulating displaced terrain perimeter down to a flat base bedrock,
  // creating a solid geological crustal block that looks museum-grade when slicing and viewing from angles.
  const skirtMat = new THREE.MeshStandardMaterial({
    color: 0x051324,
    roughness: 0.9,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  // Skirt geometry will be dynamically populated in updateHeightAndExaggeration
  const skirtGeo = new THREE.BufferGeometry();
  const skirtMesh = new THREE.Mesh(skirtGeo, skirtMat);
  skirtMesh.name = 'bathymetry-skirt-mesh';
  rootGroup.add(skirtMesh);

  // 3. Optional Subtle Hydrographic Isobath Contour Overlay
  // Faint cyan lines showing depth relief contours, completely optional overlay
  const contourMat = new THREE.LineBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  const contourGeo = new THREE.BufferGeometry();
  const contourMesh = new THREE.LineSegments(contourGeo, contourMat);
  contourMesh.name = 'bathymetry-contours';
  rootGroup.add(contourMesh);

  // Function to displace vertices based on total height and vertical exaggeration
  const updateHeightAndExaggeration = (totalHeight: number, verticalExaggeration: number) => {
    const pos = terrainGeo.attributes.position;
    const vertexCount = pos.count;
    const exagFactor = Math.max(1.0, verticalExaggeration / 2.0);
    const maxDisplacement = totalHeight * 0.42 * (exagFactor / 1.5);

    // Track perimeter vertices for skirt generation
    const edgeNorth: THREE.Vector3[] = [];
    const edgeSouth: THREE.Vector3[] = [];
    const edgeEast: THREE.Vector3[] = [];
    const edgeWest: THREE.Vector3[] = [];

    const cols = segments + 1;
    const rows = segments + 1;

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const i = r * cols + c;
        const x = pos.getX(i);
        const z = pos.getZ(i);

        const u = x / slabWidth;
        const v = -z / slabDepth;

        const elev = getBathymetricElevation(u, v, basinId);
        const yDisp = elev * maxDisplacement;

        // Position Y is relative to terrain mesh. We set terrainMesh.position.y = -totalHeight
        pos.setY(i, yDisp);

        const worldY = -totalHeight + yDisp;

        // Collect perimeter vertices
        if (r === 0) edgeNorth.push(new THREE.Vector3(x, worldY, z));
        if (r === rows - 1) edgeSouth.push(new THREE.Vector3(x, worldY, z));
        if (c === 0) edgeWest.push(new THREE.Vector3(x, worldY, z));
        if (c === cols - 1) edgeEast.push(new THREE.Vector3(x, worldY, z));
      }
    }

    terrainGeo.computeVertexNormals();
    pos.needsUpdate = true;

    // Position terrain at bottom of volumetric slab
    terrainMesh.position.y = -totalHeight;

    // Rebuild Geological Lithosphere Skirt Walls
    // Drops from edge vertex (x, worldY, z) down to solid bedrock base (x, -totalHeight - 0.2, z)
    const baseBedrockY = -totalHeight - 0.22;
    const skirtVerts: number[] = [];

    const addEdgeQuad = (edge: THREE.Vector3[]) => {
      for (let k = 0; k < edge.length - 1; k++) {
        const p1 = edge[k];
        const p2 = edge[k + 1];

        // Triangle 1: drops from top perimeter to base bedrock
        skirtVerts.push(p1.x, p1.y, p1.z);
        skirtVerts.push(p1.x, baseBedrockY, p1.z);
        skirtVerts.push(p2.x, p2.y, p2.z);

        // Triangle 2
        skirtVerts.push(p2.x, p2.y, p2.z);
        skirtVerts.push(p1.x, baseBedrockY, p1.z);
        skirtVerts.push(p2.x, baseBedrockY, p2.z);
      }
    };

    addEdgeQuad(edgeNorth);
    addEdgeQuad(edgeSouth);
    addEdgeQuad(edgeWest);
    addEdgeQuad(edgeEast);

    skirtGeo.setAttribute('position', new THREE.Float32BufferAttribute(skirtVerts, 3));
    skirtGeo.computeVertexNormals();

    // Rebuild Subtle Hydrographic Isobath Contour Overlay
    // Traces subtle depth contour curves and sonar survey tracks across the 3D bathymetric terrain
    const contourPoints: THREE.Vector3[] = [];

    // 1. Survey transects (every 6th vertex for clean, subtle grid overlay)
    const step = 6;
    for (let r = 0; r < rows; r += step) {
      for (let c = 0; c < cols - 1; c++) {
        const i1 = r * cols + c;
        const i2 = r * cols + (c + 1);
        const p1 = new THREE.Vector3(pos.getX(i1), -totalHeight + pos.getY(i1) + 0.004, pos.getZ(i1));
        const p2 = new THREE.Vector3(pos.getX(i2), -totalHeight + pos.getY(i2) + 0.004, pos.getZ(i2));
        contourPoints.push(p1, p2);
      }
    }

    for (let c = 0; c < cols; c += step) {
      for (let r = 0; r < rows - 1; r++) {
        const i1 = r * cols + c;
        const i2 = (r + 1) * cols + c;
        const p1 = new THREE.Vector3(pos.getX(i1), -totalHeight + pos.getY(i1) + 0.004, pos.getZ(i1));
        const p2 = new THREE.Vector3(pos.getX(i2), -totalHeight + pos.getY(i2) + 0.004, pos.getZ(i2));
        contourPoints.push(p1, p2);
      }
    }

    // 2. Real Isobath Contour Rings (connecting cells crossing depth intervals)
    const isobathLevels = [-0.35, -0.2, -0.05, 0.1, 0.25, 0.4];
    for (const isoLevel of isobathLevels) {
      const targetDisp = isoLevel * maxDisplacement;
      for (let r = 0; r < rows - 1; r += 2) {
        for (let c = 0; c < cols - 1; c += 2) {
          const yTL = pos.getY(r * cols + c);
          const yTR = pos.getY(r * cols + (c + 1));
          const yBL = pos.getY((r + 1) * cols + c);
          const yBR = pos.getY((r + 1) * cols + (c + 1));

          const minCellY = Math.min(yTL, yTR, yBL, yBR);
          const maxCellY = Math.max(yTL, yTR, yBL, yBR);

          if (targetDisp >= minCellY && targetDisp <= maxCellY) {
            // Segment across this quad
            const xMid = (pos.getX(r * cols + c) + pos.getX(r * cols + (c + 1))) / 2;
            const zMid = (pos.getZ(r * cols + c) + pos.getZ((r + 1) * cols + c)) / 2;
            const p1 = new THREE.Vector3(xMid - 0.015, -totalHeight + targetDisp + 0.004, zMid - 0.015);
            const p2 = new THREE.Vector3(xMid + 0.015, -totalHeight + targetDisp + 0.004, zMid + 0.015);
            contourPoints.push(p1, p2);
          }
        }
      }
    }

    contourGeo.setFromPoints(contourPoints);
  };

  // Run initial displacement
  updateHeightAndExaggeration(initialTotalHeight, initialExaggeration);

  const setContoursVisible = (visible: boolean) => {
    contourMesh.visible = visible;
  };

  const setTerrainVisible = (visible: boolean) => {
    terrainMesh.visible = visible;
    skirtMesh.visible = visible;
  };

  return {
    rootGroup,
    terrainMesh,
    skirtMesh,
    contourMesh,
    updateHeightAndExaggeration,
    setContoursVisible,
    setTerrainVisible,
  };
}
