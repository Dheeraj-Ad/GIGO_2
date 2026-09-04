import * as THREE from 'three';
import { SensorNode } from '../../types';

// Helper to create high-resolution crisp canvas text billboard sprites
export function createProbeLabelSprite(
  text: string,
  subtext: string,
  accentColor: string,
  bgColor: string = 'rgba(7, 19, 36, 0.88)'
): THREE.Sprite {
  const canvas = document.createElement('canvas');
  canvas.width = 320;
  canvas.height = 100;
  const ctx = canvas.getContext('2d');

  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Rounded background pill
    ctx.fillStyle = bgColor;
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 3;

    const r = 18;
    const x = 6;
    const y = 6;
    const w = canvas.width - 12;
    const h = canvas.height - 12;

    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Primary Text (ID / Type)
    ctx.fillStyle = accentColor;
    ctx.font = 'bold 26px "JetBrains Mono", monospace, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(text, canvas.width / 2, 42);

    // Subtext (Depth / Telemetry)
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px "JetBrains Mono", monospace, sans-serif';
    ctx.fillText(subtext, canvas.width / 2, 74);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;

  const spriteMat = new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthTest: false,
    depthWrite: false,
  });

  const sprite = new THREE.Sprite(spriteMat);
  sprite.scale.set(0.68, 0.22, 1);
  return sprite;
}

