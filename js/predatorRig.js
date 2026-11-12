// predatorRig.js - Turn a static single-mesh animal GLB into a skinned, animatable model.
//
// The Poly Pizza animals are one frozen mesh with no skeleton. This rigs them at
// runtime: a quadruped bone chain is fitted to the bounding box + detected leg
// clusters, skin weights fall off with distance to each bone segment, and the
// mesh is rebound as a SkinnedMesh. Attack/walk poses are applied to the bones
// from predators.js each frame.
import * as THREE from 'three';

// Bone rest layout, fractions are relative to the normalized model bbox.
// Front of the animal faces +Z. All units are normalized (feet y = 0, centered x/z).
function buildBoneSpecs(box) {
    const H = box.max.y - box.min.y;
    const halfL = (box.max.z - box.min.z) / 2;
    const Hn = (y) => box.min.y + y;
    const Lz = (f) => halfL * f;
    return [
        { name: 'pelvis', from: [0, Hn(0.52 * H), Lz(-0.62)], to: [0, Hn(0.56 * H), Lz(-0.30)], radius: 0.46 * H, parent: null, chain: ['pelvis'] },
        { name: 'spine', from: [0, Hn(0.56 * H), Lz(-0.30)], to: [0, Hn(0.60 * H), Lz(0.14)], radius: 0.46 * H, parent: 'pelvis', chain: ['spine'] },
        { name: 'chest', from: [0, Hn(0.60 * H), Lz(0.14)], to: [0, Hn(0.66 * H), Lz(0.36)], radius: 0.42 * H, parent: 'spine', chain: ['chest'] },
        { name: 'neck', from: [0, Hn(0.66 * H), Lz(0.34)], to: [0, Hn(0.84 * H), Lz(0.44)], radius: 0.34 * H, parent: 'chest', chain: ['neck'] },
        { name: 'head', from: [0, Hn(0.84 * H), Lz(0.44)], to: [0, Hn(0.80 * H), Lz(0.78)], radius: 0.30 * H, parent: 'neck', chain: ['head'] },
        { name: 'tail', from: [0, Hn(0.50 * H), Lz(-0.55)], to: [0, Hn(0.40 * H), Lz(-1.02)], radius: 0.16 * H, parent: 'pelvis', chain: ['tail'] },
        // Front legs are fitted to the detected clusters at bind time.
        { name: 'FLu', from: [0, 0, 0], to: [0, 0, 0], radius: 0.28 * H, parent: 'chest', chain: ['FLu'], leg: 'FLu' },
        { name: 'FLl', from: [0, 0, 0], to: [0, 0, 0], radius: 0.24 * H, parent: 'FLu', chain: ['FLu', 'FLl'], leg: 'FLl' },
        { name: 'FRu', from: [0, 0, 0], to: [0, 0, 0], radius: 0.28 * H, parent: 'chest', chain: ['FRu'], leg: 'FRu' },
        { name: 'FRl', from: [0, 0, 0], to: [0, 0, 0], radius: 0.24 * H, parent: 'FRu', chain: ['FRu', 'FRl'], leg: 'FRl' },
        { name: 'BLu', from: [0, 0, 0], to: [0, 0, 0], radius: 0.30 * H, parent: 'pelvis', chain: ['BLu'], leg: 'BLu' },
        { name: 'BLl', from: [0, 0, 0], to: [0, 0, 0], radius: 0.26 * H, parent: 'BLu', chain: ['BLu', 'BLl'], leg: 'BLl' },
        { name: 'BRu', from: [0, 0, 0], to: [0, 0, 0], radius: 0.30 * H, parent: 'pelvis', chain: ['BRu'], leg: 'BRu' },
        { name: 'BRl', from: [0, 0, 0], to: [0, 0, 0], radius: 0.26 * H, parent: 'BRu', chain: ['BRu', 'BRl'], leg: 'BRl' }
    ];
}

// Cluster bottom-third vertices into the four legs and pin leg bones to them.
function fitLegBones(specs, positions, count, box) {
    const H = box.max.y - box.min.y;
    const zc = (box.min.z + box.max.z) / 2;
    const clusters = { FL: [], FR: [], BL: [], BR: [] };
    for (let i = 0; i < count; i++) {
        const x = positions[i * 3], y = positions[i * 3 + 1], z = positions[i * 3 + 2];
        if (y > box.min.y + 0.32 * H) continue;
        const key = (z >= zc ? 'F' : 'B') + (x < 0 ? 'L' : 'R');
        clusters[key].push([x, y, z]);
    }
    const center = (arr) => {
        if (!arr.length) return null;
        const c = [0, 0, 0];
        for (const p of arr) { c[0] += p[0]; c[1] += p[1]; c[2] += p[2]; }
        return [c[0] / arr.length, c[1] / arr.length, c[2] / arr.length];
    };
    const Hn = (y) => box.min.y + y;
    for (const suffix of ['FL', 'FR', 'BL', 'BR']) {
        const c = center(clusters[suffix]);
        if (!c) continue;
        const legX = c[0];
        const legTopY = Hn(0.52 * H);
        const kneeY = Hn(0.24 * H);
        const spec = (name) => specs.find((s) => s.name === name);
        const upper = spec(`${suffix}u`);
        const lower = spec(`${suffix}l`);
        upper.from = [legX * 0.45, legTopY, c[2] * 0.72];
        upper.to = [legX, kneeY, c[2]];
        lower.from = [legX, kneeY, c[2]];
        lower.to = [legX, box.min.y + 0.02 * H, c[2]];
    }
}

