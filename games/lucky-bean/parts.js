import * as THREE from "three";

export const SLOTS = ["hat", "face", "neck", "back", "held", "pet", "aura", "outfit"];

export const SLOT_LABEL = {
  hat: "모자",
  face: "얼굴",
  neck: "목",
  back: "등",
  held: "손",
  pet: "펫",
  aura: "효과",
  outfit: "스킨",
};

export const RARITY = {
  common: { name: "흔함", color: "#3dbe8c" },
  rare: { name: "레어", color: "#3d8dff" },
  epic: { name: "에픽", color: "#a855f7" },
  legendary: { name: "전설", color: "#e0a100" },
};

function mat(color, extra = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.38, metalness: 0.06, ...extra });
}

function M(geo, color, x = 0, y = 0, z = 0, extra) {
  const mesh = new THREE.Mesh(geo, mat(color, extra));
  mesh.position.set(x, y, z);
  mesh.castShadow = true;
  return mesh;
}

function group(id) {
  const g = new THREE.Group();
  g.name = id;
  return g;
}

export const ITEMS = [
  { id: "ribbon", slot: "hat", name: "리본", price: 250, rarity: "common", blurb: "말랑한 핑크 리본" },
  { id: "flower", slot: "hat", name: "꽃핀", price: 350, rarity: "common", blurb: "노란 꽃 하나" },
  { id: "cap", slot: "hat", name: "캡모자", price: 450, rarity: "common", blurb: "노란 챙모자" },
  { id: "beret", slot: "hat", name: "베레모", price: 420, rarity: "common", blurb: "기울어진 둥근 모자" },
  { id: "beanie", slot: "hat", name: "비니", price: 320, rarity: "common", blurb: "포근한 민트 비니" },
  { id: "prop", slot: "hat", name: "프로펠러", price: 800, rarity: "rare", blurb: "빙글빙글 돌아요" },
  { id: "mushroom", slot: "hat", name: "버섯모자", price: 980, rarity: "rare", blurb: "빨간 갓과 흰 점" },
  { id: "party", slot: "hat", name: "파티햇", price: 1100, rarity: "rare", blurb: "줄무늬 고깔" },
  { id: "crown", slot: "hat", name: "왕관", price: 1800, rarity: "epic", blurb: "한탕의 증표" },
  { id: "halo", slot: "hat", name: "헤일로", price: 2800, rarity: "epic", blurb: "머리 위 금빛 고리" },
  { id: "witch", slot: "hat", name: "마녀모자", price: 3600, rarity: "epic", blurb: "넓은 챙의 보라 모자" },
  { id: "glasses", slot: "face", name: "선글라스", price: 500, rarity: "common", blurb: "쿨한 검정 테" },
  { id: "round", slot: "face", name: "동그란안경", price: 380, rarity: "common", blurb: "얇은 금테" },
  { id: "star", slot: "face", name: "별안경", price: 900, rarity: "rare", blurb: "반짝 별 렌즈" },
  { id: "heart", slot: "face", name: "하트안경", price: 1200, rarity: "rare", blurb: "분홍 하트 렌즈" },
  { id: "mask", slot: "face", name: "가면", price: 1400, rarity: "rare", blurb: "반쪽 가장무도회" },
  { id: "monocle", slot: "face", name: "단안경", price: 2400, rarity: "epic", blurb: "한쪽만 근사한 렌즈" },
  { id: "bow", slot: "neck", name: "나비넥타이", price: 450, rarity: "common", blurb: "신사 콩" },
  { id: "scarf", slot: "neck", name: "목도리", price: 480, rarity: "common", blurb: "두 바퀴 감은 머플러" },
  { id: "bell", slot: "neck", name: "방울목걸이", price: 700, rarity: "rare", blurb: "살랑살랑 방울" },
  { id: "pearl", slot: "neck", name: "진주", price: 2600, rarity: "epic", blurb: "동글동글 목걸이" },
  { id: "cape", slot: "back", name: "망토", price: 560, rarity: "common", blurb: "짧게 펄럭이는 망토" },
  { id: "shield", slot: "back", name: "방패", price: 640, rarity: "common", blurb: "등에 멘 작은 방패" },
  { id: "backpack", slot: "back", name: "가방", price: 1300, rarity: "rare", blurb: "노란 미니 백팩" },
  { id: "jet", slot: "back", name: "제트팩", price: 1600, rarity: "rare", blurb: "등이 빙글 돌아요" },
  { id: "wings", slot: "back", name: "날개", price: 4200, rarity: "epic", blurb: "하얀 깃털 날개" },
  { id: "fairy", slot: "back", name: "요정날개", price: 12000, rarity: "legendary", blurb: "빛나는 유리 날개" },
  { id: "pop", slot: "held", name: "막대사탕", price: 300, rarity: "common", blurb: "소용돌이 사탕" },
  { id: "flag", slot: "held", name: "깃발", price: 520, rarity: "common", blurb: "응원 깃발" },
  { id: "balloon", slot: "held", name: "풍선", price: 900, rarity: "rare", blurb: "줄에 매달린 하트" },
  { id: "umbrella", slot: "held", name: "우산", price: 1100, rarity: "rare", blurb: "파스텔 양산" },
  { id: "wand", slot: "held", name: "지팡이", price: 3000, rarity: "epic", blurb: "별이 달린 막대" },
  { id: "sprout", slot: "pet", name: "새싹", price: 700, rarity: "common", blurb: "옆에서 통통 튀어요" },
  { id: "chick", slot: "pet", name: "병아리", price: 1500, rarity: "rare", blurb: "노란 따라쟁이" },
  { id: "starpet", slot: "pet", name: "별친구", price: 1700, rarity: "rare", blurb: "반짝이는 작은 별" },
  { id: "ghost", slot: "pet", name: "유령", price: 3800, rarity: "epic", blurb: "말랑한 하얀 유령" },
  { id: "kitty", slot: "pet", name: "고양이", price: 9800, rarity: "legendary", blurb: "목에 방울 단 고양이" },
  { id: "spark", slot: "aura", name: "반짝이", price: 800, rarity: "common", blurb: "주변을 도는 빛" },
  { id: "hearts", slot: "aura", name: "하트오라", price: 1800, rarity: "rare", blurb: "떠오르는 하트" },
  { id: "firefly", slot: "aura", name: "반딧불", price: 4500, rarity: "epic", blurb: "은은한 초록 불빛" },
  { id: "rainbow", slot: "aura", name: "무지개", price: 14000, rarity: "legendary", blurb: "일곱 빛 고리" },
  { id: "mint", slot: "outfit", name: "민트콩", price: 600, rarity: "common", blurb: "시원한 민트 몸", tint: 0x7ce7c4 },
  { id: "lemon", slot: "outfit", name: "레몬콩", price: 1400, rarity: "rare", blurb: "환한 레몬 몸", tint: 0xffe066 },
  { id: "night", slot: "outfit", name: "밤콩", price: 3200, rarity: "epic", blurb: "깊은 남색 몸", tint: 0x3a3a78 },
  { id: "gold", slot: "outfit", name: "황금콩", price: 11000, rarity: "legendary", blurb: "반짝이는 황금 몸", tint: 0xf0c14a },
];