// -----------------------------------------------------------------------------
// 1. ARGO PROFILING FLOAT 3D MODEL BUILDER
// -----------------------------------------------------------------------------
export function createArgoFloatModel(probe: SensorNode): THREE.Group {
  const group = new THREE.Group();
  group.name = `probe-argo-${probe.id}`;
  group.userData = { probe, type: 'ARGO' };

  // --- Main Hull: Upper Section (Oceanographic Safety Yellow) ---
  const upperHullGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.16, 20);
  const upperHullMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15, // Bright scientific yellow
    roughness: 0.28,
    metalness: 0.15,
  });
  const upperHull = new THREE.Mesh(upperHullGeo, upperHullMat);
  upperHull.position.y = 0.08;
  upperHull.castShadow = true;
  group.add(upperHull);

  // --- Stenciled ARGO White Identification Band ---
  const bandGeo = new THREE.CylinderGeometry(0.043, 0.043, 0.04, 20);
  const bandMat = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.3,
  });
  const bandMesh = new THREE.Mesh(bandGeo, bandMat);
  bandMesh.position.y = 0.08;
  group.add(bandMesh);

  // --- Main Hull: Lower Section (Hard-Anodized Ocean Slate Pressure Case) ---
  const lowerHullGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.16, 20);
  const lowerHullMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // Dark durable pressure cylinder
    roughness: 0.35,
    metalness: 0.45,
  });
  const lowerHull = new THREE.Mesh(lowerHullGeo, lowerHullMat);
  lowerHull.position.y = -0.08;
  group.add(lowerHull);

  // --- Central Coupling Ring & Collar ---
  const collarGeo = new THREE.CylinderGeometry(0.048, 0.048, 0.02, 20);
  const collarMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.4,
    metalness: 0.6,
  });
  const collar = new THREE.Mesh(collarGeo, collarMat);
  collar.position.y = 0;
  group.add(collar);

  // --- Bottom Buoyancy Engine: Hydraulic Oil Bladder (Inverted Dome) ---
  const bladderGeo = new THREE.SphereGeometry(0.042, 16, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2);
  const bladderMat = new THREE.MeshStandardMaterial({
    color: 0x111827, // Matte rubber bladder
    roughness: 0.8,
    metalness: 0.05,
  });
  const bladder = new THREE.Mesh(bladderGeo, bladderMat);
  bladder.rotation.x = Math.PI;
  bladder.position.y = -0.16;
  group.add(bladder);

  // Protective bottom bumper nozzle
  const nozzleGeo = new THREE.CylinderGeometry(0.012, 0.02, 0.035, 12);
  const nozzleMat = new THREE.MeshStandardMaterial({ color: 0x334155, metalness: 0.5 });
  const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
  nozzle.position.y = -0.19;
  group.add(nozzle);

  // --- Top Endcap & Sea-Bird SBE 41CP CTD Sensor Head ---
  const endcapGeo = new THREE.CylinderGeometry(0.042, 0.042, 0.02, 20);
  const endcapMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    metalness: 0.7,
    roughness: 0.25,
  });
  const endcap = new THREE.Mesh(endcapGeo, endcapMat);
  endcap.position.y = 0.17;
  group.add(endcap);

  // CTD Sensor Duct Tower
  const ctdGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.07, 16);
  const ctdMat = new THREE.MeshStandardMaterial({
    color: 0x64748b,
    metalness: 0.6,
    roughness: 0.3,
  });
  const ctdMesh = new THREE.Mesh(ctdGeo, ctdMat);
  ctdMesh.position.set(0, 0.21, 0);
  group.add(ctdMesh);

  // Red Anti-foulant Exhaust Port
  const redRingGeo = new THREE.TorusGeometry(0.016, 0.004, 8, 16);
  redRingGeo.rotateX(Math.PI / 2);
  const redRingMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const redRing = new THREE.Mesh(redRingGeo, redRingMat);
  redRing.position.y = 0.245;
  group.add(redRing);

  // Optode / Dissolved Oxygen sensor lens on shoulder
  const optodeGeo = new THREE.CylinderGeometry(0.008, 0.008, 0.025, 10);
  const optodeMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.1 });
  const optode = new THREE.Mesh(optodeGeo, optodeMat);
  optode.position.set(0.024, 0.185, 0.015);
  group.add(optode);

  // --- Radial Damping Collar Disc (prevents roll during ascent) ---
  const dampingRingGeo = new THREE.RingGeometry(0.042, 0.075, 24);
  dampingRingGeo.rotateX(-Math.PI / 2);
  const dampingRingMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    side: THREE.DoubleSide,
    roughness: 0.5,
  });
  const dampingRing = new THREE.Mesh(dampingRingGeo, dampingRingMat);
  dampingRing.position.y = 0.14;
  group.add(dampingRing);

  // --- Slender Argos / Iridium Communications Antenna ---
  const antennaGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.24, 8);
  const antennaMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
  const antenna = new THREE.Mesh(antennaGeo, antennaMat);
  antenna.position.set(0, 0.36, 0);
  group.add(antenna);

  // Flashing Tip Satellite Beacon LED
  const beaconGeo = new THREE.SphereGeometry(0.008, 12, 12);
  const beaconMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  const beacon = new THREE.Mesh(beaconGeo, beaconMat);
  beacon.name = 'antenna-beacon';
  beacon.position.set(0, 0.48, 0);
  group.add(beacon);

  // --- Soft Glowing Concentric Telemetry Pulse Ring ---
  const pulseRingGeo = new THREE.RingGeometry(0.08, 0.115, 32);
  pulseRingGeo.rotateX(-Math.PI / 2);
  const pulseRingMat = new THREE.MeshBasicMaterial({
    color: 0x00f0ff,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pulseRing = new THREE.Mesh(pulseRingGeo, pulseRingMat);
  pulseRing.name = 'pulse-ring';
  pulseRing.position.y = 0.08;
  group.add(pulseRing);

  // --- Second outer sonar ripple ring ---
  const pulseRing2Geo = new THREE.RingGeometry(0.12, 0.14, 32);
  pulseRing2Geo.rotateX(-Math.PI / 2);
  const pulseRing2Mat = new THREE.MeshBasicMaterial({
    color: 0x43ffbb,
    transparent: true,
    opacity: 0.45,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pulseRing2 = new THREE.Mesh(pulseRing2Geo, pulseRing2Mat);
  pulseRing2.name = 'pulse-ring-2';
  pulseRing2.position.y = 0.08;
  group.add(pulseRing2);

  // --- Floating Billboard Tag ---
  const labelText = `ARGO #${probe.id.split('-').pop()}`;
  const labelSub = `${Math.abs(probe.depth).toFixed(2)}m • SBE-41CP`;
  const labelSprite = createProbeLabelSprite(labelText, labelSub, '#00f0ff');
  labelSprite.position.set(0, 0.64, 0);
  labelSprite.name = 'probe-label';
  group.add(labelSprite);

  return group;
}

// -----------------------------------------------------------------------------
// 2. UNDERWATER AUTONOMOUS GLIDER 3D MODEL BUILDER
// -----------------------------------------------------------------------------
export function createUnderwaterGliderModel(probe: SensorNode): THREE.Group {
  const group = new THREE.Group();
  group.name = `probe-glider-${probe.id}`;
  group.userData = { probe, type: 'GLIDER' };

  // Glider Body Group with Sawtooth Dive Attitude Pitch (~14 degrees) and Yaw Heading
  const gliderBody = new THREE.Group();
  gliderBody.name = 'glider-body-group';

  // Apply heading rotation (if available, e.g. 42 degrees)
  const headingRad = ((probe.heading || 45) * Math.PI) / 180;
  gliderBody.rotation.y = -headingRad + Math.PI / 2;
  // Sawtooth glide pitch (12 degrees downward pitch angle)
  gliderBody.rotation.z = 0.20;

  group.add(gliderBody);

  // --- Torpedo Fuselage: Nose Hemisphere & Optical Sensor Window ---
  const noseGeo = new THREE.SphereGeometry(0.038, 20, 16);
  const noseMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b, // Dark carbon nose
    roughness: 0.25,
    metalness: 0.4,
  });
  const nose = new THREE.Mesh(noseGeo, noseMat);
  nose.position.x = 0.18;
  gliderBody.add(nose);

  // Sapphire optical backscatter sensor port on nose tip
  const sensorLensGeo = new THREE.SphereGeometry(0.015, 12, 12);
  const sensorLensMat = new THREE.MeshBasicMaterial({ color: 0x00f0ff });
  const sensorLens = new THREE.Mesh(sensorLensGeo, sensorLensMat);
  sensorLens.position.x = 0.215;
  gliderBody.add(sensorLens);

  // --- Main Fuselage: Cylindrical Hull (Vibrant Electric Yellow) ---
  const fuselageGeo = new THREE.CylinderGeometry(0.038, 0.034, 0.36, 20);
  fuselageGeo.rotateZ(Math.PI / 2); // Lay horizontal
  const fuselageMat = new THREE.MeshStandardMaterial({
    color: 0xffb703, // Electric safety amber yellow
    roughness: 0.22,
    metalness: 0.15,
  });
  const fuselage = new THREE.Mesh(fuselageGeo, fuselageMat);
  fuselage.position.x = 0.0;
  gliderBody.add(fuselage);

  // Black payload demarcation band
  const payloadBandGeo = new THREE.CylinderGeometry(0.0385, 0.0385, 0.05, 20);
  payloadBandGeo.rotateZ(Math.PI / 2);
  const payloadBandMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.35,
  });
  const payloadBand = new THREE.Mesh(payloadBandGeo, payloadBandMat);
  payloadBand.position.x = 0.04;
  gliderBody.add(payloadBand);

  // White INCOIS identification band
  const idBandGeo = new THREE.CylinderGeometry(0.0385, 0.0385, 0.04, 20);
  idBandGeo.rotateZ(Math.PI / 2);
  const idBandMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
  const idBand = new THREE.Mesh(idBandGeo, idBandMat);
  idBand.position.x = -0.05;
  gliderBody.add(idBand);

  // --- Tail Cone: Hydrodynamic Aft Fairing ---
  const tailConeGeo = new THREE.ConeGeometry(0.034, 0.15, 20);
  tailConeGeo.rotateZ(-Math.PI / 2);
  const tailConeMat = new THREE.MeshStandardMaterial({
    color: 0xffb703,
    roughness: 0.25,
  });
  const tailCone = new THREE.Mesh(tailConeGeo, tailConeMat);
  tailCone.position.x = -0.255;
  gliderBody.add(tailCone);

  // --- Swept Wings (Wingspan ~0.52 units, swept back 35 degrees) ---
  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0);
  wingShape.lineTo(-0.12, 0.26); // Swept tip
  wingShape.lineTo(-0.16, 0.25);
  wingShape.lineTo(-0.06, 0); // Trailing root
  wingShape.closePath();

  const wingExtrudeSettings = { depth: 0.005, bevelEnabled: false };
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, wingExtrudeSettings);
  wingGeo.rotateX(-Math.PI / 2);

  const wingMat = new THREE.MeshStandardMaterial({
    color: 0xffb703,
    roughness: 0.3,
    metalness: 0.2,
    side: THREE.DoubleSide,
  });

  // Starboard Wing (Right)
  const rightWing = new THREE.Mesh(wingGeo, wingMat);
  rightWing.position.set(0.04, 0, 0.03);
  gliderBody.add(rightWing);

  // Port Wing (Left - mirrored)
  const leftWingGeo = wingGeo.clone();
  leftWingGeo.scale(1, 1, -1);
  const leftWing = new THREE.Mesh(leftWingGeo, wingMat);
  leftWing.position.set(0.04, 0, -0.03);
  gliderBody.add(leftWing);

  // Wingtip Marker Lights (Starboard Green, Port Red)
  const greenTipGeo = new THREE.SphereGeometry(0.007, 8, 8);
  const greenTipMat = new THREE.MeshBasicMaterial({ color: 0x10b981 });
  const greenTip = new THREE.Mesh(greenTipGeo, greenTipMat);
  greenTip.position.set(-0.09, 0.002, 0.29);
  gliderBody.add(greenTip);

  const redTipGeo = new THREE.SphereGeometry(0.007, 8, 8);
  const redTipMat = new THREE.MeshBasicMaterial({ color: 0xef4444 });
  const redTip = new THREE.Mesh(redTipGeo, redTipMat);
  redTip.position.set(-0.09, 0.002, -0.29);
  gliderBody.add(redTip);

  // --- Vertical Dorsal Tail Fin & Rudder ---
  const finShape = new THREE.Shape();
  finShape.moveTo(0, 0);
  finShape.lineTo(-0.08, 0.12);
  finShape.lineTo(-0.11, 0.11);
  finShape.lineTo(-0.08, 0);
  finShape.closePath();

  const finGeo = new THREE.ExtrudeGeometry(finShape, { depth: 0.004, bevelEnabled: false });
  const finMat = new THREE.MeshStandardMaterial({
    color: 0x111827, // Dark carbon stabilizer
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  const dorsalFin = new THREE.Mesh(finGeo, finMat);
  dorsalFin.position.set(-0.24, 0.02, -0.002);
  gliderBody.add(dorsalFin);

  // Small Ventral Tail Fin
  const ventralFin = dorsalFin.clone();
  ventralFin.scale.set(0.7, -0.7, 1);
  ventralFin.position.set(-0.24, -0.02, -0.002);
  gliderBody.add(ventralFin);

  // Horizontal Tailplanes
  const hFinGeo = new THREE.BoxGeometry(0.06, 0.004, 0.14);
  const hFinMat = new THREE.MeshStandardMaterial({ color: 0xffb703, roughness: 0.3 });
  const hFin = new THREE.Mesh(hFinGeo, hFinMat);
  hFin.position.set(-0.29, 0.01, 0);
  gliderBody.add(hFin);

  // --- Trailing Satellite Antenna (Raked rearward ~25 degrees) ---
  const antennaGeo = new THREE.CylinderGeometry(0.002, 0.002, 0.22, 8);
  antennaGeo.rotateZ(0.55); // Raked back
  const antennaMat = new THREE.MeshBasicMaterial({ color: 0x334155 });
  const antenna = new THREE.Mesh(antennaGeo, antennaMat);
  antenna.position.set(-0.38, 0.08, 0);
  gliderBody.add(antenna);

  // Pulsing Amber Antenna Strobe
  const strobeGeo = new THREE.SphereGeometry(0.008, 12, 12);
  const strobeMat = new THREE.MeshBasicMaterial({ color: 0xffb703 });
  const strobe = new THREE.Mesh(strobeGeo, strobeMat);
  strobe.name = 'antenna-beacon';
  strobe.position.set(-0.44, 0.16, 0);
  gliderBody.add(strobe);

  // --- Glowing Hydrodynamic Forward Pulse Ring ---
  const pulseRingGeo = new THREE.RingGeometry(0.09, 0.13, 32);
  pulseRingGeo.rotateX(-Math.PI / 2);
  const pulseRingMat = new THREE.MeshBasicMaterial({
    color: 0xffb703,
    transparent: true,
    opacity: 0.75,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pulseRing = new THREE.Mesh(pulseRingGeo, pulseRingMat);
  pulseRing.name = 'pulse-ring';
  pulseRing.position.y = 0;
  group.add(pulseRing);

  // Second wider pulse ring
  const pulseRing2Geo = new THREE.RingGeometry(0.14, 0.165, 32);
  pulseRing2Geo.rotateX(-Math.PI / 2);
  const pulseRing2Mat = new THREE.MeshBasicMaterial({
    color: 0xffe066,
    transparent: true,
    opacity: 0.4,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const pulseRing2 = new THREE.Mesh(pulseRing2Geo, pulseRing2Mat);
  pulseRing2.name = 'pulse-ring-2';
  pulseRing2.position.y = 0;
  group.add(pulseRing2);

  // --- Floating Billboard Tag ---
  const labelText = `GLIDER ${probe.id.split('-').pop()}`;
  const labelSub = `${Math.abs(probe.depth).toFixed(2)}m • ${(probe.speedKnots || 1.2).toFixed(1)}kn`;
  const labelSprite = createProbeLabelSprite(labelText, labelSub, '#ffb703');
  labelSprite.position.set(0, 0.52, 0);
  labelSprite.name = 'probe-label';
  group.add(labelSprite);

  return group;
}

// -----------------------------------------------------------------------------
// 3. MOORED OCEANOGRAPHIC BUOY / OMNI 3D MODEL BUILDER
// -----------------------------------------------------------------------------
export function createMooredBuoyModel(probe: SensorNode): THREE.Group {
  const group = new THREE.Group();
  group.name = `probe-omni-${probe.id}`;
  group.userData = { probe, type: 'OMNI' };

  // Discus Surface Hull
  const hullGeo = new THREE.CylinderGeometry(0.08, 0.065, 0.038, 24);
  const hullMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.25,
    metalness: 0.15,
  });
  const hull = new THREE.Mesh(hullGeo, hullMat);
  group.add(hull);

  // Met Tower Tripod
  const towerGeo = new THREE.ConeGeometry(0.045, 0.12, 4, 1, true);
  const towerMat = new THREE.MeshBasicMaterial({ color: 0xffffff, wireframe: true });
  const tower = new THREE.Mesh(towerGeo, towerMat);
  tower.position.y = 0.075;
  group.add(tower);

  // Top Light Beacon
  const lightGeo = new THREE.SphereGeometry(0.01, 8, 8);
  const lightMat = new THREE.MeshBasicMaterial({ color: 0x43ffbb });
  const light = new THREE.Mesh(lightGeo, lightMat);
  light.name = 'antenna-beacon';
  light.position.y = 0.14;
  group.add(light);

  // Pulse ring
  const pulseRingGeo = new THREE.RingGeometry(0.09, 0.12, 32);
  pulseRingGeo.rotateX(-Math.PI / 2);
  const pulseRingMat = new THREE.MeshBasicMaterial({
    color: 0x43ffbb,
    transparent: true,
    opacity: 0.7,
    side: THREE.DoubleSide,
  });
  const pulseRing = new THREE.Mesh(pulseRingGeo, pulseRingMat);
  pulseRing.name = 'pulse-ring';
  group.add(pulseRing);

  // Billboard Tag
  const labelSprite = createProbeLabelSprite(`OMNI #${probe.id}`, `${Math.abs(probe.depth).toFixed(2)}m • Surface`, '#43ffbb');
  labelSprite.position.set(0, 0.44, 0);
  labelSprite.name = 'probe-label';
  group.add(labelSprite);

  return group;
}
