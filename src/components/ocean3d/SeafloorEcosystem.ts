import * as THREE from 'three';
import { getBathymetricElevation, getSeafloorWorldY } from './BathymetricTerrain';

export interface FloraInstance {
  group: THREE.Group;
  baseU: number;
  baseV: number;
  normX: number;
  normZ: number;
  type: 'kelp' | 'seafan' | 'staghorn' | 'brain' | 'tubesponge' | 'seagrass' | 'tablecoral';
  swayFactor: number;
  swaySpeed: number;
  phaseOffset: number;
  swayElements: THREE.Object3D[];
  glowMaterial?: THREE.MeshBasicMaterial | THREE.MeshStandardMaterial;
}

export interface SeafloorEcosystemBundle {
  rootGroup: THREE.Group;
  godRaysGroup: THREE.Group;
  causticsMesh: THREE.Mesh;
  floraList: FloraInstance[];
  updateAnimation: (elapsed: number) => void;
  updateTerrainElevation: (
    slabWidth: number,
    slabDepth: number,
    totalHeight: number,
    verticalExaggeration: number,
    basinId: string
  ) => void;
  setFloraVisible: (visible: boolean) => void;
  setGodRaysVisible: (visible: boolean) => void;
  dispose: () => void;
}

/**
 * Creates animated underwater vegetation, vibrant corals, god rays, and caustic shimmer
 */