function distPointSegmentSquared(px, py, pz, ax, ay, az, bx, by, bz) {
    const abx = bx - ax, aby = by - ay, abz = bz - az;
    const apx = px - ax, apy = py - ay, apz = pz - az;
    const ab2 = abx * abx + aby * aby + abz * abz;
    let t = ab2 > 0 ? (apx * abx + apy * aby + apz * abz) / ab2 : 0;
    t = Math.max(0, Math.min(1, t));
    const cx = ax + abx * t - px, cy = ay + aby * t - py, cz = az + abz * t - pz;
    return cx * cx + cy * cy + cz * cz;
}

// Rig a static GLB scene: normalize, build bones, skin the mesh, return the wrapper pieces.
// `height` is the target height in world units (feet at y = 0, centered on x/z).
export function rigStaticModel(gltfScene, height) {
    let source = null;
    gltfScene.traverse((child) => {
        if (child.isMesh && !source) source = child;
    });
    if (!source) throw new Error('No mesh found in model');

    const geometry = source.geometry.clone();

    // Normalize scale and position.
    geometry.computeBoundingBox();
    const srcBox = geometry.boundingBox.clone();
    const srcSize = srcBox.getSize(new THREE.Vector3());
    const scale = height / srcSize.y;
    geometry.scale(scale, scale, scale);
    geometry.computeBoundingBox();
    const scaledBox = geometry.boundingBox.clone();
    const cx = (scaledBox.min.x + scaledBox.max.x) / 2;
    const cz = (scaledBox.min.z + scaledBox.max.z) / 2;
    geometry.translate(-cx, -scaledBox.min.y, -cz);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox.clone();

    const count = geometry.attributes.position.count;
    const positions = geometry.attributes.position.array;

    // Fit bones to the normalized mesh.
    const specs = buildBoneSpecs(box);
    fitLegBones(specs, positions, count, box);

    // Build the bone hierarchy.
    const bones = new Map();
    const root = new THREE.Bone();
    root.name = 'root';
    bones.set('root', root);
    for (const spec of specs) {
        const bone = new THREE.Bone();
        bone.name = spec.name;
        const from = new THREE.Vector3(...spec.from);
        bone.position.copy(from);
        bones.set(spec.name, bone);
    }
    // Attach in spec order (parents listed before children).
    for (const spec of specs) {
        const bone = bones.get(spec.name);
        const parent = spec.parent ? bones.get(spec.parent) : root;
        // Convert world rest position into the parent's local frame.
        const worldPos = new THREE.Vector3(...spec.from);
        const parentWorldPos = spec.parent ? new THREE.Vector3(...specs.find((s) => s.name === spec.parent).from) : new THREE.Vector3(0, 0, 0);
        bone.position.copy(worldPos.sub(parentWorldPos));
        parent.add(bone);
    }
    // Segment end points (normalized world space) for weight computation.
    const segments = specs.map((spec) => ({
        name: spec.name,
        a: new THREE.Vector3(...spec.from),
        b: new THREE.Vector3(...spec.to),
        radius: spec.radius
    }));

    // Assign 4 nearest-bone influences with smooth falloff.
    const skinIndices = new Uint16Array(count * 4);
    const skinWeights = new Float32Array(count * 4);
    const boneNames = [...bones.keys()]; // root included; exclude root from weights
    const weightable = segments;
    for (let i = 0; i < count; i++) {
        const px = positions[i * 3], py = positions[i * 3 + 1], pz = positions[i * 3 + 2];
        const scored = weightable.map((seg) => {
            const d2 = distPointSegmentSquared(px, py, pz, seg.a.x, seg.a.y, seg.a.z, seg.b.x, seg.b.y, seg.b.z);
            const d = Math.sqrt(d2);
            return { name: seg.name, w: 1 / (1 + Math.pow(d / seg.radius, 6)) };
        });
        scored.sort((a, b) => b.w - a.w);
        let total = 0;
        const top = scored.slice(0, 4);
        for (const s of top) total += s.w;
        for (let k = 0; k < 4; k++) {
            const s = top[k];
            skinIndices[i * 4 + k] = s ? boneNames.indexOf(s.name) : 0;
            skinWeights[i * 4 + k] = s ? s.w / total : 0;
        }
    }

    geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(skinIndices, 4));
    geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(skinWeights, 4));

    const material = Array.isArray(source.material) ? source.material[0].clone() : source.material.clone();
    const skinned = new THREE.SkinnedMesh(geometry, material);
    skinned.castShadow = true;
    skinned.receiveShadow = true;
    skinned.frustumCulled = false; // bones move vertices beyond the bind-pose bounds
    // Rest pose: bone world positions are absolute, so root sits at origin and binds identity.
    root.updateMatrixWorld(true);
    const skeleton = new THREE.Skeleton([...bones.values()]);
    skinned.bind(skeleton, new THREE.Matrix4());

    const inner = new THREE.Group();
    inner.add(root);
    inner.add(skinned);

    return {
        inner,
        mesh: skinned,
        skeleton,
        bones,
        box,
        boneCount: boneNames.length,
        rest: { pelvisY: bones.get('pelvis').position.y }
    };
}