export function outfitTint(id) {
  const item = ITEMS.find((it) => it.id === id);
  return item?.tint || 0xff7eb3;
}

function aura(id, colors) {
  const g = group(id);
  g.userData.aura = true;
  colors.forEach((color, i) => {
    const p = M(new THREE.OctahedronGeometry(0.07, 0), color, Math.cos((i / colors.length) * Math.PI * 2) * 0.85, 0.35, Math.sin((i / colors.length) * Math.PI * 2) * 0.85, {
      emissive: color,
      emissiveIntensity: 0.7,
    });
    g.add(p);
  });
  return g;
}

function pet(id, bodyColor, extra) {
  const g = group(id);
  g.userData.pet = true;
  g.position.set(0.95, 0.05, 0.15);
  g.add(extra(bodyColor));
  return g;
}

export function makePart(id) {
  if (id === "ribbon") {
    const g = group(id);
    for (const s of [-1, 1]) {
      const p = M(new THREE.SphereGeometry(0.16, 10, 8), 0xff8fb8, s * 0.16, 0.78, 0.08);
      p.scale.set(1.1, 0.7, 0.45);
      g.add(p);
    }
    g.add(M(new THREE.SphereGeometry(0.09, 8, 8), 0xff5d8f, 0, 0.76, 0.16));
    return g;
  }
  if (id === "flower") {
    const g = group(id);
    g.add(M(new THREE.SphereGeometry(0.08, 8, 8), 0xffe066, 0.22, 0.78, 0.12));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(M(new THREE.SphereGeometry(0.07, 8, 8), 0xff8fb8, 0.22 + Math.cos(a) * 0.12, 0.78 + Math.sin(a) * 0.12, 0.1));
    }
    return g;
  }
  if (id === "cap") {
    const g = group(id);
    g.add(M(new THREE.CylinderGeometry(0.34, 0.38, 0.22, 16), 0xffe066, 0, 0.78, 0));
    g.add(M(new THREE.BoxGeometry(0.42, 0.05, 0.28), 0xffe066, 0, 0.68, 0.28));
    return g;
  }
  if (id === "beret") {
    const g = group(id);
    const top = M(new THREE.SphereGeometry(0.34, 14, 10), 0x6a4dff, 0.06, 0.78, 0);
    top.scale.set(1.15, 0.38, 1.05);
    g.add(top, M(new THREE.CylinderGeometry(0.16, 0.18, 0.06, 12), 0x2b2140, 0, 0.66, 0));
    return g;
  }
  if (id === "beanie") {
    const g = group(id);
    g.add(M(new THREE.SphereGeometry(0.38, 14, 12), 0x7ce7c4, 0, 0.78, 0));
    const pom = M(new THREE.SphereGeometry(0.1, 8, 8), 0xff8fb8, 0, 1.08, 0);
    g.add(pom, M(new THREE.CylinderGeometry(0.36, 0.38, 0.1, 14), 0x3dbe8c, 0, 0.64, 0));
    return g;
  }
  if (id === "prop") {
    const g = group(id);
    g.add(M(new THREE.CylinderGeometry(0.04, 0.04, 0.28, 8), 0x6d5a7a, 0, 0.9, 0));
    const blades = new THREE.Group();
    blades.position.y = 1.04;
    blades.userData.spin = true;
    blades.add(M(new THREE.BoxGeometry(0.7, 0.04, 0.12), 0x8ec5ff), M(new THREE.BoxGeometry(0.12, 0.04, 0.7), 0xff8fb8));
    g.add(blades);
    return g;
  }
  if (id === "mushroom") {
    const g = group(id);
    const cap = M(new THREE.SphereGeometry(0.4, 14, 10), 0xff4d6d, 0, 0.9, 0);
    cap.scale.y = 0.62;
    g.add(cap, M(new THREE.CylinderGeometry(0.16, 0.2, 0.28, 10), 0xfff3d0, 0, 0.7, 0));
    for (const [x, z] of [[0.12, 0.18], [-0.16, 0.08], [0.02, -0.18]]) {
      g.add(M(new THREE.SphereGeometry(0.06, 8, 8), 0xfffdf8, x, 1.02, z));
    }
    return g;
  }
  if (id === "party") {
    const g = group(id);
    g.add(M(new THREE.ConeGeometry(0.28, 0.55, 12), 0xff8fb8, 0, 0.98, 0));
    g.add(M(new THREE.CylinderGeometry(0.3, 0.3, 0.06, 12), 0xffe066, 0, 0.72, 0));
    g.add(M(new THREE.SphereGeometry(0.06, 8, 8), 0x7ce7c4, 0, 1.28, 0));
    return g;
  }
  if (id === "crown") {
    const g = group(id);
    const gold = { metalness: 0.55, roughness: 0.25 };
    g.add(M(new THREE.CylinderGeometry(0.32, 0.34, 0.14, 12), 0xffe066, 0, 0.76, 0, gold));
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      g.add(M(new THREE.ConeGeometry(0.07, 0.2, 6), 0xffe066, Math.cos(a) * 0.28, 0.92, Math.sin(a) * 0.28, gold));
    }
    g.add(M(new THREE.OctahedronGeometry(0.06), 0xff4d6d, 0, 0.84, 0.3, { emissive: 0xff4d6d, emissiveIntensity: 0.4 }));
    return g;
  }
  if (id === "halo") {
    const g = group(id);
    const ring = M(new THREE.TorusGeometry(0.28, 0.035, 8, 20), 0xffe066, 0, 1.15, 0, { metalness: 0.6, emissive: 0xffe066, emissiveIntensity: 0.45 });
    ring.rotation.x = Math.PI / 2;
    g.add(ring);
    return g;
  }
  if (id === "witch") {
    const g = group(id);
    g.add(M(new THREE.ConeGeometry(0.28, 0.7, 12), 0x4a2a78, 0, 1.05, 0));
    const brim = M(new THREE.CylinderGeometry(0.55, 0.55, 0.05, 16), 0x3a2060, 0, 0.72, 0);
    g.add(brim, M(new THREE.TorusGeometry(0.22, 0.03, 6, 14), 0xffe066, 0, 0.86, 0, { metalness: 0.4 }));
    return g;
  }
  if (id === "glasses") {
    const g = group(id);
    for (const s of [-1, 1]) g.add(M(new THREE.TorusGeometry(0.12, 0.025, 8, 12), 0x2b2140, s * 0.16, 0.18, 0.5));
    g.add(M(new THREE.BoxGeometry(0.12, 0.03, 0.03), 0x2b2140, 0, 0.18, 0.5));
    return g;
  }
  if (id === "round") {
    const g = group(id);
    for (const s of [-1, 1]) {
      const lens = M(new THREE.CircleGeometry(0.11, 14), 0xd7f4ff, s * 0.16, 0.18, 0.5, { transparent: true, opacity: 0.55, metalness: 0.2 });
      g.add(lens, M(new THREE.TorusGeometry(0.11, 0.018, 8, 14), 0xf0c14a, s * 0.16, 0.18, 0.5, { metalness: 0.6 }));
    }
    g.add(M(new THREE.BoxGeometry(0.1, 0.02, 0.02), 0xf0c14a, 0, 0.18, 0.5, { metalness: 0.5 }));
    return g;
  }
  if (id === "star") {
    const g = group(id);
    for (const s of [-1, 1]) g.add(M(new THREE.OctahedronGeometry(0.11), 0xffe066, s * 0.16, 0.18, 0.52, { emissive: 0xffe066, emissiveIntensity: 0.35 }));
    return g;
  }
  if (id === "heart") {
    const g = group(id);
    for (const s of [-1, 1]) {
      const h = M(new THREE.SphereGeometry(0.1, 10, 8), 0xff4d8d, s * 0.16, 0.18, 0.52, { emissive: 0xff4d8d, emissiveIntensity: 0.25 });
      h.scale.set(1.1, 0.9, 0.45);
      g.add(h);
    }
    g.add(M(new THREE.BoxGeometry(0.08, 0.02, 0.02), 0xff8fb8, 0, 0.2, 0.5));
    return g;
  }
  if (id === "mask") {
    const g = group(id);
    const plate = M(new THREE.BoxGeometry(0.46, 0.22, 0.06), 0xfffdf8, 0, 0.16, 0.5);
    g.add(plate, M(new THREE.BoxGeometry(0.16, 0.06, 0.02), 0x2b2140, -0.1, 0.16, 0.54), M(new THREE.BoxGeometry(0.16, 0.06, 0.02), 0x2b2140, 0.1, 0.16, 0.54));
    return g;
  }
  if (id === "monocle") {
    const g = group(id);
    const ring = M(new THREE.TorusGeometry(0.12, 0.02, 8, 16), 0xf0c14a, 0.18, 0.16, 0.52, { metalness: 0.65 });
    g.add(ring, M(new THREE.CircleGeometry(0.1, 14), 0xd7f4ff, 0.18, 0.16, 0.53, { transparent: true, opacity: 0.4 }));
    g.add(M(new THREE.CylinderGeometry(0.012, 0.012, 0.28, 6), 0xf0c14a, 0.32, 0.02, 0.4, { metalness: 0.5 }));
    return g;
  }
  if (id === "bow") {
    const g = group(id);
    for (const s of [-1, 1]) {
      const w = M(new THREE.ConeGeometry(0.12, 0.22, 8), 0xff5d8f, s * 0.1, -0.12, 0.48);
      w.rotation.z = (s * Math.PI) / 2;
      g.add(w);
    }
    g.add(M(new THREE.SphereGeometry(0.05, 8, 8), 0xffe066, 0, -0.12, 0.52));
    return g;
  }
  if (id === "scarf") {
    const g = group(id);
    const wrap = M(new THREE.TorusGeometry(0.28, 0.07, 8, 16), 0xff8fb8, 0, -0.08, 0.05);
    wrap.rotation.x = Math.PI / 2.2;
    g.add(wrap, M(new THREE.BoxGeometry(0.12, 0.32, 0.08), 0xff5d8f, 0.12, -0.32, 0.35));
    return g;
  }
  if (id === "bell") {
    const g = group(id);
    const gold = { metalness: 0.45 };
    g.add(M(new THREE.SphereGeometry(0.1, 10, 8), 0xffe066, 0, -0.22, 0.5, gold));
    const ring = M(new THREE.TorusGeometry(0.16, 0.02, 8, 16), 0xffe066, 0, -0.08, 0.42, gold);
    ring.rotation.x = Math.PI / 2.4;
    g.add(ring);
    return g;
  }
  if (id === "pearl") {
    const g = group(id);
    for (let i = 0; i < 7; i++) {
      const a = -0.7 + i * 0.22;
      g.add(M(new THREE.SphereGeometry(0.045, 8, 8), 0xfffdf8, Math.sin(a) * 0.22, -0.16 + Math.cos(a) * 0.05, 0.42, { roughness: 0.15, metalness: 0.2 }));
    }
    return g;
  }
  if (id === "cape") {
    const g = group(id);
    const cape = M(new THREE.BoxGeometry(0.7, 0.55, 0.06), 0xff4d6d, 0, 0.05, -0.42);
    cape.rotation.x = 0.25;
    g.add(cape, M(new THREE.BoxGeometry(0.18, 0.08, 0.08), 0xffe066, 0, 0.28, -0.28));
    return g;
  }
  if (id === "shield") {
    const g = group(id);
    const shield = M(new THREE.CylinderGeometry(0.22, 0.22, 0.06, 6), 0x8ec5ff, 0, 0.05, -0.48, { metalness: 0.25 });
    shield.rotation.x = Math.PI / 2;
    g.add(shield, M(new THREE.BoxGeometry(0.06, 0.22, 0.02), 0xffe066, 0, 0.05, -0.46));
    return g;
  }
  if (id === "backpack") {
    const g = group(id);
    g.add(M(new THREE.BoxGeometry(0.42, 0.4, 0.22), 0xffe066, 0, 0.08, -0.48));
    g.add(M(new THREE.BoxGeometry(0.16, 0.1, 0.12), 0xff8fb8, 0, 0.32, -0.42));
    return g;
  }
  if (id === "jet") {
    const g = group(id);
    g.add(M(new THREE.BoxGeometry(0.36, 0.28, 0.22), 0x6d5a7a, 0, 0.05, -0.46));
    const fan = new THREE.Group();
    fan.position.set(0, 0.05, -0.6);
    fan.userData.spin = true;
    fan.add(M(new THREE.BoxGeometry(0.42, 0.05, 0.08), 0x8ec5ff), M(new THREE.BoxGeometry(0.08, 0.05, 0.42), 0xff8fb8));
    g.add(fan);
    return g;
  }
  if (id === "wings") {
    const g = group(id);
    for (const s of [-1, 1]) {
      const wing = M(new THREE.SphereGeometry(0.28, 10, 8), 0xfffdf8, s * 0.42, 0.15, -0.2);
      wing.scale.set(0.35, 1.1, 0.7);
      g.add(wing);
    }
    return g;
  }
  if (id === "fairy") {
    const g = group(id);
    for (const s of [-1, 1]) {
      const wing = M(new THREE.SphereGeometry(0.32, 10, 8), 0xd7b4ff, s * 0.46, 0.2, -0.15, {
        transparent: true,
        opacity: 0.72,
        emissive: 0xc084fc,
        emissiveIntensity: 0.45,
        roughness: 0.1,
      });
      wing.scale.set(0.22, 1.15, 0.7);
      g.add(wing);
    }
    return g;
  }
  if (id === "pop") {
    const g = group(id);
    g.position.set(0.62, -0.05, 0.2);
    g.add(M(new THREE.CylinderGeometry(0.025, 0.025, 0.38, 6), 0xfffdf8, 0, 0.1, 0));
    g.add(M(new THREE.SphereGeometry(0.12, 10, 8), 0xff4d6d, 0, 0.32, 0));
    g.add(M(new THREE.TorusGeometry(0.07, 0.02, 6, 10), 0xfffdf8, 0, 0.32, 0.02));
    return g;
  }
  if (id === "flag") {
    const g = group(id);
    g.position.set(0.62, 0.05, 0.15);
    g.add(M(new THREE.CylinderGeometry(0.02, 0.02, 0.7, 6), 0x6d5a7a, 0, 0.2, 0));
    g.add(M(new THREE.BoxGeometry(0.28, 0.18, 0.02), 0xff8fb8, 0.16, 0.42, 0));
    return g;
  }
  if (id === "balloon") {
    const g = group(id);
    g.position.set(0.7, 0.55, 0.1);
    const heart = M(new THREE.SphereGeometry(0.16, 12, 10), 0xff4d8d, 0, 0.35, 0, { emissive: 0xff4d8d, emissiveIntensity: 0.2 });
    heart.scale.set(1.05, 1.2, 0.9);
    g.add(heart, M(new THREE.CylinderGeometry(0.008, 0.008, 0.45, 4), 0x6d5a7a, 0, 0.05, 0));
    return g;
  }
  if (id === "umbrella") {
    const g = group(id);
    g.position.set(0.55, 0.35, 0.15);
    const canopy = M(new THREE.ConeGeometry(0.28, 0.18, 12), 0x8ec5ff, 0, 0.42, 0);
    canopy.rotation.x = Math.PI;
    g.add(canopy, M(new THREE.CylinderGeometry(0.015, 0.015, 0.55, 6), 0xffe066, 0, 0.15, 0));
    return g;
  }
  if (id === "wand") {
    const g = group(id);
    g.position.set(0.62, 0.05, 0.2);
    g.rotation.z = -0.5;
    g.add(M(new THREE.CylinderGeometry(0.025, 0.03, 0.55, 8), 0x6a4dff, 0, 0.15, 0));
    g.add(M(new THREE.OctahedronGeometry(0.09), 0xffe066, 0, 0.48, 0, { emissive: 0xffe066, emissiveIntensity: 0.6 }));
    return g;
  }
  if (id === "sprout") {
    return pet(id, 0x7ce7c4, () => {
      const b = new THREE.Group();
      b.add(M(new THREE.SphereGeometry(0.16, 10, 8), 0x7ce7c4, 0, 0.16, 0));
      const leaf = M(new THREE.ConeGeometry(0.06, 0.16, 6), 0x3dbe8c, 0, 0.36, 0);
      b.add(leaf);
      return b;
    });
  }
  if (id === "chick") {
    return pet(id, 0xffe066, () => {
      const b = new THREE.Group();
      b.add(M(new THREE.SphereGeometry(0.16, 10, 8), 0xffe066, 0, 0.16, 0));
      b.add(M(new THREE.ConeGeometry(0.05, 0.08, 5), 0xff8a3a, 0, 0.16, 0.14));
      b.add(M(new THREE.SphereGeometry(0.035, 6, 6), 0x2b2140, 0.05, 0.22, 0.12));
      return b;
    });
  }
  if (id === "starpet") {
    return pet(id, 0xffe066, () => {
      const b = new THREE.Group();
      b.add(M(new THREE.OctahedronGeometry(0.16), 0xffe066, 0, 0.28, 0, { emissive: 0xffe066, emissiveIntensity: 0.55 }));
      return b;
    });
  }
  if (id === "ghost") {
    return pet(id, 0xfffdf8, () => {
      const b = new THREE.Group();
      const body = M(new THREE.SphereGeometry(0.18, 12, 10), 0xfffdf8, 0, 0.24, 0, { transparent: true, opacity: 0.88, emissive: 0xd7e4ff, emissiveIntensity: 0.25 });
      body.scale.y = 1.15;
      b.add(body, M(new THREE.SphereGeometry(0.03, 6, 6), 0x2b2140, -0.05, 0.28, 0.14), M(new THREE.SphereGeometry(0.03, 6, 6), 0x2b2140, 0.05, 0.28, 0.14));
      return b;
    });
  }
  if (id === "kitty") {
    return pet(id, 0xfffdf8, () => {
      const b = new THREE.Group();
      b.add(M(new THREE.SphereGeometry(0.16, 12, 10), 0xfff6ea, 0, 0.18, 0));
      b.add(M(new THREE.ConeGeometry(0.05, 0.1, 5), 0xffb7d5, -0.08, 0.34, 0));
      b.add(M(new THREE.ConeGeometry(0.05, 0.1, 5), 0xffb7d5, 0.08, 0.34, 0));
      b.add(M(new THREE.SphereGeometry(0.04, 8, 8), 0xffe066, 0, 0.08, 0.14, { metalness: 0.4 }));
      return b;
    });
  }
  if (id === "spark") return aura(id, [0xffe066, 0xfffdf8, 0xffe066, 0xfffdf8, 0xffe066]);
  if (id === "hearts") return aura(id, [0xff4d8d, 0xff8fb8, 0xff4d8d, 0xffb7d5, 0xff4d8d, 0xff8fb8]);
  if (id === "firefly") return aura(id, [0x7ce7c4, 0xc8ff6a, 0x7ce7c4, 0xe8ffb0, 0x3dbe8c]);
  if (id === "rainbow") return aura(id, [0xff4d6d, 0xff8a3a, 0xffe066, 0x7ce7c4, 0x3d8dff, 0xa855f7, 0xff8fb8]);
  return null;
}