export function createSeafloorEcosystem(
  slabWidth: number,
  slabDepth: number,
  totalHeight: number,
  verticalExaggeration: number,
  basinId: string
): SeafloorEcosystemBundle {
  const rootGroup = new THREE.Group();
  rootGroup.name = 'seafloor-ecosystem-root';

  const floraList: FloraInstance[] = [];

  // --------------------------------------------------------------------------
  // 1. Shared Materials & Geometries for high-performance reef rendering
  // --------------------------------------------------------------------------
  // Kelp Materials (translucent amber-olive and vivid emerald)
  const kelpMat1 = new THREE.MeshStandardMaterial({
    color: 0x16a34a,
    emissive: 0x052e16,
    roughness: 0.45,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const kelpMat2 = new THREE.MeshStandardMaterial({
    color: 0x22c55e,
    emissive: 0x064e3b,
    roughness: 0.4,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });

  // Coral Materials (vibrant reef colors: coral pink, neon orange, violet, turquoise, golden amber)
  const staghornMatPink = new THREE.MeshStandardMaterial({
    color: 0xf43f5e,
    emissive: 0x4c0519,
    roughness: 0.6,
    metalness: 0.15,
  });
  const staghornMatOrange = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    emissive: 0x431407,
    roughness: 0.55,
    metalness: 0.15,
  });
  const seaFanMatPurple = new THREE.MeshStandardMaterial({
    color: 0xa855f7,
    emissive: 0x3b0764,
    roughness: 0.5,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  const seaFanMatCyan = new THREE.MeshStandardMaterial({
    color: 0x06b6d4,
    emissive: 0x083344,
    roughness: 0.45,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });
  const brainCoralMat = new THREE.MeshStandardMaterial({
    color: 0x84cc16,
    emissive: 0x1a2e05,
    roughness: 0.75,
    metalness: 0.1,
  });
  const tableCoralMat = new THREE.MeshStandardMaterial({
    color: 0x14b8a6,
    emissive: 0x042f2e,
    roughness: 0.6,
    metalness: 0.15,
    side: THREE.DoubleSide,
  });
  const tubeSpongeMat = new THREE.MeshStandardMaterial({
    color: 0xc084fc,
    emissive: 0x2e1065,
    roughness: 0.5,
    metalness: 0.2,
  });
  const tubeSpongeTipMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
  });
  const seagrassMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    emissive: 0x022c22,
    roughness: 0.35,
    side: THREE.DoubleSide,
  });

  // --------------------------------------------------------------------------
  // 2. Builders for Specific Coral & Flora Archetypes
  // --------------------------------------------------------------------------

  // A. Tall Kelp Forest Cluster (multi-blade undulating fronds with air vesicles)
  function createKelpCluster(heightScale: number): { group: THREE.Group; sways: THREE.Object3D[] } {
    const cluster = new THREE.Group();
    const sways: THREE.Object3D[] = [];

    const numStems = 3 + Math.floor(Math.random() * 3);
    for (let s = 0; s < numStems; s++) {
      const stemGroup = new THREE.Group();
      const ox = (Math.random() - 0.5) * 0.08;
      const oz = (Math.random() - 0.5) * 0.08;
      stemGroup.position.set(ox, 0, oz);

      const stemHeight = (0.28 + Math.random() * 0.18) * heightScale;
      const segments = 5;
      const segLen = stemHeight / segments;

      let parentObj: THREE.Object3D = stemGroup;
      for (let i = 0; i < segments; i++) {
        const segObj = new THREE.Group();
        segObj.position.y = i === 0 ? 0 : segLen;

        // Thin flexible stem segment
        const stemMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.005, 0.007, segLen, 5),
          s % 2 === 0 ? kelpMat1 : kelpMat2
        );
        stemMesh.position.y = segLen / 2;
        segObj.add(stemMesh);

        // Small spherical float bladder (pneumatocyst)
        const bladder = new THREE.Mesh(
          new THREE.SphereGeometry(0.012, 6, 6),
          kelpMat2
        );
        bladder.position.set(0.008, segLen * 0.8, 0);
        segObj.add(bladder);

        // Broad ribbon blade waving from stem
        const bladeGeo = new THREE.PlaneGeometry(0.038, segLen * 1.5, 2, 4);
        bladeGeo.rotateZ(Math.PI / 2);
        const bladeMesh = new THREE.Mesh(bladeGeo, s % 2 === 0 ? kelpMat1 : kelpMat2);
        bladeMesh.position.set(0.024, segLen * 0.8, 0);
        bladeMesh.rotation.y = (s * 1.2 + i * 0.6);
        bladeMesh.rotation.z = 0.35;
        segObj.add(bladeMesh);

        parentObj.add(segObj);
        parentObj = segObj;
        sways.push(segObj);
      }

      cluster.add(stemGroup);
    }
    return { group: cluster, sways };
  }

  // B. Branching Staghorn Coral (calcified branching antler structures)
  function createStaghornCoral(colorVariant: 'pink' | 'orange'): { group: THREE.Group; sways: THREE.Object3D[] } {
    const coralGroup = new THREE.Group();
    const sways: THREE.Object3D[] = [];
    const mat = colorVariant === 'pink' ? staghornMatPink : staghornMatOrange;

    // Central base mound
    const baseMound = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.065, 0.03, 7), mat);
    baseMound.position.y = 0.015;
    coralGroup.add(baseMound);

    const branchCount = 6 + Math.floor(Math.random() * 4);
    for (let b = 0; b < branchCount; b++) {
      const angle = (b / branchCount) * Math.PI * 2 + Math.random() * 0.3;
      const radius = 0.025 + Math.random() * 0.02;
      const branchHeight = 0.12 + Math.random() * 0.09;

      const branchGroup = new THREE.Group();
      branchGroup.position.set(Math.cos(angle) * radius, 0.025, Math.sin(angle) * radius);

      // Main trunk
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.010, 0.016, branchHeight, 6),
        mat
      );
      trunk.position.y = branchHeight / 2;
      branchGroup.add(trunk);

      // Outward splay
      branchGroup.rotation.z = (Math.random() * 0.35 + 0.15) * (Math.cos(angle) >= 0 ? 1 : -1);
      branchGroup.rotation.x = (Math.random() * 0.35 + 0.15) * (Math.sin(angle) >= 0 ? 1 : -1);

      // Sub-branch fork
      const subHeight = branchHeight * 0.55;
      const subFork = new THREE.Mesh(
        new THREE.CylinderGeometry(0.007, 0.011, subHeight, 5),
        mat
      );
      subFork.position.set(0.012, branchHeight * 0.7, 0);
      subFork.rotation.z = 0.5;
      branchGroup.add(subFork);

      // Branch tip fluorescent polyp glow
      const tipGlow = new THREE.Mesh(
        new THREE.SphereGeometry(0.009, 5, 5),
        new THREE.MeshBasicMaterial({ color: colorVariant === 'pink' ? 0xfecdd3 : 0xfed7aa })
      );
      tipGlow.position.set(0, branchHeight, 0);
      branchGroup.add(tipGlow);

      coralGroup.add(branchGroup);
      sways.push(branchGroup);
    }
    return { group: coralGroup, sways };
  }

  // C. Sea Fan (Gorgonian Coral) with delicate lattice fan that sways in current
  function createSeaFan(variant: 'purple' | 'cyan'): { group: THREE.Group; sways: THREE.Object3D[] } {
    const fanGroup = new THREE.Group();
    const sways: THREE.Object3D[] = [];
    const mat = variant === 'purple' ? seaFanMatPurple : seaFanMatCyan;

    const fanMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.12, 14, 0, Math.PI),
      mat
    );
    fanMesh.position.y = 0.04;
    fanMesh.scale.set(1.1, 1.35, 1);
    fanMesh.rotation.y = Math.random() * Math.PI;

    // Small stem
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.014, 0.05, 6), mat);
    stem.position.y = 0.025;
    fanGroup.add(stem);

    // Glowing margin trim
    const rimGeo = new THREE.RingGeometry(0.115, 0.122, 14, 1, 0, Math.PI);
    const rimMat = new THREE.MeshBasicMaterial({
      color: variant === 'purple' ? 0xe879f9 : 0x67e8f9,
      side: THREE.DoubleSide,
    });
    const rimMesh = new THREE.Mesh(rimGeo, rimMat);
    rimMesh.position.set(0, 0, 0.001);
    fanMesh.add(rimMesh);

    fanGroup.add(fanMesh);
    sways.push(fanMesh);
    return { group: fanGroup, sways };
  }

  // D. Table & Plate Coral (Tiered horizontal shelves)
  function createTableCoral(): { group: THREE.Group; sways: THREE.Object3D[] } {
    const tableGroup = new THREE.Group();
    const sways: THREE.Object3D[] = [];

    const baseTrunk = new THREE.Mesh(
      new THREE.CylinderGeometry(0.022, 0.038, 0.09, 7),
      tableCoralMat
    );
    baseTrunk.position.y = 0.045;
    tableGroup.add(baseTrunk);

    // 2 horizontal circular plate tiers
    const tiers = [
      { r: 0.12, y: 0.085, tilt: 0.08 },
      { r: 0.085, y: 0.115, tilt: -0.06 },
    ];
    tiers.forEach((t) => {
      const plateGeo = new THREE.CylinderGeometry(t.r, t.r * 0.9, 0.014, 16);
      const plate = new THREE.Mesh(plateGeo, tableCoralMat);
      plate.position.y = t.y;
      plate.rotation.z = t.tilt;
      tableGroup.add(plate);

      // Plate glowing fluorescent rim
      const rim = new THREE.Mesh(
        new THREE.RingGeometry(t.r * 0.88, t.r, 16),
        new THREE.MeshBasicMaterial({ color: 0x5eead4, side: THREE.DoubleSide })
      );
      rim.rotation.x = -Math.PI / 2;
      rim.position.y = 0.008;
      plate.add(rim);
    });

    sways.push(baseTrunk);
    return { group: tableGroup, sways };
  }

  // E. Brain Coral Mound
  function createBrainCoral(): { group: THREE.Group; sways: THREE.Object3D[] } {
    const brainGroup = new THREE.Group();
    const radius = 0.07 + Math.random() * 0.04;
    const dome = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 12, 10, 0, Math.PI * 2, 0, Math.PI / 2),
      brainCoralMat
    );
    dome.scale.set(1.15, 0.85, 1.15);
    brainGroup.add(dome);

    // Subtle ridges
    const ridgeCount = 4;
    for (let r = 0; r < ridgeCount; r++) {
      const ridgeTorus = new THREE.Mesh(
        new THREE.TorusGeometry(radius * (0.35 + r * 0.18), 0.007, 6, 16),
        brainCoralMat
      );
      ridgeTorus.rotation.x = Math.PI / 2;
      ridgeTorus.position.y = 0.02 + r * 0.012;
      brainGroup.add(ridgeTorus);
    }

    return { group: brainGroup, sways: [] };
  }

  // F. Bioluminescent Tube Sponges
  function createTubeSponges(): { group: THREE.Group; sways: THREE.Object3D[] } {
    const spongeGroup = new THREE.Group();
    const sways: THREE.Object3D[] = [];

    const numTubes = 4 + Math.floor(Math.random() * 4);
    for (let t = 0; t < numTubes; t++) {
      const angle = (t / numTubes) * Math.PI * 2 + Math.random() * 0.3;
      const dist = 0.02 + Math.random() * 0.025;
      const tubeH = 0.09 + Math.random() * 0.08;

      const tubeObj = new THREE.Group();
      tubeObj.position.set(Math.cos(angle) * dist, 0, Math.sin(angle) * dist);

      const tubeMesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.014, 0.018, tubeH, 8, 1, true),
        tubeSpongeMat
      );
      tubeMesh.position.y = tubeH / 2;
      tubeObj.add(tubeMesh);

      // Glowing opening rim at top
      const rim = new THREE.Mesh(
        new THREE.TorusGeometry(0.014, 0.004, 6, 12),
        tubeSpongeTipMat
      );
      rim.rotation.x = Math.PI / 2;
      rim.position.y = tubeH;
      tubeObj.add(rim);

      tubeObj.rotation.z = (Math.random() - 0.5) * 0.25;
      tubeObj.rotation.x = (Math.random() - 0.5) * 0.25;

      spongeGroup.add(tubeObj);
      sways.push(tubeObj);
    }
    return { group: spongeGroup, sways };
  }

  // G. Lush Seagrass Meadow Fronds
  function createSeagrassTuft(): { group: THREE.Group; sways: THREE.Object3D[] } {
    const tuftGroup = new THREE.Group();
    const sways: THREE.Object3D[] = [];

    const numBlades = 7 + Math.floor(Math.random() * 5);
    for (let b = 0; b < numBlades; b++) {
      const bladeH = 0.09 + Math.random() * 0.07;
      const bladeGeo = new THREE.PlaneGeometry(0.012, bladeH, 1, 3);
      bladeGeo.translate(0, bladeH / 2, 0);

      const blade = new THREE.Mesh(bladeGeo, seagrassMat);
      blade.rotation.y = (b / numBlades) * Math.PI * 2;
      blade.rotation.z = (Math.random() * 0.25 + 0.1);
      tuftGroup.add(blade);
      sways.push(blade);
    }
    return { group: tuftGroup, sways };
  }

  // --------------------------------------------------------------------------
  // 3. Populate Ecosystem across Bathymetry based on depth zones
  // --------------------------------------------------------------------------
  // Generate dense, natural clusters with biological depth zoning:
  // - High elevation (Continental shelf, Seamount summits, Ridges): Abundant corals & lush kelp
  // - Mid depths: Sea fan gorgonians, tube sponges, brain corals, seagrass
  // - Deep abyssal plains: Bioluminescent sea pens and glass sponges
  const targetFloraCount = 72; // Generous diversity without performance impact
  const halfW = slabWidth * 0.42;
  const halfD = slabDepth * 0.42;

  for (let i = 0; i < targetFloraCount; i++) {
    // Distribute with slight central bias or along ridges
    const u = (Math.random() - 0.5);
    const v = (Math.random() - 0.5);
    const elev = getBathymetricElevation(u, v, basinId);
    const hNorm = Math.max(0, Math.min(1, (elev + 0.45) / 1.05));

    // Calculate initial world position
    const wx = u * 2 * halfW;
    const wz = v * 2 * halfD;
    const wy = getSeafloorWorldY(wx, wz, slabWidth, slabDepth, totalHeight, verticalExaggeration, basinId);

    let type: FloraInstance['type'];
    let created: { group: THREE.Group; sways: THREE.Object3D[] };

    if (hNorm > 0.62) {
      // Shallow Shelf & Ridge Crests: Coral reef paradise & kelp groves
      const choice = Math.random();
      if (choice < 0.28) {
        type = 'kelp';
        created = createKelpCluster(1.1);
      } else if (choice < 0.52) {
        type = 'staghorn';
        created = createStaghornCoral(Math.random() > 0.5 ? 'pink' : 'orange');
      } else if (choice < 0.72) {
        type = 'tablecoral';
        created = createTableCoral();
      } else if (choice < 0.86) {
        type = 'seafan';
        created = createSeaFan(Math.random() > 0.5 ? 'purple' : 'cyan');
      } else {
        type = 'seagrass';
        created = createSeagrassTuft();
      }
    } else if (hNorm > 0.38) {
      // Mid-slope: Sea fans, brain corals, tube sponges, and seagrass
      const choice = Math.random();
      if (choice < 0.30) {
        type = 'seafan';
        created = createSeaFan('purple');
      } else if (choice < 0.55) {
        type = 'tubesponge';
        created = createTubeSponges();
      } else if (choice < 0.75) {
        type = 'brain';
        created = createBrainCoral();
      } else {
        type = 'seagrass';
        created = createSeagrassTuft();
      }
    } else {
      // Deep plains: Tube sponges and deep gorgonians
      const choice = Math.random();
      if (choice < 0.5) {
        type = 'tubesponge';
        created = createTubeSponges();
      } else {
        type = 'seafan';
        created = createSeaFan('cyan');
      }
    }

    const floraGroup = created.group;
    floraGroup.position.set(wx, wy, wz);
    // Random natural yaw
    floraGroup.rotation.y = Math.random() * Math.PI * 2;
    // Slight random scale
    const s = 0.85 + Math.random() * 0.35;
    floraGroup.scale.set(s, s, s);

    rootGroup.add(floraGroup);

    floraList.push({
      group: floraGroup,
      baseU: u,
      baseV: v,
      normX: wx,
      normZ: wz,
      type,
      swayFactor: type === 'kelp' ? 0.22 : type === 'seagrass' ? 0.18 : type === 'seafan' ? 0.12 : 0.04,
      swaySpeed: type === 'kelp' ? 1.4 : type === 'seagrass' ? 2.1 : 1.6,
      phaseOffset: Math.random() * Math.PI * 2,
      swayElements: created.sways,
    });
  }

  // --------------------------------------------------------------------------
  // 4. Volumetric Surface God Rays (Sunbeams descending from surface into water)
  // --------------------------------------------------------------------------
  const godRaysGroup = new THREE.Group();
  godRaysGroup.name = 'ocean-god-rays';
  rootGroup.add(godRaysGroup);

  const rayCount = 8;
  const rayMeshes: { mesh: THREE.Mesh; seed: number; baseOpacity: number }[] = [];

  // Create ethereal angled sunbeams descending from surface (y = 0)
  for (let r = 0; r < rayCount; r++) {
    const rayLength = totalHeight * 1.05;
    const topRadius = 0.05 + Math.random() * 0.08;
    const bottomRadius = 0.35 + Math.random() * 0.32;

    const rayGeo = new THREE.CylinderGeometry(topRadius, bottomRadius, rayLength, 16, 1, true);
    // Shift origin to top of cone
    rayGeo.translate(0, -rayLength / 2, 0);

    const baseOpacity = 0.09 + Math.random() * 0.07;
    const rayMat = new THREE.MeshBasicMaterial({
      color: 0x7df4ff,
      transparent: true,
      opacity: baseOpacity,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    const rayMesh = new THREE.Mesh(rayGeo, rayMat);
    // Disperse across surface
    const rx = (Math.random() - 0.5) * (slabWidth * 0.7);
    const rz = (Math.random() - 0.5) * (slabDepth * 0.7);
    rayMesh.position.set(rx, 0.01, rz);

    // Natural sunlight incident angle (slanting downward from southeast/east sky)
    rayMesh.rotation.z = -0.15 + (Math.random() - 0.5) * 0.12;
    rayMesh.rotation.x = 0.18 + (Math.random() - 0.5) * 0.12;

    godRaysGroup.add(rayMesh);
    rayMeshes.push({ mesh: rayMesh, seed: Math.random() * 10, baseOpacity });
  }

  // --------------------------------------------------------------------------
  // 5. Animated Underwater Caustics Light Web over the Seafloor
  // --------------------------------------------------------------------------
  // High-frequency caustic light web that projects over the seabed
  const causticsCanvas = document.createElement('canvas');
  causticsCanvas.width = 512;
  causticsCanvas.height = 512;
  const causticsCtx = causticsCanvas.getContext('2d')!;

  function drawCausticTexture(time: number) {
    causticsCtx.clearRect(0, 0, 512, 512);
    causticsCtx.fillStyle = 'rgba(0, 0, 0, 0)';
    causticsCtx.fillRect(0, 0, 512, 512);

    causticsCtx.strokeStyle = 'rgba(125, 244, 255, 0.35)';
    causticsCtx.lineWidth = 3.5;
    causticsCtx.filter = 'blur(4px)';

    // Voronoi-like undulating caustic network
    for (let i = 0; i < 28; i++) {
      causticsCtx.beginPath();
      const cx = 256 + Math.cos(time * 0.8 + i * 1.4) * 210;
      const cy = 256 + Math.sin(time * 0.9 + i * 1.2) * 210;
      const r = 45 + Math.sin(time * 1.3 + i) * 25;
      causticsCtx.arc(cx, cy, Math.max(10, r), 0, Math.PI * 2);
      causticsCtx.stroke();
    }
  }

  drawCausticTexture(0);
  const causticsTexture = new THREE.CanvasTexture(causticsCanvas);
  causticsTexture.wrapS = THREE.RepeatWrapping;
  causticsTexture.wrapT = THREE.RepeatWrapping;
  causticsTexture.repeat.set(3, 3);

  const causticsGeo = new THREE.PlaneGeometry(slabWidth * 1.02, slabDepth * 1.02, 32, 32);
  causticsGeo.rotateX(-Math.PI / 2);
  const causticsMat = new THREE.MeshBasicMaterial({
    map: causticsTexture,
    transparent: true,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const causticsMesh = new THREE.Mesh(causticsGeo, causticsMat);
  causticsMesh.position.y = -totalHeight + 0.05;
  rootGroup.add(causticsMesh);

  // --------------------------------------------------------------------------
  // 6. Animation Handler (gentle biological swaying, god rays shimmer, caustics)
  // --------------------------------------------------------------------------
  let lastCausticUpdate = 0;

  const updateAnimation = (elapsed: number) => {
    // A. Swaying flora
    for (let i = 0; i < floraList.length; i++) {
      const item = floraList[i];
      const time = elapsed * item.swaySpeed + item.phaseOffset;
      const sway = Math.sin(time) * item.swayFactor;
      const swayCross = Math.cos(time * 0.8) * (item.swayFactor * 0.45);

      if (item.type === 'kelp') {
        // Bend each kelp segment progressively along the stem
        item.swayElements.forEach((seg, sIdx) => {
          const mult = (sIdx + 1) / (item.swayElements.length || 1);
          seg.rotation.z = sway * mult;
          seg.rotation.x = swayCross * mult;
        });
      } else if (item.type === 'seagrass' || item.type === 'seafan') {
        item.swayElements.forEach((el) => {
          el.rotation.z = sway;
          el.rotation.x = swayCross;
        });
      } else if (item.type === 'tubesponge') {
        item.swayElements.forEach((el, tIdx) => {
          el.rotation.z = Math.sin(time + tIdx) * 0.035;
        });
      }
    }

    // B. God rays shimmer & light pulse
    for (let r = 0; r < rayMeshes.length; r++) {
      const ray = rayMeshes[r];
      const pulse = Math.sin(elapsed * 1.1 + ray.seed) * 0.035 + Math.cos(elapsed * 0.6 + ray.seed * 2.0) * 0.02;
      (ray.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0.02, ray.baseOpacity + pulse);
    }

    // C. Caustics animated texture and drift
    causticsTexture.offset.x = (elapsed * 0.025) % 1;
    causticsTexture.offset.y = (elapsed * 0.032) % 1;

    if (elapsed - lastCausticUpdate > 0.08) {
      drawCausticTexture(elapsed);
      causticsTexture.needsUpdate = true;
      lastCausticUpdate = elapsed;
    }
  };

  // --------------------------------------------------------------------------
  // 7. Dynamic Bathymetry & Vertical Exaggeration Synchronization
  // --------------------------------------------------------------------------
  const updateTerrainElevation = (
    newWidth: number,
    newDepth: number,
    newHeight: number,
    newExaggeration: number,
    newBasinId: string
  ) => {
    // Reposition every plant and coral root on the updated bathymetric terrain!
    const curHalfW = newWidth * 0.42;
    const curHalfD = newDepth * 0.42;

    for (let i = 0; i < floraList.length; i++) {
      const item = floraList[i];
      const wx = item.baseU * 2 * curHalfW;
      const wz = item.baseV * 2 * curHalfD;
      const wy = getSeafloorWorldY(wx, wz, newWidth, newDepth, newHeight, newExaggeration, newBasinId);

      item.group.position.set(wx, wy, wz);
      item.normX = wx;
      item.normZ = wz;
    }

    // Update caustics mesh height
    causticsMesh.position.y = -newHeight + 0.05;

    // Update God Rays height
    for (let r = 0; r < rayMeshes.length; r++) {
      const ray = rayMeshes[r];
      ray.mesh.scale.set(1, newHeight / (totalHeight || 1), 1);
    }
  };

  const setFloraVisible = (visible: boolean) => {
    floraList.forEach((f) => {
      f.group.visible = visible;
    });
  };

  const setGodRaysVisible = (visible: boolean) => {
    godRaysGroup.visible = visible;
    causticsMesh.visible = visible;
  };

  const dispose = () => {
    kelpMat1.dispose();
    kelpMat2.dispose();
    staghornMatPink.dispose();
    staghornMatOrange.dispose();
    seaFanMatPurple.dispose();
    seaFanMatCyan.dispose();
    brainCoralMat.dispose();
    tableCoralMat.dispose();
    tubeSpongeMat.dispose();
    tubeSpongeTipMat.dispose();
    seagrassMat.dispose();
    causticsTexture.dispose();
    causticsMat.dispose();
    causticsGeo.dispose();
  };

  return {
    rootGroup,
    godRaysGroup,
    causticsMesh,
    floraList,
    updateAnimation,
    updateTerrainElevation,
    setFloraVisible,
    setGodRaysVisible,
    dispose,
  };
}