const DEG = (d) => THREE.MathUtils.degToRad(d);
const sstep = (x, a, b) => THREE.MathUtils.smoothstep(x, a, b);

// Resolved once at rig build time.
function restPose(rig) {
    return rig.rest ?? { pelvisY: rig.bones.get('pelvis').position.y };
}

// Apply the full stalk -> pounce -> bite animation as absolute bone poses.
// progress is 0..1 over the attack; elapsedMs drives the walking cycle.
export function applyAttackPose(rig, progress, elapsedMs) {
    if (!rig.rest) rig.rest = restPose(rig);
    const bones = rig.bones;
    if (!bones) return;

    const walkPhase = elapsedMs * 0.011;

    const crouch = sstep(progress, 0.0, 0.18) * (1 - sstep(progress, 0.58, 0.76));
    const walkAmp = 1 - sstep(progress, 0.45, 0.6);
    const pounce = sstep(progress, 0.55, 0.72) * (1 - sstep(progress, 0.8, 0.97));
    const strike = sstep(progress, 0.76, 0.85);

    const setRot = (name, x, y, z) => { bones.get(name).rotation.set(DEG(x), DEG(y), DEG(z)); };

    // Body core: crouch -> arch -> bite slam
    setRot('pelvis', crouch * 6 - pounce * 10 + strike * 6, 0, 0);
    bones.get('pelvis').position.y = rig.rest.pelvisY
        - 0.13 * crouch + 0.12 * pounce - 0.20 * strike;
    setRot('spine', crouch * 5 - pounce * 12 + strike * 7, 0, Math.sin(walkPhase * 0.5) * 4 * walkAmp);
    setRot('chest', crouch * 4 - pounce * 6 + strike * 10, 0, Math.sin(walkPhase * 0.5 + 1.2) * 5 * walkAmp);
    setRot('neck', crouch * 8 - pounce * 2 + strike * 4, 0, 0);
    setRot('head', crouch * 4 - pounce * 4 + strike * 46, 0, 0);
    setRot('tail', -strike * 8 - pounce * 25 + walkAmp * (-10 + Math.sin(walkPhase * 0.7) * 7), 0, Math.sin(walkPhase * 0.6) * 8 * walkAmp);

    // Legs: walk cycle while stalking, coiled spring into the pounce, planted legs at impact.
    const cycle = (offset) => Math.sin(walkPhase + offset);
    const bend = (offset) => Math.max(0, Math.sin(walkPhase + offset - 0.85)) * 35;

    // Front legs (opposite phases)
    const flU = crouch * 20 + walkAmp * cycle(0) * 26 - pounce * 55 + strike * 50;
    const frU = crouch * 20 + walkAmp * cycle(Math.PI) * 26 - pounce * 55 + strike * 50;
    const flL = crouch * 40 + walkAmp * bend(0) - pounce * 25 + strike * 20;
    const frL = crouch * 40 + walkAmp * bend(Math.PI) - pounce * 25 + strike * 20;
    setRot('FLu', flU, 0, 0);
    setRot('FRu', frU, 0, 0);
    setRot('FLl', flL, 0, 0);
    setRot('FRl', frL, 0, 0);

    // Hind legs (push-off legs, opposite phase to the front)
    const blU = crouch * 15 + walkAmp * cycle(Math.PI * 0.85) * 30 + pounce * 40 - strike * 15;
    const brU = crouch * 15 + walkAmp * cycle(Math.PI * 0.85 + Math.PI) * 30 + pounce * 40 - strike * 15;
    const blL = crouch * 50 + walkAmp * bend(Math.PI * 0.85) - pounce * 50 + strike * 5;
    const brL = crouch * 50 + walkAmp * bend(Math.PI * 0.85 + Math.PI) - pounce * 50 + strike * 5;
    setRot('BLu', blU, 0, 0);
    setRot('BRu', brU, 0, 0);
    setRot('BLl', blL, 0, 0);
    setRot('BRl', brL, 0, 0);
}

// Restore bones to the bind pose (used when a predator is released back to the pool).
export function resetPose(rig) {
    rig.rest = rig.rest ?? { pelvisY: rig.bones.get('pelvis').position.y };
    for (const bone of rig.bones.values()) {
        if (bone.name === 'root') continue;
        bone.rotation.set(0, 0, 0);
    }
    rig.bones.get('pelvis').position.y = rig.rest.pelvisY;
}
